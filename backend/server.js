require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  connectionLimit: 10,
});

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'investigating', 'resolved'];
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error' }); });

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', db: 'connected' });
}));

app.post('/api/register', authLimiter, wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 8) return res.status(400).json({ error: 'Username and password (min 8 chars) required' });
  const hash = await bcrypt.hash(password, 12);
  try {
    await pool.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    res.status(201).json({ message: 'Registered' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username taken' });
    throw e;
  }
}));

app.post('/api/login', authLimiter, wrap(async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ?', [username || '']);
  if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: rows[0].id, username: rows[0].username }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, username: rows[0].username });
}));

app.get('/api/incidents', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT i.id, i.title, i.description, i.severity, i.status, i.created_at, u.username AS reporter
     FROM incidents i JOIN users u ON u.id = i.reporter_id ORDER BY i.created_at DESC LIMIT 200`);
  res.json(rows);
}));

app.post('/api/incidents', auth, wrap(async (req, res) => {
  const { title, description = '', severity } = req.body;
  if (!title || title.length > 150 || !SEVERITIES.includes(severity)) return res.status(400).json({ error: 'Invalid input' });
  const [r] = await pool.execute(
    'INSERT INTO incidents (title, description, severity, reporter_id) VALUES (?, ?, ?, ?)',
    [title, description.slice(0, 2000), severity, req.user.id]);
  res.status(201).json({ id: r.insertId });
}));

app.patch('/api/incidents/:id', auth, wrap(async (req, res) => {
  if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  await pool.execute('UPDATE incidents SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
  res.json({ message: 'Updated' });
}));

app.get('/api/stats', auth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT severity, COUNT(*) AS count FROM incidents WHERE status <> "resolved" GROUP BY severity');
  res.json(rows);
}));

app.listen(process.env.PORT || 3000, '127.0.0.1', () => console.log('API running'));
