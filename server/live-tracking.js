import { randomBytes, createHash } from 'node:crypto';
import { visitorSegments } from './visitor-segments.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(value);
const localDate = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date(value));
export function periodStart(period, now) {
  if (!['today','7d','month','all'].includes(period)) throw fail('Periodo inválido.');
  if (period === 'all') return '0000-01-01';
  const today = localDate(now);
  if (period === 'today') return today;
  if (period === 'month') return today.slice(0,7) + '-01';
  return new Date(Date.parse(today+'T12:00:00Z') - 6*86400000).toISOString().slice(0,10);
}
export function reportRange(period,now,{from,to}={}){
  const today=localDate(now);
  if(period!=='custom')return {from:periodStart(period,now),to:today};
  const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  if(!valid(from)||!valid(to))throw fail('Selecciona fechas válidas en Desde y Hasta.');
  if(from>to)throw fail('La fecha Desde debe ser anterior o igual a Hasta.');
  return {from,to};
}

export function createLiveTracking({ db, geo = () => ({}), clock = () => Date.now() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS live_sources (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
    origin TEXT NOT NULL, product_name TEXT NOT NULL, product_id TEXT NOT NULL, platform TEXT NOT NULL,
    currency TEXT NOT NULL, order_source_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS live_owner ON live_sources(owner_id,active);
    CREATE TABLE IF NOT EXISTS live_sessions (
    source_id TEXT NOT NULL REFERENCES live_sources(id), session_id TEXT NOT NULL, visitor_id TEXT NOT NULL,
    started_at TEXT NOT NULL, date TEXT NOT NULL, last_ping TEXT NOT NULL, stage TEXT NOT NULL,
    city TEXT, country TEXT, PRIMARY KEY(source_id,session_id));
    CREATE INDEX IF NOT EXISTS live_sessions_period ON live_sessions(source_id,date,last_ping);
    CREATE INDEX IF NOT EXISTS live_sessions_visitor ON live_sessions(source_id,visitor_id,date);
    CREATE TABLE IF NOT EXISTS live_purchases (
    order_id TEXT PRIMARY KEY,source_id TEXT NOT NULL,session_id TEXT,visitor_id TEXT,
    value REAL NOT NULL,currency TEXT NOT NULL,product_name TEXT NOT NULL,date TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS live_purchases_period ON live_purchases(source_id,date);
    CREATE TABLE IF NOT EXISTS live_demo_sources(source_id TEXT PRIMARY KEY,unit_price REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS live_demo_orders(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,
      request_id TEXT NOT NULL,session_id TEXT NOT NULL,visitor_id TEXT NOT NULL,quantity INTEGER NOT NULL,
      total REAL NOT NULL,created_at TEXT NOT NULL,UNIQUE(source_id,request_id));`);
  const limits = new Map();
  function rateLimit(source, req) {
    const key=createHash('sha256').update(source+'|'+(req.headers?.['x-real-ip']||req.socket?.remoteAddress||'')).digest('hex');
    const at=clock();let slot=limits.get(key);
    if(!slot||slot.until<at){slot={count:0,until:at+60000};limits.set(key,slot);}
    if(++slot.count>180)throw fail('Demasiados eventos.',429);
    if(limits.size>10000){for(const [key,value] of limits)if(value.until<at)limits.delete(key);if(limits.size>10000)throw fail('Reintenta en un minuto.',429);}
  }
  const enrich=source=>source?{...source,demo_mode:!!db.prepare('SELECT 1 FROM live_demo_sources WHERE source_id=?').get(source.id)}:null;
  const getSource=id=>enrich(db.prepare('SELECT * FROM live_sources WHERE id=?').get(id));
  const list=owner=>db.prepare('SELECT * FROM live_sources WHERE owner_id=? ORDER BY created_at DESC').all(owner).map(enrich);
  return {
    list, getSource,
    add(owner,input={}) {
      const name=String(input.name||'').trim().slice(0,120);if(!name)throw fail('Escribe el nombre de la landing.');
      let url;try{url=new URL(input.url);}catch{throw fail('Ingresa la URL HTTPS de tu landing.');}
      if(url.protocol!=='https:'||url.username||url.password)throw fail('Usa una URL HTTPS sin credenciales.');
      url.hash='';url.search='';
      const platform='Dropea';if(input.platform&&input.platform!=='Dropea')throw fail('Esta conexión es para tu cuenta Dropea.');
      const currency=String(input.currency||'CLP');if(!['CLP','MXN','EUR','USD'].includes(currency))throw fail('Moneda inválida.');
      const orderSource=input.order_source_id||null;
      const offer=orderSource?db.prepare('SELECT * FROM landing_sources WHERE id=?').get(orderSource):null;
      if(orderSource&&!offer)throw fail('La conexión de pedidos no existe.');
      if(offer?.origin&&offer.origin!==url.origin)throw fail('La URL debe coincidir con el origen de la conexión de pedidos.');
      if(offer?.currency&&offer.currency!==currency)throw fail('La moneda debe coincidir con la conexión de pedidos.');
      const id=randomBytes(24).toString('base64url');
      if(orderSource&&db.prepare('SELECT id FROM live_sources WHERE order_source_id=?').get(orderSource))throw fail('Esta conexión de pedidos ya tiene seguimiento.');
      db.prepare('INSERT INTO live_sources VALUES (?,?,?,?,?,?,?,?,?,?,1,?)').run(id,owner,name,url.href,url.origin,String(input.product_name||name).slice(0,160),String(input.product_id||'').slice(0,100),platform,currency,orderSource,new Date(clock()).toISOString());
      return getSource(id);
    },
    toggle(owner,id,active) {
      if(typeof active!=='boolean')throw fail('Estado inválido.');
      if(!db.prepare('UPDATE live_sources SET active=? WHERE id=? AND owner_id=?').run(active?1:0,id,owner).changes)throw fail('Landing no encontrada.',404);
    },
    syncOffer(owner,offer) {
      if(!offer.origin||!offer.landing_url)throw fail('Registra la URL de esta oferta en Landings.');
      let source=db.prepare('SELECT * FROM live_sources WHERE order_source_id=? AND owner_id=?').get(offer.id,owner);
      if(!source){
        source=this.add(owner,{name:offer.name,url:offer.landing_url,platform:'Dropea',
          currency:offer.currency,product_name:offer.product_name,product_id:String(offer.product_id||''),order_source_id:offer.id});
      }
      db.prepare(`UPDATE live_sources SET name=?,url=?,origin=?,product_name=?,product_id=?,currency=?,platform='Dropea',
        active=CASE WHEN ?=0 THEN 0 ELSE active END WHERE id=? AND owner_id=?`)
        .run(offer.name,offer.landing_url,offer.origin,offer.product_name,String(offer.product_id||''),offer.currency,offer.active,source.id,owner);
      // Reconcile persisted orders, including submissions received before tracking was configured.
      for(const order of db.prepare('SELECT o.id FROM landing_orders o WHERE o.source_id=? AND NOT EXISTS(SELECT 1 FROM live_purchases p WHERE p.order_id=o.id)').all(offer.id)){
        this.orderReceived(offer.id,order.id);
      }
      return getSource(source.id);
    },
    track(id,input,req) {
      const source=getSource(id);if(!source?.active||source.demo_mode)throw fail('Landing no disponible.',404);
      if(req.headers?.origin!==source.origin)throw fail('Origen no autorizado para esta landing.',403);
      rateLimit(id,req);
      if(!idOK(input?.session_id)||!idOK(input?.visitor_id))throw fail('Identificadores de visita inválidos.');
      const stage=input.stage||'visit';if(!['visit','checkout_opened','checkout_progress'].includes(stage))throw fail('Evento inválido. Las compras se validan en el servidor.');
      const old=db.prepare('SELECT stage FROM live_sessions WHERE source_id=? AND session_id=?').get(id,input.session_id);
      const rank={visit:0,checkout_opened:1,checkout_progress:2,purchase:3};
      let place={};try{place=geo(req)||{};}catch{}
      const at=new Date(clock()).toISOString();
      db.prepare(`INSERT INTO live_sessions VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,session_id)
        DO UPDATE SET last_ping=excluded.last_ping,stage=excluded.stage,
        city=COALESCE(NULLIF(live_sessions.city,''),excluded.city),country=COALESCE(NULLIF(live_sessions.country,''),excluded.country)`)
        .run(id,input.session_id,input.visitor_id,at,localDate(clock()),at,old&&rank[old.stage]>rank[stage]?old.stage:stage,String(place.city||'').slice(0,100)||null,String(place.country||'').slice(0,100)||null);
      return {received:true};
    },
    orderReceived(orderSource,id,input={}) {
      const order=db.prepare('SELECT * FROM landing_orders WHERE id=? AND source_id=?').get(id,orderSource);
      if(!order)return;
      const sources=db.prepare('SELECT * FROM live_sources WHERE order_source_id=?').all(orderSource);
      for(const source of sources){
        const session=idOK(input.session_id)?input.session_id:null;
        const visitor=idOK(input.visitor_id)?input.visitor_id:null;
        // Native offer connections belong to this installation; only persisted orders can create purchases.
        db.prepare('INSERT OR IGNORE INTO live_purchases VALUES (?,?,?,?,?,?,?,?,?)').run(order.id,source.id,session,visitor,order.quantity*order.unit_price,order.currency,order.product_name,localDate(order.created_at),order.created_at);
        if(session)db.prepare("UPDATE live_sessions SET stage='purchase' WHERE source_id=? AND session_id=?").run(source.id,session);
      }
    },
    report(owner,period='7d',dates={}) {
      const {from:since,to:until}=reportRange(period,clock(),dates),recent=new Date(clock()-600000).toISOString(),liveSince=new Date(clock()-45000).toISOString();
      return list(owner).filter(s=>s.active&&!s.demo_mode).map(s=>{
        const sessions=db.prepare(`SELECT COUNT(*) AS sessions,COUNT(DISTINCT visitor_id) AS visitors,
          SUM(last_ping>=?) AS active FROM live_sessions WHERE source_id=? AND date>=? AND date<=?`).get(liveSince,s.id,since,until);
        const activeNow=db.prepare('SELECT COUNT(*) AS n FROM live_sessions WHERE source_id=? AND last_ping>=?').get(s.id,liveSince).n;
        const orders=db.prepare('SELECT COUNT(*) AS orders,COALESCE(SUM(value),0) AS revenue FROM live_purchases WHERE source_id=? AND date>=? AND date<=?').get(s.id,since,until);
        const locations=db.prepare(`SELECT city,country,COUNT(*) AS sessions FROM live_sessions WHERE source_id=? AND date>=? AND date<=? AND (city IS NOT NULL OR country IS NOT NULL) GROUP BY city,country ORDER BY sessions DESC LIMIT 3`).all(s.id,since,until);
        const behavior={active_carts:0,checking_out:0,purchased:db.prepare('SELECT COUNT(*) AS n FROM live_purchases WHERE source_id=? AND created_at>=?').get(s.id,recent).n};
        for(const row of db.prepare('SELECT stage,COUNT(*) AS n FROM live_sessions WHERE source_id=? AND last_ping>=? GROUP BY stage').all(s.id,recent)){
          if(row.stage==='visit')behavior.active_carts=row.n;
          if(row.stage.startsWith('checkout'))behavior.checking_out+=row.n;
        }
      const top=db.prepare('SELECT product_name AS name,COUNT(*) AS orders,SUM(value) AS revenue FROM live_purchases WHERE source_id=? AND date>=? AND date<=? GROUP BY product_name ORDER BY orders DESC LIMIT 3').all(s.id,since,until);
        const customers=s.demo_mode?db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS total,COUNT(DISTINCT visitor_id) AS new_customers
          FROM live_demo_orders WHERE source_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?`).get(s.id,since,until):db.prepare(`SELECT COUNT(DISTINCT o.phone) AS total,
          COUNT(DISTINCT CASE WHEN NOT EXISTS(SELECT 1 FROM live_purchases previous
            JOIN landing_orders prior ON prior.id=previous.order_id
            WHERE previous.source_id=p.source_id AND prior.phone=o.phone AND previous.created_at<p.created_at)
            THEN o.phone END) AS new_customers
          FROM live_purchases p JOIN landing_orders o ON o.id=p.order_id
          WHERE p.source_id=? AND p.date>=? AND p.date<=?`).get(s.id,since,until);
        customers.returning_customers=Math.max(0,customers.total-customers.new_customers);
        const visitor_segments=visitorSegments(db,s.id,{from:since,to:until});
        return {id:s.id,name:s.name,url:s.url,currency:s.currency,platform:s.platform,product_id:s.product_id,product_name:s.product_name,demo_mode:s.demo_mode,campaign_active:true,active_now:activeNow,sessions_today:sessions.sessions,unique_visitors_today:sessions.visitors,orders_today:orders.orders,revenue_today:orders.revenue,locations,customers,visitor_segments,top_products:top,behavior,read_only:false};
      });
    }
  };
}

export function trackingScript(source,origin) {
  const config=JSON.stringify({id:source.id,endpoint:origin+'/api/live/'+source.id+'/events'}).replace(/</g,'\\u003c');
  return `(function(){'use strict';var c=${config};window.CrmLandingLive=window.CrmLandingLive||{};if(window.CrmLandingLive[c.id])return;
  function uid(){return crypto.randomUUID().replace(/-/g,'');}function store(storage,key){try{var v=storage.getItem(key)||uid();storage.setItem(key,v);return v;}catch(e){return uid();}}
  var visitor=store(localStorage,'crm-live-visitor'),key='crm-live-'+c.id,session=store(sessionStorage,key),stage='visit';
  function context(){try{var last=Number(sessionStorage.getItem(key+'-last')||Date.now());if(Date.now()-last>1800000){session=uid();sessionStorage.setItem(key,session);}sessionStorage.setItem(key+'-last',String(Date.now()));}catch(e){}return {visitor_id:visitor,session_id:session};}
  function ping(){if(document.visibilityState==='hidden')return;fetch(c.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign(context(),{stage:stage})),keepalive:true}).catch(function(){});}
  var api={context:context,checkoutOpened:function(){if(stage==='visit'){stage='checkout_opened';ping();}},checkoutProgress:function(){stage='checkout_progress';ping();}};
  window.CrmLandingLive[c.id]=api;window.CrmLandingLive.current=api;
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-live-checkout]'))api.checkoutOpened();});
  document.addEventListener('input',function(e){if(e.target.closest&&e.target.closest('[data-live-checkout-form]'))api.checkoutProgress();});
  document.addEventListener('visibilitychange',ping);ping();setInterval(ping,15000);
})();`;
}
