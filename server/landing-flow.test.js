import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createLandingFlow,parseConfirmation } from './landing-flow.js';
import { encryptedAuth,createWhatsApp } from './whatsapp.js';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createLandingWorker } from './landing-worker.js';

const input={request_id:'request-123456789',first_name:'Ana',last_name:'Prueba',phone:'+56912345678',email:'ana@example.test',address:'Calle 10',city:'Santiago',state:'Metropolitana',quantity:2,consent:true};
async function setup(requestOverride){
  const db=new DatabaseSync(':memory:');let time='2026-11-06T12:00:00.000Z';const calls=[];let apiKey='country-key';
  const request=async(config,path,options={})=>{calls.push({config,path,...options});if(path==='shops/20')return{id:20,status:'ACTIVE'};if(requestOverride)return requestOverride(config,path,options);if(path==='orders')return{id:500,status:'PENDING'};if(path==='orders/500/confirm')return{id:500,status:'CONFIRMED'};if(path==='orders/500')return{id:500,status:'CONFIRMED',line_items:[]};if(path.startsWith('operations/'))throw Object.assign(new Error('not found'),{status:404});return{items:[]};};
  const flow=createLandingFlow({db,connections:{load:market=>({market,apiKey})},request,clock:()=>time});
  const source=await flow.addSource({name:'Landing Chile',url:'https://prueba.pidedirecto.cyou',market:'CL',store_id:20,variant_id:33,unit_price:14990,product_name:'Producto de prueba'});calls.length=0;
  const accept=(changes={},auth={origin:'https://prueba.pidedirecto.cyou',ip:'127.0.0.1'})=>flow.accept(source.public_id,{...input,...changes},auth);
  const row=id=>db.prepare('SELECT * FROM landing_orders WHERE id=?').get(id);
  const send=()=>flow.sendNext({connected:()=>true,send:async(phone,text)=>{assert.equal(phone,input.phone);assert.match(text,/SÍ o CONFIRMO/);return{id:'outgoing-1'};}});
  return{db,flow,source,calls,accept,row,send,time:value=>time=value,key:value=>apiKey=value};
}
test('landing intake pins country, price and destination, deduplicates and rejects forgery',async()=>{
  const s=await setup();assert.throws(()=>s.accept({consent:false}),/autorizar/);assert.throws(()=>s.accept({}, {origin:'https://another.pidedirecto.cyou'}),/Origen/);
  assert.throws(()=>s.accept({}, {apiKey:'wrong'}),/clave/);
  const order=s.accept({market:'ES',unit_price:1,store_id:999});assert.equal(s.row(order.id).market,'CL');assert.equal(s.row(order.id).unit_price,14990);assert.equal(s.row(order.id).store_id,20);
  assert.equal(s.accept().duplicate,true);assert.throws(()=>s.accept({quantity:1}),/otro pedido/);
  await s.flow.dispatchNext();assert.equal(s.calls.length,0);assert.equal(s.flow.orders('ES').length,0);
  assert(!JSON.stringify(s.flow.orders('CL')).includes(s.row(order.id).confirmation_code));
});
test('an external builder can create a connection without a URL, use its dedicated key, rotate it, and register a browser origin later',async()=>{
  const s=await setup(async(_config,path)=>path==='products/10'?{id:10,name:'Producto vinculado',variants:[{variant_id:33,name:'Única'}]}:{items:[]});
  const source=await s.flow.addSource({name:'API externa',market:'CL',store_id:20,product_id:10,unit_price:14990,brand_name:'Pide Directo'});
  assert.equal(source.origin,'');assert.equal(source.product_id,10);assert.equal(source.variant_id,33);assert.equal(source.product_name,'Producto vinculado');
  assert.throws(()=>s.flow.accept(source.public_id,input,{}),/clave/);
  assert.throws(()=>s.flow.accept(source.public_id,{...input,product_id:11},{apiKey:source.apiKey}),/producto/);
  const accepted=s.flow.accept(source.public_id,{...input,product_id:10},{apiKey:source.apiKey});assert.equal(accepted.state,'WA_PENDING');
  const rotated=s.flow.rotateKey(source.id);assert.throws(()=>s.flow.accept(source.public_id,input,{apiKey:source.apiKey}),/clave/);assert(s.flow.accept(source.public_id,input,{apiKey:rotated.apiKey}).duplicate);
  s.flow.updateUrl(source.id,'https://producto.otraplataforma.com/oferta');assert.equal(s.flow.listSources().find(row=>row.id===source.id).landing_url,'https://producto.otraplataforma.com/oferta');assert(s.flow.accept(source.public_id,input,{origin:'https://producto.otraplataforma.com'}).duplicate);
});
test('a product with multiple variants requires an explicit variant that belongs to that product',async()=>{const s=await setup(async()=>({id:10,name:'Variantes',variants:[{variant_id:33},{variant_id:34}]}));const offer={name:'Multi',market:'CL',store_id:20,product_id:10,unit_price:1000};await assert.rejects(()=>s.flow.addSource(offer),/variante/);await assert.rejects(()=>s.flow.addSource({...offer,variant_id:999}),/variante/);});
test('landing creation resolves the official nested product and shop response shapes',async()=>{const db=new DatabaseSync(':memory:');const flow=createLandingFlow({db,connections:{load:()=>({market:'CL',apiKey:'test-key'})},request:async(_config,path)=>path==='products/10'?{product:{id:10,name:'Producto oficial',variants:[{variant_id:33,name:'Única'}]}}:{shop:{id:20,name:'Tienda oficial',status:'ACTIVE'}}});const source=await flow.addSource({name:'API',market:'CL',store_id:20,product_id:10,unit_price:1000});assert.equal(source.product_name,'Producto oficial');assert.equal(source.variant_id,33);assert.equal(source.brand_name,'Tienda oficial');db.close();});
test('landing price can come from an authenticated external backend but never from an unauthenticated browser',async()=>{
  const s=await setup(async()=>({product:{id:10,name:'Precio externo',variants:[{variant_id:33}]}}));
  const source=await s.flow.addSource({name:'Precio de landing',url:'https://oferta.pidedirecto.cyou',market:'CL',product_id:10,store_id:20});assert.equal(source.unit_price,0);
  assert.throws(()=>s.flow.accept(source.public_id,{...input,unit_price:14990},{origin:'https://oferta.pidedirecto.cyou'}),/unit_price/);
  assert.throws(()=>s.flow.accept(source.public_id,input,{apiKey:source.apiKey}),/unit_price/);
  const accepted=s.flow.accept(source.public_id,{...input,unit_price:14990},{apiKey:source.apiKey});assert.equal(s.row(accepted.id).unit_price,14990);
  assert.throws(()=>s.flow.accept(source.public_id,{...input,unit_price:1},{apiKey:source.apiKey}),/otro pedido/);
});
test('a matching phone confirmation creates and confirms once in the correct market',async()=>{
  const s=await setup(),order=s.accept();await s.send();const code=s.row(order.id).confirmation_code;
  assert.equal(s.flow.receive({phone:'+34912345678',text:'CONFIRMO '+code,messageId:'x'}),false);
  for(const text of ['no confirmo '+code,'CONFIRMO '+code+' no','sí pero cambia la dirección','¿confirmo?'])assert.equal(parseConfirmation(text),null);
  assert.equal(s.flow.receive({phone:input.phone,text:'CONFIRMO '+code,messageId:'reply-1'}),true);
  assert.equal(s.flow.receive({phone:input.phone,text:'CONFIRMO '+code,messageId:'reply-1'}),false);
  await s.flow.dispatchNext();await s.flow.dispatchNext();
  assert.equal(s.row(order.id).state,'SENT_TO_DROPEA');const mutations=s.calls.filter(c=>c.method==='POST');assert.equal(mutations.length,2);assert.equal(mutations[0].config.market,'CL');assert.equal(mutations[0].body.customer_details.shipping_address.country,'CL');assert.equal(mutations[0].body.line_items[0].unit_price,14990);assert.equal(mutations[0].idempotencyKey,s.row(order.id).create_key);assert.equal(mutations[1].idempotencyKey,s.row(order.id).confirm_key);
});
test('cancellation and expired unanswered orders never reach Dropea, even when WhatsApp is offline',async()=>{
  const s=await setup(),a=s.accept();await s.send();s.flow.receive({phone:input.phone,text:'CANCELAR '+s.row(a.id).confirmation_code,messageId:'cancel'});await s.flow.dispatchNext();assert.equal(s.row(a.id).state,'CUSTOMER_CANCELLED');assert.equal(s.calls.length,0);
  const b=s.accept({request_id:'request-another-123'});s.time('2026-11-08T12:00:00.000Z');await s.flow.sendNext({connected:()=>false});assert.equal(s.row(b.id).state,'EXPIRED');assert.equal(s.flow.receive({phone:input.phone,text:'CONFIRMO '+s.row(b.id).confirmation_code,messageId:'late'}),false);
});
test('ambiguous create and confirm responses poll operations without duplicate mutations',async()=>{
  let createKey,confirmKey,created=false,confirmed=false;
  const s=await setup(async(_config,path,options)=>{
    if(path==='orders'){createKey=options.idempotencyKey;created=true;return{operation_id:createKey};}
    if(path==='operations/'+createKey)return{status:'completed',resource:{type:'order',id:500},result:{data:{id:500,status:'PENDING'}}};
    if(path==='orders/500/confirm'){confirmKey=options.idempotencyKey;confirmed=true;return{operation_id:confirmKey};}
    if(path==='operations/'+confirmKey)return{status:'completed',result:{data:{id:500,status:'CONFIRMED'}}};
    if(path==='orders/500')return{id:500,status:confirmed?'CONFIRMED':'PENDING',line_items:[]};
    throw new Error('Unexpected path '+path);
  });
  const o=s.accept();await s.send();s.flow.receive({phone:input.phone,text:'CONFIRMO '+s.row(o.id).confirmation_code,messageId:'async-reply'});await s.flow.dispatchNext();assert.equal(s.row(o.id).state,'CREATE_PENDING');s.time('2026-11-06T12:01:00.000Z');await s.flow.dispatchNext();assert.equal(s.row(o.id).state,'CONFIRM_PENDING');s.time('2026-11-06T12:02:00.000Z');await s.flow.dispatchNext();assert.equal(s.row(o.id).state,'SENT_TO_DROPEA');assert(created&&confirmed);assert.equal(s.calls.filter(c=>c.method==='POST').length,2);
});
test('changed country credentials block dispatch to a different account',async()=>{const s=await setup(),o=s.accept();await s.send();s.flow.receive({phone:input.phone,text:'CONFIRMO '+s.row(o.id).confirmation_code,messageId:'reply-key'});s.key('different-account');await s.flow.dispatchNext();assert.equal(s.row(o.id).state,'DROPEA_ERROR');assert.equal(s.calls.length,0);});
test('automatic confirmations identify the store and process bursts in FIFO order with persistent spacing',async()=>{
  const s=await setup(),a=s.accept(),b=s.accept({request_id:'request-second-123',phone:'+56912345679'}),sent=[];
  const whatsapp={connected:()=>true,send:async(phone,text)=>{sent.push({phone,text});return{id:'message-'+sent.length};}};
  await s.flow.sendNext(whatsapp);await s.flow.sendNext(whatsapp);
  assert.equal(sent.length,1);assert.match(sent[0].text,/somos Landing Chile/);assert(sent[0].text.includes('#'+s.row(a.id).confirmation_code));assert.match(sent[0].text,/Entrega a: Ana Prueba/);assert.match(sent[0].text,/Dirección: Calle 10/);assert.equal(s.row(b.id).state,'WA_PENDING');
  s.time('2026-11-06T12:00:04.000Z');await s.flow.sendNext(whatsapp);assert.equal(sent.length,1);
  s.time('2026-11-06T12:00:05.000Z');await s.flow.sendNext(whatsapp);assert.equal(sent.length,2);assert.equal(sent[1].phone,'+56912345679');assert.deepEqual(s.flow.queueSummary(),{pending:0,waiting:2,intervalSeconds:5});assert.equal(s.calls.length,0);
});
test('a custom business name is frozen on the order and included in the message',async()=>{
  const s=await setup(),source=await s.flow.addSource({name:'Campaña 2',brand_name:'Tienda Juanito',url:'https://otra.pidedirecto.cyou',market:'CL',store_id:20,variant_id:33,unit_price:9900,product_name:'Producto'});
  s.flow.accept(source.public_id,input,{origin:'https://otra.pidedirecto.cyou'});let message='';await s.flow.sendNext({connected:()=>true,send:async(_phone,text)=>{message=text;return{id:'brand-msg'};}});assert.match(message,/somos Tienda Juanito/);assert.equal(s.flow.listSources().find(row=>row.id===source.id).brand_name,'Tienda Juanito');
});
test('automatic sender keeps running while a Dropea dispatch is slow or catalogue synchronization is active',async()=>{
  let release,sends=0,dispatches=0,syncing=false;
  const flow={async sendNext(){sends++;},async dispatchNext(){dispatches++;await new Promise(resolve=>{release=resolve;});}};
  const worker=createLandingWorker({flow,whatsapp:{},canDispatch:()=>!syncing});
  const first=worker.dispatch();await worker.send();await worker.dispatch();assert.equal(sends,1);assert.equal(dispatches,1);
  syncing=true;await worker.send();await worker.dispatch();assert.equal(sends,2);assert.equal(dispatches,1);release();await first;
  await worker.dispatch();assert.equal(dispatches,1);
});
test('natural replies resolve the single active phone association without requiring the order code',async()=>{
  for(const text of ['sí','Si','SÍ!','sí, confirmo','confirmo','confirmado','confirmo el pedido','confirmo mi compra','todo correcto','si lo compre','sí gracias','ok','de acuerdo']){
    const s=await setup(),o=s.accept();await s.send();
    assert.equal(s.flow.receive({phone:input.phone,text,messageId:'natural-'+text}),true,text);
    assert.equal(s.row(o.id).state,'CUSTOMER_CONFIRMED',text);
    await s.flow.dispatchNext();assert.equal(s.row(o.id).state,'SENT_TO_DROPEA');
  }
});
test('questions, negations and requests to change details never confirm through keyword matching',async()=>{
  const s=await setup(),o=s.accept();await s.send();
  for(const text of ['no','no confirmo','si pero cambia la dirección','confirmo pero otro precio','¿confirmo?','sí?','gracias','todavía no confirmo','confirmo mañana','si cuando llega','sí no estoy seguro']){
    assert.equal(s.flow.receive({phone:input.phone,text,messageId:'unsafe-'+text}),false,text);
    assert.equal(s.row(o.id).state,'WAITING_CONFIRMATION');
  }
  assert.equal(s.flow.receive({phone:'+56911111111',text:'si',messageId:'wrong-phone'}),false);
});
test('a unique abbreviated reference works, but a wrong reference never falls back to the only pending order',async()=>{
  const s=await setup(),o=s.accept();await s.send();s.db.prepare("UPDATE landing_orders SET confirmation_code='A1B2C3D4E5' WHERE id=?").run(o.id);
  assert.equal(s.flow.receive({phone:input.phone,text:'confirmo FF',messageId:'bad-prefix'}),false);
  assert.equal(s.row(o.id).state,'WAITING_CONFIRMATION');
  assert.equal(s.flow.receive({phone:input.phone,text:'confirmo A1',messageId:'good-prefix'}),true);
});
test('multiple pending orders require clarification or a reply to the specific WhatsApp message',async()=>{
  const s=await setup(),a=s.accept(),b=s.accept({request_id:'second-same-phone-123'});
  let sends=0;const whatsapp={connected:()=>true,send:async()=>({id:'outbound-'+(++sends)})};
  await s.flow.sendNext(whatsapp);s.time('2026-11-06T12:00:05.000Z');await s.flow.sendNext(whatsapp);
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'ambiguous-yes'}),false);
  assert.equal(s.row(a.id).state,'WAITING_CONFIRMATION');assert.equal(s.row(b.id).state,'WAITING_CONFIRMATION');
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM landing_reply_queue WHERE state='PENDING'").get().n,1);
  s.flow.receive({phone:input.phone,text:'confirmo',messageId:'another-ambiguous'});assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM landing_reply_queue').get().n,1);
  s.time('2026-11-06T12:00:10.000Z');let clarification='';await s.flow.sendNext({connected:()=>true,send:async(_phone,text)=>{clarification=text;return{id:'clarify'};}});assert(clarification.includes(s.row(a.id).confirmation_code));assert(clarification.includes(s.row(b.id).confirmation_code));
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'quoted-yes',quotedMessageId:'outbound-2'}),true);assert.equal(s.row(b.id).state,'CUSTOMER_CONFIRMED');assert.equal(s.row(a.id).state,'WAITING_CONFIRMATION');
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'ambiguous-yes'}),false);assert.equal(s.row(a.id).state,'WAITING_CONFIRMATION');
});
test('closed associations allow a new purchase without accepting old quotes, old codes or old message deliveries',async()=>{
  const s=await setup(),a=s.accept();await s.send();assert(s.flow.receive({phone:input.phone,text:'si',messageId:'first-yes'}));await s.flow.dispatchNext();
  s.time('2026-11-06T12:01:00.000Z');const b=s.accept({request_id:'new-purchase-1234'});
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'unsent-yes'}),false);
  await s.flow.sendNext({connected:()=>true,send:async()=>({id:'outgoing-2'})});
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'first-yes'}),false);
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'old-quote',quotedMessageId:'outgoing-1'}),false);
  assert.equal(s.flow.receive({phone:input.phone,text:'confirmo '+s.row(a.id).confirmation_code,messageId:'old-code'}),false);
  assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'delayed-old-message',messageAt:'2026-11-06T12:00:01.000Z'}),false);
  assert.equal(s.row(b.id).state,'WAITING_CONFIRMATION');assert(s.flow.receive({phone:input.phone,text:'confirmo',messageId:'new-order-yes',messageAt:'2026-11-06T12:01:01.000Z'}));assert.equal(s.row(b.id).state,'CUSTOMER_CONFIRMED');
});
test('cancel and expiry close the phone association; colliding short references require the full code',async()=>{
  const s=await setup(),a=s.accept();await s.send();s.db.prepare("UPDATE landing_orders SET confirmation_code='A1B2C3D4E5' WHERE id=?").run(a.id);
  assert(s.flow.receive({phone:input.phone,text:'cancelar',messageId:'natural-cancel'}));assert.equal(s.row(a.id).state,'CUSTOMER_CANCELLED');
  s.time('2026-11-06T12:01:00.000Z');const b=s.accept({request_id:'another-purchase-123'});await s.send();s.db.prepare("UPDATE landing_orders SET confirmation_code='A1C2C3D4E5' WHERE id=?").run(b.id);
  assert.equal(s.flow.receive({phone:input.phone,text:'confirmo A1',messageId:'collision'}),false);assert.equal(s.row(b.id).state,'WAITING_CONFIRMATION');
  s.time('2026-11-08T12:00:00.000Z');assert.equal(s.flow.receive({phone:input.phone,text:'sí',messageId:'expired-natural'}),false);await s.flow.sendNext({connected:()=>false});assert.equal(s.row(b.id).state,'EXPIRED');
});
test('interrupted WhatsApp sends require review but can still receive the matching confirmation',async()=>{const s=await setup(),o=s.accept();s.db.prepare("UPDATE landing_orders SET state='WA_SENDING' WHERE id=?").run(o.id);const flow=createLandingFlow({db:s.db,connections:{},request:()=>{},clock:()=> '2026-11-06T12:01:00.000Z'});assert.equal(s.row(o.id).state,'MESSAGE_UNKNOWN');assert(flow.receive({phone:input.phone,text:'CONFIRMO '+s.row(o.id).confirmation_code,messageId:'after-restart'}));});
test('WhatsApp credentials and signal keys persist encrypted, never in plaintext',async()=>{const db=new DatabaseSync(':memory:'),key=randomBytes(32).toString('base64'),auth=encryptedAuth(db,key);auth.state.creds.testSecret='private-test-credential';auth.save();await auth.state.keys.set({'session':{'number':Buffer.from('secret-session')}});const stored=JSON.stringify(db.prepare('SELECT * FROM whatsapp_auth').all());assert(!stored.includes('private-test-credential'));assert(!stored.includes('secret-session'));const reopened=encryptedAuth(db,key);assert.equal(reopened.state.creds.testSecret,'private-test-credential');assert.deepEqual((await reopened.state.keys.get('session',['number'])).number,Buffer.from('secret-session'));});
test('WhatsApp manager ignores history, own and group messages; accepts verified sender phone',async()=>{const db=new DatabaseSync(':memory:'),ev=new EventEmitter(),messages=[];const wa=createWhatsApp({db,encryptionKey:randomBytes(32).toString('base64'),onMessage:m=>messages.push(m),socketFactory:()=>({ev,user:{id:'56900000000:1@s.whatsapp.net'},end(){},async logout(){}})});await wa.connect();ev.emit('connection.update',{connection:'open'});assert(wa.connected());const item={key:{remoteJid:'56912345678@s.whatsapp.net',id:'msg'},message:{conversation:'CONFIRMO A1B2C3D4E5'}};ev.emit('messages.upsert',{type:'append',messages:[item]});ev.emit('messages.upsert',{type:'notify',messages:[{...item,key:{...item.key,fromMe:true}},{...item,key:{...item.key,remoteJid:'group@g.us'}}]});assert.equal(messages.length,0);ev.emit('messages.upsert',{type:'notify',messages:[item]});assert.equal(messages[0].phone,'+56912345678');await wa.disconnect();assert.equal(wa.status().state,'disconnected');});
