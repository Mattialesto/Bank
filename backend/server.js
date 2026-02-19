import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve frontend build
const frontendPath = join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// ─── DB INIT ──────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(10) DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      total_invested NUMERIC(12,2) DEFAULT 0,
      monthly_revenue NUMERIC(12,2) DEFAULT 0,
      icon VARCHAR(10) DEFAULT '🏢',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS investments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(20) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ DB initialized');
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password, adminSecret } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e password richiesti' });
  const role = adminSecret === (process.env.ADMIN_SECRET || 'admin123') ? 'admin' : 'member';
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, role]
    );
    const token = jwt.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: rows[0] });
  } catch (e) {
    res.status(400).json({ error: 'Username già in uso' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!rows[0] || !await bcrypt.compare(password, rows[0].password_hash))
    return res.status(401).json({ error: 'Credenziali non valide' });
  const token = jwt.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  res.json({ token, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role, created_at FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]);
});

// ─── USERS ────────────────────────────────────────────────────────────────────
app.get('/api/users', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.role, u.created_at,
      COALESCE(SUM(i.amount), 0) as total_invested
    FROM users u
    LEFT JOIN investments i ON i.user_id = u.id
    GROUP BY u.id ORDER BY total_invested DESC
  `);
  res.json(rows);
});

// ─── BUSINESSES ───────────────────────────────────────────────────────────────
app.get('/api/businesses', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, COALESCE(SUM(i.amount), 0) as total_invested_real
    FROM businesses b
    LEFT JOIN investments i ON i.business_id = b.id
    WHERE b.active = true
    GROUP BY b.id ORDER BY b.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/businesses', auth, adminOnly, async (req, res) => {
  const { name, description, monthly_revenue, icon } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO businesses (name, description, monthly_revenue, icon) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, description || '', monthly_revenue || 0, icon || '🏢']
  );
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [rows[0].id, req.user.id, 'business_created', 0, `Attività "${name}" creata`]);
  res.json(rows[0]);
});

app.put('/api/businesses/:id', auth, adminOnly, async (req, res) => {
  const { name, description, monthly_revenue, icon } = req.body;
  const { rows } = await pool.query(
    'UPDATE businesses SET name=$1, description=$2, monthly_revenue=$3, icon=$4 WHERE id=$5 RETURNING *',
    [name, description, monthly_revenue, icon, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/businesses/:id', auth, adminOnly, async (req, res) => {
  await pool.query('UPDATE businesses SET active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ─── INVESTMENTS ──────────────────────────────────────────────────────────────
app.get('/api/investments', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT i.*, u.username, b.name as business_name, b.icon as business_icon
    FROM investments i
    JOIN users u ON u.id = i.user_id
    JOIN businesses b ON b.id = i.business_id
    ORDER BY i.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/investments', auth, adminOnly, async (req, res) => {
  const { user_id, business_id, amount, note } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO investments (user_id, business_id, amount, note) VALUES ($1, $2, $3, $4) RETURNING *',
    [user_id, business_id, amount, note || '']
  );
  await pool.query('UPDATE businesses SET total_invested = total_invested + $1 WHERE id = $2', [amount, business_id]);
  const userRow = await pool.query('SELECT username FROM users WHERE id=$1', [user_id]);
  const bizRow = await pool.query('SELECT name FROM businesses WHERE id=$1', [business_id]);
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [business_id, user_id, 'investment', amount, `${userRow.rows[0].username} ha investito $${amount} in ${bizRow.rows[0].name}`]);
  res.json(rows[0]);
});

app.delete('/api/investments/:id', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM investments WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('UPDATE businesses SET total_invested = total_invested - $1 WHERE id = $2', [rows[0].amount, rows[0].business_id]);
  await pool.query('DELETE FROM investments WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
  const totals = await pool.query(`
    SELECT COALESCE(SUM(i.amount), 0) as total_pool,
      COUNT(DISTINCT i.user_id) as total_investors,
      COUNT(DISTINCT i.business_id) as total_businesses
    FROM investments i JOIN businesses b ON b.id = i.business_id WHERE b.active = true
  `);
  const monthlyRevenue = await pool.query(`SELECT COALESCE(SUM(monthly_revenue), 0) as total_monthly FROM businesses WHERE active = true`);
  const userShares = await pool.query(`
    SELECT u.id as user_id, u.username, b.id as business_id, b.name as business_name, b.icon, b.monthly_revenue,
      i_user.user_amount, b_total.business_total,
      CASE WHEN b_total.business_total > 0 THEN (i_user.user_amount / b_total.business_total * 100) ELSE 0 END as share_percent,
      CASE WHEN b_total.business_total > 0 THEN (i_user.user_amount / b_total.business_total * b.monthly_revenue) ELSE 0 END as monthly_earnings
    FROM users u CROSS JOIN businesses b
    JOIN (SELECT user_id, business_id, SUM(amount) as user_amount FROM investments GROUP BY user_id, business_id) i_user ON i_user.user_id = u.id AND i_user.business_id = b.id
    JOIN (SELECT business_id, SUM(amount) as business_total FROM investments GROUP BY business_id) b_total ON b_total.business_id = b.id
    WHERE b.active = true ORDER BY u.username, b.name
  `);
  const userTotals = await pool.query(`
    SELECT u.id, u.username, COALESCE(SUM(i.amount), 0) as total_invested,
      COALESCE(SUM(CASE WHEN b_total.business_total > 0 THEN (i.amount / b_total.business_total * b.monthly_revenue) ELSE 0 END), 0) as total_monthly_earnings
    FROM users u
    LEFT JOIN investments i ON i.user_id = u.id
    LEFT JOIN businesses b ON b.id = i.business_id AND b.active = true
    LEFT JOIN (SELECT business_id, SUM(amount) as business_total FROM investments GROUP BY business_id) b_total ON b_total.business_id = i.business_id
    GROUP BY u.id, u.username ORDER BY total_invested DESC
  `);
  res.json({ totals: totals.rows[0], monthly_revenue: monthlyRevenue.rows[0].total_monthly, user_shares: userShares.rows, user_totals: userTotals.rows });
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
app.get('/api/transactions', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, u.username, b.name as business_name, b.icon as business_icon
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN businesses b ON b.id = t.business_id
    ORDER BY t.created_at DESC LIMIT 100
  `);
  res.json(rows);
});

// ─── SPA fallback (deve stare DOPO tutte le /api) ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(frontendPath, 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
