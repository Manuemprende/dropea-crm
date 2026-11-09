import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { determineTrackingSteps, computeCustomerReliability, createTrackingService, resolveCarrierInfo } from './tracking.js';
import { createLandingFlow } from './landing-flow.js';
import { createWhatsAppInbox } from './whatsapp-inbox.js';

test('determineTrackingSteps calculates full 7-step stepper for received order', () => {
  const order = {
    id: 'test-1',
    created_at: '2026-11-08T10:00:00.000Z',
    state: 'WA_PENDING'
  };
  const { steps, pill, banner } = determineTrackingSteps(order, () => '2026-11-08T10:01:00.000Z');
  assert.equal(steps.length, 7);
  assert.equal(steps[0].key, 'received');
  assert.equal(steps[0].state, 'completed');
  assert.equal(steps[1].key, 'confirmed');
  assert.equal(steps[1].state, 'active');
  assert.equal(pill.label, 'Recibido');
  assert.equal(banner.status, 'received');
});

test('determineTrackingSteps transitions to confirmed and preparing', () => {
  const order = {
    id: 'test-2',
    created_at: '2026-11-08T10:00:00.000Z',
    confirmed_at: '2026-11-08T10:05:00.000Z',
    state: 'CUSTOMER_CONFIRMED'
  };
  const { steps, pill } = determineTrackingSteps(order, () => '2026-11-08T10:06:00.000Z');
  assert.equal(steps[0].state, 'completed');
  assert.equal(steps[1].state, 'completed');
  assert.equal(pill.label, 'Confirmado');
});

test('determineTrackingSteps handles in-transit, out for delivery and delivered', () => {
  const shippingOrder = {
    id: 'test-3',
    status: 'SHIPPING',
    sub_status: 'IN_TRANSIT'
  };
  const { pill: pShipping, banner: bShipping } = determineTrackingSteps(shippingOrder);
  assert.equal(pShipping.label, 'En tránsito');
  assert.equal(bShipping.title, 'Tu pedido va en camino');

  const deliveryOrder = {
    id: 'test-4',
    status: 'SHIPPING',
    sub_status: 'OUT_FOR_DELIVERY'
  };
  const { pill: pDelivery } = determineTrackingSteps(deliveryOrder);
  assert.equal(pDelivery.label, 'En reparto');

  const deliveredOrder = {
    id: 'test-5',
    status: 'FINISH',
    sub_status: 'DELIVERED',
    delivered_at: '2026-11-08T16:00:00.000Z'
  };
  const { steps: stepsDelivered, pill: pDelivered, banner: bDelivered } = determineTrackingSteps(deliveredOrder);
  assert.equal(pDelivered.label, 'Entregado');
  assert.equal(bDelivered.title, '¡Tu pedido ha sido entregado!');
  assert.equal(stepsDelivered[6].state, 'completed');
});

test('determineTrackingSteps handles rejected or cancelled variants', () => {
  const cancelledOrder = {
    id: 'test-6',
    state: 'CUSTOMER_CANCELLED'
  };
  const { steps, pill, banner } = determineTrackingSteps(cancelledOrder);
  assert.equal(pill.label, 'Rechazado');
  assert.equal(banner.status, 'rejected');
  assert.equal(steps[6].key, 'rejected');
  assert.equal(steps[6].state, 'failed');
});

test('computeCustomerReliability accurately scores behavior and delivery percentage', () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  createWhatsAppInbox({ db, clock });
  createLandingFlow({ db, connections: {}, request: () => {}, clock });

  // 1. New client with no history
  const relNew = computeCustomerReliability(db, '+56911112222');
  assert.equal(relNew.level, 'NEW');
  assert.equal(relNew.label, 'Cliente Nuevo');

  // 2. Client with 4 delivered orders and 1 cancelled
  for (let i = 0; i < 4; i++) {
    db.prepare(`INSERT INTO wa_orders VALUES ('o-${i}',null,null,${100+i},'CL',null,'Juan','+56999887766','Prod',1,19990,'CLP','DELIVERED','DELIVERED','delivered',null,'2026-11-01','2026-11-01','2026-11-02','2026-11-02','{}')`).run();
  }
  db.prepare(`INSERT INTO wa_orders VALUES ('o-cancel',null,null,105,'CL',null,'Juan','+56999887766','Prod',1,19990,'CLP','CANCELLED','REFUSED','cancelled',null,'2026-11-01',null,null,'2026-11-02','{}')`).run();

  const relFrequent = computeCustomerReliability(db, '+56999887766');
  assert.equal(relFrequent.completed, 5);
  assert.equal(relFrequent.delivered, 4);
  assert.equal(relFrequent.rejected, 1);
  assert.equal(relFrequent.deliveryRate, 80);
  assert.equal(relFrequent.level, 'EXCELLENT');
  assert(relFrequent.label.includes('80%'));

  db.close();
});

test('createTrackingService retrieves orders by code, id or phone', () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T15:00:00.000Z';
  const inbox = createWhatsAppInbox({ db, clock });
  const flow = createLandingFlow({ db, connections: {}, request: () => {}, clock });

  const order = flow.createTestOrder({
    name: 'Carlos Mendoza',
    phone: '+56944332211',
    productName: 'Pelota Saltarina Glow Pro',
    unitPrice: 19990
  });

  const svc = createTrackingService({ db, clock });

  // Retrieve by confirmation code
  const result1 = svc.getOrderTracking(order.confirmation_code);
  assert(result1);
  assert.equal(result1.customer.name, 'Carlos Mendoza');
  assert.equal(result1.order.productName, 'Pelota Saltarina Glow Pro');
  assert.equal(result1.tracking.steps.length, 7);

  // Retrieve by phone
  const result2 = svc.getOrderTracking('+56944332211');
  assert(result2);
  assert.equal(result2.order.id, order.id);

  // List trackable orders
  const list = svc.listTrackableOrders();
  assert.equal(list.length, 1);
  assert.equal(list[0].customerName, 'Carlos Mendoza');

  db.close();
});

test('resolveCarrierInfo detects Starken vs Blue Express correctly', () => {
  // 1. Blue Express
  const bxOrder = { shipping_company: 'Blue Express', tracking_number: 'BX-12345678' };
  const bxRes = resolveCarrierInfo(bxOrder, '12345678');
  assert.equal(bxRes.shipping_company, 'Blue Express®');
  assert.equal(bxRes.carrier_key, 'blue_express');
  assert(bxRes.tracking_url.includes('blue.cl'));

  // 2. Starken
  const starkenOrder = { courier: 'Starken', tracking_number: '987654321' };
  const skRes = resolveCarrierInfo(starkenOrder, 'ABCDEF12');
  assert.equal(skRes.shipping_company, 'Starken®');
  assert.equal(skRes.carrier_key, 'starken');
  assert(skRes.tracking_url.includes('starken.cl'));

  // 3. Fallback when not yet assigned
  const pendingOrder = {};
  const defRes = resolveCarrierInfo(pendingOrder, '78F13CA9');
  assert.equal(defRes.shipping_company, 'Blue Express®');
  assert(defRes.tracking_url.includes('78F13CA9'));
});
