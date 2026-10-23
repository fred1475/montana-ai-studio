-- Cloudflare D1 / SQLite. Apply to a private database only.
-- Budget is GLOBAL for Montana AI Studio, not a $10 limit PER user.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monthly_budgets (
  month TEXT PRIMARY KEY CHECK(length(month)=7),
  limit_cents INTEGER NOT NULL CHECK(limit_cents > 0),
  reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK(reserved_cents >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(spent_cents >= 0),
  CHECK(reserved_cents + spent_cents <= limit_cents)
);

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  month TEXT NOT NULL REFERENCES monthly_budgets(month),
  cost_cents INTEGER NOT NULL CHECK(cost_cents > 0),
  state TEXT NOT NULL CHECK(state IN ('reserved','committed','released','charged_without_asset')),
  asset_id TEXT,
  mime_type TEXT,
  duration_seconds REAL,
  reconciliation_reference TEXT,
  UNIQUE(user_id, request_id),
  CHECK(reconciliation_reference IS NULL OR
    (state='charged_without_asset' AND length(reconciliation_reference) BETWEEN 8 AND 128)),
  CHECK((state='committed' AND asset_id IS NOT NULL AND mime_type IS NOT NULL AND duration_seconds > 0)
    OR (state!='committed' AND asset_id IS NULL AND mime_type IS NULL AND duration_seconds IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_reservations_month_state ON reservations(month,state);
