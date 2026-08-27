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
