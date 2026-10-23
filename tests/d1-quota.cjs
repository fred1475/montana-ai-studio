'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createD1Quota } = require('../server/d1-quota.js');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(join(__dirname, '../server/schema/d1-quota.sql'), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            statement: sql,
            args,
            async first() {
              return sqlite.prepare(sql).get(...args) || null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...args) };
            }
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(s => {
          const result = sqlite.prepare(s.statement).run(...s.args);
          return { meta: { changes: Number(result.changes) } };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

const fingerprint = value => value.repeat(64);
const req = (id, userId = 'montana-owner', hash = fingerprint('a')) =>
  ({ userId, requestId: id, fingerprint: hash });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const asset = { assetId: 'asset_00000001', mimeType: 'audio/mpeg', durationSeconds: 169.2 };

function harness(options = {}) {
  const db = database();
  let time = new Date('2026-10-23T02:00:00.000Z');
  let n = 0;
  const quota = createD1Quota({
    db,
    monthlyLimitCents: 16,
    requestCostCents: 8,
    now: () => time,
    makeId: () => 'reservation_' + String(++n).padStart(12, '0'),
    ...options
  });
  return { quota, db, setTime: value => { time = new Date(value); } };
}

test('atomic global budget: two reserves exhaust sixteen cents across users', async () => {
  const { quota, db } = harness();
  const a = await quota.reserve(req(id(1), 'user-a'));
  const b = await quota.reserve(req(id(2), 'user-b'));
  assert.equal(a.status, 'reserved');
  assert.equal(b.status, 'reserved');
  assert.equal((await quota.reserve(req(id(3), 'user-c'))).status, 'denied');
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 16, spentCents: 0 });
  const rows = db.sqlite.prepare('SELECT count(*) AS total FROM reservations').get();
  assert.equal(rows.total, 2);
});

test('settlement moves reserved to spent and replay cannot charge twice', async () => {
  const { quota } = harness();
  const request = req(id(4));
  const { reservationId } = await quota.reserve(request);
  await quota.commit(reservationId, asset);
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 0, spentCents: 8 });
  assert.deepEqual(await quota.reserve(request), { status: 'replay', asset });
  assert.equal((await quota.reserve(req(id(4), 'montana-owner', fingerprint('b')))).status, 'denied');
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 0, spentCents: 8 });
  await assert.rejects(quota.commit(reservationId, asset), /RECONCILIATION/);
  assert.equal((await quota.usage()).spentCents, 8);
});

test('duplicate simultaneous requests reserve once and mark second pending', async () => {
  const { quota } = harness();
  const [first, second] = await Promise.all([
    quota.reserve(req(id(5))), quota.reserve(req(id(5)))
  ]);
  assert.deepEqual([first.status, second.status].sort(), ['pending', 'reserved']);
  assert.equal((await quota.usage()).reservedCents, 8);
});

test('release requires trusted no-charge proof; original key never reused', async () => {
  const { quota } = harness();
  const one = req(id(6));
  const first = await quota.reserve(one);
  assert.equal((await quota.usage()).reservedCents, 8);
  await quota.release(first.reservationId);
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 0, spentCents: 0 });
  assert.equal((await quota.reserve(one)).status, 'denied');
  assert.equal((await quota.reserve(req(id(7)))).status, 'reserved');
  await assert.rejects(quota.release(first.reservationId), /RECONCILIATION/);
});

test('UTC calendar months have independent global ceilings without retroactive refunds', async () => {
  const { quota, setTime } = harness();
  const october = await quota.reserve(req(id(8)));
  assert.equal(october.status, 'reserved');
  setTime('2026-11-01T00:01:00.000Z');
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 0, spentCents: 0 });
  const november = await quota.reserve(req(id(9)));
  assert.equal(november.status, 'reserved');
  assert.equal((await quota.reserve(req(id(8)))).status, 'pending');
  await quota.commit(october.reservationId, asset);
  assert.equal((await quota.usage()).reservedCents, 8);
});

test('invalid inputs, missing storage and invalid asset fail closed', async () => {
  assert.throws(() => createD1Quota({}), TypeError);
  const { quota } = harness();
  await assert.rejects(quota.reserve(req('bad-id')), /INVALID_RESERVATION/);
  await assert.rejects(quota.reserve(req(id(10), 'owner', 'not-a-hash')), /INVALID_RESERVATION/);
  const ticket = await quota.reserve(req(id(11)));
  await assert.rejects(quota.commit(ticket.reservationId,
    { assetId: 'https://public.invalid/song', mimeType: 'audio/mpeg', durationSeconds: 100 }),
  /INVALID_COMMIT/);
  assert.equal((await quota.usage()).reservedCents, 8);
});

test('SQL statement errors roll back every reservation and budget increment', async () => {
  const { quota, db } = harness();
  db.sqlite.exec('DROP TABLE reservations');
  await assert.rejects(quota.reserve(req(id(12))), /no such table/i);
  const row = db.sqlite.prepare('SELECT count(*) AS total FROM monthly_budgets').get();
  assert.equal(row.total, 0);
});

test('single-flight pilot blocks additional paid requests while one is pending', async () => {
  const { quota } = harness({ maxConcurrentReservations: 1 });
  const first = await quota.reserve(req(id(25)));
  assert.equal(first.status, 'reserved');
  assert.equal((await quota.reserve(req(id(26)))).status, 'pending');
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 8, spentCents: 0 });
  await quota.commit(first.reservationId, asset);
  const second = await quota.reserve(req(id(26)));
  assert.equal(second.status, 'reserved');
  assert.equal((await quota.reserve(req(id(27)))).status, 'pending');
  await quota.release(second.reservationId);
  assert.equal((await quota.reserve(req(id(27)))).status, 'reserved');
});

test('unreconciled reservation blocks fresh month until operator resolves it', async () => {
  const { quota, setTime } = harness({ maxConcurrentReservations: 1 });
  const october = await quota.reserve(req(id(28)));
  assert.equal(october.status, 'reserved');
  setTime('2026-11-01T00:01:00Z');
  assert.equal((await quota.reserve(req(id(29)))).status, 'pending');
  assert.deepEqual(await quota.usage(),
    { limitCents: 16, reservedCents: 0, spentCents: 0 });
  await quota.commit(october.reservationId, asset);
  assert.equal((await quota.reserve(req(id(29)))).status, 'reserved');
});

test('pending count spans calendar months, even when new-month balance appears full', async () => {
  const { quota, setTime } = harness({ maxConcurrentReservations: 1 });
  assert.equal(await quota.pendingCount(), 0);
  const first = await quota.reserve(req(id(30)));
  assert.equal(await quota.pendingCount(), 1);
  setTime('2026-11-01T00:01:00Z');
  assert.deepEqual(await quota.usage(), {
    limitCents: 16, reservedCents: 0, spentCents: 0
  });
  assert.equal(await quota.pendingCount(), 1);
  await quota.commit(first.reservationId, asset);
  assert.equal(await quota.pendingCount(), 0);
});

test('read-only pending inventory includes month and amount but not owner or lyrics', async () => {
  const { quota, db } = harness({ maxConcurrentReservations: 1 });
  assert.deepEqual(await quota.pending(), []);
  const ticket = await quota.reserve(req(id(31), 'private-owner-name'));
  const rows = await quota.pending();
  assert.deepEqual(rows, [{
    reservationId: ticket.reservationId, month: '2026-10', reservedCents: 8
  }]);
  assert.equal(JSON.stringify(rows).includes('private-owner-name'), false);
  assert.equal((await quota.pendingCount()), 1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS total FROM reservations').get().total, 1);
});
test('invalid single-flight settings fail before any transaction', () => {
  const { db } = harness();
  assert.throws(() => createD1Quota({
    db, maxConcurrentReservations: 0
  }), TypeError);
  assert.throws(() => createD1Quota({
    db, maxConcurrentReservations: 1025
  }), TypeError);
});
