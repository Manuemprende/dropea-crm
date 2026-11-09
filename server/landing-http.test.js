import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLandingFlow } from './landing-flow.js';
import { hashPassword } from './auth.js';

test('public landing intake works without a CRM session while configuration and WhatsApp remain private',async()=>{
  const cwd=mkdtempSync(join(tmpdir(),'dropea-landing-http-'));mkdirSync(join(cwd,'data'));const db=new DatabaseSync(join(cwd,'data','crm.sqlite'));
  const flow=createLandingFlow({db,connections:{load:()=>({apiKey:'test-only-key'})},request:async()=>({id:20,status:'ACTIVE'})});
  const source=await flow.addSource({name:'Test',url:'https://prueba.pidedirecto.cyou',market:'CL',store_id:20,variant_id:33,product_name:'Test product',unit_price:10000});db.close();
  const child=spawn(process.execPath,[fileURLToPath(new URL('./index.js',import.meta.url))],{cwd,env:{...process.env,NODE_ENV:'test',PORT:'3318',PUBLIC_ORIGIN:'https://crm.example.test',ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:await hashPassword('test-only-password'),CONNECTION_ENCRYPTION_KEY:'',DROPEA_API_KEY:'',DROPEA_SIGNING_SECRET:''},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),20000);child.stdout.on('data',data=>{if(data.toString().includes('CRM:')){clearTimeout(timer);resolve();}});child.on('exit',code=>{if(code){clearTimeout(timer);reject(new Error('Server startup failed'));}});child.on('error',reject);});
    const base='http://127.0.0.1:3318',path='/api/landings/'+source.public_id;
    for(const privatePath of ['/api/whatsapp','/api/whatsapp/events','/api/whatsapp/conversations','/api/whatsapp/pipeline','/api/whatsapp/customers','/api/landings','/api/landing-orders','/api/landing-options?market=CL'])assert.equal((await fetch(base+privatePath)).status,401);
    const preflight=await fetch(base+path+'/orders',{method:'OPTIONS',headers:{Origin:'https://prueba.pidedirecto.cyou'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://prueba.pidedirecto.cyou');
    assert.equal((await fetch(base+path+'/orders',{method:'OPTIONS',headers:{Origin:'https://evil.example'}})).status,403);
    const script=await fetch(base+path+'/form.js');assert.equal(script.status,200);const js=await script.text();assert(!js.includes(source.apiKey));assert(!js.includes('test-only-key'));assert(js.includes('request_id'));
    const payload={request_id:'test-http-request-123',first_name:'Ana',last_name:'Test',email:'ana@example.test',phone:'+56912345678',address:'Calle 10',city:'Santiago',state:'Metropolitana',consent:true};
    const submit=origin=>fetch(base+path+'/orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    assert.equal((await submit('https://evil.example')).status,403);
    const response=await submit('https://prueba.pidedirecto.cyou');assert.equal(response.status,202);const accepted=await response.json();assert.equal(accepted.state,'WA_PENDING');assert(!('confirmation_code' in accepted));
    const duplicate=await (await submit('https://prueba.pidedirecto.cyou')).json();assert.equal(duplicate.id,accepted.id);assert.equal(duplicate.duplicate,true);
  }finally{child.kill();}
});
