import { createLiveTracking, trackingScript, reportRange } from './live-tracking.js';
import { createConnectedCampaign } from './connected-campaign.js';

export function createLiveHTTP({app,express,db,geo,origin,owner,offers,connected,fetchReport,loadRates=async()=>null}) {
  const live=createLiveTracking({db,geo});
  const campaign=createConnectedCampaign({db,config:connected,fetchReport});
  const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
  const endpointOrigin=origin||`http://127.0.0.1:${process.env.PORT||3001}`;

  // Public ingestion and script only. No metrics or credentials are public.
  app.use('/api/live/:id/events',(req,res,next)=>{
    const source=live.getSource(req.params.id);
    res.set('Cache-Control','no-store');
    if(source?.active&&req.get('origin')===source.origin){res.set('Access-Control-Allow-Origin',source.origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');}
    if(req.method==='OPTIONS')return res.sendStatus(source?.active&&req.get('origin')===source.origin?204:403);
    next();
  });
  app.post('/api/live/:id/events',express.json({limit:'4kb'}),(req,res,next)=>{try{res.json(live.track(req.params.id,req.body,req));}catch(e){next(e);}});
  // Retired simulated checkout: never counted in real campaigns.
  app.all('/api/live/:id/demo-orders',(_req,res)=>res.status(410).json({error:'El checkout simulado fue retirado. Abre la campaña real conectada.'}));
  app.get('/demo/landing/:id',(_req,res)=>res.status(410).type('text').send('Esta página de prueba fue retirada. Abre la landing real de tu campaña desde Live / Landings.'));
  app.get('/api/live/:id/tracker.js',(req,res)=>{
    const source=live.getSource(req.params.id);
    if(!source?.active)return res.status(404).send('Seguimiento no disponible.');
    res.set('Cache-Control','public,max-age=300').type('application/javascript').send(trackingScript(source,endpointOrigin));
  });
  function syncOffers(){
    for(const offer of offers?.listSources()||[]){
      if(offer.origin&&offer.landing_url)live.syncOffer(owner,offer);
    }
  }
  function sourceWithIntegration(source){
    const offer=(offers?.listSources()||[]).find(o=>o.id===source.order_source_id);
    return {...source,snippet:`<script src="${endpointOrigin}/api/live/${source.id}/tracker.js" defer></script>`,
      integration:offer?{endpoint:`${endpointOrigin}/api/landings/${offer.public_id}/orders`,
        public_id:offer.public_id,product_id:offer.product_id,variant_id:offer.variant_id,market:offer.market,
        product_name:offer.product_name,brand_name:offer.brand_name,currency:offer.currency,
        unit_price:offer.unit_price,browser_ready:!!offer.origin&&offer.unit_price>0}:null};
  }
  return {live,installPrivate(){
    app.all('/api/live/sources/demo',(_req,res)=>res.status(410).json({error:'Las pruebas simuladas fueron retiradas. Conecta una campaña real.'}));
    app.get('/api/live/sources',(_req,res,next)=>{try{syncOffers();res.json(live.list(owner).filter(s=>!s.demo_mode).map(sourceWithIntegration));}catch(e){next(e);}});
    app.post('/api/live/sources',(req,res,next)=>{try{
      const offer=(offers?.listSources()||[]).find(o=>o.id===req.body.order_source_id);
      if(!offer)return res.status(400).json({error:'Selecciona una oferta de tu cuenta Dropea. Créala primero en Landings.'});
      if(req.body.url){
        let url;try{url=new URL(req.body.url);}catch{return res.status(400).json({error:'Ingresa una URL HTTPS válida.'});}
        if(offer.origin&&url.origin!==offer.origin)return res.status(400).json({error:'Esta oferta ya está asociada a otro dominio. Cambia su URL en Landings.'});
        offers.updateUrl(offer.id,req.body.url);
      }
      const saved=offers.listSources().find(o=>o.id===offer.id);
      if(!saved.origin||!saved.landing_url)return res.status(400).json({error:'Registra la URL HTTPS donde publicaste la landing.'});
      res.status(201).json(sourceWithIntegration(live.syncOffer(owner,saved)));
    }catch(e){next(e);}});
    app.patch('/api/live/sources/:id',(req,res,next)=>{try{
      if(typeof req.body.url==='string')return res.status(400).json({error:'Actualiza la URL de la oferta desde Landings.'});
      live.toggle(owner,req.params.id,req.body.active);res.json({updated:true});
    }catch(e){next(e);}});
    app.get('/api/live/dashboard',asyncRoute(async(req,res)=>{
      const period=req.query.period||'7d',range=reportRange(period,Date.now(),{from:req.query.from,to:req.query.to}),currency=req.query.currency||'CLP';
      if(!['CLP','MXN','EUR','USD'].includes(currency))return res.status(400).json({error:'Moneda inválida.'});
      syncOffers();const native=live.report(owner,period,range);
      const external=await campaign.load(owner,period,range);
      const landings=[...native,...external.rows];
      const fx=landings.some(l=>l.currency!==currency)?await loadRates():null;
      const convert=(value,from)=>from===currency?value:fx?.rates?.[from]>0&&fx?.rates?.[currency]>0?value/fx.rates[from]*fx.rates[currency]:value===0?0:null;
      res.json({landings:landings.map(l=>({...l,report_currency:currency,revenue_converted:convert(l.revenue_today,l.currency),top_products:l.top_products.map(p=>({...p,revenue_converted:convert(p.revenue,l.currency)}))})),currency,range,campaign_error:external.error,fx:fx?{updatedAt:fx.updatedAt,stale:fx.stale,url:'https://www.exchangerate-api.com'}:null,refreshed_at:new Date().toISOString()});
    }));
  }};
}
