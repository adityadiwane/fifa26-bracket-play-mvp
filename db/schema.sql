-- FIFA26 Bracket Play - Cloudflare D1 schema
-- Prediction model: users pick outcome only: HOME_WIN, DRAW, AWAY_WIN.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  admin_pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  user_pin_hash TEXT NOT NULL,
  bonus_points REAL NOT NULL DEFAULT 0,
  previous_rank INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  UNIQUE (league_id, display_name)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  fifa_match_no INTEGER UNIQUE,
  stage TEXT NOT NULL, -- GROUP, ROUND_OF_32, ROUND_OF_16, QUARTER_FINAL, SEMI_FINAL, THIRD_PLACE, FINAL
  group_name TEXT,
  home_team TEXT,
  away_team TEXT,
  home_placeholder TEXT,
  away_placeholder TEXT,
  kickoff_at TEXT NOT NULL, -- UTC ISO timestamp
  venue TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, POSTPONED
  actual_outcome TEXT, -- HOME_WIN, DRAW, AWAY_WIN
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('SCHEDULED', 'COMPLETED', 'POSTPONED')),
  CHECK (actual_outcome IS NULL OR actual_outcome IN ('HOME_WIN', 'DRAW', 'AWAY_WIN'))
);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  predicted_outcome TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE (league_id, user_id, match_id),
  CHECK (predicted_outcome IN ('HOME_WIN', 'DRAW', 'AWAY_WIN'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  action TEXT NOT NULL,
  match_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_league ON users(league_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_league_display_name_normalized
  ON users(league_id, lower(trim(display_name)));
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_at);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(league_id, match_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
