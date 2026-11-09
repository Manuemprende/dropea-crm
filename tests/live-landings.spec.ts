import {test,expect} from '@playwright/test';

test('Live Landings matches the campaign cards, uses native Dropea metrics and fits mobile',async({page})=>{
  await page.route('**/api/auth/session',r=>r.fulfill({json:{enabled:true,authenticated:true,username:'admin'}}));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:false,market:'CL',markets:[],syncing:false}}));
  await page.route('**/api/live/dashboard?*',r=>r.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[{
    id:'native-pelota',name:'Pelota Saltarina · Shrine PRO',url:'https://pelota-saltarina.pidedirecto.cyou',currency:'CLP',platform:'Dropea',active_now:3,sessions_today:35,unique_visitors_today:32,orders_today:2,revenue_today:49980,read_only:false,
    locations:[{city:'Santiago',country:'Chile',sessions:18},{city:'Concepción',country:'Chile',sessions:6}],customers:{total:2,new_customers:2,returning_customers:0},visitor_segments:{total:32,new_visitors:29,returning_visitors:3,basis:'browser',classification:'returning_session'},top_products:[{name:'Pelota Saltarina',orders:2,revenue:49980}],behavior:{active_carts:2,checking_out:1,purchased:1}
  }]}}));
  await page.route('**/api/live/sources',r=>r.fulfill({json:[]}));
  await page.route('**/api/landings',r=>r.fulfill({json:[]}));
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();
  await expect(page.getByText('Demostración real · Solo estadísticas')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Top ubicaciones'})).toBeVisible();
  for(const label of ['Visitantes ahora','Total de ventas','Total de sesiones','Total de órdenes','Recurrentes'])await expect(page.locator('.live-card').getByText(label,{exact:true}).first()).toBeVisible();
  await expect(page.locator('.live-counts>.live-stat')).toHaveCount(4);
  await expect(page.locator('.live-counts')).toContainText('32 visitantes únicos');
  await expect(page.locator('.live-visitors-panel')).toContainText('29');await expect(page.locator('.live-visitors-panel')).toContainText('3');await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toHaveCount(0);
  await expect(page.getByText('Concepción · Chile')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Comportamiento en vivo'})).toBeVisible();
  await expect(page.locator('.live-kpis')).toHaveCount(0);
  await expect(page.locator('.live-footnote')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Controles de landings'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Actualizar landings',exact:true})).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Actividad en tiempo real'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Crear Landing',exact:true})).toHaveCount(0);
  await page.screenshot({path:'artifacts/live-landings-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Conectar landing',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Primero configura tu oferta Dropea',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  for(const selector of ['.live-toolbar-refresh','.live-toolbar>.live-connect','.live-toolbar select','.live-view-toggle button'])for(const el of await page.locator(selector).all()){const box=await el.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
  await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=1);await page.screenshot({path:'artifacts/live-landings-mobile.png',fullPage:true});
});

test('live view shares the CRM theme and width, applies custom dates, converts currencies and persists day mode',async({page})=>{
  const requests:string[]=[];
  await page.route('**/api/live/dashboard?*',route=>{
    const url=new URL(route.request().url());requests.push(url.toString());const currency=url.searchParams.get('currency')||'CLP';const converted=currency==='EUR'?20:currency==='MXN'?400:20000;
    return route.fulfill({json:{currency,range:{from:url.searchParams.get('from')||'2026-11-01',to:url.searchParams.get('to')||'2026-11-07'},fx:{updatedAt:'2026-11-07T00:00:00Z',url:'https://www.exchangerate-api.com'},refreshed_at:new Date().toISOString(),landings:[{id:'cl',name:'Campaña Chile',url:'https://oferta.example',currency:'CLP',report_currency:currency,revenue_today:20000,revenue_converted:converted,platform:'Dropea',active_now:2,sessions_today:40,unique_visitors_today:35,orders_today:2,read_only:false,locations:[],top_products:[],behavior:{}}]}});
  });
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis Landings Activas (1)',level:2})).toBeVisible();await expect(page.getByRole('heading',{name:'Live / Landings',level:1})).toHaveCount(0);
  expect(await page.locator('.live-dashboard').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const widths=await page.evaluate(()=>({live:document.querySelector('.live-dashboard')!.getBoundingClientRect().width,content:document.querySelector('.content')!.clientWidth-parseFloat(getComputedStyle(document.querySelector('.content')!).paddingLeft)-parseFloat(getComputedStyle(document.querySelector('.content')!).paddingRight)}));expect(Math.abs(widths.live-widths.content)).toBeLessThan(2);
  await page.getByRole('combobox',{name:'Periodo de landings'}).selectOption('custom');await page.getByLabel('Desde',{exact:true}).fill('2026-10-07');await page.getByLabel('Hasta',{exact:true}).fill('2026-11-07');
  await expect.poll(()=>requests.some(url=>url.includes('period=custom')&&url.includes('from=2026-10-07')&&url.includes('to=2026-11-07'))).toBeTruthy();
  await page.getByRole('combobox',{name:'Moneda de landings'}).selectOption('EUR');await expect(page.locator('.live-counts')).toContainText('€20,00');await expect(page.getByText('Campaña Chile',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Activar modo día',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.getByRole('button',{name:'Activar modo noche',exact:true})).toBeVisible();
  const light=await page.locator('.live-card').evaluate(el=>getComputedStyle(el).backgroundColor);expect(light).toBe('rgb(255, 255, 255)');await page.screenshot({path:'artifacts/live-integrated-day.png',fullPage:true});
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('2026-10-07');await expect(page.getByRole('combobox',{name:'Moneda de landings'})).toHaveValue('EUR');
  await page.getByRole('button',{name:'Activar modo noche',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'artifacts/live-integrated-night.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=1);await page.screenshot({path:'artifacts/live-integrated-mobile.png',fullPage:true});
});


test('real connected campaign uses real source counters without demo controls',async({page})=>{
 await page.route('**/api/live/dashboard?*',r=>r.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[{id:'connected-pelota',name:'Pelota Saltarina',url:'https://campaign.example',currency:'CLP',active_now:2,sessions_today:41,unique_visitors_today:38,orders_today:3,revenue_today:74970,connected_campaign:true,managed_here:false,read_only:true,locations:[{city:'Santiago',country:'Chile',sessions:5}],customers:{new_customers:3},top_products:[],behavior:{checking_out:1,purchased:1}}]}}));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();
 await expect(page.getByRole('link',{name:'Abrir campaña real'})).toHaveAttribute('href','https://campaign.example');
 await expect(page.getByText('Demostración sin despacho',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Preparar demostración sin ID del proveedor'})).toHaveCount(0);
 await expect(page.locator('.live-counts')).toContainText('41');await expect(page.locator('.live-counts')).toContainText('3');
 await expect(page.locator('.live-card')).toHaveCSS('display','flex');
 await page.getByRole('button',{name:'Vista en lista',exact:true}).click();await expect(page.locator('.live-cards')).toHaveClass(/list/);
 await page.getByRole('button',{name:'Vista en cuadrícula',exact:true}).click();await expect(page.locator('.live-cards')).not.toHaveClass(/list/);
 await page.screenshot({path:'artifacts/real-campaign-desktop.png',fullPage:true});
});


test('compact toolbar works at PWA mobile widths with custom dates and accessible information',async({page})=>{
 await page.route('**/api/live/dashboard?*',r=>r.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[]}}));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();
 await page.getByRole('combobox',{name:'Periodo de landings'}).selectOption('custom');
 for(const width of [320,390,768,1024]){
  await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await expect(page.getByRole('button',{name:'Conectar landing',exact:true})).toBeVisible();
  await expect(page.getByLabel('Desde',{exact:true})).toBeVisible();await expect(page.getByLabel('Hasta',{exact:true})).toBeVisible();
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Información de seguimiento',{exact:true}).click();
 await expect(page.getByRole('link',{name:'IP Geolocation by DB-IP'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'artifacts/live-compact-toolbar-mobile.png',fullPage:true});
});

test('live spheres grow with real counts, retain stage colors and clear stale live activity',async({page})=>{
 let count=0,stale=false;
 await page.route('**/api/live/dashboard?*',r=>r.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[{id:'live-growth',name:'Campaña conectada',url:'https://campaign.example',currency:'CLP',active_now:count,sessions_today:53,unique_visitors_today:48,orders_today:0,revenue_today:0,read_only:true,source_stale:stale,locations:[],top_products:[],behavior:{active_carts:count,checking_out:count,purchased:0}}]}}));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Live / Landings',level:1})).toHaveCount(0);
 const orb=page.locator('.live-orb.blue'),card=page.locator('.live-card');
 let previous=0,previousMargin=0;
 for(const visitors of [0,1,2,10]){
  count=visitors;await page.getByRole('button',{name:'Actualizar landings',exact:true}).click();
  await expect(page.locator('.live-stage.blue')).toHaveAttribute('data-count',String(visitors));
  await expect.poll(()=>orb.evaluate(el=>getComputedStyle(el).transform)).toBe(`matrix(${[1,1.2,1.32,1.62][[0,1,2,10].indexOf(visitors)]}, 0, 0, ${[1,1.2,1.32,1.62][[0,1,2,10].indexOf(visitors)]}, 0, 0)`);
  const size=(await orb.boundingBox())!.width;expect(size).toBeGreaterThan(previous);previous=size;
  const margin=await page.locator('.live-stage.blue strong').evaluate(el=>parseFloat(getComputedStyle(el).marginTop));
  await expect.poll(()=>page.locator('.live-stage.blue strong').evaluate(el=>parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThanOrEqual(previousMargin);
  previousMargin=margin;
  const numberBox=(await page.locator('.live-stage.blue strong').boundingBox())!,orbBox=(await orb.boundingBox())!;expect(numberBox.y).toBeGreaterThan(orbBox.y+orbBox.height);
  if(visitors){await expect(card).toHaveClass(/is-live/);await expect(page.locator('.live-active')).toContainText(`${visitors} en vivo`);}else await expect(card).not.toHaveClass(/is-live/);
 }
 await expect(page.locator('.live-stage.orange')).toContainText('En checkout');await expect(page.locator('.live-stage.green')).toContainText('Compras');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 await expect(page.locator('.live-orbs-line')).toHaveCount(1);
 const layering=await page.locator('.live-orbs').evaluate(el=>{
  const line=el.querySelector('.live-orbs-line')!,slot=el.querySelector('.live-orb-slot')!;
  const lineBox=line.getBoundingClientRect(),slotBox=slot.getBoundingClientRect();
  return {isolated:getComputedStyle(el).isolation,pseudo:getComputedStyle(el,'::before').content,lineY:lineBox.y+lineBox.height/2,slotY:slotBox.y+slotBox.height/2,lineZ:Number(getComputedStyle(line).zIndex),stageZ:Number(getComputedStyle(el.querySelector('.live-stage')!).zIndex)};
 });
 expect(layering.isolated).toBe('isolate');expect(layering.pseudo).toBe('none');expect(Math.abs(layering.lineY-layering.slotY)).toBeLessThan(2);expect(layering.stageZ).toBeGreaterThan(layering.lineZ);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(orb).toHaveCSS('transition-duration','0s');
 stale=true;await page.getByRole('button',{name:'Actualizar landings',exact:true}).click();await expect(card).not.toHaveClass(/is-live/);await expect(page.locator('.live-stage.blue strong')).toHaveText('—');await expect(orb).not.toHaveClass(/has-value/);
});

test('Nexora guide colors and decorative base segments retain real zero totals',async({page})=>{
 await page.route('**/api/live/dashboard?*',r=>r.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[{id:'zero',name:'Sin ventas',url:'https://campaign.example',currency:'CLP',active_now:0,sessions_today:0,unique_visitors_today:0,orders_today:0,revenue_today:0,read_only:true,locations:[],customers:{total:0,new_customers:0,returning_customers:0},visitor_segments:{total:0,new_visitors:0,returning_visitors:0,basis:'browser',classification:'returning_session'},top_products:[],behavior:{}}]}}));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Live / Landings',exact:true}).click();
 await expect(page.locator('.live-card')).toHaveCSS('background-color','rgb(22, 38, 62)');
 const expected=[['.live-stat-live','rgb(14, 165, 233), rgb(125, 211, 252)'],['.live-stat-sessions','rgb(2, 132, 199), rgb(56, 189, 248)'],['.live-stat-sales','rgb(22, 163, 74), rgb(134, 239, 172)'],['.live-stat-orders','rgb(249, 115, 22), rgb(253, 186, 116)']];
 for(const [selector,colors] of expected){
  await expect(page.locator(selector+' .live-stat-bar i')).toHaveCSS('background-image',`linear-gradient(90deg, ${colors})`);
  await expect(page.locator(selector+' strong')).toHaveText(selector.endsWith('sales')?'$0':'0');
  expect((await page.locator(selector+' .live-stat-bar i').boundingBox())!.width).toBeGreaterThan(0);
 }
 await expect(page.locator('.live-visitors-panel .live-bar i').first()).toHaveCSS('width','0px');
 await expect(page.locator('.live-bar.orange i')).toHaveCSS('background-image','linear-gradient(90deg, rgb(251, 146, 60), rgb(234, 88, 12))');
 await expect(page.locator('.live-bar.blue i')).toHaveCSS('background-image','linear-gradient(90deg, rgb(56, 189, 248), rgb(37, 99, 235))');
 await expect(page.locator('.live-stage.orange .live-orb')).toHaveCSS('border-top-color','rgb(251, 146, 60)');
 await expect(page.locator('.live-stage.green .live-orb')).toHaveCSS('border-top-color','rgb(74, 222, 128)');
});
