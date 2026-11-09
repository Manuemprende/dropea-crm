# 1. Update src/OrdersView.tsx
with open('src/OrdersView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Update search placeholder to be cleaner
code = code.replace(
    'placeholder="Buscar por #ID, cliente, teléfono, dirección o producto..."',
    'placeholder="Buscar por #ID, cliente, producto..."'
)

# Wrap table in desktop-table-view and add mobile-cards-view
old_table_block = """    <div className="orders-table-container">
      <table className="modern-orders-table">"""

new_table_block = """    <div className="orders-table-container">
      {/* Desktop Table View */}
      <div className="desktop-table-view">
        <table className="modern-orders-table">"""

assert old_table_block in code, 'old_table_block not found'
code = code.replace(old_table_block, new_table_block)

old_table_end = """      </table>
    </div>
  );
}"""

mobile_cards_code = """      </table>
      </div>

      {/* Mobile Touch Cards View */}
      <div className="mobile-cards-view">
        {orders.map((o) => {
          const clientName =
            o.shipping_address?.full_name ||
            [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ') ||
            'Cliente';
          const clientPhone = o.shipping_address?.phone_number || '';
          const score = getCustomerScore(dataset, { phone: clientPhone, name: clientName });
          const streetAddress = o.shipping_address?.address_line_1 || 'Dirección por confirmar';
          const city = o.shipping_address?.city || 'Santiago';
          const carrier = o.carrier || o.shipping_company || 'Blue Express';
          const activeTz = marketTimezones[market || 'CL'] || 'America/Santiago';
          const dateStr = new Date(o.created_at).toLocaleDateString('es-CL', {
            timeZone: activeTz,
            day: '2-digit',
            month: 'short'
          });
          const timeStr = new Date(o.created_at).toLocaleTimeString('es-CL', {
            timeZone: activeTz,
            hour: '2-digit',
            minute: '2-digit'
          });
          const landingInfo = o.landing_state ? landingStateLabels[o.landing_state] : null;
          const firstLine = o.line_items?.[0];
          const prodTitle = firstLine ? `${firstLine.product_name || firstLine.title || 'Producto'} (${firstLine.quantity || 1})` : '1 producto';

          return (
            <div
              key={o.raw_landing_id || o.id}
              className="order-mobile-card"
              onClick={() => handleTrack(o)}
            >
              <div className="order-card-top">
                <span className={`order-id-pill ${o.isLanding ? 'landing-pill' : ''}`}>
                  {o.isLanding ? <WhatsappLogo size={12} weight="fill" /> : <Truck size={12} weight="bold" />}
                  {o.order_code || `#${o.id}`}
                </span>
                <span className="order-date-text">{dateStr} · {timeStr}</span>
                {o.isLanding ? (
                  <span className={`badge ${landingInfo?.badgeClass || 'state-pending'}`} style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}>
                    {landingInfo?.label || o.status}
                  </span>
                ) : (
                  <span className="badge state-transit" style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}>
                    {group(o)}
                  </span>
                )}
              </div>

              <div className="order-card-client-row">
                <div className="order-card-client-info">
                  <strong className="order-card-client-name">{clientName}</strong>
                  {clientPhone && (
                    <a
                      href={`https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="order-card-client-phone"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={11} /> {clientPhone}
                    </a>
                  )}
                  <span className="order-card-address">{streetAddress} · {city}</span>
                </div>
                <div className="order-rating-cell">
                  <span className={`rating-badge ${score.badgeClass}`} style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {score.label}
                  </span>
                </div>
              </div>

              <div className="order-card-product-row">
                <span className="order-card-product-name">{prodTitle}</span>
                <strong className="order-card-total">{money(o.total_amount, o.currency)}</strong>
              </div>

              <div className="order-card-footer">
                <span>{carrier} · Contra entrega</span>
                <button
                  type="button"
                  className="btn-track-action"
                  onClick={(e) => handleTrack(o, e)}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                >
                  <Truck size={12} weight="bold" />
                  <span>Seguimiento ↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}"""

assert old_table_end in code, 'old_table_end not found'
code = code.replace(old_table_end, mobile_cards_code)

with open('src/OrdersView.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/OrdersView.tsx successfully')

# 2. Append mobile styles to src/orders-view.css
mobile_css = """
/* Mobile responsive enhancements for Orders */
@media (max-width: 768px) {
  .orders-origin-tabs {
    display: flex !important;
    padding: 10px 12px 0 !important;
    gap: 0.35rem !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .origin-tab-btn {
    padding: 0.45rem 0.65rem !important;
    font-size: 0.74rem !important;
    gap: 0.3rem !important;
  }
  .origin-badge-count {
    padding: 0.08rem 0.35rem !important;
    font-size: 0.65rem !important;
  }

  /* 3-Column Grid: all 6 filter tabs are 100% visible in 2 rows */
  .orders-filter-tabs {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 6px !important;
    padding: 10px 12px !important;
    overflow-x: visible !important;
  }
  .orders-tab-btn {
    justify-content: center !important;
    padding: 0.45rem 0.25rem !important;
    font-size: 0.73rem !important;
    text-align: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    border-radius: 6px !important;
  }

  .orders-master-panel .table-toolbar {
    padding: 8px 12px 12px !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .orders-master-panel .search-input {
    width: 100% !important;
  }
  .orders-master-panel .search-input input {
    width: 100% !important;
    font-size: 0.8rem !important;
  }
  .orders-master-panel select {
    width: 100% !important;
  }
  .orders-master-panel .export-btn {
    width: 100% !important;
    justify-content: center !important;
  }

  .orders-table-container {
    width: calc(100% - 24px) !important;
    margin: 0 12px 14px !important;
    border: none !important;
    background: transparent !important;
  }

  .desktop-table-view {
    display: none !important;
  }
  .mobile-cards-view {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    padding: 4px 0 !important;
  }
  .order-mobile-card {
    background: #090f1d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .order-mobile-card:active {
    background: #0f182c;
    border-color: #38bdf8;
  }
  .order-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .order-card-client-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .order-card-client-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .order-card-client-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: #f8fafc;
  }
  .order-card-client-phone {
    font-size: 0.74rem;
    color: #38bdf8;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .order-card-address {
    font-size: 0.73rem;
    color: #94a3b8;
    line-height: 1.4;
  }
  .order-card-product-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.78rem;
  }
  .order-card-product-name {
    color: #cbd5e1;
    font-weight: 500;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .order-card-total {
    font-size: 0.95rem;
    font-weight: 800;
    color: #34d399;
  }
  .order-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.72rem;
    color: #64748b;
    padding-top: 4px;
  }
}

@media (min-width: 769px) {
  .mobile-cards-view {
    display: none !important;
  }
  .desktop-table-view {
    display: block !important;
  }
}
"""

with open('src/orders-view.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

if 'mobile-cards-view' not in css_content:
    with open('src/orders-view.css', 'a', encoding='utf-8') as f:
        f.write(mobile_css)
    print('Updated src/orders-view.css')
