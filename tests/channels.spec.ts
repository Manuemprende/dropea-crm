import { test, expect } from '@playwright/test';

test('WhatsApp shows the QR, connected number and confirmation flow without sending an order',async({page})=>{
  let state={state:'disconnected',qr:null as string|null,phone:null as string|null,error:null};
  await page.route('**/api/whatsapp',route=>route.fulfill({json:state}));
  await page.route('**/api/whatsapp/connect',route=>{state={...state,state:'qr',qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII='};return route.fulfill({json:state});});
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'WhatsApp',exact:true}).click();
  await expect(page.locator('.page-heading')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Conversaciones',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Configurar WhatsApp',exact:true}).click();
  await expect(page.getByRole('tab',{name:'WhatsApp',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Vincular con QR',exact:true}).click();
  await expect(page.getByAltText('QR para vincular WhatsApp')).toBeVisible();
  state={state:'connected',qr:null,phone:'56900000000',error:null};
  await expect(page.getByText('Número vinculado',{exact:true})).toBeVisible({timeout:6000});
  await expect(page.getByText('+56900000000',{exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/whatsapp-channel-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('landing setup creates a country-bound offer and reveals an embeddable form',async({page})=>{
  let saved:any=null;
  await page.route('**/api/landings',route=>route.request().method()==='POST'?(saved={...route.request().postDataJSON(),id:'source-1',public_id:'public-form-1',apiKey:'lp_test_key_once',origin:'',active:1,currency:'CLP'},route.fulfill({status:201,json:saved})):route.fulfill({json:saved?[saved]:[]}));
  await page.route('**/api/landing-options?*',route=>route.fulfill({json:{shops:[{id:20,name:'Pide Directo',status:'ACTIVE'}],products:[{id:10,name:'Producto de prueba',variants:[{id:33,name:'Azul',price:5000}]}]}}));
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Landings',exact:true}).click();
  await page.getByLabel('Nombre de la landing',{exact:true}).fill('Oferta Chile');
  await page.getByLabel('Nombre de tu tienda en WhatsApp',{exact:false}).fill('Tienda Juanito');
  await page.getByLabel('ID del producto en Dropea',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Crear conexión de landing',exact:true}).click();
  await expect(page.getByRole('heading',{name:'API y JSON · Oferta Chile'})).toBeVisible();
  expect(saved.market).toBe('CL');expect(saved.variant_id).toBe(33);expect(saved.brand_name).toBe('Tienda Juanito');expect(saved.product_id).toBe(10);expect(saved.url).toBe('');expect(saved.unit_price).toBe(0);await expect(page.getByRole('button',{name:'Desde navegador',exact:true})).toBeDisabled();
  await expect(page.locator('pre').first()).toContainText('/api/landings/public-form-1/orders');await expect(page.locator('pre').first()).toContainText('unit_price');
  await page.screenshot({path:'artifacts/landing-channel-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('Orders distinguishes local WhatsApp confirmation from a remote confirmed order',async({page})=>{
  await page.route('**/api/landing-orders?*',route=>route.fulfill({json:[{id:'local-1',source_name:'Oferta Chile',product_name:'Producto de prueba',quantity:2,unit_price:14990,currency:'CLP',customer:{name:'Ana Prueba',city:'Santiago'},phone:'+56912345678',state:'WAITING_CONFIRMATION',error:null,remote_id:null,created_at:new Date().toISOString()}]}));
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Pedidos',exact:true}).click();
  await expect(page.getByText('Esperando al cliente',{exact:true})).toBeVisible();
  await expect(page.getByText('Ana Prueba',{exact:true})).toBeVisible();
});
