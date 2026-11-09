import { useEffect, useState } from 'react';
import { WhatsappLogo, QrCode, CheckCircle, ArrowRight, ArrowClockwise, Key, Truck, ShieldCheck, PaperPlaneRight, Warning } from '@phosphor-icons/react';
import { money } from './metrics';
import './channels.css';

async function request<T>(path:string,options?:RequestInit):Promise<T>{const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options?.headers}});const data=await response.json();if(!response.ok){if(data.code==='SESSION_REQUIRED')window.dispatchEvent(new Event('crm-session-expired'));throw new Error(data.error||'No se pudo completar la solicitud.');}return data;}
type WA={automatic?:boolean;state:string;qr:string|null;phone:string|null;error:string|null;queue?:{pending:number;waiting:number;intervalSeconds:number}};
function Flow(){return <div className="channel-flow">{['Pedido recibido','WhatsApp automático','Cliente confirma','Envío automático a Dropea'].map((label,i)=><span key={label}><b>{i+1}</b>{label}{i<3&&<ArrowRight size={14}/>}</span>)}</div>;}

export function WhatsAppChannel(){
  const [status,setStatus]=useState<WA>({state:'disconnected',qr:null,phone:null,error:null}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [method,setMethod]=useState<'qr'|'api'>('qr');
  const [metaConfig,setMetaConfig]=useState({token:'',phoneId:'',wabaId:''});
  const [metaDetails,setMetaDetails]=useState<{configured?:boolean;verifiedName?:string;displayPhoneNumber?:string;qualityRating?:string;tokenPreview?:string;status?:string}>({});
  const [metaSaved,setMetaSaved]=useState(false);
  const [metaLoading,setMetaLoading]=useState(false);
  const [metaError,setMetaError]=useState('');
  const [metaTestPhone,setMetaTestPhone]=useState('');
  const [metaTestLoading,setMetaTestLoading]=useState(false);
  const [metaTestResult,setMetaTestResult]=useState<string|null>(null);
  const [previewMode,setPreviewMode]=useState<'variables'|'example'>('variables');

  useEffect(()=>{
    request<any>('/whatsapp/meta').then(res=>{
      if(res){
        setMetaDetails(res);
        setMetaConfig(c=>({...c,phoneId:res.phoneNumberId||'',wabaId:res.wabaId||''}));
      }
    }).catch(()=>{});
  },[]);

  async function saveMeta(e:React.FormEvent){
    e.preventDefault();
    setMetaLoading(true);
    setMetaError('');
    setMetaSaved(false);
    try {
      const res = await request<any>('/whatsapp/meta',{
        method:'POST',
        body: JSON.stringify({
          accessToken: metaConfig.token,
          phoneNumberId: metaConfig.phoneId,
          wabaId: metaConfig.wabaId
        })
      });
      setMetaDetails(res);
      setMetaSaved(true);
    } catch(err:any){
      setMetaError(err.message||'Error al conectar con Meta Cloud API');
    } finally {
      setMetaLoading(false);
    }
  }

  async function testMetaSend(e:React.FormEvent){
    e.preventDefault();
    if(!metaTestPhone.trim()) return;
    setMetaTestLoading(true);
    setMetaTestResult(null);
    setMetaError('');
    try {
      const res = await request<any>('/whatsapp/meta/test',{
        method:'POST',
        body: JSON.stringify({
          recipientPhone: metaTestPhone,
          messageText: '✅ Dropea CRM: Prueba de conexión con WhatsApp Business Cloud API (Meta) exitosa.'
        })
      });
      setMetaTestResult(`¡Mensaje enviado con éxito a +${res.recipient}! ID: ${res.messageId}`);
    } catch(err:any){
      setMetaError(err.message||'No se pudo enviar el mensaje por Meta Cloud API');
    } finally {
      setMetaTestLoading(false);
    }
  }

  useEffect(()=>{let live=true;const load=()=>request<WA>('/whatsapp').then(value=>{if(live){setStatus(value);setError('');}}).catch(e=>{if(live)setError(e.message);});load();const timer=setInterval(load,3000);return()=>{live=false;clearInterval(timer);};},[]);
  async function action(name:string){setBusy(true);setError('');try{setStatus(await request<WA>('/whatsapp/'+name,{method:'POST'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const connected=status.state==='connected';

  return <div className="channel-page">
    <div className="wa-method-selector">
      <button type="button" className={"wa-method-tab "+(method==='qr'?'active':'')} onClick={()=>setMethod('qr')}>
        <QrCode size={26}/>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <strong>Conexión directa por QR (Baileys)</strong>
            <span className="badge-rec">Activo · Recomendado</span>
          </div>
          <small>Envío saliente automático a clientes desde tus landings sin esperar que ellos inicien el chat.</small>
        </div>
      </button>
      <button type="button" className={"wa-method-tab "+(method==='api'?'active':'')} onClick={()=>setMethod('api')}>
        <WhatsappLogo size={26}/>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <strong>WhatsApp Business API (Meta Cloud)</strong>
            <span className="badge-info">API Oficial</span>
          </div>
          <small>Requiere que el cliente inicie la conversación o usar plantillas de pago aprobadas por Meta.</small>
        </div>
      </button>
    </div>

    {method==='qr'?(
      <>
        <div className="wa-connection-method">
          <WhatsappLogo size={24} weight="fill"/>
          <div>
            <strong>Método QR: Dispositivo vinculado</strong>
            <p>Vincula el número de tu tienda escaneando el código con WhatsApp. Las confirmaciones salen automáticas al recibir cada pedido.</p>
          </div>
          <span className="channel-status is-online">Baileys Multi-Device</span>
        </div>
        <Flow/>
        <div className="channel-columns">
          <section className="panel channel-panel">
            <div className="panel-title">
              <h2><WhatsappLogo size={22}/> WhatsApp de confirmaciones</h2>
              <span className={`channel-status ${connected?'is-online':''}`}>
                <i/>{connected?'Conectado':status.state==='qr'?'Escanea el QR':status.state==='connecting'?'Conectando…':'Sin vincular'}
              </span>
            </div>
            <p>Vincula una vez el número de tu tienda. Al entrar un pedido desde una landing, el sistema envía automáticamente el WhatsApp al comprador. No necesitas abrir el chat ni pulsar Enviar.</p>
            {connected?(
              <div className="wa-linked">
                <CheckCircle size={56}/>
                <h3>Número vinculado</h3>
                <strong>+{status.phone}</strong>
                <p>{status.automatic===false?'El envío automático está pausado.':'Envío automático activo para los pedidos que recibas desde tus landings.'}</p>
              </div>
            ):status.qr?(
              <div className="wa-qr">
                <img src={status.qr} alt="QR para vincular WhatsApp"/>
                <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo.</p>
              </div>
            ):(
              <div className="wa-linked">
                <QrCode size={64}/>
                <h3>{status.state==='connecting'?'Preparando tu QR…':'Conecta tu WhatsApp'}</h3>
                <p>El QR aparecerá aquí. Escanéalo con el teléfono del negocio.</p>
              </div>
            )}
            <div className="channel-actions">
              <button className="button primary" disabled={busy||connected||status.state==='connecting'||status.state==='qr'} onClick={()=>action('connect')}>
                <QrCode size={18}/>Vincular con QR
              </button>
              {status.state!=='disconnected'&&<button className="button" disabled={busy} onClick={()=>action('disconnect')}>Desvincular</button>}
            </div>
            {(error||status.error)&&<div className="error-inline" role="alert">{error||status.error}</div>}
          </section>
          <section className="panel channel-panel">
            <div className="panel-title"><h2>Confirmación automática de pedidos</h2></div>
            <label className="wa-auto-toggle">
              <input type="checkbox" role="switch" aria-label="Confirmación automática" checked={status.automatic!==false} disabled={busy} onChange={async e=>{const automatic=e.target.checked;setBusy(true);setStatus(s=>({...s,automatic}));setError('');try{await request('/whatsapp/settings',{method:'PATCH',body:JSON.stringify({automatic})});setStatus(s=>({...s,automatic}));}catch(e){setStatus(s=>({...s,automatic:!automatic}));setError((e as Error).message);}finally{setBusy(false);}}}/>
              {status.automatic===false?'Automatización pausada':'Automatización activa'}
            </label>
            <p>Al pausar se detienen los nuevos mensajes y las nuevas confirmaciones. Las operaciones ya enviadas a Dropea terminan de reconciliarse. También puedes tomar atención de un solo chat desde la bandeja.</p>
            <p>El pedido se guarda primero en el CRM. Enseguida se envía un mensaje automático con los <strong>datos reales de tu landing y tu producto en Dropea</strong>. El cliente responde <strong>SÍ o CONFIRMO</strong> desde el mismo número y el CRM lo crea y confirma automáticamente en Dropea.</p>

            <div className="wa-template-box">
              <div className="wa-template-header">
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <WhatsappLogo size={18} weight="fill" color="#25D366"/>
                  <strong>Plantilla de mensaje automático</strong>
                </div>
                <div className="wa-template-toggle">
                  <button type="button" className={previewMode==='variables'?'active':''} onClick={()=>setPreviewMode('variables')}>Variables dinámicas</button>
                  <button type="button" className={previewMode==='example'?'active':''} onClick={()=>setPreviewMode('example')}>Ejemplo simulado</button>
                </div>
              </div>

              {previewMode==='variables' ? (
                <div className="wa-example wa-template-body">
                  ¡Hola <span className="tpl-tag">{'{nombre_cliente}'}</span>! 👋 somos <span className="tpl-tag">{'{nombre_de_tu_tienda}'}</span>. Recibimos con éxito tu pedido #<span className="tpl-tag">{'{codigo_pedido}'}</span> 🛍️<br/><br/>
                  📦 Detalle de tu pedido:<br/>
                  🎁 Producto: <span className="tpl-tag">{'{cantidad}'}</span> × <span className="tpl-tag">{'{producto_dropea}'}</span><br/>
                  👤 Entrega a: <span className="tpl-tag">{'{nombre_completo}'}</span><br/>
                  📍 Dirección: <span className="tpl-tag">{'{direccion}, {ciudad}, {region}'}</span><br/>
                  💵 Total a pagar: <strong><span className="tpl-tag">{'{total_pedido}'}</span></strong><br/><br/>
                  🚚 ¿Están todos los datos correctos para preparar su despacho?<br/><br/>
                  Por favor responde:<br/>
                  👉 <strong>SÍ o CONFIRMO</strong> ✅<br/><br/>
                  Para anular responde: CANCELAR ❌ (Válido por 24 horas ⏳)
                </div>
              ) : (
                <div className="wa-example wa-template-body">
                  ¡Hola Manuel! 👋 somos Nexora Store. Recibimos con éxito tu pedido #7E4A1B9C 🛍️<br/><br/>
                  📦 Detalle de tu pedido:<br/>
                  🎁 Producto: 1 × Pelota Saltarina Glow Pro<br/>
                  👤 Entrega a: Manuel Bustos<br/>
                  📍 Dirección: Av. Providencia 1234, Dpto 502, Santiago, Región Metropolitana<br/>
                  💵 Total a pagar: <strong>$19.990</strong><br/><br/>
                  🚚 ¿Están todos los datos correctos para preparar su despacho?<br/><br/>
                  Por favor responde:<br/>
                  👉 <strong>SÍ o CONFIRMO</strong> ✅<br/><br/>
                  Para anular responde: CANCELAR ❌ (Válido por 24 horas ⏳)
                </div>
              )}
              <div className="wa-template-note">
                <span>ℹ️ <strong>100% dinámico:</strong> Las variables se sustituyen automáticamente al entrar cada pedido real desde tus landings. El nombre de tu tienda se toma de la configuración de la landing o de tu cuenta de Dropea (sin datos ficticios).</span>
              </div>
            </div>

            <div className="channel-queue"><span><strong>{status.queue?.pending??0}</strong> en cola de envío</span><span><strong>{status.queue?.waiting??0}</strong> esperando respuesta</span></div>
            <small className="muted">La conexión utiliza Baileys mediante un dispositivo vinculado. Puedes revocarla desde WhatsApp en cualquier momento.</small>
          </section>
        </div>
      </>
    ):(
      <div className="channel-columns">
        <section className="panel channel-panel">
          <div className="panel-title">
            <h2><WhatsappLogo size={22}/> WhatsApp Business Cloud API (Meta)</h2>
            <span className="channel-status"><i/>Modo Alternativo</span>
          </div>
          <div className="wa-api-guide">
            <strong>⚠️ Diferencia operativa entre QR y API de Meta:</strong>
            <p style={{margin:'8px 0'}}>
              Con la <strong>API oficial de Meta</strong>, para que el CRM pueda contactar al cliente que compró en tu landing:
            </p>
            <ul>
              <li>El cliente debe <strong>iniciar primero la conversación</strong> (haciendo clic en un botón de WhatsApp tras comprar) para abrir la ventana de 24 horas.</li>
              <li>O debes registrar y <strong>pagar plantillas pre-aprobadas de Meta</strong> para envíos salientes fríos (Outbound).</li>
            </ul>
            <p style={{margin:'8px 0 0'}}>
              Por esta razón, el CRM opera de forma nativa con <strong>Conexión por QR (Baileys)</strong>, que envía la confirmación de inmediato y a coste cero tan pronto se registra la orden.
            </p>
          </div>

          {metaDetails?.configured ? (
            <div style={{background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:'10px',padding:'14px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
              <ShieldCheck size={32} color="#22c55e" weight="duotone"/>
              <div style={{fontSize:'13px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <strong style={{color:'#f8fafc',fontSize:'14px'}}>{metaDetails.verifiedName || 'Número WhatsApp Verificado'}</strong>
                  <span style={{background:'#22c55e22',color:'#4ade80',padding:'2px 8px',borderRadius:'99px',fontSize:'11px',fontWeight:700}}>ACTIVO EN META</span>
                </div>
                <div style={{color:'#94a3b8',marginTop:'2px'}}>
                  Teléfono: <strong style={{color:'#e2e8f0'}}>{metaDetails.displayPhoneNumber || metaConfig.phoneId}</strong> · Calidad Meta: <span style={{color:metaDetails.qualityRating==='GREEN'?'#4ade80':'#fbbf24',fontWeight:600}}>{metaDetails.qualityRating || 'GREEN'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.2)',borderRadius:'10px',padding:'12px 14px',marginBottom:'16px',fontSize:'13px',color:'#cbd5e1'}}>
              ℹ️ Ingresa tu <strong>System User Token</strong> de Meta y tu <strong>Phone Number ID</strong> para verificar y validar la conexión en tiempo real con Meta Graph API.
            </div>
          )}

          <form className="channel-form" onSubmit={saveMeta}>
            <label>
              Token de Acceso Permanente (System User Token con permiso whatsapp_business_messaging)
              <input type="password" placeholder={metaDetails?.tokenPreview || "EAAB..."} value={metaConfig.token} onChange={e=>setMetaConfig({...metaConfig,token:e.target.value})}/>
            </label>
            <div className="channel-form-row">
              <label>
                Phone Number ID
                <input type="text" placeholder="Ej: 104598234857211" value={metaConfig.phoneId} onChange={e=>setMetaConfig({...metaConfig,phoneId:e.target.value})}/>
              </label>
              <label>
                WhatsApp Business Account ID (WABA)
                <input type="text" placeholder="Ej: 109823471029384" value={metaConfig.wabaId} onChange={e=>setMetaConfig({...metaConfig,wabaId:e.target.value})}/>
              </label>
            </div>
            <div className="channel-actions" style={{marginTop:'12px'}}>
              <button type="submit" className="button primary" disabled={metaLoading}>
                {metaLoading ? <ArrowClockwise size={16} className="animate-spin"/> : <Key size={16}/>}
                {metaLoading ? 'Validando con Meta...' : 'Guardar y Validar Conexión con Meta'}
              </button>
              <button type="button" className="button" onClick={()=>setMethod('qr')}><QrCode size={16}/>Volver a Conexión por QR</button>
            </div>
            {metaSaved&&<p style={{color:'#4ade80',fontSize:'13px',marginTop:'10px',display:'flex',alignItems:'center',gap:'6px'}}><CheckCircle size={16}/> ✔ Conexión con Meta Cloud API validada y activa exitosamente.</p>}
            {metaError&&<div className="error-inline" style={{marginTop:'10px',display:'flex',alignItems:'center',gap:'6px'}}><Warning size={16}/> {metaError}</div>}
          </form>

          {metaDetails?.configured && (
            <div style={{marginTop:'24px',borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:'16px'}}>
              <h3 style={{fontSize:'14px',color:'#f1f5f9',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                <PaperPlaneRight size={16} color="#38bdf8"/> Enviar Mensaje de Prueba Oficial
              </h3>
              <p style={{fontSize:'12px',color:'#94a3b8',marginBottom:'10px'}}>
                Verifica el envío saliente desde los servidores de Meta hacia tu teléfono personal o de prueba.
              </p>
              <form onSubmit={testMetaSend} style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input
                  type="text"
                  placeholder="+56912345678"
                  value={metaTestPhone}
                  onChange={e=>setMetaTestPhone(e.target.value)}
                  style={{flex:1,padding:'8px 12px',borderRadius:'8px',background:'rgba(15,23,42,0.6)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff',fontSize:'13px'}}
                />
                <button type="submit" className="button" disabled={metaTestLoading || !metaTestPhone.trim()} style={{whiteSpace:'nowrap'}}>
                  {metaTestLoading ? 'Enviando...' : 'Enviar Prueba'}
                </button>
              </form>
              {metaTestResult && <p style={{color:'#38bdf8',fontSize:'12px',marginTop:'8px'}}>{metaTestResult}</p>}
            </div>
          )}
        </section>

        <section className="panel channel-panel">
          <div className="panel-title"><h2>Requisitos de Meta WhatsApp Cloud API</h2></div>
          <p>Para utilizar la API oficial de Meta para confirmaciones de pedidos, tu cuenta comercial de Meta debe cumplir con lo siguiente:</p>
          <div className="channel-flow" style={{flexDirection:'column',gap:'8px'}}>
            <span><b>1</b>Crear App en Meta for Developers (Tipo: Business)</span>
            <span><b>2</b>Configurar producto WhatsApp Cloud API y asociar número comercial</span>
            <span><b>3</b>Crear y someter a aprobación la plantilla de Confirmación de Pedido (Categoría: Utility)</span>
            <span><b>4</b>Configurar Webhook con URL del CRM y Verify Token</span>
          </div>
          <p style={{marginTop:'16px'}}>Si prefieres no depender de aprobaciones ni costos por plantilla, conmuta a la pestaña <strong>Conexión directa por QR</strong> para vincular en 30 segundos.</p>
        </section>
      </div>
    )}
  </div>;
}

export {default as LandingsChannel} from './LandingSetup';

type LocalOrder={id:string;source_name:string;product_name:string;quantity:number;unit_price:number;currency:string;customer:{name:string;city:string};phone:string;state:string;error:string|null;remote_id:number|null;created_at:string};
const states:Record<string,string>={WA_PENDING:'WhatsApp en cola',WA_SENDING:'Enviando WhatsApp',WAITING_CONFIRMATION:'Esperando al cliente',CUSTOMER_CONFIRMED:'Cliente confirmó',CUSTOMER_CANCELLED:'Cancelado por cliente',EXPIRED:'Sin respuesta · vencido',MESSAGE_ERROR:'Error de WhatsApp',MESSAGE_UNKNOWN:'Revisar envío',CREATING:'Creando en Dropea',CREATE_PENDING:'Creación en proceso',CONFIRMING:'Confirmando en Dropea',CONFIRM_PENDING:'Confirmación en proceso',SENT_TO_DROPEA:'Confirmado en Dropea',DROPEA_ERROR:'Revisar en Dropea'};
export function LandingOrders({market, onTrack}:{market:string; onTrack?:(ref:string)=>void}){
  const [orders,setOrders]=useState<LocalOrder[]>([]),[error,setError]=useState('');
  useEffect(()=>{let live=true;const load=()=>request<LocalOrder[]>('/landing-orders?market='+market).then(value=>{if(live){setOrders(value);setError('');}}).catch(e=>{if(live)setError(e.message);});load();const timer=setInterval(load,5000);return()=>{live=false;clearInterval(timer);};},[market]);
  return <section className="panel channel-panel landing-orders"><div className="panel-title"><h2><WhatsappLogo size={20}/> Pedidos de landings</h2><span className="subtle-tag">{orders.length} recibidos</span></div><p className="small muted">Primero confirma el cliente por WhatsApp; después se envía y confirma en Dropea. Sin respuesta no se despacha.</p>{!orders.length?<p className="channel-empty">Todavía no hay pedidos recibidos desde tus landings para este país.</p>:<div className="channel-table-wrap"><table><thead><tr><th>Cliente / origen</th><th>Producto</th><th>Total</th><th>Estado</th><th>Dropea</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><strong>{order.customer.name}</strong><small>{order.phone} · {order.customer.city}</small><small>{order.source_name}</small></td><td>{order.quantity} × {order.product_name}</td><td>{money(order.quantity*order.unit_price,order.currency)}</td><td><span className={`channel-status ${order.state==='SENT_TO_DROPEA'?'is-online':''}`}><i/>{states[order.state]||order.state}</span>{order.error&&<small className="channel-order-error">{order.error}</small>}{['MESSAGE_ERROR','MESSAGE_UNKNOWN'].includes(order.state)&&<button className="text-link" onClick={async()=>{if(!window.confirm('Revisa primero el chat: el mensaje podría haberse entregado. ¿Quieres reenviar la confirmación de este pedido?'))return;try{await request('/landing-orders/'+order.id+'/retry-message',{method:'POST'});setOrders(current=>current.map(item=>item.id===order.id?{...item,state:'WA_PENDING',error:null}:item));}catch(e){setError((e as Error).message);}}}><ArrowClockwise size={13}/>Reenviar WhatsApp</button>}</td><td>{order.remote_id ? <button type='button' className='order-link' style={{color:'#38bdf8',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'4px',background:'none',border:'none',cursor:'pointer'}} onClick={()=>onTrack?.(String(order.remote_id))} title={`Ver seguimiento en vivo #${order.remote_id}`}><Truck size={13} weight='bold'/>#{order.remote_id}</button> : 'Pendiente'}</td></tr>)}</tbody></table></div>}{error&&<div className="error-inline" role="alert">{error}</div>}</section>;
}
