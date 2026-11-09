import { test, expect } from '@playwright/test';

test('the four requested countries are visible and select the market sent to Dropea',async({page})=>{
  let selected='CL';
  await page.route('**/api/status',route=>route.fulfill({json:{configured:false,market:selected,signingConfigured:false,syncing:false,lastSync:null,lastError:null}}));
  await page.route('**/api/market',route=>{selected=route.request().postDataJSON().market;return route.fulfill({json:{market:selected,configured:false}});});
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Configuración',exact:true}).click();
  const attempted:string[]=[];
  await page.route('**/api/connection',route=>{
    attempted.push(route.request().postDataJSON().market);
    return route.fulfill({status:401,json:{code:'DROPEA_UNAUTHORIZED',error:'Clave de prueba rechazada.'}});
  });
  for(const [name,code] of [['España','ES'],['Italia','IT'],['Portugal','PT'],['Chile','CL']]) {
    const country=page.locator('.market-picker').getByRole('button',{name:new RegExp(name)});
    await expect(country).toBeVisible();await country.click();
    await expect(country).toHaveAttribute('aria-pressed','true');
    await page.locator('.settings-grid input[type="password"]').first().fill('test-country-key');
    const response=page.waitForResponse(r=>r.url().endsWith('/api/connection'));
    await page.getByRole('button',{name:'Verificar y conectar',exact:true}).click();await response;
    await expect(page.getByRole('alert')).toContainText('Clave de prueba rechazada.');
    expect(attempted.at(-1)).toBe(code);
  }
});

test('dashboard flags keep the chosen country after reload and when opening integration',async({page})=>{
  let selected='CL';
  await page.route('**/api/status',route=>route.fulfill({json:{configured:false,market:selected,signingConfigured:false,syncing:false,lastSync:null,lastError:null}}));
  await page.route('**/api/market',route=>{selected=route.request().postDataJSON().market;return route.fulfill({json:{market:selected,configured:false}});});
  await page.goto('/');
  const picker=page.getByRole('group',{name:'País seleccionado'});
  for(const name of ['España','Italia','Portugal','Chile','México']) {
    await expect(picker.getByRole('button',{name:new RegExp(name)})).toBeVisible();
  }
  expect(await picker.locator('img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth>0))).toBeTruthy();
  await picker.getByRole('button',{name:/Portugal/}).click();
  await expect(picker.getByRole('button',{name:/Portugal/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Portugal · Visualización de cobertura')).toBeVisible();
  await page.reload();
  await expect(picker.getByRole('button',{name:/Portugal/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('navigation').getByRole('button',{name:'Configuración',exact:true}).click();
  await expect(page.locator('.market-picker').getByRole('button',{name:/Portugal/})).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
