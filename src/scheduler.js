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
