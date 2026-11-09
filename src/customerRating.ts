import type { Order } from './types';
import { group } from './metrics';

export interface CustomerScore {
  total: number;
  delivered: number;
  rejected: number;
  completed: number;
  deliveryRate: number | null;
  rejectionRate: number | null;
  level: 'EXCELLENT' | 'REGULAR' | 'RISK' | 'NEW';
  label: string;
  shortLabel: string;
  badgeClass: string;
  detail: string;
}

export function getCustomerScore(
  allOrders: Order[],
  customer: { phone?: string; name?: string }
): CustomerScore {
  const normPhone = (customer.phone || '').replace(/\D/g, '');
  const normName = (customer.name || '').trim().toLowerCase();

  const matchingOrders = allOrders.filter(o => {
    if (normPhone && normPhone.length >= 7 && o.shipping_address?.phone_number) {
      const p = o.shipping_address.phone_number.replace(/\D/g, '');
      if (p.length >= 7 && (p.endsWith(normPhone) || normPhone.endsWith(p))) {
        return true;
      }
    }
    if (normName && normName.length >= 4 && o.shipping_address?.full_name) {
      const n = o.shipping_address.full_name.trim().toLowerCase();
      if (n === normName) return true;
    }
    return false;
  });

  const total = matchingOrders.length;
  let delivered = 0;
  let rejected = 0;

  for (const o of matchingOrders) {
    const grp = group(o);
    const sub = String(o.sub_status || '').toUpperCase();
    const st = String(o.status || '').toUpperCase();
    if (grp === 'Entregados' || sub === 'DELIVERED' || st === 'DELIVERED' || (st === 'FINISH' && sub !== 'CANCELLED')) {
      delivered++;
    } else if (grp === 'Cancelados' || ['CANCELLED', 'REFUSED', 'REJECTED'].includes(sub) || st === 'CANCELLED') {
      rejected++;
    }
  }

  const completed = delivered + rejected;

  if (total <= 1 && completed === 0) {
    return {
      total: Math.max(1, total),
      delivered: 0,
      rejected: 0,
      completed: 0,
      deliveryRate: null,
      rejectionRate: null,
      level: 'NEW',
      label: 'Cliente Nuevo',
      shortLabel: 'Nuevo',
      badgeClass: 'rating-badge-new',
      detail: 'Primer pedido en tu tienda'
    };
  }

  const deliveryRate = completed > 0 ? Math.round((delivered / completed) * 100) : null;
  const rejectionRate = completed > 0 ? Math.round((rejected / completed) * 100) : null;

  if (completed > 0) {
    if (rejected > 0 && (rejectionRate ?? 0) >= 40) {
      return {
        total,
        delivered,
        rejected,
        completed,
        deliveryRate,
        rejectionRate,
        level: 'RISK',
        label: `Alto Riesgo (${rejectionRate}% rechazo)`,
        shortLabel: `${rejectionRate}% Rechazo`,
        badgeClass: 'rating-badge-risk',
        detail: `${rejected} de ${completed} pedidos rechazados`
      };
    }
    if (delivered > 0 && (deliveryRate ?? 0) >= 80) {
      return {
        total,
        delivered,
        rejected,
        completed,
        deliveryRate,
        rejectionRate,
        level: 'EXCELLENT',
        label: `Confiable (${deliveryRate}% entrega)`,
        shortLabel: `${deliveryRate}% Entrega`,
        badgeClass: 'rating-badge-excellent',
        detail: `${delivered} de ${completed} pedidos entregados con éxito`
      };
    }
    return {
      total,
      delivered,
      rejected,
      completed,
      deliveryRate,
      rejectionRate,
      level: 'REGULAR',
      label: `Regular (${deliveryRate}% entrega)`,
      shortLabel: `${deliveryRate}% Entrega`,
      badgeClass: 'rating-badge-regular',
      detail: `${delivered} entregados · ${rejected} rechazados`
    };
  }

  return {
    total,
    delivered,
    rejected,
    completed,
    deliveryRate: null,
    rejectionRate: null,
    level: 'NEW',
    label: 'Cliente Nuevo',
    shortLabel: 'Nuevo',
    badgeClass: 'rating-badge-new',
    detail: `${total} pedidos en proceso`
  };
}
