PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS loading_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loading_jobs_user_updated ON loading_jobs(user_id, updated_at DESC);
