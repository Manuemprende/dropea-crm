import { test, expect } from '@playwright/test';

test('rejected Dropea credentials preserve the CRM session and allow correcting the form', async ({page}) => {
  await page.route('**/api/auth/session', route => route.fulfill({json:{enabled:true,authenticated:true,username:'admin'}}));
  await page.route('**/api/status', route => route.fulfill({json:{configured:false,market:'CL',signingConfigured:false,persistenceEnabled:true,syncing:false,lastError:null,lastSync:null}}));
  let attempts=0;
  await page.route('**/api/connection', route => {
    attempts++;
    return attempts===1 ? route.fulfill({status:401,json:{code:'DROPEA_UNAUTHORIZED',error:'Dropea rechazó la API Key. Revisa el mercado seleccionado. Tu sesión del CRM sigue activa.'}}) : route.fulfill({json:{connected:true,market:'CL'}});
  });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Configuración',exact:true}).click();
  const key=page.locator('.settings-grid form input[type="password"]').first();
  await key.fill('test-invalid-key');
  await page.getByRole('button',{name:'Verificar y conectar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Dropea rechazó la API Key');
  await expect(page.getByRole('heading',{name:'Conexión con Dropea'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Bienvenido de nuevo.'})).toHaveCount(0);
  await expect(key).toHaveValue('test-invalid-key');
  await key.fill('test-corrected-key');
  await page.getByRole('button',{name:'Verificar y conectar',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Conexión verificada');
  expect(attempts).toBe(2);
});

test('actual CRM session expiry still returns to login',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,authenticated:true,username:'admin'}}));
  await page.route('**/api/status',route=>route.fulfill({status:401,json:{code:'SESSION_REQUIRED',error:'Inicia sesión para continuar.'}}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Bienvenido de nuevo.'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Tu sesión terminó');
});
