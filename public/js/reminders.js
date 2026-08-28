let editingId = null;

const TYPE_LABEL = { daily: '每天', weekly: '每周', monthly: '每月', one_time: '单次' };

function renderTypeInfo(t) {
  if (t.type === 'daily') return t.time_of_day;
  if (t.type === 'weekly') return `周${'日一二三四五六'[t.weekday]} ${t.time_of_day}`;
  if (t.type === 'monthly') return `每月${t.day_of_month}日 ${t.time_of_day}`;
  return fmtDateTime(t.trigger_time);
}

async function loadList() {
  try {
    const { data } = await api('/api/reminders');
    const wrap = document.getElementById('listWrap');
    if (!data.length) { wrap.innerHTML = '<div class="empty">暂无提醒，点击右上角新建</div>'; return; }
    wrap.innerHTML = `<table class="table">
      <thead><tr><th>标题</th><th>规则</th><th>状态</th><th>下次发送</th><th>操作</th></tr></thead>
      <tbody>${data.map((t) => `
        <tr>
          <td><b>${esc(t.title)}</b></td>
          <td>${esc(renderTypeInfo(t))}</td>
          <td><span class="badge ${t.enabled ? 'badge-on' : 'badge-off'}">${t.enabled ? '启用' : '停用'}</span></td>
          <td style="color:var(--muted)">${t.next_run_at ? esc(fmtDateTime(t.next_run_at)) : '—'}</td>
          <td>
            <button class="btn" data-act="edit" data-id="${t.id}">编辑</button>
            <button class="btn" data-act="toggle" data-id="${t.id}">${t.enabled ? '停用' : '启用'}</button>
            <button class="btn" data-act="test" data-id="${t.id}">测试</button>
            <button class="btn btn-danger" data-act="del" data-id="${t.id}">删除</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`;
    wrap.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.act, Number(btn.dataset.id)));
    });
  } catch (e) { toast(e.message, 'error'); }
}

function handleAction(act, id) {
  if (act === 'edit') openModal(id);
  else if (act === 'toggle') toggle(id);
  else if (act === 'test') testSend(id);
  else if (act === 'del') { if (confirm('确定删除该提醒？')) del(id); }
}

async function toggle(id) {
  try { await api(`/api/reminders/${id}/toggle`, { method: 'PATCH', body: '{}' }); toast('已更新状态'); loadList(); }
  catch (e) { toast(e.message, 'error'); }
}
async function testSend(id) {
  try { const d = await api(`/api/reminders/${id}/test`, { method: 'POST', body: '{}' }); toast(d.message || '已发送'); }
  catch (e) { toast(e.message, 'error'); }
}
async function del(id) {
  try { await api(`/api/reminders/${id}`, { method: 'DELETE' }); toast('已删除'); loadList(); }
  catch (e) { toast(e.message, 'error'); }
}

function syncFields() {
  const type = document.getElementById('f-type').value;
  document.getElementById('periodFields').style.display = (type === 'one_time') ? 'none' : 'block';
  document.getElementById('weekField').style.display = (type === 'weekly') ? 'block' : 'none';
  document.getElementById('monthField').style.display = (type === 'monthly') ? 'block' : 'none';
  document.getElementById('onceField').style.display = (type === 'one_time') ? 'block' : 'none';
}
document.getElementById('f-type').addEventListener('change', syncFields);

function showModal() {
  document.getElementById('modal').style.display = 'flex';
  syncFields();
  document.getElementById('f-title').focus();
}
function hideModal() { document.getElementById('modal').style.display = 'none'; editingId = null; }

async function openModal(id) {
  if (id) {
    const { data } = await api('/api/reminders');
    const t = data.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    document.getElementById('modalTitle').textContent = '编辑提醒';
    document.getElementById('f-title').value = t.title;
    document.getElementById('f-content').value = t.content;
    document.getElementById('f-type').value = t.type;
    document.getElementById('f-time').value = t.time_of_day || '09:00';
    document.getElementById('f-weekday').value = String(t.weekday ?? 1);
    document.getElementById('f-day').value = t.day_of_month || 1;
    document.getElementById('f-once').value = fmtDateTime(t.trigger_time);
  } else {
    editingId = null;
    document.getElementById('modalTitle').textContent = '新建提醒';
    ['f-title', 'f-content', 'f-once'].forEach((i) => document.getElementById(i).value = '');
    document.getElementById('f-type').value = 'daily';
    document.getElementById('f-time').value = '09:00';
    document.getElementById('f-weekday').value = '1';
    document.getElementById('f-day').value = '1';
  }
  showModal();
}

document.getElementById('addBtn').addEventListener('click', () => openModal());
document.getElementById('cancelBtn').addEventListener('click', hideModal);

async function save() {
  const type = document.getElementById('f-type').value;
  const payload = {
    title: document.getElementById('f-title').value.trim(),
    content: document.getElementById('f-content').value.trim(),
    type,
  };
  if (type === 'one_time') payload.trigger_time = document.getElementById('f-once').value.trim();
  else {
    payload.time_of_day = document.getElementById('f-time').value.trim();
    if (type === 'weekly') payload.weekday = Number(document.getElementById('f-weekday').value);
    if (type === 'monthly') payload.day_of_month = Number(document.getElementById('f-day').value);
  }
  try {
    if (editingId) { await api(`/api/reminders/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) }); }
    else { await api('/api/reminders', { method: 'POST', body: JSON.stringify(payload) }); }
    toast('已保存'); hideModal(); loadList();
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault(); api('/api/auth/logout', { method: 'POST', body: '{}' }).finally(() => location.href = '/login.html');
});
loadList();
