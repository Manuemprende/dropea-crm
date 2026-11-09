import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createConnections } from './connections.js';
import { encryptConnection } from './credentials.js';

test('country connections and selected country persist independently across restarts', () => {
  const settings = new Map();
  const encryptionKey = randomBytes(32).toString('base64');
  const initial = {market:'CL',apiKey:'',secret:''};
  const options = {get:k=>settings.get(k),set:(k,v)=>settings.set(k,v),encryptionKey,initial};
  settings.set('connection:encrypted',encryptConnection({market:'CL',apiKey:'original-chile',secret:'chile-secret'},encryptionKey));
  const first=createConnections(options);
  assert.equal(first.active.apiKey,'original-chile');
  first.save({market:'ES',apiKey:'spain-key',secret:'spain-secret'});first.select('ES');
  const restarted=createConnections(options);
  assert.equal(restarted.active.market,'ES');assert.equal(restarted.active.apiKey,'spain-key');
  restarted.select('CL');assert.equal(restarted.active.apiKey,'original-chile');
  restarted.select('MX');assert.equal(restarted.active.apiKey,'');assert.equal(restarted.active.secret,'');
  restarted.save({market:'CL',apiKey:'',secret:''});
  const afterDisconnect=createConnections(options);afterDisconnect.select('CL');assert.equal(afterDisconnect.active.apiKey,'');
  assert.equal(afterDisconnect.load('ES').apiKey,'spain-key');
  assert.equal(JSON.stringify(afterDisconnect.list()).includes('spain-key'),false);
  assert.throws(()=>afterDisconnect.select('XX'));
});

test('local memory mode keeps secrets separated by country',()=>{
  const state=new Map();const store=createConnections({get:k=>state.get(k),set:(k,v)=>state.set(k,v),initial:{market:'CL',apiKey:'local-key',secret:'local-secret'}});
  store.save({market:'PT',apiKey:'portugal-key',secret:'portugal-secret'});
  store.select('PT');assert.equal(store.active.apiKey,'portugal-key');
  store.select('CL');assert.equal(store.active.apiKey,'local-key');
  assert.equal(store.load('PT').secret,'portugal-secret');
});
