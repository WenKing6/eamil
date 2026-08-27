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
