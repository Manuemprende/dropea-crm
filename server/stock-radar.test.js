import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createStockRadar, compareStocks, variantStocks } from './stock-radar.js';

test('only matched numeric variant stock decreases count as movement',()=>{
  const before={a:100,b:40,removed:25};
  assert.deepEqual(compareStocks(before,{a:80,b:45,new:0}),{decrease:20,increase:5,compared:2});
  assert.deepEqual(variantStocks({variants:[{variant_id:1,stock:0},{variant_id:2,stock:null},{variant_id:3,stock:-5},{variant_id:4,stock:'30'}]}),{'1':0});
});

test('radar preserves real history, separates countries and counts drops without labeling restocks as sales',()=>{
  const db=new DatabaseSync(':memory:');const radar=createStockRadar(db);
  const product=(stock)=>({id:1,variants:[{variant_id:5,stock}]});
  try{
    radar.record('ES',[product(100)],'2026-11-06T08:00:00.000Z');
    let signal=radar.signals('ES',Date.parse('2026-11-06T08:01:00Z'))['1'];
    assert.equal(signal.drop24h,0);assert.equal(signal.compared,false);assert.equal(signal.observations,1);
    radar.record('ES',[product(70)],'2026-11-06T08:30:00.000Z');
    radar.record('ES',[product(90)],'2026-11-06T09:00:00.000Z');
    radar.record('ES',[product(88)],'2026-11-06T09:30:00.000Z');
    radar.record('ES',[product(1)],'2026-11-06T09:00:00.000Z'); // stale and duplicate ignored
    radar.record('MX',[product(500)],'2026-11-06T09:30:00.000Z');
    signal=radar.signals('ES',Date.parse('2026-11-06T09:31:00Z'))['1'];
    assert.equal(signal.drop24h,32);assert.equal(signal.restocked24h,20);assert.equal(signal.currentStock,88);
    assert.equal(signal.observations,4);assert.equal(signal.compared,true);
    assert.deepEqual(signal.history.map(x=>x.stock),[100,70,90,88]);
    assert.equal(radar.signals('MX',Date.parse('2026-11-06T09:31:00Z'))['1'].drop24h,0);
  }finally{db.close();}
});

test('removed or unknown variants and observations older than 24h do not create daily false signals',()=>{
  const db=new DatabaseSync(':memory:');const radar=createStockRadar(db);
  try{
    radar.record('PT',[{id:1,variants:[{variant_id:1,stock:100},{variant_id:2,stock:60}]}],'2026-11-03T08:00:00.000Z');
    radar.record('PT',[{id:1,variants:[{variant_id:1,stock:20}]}],'2026-11-06T09:00:00.000Z');
    let signal=radar.signals('PT',Date.parse('2026-11-06T09:01:00Z'))['1'];assert.equal(signal.drop24h,0);assert.equal(signal.compared,false);
    radar.record('PT',[{id:1,variants:[{variant_id:1,stock:20},{variant_id:3,stock:5}]}],'2026-11-06T09:30:00.000Z');
    signal=radar.signals('PT',Date.parse('2026-11-06T09:31:00Z'))['1'];assert.equal(signal.drop24h,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM stock_snapshots').get().n,2);
  }finally{db.close();}
});
