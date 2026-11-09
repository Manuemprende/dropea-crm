import {test,expect} from '@playwright/test';
test('WhatsApp brings conversations, pipeline and client history together; QR lives in settings',async({page})=>{
 let human=false,note='',sent=0,automatic=true;
 const conv=()=>({id:'chat-1',customer_id:'customer-1',account:'56999999999',name:'Ana Prueba',phone:'+56912345678',mode:human?'human':'automatic',preview:'Sí, confirmo',unread:1,orders:1,last_at:'2026-11-08T12:00:00Z'});
 const order={id:'local:order-1',local_id:'order-1',remote_id:50,market:'CL',name:'Ana Prueba',phone:'+56912345678',customer_id:'customer-1',product:'Producto de prueba',amount:19990,currency:'CLP',state:'SHIPPING',sub_state:'IN_TRANSIT',stage:'transit',error:null,created_at:'2026-11-08T12:00:00Z'};
 const customer=()=>({id:'customer-1',name:'Ana Prueba',phone:'+56912345678',orders:[order],conversations:[conv()],stats:{total:1,delivered:0,failed:0,completed:0,deliveryRate:null,averageDeliveryDays:null,timedDeliveries:0,firstAttemptRate:null},reliability:[],timeline:[{id:'e1',title:note||'Cliente confirmó el pedido',occurred_at:'2026-11-08T12:00:00Z',source:note?'operator':'automation',kind:note?'note':'order'}]});
 await page.route('**/api/whatsapp**',async route=>{const url=new URL(route.request().url()),path=url.pathname.slice('/api/whatsapp'.length),method=route.request().method();let json:unknown={};
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:'event: changed\ndata: {}\n\n'});
 if(path==='')json={state:'connected',phone:'56999999999',automatic,qr:null,error:null};
 else if(path==='/conversations')json=[conv()];
 else if(path==='/pipeline')json={stages:[{id:'awaiting',name:'Esperando respuesta'},{id:'transit',name:'En tránsito'},{id:'delivered',name:'Entregados'}],orders:[order]};
 else if(path==='/customers')json=[{...customer(),orders:1,delivered:0}];
 else if(path==='/customers/customer-1')json=customer();
 else if(path==='/conversations/chat-1'&&method==='PATCH'){human=route.request().postDataJSON().mode==='human';json={updated:true};}
 else if(path==='/conversations/chat-1')json={conversation:conv(),customer:customer(),hasMore:false,nextBefore:null,messages:[{id:'m1',direction:'out',origin:'automatic',type:'text',text:'Hola Ana, recibimos tu pedido. Total a pagar: $19.990.',status:'read',error:null,occurred_at:'2026-11-08T12:00:00Z',historical:0},{id:'m2',direction:'in',origin:'customer',type:'text',text:'Sí, confirmo',status:'received',error:null,occurred_at:'2026-11-08T12:01:00Z',historical:0}]};
 else if(path.endsWith('/messages')){sent++;json={sent:true};}
 else if(path.endsWith('/notes')){note=route.request().postDataJSON().text;json={saved:true};}
 else if(path==='/settings'){automatic=route.request().postDataJSON().automatic;json={automatic};}
 return route.fulfill({json});});
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'WhatsApp',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Conversaciones'})).toBeVisible();await expect(page.getByRole('button',{name:'Vincular con QR',exact:true})).toHaveCount(0);
 await page.locator('.wa-chat-preview').click();await expect(page.getByText('Hola Ana, recibimos tu pedido. Total a pagar: $19.990.',{exact:true})).toBeVisible();await expect(page.getByText('Leído',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tomar atención',exact:true}).click();
 await expect.poll(()=>human).toBe(true);await page.getByRole('tab',{name:'Pipeline',exact:true}).click();await expect(page.locator('.wa-stage').filter({hasText:'En tránsito'}).getByText('Producto de prueba',{exact:true})).toBeVisible();
 await page.locator('.wa-order-card').click();await expect(page.getByRole('tab',{name:'Clientes',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByText('Entrega al primer intento',{exact:true})).toBeVisible();await expect(page.getByText('Sin dato',{exact:true})).toBeVisible();
 await page.getByLabel('Nota interna').fill('Cliente solicita llamar antes de entregar');await page.getByRole('button',{name:'Guardar nota'}).click();await expect.poll(()=>note).toContain('llamar');expect(sent).toBe(0);
 await page.getByRole('button',{name:'Ver conversación'}).click();await expect(page.getByRole('button',{name:'Reanudar automático'})).toBeVisible();await page.getByLabel('Mensaje al cliente').fill('Gracias, Ana.');await page.getByRole('button',{name:'Enviar',exact:true}).click();await expect.poll(()=>sent).toBe(1);
 await page.screenshot({path:'artifacts/whatsapp-inbox-dark.png',fullPage:true});
 await page.getByRole('button',{name:'Activar modo día'}).click();await page.screenshot({path:'artifacts/whatsapp-inbox-light.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByLabel('Mensaje al cliente')).toBeVisible();await page.screenshot({path:'artifacts/whatsapp-inbox-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Configurar WhatsApp',exact:true}).click();await expect(page.getByRole('tab',{name:'WhatsApp',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('button',{name:'Vincular con QR'})).toBeVisible();await page.getByRole('switch',{name:'Confirmación automática'}).uncheck();await expect.poll(()=>automatic).toBe(false);
});

