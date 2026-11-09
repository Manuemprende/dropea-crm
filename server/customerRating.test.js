import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test customer scoring logic directly
function computeCustomerRating(orders, { phone, name }) {
  const normPhone = (phone || '').replace(/\D/g, '');
  const normName = (name || '').trim().toLowerCase();

  const matching = orders.filter(o => {
    if (normPhone && normPhone.length >= 7 && o.shipping_address?.phone_number) {
      const p = o.shipping_address.phone_number.replace(/\D/g, '');
      if (p.length >= 7 && (p.endsWith(normPhone) || normPhone.endsWith(p))) return true;
    }
    if (normName && normName.length >= 4 && o.shipping_address?.full_name) {
      const n = o.shipping_address.full_name.trim().toLowerCase();
      if (n === normName) return true;
    }
    return false;
  });

  const total = matching.length;
  let delivered = 0;
  let rejected = 0;

  for (const o of matching) {
    const sub = String(o.sub_status || '').toUpperCase();
    const st = String(o.status || '').toUpperCase();
    if (st === 'DELIVERED' || sub === 'DELIVERED' || (st === 'FINISH' && sub !== 'CANCELLED')) {
      delivered++;
    } else if (['CANCELLED', 'REFUSED', 'REJECTED'].includes(sub) || st === 'CANCELLED') {
      rejected++;
    }
  }

  const completed = delivered + rejected;
  const deliveryRate = completed > 0 ? Math.round((delivered / completed) * 100) : null;
  const rejectionRate = completed > 0 ? Math.round((rejected / completed) * 100) : null;

  if (total <= 1 && completed === 0) {
    return { level: 'NEW', label: 'Cliente Nuevo' };
  }
  if (completed > 0) {
    if (rejected > 0 && rejectionRate >= 40) {
      return { level: 'RISK', label: `Alto Riesgo (${rejectionRate}% rechazo)` };
    }
    if (delivered > 0 && deliveryRate >= 80) {
      return { level: 'EXCELLENT', label: `Confiable (${deliveryRate}% entrega)` };
    }
    return { level: 'REGULAR', label: `Regular (${deliveryRate}% entrega)` };
  }
  return { level: 'NEW', label: 'Cliente Nuevo' };
}

test('customer rating marks 100% delivered repeat customer as EXCELLENT', () => {
  const orders = [
    { id: 1, status: 'DELIVERED', shipping_address: { full_name: 'Juan Perez', phone_number: '+56911223344' } },
    { id: 2, status: 'FINISH', sub_status: 'DELIVERED', shipping_address: { full_name: 'Juan Perez', phone_number: '+56911223344' } }
  ];
  const rating = computeCustomerRating(orders, { phone: '+56911223344', name: 'Juan Perez' });
  assert.equal(rating.level, 'EXCELLENT');
  assert.match(rating.label, /100% entrega/);
});

test('customer rating marks repeat canceller as RISK', () => {
  const orders = [
    { id: 1, status: 'CANCELLED', shipping_address: { full_name: 'Maria Gomez', phone_number: '+56999887766' } },
    { id: 2, status: 'FINISH', sub_status: 'CANCELLED', shipping_address: { full_name: 'Maria Gomez', phone_number: '+56999887766' } }
  ];
  const rating = computeCustomerRating(orders, { phone: '+56999887766', name: 'Maria Gomez' });
  assert.equal(rating.level, 'RISK');
  assert.match(rating.label, /Alto Riesgo/);
});

test('customer rating marks new single-order customer as NEW', () => {
  const orders = [
    { id: 1, status: 'PENDING', shipping_address: { full_name: 'Carlos Ruiz', phone_number: '+56955443322' } }
  ];
  const rating = computeCustomerRating(orders, { phone: '+56955443322', name: 'Carlos Ruiz' });
  assert.equal(rating.level, 'NEW');
  assert.equal(rating.label, 'Cliente Nuevo');
});
