import { test, expect } from '@playwright/test';

test('split login handles errors, password visibility, successful login and logout', async ({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,authenticated:false,username:null}}));
  await page.route('**/api/auth/login',route=>{
    const body=route.request().postDataJSON();
    return body.password==='test-correct-password' ? route.fulfill({json:{authenticated:true,username:'admin'}}) : route.fulfill({status:401,json:{error:'Usuario o contraseña incorrectos.'}});
  });
  await page.route('**/api/auth/logout',route=>route.fulfill({json:{authenticated:false}}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Bienvenido de nuevo.'})).toBeVisible();
  await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('admin');
  await page.locator('input[name="password"]').fill('wrong-password');
  await page.getByRole('button',{name:'Mostrar contraseña'}).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
  await page.locator('input[name="password"]').fill('test-correct-password');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Vista general',exact:true,level:1})).toBeVisible();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Bienvenido de nuevo.'})).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveValue('');
});

test('login fits a mobile viewport and uses two equal halves on desktop',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,authenticated:false}}));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Bienvenido de nuevo.'})).toBeVisible();
  const sizes=await page.locator('.login-page').evaluate(el=>[...el.children].map(c=>c.getBoundingClientRect().width));
  expect(Math.abs(sizes[0]-sizes[1])).toBeLessThan(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();
});
