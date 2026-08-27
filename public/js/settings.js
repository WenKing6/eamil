async function load() {
  try {
    const { data } = await api('/api/settings');
    document.getElementById('s-host').value = data.smtp_host || '';
    document.getElementById('s-port').value = data.smtp_port || 465;
    document.getElementById('s-user').value = data.smtp_user || '';
    document.getElementById('s-name').value = data.sender_name || '';
    document.getElementById('s-recipient').value = data.recipient_email || '';
    document.getElementById('s-pass').placeholder = data.smtp_pass_set ? '已保存，留空则不修改' : '请输入授权码';
  } catch (e) { toast(e.message, 'error'); }
}
async function save() {
  const payload = {
    smtp_host: document.getElementById('s-host').value.trim(),
    smtp_port: Number(document.getElementById('s-port').value),
    smtp_user: document.getElementById('s-user').value.trim(),
    smtp_pass: document.getElementById('s-pass').value,
    sender_name: document.getElementById('s-name').value.trim(),
    recipient_email: document.getElementById('s-recipient').value.trim(),
  };
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    toast('设置已保存');
    document.getElementById('s-pass').value = '';
    load();
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('testBtn').addEventListener('click', async () => {
  try { const d = await api('/api/settings/test', { method: 'POST', body: '{}' }); toast(d.message); }
  catch (e) { toast(e.message, 'error'); }
});
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault(); api('/api/auth/logout', { method: 'POST', body: '{}' }).finally(() => location.href = '/login.html');
});
load();
