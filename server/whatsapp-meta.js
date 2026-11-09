/**
 * WhatsApp Business Cloud API (Meta Official) Integration
 * Dropea CRM - Wentix AI Community Edition
 */

export function createMetaWhatsAppManager({ db, clock = () => new Date().toISOString() }) {
  // Initialize table
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_meta_credentials (
      id TEXT PRIMARY KEY,
      access_token TEXT,
      phone_number_id TEXT,
      waba_id TEXT,
      verified_name TEXT,
      display_phone_number TEXT,
      quality_rating TEXT,
      code_verification_status TEXT,
      status TEXT,
      updated_at TEXT
    )
  `);

  function mask(token, head = 6, tail = 4) {
    if (!token || typeof token !== 'string') return '';
    if (token.length <= head + tail) return '********';
    return `${token.slice(0, head)}...${token.slice(-tail)}`;
  }

  function getCredentials() {
    const row = db.prepare('SELECT * FROM whatsapp_meta_credentials WHERE id = ?').get('default');
    if (!row) {
      return {
        configured: false,
        phoneNumberId: '',
        wabaId: '',
        tokenPreview: '',
        verifiedName: '',
        displayPhoneNumber: '',
        qualityRating: '',
        codeVerificationStatus: '',
        status: 'disconnected',
        updatedAt: null
      };
    }

    return {
      configured: Boolean(row.access_token && row.phone_number_id),
      phoneNumberId: row.phone_number_id || '',
      wabaId: row.waba_id || '',
      tokenPreview: mask(row.access_token),
      verifiedName: row.verified_name || '',
      displayPhoneNumber: row.display_phone_number || '',
      qualityRating: row.quality_rating || '',
      codeVerificationStatus: row.code_verification_status || '',
      status: row.status || 'configured',
      updatedAt: row.updated_at
    };
  }

  async function verifyConnection({ accessToken, phoneNumberId, wabaId }) {
    if (!accessToken) throw new Error('Debes ingresar un Access Token de Meta.');
    if (!phoneNumberId) throw new Error('Debes ingresar el Phone Number ID de WhatsApp Cloud API.');

    const cleanPhoneId = String(phoneNumberId).trim();
    const cleanToken = String(accessToken).trim();

    // 1. Verify Phone Number ID via Meta Graph API v20.0
    const phoneUrl = `https://graph.facebook.com/v20.0/${cleanPhoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,platform_type&access_token=${cleanToken}`;
    const phoneRes = await fetch(phoneUrl);
    const phoneData = await phoneRes.json();

    if (phoneData.error) {
      const msg = phoneData.error.message || 'Error al conectar con Meta Graph API';
      const type = phoneData.error.type || 'OAuthException';
      throw new Error(`Meta API: ${msg} (${type})`);
    }

    let wabaData = null;
    if (wabaId) {
      const cleanWabaId = String(wabaId).trim();
      const wabaUrl = `https://graph.facebook.com/v20.0/${cleanWabaId}?fields=id,name,timezone_id,message_template_namespace&access_token=${cleanToken}`;
      const wabaRes = await fetch(wabaUrl);
      wabaData = await wabaRes.json();
      if (wabaData.error) {
        // Warning: Phone valid but WABA issue
        console.warn('WABA ID verification warning:', wabaData.error.message);
      }
    }

    return {
      valid: true,
      verifiedName: phoneData.verified_name || '',
      displayPhoneNumber: phoneData.display_phone_number || '',
      qualityRating: phoneData.quality_rating || 'UNKNOWN',
      codeVerificationStatus: phoneData.code_verification_status || '',
      wabaName: wabaData?.name || null
    };
  }

  async function saveCredentials({ accessToken, phoneNumberId, wabaId }) {
    const cleanPhoneId = String(phoneNumberId || '').trim();
    const cleanWabaId = String(wabaId || '').trim();
    const cleanToken = String(accessToken || '').trim();

    const existing = db.prepare('SELECT access_token FROM whatsapp_meta_credentials WHERE id = ?').get('default');
    const tokenToUse = cleanToken || existing?.access_token || '';

    if (!tokenToUse) throw new Error('El Access Token de Meta es requerido.');
    if (!cleanPhoneId) throw new Error('El Phone Number ID es requerido.');

    // Live validation against Meta
    const metaVerification = await verifyConnection({
      accessToken: tokenToUse,
      phoneNumberId: cleanPhoneId,
      wabaId: cleanWabaId
    });

    const now = clock();
    db.prepare(`
      INSERT INTO whatsapp_meta_credentials (
        id, access_token, phone_number_id, waba_id,
        verified_name, display_phone_number, quality_rating, code_verification_status,
        status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        phone_number_id = excluded.phone_number_id,
        waba_id = excluded.waba_id,
        verified_name = excluded.verified_name,
        display_phone_number = excluded.display_phone_number,
        quality_rating = excluded.quality_rating,
        code_verification_status = excluded.code_verification_status,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      'default',
      tokenToUse,
      cleanPhoneId,
      cleanWabaId,
      metaVerification.verifiedName,
      metaVerification.displayPhoneNumber,
      metaVerification.qualityRating,
      metaVerification.codeVerificationStatus,
      'connected',
      now
    );

    return {
      success: true,
      ...metaVerification,
      updatedAt: now
    };
  }

  async function sendTestMessage({ recipientPhone, messageText = 'Mensaje de prueba de Dropea CRM (Meta Cloud API Oficial)' }) {
    const creds = db.prepare('SELECT * FROM whatsapp_meta_credentials WHERE id = ?').get('default');
    if (!creds || !creds.access_token || !creds.phone_number_id) {
      throw new Error('Primero debes guardar y verificar las credenciales de Meta Cloud API.');
    }

    if (!recipientPhone) {
      throw new Error('Ingresa un número de teléfono de destino (formato internacional con código de país, ej: +56912345678).');
    }

    const cleanPhone = String(recipientPhone).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
      throw new Error('Número de teléfono inválido.');
    }

    const url = `https://graph.facebook.com/v20.0/${creds.phone_number_id}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`Meta API error: ${data.error.message} (Código ${data.error.code})`);
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id || null,
      recipient: cleanPhone
    };
  }

  return {
    getCredentials,
    verifyConnection,
    saveCredentials,
    sendTestMessage
  };
}
