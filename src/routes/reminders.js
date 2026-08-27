// 提醒任务 CRUD + 立即测试发送
const express = require('express');
const { query, getRow, transaction } = require('../db');
const { validateReminder } = require('../security');
const { getNextRunTime } = require('../schedule');
const { sendReminder } = require('../mailer');

const router = express.Router();

// 列表
router.get('/', async (req, res) => {
  const rows = await query(
    'SELECT id, title, content, type, trigger_time, time_of_day, weekday, day_of_month, enabled, next_run_at, created_at FROM reminders ORDER BY enabled DESC, next_run_at ASC'
  );
  res.json({ ok: true, data: rows });
});

// 新建
router.post('/', async (req, res) => {
  const v = await validateReminder(req);
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  const b = req.body;
  const triggerTime = b.type === 'one_time' ? b.trigger_time : null;
  const timeOfDay = b.type === 'one_time' ? '00:00' : (b.time_of_day || '09:00');
  const weekday = b.type === 'weekly' ? b.weekday : null;
  const dayOfMonth = b.type === 'monthly' ? b.day_of_month : null;
  const task = {
    type: b.type, time_of_day: timeOfDay, weekday, day_of_month: dayOfMonth,
    trigger_time: triggerTime,
  };
  const nextRun = getNextRunTime(task, new Date());
  const result = await query(
    `INSERT INTO reminders (title, content, type, trigger_time, time_of_day, weekday, day_of_month, enabled, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.title, b.content, b.type, triggerTime, timeOfDay, weekday, dayOfMonth, b.enabled === false ? 0 : 1, nextRun]
  );
  res.json({ ok: true, id: result.insertId });
});

// 更新
router.put('/:id', async (req, res) => {
  const v = await validateReminder(req);
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  const id = Number(req.params.id);
  const b = req.body;
  const triggerTime = b.type === 'one_time' ? b.trigger_time : null;
  const timeOfDay = b.type === 'one_time' ? '00:00' : (b.time_of_day || '09:00');
  const task = {
    type: b.type, time_of_day: timeOfDay, weekday: b.weekday, day_of_month: b.day_of_month,
    trigger_time: triggerTime,
  };
  const nextRun = getNextRunTime(task, new Date());
  const result = await query(
    `UPDATE reminders SET title=?, content=?, type=?, trigger_time=?, time_of_day=?, weekday=?, day_of_month=?, enabled=?, next_run_at=? WHERE id=?`,
    [b.title, b.content, b.type, triggerTime, timeOfDay, b.weekday, b.day_of_month, b.enabled === false ? 0 : 1, nextRun, id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: '任务不存在' });
  res.json({ ok: true });
});

// 切换启用状态
router.patch('/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  const row = await getRow('SELECT enabled, type, trigger_time, time_of_day, weekday, day_of_month FROM reminders WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ ok: false, message: '任务不存在' });
  const enabled = row.enabled === 1 ? 0 : 1;
  let nextRun = row.next_run_at;
  if (enabled === 1) nextRun = getNextRunTime(row, new Date());
  await query('UPDATE reminders SET enabled = ?, next_run_at = ? WHERE id = ?', [enabled, nextRun, id]);
  res.json({ ok: true, enabled });
});

// 删除
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM reminders WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// 立即测试发送（不写日志）
router.post('/:id/test', async (req, res) => {
  const id = Number(req.params.id);
  const row = await getRow('SELECT * FROM reminders WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ ok: false, message: '任务不存在' });
  try {
    await sendReminder(row);
    res.json({ ok: true, message: '测试邮件已发送' });
  } catch (err) {
    res.status(500).json({ ok: false, message: '发送失败：' + sanitizeError(err.message) });
  }
});

// 错误信息脱敏：仅保留类型，不暴露 SMTP 账号/授权码
function sanitizeError(msg) {
  return String(msg || '').replace(/pass[^ ]*/gi, '***').slice(0, 300);
}

module.exports = router;
