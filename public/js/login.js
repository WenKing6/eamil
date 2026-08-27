async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) return toast('请输入用户名和密码', 'error');
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    location.href = '/index.html';
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
