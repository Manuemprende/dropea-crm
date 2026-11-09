import {useEffect,useRef,useState} from 'react';
import {WhatsappLogo,GearSix,PaperPlaneRight,Check,Checks,MagnifyingGlass,ChatsCircle,UsersThree,Kanban,UserCircle,ArrowLeft,X} from '@phosphor-icons/react';
import './whatsapp-inbox.css';

type Conversation={id:string;customer_id:string;name:string;phone:string;mode:string;account:string;preview:string;unread:number;orders:number;last_at:string;avatar?:string|null};
type Message={id:string;direction:string;origin:string;type:string;text:string;status:string;error:string|null;occurred_at:string;historical:number};
type Order={id:string;local_id:string|null;remote_id:number|null;market:string;name:string;phone:string;customer_id:string;product:string;amount:number;currency:string;state:string;sub_state:string;stage:string;error:string|null;created_at:string};
type Customer={id:string;name:string;phone:string;avatar?:string|null;orders:Order[];conversations:Conversation[];stats:{total:number;delivered:number;failed:number;completed:number;deliveryRate:number|null;averageDeliveryDays:number|null;timedDeliveries:number;firstAttemptRate:null};reliability:{market:string;at:string;value:{delivery_rate?:number;total_computable?:number;level?:string}}[];timeline:{id:string;title:string;occurred_at:string;source:string;kind:string}[]};
type Thread={conversation:Conversation;messages:Message[];hasMore:boolean;nextBefore:string|null;customer:Customer};
type Status={state:string;phone:string|null;automatic?:boolean};
type CustomerRow={id:string;name:string;phone:string;orders:number;delivered:number;completed?:number;deliveryRate?:number|null;averageDeliveryDays?:number|null};
async function request<T>(path:string,options?:RequestInit):Promise<T>{const r=await fetch('/api/whatsapp'+path,{...options,headers:{'Content-Type':'application/json',...options?.headers}});const data=await r.json();if(!r.ok){if(data.code==='SESSION_REQUIRED')window.dispatchEvent(new Event('crm-session-expired'));throw new Error(data.error||'No se pudo completar la solicitud.');}return data;}
const date=(v:string)=>new Date(v).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const price=(o:Order)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:o.currency}).format(o.amount);
const ref=(o:Order)=>o.remote_id?'Dropea #'+o.remote_id:'#'+(o.local_id||o.id).slice(0,10).toUpperCase();
const countries:Record<string,string>={ES:'España',IT:'Italia',PT:'Portugal',CL:'Chile',MX:'México'};
const messageLabels:Record<string,string>={pending:'Enviando',sent:'Enviado',delivered:'Entregado en WhatsApp',read:'Leído',failed:'Error de envío',unknown:'Envío por verificar'};

function ContactAvatar({ name, avatar, className = '' }: { name: string; avatar?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (avatar && !failed) {
    return (
      <span className={`wa-avatar ${className}`}>
        <img
          src={avatar}
          alt={name}
          className="wa-avatar-img"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span className={`wa-avatar ${className}`}>
      {name ? name.charAt(0).toUpperCase() : <UserCircle size={20} />}
    </span>
  );
}

function CustomerProfile({customer,onRefresh}:{customer:Customer;onRefresh:()=>void}){
  const [note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const s=customer.stats;
  return <div className="wa-profile"><div className="wa-profile-heading"><ContactAvatar name={customer.name} avatar={customer.avatar} className="wa-avatar-profile" /><h3>{customer.name}</h3><span>{customer.phone}</span></div><h4>Evaluación de entrega del cliente</h4><div className="wa-client-metrics"><div><strong>{s.deliveryRate===null?'—':s.deliveryRate.toFixed(0)+'%'}</strong><span>Porcentaje de entrega · {s.completed} finalizados</span></div><div><strong>{s.averageDeliveryDays===null?'—':s.averageDeliveryDays.toFixed(1)+' días'}</strong><span>Promedio · {s.timedDeliveries} con fecha</span></div><div><strong>{s.total}</strong><span>Pedidos · {s.delivered} entregados</span></div><div><strong>Sin dato</strong><span>Entrega al primer intento</span></div></div><p className="wa-hint">La tasa considera entregados y rechazos o pérdidas finales. Los pendientes no cuentan como fallidos.</p><h4>Referencia de Dropea</h4>{customer.reliability.length?customer.reliability.slice(0,1).map((r,i)=><p key={i} className="wa-hint">{countries[r.market]} · {typeof r.value.delivery_rate==='number'?(r.value.delivery_rate*100).toFixed(0)+'% de entrega':'Sin tasa disponible'}{r.value.total_computable!==undefined?' · '+r.value.total_computable+' pedidos computables':''}<br/>Historial externo, separado de tus pedidos.</p>):<p className="wa-hint">Consulta el historial disponible en Dropea para este cliente.</p>}<button className="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await request('/customers/'+customer.id+'/reliability',{method:'POST'});onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Consultando…':'Consultar en Dropea'}</button><h4>Pedidos del cliente</h4><div className="wa-customer-orders">{customer.orders.length?customer.orders.map(o=><article key={o.id}><strong>{ref(o)} <span>{o.market}</span></strong><p>{o.product}</p><small>{price(o)} · {o.state}{o.sub_state?' / '+o.sub_state:''}</small>{o.error&&<small className="wa-error-text">{o.error}</small>}</article>):<p className="wa-hint">Este contacto todavía no tiene pedidos.</p>}</div><h4>Notas internas</h4>{customer.conversations[0]&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await request('/conversations/'+customer.conversations[0].id+'/notes',{method:'POST',body:JSON.stringify({text:note})});setNote('');onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><textarea aria-label="Nota interna" placeholder="Solo para tu equipo; no se envía al cliente." maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/><button className="button" disabled={busy||!note.trim()}>Guardar nota</button></form>}{error&&<p role="alert" className="wa-error-text">{error}</p>}<h4>Trazabilidad</h4><div className="wa-timeline">{customer.timeline.length?customer.timeline.slice(0,30).map(t=><article key={t.id}><i/><div><p>{t.title}</p><small>{date(t.occurred_at)} · {t.source==='baseline'?'Importación inicial':t.source==='operator'?'Equipo':t.source==='webhook'?'Evento Dropea':t.source==='whatsapp'?'WhatsApp':'CRM'}</small></div></article>):<p className="wa-hint">Los nuevos eventos aparecerán aquí.</p>}</div></div>;
}

let cachedWaConversations: Conversation[] = [];
let cachedWaPipeline: {stages:{id:string;name:string}[];orders:Order[]} = {stages:[],orders:[]};
let cachedWaClients: CustomerRow[] = [];
try {
  const c = localStorage.getItem('crm-wa-conversations');
  if (c) cachedWaConversations = JSON.parse(c);
  const p = localStorage.getItem('crm-wa-pipeline');
  if (p) cachedWaPipeline = JSON.parse(p);
  const u = localStorage.getItem('crm-wa-clients');
  if (u) cachedWaClients = JSON.parse(u);
} catch {}

export default function WhatsAppInbox({onSettings}:{onSettings:()=>void}){
  const [tab,setTab]=useState(()=>localStorage.getItem('crm-wa-tab')||'Conversaciones'),[status,setStatus]=useState<Status>({state:'disconnected',phone:null}),[conversations,setConversations]=useState<Conversation[]>(cachedWaConversations),[selected,setSelected]=useState(''),[thread,setThread]=useState<Thread|null>(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[revision,setRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState(''),[pipeline,setPipeline]=useState<{stages:{id:string;name:string}[];orders:Order[]}>(cachedWaPipeline),[market,setMarket]=useState('ALL'),[clients,setClients]=useState<CustomerRow[]>(cachedWaClients),[clientId,setClientId]=useState(''),[client,setClient]=useState<Customer|null>(null);
  useEffect(()=>{localStorage.setItem('crm-wa-tab',tab);},[tab]);
  const sendAttempt=useRef<{text:string;id:string}|null>(null),messagesEnd=useRef<HTMLDivElement>(null);
  const refresh=()=>setRevision(r=>r+1);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const events=new EventSource('/api/whatsapp/events');events.addEventListener('changed',()=>{clearTimeout(timer);timer=setTimeout(refresh,200);});const fallback=setInterval(refresh,15000);return()=>{events.close();clearTimeout(timer);clearInterval(fallback);};},[]);
  useEffect(()=>{let active=true;Promise.all([request<Status>(''),request<Conversation[]>('/conversations'),request<typeof pipeline>('/pipeline'),request<CustomerRow[]>('/customers')]).then(([s,c,p,users])=>{if(active){setStatus(s);setConversations(c);setPipeline(p);setClients(users);try{localStorage.setItem('crm-wa-conversations',JSON.stringify(c));localStorage.setItem('crm-wa-pipeline',JSON.stringify(p));localStorage.setItem('crm-wa-clients',JSON.stringify(users));}catch{}}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision]);
  useEffect(()=>{if(!selected){setThread(null);return;}let active=true;request<Thread>('/conversations/'+selected).then(t=>{if(active){setThread(t);if(t.conversation.unread)request('/conversations/'+selected+'/read',{method:'POST'}).catch(e=>setError(e.message));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[selected,revision]);
  const previousSelection=useRef(selected);
  useEffect(()=>{if(previousSelection.current!==selected){setDraft('');sendAttempt.current=null;setThread(null);previousSelection.current=selected;}},[selected]);
  const lastVisibleMessage=useRef('');
  useEffect(()=>{const key=selected+':'+(thread?.messages.at(-1)?.id||'');if(key!==lastVisibleMessage.current){const area=messagesEnd.current?.parentElement;if(area)area.scrollTop=area.scrollHeight;lastVisibleMessage.current=key;}},[selected,thread?.messages.length]);
  useEffect(()=>{if(!clientId){setClient(null);return;}let active=true;request<Customer>('/customers/'+clientId).then(c=>{if(active)setClient(c);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[clientId,revision]);
  async function attention(){if(!thread)return;setBusy(true);setError('');try{await request('/conversations/'+selected,{method:'PATCH',body:JSON.stringify({mode:thread.conversation.mode==='human'?'automatic':'human'})});refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function send(){if(!thread||!draft.trim())return;setBusy(true);setError('');const text=draft.trim();if(sendAttempt.current?.text!==text)sendAttempt.current={text,id:crypto.randomUUID()};try{const result=await request<{status?:string}>('/conversations/'+selected+'/messages',{method:'POST',body:JSON.stringify({text,request_id:sendAttempt.current!.id})});if(result.status==='failed'||result.status==='unknown')throw new Error('Revisa el envío anterior en el chat antes de escribir un nuevo mensaje.');setDraft('');sendAttempt.current=null;refresh();}catch(e){setError((e as Error).message);refresh();}finally{setBusy(false);}}
  const matches=(value:string)=>value.toLowerCase().includes(query.toLowerCase());
  const visible=conversations.filter(c=>matches(c.name+' '+c.phone+' '+c.preview)&&(filter==='all'||filter==='unread'&&c.unread>0||filter==='human'&&c.mode==='human'));
  const orders=pipeline.orders.filter(o=>(market==='ALL'||market===o.market)&&matches(o.name+' '+o.phone+' '+o.product+' '+ref(o)));
  const online=status.state==='connected';
  return <section className="wa-inbox" aria-label="WhatsApp"><div className="wa-topbar"><div className="wa-navigation" role="tablist" aria-label="Secciones de WhatsApp">{[{name:'Conversaciones',icon:ChatsCircle},{name:'Pipeline',icon:Kanban},{name:'Clientes',icon:UsersThree}].map(t=><button key={t.name} role="tab" aria-selected={tab===t.name} onClick={()=>{setTab(t.name);setQuery('');}}><t.icon size={18}/>{t.name}{t.name==='Conversaciones'&&conversations.some(c=>c.unread>0)&&<b>{conversations.reduce((n,c)=>n+c.unread,0)}</b>}</button>)}</div><div className="wa-topbar-actions"><div className={'wa-connection '+(online?'online':'')}><WhatsappLogo size={18} weight="fill"/><strong>{online?(status.phone?'+'+status.phone:'Conectado'):'Sin vincular'}</strong><span className="dot" style={{background:online?'#4ade80':'#94a3b8'}}/></div><button className="button wa-settings-btn" onClick={onSettings}><GearSix size={15}/>Configurar</button></div></div>{error&&<div className="error-inline" role="alert">{error}<button className="text-link" onClick={()=>setError('')}>Cerrar</button></div>}
    {tab==='Conversaciones'&&<div className={'wa-workspace '+(selected?'has-selection':'')}><aside className="wa-chat-list"><label className="wa-search"><MagnifyingGlass size={17}/><input aria-label="Buscar conversación" placeholder="Nombre o teléfono" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="wa-list-filters">{[['all','Todos'],['unread','No leídos'],['human','En atención']].map(([value,name])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{name}</button>)}</div><div className="wa-list-scroll">{visible.length?visible.map(c=><button className={'wa-chat-preview '+(selected===c.id?'selected':'')} key={c.id} onClick={()=>setSelected(c.id)}><ContactAvatar name={c.name} avatar={c.avatar} /><div><strong>{c.name}</strong><span>{c.preview||'Sin mensajes registrados'}</span><small>{c.mode==='human'?'Atención humana':`${c.orders} pedidos${(clients.find(u=>u.id===c.id)?.deliveryRate!=null)?' · '+clients.find(u=>u.id===c.id)!.deliveryRate!.toFixed(0)+'% entrega':''}`}</small></div>{c.unread>0&&<b>{c.unread}</b>}</button>):<div className="wa-empty"><ChatsCircle size={36}/><h3>Tu bandeja está lista</h3><p>{query?'No hay coincidencias.':'Los mensajes de tu número vinculado y las confirmaciones de pedidos aparecerán aquí.'}</p></div>}</div></aside><div className="wa-conversation">{thread?<><header className="wa-chat-header"><div className="wa-chat-header-main"><button className="icon-button wa-back" aria-label="Volver a conversaciones" onClick={()=>setSelected('')}><ArrowLeft size={20}/></button><ContactAvatar name={thread.conversation.name} avatar={thread.customer?.avatar} className="wa-avatar-header" /><div className="wa-chat-header-titles"><strong>{thread.conversation.name}</strong>{thread.conversation.name!==thread.conversation.phone&&<small>{thread.conversation.phone}</small>}</div></div><div className="wa-chat-header-actions">{thread.customer&&<div className="wa-header-stats-pill" onClick={()=>{setClientId(thread.customer.id);setTab('Clientes');}} title="Ver ficha y estadísticas"><span>📦 {thread.customer.stats.total} pedidos</span><strong className="wa-rate-highlight">{thread.customer.stats.deliveryRate===null?'—':thread.customer.stats.deliveryRate.toFixed(0)+'%'}</strong></div>}<button className="button wa-btn-compact" onClick={()=>{setClientId(thread.customer.id);setTab('Clientes');setQuery('');}}>Ver ficha</button><button className="button wa-btn-compact" disabled={busy} onClick={attention}>{thread.conversation.mode==='human'?'Reanudar':'Atender'}</button></div></header><div className={'wa-mode '+(thread.conversation.mode==='human'?'human':'')}>{thread.conversation.mode==='human'?'Atención humana: confirmación automática pausada en este chat.':'El sistema confirma los pedidos con la respuesta del cliente.'}</div><div className="wa-messages">{thread.hasMore&&<button className="button" onClick={async()=>{try{const older=await request<Thread>('/conversations/'+selected+'?before='+thread.nextBefore);setThread({...older,messages:[...older.messages,...thread.messages]});}catch(e){setError((e as Error).message);}}}>Cargar mensajes anteriores</button>}{!thread.messages.length&&<p className="wa-empty">Todavía no hay mensajes guardados para este contacto.</p>}{thread.messages.map(m=><article key={m.id} className={'wa-bubble '+(m.direction==='out'?'outgoing':'incoming')}><small className="wa-message-origin">{m.direction==='in'?'Cliente':m.origin==='automatic'?'Confirmación automática':m.origin==='operator'?'Equipo':'Desde el teléfono'}{m.historical?' · Historial importado':''}</small>{m.type!=='text'&&<div className="wa-media-placeholder">{({audio:'Audio',image:'Imagen',video:'Video',document:'Documento',sticker:'Sticker',location:'Ubicación'} as Record<string,string>)[m.type]||'Archivo'} · registrado en WhatsApp. Abre el teléfono para verlo.</div>}<p>{m.text}</p><div className={'wa-message-meta '+(m.status==='read'?'read':'')}><time>{date(m.occurred_at)}</time>{m.direction==='out'&&<span title={messageLabels[m.status]||m.status}>{m.status==='read'||m.status==='delivered'?<Checks size={16}/>:m.status==='sent'?<Check size={15}/>:null}{messageLabels[m.status]||m.status}</span>}</div>{m.error&&<small className="wa-error-text">{m.error}</small>}</article>)}<div ref={messagesEnd}/></div><form className="wa-composer" onSubmit={e=>{e.preventDefault();send();}}><textarea aria-label="Mensaje al cliente" placeholder={online?'Escribe un mensaje…':'Vincula WhatsApp en Configuración para responder'} maxLength={4096} value={draft} onChange={e=>setDraft(e.target.value)} disabled={!online||busy}/><button className="button primary" disabled={!online||busy||!draft.trim()}><PaperPlaneRight size={18}/>{busy?'Enviando…':'Enviar'}</button></form></>:<div className="wa-empty wa-chat-welcome"><WhatsappLogo size={60} weight="duotone"/><h2>Una conversación, toda la historia</h2><p>Selecciona un contacto para ver mensajes, pedidos y entregas.</p><small>Se registra la actividad desde esta integración. El historial anterior depende de lo que WhatsApp sincronice.</small></div>}</div>{thread&&<aside className="wa-context"><CustomerProfile key={thread.customer.id} customer={thread.customer} onRefresh={refresh}/></aside>}</div>}
    {tab==='Pipeline'&&<><div className="wa-section-tools"><div><h2>Del formulario a la entrega</h2><p>Una tarjeta por pedido. Los estados avanzan con la confirmación del cliente y los eventos de Dropea.</p></div><label className="wa-search"><MagnifyingGlass size={17}/><input aria-label="Buscar pedido en pipeline" placeholder="Cliente, producto o pedido" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="País del pipeline" value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">Todos los países</option>{Object.entries(countries).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div><div className="wa-pipeline">{pipeline.stages.map(stage=><section className={'wa-stage stage-'+stage.id} key={stage.id}><header><span/>{stage.name}<b>{orders.filter(o=>o.stage===stage.id).length}</b></header>{orders.filter(o=>o.stage===stage.id).map(o=><button className="wa-order-card" key={o.id} onClick={()=>{setClientId(o.customer_id||'');setTab('Clientes');setQuery('');}}><div><strong>{ref(o)}</strong><span className="subtle-tag">{o.market}</span></div><h3>{o.name||'Sin nombre'}</h3><p>{o.product}</p><strong className="wa-order-price">{price(o)}</strong><small>{o.state}{o.sub_state?' · '+o.sub_state:''}</small>{o.error&&<small className="wa-error-text">{o.error}</small>}<time>{date(o.created_at)}</time></button>)}{!orders.some(o=>o.stage===stage.id)&&<p className="wa-stage-empty">Sin pedidos</p>}</section>)}</div>{!pipeline.orders.length&&<p className="wa-hint">Los pedidos recibidos por landings y sincronizados desde Dropea aparecerán aquí.</p>}</>}
    {tab==='Clientes'&&<div className="wa-clients-layout">
      <section className="wa-clients">
        <div className="wa-section-tools">
          <div><h2>Clientes</h2><p>Compras, porcentaje de entrega y tiempo de recepción por cliente.</p></div>
          <label className="wa-search"><MagnifyingGlass size={17}/><input aria-label="Buscar cliente" placeholder="Nombre o teléfono" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        </div>
        <div className="wa-clients-guide"><strong>Evaluación de clientes</strong><span>Selecciona «Ver ficha» para revisar pedidos, entregas, tiempo promedio y trazabilidad. Sin entregas finalizadas mostramos —.</span></div>
        
        {/* Desktop Table View */}
        <div className="wa-client-table desktop-only-table">
          <table>
            <thead><tr><th>Cliente</th><th>Pedidos</th><th>Entregados</th><th>% entrega</th><th>Tiempo medio</th><th/></tr></thead>
            <tbody>{clients.filter(c=>matches(c.name+' '+c.phone)).map(c=><tr key={c.id} className={clientId===c.id?'selected':''} onClick={()=>setClientId(c.id)}><td><strong>{c.name}</strong><small>{c.phone}</small></td><td>{c.orders}</td><td>{c.delivered||0}</td><td><strong>{c.deliveryRate==null?'—':c.deliveryRate.toFixed(0)+'%'}</strong><small>{c.completed??0} finalizados</small></td><td>{c.averageDeliveryDays==null?'—':c.averageDeliveryDays.toFixed(1)+' días'}</td><td><button className="text-link" onClick={(e)=>{e.stopPropagation();setClientId(c.id);}}>Ver ficha</button></td></tr>)}</tbody>
          </table>
        </div>

        {/* Mobile Client Cards View */}
        <div className="wa-client-mobile-cards mobile-only-cards">
          {clients.filter(c=>matches(c.name+' '+c.phone)).map(c=>(
            <div key={c.id} className={`wa-client-m-card ${clientId===c.id?'selected':''}`} onClick={()=>setClientId(c.id)}>
              <div className="wa-client-m-top">
                <ContactAvatar name={c.name} className="wa-avatar-sm" />
                <div className="wa-client-m-info">
                  <strong>{c.name}</strong>
                  <small>{c.phone}</small>
                </div>
                <span className="wa-client-m-rate">{c.deliveryRate==null?'—':c.deliveryRate.toFixed(0)+'% entrega'}</span>
              </div>
              <div className="wa-client-m-bottom">
                <span>📦 {c.orders} pedidos ({c.delivered||0} entregados)</span>
                <span className="wa-client-m-btn">Ver ficha ↗</span>
              </div>
            </div>
          ))}
        </div>

        {!clients.length&&<div className="wa-empty"><UsersThree size={40}/><h3>Conoce a tus clientes</h3><p>Sus fichas se crean al recibir pedidos o mensajes.</p></div>}
      </section>

      {/* Desktop side panel (hidden on mobile) */}
      <aside className="wa-client-detail desktop-only-detail">
        {client ? (
          <>
            <div className="wa-client-actions">
              <button className="text-link" onClick={()=>setClientId('')}>Cerrar ficha</button>
              {client.conversations[0]&&<button className="button" onClick={()=>{setSelected(client.conversations[0].id);setTab('Conversaciones');}}>Ver conversación</button>}
            </div>
            <CustomerProfile key={client.id} customer={client} onRefresh={refresh}/>
          </>
        ) : (
          <div className="wa-empty wa-client-placeholder"><UserCircle size={48}/><p>Selecciona un cliente para ver su historial.</p></div>
        )}
      </aside>

      {/* Mobile Pop-up Modal / Drawer (Opens on tap without scrolling) */}
      {client && (
        <div className="wa-client-modal-backdrop mobile-only-modal" onClick={()=>setClientId('')}>
          <div className="wa-client-modal-sheet" onClick={e=>e.stopPropagation()}>
            <div className="wa-client-modal-header">
              <div className="wa-client-modal-title">
                <ContactAvatar name={client.name} avatar={client.avatar} className="wa-avatar-sm" />
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.phone}</small>
                </div>
              </div>
              <div className="wa-client-modal-actions">
                {client.conversations[0] && (
                  <button
                    type="button"
                    className="button primary wa-btn-chat"
                    onClick={() => {
                      setSelected(client.conversations[0].id);
                      setClientId('');
                      setTab('Conversaciones');
                    }}
                  >
                    <WhatsappLogo size={14} weight="fill" />
                    <span>Chat</span>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button wa-btn-close"
                  onClick={() => setClientId('')}
                  aria-label="Cerrar ficha"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="wa-client-modal-scroll">
              <CustomerProfile key={client.id} customer={client} onRefresh={refresh}/>
            </div>
          </div>
        </div>
      )}
    </div>}
  </section>;
}
