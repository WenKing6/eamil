// 安全中间件：会话鉴权、CSRF、限流、输入校验
const { body, validationResult } = require('express-validator');

// ---- 会话鉴权 ----
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  // 注意：在 app.use('/api/xxx', requireAuth, ...) 中挂载时，Express 会移除挂载前缀，
  // 导致 req.path 变为剩余部分（如 '/'）。必须用 req.originalUrl（完整原始路径）判断。
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ ok: false, message: '未登录或会话已过期' });
  }
  return res.redirect('/login.html');
}

// ---- CSRF 防护：要求状态变更请求携带自定义头（配合 SameSite=Strict Cookie）----
function csrfGuard(req, res, next) {
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (unsafe.includes(req.method) && req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ ok: false, message: 'CSRF 校验失败' });
  }
  next();
}

// ---- 登录限流 ----
function loginRateLimit(app, rateLimit) {
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: '尝试次数过多，请 15 分钟后再试' },
  }));
}

// ---- 输入校验规则（返回 { ok, errors }）----
const TIME_HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const reminderChain = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('标题长度 1-200'),
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('内容长度 1-2000'),
  body('type').isIn(['one_time', 'daily', 'weekly', 'monthly']).withMessage('类型不合法'),
  body('trigger_time').optional({ values: 'falsy' }).matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).withMessage('单次时间格式应为 YYYY-MM-DD HH:mm:ss'),
  body('time_of_day').optional({ values: 'falsy' }).matches(TIME_HM).withMessage('时间格式应为 HH:mm'),
  body('weekday').optional({ values: 'falsy' }).isInt({ min: 0, max: 6 }).withMessage('星期 0-6'),
  body('day_of_month').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('日期 1-31'),
  body('enabled').optional().isBoolean().withMessage('enabled 应为布尔值'),
];

const settingsChain = [
  body('smtp_host').trim().isLength({ max: 255 }).optional({ values: 'falsy' }),
  body('smtp_port').optional({ values: 'falsy' }).isInt({ min: 1, max: 65535 }).withMessage('端口不合法'),
  body('smtp_user').trim().isEmail().withMessage('发件邮箱格式错误').optional({ values: 'falsy' }),
  body('smtp_pass').isLength({ max: 200 }).optional({ values: 'falsy' }).withMessage('授权码过长'),
  body('sender_name').trim().isLength({ max: 100 }).optional({ values: 'falsy' }),
  body('recipient_email').trim().isEmail().withMessage('收件邮箱格式错误').optional({ values: 'falsy' }),
];

async function validateChain(chains, req) {
  await Promise.all(chains.map((c) => c.run(req)));
  const errors = validationResult(req).array().map((e) => e.msg);
  return errors.length ? { ok: false, errors } : { ok: true };
}

const validateReminder = (req) => validateChain(reminderChain, req);
const validateSettings = (req) => validateChain(settingsChain, req);

module.exports = {
  requireAuth, csrfGuard, loginRateLimit,
  validateReminder, validateSettings,
};
