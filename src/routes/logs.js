// 发送日志查询
const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const reminderId = req.query.reminder_id ? Number(req.query.reminder_id) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  let sql = `SELECT l.id, l.reminder_id, l.sent_at, l.status, l.error, r.title
             FROM send_logs l LEFT JOIN reminders r ON r.id = l.reminder_id`;
  const params = [];
  if (reminderId) { sql += ' WHERE l.reminder_id = ?'; params.push(reminderId); }
  sql += ' ORDER BY l.sent_at DESC LIMIT ?';
  params.push(limit);
  const rows = await query(sql, params);
  res.json({ ok: true, data: rows });
});

module.exports = router;
