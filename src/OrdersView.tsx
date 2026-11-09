export const marketTimezones: Record<string, string> = {
  CL: 'America/Santiago',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  PT: 'Europe/Lisbon',
  MX: 'America/Mexico_City',
  CO: 'America/Bogota',
  PE: 'America/Lima'
};
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  Cube,
  Storefront,
  ArrowUpRight,
  MagnifyingGlass,
  DownloadSimple,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Package,
  ShieldWarning,
  Star,
  Warning,
  WhatsappLogo,
  ArrowClockwise
} from '@phosphor-icons/react';
import type { Order, Shop, Data } from './types';
import { group, money, dateKey } from './metrics';
import { getCustomerScore } from './customerRating';
import './orders-view.css';

export interface LocalOrder {
  id: string;
  source_name: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  currency: string;
  customer: {
    name?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    state?: string;
    province?: string;
    address_line_1?: string;
    address_line_2?: string;
    phone?: string;
    email?: string;
  };
  phone: string;
  state: string;
  error: string | null;
  remote_id: number | null;
  created_at: string;
  confirmed_at?: string;
  market?: string;
}

export interface UnifiedOrder extends Order {
  isLanding?: boolean;
  source_name?: string;
  landing_state?: string;
  landing_error?: string | null;
  raw_landing_id?: string;
  confirmed_at?: string;
  market?: string;
}

export function mapLandingToUnified(lo: LocalOrder): UnifiedOrder {
  const cust = typeof lo.customer === 'string' ? JSON.parse(lo.customer) : (lo.customer || {});
  const fullName =
    cust.name ||
    [cust.first_name, cust.last_name].filter(Boolean).join(' ') ||
    lo.phone ||
    'Cliente Landing';
  const phone = lo.phone || cust.phone || '';
  const street = cust.address_line_1 || 'Dirección por confirmar';
  const city = cust.city || 'Santiago';
  const province = cust.state || cust.province || 'Chile';

  let status = 'PENDING';
  const isConfirmed = Boolean(
    lo.confirmed_at ||
    ['CUSTOMER_CONFIRMED', 'SENT_TO_DROPEA', 'CONFIRM_PENDING', 'CREATING', 'CREATE_PENDING', 'DROPEA_ERROR'].includes(lo.state)
  );
  if (lo.state === 'CUSTOMER_CANCELLED' || lo.state === 'EXPIRED') status = 'CANCELLED';
  else if (isConfirmed) status = 'CONFIRMED';

  const orderNum = lo.remote_id ? Number(lo.remote_id) : parseInt(lo.id.slice(0, 6), 16) || 8888;

  return {
    id: orderNum,
    order_code: lo.remote_id ? `#${lo.remote_id}` : `LAND-${lo.id.slice(0, 6).toUpperCase()}`,
    status,
    sub_status: lo.state,
    total_amount: lo.quantity * lo.unit_price,
    currency: lo.currency || 'CLP',
    store_id: 9999,
    created_at: lo.created_at || new Date().toISOString(),
    confirmed_at: lo.confirmed_at,
    carrier: lo.remote_id ? 'Dropea / Blue Express' : 'Por despachar',
    shipping_company: 'Blue Express',
    tracking_number: lo.remote_id ? `BL-${lo.remote_id}` : undefined,
    shipping_address: {
      full_name: fullName,
      phone_number: phone,
      address_line_1: street,
      address_line_2: cust.address_line_2,
      city,
      province,
      email: cust.email
    },
    line_items: [
      {
        product_name: lo.product_name,
        quantity: lo.quantity,
        unit_price: lo.unit_price,
        variant_id: 0
      }
    ],
    isLanding: true,
    source_name: lo.source_name || 'Landing Directa',
    landing_state: lo.state,
    landing_error: lo.error,
    raw_landing_id: lo.id
  };
}

const landingStateLabels: Record<string, { label: string; badgeClass: string }> = {
  WA_PENDING: { label: 'WhatsApp en cola', badgeClass: 'state-pending' },
  WA_SENDING: { label: 'Enviando WhatsApp', badgeClass: 'state-transit' },
  WAITING_CONFIRMATION: { label: 'Esperando al cliente', badgeClass: 'state-pending' },
  CUSTOMER_CONFIRMED: { label: 'Cliente confirmó', badgeClass: 'state-delivered' },
  CUSTOMER_CANCELLED: { label: 'Cancelado por cliente', badgeClass: 'state-cancelled' },
  EXPIRED: { label: 'Vencido sin respuesta', badgeClass: 'state-cancelled' },
  MESSAGE_ERROR: { label: 'Error de WhatsApp', badgeClass: 'state-issue' },
  MESSAGE_UNKNOWN: { label: 'Revisar WhatsApp', badgeClass: 'state-issue' },
  CREATING: { label: 'Creando en Dropea', badgeClass: 'state-transit' },
  CREATE_PENDING: { label: 'Creación en Dropea', badgeClass: 'state-transit' },
  CONFIRMING: { label: 'Confirmando en Dropea', badgeClass: 'state-transit' },
  CONFIRM_PENDING: { label: 'Confirmando Dropea', badgeClass: 'state-transit' },
  SENT_TO_DROPEA: { label: 'Confirmado en Dropea', badgeClass: 'state-delivered' },
  DROPEA_ERROR: { label: 'Revisar en Dropea', badgeClass: 'state-issue' }
};

interface OrdersTableProps {
  orders: UnifiedOrder[];
  allOrders?: UnifiedOrder[];
  shops: Shop[];
  market?: string;
  onSelect: (o: Order) => void;
  onTrack?: (ref: string) => void;
  compact?: boolean;
  onRetryLanding?: (id: string) => void;
}

export function OrdersTable({
  orders,
  allOrders,
  shops,
  market = 'CL',
  onSelect,
  onTrack,
  compact = false,
  onRetryLanding
}: OrdersTableProps) {
  const dataset = allOrders || orders;

  if (!orders.length) {
    return (
      <div className="empty" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <Package size={38} className="muted" />
        <p>
          <strong style={{ display: 'block', fontSize: '13px', color: '#f1f5f9' }}>
            No hay pedidos en esta vista
          </strong>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Prueba cambiando los filtros de origen o estado.
          </span>
        </p>
      </div>
    );
  }

  const handleTrack = (o: UnifiedOrder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const trackRef = o.raw_landing_id || o.order_code || String(o.id) || o.shipping_address?.phone_number || '';
    if (onTrack) {
      onTrack(trackRef);
    } else {
      onSelect(o);
    }
  };

  return (
    <div className="orders-table-container">
      {/* Desktop Table View */}
      <div className="desktop-table-view">
        <table className="modern-orders-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Calificación Cliente</th>
            {!compact && <th>Dirección de Entrega</th>}
            {!compact && <th>Producto</th>}
            <th>Estado & Logística</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th style={{ textAlign: 'right' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const clientName =
              o.shipping_address?.full_name ||
              [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ') ||
              'Cliente';
            const clientPhone = o.shipping_address?.phone_number || '';
            const score = getCustomerScore(dataset, { phone: clientPhone, name: clientName });

            const streetAddress = o.shipping_address?.address_line_1 || 'Dirección por confirmar';
            const city = o.shipping_address?.city || 'Santiago';
            const province = o.shipping_address?.province || o.shipping_address?.state || 'Chile';
            const carrier = o.carrier || o.shipping_company || 'Blue Express';
            const shop = shops.find((s) => s.id === o.store_id);

            const initials = clientName
              .split(' ')
              .slice(0, 2)
              .map((n) => n[0])
              .join('')
              .toUpperCase();

            const activeTz = marketTimezones[market || 'CL'] || 'America/Santiago';
            const dateStr = new Date(o.created_at).toLocaleDateString('es-CL', {
              timeZone: activeTz,
              day: '2-digit',
              month: 'short'
            });
            const timeStr = new Date(o.created_at).toLocaleTimeString('es-CL', {
              timeZone: activeTz,
              hour: '2-digit',
              minute: '2-digit'
            });

            const landingInfo = o.landing_state ? landingStateLabels[o.landing_state] : null;

            return (
              <tr
                key={o.raw_landing_id || o.id}
                onClick={() => handleTrack(o)}
                title={`Haz clic para ver el seguimiento en vivo de ${clientName}`}
              >
                {/* ID & Origin */}
                <td>
                  <div className="order-id-cell">
                    <button
                      type="button"
                      className={`order-id-pill ${o.isLanding ? 'landing-pill' : ''}`}
                      onClick={(e) => handleTrack(o, e)}
                      title={`Seguimiento en vivo #${o.order_code || o.id}`}
                    >
                      {o.isLanding ? (
                        <WhatsappLogo size={13} weight="fill" />
                      ) : (
                        <Truck size={13} weight="bold" />
                      )}
                      {o.order_code || `#${o.id}`}
                    </button>
                    <span className="order-date-text">
                      {dateStr} · {timeStr}
                    </span>
                    {!compact && (
                      <span className="order-store-pill">
                        {o.isLanding ? (
                          <span className="landing-source-tag">
                            <WhatsappLogo size={11} weight="fill" /> {o.source_name || 'Landing'}
                          </span>
                        ) : (
                          <>
                            <Storefront size={11} /> {shop?.name || `Tienda #${o.store_id}`}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </td>

                {/* Customer */}
                <td>
                  <div className="order-customer-cell">
                    <span className={`customer-avatar avatar-${o.id % 4}`}>
                      {initials || 'CL'}
                    </span>
                    <div className="customer-details">
                      <strong className="customer-name">{clientName}</strong>
                      {clientPhone && (
                        <a
                          href={`https://wa.me/${clientPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="customer-phone"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir chat de WhatsApp"
                        >
                          <Phone size={11} /> {clientPhone}
                        </a>
                      )}
                    </div>
                  </div>
                </td>

                {/* Calificación Cliente (Columna Dedicada) */}
                <td>
                  <div className="order-rating-cell" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span
                      className={`rating-badge ${score.badgeClass}`}
                      title={score.detail}
                      style={{ padding: '0.28rem 0.65rem', fontSize: '0.74rem', fontWeight: 700 }}
                    >
                      {score.level === 'EXCELLENT' && <Star size={13} weight="fill" />}
                      {score.level === 'RISK' && <ShieldWarning size={13} weight="fill" />}
                      {score.level === 'REGULAR' && <Warning size={13} weight="bold" />}
                      {score.level === 'NEW' && <span style={{ marginRight: '2px' }}>🆕</span>}
                      {score.label}
                    </span>
                    <span className="rating-detail-sub" style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {score.detail}
                    </span>
                  </div>
                </td>

                {/* Address */}
                {!compact && (
                  <td>
                    <div className="order-address-cell">
                      <span className="order-address-street">{streetAddress}</span>
                      <span className="order-address-city">
                        <MapPin size={11} weight="fill" /> {city}, {province}
                      </span>
                    </div>
                  </td>
                )}

                {/* Product */}
                {!compact && (
                  <td>
                    <div className="order-product-cell">
                      <span className="order-product-name" title={o.line_items?.[0]?.product_name}>
                        <Cube size={13} /> {o.line_items?.[0]?.product_name || 'Sin producto'}
                      </span>
                      <span className="order-product-qty">
                        {o.line_items?.reduce((s, l) => s + l.quantity, 0) || 1} unid.
                        {(o.line_items?.length || 0) > 1 && ` (+${o.line_items!.length - 1} más)`}
                      </span>
                    </div>
                  </td>
                )}

                {/* Status & Carrier */}
                <td>
                  <div className="order-status-cell">
                    {o.isLanding ? (
                      <>
                        <span
                          className={`badge ${landingInfo?.badgeClass || 'state-pending'}`}
                        >
                          {landingInfo?.label || o.landing_state || 'Pendiente'}
                        </span>
                        <span className="carrier-tag">
                          {o.sub_status === 'SENT_TO_DROPEA' ? (
                            <>
                              <CheckCircle size={11} color="#10b981" weight="fill" /> Sincronizado Dropea
                            </>
                          ) : (
                            <>
                              <WhatsappLogo size={11} color="#25d366" weight="fill" /> WhatsApp Directo
                            </>
                          )}
                        </span>
                        {['MESSAGE_ERROR', 'MESSAGE_UNKNOWN'].includes(o.landing_state || '') &&
                          onRetryLanding &&
                          o.raw_landing_id && (
                            <button
                              type="button"
                              className="btn-retry-wa"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetryLanding(o.raw_landing_id!);
                              }}
                            >
                              <ArrowClockwise size={11} /> Reenviar WA
                            </button>
                          )}
                      </>
                    ) : (
                      <>
                        <span className="badge state-transit">{group(o)}</span>
                        <span className="carrier-tag">
                          <Truck size={11} /> {carrier}
                        </span>
                        {o.tracking_number && (
                          <span className="tracking-code-pill">{o.tracking_number}</span>
                        )}
                      </>
                    )}
                  </div>
                </td>

                {/* Total */}
                <td>
                  <div className="order-total-cell">
                    <strong className="order-total-amount">
                      {money(o.total_amount, o.currency)}
                    </strong>
                    <span className="order-total-method">Contra entrega</span>
                  </div>
                </td>

                {/* Actions */}
                <td>
                  <div className="order-actions-cell">
                    <button
                      type="button"
                      className="btn-track-action"
                      onClick={(e) => handleTrack(o, e)}
                      title={`Ir directamente al seguimiento de este pedido`}
                    >
                      <Truck size={13} weight="bold" />
                      <span>Seguimiento</span>
                    </button>
                    <button
                      type="button"
                      className="btn-drawer-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(o);
                      }}
                      title="Ver detalle del pedido"
                      aria-label={`Detalle del pedido ${o.id}`}
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Mobile Touch Cards View */}
      <div className="mobile-cards-view">
        {orders.map((o) => {
          const clientName =
            o.shipping_address?.full_name ||
            [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ') ||
            'Cliente';
          const clientPhone = o.shipping_address?.phone_number || '';
          const score = getCustomerScore(dataset, { phone: clientPhone, name: clientName });
          const streetAddress = o.shipping_address?.address_line_1 || 'Dirección por confirmar';
          const city = o.shipping_address?.city || 'Santiago';
          const carrier = o.carrier || o.shipping_company || 'Blue Express';
          const activeTz = marketTimezones[market || 'CL'] || 'America/Santiago';
          const dateStr = new Date(o.created_at).toLocaleDateString('es-CL', {
            timeZone: activeTz,
            day: '2-digit',
            month: 'short'
          });
          const timeStr = new Date(o.created_at).toLocaleTimeString('es-CL', {
            timeZone: activeTz,
            hour: '2-digit',
            minute: '2-digit'
          });
          const landingInfo = o.landing_state ? landingStateLabels[o.landing_state] : null;
          const firstLine = o.line_items?.[0];
          const prodTitle = firstLine ? `${firstLine.product_name || 'Producto'} (${firstLine.quantity || 1})` : '1 producto';

          return (
            <div
              key={o.raw_landing_id || o.id}
              className="order-mobile-card"
              onClick={() => handleTrack(o)}
            >
              <div className="order-card-top">
                <span className={`order-id-pill ${o.isLanding ? 'landing-pill' : ''}`}>
                  {o.isLanding ? <WhatsappLogo size={12} weight="fill" /> : <Truck size={12} weight="bold" />}
                  {o.order_code || `#${o.id}`}
                </span>
                <span className="order-date-text">{dateStr} · {timeStr}</span>
                {o.isLanding ? (
                  <span className={`badge ${landingInfo?.badgeClass || 'state-pending'}`} style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}>
                    {landingInfo?.label || o.status}
                  </span>
                ) : (
                  <span className="badge state-transit" style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}>
                    {group(o)}
                  </span>
                )}
              </div>

              <div className="order-card-client-row">
                <div className="order-card-client-info">
                  <strong className="order-card-client-name">{clientName}</strong>
                  {clientPhone && (
                    <a
                      href={`https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="order-card-client-phone"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={11} /> {clientPhone}
                    </a>
                  )}
                  <span className="order-card-address">{streetAddress} · {city}</span>
                </div>
                <div className="order-rating-cell">
                  <span className={`rating-badge ${score.badgeClass}`} style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {score.label}
                  </span>
                </div>
              </div>

              <div className="order-card-product-row">
                <span className="order-card-product-name">{prodTitle}</span>
                <strong className="order-card-total">{money(o.total_amount, o.currency)}</strong>
              </div>

              <div className="order-card-footer">
                <span>{carrier} · Contra entrega</span>
                <button
                  type="button"
                  className="btn-track-action"
                  onClick={(e) => handleTrack(o, e)}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                >
                  <Truck size={12} weight="bold" />
                  <span>Seguimiento ↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function exportOrders(orders: UnifiedOrder[]) {
  const escape = (s: unknown) =>
    '"' + String(s ?? '').replace(/^[=+\-@\t\r]/, '\'$&').replaceAll('"', '""') + '"';
  const csv =
    '\uFEFF' +
    [
      [
        'Pedido',
        'Origen',
        'Cliente',
        'Telefono',
        'Direccion',
        'Ciudad',
        'Estado',
        'Transportista',
        'Total',
        'Moneda',
        'Fecha'
      ],
      ...orders.map((o) => [
        o.order_code || o.id,
        o.isLanding ? `Landing: ${o.source_name || ''}` : 'Dropea/Shopify',
        o.shipping_address?.full_name || '',
        o.shipping_address?.phone_number || '',
        o.shipping_address?.address_line_1 || '',
        o.shipping_address?.city || '',
        o.landing_state || group(o),
        o.carrier || '',
        o.total_amount,
        o.currency,
        o.created_at
      ])
    ]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos-${dateKey(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface OrdersPageProps {
  orders: Order[];
  data: Data;
  market?: string;
  query: string;
  setQuery: (q: string) => void;
  onSelect: (o: Order) => void;
  onTrack?: (ref: string) => void;
}

export function OrdersPage({
  orders,
  data,
  market = 'CL',
  query,
  setQuery,
  onSelect,
  onTrack
}: OrdersPageProps) {
  const [landingOrders, setLandingOrders] = useState<LocalOrder[]>([]);
  const [originFilter, setOriginFilter] = useState<'all' | 'landings' | 'remote'>('all');
  const [activeTab, setActiveTab] = useState('Todos');
  const [selectedStore, setSelectedStore] = useState('Todas');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Load landing orders from backend
  const loadLandingOrders = async () => {
    try {
      const res = await fetch(`/api/landing-orders?market=${market}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          setLandingOrders(list);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadLandingOrders();
    const interval = setInterval(loadLandingOrders, 5000);
    return () => clearInterval(interval);
  }, [market]);

  const handleRetryLanding = async (id: string) => {
    try {
      await fetch(`/api/landing-orders/${id}/retry-message`, { method: 'POST' });
      await loadLandingOrders();
    } catch {}
  };

  // Convert and merge landing orders with remote orders
  const unifiedLandingOrders = useMemo(() => {
    return landingOrders.map(mapLandingToUnified);
  }, [landingOrders]);

  const allUnifiedOrders: UnifiedOrder[] = useMemo(() => {
    return [...unifiedLandingOrders, ...orders];
  }, [unifiedLandingOrders, orders]);

  // Track filters change to reset pagination
  const prevFilters = useRef({ query, activeTab, originFilter, selectedStore });
  useEffect(() => {
    if (
      prevFilters.current.query !== query ||
      prevFilters.current.activeTab !== activeTab ||
      prevFilters.current.originFilter !== originFilter ||
      prevFilters.current.selectedStore !== selectedStore
    ) {
      setPage(1);
      prevFilters.current = { query, activeTab, originFilter, selectedStore };
    }
  }, [query, activeTab, originFilter, selectedStore]);

  // Global KPI calculations
  const totalOrders = allUnifiedOrders.length;
  const deliveredOrders = allUnifiedOrders.filter(
    (o) => group(o) === 'Entregados' || o.landing_state === 'SENT_TO_DROPEA'
  ).length;
  const inTransitOrders = allUnifiedOrders.filter(
    (o) => group(o) === 'En camino' || o.landing_state === 'WA_SENDING' || o.landing_state === 'CREATING'
  ).length;
  const deliveryRate = totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : '0.0';

  // Find customers with rejection history
  const riskOrdersCount = useMemo(() => {
    return allUnifiedOrders.filter((o) => {
      const clientName = o.shipping_address?.full_name || '';
      const clientPhone = o.shipping_address?.phone_number || '';
      const score = getCustomerScore(allUnifiedOrders, { phone: clientPhone, name: clientName });
      return score.level === 'RISK';
    }).length;
  }, [allUnifiedOrders]);

  // Apply filters
  const filtered = useMemo(() => {
    return allUnifiedOrders.filter((o) => {
      // Origin filter
      if (originFilter === 'landings' && !o.isLanding) return false;
      if (originFilter === 'remote' && o.isLanding) return false;

      // Status Tab filter
      if (activeTab === '⚠️ Alto Riesgo') {
        const score = getCustomerScore(allUnifiedOrders, {
          phone: o.shipping_address?.phone_number,
          name: o.shipping_address?.full_name
        });
        if (score.level !== 'RISK') return false;
      } else if (activeTab === 'Pendientes') {
        if (o.isLanding) {
          if (!['WAITING_CONFIRMATION', 'WA_PENDING', 'CUSTOMER_CONFIRMED', 'CREATING'].includes(o.landing_state || '')) return false;
        } else if (group(o) !== 'Pendientes') return false;
      } else if (activeTab === 'En camino') {
        if (o.isLanding) {
          if (!['SENT_TO_DROPEA', 'CONFIRM_PENDING'].includes(o.landing_state || '')) return false;
        } else if (group(o) !== 'En camino') return false;
      } else if (activeTab === 'Entregados') {
        if (o.isLanding) {
          if (o.landing_state !== 'SENT_TO_DROPEA') return false;
        } else if (group(o) !== 'Entregados') return false;
      } else if (activeTab === 'Cancelados') {
        if (o.isLanding) {
          if (!['CUSTOMER_CANCELLED', 'EXPIRED'].includes(o.landing_state || '')) return false;
        } else if (group(o) !== 'Cancelados') return false;
      }

      // Store filter
      if (selectedStore !== 'Todas') {
        if (selectedStore === 'landings') {
          if (!o.isLanding) return false;
        } else if (String(o.store_id) !== selectedStore) {
          return false;
        }
      }

      // Search query
      if (query.trim()) {
        const q = query.toLowerCase();
        const haystack = [
          o.id,
          o.order_code,
          o.raw_landing_id,
          o.shipping_address?.full_name,
          o.shipping_address?.phone_number,
          o.shipping_address?.address_line_1,
          o.shipping_address?.city,
          o.shipping_address?.province,
          o.carrier,
          o.source_name,
          o.tracking_number,
          ...(o.line_items || []).map((l) => l.product_name)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [allUnifiedOrders, originFilter, activeTab, selectedStore, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="orders-view-wrap">
      {/* Metrics Bar */}
      <div className="orders-metrics-bar">
        <div className="orders-metric-card">
          <div className="orders-metric-info">
            <span className="orders-metric-label">Total Pedidos</span>
            <strong className="orders-metric-val">{totalOrders}</strong>
            <span className="orders-metric-sub">
              {unifiedLandingOrders.length} landings · {orders.length} tiendas
            </span>
          </div>
          <div className="orders-metric-icon blue">
            <Package size={20} weight="fill" />
          </div>
        </div>

        <div className="orders-metric-card">
          <div className="orders-metric-info">
            <span className="orders-metric-label">Tasa de Éxito / Entrega</span>
            <strong className="orders-metric-val">{deliveryRate}%</strong>
            <span className="orders-metric-sub">{deliveredOrders} procesados con éxito</span>
          </div>
          <div className="orders-metric-icon green">
            <CheckCircle size={20} weight="fill" />
          </div>
        </div>

        <div className="orders-metric-card">
          <div className="orders-metric-info">
            <span className="orders-metric-label">En Proceso / Ruta</span>
            <strong className="orders-metric-val">{inTransitOrders}</strong>
            <span className="orders-metric-sub">Coordinando despacho</span>
          </div>
          <div className="orders-metric-icon amber">
            <Truck size={20} weight="fill" />
          </div>
        </div>

        <div className="orders-metric-card">
          <div className="orders-metric-info">
            <span className="orders-metric-label">Clientes en Riesgo</span>
            <strong className="orders-metric-val">{riskOrdersCount}</strong>
            <span className="orders-metric-sub">Con rechazos previos</span>
          </div>
          <div className="orders-metric-icon rose">
            <ShieldWarning size={20} weight="fill" />
          </div>
        </div>
      </div>

      {/* Unified Master Panel */}
      <section className="orders-master-panel">
        {/* Origin Selector Tabs */}
        <div className="orders-origin-tabs">
          <button
            type="button"
            className={`origin-tab-btn ${originFilter === 'all' ? 'active' : ''}`}
            onClick={() => setOriginFilter('all')}
          >
            <span>Todos los pedidos</span>
            <span className="origin-badge-count">{allUnifiedOrders.length}</span>
          </button>
          <button
            type="button"
            className={`origin-tab-btn landing-tab ${originFilter === 'landings' ? 'active' : ''}`}
            onClick={() => setOriginFilter('landings')}
          >
            <WhatsappLogo size={15} weight="fill" />
            <span>Landings / WhatsApp</span>
            <span className="origin-badge-count">{unifiedLandingOrders.length}</span>
          </button>
          <button
            type="button"
            className={`origin-tab-btn ${originFilter === 'remote' ? 'active' : ''}`}
            onClick={() => setOriginFilter('remote')}
          >
            <Storefront size={15} />
            <span>Dropea / Tiendas</span>
            <span className="origin-badge-count">{orders.length}</span>
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="orders-filter-tabs">
          {(
            [
              'Todos',
              'Pendientes',
              'En camino',
              'Entregados',
              'Cancelados',
              '⚠️ Alto Riesgo'
            ] as const
          ).map((tab) => {
            const isRisk = tab === '⚠️ Alto Riesgo';
            return (
              <button
                key={tab}
                type="button"
                className={`orders-tab-btn ${activeTab === tab ? 'active' : ''} ${isRisk ? 'tab-risk' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tab}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Actions Toolbar */}
        <div className="table-toolbar">
          <label className="search-input">
            <MagnifyingGlass size={17} />
            <input
              aria-label="Buscar pedidos"
              placeholder="Buscar por #ID, cliente, producto..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <select
            aria-label="Filtrar por canal o tienda"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="Todas">Todas las fuentes</option>
            <option value="landings">⚡ Pedidos de Landings</option>
            {data.shops.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="button"
            onClick={() => exportOrders(filtered)}
            title="Descargar pedidos filtrados en formato CSV"
          >
            <DownloadSimple size={16} />
            <span>Exportar CSV</span>
          </button>
        </div>

        {/* Unified Orders Table */}
        <OrdersTable
          orders={paginatedOrders}
          allOrders={allUnifiedOrders}
          shops={data.shops}
          market={market}
          onSelect={onSelect}
          onTrack={onTrack}
          onRetryLanding={handleRetryLanding}
        />

        {/* Pagination */}
        <div className="pagination" style={{ padding: '12px 18px' }}>
          <span>
            {filtered.length
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} pedidos`
              : '0 pedidos'}
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <CaretLeft size={16} />
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className="icon-button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
