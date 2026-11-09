export function installWhatsAppInbox(app,{inbox,whatsapp,worker,connections,requestDropea,scope}){
  const route=handler=>(req,res,next)=>Promise.resolve().then(()=>handler(req,res)).catch(next);
  app.get('/api/whatsapp/conversations',route(async(req,res)=>{
    const list=inbox.conversations({q:String(req.query.q||'').slice(0,160),filter:String(req.query.filter||'all')});
    if(whatsapp.connected&&whatsapp.connected()){
      for(const c of list){
        if(!c.avatar&&c.phone){
          whatsapp.getProfilePictureUrl?.(c.phone).then(url=>{if(url)inbox.setCustomerAvatar(c.phone,url);}).catch(()=>{});
        }
      }
    }
    res.json(list);
  }));
  app.get('/api/whatsapp/avatar/:phone',route(async(req,res)=>{
    const phone=req.params.phone;
    let url=inbox.getCustomerAvatar?.(phone);
    if(!url&&whatsapp.connected&&whatsapp.connected()){
      url=await whatsapp.getProfilePictureUrl?.(phone).catch(()=>null);
      if(url)inbox.setCustomerAvatar(phone,url);
    }
    if(url)return res.redirect(url);
    return res.status(404).send('No avatar');
  }));
  app.get('/api/whatsapp/conversations/:id',route((req,res)=>res.json(inbox.thread(req.params.id,req.query.before))));
  app.post('/api/whatsapp/conversations/:id/read',route((req,res)=>{inbox.read(req.params.id);res.json({read:true});}));
  app.patch('/api/whatsapp/conversations/:id',route((req,res)=>{inbox.mode(req.params.id,req.body.mode);worker.kick();res.json({updated:true});}));
  app.post('/api/whatsapp/conversations/:id/notes',route((req,res)=>{inbox.note(req.params.id,req.body.text);res.status(201).json({saved:true});}));
  app.post('/api/whatsapp/conversations/:id/messages',route(async(req,res)=>{
    const conv=inbox.getConversation(req.params.id),{text,request_id:requestId}=req.body||{};
    if(typeof text!=='string'||!text.trim()||text.length>4096||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))return res.status(400).json({error:'Escribe un mensaje de hasta 4096 caracteres y una referencia válida.'});
    const previous=inbox.previousSend(conv.id,requestId,text.trim());if(previous)return res.json({duplicate:true,id:previous.message_id,status:previous.status});
    if(!whatsapp.connected())return res.status(409).json({error:'Vincula WhatsApp en Configuración para responder.'});
    if(conv.account!==inbox.account())return res.status(409).json({error:'Esta conversación pertenece a otro número vinculado.'});
    await whatsapp.send(conv.phone,text.trim(),{origin:'operator',requestId});res.status(201).json({sent:true});
  }));
  app.get('/api/whatsapp/pipeline',route((req,res)=>res.json(inbox.pipeline(['CL','ES','IT','PT','MX'].includes(req.query.market)?req.query.market:null))));
  app.get('/api/whatsapp/customers',route((req,res)=>res.json(inbox.customers(String(req.query.q||'').slice(0,160)))));
  app.get('/api/whatsapp/customers/:id',route((req,res)=>res.json(inbox.customerDetail(req.params.id))));
  app.post('/api/whatsapp/customers/:id/reliability',route(async(req,res)=>{
    const customer=inbox.customerDetail(req.params.id),order=customer.orders.find(row=>row.remote_id&&row.scope&&scope(connections.load(row.market))===row.scope);
    if(!order)return res.status(409).json({error:'Este cliente aún no tiene un pedido de Dropea consultable con las cuentas conectadas.'});
    const config=connections.load(order.market),remote=await requestDropea(config,`orders/${order.remote_id}?include=reliability`);
    inbox.remoteOrder(order.scope,remote,{source:'sync'});res.json(inbox.customerDetail(req.params.id));
  }));
  app.patch('/api/whatsapp/settings',route((req,res)=>{inbox.setAutomatic(req.body.automatic);worker.kick();res.json(inbox.settings());}));
  app.get('/api/whatsapp/events',(req,res)=>{
    res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const update=()=>res.write(`event: changed\ndata: ${JSON.stringify({at:Date.now()})}\n\n`);update();inbox.bus.on('change',update);
    const timer=setInterval(()=>res.write(': heartbeat\n\n'),25000);timer.unref();req.on('close',()=>{clearInterval(timer);inbox.bus.off('change',update);});
  });
}
