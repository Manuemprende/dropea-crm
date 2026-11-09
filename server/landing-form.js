// This script contains only a public form identifier. Private keys stay on the server.
export function landingFormScript(source,base) {
  return `(${renderForm.toString()})(${JSON.stringify({id:source.public_id,product:source.product_name,price:source.unit_price,currency:source.currency,country:source.market,base}).replace(/</g,'\\u003c')});`;
}
function renderForm(config) {
  const script=document.currentScript,root=document.createElement('section');script.after(root);
  const style=document.createElement('style');style.textContent='.pd-order{max-width:560px;margin:24px auto;padding:28px;border:1px solid #bcd4e9;border-radius:18px;background:#fff;color:#102a43;font:15px system-ui;box-sizing:border-box}.pd-order *{box-sizing:border-box}.pd-order label{display:block;margin:14px 0}.pd-order input,.pd-order select{width:100%;padding:12px;border:1px solid #bcd4e9;border-radius:8px;font:inherit;background:#fff;color:#102a43}.pd-order .pd-consent{display:flex;gap:10px;align-items:flex-start}.pd-order input[type=checkbox]{width:auto;margin-top:4px}.pd-order button{width:100%;padding:14px;background:#1265be;border:0;border-radius:9px;color:white;font:600 16px system-ui;cursor:pointer}.pd-order button:disabled{opacity:.5}.pd-order [role=status]{white-space:pre-wrap;margin:16px 0}';root.append(style);
  const form=document.createElement('form');form.className='pd-order';form.setAttribute('data-live-checkout-form','');root.append(form);
  form.addEventListener('focusin',()=>window.CrmLandingLive?.current?.checkoutOpened());
  const title=document.createElement('h3');title.textContent=config.product;form.append(title);
  const price=document.createElement('p');price.textContent=new Intl.NumberFormat('es',{style:'currency',currency:config.currency}).format(config.price)+' · Pago al recibir · '+config.country;form.append(price);
  const fields=[['first_name','Nombre','text'],['last_name','Apellidos','text'],['email','Email','email'],['phone','WhatsApp con código de país (ej. +56912345678)','tel'],['address','Dirección completa','text'],['city','Ciudad / comuna','text'],['state','Región / provincia / estado','text'],['postal_code','Código postal','text']];
  for(const [name,text,type] of fields){const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.name=name;input.type=type;input.required=name!=='postal_code'||config.country!=='CL';input.maxLength=name==='address'?(config.country==='MX'?200:100):100;label.append(input);form.append(label);}
  const quantity=document.createElement('label');quantity.textContent='Cantidad';const qty=document.createElement('select');qty.name='quantity';for(let i=1;i<=5;i++){const option=document.createElement('option');option.value=String(i);option.textContent=String(i);qty.append(option);}quantity.append(qty);form.append(quantity);
  const trap=document.createElement('input');trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';trap.hidden=true;form.append(trap);
  const consent=document.createElement('label');consent.className='pd-consent';const check=document.createElement('input');check.type='checkbox';check.required=true;consent.append(check,document.createTextNode('Solicito este pedido y autorizo recibir un WhatsApp para confirmarlo. Solo se enviará a despacho después de mi confirmación.'));form.append(consent);
  const result=document.createElement('p');result.setAttribute('role','status');form.append(result);
  const button=document.createElement('button');button.textContent='Solicitar pedido y confirmar por WhatsApp';form.append(button);
  let requestId=crypto.randomUUID(),sent=false;
  form.addEventListener('submit',async event=>{event.preventDefault();if(sent)return;button.disabled=true;result.textContent='Registrando tu pedido…';
    try{const payload=Object.fromEntries(new FormData(form));Object.assign(payload,window.CrmLandingLive?.current?.context()||{});payload.consent=check.checked;payload.request_id=requestId;const response=await fetch(config.base+'/api/landings/'+config.id+'/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo registrar el pedido.');sent=true;result.textContent='Pedido recibido. Te escribiremos por WhatsApp: responde CONFIRMO seguido del código que recibirás. Tu pedido aún no ha sido enviado a despacho.';button.textContent='Pedido recibido';}
    catch(error){result.textContent=error.message;button.disabled=false;}
  });
}
