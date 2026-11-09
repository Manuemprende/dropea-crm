import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptConnection(connection, encryptionKey) {
  const key = Buffer.from(encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('CONNECTION_ENCRYPTION_KEY debe contener 32 bytes en Base64.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(connection), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

export function decryptConnection(value, encryptionKey) {
  const envelope = JSON.parse(value);
  if (envelope.v !== 1) throw new Error('Versión de credenciales no compatible.');
  const key = Buffer.from(encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('Clave de cifrado no válida.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decoded = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(decoded.toString('utf8'));
}
