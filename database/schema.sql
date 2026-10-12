-- DOSTUDY database schema (SQLite). Applied automatically on server start (idempotent).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  teacher     TEXT NOT NULL DEFAULT '',
  units       INTEGER NOT NULL DEFAULT 3,
  color       TEXT NOT NULL DEFAULT '#E0839C',
  external_id TEXT UNIQUE,                 -- Google Classroom course id (read-only import)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Grade components: quizzes, recitation, exams... score is a percentage or NULL if not yet taken.
CREATE TABLE IF NOT EXISTS components (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 0,
  score      REAL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- original file name (display only)
  stored_name TEXT NOT NULL,               -- random name on disk
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  text_cache  TEXT,                        -- extracted text for DOCX/PPTX/TXT
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviewers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id    INTEGER REFERENCES files(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,                -- JSON (summary + topics)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id    INTEGER REFERENCES files(id) ON DELETE CASCADE,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  hint       TEXT NOT NULL DEFAULT '',
  reps       INTEGER NOT NULL DEFAULT 0,
  last_rating INTEGER,
  due_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id    INTEGER REFERENCES files(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  questions  TEXT NOT NULL,                -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id    INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  weak_topics TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Weekly recurring busy time: work shifts, classes, commute, sleep...
CREATE TABLE IF NOT EXISTS busy_slots (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  kind  TEXT NOT NULL DEFAULT 'work',      -- work | class | other
  label TEXT NOT NULL DEFAULT '',
  dow   INTEGER NOT NULL,                  -- 0 = Sunday ... 6 = Saturday
  start TEXT NOT NULL,                     -- HH:MM
  end   TEXT NOT NULL
);

-- Exams, quizzes, deadlines (manual, from a school .ics, or read-only from Classroom).
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'exam', -- exam | quiz | deadline
  date        TEXT NOT NULL,                -- YYYY-MM-DD
  source      TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT UNIQUE
);

-- Auto-generated micro study sessions.
CREATE TABLE IF NOT EXISTS study_blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  date       TEXT NOT NULL,
  start      TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  task       TEXT NOT NULL,                 -- reviewer | flashcards | practice | recap
  status     TEXT NOT NULL DEFAULT 'planned', -- planned | done | skipped
  note       TEXT NOT NULL DEFAULT ''
);

-- Google OAuth tokens (read-only scopes only), encrypted at rest.
CREATE TABLE IF NOT EXISTS google_auth (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(due_at);
CREATE INDEX IF NOT EXISTS idx_blocks_date ON study_blocks(date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
