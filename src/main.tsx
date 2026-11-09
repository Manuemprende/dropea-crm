import React, { Activity, useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { WhatsappLogo, SquaresFour, Package, ChartLineUp, Cube, Storefront, WarningCircle, Wallet, PlugsConnected, GearSix, ArrowUpRight, ArrowRight, CaretDown, MagnifyingGlass, ArrowClockwise, DownloadSimple, X, CheckCircle, CaretLeft, CaretRight, GlobeHemisphereWest, Lightning, ShieldCheck, Copy, Circle, List, SignOut, Pulse, ArrowSquareOut, CurrencyDollar, ShoppingBag, Truck, Megaphone } from '@phosphor-icons/react';
import Globe from './Globe';
import LiveLandings from './LiveLandings';
import GlobalOverview from './GlobalOverview';
import ThemeToggle from './ThemeToggle';
import WhatsAppInbox from './WhatsAppInbox';
import OrderTrackingView from './OrderTrackingView';
import AdsView from './AdsView';
import { OrdersTable, OrdersPage, exportOrders, marketTimezones } from './OrdersView';
import { WhatsAppChannel, LandingsChannel, LandingOrders } from './LandingChannels';
import Products, { exportProducts } from './Products';
import AuthGate from './AuthGate';
import { dropeaMarkets } from './markets';
import CountryPicker, { Flag } from './CountryPicker';
import { makeDemo } from './demo';
import { count, money, dateKey, filterPeriod, group, paidOrders, total } from './metrics';
import type { Data, Order, Status } from './types';
import './styles.css';
import './theme.css';
import './appearance.css';
import SaleNotificationToast, { type SaleEvent } from './SaleNotificationToast';
import { playSaleSound } from './notificationSound';
import './sale-notification.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';

const empty: Data = { orders: [], products: [], shops: [], issues: [], events: [] };
const initialStatus: Status = { configured: false, market: 'CL', signingConfigured: false, syncing: false, lastSync: null, lastError: null };
const navigation = [
  { name: 'Vista general', icon: SquaresFour, color: '#69b8ff' },
  { name: 'Meta & TikTok Ads', icon: Megaphone, color: '#38bdf8' },
  { name: 'Pedidos', icon: Package, color: '#f2b963' },
  { name: 'WhatsApp', icon: WhatsappLogo, color: '#25D366' },
  { name: 'Live / Landings', icon: Pulse, color: '#a69bff' },
  { name: 'Seguimiento', icon: Truck, color: '#3b82f6' },
  { name: 'Estadísticas', icon: ChartLineUp, color: '#63dfb3' },
  { name: 'Tiendas', icon: Storefront, color: '#ff95b6' },
  { name: 'Productos', icon: Cube, color: '#b499ff' },
  { name: 'Landings', icon: GlobeHemisphereWest, color: '#60d7ec' },
  { name: 'Incidencias', icon: WarningCircle, color: '#ff966f' },
  { name: 'Wallet', icon: Wallet, color: '#f1d26d' }
];
const colors: Record<string,string> = { 'Entregados': '#50cfaa', 'En camino': '#68aaf0', 'En preparación': '#a896de', 'Pendientes': '#e2b46b', 'Cancelados': '#e8868f', 'Con error': '#f08d68', 'Finalizados': '#92a3b7' };
const titles: Record<string,string> = { 'Seguimiento': 'Trazabilidad y estado en tiempo real de cada pedido.', 'Live / Landings':'Tus campañas y visitantes en vivo.', 'Landings':'Tus formularios conectados con tu operación.', 'WhatsApp':'Conversaciones, pedidos y clientes en un solo lugar.', 'Vista general': 'Tu operación, en una mirada.', 'Pedidos': 'Cada pedido, bajo control.', 'Estadísticas': 'Entiende cómo va tu negocio.', 'Productos': 'Tu catálogo de productos.', 'Tiendas': 'Todos tus canales, juntos.', 'Incidencias': 'Lo que necesita tu atención.', 'Wallet': 'El pulso de tus finanzas.', 'Configuración': 'Conecta tu centro de operaciones.', 'Meta & TikTok Ads': 'Campañas publicitarias, credenciales de Meta y TikTok, y motor de escalado automático.' };
async function api<T>(url: string, options?: RequestInit): Promise<T> { const res = await fetch(`/api${url}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } }); const data = await res.json(); if (!res.ok) { if (res.status === 401 && data.code === 'SESSION_REQUIRED') window.dispatchEvent(new Event('crm-session-expired')); throw new Error(data.error || 'No se pudo completar la solicitud.'); } return data; }
function Badge({ state }: { state: string }) { return <span className="badge" style={{ '--badge-color': (state === 'Conectado' ? '#5ce6a1' : colors[state]) || '#92a3b7' } as React.CSSProperties}><span/>{state}</span>; }
function Empty({ title = 'Todavía no hay datos', description = 'Conecta Dropea y sincroniza para ver tu operación aquí.' }: { title?: string; description?: string }) { return <div className="empty"><Package size={30}/><strong>{title}</strong><p>{description}</p></div>; }
function Panel({ title, children, extra, className = '' }: { title: string; children: React.ReactNode; extra?: React.ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-title"><h2>{title}</h2>{extra}</div>{children}</section>; }
function Digits({ value }: { value: string }) { return <div className="digits" aria-label={value}>{value.split('').map((c,i) => <span key={i} className={/\d/.test(c) ? 'digit' : 'separator'} aria-hidden="true">{c}</span>)}</div>; }
function Sparkline({ orders, title }: { orders: Order[]; title: string }) {
  const values = Array.from({ length: 12 }, (_, bucket) => {
    const items = orders.filter(o => Math.floor(Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date(o.created_at))) / 2) === bucket);
    return title === 'Pedidos' ? items.length : title === 'Tasa de entrega' ? items.filter(o => group(o) === 'Entregados').length : title === 'Ticket promedio' ? (paidOrders(items).length ? total(items) / paidOrders(items).length : 0) : total(items);
  });
  const max = Math.max(...values, 1);
  return <svg width="72" height="24" viewBox="0 0 72 24" aria-hidden="true"><path d={values.map((v,i) => `${i ? 'L' : 'M'}${1+i*6.3} ${22-v/max*20}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>;
}
function RevenueChart({ orders, currency }: { orders: Order[]; currency: string }) {
  const buckets = Array.from({ length: 24 }, (_, h) => paidOrders(orders).filter(o => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date(o.created_at))) === h).reduce((s,o) => s + o.total_amount, 0));
  const max = Math.max(...buckets, 1);
  return <><div className="chart-value">{money(total(orders), currency)}<span>Valor de pedidos · excluye cancelados y errores</span></div><div className="bar-chart" role="img" aria-label="Valor de pedidos por hora de Chile">{buckets.map((n,h) => <div key={h} style={{ height: `${Math.max(n / max * 100, 2)}%` }} title={`${h}:00 · ${money(n,currency)}`}/>)}</div><div className="axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></>;
}
function Dashboard({ orders, data, currency, openOrders, onSelect, onTrack, market }: { orders: Order[]; data: Data; currency: string; market: string; openOrders: () => void; onSelect: (o: Order) => void; onTrack?: (ref: string) => void }) {
  const revenue = total(orders); const valid = paidOrders(orders); const delivered = orders.filter(o => group(o) === 'Entregados');
  const states = Object.keys(colors).map(name => ({ name, count: orders.filter(o => group(o) === name).length })).filter(s => s.count);
  let angle = 0; const gradient = states.map(s => { const start = angle; angle += s.count / orders.length * 100; return `${colors[s.name]} ${start}% ${angle}%`; }).join(',');
  const channel = data.shops.map(s => ({ ...s, sum: total(orders.filter(o => o.store_id === s.id)), count: orders.filter(o => o.store_id === s.id).length })).sort((a,b) => b.sum - a.sum);
  const products = Object.values(valid.flatMap(o => o.line_items || []).reduce<Record<string, { name: string; units: number; sum: number }>>((acc, l) => { const key = String(l.product_id || l.product_name); acc[key] ||= { name: l.product_name, units: 0, sum: 0 }; acc[key].units += l.quantity; acc[key].sum += l.quantity * l.unit_price; return acc; }, {})).sort((a,b) => b.units - a.units).slice(0,4);
  const pending = orders.filter(o => group(o) === 'Pendientes').length;
  return <><section className="scoreboard"><div className="score-row"><div className="score-label"><span className="score-icon"><Wallet size={21}/></span><div><span className="eyebrow">EL VALOR DE TU OPERACIÓN</span><h2>Total vendido <span className="subtle-tag">{currency}</span></h2></div></div><Digits value={money(revenue, currency, 7)}/></div><div className="score-row secondary-score"><div className="score-label"><span className="score-icon"><ShoppingBag size={20}/></span><h2>Cantidad de pedidos</h2></div><div className="order-score"><span>En el período seleccionado</span><Digits value={count(orders.length, 7)}/></div></div></section>
    <div className="metrics-grid">{[{ title: 'Ventas totales', value: money(revenue,currency), icon: Wallet, note: 'Valor de pedidos válidos', color: 'green' }, { title: 'Pedidos', value: count(orders.length), icon: Package, note: `${count(pending)} por confirmar`, color: 'blue' }, { title: 'Ticket promedio', value: money(valid.length ? revenue / valid.length : 0,currency), icon: ChartLineUp, note: 'Por pedido válido', color: 'lavender' }, { title: 'Tasa de entrega', value: orders.length ? `${(delivered.length / orders.length * 100).toFixed(1)}%` : '—', icon: CheckCircle, note: `${delivered.length} pedidos entregados`, color: 'amber' }].map(m => <div className={`metric ${m.color}`} key={m.title}><div className="metric-top"><span>{m.title}</span><m.icon size={18}/></div><strong>{m.value}</strong><div className="metric-bottom"><span>{m.note}</span><Sparkline orders={orders} title={m.title}/></div></div>)}</div>
    <div className="dashboard-middle"><Panel title="Ventas por canal" extra={<span className="muted small">{channel.length} canales</span>} className="channels-panel">{channel.some(c => c.count) ? <><div className="channel-total">{money(revenue,currency)}<span>Distribución de tus ventas</span></div><div className="channel-list">{channel.filter(c => c.count).map((c,i) => <div key={c.id}><div className="channel-label"><span><span className={`store-mark mark-${i % 3}`}><Storefront size={16}/></span>{c.name}</span><strong>{money(c.sum,currency)}</strong></div><div className={`progress progress-${i % 3}`}><div style={{ width: `${revenue ? c.sum / revenue * 100 : 0}%` }}/></div><small>{c.count} pedidos <span>{revenue ? (c.sum/revenue * 100).toFixed(1) : 0}%</span></small></div>)}</div><div className="panel-foot"><ShieldCheck size={14}/> Datos de tus tiendas conectadas</div></> : <Empty title="Tus canales aparecerán aquí" description="Las ventas se agrupan por la tienda de origen."/>}</Panel><Globe active={orders.length > 0} market={market}/><div className="right-stack"><Panel title="Estado de pedidos" extra={<span className="tiny-label">EN EL PERÍODO</span>}><div className="status-content"><div className="donut" style={{ background: gradient ? `conic-gradient(${gradient})` : '#253246' }}><div><strong>{orders.length}</strong><span>Pedidos</span></div></div><div className="legend">{states.length ? states.map(s => <div key={s.name}><span className="legend-dot" style={{ background: colors[s.name] }}/><span>{s.name}</span><strong>{s.count}</strong></div>) : <span className="muted small">Sin pedidos</span>}</div></div></Panel><Panel title="Rendimiento" extra={<span className="muted small">Hora de Chile</span>}><RevenueChart orders={orders} currency={currency}/></Panel></div></div>
    <div className="dashboard-bottom"><Panel title="Productos más vendidos" extra={<Cube size={16} className="muted"/>}>{products.length ? <div className="top-products">{products.map((p,i) => <div key={p.name}><span className="rank">0{i+1}</span><span className={`product-mini mini-${i}`}><Cube size={20}/></span><div><strong>{p.name}</strong><small>{p.units} unidades vendidas</small></div><span className="number">{money(p.sum,currency)}</span></div>)}</div> : <Empty/>}</Panel><Panel title="Pedidos recientes" extra={<button className="text-link" onClick={openOrders}>Ver todos <ArrowRight size={13}/></button>}><OrdersTable orders={orders.slice(0,4)} allOrders={orders} shops={data.shops} onSelect={onSelect} onTrack={onTrack} compact/></Panel><Panel title="Lectura de la operación" extra={<Lightning size={17} className="mint"/>}><div className="insights"><div><span className="insight-icon amber"><Package size={16}/></span><p><strong>{pending ? `${pending} pedidos por confirmar` : 'Todo al día'}</strong><span>{pending ? 'Revisa los pedidos pendientes en Dropea.' : 'No hay pedidos pendientes en este período.'}</span></p></div><div><span className="insight-icon green"><ChartLineUp size={16}/></span><p><strong>{channel[0]?.sum ? `${channel[0].name} lidera tus ventas` : 'Conoce tus mejores canales'}</strong><span>{channel[0]?.sum ? `${money(channel[0].sum,currency)} en el período seleccionado.` : 'Se mostrarán cuando recibas tus primeros pedidos.'}</span></p></div><div className="insight-note"><Circle size={12}/> La conversión requiere datos de visitas.</div></div><button className="text-link insight-link" onClick={openOrders}>Ir al resumen de pedidos <ArrowRight size={14}/></button></Panel></div>
  </>;
}

function Integration({ status, refresh, toast, onMarketChange }: { status: Status; refresh:()=>Promise<void>; toast:(s:string)=>void; onMarketChange:(market:string)=>Promise<void> }) {
  const [market,setMarket] = useState(status.market); const [key,setKey] = useState(''); const [secret,setSecret] = useState(''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  useEffect(() => { setMarket(status.market); setKey(''); setSecret(''); setError(''); }, [status.market]);
  const [subscriptions,setSubscriptions] = useState<{id:string; topic:string;url:string;active:boolean}[]|null>(null); const [topic,setTopic] = useState('order.status.changed'); const [url,setUrl] = useState('');
  useEffect(() => { setSubscriptions(null); }, [status.market]);
  const loadSubscriptions = async () => { setError(''); try { const r = await api<{webhooks:typeof subscriptions}>('/subscriptions'); setSubscriptions(r.webhooks || []); } catch(e) { setError((e as Error).message); } };
  return <div className="settings-grid"><Panel title="Conexión con Dropea" extra={<Badge state={status.configured ? 'Conectado' : 'Sin conectar'}/>}><p className="section-description">Centraliza tus pedidos, productos y tiendas con la API oficial de Dropea.</p><form onSubmit={async e=>{ e.preventDefault();setBusy(true);setError('');try { await api('/connection',{method:'POST',body:JSON.stringify({market,apiKey:key,signingSecret:secret})});setKey('');setSecret('');await refresh();toast('Conexión verificada. Ya puedes sincronizar tu cuenta.'); } catch(e){setError((e as Error).message);} finally {setBusy(false);} }}><fieldset className="market-picker"><legend>País de tu cuenta Dropea</legend><div className="market-options">{dropeaMarkets.map(country => <button key={country.code} type="button" aria-pressed={market === country.code} className={`market-option ${market === country.code ? 'market-selected' : ''} ${status.markets?.some(c => c.market === country.code && c.configured) ? 'market-connected' : ''}`} disabled={busy || status.syncing} onClick={async () => { setBusy(true); setError(''); try { await onMarketChange(country.code); setMarket(country.code); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Flag code={country.code}/><span className="market-code">{country.code}</span><span><strong>{country.name}</strong><small>{status.markets?.some(c => c.market === country.code && c.configured) ? <><span className="key-saved-dot"/>Key agregada</> : `Sin API Key · ${country.currency}`}</small></span>{market === country.code && <CheckCircle size={17} weight="fill"/>}</button>)}</div><p>Cada país conserva su propia API Key, secreto y datos. La selección queda guardada para tu próxima visita.</p></fieldset><label>API Key<input type="password" autoComplete="off" required value={key} onChange={e=>setKey(e.target.value)} placeholder="Pega tu API Key de Dropea"/><small>{status.persistenceEnabled ? 'Se guarda cifrada en el servidor y se conserva después de reiniciar.' : 'Se envía solo a tu servidor y a Dropea. Se conserva en memoria durante esta sesión.'}</small></label><label>Secreto de firma de webhooks <span className="muted">(opcional)</span><input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Signing secret de 64 caracteres"/><small>Necesario para recibir y verificar eventos de forma segura.</small></label><button className="button primary" disabled={busy}><PlugsConnected size={18}/>{busy ? 'Verificando conexión…' : 'Verificar y conectar'}</button></form>{status.configured && <button className="text-link disconnect" onClick={async()=>{await api('/connection',{method:'DELETE'});await refresh();toast('Cuenta desconectada.');}}><SignOut size={16}/> Desconectar cuenta</button>}<div className="info-box"><ShieldCheck size={19}/><p>{status.persistenceEnabled ? 'Al conectar, tu API Key y el secreto de firma se guardan cifrados. La conexión se recupera automáticamente al reiniciar el servidor.' : <>Para conservar la conexión después de reiniciar, configura <code>DROPEA_API_KEY</code> y <code>DROPEA_SIGNING_SECRET</code> en el archivo <code>.env</code> del servidor.</>}</p></div>{error && <div className="error-inline" role="alert">{error}</div>}</Panel><div className="settings-stack"><Panel title="Permisos recomendados"><p className="section-description">Para la primera sincronización, activa estos permisos de lectura al crear tu API Key.</p>{['orders:read · Pedidos','products:read · Productos','stores:read · Tiendas','issues:read · Incidencias','users:read · Verificar conexión','webhooks:read / write · Suscripciones'].map(p=><div className="permission" key={p}><CheckCircle size={17}/>{p}</div>)}<a className="text-link" href="https://public-api.dropea.com/dropshipper/docs" target="_blank" rel="noreferrer">Consultar documentación oficial <ArrowSquareOut size={14}/></a></Panel><Panel title="Estado de la integración"><div className="setting-status"><span>Autenticación API</span><span className={status.configured?'mint':'muted'}>{status.configured?'Configurada':'Pendiente'}</span></div><div className="setting-status"><span>Verificación de webhooks</span><span className={status.signingConfigured?'mint':'muted'}>{status.signingConfigured?'Configurada':'Pendiente'}</span></div><div className="setting-status"><span>Última sincronización</span><span>{status.lastSync ? new Date(status.lastSync).toLocaleString('es-CL',{timeZone:'America/Santiago'}) : 'Sin sincronizar'}</span></div><div className="setting-status"><span>Wallet</span><span className="muted">Sin endpoint público</span></div></Panel></div><Panel title="Suscripciones a webhooks" className="webhook-panel" extra={<button className="button" disabled={!status.configured} onClick={loadSubscriptions}><ArrowClockwise size={15}/> Consultar suscripciones</button>}><p className="section-description">{window.location.protocol === 'https:' ? <>URL del webhook: <code>{window.location.origin}/api/webhooks/dropea</code>. Registra esta misma URL para cada evento. El receptor valida el secreto de firma.</> : <>Publica únicamente el receptor <code>/api/webhooks/dropea</code> mediante HTTPS. Los eventos se validan con el secreto de firma.</>}</p><form className="webhook-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/subscriptions',{method:'POST',body:JSON.stringify({topic,url})});await loadSubscriptions();toast('Suscripción registrada en Dropea.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Evento<select value={topic} onChange={e=>setTopic(e.target.value)}>{['order.created','order.status.changed','order.cancelled','issue.created','issue.status.changed','issue.resolved'].map(t=><option key={t}>{t}</option>)}</select></label><label>URL pública del receptor<input type="url" required placeholder="https://tu-dominio.cl/api/webhooks/dropea" value={url} onChange={e=>setUrl(e.target.value)}/></label><button className="button primary" disabled={busy || !status.configured || !status.signingConfigured}>Registrar webhook</button></form>{subscriptions && (subscriptions.length ? subscriptions.map(s=><div key={s.id} className="subscription"><span className="dot"/><strong>{s.topic}</strong><span>{s.url}</span><span>{s.active?'Activo':'Inactivo'}</span></div>) : <p className="muted small">Tu API Key todavía no tiene suscripciones.</p>)}</Panel></div>;
}

function App({ onLogout }: { onLogout?: () => void }) {
  const getInitialView = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm-active-view');
      if (saved && (navigation.some(n => n.name === saved) || saved === 'Configuración')) return saved;
      if (window.location.hash === '#live' || window.location.hash === '#live-landings') return 'Live / Landings';
      if (window.location.hash === '#whatsapp') return 'WhatsApp';
      if (window.location.hash === '#seguimiento' || window.location.hash === '#tracking') return 'Seguimiento';
    }
    return sessionStorage.getItem('dropea-live-open') === 'true' ? 'Live / Landings' : 'Vista general';
  };
  const getCachedData = (): Data => {
    try {
      const raw = localStorage.getItem('crm-data-cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.orders)) return parsed;
      }
    } catch {}
    return empty;
  };
  const [visited,setVisited]=useState<string[]>([getInitialView()]);
  const [settingsTab,setSettingsTab] = useState('dropea');
  const [view,setView] = useState(getInitialView); const [period,setPeriod] = useState('Hoy'); const [demo,setDemo] = useState(localStorage.getItem('dropea-mode') !== 'live'); const [demoData] = useState(makeDemo); const [liveData,setLiveData] = useState<Data>(getCachedData); const [status,setStatus] = useState<Status>(initialStatus); const [currency,setCurrency] = useState('CLP'); const [query,setQuery] = useState(''); const [selected,setSelected] = useState<Order|null>(null); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(false); const [error,setError] = useState(''); const [mobile,setMobile] = useState(false); const [switchingMarket,setSwitchingMarket] = useState(false);
  const [trackingOrderRef, setTrackingOrderRef] = useState<string>('');
  const [sales, setSales] = useState<SaleEvent[]>([]);
  const dismissSale = (id?: string) => {
    setSales(prev => id ? prev.filter(s => s.id !== id) : []);
  };

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) {
        setTrackingOrderRef(String(e.detail));
        changeView('Seguimiento');
      }
    };
    window.addEventListener('crm-track-order', handler);
    return () => window.removeEventListener('crm-track-order', handler);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: any = null;
    const connectSales = () => {
      try {
        es = new EventSource('/api/sales/stream');
        es.addEventListener('sale', (e) => {
          try {
            const ev: SaleEvent = JSON.parse(e.data);
            triggerSaleNotification(ev);
          } catch {}
        });
        es.onerror = () => {
          es?.close();
          reconnectTimer = setTimeout(connectSales, 4000);
        };
      } catch {}
    };
    connectSales();
    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const shownSaleIdsRef = useRef(new Set<string>());
  const isTestingSaleRef = useRef(false);

  const triggerSaleNotification = async (sale: SaleEvent) => {
    if (!sale?.id) return;
    const saleKey = String(sale.id);
    if (shownSaleIdsRef.current.has(saleKey)) {
      return; // Deduplicated: already notified
    }
    shownSaleIdsRef.current.add(saleKey);
    if (shownSaleIdsRef.current.size > 100) {
      const first = shownSaleIdsRef.current.values().next().value;
      if (first) shownSaleIdsRef.current.delete(first);
    }

    setSales(prev => [sale, ...prev.filter(s => s.id !== sale.id)].slice(0, 4));
    await playSaleSound();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      let perm = Notification.permission;
      if (perm === 'default') {
        try {
          perm = await Notification.requestPermission();
        } catch {}
      }
      if (perm === 'granted') {
        const moneyStr = new Intl.NumberFormat('es-CL', {
          style: 'currency',
          currency: sale.currency || 'CLP',
          maximumFractionDigits: sale.currency === 'CLP' ? 0 : 2
        }).format(sale.totalAmount);
        const titleText = `🎉 ¡Nueva venta! ${moneyStr}`;
        const bodyText = `Pedido #${sale.orderCode}\n${sale.productName || "1 producto"}`;
        const stableTag = `sale-${sale.id}`;

        const notificationOptions: any = {
          body: bodyText,
          badge: '/notification-logo-d.png',
          tag: stableTag,
          data: { url: '/#pedidos', orderId: sale.id },
          renotify: true,
          requireInteraction: true
        };

        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(titleText, notificationOptions);
          } catch {
            if (navigator.serviceWorker?.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: titleText,
                options: notificationOptions
              });
            }
          }
        } else {
          new Notification(titleText, notificationOptions);
        }
      }
    }
  };

  const handleTestSale = async () => {
    if (isTestingSaleRef.current || busy) return;
    isTestingSaleRef.current = true;
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }
      setBusy(true);
      const res = await api<{ success: boolean; saleEvent: SaleEvent; order: any }>('/test/sale', { method: 'POST' });
      if (res.saleEvent) {
        await triggerSaleNotification(res.saleEvent);
        toast('¡Nueva venta simulada! Notificación enviada a WhatsApp (+56928148914).');
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => { isTestingSaleRef.current = false; }, 500);
    }
  };
  useEffect(()=>{setVisited(pages=>pages.includes(view)?pages:[...pages,view]);},[view]);
  useEffect(()=>{sessionStorage.setItem('dropea-live-open',String(view==='Live / Landings'));},[view]);
  const [allCountries,setAllCountries]=useState(()=>localStorage.getItem('dropea-overview-all')==='true');
  useEffect(()=>{localStorage.setItem('dropea-overview-all',String(allCountries));},[allCountries]);
  const toast = (s:string) => setMessage(s);
  const refresh = async () => { const s = await api<Status>('/status');setStatus(s); if(s.configured) { const d = await api<Data>('/data'); setLiveData(d); try { localStorage.setItem('crm-data-cache', JSON.stringify(d)); } catch {} } else setLiveData(empty); };
  const selectMarket = async (market:string) => {
    if (switchingMarket || status.syncing || busy) return;
    setSwitchingMarket(true); setError('');
    try {
      await api('/market', { method:'POST', body:JSON.stringify({market}) });
      setLiveData(empty); setSelected(null); setCurrency(dropeaMarkets.find(c=>c.code===market)?.currency || 'CLP');
      await refresh();
    } finally { setSwitchingMarket(false); }
  };
  useEffect(()=>{refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));const timer=setInterval(()=>{refresh().catch(e=>setError(e.message));},15000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),6000);return()=>clearTimeout(t);},[message]);
  useEffect(()=>{localStorage.setItem('dropea-mode',demo?'demo':'live');},[demo]);
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);setMobile(false);}if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)){e.preventDefault();setMobile(true);setTimeout(()=>document.querySelector<HTMLInputElement>('.header-search input')?.focus(),0);}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[]);
  useEffect(()=>{
    if(!selected)return;
    const previous=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const nodes=Array.from(document.querySelectorAll<HTMLElement>('.order-drawer button,.order-drawer a,.order-drawer input'));const first=nodes[0];const last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
    document.addEventListener('keydown',trap);
    return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',trap);previous?.focus();};
  },[selected]);
  const data = demo ? demoData : liveData;
  const prevOrdersCount = useRef<number | null>(null);
  useEffect(() => {
    if (data.orders.length > 0) {
      if (prevOrdersCount.current !== null && data.orders.length > prevOrdersCount.current) {
        const newest = data.orders[0];
        const itemsCount = newest.line_items?.reduce((s, l) => s + l.quantity, 0) || 1;
        const productName = newest.line_items?.[0]?.product_name || 'Producto';
        triggerSaleNotification({
          id: String(newest.id),
          orderCode: '#' + String(newest.id).slice(-6).toUpperCase(),
          productName,
          quantity: itemsCount,
          totalAmount: Number(newest.total_amount) || 0,
          currency: newest.currency || 'CLP',
          createdAt: Date.now()
        });
      }
      prevOrdersCount.current = data.orders.length;
    }
  }, [data.orders]);
  const currencies = [...new Set(data.orders.map(o=>o.currency))]; if (!currencies.length) currencies.push(status.market==='CL'?'CLP':status.market==='MX'?'MXN':'EUR');
  const activeCurrency = currencies.includes(currency) ? currency : currencies[0];
  const orders = useMemo(()=>filterPeriod(data.orders.filter(o=>o.currency===activeCurrency),period),[data.orders,period,activeCurrency]);
  const clearSystemNotifications = async () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const list = await reg.getNotifications();
        list.forEach(n => n.close());
      } catch {}
    }
  };

  const changeView=(v:string)=>{setView(v);setMobile(false);if(v==='Pedidos')clearSystemNotifications();if(typeof window!=='undefined'){localStorage.setItem('crm-active-view',v);if(v==='Live / Landings')window.location.hash='#live';else if(v==='WhatsApp')window.location.hash='#whatsapp';else if(v==='Seguimiento')window.location.hash='#seguimiento';else if(window.location.hash==='#live'||window.location.hash==='#whatsapp'||window.location.hash==='#seguimiento')window.history.replaceState(null,'',window.location.pathname);}};
  const productAttempts = useRef(new Set<string>());
  const syncProducts = async () => {
    setBusy(true);setError('');
    try {
      const result=await api<{products:number}>('/sync/products',{method:'POST'});
      await refresh();toast(`${count(result.products)} productos importados desde Dropea.`);
    } catch(e) { setError((e as Error).message);await refresh().catch(()=>{}); }
    finally { setBusy(false); }
  };
  useEffect(()=>{
    if(view!=='Productos' || demo || loading || switchingMarket || !status.configured || busy || status.syncing || status.productsLastSync || status.productsError || productAttempts.current.has(status.market))return;
    productAttempts.current.add(status.market);
    syncProducts();
  },[view,demo,loading,switchingMarket,status.market,status.configured,status.syncing,status.productsLastSync,status.productsError,busy]);
  const sync = async()=>{if(demo){setDemo(false);if(!status.configured){changeView('Configuración');toast('Conecta tu cuenta para sincronizar datos reales.');return;}}if(!status.configured){changeView('Configuración');return;}if(view==='Productos'){await syncProducts();return;}setBusy(true);setError('');try{const r=await api<{synced:number;warnings:string[]}>('/sync',{method:'POST'});await refresh();toast(`${r.synced} pedidos sincronizados.${r.warnings.length?' Algunos recursos requieren revisar sus permisos.':''}`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const mainContent=(page:string)=>{
    if(page==='Vista general')return <><Activity mode={allCountries?'visible':'hidden'}><GlobalOverview period={period} onPeriod={setPeriod} onCountry={market=>{setAllCountries(false);selectMarket(market).catch(e=>setError(e.message));}}/></Activity><Activity mode={allCountries?'hidden':'visible'}><Dashboard orders={orders} data={data} currency={activeCurrency} market={status.market} openOrders={()=>changeView('Pedidos')} onSelect={setSelected} onTrack={ref=>{setTrackingOrderRef(ref);changeView('Seguimiento');}}/></Activity></>;
    if(page==='Pedidos')return <OrdersPage orders={orders} data={data} market={status.market} query={query} setQuery={setQuery} onSelect={setSelected} onTrack={ref=>{setTrackingOrderRef(ref);changeView('Seguimiento');}}/>;
    if(page==='Seguimiento')return <OrderTrackingView initialOrderRef={trackingOrderRef} onBackToOrders={()=>changeView('Pedidos')}/>;
    if(page==='Live / Landings')return <LiveLandings onConfigure={()=>changeView('Landings')}/>;
    if(page==='Landings')return <LandingsChannel market={status.market}/>;
    if(page==='WhatsApp')return <WhatsAppInbox onSettings={()=>{setSettingsTab('whatsapp');changeView('Configuración');}}/>;
    if(page==='Configuración')return <><div className="wa-navigation settings-tabs" role="tablist" aria-label="Configuración"><button role="tab" aria-selected={settingsTab==='dropea'} onClick={()=>setSettingsTab('dropea')}>Dropea</button><button role="tab" aria-selected={settingsTab==='whatsapp'} onClick={()=>setSettingsTab('whatsapp')}>WhatsApp</button></div>{settingsTab==='whatsapp'?<WhatsAppChannel/>:<Integration status={status} refresh={refresh} toast={toast} onMarketChange={selectMarket}/>}</>;
    if(page==='Estadísticas')return <><div className="analytics-summary"><span><ChartLineUp size={24}/> Valor de pedidos<strong>{money(total(orders),activeCurrency)}</strong></span><span><CheckCircle size={24}/> Entregado<strong>{money(total(orders.filter(o=>group(o)==='Entregados')),activeCurrency)}</strong></span><span><Package size={24}/> Unidades en pedidos válidos<strong>{count(paidOrders(orders).flatMap(o=>o.line_items||[]).reduce((s,l)=>s+l.quantity,0))}</strong></span></div><div className="analytics-grid"><Panel title="Valor de pedidos por hora de Chile"><RevenueChart orders={orders} currency={activeCurrency}/></Panel><Panel title="Distribución por ciudad">{orders.length ? Object.entries(orders.reduce<Record<string,number>>((a,o)=>{const city=o.shipping_address?.city||'Sin ciudad';a[city]=(a[city]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).map(([city,n])=><div className="city" key={city}><span>{city}</span><div className="progress"><div style={{width:`${n/orders.length*100}%`}}/></div><strong>{n}</strong></div>) : <Empty/>}</Panel></div><div className="info-box"><Pulse size={20}/><p>Las ventas representan el valor de pedidos válidos. Los ingresos cobrados, el margen definitivo y la conversión requieren información adicional. Los importes se muestran por moneda y las fechas usan la zona horaria de Chile.</p></div></>;
    if(page==='Productos')return <Products products={data.products} status={status} demo={demo} busy={busy} onSync={sync} onConnect={()=>changeView('Configuración')}/>;
    if(page==='Tiendas')return <Panel title="Tiendas conectadas" extra={<span className="subtle-tag">{data.shops.length} tiendas</span>}>{data.shops.length?<div className="shops-list">{data.shops.map((s,i)=><article key={s.id}><span className={`shop-logo mark-${i%3}`}><Storefront size={28}/></span><div><h3>{s.name}</h3><p>{s.domain||'Canal de venta directa'}</p></div><span className="subtle-tag">{s.store_type}</span><span>{orders.filter(o=>o.store_id===s.id).length} pedidos en el período</span></article>)}</div>:<Empty title="Sin tiendas sincronizadas"/>}</Panel>;
    if(page==='Meta & TikTok Ads')return <AdsView currency={activeCurrency} market={status.market}/>;
    if(page==='Incidencias')return <Panel title="Incidencias de tu operación" extra={<span className="subtle-tag">{data.issues.length} incidencias</span>}>{data.issues.length?<div className="issues-list">{data.issues.map(issue=><article key={issue.id}><WarningCircle size={24} className="amber"/><div><h3>Incidencia #{issue.id}</h3><p>{issue.description||`Estado reportado: ${issue.status}`}</p><small>{issue.order_id?`Pedido #${issue.order_id} · `:''}{issue.is_active?'Abierta en transportista':'Sin actividad pendiente del transportista'}</small></div><Badge state={issue.status==='RESOLVED'?'Resuelta':issue.status==='MANAGING_WITH_CLIENT'?'En gestión':issue.status==='PENDING'?'Pendientes':issue.status}/></article>)}</div>:<Empty title="Sin incidencias registradas" description="Las incidencias se actualizan al sincronizar y al recibir webhooks."/>}<div className="panel-foot">Las resoluciones de incidencias se gestionan por ahora en Dropea.</div></Panel>;
    return <Panel title="Wallet de Dropea"><div className="wallet-empty"><span className="wallet-icon"><Wallet size={45} weight="duotone"/></span><span className="eyebrow">DISPONIBILIDAD DE LA API</span><h2>Tu wallet, en una próxima etapa.</h2><p>La API pública de Dropea no documenta un endpoint para consultar el saldo o los movimientos. Aquí mostraremos tu wallet cuando exista una fuente oficial compatible.</p><span className="badge">Saldo no disponible</span><a className="button" href="https://dropea.com" target="_blank" rel="noreferrer">Ir a Dropea <ArrowSquareOut size={16}/></a></div></Panel>;
  };
  return <div className={`app-shell ${view==='WhatsApp'?'whatsapp-shell':''}`}>{mobile&&<button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={()=>setMobile(false)}/>}<aside className={`sidebar ${mobile?'mobile-open':''}`}><a className="brand" href="#" onClick={e=>{e.preventDefault();changeView('Vista general');}}><img className="brand-logo" src="/crm-dropea-logo.png" alt="CRM Dropea" width="1536" height="1024"/></a><div className="sidebar-utilities"><label className="header-search"><MagnifyingGlass size={16}/><input aria-label="Buscar pedido global" placeholder="Buscar pedido..." value={query} onChange={e=>{setQuery(e.target.value);setView('Pedidos');}}/><kbd>/</kbd></label></div><span className="nav-label">PRINCIPAL</span><nav>{navigation.map(n=><button key={n.name} className={view===n.name?'active':''} onClick={()=>changeView(n.name)}><n.icon className={n.name==='WhatsApp'?'nav-icon whatsapp-brand-icon':'nav-icon'} size={n.name==='WhatsApp'?22:19} color={n.color} weight={n.name==='WhatsApp'||view===n.name?'fill':'duotone'}/><span>{n.name}</span>{n.name==='Incidencias'&&data.issues.filter(i=>i.is_active&&['PENDING','MANAGING_WITH_CLIENT'].includes(i.status)).length>0&&<span className="nav-count">{data.issues.filter(i=>i.is_active&&['PENDING','MANAGING_WITH_CLIENT'].includes(i.status)).length}</span>}</button>)}</nav><span className="nav-label tools-label">WORKSPACE</span><nav><button className={view==='Configuración'?'active':''} onClick={()=>changeView('Configuración')}><GearSix className="nav-icon" size={19} color="#a8b9d8" weight="duotone"/><span>Configuración</span><span className={`connection-dot ${status.configured?'connected':''}`}/></button></nav><div className="sidebar-bottom"><ThemeToggle/><div className="profile"><span className="profile-avatar">W</span><div><strong>Mi workspace</strong><small>Centro de operaciones</small></div><button className="icon-button" onClick={()=>changeView('Configuración')} aria-label="Configuración del workspace"><GearSix size={18}/></button>{onLogout && <button className="icon-button" aria-label="Cerrar sesión" onClick={onLogout}><SignOut size={18}/></button>}</div></div></aside><main><div className="content"><div className="mobile-menu-bar"><button className="icon-button" onClick={()=>setMobile(true)} aria-label="Abrir menú"><List size={22}/><span>Menú</span></button></div>{!['Live / Landings','WhatsApp'].includes(view)&&<div className="page-heading"><div><div className="heading-kicker"><span className="dot"/> CENTRO DE OPERACIONES</div><h1>{view}</h1><p>{titles[view]}</p></div>{!['Live / Landings','Landings','WhatsApp','Configuración','Meta & TikTok Ads'].includes(view)&&!(view==='Vista general'&&allCountries)&&<div className="heading-actions"><button className="button" onClick={()=>view==='Productos'?exportProducts(data.products):exportOrders(orders)}><DownloadSimple size={16}/><span>Exportar</span></button><button className="button primary" onClick={sync} disabled={busy||status.syncing}><ArrowClockwise size={16} className={busy?'rotating':''}/>{busy||status.syncing?'Sincronizando…':'Sincronizar'}</button></div>}</div>}{!['Live / Landings','WhatsApp'].includes(view)&&!(view==='Configuración'&&settingsTab==='whatsapp')&&<CountryPicker allowAll={view==='Vista general'} market={view==='Vista general'&&allCountries?'ALL':status.market} onChange={market => { if(market==='ALL'){setAllCountries(true);setDemo(false);return;}setAllCountries(false);selectMarket(market).catch(e => setError(e.message)); }} disabled={switchingMarket || busy || status.syncing} configured={status.markets?.filter(c=>c.configured).map(c=>c.market)}/>}{demo && !['Live / Landings','WhatsApp'].includes(view) && <div className="mode-banner demo-banner"><span><span className="dot"/>Modo demostración<span className="banner-description">Estás explorando datos de ejemplo.</span></span><button onClick={()=>{setDemo(false);if(!status.configured)changeView('Configuración');}}>Conectar mi cuenta<ArrowRight size={13}/></button></div>}{(error||(!demo&&status.lastError))&&<div className="error-banner" role="alert"><WarningCircle size={18}/>{error||status.lastError}<button className="icon-button" onClick={()=>{setError('');setStatus(s=>({...s,lastError:null}));}} aria-label="Cerrar error"><X/></button></div>}{!['Configuración','Productos','Tiendas','Incidencias','Wallet','Live / Landings','Landings','WhatsApp','Meta & TikTok Ads'].includes(view)&&!(view==='Vista general'&&allCountries)&&<div className="filter-bar"><span className="sync-label"><span className={`dot ${demo?'muted-dot':''}`}/>{demo?'Datos de demostración':status.lastSync?`Sincronizado ${new Date(status.lastSync).toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'})}`:'Pendiente de sincronización'}<span className="filter-dot">·</span> Hora de Chile</span><div className="date-filters"><select aria-label="Moneda" value={activeCurrency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select><div className="segmented">{['Hoy','7 días','Este mes','Todo'].map(p=><button key={p} className={period===p?'selected':''} onClick={()=>setPeriod(p)}>{p}</button>)}</div></div></div>}{(loading&&!data.orders.length&&!demo)&&<div className="skeleton-layout" aria-label="Cargando datos"><div/><div/><div/></div>}{[...new Set([...visited,view])].map(page=><Activity key={page} mode={view===page?'visible':'hidden'}><div className="persistent-page" data-page={page}>{mainContent(page)}</div></Activity>)}</div><footer className="footer">
  <div className="footer-left">
    <div className="footer-left-brand">
      <span className="brand-mark mini"><span/><span/><span/></span>
      <strong className="footer-dropea">Dropea CRM</strong>
      <span className="footer-sep">-</span>
      <span className="footer-wentix">By Wentix AI</span>
    </div>
    <span className="footer-sep mobile-hide">·</span>
    <span className="footer-tagline">Comercio y Comunidad Conectada</span>
  </div>
  <div className="footer-right">
    <span className="footer-security"><ShieldCheck size={14} weight="fill"/> Seguridad SSL</span>
    <span className="footer-sep">·</span>
    <span className="footer-year">© 2026</span>
    <span className="footer-sep mobile-hide">·</span>
    <span className="footer-view-label mobile-hide">{view==='Meta & TikTok Ads'?'Publicidad y automatizaciones':view==='WhatsApp'?'Conversaciones y entregas':view==='Live / Landings'?'Seguimiento de campañas':view==='Seguimiento'?'Trazabilidad en tiempo real':demo?'Vista de demostración':'Ecosistema Dropea'}</span>
    <span className="footer-sep">·</span>
    <span className="footer-tz">America/Santiago</span>
  </div>
</footer></main>{message&&<div className="toast" role="status"><CheckCircle size={20}/>{message}<button className="icon-button" onClick={()=>setMessage('')} aria-label="Cerrar notificación"><X size={17}/></button></div>}<SaleNotificationToast sales={sales} onDismiss={dismissSale}/>{selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="order-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()}>
  <div className="drawer-header">
    <span className="eyebrow">DETALLE DEL PEDIDO</span>
    <button autoFocus className="icon-button" onClick={()=>setSelected(null)} aria-label="Cerrar detalle"><X size={22}/></button>
  </div>
  <h2 id="detail-title">{selected.order_code ? `Pedido ${selected.order_code}` : `Pedido #${selected.id}`}</h2>
  <Badge state={
    (selected as any).confirmed_at || ['CUSTOMER_CONFIRMED', 'SENT_TO_DROPEA', 'CONFIRMED'].includes(selected.status) || ['CUSTOMER_CONFIRMED', 'SENT_TO_DROPEA', 'DROPEA_ERROR'].includes(selected.sub_status || '')
      ? 'Entregados'
      : group(selected)
  }/>
  <div className="drawer-section">
    <h3>Cliente</h3>
    <strong>{selected.shipping_address?.full_name || [selected.shipping_address?.first_name,selected.shipping_address?.last_name].filter(Boolean).join(' ') || 'Sin nombre'}</strong>
    <p>{selected.shipping_address?.email || 'Sin email'}</p>
    <p>{selected.shipping_address?.phone_number || 'Sin teléfono'}</p>
    <p>{selected.shipping_address?.address_line_1} · {selected.shipping_address?.city}, {selected.shipping_address?.province || ''}</p>
  </div>
  <div className="drawer-section">
    <h3>Productos</h3>
    {selected.line_items?.map((l,i)=><div className="order-item" key={i}><Cube size={21}/><div><strong>{l.product_name}</strong><small>{l.quantity} × {money(l.unit_price,selected.currency)}</small></div><span>{money(l.quantity*l.unit_price,selected.currency)}</span></div>)}
  </div>
  <div className="detail-total">
    <span>Total del pedido</span>
    <strong>{money(selected.total_amount,selected.currency)}</strong>
  </div>
  <div className="drawer-section">
    <h3>Seguimiento & Estado</h3>
    <p>Transportista: {selected.carrier || 'Por despachar'}</p>
    <p>Estado del pedido: {(selected as any).confirmed_at ? 'Confirmado por cliente (WhatsApp) ✅' : selected.status}</p>
    {selected.sub_status && <p>Estado Dropea / Canal: {selected.sub_status}</p>}
    <p>Creado: {new Date(selected.created_at).toLocaleString('es-CL', { timeZone: marketTimezones[status.market] || 'America/Santiago' })}</p>
    {(selected as any).confirmed_at && (
      <p>Confirmado: {new Date((selected as any).confirmed_at).toLocaleString('es-CL', { timeZone: marketTimezones[status.market] || 'America/Santiago' })}</p>
    )}
  </div>
  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
    <button
      type="button"
      className="button primary"
      style={{ flex: 1, justifyContent: 'center' }}
      onClick={() => {
        const ref = selected.order_code || String(selected.id);
        setSelected(null);
        setTrackingOrderRef(ref);
        changeView('Seguimiento');
      }}
    >
      <Truck size={16} weight="bold"/>
      <span>Ver en Seguimiento</span>
    </button>
  </div>
</section></div>}<nav className="mobile-bottom-nav" aria-label="Navegación principal móvil"><button type="button" className={`mobile-nav-item ${view==='Vista general'?'active':''}`} onClick={()=>changeView('Vista general')}><SquaresFour size={22} weight={view==='Vista general'?'fill':'duotone'}/><span>General</span></button><button type="button" className={`mobile-nav-item ${view==='Pedidos'?'active':''}`} onClick={()=>changeView('Pedidos')}><Package size={22} weight={view==='Pedidos'?'fill':'duotone'}/><span>Pedidos</span></button><button type="button" className={`mobile-nav-item ${view==='Live / Landings'?'active':''}`} onClick={()=>changeView('Live / Landings')}><Pulse size={22} weight={view==='Live / Landings'?'fill':'duotone'}/><span>Live</span></button><button type="button" className={`mobile-nav-item mobile-nav-wa ${view==='WhatsApp'?'active':''}`} onClick={()=>changeView('WhatsApp')}><WhatsappLogo size={22} weight={view==='WhatsApp'?'fill':'duotone'}/><span>WhatsApp</span></button><button type="button" className={`mobile-nav-item ${mobile?'active':''}`} onClick={()=>setMobile(true)}><List size={22} weight="bold"/><span>Menú</span></button></nav></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthGate>{logout => <App onLogout={logout}/>}</AuthGate></React.StrictMode>);
