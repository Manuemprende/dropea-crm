import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {visitorSegments} from './visitor-segments.js';

for(const source of ['native','nexora'])test(`${source}: visitor groups use landing history and range, never order counts`,()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE live_sessions(source_id TEXT,visitor_id TEXT,date TEXT,session_id TEXT);
    CREATE TABLE landing_sessions(landing_id TEXT,visitor_id TEXT,date TEXT,session_id TEXT);
    CREATE TABLE landing_visits(landing_id TEXT,visitor_id TEXT,date TEXT);`);
  const table=source==='native'?'live_sessions':'landing_sessions';
  let index=0;const add=(id,v,d,session='s'+index++)=>db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`).run(id,v,d,session);
  add('a','old','2026-10-31');add('a','old','2026-11-01');add('a','old','2026-11-07');
  add('a','new','2026-11-01','same-session');add('a','new','2026-11-01','same-session');
  add('a','new','2026-11-09'); // A later return cannot rewrite an earlier report.
  add('a','returned-this-week','2026-11-01');add('a','returned-this-week','2026-11-01');add('a','returned-this-week','2026-11-07');
  add('b','new','2026-10-01'); // Other landings do not change this landing's visitor.
  add('a','not-in-range','2026-10-01');add('a','future','2026-11-08');add('a','','2026-11-03');
  if(source==='nexora'){
   db.prepare('INSERT INTO landing_visits VALUES(?,?,?)').run('a','old','2026-10-31');
   db.prepare('INSERT INTO landing_visits VALUES(?,?,?)').run('a','new','2026-11-01');
   db.prepare('INSERT INTO landing_visits VALUES(?,?,?)').run('a','legacy','2026-11-04');
  }
  const extra=source==='nexora'?1:0;
  const r=visitorSegments(db,'a',{from:'2026-11-01',to:'2026-11-07'},source);
  assert.equal(r.total,3+extra);assert.equal(r.new_visitors,1+extra);assert.equal(r.returning_visitors,2);
  assert.equal(r.new_visitors+r.returning_visitors,r.total);
  const today=visitorSegments(db,'a',{from:'2026-11-07',to:'2026-11-07'},source);
  assert.equal(today.new_visitors,0);assert.equal(today.returning_visitors,2);
  const all=visitorSegments(db,'a',{from:'0000-01-01',to:'2026-11-07'},source);
  assert.equal(all.total,4+extra);assert.equal(all.new_visitors,2+extra);assert.equal(all.returning_visitors,2);
  assert.equal(visitorSegments(db,'none',{from:'2026-11-01',to:'2026-11-07'},source).total,0);
 }finally{db.close();}
});
