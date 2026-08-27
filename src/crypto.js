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
