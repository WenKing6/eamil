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
