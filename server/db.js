const fs = require('fs');
const path = require('path');

const usePostgres = Boolean(process.env.DATABASE_URL);

let db;
let pgPool;

if (usePostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
} else {
  const { DatabaseSync } = require('node:sqlite');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'frex.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  has_subscription BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) DEFAULT 'Unknown',
  audio_path TEXT NOT NULL,
  cover_path TEXT,
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_path TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS user_playlist (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);
`;

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  is_blocked INTEGER DEFAULT 0,
  has_subscription INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'Unknown',
  audio_path TEXT NOT NULL,
  cover_path TEXT,
  is_blocked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  is_public INTEGER DEFAULT 1,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS user_playlist (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, track_id)
);
`;

async function pgQuery(text, params = []) {
  const res = await pgPool.query(text, params);
  return res;
}

function toSqliteSql(sql) {
  return sql
    .replace(/SERIAL/gi, 'INTEGER')
    .replace(/TIMESTAMPTZ/gi, 'TEXT')
    .replace(/BOOLEAN/gi, 'INTEGER')
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/\$(\d+)/g, '?');
}

function sqliteQuery(sql, params = []) {
  const sqliteSql = toSqliteSql(sql);
  const trimmed = sqliteSql.trim().toUpperCase();
  const stmt = db.prepare(sqliteSql);
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    return stmt.all(...params);
  }
  const info = stmt.run(...params);
  return {
    rows: [],
    rowCount: info.changes,
    lastInsertRowid: Number(info.lastInsertRowid),
  };
}

async function query(sql, params = []) {
  if (usePostgres) {
    const res = await pgQuery(sql, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount,
      lastInsertRowid: res.rows[0]?.id,
    };
  }

  const result = sqliteQuery(sql, params);
  if (sql.trim().toUpperCase().includes('RETURNING')) {
    const id = result.lastInsertRowid;
    const tableMatch = sql.match(/INTO\s+(\w+)/i);
    if (tableMatch && id) {
      const rows = sqliteQuery(`SELECT * FROM ${tableMatch[1]} WHERE id = $1`, [id]);
      return { rows, rowCount: 1, lastInsertRowid: id };
    }
  }
  if (trimmedStartsWithSelect(sql)) {
    return { rows: Array.isArray(result) ? result : [], rowCount: result?.length || 0 };
  }
  return { rows: [], rowCount: result.rowCount ?? 0, lastInsertRowid: result.lastInsertRowid };
}

function trimmedStartsWithSelect(sql) {
  const t = sql.trim().toUpperCase();
  return t.startsWith('SELECT') || t.startsWith('WITH');
}

async function initSchema() {
  if (usePostgres) {
    await pgQuery(SCHEMA_SQL);
  } else {
    db.exec(SCHEMA_SQLITE);
  }
}

function bool(v) {
  if (usePostgres) return Boolean(v);
  return v === 1 || v === true;
}

function toBoolInt(v) {
  return v ? (usePostgres ? true : 1) : usePostgres ? false : 0;
}

module.exports = {
  query,
  initSchema,
  usePostgres,
  bool,
  toBoolInt,
};
