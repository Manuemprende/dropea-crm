import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createLiveTracking, trackingScript,reportRange } from './live-tracking.js';
import { createLiveHTTP } from './live-http.js';

function setup(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE landing_sources(id TEXT PRIMARY KEY);INSERT INTO landing_sources VALUES('offer-a');
    CREATE TABLE landing_orders(id TEXT PRIMARY KEY,source_id TEXT,quantity INTEGER,unit_price REAL,currency TEXT,product_name TEXT,created_at TEXT,phone TEXT);
    INSERT INTO landing_orders VALUES('order-a','offer-a',2,24990,'CLP','Pelota','2026-11-07T16:00:00Z','test-phone');`);
  const live=createLiveTracking({db,clock:()=>Date.parse('2026-11-07T16:01:00Z'),geo:()=>({city:'Concepción',country:'Chile'})});
  return {db,live};
}
const settings={name:'Pelota',url:'https://oferta.example/producto',product_id:'DROPEA-123',platform:'Dropea'};
const input={session_id:'session_1234567890',visitor_id:'visitor_1234567890',stage:'visit'};
const request={headers:{origin:'https://oferta.example'},socket:{remoteAddress:'200.1.1.1'}};
test('owner isolation, origin validation, heartbeat deduplication, location and stages',()=>{
  const {db,live}=setup();try{
    const a=live.add('owner-a',settings),b=live.add('owner-b',settings);
    assert.equal(live.list('owner-b').length,1);
    assert.throws(()=>live.toggle('owner-b',a.id,false),/no encontrada/);
    assert.throws(()=>live.track(a.id,input,{headers:{origin:'https://otro.example'}}),/Origen/);
    assert.throws(()=>live.track(a.id,{...input,stage:'purchase'},request),/compras/);
    live.track(a.id,input,request);live.track(a.id,input,request);
    live.track(a.id,{...input,stage:'checkout_opened'},request);live.track(a.id,input,request);
    const report=live.report('owner-a');assert.equal(report.length,1);assert.equal(report[0].sessions_today,1);
    assert.equal(report[0].locations[0].city,'Concepción');assert.equal(report[0].behavior.checking_out,1);
    assert.equal(live.report('owner-b')[0].sessions_today,0);
    assert.equal(report[0].visitor_segments.total,1);assert.equal(report[0].visitor_segments.new_visitors,1);
    assert.equal(report[0].visitor_segments.returning_visitors,0);assert.equal(report[0].orders_today,0);
    assert(!JSON.stringify(report).includes('owner-b'));
    live.toggle('owner-a',a.id,false);assert.equal(live.report('owner-a').length,0);
    assert.throws(()=>live.track(a.id,input,request),/disponible/);
    assert(b.id!==a.id);
  }finally{db.close();}
});
test('purchase counts only persisted orders, once, and in the configured connection',()=>{
  const {db,live}=setup();try{
    const source=live.add('owner-a',{...settings,order_source_id:'offer-a'});
    assert.throws(()=>live.add('owner-a',{...settings,order_source_id:'offer-a'}),/ya tiene/);
    live.track(source.id,input,request);
    live.orderReceived('offer-a','invented',input);assert.equal(live.report('owner-a')[0].orders_today,0);
    live.orderReceived('offer-a','order-a',input);live.orderReceived('offer-a','order-a',input);
    const r=live.report('owner-a')[0];assert.equal(r.orders_today,1);assert.equal(r.revenue_today,49980);
    assert.equal(r.customers.new_customers,1);
    assert.equal(r.behavior.purchased,1);assert.equal(r.behavior.checking_out,0);
    live.track(source.id,input,request);assert.equal(live.report('owner-a')[0].behavior.active_carts,0);
  }finally{db.close();}
});
test('scoped public HTTP ingestion cannot read reports; script does not contain secrets',async()=>{
  const {db}=setup(),app=express();
  const http=createLiveHTTP({app,express,db,owner:'admin',origin:'https://crm.example'});
  const source=http.live.add('admin',settings);
  app.use('/api',(_req,res)=>res.status(401).json({error:'login required'}));http.installPrivate();
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await fetch(base+'/api/live/dashboard')).status,401);
    assert.equal((await fetch(base+'/api/live/sources')).status,401);
    const path=base+'/api/live/'+source.id;
    assert.equal((await fetch(path+'/events',{method:'OPTIONS',headers:{Origin:'https://oferta.example'}})).status,204);
    assert.equal((await fetch(path+'/events',{method:'POST',headers:{Origin:'https://wrong.example','Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
    assert.equal((await fetch(path+'/events',{method:'POST',headers:{Origin:'https://oferta.example','Content-Type':'application/json'},body:JSON.stringify(input)})).status,200);
    const script=await (await fetch(path+'/tracker.js')).text();new Function(script);
    assert(!script.includes('owner_id'));assert(!script.includes('apiKey'));assert(!script.includes('LIVE_DEMO_TOKEN'));
  }finally{await new Promise(r=>server.close(r));db.close();}
});
test('tracker configuration is script-safe and does not emit a purchase from browser',()=>{
  const script=trackingScript({id:'public-id'},'https://crm.example');new Function(script);
  assert(script.includes('checkoutOpened'));assert(!script.includes("stage='purchase'"));
});
test('custom dates are validated and include both boundary dates without counting records outside the range',()=>{
  const {db,live}=setup();try{
    const source=live.add('owner-a',settings);
    const seed=(date,index)=>{db.prepare('INSERT INTO live_sessions VALUES (?,?,?,?,?,?,?,?,?)').run(source.id,'session-boundary-'+index,'visitor-boundary-'+index,date+'T14:00:00Z',date,'2026-11-07T16:01:00.000Z','visit','City '+index,'Chile');db.prepare('INSERT INTO live_purchases VALUES (?,?,?,?,?,?,?,?,?)').run('boundary-'+index,source.id,null,null,100,'CLP','Product '+index,date,date+'T14:00:00Z');};
    ['2026-10-06','2026-10-07','2026-11-07','2026-11-08'].forEach(seed);
    const r=live.report('owner-a','custom',{from:'2026-10-07',to:'2026-11-07'})[0];assert.equal(r.sessions_today,2);assert.equal(r.orders_today,2);assert.equal(r.revenue_today,200);assert.equal(r.top_products.length,2);assert.equal(r.locations.length,2);assert.equal(r.active_now,4);
    assert.throws(()=>live.report('owner-a','custom',{from:'2026-11-07',to:'2026-10-07'}),/Desde/);assert.throws(()=>reportRange('custom',Date.now(),{from:'2026-02-30',to:'2026-11-07'}),/válidas/);assert.throws(()=>reportRange('custom',Date.now(),{from:'bad',to:'2026-11-07'}),/válidas/);
  }finally{db.close();}
});
test('native reports apply custom ranges and convert revenue without external campaign feeds',async()=>{
  const {db}=setup(),app=express();
  const http=createLiveHTTP({app,express,db,owner:'admin',loadRates:async()=>({rates:{EUR:1,CLP:1000,MXN:20},updatedAt:'2026-11-07T00:00:00Z',stale:false})});
  const source=http.live.add('admin',{...settings,currency:'EUR'});
  db.prepare('INSERT INTO live_purchases VALUES (?,?,?,?,?,?,?,?,?)').run('native-eur',source.id,null,null,10,'EUR','Euro Product','2026-11-07','2026-11-07T14:00:00Z');
  app.use(express.json());http.installPrivate();app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const base='http://127.0.0.1:'+server.address().port;const r=await fetch(base+'/api/live/dashboard?period=custom&from=2026-10-07&to=2026-11-07&currency=MXN');assert.equal(r.status,200);const report=await r.json();assert.equal(report.landings.length,1);assert.equal(report.landings[0].revenue_today,10);assert.equal(report.landings[0].revenue_converted,200);assert.equal(report.landings[0].top_products[0].revenue_converted,200);assert.equal(report.range.to,'2026-11-07');assert.equal((await fetch(base+'/api/live/dashboard?period=custom&from=2026-11-07&to=2026-10-07')).status,400);}
  finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('old simulated sources cannot appear in real reports or accept events',()=>{
 const {db,live}=setup();try{
  const source=live.add('admin',settings);db.prepare('INSERT INTO live_demo_sources VALUES(?,?)').run(source.id,24990);
  assert.equal(live.report('admin').length,0);assert.throws(()=>live.track(source.id,input,request),/no disponible/);
  assert.equal(live.demoOrder,undefined);assert.equal(live.createDemo,undefined);
 }finally{db.close();}
});
