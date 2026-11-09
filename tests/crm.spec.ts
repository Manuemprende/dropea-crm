import { test, expect } from '@playwright/test';

test('demo dashboard, period filters, search, detail and export work together', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.mode-banner')).toContainText('Modo demostración');
  await expect(page.getByRole('heading',{name:'Total vendido'})).toBeVisible();
  await page.getByRole('button',{name:'Todo',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Pedidos',exact:true}).click();
  await expect(page.getByText('86 pedidos',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar pedidos',exact:true}).fill('1086');
  await expect(page.getByRole('button',{name:'#1086',exact:true})).toBeVisible();
  await expect(page.getByText('1 pedidos',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'#1086',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Pedido #1086',exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar',exact:true}).last().click();
  expect((await download).suggestedFilename()).toMatch(/pedidos-.*\.csv/);
  expect(errors).toEqual([]);
});

test('live mode shows honest empty states and prevents credential-free sync', async ({page, request})=>{
  await page.goto('/'); await page.getByRole('button',{name:'Conectar mi cuenta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Conexión con Dropea'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Registrar webhook'})).toBeDisabled();
  await page.getByRole('navigation').getByRole('button',{name:'Vista general',exact:true}).click();
  await expect(page.getByText('No hay pedidos en este período')).toBeVisible();
  const sync = await request.post('/api/sync'); expect(sync.status()).toBe(409);
  const webhook = await request.post('/api/webhooks/dropea',{data:{topic:'order.created'}}); expect(webhook.status()).toBe(401);
  const forged = await request.post('/api/connection',{headers:{Origin:'https://evil.example'},data:{}}); expect(forged.status()).toBe(403);
  const data = await request.get('/api/status'); const raw=await data.text(); expect(raw).not.toContain('apiKey'); expect(raw).not.toContain('secret');
});

test('every destination renders and mobile layout stays within viewport', async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  for(const name of ['Pedidos','Estadísticas','Productos','Tiendas','Incidencias','Wallet','Configuración','Vista general']) {
    await page.getByRole('button',{name:'Abrir menú'}).click();
    await page.getByRole('navigation').getByRole('button',{name:new RegExp(`^${name}(?: |$)`)}).click();
    await expect(page.getByRole('heading',{name,exact:true,level:1})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
});

test('a configured account can sync directly from demo mode into live data', async ({page})=>{
  await page.route('**/api/status',route=>route.fulfill({json:{configured:true,market:'CL',signingConfigured:false,syncing:false,lastSync:null,lastError:null}}));
  await page.route('**/api/data',route=>route.fulfill({json:{orders:[],products:[],shops:[],issues:[],events:[]}}));
  let synced=false;
  await page.route('**/api/sync',route=>{synced=true;return route.fulfill({json:{synced:0,warnings:[]}});});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Total vendido'})).toBeVisible();
  await page.getByRole('button',{name:'Sincronizar',exact:true}).click();
  await expect(page.locator('.mode-banner')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('0 pedidos sincronizados');
  expect(synced).toBeTruthy();
});
