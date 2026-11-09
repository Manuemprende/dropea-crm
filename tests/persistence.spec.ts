import {test,expect} from '@playwright/test';

test('returning to a loaded page retains its data and filters while the next response is pending',async({page})=>{
 let reads=0,release:()=>void=()=>{};
 const nextResponse=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/dashboard?*',async route=>{reads++;if(reads>1)await nextResponse;await route.fulfill({json:{refreshed_at:new Date().toISOString(),landings:[{id:'retained',name:'Landing persistente',url:'https://oferta.example.test',currency:'CLP',platform:'Dropea',active_now:2,sessions_today:75,unique_visitors_today:63,orders_today:4,revenue_today:79960,read_only:false,locations:[],top_products:[],behavior:{},visitor_segments:{total:63,new_visitors:60,returning_visitors:3}}]}});});
 await page.route('**/api/landings',route=>route.fulfill({json:[]}));
 await page.route('**/api/landing-options?*',route=>route.fulfill({json:{shops:[{id:20,name:'Tienda',status:'ACTIVE'}],products:[]}}));
 const nav=(name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 await page.goto('/');await nav('Live / Landings');await expect(page.getByRole('heading',{name:'Landing persistente',exact:true})).toBeVisible();await page.getByLabel('Buscar landing',{exact:true}).fill('persistente');
 await nav('Landings');await page.getByLabel('Nombre de la landing',{exact:true}).fill('Borrador que se conserva');await page.getByLabel('ID del producto en Dropea',{exact:true}).fill('32805');
 await nav('Live / Landings');await expect(page.getByLabel('Buscar landing',{exact:true})).toHaveValue('persistente');await expect(page.getByRole('heading',{name:'Landing persistente',exact:true})).toBeVisible();await expect(page.locator('.live-stat-sessions strong')).toHaveText('75');await expect(page.getByText('Mis Landings Activas (0)',{exact:true})).toHaveCount(0);
 await expect.poll(()=>reads).toBeGreaterThan(1);await nav('Landings');await expect(page.getByLabel('Nombre de la landing',{exact:true})).toHaveValue('Borrador que se conserva');await expect(page.getByLabel('ID del producto en Dropea',{exact:true})).toHaveValue('32805');release();
});

test('WhatsApp fits the viewport and keeps its selected tab and search when navigating away',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/api/whatsapp**',route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:'event: changed\ndata: {}\n\n'});if(path.endsWith('/pipeline'))return route.fulfill({json:{stages:[],orders:[]}});if(path.endsWith('/customers')||path.endsWith('/conversations'))return route.fulfill({json:[]});return route.fulfill({json:{state:'disconnected',phone:null,automatic:true}});});
 const nav=(name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 await page.goto('/');await nav('WhatsApp');await expect(page.locator('.page-heading')).toHaveCount(0);await expect(page.getByRole('tab',{name:'Conversaciones',exact:true})).toBeVisible();
 const fits=()=>page.evaluate(()=>{const box=document.querySelector('.wa-workspace')!.getBoundingClientRect();return {bottom:box.bottom,height:innerHeight,document:document.documentElement.scrollHeight};});
 let bounds=await fits();expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);expect(bounds.document).toBeLessThanOrEqual(bounds.height);
 await page.getByRole('tab',{name:'Clientes',exact:true}).click();await page.getByLabel('Buscar cliente').fill('Ana');await nav('Tiendas');await nav('WhatsApp');await expect(page.getByRole('tab',{name:'Clientes',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByLabel('Buscar cliente')).toHaveValue('Ana');await expect(page.getByRole('columnheader',{name:'% entrega',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Conversaciones',exact:true}).click();await page.screenshot({path:'artifacts/whatsapp-compact-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});bounds=await fits();expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);expect(bounds.document).toBeLessThanOrEqual(bounds.height);await page.screenshot({path:'artifacts/whatsapp-compact-mobile.png',fullPage:true});
});
