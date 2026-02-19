import { useState, useEffect, useCallback } from 'react';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './hooks/useAuth';

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  business: "M3 21h18 M9 8h1m5 0h1 M9 12h1m5 0h1 M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  invest: "M12 2v20 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  history: "M12 8v4l3 3 M3.05 11a9 9 0 1017.9 0H3.05z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  plus: "M12 5v14 M5 12h14",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  trend: "M22 7l-8.5 8.5-5-5L2 17",
  wallet: "M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a2 2 0 000 4h4v-4z",
  crown: "M2 20h20 M5 20V9l7-7 7 7v11",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #080c10;
    --surface: #0e1419;
    --surface2: #141b22;
    --border: #1e2a35;
    --accent: #00d4ff;
    --accent2: #00ff88;
    --accent3: #ff6b35;
    --text: #e8f4fd;
    --text2: #7a9bb5;
    --danger: #ff4466;
    --gold: #ffd700;
    --font: 'Syne', sans-serif;
    --mono: 'JetBrains Mono', monospace;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); overflow-x: hidden; }

  /* scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* ── AUTH ── */
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at 20% 50%, #001a2e 0%, var(--bg) 60%),
                radial-gradient(ellipse at 80% 20%, #001a1a 0%, transparent 50%);
    position: relative;
    overflow: hidden;
  }
  .auth-page::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .auth-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px;
    width: 380px;
    position: relative;
    z-index: 1;
    box-shadow: 0 0 60px rgba(0,212,255,0.08);
  }
  .auth-logo {
    text-align: center;
    margin-bottom: 32px;
  }
  .auth-logo h1 {
    font-size: 28px;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }
  .auth-logo p { color: var(--text2); font-size: 13px; margin-top: 4px; }
  .auth-badge {
    display: inline-block;
    background: rgba(0,212,255,0.1);
    border: 1px solid rgba(0,212,255,0.3);
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    padding: 3px 8px;
    border-radius: 20px;
    margin-bottom: 8px;
    font-family: var(--mono);
  }

  /* ── FORM ── */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 6px; letter-spacing: 1px; text-transform: uppercase; }
  .form-input {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }
  .form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,212,255,0.1); }
  .form-select { appearance: none; cursor: pointer; }
  .form-input::placeholder { color: #3a5060; }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 8px;
    font-family: var(--font);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), #0099cc);
    color: #000;
    width: 100%;
    justify-content: center;
    padding: 12px;
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,212,255,0.3); }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-danger { background: rgba(255,68,102,0.1); color: var(--danger); border: 1px solid rgba(255,68,102,0.3); }
  .btn-danger:hover { background: rgba(255,68,102,0.2); }
  .btn-success { background: rgba(0,255,136,0.1); color: var(--accent2); border: 1px solid rgba(0,255,136,0.3); }
  .btn-success:hover { background: rgba(0,255,136,0.2); }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

  .error-msg { background: rgba(255,68,102,0.1); border: 1px solid rgba(255,68,102,0.3); color: var(--danger); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .success-msg { background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); color: var(--accent2); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }

  .auth-switch { text-align: center; margin-top: 20px; font-size: 13px; color: var(--text2); }
  .auth-switch button { background: none; border: none; color: var(--accent); cursor: pointer; font-family: var(--font); font-weight: 700; }

  /* ── LAYOUT ── */
  .app-layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 240px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; bottom: 0; left: 0;
    z-index: 100;
  }
  .sidebar-logo {
    padding: 24px 20px 20px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-logo h2 {
    font-size: 18px;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sidebar-logo span { font-size: 11px; color: var(--text2); font-family: var(--mono); }

  .sidebar-user {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 34px; height: 34px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px; color: #000;
    flex-shrink: 0;
  }
  .user-info p { font-size: 13px; font-weight: 700; }
  .user-info span { font-size: 11px; color: var(--text2); font-family: var(--mono); }
  .role-badge {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--mono);
  }
  .role-admin { background: rgba(255,215,0,0.15); color: var(--gold); }
  .role-member { background: rgba(0,212,255,0.1); color: var(--accent); }

  .sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text2);
    font-size: 13px;
    font-weight: 600;
    transition: all 0.15s;
    margin-bottom: 2px;
    border: 1px solid transparent;
  }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: rgba(0,212,255,0.08); color: var(--accent); border-color: rgba(0,212,255,0.2); }
  .nav-section { font-size: 10px; color: #3a5060; font-weight: 700; letter-spacing: 2px; padding: 12px 12px 4px; text-transform: uppercase; font-family: var(--mono); }

  .sidebar-footer { padding: 12px 10px; border-top: 1px solid var(--border); }

  .main-content { margin-left: 240px; flex: 1; padding: 32px; min-height: 100vh; }

  /* ── PAGE HEADER ── */
  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-size: 26px; font-weight: 800; }
  .page-header p { color: var(--text2); font-size: 14px; margin-top: 4px; }

  /* ── STAT CARDS ── */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .stat-card:hover { border-color: var(--accent); }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 80px; height: 80px;
    border-radius: 50%;
    background: var(--card-glow, rgba(0,212,255,0.05));
    filter: blur(20px);
  }
  .stat-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--card-icon-bg, rgba(0,212,255,0.1)); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: var(--card-icon-color, var(--accent)); }
  .stat-label { font-size: 11px; color: var(--text2); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-family: var(--mono); margin-bottom: 6px; }
  .stat-value { font-size: 26px; font-weight: 800; font-family: var(--mono); }
  .stat-sub { font-size: 12px; color: var(--text2); margin-top: 4px; }

  /* ── CARDS ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .card-title { font-size: 15px; font-weight: 800; }
  .card-subtitle { font-size: 12px; color: var(--text2); }

  /* ── TABLE ── */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: var(--text2); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 8px 12px; font-family: var(--mono); border-bottom: 1px solid var(--border); }
  td { padding: 12px 12px; font-size: 13px; border-bottom: 1px solid rgba(30,42,53,0.5); }
  tr:hover td { background: rgba(255,255,255,0.02); }
  tr:last-child td { border-bottom: none; }

  /* ── BUSINESS CARDS ── */
  .biz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .biz-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }
  .biz-card:hover { border-color: rgba(0,212,255,0.3); transform: translateY(-2px); }
  .biz-card::before {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 100px; height: 100px;
    background: radial-gradient(circle, rgba(0,212,255,0.05), transparent);
  }
  .biz-icon { font-size: 32px; margin-bottom: 10px; }
  .biz-name { font-size: 17px; font-weight: 800; margin-bottom: 4px; }
  .biz-desc { font-size: 12px; color: var(--text2); margin-bottom: 16px; }
  .biz-stats { display: flex; gap: 16px; margin-bottom: 16px; }
  .biz-stat label { font-size: 10px; color: var(--text2); font-family: var(--mono); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .biz-stat p { font-size: 16px; font-weight: 800; font-family: var(--mono); color: var(--accent2); }
  .biz-actions { display: flex; gap: 8px; }

  /* ── USER SHARES ── */
  .share-bar-wrap { margin-bottom: 16px; }
  .share-bar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .share-bar-name { font-size: 13px; font-weight: 700; }
  .share-bar-value { font-size: 13px; font-family: var(--mono); color: var(--accent2); }
  .share-bar-bg { background: var(--surface2); border-radius: 4px; height: 8px; overflow: hidden; }
  .share-bar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width 0.8s ease; }

  /* ── MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    width: 440px;
    max-width: calc(100vw - 40px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: slideUp 0.2s ease;
  }
  .modal h3 { font-size: 18px; font-weight: 800; margin-bottom: 20px; }
  .modal-footer { display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end; }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* ── AMOUNT INPUT ── */
  .amount-input-wrap { position: relative; }
  .amount-input-wrap .currency { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--accent2); font-weight: 800; font-family: var(--mono); }
  .amount-input-wrap .form-input { padding-left: 30px; }

  /* ── TRANSACTION ── */
  .tx-type { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 20px; font-family: var(--mono); }
  .tx-investment { background: rgba(0,255,136,0.1); color: var(--accent2); }
  .tx-business_created { background: rgba(0,212,255,0.1); color: var(--accent); }
  .tx-default { background: rgba(255,255,255,0.05); color: var(--text2); }

  .money { font-family: var(--mono); font-weight: 700; color: var(--accent2); }
  .money-neg { font-family: var(--mono); font-weight: 700; color: var(--danger); }

  /* ── EMPTY STATE ── */
  .empty { text-align: center; padding: 48px; color: var(--text2); }
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  .empty p { font-size: 14px; }

  /* ── LOADING ── */
  .loading { display: flex; align-items: center; justify-content: center; min-height: 200px; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── LEADERBOARD ── */
  .leader-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border-radius: 10px;
    margin-bottom: 8px;
    background: var(--surface2);
    border: 1px solid var(--border);
    transition: all 0.15s;
  }
  .leader-item:hover { border-color: rgba(0,212,255,0.2); }
  .leader-rank { font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text2); width: 28px; }
  .leader-rank.first { color: var(--gold); }
  .leader-rank.second { color: #c0c0c0; }
  .leader-rank.third { color: #cd7f32; }
  .leader-info { flex: 1; }
  .leader-name { font-size: 14px; font-weight: 700; }
  .leader-sub { font-size: 12px; color: var(--text2); font-family: var(--mono); }
  .leader-amount { font-family: var(--mono); font-weight: 800; font-size: 15px; color: var(--accent2); }

  /* ── GRID 2 ── */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 20px; font-family: var(--mono); font-weight: 700; }
  .chip-admin { background: rgba(255,215,0,0.1); color: var(--gold); }
  .chip-member { background: rgba(0,212,255,0.08); color: var(--accent); }
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ─── MODAL ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', adminSecret: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'login') await login(form.username, form.password);
      else await register(form.username, form.password, form.adminSecret);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-badge">FIVEM FINANCE</div>
          <h1>💰 Gang Bank</h1>
          <p>Gestione investimenti del gruppo</p>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" placeholder="il_tuo_nome" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Admin Secret (opzionale)</label>
              <input className="form-input" type="password" placeholder="lascia vuoto per membro normale" value={form.adminSecret}
                onChange={e => setForm(f => ({ ...f, adminSecret: e.target.value }))} />
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Caricamento...' : mode === 'login' ? '🚀 Accedi' : '✅ Registrati'}
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? (
            <p>Non hai un account? <button onClick={() => setMode('register')}>Registrati</button></p>
          ) : (
            <p>Hai già un account? <button onClick={() => setMode('login')}>Accedi</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────
function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!stats) return null;

  const { totals, monthly_revenue, user_totals } = stats;

  return (
    <>
      <div className="page-header">
        <h1>📊 Dashboard</h1>
        <p>Panoramica degli investimenti del gruppo</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card" style={{ '--card-glow': 'rgba(0,212,255,0.08)', '--card-icon-bg': 'rgba(0,212,255,0.1)', '--card-icon-color': 'var(--accent)' }}>
          <div className="stat-icon"><Icon d={icons.wallet} /></div>
          <div className="stat-label">Pool Totale</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{fmt(totals.total_pool)}</div>
          <div className="stat-sub">investiti dal gruppo</div>
        </div>
        <div className="stat-card" style={{ '--card-glow': 'rgba(0,255,136,0.08)', '--card-icon-bg': 'rgba(0,255,136,0.1)', '--card-icon-color': 'var(--accent2)' }}>
          <div className="stat-icon"><Icon d={icons.trend} /></div>
          <div className="stat-label">Guadagno Mensile</div>
          <div className="stat-value" style={{ color: 'var(--accent2)' }}>{fmt(monthly_revenue)}</div>
          <div className="stat-sub">entrate mensili totali</div>
        </div>
        <div className="stat-card" style={{ '--card-glow': 'rgba(255,107,53,0.08)', '--card-icon-bg': 'rgba(255,107,53,0.1)', '--card-icon-color': 'var(--accent3)' }}>
          <div className="stat-icon"><Icon d={icons.business} /></div>
          <div className="stat-label">Attività</div>
          <div className="stat-value" style={{ color: 'var(--accent3)' }}>{totals.total_businesses}</div>
          <div className="stat-sub">business attivi</div>
        </div>
        <div className="stat-card" style={{ '--card-glow': 'rgba(255,215,0,0.08)', '--card-icon-bg': 'rgba(255,215,0,0.1)', '--card-icon-color': 'var(--gold)' }}>
          <div className="stat-icon"><Icon d={icons.users} /></div>
          <div className="stat-label">Investitori</div>
          <div className="stat-value" style={{ color: 'var(--gold)' }}>{totals.total_investors}</div>
          <div className="stat-sub">membri attivi</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Leaderboard */}
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">🏆 Classifica Investitori</div><div className="card-subtitle">ordinati per investimento totale</div></div>
          </div>
          {user_totals.filter(u => u.total_invested > 0).map((u, i) => (
            <div className="leader-item" key={u.id}>
              <div className={`leader-rank ${i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : ''}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </div>
              <div className="avatar">{u.username[0].toUpperCase()}</div>
              <div className="leader-info">
                <div className="leader-name">{u.username}</div>
                <div className="leader-sub">guadagna {fmt(u.total_monthly_earnings)}/mese</div>
              </div>
              <div className="leader-amount">{fmt(u.total_invested)}</div>
            </div>
          ))}
          {user_totals.filter(u => u.total_invested > 0).length === 0 && (
            <div className="empty"><div className="empty-icon">💤</div><p>Nessun investimento ancora</p></div>
          )}
        </div>

        {/* Quote per business */}
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">📈 Quote per Business</div><div className="card-subtitle">distribuzione investimenti</div></div>
          </div>
          {stats.user_shares.length === 0 && (
            <div className="empty"><div className="empty-icon">📭</div><p>Nessun dato disponibile</p></div>
          )}
          {Object.entries(
            stats.user_shares.reduce((acc, s) => {
              if (!acc[s.business_name]) acc[s.business_name] = { icon: s.icon, users: [] };
              acc[s.business_name].users.push(s);
              return acc;
            }, {})
          ).map(([bizName, { icon, users }]) => (
            <div key={bizName} style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{icon}</span> {bizName}
                <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', marginLeft: 4 }}>
                  {fmt(users[0].monthly_revenue)}/mese
                </span>
              </div>
              {users.map(s => (
                <div className="share-bar-wrap" key={s.user_id}>
                  <div className="share-bar-header">
                    <span className="share-bar-name">{s.username}</span>
                    <span className="share-bar-value">{fmt(s.monthly_earnings)}/mese ({Number(s.share_percent).toFixed(1)}%)</span>
                  </div>
                  <div className="share-bar-bg">
                    <div className="share-bar-fill" style={{ width: `${s.share_percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── BUSINESSES PAGE ──────────────────────────────────────────────────────────
function BusinessesPage() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editBiz, setEditBiz] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', monthly_revenue: '', icon: '🏢' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => api.getBusinesses().then(setBusinesses).finally(() => setLoading(false)), []);
  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = () => { setEditBiz(null); setForm({ name: '', description: '', monthly_revenue: '', icon: '🏢' }); setShowModal(true); setError(''); };
  const openEdit = (b) => { setEditBiz(b); setForm({ name: b.name, description: b.description, monthly_revenue: b.monthly_revenue, icon: b.icon }); setShowModal(true); setError(''); };

  const handleSave = async () => {
    if (!form.name) return setError('Nome richiesto');
    setSaving(true); setError('');
    try {
      if (editBiz) await api.updateBusiness(editBiz.id, form);
      else await api.createBusiness(form);
      setShowModal(false);
      refresh();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Rimuovere questa attività?')) return;
    await api.deleteBusiness(id);
    refresh();
  };

  const ICONS = ['🏢', '🏪', '🚗', '🏦', '🏨', '🍕', '💊', '🔫', '🎰', '🚢', '✈️', '🏗️', '💈', '🎪', '🏚️'];

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>🏢 Attività</h1><p>Gestisci i business del gruppo</p></div>
        {user.role === 'admin' && (
          <button className="btn btn-success" onClick={openCreate}><Icon d={icons.plus} size={16} /> Nuova Attività</button>
        )}
      </div>

      {businesses.length === 0 ? (
        <div className="empty card"><div className="empty-icon">🏙️</div><p>Nessuna attività ancora. Creane una!</p></div>
      ) : (
        <div className="biz-grid">
          {businesses.map(b => (
            <div className="biz-card" key={b.id}>
              <div className="biz-icon">{b.icon}</div>
              <div className="biz-name">{b.name}</div>
              <div className="biz-desc">{b.description || 'Nessuna descrizione'}</div>
              <div className="biz-stats">
                <div className="biz-stat">
                  <label>Investito</label>
                  <p>{fmt(b.total_invested)}</p>
                </div>
                <div className="biz-stat">
                  <label>Guadagno/mese</label>
                  <p>{fmt(b.monthly_revenue)}</p>
                </div>
              </div>
              {user.role === 'admin' && (
                <div className="biz-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}><Icon d={icons.edit} size={14} /> Modifica</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}><Icon d={icons.trash} size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editBiz ? '✏️ Modifica Attività' : '🏢 Nuova Attività'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleSave} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
            </>
          }
        >
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" placeholder="es. Officina, Pizzeria..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Icona</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ICONS.map(icon => (
                <button key={icon} onClick={() => setForm(f => ({ ...f, icon }))}
                  style={{ fontSize: 22, background: form.icon === icon ? 'rgba(0,212,255,0.15)' : 'var(--surface2)', border: `2px solid ${form.icon === icon ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrizione</label>
            <input className="form-input" placeholder="Breve descrizione..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Guadagno Mensile ($)</label>
            <div className="amount-input-wrap">
              <span className="currency">$</span>
              <input className="form-input" type="number" placeholder="0" value={form.monthly_revenue} onChange={e => setForm(f => ({ ...f, monthly_revenue: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── INVESTMENTS PAGE ─────────────────────────────────────────────────────────
function InvestmentsPage() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState([]);
  const [users, setUsers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ user_id: '', business_id: '', amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [inv, u, b] = await Promise.all([api.getInvestments(), api.getUsers(), api.getBusinesses()]);
    setInvestments(inv); setUsers(u); setBusinesses(b);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    if (!form.user_id || !form.business_id || !form.amount) return setError('Tutti i campi sono obbligatori');
    setSaving(true); setError('');
    try {
      await api.addInvestment(form);
      setShowModal(false);
      setForm({ user_id: '', business_id: '', amount: '', note: '' });
      refresh();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo investimento?')) return;
    await api.deleteInvestment(id);
    refresh();
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>💵 Investimenti</h1><p>Registro versamenti dei membri</p></div>
        {user.role === 'admin' && (
          <button className="btn btn-success" onClick={() => { setShowModal(true); setError(''); }}>
            <Icon d={icons.plus} size={16} /> Aggiungi Versamento
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Membro</th>
                <th>Attività</th>
                <th>Importo</th>
                <th>Nota</th>
                <th>Data</th>
                {user.role === 'admin' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {investments.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>Nessun investimento registrato</td></tr>
              )}
              {investments.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{inv.username[0].toUpperCase()}</div>
                      <span style={{ fontWeight: 600 }}>{inv.username}</span>
                    </div>
                  </td>
                  <td><span style={{ marginRight: 4 }}>{inv.business_icon}</span>{inv.business_name}</td>
                  <td><span className="money">{fmt(inv.amount)}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{inv.note || '—'}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--mono)' }}>{fmtDate(inv.created_at)}</td>
                  {user.role === 'admin' && (
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(inv.id)}><Icon d={icons.trash} size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title="💵 Nuovo Versamento"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleAdd} disabled={saving}>{saving ? '...' : 'Salva'}</button>
            </>
          }
        >
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label className="form-label">Membro</label>
            <select className="form-input form-select" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
              <option value="">Seleziona membro...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Attività</label>
            <select className="form-input form-select" value={form.business_id} onChange={e => setForm(f => ({ ...f, business_id: e.target.value }))}>
              <option value="">Seleziona attività...</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Importo ($)</label>
            <div className="amount-input-wrap">
              <span className="currency">$</span>
              <input className="form-input" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nota (opzionale)</label>
            <input className="form-input" placeholder="es. Prima rata..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── MEMBERS PAGE ─────────────────────────────────────────────────────────────
function MembersPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getUsers(), api.getStats()]).then(([u, s]) => { setUsers(u); setStats(s); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const maxInvested = Math.max(...users.map(u => Number(u.total_invested)), 1);

  return (
    <>
      <div className="page-header"><h1>👥 Membri</h1><p>Tutti gli investitori del gruppo</p></div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Membro</th>
                <th>Ruolo</th>
                <th>Investito</th>
                <th>Guadagno Mensile</th>
                <th>ROI Mensile</th>
                <th>Membro dal</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const statsUser = stats?.user_totals?.find(s => s.id === u.id);
                const monthly = statsUser?.total_monthly_earnings || 0;
                const invested = Number(u.total_invested);
                const roi = invested > 0 ? (monthly / invested * 100).toFixed(1) : '0.0';
                return (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar">{u.username[0].toUpperCase()}</div>
                        <span style={{ fontWeight: 700 }}>{u.username}</span>
                      </div>
                    </td>
                    <td><span className={`chip ${u.role === 'admin' ? 'chip-admin' : 'chip-member'}`}>{u.role === 'admin' ? '👑 admin' : '🎮 member'}</span></td>
                    <td>
                      <div>
                        <div className="money">{fmt(invested)}</div>
                        <div style={{ background: 'var(--surface2)', borderRadius: 3, height: 4, marginTop: 4, width: 100 }}>
                          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent2))', borderRadius: 3, width: `${(invested / maxInvested) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td><span className="money">{fmt(monthly)}/mese</span></td>
                    <td><span style={{ fontFamily: 'var(--mono)', color: Number(roi) > 0 ? 'var(--accent2)' : 'var(--text2)' }}>{roi}%</span></td>
                    <td style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--mono)' }}>{fmtDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── TRANSACTIONS PAGE ────────────────────────────────────────────────────────
function TransactionsPage() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getTransactions().then(setTxs).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header"><h1>📋 Storico</h1><p>Tutte le transazioni del gruppo</p></div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrizione</th>
                <th>Importo</th>
                <th>Business</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>Nessuna transazione</td></tr>
              )}
              {txs.map(tx => (
                <tr key={tx.id}>
                  <td>
                    <span className={`tx-type ${tx.type === 'investment' ? 'tx-investment' : tx.type === 'business_created' ? 'tx-business_created' : 'tx-default'}`}>
                      {tx.type === 'investment' ? '💸 investimento' : tx.type === 'business_created' ? '🏢 creazione' : tx.type}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{tx.description}</td>
                  <td>{tx.amount > 0 ? <span className="money">{fmt(tx.amount)}</span> : <span style={{ color: 'var(--text2)' }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{tx.business_icon} {tx.business_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{fmtDate(tx.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage }) {
  const { user, logout } = useAuth();
  const nav = [
    { id: 'dashboard', icon: icons.dashboard, label: 'Dashboard' },
    { id: 'businesses', icon: icons.business, label: 'Attività' },
    { id: 'investments', icon: icons.invest, label: 'Investimenti' },
    { id: 'members', icon: icons.users, label: 'Membri' },
    { id: 'transactions', icon: icons.history, label: 'Storico' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <h2>💰 Gang Bank</h2>
        <span>FIVEM FINANCE v1.0</span>
      </div>
      <div className="sidebar-user">
        <div className="avatar">{user.username[0].toUpperCase()}</div>
        <div className="user-info">
          <p>{user.username}</p>
          <span className={`role-badge ${user.role === 'admin' ? 'role-admin' : 'role-member'}`}>
            {user.role === 'admin' ? '👑 ADMIN' : '🎮 MEMBER'}
          </span>
        </div>
      </div>
      <div className="sidebar-nav">
        <div className="nav-section">Navigazione</div>
        {nav.map(n => (
          <div key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
            <Icon d={n.icon} size={17} />
            {n.label}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="nav-item" onClick={logout}>
          <Icon d={icons.logout} size={17} />
          Logout
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  if (!user) return <AuthPage />;

  const pages = { dashboard: <DashboardPage />, businesses: <BusinessesPage />, investments: <InvestmentsPage />, members: <MembersPage />, transactions: <TransactionsPage /> };

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} />
      <div className="main-content">
        {pages[page] || <DashboardPage />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <style>{css}</style>
      <AppInner />
    </AuthProvider>
  );
}
