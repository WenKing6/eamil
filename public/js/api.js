// 统一请求封装：携带 CSRF 头、处理 401 跳登录、统一 toast
async function api(path, options = {}) {
  const opts = { ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) } };
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login.html'; throw new Error('未登录'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.errors?.join('；') || '请求失败');
  return data;
}

function toast(message, type = 'success') {
  const wrap = document.querySelector('.toast-wrap') || (() => {
    const el = document.createElement('div');
    el.className = 'toast-wrap';
    document.body.appendChild(el);
    return el;
  })();
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 5000); // 固定 5 秒
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
