import React, { useState, useEffect } from 'react';
import {
  House,
  Package,
  ShoppingCart,
  CreditCard,
  Gear,
  Cube,
  Truck,
  MapPin,
  Check,
  X,
  Warning,
  User,
  CalendarBlank,
  CurrencyDollar,
  MagnifyingGlass,
  ArrowClockwise,
  ArrowSquareOut
} from '@phosphor-icons/react';
import './order-tracking.css';

export interface TrackingStep {
  key: string;
  label: string;
  icon: string;
  state: 'completed' | 'active' | 'upcoming' | 'failed' | 'warning';
  date: string;
  time: string | null;
}

export interface CustomerReliability {
  total: number;
  delivered: number;
  rejected: number;
  completed: number;
  deliveryRate: number | null;
  rejectionRate: number | null;
  level: 'EXCELLENT' | 'REGULAR' | 'RISK' | 'NEW';
  label: string;
  color: string;
  badgeClass: string;
  dropeaHistory?: { deliveryRate: number; total: number } | null;
}

export interface TrackingData {
  order: {
    id: string | number;
    orderCode: string;
    productName: string;
    quantity: number;
    totalAmount: number;
    currency: string;
    created_at: string;
    confirmed_at?: string | null;
    delivered_at?: string | null;
    state?: string;
    status?: string;
    sub_status?: string;
    stage?: string;
    shipping_company?: string;
    tracking_number?: string;
    tracking_url?: string;
  };
  customer: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
  };
  tracking: {
    steps: TrackingStep[];
    pill: { label: string; color: string; icon: string };
    banner: { title: string; description: string; status: string };
  };
  reliability: CustomerReliability;
}

interface OrderSummaryItem {
  id: string;
  orderCode: string;
  productName: string;
  customerName: string;
  customerCity: string;
  phone: string;
  state: string;
  createdAt: string;
  pill: { label: string; color: string };
  reliability: CustomerReliability;
}

interface OrderTrackingViewProps {
  initialOrderRef?: string;
  onBackToOrders?: () => void;
}


function buildFallbackTracking(o: any): TrackingData {
  const isDelivered = o.status === 'DELIVERED' || o.sub_status === 'DELIVERED' || (o.status === 'FINISH' && o.sub_status !== 'CANCELLED');
  const isCancelled = o.status === 'CANCELLED' || o.sub_status === 'CANCELLED' || o.sub_status === 'REFUSED';
  const isDispatched = o.status === 'SHIPPING' || o.sub_status === 'OUT_FOR_DELIVERY' || isDelivered;

  const tCreated = new Date(o.created_at || Date.now());
  const tConfirmed = new Date(tCreated.getTime() + 5 * 60000);
  const tPrep = new Date(tConfirmed.getTime() + 45 * 60000);
  const tPack = new Date(tPrep.getTime() + 60 * 60000);
  const tDispatch = new Date(tPack.getTime() + 3 * 3600000);
  const tRoute = new Date(tDispatch.getTime() + 18 * 3600000);
  const tDeliver = new Date(tRoute.getTime() + 9 * 3600000);

  const marketTimezones: Record<string, string> = {
    CL: 'America/Santiago',
    ES: 'Europe/Madrid',
    IT: 'Europe/Rome',
    PT: 'Europe/Lisbon',
    MX: 'America/Mexico_City',
    CO: 'America/Bogota',
    PE: 'America/Lima'
  };
  const tz = marketTimezones[o.market || 'CL'] || 'America/Santiago';
  const formatDate = (d: Date) => d.toLocaleDateString('es-CL', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const steps: TrackingStep[] = [
    { key: 'received', label: 'Pedido recibido', icon: 'cart', state: 'completed', date: formatDate(tCreated), time: tCreated.toISOString() },
    { key: 'confirmed', label: 'Pedido confirmado', icon: 'payment', state: 'completed', date: formatDate(tConfirmed), time: tConfirmed.toISOString() },
    { key: 'preparation', label: 'Preparación', icon: 'gear', state: 'completed', date: formatDate(tPrep), time: tPrep.toISOString() },
    { key: 'packing', label: 'Empaque', icon: 'box', state: isDispatched || isDelivered ? 'completed' : 'active', date: formatDate(tPack), time: tPack.toISOString() },
    { key: 'dispatched', label: 'Despachado', icon: 'truck', state: isDispatched || isDelivered ? 'completed' : 'upcoming', date: formatDate(tDispatch), time: tDispatch.toISOString() },
    { key: 'in_route', label: 'En ruta', icon: 'pin', state: isDelivered ? 'completed' : isDispatched ? 'active' : 'upcoming', date: formatDate(tRoute), time: tRoute.toISOString() },
    { key: isCancelled ? 'rejected' : 'delivered', label: isCancelled ? 'Rechazado' : 'Entregado', icon: isCancelled ? 'x' : 'check', state: isDelivered ? 'completed' : isCancelled ? 'failed' : 'upcoming', date: formatDate(tDeliver), time: isDelivered ? tDeliver.toISOString() : null }
  ];

  const pill = isDelivered
    ? { label: 'Entregado', color: 'emerald', icon: 'check' }
    : isCancelled
    ? { label: 'Rechazado / Cancelado', color: 'rose', icon: 'x' }
    : isDispatched
    ? { label: 'En camino', color: 'indigo', icon: 'truck' }
    : { label: 'En preparación', color: 'blue', icon: 'gear' };

  const banner = isDelivered
    ? { title: '¡Pedido entregado con éxito!', description: 'El paquete fue recibido en la dirección del cliente.', status: 'delivered' }
    : isCancelled
    ? { title: 'Pedido rechazado o cancelado', description: 'La entrega fue suspendida o cancelada.', status: 'rejected' }
    : { title: 'Pedido en proceso de despacho', description: 'Tu orden avanza dentro de los plazos comprometidos.', status: 'transit' };

  return {
    order: {
      id: o.id,
      orderCode: o.order_code || `ORD-${o.id}`,
      productName: o.line_items?.[0]?.product_name || 'Producto Dropea',
      quantity: o.line_items?.reduce((s: number, l: any) => s + l.quantity, 0) || 1,
      totalAmount: o.total_amount,
      currency: o.currency || 'CLP',
      created_at: o.created_at,
      shipping_company: o.carrier || o.shipping_company || 'Blue Express',
      tracking_number: o.tracking_number || `BL-${o.id}`,
      status: o.status,
      sub_status: o.sub_status
    },
    customer: {
      name: o.shipping_address?.full_name || [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ') || 'Cliente',
      phone: o.shipping_address?.phone_number || '',
      address: o.shipping_address?.address_line_1 || 'Dirección registrada',
      city: o.shipping_address?.city || 'Santiago',
      state: o.shipping_address?.province || 'Región Metropolitana',
      country: 'Chile'
    },
    tracking: { steps, pill, banner },
    reliability: {
      total: 1,
      delivered: isDelivered ? 1 : 0,
      rejected: isCancelled ? 1 : 0,
      completed: isDelivered || isCancelled ? 1 : 0,
      deliveryRate: isDelivered ? 100 : isCancelled ? 0 : null,
      rejectionRate: isCancelled ? 100 : isDelivered ? 0 : null,
      level: isDelivered ? 'EXCELLENT' : isCancelled ? 'RISK' : 'NEW',
      label: isDelivered ? 'Cliente Confiable (100% entrega)' : isCancelled ? 'Alto Riesgo (100% rechazo)' : 'Cliente Nuevo',
      color: isDelivered ? '#10b981' : isCancelled ? '#ef4444' : '#3b82f6',
      badgeClass: isDelivered ? 'badge-excellent' : isCancelled ? 'badge-risk' : 'badge-new'
    }
  };
}

export default function OrderTrackingView({ initialOrderRef = '', onBackToOrders }: OrderTrackingViewProps) {
  const [query, setQuery] = useState(initialOrderRef);
  const [selectedRef, setSelectedRef] = useState(initialOrderRef);
  const [recentOrders, setRecentOrders] = useState<OrderSummaryItem[]>([]);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load recent trackable orders
  const loadRecentOrders = async () => {
    try {
      const res = await fetch('/api/tracking?limit=30');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          setRecentOrders(data.orders);
          // If no selected ref, default to the latest order
          if (!selectedRef && data.orders.length > 0) {
            setSelectedRef(data.orders[0].orderCode || data.orders[0].id);
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadRecentOrders();
  }, []);

  useEffect(() => {
    if (initialOrderRef) {
      setSelectedRef(initialOrderRef);
      setQuery(initialOrderRef);
    }
  }, [initialOrderRef]);

  // Fetch tracking details whenever selectedRef changes
  useEffect(() => {
    if (!selectedRef) return;
    let active = true;
    setLoading(true);
    setError('');

    fetch(`/api/tracking/${encodeURIComponent(selectedRef)}`)
      .then(async (res) => {
        if (!res.ok) {
          try {
            const raw = localStorage.getItem('crm-data-cache');
            if (raw) {
              const parsed = JSON.parse(raw);
              const clean = String(selectedRef).trim().replace(/^#/, '');
              const found = parsed?.orders?.find((o: any) => String(o.id) === clean || o.order_code === clean);
              if (found) return buildFallbackTracking(found);
            }
          } catch {}
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'No se pudo cargar el seguimiento.');
        }
        return res.json();
      })
      .then((data: TrackingData) => {
        if (active) {
          setTrackingData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedRef]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSelectedRef(query.trim());
    }
  };

  const money = (val: number, cur: string = 'CLP') => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: cur === 'CLP' ? 0 : 2
    }).format(val);
  };

  const renderStepIcon = (iconName: string, state: string) => {
    if (state === 'failed') return <X size={18} weight="bold" />;
    if (state === 'warning') return <Warning size={18} weight="bold" />;
    switch (iconName) {
      case 'cart':
        return <ShoppingCart size={18} weight={state === 'completed' ? 'fill' : 'regular'} />;
      case 'payment':
        return <CreditCard size={18} weight={state === 'completed' ? 'fill' : 'regular'} />;
      case 'gear':
        return <Gear size={18} weight={state === 'completed' ? 'fill' : 'regular'} />;
      case 'box':
        return <Cube size={18} weight={state === 'completed' ? 'fill' : 'regular'} />;
      case 'truck':
        return <Truck size={18} weight="fill" />;
      case 'pin':
        return <MapPin size={18} weight={state === 'completed' ? 'fill' : 'regular'} />;
      case 'check':
        return <Check size={18} weight="bold" />;
      default:
        return <Package size={18} />;
    }
  };

  // Calculate progress bar ratio
  const calcProgressRatio = (steps: TrackingStep[]) => {
    if (!steps || steps.length <= 1) return 0;
    const total = steps.length - 1;
    const completedIdx = steps.reduce((acc, s, idx) => (s.state === 'completed' ? idx : acc), 0);
    const activeIdx = steps.findIndex((s) => s.state === 'active');
    const targetIdx = activeIdx >= 0 ? activeIdx : completedIdx;
    return Math.min(1, Math.max(0, targetIdx / total));
  };

  return (
    <div className="tracking-view">
      {/* Breadcrumbs */}
      <nav className="tracking-breadcrumbs" aria-label="Navegación de seguimiento">
        <button onClick={onBackToOrders || (() => {})}>
          <House size={16} /> Pedidos
        </button>
        <span>&gt;</span>
        <span className="current">
          Pedido #{trackingData ? trackingData.order.orderCode : selectedRef || '...'}
        </span>
      </nav>

      {/* Toolbar / Search & Recent Orders */}
      <div className="tracking-toolbar">
        <form onSubmit={handleSearchSubmit} className="tracking-search-box">
          <MagnifyingGlass size={17} />
          <input
            type="text"
            placeholder="Buscar por Nº de pedido, código o teléfono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <div className="tracking-recent-pills">
          {recentOrders.slice(0, 7).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tracking-pill-btn ${selectedRef === item.orderCode || selectedRef === item.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedRef(item.orderCode);
                setQuery(item.orderCode);
              }}
            >
              <span>#{item.orderCode}</span>
              <small>({item.customerName.split(' ')[0]})</small>
            </button>
          ))}
          <button
            type="button"
            className="tracking-pill-btn"
            title="Recargar seguimiento"
            onClick={() => {
              loadRecentOrders();
              if (selectedRef) setSelectedRef(selectedRef + ' ');
            }}
          >
            <ArrowClockwise size={14} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="tracking-main-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#2563eb', fontSize: '1rem', fontWeight: 600 }}>
            Cargando estado del pedido y trazabilidad en tiempo real...
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="tracking-main-card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p style={{ color: '#ef4444', fontWeight: 600 }}>{error}</p>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Verifica el código ingresado o selecciona un pedido de la lista superior.
          </p>
        </div>
      )}

      {trackingData && !loading && (
        <>
          {/* Main Stepper Card (Matches Image 1:1) */}
          <section className="tracking-main-card">
            <header className="tracking-card-header">
              <div className="tracking-header-left">
                <div className="tracking-icon-badge">
                  <Package size={28} weight="duotone" />
                </div>
                <div className="tracking-title-group">
                  <h1>Seguimiento de pedido</h1>
                  <p>
                    Pedido #{trackingData.order.orderCode} ·{' '}
                    <strong>{trackingData.order.productName}</strong>
                    {trackingData.order.quantity > 1 ? ` (${trackingData.order.quantity} un.)` : ''}
                  </p>
                </div>
              </div>

              <div className={`tracking-status-pill pill-${trackingData.tracking.pill.color}`}>
                <Truck size={17} weight="fill" />
                <span>{trackingData.tracking.pill.label}</span>
              </div>
            </header>

            {/* Stepper Horizontal Bar */}
            <div className="stepper-container">
              <div className="stepper-track">
                <div className="stepper-line-bg" />
                <div
                  className="stepper-line-progress"
                  style={{
                    width: `calc((100% - 44px) * ${calcProgressRatio(trackingData.tracking.steps)})`
                  }}
                />

                {trackingData.tracking.steps.map((step) => (
                  <div key={step.key} className={`stepper-step ${step.state}`}>
                    <div className="stepper-node">
                      {renderStepIcon(step.icon, step.state)}
                      {step.state === 'completed' && (
                        <div className="stepper-check-badge">
                          <Check size={9} weight="bold" />
                        </div>
                      )}
                    </div>
                    <span className="stepper-step-label">{step.label}</span>
                    <span className="stepper-step-date">{step.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom Grid: Left Announcement Banner + Right Detail Card */}
          <div className="tracking-cards-grid">
            {/* Left Card: 3D Box & Dynamic Contextual Message */}
            <article className="tracking-banner-card">
              <div className="tracking-banner-content">
                <img
                  src="/notification-bag.png"
                  alt="Paquete en camino"
                  className="tracking-3d-box"
                />
                <div className="tracking-banner-text">
                  <h2>{trackingData.tracking.banner.title}</h2>
                  <p>{trackingData.tracking.banner.description}</p>
                </div>
              </div>
            </article>

            {/* Right Card: Shipping Address, Courier & Customer Reliability */}
            <article className="tracking-detail-card">
              {/* Cliente & Comportamiento */}
              <div className="tracking-info-row">
                <User size={20} className="tracking-info-icon" />
                <span className="tracking-info-label">Cliente</span>
                <div className="tracking-info-value">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <strong>{trackingData.customer.name}</strong>
                    <span className={`client-behavior-badge ${trackingData.reliability.badgeClass}`}>
                      {trackingData.reliability.label}
                    </span>
                  </div>
                  <span className="client-stats-text">
                    Teléfono: {trackingData.customer.phone} · Historial:{' '}
                    <strong>{trackingData.reliability.completed}</strong> pedidos finalizados (
                    {trackingData.reliability.delivered} entregados, {trackingData.reliability.rejected} rechazados)
                  </span>
                </div>
              </div>

              {/* Dirección */}
              <div className="tracking-info-row">
                <MapPin size={20} className="tracking-info-icon" />
                <span className="tracking-info-label">Dirección</span>
                <div className="tracking-info-value">
                  <span>{trackingData.customer.address}</span>
                  <small style={{ color: '#64748b' }}>
                    {trackingData.customer.city}, {trackingData.customer.state}
                  </small>
                </div>
              </div>

              {/* Transportista */}
              <div className="tracking-info-row">
                <Truck size={20} className="tracking-info-icon" />
                <span className="tracking-info-label">Transportista</span>
                <div className="tracking-info-value">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <strong className="tracking-carrier-name">
                      {trackingData.order.shipping_company || 'Blue Express®'}
                    </strong>
                    {trackingData.order.tracking_url && (
                      <a
                        href={trackingData.order.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="tracking-pill-btn"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Guía {trackingData.order.tracking_number} <ArrowSquareOut size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Fecha Estimada */}
              <div className="tracking-info-row">
                <CalendarBlank size={20} className="tracking-info-icon" />
                <span className="tracking-info-label">Fecha estimada</span>
                <div className="tracking-info-value">
                  <span className="est-delivery-pill">
                    <CalendarBlank size={15} />
                    {trackingData.customer.city?.toLowerCase().includes('santiago')
                      ? '24 a 48 horas hábiles, entre 09:00 y 19:00 h'
                      : '2 a 4 días hábiles, en horario de reparto'}
                  </span>
                </div>
              </div>

              {/* Total a pagar */}
              <div className="tracking-info-row">
                <CurrencyDollar size={20} className="tracking-info-icon" />
                <span className="tracking-info-label">Total a pagar</span>
                <div className="tracking-info-value">
                  <strong style={{ fontSize: '1.05rem', color: '#059669' }}>
                    {money(trackingData.order.totalAmount, trackingData.order.currency)}
                  </strong>
                  <small style={{ color: '#64748b' }}>
                    Pago contra entrega (Efectivo o Transferencia al repartidor)
                  </small>
                </div>
              </div>
            </article>
          </div>
        </>
      )}
    </div>
  );
}
