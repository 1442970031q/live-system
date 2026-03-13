/**
 * 后台管理 API
 */
import { API_BASE } from '../config';

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// 登录
export const authAPI = {
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || '登录失败');
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
    }
    return data;
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  isAuthenticated: () => !!localStorage.getItem('token'),
  getCurrentUser: () => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },
};

// 敏感词管理 API
export const sensitiveAPI = {
  getCategories: async () => {
    const res = await fetch(`${API_BASE}/sensitive/categories`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error((await res.json()).message || '获取分类失败');
    return res.json();
  },
  getWords: async (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/sensitive/words?${qs}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error((await res.json()).message || '获取敏感词列表失败');
    return res.json();
  },
  createWord: async (data) => {
    const res = await fetch(`${API_BASE}/sensitive/words`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).message || '新增失败');
    return res.json();
  },
  updateWord: async (id, data) => {
    const res = await fetch(`${API_BASE}/sensitive/words/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).message || '更新失败');
    return res.json();
  },
  toggleWord: async (id, enabled) => {
    const res = await fetch(`${API_BASE}/sensitive/words/${id}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error((await res.json()).message || '操作失败');
    return res.json();
  },
  batchImport: async (words) => {
    const res = await fetch(`${API_BASE}/sensitive/words/batch-import`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ words }),
    });
    if (!res.ok) throw new Error((await res.json()).message || '批量导入失败');
    return res.json();
  },
  hotReload: async () => {
    const res = await fetch(`${API_BASE}/sensitive/words/hot-reload`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).message || '热更新失败');
    return res.json();
  },
  getHitLogs: async (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/sensitive/hit-logs?${qs}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error((await res.json()).message || '获取日志失败');
    return res.json();
  },
  getBlackWhiteList: async (listType = 'black', params = {}) => {
    const clean = Object.fromEntries(Object.entries({ listType, ...params }).filter(([, v]) => v != null && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/sensitive/black-white?${qs}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error((await res.json()).message || '获取名单失败');
    return res.json();
  },
  addBlackWhite: async (data) => {
    const res = await fetch(`${API_BASE}/sensitive/black-white`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).message || '添加失败');
    return res.json();
  },
  removeBlackWhite: async (userId, listType) => {
    const res = await fetch(`${API_BASE}/sensitive/black-white/${userId}/${listType}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).message || '移除失败');
    return res.json();
  },
};
