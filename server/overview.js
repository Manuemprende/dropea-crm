const currencies=['CLP','MXN','EUR'];
const nativeCurrency=market=>market==='CL'?'CLP':market==='MX'?'MXN':'EUR';
export const orderGroup=order=>{
  if(['CANCELLED','REFUSED','REJECTED','LOST_DAMAGED','REFUSED_LOST_DAMAGED'].includes(order.sub_status))return 'Cancelados';
  if(order.status==='DELIVERED'||['DELIVERED','PAID'].includes(order.sub_status))return 'Entregados';
  if(order.status==='SHIPPING')return 'En camino';
  if(['PROCESSING','CONFIRMED'].includes(order.status))return 'En preparación';
  if(order.status==='ERROR')return 'Con error';
  return order.status==='FINISH'?'Finalizados':'Pendientes';
};
const dateKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function summarizeCountries(countries,{currency='CLP',period='Hoy',fx=null,clock=()=>Date.now()}={}){
  if(!currencies.includes(currency)||!['Hoy','7 días','Este mes','Todo'].includes(period))throw Object.assign(new Error('Moneda o período inválido.'),{status:400});
  const today=dateKey(new Date(clock())),week=new Date(today+'T12:00:00Z');week.setUTCDate(week.getUTCDate()-6);
  const inPeriod=order=>{if(!Number.isFinite(Date.parse(order.created_at)))return false;const day=dateKey(new Date(order.created_at));return period==='Todo'||(period==='Hoy'?day===today:period==='7 días'?day>=dateKey(week)&&day<=today:day.slice(0,7)===today.slice(0,7));};
  const convert=(amount,from)=>{if(!Number.isFinite(amount))return null;if(from===currency)return amount;const a=fx?.rates?.[from],b=fx?.rates?.[currency];return a>0&&b>0?amount/a*b:null;};
  let total=0,validCount=0,count=0,delivered=0,pending=0,incomplete=false;
  const states={},hourly=Array(24).fill(0),recent=[];
  const markets=countries.map(country=>{
    const orders=country.orders.filter(inPeriod);let revenue=0,missing=false,valid=0;const native={};
    for(const order of orders){
      const state=orderGroup(order),from=order.currency||nativeCurrency(country.market);states[state]=(states[state]||0)+1;count++;if(state==='Entregados')delivered++;if(state==='Pendientes')pending++;
      const amount=convert(order.total_amount,from);
      recent.push({id:order.id,market:country.market,name:order.shipping_address?.full_name||[order.shipping_address?.first_name,order.shipping_address?.last_name].filter(Boolean).join(' ')||'Sin nombre',status:state,total:order.total_amount,currency:from,convertedTotal:amount,created_at:order.created_at});
      if(['Cancelados','Con error'].includes(state))continue;
      valid++;validCount++;native[from]=(native[from]||0)+order.total_amount;
      if(amount===null){missing=true;incomplete=true;}else{revenue+=amount;total+=amount;const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',hour:'2-digit',hourCycle:'h23'}).format(new Date(order.created_at)));hourly[hour]+=amount;}
    }
    return {market:country.market,configured:country.configured,lastSync:country.lastSync,error:country.error||null,orders:orders.length,validOrders:valid,total:missing?null:revenue,nativeTotals:native};
  });
  return {currency,period,total:incomplete?null:total,orders:count,validOrders:validCount,ticket:incomplete?null:validCount?total/validCount:0,delivered,pending,deliveryRate:count?delivered/count*100:null,states,hourly:incomplete?null:hourly,markets,recent:recent.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,10),fx:fx?{updatedAt:fx.updatedAt,stale:fx.stale,provider:'ExchangeRate-API',url:'https://www.exchangerate-api.com'}:null,conversionUnavailable:incomplete};
}

export function createExchangeRates({get,set,fetcher=fetch,clock=()=>Date.now()}){
  let pending=null,retryAfter=0;
  const read=()=>{try{return JSON.parse(get('overview:fx:EUR')||'null');}catch{return null;}};
  const usable=value=>value&&['EUR','CLP','MXN'].every(code=>Number.isFinite(value.rates?.[code])&&value.rates[code]>0)&&Number.isFinite(Date.parse(value.updatedAt));
  const fallback=()=>{const value=read();return usable(value)&&clock()-Date.parse(value.updatedAt)<7*86400000?{...value,stale:true}:null;};
  return {async load(){
    const cached=read();if(usable(cached)&&clock()-(cached.fetchedAt||0)<86400000)return {...cached,stale:clock()-Date.parse(cached.updatedAt)>48*3600000};
    if(pending)return pending;if(clock()<retryAfter)return fallback();
    pending=(async()=>{try{
      const response=await fetcher('https://open.er-api.com/v6/latest/EUR',{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error('FX unavailable');const data=await response.json();
      const value={rates:Object.fromEntries(['EUR','CLP','MXN','USD'].filter(code=>Number.isFinite(data.rates?.[code])).map(code=>[code,data.rates[code]])),updatedAt:new Date(data.time_last_update_unix*1000).toISOString(),fetchedAt:clock()};
      if(data.result!=='success'||data.base_code!=='EUR'||!usable(value)||value.rates.EUR!==1||Date.parse(value.updatedAt)>clock()+3600000||clock()-Date.parse(value.updatedAt)>7*86400000)throw new Error('FX invalid');
      set('overview:fx:EUR',JSON.stringify(value));return {...value,stale:clock()-Date.parse(value.updatedAt)>48*3600000};
    }catch{retryAfter=clock()+15*60000;return fallback();}finally{pending=null;}})();return pending;
  }};
}
