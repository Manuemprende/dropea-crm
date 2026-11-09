import {test,expect} from '@playwright/test';
test('Todos combines countries, switches reporting currency, preserves country order identity and persists the global choice',async({page})=>{
  let market='CL';const queries:string[]=[];
  await page.route('**/api/status',route=>route.fulfill({json:{configured:true,market,markets:['CL','ES','MX','IT','PT'].map(market=>({market,configured:true})),signingConfigured:false,syncing:false,lastSync:null,lastError:null}}));
  await page.route('**/api/data',route=>route.fulfill({json:{orders:[],products:[],shops:[],issues:[],events:[]}}));
  await page.route('**/api/market',route=>{market=route.request().postDataJSON().market;return route.fulfill({json:{market,configured:true}});});
  await page.route('**/api/overview?*',route=>{
    const url=new URL(route.request().url()),currency=url.searchParams.get('currency')||'CLP',period=url.searchParams.get('period');queries.push(currency);const factor=currency==='CLP'?1000:currency==='MXN'?20:1;
    return route.fulfill({json:{currency,period,total:11*factor,orders:2,validOrders:2,ticket:5.5*factor,delivered:1,pending:1,deliveryRate:50,states:{Entregados:1,Pendientes:1},hourly:Array(24).fill(0).map((_,i)=>i===12?11*factor:0),conversionUnavailable:false,fx:{updatedAt:'2026-11-06T00:00:00Z',stale:false,provider:'ExchangeRate-API',url:'https://www.exchangerate-api.com'},markets:['ES','IT','PT','CL','MX'].map(market=>({market,configured:true,lastSync:null,error:null,orders:['CL','ES'].includes(market)?1:0,validOrders:1,total:market==='CL'?factor:market==='ES'?10*factor:0,nativeTotals:market==='CL'?{CLP:1000}:market==='ES'?{EUR:10}:{}})),recent:[{id:7,market:'CL',name:'Cliente Chile',status:'Entregados',total:1000,currency:'CLP',convertedTotal:factor,created_at:'2026-11-06T12:00:00Z'},{id:7,market:'ES',name:'Cliente España',status:'Pendientes',total:10,currency:'EUR',convertedTotal:10*factor,created_at:'2026-11-06T12:00:00Z'}]}});
  });
  await page.goto('/');await page.getByRole('group',{name:'País seleccionado'}).getByRole('button',{name:'Todos Vista global',exact:true}).click();
  await expect(page.getByLabel('Total vendido global',{exact:true})).toContainText('11.000');
  await expect(page.getByText('CL · #7',{exact:true})).toBeVisible();await expect(page.getByText('ES · #7',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Moneda de la vista global'}).selectOption('EUR');await expect(page.getByLabel('Total vendido global',{exact:true})).toContainText('11,00');
  await page.getByRole('combobox',{name:'Moneda de la vista global'}).selectOption('MXN');await expect(page.getByLabel('Total vendido global',{exact:true})).toContainText('220,00');expect(queries).toEqual(['CLP','EUR','MXN']);
  await page.screenshot({path:'artifacts/global-overview-desktop.png',fullPage:true});
  await page.reload();await expect(page.getByRole('button',{name:'Todos Vista global',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('combobox',{name:'Moneda de la vista global'})).toHaveValue('MXN');
  await page.setViewportSize({width:390,height:844});await expect(page.getByLabel('Total vendido global',{exact:true})).toContainText('220,00');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'artifacts/global-overview-mobile.png',fullPage:true});
  await page.getByRole('group',{name:'País seleccionado'}).getByRole('button',{name:/España/}).click();await expect(page.locator('.global-overview')).toBeHidden();expect(market).toBe('ES');
});

test('global reporting never shows a mixed-currency sum when conversion is unavailable',async({page})=>{
  await page.route('**/api/overview?*',route=>route.fulfill({json:{currency:'CLP',period:'Hoy',total:null,orders:2,validOrders:2,ticket:null,delivered:0,pending:2,deliveryRate:0,states:{Pendientes:2},hourly:null,markets:[],recent:[],fx:null,conversionUnavailable:true}}));
  await page.goto('/');await page.getByRole('button',{name:'Todos Vista global',exact:true}).click();await expect(page.getByLabel('Total vendido global',{exact:true})).toHaveText('—');await expect(page.getByText(/No hay un tipo de cambio disponible/)).toBeVisible();
});
