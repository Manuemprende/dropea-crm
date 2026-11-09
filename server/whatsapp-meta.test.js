import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createMetaWhatsAppManager } from './whatsapp-meta.js';

test('WhatsApp Meta Cloud API Manager - saves credentials and queries status', async () => {
  const db = new DatabaseSync(':memory:');
  const metaManager = createMetaWhatsAppManager({ db, clock: () => '2026-11-09T10:00:00.000Z' });

  // 1. Initial status disconnected
  const initial = metaManager.getCredentials();
  assert.equal(initial.configured, false);
  assert.equal(initial.status, 'disconnected');

  // Mock global fetch for testing
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('104598234857211')) {
      return {
        ok: true,
        json: async () => ({
          verified_name: 'Dropea Store Official',
          display_phone_number: '+56 9 8765 4321',
          quality_rating: 'GREEN',
          code_verification_status: 'VERIFIED'
        })
      };
    }
    if (url.includes('109823471029384')) {
      return {
        ok: true,
        json: async () => ({
          id: '109823471029384',
          name: 'Wentix WABA'
        })
      };
    }
    return {
      ok: false,
      json: async () => ({
        error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 }
      })
    };
  };

  try {
    // 2. Save credentials with mocked Meta response
    const saved = await metaManager.saveCredentials({
      accessToken: 'EAAB1234567890abcdefghijklmnopqrstuvwxyz',
      phoneNumberId: '104598234857211',
      wabaId: '109823471029384'
    });

    assert.equal(saved.success, true);
    assert.equal(saved.verifiedName, 'Dropea Store Official');
    assert.equal(saved.displayPhoneNumber, '+56 9 8765 4321');
    assert.equal(saved.qualityRating, 'GREEN');

    // 3. Status is now configured and masked
    const updated = metaManager.getCredentials();
    assert.equal(updated.configured, true);
    assert.equal(updated.phoneNumberId, '104598234857211');
    assert.equal(updated.wabaId, '109823471029384');
    assert.equal(updated.verifiedName, 'Dropea Store Official');
    assert.equal(updated.status, 'connected');
    assert(updated.tokenPreview.includes('...'));
  } finally {
    global.fetch = originalFetch;
  }
});
