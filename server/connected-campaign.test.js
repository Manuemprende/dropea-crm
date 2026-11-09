import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createConnectedCampaign} from './connected-campaign.js';

const range={from:'2026-11-01',to:'2026-11-07'};
const row={id:'pelota',name:'Campaña real',url:'https://campaign.example',currency:'CLP',campaign_active:true,
 active_now:2,sessions_today:40,unique_visitors_today:35,orders_today:3,revenue_today:74970,
 locations:[{city:'Santiago',country:'Chile',sessions:8}],customers:{total:3,new_customers:1},top_products:[],behavior:{checking_out:1,purchased:1},customer_phone:'PRIVATE',api_key:'PRIVATE'};
test('real campaign is owner-scoped and whitelisted, never exposes account secrets',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;
 const campaign=createConnectedCampaign({db,config:{url:'https://source.example/report',token:'PRIVATE',owner:'admin',landingId:'pelota'},fetchReport:async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer PRIVATE');assert.equal(url.searchParams.get('from'),range.from);return Response.json({range,refreshed_at:'2026-11-07T20:00:00Z',landings:[row,{...row,id:'another-owner'}]});}});
 try{
  assert.deepEqual((await campaign.load('other','7d',range)).rows,[]);assert.equal(calls,0);
  const data=await campaign.load('admin','7d',range);assert.equal(data.rows.length,1);assert.equal(data.rows[0].orders_today,3);assert(data.rows[0].connected_campaign);
  assert.equal(data.rows[0].demo_mode,false);assert(!JSON.stringify(data).includes('PRIVATE'));
  assert.equal(data.rows[0].customers.returning_customers,2);
  assert(!JSON.stringify(db.prepare('SELECT payload FROM connected_live_snapshots').all()).includes('PRIVATE'));
 }finally{db.close();}
});
test('outage preserves real accumulated values, marks stale and hides live counts',async()=>{
 const db=new DatabaseSync(':memory:');let time=10000,fail=false;
 const campaign=createConnectedCampaign({db,clock:()=>time,config:{url:'https://source.example/report',token:'private',owner:'admin',landingId:'pelota'},fetchReport:async()=>{if(fail)throw Error('secret error');return Response.json({range,landings:[row]});}});
 try{
  await campaign.load('admin','7d',range);time+=8000;fail=true;
  const report=await campaign.load('admin','7d',range);assert(report.error);assert.equal(report.rows[0].sessions_today,40);assert.equal(report.rows[0].orders_today,3);
  assert.equal(report.rows[0].active_now,null);assert.equal(report.rows[0].behavior.checking_out,null);assert(report.rows[0].source_stale);
  const other=await campaign.load('admin','custom',{from:'2026-10-01',to:'2026-10-02'});assert.equal(other.rows.length,0);
 }finally{db.close();}
});
test('a source ignoring the range does not produce a false filtered report',async()=>{
 const db=new DatabaseSync(':memory:');const campaign=createConnectedCampaign({db,config:{url:'https://source.example/report',token:'private',owner:'admin',landingId:'pelota'},fetchReport:async()=>Response.json({landings:[row]})});
 try{const r=await campaign.load('admin','7d',range);assert.equal(r.rows.length,0);assert(r.error);}finally{db.close();}
});

test('visitor fallback is never labeled as purchasing customers',async()=>{
 for(const orders of [0,1]){
  const db=new DatabaseSync(':memory:');
  const campaign=createConnectedCampaign({db,config:{url:'https://source.example/report',token:'private',owner:'admin',landingId:'pelota'},fetchReport:async()=>Response.json({range,landings:[{...row,orders_today:orders,customers:{type:'visitors',total:43,new_customers:41,recurring_customers:2}}]})});
  try{const r=await campaign.load('admin','7d',range);if(orders===0)assert.deepEqual(r.rows[0].customers,{total:0,new_customers:0,returning_customers:0});else assert.equal(r.rows[0].customers,undefined);}finally{db.close();}
 }
});

test('visitor segments stay separate from buyers and preserve known zero and unknown history',async()=>{
 const db=new DatabaseSync(':memory:');
 const segments={total:35,new_visitors:30,returning_visitors:5,basis:'browser',classification:'returning_session'};
 const campaign=createConnectedCampaign({db,config:{url:'https://source.example/report',token:'private',owner:'admin',landingId:'pelota'},fetchReport:async()=>Response.json({range,landings:[{...row,visitor_segments:segments}]})});
 try{
  const report=await campaign.load('admin','7d',range);assert.equal(report.error,null);
  assert.deepEqual(report.rows[0].visitor_segments,segments);assert.equal(report.rows[0].customers.total,3);
  assert.equal(report.rows[0].unique_visitors_today,segments.total);
 }finally{db.close();}
});

test('inconsistent visitor splits are rejected instead of shown as real counts',async()=>{
 const db=new DatabaseSync(':memory:');
 const campaign=createConnectedCampaign({db,config:{url:'https://source.example/report',token:'private',owner:'admin',landingId:'pelota'},fetchReport:async()=>Response.json({range,landings:[{...row,visitor_segments:{total:35,new_visitors:35,returning_visitors:10,basis:'browser',classification:'returning_session'}}]})});
 try{const report=await campaign.load('admin','7d',range);assert(report.error);assert.equal(report.rows.length,0);}finally{db.close();}
});
