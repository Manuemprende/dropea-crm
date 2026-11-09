import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {randomBytes} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createWhatsAppInbox} from './whatsapp-inbox.js';
import {createLandingFlow} from './landing-flow.js';
import {createWhatsApp} from './whatsapp.js';
import {installWhatsAppInbox} from './whatsapp-http.js';
const phone='+56912345678';
function setup(){const db=new DatabaseSync(':memory:');let time='2026-11-08T12:00:00.000Z';const inbox=createWhatsAppInbox({db,clock:()=>time});const flow=createLandingFlow({db,clock:()=>time,connections:{load:()=>({market:'CL',apiKey:'test'})},request:async(_c,path)=>path==='shops/20'?{id:20,status:'ACTIVE'}:path==='orders'?{id:50,status:'PENDING'}:{id:50,status:'CONFIRMED'},onTransition:o=>inbox.localOrder(o),canAutomatePhone:p=>inbox.canAutomate(p)});return{db,inbox,flow,time:value=>time=value};}
const remote=(changes={})=>({id:50,status:'SHIPPING',sub_status:'IN_TRANSIT',created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-08T12:00:00Z',shipping_address:{full_name:'Ana',phone_number:phone},line_items:[{product_name:'Producto',quantity:1}],total_amount:19990,currency:'CLP',...changes});

test('inbox deduplicates messages, separates accounts and does not mark imported history as unread',()=>{
 const {inbox,db}=setup();inbox.setAccount('56999999999');inbox.incoming({phone,id:'a',text:'Hola',name:'Ana'});inbox.incoming({phone,id:'a',text:'Hola'});inbox.incoming({phone,id:'old',text:'Antiguo',historical:true,messageAt:'2026-01-01T00:00:00Z'});
 let list=inbox.conversations();assert.equal(list.length,1);assert.equal(list[0].unread,1);assert.equal(list[0].preview,'Hola');assert.equal(inbox.thread(list[0].id).messages.length,2);inbox.read(list[0].id);assert.equal(inbox.conversations()[0].unread,0);
 inbox.setAccount('other');assert.equal(inbox.conversations().length,0);inbox.incoming({phone,id:'a',text:'Otra cuenta'});assert.equal(inbox.conversations().length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM wa_messages').get().n,3);db.close();
});
test('outbound receipts arriving before the send result correlate once and never regress read to delivered or failed',()=>{
 const {inbox,db}=setup();const id=inbox.beginSend({phone,text:'Confirmación',origin:'automatic'});assert.equal(db.prepare('SELECT status FROM wa_messages WHERE id=?').get(id).status,'pending');
 inbox.receipt({id:'provider',status:'read'});inbox.incoming({phone,id:'provider',text:'Confirmación',fromMe:true,status:'sent'});inbox.sent(id,{id:'provider'});inbox.receipt({id:'provider',status:'delivered'});inbox.receipt({id:'provider',status:'failed'});
 const t=inbox.thread(inbox.conversations()[0].id);assert.equal(t.messages.length,1);assert.equal(t.messages[0].status,'read');assert.equal(t.messages[0].origin,'automatic');assert.equal(t.conversation.unread,0);db.close();
});
test('restart preserves the inbox and marks an interrupted send unknown instead of resending',()=>{
 const {inbox,db}=setup();inbox.beginSend({phone,text:'Mensaje interrumpido'});const next=createWhatsAppInbox({db});const t=next.thread(next.conversations()[0].id);assert.equal(t.messages[0].status,'unknown');assert.match(t.messages[0].error,/reinició/);db.close();
});
test('late webhook stays in the timeline without regressing the pipeline; country IDs stay distinct',()=>{
 const {inbox,db}=setup();inbox.remoteOrder('CL:key',remote({status:'FINISH',sub_status:'DELIVERED',delivered_at:'2026-11-08T12:00:00Z'}));inbox.remoteOrder('CL:key',remote({status:'PROCESSING',updated_at:'2026-11-02T12:00:00Z'}),{source:'webhook',eventId:'old',eventAt:'2026-11-02T12:00:00Z'});inbox.remoteOrder('CL:key',remote(),{source:'webhook',eventId:'old',eventAt:'2026-11-02T12:00:00Z'});
 assert.equal(inbox.pipeline().orders[0].stage,'delivered');const contact=inbox.customers()[0];assert.equal(inbox.customerDetail(contact.id).timeline.filter(t=>t.source==='webhook').length,1);inbox.remoteOrder('MX:key',remote({currency:'MXN'}));assert.equal(inbox.pipeline().orders.length,2);db.close();
});
test('local orders merge into remote orders and expose honest client delivery metrics',async()=>{
 const {inbox,flow,db}=setup();const source=await flow.addSource({name:'Oferta',market:'CL',store_id:20,variant_id:33,unit_price:19990,product_name:'Producto'});const o=flow.accept(source.public_id,{request_id:'request-test-12345',first_name:'Ana',last_name:'Prueba',email:'ana@example.test',phone,address:'Calle 10',city:'Santiago',state:'Metropolitana',quantity:1,consent:true},{apiKey:source.apiKey});
 inbox.remoteOrder('CL:key',remote({external_order_id:'CRM-'+o.id,status:'FINISH',sub_status:'DELIVERED',delivered_at:'2026-11-10T12:00:00Z',updated_at:'2026-11-10T12:00:00Z',customer_reliability:{delivery_rate:0.8,total_computable:20}}));assert.equal(inbox.pipeline().orders.length,1);assert.equal(inbox.pipeline().orders[0].local_id,o.id);
 inbox.remoteOrder('CL:key',remote({id:51,status:'PENDING'}));const c=inbox.customerDetail(inbox.customers()[0].id);assert.equal(c.stats.total,2);assert.equal(c.stats.completed,1);assert.equal(c.stats.deliveryRate,100);assert.equal(c.stats.averageDeliveryDays,2);assert.equal(c.stats.firstAttemptRate,null);assert.equal(c.reliability[0].value.delivery_rate,0.8);const summary=inbox.customers()[0];assert.equal(summary.deliveryRate,c.stats.deliveryRate);assert.equal(summary.averageDeliveryDays,c.stats.averageDeliveryDays);assert.equal(summary.completed,1);db.close();
});
test('human attention and global pause stop new automatic sends and customer confirmations without blocking another phone',async()=>{
 const {inbox,flow,db}=setup();const source=await flow.addSource({name:'Oferta',market:'CL',store_id:20,variant_id:33,unit_price:19990,product_name:'Producto'});const input={request_id:'request-test-12345',first_name:'Ana',last_name:'Prueba',email:'ana@example.test',phone,address:'Calle 10',city:'Santiago',state:'Metropolitana',quantity:1,consent:true};const a=flow.accept(source.public_id,input,{apiKey:source.apiKey});flow.accept(source.public_id,{...input,phone:'+56912345679',request_id:'request-test-67890'},{apiKey:source.apiKey});const conv=inbox.conversations().find(c=>c.phone===phone);inbox.mode(conv.id,'human');const sent=[];const wa={connected:()=>true,send:async p=>{sent.push(p);return{id:'send-1'};}};
 await flow.sendNext(wa);assert.deepEqual(sent,['+56912345679']);assert.equal(flow.receive({phone,text:'sí',messageId:'confirm-human'}),false);inbox.setAutomatic(false);inbox.mode(conv.id,'automatic');assert.equal(inbox.canAutomate(phone),false);inbox.setAutomatic(true);assert.equal(inbox.canAutomate(phone),true);assert.equal(db.prepare('SELECT state FROM landing_orders WHERE id=?').get(a.id).state,'WA_PENDING');db.close();
});
test('message history and own-phone echoes persist but only a fresh customer text reaches confirmation automation',async()=>{
 const {inbox,db}=setup();const ev=new EventEmitter(),received=[];const manager=createWhatsApp({db,encryptionKey:randomBytes(32).toString('base64'),onMessage:m=>received.push(m),onPersist:m=>inbox.incoming(m),onReceipt:r=>inbox.receipt(r),onAccount:a=>inbox.setAccount(a),socketFactory:()=>({ev,user:{id:'56999999999:1@s.whatsapp.net'}})});await manager.connect();ev.emit('connection.update',{connection:'open'});
 const item=(id,fromMe=false)=>({key:{id,remoteJid:'56912345678@s.whatsapp.net',fromMe},message:{conversation:'sí'},messageTimestamp:1794139200});ev.emit('messaging-history.set',{messages:[item('old')]});ev.emit('messages.upsert',{messages:[item('echo',true)],type:'notify'});ev.emit('messages.upsert',{messages:[item('new')],type:'notify'});await new Promise(r=>setImmediate(r));assert.equal(received.length,1);assert.match(received[0].messageId,/new$/);assert.equal(inbox.thread(inbox.conversations()[0].id).messages.length,3);db.close();
});
test('operator replies are idempotent, offline replies fail clearly, notes stay internal and SSE cleans up',async()=>{
 const {inbox,db}=setup();inbox.incoming({phone,id:'hello',text:'Hola'});const conv=inbox.conversations()[0];let sends=0,online=true;const app=express();app.use(express.json());installWhatsAppInbox(app,{inbox,worker:{kick(){}},whatsapp:{connected:()=>online,send:async(p,text,ctx)=>{sends++;const id=inbox.beginSend({phone:p,text,...ctx});await new Promise(r=>setTimeout(r,10));inbox.sent(id,{id:'manual-'+sends});}},connections:{},requestDropea(){},scope(){}});app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/whatsapp';const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{const body={text:'Hola Ana',request_id:'request-manual-123'};const responses=await Promise.all([post('/conversations/'+conv.id+'/messages',body),post('/conversations/'+conv.id+'/messages',body)]);assert(responses.every(r=>r.ok));assert.equal(sends,1);online=false;assert.equal((await post('/conversations/'+conv.id+'/messages',{...body,request_id:'request-offline-123'})).status,409);await post('/conversations/'+conv.id+'/notes',{text:'Revisar dirección'});assert.equal(sends,1);assert(inbox.customerDetail(conv.customer_id).timeline.some(t=>t.kind==='note'));
 const abort=new AbortController();const stream=await fetch(url+'/events',{signal:abort.signal});assert.match(stream.headers.get('content-type'),/text\/event-stream/);await stream.body.getReader().read();abort.abort();await new Promise(r=>setTimeout(r,20));assert.equal(inbox.bus.listenerCount('change'),0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
});
