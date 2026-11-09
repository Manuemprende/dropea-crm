import { test, expect } from '@playwright/test';

test('opening Products imports independently of orders and paginates the full catalogue',async({page})=>{
  let imported=false;let calls=0;
  const products=Array.from({length:55},(_,i)=>({id:i+1,name:`Producto real ${i+1}`,status:'PUBLIC',variants:[{variant_id:i+1,stock:10,price:18.5,currency:'EUR'}]}));
  await page.addInitScript(()=>localStorage.setItem('dropea-mode','live'));
  await page.route('**/api/status',route=>route.fulfill({json:{configured:true,market:'ES',signingConfigured:true,syncing:false,lastError:null,lastSync:null,productsLastSync:imported?'2026-11-05T18:00:00Z':null}}));
  await page.route('**/api/data',route=>route.fulfill({json:{orders:[],products:imported?products:[],shops:[],issues:[],events:[]}}));
  await page.route('**/api/sync/products',route=>{calls++;imported=true;return route.fulfill({json:{products:55,lastSync:'2026-11-05T18:00:00Z'}});});
  await page.route('**/api/sync',()=>{throw new Error('Products must not depend on order sync');});
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Productos',exact:true}).click();
  await expect(page.getByText('55 productos',{exact:true})).toBeVisible();
  await expect(page.locator('.catalog-item')).toHaveCount(24);
  await expect(page.getByRole('button',{name:'Hoy',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Productos siguientes'}).click();
  await expect(page.locator('.pagination')).toContainText('25–48 de 55');
  await page.getByRole('textbox',{name:'Buscar productos'}).fill('Producto real 55');
  await expect(page.locator('.catalog-item')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Producto real 55',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).click();expect((await download).suggestedFilename()).toBe('catalogo-dropea.csv');
  expect(calls).toBe(1);
});

test('a synchronized empty catalogue explains the upstream result instead of asking to reconnect',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('dropea-mode','live'));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:true,market:'CL',signingConfigured:true,syncing:false,lastError:null,lastSync:null,productsLastSync:'2026-11-05T18:00:00Z'}}));
  await page.route('**/api/data',r=>r.fulfill({json:{orders:[],products:[],shops:[],issues:[],events:[]}}));
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Productos',exact:true}).click();
  await expect(page.getByText('Dropea devolvió 0 productos para Chile',{exact:true})).toBeVisible();
  await expect(page.getByText('Conecta Dropea y sincroniza para ver tu operación aquí.',{exact:true})).not.toBeVisible();
});

test('catalogue permission errors stay visible without an automatic retry loop or logout',async({page})=>{
  let calls=0;
  await page.addInitScript(()=>localStorage.setItem('dropea-mode','live'));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:true,market:'ES',syncing:false,lastError:null,lastSync:null,productsLastSync:null,productsError:calls?'La API Key no tiene permisos para este recurso.':null}}));
  await page.route('**/api/data',r=>r.fulfill({json:{orders:[],products:[],shops:[],issues:[],events:[]}}));
  await page.route('**/api/sync/products',r=>{calls++;return r.fulfill({status:403,json:{code:'DROPEA_REQUEST_FAILED',error:'La API Key no tiene permisos para este recurso.'}});});
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Productos',exact:true}).click();
  await expect(page.getByText('No se pudo importar el catálogo',{exact:true})).toBeVisible();
  await expect(page.locator('.products-panel').getByRole('alert')).toContainText('permisos');
  expect(calls).toBe(1);
});

test('large product photos cannot overlap names, stock or price on desktop and mobile',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('dropea-mode','live'));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:true,market:'ES',syncing:false,lastSync:null,productsLastSync:'2026-11-06T01:00:00Z'}}));
  await page.route('**/api/data',r=>r.fulfill({json:{orders:[],shops:[],issues:[],events:[],products:[{id:1,name:'Producto con imagen vertical grande',status:'PUBLIC',media:{images:['https://test-images.example/large.svg']},variants:[{variant_id:1,stock:164,price:12.5,currency:'EUR'}]}]}}));
  await page.route('https://test-images.example/large.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="3200"><rect width="1600" height="3200" fill="#b7d9ff"/></svg>'}));
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);await page.goto('/');
    if(viewport.width<761)await page.getByRole('button',{name:'Abrir menú'}).click();
    await page.getByRole('navigation').getByRole('button',{name:'Productos',exact:true}).click();
    const card=page.locator('.catalog-item').first();await expect(card.getByRole('heading',{name:'Producto con imagen vertical grande'})).toBeVisible();
    await expect(card.getByText('Stock: 164',{exact:true})).toBeVisible();
    await expect(card.locator('.product-price')).toBeVisible();
    await expect(card.locator('img')).toHaveJSProperty('complete',true);
    const bounds=await card.evaluate(el=>{
      const image=el.querySelector('img')!.getBoundingClientRect();const title=el.querySelector('h3')!.getBoundingClientRect();const price=el.querySelector('.product-price')!.getBoundingClientRect();const card=el.getBoundingClientRect();
      return {imageBottom:image.bottom,titleTop:title.top,priceBottom:price.bottom,cardBottom:card.bottom};
    });
    expect(bounds.imageBottom).toBeLessThan(bounds.titleTop);
    expect(bounds.priceBottom).toBeLessThan(bounds.cardBottom);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
});
