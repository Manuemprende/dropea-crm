import type { Order } from './types';
export const money = (n: number, currency = 'CLP', minimumIntegerDigits = 1) => new Intl.NumberFormat('es-CL', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: currency === 'CLP' ? 0 : 2, minimumIntegerDigits }).format(n);
export const count = (n: number, minimumIntegerDigits = 1) => new Intl.NumberFormat('es-CL', { minimumIntegerDigits }).format(n);
export const dateKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export function filterPeriod(orders: Order[], period: string) {
  const today = dateKey(new Date());
  const month = today.slice(0, 7);
  const week = new Date(`${today}T12:00:00Z`); week.setUTCDate(week.getUTCDate() - 6);
  return orders.filter(o => { const day = dateKey(new Date(o.created_at)); return period === 'Todo' || (period === 'Hoy' ? day === today : period === '7 días' ? day >= dateKey(week) && day <= today : day.slice(0, 7) === month); });
}
export function group(o: Order) {
  if (['CANCELLED', 'REFUSED', 'REJECTED', 'LOST_DAMAGED', 'REFUSED_LOST_DAMAGED'].includes(o.sub_status || '')) return 'Cancelados';
  if (o.status === 'DELIVERED' || ['DELIVERED', 'PAID'].includes(o.sub_status || '')) return 'Entregados';
  if (o.status === 'SHIPPING') return 'En camino';
  if (['PROCESSING', 'CONFIRMED'].includes(o.status)) return 'En preparación';
  if (o.status === 'ERROR') return 'Con error';
  if (o.status === 'FINISH') return 'Finalizados';
  return 'Pendientes';
}
export const paidOrders = (orders: Order[]) => orders.filter(o => !['Cancelados', 'Con error'].includes(group(o)));
export const total = (orders: Order[]) => paidOrders(orders).reduce((sum, o) => sum + o.total_amount, 0);
