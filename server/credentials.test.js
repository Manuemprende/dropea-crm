import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptConnection, decryptConnection } from './credentials.js';

test('connection credentials are encrypted and recoverable after restart', () => {
  const key = randomBytes(32).toString('base64');
  const connection = { market: 'CL', apiKey: 'server-api-key-only', secret: 'signing-secret-only' };
  const encoded = encryptConnection(connection, key);
  assert.ok(!encoded.includes(connection.apiKey));
  assert.ok(!encoded.includes(connection.secret));
  assert.deepEqual(decryptConnection(encoded, key), connection);
  assert.notEqual(encryptConnection(connection, key), encoded);
  assert.throws(() => decryptConnection(encoded, randomBytes(32).toString('base64')));
  const tampered = JSON.parse(encoded); tampered.tag = randomBytes(16).toString('base64');
  assert.throws(() => decryptConnection(JSON.stringify(tampered), key));
  assert.throws(() => encryptConnection(connection, 'invalid'));
});
