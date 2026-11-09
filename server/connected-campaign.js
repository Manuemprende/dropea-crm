// A private, revocable read-only connection to an existing REAL campaign.
// No provider credentials or customer details reach the browser.
const count=value=>{if(!Number.isFinite(value)||value<0)throw Error('Invalid campaign metric');return value;};
const str=value=>String(value||'').slice(0,250);
export function createConnectedCampaign({db,config,fetchReport=fetch,clock=()=>Date.now()}){
  db.exec('CREATE TABLE IF NOT EXISTS connected_live_snapshots(query_key TEXT PRIMARY KEY,payload TEXT NOT NULL,saved_at INTEGER NOT NULL)');
  const pending=new Map();
  const enabled=owner=>!!config?.url&&!!config?.token&&!!config?.landingId&&config.owner===owner;
  function sanitize(data,range){
    if(data.range?.from!==range.from||data.range?.to!==range.to)throw Error('Campaign date range does not match');
    if(!Array.isArray(data.landings))throw Error('Invalid campaign report');
    return data.landings.filter(l=>l.id===config.landingId&&l.campaign_active===true).map(l=>{
      const url=new URL(l.url);if(url.protocol!=='https:')throw Error('Invalid campaign URL');
      const behavior=l.behavior||{},customers=l.customers||{};
      const segments=l.visitor_segments;
      let visitors;
      if(segments?.basis==='browser'&&segments.classification==='returning_session'){
        visitors={total:count(segments.total),new_visitors:count(segments.new_visitors),returning_visitors:count(segments.returning_visitors),basis:'browser',classification:'returning_session'};
        if(visitors.total!==visitors.new_visitors+visitors.returning_visitors||visitors.total!==count(l.unique_visitors_today))throw Error('Invalid visitor segments');
      }
      // The source can fall back to visitor counts; these are not purchasing customers.
      const buyers=customers.type==='visitors'
        ? (count(l.orders_today)===0?{total:0,new_customers:0,returning_customers:0}:undefined)
        : {total:count(customers.total||0),new_customers:count(customers.new_customers||0),
          returning_customers:Math.max(0,count(customers.total||0)-count(customers.new_customers||0))};
      return {id:'connected-'+config.landingId,name:str(l.name),url:url.href,currency:l.currency||'CLP',
        product_image:/^https:\/\//.test(l.product_image||'')?l.product_image:'',
        campaign_active:true,connected_campaign:true,managed_here:false,read_only:true,demo_mode:false,
        active_now:count(l.active_now),sessions_today:count(l.sessions_today),unique_visitors_today:count(l.unique_visitors_today),
        orders_today:count(l.orders_today),revenue_today:count(l.revenue_today),
        locations:(l.locations||[]).slice(0,5).map(p=>({city:str(p.city),country:str(p.country),sessions:count(p.sessions)})),
        customers:buyers,
        visitor_segments:visitors,
        top_products:(l.top_products||[]).slice(0,5).map(p=>({name:str(p.name),orders:count(p.orders),revenue:count(p.revenue)})),
        behavior:{active_carts:count(behavior.active_carts||0),checking_out:count(behavior.checking_out||0),purchased:count(behavior.purchased||0)},
        source_updated_at:data.refreshed_at};
    });
  }
  return {enabled,async load(owner,period,range){
    if(!enabled(owner))return {rows:[],error:null};
    const key=JSON.stringify([config.owner,config.landingId,period,range.from,range.to]);
    const old=db.prepare('SELECT * FROM connected_live_snapshots WHERE query_key=?').get(key);
    if(old&&clock()-old.saved_at<2000)return {rows:JSON.parse(old.payload),error:null};
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{try{
      const url=new URL(config.url);if(url.protocol!=='https:')throw Error('HTTPS required');
      url.searchParams.set('period','custom');url.searchParams.set('from',range.from);url.searchParams.set('to',range.to);
      const res=await fetchReport(url,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!res.ok)throw Error('Campaign temporarily unavailable');
      const rows=sanitize(await res.json(),range);
      db.prepare('INSERT INTO connected_live_snapshots VALUES(?,?,?) ON CONFLICT(query_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at').run(key,JSON.stringify(rows),clock());
      db.prepare('DELETE FROM connected_live_snapshots WHERE saved_at<?').run(clock()-7*86400000);
      return {rows,error:null};
    }catch{
      // Preserve only real last-known values, clearly marked stale. Never invent zeros.
      return {rows:old?JSON.parse(old.payload).map(l=>({...l,source_stale:true,active_now:null,behavior:{active_carts:null,checking_out:null,purchased:null}})):[],error:'No se pudo actualizar la campaña conectada. La actividad en vivo está temporalmente indisponible; los acumulados conservan su última lectura real.'};
    }finally{pending.delete(key);}})();pending.set(key,task);return task;
  }};
}
