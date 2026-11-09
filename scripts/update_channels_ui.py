with open('src/LandingChannels.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update imports
if 'ShieldCheck' not in code:
    code = code.replace("import { WhatsappLogo, QrCode, CheckCircle, ArrowRight, ArrowClockwise, Key, Truck } from '@phosphor-icons/react';",
                        "import { WhatsappLogo, QrCode, CheckCircle, ArrowRight, ArrowClockwise, Key, Truck, ShieldCheck, PaperPlaneRight, Warning } from '@phosphor-icons/react';")

# 2. Add Meta state and loader
old_state = """  const [metaConfig,setMetaConfig]=useState({token:'',phoneId:'',wabaId:''});
  const [metaSaved,setMetaSaved]=useState(false);
  const [previewMode,setPreviewMode]=useState<'variables'|'example'>('variables');"""

new_state = """  const [metaConfig,setMetaConfig]=useState({token:'',phoneId:'',wabaId:''});
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
  }"""

if old_state in code:
    code = code.replace(old_state, new_state)

# 3. Update the Meta section
old_meta_panel = """          <form className="channel-form" onSubmit={e=>{e.preventDefault();setMetaSaved(true);}}>
            <label>
              Token de Acceso Permanente (System User Token)
              <input type="password" placeholder="EAAB..." value={metaConfig.token} onChange={e=>setMetaConfig({...metaConfig,token:e.target.value})}/>
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
              <button type="submit" className="button primary"><Key size={16}/>Guardar credenciales API</button>
              <button type="button" className="button" onClick={()=>setMethod('qr')}><QrCode size={16}/>Volver a Conexión por QR</button>
            </div>
            {metaSaved&&<p style={{color:'#4ade80',fontSize:'12px',marginTop:'8px'}}>✔ Credenciales de Meta Cloud API almacenadas. (Para confirmación directa de landings recomendamos mantener activo el método QR).</p>}
          </form>"""

new_meta_panel = """          {metaDetails?.configured ? (
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
          )}"""

if old_meta_panel in code:
    code = code.replace(old_meta_panel, new_meta_panel)

with open('src/LandingChannels.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/LandingChannels.tsx successfully')
