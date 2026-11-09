import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fetchAll, requestDropea, verifySignature } from './core.js';

const config = { market: 'CL', apiKey: 'test-server-key' };
const response = data => new Response(JSON.stringify({ success: true, data }), { status: 200 });
test('validates the exact official Dropea webhook test vector', () => {
  const raw = Buffer.from('{"topic":"order.cancelled","event_id":"00000000-0000-4000-8000-000000000000"}');
  const secret = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
  assert.equal(verifySignature(raw, 'sha256=IKoJQrqiOmdXLf9FwEIiRn3K/nFs7OD21DIPcPkx9fs=', secret), true);
  assert.equal(verifySignature(Buffer.from(raw.toString() + ' '), 'sha256=IKoJQrqiOmdXLf9FwEIiRn3K/nFs7OD21DIPcPkx9fs=', secret), false);
  assert.equal(verifySignature(raw, '', secret), false);
  assert.equal(verifySignature(raw, 'sha256=' + createHmac('sha256', 'other').update(raw).digest('base64'), secret), false);
});
test('targets Chile REST with Bearer auth and keeps the token out of the URL', async () => {
  await requestDropea(config, 'me', { fetcher: async (url, options) => {
    assert.equal(url, 'https://cl.public-api.dropea.com/dropshipper/me');
    assert.equal(options.headers.Authorization, 'Bearer test-server-key');
    return response({ id: 4 });
  } });
});
test('reads all pages instead of silently showing the first 100 orders', async () => {
  let pages = 0;
  const items = await fetchAll(config, 'orders', async url => {
    pages++; const page = Number(new URL(url).searchParams.get('page'));
    return response({ items: Array.from({length: page === 1 ? 100 : 3}, (_,i)=>({id: (page-1)*100+i})), pagination: { total: 103, total_pages: 2 } });
  });
  assert.equal(pages, 2); assert.equal(items.length, 103);
});
test('does not perform a spurious extra call for a full last page', async () => {
  let calls = 0;
  const items = await fetchAll(config, 'orders', async () => { calls++; return response({items: Array.from({length:100},(_,id)=>({id})),pagination:{total:100,total_pages:1}}); });
  assert.equal(calls,1); assert.equal(items.length,100);
});

test('uses pagination metadata when Dropea returns fewer than the requested page size',async()=>{
  let pages=0;const progress=[];
  const items=await fetchAll(config,'products',async()=>{
    pages++;return response({items:Array.from({length:pages===1?20:3},(_,id)=>({id:(pages-1)*20+id})),pagination:{total:23,total_pages:2,has_next_page:pages===1}});
  },{onPage:p=>progress.push(p.loaded)});
  assert.equal(pages,2);assert.equal(items.length,23);assert.deepEqual(progress,[20,23]);
});

test('a pagination failure does not silently accept a truncated catalogue',async()=>{
  await assert.rejects(fetchAll(config,'products',async()=>response({items:[],pagination:{total:30,total_pages:3,has_next_page:true}})),/página vacía/);
});
test('rejects missing keys, invalid markets and upstream permission failures', async () => {
  await assert.rejects(requestDropea({ market:'CL' }, 'orders'), /Conecta/);
  await assert.rejects(requestDropea({ ...config, market:'invalid' }, 'orders'), /Mercado/);
  await assert.rejects(requestDropea(config, 'orders', { fetcher:async()=>new Response('{}',{status:403}) }), /permisos/);
});

test('Dropea token rejection has its own code, distinct from CRM session expiry', async () => {
  await assert.rejects(requestDropea(config, 'me', { fetcher: async () => new Response('{}', { status: 401 }) }), error => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'DROPEA_UNAUTHORIZED');
    assert.match(error.message, /mercado seleccionado/);
    assert.match(error.message, /sesión del CRM sigue activa/);
    return true;
  });
});

test('Spain, Italy, Portugal and Chile each target their own official market host', async () => {
  for (const market of ['ES', 'IT', 'PT', 'CL']) {
    await requestDropea({ ...config, market }, 'me', { fetcher: async (url) => {
      assert.equal(url, `https://${market.toLowerCase()}.public-api.dropea.com/dropshipper/me`);
      return response({ id: 1 });
    } });
  }
});
