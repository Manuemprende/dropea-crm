import { test, expect } from '@playwright/test';

test('the radar ranks real inventory decreases above unchanged products without claiming confirmed sales',async({page})=>{
  const signal=(drop:number,stock:number)=>({drop24h:drop,restocked24h:0,observations:2,compared:true,previousStock:stock+drop,currentStock:stock,lastObserved:'2026-11-06T09:00:00Z',lastDrop:drop?'2026-11-06T09:00:00Z':null,history:[{at:'2026-11-06T08:30:00Z',stock:stock+drop},{at:'2026-11-06T09:00:00Z',stock}]});
  const products=[{id:1,name:'Sin movimiento',status:'PUBLIC',stockRadar:signal(0,50),variants:[]},{id:2,name:'Mayor baja real',status:'PUBLIC',stockRadar:signal(30,70),variants:[]},{id:3,name:'Baja menor',status:'PUBLIC',stockRadar:signal(4,96),variants:[]}];
  await page.addInitScript(()=>localStorage.setItem('dropea-mode','live'));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:true,market:'ES',syncing:false,lastSync:null,productsLastSync:'2026-11-06T09:00:00Z'}}));
  await page.route('**/api/data',r=>r.fulfill({json:{orders:[],products,shops:[],issues:[],events:[]}}));
  await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Productos',exact:true}).click();
  await expect(page.locator('.catalog-item').first().getByRole('heading',{name:'Mayor baja real',exact:true})).toBeVisible();
  await expect(page.locator('.radar-leader').first()).toContainText('Mayor baja real');
  await expect(page.locator('.radar-leader').first()).toContainText('−30');
  await expect(page.getByText(/no ventas confirmadas/)).toBeVisible();
  await page.locator('.radar-leader').first().click();await expect(page.locator('.catalog-item')).toHaveCount(1);
  await page.getByRole('button',{name:'Volver a todos los productos',exact:true}).click();
  await expect(page.locator('.catalog-item')).toHaveCount(3);
  await expect(page.getByRole('textbox',{name:'Buscar productos',exact:true})).toHaveValue('');
  await page.locator('.radar-leader').first().click();
  await page.getByRole('button',{name:'Limpiar búsqueda de productos',exact:true}).click();
  await expect(page.locator('.catalog-item')).toHaveCount(3);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
