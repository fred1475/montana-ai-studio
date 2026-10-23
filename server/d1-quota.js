'use strict';

// D1-backed GLOBAL budget ledger. No model call, billing account, or deployment.
// Requires schema in server/schema/d1-quota.sql before creating this adapter.
const RESERVATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/i;
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const EVIDENCE_REF = /^[A-Za-z0-9_-]{8,128}$/;
const MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/flac']);

function createD1Quota({
  db,
  monthlyLimitCents = 300,
  requestCostCents = 8,
  maxConcurrentReservations = 32,
  now = () => new Date(),
  makeId = () => globalThis.crypto.randomUUID()
} = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function' ||
      !Number.isSafeInteger(monthlyLimitCents) || monthlyLimitCents < 1 ||
      !Number.isSafeInteger(requestCostCents) || requestCostCents < 1 ||
      requestCostCents > monthlyLimitCents ||
      !Number.isSafeInteger(maxConcurrentReservations) ||
      maxConcurrentReservations < 1 || maxConcurrentReservations > 1024 ||
      typeof now !== 'function' || typeof makeId !== 'function') {
    throw new TypeError('Durable D1 transaction interface and server cost settings required');
  }

  function month() {
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error('INVALID_SERVER_CLOCK');
    }
    return date.toISOString().slice(0, 7); // UTC calendar month.
  }

  const prepare = (sql, ...values) => db.prepare(sql).bind(...values);
  async function existing(userId, requestId) {
    return db.prepare('SELECT fingerprint, state, asset_id, mime_type, duration_seconds FROM reservations WHERE user_id=? AND request_id=?')
      .bind(userId, requestId).first();
  }

  return Object.freeze({
    async reserve({ userId, requestId, fingerprint }) {
      if (typeof userId !== 'string' || userId.length < 1 || userId.length > 200 ||
          typeof requestId !== 'string' || !RESERVATION_ID.test(requestId) ||
          typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint)) {
        throw new Error('INVALID_RESERVATION_REQUEST');
      }
      const period = month();
      const id = makeId();
      if (typeof id !== 'string' || !RESERVATION_ID.test(id)) throw new Error('INVALID_RESERVATION_ID');

      // batch() is a transaction in D1. All budget checks and increments occur
      // together, and the UNIQUE(user_id,request_id) constraint prevents
      // duplicate costs for retries. Each attempt has a fresh opaque ID.
      const result = await db.batch([
        prepare('INSERT INTO monthly_budgets (month,limit_cents,reserved_cents,spent_cents) VALUES(?,?,0,0) ON CONFLICT(month) DO UPDATE SET limit_cents=MIN(limit_cents,excluded.limit_cents)', period, monthlyLimitCents),
        prepare("INSERT INTO reservations (reservation_id,user_id,request_id,fingerprint,month,cost_cents,state) SELECT ?,?,?,?,?,?,'reserved' FROM monthly_budgets WHERE month=? AND (spent_cents+reserved_cents+?)<=limit_cents AND (SELECT COUNT(*) FROM reservations WHERE state='reserved')<? ON CONFLICT(user_id,request_id) DO NOTHING",
          id, userId, requestId, fingerprint.toLowerCase(), period, requestCostCents, period, requestCostCents, maxConcurrentReservations),
        prepare("UPDATE monthly_budgets SET reserved_cents=reserved_cents+? WHERE month=? AND EXISTS(SELECT 1 FROM reservations WHERE reservation_id=? AND state='reserved')",
          requestCostCents, period, id)
      ]);
      if (result[1]?.meta?.changes === 1 && result[2]?.meta?.changes === 1) {
        return { status: 'reserved', reservationId: id };
      }
      if (result[1]?.meta?.changes !== 0 || result[2]?.meta?.changes !== 0) {
        throw new Error('BUDGET_TRANSACTION_INCONSISTENT');
      }

      const row = await existing(userId, requestId);
      if (!row) {
        // The global single-flight limit is also a financial safety latch:
        // ambiguous provider failures retain a reservation, so no additional
        // paid requests can be issued until a trusted operator reconciles it.
        const active = await db.prepare("SELECT COUNT(*) AS total FROM reservations WHERE state='reserved'").bind().first();
        if (Number(active?.total) >= maxConcurrentReservations) {
          return { status: 'pending' };
        }
        return { status: 'denied' };
      }
      if (row.fingerprint !== fingerprint.toLowerCase() ||
          row.state === 'released' || row.state === 'charged_without_asset') {
        return { status: 'denied' };
      }
      if (row.state === 'committed') {
        if (!row.asset_id || !MIME_TYPES.has(row.mime_type) ||
            !Number.isFinite(row.duration_seconds)) throw new Error('BUDGET_ASSET_INCONSISTENT');
        return { status: 'replay', asset: {
          assetId: row.asset_id, mimeType: row.mime_type,
          durationSeconds: row.duration_seconds
        } };
      }
      return { status: 'pending' };
    },

    async commit(reservationId, asset) {
      if (typeof reservationId !== 'string' || !RESERVATION_ID.test(reservationId) ||
          !asset || !ASSET_ID.test(asset.assetId || '') ||
          !MIME_TYPES.has(asset.mimeType) || !Number.isFinite(asset.durationSeconds) ||
          asset.durationSeconds <= 0 || asset.durationSeconds > 360) {
        throw new Error('INVALID_COMMIT');
      }
      const result = await db.batch([
        prepare("UPDATE monthly_budgets SET reserved_cents=reserved_cents-(SELECT cost_cents FROM reservations WHERE reservation_id=? AND state='reserved'), spent_cents=spent_cents+(SELECT cost_cents FROM reservations WHERE reservation_id=? AND state='reserved') WHERE month=(SELECT month FROM reservations WHERE reservation_id=? AND state='reserved')",
          reservationId, reservationId, reservationId),
        prepare("UPDATE reservations SET state='committed',asset_id=?,mime_type=?,duration_seconds=? WHERE reservation_id=? AND state='reserved'",
          asset.assetId, asset.mimeType, asset.durationSeconds, reservationId)
      ]);
      if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) {
        throw new Error('COMMIT_REQUIRES_RECONCILIATION');
      }
    },

    async settleChargedWithoutAsset(reservationId, verification) {
      // OPERATOR-ONLY maintenance method, deliberately not exposed by HTTP.
      // Use only AFTER external invoice confirms a charge AND R2 has no
      // recoverable asset. Keep an opaque ticket reference, never a receipt
      // containing PII. This consumes budget but clears single-flight lock.
      if (typeof reservationId !== 'string' || !RESERVATION_ID.test(reservationId) ||
          !verification || verification.providerCharged !== true ||
          verification.assetUnavailable !== true ||
          typeof verification.evidenceRef !== 'string' ||
          !EVIDENCE_REF.test(verification.evidenceRef)) {
        throw new Error('EXTERNAL_CHARGE_PROOF_REQUIRED');
      }
      const result = await db.batch([
        prepare("UPDATE monthly_budgets SET reserved_cents=reserved_cents-(SELECT cost_cents FROM reservations WHERE reservation_id=? AND state='reserved'), spent_cents=spent_cents+(SELECT cost_cents FROM reservations WHERE reservation_id=? AND state='reserved') WHERE month=(SELECT month FROM reservations WHERE reservation_id=? AND state='reserved')",
          reservationId, reservationId, reservationId),
        prepare("UPDATE reservations SET state='charged_without_asset',reconciliation_reference=? WHERE reservation_id=? AND state='reserved'",
          verification.evidenceRef, reservationId)
      ]);
      if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) {
        throw new Error('CHARGE_SETTLEMENT_REQUIRES_RECONCILIATION');
      }
    },

    async release(reservationId) {
      if (typeof reservationId !== 'string' || !RESERVATION_ID.test(reservationId)) {
        throw new Error('INVALID_RELEASE');
      }
      const result = await db.batch([
        prepare("UPDATE monthly_budgets SET reserved_cents=reserved_cents-(SELECT cost_cents FROM reservations WHERE reservation_id=? AND state='reserved') WHERE month=(SELECT month FROM reservations WHERE reservation_id=? AND state='reserved')",
          reservationId, reservationId),
        prepare("UPDATE reservations SET state='released' WHERE reservation_id=? AND state='reserved'",
          reservationId)
      ]);
      if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) {
        throw new Error('RELEASE_REQUIRES_RECONCILIATION');
      }
    },

    async pending() {
      // Read-only reconciliation inventory for the Access-authenticated owner.
      // Never expose user identifiers, prompt text or provider credentials.
      const result = await db.prepare(
        "SELECT reservation_id,month,cost_cents FROM reservations WHERE state='reserved' ORDER BY month ASC,reservation_id ASC LIMIT 8"
      ).bind().all();
      if (!result || !Array.isArray(result.results)) {
        throw new Error('PENDING_RESERVATIONS_UNAVAILABLE');
      }
      return result.results.map(row => {
        if (!row || !RESERVATION_ID.test(row.reservation_id || '') ||
            typeof row.month !== 'string' ||
            !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
            !Number.isSafeInteger(row.cost_cents) ||
            row.cost_cents < 1 || row.cost_cents > monthlyLimitCents) {
          throw new Error('PENDING_RESERVATIONS_INVALID');
        }
        return {
          reservationId: row.reservation_id,
          month: row.month,
          reservedCents: row.cost_cents
        };
      });
    },

    async pendingCount() {
      // Global across UTC months: an unresolved prior-month provider call
      // must be visible even when the new month's balance is untouched.
      const row = await db.prepare("SELECT COUNT(*) AS total FROM reservations WHERE state='reserved'")
        .bind().first();
      const total = Number(row?.total);
      if (!Number.isSafeInteger(total) || total < 0) {
        throw new Error('PENDING_RESERVATIONS_UNAVAILABLE');
      }
      return total;
    },

    async usage() {
      const row = await db.prepare('SELECT limit_cents,reserved_cents,spent_cents FROM monthly_budgets WHERE month=?')
        .bind(month()).first();
      if (!row) return { limitCents: monthlyLimitCents, reservedCents: 0, spentCents: 0 };
      return { limitCents: row.limit_cents, reservedCents: row.reserved_cents,
        spentCents: row.spent_cents };
    }
  });
}

module.exports = { createD1Quota };
