import re

# 1. Update src/main.tsx
with open('src/main.tsx', 'r', encoding='utf-8') as f:
    main_code = f.read()

old_footer = """<footer className="footer"><div className="footer-left"><span className="brand-mark mini"><span/><span/><span/></span><strong className="footer-dropea">Dropea CRM</strong><span className="footer-sep">-</span><span className="footer-wentix">By Wentix AI</span><span className="footer-sep">·</span><span className="footer-tagline">Comercio y Comunidad Conectada</span></div><div className="footer-right"><span className="footer-security"><ShieldCheck size={14} weight="fill"/> Seguridad SSL</span><span className="footer-sep">·</span><span className="footer-year">© 2026</span><span className="footer-sep">·</span><span className="footer-view-label">{view==='Meta & TikTok Ads'?'Publicidad y automatizaciones':view==='WhatsApp'?'Conversaciones y entregas':view==='Live / Landings'?'Seguimiento de campañas':view==='Seguimiento'?'Trazabilidad en tiempo real':demo?'Vista de demostración':'Ecosistema Dropea'}</span><span className="footer-sep">·</span><span>America/Santiago</span></div></footer>"""

new_footer = """<footer className="footer">
  <div className="footer-left">
    <div className="footer-left-brand">
      <span className="brand-mark mini"><span/><span/><span/></span>
      <strong className="footer-dropea">Dropea CRM</strong>
      <span className="footer-sep">-</span>
      <span className="footer-wentix">By Wentix AI</span>
    </div>
    <span className="footer-sep mobile-hide">·</span>
    <span className="footer-tagline">Comercio y Comunidad Conectada</span>
  </div>
  <div className="footer-right">
    <span className="footer-security"><ShieldCheck size={14} weight="fill"/> Seguridad SSL</span>
    <span className="footer-sep">·</span>
    <span className="footer-year">© 2026</span>
    <span className="footer-sep mobile-hide">·</span>
    <span className="footer-view-label mobile-hide">{view==='Meta & TikTok Ads'?'Publicidad y automatizaciones':view==='WhatsApp'?'Conversaciones y entregas':view==='Live / Landings'?'Seguimiento de campañas':view==='Seguimiento'?'Trazabilidad en tiempo real':demo?'Vista de demostración':'Ecosistema Dropea'}</span>
    <span className="footer-sep">·</span>
    <span className="footer-tz">America/Santiago</span>
  </div>
</footer>"""

assert old_footer in main_code, 'old_footer not found in src/main.tsx'
main_code = main_code.replace(old_footer, new_footer)

with open('src/main.tsx', 'w', encoding='utf-8') as f:
    f.write(main_code)

print('Updated src/main.tsx footer')

# 2. Update src/styles.css
with open('src/styles.css', 'r', encoding='utf-8') as f:
    styles_code = f.read()

old_mobile_footer = """@media (max-width: 760px) {
  .footer {
    flex-direction: column !important;
    align-items: flex-start !important;
    padding: 0.85rem 1.25rem calc(0.85rem + 62px) !important;
    font-size: 11px !important;
  }
}"""

new_mobile_footer = """@media (max-width: 760px) {
  .footer,
  .whatsapp-shell .footer {
    flex-direction: column !important;
    align-items: center !important;
    text-align: center !important;
    gap: 0.5rem !important;
    padding: 1rem 1rem calc(1rem + 10px) !important;
    font-size: 11px !important;
  }
  .footer-left {
    justify-content: center !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0.2rem !important;
  }
  .footer-left-brand {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0.35rem !important;
  }
  .footer-tagline {
    font-size: 11px !important;
    color: #64748b !important;
  }
  .footer-right {
    justify-content: center !important;
    align-items: center !important;
    gap: 0.4rem !important;
  }
  .footer-sep.mobile-hide,
  .mobile-hide {
    display: none !important;
  }
}"""

assert old_mobile_footer in styles_code, 'old_mobile_footer not found in src/styles.css'
styles_code = styles_code.replace(old_mobile_footer, new_mobile_footer)

with open('src/styles.css', 'w', encoding='utf-8') as f:
    f.write(styles_code)

print('Updated src/styles.css footer')
