import {randomUUID,createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
const hash=value=>createHash('sha256').update(value).digest('hex');
const phoneOf=value=>{const text=String(value||'').replace(/[\s().-]/g,'');return /^\+[1-9]\d{7,14}$/.test(text)?text:null;};
const parse=value=>{try{return JSON.parse(value);}catch{return {};}};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validDate=value=>Number.isFinite(Date.parse(value||''));
const ranks={unknown:-1,pending:0,sent:1,delivered:2,read:3};
export const pipelineStages=[['received','Recibidos'],['awaiting','Esperando respuesta'],['confirmed','Cliente confirmó'],['preparing','Preparación'],['transit','En tránsito'],['delivery','En reparto'],['delivered','Entregados'],['issue','Incidencias'],['cancelled','Cancelados'],['expired','Vencidos']].map(([id,name])=>({id,name}));
export function remoteStage(order){
  if(order.status==='DELIVERED'||order.sub_status==='DELIVERED'||(order.status==='FINISH'&&order.sub_status==='PAID'))return 'delivered';
  if(['CANCELLED','REFUSED','REJECTED'].includes(order.sub_status))return 'cancelled';
  if(order.status==='ERROR'||['DELIVERY_ATTEMPTED','DELIVERY_EXCEPTION','LOST_DAMAGED','REFUSED_LOST_DAMAGED','REVIEW','TECHNICAL_ERROR'].includes(order.sub_status))return 'issue';
  if(order.sub_status==='OUT_FOR_DELIVERY')return 'delivery';
  if(order.status==='SHIPPING')return 'transit';
  if(['PROCESSING','CONFIRMED'].includes(order.status))return 'preparing';
  return 'received';
}
const localStage=state=>state==='EXPIRED'?'expired':state==='CUSTOMER_CANCELLED'?'cancelled':['MESSAGE_ERROR','MESSAGE_UNKNOWN','DROPEA_ERROR'].includes(state)?'issue':['CUSTOMER_CONFIRMED','CREATING','CREATE_PENDING','CONFIRMING','CONFIRM_PENDING','SENT_TO_DROPEA'].includes(state)?'confirmed':['WA_PENDING','WA_SENDING','WAITING_CONFIRMATION'].includes(state)?'awaiting':'received';
const localLabels={WA_PENDING:'WhatsApp en cola',WA_SENDING:'Enviando confirmación',WAITING_CONFIRMATION:'Esperando respuesta del cliente',CUSTOMER_CONFIRMED:'Cliente confirmó el pedido',CUSTOMER_CANCELLED:'Cliente canceló el pedido',EXPIRED:'Confirmación vencida',MESSAGE_ERROR:'Error de envío de WhatsApp',MESSAGE_UNKNOWN:'Revisar entrega del mensaje',CREATING:'Creando en Dropea',CREATE_PENDING:'Creación pendiente en Dropea',CONFIRMING:'Confirmando en Dropea',CONFIRM_PENDING:'Confirmación pendiente en Dropea',SENT_TO_DROPEA:'Confirmado en Dropea',DROPEA_ERROR:'Dropea requiere revisión'};

export function createWhatsAppInbox({db,clock=()=>new Date().toISOString()}){
  db.exec(`CREATE TABLE IF NOT EXISTS wa_customers(id TEXT PRIMARY KEY,phone TEXT UNIQUE NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wa_conversations(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,account TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'automatic',unread INTEGER NOT NULL DEFAULT 0,last_at TEXT NOT NULL,preview TEXT NOT NULL DEFAULT '',UNIQUE(customer_id,account));
    CREATE TABLE IF NOT EXISTS wa_messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,provider_key TEXT UNIQUE,provider_id TEXT,direction TEXT NOT NULL,origin TEXT NOT NULL,type TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,error TEXT,quoted_id TEXT,order_id TEXT,occurred_at TEXT NOT NULL,created_at TEXT NOT NULL,historical INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS wa_messages_thread ON wa_messages(conversation_id,occurred_at,id);
    CREATE TABLE IF NOT EXISTS wa_receipts(account TEXT NOT NULL,provider_id TEXT NOT NULL,status TEXT NOT NULL,occurred_at TEXT NOT NULL,PRIMARY KEY(account,provider_id,status));
    CREATE TABLE IF NOT EXISTS wa_orders(id TEXT PRIMARY KEY,local_id TEXT UNIQUE,scope TEXT,remote_id INTEGER,market TEXT NOT NULL,customer_id TEXT,name TEXT,phone TEXT,product TEXT NOT NULL,quantity INTEGER NOT NULL,amount REAL NOT NULL,currency TEXT NOT NULL,state TEXT NOT NULL,sub_state TEXT,stage TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL,confirmed_at TEXT,delivered_at TEXT,observed_at TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS wa_orders_remote ON wa_orders(scope,remote_id) WHERE remote_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS wa_timeline(id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,customer_id TEXT,conversation_id TEXT,order_id TEXT,message_id TEXT,kind TEXT NOT NULL,title TEXT NOT NULL,occurred_at TEXT NOT NULL,observed_at TEXT NOT NULL,source TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS wa_timeline_customer ON wa_timeline(customer_id,occurred_at);
    CREATE TABLE IF NOT EXISTS wa_preferences(id TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  try{db.exec('ALTER TABLE wa_customers ADD COLUMN avatar TEXT');}catch{}
  db.exec('CREATE TABLE IF NOT EXISTS wa_send_requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,message_id TEXT NOT NULL,text_hash TEXT NOT NULL)');
  db.prepare("UPDATE wa_messages SET status='unknown',error='El servidor reinició durante el envío; revisa el chat antes de reenviar.' WHERE status='pending' AND direction='out'").run();
  const bus=new EventEmitter();bus.setMaxListeners(100);let scheduled=false;
  const notify=()=>{if(!scheduled){scheduled=true;setImmediate(()=>{scheduled=false;bus.emit('change');});}};
  const pref=(id,fallback)=>db.prepare('SELECT value FROM wa_preferences WHERE id=?').get(id)?.value??fallback;
  const account=()=>pref('account','default');
  const customer=(phone,name='')=>{
    phone=phoneOf(phone);if(!phone)return null;
    let row=db.prepare('SELECT * FROM wa_customers WHERE phone=?').get(phone);
    if(!row){const id=randomUUID();db.prepare('INSERT INTO wa_customers(id,phone,name,created_at) VALUES (?,?,?,?)').run(id,phone,String(name||phone).slice(0,160),clock());row=db.prepare('SELECT * FROM wa_customers WHERE id=?').get(id);}
    else if(name&&row.name!==name){db.prepare('UPDATE wa_customers SET name=? WHERE id=?').run(String(name).slice(0,160),row.id);row={...row,name};}
    return row;
  };
  const conversation=(contact,channel=account())=>{
    let row=db.prepare('SELECT * FROM wa_conversations WHERE customer_id=? AND account=?').get(contact.id,channel);
    if(!row){const id=randomUUID();db.prepare('INSERT INTO wa_conversations(id,customer_id,account,last_at) VALUES (?,?,?,?)').run(id,contact.id,channel,clock());row=db.prepare('SELECT * FROM wa_conversations WHERE id=?').get(id);}
    return row;
  };
  const timeline=({key,customerId=null,conversationId=null,orderId=null,messageId=null,kind,title,at=clock(),source='crm',payload={}})=>{
    db.prepare('INSERT OR IGNORE INTO wa_timeline VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),key,customerId,conversationId,orderId,messageId,kind,title,validDate(at)?at:clock(),clock(),source,JSON.stringify(payload));notify();
  };
  function receipt({account:channel=account(),id,status,at=clock()}){
    if(!id||!['sent','delivered','read','failed'].includes(status))return;
    db.prepare('INSERT OR IGNORE INTO wa_receipts VALUES (?,?,?,?)').run(channel,id,status,validDate(at)?at:clock());
    const message=db.prepare('SELECT m.*,c.customer_id FROM wa_messages m JOIN wa_conversations c ON c.id=m.conversation_id WHERE m.provider_key=?').get(channel+':'+id);if(!message)return;
    timeline({key:`receipt:${channel}:${id}:${status}`,customerId:message.customer_id,conversationId:message.conversation_id,messageId:message.id,orderId:message.order_id,kind:'receipt',title:{sent:'Mensaje enviado',delivered:'Mensaje entregado en WhatsApp',read:'Mensaje leído en WhatsApp',failed:'WhatsApp informó un fallo'}[status],at,source:'whatsapp',payload:{status}});
    if((status==='failed'&&!['delivered','read'].includes(message.status))||(status!=='failed'&&(ranks[status]??-1)>(ranks[message.status]??-1)))db.prepare('UPDATE wa_messages SET status=?,error=? WHERE id=?').run(status,status==='failed'?'WhatsApp informó que el mensaje no pudo entregarse.':null,message.id);
    notify();
  }
  function incoming({phone,text='',id,name='',account:channel=account(),type='text',fromMe=false,quotedMessageId=null,messageAt,historical=false,status}){
    const contact=customer(phone,name);if(!contact||!id)return;
    const key=channel+':'+id,existing=db.prepare('SELECT id FROM wa_messages WHERE provider_key=?').get(key);if(existing){if(status)receipt({account:channel,id,status,at:messageAt});return existing.id;}
    const conv=conversation(contact,channel),at=validDate(messageAt)?messageAt:clock(),messageId=randomUUID();
    db.prepare('INSERT INTO wa_messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(messageId,conv.id,key,id,fromMe?'out':'in',fromMe?'phone':'customer',type,String(text||`[${type} recibido]`).slice(0,10000),fromMe?(status||'unknown'):'received',null,quotedMessageId,null,at,clock(),historical?1:0);
    db.prepare("UPDATE wa_conversations SET unread=unread+?,last_at=CASE WHEN last_at<? THEN ? ELSE last_at END,preview=CASE WHEN last_at<=? OR preview='' THEN ? ELSE preview END WHERE id=?").run(!fromMe&&!historical?1:0,at,at,at,String(text||`[${type}]`).slice(0,160),conv.id);
    notify();return messageId;
  }
  function localOrder(order,{baseline=false}={}){
    const c=parse(order.customer),contact=customer(order.phone,c.name),id='local:'+order.id;
    const existing=db.prepare('SELECT * FROM wa_orders WHERE local_id=?').get(order.id);
    // Once the remote order is observed, its logistics must not be overwritten by local retries.
    if(existing?.scope){db.prepare('UPDATE wa_orders SET error=? WHERE id=?').run(order.error||null,existing.id);notify();return existing.id;}
    const at=clock(),stage=localStage(order.state);
    db.prepare(`INSERT INTO wa_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id,state=excluded.state,stage=excluded.stage,error=excluded.error,confirmed_at=excluded.confirmed_at,observed_at=excluded.observed_at,payload=excluded.payload`).run(id,order.id,null,order.remote_id||null,order.market,contact?.id||null,c.name||order.phone,order.phone,order.product_name,order.quantity,order.unit_price*order.quantity,order.currency,order.state,null,stage,order.error||null,order.created_at,order.confirmed_at||null,null,at,JSON.stringify({local:true,source_id:order.source_id}));
    if(contact)conversation(contact);
    if(!existing||existing.state!==order.state)timeline({key:'local:'+order.id+':'+order.state+':'+(baseline?'baseline':at),customerId:contact?.id,orderId:id,kind:'order',title:baseline?'Pedido importado · '+(localLabels[order.state]||order.state):localLabels[order.state]||order.state,at:baseline?at:clock(),source:baseline?'baseline':'automation',payload:{from:existing?.state||null,to:order.state,baseline}});
    notify();return id;
  }
  function remoteOrder(scope,order,{eventId=null,eventAt=null,source='sync',baseline=false}={}){
    if(!Number.isSafeInteger(order?.id))return;
    const market=scope.split(':')[0],at=validDate(eventAt)?eventAt:validDate(order.updated_at)?order.updated_at:clock();
    let existing=db.prepare('SELECT * FROM wa_orders WHERE scope=? AND remote_id=?').get(scope,order.id);
    let local=null;
    if(!existing){
      if(typeof order.external_order_id==='string'&&order.external_order_id.startsWith('CRM-'))local=db.prepare('SELECT * FROM landing_orders WHERE id=? AND market=?').get(order.external_order_id.slice(4),market);
      if(!local)local=db.prepare('SELECT * FROM landing_orders WHERE remote_id=? AND market=?').get(order.id,market);
      if(local)existing=db.prepare('SELECT * FROM wa_orders WHERE local_id=?').get(local.id);
    }
    const a=order.shipping_address||{},contact=customer(a.phone_number||local?.phone,a.full_name||[a.first_name,a.last_name].filter(Boolean).join(' ')),id=existing?.id||'remote:'+hash(scope+':'+order.id);
    const changed=!existing||existing.state!==order.status||existing.sub_state!==(order.sub_status||null);
    if(eventId||changed)timeline({key:eventId?'dropea:'+scope+':'+eventId:'snapshot:'+scope+':'+order.id+':'+order.status+':'+order.sub_status+':'+at,customerId:contact?.id||existing?.customer_id,orderId:id,kind:'order',title:(baseline?'Estado importado de Dropea: ':source==='webhook'?'Dropea: ':'Estado observado en Dropea: ')+order.status+(order.sub_status?' · '+order.sub_status:''),at:baseline?clock():at,source:baseline?'baseline':source,payload:{eventId,from:existing?.state||null,to:order.status,subStatus:order.sub_status||null,observed:source!=='webhook',resource:order}});
    const storedPayload=existing?parse(existing.payload):{};
    const payload={...order,...(order.customer_reliability?{}:storedPayload.customer_reliability?{customer_reliability:storedPayload.customer_reliability}:{})};
    if(existing&&existing.scope&&Date.parse(at)<Date.parse(existing.observed_at)){if(order.customer_reliability){db.prepare('UPDATE wa_orders SET payload=? WHERE id=?').run(JSON.stringify({...storedPayload,customer_reliability:order.customer_reliability}),id);notify();}return id;}
    const contactId=contact?.id||existing?.customer_id||null;
    db.prepare(`INSERT INTO wa_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,remote_id=excluded.remote_id,customer_id=excluded.customer_id,name=excluded.name,phone=excluded.phone,product=excluded.product,quantity=excluded.quantity,amount=excluded.amount,currency=excluded.currency,state=excluded.state,sub_state=excluded.sub_state,stage=excluded.stage,error=excluded.error,confirmed_at=excluded.confirmed_at,delivered_at=excluded.delivered_at,observed_at=excluded.observed_at,payload=excluded.payload`).run(id,existing?.local_id||local?.id||null,scope,order.id,market,contactId,contact?.name||existing?.name||'Sin nombre',contact?.phone||existing?.phone||null,order.line_items?.map(item=>item.product_name||'Producto').join(' · ')||existing?.product||'Producto',order.line_items?.reduce((sum,item)=>sum+(item.quantity||0),0)||existing?.quantity||1,Number(order.total_amount)||0,order.currency||existing?.currency||(market==='CL'?'CLP':market==='MX'?'MXN':'EUR'),order.status,order.sub_status||null,remoteStage(order),null,existing?.created_at||order.created_at||at,order.confirmed_at||existing?.confirmed_at||null,order.delivered_at||existing?.delivered_at||null,at,JSON.stringify(payload));
    if(contact)conversation(contact);notify();return id;
  }
  const orderRows=(customerId=null,market=null)=>db.prepare('SELECT * FROM wa_orders WHERE (? IS NULL OR customer_id=?) AND (? IS NULL OR market=?) ORDER BY created_at DESC LIMIT 1000').all(customerId,customerId,market,market).map(row=>({...row,payload:undefined,hasReliability:!!parse(row.payload).customer_reliability}));
  function customerDetail(id){
    const contact=db.prepare('SELECT * FROM wa_customers WHERE id=?').get(id);if(!contact)throw fail('Cliente no encontrado.',404);
    const raw=db.prepare('SELECT * FROM wa_orders WHERE customer_id=? ORDER BY created_at DESC').all(id),delivered=raw.filter(row=>row.stage==='delivered'),failed=raw.filter(row=>['REFUSED','REJECTED','LOST_DAMAGED','REFUSED_LOST_DAMAGED'].includes(row.sub_state)),completed=delivered.length+failed.length;
    const duration=delivered.filter(row=>validDate(row.delivered_at)&&validDate(row.created_at)&&Date.parse(row.delivered_at)>=Date.parse(row.created_at)).map(row=>(Date.parse(row.delivered_at)-Date.parse(row.created_at))/86400000);
    const external=raw.map(row=>({market:row.market,at:row.observed_at,value:parse(row.payload).customer_reliability})).filter(row=>row.value);
    return {...contact,orders:orderRows(id),conversations:db.prepare('SELECT id,account,mode,last_at FROM wa_conversations WHERE customer_id=? ORDER BY last_at DESC').all(id),stats:{total:raw.length,delivered:delivered.length,failed:failed.length,completed,deliveryRate:completed?delivered.length/completed*100:null,averageDeliveryDays:duration.length?duration.reduce((a,b)=>a+b,0)/duration.length:null,timedDeliveries:duration.length,firstAttemptRate:null},reliability:external,timeline:db.prepare('SELECT id,order_id,message_id,kind,title,occurred_at,observed_at,source FROM wa_timeline WHERE customer_id=? ORDER BY occurred_at DESC LIMIT 100').all(id)};
  }
  const getConversation=id=>{const conv=db.prepare('SELECT v.*,c.name,c.phone FROM wa_conversations v JOIN wa_customers c ON c.id=v.customer_id WHERE v.id=?').get(id);if(!conv)throw fail('Conversación no encontrada.',404);return conv;};
  return {
    bus,account,customer,localOrder,remoteOrder,incoming,receipt,
    settings(){return {automatic:pref('automatic','true')==='true',account:account()};},
    setAutomatic(value){if(typeof value!=='boolean')throw fail('Estado inválido.');db.prepare("INSERT INTO wa_preferences VALUES ('automatic',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").run(String(value));notify();},
    setAccount(value){if(!value)return;db.prepare("UPDATE wa_conversations SET account=? WHERE account='default' AND NOT EXISTS (SELECT 1 FROM wa_conversations other WHERE other.customer_id=wa_conversations.customer_id AND other.account=?)").run(value,value);db.prepare("INSERT INTO wa_preferences VALUES ('account',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").run(value);notify();},
    canAutomate(phone){if(pref('automatic','true')!=='true')return false;return !db.prepare("SELECT 1 FROM wa_conversations v JOIN wa_customers c ON c.id=v.customer_id WHERE c.phone=? AND v.account=? AND v.mode='human'").get(phone,account());},
    beginSend({phone,text,account:channel=account(),origin='automatic',orderId=null,requestId=null}){
      const contact=customer(phone);if(!contact)throw fail('Teléfono inválido.');const conv=conversation(contact,channel),id=randomUUID(),at=clock();
      db.prepare('INSERT INTO wa_messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,conv.id,null,null,'out',origin,'text',String(text).slice(0,10000),'pending',null,null,orderId?'local:'+orderId:null,at,at,0);
      if(requestId)db.prepare('INSERT INTO wa_send_requests VALUES (?,?,?,?)').run(conv.id+':'+requestId,conv.id,id,hash(text));
      db.prepare('UPDATE wa_conversations SET last_at=?,preview=? WHERE id=?').run(at,String(text).slice(0,160),conv.id);notify();return id;
    },
    sent(id,{id:providerId,account:channel=account()}){
      const existing=db.prepare('SELECT * FROM wa_messages WHERE provider_key=?').get(channel+':'+providerId);
      if(existing&&existing.id!==id){db.prepare('UPDATE wa_messages SET provider_key=NULL WHERE id=?').run(existing.id);db.prepare('UPDATE wa_timeline SET message_id=? WHERE message_id=?').run(id,existing.id);db.prepare('DELETE FROM wa_messages WHERE id=?').run(existing.id);}
      db.prepare("UPDATE wa_messages SET provider_key=?,provider_id=?,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'sent' END,error=NULL WHERE id=?").run(channel+':'+providerId,providerId,id);
      receipt({account:channel,id:providerId,status:'sent'});for(const row of db.prepare('SELECT * FROM wa_receipts WHERE account=? AND provider_id=?').all(channel,providerId))receipt({account:channel,id:providerId,status:row.status,at:row.occurred_at});notify();
    },
    sendFailed(id){db.prepare("UPDATE wa_messages SET status='failed',error='No se pudo verificar el envío. Revisa la conexión y el chat antes de reenviar.' WHERE id=? AND status NOT IN ('read','delivered')").run(id);notify();},
    conversations({q='',filter='all'}={}){const rows=db.prepare(`SELECT v.*,c.name,c.phone,c.avatar,(SELECT COUNT(*) FROM wa_orders o WHERE o.customer_id=c.id) AS orders FROM wa_conversations v JOIN wa_customers c ON c.id=v.customer_id WHERE v.account=? ORDER BY v.last_at DESC LIMIT 500`).all(account());return rows.filter(row=>(!q||(row.name+' '+row.phone+' '+row.preview).toLowerCase().includes(q.toLowerCase()))&&(filter==='all'||filter==='unread'&&row.unread>0||filter==='human'&&row.mode==='human'));},
    thread(id,before){const conv=getConversation(id);const cutoff=before?db.prepare('SELECT rowid FROM wa_messages WHERE id=? AND conversation_id=?').get(before,id)?.rowid:null;const messages=db.prepare('SELECT *,rowid AS position FROM wa_messages WHERE conversation_id=? AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT 100').all(id,cutoff,cutoff);return {conversation:conv,messages:messages.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.position-b.position),hasMore:messages.length===100,nextBefore:messages.reduce((oldest,m)=>!oldest||m.position<oldest.position?m:oldest,null)?.id||null,customer:customerDetail(conv.customer_id)};},
    getConversation,customerDetail,
    setCustomerAvatar(phone,avatarUrl){phone=phoneOf(phone);if(!phone||!avatarUrl)return;try{db.prepare('UPDATE wa_customers SET avatar=? WHERE phone=?').run(avatarUrl,phone);notify();}catch{}},
    getCustomerAvatar(phone){phone=phoneOf(phone);if(!phone)return null;try{return db.prepare('SELECT avatar FROM wa_customers WHERE phone=?').get(phone)?.avatar||null;}catch{return null;}},
    previousSend(id,requestId,text){const row=db.prepare('SELECT r.*,m.status FROM wa_send_requests r JOIN wa_messages m ON m.id=r.message_id WHERE r.id=?').get(id+':'+requestId);if(row&&row.text_hash!==hash(text))throw fail('La referencia ya corresponde a otro mensaje.',409);return row;},
    read(id){getConversation(id);if(db.prepare('UPDATE wa_conversations SET unread=0 WHERE id=? AND unread>0').run(id).changes)notify();},
    mode(id,mode){if(!['human','automatic'].includes(mode))throw fail('Modo inválido.');const conv=getConversation(id);db.prepare('UPDATE wa_conversations SET mode=? WHERE id=?').run(mode,id);timeline({key:randomUUID(),customerId:conv.customer_id,conversationId:id,kind:'attention',title:mode==='human'?'Atención humana activada; confirmación automática pausada para este chat':'Confirmación automática reanudada para este chat'});},
    note(id,text){const conv=getConversation(id);if(typeof text!=='string'||!text.trim()||text.length>2000)throw fail('Escribe una nota de hasta 2000 caracteres.');timeline({key:randomUUID(),customerId:conv.customer_id,conversationId:id,kind:'note',title:text.trim(),source:'operator'});},
    pipeline(market=null){return {stages:pipelineStages,orders:orderRows(null,market)};},
    customers(q=''){
      const rows=db.prepare(`SELECT c.*,COUNT(o.id) AS orders,
        COALESCE(SUM(o.stage='delivered'),0) AS delivered,
        SUM(CASE WHEN o.stage='delivered' OR o.sub_state IN ('REFUSED','REJECTED','LOST_DAMAGED','REFUSED_LOST_DAMAGED') THEN 1 ELSE 0 END) AS completed,
        AVG(CASE WHEN o.stage='delivered' AND julianday(o.delivered_at)>=julianday(o.created_at) THEN julianday(o.delivered_at)-julianday(o.created_at) END) AS averageDeliveryDays
        FROM wa_customers c LEFT JOIN wa_orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500`).all();
      return rows.filter(row=>!q||(row.name+' '+row.phone).toLowerCase().includes(q.toLowerCase())).map(row=>({...row,deliveryRate:row.completed?row.delivered/row.completed*100:null}));
    },
    linkInbound(providerId,orderId){const order=db.prepare('SELECT id,customer_id FROM wa_orders WHERE local_id=?').get(orderId);if(order)db.prepare('UPDATE wa_messages SET order_id=? WHERE direction=\'in\' AND provider_id=? AND conversation_id IN (SELECT id FROM wa_conversations WHERE customer_id=?)').run(order.id,providerId,order.customer_id);}
  };
}
