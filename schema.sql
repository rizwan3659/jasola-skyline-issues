CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,          -- 'rwa' or 'auth'
  data TEXT NOT NULL,          -- issue JSON (title, status, steps, ...)
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,        -- 'directory', 'admin_password', 'session_secret'
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts (ip, at);
