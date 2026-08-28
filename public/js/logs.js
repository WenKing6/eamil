async function loadOptions() {
  try {
    const { data } = await api('/api/reminders');
    const sel = document.getElementById('filter');
    data.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.title;
      sel.appendChild(o);
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function loadLogs() {
  try {
    const rid = document.getElementById('filter').value;
    const { data } = await api(`/api/logs${rid ? '?reminder_id=' + rid : ''}`);
    const card = document.getElementById('logCard');
    if (!data.length) { card.innerHTML = '<div class="empty">暂无发送记录</div>'; return; }
    card.innerHTML = `<table class="table">
      <thead><tr><th>任务</th><th>时间</th><th>状态</th><th>说明</th></tr></thead>
      <tbody>${data.map((l) => `
        <tr>
          <td>${esc(l.title || '—')}</td>
          <td style="color:var(--muted)">${esc(fmtDateTime(l.sent_at))}</td>
          <td><span class="badge ${l.status === 'success' ? 'badge-on' : 'badge-fail'}">${l.status === 'success' ? '成功' : '失败'}</span></td>
          <td style="color:var(--muted);max-width:280px">${esc(l.error || '')}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('filter').addEventListener('change', loadLogs);
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault(); api('/api/auth/logout', { method: 'POST', body: '{}' }).finally(() => location.href = '/login.html');
});
loadOptions();
loadLogs();
