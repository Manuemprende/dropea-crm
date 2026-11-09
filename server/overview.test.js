import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCountries,createExchangeRates} from './overview.js';
const clock=()=>Date.parse('2026-11-06T15:00:00Z'),fx={rates:{EUR:1,CLP:1000,MXN:20},updatedAt:'2026-11-06T00:00:00Z',stale:false};
const order=(amount,currency,extra={})=>({id:1,status:'PENDING',total_amount:amount,currency,created_at:'2026-11-06T14:00:00Z',shipping_address:{first_name:'Ana'},...extra});
const countries=[{market:'CL',configured:true,lastSync:null,orders:[order(1000,'CLP',{status:'DELIVERED'}),order(5000,'CLP',{status:'FINISH',sub_status:'CANCELLED'})]},{market:'ES',configured:true,lastSync:null,orders:[order(10,'EUR')]},{market:'IT',configured:true,lastSync:null,orders:[order(5,'EUR')]},{market:'MX',configured:true,lastSync:null,orders:[order(40,'MXN'),order(1000,'MXN',{status:'ERROR'})]},{market:'PT',configured:false,lastSync:null,orders:[]}];
test('global overview converts each native currency before summing, keeps country identities and excludes errors/cancellations from revenue',()=>{
  const summary=summarizeCountries(countries,{currency:'CLP',period:'Todo',fx,clock});assert.equal(summary.total,18000);assert.equal(summary.orders,6);assert.equal(summary.validOrders,4);assert.equal(summary.ticket,4500);assert.equal(summary.delivered,1);assert.equal(summary.pending,3);assert.equal(summary.markets[1].nativeTotals.EUR,10);assert.equal(summary.markets[3].total,2000);assert.equal(new Set(summary.recent.map(item=>item.market+':'+item.id)).size,4);assert.equal(summary.hourly.reduce((sum,n)=>sum+n,0),18000);
  assert.equal(summarizeCountries(countries,{currency:'EUR',period:'Todo',fx,clock}).total,18);assert.equal(summarizeCountries(countries,{currency:'MXN',period:'Todo',fx,clock}).total,360);
});
test('missing exchange rates never produce a fabricated mixed-currency total or lose order counts',()=>{const summary=summarizeCountries(countries,{currency:'CLP',fx:null,clock});assert.equal(summary.total,null);assert.equal(summary.ticket,null);assert.equal(summary.orders,6);assert.equal(summary.hourly,null);assert.equal(summary.markets[0].total,1000);assert.equal(summary.markets[1].total,null);assert.equal(summary.markets[1].nativeTotals.EUR,10);assert(summary.conversionUnavailable);});
test('global periods consistently use the Chile calendar and reject unknown currencies',()=>{
  const list=[{market:'CL',orders:[order(1,'CLP',{created_at:'2026-11-07T01:00:00Z'}),order(2,'CLP',{created_at:'2026-11-01T14:00:00Z'}),order(4,'CLP',{created_at:'2026-10-31T14:00:00Z'}),order(8,'CLP',{created_at:'2026-10-30T14:00:00Z'})]}];
  assert.equal(summarizeCountries(list,{clock,period:'Hoy'}).total,1);assert.equal(summarizeCountries(list,{clock,period:'7 días'}).total,7);assert.equal(summarizeCountries(list,{clock,period:'Este mes'}).total,3);assert.throws(()=>summarizeCountries(list,{currency:'USD'}),/inválido/);
});
test('exchange rates are persisted, shared between simultaneous requests, cached daily and marked stale on provider failure',async()=>{
  let now=clock(),calls=0;const saved=new Map();let fail=false;
  const service=createExchangeRates({get:k=>saved.get(k),set:(k,v)=>saved.set(k,v),clock:()=>now,fetcher:async()=>{calls++;if(fail)throw new Error('offline');return Response.json({result:'success',base_code:'EUR',time_last_update_unix:Date.parse(fx.updatedAt)/1000,rates:fx.rates});}});
  const [a,b]=await Promise.all([service.load(),service.load()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.rates.CLP,1000);await service.load();assert.equal(calls,1);now+=3*86400000;fail=true;const stale=await service.load();assert(stale.stale);assert.equal(stale.rates.MXN,20);await service.load();assert.equal(calls,2);now+=8*86400000;assert.equal(await service.load(),null);
});
test('incomplete or invalid provider responses do not invent exchange rates',async()=>{for(const rates of [{EUR:1,CLP:1000},{EUR:1,CLP:-2,MXN:20}]){const service=createExchangeRates({get:()=>null,set:()=>assert.fail('Invalid rates persisted'),clock,fetcher:async()=>Response.json({result:'success',base_code:'EUR',time_last_update_unix:clock()/1000,rates})});assert.equal(await service.load(),null);}});
