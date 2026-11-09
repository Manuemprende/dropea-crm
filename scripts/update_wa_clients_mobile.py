import re

# 1. Update src/WhatsAppInbox.tsx
with open('src/WhatsAppInbox.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add X to imports
code = code.replace(
    "import {WhatsappLogo,GearSix,PaperPlaneRight,Check,Checks,MagnifyingGlass,ChatsCircle,UsersThree,Kanban,UserCircle,ArrowLeft} from '@phosphor-icons/react';",
    "import {WhatsappLogo,GearSix,PaperPlaneRight,Check,Checks,MagnifyingGlass,ChatsCircle,UsersThree,Kanban,UserCircle,ArrowLeft,X} from '@phosphor-icons/react';"
)

old_clients_tab = """    {tab==='Clientes'&&<div className="wa-clients-layout"><section className="wa-clients"><div className="wa-section-tools"><div><h2>Clientes</h2><p>Compras, porcentaje de entrega y tiempo de recepción por cliente.</p></div><label className="wa-search"><MagnifyingGlass size={17}/><input aria-label="Buscar cliente" placeholder="Nombre o teléfono" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="wa-clients-guide"><strong>Evaluación de clientes</strong><span>Selecciona «Ver ficha» para revisar pedidos, entregas, tiempo promedio y trazabilidad. Sin entregas finalizadas mostramos —.</span></div><div className="wa-client-table"><table><thead><tr><th>Cliente</th><th>Pedidos</th><th>Entregados</th><th>% entrega</th><th>Tiempo medio</th><th/></tr></thead><tbody>{clients.filter(c=>matches(c.name+' '+c.phone)).map(c=><tr key={c.id} className={clientId===c.id?'selected':''}><td><strong>{c.name}</strong><small>{c.phone}</small></td><td>{c.orders}</td><td>{c.delivered||0}</td><td><strong>{c.deliveryRate==null?'—':c.deliveryRate.toFixed(0)+'%'}</strong><small>{c.completed??0} finalizados</small></td><td>{c.averageDeliveryDays==null?'—':c.averageDeliveryDays.toFixed(1)+' días'}</td><td><button className="text-link" onClick={()=>setClientId(c.id)}>Ver ficha</button></td></tr>)}</tbody></table></div>{!clients.length&&<div className="wa-empty"><UsersThree size={40}/><h3>Conoce a tus clientes</h3><p>Sus fichas se crean al recibir pedidos o mensajes.</p></div>}</section>{client?<aside className="wa-client-detail"><div className="wa-client-actions"><button className="text-link" onClick={()=>setClientId('')}>Cerrar ficha</button>{client.conversations[0]&&<button className="button" onClick={()=>{setSelected(client.conversations[0].id);setTab('Conversaciones');}}>Ver conversación</button>}</div><CustomerProfile key={client.id} customer={client} onRefresh={refresh}/></aside>:<div className="wa-empty wa-client-placeholder"><UserCircle size={48}/><p>Selecciona un cliente para ver su historial.</p></div>}</div>}"""

new_clients_tab = """    {tab==='Clientes'&&<div className="wa-clients-layout">
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
    </div>}"""

assert old_clients_tab in code, 'old_clients_tab not found in src/WhatsAppInbox.tsx'
code = code.replace(old_clients_tab, new_clients_tab)

with open('src/WhatsAppInbox.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/WhatsAppInbox.tsx')

# 2. Append mobile styles to src/whatsapp-inbox.css
wa_mobile_css = """
/* Mobile Client Cards & Pop-up Modal */
.wa-client-mobile-cards {
  display: none;
}
.mobile-only-modal {
  display: none;
}

@media (max-width: 760px) {
  .desktop-only-table,
  .desktop-only-detail {
    display: none !important;
  }
  .wa-client-mobile-cards {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 0 14px 14px !important;
  }
  .wa-client-m-card {
    background: #090f1d !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 10px !important;
    padding: 11px 13px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
  }
  .wa-client-m-card:active {
    background: #0f182c !important;
    border-color: #38bdf8 !important;
  }
  .wa-client-m-top {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }
  .wa-client-m-info {
    flex: 1 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }
  .wa-client-m-info strong {
    font-size: 0.86rem !important;
    color: #f1f5f9 !important;
  }
  .wa-client-m-info small {
    font-size: 0.72rem !important;
    color: #94a3b8 !important;
  }
  .wa-client-m-rate {
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    color: #38bdf8 !important;
    background: rgba(56, 189, 248, 0.12) !important;
    padding: 0.15rem 0.5rem !important;
    border-radius: 9999px !important;
    border: 1px solid rgba(56, 189, 248, 0.25) !important;
  }
  .wa-client-m-bottom {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding-top: 6px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
    font-size: 0.72rem !important;
    color: #64748b !important;
  }
  .wa-client-m-btn {
    color: #38bdf8 !important;
    font-weight: 600 !important;
  }

  /* Pop-up Modal Sheet */
  .mobile-only-modal {
    display: flex !important;
    position: fixed !important;
    inset: 0 !important;
    background: rgba(4, 9, 20, 0.75) !important;
    backdrop-filter: blur(5px) !important;
    z-index: 99999 !important;
    align-items: flex-end !important;
    justify-content: center !important;
  }
  .wa-client-modal-sheet {
    background: #090f1d !important;
    border: 1px solid rgba(56, 189, 248, 0.25) !important;
    border-radius: 18px 18px 0 0 !important;
    width: 100% !important;
    max-width: 600px !important;
    max-height: 85dvh !important;
    display: flex !important;
    flex-direction: column !important;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6) !important;
    animation: sheetSlideUp 0.25s ease-out !important;
  }
  @keyframes sheetSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .wa-client-modal-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 14px 16px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    background: #0c1426 !important;
    border-radius: 18px 18px 0 0 !important;
  }
  .wa-client-modal-title {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }
  .wa-client-modal-title strong {
    font-size: 0.95rem !important;
    color: #ffffff !important;
    display: block !important;
  }
  .wa-client-modal-title small {
    font-size: 0.75rem !important;
    color: #94a3b8 !important;
  }
  .wa-client-modal-actions {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }
  .wa-btn-chat {
    font-size: 0.75rem !important;
    padding: 6px 10px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
  }
  .wa-btn-close {
    color: #cbd5e1 !important;
    padding: 4px !important;
  }
  .wa-client-modal-scroll {
    overflow-y: auto !important;
    padding: 14px 16px 24px !important;
    flex: 1 !important;
  }
}
"""

with open('src/whatsapp-inbox.css', 'r', encoding='utf-8') as f:
    wa_css = f.read()

if 'wa-client-modal-sheet' not in wa_css:
    with open('src/whatsapp-inbox.css', 'a', encoding='utf-8') as f:
        f.write(wa_mobile_css)
    print('Updated src/whatsapp-inbox.css')
