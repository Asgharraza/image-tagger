const Database = require('better-sqlite3');
const db = new Database('images.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    tags TEXT NOT NULL,
    raw_response TEXT,
    created_at TEXT NOT NULL
  )
`);

module.exports = db;