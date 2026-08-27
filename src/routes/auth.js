// 登录/登出/当前状态
const express = require('express');
const bcrypt = require('bcryptjs');
const { getRow } = require('../db');

const router = express.Router();

// 首次启动：若无管理员账号则用环境变量创建
async function ensureAdmin() {
  const admin = await getRow('SELECT id FROM admin LIMIT 1');
  if (!admin) {
    const config = require('../config');
    const hash = await bcrypt.hash(config.admin.password, 12);
    await require('../db').query(
      'INSERT INTO admin (username, password_hash) VALUES (?, ?)',
      [config.admin.username, hash]
    );
    console.log('[init] 已创建管理员账号');
  }
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const admin = await getRow('SELECT id, username, password_hash FROM admin WHERE username = ?', [username]);
  const ok = admin && (await bcrypt.compare(String(password || ''), admin.password_hash));
  if (!ok) {
    // 统一返回信息，不泄露用户名是否存在
    return res.status(401).json({ ok: false, message: '用户名或密码错误' });
  }
  req.session.admin = { id: admin.id, username: admin.username };
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ ok: true, admin: req.session.admin || null });
});

module.exports = { router, ensureAdmin };
