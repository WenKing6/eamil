// 系统设置：SMTP 配置 + 测试邮件
const express = require('express');
const { getRow, query } = require('../db');
const { validateSettings } = require('../security');
const { encrypt } = require('../crypto');
const { sendReminder, buildTransport } = require('../mailer');
const config = require('../config');

const router = express.Router();

// 读取（授权码脱敏返回）
router.get('/', async (req, res) => {
  const row = await getRow(
    'SELECT smtp_host, smtp_port, smtp_user, sender_name, recipient_email, updated_at FROM settings WHERE id = 1'
  );
  const hasPass = await getRow('SELECT smtp_pass_encrypted FROM settings WHERE id = 1');
  res.json({ ok: true, data: { ...row, smtp_pass_set: !!hasPass.smtp_pass_encrypted } });
});

// 保存（授权码留空则不更新）
router.put('/', async (req, res) => {
  const v = await validateSettings(req);
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  const b = req.body || {};
  const passEnc = b.smtp_pass ? encrypt(b.smtp_pass, config.aesKey) : null;
  const set = {
    smtp_host: b.smtp_host, smtp_port: b.smtp_port, smtp_user: b.smtp_user,
    sender_name: b.sender_name, recipient_email: b.recipient_email,
  };
  await query(
    `UPDATE settings SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass_encrypted=COALESCE(?, smtp_pass_encrypted), sender_name=?, recipient_email=? WHERE id=1`,
    [set.smtp_host, set.smtp_port, set.smtp_user, passEnc, set.sender_name, set.recipient_email]
  );
  res.json({ ok: true });
});

// 发送测试邮件（以收件邮箱为收件人）
router.post('/test', async (req, res) => {
  try {
    const { transport, from, to } = await buildTransport();
    if (!to) throw new Error('未配置收件邮箱');
    await transport.sendMail({
      from, to,
      subject: '【自动提醒】测试邮件',
      html: '<p>这是一封测试邮件，说明 SMTP 配置正确。</p>',
    });
    res.json({ ok: true, message: '测试邮件已发送' });
  } catch (err) {
    res.status(500).json({ ok: false, message: '发送失败：' + String(err.message).slice(0, 300) });
  }
});

module.exports = router;
