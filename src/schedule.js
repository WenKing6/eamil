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
      // 标准语义：当月有效则当月触发，否则顺延到下一个有效月份
      let candidate = atHM(from, task.time_of_day);
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
