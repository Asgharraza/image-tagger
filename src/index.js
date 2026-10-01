require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { tagImage } = require('./llm/client');
const { TagOutput } = require('./llm/schema');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF allowed'));
    }
    cb(null, true);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────
// POST /tag — upload + tag in one request
// ─────────────────────────────────────────
app.post('/tag', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const filePath = req.file.path;
  const mime = req.file.mimetype;

  try {
    const { raw } = await tagImage(filePath, mime);

    // Clean + parse
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(422).json({ error: 'Model returned non-JSON', raw });
    }

    // Validate schema
    const validated = TagOutput.safeParse(parsed);
    if (!validated.success) {
      return res.status(422).json({
        error: 'Schema mismatch',
        detail: validated.error.issues[0].message,
        raw
      });
    }

    // Store
    const stmt = db.prepare(`
      INSERT INTO images (filename, tags, raw_response, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.file.filename,
      JSON.stringify(validated.data.tags),
      raw,
      new Date().toISOString()
    );

    res.status(200).json({
      id: result.lastInsertRowid,
      filename: req.file.filename,
      tags: validated.data.tags
    });
  } catch (err) {
    console.error('tag error:', err);
    const isTimeout = err.code === 'ETIMEDOUT' || err.name === 'AbortError';
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Model timed out' : 'Tagging failed',
      detail: err.message
    });
  }
});

// ─────────────────────────────────────────
// GET /images — list all, optionally filter by tag
// ─────────────────────────────────────────
app.get('/images', (req, res) => {
  const { tag } = req.query;

  let rows;
  if (tag) {
    rows = db.prepare(`
      SELECT * FROM images
      WHERE tags LIKE ?
      ORDER BY id DESC
    `).all(`%"${tag}"%`);
  } else {
    rows = db.prepare('SELECT * FROM images ORDER BY id DESC').all();
  }

  const result = rows.map(r => ({
    id: r.id,
    filename: r.filename,
    tags: JSON.parse(r.tags),
    created_at: r.created_at
  }));

  res.json(result);
});

// ─────────────────────────────────────────
// GET /images/:id — single image
// ─────────────────────────────────────────
app.get('/images/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Image not found' });

  res.json({
    id: row.id,
    filename: row.filename,
    tags: JSON.parse(row.tags),
    created_at: row.created_at
  });
});

// ─────────────────────────────────────────
// GET /tags — all unique tags + counts
// ─────────────────────────────────────────
app.get('/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM images').all();
  const counts = {};
  for (const r of rows) {
    for (const t of JSON.parse(r.tags)) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  res.json(sorted.map(([tag, count]) => ({ tag, count })));
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 