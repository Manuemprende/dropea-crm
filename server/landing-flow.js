import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { markets } from './core.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const failure = (message,status=400) => Object.assign(new Error(message),{status});
const clean = (value,max=200) => typeof value==='string' ? value.trim().slice(0,max) : '';
const now = () => new Date().toISOString();
function landingUrl(value){
  if(!value||!String(value).trim())return null;
  let url;try{url=new URL(value);}catch{throw failure('Indica una URL HTTPS válida o deja la URL vacía.');}
  if(url.protocol!=='https:'||url.username||url.password)throw failure('La URL de landing debe usar HTTPS y no incluir credenciales.');
  return url;
}
export async function loadLandingProduct(config,id,request){
  if(!Number.isSafeInteger(id)||id<1)throw failure('Indica un ID de producto válido.');
  const response=await request(config,`products/${id}`),product=response?.product||response;
  if((product?.id??product?.product_id)!==id||!product.name)throw failure('Dropea no devolvió un producto válido para este país.');
  return {id,name:product.name,variants:(product.variants||[]).map(v=>({id:v.variant_id,name:v.name||'Variante',price:v.price}))};
}
export function parseConfirmation(text) {
  if(typeof text!=='string'||text.length>300||/[?¿]/.test(text))return null;
  const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.,!¡:;]+/g,' ').replace(/\s+/g,' ').trim();
  
  // Option number: e.g. "1", "2", "pedido 1", "opcion 2", "el 1", "#1", "confirmo 1", "si 2"
  const optionMatch = /^(?:confirmo|si|confirmar|el|pedido|opcion|cancelar|cancelo|anular)?\s*#?([1-9])\b/i.exec(normalized) ||
                      /(?:confirmo|si|confirmar|el|pedido|opcion|cancelar|cancelo|anular)\s*#?([1-9])$/i.exec(normalized);

  // Hex confirmation code: e.g. "#78F13CA9", "78F13CA9", "confirmo #78F13CA9"
  const suffix = /(?:^|\s+)#?([a-f0-9]{2,10})$/i.exec(normalized);

  const cancelPrefix = /^(?:cancelar|cancelo|cancelado|cancela|anular|no lo quiero)/i.test(normalized);
  const action = cancelPrefix ? 'CANCELAR' : 'CONFIRMO';

  if (optionMatch && !suffix) {
    const optionIndex = parseInt(optionMatch[1], 10);
    return { action, code: null, optionIndex };
  }

  if (suffix) {
    const code = suffix[1].toUpperCase();
    const phrase = normalized.slice(0, suffix.index).trim();
    const yes = new Set(['', 'si', 'confirmo', 'confirmado', 'confirmar', 'confirma', 'si confirmo', 'si confirmado', 'si gracias', 'si por favor', 'confirmo gracias', 'confirmo el pedido', 'confirmo mi pedido', 'si confirmo el pedido', 'si confirmo mi pedido', 'confirmo el pedido numero', 'confirmo pedido', 'confirmo pedido numero', 'confirmo la compra', 'confirmo mi compra', 'si lo quiero', 'si quiero', 'si quiero el pedido', 'si lo compre', 'si fui yo', 'si es mi pedido', 'si es correcto', 'si esta correcto', 'si esta bien', 'esta bien', 'esta correcto', 'todo correcto', 'si todo correcto', 'es correcto', 'correcto', 'de acuerdo', 'ok', 'okay', 'okey', 'listo', 'acepto', 'si acepto', 'dale', 'pedido', 'opcion', 'el']);
    const no = new Set(['cancelar', 'cancelo', 'cancelado', 'cancela', 'cancelar pedido', 'cancelo el pedido', 'cancelar el pedido', 'cancelo mi pedido', 'no lo quiero', 'no quiero el pedido', 'anular']);
    if (phrase === '' || yes.has(phrase)) return { action: 'CONFIRMO', code, optionIndex: null };
    if (no.has(phrase)) return { action: 'CANCELAR', code, optionIndex: null };
  }

  const yes=new Set(['si','confirmo','confirmado','confirmar','confirma','si confirmo','si confirmado','si gracias','si por favor','confirmo gracias','confirmo el pedido','confirmo mi pedido','si confirmo el pedido','si confirmo mi pedido','confirmo el pedido numero','confirmo pedido','confirmo pedido numero','confirmo la compra','confirmo mi compra','si lo quiero','si quiero','si quiero el pedido','si lo compre','si fui yo','si es mi pedido','si es correcto','si esta correcto','si esta bien','esta bien','esta correcto','todo correcto','si todo correcto','es correcto','correcto','de acuerdo','ok','okay','okey','listo','acepto','si acepto','dale']);
  const no=new Set(['cancelar','cancelo','cancelado','cancela','cancelar pedido','cancelo el pedido','cancelar el pedido','cancelo mi pedido','no lo quiero','no quiero el pedido','anular']);
  const resolvedAction=yes.has(normalized)?'CONFIRMO':no.has(normalized)?'CANCELAR':null;
  return resolvedAction?{action:resolvedAction,code:null,optionIndex:null}:null;
}
export function normalizePhone(value) {
  const number=String(value||'').replace(/[\s().-]/g,'');
  if(!/^\+[1-9]\d{7,14}$/.test(number)) throw failure('Indica el teléfono con código de país, por ejemplo +569 seguido del número.');
  return number;
}

export function createLandingFlow({db,connections,request,cacheOrder=()=>{},onTransition=()=>{},canAutomatePhone=()=>true,clock=now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS landing_sources (
    id TEXT PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, origin TEXT NOT NULL,
    market TEXT NOT NULL, store_id INTEGER NOT NULL, product_name TEXT NOT NULL, variant_id INTEGER NOT NULL,
    unit_price REAL NOT NULL, currency TEXT NOT NULL, api_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS landing_orders (
    id TEXT PRIMARY KEY, source_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    market TEXT NOT NULL, customer TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL,
    currency TEXT NOT NULL, product_name TEXT NOT NULL, store_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
    phone TEXT NOT NULL, confirmation_code TEXT UNIQUE NOT NULL, state TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consent_at TEXT NOT NULL, sent_at TEXT,
    confirmed_at TEXT, inbound_id TEXT, outbound_id TEXT, remote_id INTEGER, remote_status TEXT,
    create_key TEXT NOT NULL, confirm_key TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt TEXT, UNIQUE(source_id,request_id));
    CREATE INDEX IF NOT EXISTS landing_orders_queue ON landing_orders(state,next_attempt);
    CREATE TABLE IF NOT EXISTS landing_inbound (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS landing_limits (id TEXT PRIMARY KEY, used INTEGER NOT NULL, resets INTEGER NOT NULL);`);
  db.exec('CREATE TABLE IF NOT EXISTS landing_accounts (source_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)');
  for(const [column,type] of [['product_id','INTEGER'],['landing_url','TEXT']])if(!db.prepare('PRAGMA table_info(landing_sources)').all().some(field=>field.name===column))db.exec(`ALTER TABLE landing_sources ADD COLUMN ${column} ${type}`);
  for(const table of ['landing_sources','landing_orders']){
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='brand_name'))db.exec(`ALTER TABLE ${table} ADD COLUMN brand_name TEXT`);
  }
  if(!db.prepare('PRAGMA table_info(landing_orders)').all().some(column=>column.name==='requested_at'))db.exec('ALTER TABLE landing_orders ADD COLUMN requested_at TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS landing_orders_phone ON landing_orders(phone,state);
    CREATE TABLE IF NOT EXISTS landing_reply_queue (id TEXT PRIMARY KEY,phone TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL);`);
  db.prepare("UPDATE landing_reply_queue SET state='UNKNOWN' WHERE state='SENDING'").run();
  db.exec('CREATE TABLE IF NOT EXISTS landing_delivery (id TEXT PRIMARY KEY, next_send INTEGER NOT NULL)');
  // An interrupted send must be reviewed, since delivery may already have happened.
  db.prepare("UPDATE landing_orders SET state='MESSAGE_UNKNOWN',error='El servidor reinició durante el envío. Revisa WhatsApp antes de reenviar.' WHERE state='WA_SENDING'").run();
  db.prepare("UPDATE landing_orders SET state='CREATE_PENDING' WHERE state='CREATING'").run();
  db.prepare("UPDATE landing_orders SET state='CONFIRM_PENDING' WHERE state='CONFIRMING'").run();
  const sourceByPublic=id=>db.prepare('SELECT * FROM landing_sources WHERE public_id=?').get(id);
  const getOrder=id=>db.prepare('SELECT * FROM landing_orders WHERE id=?').get(id);
  const set=(id,state,extras={})=>{
    const before=getOrder(id);
    const allowed=['error','next_attempt','remote_id','remote_status','confirmed_at','inbound_id','outbound_id','sent_at'];
    const entries=Object.entries(extras).filter(([k])=>allowed.includes(k));
    db.prepare(`UPDATE landing_orders SET state=?${entries.map(([k])=>`,${k}=?`).join('')} WHERE id=?`).run(state,...entries.map(([,v])=>v),id);
    if(before)onTransition(getOrder(id));
  };
  const serialize=row=>row?{...row,customer:JSON.parse(row.customer),confirmation_code:undefined,create_key:undefined,confirm_key:undefined,request_hash:undefined}:null;
  const limit=(id,max,windowMs)=>{
    const time=Date.parse(clock());db.prepare('DELETE FROM landing_limits WHERE resets<=?').run(time);
    const old=db.prepare('SELECT used FROM landing_limits WHERE id=?').get(id)?.used||0;
    if(old>=max)throw failure('Demasiadas solicitudes. Intenta nuevamente más tarde.',429);
    db.prepare('INSERT INTO landing_limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET used=used+1').run(id,time+windowMs);
  };
  return {
    sourceByPublic,
    listSources(){return db.prepare('SELECT id,public_id,name,origin,market,store_id,product_id,product_name,variant_id,unit_price,currency,active,created_at,brand_name,landing_url FROM landing_sources ORDER BY created_at DESC').all();},
    queueSummary(){return {pending:db.prepare("SELECT COUNT(*) AS count FROM landing_orders WHERE state='WA_PENDING' AND expires_at>?").get(clock()).count,waiting:db.prepare("SELECT COUNT(*) AS count FROM landing_orders WHERE state='WAITING_CONFIRMATION' AND expires_at>?").get(clock()).count,intervalSeconds:5};},
    async addSource(input) {
      if(!input||typeof input!=='object'||Array.isArray(input))throw failure('Configuración de landing inválida.');
      const url=landingUrl(input.url);
      const name=clean(input.name,100),market=input.market||'CL';let productName=clean(input.product_name,160);
      if(!markets.includes(market))throw failure('Selecciona un país válido.');
      const config=connections.load(market);if(!config.apiKey)throw failure('Conecta primero Dropea para este país.',409);
      const unitPrice=input.unit_price==null?0:input.unit_price;
      let variantId=input.variant_id;
      if(input.product_id){
        const product=await loadLandingProduct(config,input.product_id,request);productName=productName||clean(product.name,160);
        if(!variantId&&product.variants.length===1)variantId=product.variants[0].id;
        if(!product.variants.some(v=>v.id===variantId))throw failure('Selecciona la variante de este producto. Si tiene varias, el ID de producto por sí solo no define cuál se vende.');
      }
      if(!name||!productName||!markets.includes(market)||!Number.isSafeInteger(input.store_id)||input.store_id<1||!Number.isSafeInteger(variantId)||variantId<1||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1e9)throw failure('Completa el nombre, país, tienda y producto. El precio fijo es opcional y debe ser válido.');
      const storeResponse=await request(config,`shops/${input.store_id}`),store=storeResponse?.shop||storeResponse;if(store?.id!==input.store_id||store.status==='DELETED'||store.status==='INACTIVE')throw failure('La tienda no está activa o no pertenece a esta cuenta.');
      const id=randomUUID(),publicId=randomBytes(18).toString('base64url'),apiKey='lp_'+randomBytes(32).toString('base64url');
      const brandName=clean(input.brand_name,100)||clean(store.name,100)||name;
      db.prepare('INSERT INTO landing_sources (id,public_id,name,origin,market,store_id,product_name,variant_id,unit_price,currency,api_hash,active,created_at,brand_name,product_id,landing_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)').run(id,publicId,name,url?.origin||'',market,input.store_id,productName,variantId,unitPrice,market==='CL'?'CLP':market==='MX'?'MXN':'EUR',hash(apiKey),clock(),brandName,input.product_id||null,url?.href||null);
      db.prepare('INSERT INTO landing_accounts VALUES (?,?)').run(id,hash(config.apiKey));
      return {...db.prepare('SELECT id,public_id,name,origin,market,store_id,product_id,product_name,variant_id,unit_price,currency,active,brand_name,landing_url FROM landing_sources WHERE id=?').get(id),apiKey};
    },
    toggleSource(id,active){const changed=db.prepare('UPDATE landing_sources SET active=? WHERE id=?').run(active?1:0,id);if(!changed.changes)throw failure('Landing no encontrada.',404);},
    updateUrl(id,value){const url=landingUrl(value);const changed=db.prepare('UPDATE landing_sources SET origin=?,landing_url=? WHERE id=?').run(url?.origin||'',url?.href||null,id);if(!changed.changes)throw failure('Landing no encontrada.',404);},
    rotateKey(id){const key='lp_'+randomBytes(32).toString('base64url');const changed=db.prepare('UPDATE landing_sources SET api_hash=? WHERE id=?').run(hash(key),id);if(!changed.changes)throw failure('Landing no encontrada.',404);return {apiKey:key};},
    accept(publicId,input,{origin,apiKey,ip='unknown'}={}) {
      if(!input||typeof input!=='object'||Array.isArray(input))throw failure('Formulario inválido.');
      const source=sourceByPublic(publicId);if(!source||!source.active)throw failure('Formulario no disponible.',404);
      // Browser forms use a scoped public ID, an exact origin, consent and strict quotas.
      // Server integrations use a dedicated landing key; never the Dropea key.
      if(apiKey ? hash(apiKey)!==source.api_hash : !source.origin||origin!==source.origin)throw failure('Origen o clave de landing no válidos. Sin URL registrada, utiliza la clave desde el servidor de tu plataforma.',403);
      if(input.product_id!==undefined&&source.product_id&&Number(input.product_id)!==source.product_id)throw failure('El producto no corresponde a esta conexión de landing.');
      const unitPrice=source.unit_price>0?source.unit_price:apiKey?Number(input.unit_price):NaN;
      if(!Number.isFinite(unitPrice)||unitPrice<=0||unitPrice>1e9)throw failure('Envía un unit_price válido desde el servidor con la clave de landing, o configura un precio fijo para el formulario del navegador.');
      if(input.website)throw failure('Formulario no válido.');
      if(input.consent!==true)throw failure('Debes autorizar la confirmación de este pedido por WhatsApp.');
      const requestId=clean(input.request_id,100);if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))throw failure('El formulario necesita un identificador de solicitud válido.');
      const first=clean(input.first_name,80),last=clean(input.last_name,80),email=clean(input.email,150),phone=normalizePhone(input.phone);
      const customer={first_name:first,last_name:last,name:`${first} ${last}`,email,phone,address_line_1:clean(input.address,source.market==='MX'?200:100),city:clean(input.city,100),state:clean(input.state,100),postal_code:clean(input.postal_code,20),country:source.market};
      if(String(input.address||'').trim().length>(source.market==='MX'?200:100))throw failure('La dirección supera el largo permitido para este país.');
      if(!first||!last||!/^\S+@\S+\.\S+$/.test(email)||!customer.address_line_1||!customer.city||!customer.state||(source.market!=='CL'&&!customer.postal_code))throw failure('Completa nombre, apellidos, email, dirección, ciudad, región y código postal cuando corresponda.');
      const quantity=Number(input.quantity||1);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>5)throw failure('La cantidad debe estar entre 1 y 5.');
      const fingerprint=hash(JSON.stringify(source.unit_price>0?{customer,quantity}:{customer,quantity,unitPrice}));
      const existing=db.prepare('SELECT * FROM landing_orders WHERE source_id=? AND request_id=?').get(source.id,requestId);
      if(existing){if(existing.request_hash!==fingerprint)throw failure('Esta referencia ya corresponde a otro pedido.',409);return {id:existing.id,state:existing.state,duplicate:true};}
      limit(`ip:${hash(ip)}`,6,60000);limit(`phone:${phone}`,3,3600000);limit(`source:${source.id}`,120,3600000);
      const id=randomUUID(),at=clock(),expires=new Date(Date.parse(at)+24*3600000).toISOString();
      db.prepare(`INSERT INTO landing_orders (id,source_id,request_id,request_hash,market,customer,quantity,unit_price,currency,product_name,store_id,variant_id,phone,confirmation_code,state,created_at,expires_at,consent_at,create_key,confirm_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,source.id,requestId,fingerprint,source.market,JSON.stringify(customer),quantity,unitPrice,source.currency,source.product_name,source.store_id,source.variant_id,phone,randomBytes(5).toString('hex').toUpperCase(),'WA_PENDING',at,expires,at,randomUUID(),randomUUID());
      db.prepare('UPDATE landing_orders SET brand_name=? WHERE id=?').run(source.brand_name||source.name,id);
      onTransition(getOrder(id));
      return {id,state:'WA_PENDING',duplicate:false};
    },
    createTestOrder({ name='Manuel Bustos', phone='+56928148914', productName='Pelota Saltarina Glow Pro', quantity=1, unitPrice=19990, currency='CLP', address='Av. Providencia 1234, Dpto 502', city='Santiago', state='Región Metropolitana', brandName='Nexora Store' } = {}) {
      const parts = (name||'Manuel Bustos').trim().split(/\s+/);
      const first = parts[0] || 'Manuel';
      const last = parts.slice(1).join(' ') || 'Bustos';
      const customer = {
        first_name: first,
        last_name: last,
        name: `${first} ${last}`,
        email: 'manuel@nexora.cl',
        phone: normalizePhone(phone),
        address_line_1: address,
        city,
        state,
        country: 'CL'
      };
      const id = randomUUID(), at = clock(), expires = new Date(Date.parse(at) + 24 * 3600000).toISOString();
      const code = randomBytes(5).toString('hex').toUpperCase();
      let source = db.prepare("SELECT id FROM landing_sources LIMIT 1").get();
      if (!source) {
        const dummyId = randomUUID();
        db.prepare("INSERT INTO landing_sources (id,public_id,name,origin,market,store_id,product_name,variant_id,unit_price,currency,api_hash,active,created_at,brand_name) VALUES (?,?,'Nexora Store','','CL',20,'Pelota Saltarina Glow Pro',33,19990,'CLP','test_hash',1,?,'Nexora Store')").run(dummyId, 'test-pub-' + randomBytes(4).toString('hex'), at);
        source = { id: dummyId };
      }
      db.prepare(`INSERT INTO landing_orders (id,source_id,request_id,request_hash,market,customer,quantity,unit_price,currency,product_name,store_id,variant_id,phone,confirmation_code,state,created_at,expires_at,consent_at,create_key,confirm_key,brand_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, source.id, 'test_' + randomBytes(8).toString('hex'), 'test_hash', 'CL', JSON.stringify(customer), quantity, unitPrice, currency, productName, 20, 33, customer.phone, code, 'WA_PENDING', at, expires, at, randomUUID(), randomUUID(), brandName
      );
      const order = getOrder(id);
      onTransition(order);
      return order;
    },
    orders(market){return db.prepare('SELECT o.*,s.name AS source_name FROM landing_orders o JOIN landing_sources s ON s.id=o.source_id WHERE o.market=? ORDER BY o.created_at DESC LIMIT 200').all(market).map(serialize);},
    retryMessage(id){const order=getOrder(id);if(!order||!['MESSAGE_UNKNOWN','MESSAGE_ERROR'].includes(order.state))throw failure('Este pedido no admite reenvío de confirmación.');if(order.expires_at<=clock())throw failure('La confirmación ya venció.');set(id,'WA_PENDING',{error:null});},
    async sendNext(whatsapp){
      for(const order of db.prepare("SELECT id FROM landing_orders WHERE state IN ('WA_PENDING','WAITING_CONFIRMATION','MESSAGE_ERROR','MESSAGE_UNKNOWN') AND expires_at<=?").all(clock()))set(order.id,'EXPIRED');
      db.prepare("UPDATE landing_reply_queue SET state='OBSOLETE' WHERE state='PENDING' AND NOT EXISTS (SELECT 1 FROM landing_orders o WHERE o.phone=landing_reply_queue.phone AND o.state IN ('WA_SENDING','WAITING_CONFIRMATION','MESSAGE_ERROR','MESSAGE_UNKNOWN') AND o.expires_at>?)").run(clock());
      if(!whatsapp.connected())return;
      const time=Date.parse(clock());
      if((db.prepare("SELECT next_send FROM landing_delivery WHERE id='whatsapp'").get()?.next_send||0)>time)return;
      const reply=db.prepare("SELECT * FROM landing_reply_queue WHERE state='PENDING' ORDER BY created_at,rowid LIMIT 500").all().find(item=>canAutomatePhone(item.phone));
      if(reply){
        db.prepare("UPDATE landing_reply_queue SET state='SENDING' WHERE id=?").run(reply.id);
        db.prepare("INSERT INTO landing_delivery VALUES ('whatsapp',?) ON CONFLICT(id) DO UPDATE SET next_send=excluded.next_send").run(time+5000);
        try{await whatsapp.send(reply.phone,reply.text,{origin:'automatic'});db.prepare("UPDATE landing_reply_queue SET state='SENT' WHERE id=?").run(reply.id);}catch{db.prepare("UPDATE landing_reply_queue SET state='UNKNOWN' WHERE id=?").run(reply.id);}
        return;
      }
      const order=db.prepare("SELECT * FROM landing_orders WHERE state='WA_PENDING' AND expires_at>? ORDER BY created_at,rowid LIMIT 500").all(clock()).find(item=>canAutomatePhone(item.phone));if(!order)return;
      if(!db.prepare("UPDATE landing_orders SET state='WA_SENDING' WHERE id=? AND state='WA_PENDING'").run(order.id).changes)return;
      db.prepare('UPDATE landing_orders SET requested_at=? WHERE id=?').run(clock(),order.id);
      onTransition(getOrder(order.id));
      db.prepare("INSERT INTO landing_delivery VALUES ('whatsapp',?) ON CONFLICT(id) DO UPDATE SET next_send=excluded.next_send").run(time+5000);
      const customer=JSON.parse(order.customer);
      const currencySuffix = (order.currency && order.currency !== 'CLP') ? ` (${order.currency})` : '';
      const total = new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: order.currency,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: order.currency === 'CLP' ? 0 : 2
      }).format(order.unit_price * order.quantity);
      const text = `¡Hola ${customer.first_name}! 👋 somos ${order.brand_name || 'tu tienda'}. Recibimos con éxito tu pedido #${order.confirmation_code} 🛍️\n\n📦 Detalle de tu pedido:\n🎁 Producto: ${order.quantity} × ${order.product_name}\n👤 Entrega a: ${customer.name}\n📍 Dirección: ${customer.address_line_1}, ${customer.city}, ${customer.state}\n💵 Total a pagar: *${total}*${currencySuffix}\n\n🚚 ¿Están todos los datos correctos para preparar su despacho?\n\nPor favor responde:\n👉 SÍ o CONFIRMO ✅\n\nPara anular responde: CANCELAR ❌ (Válido por 24 horas ⏳)`;
      try{const message=await whatsapp.send(order.phone,text,{origin:'automatic',orderId:order.id});db.prepare("UPDATE landing_orders SET state=CASE WHEN state='WA_SENDING' THEN 'WAITING_CONFIRMATION' ELSE state END,sent_at=?,outbound_id=?,error=NULL WHERE id=?").run(clock(),message.id,order.id);onTransition(getOrder(order.id));}
      catch{set(order.id,'MESSAGE_ERROR',{error:'No se pudo enviar la confirmación por WhatsApp. Revisa la conexión antes de reenviar.'});}
    },
    receive({phone,text,messageId,quotedMessageId,messageAt}) {
      const parsed=parseConfirmation(text);if(!parsed||!messageId)return false;
      let normalized;try{normalized=normalizePhone(phone);}catch{return false;}
      if(!canAutomatePhone(normalized))return false;
      if(db.prepare('SELECT 1 FROM landing_inbound WHERE id=?').get(messageId))return false;
      const pending=db.prepare("SELECT * FROM landing_orders WHERE phone=? AND state IN ('WA_SENDING','WAITING_CONFIRMATION','MESSAGE_ERROR','MESSAGE_UNKNOWN') AND expires_at>? ORDER BY created_at,rowid").all(normalized,clock());
      if(!pending.length)return false;
      const sent=pending.filter(order=>order.requested_at||order.sent_at);
      let candidates=[];
      if(parsed.optionIndex!==null && parsed.optionIndex>=1 && parsed.optionIndex<=sent.length){
        candidates=[sent[parsed.optionIndex-1]];
      } else if(parsed.code){
        candidates=pending.filter(order=>order.confirmation_code.startsWith(parsed.code));
      } else {
        candidates=sent;
      }
      // A quoted response is tied to the original outgoing message, even after a new purchase.
      if(quotedMessageId)candidates=candidates.filter(order=>order.outbound_id===quotedMessageId);
      // A short reference must also be unambiguous against recently closed orders.
      if(parsed.code&&parsed.code.length<10){
        const recent=db.prepare('SELECT id FROM landing_orders WHERE phone=? AND confirmation_code LIKE ? AND expires_at>?').all(normalized,parsed.code+'%',clock());
        if(recent.length!==1)candidates=[];
      }
      const order=candidates.length===1?candidates[0]:null;
      if(messageAt&&(!Number.isFinite(Date.parse(messageAt))||Date.parse(messageAt)>Date.parse(clock())+60000))return false;
      if(order&&messageAt&&Date.parse(messageAt)<Date.parse(order.requested_at||order.sent_at||order.created_at)-1000)return false;
      if(!order){
        // Never guess a pending order from a bare yes when the phone has several.
        // The clarification is itself queued and uses the same five-second pacing.
        if(sent.length&&(!quotedMessageId||parsed.code)){
          const recentReply=db.prepare('SELECT 1 FROM landing_reply_queue WHERE phone=? AND created_at>?').get(normalized,new Date(Date.parse(clock())-60000).toISOString());
          if(!recentReply){
            const emojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
            const choices=sent.slice(0,8).map((item,idx)=>{
              const icon=emojis[idx]||`[${idx+1}]`;
              return `${icon} *Pedido ${idx+1}:* ${item.product_name} (#${item.confirmation_code})`;
            }).join('\n\n');
            const reply=`Para identificar tu pedido sin equivocarnos, por favor responde con el número o código de tu pedido:\n\n${choices}\n\n👉 Responde con *1* o *2* (o responde directamente sobre el mensaje del pedido).`;
            db.prepare('INSERT INTO landing_reply_queue VALUES (?,?,?,?,?)').run(randomUUID(),normalized,reply,'PENDING',clock());
          }
        }
        db.prepare('INSERT OR IGNORE INTO landing_inbound VALUES (?,?)').run(messageId,clock());
        return false;
      }
      db.exec('BEGIN IMMEDIATE');
      try{
        const receipt=db.prepare('INSERT OR IGNORE INTO landing_inbound VALUES (?,?)').run(messageId,clock());
        if(!receipt.changes){db.exec('COMMIT');return false;}
        set(order.id,parsed.action==='CONFIRMO'?'CUSTOMER_CONFIRMED':'CUSTOMER_CANCELLED',{confirmed_at:parsed.action==='CONFIRMO'?clock():null,inbound_id:messageId,error:null});
        db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    async dispatchNext(){
      const order=db.prepare("SELECT * FROM landing_orders WHERE state IN ('CUSTOMER_CONFIRMED','CREATE_PENDING','CONFIRM_PENDING') AND (next_attempt IS NULL OR next_attempt<=?) ORDER BY created_at LIMIT 500").all(clock()).find(item=>item.state!=='CUSTOMER_CONFIRMED'||canAutomatePhone(item.phone));
      if(!order||!order.confirmed_at)return;
      const config=connections.load(order.market),delay=new Date(Date.parse(clock())+20000).toISOString();
      if(!config.apiKey){set(order.id,order.state,{error:'Conecta Dropea para este país.',next_attempt:delay});return;}
            const account=db.prepare('SELECT fingerprint FROM landing_accounts WHERE source_id=?').get(order.source_id);
      if(!account&&config.apiKey){
        db.prepare('INSERT OR REPLACE INTO landing_accounts VALUES (?,?)').run(order.source_id, hash(config.apiKey));
      } else if(account&&account.fingerprint!==hash(config.apiKey)){
        set(order.id,'DROPEA_ERROR',{error:'La API Key cambió desde la configuración de esta landing. Revisa la cuenta de destino antes de gestionar el pedido.'});
        return;
      }
      const customer=JSON.parse(order.customer);
      const poll = async key => {
        try{return await request(config,`operations/${key}`);}catch(error){if(error.status===404)return null;throw error;}
      };
      try{
        let remoteId=order.remote_id;
        if(!remoteId){
          set(order.id,'CREATING');
          let created;
          if(order.state==='CREATE_PENDING'){
            const operation=await poll(order.create_key);
            if(operation?.status==='in_progress'){set(order.id,'CREATE_PENDING',{next_attempt:delay});return;}
            if(operation?.status==='failed')throw failure('Dropea rechazó la creación. Revisa el pedido antes de volver a gestionarlo.',422);
            if(operation?.status==='completed')created=operation.resource?.id?{id:operation.resource.id}:operation.result?.data||operation.result;
            if(!created){
              // Correlate before retrying an ambiguous creation; never issue a new key.
              const found=await request(config,`orders?external_order_id=${encodeURIComponent('CRM-'+order.id)}&page=1&limit=2`);
              if(found?.items?.length===1)created=found.items[0];
              else if(found?.items?.length>1)throw failure('Hay más de un pedido con la misma referencia. Revisión manual requerida.',409);
            }
          }
          if(!created){
            if(Date.parse(clock())-Date.parse(order.confirmed_at)>23*3600000)throw failure('La ventana segura de reintento terminó. Revisa Dropea antes de crear otro pedido.',409);
            const {first_name,last_name,address_line_1,city,state,postal_code,country}=customer;
            created=await request(config,'orders',{method:'POST',idempotencyKey:order.create_key,acceptAsync:true,body:{store_id:order.store_id,payment_method:'COD',external_order_id:'CRM-'+order.id,line_items:[{variant_id:order.variant_id,quantity:order.quantity,unit_price:order.unit_price}],customer_details:{name:customer.name,email:customer.email,phone:order.phone,shipping_address:{first_name,last_name,address_line_1,city,state,postal_code,country}}}});
          }
          if(created?.operation_id){set(order.id,'CREATE_PENDING',{next_attempt:delay});return;}
          if(!Number.isSafeInteger(created?.id))throw failure('Dropea no devolvió el ID del pedido; requiere revisión.',409);
          remoteId=created.id;set(order.id,'CONFIRM_PENDING',{remote_id:remoteId,error:null});
          if(created.line_items)cacheOrder(config,created);
        }
        set(order.id,'CONFIRMING');
        if(order.state==='CONFIRM_PENDING'&&order.remote_id){
          const operation=await poll(order.confirm_key);
          if(operation?.status==='in_progress'){set(order.id,'CONFIRM_PENDING',{next_attempt:delay});return;}
          if(operation?.status==='failed')throw failure('Dropea rechazó la confirmación. Revisa el pedido y sus datos.',422);
          const remote=await request(config,`orders/${remoteId}`);
          if(['CONFIRMED','PROCESSING','SHIPPING','DELIVERED'].includes(remote.status)||(remote.status==='FINISH'&&remote.sub_status==='DELIVERED')){
            cacheOrder(config,remote);set(order.id,'SENT_TO_DROPEA',{remote_status:remote.status,error:null});return;
          }
          if(['CANCELLED','ERROR','FINISH'].includes(remote.status))throw failure('El pedido ya tiene un estado terminal en Dropea. Requiere revisión.',409);
        }
        const confirmed=await request(config,`orders/${remoteId}/confirm`,{method:'POST',idempotencyKey:order.confirm_key,acceptAsync:true});
        if(confirmed?.operation_id){set(order.id,'CONFIRM_PENDING',{next_attempt:delay});return;}
        if(confirmed?.status!=='CONFIRMED')throw failure('Dropea no confirmó el estado esperado. Revisa el pedido.',409);
        set(order.id,'SENT_TO_DROPEA',{remote_status:'CONFIRMED',error:null});
        try{cacheOrder(config,await request(config,`orders/${remoteId}`));}catch{/* webhook can update the full snapshot */}
      }catch(error){
        const latest=getOrder(order.id),transient=!error.status||[429,500,502,503,504].includes(error.status);
        if(transient){set(order.id,latest.remote_id?'CONFIRM_PENDING':'CREATE_PENDING',{error:'Respuesta temporal de Dropea pendiente de reconciliar.',next_attempt:delay});}
        else set(order.id,'DROPEA_ERROR',{error:error.message});
      }
    },
  };
}
