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

    CREATE TABLE IF NOT EXISTS earnings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      total_amount NUMERIC(12,2) NOT NULL,
      note TEXT,
      recorded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS earning_shares (
      id SERIAL PRIMARY KEY,
      earning_id INTEGER REFERENCES earnings(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      share_percent NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      note TEXT,
      recorded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      total_amount NUMERIC(12,2) NOT NULL,
      description TEXT NOT NULL,
      note TEXT,
      recorded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expense_shares (
      id SERIAL PRIMARY KEY,
      expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      share_percent NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS business_managers (
      id SERIAL PRIMARY KEY,
      business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(business_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(30) NOT NULL,
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
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Controlla se l'utente è admin globale oppure manager di questo business
async function canManageBusiness(req, res, next) {
  if (req.user.role === 'admin') return next();
  const bizId = req.params.id || req.body.business_id;
  if (!bizId) return res.status(403).json({ error: 'Business non specificato' });
  const { rows } = await pool.query(
    'SELECT 1 FROM business_managers WHERE business_id=$1 AND user_id=$2',
    [bizId, req.user.id]
  );
  if (rows.length === 0) return res.status(403).json({ error: 'Non sei manager di questa attività' });
  next();
}

// Censura il nome: prima lettera + asterischi, tranne per se stesso, admin o manager
function maskName(username, requestingUserId, ownerId, canSee) {
  if (canSee || requestingUserId === ownerId || !username) return username;
  return username[0].toUpperCase() + '*'.repeat(Math.max(username.length - 1, 3));
}

// Recupera le business_id di cui l'utente è manager
async function getManagedBusinessIds(userId) {
  const { rows } = await pool.query(
    'SELECT business_id FROM business_managers WHERE user_id=$1', [userId]
  );
  return new Set(rows.map(r => String(r.business_id)));
}

async function maskRows(rows, requestingUser, userIdField = 'user_id', usernameField = 'username', bizIdField = 'business_id') {
  if (requestingUser.role === 'admin') return rows;
  const managedBizIds = await getManagedBusinessIds(requestingUser.id);
  return rows.map(row => {
    // Il manager vede i nomi degli investitori delle sue attività
    const isManager = bizIdField && row[bizIdField] && managedBizIds.has(String(row[bizIdField]));
    return {
      ...row,
      [usernameField]: maskName(row[usernameField], requestingUser.id, row[userIdField], isManager)
    };
  });
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
  } catch { res.status(400).json({ error: 'Username già in uso' }); }
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
  // Admin: vede tutti
  // Manager: vede i nomi degli investitori delle sue attività
  // Member: vede solo se stesso
  if (req.user.role === 'admin') return res.json(rows);
  const managedBizIds = await getManagedBusinessIds(req.user.id);
  let visibleUserIds = new Set([String(req.user.id)]);
  if (managedBizIds.size > 0) {
    const { rows: investors } = await pool.query(
      `SELECT DISTINCT user_id FROM investments WHERE business_id = ANY($1::int[])`,
      [[...managedBizIds].map(Number)]
    );
    investors.forEach(r => visibleUserIds.add(String(r.user_id)));
  }
  const masked = rows.map(u => ({
    ...u,
    username: visibleUserIds.has(String(u.id)) ? u.username : maskName(u.username, req.user.id, u.id, false)
  }));
  res.json(masked);
});

// ─── BUSINESSES ───────────────────────────────────────────────────────────────
app.get('/api/businesses', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, COALESCE(SUM(i.amount), 0) as total_invested_real,
      ARRAY(
        SELECT jsonb_build_object('user_id', bm.user_id, 'username', u.username)
        FROM business_managers bm JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = b.id
      ) as managers
    FROM businesses b
    LEFT JOIN investments i ON i.business_id = b.id
    WHERE b.active = true
    GROUP BY b.id ORDER BY b.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/businesses', auth, adminOnly, async (req, res) => {
  const { name, description, icon } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO businesses (name, description, icon) VALUES ($1, $2, $3) RETURNING *',
    [name, description || '', icon || '🏢']
  );
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [rows[0].id, req.user.id, 'business_created', 0, `Attività "${name}" creata`]);
  res.json(rows[0]);
});

app.put('/api/businesses/:id', auth, adminOnly, async (req, res) => {
  const { name, description, icon } = req.body;
  const { rows } = await pool.query(
    'UPDATE businesses SET name=$1, description=$2, icon=$3 WHERE id=$4 RETURNING *',
    [name, description, icon, req.params.id]
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
  res.json(await maskRows(rows, req.user));
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

// ─── EARNINGS ─────────────────────────────────────────────────────────────────
// Registra un guadagno e distribuisce le quote agli investitori
app.get('/api/earnings', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, b.name as business_name, b.icon as business_icon, u.username as recorded_by_name
    FROM earnings e
    JOIN businesses b ON b.id = e.business_id
    LEFT JOIN users u ON u.id = e.recorded_by
    ORDER BY e.created_at DESC
  `);
  const managedBizIds = req.user.role === 'admin' ? null : await getManagedBusinessIds(req.user.id);
  res.json(rows.map(r => {
    const canSee = req.user.role === 'admin' || r.recorded_by === req.user.id || (managedBizIds && managedBizIds.has(String(r.business_id)));
    return { ...r, recorded_by_name: canSee ? r.recorded_by_name : null };
  }));
});

app.post('/api/earnings', auth, canManageBusiness, async (req, res) => {
  const { business_id, total_amount, note } = req.body;
  if (!business_id || !total_amount) return res.status(400).json({ error: 'business_id e total_amount richiesti' });

  // Calcola le quote degli investitori per questo business
  const { rows: investors } = await pool.query(`
    SELECT user_id, SUM(amount) as invested,
      SUM(amount) / (SELECT SUM(amount) FROM investments WHERE business_id = $1) * 100 as share_percent
    FROM investments WHERE business_id = $1
    GROUP BY user_id
  `, [business_id]);

  if (investors.length === 0) return res.status(400).json({ error: 'Nessun investitore per questa attività' });

  // Inserisci il guadagno
  const { rows: [earning] } = await pool.query(
    'INSERT INTO earnings (business_id, total_amount, note, recorded_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [business_id, total_amount, note || '', req.user.id]
  );

  // Distribuisci le quote
  for (const inv of investors) {
    const share = (Number(inv.share_percent) / 100) * Number(total_amount);
    await pool.query(
      'INSERT INTO earning_shares (earning_id, user_id, business_id, amount, share_percent) VALUES ($1, $2, $3, $4, $5)',
      [earning.id, inv.user_id, business_id, share.toFixed(2), inv.share_percent]
    );
  }

  const bizRow = await pool.query('SELECT name FROM businesses WHERE id=$1', [business_id]);
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [business_id, req.user.id, 'earning', total_amount, `Guadagno $${total_amount} registrato per ${bizRow.rows[0].name}`]);

  res.json(earning);
});

app.delete('/api/earnings/:id', auth, adminOnly, async (req, res) => {  // delete still admin-only
  await pool.query('DELETE FROM earning_shares WHERE earning_id=$1', [req.params.id]);
  await pool.query('DELETE FROM earnings WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ─── WITHDRAWALS ──────────────────────────────────────────────────────────────
app.get('/api/withdrawals', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT w.*, u.username, b.name as business_name, b.icon as business_icon,
      rb.username as recorded_by_name
    FROM withdrawals w
    JOIN users u ON u.id = w.user_id
    JOIN businesses b ON b.id = w.business_id
    LEFT JOIN users rb ON rb.id = w.recorded_by
    ORDER BY w.created_at DESC
  `);
  res.json(await maskRows(rows, req.user));
});

app.post('/api/withdrawals', auth, canManageBusiness, async (req, res) => {
  const { user_id, business_id, amount, note } = req.body;
  if (!user_id || !business_id || !amount) return res.status(400).json({ error: 'Campi obbligatori mancanti' });

  // Controlla che abbia abbastanza saldo
  const { rows: [balance] } = await pool.query(`
    SELECT 
      COALESCE(SUM(es.amount), 0) as total_earned,
      COALESCE((SELECT SUM(w.amount) FROM withdrawals w WHERE w.user_id=$1 AND w.business_id=$2), 0) as total_withdrawn
    FROM earning_shares es WHERE es.user_id=$1 AND es.business_id=$2
  `, [user_id, business_id]);

  const available = Number(balance.total_earned) - Number(balance.total_withdrawn);
  if (amount > available) return res.status(400).json({ error: `Saldo insufficiente. Disponibile: $${available.toFixed(2)}` });

  const { rows } = await pool.query(
    'INSERT INTO withdrawals (user_id, business_id, amount, note, recorded_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [user_id, business_id, amount, note || '', req.user.id]
  );

  const userRow = await pool.query('SELECT username FROM users WHERE id=$1', [user_id]);
  const bizRow = await pool.query('SELECT name FROM businesses WHERE id=$1', [business_id]);
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [business_id, user_id, 'withdrawal', amount, `${userRow.rows[0].username} ha ritirato $${amount} da ${bizRow.rows[0].name}`]);

  res.json(rows[0]);
});

app.delete('/api/withdrawals/:id', auth, async (req, res) => {
  // Admin can delete any, manager can delete only from their business
  const { rows } = await pool.query('SELECT * FROM withdrawals WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin') {
    const { rows: mgr } = await pool.query(
      'SELECT 1 FROM business_managers WHERE business_id=$1 AND user_id=$2',
      [rows[0].business_id, req.user.id]
    );
    if (mgr.length === 0) return res.status(403).json({ error: 'Non sei manager di questa attività' });
  }
  await pool.query('DELETE FROM withdrawals WHERE id=$1', [req.params.id]);
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
  const totalEarnings = await pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM earnings`);
  const totalExpenses = await pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses`);

  // Saldo per utente per business (guadagnato - spese - ritirato)
  const userBalances = await pool.query(`
    SELECT 
      u.id as user_id, u.username,
      b.id as business_id, b.name as business_name, b.icon,
      COALESCE(SUM(es.amount), 0) as total_earned,
      COALESCE((SELECT SUM(xs.amount) FROM expense_shares xs WHERE xs.user_id = u.id AND xs.business_id = b.id), 0) as total_expenses,
      COALESCE((SELECT SUM(w.amount) FROM withdrawals w WHERE w.user_id = u.id AND w.business_id = b.id), 0) as total_withdrawn,
      COALESCE(SUM(es.amount), 0)
        - COALESCE((SELECT SUM(xs.amount) FROM expense_shares xs WHERE xs.user_id = u.id AND xs.business_id = b.id), 0)
        - COALESCE((SELECT SUM(w.amount) FROM withdrawals w WHERE w.user_id = u.id AND w.business_id = b.id), 0) as available_balance
    FROM users u
    JOIN earning_shares es ON es.user_id = u.id
    JOIN businesses b ON b.id = es.business_id
    GROUP BY u.id, u.username, b.id, b.name, b.icon
    ORDER BY u.username, b.name
  `);

  // Totali per utente
  const userTotals = await pool.query(`
    SELECT 
      u.id, u.username,
      COALESCE(SUM(DISTINCT i.amount), 0) as total_invested,
      COALESCE((SELECT SUM(es2.amount) FROM earning_shares es2 WHERE es2.user_id = u.id), 0) as total_earned,
      COALESCE((SELECT SUM(xs.amount) FROM expense_shares xs WHERE xs.user_id = u.id), 0) as total_expenses,
      COALESCE((SELECT SUM(w.amount) FROM withdrawals w WHERE w.user_id = u.id), 0) as total_withdrawn,
      COALESCE((SELECT SUM(es2.amount) FROM earning_shares es2 WHERE es2.user_id = u.id), 0)
        - COALESCE((SELECT SUM(xs.amount) FROM expense_shares xs WHERE xs.user_id = u.id), 0)
        - COALESCE((SELECT SUM(w.amount) FROM withdrawals w WHERE w.user_id = u.id), 0) as available_balance
    FROM users u
    LEFT JOIN investments i ON i.user_id = u.id
    GROUP BY u.id, u.username
    ORDER BY total_invested DESC
  `);

  const isAdmin = req.user.role === 'admin';
  const managedBizIds = isAdmin ? new Set() : await getManagedBusinessIds(req.user.id);
  const maskStatRows = (rows, hasBizId = false) => rows.map(r => {
    const isManager = hasBizId && managedBizIds.has(String(r.business_id));
    return {
      ...r,
      username: maskName(r.username, req.user.id, r.user_id || r.id, isAdmin || isManager)
    };
  });

  res.json({
    totals: totals.rows[0],
    total_earnings: totalEarnings.rows[0].total,
    total_expenses: totalExpenses.rows[0].total,
    user_balances: maskStatRows(userBalances.rows, true),
    user_totals: maskStatRows(userTotals.rows, false)
  });
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
app.get('/api/transactions', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, u.username, b.name as business_name, b.icon as business_icon
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN businesses b ON b.id = t.business_id
    ORDER BY t.created_at DESC LIMIT 200
  `);
  res.json(await maskRows(rows, req.user));
});

// ─── EXPENSES ────────────────────────────────────────────────────────────────
app.get('/api/expenses', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, b.name as business_name, b.icon as business_icon, u.username as recorded_by_name
    FROM expenses e
    JOIN businesses b ON b.id = e.business_id
    LEFT JOIN users u ON u.id = e.recorded_by
    ORDER BY e.created_at DESC
  `);
  const managedBizIdsExp = req.user.role === 'admin' ? null : await getManagedBusinessIds(req.user.id);
  res.json(rows.map(r => {
    const canSee = req.user.role === 'admin' || (managedBizIdsExp && managedBizIdsExp.has(String(r.business_id)));
    return { ...r, recorded_by_name: canSee ? r.recorded_by_name : null };
  }));
});

app.post('/api/expenses', auth, canManageBusiness, async (req, res) => {
  const { business_id, total_amount, description, note } = req.body;
  if (!business_id || !total_amount || !description) return res.status(400).json({ error: 'business_id, total_amount e description richiesti' });

  const { rows: investors } = await pool.query(`
    SELECT user_id, SUM(amount) as invested,
      SUM(amount) / (SELECT SUM(amount) FROM investments WHERE business_id = $1) * 100 as share_percent
    FROM investments WHERE business_id = $1
    GROUP BY user_id
  `, [business_id]);

  if (investors.length === 0) return res.status(400).json({ error: 'Nessun investitore per questa attività' });

  const { rows: [expense] } = await pool.query(
    'INSERT INTO expenses (business_id, total_amount, description, note, recorded_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [business_id, total_amount, description, note || '', req.user.id]
  );

  for (const inv of investors) {
    const share = (Number(inv.share_percent) / 100) * Number(total_amount);
    await pool.query(
      'INSERT INTO expense_shares (expense_id, user_id, business_id, amount, share_percent) VALUES ($1, $2, $3, $4, $5)',
      [expense.id, inv.user_id, business_id, share.toFixed(2), inv.share_percent]
    );
  }

  const bizRow = await pool.query('SELECT name FROM businesses WHERE id=$1', [business_id]);
  await pool.query('INSERT INTO transactions (business_id, user_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [business_id, req.user.id, 'expense', total_amount, `Spesa "${description}" $${total_amount} per ${bizRow.rows[0].name}`]);

  res.json(expense);
});

app.delete('/api/expenses/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM expense_shares WHERE expense_id=$1', [req.params.id]);
  await pool.query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ─── BUSINESS MANAGERS ────────────────────────────────────────────────────────
// GET managers of a business
app.get('/api/businesses/:id/managers', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT bm.*, u.username FROM business_managers bm
    JOIN users u ON u.id = bm.user_id
    WHERE bm.business_id = $1
  `, [req.params.id]);
  res.json(rows);
});

// Add manager (admin only)
app.post('/api/businesses/:id/managers', auth, adminOnly, async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id richiesto' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO business_managers (business_id, user_id) VALUES ($1, $2) RETURNING *',
      [req.params.id, user_id]
    );
    res.json(rows[0]);
  } catch { res.status(400).json({ error: 'Manager già assegnato' }); }
});

// Remove manager (admin only)
app.delete('/api/businesses/:id/managers/:uid', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM business_managers WHERE business_id=$1 AND user_id=$2', [req.params.id, req.params.uid]);
  res.json({ success: true });
});

// GET: users visible to me (for dropdowns in withdrawal modal)
app.get('/api/my-visible-users', auth, async (req, res) => {
  if (req.user.role === 'admin') {
    const { rows } = await pool.query('SELECT id, username, role FROM users ORDER BY username');
    return res.json(rows);
  }
  const managedBizIds = await getManagedBusinessIds(req.user.id);
  if (managedBizIds.size === 0) {
    const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id=$1', [req.user.id]);
    return res.json(rows);
  }
  const { rows } = await pool.query(`
    SELECT DISTINCT u.id, u.username, u.role
    FROM users u
    JOIN investments i ON i.user_id = u.id
    WHERE i.business_id = ANY($1::int[])
    ORDER BY u.username
  `, [[...managedBizIds].map(Number)]);
  res.json(rows);
});

// GET: which businesses can I manage?
app.get('/api/my-businesses', auth, async (req, res) => {
  if (req.user.role === 'admin') {
    const { rows } = await pool.query('SELECT * FROM businesses WHERE active=true ORDER BY name');
    return res.json(rows);
  }
  const { rows } = await pool.query(`
    SELECT b.* FROM businesses b
    JOIN business_managers bm ON bm.business_id = b.id
    WHERE bm.user_id = $1 AND b.active = true
    ORDER BY b.name
  `, [req.user.id]);
  res.json(rows);
});

// ─── MY PROFILE ──────────────────────────────────────────────────────────────
// Dati personali dell'utente loggato (nomi altrui non servono, nessuna censura necessaria)
app.get('/api/me/stats', auth, async (req, res) => {
  const uid = req.user.id;

  // Investimenti del singolo utente
  const investments = await pool.query(`
    SELECT i.*, b.name as business_name, b.icon as business_icon
    FROM investments i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.user_id = $1
    ORDER BY i.created_at DESC
  `, [uid]);

  // Quote guadagni per business
  const earningShares = await pool.query(`
    SELECT es.*, e.note as earning_note, e.created_at as earning_date,
      b.name as business_name, b.icon as business_icon
    FROM earning_shares es
    JOIN earnings e ON e.id = es.earning_id
    JOIN businesses b ON b.id = es.business_id
    WHERE es.user_id = $1
    ORDER BY e.created_at DESC
  `, [uid]);

  // Quote spese per business
  const expenseShares = await pool.query(`
    SELECT es.*, e.description as expense_description, e.note as expense_note, e.created_at as expense_date,
      b.name as business_name, b.icon as business_icon
    FROM expense_shares es
    JOIN expenses e ON e.id = es.expense_id
    JOIN businesses b ON b.id = es.business_id
    WHERE es.user_id = $1
    ORDER BY e.created_at DESC
  `, [uid]);

  // Prelievi
  const withdrawals = await pool.query(`
    SELECT w.*, b.name as business_name, b.icon as business_icon
    FROM withdrawals w
    JOIN businesses b ON b.id = w.business_id
    WHERE w.user_id = $1
    ORDER BY w.created_at DESC
  `, [uid]);

  // Saldo per business (guadagnato - spese - ritirato)
  const balances = await pool.query(`
    SELECT 
      b.id as business_id, b.name as business_name, b.icon,
      COALESCE(inv.invested, 0) as invested,
      COALESCE(earned.total_earned, 0) as total_earned,
      COALESCE(myexp.total_expenses, 0) as total_expenses,
      COALESCE(withdrawn.total_withdrawn, 0) as total_withdrawn,
      COALESCE(earned.total_earned, 0)
        - COALESCE(myexp.total_expenses, 0)
        - COALESCE(withdrawn.total_withdrawn, 0) as available_balance,
      COALESCE(inv.invested, 0) / NULLIF(biz_total.total, 0) * 100 as share_percent
    FROM businesses b
    LEFT JOIN (SELECT business_id, SUM(amount) as invested FROM investments WHERE user_id=$1 GROUP BY business_id) inv ON inv.business_id = b.id
    LEFT JOIN (SELECT business_id, SUM(amount) as total_earned FROM earning_shares WHERE user_id=$1 GROUP BY business_id) earned ON earned.business_id = b.id
    LEFT JOIN (SELECT business_id, SUM(amount) as total_withdrawn FROM withdrawals WHERE user_id=$1 GROUP BY business_id) withdrawn ON withdrawn.business_id = b.id
    LEFT JOIN (SELECT business_id, SUM(amount) as total_expenses FROM expense_shares WHERE user_id=$1 GROUP BY business_id) myexp ON myexp.business_id = b.id
    LEFT JOIN (SELECT business_id, SUM(amount) as total FROM investments GROUP BY business_id) biz_total ON biz_total.business_id = b.id
    WHERE b.active = true AND inv.invested IS NOT NULL
    ORDER BY b.name
  `, [uid]);

  const totals = {
    total_invested: investments.rows.reduce((s, r) => s + Number(r.amount), 0),
    total_earned: earningShares.rows.reduce((s, r) => s + Number(r.amount), 0),
    total_expenses: expenseShares.rows.reduce((s, r) => s + Number(r.amount), 0),
    total_withdrawn: withdrawals.rows.reduce((s, r) => s + Number(r.amount), 0),
  };
  totals.net_earnings = totals.total_earned - totals.total_expenses;
  totals.available_balance = totals.net_earnings - totals.total_withdrawn;

  res.json({
    totals,
    investments: investments.rows,
    earning_shares: earningShares.rows,
    expense_shares: expenseShares.rows,
    withdrawals: withdrawals.rows,
    balances: balances.rows,
  });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(frontendPath, 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
