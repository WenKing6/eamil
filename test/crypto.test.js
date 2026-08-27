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
