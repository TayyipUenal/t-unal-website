-- Partner programme: partners, sessions, leads, commissions, rate limits.
-- Amounts are stored in cents. Timestamps are ISO 8601 UTC strings.

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL DEFAULT 'partner',          -- 'partner' | 'staff' | 'admin' (superadmin)
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'active' | 'blocked'
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  pitch TEXT NOT NULL DEFAULT '',                -- the application text
  slug TEXT UNIQUE,                              -- public page: /partner/<slug>
  bio TEXT NOT NULL DEFAULT '',                  -- text shown on the partner page
  rate_percent REAL NOT NULL DEFAULT 10,
  permissions TEXT NOT NULL DEFAULT '{}',        -- JSON of single rights, see permsOf() in worker/index.ts
  password_hash TEXT,
  password_salt TEXT,
  invite_hash TEXT,
  invite_expires TEXT,
  consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'site',           -- 'site' | 'partner-page' | 'portal'
  contact_name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',            -- 'new' | 'contacted' | 'offer' | 'won' | 'lost'
  deal_cents INTEGER,
  consent_at TEXT,
  request_id TEXT UNIQUE,                        -- makes retries of the site forms idempotent
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_partner ON leads(partner_id);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  base_cents INTEGER NOT NULL,
  rate_percent REAL NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',           -- 'open' | 'paid'
  paid_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS commissions_partner ON commissions(partner_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- History of a lead: status changes and notes. visible = 1 means the partner may see the entry.
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                            -- 'status' | 'note'
  status TEXT,
  note TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events(lead_id);
