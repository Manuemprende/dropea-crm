import makeWASocket, { initAuthCreds, BufferJSON, proto, DisconnectReason, normalizeMessageContent } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { encryptConnection, decryptConnection } from './credentials.js';

export function encryptedAuth(db, encryptionKey) {
  db.exec('CREATE TABLE IF NOT EXISTS whatsapp_auth (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const read=id=>{const row=db.prepare('SELECT value FROM whatsapp_auth WHERE id=?').get(id);return row?JSON.parse(decryptConnection(row.value,encryptionKey).json,BufferJSON.reviver):null;};
  const write=(id,value)=>db.prepare('INSERT INTO whatsapp_auth VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,encryptConnection({json:JSON.stringify(value,BufferJSON.replacer)},encryptionKey));
  const creds=read('creds')||initAuthCreds();
  return {state:{creds,keys:{
    async get(type,ids){return Object.fromEntries(ids.map(id=>{let value=read(`${type}:${id}`);if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);return [id,value];}));},
    async set(data){db.exec('BEGIN IMMEDIATE');try{for(const [type,items] of Object.entries(data))for(const [id,value] of Object.entries(items)){if(value)write(`${type}:${id}`,value);else db.prepare('DELETE FROM whatsapp_auth WHERE id=?').run(`${type}:${id}`);}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
  }},save:()=>write('creds',creds),clear:()=>db.exec('DELETE FROM whatsapp_auth')};
}

export function createWhatsApp({db,encryptionKey,onMessage,onPersist=()=>{},onReceipt=()=>{},onAccount=()=>{},onSendStart=()=>null,onSent=()=>{},onSendFailure=()=>{},socketFactory=makeWASocket}) {
  let socket=null,auth=null,stopped=false,timer=null,generation=0,retries=0;
  let status={state:'disconnected',qr:null,phone:null,error:null};
  if(encryptionKey)auth=encryptedAuth(db,encryptionKey);
  async function connect(){
    if(!encryptionKey)throw Object.assign(new Error('Configura el cifrado del servidor antes de vincular WhatsApp.'),{status:409});
    if(socket||status.state==='connecting')return;
    stopped=false;clearTimeout(timer);const epoch=++generation;
    auth=encryptedAuth(db,encryptionKey);status={state:'connecting',qr:null,phone:null,error:null};
    try {
      const client=socketFactory({auth:auth.state,logger:pino({level:'silent'}),browser:['CRM Dropea','Chrome','1.0.0'],markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>true});
      socket=client;
      client.ev.on('creds.update',()=>{if(epoch===generation)auth.save();});
      client.ev.on('connection.update',async update=>{
        if(epoch!==generation)return;
        if(update.qr){const qr=await QRCode.toDataURL(update.qr,{width:320,margin:2});if(epoch===generation)status={state:'qr',qr,phone:null,error:null};}
        if(update.connection==='open'){retries=0;status={state:'connected',qr:null,phone:client.user?.id?.split(':')[0]?.split('@')[0]||null,error:null};onAccount(status.phone);}
        if(update.connection==='close'){
          socket=null;const code=update.lastDisconnect?.error?.output?.statusCode;
          const terminal=[DisconnectReason.loggedOut,DisconnectReason.badSession,DisconnectReason.connectionReplaced,DisconnectReason.forbidden].includes(code);
          if(terminal)auth.clear();
          status={state:'disconnected',qr:null,phone:null,error:terminal?'WhatsApp se desvinculó. Vuelve a conectar con un QR.':'Conexión interrumpida. Se intentará recuperar automáticamente.'};
          if(!stopped&&!terminal&&retries++<8){timer=setTimeout(()=>connect().catch(()=>{}),Math.min(30000,2000*retries));timer.unref();}
        }
      });
      const channel=()=>client.user?.id?.split(':')[0]?.split('@')[0]||'default';
      const messageStatus=code=>({0:'failed',1:'pending',2:'sent',3:'delivered',4:'read',5:'read'})[Number(code)];
      const date=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null;};
      async function ingest(messages,historical){
        if(epoch!==generation)return;
        for(const item of messages){
          if(!item.key.id||item.key.remoteJid?.endsWith('@g.us')||item.key.remoteJid==='status@broadcast'||item.key.remoteJid?.endsWith('@broadcast'))continue;
          const content=normalizeMessageContent(item.message);
          if(!content)continue;
          const kind=content.audioMessage?'audio':content.imageMessage?'image':content.videoMessage?'video':content.documentMessage?'document':content.stickerMessage?'sticker':content.locationMessage?'location':'text';
          const text=content.conversation||content.extendedTextMessage?.text||content.imageMessage?.caption||content.videoMessage?.caption||content.documentMessage?.fileName||'';
          if(kind==='text'&&!text)continue;
          let jid=[item.key.remoteJid,item.key.remoteJidAlt].find(x=>x?.endsWith('@s.whatsapp.net'));
          try {
            if(!jid&&item.key.remoteJid?.endsWith('@lid'))jid=await client.signalRepository?.lidMapping?.getPNForLID(item.key.remoteJid);
            if(jid?.endsWith('@s.whatsapp.net')){
              if(!item.key.fromMe && !historical && typeof client.readMessages === 'function'){
                client.readMessages([item.key]).catch(()=>{});
              }
              const message={phone:'+'+jid.split('@')[0],text,messageId:jid+':'+item.key.id,quotedMessageId:content.extendedTextMessage?.contextInfo?.stanzaId||content.imageMessage?.contextInfo?.stanzaId||null,messageAt:date(item.messageTimestamp),rawKey:item.key};
              onPersist({...message,id:item.key.id,name:item.key.fromMe?'':item.pushName||'',account:channel(),type:kind,fromMe:!!item.key.fromMe,historical,status:messageStatus(item.status)});
              if(!item.key.fromMe&&!historical&&kind==='text')onMessage(message);
            }
          }catch{/* A message without a verified phone identity cannot confirm an order. */}
        }
      }
      client.ev.on('messages.upsert',({messages,type})=>{void ingest(messages,type!=='notify');});
      client.ev.on('messaging-history.set',({messages})=>{void ingest(messages||[],true);});
      client.ev.on('messages.update',updates=>{if(epoch!==generation)return;for(const {key,update} of updates){const state=messageStatus(update.status);if(key.id&&state&&key.fromMe!==false)onReceipt({account:channel(),id:key.id,status:state});}});
      client.ev.on('message-receipt.update',updates=>{if(epoch!==generation)return;for(const {key,receipt} of updates){const state=receipt.readTimestamp||receipt.playedTimestamp?'read':receipt.receiptTimestamp?'delivered':null;if(state&&key.id)onReceipt({account:channel(),id:key.id,status:state,at:date(receipt.readTimestamp||receipt.playedTimestamp||receipt.receiptTimestamp)});}});
    }catch{socket=null;status={state:'disconnected',qr:null,phone:null,error:'No se pudo iniciar WhatsApp. Vuelve a intentar.'};}
  }
  return {
    status:()=>({...status}),connected:()=>status.state==='connected',connect,
    async disconnect(){stopped=true;++generation;clearTimeout(timer);const client=socket;socket=null;status={state:'disconnected',qr:null,phone:null,error:null};try{await client?.logout();}finally{client?.end(undefined);auth?.clear();}},
    async send(phone,text,context={}){const account=status.phone||undefined;const localId=onSendStart({phone,text,...context,...(account?{account}:{})});try{if(status.state!=='connected'||!socket)throw new Error('WhatsApp desconectado.');const jid=phone.slice(1)+'@s.whatsapp.net';const found=await socket.onWhatsApp(jid);if(!found?.some(item=>item.exists))throw new Error('Número sin WhatsApp.');const sent=await socket.sendMessage(jid,{text});if(!sent?.key?.id)throw new Error('Entrega no confirmada.');onSent(localId,{id:sent.key.id,...(account?{account}:{})});return {id:sent.key.id};}catch(error){onSendFailure(localId);throw error;}},
    async markRead(keys){
      if(!socket||status.state!=='connected'||!keys)return;
      try{
        if(typeof socket.readMessages==='function'){
          await socket.readMessages(Array.isArray(keys)?keys:[keys]);
        }
      }catch{}
    },
    async sendPresence(phone, presence = 'composing'){
      if(!socket||status.state!=='connected'||!phone)return;
      try{
        const clean = String(phone).replace(/\D/g,'');
        const jid = clean + '@s.whatsapp.net';
        if(typeof socket.sendPresenceUpdate==='function'){
          await socket.sendPresenceUpdate(presence, jid);
        }
      }catch{}
    },
    async getProfilePictureUrl(phone){if(status.state!=='connected'||!socket)return null;try{const clean=String(phone).replace(/\D/g,'');const jid=clean+'@s.whatsapp.net';const url=await socket.profilePictureUrl(jid,'preview').catch(()=>null);return url||null;}catch{return null;}},
    async resume(){if(auth?.state.creds.registered||auth?.state.creds.me)await connect();}
  };
}
