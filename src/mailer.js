// 邮件发送封装。SMTP 配置从 settings 读取，授权码需先解密
const nodemailer = require('nodemailer');
const { decrypt } = require('./crypto');
const config = require('./config');

// 读取 settings 中的 SMTP 配置并构建 transport
async function buildTransport() {
  const row = await require('./db').getRow(
    'SELECT smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, sender_name, recipient_email FROM settings WHERE id = 1'
  );
  if (!row || !row.smtp_host || !row.smtp_user || !row.smtp_pass_encrypted) {
    throw new Error('SMTP 未配置，请先在系统设置中填写并保存');
  }
  const pass = decrypt(row.smtp_pass_encrypted, config.aesKey);
  return {
    transport: nodemailer.createTransport({
      host: row.smtp_host,
      port: Number(row.smtp_port),
      secure: Number(row.smtp_port) === 465, // 465 用 SSL，587 用 STARTTLS
      auth: { user: row.smtp_user, pass },
    }),
    from: `"${row.sender_name || row.smtp_user}" <${row.smtp_user}>`,
    to: row.recipient_email,
  };
}

// 发送提醒邮件；返回 nodemailer 结果对象
async function sendReminder(reminder) {
  const { transport, from, to } = await buildTransport();
  if (!to) throw new Error('未配置收件邮箱');
  const subject = `【提醒】${reminder.title}`;
  const html =
    '<div style="font-family:system-ui,sans-serif;line-height:1.8;color:#333">' +
    `<h2 style="color:#2563eb">${escapeHtml(reminder.title)}</h2>` +
    `<p>${escapeHtml(reminder.content).replace(/\n/g, '<br>')}</p>` +
    `<p style="color:#888;font-size:12px">由自动提醒服务发送，请勿直接回复</p>` +
    '</div>';
  const info = await transport.sendMail({ from, to, subject, html });
  return info;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

module.exports = { sendReminder, buildTransport, escapeHtml };
