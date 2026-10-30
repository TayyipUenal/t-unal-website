-- Partner programme: partners, sessions, leads, commissions, rate limits.
-- Amounts are stored in cents. Timestamps are ISO 8601 UTC strings.

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL DEFAULT 'partner',          -- 'partner' | 'staff' | 'admin' (superadmin)
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'active' | 'blocked' | 'archived'
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
  last_seen_at TEXT,                             -- last request with a valid session, written at most every 2 minutes
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
  deal_cents INTEGER,                            -- net order value in cents
  category TEXT NOT NULL DEFAULT '',             -- 'zertifizierung' | 'personenzertifizierung' | ''
  customer_paid_at TEXT,                         -- set when the customer has paid the invoice
  request_json TEXT,                             -- details of an application a partner filled in with the customer
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

-- Files: offers uploaded for a customer (kind 'offer', lead_id set) and downloads for all partners (kind 'download').
-- Stored in the database until R2 is enabled; the API limits a file to about 1.8 MB.
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                            -- 'offer' | 'download'
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_lead ON files(lead_id);

-- Appointments booked through the calendar on the homepage. slot is Berlin local time "YYYY-MM-DDTHH:MM";
-- the unique index makes a slot bookable only once.
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  format TEXT NOT NULL,
  topic TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'booked',         -- 'booked' | 'cancelled'
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(slot) WHERE status = 'booked';

-- Website visits (one row per visitor and day, for tayyipuenal.de and arbeitssicherheitscout.de). IP addresses are
-- never stored: hash and ip_hash come from IP, browser and a salt that changes daily, and are cleared the next day,
-- after which a row cannot be linked to anyone. Location is the city Cloudflare derives from the IP. Kept 13 months.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,                            -- 'tu' | 'asc'
  day TEXT NOT NULL,                             -- Berlin date
  hash TEXT,
  ip_hash TEXT,
  started_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 1,
  landing TEXT,
  exit_path TEXT,
  pages TEXT,                                    -- JSON list of paths in order
  source TEXT,
  referrer TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  device TEXT,
  browser TEXT,
  os TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS visits_hash ON visits(site, day, hash);
CREATE INDEX IF NOT EXISTS visits_site_day ON visits(site, day);
CREATE TABLE IF NOT EXISTS visit_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
-- Connections of the admin team today, so their own visits do not count.
CREATE TABLE IF NOT EXISTS owner_ips (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (day, ip_hash)
);
