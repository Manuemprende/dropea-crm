import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  ArrowClockwise,
  Copy,
  Check,
  VideoCamera,
  Camera,
  Eye,
  FolderSimple,
  User,
  CreditCard,
  Target,
  Sparkle,
  Plus,
  Trash,
  Lightning,
  Clock,
  Key,
  Calculator,
  CheckCircle,
  CaretDown,
  CaretUp
} from '@phosphor-icons/react';
import './ads-view.css';

interface AdCreativeItem {
  id: string;
  adset_id: string;
  campaign_id: string;
  platform: 'meta' | 'tiktok';
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  thumbnail_url: string;
  high_res_image_url?: string;
  video_url?: string;
  preview_url?: string;
  creative_text: string;
  daily_budget: number;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  inline_link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  landing_page_views: number;
  initiate_checkout: number;
  purchases: number;
  updated_at: string;
}

interface AdSetItem {
  id: string;
  campaign_id: string;
  platform: 'meta' | 'tiktok';
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  daily_budget: number;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  inline_link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  landing_page_views: number;
  initiate_checkout: number;
  purchases: number;
  updated_at: string;
  ads: AdCreativeItem[];
}

interface CampaignHierarchy {
  id: string;
  platform: 'meta' | 'tiktok';
  name: string;
  strategy: string;
  status: 'ACTIVE' | 'PAUSED';
  daily_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  reach?: number;
  frequency?: number;
  inline_link_clicks?: number;
  cpm?: number;
  landing_page_views?: number;
  initiate_checkout?: number;
  purchases?: number;
  updated_at: string;
  adsets: AdSetItem[];
}

interface Rule {
  id: string;
  name: string;
  platform: 'all' | 'meta' | 'tiktok';
  metric: 'orders' | 'roas' | 'cpa' | 'spend' | 'ctr';
  operator: '>=' | '<=' | '>' | '<' | '==';
  threshold: number;
  action: 'scale_budget_percent' | 'reduce_budget_percent' | 'pause_campaign' | 'activate_campaign';
  action_value: number;
  frequency: string;
  enabled: number;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface LogItem {
  id: string;
  rule_id: string;
  rule_name: string;
  platform: string;
  campaign_id: string;
  campaign_name: string;
  action: string;
  details: string;
  timestamp: string;
}

interface CredentialsState {
  meta: {
    configured: boolean;
    accountId: string;
    pixelId: string;
    mode: string;
    tokenPreview: string;
    updatedAt: string | null;
  };
  tiktok: {
    configured: boolean;
    accountId: string;
    pixelId: string;
    mode: string;
    tokenPreview: string;
    updatedAt: string | null;
  };
}

interface AdsViewProps {
  currency?: string;
  market?: string;
}

export const AdsView: React.FC<AdsViewProps> = ({ currency = 'CLP' }) => {
  const [activeTab, setActiveTab] = useState<'creatives' | 'automations' | 'logs' | 'calculator' | 'credentials'>('creatives');
  const [campaignFilter, setCampaignFilter] = useState<'ACTIVE' | 'PAUSED' | 'ALL'>('ACTIVE');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<CampaignHierarchy[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingMeta, setSyncingMeta] = useState<boolean>(false);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCopyId, setExpandedCopyId] = useState<string | null>(null);
  const [useProxyStream, setUseProxyStream] = useState<boolean>(true);
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    high_res_image_url?: string;
    video_url?: string;
    preview_url?: string;
    title: string;
    copy?: string;
    adId?: string;
  } | null>(null);

  // New Rule Form
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleMetric, setNewRuleMetric] = useState<'orders' | 'roas' | 'cpa' | 'spend' | 'ctr'>('orders');
  const [newRuleOperator, setNewRuleOperator] = useState<'>=' | '<=' | '>' | '<' | '=='>('>=');
  const [newRuleThreshold, setNewRuleThreshold] = useState<number>(30);
  const [newRuleAction, setNewRuleAction] = useState<'scale_budget_percent' | 'reduce_budget_percent' | 'pause_campaign' | 'activate_campaign'>('scale_budget_percent');
  const [newRuleValue, setNewRuleValue] = useState<number>(20);

  // Credentials Form
  const [metaToken, setMetaToken] = useState('');
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const [metaMode, setMetaMode] = useState<'simulation' | 'real'>('real');

  const [tiktokToken, setTiktokToken] = useState('');
  const [tiktokAccountId, setTiktokAccountId] = useState('');
  const [tiktokPixelId, setTiktokPixelId] = useState('');
  const [tiktokMode, setTiktokMode] = useState<'simulation' | 'real'>('simulation');

  // Calculadora Proyecto Libertad
  const [calcProductCost, setCalcProductCost] = useState<number>(9990);
  const [calcShippingCost, setCalcShippingCost] = useState<number>(8000);
  const [calcCpaTarget, setCalcCpaTarget] = useState<number>(5000);
  const [calcCancellations, setCalcCancellations] = useState<number>(2000);
  const [calcDesiredMargin, setCalcDesiredMargin] = useState<number>(5000);

  // AOV Boosters
  const [calcPriorityShipping, setCalcPriorityShipping] = useState<number>(1990);
  const [calcUpsell1Tick, setCalcUpsell1Tick] = useState<number>(1500);
  const [calcUpsellPostPurchase, setCalcUpsellPostPurchase] = useState<number>(4000);

  // Proyecciones
  const [calcMonthlySalesGoal, setCalcMonthlySalesGoal] = useState<number>(10000000);

  const resetLibertadDefaults = () => {
    setCalcProductCost(9990);
    setCalcShippingCost(8000);
    setCalcCpaTarget(5000);
    setCalcCancellations(2000);
    setCalcDesiredMargin(5000);
    setCalcPriorityShipping(1990);
    setCalcUpsell1Tick(1500);
    setCalcUpsellPostPurchase(4000);
    setCalcMonthlySalesGoal(10000000);
    showToast('Valores sugeridos de Calculadora Drop restaurados.');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    showToast('Nombre de anuncio copiado al portapapeles.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadData = async (sync = false) => {
    try {
      setLoading(true);
      const [hierRes, rulesRes, logsRes, credsRes] = await Promise.all([
        fetch(`/api/ads/hierarchy?platform=meta${sync ? '&sync=true' : ''}`).then(r => r.json()),
        fetch('/api/ads/rules').then(r => r.json()),
        fetch('/api/ads/logs').then(r => r.json()),
        fetch('/api/ads/credentials').then(r => r.json())
      ]);

      setHierarchy(hierRes || []);
      setRules(rulesRes || []);
      setLogs(logsRes || []);
      setCredentials(credsRes || null);

      if (credsRes?.meta) {
        setMetaAccountId(credsRes.meta.accountId || '');
        setMetaPixelId(credsRes.meta.pixelId || '');
        setMetaMode((credsRes.meta.mode as 'simulation' | 'real') || 'real');
      }
      if (credsRes?.tiktok) {
        setTiktokAccountId(credsRes.tiktok.accountId || '');
        setTiktokPixelId(credsRes.tiktok.pixelId || '');
        setTiktokMode((credsRes.tiktok.mode as 'simulation' | 'real') || 'simulation');
      }
    } catch (err) {
      console.error('Error cargando datos de Ads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleSyncMeta = async () => {
    try {
      setSyncingMeta(true);
      showToast('Sincronizando con Meta Graph API en vivo...');
      const res = await fetch('/api/ads/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setHierarchy(data);
        showToast('Campañas, conjuntos y creativos sincronizados con Meta.');
      } else {
        showToast('No se pudo sincronizar con Meta.');
      }
    } catch {
      showToast('Error de conexión.');
    } finally {
      setSyncingMeta(false);
      loadData();
    }
  };

  const handleScaleCampaignBudgetFixed = async (id: string, delta: number) => {
    const current = hierarchy.find(c => c.id === id);
    if (!current) return;
    const newBudget = current.daily_budget + delta;
    try {
      const res = await fetch(`/api/ads/campaigns/${id}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newBudget, type: 'fixed' })
      });
      if (res.ok) {
        setHierarchy(prev => prev.map(c => c.id === id ? { ...c, daily_budget: newBudget } : c));
        showToast(`Presupuesto actualizado a ${formatMoney(newBudget)}.`);
      }
    } catch {
      showToast('Error al actualizar presupuesto.');
    }
  };

  const handleSaveMetaCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/ads/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'meta',
          accessToken: metaToken,
          accountId: metaAccountId,
          pixelId: metaPixelId,
          mode: metaMode
        })
      });
      if (res.ok) {
        setMetaToken('');
        showToast('Credenciales de Meta Ads actualizadas.');
        await loadData(true);
      }
    } catch {
      showToast('Error al guardar credenciales.');
    }
  };

  const handleSaveTiktokCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/ads/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'tiktok',
          accessToken: tiktokToken,
          accountId: tiktokAccountId,
          pixelId: tiktokPixelId,
          mode: tiktokMode
        })
      });
      if (res.ok) {
        setTiktokToken('');
        showToast('Credenciales de TikTok Ads actualizadas.');
        await loadData();
      }
    } catch {
      showToast('Error al guardar credenciales.');
    }
  };

  const handleEvaluateAutomations = async () => {
    try {
      setEvaluating(true);
      const res = await fetch('/api/ads/evaluate', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        showToast(`Evaluación: ${result.actionsExecuted} acciones ejecutadas.`);
        await loadData();
      }
    } catch {
      showToast('Error al evaluar automatizaciones.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;
    try {
      const res = await fetch('/api/ads/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRuleName,
          platform: 'all',
          metric: newRuleMetric,
          operator: newRuleOperator,
          threshold: newRuleThreshold,
          action: newRuleAction,
          actionValue: newRuleValue,
          frequency: 'every_6h'
        })
      });
      if (res.ok) {
        const created = await res.json();
        setRules(prev => [created, ...prev]);
        setNewRuleName('');
        showToast('Nueva regla de automatización creada.');
      }
    } catch {
      showToast('Error al crear regla.');
    }
  };

  const handleToggleRule = async (id: string, currentEnabled: number) => {
    const nextState = currentEnabled ? 0 : 1;
    try {
      const res = await fetch(`/api/ads/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: nextState } : r));
        showToast(`Regla ${nextState ? 'activada' : 'desactivada'}.`);
      }
    } catch {
      showToast('Error al cambiar regla.');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('¿Eliminar esta regla?')) return;
    try {
      const res = await fetch(`/api/ads/rules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== id));
        showToast('Regla eliminada.');
      }
    } catch {
      showToast('Error al eliminar.');
    }
  };

  // Campaigns filtering by status (Active vs Paused / Historical)
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

  const mainCampaign = selectedCampaign;

  // Calculadora Proyecto Libertad
  const libertadCalc = useMemo(() => {
    // 1. Estructura de Precio Unitario (Total)
    const precioVenta = Math.max(0, calcProductCost + calcShippingCost + calcCpaTarget + calcCancellations + calcDesiredMargin);

    // 2. AOV Máximo Potencial con Upsells
    const maxAov = precioVenta + calcPriorityShipping + calcUpsell1Tick + calcUpsellPostPurchase;

    // 3. Proyecciones de Ventas
    const ventasMes = precioVenta > 0 ? calcMonthlySalesGoal / precioVenta : 0;
    const ventasSemana = ventasMes / 4;
    const ventasDia = ventasMes / 30;

    // 4. Presupuesto Publicitario (Ads Spend con CPA $5.000)
    const gastoMes = ventasMes * calcCpaTarget;
    const gastoSemana = ventasSemana * calcCpaTarget;
    const gastoDia = ventasDia * calcCpaTarget;

    // 5. Retorno Promedio por Venta
    const retornoPromedioVenta = 15000;

    // 6. Embudo de Confirmación
    const conf70 = ventasMes * 0.70;
    const conf80 = ventasMes * 0.80;
    const conf90 = ventasMes * 0.90;

    // 7. Embudo de Entrega Final Courier (sobre confirmados)
    const ent70 = conf70 * 0.70;
    const ent80 = conf80 * 0.80;
    const ent90 = conf90 * 0.90;

    const retBruto70 = ent70 * retornoPromedioVenta;
    const retBruto80 = ent80 * retornoPromedioVenta;
    const retBruto90 = ent90 * retornoPromedioVenta;

    const profitNeto70 = retBruto70 - gastoMes;
    const profitNeto80 = retBruto80 - gastoMes;
    const profitNeto90 = retBruto90 - gastoMes;

    // 8. Ofertas por Cantidad & Bundles
    const bundles = [
      {
        nombre: 'Compra 1 Unidad',
        precio: precioVenta,
        profit: 7000,
        retorno: 12000,
        badge: 'Base Estándar',
      },
      {
        nombre: 'Compra 2 Unidades',
        precio: 44980,
        profit: 12000,
        retorno: 17000,
        badge: 'Pack Dúo (Más Vendido)',
      },
      {
        nombre: 'Compra 3 Unidades',
        precio: 57970,
        profit: 15000,
        retorno: 20000,
        badge: 'Pack Familiar (-35%)',
      },
      {
        nombre: 'Compra 2 + 1 Gratis',
        precio: 59980,
        profit: 10010,
        retorno: 10010,
        badge: 'Oferta Irresistible',
      },
    ];

    return {
      precioVenta,
      maxAov,
      ventasMes,
      ventasSemana,
      ventasDia,
      gastoMes,
      gastoSemana,
      gastoDia,
      retornoPromedioVenta,
      conf70,
      conf80,
      conf90,
      retConf70: conf70 * retornoPromedioVenta,
      retConf80: conf80 * retornoPromedioVenta,
      retConf90: conf90 * retornoPromedioVenta,
      ent70,
      ent80,
      ent90,
      retBruto70,
      retBruto80,
      retBruto90,
      profitNeto70,
      profitNeto80,
      profitNeto90,
      bundles,
    };
  }, [
    calcProductCost,
    calcShippingCost,
    calcCpaTarget,
    calcCancellations,
    calcDesiredMargin,
    calcPriorityShipping,
    calcUpsell1Tick,
    calcUpsellPostPurchase,
    calcMonthlySalesGoal,
  ]);

  return (
    <div className="wentix-ads-suite">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="ads-toast">
          <CheckCircle size={20} weight="fill" className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Video Modal Preview */}
      {previewMedia && (
        <div className="ads-modal-overlay" onClick={() => setPreviewMedia(null)}>
          <div className="ads-modal-card video-only" onClick={e => e.stopPropagation()}>
            <div className="ads-modal-header">
              <div className="flex items-center gap-2">
                <span className="wntx-badge-hd">
                  <VideoCamera size={14} weight="bold" /> VIDEO HD
                </span>
                <span className="ads-modal-title">{previewMedia.title}</span>
              </div>
              <button className="ads-modal-close" onClick={() => setPreviewMedia(null)}>✕</button>
            </div>
            <div className="ads-modal-body video-only-body">
              {previewMedia.video_url ? (
                <div className="wntx-modal-video-box">
                  <video
                    key={`${previewMedia.adId || 'ad'}-${useProxyStream}`}
                    src={useProxyStream && previewMedia.adId ? `/api/ads/video/${previewMedia.adId}/stream` : previewMedia.video_url}
                    poster={previewMedia.high_res_image_url || previewMedia.url}
                    controls
                    playsInline
                    preload="auto"
                    className="wntx-direct-video"
                    onError={() => {
                      if (useProxyStream) {
                        setUseProxyStream(false);
                      }
                    }}
                    ref={(el) => {
                      if (el) {
                        const playPromise = el.play();
                        if (playPromise !== undefined) {
                          playPromise.catch(() => {
                            el.muted = true;
                            el.play().catch(() => {});
                          });
                        }
                      }
                    }}
                  />
                </div>
              ) : previewMedia.preview_url ? (
                <div className="wntx-modal-iframe-box">
                  <iframe
                    src={previewMedia.preview_url}
                    title={previewMedia.title}
                    className="wntx-modal-iframe"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="wntx-modal-img-box">
                  <img
                    src={previewMedia.high_res_image_url || previewMedia.url}
                    alt={previewMedia.title}
                    className="ads-modal-img"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (previewMedia.url && (e.currentTarget as HTMLImageElement).src !== previewMedia.url) {
                        (e.currentTarget as HTMLImageElement).src = previewMedia.url;
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="wntx-header-actions">
        <div className="wntx-tab-selector">
          <button
            className={`wntx-nav-tab ${activeTab === 'creatives' ? 'active' : ''}`}
            onClick={() => setActiveTab('creatives')}
          >
            Estructura de Creativos
          </button>
          <button
            className={`wntx-nav-tab ${activeTab === 'automations' ? 'active' : ''}`}
            onClick={() => setActiveTab('automations')}
          >
            Automatizaciones & Reglas ({rules.length})
          </button>
          <button
            className={`wntx-nav-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Historial de Ejecución ({logs.length})
          </button>
          <button
            className={`wntx-nav-tab ${activeTab === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveTab('calculator')}
          >
            Calculadora Drop
          </button>
          <button
            className={`wntx-nav-tab ${activeTab === 'credentials' ? 'active' : ''}`}
            onClick={() => setActiveTab('credentials')}
          >
            Credenciales Meta & TikTok
          </button>
        </div>

        <button
          className="wntx-sync-btn"
          onClick={handleSyncMeta}
          disabled={syncingMeta}
        >
          <ArrowClockwise size={16} className={syncingMeta ? 'animate-spin' : ''} />
          <span>{syncingMeta ? 'Sincronizando...' : 'Sincronizar Meta'}</span>
        </button>
      </div>

      {/* VIEW 1: CREATIVES STRUCTURE (EXACT REFERENCE DESIGN) */}
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

          {mainCampaign ? (
            <div className="wntx-campaign-box">
              {/* Campaign Top Badges & Title */}
              <div className="wntx-campaign-header">
                <div className="wntx-camp-left">
                  <div className="wntx-pill-tags-row">
                    <span className={`wntx-pill-status ${mainCampaign.status === 'ACTIVE' ? 'active' : 'paused'}`}>
                      {mainCampaign.status === 'ACTIVE' ? '▶ ACTIVA' : '⏸ APAGADA'}
                    </span>
                    <span className="wntx-pill-meta">
                      <User size={13} weight="bold" /> Man.TorresP
                    </span>
                    <span className="wntx-pill-meta">
                      <CreditCard size={13} weight="bold" /> Cuenta Publicitaria Chile
                    </span>
                    <span className="wntx-pill-meta cyan">
                      OUTCOME_SALES
                    </span>
                  </div>
                  <h1 className="wntx-campaign-h1">{mainCampaign.name}</h1>
                </div>

                <div className="wntx-camp-right">
                  <div className="wntx-ppto-pill">
                    <span className="ppto-label">PPTO DIARIO:</span>
                    <strong className="ppto-val">{formatMoney(mainCampaign.daily_budget)} CLP</strong>
                    <button
                      className="wntx-add-budget-btn"
                      onClick={() => handleScaleCampaignBudgetFixed(mainCampaign.id, 500)}
                      title="Aumentar +$500 CLP al presupuesto diario"
                    >
                      +$500
                    </button>
                  </div>
                  <div className="wntx-count-pill">
                    <FolderSimple size={15} weight="bold" />
                    <span>{mainCampaign.adsets.length} CONJUNTOS ({mainCampaign.adsets.reduce((s, a) => s + (a.ads?.length || 0), 0)} ANUNCIOS)</span>
                  </div>
                </div>
              </div>

              {/* Campaign Metrics Row (7 Clean Metric Blocks) */}
              <div className="wntx-metrics-row-bar">
                <div className="wntx-m-block">
                  <span className="m-title">GASTO TOTAL</span>
                  <span className="m-num">{formatMoney(mainCampaign.spend)} CLP</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">VENTAS (COMPRAS)</span>
                  <span className="m-num green">🛒 {mainCampaign.purchases || 0}</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">CPA (COSTO/VENTA)</span>
                  <span className="m-num">$0 CLP</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">ROAS</span>
                  <span className="m-num cyan">-</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">CPM</span>
                  <span className="m-num">{formatMoney(mainCampaign.cpm || 0)} CLP</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">CPC</span>
                  <span className="m-num">${Math.round(mainCampaign.cpc)} CLP</span>
                </div>
                <div className="wntx-m-block">
                  <span className="m-title">CTR (CLICS %)</span>
                  <span className="m-num orange">{mainCampaign.ctr.toFixed(2)}%</span>
                </div>
              </div>

              {/* Subheader: Structure */}
              <div className="wntx-section-divider">
                <div className="flex items-center gap-2">
                  <span className="wntx-divider-icon">🔲</span>
                  <span className="wntx-divider-text">ESTRUCTURA DE CONJUNTOS DE ANUNCIOS Y CREATIVOS</span>
                </div>
                <span className="wntx-adsets-count">{mainCampaign.adsets.length} conjuntos</span>
              </div>

              {/* 3 Column AdSets Grid */}
              <div className="wntx-adsets-3col-grid">
                {(mainCampaign.adsets || []).map(adset => {
                  const ad = adset.ads?.[0]; // 1 video per adset
                  const isExpanded = expandedCopyId === adset.id;

                  return (
                    <div key={adset.id} className="wntx-adset-card">
                      {/* Top AdSet Info */}
                      <div className="wntx-adset-top-info">
                        <div className="flex items-center gap-2">
                          <span className="wntx-badge-active">ACTIVE</span>
                          <span className="wntx-adset-name">{adset.name} (1)</span>
                        </div>
                        <div className="wntx-adset-id-line">ID: {adset.id}</div>
                        <div className="wntx-adset-budget-line">
                          Ppto Conjunto: <strong>{formatMoney(adset.daily_budget)} CLP</strong>
                        </div>
                      </div>

                      {/* Creative Video Card */}
                      {ad && (
                        <div className="wntx-creative-card">
                          {/* Video Thumbnail Frame */}
                          <div
                            className="wntx-video-frame"
                            onClick={() => {
                              setUseProxyStream(true);
                              setPreviewMedia({
                                url: ad.thumbnail_url,
                                high_res_image_url: ad.high_res_image_url || ad.thumbnail_url,
                                video_url: ad.video_url,
                                preview_url: ad.preview_url,
                                title: ad.name,
                                copy: ad.creative_text,
                                adId: ad.id
                              });
                            }}
                          >
                            <img
                              src={ad.high_res_image_url || ad.thumbnail_url}
                              alt={ad.name}
                              className="wntx-thumb-image"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (ad.thumbnail_url && (e.currentTarget as HTMLImageElement).src !== ad.thumbnail_url) {
                                  (e.currentTarget as HTMLImageElement).src = ad.thumbnail_url;
                                }
                              }}
                            />
                            
                            {/* Overlay Top */}
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
                            </div>

                            {/* Overlay Bottom */}
                            <div className="wntx-frame-bottom-overlay">
                              <span className="wntx-stat-tag">🛒 0 ventas</span>
                              <span className="wntx-stat-tag">ROAS: -</span>
                            </div>
                          </div>

                          {/* Ad Info & Copy */}
                          <div className="wntx-creative-body">
                            <div className="wntx-ad-title-row">
                              <strong className="wntx-ad-title">{ad.name}</strong>
                              <button
                                className="wntx-copy-btn"
                                onClick={() => copyToClipboard(ad.name, ad.id)}
                                title="Copiar nombre del anuncio"
                              >
                                {copiedId === ad.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                              </button>
                            </div>

                            {/* Copy Text with Expander */}
                            <p className="wntx-copy-text">
                              {isExpanded ? ad.creative_text : `${(ad.creative_text || '').slice(0, 130)}...`}
                            </p>
                            <button
                              className="wntx-expand-copy-btn"
                              onClick={() => setExpandedCopyId(isExpanded ? null : adset.id)}
                            >
                              {isExpanded ? 'Ocultar copy ↑' : 'Ver copy completo ➔'}
                            </button>

                            {/* Video Metrics Section (3 Big + 3 Mini) */}
                            <div className="wntx-video-metrics-container">
                              <div className="wntx-video-metrics-top-3">
                                <div className="wntx-vm-box">
                                  <span className="lbl">GASTO</span>
                                  <span className="val white">{formatMoney(ad.spend)} CLP</span>
                                </div>
                                <div className="wntx-vm-box">
                                  <span className="lbl">CPC ENLACE</span>
                                  <span className="val cyan">${Math.round(ad.cpc)} CLP</span>
                                </div>
                                <div className="wntx-vm-box">
                                  <span className="lbl">CTR ENLACE</span>
                                  <span className="val orange">{ad.ctr.toFixed(2)}%</span>
                                </div>
                              </div>

                              <div className="wntx-video-metrics-bottom-3">
                                <span>CPM: <strong>{formatMoney(ad.cpm)} CLP</strong></span>
                                <span>Impr: <strong>{ad.impressions}</strong></span>
                                <span>Clics: <strong>{ad.inline_link_clicks}</strong></span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="ads-empty-box">
              <p className="text-slate-300">Cargando campañas de Meta Ads...</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: AUTOMATIONS & RULES */}
      {activeTab === 'automations' && (
        <section className="ads-rules-section">
          <div className="ads-panel-card">
            <div className="ads-panel-header">
              <div>
                <h2 className="ads-panel-title">Reglas de Escalado & Protección Automática</h2>
                <p className="ads-panel-desc">
                  Monitoreo constante sobre Meta Ads. Aumenta presupuesto cuando hay volumen y activa stop-loss si el gasto supera el umbral.
                </p>
              </div>
              <button
                className="ads-primary-btn"
                onClick={handleEvaluateAutomations}
                disabled={evaluating}
              >
                <Lightning size={16} weight="fill" className={evaluating ? 'animate-spin' : ''} />
                <span>{evaluating ? 'Evaluando...' : '⚡ Evaluar Reglas Ahora'}</span>
              </button>
            </div>

            {/* Create Rule Form */}
            <form onSubmit={handleCreateRule} className="ads-new-rule-form">
              <div className="ads-form-grid">
                <div className="ads-field">
                  <label>Nombre de la Regla</label>
                  <input
                    type="text"
                    value={newRuleName}
                    onChange={e => setNewRuleName(e.target.value)}
                    placeholder="Ej: Escalar +20% si supera 30 pedidos"
                    required
                  />
                </div>
                <div className="ads-field">
                  <label>Métrica</label>
                  <select value={newRuleMetric} onChange={e => setNewRuleMetric(e.target.value as any)}>
                    <option value="orders">Pedidos Totales</option>
                    <option value="roas">ROAS</option>
                    <option value="cpa">CPA (Costo por Pedido)</option>
                    <option value="spend">Gasto Acumulado</option>
                    <option value="ctr">CTR (%)</option>
                  </select>
                </div>
                <div className="ads-field">
                  <label>Condición</label>
                  <select value={newRuleOperator} onChange={e => setNewRuleOperator(e.target.value as any)}>
                    <option value=">=">&gt;= (Mayor o igual)</option>
                    <option value="<=">&lt;= (Menor o igual)</option>
                    <option value=">">&gt; (Estricto)</option>
                    <option value="==">== (Exacto)</option>
                  </select>
                </div>
                <div className="ads-field">
                  <label>Valor Umbral</label>
                  <input
                    type="number"
                    step="any"
                    value={newRuleThreshold}
                    onChange={e => setNewRuleThreshold(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="ads-field">
                  <label>Acción</label>
                  <select value={newRuleAction} onChange={e => setNewRuleAction(e.target.value as any)}>
                    <option value="scale_budget_percent">Aumentar Presupuesto (%)</option>
                    <option value="reduce_budget_percent">Reducir Presupuesto (%)</option>
                    <option value="pause_campaign">Pausar Campaña (Kill Switch)</option>
                    <option value="activate_campaign">Activar Campaña</option>
                  </select>
                </div>
                <div className="ads-field">
                  <label>Valor de Acción (%)</label>
                  <input
                    type="number"
                    value={newRuleValue}
                    onChange={e => setNewRuleValue(Number(e.target.value))}
                    placeholder="20"
                  />
                </div>
              </div>
              <button type="submit" className="ads-primary-btn mt-3">
                <Plus size={16} />
                <span>Agregar Regla</span>
              </button>
            </form>

            {/* Rules List */}
            <div className="ads-rules-list">
              {rules.map(rule => (
                <div key={rule.id} className="ads-rule-row">
                  <div className="ads-rule-info">
                    <button
                      className={`ads-toggle-btn ${rule.enabled ? 'on' : 'off'}`}
                      onClick={() => handleToggleRule(rule.id, rule.enabled)}
                      title={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
                    >
                      <span className="ads-toggle-dot" />
                    </button>
                    <div>
                      <strong className="ads-rule-name">{rule.name}</strong>
                      <div className="ads-rule-meta">
                        <span>SI: <strong>{rule.metric} {rule.operator} {rule.threshold}</strong></span>
                        <span>➔ ACCIÓN: <strong>{rule.action} ({rule.action_value}%)</strong></span>
                        <span>Disparada: <strong>{rule.trigger_count} veces</strong></span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="ads-icon-danger-btn"
                    onClick={() => handleDeleteRule(rule.id)}
                    title="Eliminar regla"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* VIEW 3: LOGS */}
      {activeTab === 'logs' && (
        <section className="ads-panel-card">
          <div className="ads-panel-header">
            <div>
              <h2 className="ads-panel-title">Historial de Ejecución de Reglas</h2>
              <p className="ads-panel-desc">Registro histórico de las automatizaciones aplicadas sobre Meta Ads.</p>
            </div>
          </div>

          <div className="ads-table-container">
            <table className="ads-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Campaña</th>
                  <th>Regla Aplicada</th>
                  <th>Detalle de Acción</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ads-table-empty">
                      No hay registros recientes de automatizaciones ejecutadas.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id}>
                      <td className="text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('es-CL')}
                      </td>
                      <td className="font-semibold text-slate-200">{log.campaign_name}</td>
                      <td>
                        <span className="ads-rule-tag">{log.rule_name}</span>
                      </td>
                      <td className="text-slate-300">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* VIEW 4: CALCULADORA DROP */}
      {activeTab === 'calculator' && (
        <section className="libertad-calculator-container">
          {/* Header Banner */}
          <div className="libertad-header-banner">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="libertad-badge">CALCULADORA DROP</span>
                <span className="libertad-subtag">Modelo Financiero COD E-Commerce</span>
              </div>
              <h2 className="libertad-title">Calculadora Drop · Precios, Ofertas y Retorno Real</h2>
              <p className="libertad-desc">
                Estructura de precios unitarios, estrategia de aumento de AOV, proyecciones de escala y ganancia neta real en bolsillo tras envíos, devoluciones y gasto publicitario.
              </p>
            </div>
            <button className="libertad-reset-btn" onClick={resetLibertadDefaults}>
              <ArrowClockwise size={16} weight="bold" /> Valores Calculadora Drop
            </button>
          </div>

          {/* Row 1: Unit Economics & AOV */}
          <div className="libertad-grid-2">
            {/* Box 1: Estructura de Precio Unitario */}
            <div className="libertad-card">
              <div className="libertad-card-head">
                <span className="libertad-card-step">1</span>
                <div>
                  <h3 className="libertad-card-title">Estructura de Precio Unitario (PVP)</h3>
                  <p className="libertad-card-subtitle">Costos base para calcular el precio de venta al público sugerido</p>
                </div>
              </div>
              <div className="libertad-form-grid">
                <div className="libertad-field">
                  <label>Costo del Producto (Bodega)</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">$</span>
                    <input
                      type="number"
                      value={calcProductCost}
                      onChange={e => setCalcProductCost(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="libertad-field">
                  <label>Envío Promedio Courier</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">$</span>
                    <input
                      type="number"
                      value={calcShippingCost}
                      onChange={e => setCalcShippingCost(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="libertad-field">
                  <label>Costo por Compra (CPA Ads Target)</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">$</span>
                    <input
                      type="number"
                      value={calcCpaTarget}
                      onChange={e => setCalcCpaTarget(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="libertad-field">
                  <label>Provisión por Cancelaciones / Devoluciones</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">$</span>
                    <input
                      type="number"
                      value={calcCancellations}
                      onChange={e => setCalcCancellations(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="libertad-field">
                  <label>Margen / Ganancia Neta Deseada</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">$</span>
                    <input
                      type="number"
                      value={calcDesiredMargin}
                      onChange={e => setCalcDesiredMargin(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Highlight Total Price */}
              <div className="libertad-highlight-box primary">
                <div>
                  <span className="libertad-highlight-label">Total Precio de Venta (PVP Sugerido)</span>
                  <div className="libertad-highlight-sub">Suma de costos + provisión + margen neto</div>
                </div>
                <div className="libertad-highlight-value">{formatMoney(libertadCalc.precioVenta)} CLP</div>
              </div>
            </div>

            {/* Box 2: Aumenta tu AOV */}
            <div className="libertad-card">
              <div className="libertad-card-head">
                <span className="libertad-card-step">2</span>
                <div>
                  <h3 className="libertad-card-title">Aumenta tu Ticket Promedio (AOV)</h3>
                  <p className="libertad-card-subtitle">Estrategias de Order Bump y Upsell para maximizar el margen por cliente</p>
                </div>
              </div>
              <div className="libertad-form-grid">
                <div className="libertad-field">
                  <label>Envío Prioritario (Opción en Landing / Checkout)</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">+$</span>
                    <input
                      type="number"
                      value={calcPriorityShipping}
                      onChange={e => setCalcPriorityShipping(Number(e.target.value))}
                    />
                  </div>
                  <small className="text-slate-400 text-xs mt-0.5 block">Sube conversión y entrega rápida</small>
                </div>
                <div className="libertad-field">
                  <label>Upsell 1 Tick (Order Bump en Formulario)</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">+$</span>
                    <input
                      type="number"
                      value={calcUpsell1Tick}
                      onChange={e => setCalcUpsell1Tick(Number(e.target.value))}
                    />
                  </div>
                  <small className="text-slate-400 text-xs mt-0.5 block">Pilas, accesorios o garantía extendida</small>
                </div>
                <div className="libertad-field">
                  <label>Upsell Post-Compra (Página de Gracias / WhatsApp)</label>
                  <div className="libertad-input-box">
                    <span className="libertad-prefix">+$</span>
                    <input
                      type="number"
                      value={calcUpsellPostPurchase}
                      onChange={e => setCalcUpsellPostPurchase(Number(e.target.value))}
                    />
                  </div>
                  <small className="text-slate-400 text-xs mt-0.5 block">Segunda unidad con descuento inmediato</small>
                </div>
              </div>

              {/* Highlight AOV Potencial */}
              <div className="libertad-highlight-box emerald">
                <div>
                  <span className="libertad-highlight-label">AOV Máximo Potencial con Upsells</span>
                  <div className="libertad-highlight-sub">Ingresos extras con el mismo costo por adquisición (CPA)</div>
                </div>
                <div className="libertad-highlight-value text-emerald-400">{formatMoney(libertadCalc.maxAov)} CLP</div>
              </div>
            </div>
          </div>

          {/* Row 2: Venta Mínima y Ofertas por Cantidad (Bundles) */}
          <div className="libertad-card">
            <div className="libertad-card-head">
              <span className="libertad-card-step">3</span>
              <div>
                <h3 className="libertad-card-title">Venta Mínima y Ofertas por Cantidad (Bundles & Packs)</h3>
                <p className="libertad-card-subtitle">Estructura para landing pages de alta conversión: desincentiva comprar 1 sola unidad</p>
              </div>
            </div>

            <div className="libertad-table-wrap">
              <table className="libertad-table">
                <thead>
                  <tr>
                    <th>Estrategia de Oferta</th>
                    <th>Tipo de Oferta</th>
                    <th>Precio al Cliente</th>
                    <th>Profit Real Estimado</th>
                    <th>Retorno x Venta (Margen Bruto)</th>
                  </tr>
                </thead>
                <tbody>
                  {libertadCalc.bundles.map((b, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-100">{b.nombre}</td>
                      <td>
                        <span className={`libertad-pill ${idx === 1 ? 'featured' : idx === 3 ? 'irresistible' : ''}`}>
                          {b.badge}
                        </span>
                      </td>
                      <td className="font-bold text-cyan-300">{formatMoney(b.precio)} CLP</td>
                      <td className="font-bold text-emerald-400">+{formatMoney(b.profit)} CLP</td>
                      <td className="font-bold text-slate-200">{formatMoney(b.retorno)} CLP</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="libertad-banner-summary">
              <span>Retorno Promedio Ponderado por Venta:</span>
              <strong className="text-cyan-400 text-lg">+{formatMoney(libertadCalc.retornoPromedioVenta)} CLP</strong>
            </div>
          </div>

          {/* Row 3: Proyecciones de Venta & Gasto en Anuncios */}
          <div className="libertad-grid-2">
            {/* Box 3: Proyección de Ventas */}
            <div className="libertad-card">
              <div className="libertad-card-head">
                <span className="libertad-card-step">4</span>
                <div>
                  <h3 className="libertad-card-title">Proyección de Ventas (Ritmo de Escala)</h3>
                  <p className="libertad-card-subtitle">Calcula cuántos pedidos diarios necesitas para tu meta de facturación</p>
                </div>
              </div>

              <div className="libertad-field mb-4">
                <label className="text-sm font-semibold text-slate-200">¿Cuánto quieres facturar al mes?</label>
                <div className="libertad-input-box large">
                  <span className="libertad-prefix">$</span>
                  <input
                    type="number"
                    step="500000"
                    value={calcMonthlySalesGoal}
                    onChange={e => setCalcMonthlySalesGoal(Number(e.target.value))}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Ticket Promedio Base: <strong>{formatMoney(libertadCalc.precioVenta)} CLP</strong>
                </div>
              </div>

              <div className="libertad-stats-row">
                <div className="libertad-stat-box">
                  <span className="libertad-stat-label">Ventas por Mes</span>
                  <span className="libertad-stat-num">{Math.round(libertadCalc.ventasMes)}</span>
                  <span className="libertad-stat-detail">pedidos / mes</span>
                </div>
                <div className="libertad-stat-box">
                  <span className="libertad-stat-label">Ventas por Semana</span>
                  <span className="libertad-stat-num">{Math.round(libertadCalc.ventasSemana)}</span>
                  <span className="libertad-stat-detail">pedidos / sem</span>
                </div>
                <div className="libertad-stat-box highlight">
                  <span className="libertad-stat-label">Ventas por Día</span>
                  <span className="libertad-stat-num text-cyan-400">{libertadCalc.ventasDia.toFixed(1)}</span>
                  <span className="libertad-stat-detail">pedidos al día</span>
                </div>
              </div>
            </div>

            {/* Box 4: Gasto en Anuncios */}
            <div className="libertad-card">
              <div className="libertad-card-head">
                <span className="libertad-card-step">5</span>
                <div>
                  <h3 className="libertad-card-title">Presupuesto en Anuncios (Ads Spend)</h3>
                  <p className="libertad-card-subtitle">Inversión calculada a un CPA objetivo de {formatMoney(calcCpaTarget)} CLP</p>
                </div>
              </div>

              <div className="libertad-stats-row mt-6">
                <div className="libertad-stat-box">
                  <span className="libertad-stat-label">Gasto por Mes</span>
                  <span className="libertad-stat-num text-slate-200">{formatMoney(Math.round(libertadCalc.gastoMes))}</span>
                  <span className="libertad-stat-detail">Meta & TikTok total</span>
                </div>
                <div className="libertad-stat-box">
                  <span className="libertad-stat-label">Gasto por Semana</span>
                  <span className="libertad-stat-num text-slate-200">{formatMoney(Math.round(libertadCalc.gastoSemana))}</span>
                  <span className="libertad-stat-detail">inversión semanal</span>
                </div>
                <div className="libertad-stat-box highlight-amber">
                  <span className="libertad-stat-label">Monto Diario en Campañas</span>
                  <span className="libertad-stat-num text-amber-300">{formatMoney(Math.round(libertadCalc.gastoDia))}</span>
                  <span className="libertad-stat-detail">Ppto diario a configurar</span>
                </div>
              </div>

              <div className="libertad-info-box mt-4">
                <Lightning size={16} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para alcanzar <strong>{formatMoney(calcMonthlySalesGoal)} CLP</strong> al mes, tus campañas activas de Meta Ads deben consumir <strong>{formatMoney(Math.round(libertadCalc.gastoDia))} CLP/día</strong> manteniendo tu CPA por debajo de <strong>{formatMoney(calcCpaTarget)} CLP</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Row 4: Embudo de Rendimiento COD (Confirmación, Entrega y Ganancia Real) */}
          <div className="libertad-card">
            <div className="libertad-card-head">
              <span className="libertad-card-step">6</span>
              <div>
                <h3 className="libertad-card-title">Embudo de Retorno Real Contra Entrega (Cash On Delivery)</h3>
                <p className="libertad-card-subtitle">
                  Proyección financiera real considerando la tasa de confirmación por WhatsApp y la tasa de entrega efectiva de las transportistas.
                </p>
              </div>
            </div>

            <div className="libertad-funnel-grid">
              {/* Escenario 70% */}
              <div className="libertad-funnel-col">
                <div className="libertad-funnel-head">
                  <span className="libertad-rate-badge badge-70">Escenario 70%</span>
                  <span className="text-xs text-slate-400">Conservador</span>
                </div>
                
                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Confirmación (70%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos confirmados:</span>
                    <strong>{Math.round(libertadCalc.conf70)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno esperado:</span>
                    <strong>{formatMoney(Math.round(libertadCalc.retConf70))}</strong>
                  </div>
                </div>

                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Entrega Courier (70%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos entregados:</span>
                    <strong>{Math.round(libertadCalc.ent70)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno bruto recaudado:</span>
                    <strong className="text-slate-200">{formatMoney(Math.round(libertadCalc.retBruto70))}</strong>
                  </div>
                </div>

                <div className="libertad-profit-card profit-70">
                  <span className="libertad-profit-title">Ganancia Neta en Bolsillo</span>
                  <span className="libertad-profit-value">+{formatMoney(Math.round(libertadCalc.profitNeto70))} CLP</span>
                  <span className="libertad-profit-roi">Tras producto, envíos y ads</span>
                </div>
              </div>

              {/* Escenario 80% */}
              <div className="libertad-funnel-col featured">
                <div className="libertad-funnel-head">
                  <span className="libertad-rate-badge badge-80">Escenario 80%</span>
                  <span className="text-xs text-cyan-300 font-semibold">Objetivo Estándar</span>
                </div>

                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Confirmación (80%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos confirmados:</span>
                    <strong>{Math.round(libertadCalc.conf80)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno esperado:</span>
                    <strong>{formatMoney(Math.round(libertadCalc.retConf80))}</strong>
                  </div>
                </div>

                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Entrega Courier (80%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos entregados:</span>
                    <strong>{Math.round(libertadCalc.ent80)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno bruto recaudado:</span>
                    <strong className="text-slate-200">{formatMoney(Math.round(libertadCalc.retBruto80))}</strong>
                  </div>
                </div>

                <div className="libertad-profit-card profit-80">
                  <span className="libertad-profit-title">Ganancia Neta en Bolsillo</span>
                  <span className="libertad-profit-value text-emerald-400">+{formatMoney(Math.round(libertadCalc.profitNeto80))} CLP</span>
                  <span className="libertad-profit-roi text-emerald-300">Margen neto operativo: {(libertadCalc.profitNeto80 / calcMonthlySalesGoal * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Escenario 90% */}
              <div className="libertad-funnel-col">
                <div className="libertad-funnel-head">
                  <span className="libertad-rate-badge badge-90">Escenario 90%</span>
                  <span className="text-xs text-emerald-400 font-semibold">Excelente Optimización</span>
                </div>

                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Confirmación (90%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos confirmados:</span>
                    <strong>{Math.round(libertadCalc.conf90)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno esperado:</span>
                    <strong>{formatMoney(Math.round(libertadCalc.retConf90))}</strong>
                  </div>
                </div>

                <div className="libertad-funnel-section">
                  <div className="libertad-funnel-sub">Entrega Courier (90%)</div>
                  <div className="libertad-funnel-row">
                    <span>Pedidos entregados:</span>
                    <strong>{Math.round(libertadCalc.ent90)}</strong>
                  </div>
                  <div className="libertad-funnel-row">
                    <span>Retorno bruto recaudado:</span>
                    <strong className="text-slate-200">{formatMoney(Math.round(libertadCalc.retBruto90))}</strong>
                  </div>
                </div>

                <div className="libertad-profit-card profit-90">
                  <span className="libertad-profit-title">Ganancia Neta en Bolsillo</span>
                  <span className="libertad-profit-value text-emerald-300">+{formatMoney(Math.round(libertadCalc.profitNeto90))} CLP</span>
                  <span className="libertad-profit-roi text-emerald-200">Margen neto operativo: {(libertadCalc.profitNeto90 / calcMonthlySalesGoal * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW 5: CREDENTIALS */}
      {activeTab === 'credentials' && (
        <section className="ads-creds-grid">
          <div className="ads-panel-card">
            <div className="flex items-center gap-2 mb-3">
              <span className="ads-platform-pill meta">Meta Ads</span>
              <h2 className="ads-panel-title">Configuración Meta Graph API</h2>
            </div>
            <form onSubmit={handleSaveMetaCredentials} className="space-y-4">
              <div className="ads-field">
                <label>ID de Cuenta Publicitaria (act_XXXXXXXXX)</label>
                <input
                  type="text"
                  value={metaAccountId}
                  onChange={e => setMetaAccountId(e.target.value)}
                  placeholder="act_1614860827039507"
                  required
                />
              </div>
              <div className="ads-field">
                <label>Access Token (System User / Graph API)</label>
                <input
                  type="password"
                  value={metaToken}
                  onChange={e => setMetaToken(e.target.value)}
                  placeholder={credentials?.meta?.tokenPreview || 'Ingresa nuevo token si deseas actualizarlo'}
                />
              </div>
              <div className="ads-field">
                <label>Pixel ID (Opcional)</label>
                <input
                  type="text"
                  value={metaPixelId}
                  onChange={e => setMetaPixelId(e.target.value)}
                  placeholder="1437114854619803"
                />
              </div>
              <div className="ads-field">
                <label>Modo de Operación</label>
                <select value={metaMode} onChange={e => setMetaMode(e.target.value as any)}>
                  <option value="real">Real (Conectar con Meta Graph API en vivo)</option>
                  <option value="simulation">Simulación (Entorno de pruebas)</option>
                </select>
              </div>
              <button type="submit" className="ads-primary-btn w-full">
                Guardar y Verificar Conexión con Meta
              </button>
            </form>
          </div>

          <div className="ads-panel-card">
            <div className="flex items-center gap-2 mb-3">
              <span className="ads-platform-pill tiktok">TikTok Ads</span>
              <h2 className="ads-panel-title">Configuración TikTok Marketing API</h2>
            </div>
            <form onSubmit={handleSaveTiktokCredentials} className="space-y-4">
              <div className="ads-field">
                <label>Advertiser ID</label>
                <input
                  type="text"
                  value={tiktokAccountId}
                  onChange={e => setTiktokAccountId(e.target.value)}
                  placeholder="7192837465928172"
                />
              </div>
              <div className="ads-field">
                <label>Access Token</label>
                <input
                  type="password"
                  value={tiktokToken}
                  onChange={e => setTiktokToken(e.target.value)}
                  placeholder={credentials?.tiktok?.tokenPreview || 'Ingresa token de TikTok Marketing API'}
                />
              </div>
              <div className="ads-field">
                <label>Pixel ID (Opcional)</label>
                <input
                  type="text"
                  value={tiktokPixelId}
                  onChange={e => setTiktokPixelId(e.target.value)}
                  placeholder="C1234567890ABCDEF"
                />
              </div>
              <div className="ads-field">
                <label>Modo de Operación</label>
                <select value={tiktokMode} onChange={e => setTiktokMode(e.target.value as any)}>
                  <option value="simulation">Simulación (Entorno de pruebas)</option>
                  <option value="real">Real (Conectar con TikTok API)</option>
                </select>
              </div>
              <button type="submit" className="ads-primary-btn w-full">
                Guardar Credenciales de TikTok
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdsView;
