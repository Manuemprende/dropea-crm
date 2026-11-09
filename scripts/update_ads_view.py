import re

with open('src/AdsView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add Camera and Eye to phosphor imports
code = code.replace(
    "  VideoCamera,\n  FolderSimple,",
    "  VideoCamera,\n  Camera,\n  Eye,\n  FolderSimple,"
)

# 2. Add state for campaignFilter and selectedCampaignId
old_state_decl = "  const [activeTab, setActiveTab] = useState<'creatives' | 'automations' | 'logs' | 'calculator' | 'credentials'>('creatives');"
new_state_decl = """  const [activeTab, setActiveTab] = useState<'creatives' | 'automations' | 'logs' | 'calculator' | 'credentials'>('creatives');
  const [campaignFilter, setCampaignFilter] = useState<'ACTIVE' | 'PAUSED' | 'ALL'>('ACTIVE');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);"""
assert old_state_decl in code, 'activeTab state not found'
code = code.replace(old_state_decl, new_state_decl)

# 3. Auto-sync on mount and polling
old_use_effect = """  useEffect(() => {
    loadData();
  }, []);"""

new_use_effect = """  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 60000);
    return () => clearInterval(interval);
  }, []);"""
assert old_use_effect in code, 'old_use_effect not found'
code = code.replace(old_use_effect, new_use_effect)

# 4. Campaign grouping & selected campaign resolution
old_main_camp = "  // Main Meta Campaign\n  const mainCampaign = hierarchy[0] || null;"
new_main_camp = """  // Campaigns filtering by status (Active vs Paused / Historical)
  const activeCampaigns = useMemo(() => hierarchy.filter(c => c.status === 'ACTIVE'), [hierarchy]);
  const pausedCampaigns = useMemo(() => hierarchy.filter(c => c.status === 'PAUSED'), [hierarchy]);
  const filteredCampaigns = useMemo(() => {
    if (campaignFilter === 'ACTIVE') return activeCampaigns;
    if (campaignFilter === 'PAUSED') return pausedCampaigns;
    return hierarchy;
  }, [campaignFilter, activeCampaigns, pausedCampaigns, hierarchy]);

  const selectedCampaign = useMemo(() => {
    if (selectedCampaignId) {
      const found = hierarchy.find(c => c.id === selectedCampaignId);
      if (found) return found;
    }
    return filteredCampaigns[0] || hierarchy[0] || null;
  }, [selectedCampaignId, filteredCampaigns, hierarchy]);

  const mainCampaign = selectedCampaign;"""
assert old_main_camp in code, 'old_main_camp not found'
code = code.replace(old_main_camp, new_main_camp)

# 5. Insert campaign switcher bar right before {mainCampaign ? (
old_campaign_render = """      {/* VIEW 1: CREATIVES STRUCTURE (EXACT REFERENCE DESIGN) */}
      {activeTab === 'creatives' && (
        <div className="wntx-campaign-master-view">
          {mainCampaign ? ("""

new_campaign_render = """      {/* VIEW 1: CREATIVES STRUCTURE (EXACT REFERENCE DESIGN) */}
      {activeTab === 'creatives' && (
        <div className="wntx-campaign-master-view">
          {/* Campaign Status & Selector Bar */}
          <div className="wntx-campaign-switcher-bar">
            <div className="wntx-campaign-filter-tabs">
              <button
                type="button"
                className={`wntx-camp-tab ${campaignFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => {
                  setCampaignFilter('ACTIVE');
                  if (activeCampaigns.length > 0) setSelectedCampaignId(activeCampaigns[0].id);
                }}
              >
                <span className="wntx-dot-live" />
                <span>Campañas Activas ({activeCampaigns.length})</span>
              </button>
              <button
                type="button"
                className={`wntx-camp-tab ${campaignFilter === 'PAUSED' ? 'active paused' : ''}`}
                onClick={() => {
                  setCampaignFilter('PAUSED');
                  if (pausedCampaigns.length > 0) setSelectedCampaignId(pausedCampaigns[0].id);
                }}
              >
                <span className="wntx-dot-paused" />
                <span>Campañas Apagadas / Historial ({pausedCampaigns.length})</span>
              </button>
              <button
                type="button"
                className={`wntx-camp-tab ${campaignFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCampaignFilter('ALL')}
              >
                <span>Todas ({hierarchy.length})</span>
              </button>
            </div>

            {filteredCampaigns.length > 1 && (
              <div className="wntx-campaign-select-pills">
                <span className="wntx-select-label">Seleccionar Campaña:</span>
                <div className="wntx-pills-scroll">
                  {filteredCampaigns.map(c => {
                    const isSelected = selectedCampaign?.id === c.id;
                    const isActive = c.status === 'ACTIVE';
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`wntx-camp-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedCampaignId(c.id)}
                      >
                        <span className={`wntx-status-indicator ${isActive ? 'live' : 'paused'}`} />
                        <span className="wntx-pill-name">{c.name}</span>
                        <span className="wntx-pill-budget">{formatMoney(c.daily_budget)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {mainCampaign ? ("""
assert old_campaign_render in code, 'old_campaign_render not found'
code = code.replace(old_campaign_render, new_campaign_render)

# 6. Dynamic status badge in header
old_status_pill = """                    <span className="wntx-pill-status active">
                      ▶ ACTIVA
                    </span>"""
new_status_pill = """                    <span className={`wntx-pill-status ${mainCampaign.status === 'ACTIVE' ? 'active' : 'paused'}`}>
                      {mainCampaign.status === 'ACTIVE' ? '▶ ACTIVA' : '⏸ APAGADA'}
                    </span>"""
assert old_status_pill in code, 'old_status_pill not found'
code = code.replace(old_status_pill, new_status_pill)

# 7. Dynamic counts
old_counts = """                  <div className="wntx-count-pill">
                    <FolderSimple size={15} weight="bold" />
                    <span>3 CONJUNTOS (3 ANUNCIOS)</span>
                  </div>"""
new_counts = """                  <div className="wntx-count-pill">
                    <FolderSimple size={15} weight="bold" />
                    <span>{mainCampaign.adsets.length} CONJUNTOS ({mainCampaign.adsets.reduce((s, a) => s + (a.ads?.length || 0), 0)} ANUNCIOS)</span>
                  </div>"""
assert old_counts in code, 'old_counts not found'
code = code.replace(old_counts, new_counts)

# 8. Dynamic section divider count
old_section_count = '<span className="wntx-adsets-count">3 conjuntos</span>'
new_section_count = '<span className="wntx-adsets-count">{mainCampaign.adsets.length} conjuntos</span>'
assert old_section_count in code, 'old_section_count not found'
code = code.replace(old_section_count, new_section_count)

# 9. Support Image and Video ads in creative cards
old_ad_badge = """                            {/* Overlay Top */}
                            <div className="wntx-frame-top-overlay">
                              <span className="wntx-badge-active-sub">ACTIVE</span>
                              <span className="wntx-badge-hd">
                                <VideoCamera size={12} weight="bold" /> VIDEO HD
                              </span>
                            </div>

                            {/* Overlay Center Play Button */}
                            <div className="wntx-play-center-btn">
                              <div className="wntx-play-circle">
                                <Play size={18} weight="fill" className="text-cyan-400" />
                              </div>
                              <span className="wntx-play-text">Reproducir Video HD</span>
                            </div>"""

new_ad_badge = """                            {/* Overlay Top */}
                            <div className="wntx-frame-top-overlay">
                              <span className={`wntx-badge-active-sub ${ad.status === 'ACTIVE' ? '' : 'paused'}`}>{ad.status || 'ACTIVE'}</span>
                              <span className="wntx-badge-hd">
                                {ad.video_url ? <VideoCamera size={12} weight="bold" /> : <Camera size={12} weight="bold" />} {ad.video_url ? 'VIDEO HD' : 'IMAGEN HD'}
                              </span>
                            </div>

                            {/* Overlay Center Action Button */}
                            <div className="wntx-play-center-btn">
                              <div className="wntx-play-circle">
                                {ad.video_url ? <Play size={18} weight="fill" className="text-cyan-400" /> : <Eye size={18} weight="bold" className="text-cyan-400" />}
                              </div>
                              <span className="wntx-play-text">{ad.video_url ? 'Reproducir Video HD' : 'Ver Imagen HD'}</span>
                            </div>"""
assert old_ad_badge in code, 'old_ad_badge not found'
code = code.replace(old_ad_badge, new_ad_badge)

with open('src/AdsView.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/AdsView.tsx successfully')
