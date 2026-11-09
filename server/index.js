import express from 'express';
import { EventEmitter } from 'node:events';
import { createLiveHTTP } from './live-http.js';
import { landingGeo } from './live-geo.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { requestDropea, fetchAll, verifySignature, markets, topics } from './core.js';
import { db, readResources, upsert, getSetting, setSetting,observeOrders } from './storage.js';
import { createConnections } from './connections.js';
import { installAuth } from './auth.js';
import { createStockRadar } from './stock-radar.js';
import { createLandingFlow, loadLandingProduct } from './landing-flow.js';
import { createWhatsApp } from './whatsapp.js';
import { landingFormScript } from './landing-form.js';
import { createLandingWorker } from './landing-worker.js';
import { createExchangeRates, summarizeCountries } from './overview.js';
import {createWhatsAppInbox} from './whatsapp-inbox.js';
import {installWhatsAppInbox} from './whatsapp-http.js';
import {createWhatsAppAgent} from './whatsapp-agent.js';
import {createTrackingService} from './tracking.js';
import {createAdsManager} from './ads-manager.js';
import { createMetaWhatsAppManager } from './whatsapp-meta.js';

export const salesBus = new EventEmitter();
salesBus.setMaxListeners(100);

const recentSales = new Map();
export function broadcastSale(saleEvent) {
  try {
    if (!saleEvent?.id) return;
    const now = Date.now();
    for (const [id, time] of recentSales.entries()) {
      if (now - time > 60000) recentSales.delete(id);
    }
    const key = String(saleEvent.id);
    if (recentSales.has(key)) return;
    recentSales.set(key, now);
    salesBus.emit('sale', saleEvent);
  } catch {}
}

const app = express();
app.disable('x-powered-by');
const encryptionKey = process.env.CONNECTION_ENCRYPTION_KEY;
if (encryptionKey && Buffer.from(encryptionKey, 'base64').length !== 32) throw new Error('CONNECTION_ENCRYPTION_KEY no válida.');
const connections = createConnections({ get: getSetting, set: setSetting, encryptionKey, initial: { market: process.env.DROPEA_MARKET || 'CL', apiKey: process.env.DROPEA_API_KEY || '', secret: process.env.DROPEA_SIGNING_SECRET || '' } });
const config = connections.active;
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : null;
const scope = (settings = config) => `${settings.market}:${createHash('sha256').update(settings.apiKey || 'unconfigured').digest('hex').slice(0, 24)}`;
const stockRadar = createStockRadar(db);
const exchangeRates=createExchangeRates({get:getSetting,set:setSetting});
for (const country of connections.list().filter(c => c.configured)) {
  const key = scope(connections.load(country.market));
  if (!stockRadar.hasBaseline(key)) {
    const cached = readResources(key, 'products');
    const at = getSetting(`productsLastSync:${key}`);
    if (cached.length && at) {
      db.exec('BEGIN IMMEDIATE');
      try { stockRadar.record(key, cached, at); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  }
}
let syncing = false;
let lastError = null;
let productProgress = null;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const inbox=createWhatsAppInbox({db});
const landingFlow = createLandingFlow({db,connections,request:requestDropea,cacheOrder:(settings,order)=>upsert(scope(settings),'orders',order),onTransition:order=>{inbox.localOrder(order);if(order.inbound_id)inbox.linkInbound(order.inbound_id.split(':').at(-1),order.id);if(order.state==='WA_PENDING'||order.state==='RECEIVED'||order.status==='RECEIVED'){broadcastSale({id:String(order.id),orderCode:String(order.confirmation_code||order.id).slice(-6).toUpperCase(),productName:order.product_name||order.product||'Producto',quantity:order.quantity||1,totalAmount:Number(order.unit_price*order.quantity)||19990,currency:order.currency||'CLP',createdAt:Date.now()});}},canAutomatePhone:phone=>inbox.canAutomate(phone)});
for(const order of db.prepare('SELECT * FROM landing_orders').all())inbox.localOrder(order,{baseline:true});
for(const country of connections.list().filter(c=>c.configured)){const key=scope(connections.load(country.market));for(const order of readResources(key,'orders'))inbox.remoteOrder(key,order,{baseline:true});}
observeOrders((key,order)=>{inbox.remoteOrder(key,order);if(order&&(order.status==='PENDING'||order.status==='CONFIRMED'||order.state==='Pendientes')){broadcastSale({id:String(order.id),orderCode:String(order.id).slice(-6).toUpperCase(),productName:order.line_items?.[0]?.product_name||'Producto Dropea',quantity:order.line_items?.reduce((s,l)=>s+l.quantity,0)||1,totalAmount:Number(order.total_amount)||0,currency:order.currency||'CLP',createdAt:Date.now()});}});
let agent;
const whatsapp = createWhatsApp({
  db,
  encryptionKey,
  onPersist: message => inbox.incoming(message),
  onReceipt: receipt => inbox.receipt(receipt),
  onAccount: account => inbox.setAccount(account),
  onSendStart: message => inbox.beginSend(message),
  onSent: (id, result) => inbox.sent(id, result),
  onSendFailure: id => inbox.sendFailed(id),
  onMessage: async message => {
    try {
      const confirmedOrCancelled = landingFlow.receive(message);
      if (confirmedOrCancelled) landingWorker.kick();
      if (agent) await agent.handleIncoming({ ...message, confirmedOrCancelled });
    } catch (err) {
      console.error('WhatsApp Agent message error:', err);
    }
  }
});
agent = createWhatsAppAgent({ db, whatsapp, inbox });
const ads = createAdsManager({ db, encryptionKey });
const metaWhatsApp = createMetaWhatsAppManager({ db });
const adsTimer = setInterval(() => {
  try { ads.evaluateAutomations(); } catch {}
}, 15 * 60 * 1000);
adsTimer.unref();
whatsapp.resume().catch(()=>console.error('WhatsApp: no se pudo recuperar la sesión.'));
const landingWorker=createLandingWorker({flow:landingFlow,whatsapp,canDispatch:()=>!syncing,onError:()=>console.error('Landings: ciclo pendiente de reintento.')});
const landingTimer=setInterval(()=>landingWorker.kick(),1000);
landingTimer.unref();

function sourceIdForLive(publicId){return landingFlow.sourceByPublic(publicId)?.id;}
const liveHTTP=createLiveHTTP({app,express,db,geo:landingGeo,origin:publicOrigin,loadRates:()=>exchangeRates.load(),
  owner:process.env.ADMIN_USERNAME||'admin',offers:landingFlow,connected:{url:process.env.LIVE_CAMPAIGN_REPORT_URL,token:process.env.LIVE_CAMPAIGN_TOKEN,owner:process.env.LIVE_CAMPAIGN_OWNER,landingId:process.env.LIVE_CAMPAIGN_LANDING_ID}});

// Public, scoped intake: never gives access to the authenticated CRM API.
app.use('/api/landings/:publicId/orders',(req,res,next)=>{
  const source=landingFlow.sourceByPublic(req.params.publicId);
  res.set('Cache-Control','no-store');
  if(source?.active&&req.get('origin')===source.origin){res.set('Access-Control-Allow-Origin',source.origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type, X-Landing-Key');}
  if(req.method==='OPTIONS')return res.sendStatus(source?.active&&req.get('origin')===source.origin?204:403);
  next();
});
app.post('/api/landings/:publicId/orders',express.json({limit:'16kb'}),(req,res,next)=>{
  try{const order=landingFlow.accept(req.params.publicId,req.body,{origin:req.get('origin'),apiKey:req.get('X-Landing-Key'),ip:req.get('X-Real-IP')||req.socket.remoteAddress});try{liveHTTP.live.orderReceived(sourceIdForLive(req.params.publicId),order.id,req.body);}catch{console.error('Live: pedido guardado, estadísticas pendientes.');}res.status(202).json(order);landingWorker.kick();}catch(error){next(error);}
});
app.get('/api/landings/:publicId/form.js',(req,res)=>{
  const source=landingFlow.sourceByPublic(req.params.publicId);if(!source?.active)return res.status(404).type('text').send('Formulario no disponible.');
  if(!source.origin||source.unit_price<=0)return res.status(409).type('text').send('Esta conexión utiliza la API del servidor. Registra una URL y un precio fijo para usar el formulario del navegador.');
  res.set('Cache-Control','no-store').type('application/javascript').send(landingFormScript(source,publicOrigin||`http://127.0.0.1:${process.env.PORT||3001}`));
});

// Public video streaming for ads
app.get('/api/ads/video/:id/stream', asyncRoute(async (req, res) => {
  const row = db.prepare('SELECT video_url FROM ads_creatives WHERE id=?').get(req.params.id);
  if (!row || !row.video_url) return res.status(404).send('Video not found');
  const headers = {};
  if (req.headers.range) headers['Range'] = req.headers.range;
  const upstream = await fetch(row.video_url, { headers });
  res.status(upstream.status);
  ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
    const val = upstream.headers.get(h);
    if (val) res.setHeader(h, val);
  });
  if (upstream.body) {
    const { Readable } = await import('node:stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}));

// Only this signed endpoint may be forwarded from a public reverse proxy.
app.post('/api/webhooks/dropea', express.raw({ type: 'application/json', limit: '2mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.get('X-Dropea-Signature')) return res.status(401).json({ error: 'Firma inválida.' });
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'JSON inválido.' }); }
  // The untrusted market only selects the candidate key; verify before storing any data.
  if (!markets.includes(event?.market)) return res.status(400).json({ error: 'Mercado no válido.' });
  const eventConfig = connections.load(event.market);
  if (!verifySignature(req.body, req.get('X-Dropea-Signature'), eventConfig.secret)) return res.status(401).json({ error: 'Firma inválida.' });
  if (!topics.includes(event.topic) || !event.event_id || !Number.isInteger(event.resource_id) || event.resource?.id !== event.resource_id || !Number.isFinite(Date.parse(event.event_at))) return res.status(400).json({ error: 'Evento no válido para este mercado.' });
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?)').run(event.event_id, scope(eventConfig), event.topic, String(event.resource_id), new Date().toISOString());
    if(insert.changes&&event.topic.startsWith('order.'))inbox.remoteOrder(scope(eventConfig),event.resource,{eventId:event.event_id,eventAt:event.event_at,source:'webhook'});
    if (insert.changes) upsert(scope(eventConfig), event.topic.startsWith('order.') ? 'orders' : 'issues', event.resource, event.event_at);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  res.json({ received: true });
});

// Verify origin before processing login or authenticated requests. Node stays on loopback.
app.use('/api', (req, res, next) => {
  const allowed = ['127.0.0.1:3001', 'localhost:3001', '127.0.0.1:5173', 'localhost:5173', `127.0.0.1:${process.env.PORT || 3001}`, `localhost:${process.env.PORT || 3001}`];
  if (!allowed.includes(req.get('host'))) return res.status(403).json({ error: 'Host no permitido.' });
  const origin = req.get('origin');
  if (origin && origin !== publicOrigin && !allowed.some(host => origin === `http://${host}`)) return res.status(403).json({ error: 'Origen no permitido.' });
  res.set('Cache-Control', 'no-store'); next();
});
app.use(express.json({ limit: '16kb' }));
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD_HASH) throw new Error('Configura ADMIN_PASSWORD_HASH antes de publicar el CRM.');
installAuth(app, db, { username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH, secure: publicOrigin?.startsWith('https://') || false });
installWhatsAppInbox(app,{inbox,whatsapp,worker:landingWorker,connections,requestDropea,scope});
liveHTTP.installPrivate();
app.get('/api/whatsapp',(_req,res)=>res.json({...whatsapp.status(),queue:landingFlow.queueSummary(),automatic:inbox.settings().automatic}));
app.post('/api/whatsapp/connect',asyncRoute(async(_req,res)=>{await whatsapp.connect();res.json({...whatsapp.status(),automatic:inbox.settings().automatic});}));
// Meta WhatsApp Cloud API Endpoints
app.get('/api/whatsapp/meta', (_req, res) => res.json(metaWhatsApp.getCredentials()));
app.post('/api/whatsapp/meta', asyncRoute(async (req, res) => res.json(await metaWhatsApp.saveCredentials(req.body || {}))));
app.post('/api/whatsapp/meta/test', asyncRoute(async (req, res) => res.json(await metaWhatsApp.sendTestMessage(req.body || {}))));

app.post('/api/whatsapp/disconnect',asyncRoute(async(_req,res)=>{await whatsapp.disconnect();res.json({...whatsapp.status(),automatic:inbox.settings().automatic});}));
app.get('/api/landings',(_req,res)=>res.json(landingFlow.listSources()));
app.post('/api/landings',asyncRoute(async(req,res)=>res.status(201).json(await landingFlow.addSource(req.body))));
app.patch('/api/landings/:id',(req,res)=>{if(typeof req.body.active==='boolean')landingFlow.toggleSource(req.params.id,req.body.active);else if(typeof req.body.url==='string')landingFlow.updateUrl(req.params.id,req.body.url);else return res.status(400).json({error:'Indica una URL o el estado de la landing.'});res.json({updated:true});});
app.post('/api/landings/:id/key',(req,res)=>res.json(landingFlow.rotateKey(req.params.id)));
app.get('/api/landing-product',asyncRoute(async(req,res)=>{if(!markets.includes(req.query.market))return res.status(400).json({error:'País inválido.'});res.json(await loadLandingProduct(connections.load(req.query.market),Number(req.query.id),requestDropea));}));
app.get('/api/landing-options',asyncRoute(async(req,res)=>{const market=req.query.market;if(!markets.includes(market))return res.status(400).json({error:'País inválido.'});const settings=connections.load(market);if(!settings.apiKey)return res.status(409).json({error:'Conecta primero la API de este país.'});res.json({shops:await fetchAll(settings,'shops'),products:readResources(scope(settings),'products').map(p=>({id:p.id,name:p.name,variants:p.variants?.map(v=>({id:v.variant_id,name:v.name,price:v.price}))}))});}));
app.get('/api/landing-orders', (req,res)=>res.json(landingFlow.orders(markets.includes(req.query.market)?req.query.market:config.market)));
app.post('/api/landing-orders/:id/retry-message',(req,res)=>{landingFlow.retryMessage(req.params.id);res.json({queued:true});});

// Ads & Automation Endpoints
app.get('/api/ads/summary', (_req, res) => res.json(ads.getSummary()));
app.get('/api/ads/credentials', (_req, res) => res.json(ads.getCredentials()));
app.post('/api/ads/credentials', asyncRoute(async (req, res) => res.json(await ads.saveCredentials(req.body?.platform, req.body || {}))));
app.get('/api/ads/campaigns', asyncRoute(async (req, res) => res.json(await ads.listCampaigns({ platform: req.query.platform, status: req.query.status, sync: req.query.sync }))));
let lastAutoMetaSync = 0;
app.get('/api/ads/hierarchy', asyncRoute(async (req, res) => {
  const now = Date.now();
  if (req.query.sync === 'true' || (now - lastAutoMetaSync > 30000)) {
    try {
      await ads.syncMeta(true);
      lastAutoMetaSync = now;
    } catch {}
  }
  res.json(ads.getHierarchy(req.query.platform || 'all'));
}));
app.post('/api/ads/sync', asyncRoute(async (_req, res) => { await ads.syncMeta(true); res.json(ads.getHierarchy()); }));
app.post('/api/ads/campaigns/:id/toggle', asyncRoute(async (req, res) => res.json(await ads.toggleCampaign(req.params.id, req.body?.status))));
app.post('/api/ads/campaigns/:id/budget', asyncRoute(async (req, res) => res.json(await ads.updateBudget(req.params.id, req.body || {}))));
app.post('/api/ads/adsets/:id/toggle', asyncRoute(async (req, res) => res.json(await ads.toggleAdSet(req.params.id, req.body?.status))));
app.post('/api/ads/adsets/:id/budget', asyncRoute(async (req, res) => res.json(await ads.updateAdSetBudget(req.params.id, req.body || {}))));
app.post('/api/ads/creatives/:id/toggle', asyncRoute(async (req, res) => res.json(await ads.toggleCreative(req.params.id, req.body?.status))));
app.get('/api/ads/rules', (_req, res) => res.json(ads.listRules()));
app.post('/api/ads/rules', (req, res) => res.status(201).json(ads.createRule(req.body || {})));
app.patch('/api/ads/rules/:id', (req, res) => res.json(ads.toggleRule(req.params.id, req.body?.enabled)));
app.delete('/api/ads/rules/:id', (req, res) => res.json(ads.deleteRule(req.params.id)));
app.post('/api/ads/evaluate', (_req, res) => res.json(ads.evaluateAutomations()));
app.get('/api/ads/logs', (req, res) => res.json(ads.listLogs(Number(req.query.limit) || 50)));
let lastTestSaleAt = 0;
app.post('/api/test/sale', asyncRoute(async (req, res) => {
  const now = Date.now();
  if (now - lastTestSaleAt < 500) {
    return res.status(429).json({ error: 'Por favor espera un instante antes de enviar otra venta de prueba.' });
  }
  lastTestSaleAt = now;
  const order = landingFlow.createTestOrder({
    name: req.body?.name || 'Manuel Bustos',
    phone: req.body?.phone || '+56928148914',
    productName: req.body?.product_name || 'Pelota Saltarina Glow Pro',
    quantity: Number(req.body?.quantity) || 1,
    unitPrice: Number(req.body?.unit_price) || 19990,
    currency: req.body?.currency || 'CLP',
    brandName: req.body?.brand_name || 'Nexora Store'
  });
  // Clear delivery timeout and kick worker for instant delivery
  db.prepare("INSERT INTO landing_delivery VALUES ('whatsapp',0) ON CONFLICT(id) DO UPDATE SET next_send=0").run();
  landingWorker.kick();
  const saleEvent = {
    id: order.id,
    orderCode: order.confirmation_code,
    productName: order.product_name,
    quantity: order.quantity,
    totalAmount: order.unit_price * order.quantity,
    currency: order.currency,
    createdAt: Date.now()
  };
  broadcastSale(saleEvent);
  res.json({
    success: true,
    order,
    saleEvent
  });
}));

const trackingService = createTrackingService({ db });
app.get('/api/tracking', (req, res) => {
  try {
    const list = trackingService.listTrackableOrders(Number(req.query.limit) || 100);
    res.json({ orders: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/tracking/:query', (req, res) => {
  try {
    const result = trackingService.getOrderTracking(req.params.query);
    if (!result) return res.status(404).json({ error: 'Pedido no encontrado para seguimiento.' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/stream', (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  const onSale = (saleEvent) => {
    try {
      res.write(`event: sale\ndata: ${JSON.stringify(saleEvent)}\n\n`);
    } catch {}
  };
  salesBus.on('sale', onSale);
  const timer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {}
  }, 20000);
  timer.unref();
  req.on('close', () => {
    clearInterval(timer);
    salesBus.off('sale', onSale);
  });
});
app.get('/api/status', (_req, res) => res.json({ configured: Boolean(config.apiKey), market: config.market, markets: connections.list(), signingConfigured: Boolean(config.secret), persistenceEnabled: Boolean(encryptionKey), syncing, productSync: productProgress?.scope === scope() ? { loaded: productProgress.loaded, total: productProgress.total } : null, productsLastSync: getSetting(`productsLastSync:${scope()}`) || null, productsError: getSetting(`productsError:${scope()}`) || null, lastError, lastSync: getSetting(`lastSync:${scope()}`) || null }));
app.get('/api/overview',asyncRoute(async(req,res)=>{
  if(!['CLP','MXN','EUR'].includes(req.query.currency||'CLP')||!['Hoy','7 días','Este mes','Todo'].includes(req.query.period||'Hoy'))return res.status(400).json({error:'Moneda o período inválido.'});
  const countries=connections.list().map(country=>{const key=scope(connections.load(country.market));return {...country,orders:country.configured?readResources(key,'orders'):[],lastSync:getSetting(`lastSync:${key}`)||null,error:getSetting(`overviewError:${key}`)||null};});
  res.json(summarizeCountries(countries,{currency:req.query.currency||'CLP',period:req.query.period||'Hoy',fx:await exchangeRates.load()}));
}));
app.post('/api/sync/all',asyncRoute(async(_req,res)=>{
  if(syncing)return res.status(409).json({error:'Ya hay una sincronización en curso.'});
  const countries=connections.list().filter(country=>country.configured).map(country=>connections.load(country.market));
  if(!countries.length)return res.status(409).json({error:'Conecta al menos un país para sincronizar.'});
  syncing=true;const results=[];
  try{for(const settings of countries){const key=scope(settings);try{
    const orders=await fetchAll(settings,'orders'),at=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');try{for(const order of orders)upsert(key,'orders',order,at);setSetting(`lastSync:${key}`,at);setSetting(`overviewError:${key}`,'');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    results.push({market:settings.market,orders:orders.length});
  }catch(error){setSetting(`overviewError:${key}`,error.message);results.push({market:settings.market,error:error.message});}}
  res.json({results});}finally{syncing=false;}
}));
app.post('/api/market', (req, res) => {
  if (!markets.includes(req.body?.market)) return res.status(400).json({ error: 'Selecciona un país válido.' });
  if (syncing) return res.status(409).json({ error: 'Espera a que termine la sincronización para cambiar de país.' });
  connections.select(req.body.market); lastError = null;
  res.json({ market: config.market, configured: Boolean(config.apiKey) });
});
app.post('/api/connection', asyncRoute(async (req, res) => {
  const { apiKey, market, signingSecret } = req.body;
  if (syncing) return res.status(409).json({ error: 'Espera a que termine la sincronización para cambiar la conexión.' });
  if (!markets.includes(market) || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 8000 || /\s/.test(apiKey) || (signingSecret && !/^[a-fA-F0-9]{64}$/.test(signingSecret))) return res.status(400).json({ error: 'Revisa el mercado, la API Key y el secreto de firma (64 caracteres hexadecimales).' });
  await requestDropea({ market, apiKey }, 'me');
  connections.save({ market, apiKey, secret: signingSecret || '' });
  connections.select(market);
  lastError = null;
  res.json({ connected: true, market });
}));
app.delete('/api/connection', (_req, res) => {
  if (syncing) return res.status(409).json({ error: 'Espera a que termine la sincronización para desconectar.' });
  connections.save({ market: config.market, apiKey: '', secret: '' });
  connections.select(config.market); lastError = null; res.json({ disconnected: true });
});
app.get('/api/data', (_req, res) => {
  const signals = stockRadar.signals(scope());
  res.json({ orders: readResources(scope(), 'orders'), products: readResources(scope(), 'products').map(({ id, product_id, name, status, media, variants }) => ({ id, product_id, name, status, media, stockRadar: signals[String(id ?? product_id)] || null, variants: variants?.map(({ variant_id, name, sku, stock, price, currency }) => ({ variant_id, name, sku, stock, price, currency })) })), shops: readResources(scope(), 'shops'), issues: readResources(scope(), 'issues'), events: db.prepare('SELECT * FROM events WHERE market=? ORDER BY received DESC LIMIT 50').all(scope()) });
});

async function importProducts(snapshot) {
  const resourceScope = scope(snapshot);
  productProgress = { scope: resourceScope, loaded: 0, total: null };
  const products = await fetchAll(snapshot, 'products', fetch, { onPage: progress => { productProgress = { scope: resourceScope, ...progress }; } });
  const time = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    stockRadar.record(resourceScope, products, time);
    db.prepare('DELETE FROM resources WHERE market=? AND kind=?').run(resourceScope, 'products');
    for (const product of products) upsert(resourceScope, 'products', product, time);
    setSetting(`productsLastSync:${resourceScope}`, time); setSetting(`productsError:${resourceScope}`, '');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { products: products.length, lastSync: time };
}

app.post('/api/sync/products', asyncRoute(async (_req, res) => {
  if (!config.apiKey) return res.status(409).json({ error: 'Conecta la API Key de este país para cargar sus productos.' });
  if (syncing) return res.status(409).json({ error: 'Ya hay una sincronización en curso.' });
  syncing = true; lastError = null;
  const snapshot = { ...config }; const resourceScope = scope(snapshot);
  productProgress = { scope: resourceScope, loaded: 0, total: null };
  try {
    res.json(await importProducts(snapshot));
  } catch (err) {
    lastError = err.message; setSetting(`productsError:${resourceScope}`, err.message); throw err;
  } finally { syncing = false; productProgress = null; }
}));

app.post('/api/sync', asyncRoute(async (_req, res) => {
  if (!config.apiKey) return res.status(409).json({ error: 'Conecta tu API Key de Dropea para sincronizar.' });
  if (syncing) return res.status(409).json({ error: 'Ya hay una sincronización en curso.' });
  syncing = true; lastError = null;
  const snapshot = { ...config };
  try {
    // Sequential requests respect upstream capacity; every list is fully paginated.
    const orders = await fetchAll(snapshot, 'orders');
    const optionalErrors = [];
    const resources = { orders };
    for (const kind of ['shops', 'products', 'issues']) {
      try { resources[kind] = await fetchAll(snapshot, kind); }
      catch (err) { optionalErrors.push(`${kind}: ${err.message}`); if (kind === 'products') setSetting(`productsError:${scope(snapshot)}`, err.message); }
    }
    const time = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (resources.products) { stockRadar.record(scope(snapshot), resources.products, time); db.prepare('DELETE FROM resources WHERE market=? AND kind=?').run(scope(snapshot), 'products'); }
      for (const [kind, items] of Object.entries(resources)) for (const resource of items) upsert(scope(snapshot), kind, resource, time);
      setSetting(`lastSync:${scope(snapshot)}`, time);
      if (resources.products) { setSetting(`productsLastSync:${scope(snapshot)}`, time); setSetting(`productsError:${scope(snapshot)}`, ''); }
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    lastError = optionalErrors.length ? optionalErrors.join(' · ') : null;
    res.json({ synced: orders.length, lastSync: time, warnings: optionalErrors });
  } catch (err) { lastError = err.message; throw err; }
  finally { syncing = false; }
}));
app.get('/api/subscriptions', asyncRoute(async (_req, res) => res.json(await requestDropea(config, 'webhooks'))));

// Observe saved countries every 30 minutes without modifying products in Dropea.
const radarTimer = setInterval(async () => {
  if (syncing) return;
  syncing = true;
  try {
    for (const country of connections.list().filter(c => c.configured)) {
      const snapshot = connections.load(country.market), key = scope(snapshot);
      const last = getSetting(`productsLastSync:${key}`);
      if (last && Date.now()-Date.parse(last) < 25*60*1000) continue;
      try { await importProducts(snapshot); }
      catch (error) { setSetting(`productsError:${key}`, error.message); console.error(`Radar ${country.market}: ${error.code || 'IMPORT_FAILED'}`); }
    }
  } finally { syncing = false; productProgress = null; }
}, 30*60*1000);
radarTimer.unref();
app.post('/api/subscriptions', asyncRoute(async (req, res) => {
  const { topic, url } = req.body;
  let parsed; try { parsed = new URL(url); } catch { /* handled below */ }
  if (!topics.includes(topic) || parsed?.protocol !== 'https:' || parsed.username || parsed.password || !config.secret) return res.status(400).json({ error: 'Indica un tema válido, una URL HTTPS pública y configura el secreto de firma.' });
  res.status(201).json(await requestDropea(config, 'webhooks', { method: 'POST', body: { topic, url } }));
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
if (existsSync('dist/index.html')) {
  app.use(express.static('dist'));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: 'dist' }));
}
app.use((err, _req, res, _next) => res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ code: err.code || 'REQUEST_FAILED', error: err.type === 'entity.parse.failed' ? 'JSON inválido.' : err.message === 'The operation was aborted due to timeout' ? 'Dropea tardó demasiado en responder. Reintenta.' : err.message || 'No se pudo completar la solicitud.' }));
app.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(`CRM: http://127.0.0.1:${process.env.PORT || 3001}`));
