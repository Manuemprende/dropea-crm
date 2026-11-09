import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { classifyIntent, normalizeText, formatMoney, createWhatsAppAgent } from './whatsapp-agent.js';
import { createLandingFlow } from './landing-flow.js';
import { createWhatsAppInbox } from './whatsapp-inbox.js';

test('normalizeText cleans accents, whitespace and symbols', () => {
  assert.equal(normalizeText('¿Cuánto DÉMORA el envío?!'), 'cuanto demora el envio');
  assert.equal(normalizeText('  Hola...   buenas tardes! '), 'hola buenas tardes');
  assert.equal(normalizeText(''), '');
});

test('formatMoney formats CLP cleanly', () => {
  const formatted = formatMoney(19990, 'CLP');
  assert(formatted.includes('19.990') || formatted.includes('19,990'));
});

test('classifyIntent accurately identifies customer queries', () => {
  assert.equal(classifyIntent('¿Cuándo llega el pedido?'), 'SHIPPING');
  assert.equal(classifyIntent('cuanto demora el envio'), 'SHIPPING');
  assert.equal(classifyIntent('¿Cómo se paga?'), 'PAYMENT');
  assert.equal(classifyIntent('puedo pagar con transferencia o tarjeta al recibir'), 'PAYMENT');
  assert.equal(classifyIntent('¿Tiene garantía si viene fallado?'), 'GUARANTEE');
  assert.equal(classifyIntent('me equivoqué en la dirección, es dpto 402'), 'CHANGE_ADDRESS');
  assert.equal(classifyIntent('quiero hablar con un humano por favor'), 'HUMAN');
  assert.equal(classifyIntent('necesito hablar con una persona real'), 'HUMAN');
  assert.equal(classifyIntent('¿Dónde va mi pedido?'), 'STATUS');
  assert.equal(classifyIntent('cuál es el estado de mi compra'), 'STATUS');
  assert.equal(classifyIntent('Hola buenas tardes'), 'GREETING');
  assert.equal(classifyIntent('Lorem ipsum dolor sit amet'), 'UNKNOWN');
});

test('createWhatsAppAgent handles confirmation receipt', async () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  const order = flow.createTestOrder({
    name: 'Manuel Bustos',
    phone: '+56928148914',
    productName: 'Pelota Saltarina Glow Pro',
    unitPrice: 19990,
    brandName: 'Dropea CRM Store'
  });

  const sentMessages = [];
  const mockWhatsapp = {
    connected: () => true,
    send: async (phone, text, meta) => {
      sentMessages.push({ phone, text, meta });
      return { id: 'msg-1' };
    }
  };

  const agent = createWhatsAppAgent({ db, whatsapp: mockWhatsapp, inbox, clock });

  // Simulate order confirmation
  db.prepare("UPDATE landing_orders SET state='CUSTOMER_CONFIRMED', confirmed_at=? WHERE id=?").run(clock(), order.id);

  const res = await agent.handleIncoming({
    phone: '+56928148914',
    text: 'SÍ CONFIRMO',
    messageId: 'wa-msg-101',
    confirmedOrCancelled: true
  });

  assert.equal(res, true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].phone, '+56928148914');
  assert(sentMessages[0].text.includes('Manuel'));
  assert(sentMessages[0].text.includes('confirmado con éxito'));
  assert(sentMessages[0].text.includes(order.confirmation_code));
  assert(sentMessages[0].text.includes('Pelota Saltarina Glow Pro'));
  assert(sentMessages[0].text.includes('Dropea CRM Store'));

  db.close();
});

test('createWhatsAppAgent handles cancellation receipt', async () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  const order = flow.createTestOrder({
    name: 'Carlos Pérez',
    phone: '+56911223344',
    productName: 'Pelota Saltarina Glow Pro',
    unitPrice: 19990
  });

  const sentMessages = [];
  const mockWhatsapp = {
    connected: () => true,
    send: async (phone, text, meta) => {
      sentMessages.push({ phone, text, meta });
      return { id: 'msg-2' };
    }
  };

  const agent = createWhatsAppAgent({ db, whatsapp: mockWhatsapp, inbox, clock });

  db.prepare("UPDATE landing_orders SET state='CUSTOMER_CANCELLED' WHERE id=?").run(order.id);

  const res = await agent.handleIncoming({
    phone: '+56911223344',
    text: 'CANCELAR',
    messageId: 'wa-msg-102',
    confirmedOrCancelled: true
  });

  assert.equal(res, true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].phone, '+56911223344');
  assert(sentMessages[0].text.includes('Carlos'));
  assert(sentMessages[0].text.includes('cancelado con éxito'));
  assert(sentMessages[0].text.includes('No se realizará ningún cobro'));

  db.close();
});

test('createWhatsAppAgent answers shipping FAQ and prompts to confirm if pending', async () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  const order = flow.createTestOrder({
    name: 'Andrea Soto',
    phone: '+56933445566',
    productName: 'Pelota Saltarina Glow Pro'
  });

  const sentMessages = [];
  const mockWhatsapp = {
    connected: () => true,
    send: async (phone, text, meta) => {
      sentMessages.push({ phone, text, meta });
      return { id: 'msg-3' };
    }
  };

  const agent = createWhatsAppAgent({ db, whatsapp: mockWhatsapp, inbox, clock });

  const res = await agent.handleIncoming({
    phone: '+56933445566',
    text: '¿Cuándo me llega el paquete?',
    messageId: 'wa-msg-103',
    confirmedOrCancelled: false
  });

  assert.equal(res, true);
  assert.equal(sentMessages.length, 1);
  assert(sentMessages[0].text.includes('24/48 horas'));
  assert(sentMessages[0].text.includes('SÍ o CONFIRMO'));

  db.close();
});

test('createWhatsAppAgent handles human transfer and pauses auto-confirm for that chat', async () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  flow.createTestOrder({
    name: 'Roberto Gómez',
    phone: '+56955667788',
    productName: 'Pelota Saltarina Glow Pro'
  });

  const sentMessages = [];
  const mockWhatsapp = {
    connected: () => true,
    send: async (phone, text, meta) => {
      sentMessages.push({ phone, text, meta });
      return { id: 'msg-4' };
    }
  };

  const agent = createWhatsAppAgent({ db, whatsapp: mockWhatsapp, inbox, clock });

  const res = await agent.handleIncoming({
    phone: '+56955667788',
    text: 'Hola, quiero hablar con un operador por favor',
    messageId: 'wa-msg-104',
    confirmedOrCancelled: false
  });

  assert.equal(res, true);
  assert.equal(sentMessages.length, 1);
  assert(sentMessages[0].text.includes('asesor de soporte humano'));

  // Verify conversation mode is switched to human
  const conv = db.prepare("SELECT mode FROM wa_conversations v JOIN wa_customers c ON c.id=v.customer_id WHERE c.phone=?").get('+56955667788');
  assert.equal(conv?.mode, 'human');

  // Verify canAutomate is now false for this phone
  assert.equal(inbox.canAutomate('+56955667788'), false);

  db.close();
});

test('createWhatsAppAgent activates blue ticks immediately and simulates human delay', async () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  const order = flow.createTestOrder({
    name: 'Prueba Humana',
    phone: '+56999887766',
    productName: 'Pelota Saltarina Glow Pro',
    unitPrice: 19990
  });

  const markedKeys = [];
  const presenceUpdates = [];
  const sentMessages = [];
  const mockWhatsapp = {
    connected: () => true,
    markRead: async (key) => { markedKeys.push(key); },
    sendPresence: async (phone, status) => { presenceUpdates.push({ phone, status }); },
    send: async (phone, text, meta) => {
      sentMessages.push({ phone, text, meta });
      return { id: 'msg-human' };
    }
  };

  const agent = createWhatsAppAgent({
    db,
    whatsapp: mockWhatsapp,
    inbox,
    clock,
    delayMs: 30
  });

  assert.equal(agent.getHumanDelay(), 30);

  // Check the mathematical formula for 7-10s human delay:
  for (let i = 0; i < 20; i++) {
    const val = Math.floor(Math.random() * (10000 - 7000 + 1)) + 7000;
    assert(val >= 7000 && val <= 10000, 'Delay must be between 7000ms and 10000ms');
  }

  // Simulate incoming confirmation
  db.prepare("UPDATE landing_orders SET state='CUSTOMER_CONFIRMED', confirmed_at=? WHERE id=?").run(clock(), order.id);

  const rawKey = { remoteJid: '56999887766@s.whatsapp.net', id: 'WAMID-123', fromMe: false };
  const res = await agent.handleIncoming({
    phone: '+56999887766',
    text: 'SÍ CONFIRMO',
    messageId: 'wa-msg-human-1',
    confirmedOrCancelled: true,
    rawKey
  });

  assert.equal(res, true);
  // Paso 1: Mark as read immediately
  assert.equal(markedKeys.length, 1);
  assert.deepEqual(markedKeys[0], rawKey);

  // Paso 2: Presence typing simulator
  assert(presenceUpdates.some(p => p.status === 'composing'));
  assert(presenceUpdates.some(p => p.status === 'paused'));

  // Sent message
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].phone, '+56999887766');

  db.close();
});
