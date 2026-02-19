const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore');
  return data;
}

export const api = {
  login: (body) => req('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => req('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => req('/auth/me'),

  getUsers: () => req('/users'),

  getBusinesses: () => req('/businesses'),
  createBusiness: (body) => req('/businesses', { method: 'POST', body: JSON.stringify(body) }),
  updateBusiness: (id, body) => req(`/businesses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBusiness: (id) => req(`/businesses/${id}`, { method: 'DELETE' }),

  getInvestments: () => req('/investments'),
  addInvestment: (body) => req('/investments', { method: 'POST', body: JSON.stringify(body) }),
  deleteInvestment: (id) => req(`/investments/${id}`, { method: 'DELETE' }),

  getEarnings: () => req('/earnings'),
  addEarning: (body) => req('/earnings', { method: 'POST', body: JSON.stringify(body) }),
  deleteEarning: (id) => req(`/earnings/${id}`, { method: 'DELETE' }),

  getWithdrawals: () => req('/withdrawals'),
  addWithdrawal: (body) => req('/withdrawals', { method: 'POST', body: JSON.stringify(body) }),
  deleteWithdrawal: (id) => req(`/withdrawals/${id}`, { method: 'DELETE' }),

  getStats: () => req('/stats'),
  getTransactions: () => req('/transactions'),
};
