import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

test('signed HTTP events persist exactly once, reject forgery and do not regress order state', async () => {
  const secret = 'a'.repeat(64);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
    cwd: mkdtempSync(join(tmpdir(), 'dropea-http-test-')),
    env: { ...process.env, PORT: '3317', DROPEA_MARKET: 'CL', DROPEA_API_KEY: '', DROPEA_SIGNING_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Test server failed to start')),20000);
      child.stdout.on('data',chunk=>{if(chunk.toString().includes('CRM:')){clearTimeout(timer);resolve();}});
      child.on('error',err=>{clearTimeout(timer);reject(err);});
      child.on('exit',code=>{if(code){clearTimeout(timer);reject(new Error(`Test server exited ${code}`));}});
    });
    const event = { topic:'order.status.changed', market:'CL', event_id:'event-1', event_at:'2026-11-05T16:00:00Z', resource_id:51, resource:{id:51,status:'SHIPPING',updated_at:'2026-11-05T16:00:00Z'} };
    const send = async (payload, signed=true) => { const body=JSON.stringify(payload); return fetch('http://127.0.0.1:3317/api/webhooks/dropea',{method:'POST',headers:{'Content-Type':'application/json','X-Dropea-Signature':signed?'sha256='+createHmac('sha256',secret).update(body).digest('base64'):'bad-signature'},body}); };
    assert.equal((await send(event,false)).status,401);
    assert.equal((await send(event)).status,200);
    assert.equal((await send(event)).status,200);
    const old = {...event,event_id:'event-2',event_at:'2026-11-05T10:00:00Z',resource:{id:51,status:'PENDING',updated_at:'2026-11-05T10:00:00Z'}};
    // Switching the dashboard does not interrupt signed events from another saved country.
    assert.equal((await fetch('http://127.0.0.1:3317/api/market',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:'MX'})})).status,200);
    assert.equal((await send(old)).status,200);
    assert.equal((await send({...event,market:'MX',event_id:'event-3'})).status,401);
    const mexicoCache=await (await fetch('http://127.0.0.1:3317/api/data')).json();
    assert.equal(mexicoCache.orders.length,0);
    await fetch('http://127.0.0.1:3317/api/market',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:'CL'})});
    const cache=await (await fetch('http://127.0.0.1:3317/api/data')).json();
    assert.equal(cache.orders.length,1); assert.equal(cache.orders[0].status,'SHIPPING'); assert.equal(cache.events.length,2);
  } finally { child.kill(); }
});
