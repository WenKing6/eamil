# 自动邮件提醒网站 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个支持每天/每周/每月/单次提醒、按计划自动发送邮件的网站，部署到云服务器。

**Architecture:** Node.js + Express 单体服务（静态页面 + REST API），MySQL 存储，node-cron 每分钟扫描到期任务，nodemailer 经 SMTP（163/QQ）发信。安全重点：参数化查询防 SQL 注入、bcrypt 密码、会话鉴权、限流、CSRF、AES-256 加密存储 SMTP 授权码。Docker Compose 一键部署（含 MySQL，`restart: always`）。

**Tech Stack:** express、mysql2、nodemailer、node-cron、bcryptjs、express-session、helmet、express-rate-limit、express-validator、dotenv；测试用 Node 内置 `node:test`；部署用 Docker Compose。

**测试命令：** `node --test test/`

---

## 文件结构

```
自动提醒解放/
├── package.json
├── .gitignore
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── sql/init.sql                     # 建表脚本（Docker 初始化）
├── src/
│   ├── server.js                    # 入口：中间件、路由、静态托管、启动调度
│   ├── config.js                    # 环境变量集中读取
│   ├── db.js                        # MySQL 连接池 + 参数化查询封装
│   ├── crypto.js                    # AES-256-GCM 加密/解密
│   ├── schedule.js                  # 纯函数：计算下次运行时间
│   ├── mailer.js                    # nodemailer 发信封装
│   ├── security.js                  # 会话鉴权中间件 + CSRF + 校验
│   └── routes/
│       ├── auth.js                  # 登录/登出
│       ├── reminders.js             # 任务 CRUD + 测试发送
│       ├── logs.js                  # 发送日志
│       └── settings.js              # SMTP 配置 + 测试邮件
├── public/
│   ├── login.html
│   ├── index.html                   # 提醒管理
│   ├── logs.html                    # 发送日志
│   ├── settings.html                # 系统设置
│   ├── css/style.css
│   └── js/api.js                    # fetch 封装 + 鉴权跳转
│       ├── login.js
│       ├── reminders.js
│       ├── logs.js
│       └── settings.js
└── test/
    ├── crypto.test.js
    ├── schedule.test.js
    └── validation.test.js
```

---

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "auto-reminder-email",
  "version": "1.0.0",
  "private": true,
  "description": "自动邮件提醒网站",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "express-session": "^1.18.0",
    "express-validator": "^7.2.0",
    "helmet": "^7.1.0",
    "mysql2": "^3.11.0",
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.14"
  }
}
```

- [ ] **Step 2: 创建 .gitignore**

```gitignore
node_modules/
.env
*.log
.DS_Store
```

- [ ] **Step 3: 创建 .env.example（所有变量有默认值说明）**

```bash
# 服务端口
PORT=3000

# MySQL 连接
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=reminder
DB_PASSWORD=change-me
DB_NAME=reminder_app

# AES 密钥：必须为 32 字节 hex（64 个十六进制字符）
# 生成方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AES_KEY=

# 会话签名密钥（任意长随机串）
SESSION_SECRET=change-me-session-secret

# 管理员初始账号（首次启动自动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-admin-password
```

- [ ] **Step 4: 创建 src/config.js**

```js
// 环境变量集中读取，所有必填项缺失时给出明确报错
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量: ${name}，请检查 .env 文件`);
  return v;
}

const config = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'reminder_app',
  },
  // AES 密钥为 32 字节 hex；解析失败直接报错，避免静默降级
  get aesKey() {
    const hex = required('AES_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('AES_KEY 必须为 64 位十六进制字符（32 字节）');
    }
    return Buffer.from(hex, 'hex');
  },
  sessionSecret: required('SESSION_SECRET'),
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
};

module.exports = config;
```

- [ ] **Step 5: 安装依赖并验证 config 可加载**

Run: `npm install`
Expected: 无报错，`node_modules` 生成

Run: `node -e "require('./src/config')"`（无 .env 时会报缺 AES_KEY，属预期；创建 .env 后再验证）
Expected: 报错信息为「缺少环境变量: AES_KEY」即证明 config 逻辑正常

- [ ] **Step 6: 提交（如用户要求启用 git 时执行）**

```bash
git init
git add package.json .gitignore .env.example src/config.js
git commit -m "chore: 项目初始化与配置模块"
```

---

### Task 2: 数据库层（防 SQL 注入）

**Files:**
- Create: `sql/init.sql`
- Create: `src/db.js`

- [ ] **Step 1: 创建 sql/init.sql（建表 + 最小权限账号）**

```sql
-- 建库（Docker 环境下 MYSQL_DATABASE 已自动创建，此处确保幂等）
CREATE DATABASE IF NOT EXISTS reminder_app
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE reminder_app;

CREATE TABLE IF NOT EXISTS admin (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  type ENUM('one_time','daily','weekly','monthly') NOT NULL,
  trigger_time DATETIME NULL,              -- 单次：完整时间
  time_of_day VARCHAR(5) NOT NULL DEFAULT '09:00', -- 周期：HH:mm
  weekday TINYINT UNSIGNED NULL,           -- weekly: 0(周日)-6
  day_of_month TINYINT UNSIGNED NULL,      -- monthly: 1-31
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  next_run_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_next_run (enabled, next_run_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS send_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reminder_id INT UNSIGNED NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('success','failed') NOT NULL,
  error VARCHAR(500) NULL,
  INDEX idx_reminder (reminder_id),
  CONSTRAINT fk_logs_reminder FOREIGN KEY (reminder_id)
    REFERENCES reminders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  smtp_host VARCHAR(255) NOT NULL DEFAULT '',
  smtp_port INT UNSIGNED NOT NULL DEFAULT 465,
  smtp_user VARCHAR(255) NOT NULL DEFAULT '',
  smtp_pass_encrypted TEXT NULL,           -- AES-256-GCM 密文
  sender_name VARCHAR(100) NOT NULL DEFAULT '',
  recipient_email VARCHAR(255) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id;
```

- [ ] **Step 2: 创建 src/db.js（全部参数化查询）**

```js
// 数据库连接池。所有 SQL 一律使用 ? 占位符 + 参数数组，杜绝字符串拼接
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  decimalNumbers: true,
});

// 统一查询入口：只接受参数化 SQL
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getRow(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// 事务封装（发送任务时更新状态与写日志需原子性）
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, getRow, transaction };
```

- [ ] **Step 3: 校验 SQL 无字符串拼接风险**

Run: `grep -rn "concat\|template.*SELECT\|'SELECT" src/db.js`
Expected: 无输出（db.js 中不存在拼接 SQL 的写法）

- [ ] **Step 4: 提交（如需）**

```bash
git add sql/init.sql src/db.js
git commit -m "feat: 数据库初始化脚本与参数化查询封装"
```

---

### Task 3: AES 加密模块 + 单元测试

**Files:**
- Create: `src/crypto.js`
- Create: `test/crypto.test.js`

- [ ] **Step 1: 编写失败的测试**

```js
// test/crypto.test.js
const test = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt } = require('../src/crypto');
const config = require('../src/config');

const KEY = Buffer.from('a'.repeat(64), 'hex'); // 测试密钥，32字节

test('加密后可解密还原原文', () => {
  const cipher = encrypt('smtp-auth-code-123', KEY);
  assert.notStrictEqual(cipher, 'smtp-auth-code-123');
  assert.strictEqual(decrypt(cipher, KEY), 'smtp-auth-code-123');
});

test('不同密钥无法解密', () => {
  const cipher = encrypt('secret', KEY);
  const otherKey = Buffer.from('b'.repeat(64), 'hex');
  assert.throws(() => decrypt(cipher, otherKey), /解密失败|Unsupported state/);
});

test('密文格式为 iv:tag:data 三段', () => {
  const cipher = encrypt('x', KEY);
  assert.strictEqual(cipher.split(':').length, 3);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/crypto.test.js`
Expected: FAIL（Cannot find module '../src/crypto'）

- [ ] **Step 3: 实现 src/crypto.js**

```js
// AES-256-GCM 对称加密：用于 SMTP 授权码落库前的加密
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

// 返回 iv:tag:ciphertext 的 hex 拼接串
function encrypt(plainText, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload, key) {
  try {
    const [ivHex, tagHex, dataHex] = String(payload).split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('密文格式错误');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('解密失败：密钥错误或数据被篡改');
  }
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/crypto.test.js`
Expected: PASS（3 项全部通过）

- [ ] **Step 5: 提交（如需）**

```bash
git add src/crypto.js test/crypto.test.js
git commit -m "feat: AES-256-GCM 加密模块与测试"
```

---

### Task 4: 下次运行时间计算（纯函数）+ 单元测试

**Files:**
- Create: `src/schedule.js`
- Create: `test/schedule.test.js`

- [ ] **Step 1: 编写失败的测试**

```js
// test/schedule.test.js
const test = require('node:test');
const assert = require('node:assert');
const { getNextRunTime } = require('../src/schedule');

function dt(str) { return new Date(str); }

test('one_time 返回 trigger_time', () => {
  const t = { type: 'one_time', trigger_time: dt('2026-09-01 10:00:00') };
  assert.strictEqual(getNextRunTime(t, dt('2026-08-27 00:00:00')).getTime(),
    dt('2026-09-01 10:00:00').getTime());
});

test('one_time 已过期返回 null', () => {
  const t = { type: 'one_time', trigger_time: dt('2026-09-01 10:00:00') };
  assert.strictEqual(getNextRunTime(t, dt('2026-09-02 00:00:00')), null);
});

test('daily 今天未到时返回今天，已过返回明天', () => {
  const t = { type: 'daily', time_of_day: '10:00' };
  assert.strictEqual(getNextRunTime(t, dt('2026-08-27 09:00:00')).getHours(), 10);
  assert.strictEqual(getNextRunTime(t, dt('2026-08-27 10:30:00')).getDate(),
    dt('2026-08-28').getDate());
});

test('weekly 返回下一个匹配的星期', () => {
  // 2026-08-27 是周四；指定周一(1)
  const t = { type: 'weekly', time_of_day: '09:00', weekday: 1 };
  const next = getNextRunTime(t, dt('2026-08-27 00:00:00'));
  assert.strictEqual(next.getDay(), 1); // 周一
  assert.strictEqual(next.getDate(), dt('2026-08-31').getDate());
});

test('monthly 返回下一个匹配的日期，无效日顺延月份', () => {
  const t = { type: 'monthly', time_of_day: '09:00', day_of_month: 31 };
  // 2026-08-27 起：下个月(9月)无31日，应到 10-31
  const next = getNextRunTime(t, dt('2026-08-27 00:00:00'));
  assert.strictEqual(next.getDate(), 31);
  assert.strictEqual(next.getMonth(), 9); // 10月
});

test('daily 未设置 time_of_day 时报错', () => {
  const t = { type: 'daily' };
  assert.throws(() => getNextRunTime(t, dt('2026-08-27 00:00:00')), /time_of_day/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/schedule.test.js`
Expected: FAIL（Cannot find module '../src/schedule'）

- [ ] **Step 3: 实现 src/schedule.js**

```js
// 纯函数：计算任务的下次运行时间，返回 Date 或 null（单次已过期）
// 注意：所有日期基于服务器本地时区（云服务器应设为 Asia/Shanghai）

function parseHM(timeOfDay) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(timeOfDay));
  if (!m) throw new Error(`time_of_day 格式错误: ${timeOfDay}`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

function atHM(base, timeOfDay) {
  const { h, m } = parseHM(timeOfDay);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function daysInMonth(y, mo) {
  return new Date(y, mo + 1, 0).getDate();
}

function getNextRunTime(task, from) {
  switch (task.type) {
    case 'one_time': {
      const t = new Date(task.trigger_time);
      if (t.getTime() <= new Date(from).getTime()) return null;
      return t;
    }
    case 'daily': {
      let next = atHM(from, task.time_of_day);
      if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
      return next;
    }
    case 'weekly': {
      const targetDow = Number(task.weekday);
      let next = atHM(from, task.time_of_day);
      let diff = (targetDow - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + diff);
      if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 7);
      return next;
    }
    case 'monthly': {
      let targetDay = Number(task.day_of_month);
      let candidate = atHM(from, task.time_of_day);
      // 若本月该日无效，或时间已过，则向后找有效月份
      for (let i = 0; i < 48; i++) {
        const dim = daysInMonth(candidate.getFullYear(), candidate.getMonth());
        if (targetDay > dim) {
          candidate.setDate(1);
          candidate.setMonth(candidate.getMonth() + 1);
          continue;
        }
        const d = new Date(candidate);
        d.setDate(targetDay);
        if (d.getTime() > from.getTime()) return d;
        candidate.setDate(1);
        candidate.setMonth(candidate.getMonth() + 1);
      }
      return null; // 48 个月内找不到（理论不会发生）
    }
    default:
      throw new Error(`未知任务类型: ${task.type}`);
  }
}

module.exports = { getNextRunTime };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/schedule.test.js`
Expected: PASS（6 项全部通过）

- [ ] **Step 5: 提交（如需）**

```bash
git add src/schedule.js test/schedule.test.js
git commit -m "feat: 调度时间计算纯函数与测试"
```

---

### Task 5: 邮件发送模块

**Files:**
- Create: `src/mailer.js`

- [ ] **Step 1: 实现 src/mailer.js**

```js
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
```

- [ ] **Step 2: 验证语法正确**

Run: `node -e "require('./src/mailer')"`
Expected: 无报错输出

---

### Task 6: 安全与鉴权中间件

**Files:**
- Create: `src/security.js`
- Create: `test/validation.test.js`

- [ ] **Step 1: 编写输入校验的失败测试**

```js
// test/validation.test.js
const test = require('node:test');
const assert = require('node:assert');
const { validateReminder, validateSettings } = require('../src/security');

const body = (data) => ({ body: data });

test('合法单次任务通过校验', async () => {
  const result = await validateReminder(body({
    title: '开会', content: '下午三点开会',
    type: 'one_time', trigger_time: '2026-09-01 10:00:00',
  }));
  assert.strictEqual(result.ok, true);
});

test('缺失标题失败', async () => {
  const result = await validateReminder(body({
    title: '', content: 'x', type: 'daily', time_of_day: '09:00',
  }));
  assert.strictEqual(result.ok, false);
});

test('非法 type 失败', async () => {
  const result = await validateReminder(body({
    title: 't', content: 'x', type: 'hourly',
  }));
  assert.strictEqual(result.ok, false);
});

test('非法邮箱失败', async () => {
  const result = await validateSettings(body({
    recipient_email: 'not-an-email',
  }));
  assert.strictEqual(result.ok, false);
});

test('非法 time_of_day 失败', async () => {
  const result = await validateReminder(body({
    title: 't', content: 'x', type: 'daily', time_of_day: '25:99',
  }));
  assert.strictEqual(result.ok, false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/validation.test.js`
Expected: FAIL（Cannot find module '../src/security'）

- [ ] **Step 3: 实现 src/security.js**

```js
// 安全中间件：会话鉴权、CSRF、限流、输入校验
const { body, validationResult } = require('express-validator');

// ---- 会话鉴权 ----
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.path.startsWith('/api/')) {
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/validation.test.js`
Expected: PASS（5 项全部通过）

- [ ] **Step 5: 提交（如需）**

```bash
git add src/security.js test/validation.test.js
git commit -m "feat: 安全中间件（鉴权/CSRF/限流/校验）与测试"
```

---

### Task 7: API 路由（认证、提醒、日志、设置）

**Files:**
- Create: `src/routes/auth.js`
- Create: `src/routes/reminders.js`
- Create: `src/routes/logs.js`
- Create: `src/routes/settings.js`

- [ ] **Step 1: 实现 src/routes/auth.js**

```js
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
```

- [ ] **Step 2: 实现 src/routes/reminders.js**

```js
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
```

- [ ] **Step 3: 实现 src/routes/logs.js**

```js
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
```

- [ ] **Step 4: 实现 src/routes/settings.js**

```js
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
```

- [ ] **Step 5: 语法校验全部路由**

Run: `node -e "require('./src/routes/auth');require('./src/routes/reminders');require('./src/routes/logs');require('./src/routes/settings')"`
Expected: 无报错输出

- [ ] **Step 6: 提交（如需）**

```bash
git add src/routes
git commit -m "feat: 认证/提醒/日志/设置 API 路由"
```

---

### Task 8: 调度器与服务器入口

**Files:**
- Create: `src/scheduler.js`
- Create: `src/server.js`

- [ ] **Step 1: 实现 src/scheduler.js**

```js
// 调度器：每分钟扫描到期任务并发送，事务内更新 next_run_at + 写日志
const cron = require('node-cron');
const { query, transaction } = require('./db');
const { getNextRunTime } = require('./schedule');
const { sendReminder } = require('./mailer');

let running = false;

async function tick() {
  if (running) return; // 防止重入
  running = true;
  try {
    const now = new Date();
    const due = await query(
      'SELECT * FROM reminders WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? LIMIT 50',
      [now]
    );
    for (const task of due) {
      await sendOne(task, now);
    }
  } catch (err) {
    console.error('[scheduler] 扫描失败:', err.message);
  } finally {
    running = false;
  }
}

async function sendOne(task, now) {
  const nextRun = getNextRunTime(task, now);
  try {
    await sendReminder(task);
    await transaction(async (conn) => {
      await conn.execute(
        'UPDATE reminders SET next_run_at = ? WHERE id = ?',
        [nextRun, task.id]
      );
      await conn.execute(
        'INSERT INTO send_logs (reminder_id, status) VALUES (?, ?)',
        [task.id, 'success']
      );
    });
    console.log(`[mail] 已发送: ${task.title}`);
  } catch (err) {
    console.error(`[mail] 发送失败: ${task.title} - ${err.message}`);
    await transaction(async (conn) => {
      await conn.execute(
        'UPDATE reminders SET next_run_at = ? WHERE id = ?',
        [nextRun, task.id]
      );
      await conn.execute(
        'INSERT INTO send_logs (reminder_id, status, error) VALUES (?, ?, ?)',
        [task.id, 'failed', String(err.message).slice(0, 500)]
      );
    });
  }
}

// 启动时：为所有启用任务重算 next_run_at，保证不因重启漏发/重复
async function initSchedule() {
  const tasks = await query('SELECT * FROM reminders WHERE enabled = 1');
  const now = new Date();
  for (const t of tasks) {
    const next = getNextRunTime(t, now);
    await query('UPDATE reminders SET next_run_at = ? WHERE id = ?', [next, t.id]);
  }
  cron.schedule('* * * * *', tick); // 每分钟
  console.log('[scheduler] 调度器已启动');
}

module.exports = { initSchedule, tick, sendOne };
```

- [ ] **Step 2: 实现 src/server.js**

```js
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
    secure: false, // 生产建议配合 Nginx HTTPS 设为 true
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
```

- [ ] **Step 3: 启动服务验证可运行**

Run（需先创建 .env 并确保本机 MySQL 可达，或直接用 docker compose 起 MySQL）:
`npm start`
Expected: 输出「服务已启动」与「调度器已启动」；无异常退出

- [ ] **Step 4: 提交（如需）**

```bash
git add src/scheduler.js src/server.js
git commit -m "feat: 调度器与服务器入口"
```

---

### Task 9: 前端页面

**Files:**
- Create: `public/login.html`
- Create: `public/index.html`
- Create: `public/logs.html`
- Create: `public/settings.html`
- Create: `public/css/style.css`
- Create: `public/js/api.js`
- Create: `public/js/login.js`
- Create: `public/js/reminders.js`
- Create: `public/js/logs.js`
- Create: `public/js/settings.js`

- [ ] **Step 1: 实现 public/css/style.css（简洁现代、移动端适配）**

```css
:root {
  --bg: #f5f7fb; --card: #ffffff; --primary: #2563eb; --text: #1f2937;
  --muted: #6b7280; --border: #e5e7eb; --danger: #dc2626; --success: #16a34a;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg); color: var(--text);
}
.container { max-width: 960px; margin: 0 auto; padding: 16px; }
.card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 16px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px;
  background: #fff; color: var(--text); font-size: 14px; cursor: pointer;
  transition: background .2s, box-shadow .2s, transform .1s;
}
.btn:hover { background: #f3f4f6; }
.btn:active { transform: scale(.97); }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn-primary:hover { background: #1d4ed8; }
.btn-danger { color: var(--danger); border-color: #fecaca; }
.btn-danger:hover { background: #fef2f2; }
.input, select, textarea {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; font-family: inherit; background: #fff; color: var(--text);
}
.input:focus, select:focus, textarea:focus { outline: 2px solid var(--primary); outline-offset: -1px; border-color: transparent; }
label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 6px; }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
.table th { color: var(--muted); font-weight: 500; font-size: 13px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.badge-on { background: #dcfce7; color: var(--success); }
.badge-off { background: #f3f4f6; color: var(--muted); }
.badge-fail { background: #fee2e2; color: var(--danger); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.nav { display: flex; gap: 4px; flex-wrap: wrap; }
.nav a {
  padding: 8px 14px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 14px;
}
.nav a.active { background: #e0e7ff; color: var(--primary); font-weight: 500; }
/* 提示 toast：统一 5 秒 */
.toast-wrap { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 99; display: flex; flex-direction: column; gap: 8px; width: min(90vw, 360px); }
.toast { padding: 12px 16px; border-radius: 8px; color: #fff; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.15); animation: slideDown .25s ease; }
.toast-success { background: var(--success); }
.toast-error { background: var(--danger); }
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
.modal { background: #fff; border-radius: 12px; padding: 20px; width: min(92vw, 480px); max-height: 90vh; overflow-y: auto; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 140px; }
.empty { text-align: center; color: var(--muted); padding: 40px 0; }
@media (max-width: 640px) {
  .table { display: block; overflow-x: auto; white-space: nowrap; }
}
```

- [ ] **Step 2: 实现 public/js/api.js（fetch 封装 + 鉴权跳转 + toast）**

```js
// 统一请求封装：携带 CSRF 头、处理 401 跳登录、统一 toast
async function api(path, options = {}) {
  const opts = { ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) } };
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login.html'; throw new Error('未登录'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.errors?.join('；') || '请求失败');
  return data;
}

function toast(message, type = 'success') {
  const wrap = document.querySelector('.toast-wrap') || (() => {
    const el = document.createElement('div');
    el.className = 'toast-wrap';
    document.body.appendChild(el);
    return el;
  })();
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 5000); // 固定 5 秒
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 3: 实现 public/login.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>登录 - 自动邮件提醒</title>
<link rel="stylesheet" href="/css/style.css">
<style>
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .login-card { width: min(92vw, 360px); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
</style>
</head>
<body>
<div class="login-wrap">
  <div class="card login-card">
    <h1>自动邮件提醒</h1>
    <p class="sub">请登录以管理提醒任务</p>
    <label>用户名</label>
    <input class="input" id="username" autocomplete="username" placeholder="请输入用户名">
    <label>密码</label>
    <input class="input" id="password" type="password" autocomplete="current-password" placeholder="请输入密码">
    <div style="margin-top:20px">
      <button class="btn btn-primary" id="loginBtn" style="width:100%">登 录</button>
    </div>
  </div>
</div>
<div class="toast-wrap"></div>
<script src="/js/api.js"></script>
<script src="/js/login.js"></script>
</body>
</html>
```

- [ ] **Step 4: 实现 public/js/login.js**

```js
async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) return toast('请输入用户名和密码', 'error');
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    location.href = '/index.html';
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
```

- [ ] **Step 5: 实现 public/index.html（提醒管理）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>提醒管理 - 自动邮件提醒</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="container">
  <div class="topbar">
    <h2 style="margin:0">提醒管理</h2>
    <div class="nav">
      <a href="/index.html" class="active">提醒</a>
      <a href="/logs.html">日志</a>
      <a href="/settings.html">设置</a>
      <a href="#" id="logoutBtn">退出</a>
    </div>
  </div>
  <div class="card" style="display:flex;justify-content:flex-end">
    <button class="btn btn-primary" id="addBtn">+ 新建提醒</button>
  </div>
  <div class="card">
    <div id="listWrap"><div class="empty">加载中…</div></div>
  </div>
</div>

<!-- 新建/编辑弹窗 -->
<div class="modal-mask" id="modal" style="display:none">
  <div class="modal">
    <h3 id="modalTitle" style="margin:0 0 4px">新建提醒</h3>
    <label>标题</label>
    <input class="input" id="f-title" maxlength="200">
    <label>内容</label>
    <textarea class="input" id="f-content" rows="4" maxlength="2000"></textarea>
    <label>类型</label>
    <select class="input" id="f-type">
      <option value="daily">每天</option>
      <option value="weekly">每周</option>
      <option value="monthly">每月</option>
      <option value="one_time">单次</option>
    </select>
    <div id="periodFields">
      <label>时间 (HH:mm)</label>
      <input class="input" id="f-time" placeholder="09:00">
    </div>
    <div id="weekField" style="display:none">
      <label>星期</label>
      <select class="input" id="f-weekday">
        <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option>
        <option value="4">周四</option><option value="5">周五</option><option value="6">周六</option>
        <option value="0">周日</option>
      </select>
    </div>
    <div id="monthField" style="display:none">
      <label>每月第几天 (1-31)</label>
      <input class="input" id="f-day" type="number" min="1" max="31">
    </div>
    <div id="onceField" style="display:none">
      <label>触发时间 (YYYY-MM-DD HH:mm:ss)</label>
      <input class="input" id="f-once" placeholder="2026-09-01 10:00:00">
    </div>
    <div class="row" style="margin-top:20px">
      <button class="btn" id="cancelBtn">取消</button>
      <button class="btn btn-primary" id="saveBtn">保存</button>
    </div>
  </div>
</div>
<div class="toast-wrap"></div>
<script src="/js/api.js"></script>
<script src="/js/reminders.js"></script>
</body>
</html>
```

- [ ] **Step 6: 实现 public/js/reminders.js**

```js
let editingId = null;

const TYPE_LABEL = { daily: '每天', weekly: '每周', monthly: '每月', one_time: '单次' };

function renderTypeInfo(t) {
  if (t.type === 'daily') return t.time_of_day;
  if (t.type === 'weekly') return `周${'日一二三四五六'[t.weekday]} ${t.time_of_day}`;
  if (t.type === 'monthly') return `每月${t.day_of_month}日 ${t.time_of_day}`;
  return t.trigger_time;
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
          <td style="color:var(--muted)">${t.next_run_at ? esc(String(t.next_run_at).replace('T', ' ')) : '—'}</td>
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

// openModal 的完整实现见下一步（含新建/编辑分支）
```

- [ ] **Step 7: 完善 reminders.js 的弹窗逻辑（追加到文件末尾）**

```js
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
    document.getElementById('f-once').value = (t.trigger_time || '').replace('T', ' ');
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
```

- [ ] **Step 8: 实现 public/logs.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>发送日志 - 自动邮件提醒</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="container">
  <div class="topbar">
    <h2 style="margin:0">发送日志</h2>
    <div class="nav">
      <a href="/index.html">提醒</a>
      <a href="/logs.html" class="active">日志</a>
      <a href="/settings.html">设置</a>
      <a href="#" id="logoutBtn">退出</a>
    </div>
  </div>
  <div class="card">
    <label style="margin-top:0">按任务筛选</label>
    <select class="input" id="filter" style="max-width:300px"><option value="">全部</option></select>
  </div>
  <div class="card" id="logCard"><div class="empty">加载中…</div></div>
</div>
<div class="toast-wrap"></div>
<script src="/js/api.js"></script>
<script src="/js/logs.js"></script>
</body>
</html>
```

- [ ] **Step 9: 实现 public/js/logs.js**

```js
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
          <td style="color:var(--muted)">${esc(String(l.sent_at).replace('T', ' '))}</td>
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
```

- [ ] **Step 10: 实现 public/settings.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>系统设置 - 自动邮件提醒</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="container">
  <div class="topbar">
    <h2 style="margin:0">系统设置</h2>
    <div class="nav">
      <a href="/index.html">提醒</a>
      <a href="/logs.html">日志</a>
      <a href="/settings.html" class="active">设置</a>
      <a href="#" id="logoutBtn">退出</a>
    </div>
  </div>
  <div class="card">
    <h3 style="margin:0 0 4px">SMTP 邮件配置</h3>
    <p class="sub" style="color:var(--muted);font-size:13px;margin:0 0 8px">
      163：smtp.163.com:465 | QQ：smtp.qq.com:465（均用授权码，非登录密码）
    </p>
    <label>SMTP 服务器</label>
    <input class="input" id="s-host" placeholder="smtp.qq.com">
    <label>端口</label>
    <input class="input" id="s-port" type="number" placeholder="465">
    <label>发件邮箱</label>
    <input class="input" id="s-user" placeholder="you@qq.com">
    <label>授权码（留空则不修改）</label>
    <input class="input" id="s-pass" type="password" placeholder="已保存为 ***" autocomplete="new-password">
    <label>发件人名称</label>
    <input class="input" id="s-name" placeholder="自动提醒">
    <label>收件邮箱（所有提醒发往此处）</label>
    <input class="input" id="s-recipient" placeholder="receiver@example.com">
    <div class="row" style="margin-top:20px">
      <button class="btn" id="testBtn">发送测试邮件</button>
      <button class="btn btn-primary" id="saveBtn">保存设置</button>
    </div>
  </div>
</div>
<div class="toast-wrap"></div>
<script src="/js/api.js"></script>
<script src="/js/settings.js"></script>
</body>
</html>
```

- [ ] **Step 11: 实现 public/js/settings.js**

```js
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
```

- [ ] **Step 12: 人工冒烟测试**

Run: `npm start`，浏览器访问 `http://localhost:3000`
Expected: 跳转登录页 → 用 .env 中管理员账号登录 → 新建提醒 → 列表可见 → 进入设置保存 SMTP 并发送测试邮件

- [ ] **Step 13: 提交（如需）**

```bash
git add public/
git commit -m "feat: 前端页面（登录/提醒/日志/设置）"
```

---

### Task 10: Docker 一键部署

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: 实现 Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
```

- [ ] **Step 2: 实现 docker-compose.yml**

```yaml
version: "3.8"

services:
  db:
    image: mysql:8
    restart: always
    environment:
      MYSQL_DATABASE: reminder_app
      MYSQL_USER: reminder
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      TZ: Asia/Shanghai
    command: --default-authentication-plugin=mysql_native_password
    volumes:
      - db_data:/var/lib/mysql
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    build: .
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      PORT: 3000
      DB_HOST: db
      DB_PORT: 3306
      DB_USER: reminder
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: reminder_app
      AES_KEY: ${AES_KEY}
      SESSION_SECRET: ${SESSION_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      TZ: Asia/Shanghai
    ports:
      - "3000:3000"

volumes:
  db_data:
```

- [ ] **Step 3: 本机构建验证**

Run: `docker compose config`
Expected: 输出完整配置且无语法错误

- [ ] **Step 4: 云服务器部署文档化（写入 README，仅当用户要求）**

服务器上流程：安装 Docker → 上传项目 → `cp .env.example .env` 并填好密钥 → `docker compose up -d` → 浏览器访问 `http://服务器IP:3000`

- [ ] **Step 5: 提交（如需）**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker 一键部署配置"
```

---

### Task 11: 收尾自检

**Files:**
- Modify: `src/security.js` 等（按自检结果）

- [ ] **Step 1: 全量运行测试**

Run: `node --test test/`
Expected: 全部 PASS（crypto 3 项、schedule 6 项、validation 5 项）

- [ ] **Step 2: SQL 注入静态检查**

Run: `grep -rn "SELECT.*\${\|WHERE.*\${\|INSERT.*\${" src/`
Expected: 无输出（所有 SQL 均参数化）

- [ ] **Step 3: 敏感信息检查**

Run: `grep -rn "password_hash\|smtp_pass" src/ public/ | grep -v "encrypted\|password_hash\|req.body\|body(" | head`
Expected: 前端无明文授权码；后端仅加密后落库

- [ ] **Step 4: 最终提交（如需）**

```bash
git add .
git commit -m "chore: 收尾自检与清理"
```
