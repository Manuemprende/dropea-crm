import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, verifyPassword, installAuth } from './auth.js';

test('password verification uses salted hashes and rejects invalid credentials', async () => {
  const hash = await hashPassword('private-test-password');
  assert.equal(await verifyPassword('private-test-password', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('private-test-password', 'invalid'), false);
  assert.notEqual(await hashPassword('private-test-password'), hash);
});

test('login protects APIs, sets a secure cookie, survives a new auth instance and revokes logout', async () => {
  const db = new DatabaseSync(':memory:');
  const app = express(); app.use(express.json());
  const passwordHash = await hashPassword('private-test-password');
  installAuth(app, db, { username:'admin', passwordHash, secure:true });
  app.get('/api/private', (_req,res)=>res.json({private:true}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (body,ip='client-1')=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Real-IP':ip},body:JSON.stringify(body)});
  try {
    const denied=await fetch(base+'/api/private'); assert.equal(denied.status,401); assert.equal(denied.headers.get('www-authenticate'),null);
    assert.equal((await denied.json()).code, 'SESSION_REQUIRED');
    assert.equal((await (await fetch(base+'/api/auth/session')).json()).authenticated,false);
    assert.equal((await login({username:'admin',password:'wrong'})).status,401);
    const good=await login({username:'admin',password:'private-test-password',remember:true}); assert.equal(good.status,200);
    const setCookie=good.headers.get('set-cookie');
    for(const flag of ['__Host-dropea_session=','HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=604800']) assert.ok(setCookie.includes(flag),flag);
    const cookie=setCookie.split(';')[0];
    const stored=db.prepare('SELECT token_hash FROM sessions').get().token_hash; assert.ok(!cookie.includes(stored));
    assert.equal((await fetch(base+'/api/private',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(base+'/api/private',{headers:{Cookie:'__Host-dropea_session=forged'}})).status,401);
    const secondApp=express(); secondApp.use(express.json()); installAuth(secondApp,db,{username:'admin',passwordHash,secure:true});
    const persisted=await (await fetch(base+'/api/auth/session',{headers:{Cookie:cookie}})).json(); assert.equal(persisted.authenticated,true);
    await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:cookie}});
    assert.equal((await fetch(base+'/api/private',{headers:{Cookie:cookie}})).status,401);
    for(let i=0;i<10;i++) assert.equal((await login({username:'admin',password:'wrong'},'client-2')).status,401);
    assert.equal((await login({username:'admin',password:'private-test-password'},'client-2')).status,429);
    db.prepare('INSERT INTO sessions VALUES (?,?)').run('expired',Date.now()-1);
    const fresh=await login({username:'admin',password:'private-test-password'},'client-3');assert.equal(fresh.status,200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires<=?').get(Date.now()).count,0);
  } finally { await new Promise(resolve=>server.close(resolve)); db.close(); }
});
