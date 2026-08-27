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

test('monthly 当月有效则当月触发，无效日顺延月份', () => {
  const t = { type: 'monthly', time_of_day: '09:00', day_of_month: 31 };
  // 2026-08-27 起：本月(8月)有31日且未到点 → 08-31
  const next = getNextRunTime(t, dt('2026-08-27 00:00:00'));
  assert.strictEqual(next.getDate(), 31);
  assert.strictEqual(next.getMonth(), 7); // 8月
});

test('monthly 当月无该日时顺延到下一个有效月份', () => {
  const t = { type: 'monthly', time_of_day: '09:00', day_of_month: 31 };
  // 2026-09-01 起：9月无31日 → 应到 10-31
  const next = getNextRunTime(t, dt('2026-09-01 00:00:00'));
  assert.strictEqual(next.getMonth(), 9); // 10月
  assert.strictEqual(next.getDate(), 31);
});

test('daily 未设置 time_of_day 时报错', () => {
  const t = { type: 'daily' };
  assert.throws(() => getNextRunTime(t, dt('2026-08-27 00:00:00')), /time_of_day/);
});
