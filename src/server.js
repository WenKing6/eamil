// 应用入口：安全中间件 + 路由 + 静态托管 + 启动调度
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { requireAuth, csrfGuard, loginRateLimit } = require('./security');
const { ensureAdmin } = require('./routes/auth');
const authRoutes = require('./routes/auth').router;
const remindersRoutes = require('./routes/reminders');
const logsRoutes = require('./routes/logs');
const settingsRoutes = require('./routes/settings');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // 静态页内联样式，禁用 CSP 默认值以简化
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.SECURE_COOKIE === 'true', // 生产建议配合 Nginx HTTPS 设为 true
    maxAge: 7 * 24 * 3600 * 1000,
  },
}));

loginRateLimit(app, rateLimit);
app.use('/api', csrfGuard);

// 公开：登录相关
app.use('/api/auth', authRoutes);

// 需鉴权
app.use('/api/reminders', requireAuth, remindersRoutes);
app.use('/api/logs', requireAuth, logsRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);

// 静态页面（页面级路由需登录）
app.use('/login.html', express.static(path.join(__dirname, '..', 'public', 'login.html')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 其余页面重定向到登录
app.get('*', requireAuth, (req, res) => res.redirect('/index.html'));

// 统一错误处理（生产不回显堆栈）
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ ok: false, message: '服务器内部错误' });
});

async function main() {
  await ensureAdmin();
  await require('./db').query('SELECT 1'); // 验证数据库连接
  await require('./scheduler').initSchedule();
  app.listen(config.port, () => {
    console.log(`服务已启动: http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
