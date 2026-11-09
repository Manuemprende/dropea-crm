import { randomUUID } from 'node:crypto';
import { encryptConnection, decryptConnection } from './credentials.js';

export function createAdsManager({ db, encryptionKey = null, clock = () => new Date().toISOString() }) {
  // 1. Initialize Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS ads_credentials (
      platform TEXT PRIMARY KEY,
      account_id TEXT,
      access_token TEXT,
      pixel_id TEXT,
      app_secret TEXT,
      mode TEXT DEFAULT 'simulation',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ads_campaigns (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL,
      status TEXT NOT NULL,
      daily_budget REAL NOT NULL,
      spend REAL NOT NULL,
      impressions INTEGER NOT NULL,
      clicks INTEGER NOT NULL,
      orders INTEGER NOT NULL,
      revenue REAL NOT NULL,
      roas REAL NOT NULL,
      cpa REAL NOT NULL,
      ctr REAL NOT NULL,
      cpc REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ads_adsets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      daily_budget REAL NOT NULL,
      spend REAL NOT NULL,
      impressions INTEGER NOT NULL,
      reach INTEGER NOT NULL,
      frequency REAL NOT NULL,
      clicks INTEGER NOT NULL,
      inline_link_clicks INTEGER NOT NULL,
      ctr REAL NOT NULL,
      cpc REAL NOT NULL,
      cpm REAL NOT NULL,
      landing_page_views INTEGER NOT NULL,
      initiate_checkout INTEGER NOT NULL,
      purchases INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ads_creatives (
      id TEXT PRIMARY KEY,
      adset_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      thumbnail_url TEXT,
      high_res_image_url TEXT,
      video_url TEXT,
      preview_url TEXT,
      creative_text TEXT,
      daily_budget REAL NOT NULL,
      spend REAL NOT NULL,
      impressions INTEGER NOT NULL,
      reach INTEGER NOT NULL,
      frequency REAL NOT NULL,
      clicks INTEGER NOT NULL,
      inline_link_clicks INTEGER NOT NULL,
      ctr REAL NOT NULL,
      cpc REAL NOT NULL,
      cpm REAL NOT NULL,
      landing_page_views INTEGER NOT NULL,
      initiate_checkout INTEGER NOT NULL,
      purchases INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ads_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      metric TEXT NOT NULL,
      operator TEXT NOT NULL,
      threshold REAL NOT NULL,
      action TEXT NOT NULL,
      action_value REAL NOT NULL,
      frequency TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_triggered_at TEXT,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ads_logs (
      id TEXT PRIMARY KEY,
      rule_id TEXT,
      rule_name TEXT,
      platform TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      action TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  // Migrate existing ads_campaigns table if extra columns are missing
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN reach INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN frequency REAL DEFAULT 1.0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN inline_link_clicks INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN cpm REAL DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN landing_page_views INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN initiate_checkout INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_campaigns ADD COLUMN purchases INTEGER DEFAULT 0;'); } catch {}
  try { db.exec('ALTER TABLE ads_creatives ADD COLUMN preview_url TEXT;'); } catch {}
  try { db.exec('ALTER TABLE ads_creatives ADD COLUMN high_res_image_url TEXT;'); } catch {}
  try { db.exec('ALTER TABLE ads_creatives ADD COLUMN video_url TEXT;'); } catch {}

  // Seed default simulation campaigns if empty
  const campaignCount = db.prepare('SELECT count(*) as count FROM ads_campaigns').get().count;
  if (campaignCount === 0) {
    const defaultCampaigns = [
      {
        id: 'meta-cmp-01',
        platform: 'meta',
        name: 'Pelota Saltarina Glow Pro · CBO Escala Nacional',
        strategy: 'CBO',
        status: 'ACTIVE',
        daily_budget: 35000,
        spend: 31500,
        impressions: 48200,
        clicks: 1420,
        orders: 34,
        revenue: 679660,
        roas: 2.85,
        cpa: 6800,
        ctr: 2.94,
        cpc: 22.18,
        updated_at: clock()
      },
      {
        id: 'meta-cmp-02',
        platform: 'meta',
        name: 'Pelota Glow Pro · ABO Test Creativos UGC',
        strategy: 'ABO',
        status: 'ACTIVE',
        daily_budget: 15000,
        spend: 14200,
        impressions: 19800,
        clicks: 580,
        orders: 16,
        revenue: 319840,
        roas: 2.10,
        cpa: 8875,
        ctr: 2.92,
        cpc: 24.48,
        updated_at: clock()
      },
      {
        id: 'meta-cmp-03',
        platform: 'meta',
        name: 'Pack Ahorro 2x1 · Retargeting Carritos',
        strategy: 'ABO',
        status: 'ACTIVE',
        daily_budget: 12000,
        spend: 15400,
        impressions: 14200,
        clicks: 310,
        orders: 0,
        revenue: 0,
        roas: 0.0,
        cpa: 0,
        ctr: 2.18,
        cpc: 49.67,
        updated_at: clock()
      },
      {
        id: 'tiktok-cmp-01',
        platform: 'tiktok',
        name: 'Glow Pro Viral · Spark Ads TikTok Feed',
        strategy: 'Spark Ads',
        status: 'ACTIVE',
        daily_budget: 31250,
        spend: 23400,
        impressions: 68400,
        clicks: 2150,
        orders: 31,
        revenue: 619690,
        roas: 3.12,
        cpa: 5850,
        ctr: 3.14,
        cpc: 10.88,
        updated_at: clock()
      },
      {
        id: 'tiktok-cmp-02',
        platform: 'tiktok',
        name: 'Humidificador LED · Trend Audio Creativo #3',
        strategy: 'Spark Ads',
        status: 'PAUSED',
        daily_budget: 20000,
        spend: 19800,
        impressions: 21200,
        clicks: 420,
        orders: 4,
        revenue: 79960,
        roas: 0.85,
        cpa: 19800,
        ctr: 1.98,
        cpc: 47.14,
        updated_at: clock()
      }
    ];

    const ins = db.prepare(`
      INSERT INTO ads_campaigns (id, platform, name, strategy, status, daily_budget, spend, impressions, clicks, orders, revenue, roas, cpa, ctr, cpc, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of defaultCampaigns) {
      ins.run(c.id, c.platform, c.name, c.strategy, c.status, c.daily_budget, c.spend, c.impressions, c.clicks, c.orders, c.revenue, c.roas, c.cpa, c.ctr, c.cpc, c.updated_at);
    }
  }

  // Seed default rules if empty
  const ruleCount = db.prepare('SELECT count(*) as count FROM ads_rules').get().count;
  if (ruleCount === 0) {
    const defaultRules = [
      {
        id: 'rule-scale-30',
        name: 'Escalado Automático (+20% Presupuesto con 30+ Pedidos)',
        platform: 'all',
        metric: 'orders',
        operator: '>=',
        threshold: 30,
        action: 'scale_budget_percent',
        action_value: 20,
        frequency: 'every_6h',
        enabled: 1,
        created_at: clock()
      },
      {
        id: 'rule-stoploss-zero',
        name: 'Kill Switch (Stop-Loss si Gasto > $15.000 sin ventas)',
        platform: 'all',
        metric: 'spend',
        operator: '>=',
        threshold: 15000,
        action: 'pause_campaign',
        action_value: 0,
        frequency: 'every_1h',
        enabled: 1,
        created_at: clock()
      },
      {
        id: 'rule-scale-roas',
        name: 'Super Escalado (+25% si ROAS >= 3.0)',
        platform: 'all',
        metric: 'roas',
        operator: '>=',
        threshold: 3.0,
        action: 'scale_budget_percent',
        action_value: 25,
        frequency: 'daily',
        enabled: 1,
        created_at: clock()
      },
      {
        id: 'rule-scale-down-fatigue',
        name: 'Protección de Fatiga (-15% si CTR < 1.0%)',
        platform: 'all',
        metric: 'ctr',
        operator: '<=',
        threshold: 1.0,
        action: 'reduce_budget_percent',
        action_value: 15,
        frequency: 'daily',
        enabled: 0,
        created_at: clock()
      }
    ];

    const insRule = db.prepare(`
      INSERT INTO ads_rules (id, name, platform, metric, operator, threshold, action, action_value, frequency, enabled, trigger_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    for (const r of defaultRules) {
      insRule.run(r.id, r.name, r.platform, r.metric, r.operator, r.threshold, r.action, r.action_value, r.frequency, r.enabled, r.created_at);
    }
  }

  function mask(str, start = 4, end = 4) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= start + end) return '••••••••';
    return `${str.slice(0, start)}••••••••${str.slice(-end)}`;
  }

  function extractMetrics(ins) {
    const spend = Math.round(Number(ins?.spend) || 0);
    const impressions = Number(ins?.impressions) || 0;
    const reach = Number(ins?.reach) || 0;
    const frequency = Number(ins?.frequency) || (reach > 0 ? Number((impressions / reach).toFixed(2)) : 1.0);
    const clicks = Number(ins?.clicks) || 0;
    const inline_link_clicks = Number(ins?.inline_link_clicks) || clicks;
    const ctr = Number(ins?.inline_link_click_ctr) || Number(ins?.ctr) || (impressions > 0 ? Number(((inline_link_clicks / impressions) * 100).toFixed(2)) : 0);
    const cpc = Number(ins?.cost_per_inline_link_click) || Number(ins?.cpc) || (inline_link_clicks > 0 ? Number((spend / inline_link_clicks).toFixed(2)) : 0);
    const cpm = Number(ins?.cpm) || (impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : 0);

    let landing_page_views = 0;
    let initiate_checkout = 0;
    let purchases = 0;

    if (Array.isArray(ins?.actions)) {
      for (const act of ins.actions) {
        if (['landing_page_view', 'omni_landing_page_view'].includes(act.action_type)) {
          landing_page_views = Math.max(landing_page_views, Number(act.value) || 0);
        }
        if (['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'].includes(act.action_type)) {
          initiate_checkout = Math.max(initiate_checkout, Number(act.value) || 0);
        }
        if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(act.action_type)) {
          purchases = Math.max(purchases, Number(act.value) || 0);
        }
      }
    }

    return {
      spend,
      impressions,
      reach,
      frequency: Number(frequency.toFixed(2)),
      clicks,
      inline_link_clicks,
      ctr: Number(ctr.toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      cpm: Number(cpm.toFixed(2)),
      landing_page_views,
      initiate_checkout,
      purchases
    };
  }

  async function syncMeta(force = false) {
    let meta;
    try {
      meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
    } catch {
      return;
    }
    if (!meta || !meta.access_token || meta.mode !== 'real') return;

    const accountId = meta.account_id.startsWith('act_') ? meta.account_id : `act_${meta.account_id}`;

    try {
      const insightFields = 'insights.date_preset(today){spend,impressions,reach,frequency,clicks,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpc,ctr,cpm,actions,action_values}';
      const campUrl = `https://graph.facebook.com/v20.0/${accountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,${insightFields}&access_token=${meta.access_token}`;
      const adsetUrl = `https://graph.facebook.com/v20.0/${accountId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,campaign_id,${insightFields}&access_token=${meta.access_token}`;
      const adsUrl = `https://graph.facebook.com/v20.0/${accountId}/ads?fields=id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,image_url,object_story_spec},${insightFields}&access_token=${meta.access_token}`;

      const [campRes, adsetRes, adsRes] = await Promise.all([
        fetch(campUrl).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(adsetUrl).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(adsUrl).then(r => r.json()).catch(() => ({ data: [] }))
      ]);

      if (campRes.error) {
        console.error('Meta API Sync Error:', campRes.error);
        return;
      }

      const campaigns = campRes.data || [];
      const adsets = adsetRes.data || [];
      const creatives = adsRes.data || [];

      if (!campaigns.length && !adsets.length) return;

      // Clean default simulation meta rows and legacy flattened adset rows from ads_campaigns
      try {
        db.prepare("DELETE FROM ads_campaigns WHERE platform='meta' AND (id LIKE 'meta-cmp%' OR name LIKE '%↳ Conjunto%')").run();
      } catch {}

      const upsertCamp = db.prepare(`
        INSERT INTO ads_campaigns (id, platform, name, strategy, status, daily_budget, spend, impressions, clicks, orders, revenue, roas, cpa, ctr, cpc, reach, frequency, inline_link_clicks, cpm, landing_page_views, initiate_checkout, purchases, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          strategy = excluded.strategy,
          status = excluded.status,
          daily_budget = excluded.daily_budget,
          spend = excluded.spend,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          orders = excluded.orders,
          revenue = excluded.revenue,
          roas = excluded.roas,
          cpa = excluded.cpa,
          ctr = excluded.ctr,
          cpc = excluded.cpc,
          reach = excluded.reach,
          frequency = excluded.frequency,
          inline_link_clicks = excluded.inline_link_clicks,
          cpm = excluded.cpm,
          landing_page_views = excluded.landing_page_views,
          initiate_checkout = excluded.initiate_checkout,
          purchases = excluded.purchases,
          updated_at = excluded.updated_at
      `);

      const upsertAdset = db.prepare(`
        INSERT INTO ads_adsets (id, campaign_id, platform, name, status, daily_budget, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, landing_page_views, initiate_checkout, purchases, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          campaign_id = excluded.campaign_id,
          name = excluded.name,
          status = excluded.status,
          daily_budget = excluded.daily_budget,
          spend = excluded.spend,
          impressions = excluded.impressions,
          reach = excluded.reach,
          frequency = excluded.frequency,
          clicks = excluded.clicks,
          inline_link_clicks = excluded.inline_link_clicks,
          ctr = excluded.ctr,
          cpc = excluded.cpc,
          cpm = excluded.cpm,
          landing_page_views = excluded.landing_page_views,
          initiate_checkout = excluded.initiate_checkout,
          purchases = excluded.purchases,
          updated_at = excluded.updated_at
      `);

      const upsertCreative = db.prepare(`
        INSERT INTO ads_creatives (id, adset_id, campaign_id, platform, name, status, thumbnail_url, high_res_image_url, video_url, preview_url, creative_text, daily_budget, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, landing_page_views, initiate_checkout, purchases, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          adset_id = excluded.adset_id,
          campaign_id = excluded.campaign_id,
          name = excluded.name,
          status = excluded.status,
          thumbnail_url = excluded.thumbnail_url,
          high_res_image_url = excluded.high_res_image_url,
          video_url = excluded.video_url,
          preview_url = excluded.preview_url,
          creative_text = excluded.creative_text,
          daily_budget = excluded.daily_budget,
          spend = excluded.spend,
          impressions = excluded.impressions,
          reach = excluded.reach,
          frequency = excluded.frequency,
          clicks = excluded.clicks,
          inline_link_clicks = excluded.inline_link_clicks,
          ctr = excluded.ctr,
          cpc = excluded.cpc,
          cpm = excluded.cpm,
          landing_page_views = excluded.landing_page_views,
          initiate_checkout = excluded.initiate_checkout,
          purchases = excluded.purchases,
          updated_at = excluded.updated_at
      `);

      // 1. Process Campaigns
      for (const c of campaigns) {
        const ins = c.insights?.data?.[0] || {};
        const m = extractMetrics(ins);
        const childAdsets = adsets.filter(a => a.campaign_id === c.id);
        const childBudgetSum = childAdsets.reduce((sum, a) => sum + (Number(a.daily_budget) || 0), 0);
        const dailyBudget = Number(c.daily_budget) || childBudgetSum || 5400;

        const strategy = c.name.toUpperCase().includes('CBO') ? 'CBO' : c.name.toUpperCase().includes('ABO') ? 'ABO' : 'Sales';
        const orders = m.purchases;
        const revenue = orders * 19990;
        const roas = m.spend > 0 && revenue > 0 ? Number((revenue / m.spend).toFixed(2)) : 0;
        const cpa = orders > 0 ? Math.round(m.spend / orders) : 0;

        upsertCamp.run(
          c.id, 'meta', c.name, strategy, c.status, dailyBudget, m.spend, m.impressions, m.clicks,
          orders, revenue, roas, cpa, m.ctr, m.cpc, m.reach, m.frequency, m.inline_link_clicks, m.cpm,
          m.landing_page_views, m.initiate_checkout, m.purchases, clock()
        );
      }

      // 2. Process AdSets
      for (const a of adsets) {
        const ins = a.insights?.data?.[0] || {};
        const m = extractMetrics(ins);
        const dailyBudget = Number(a.daily_budget) || 1800;

        upsertAdset.run(
          a.id, a.campaign_id, 'meta', a.name, a.status, dailyBudget, m.spend, m.impressions,
          m.reach, m.frequency, m.clicks, m.inline_link_clicks, m.ctr, m.cpc, m.cpm,
          m.landing_page_views, m.initiate_checkout, m.purchases, clock()
        );
      }

      // 3. Process Creatives (Ads & Videos)
      for (const ad of creatives) {
        const ins = ad.insights?.data?.[0] || {};
        const m = extractMetrics(ins);
        const parentAdset = adsets.find(a => a.id === ad.adset_id);
        const dailyBudget = parentAdset ? (Number(parentAdset.daily_budget) || 1800) : 1800;
        const imgFromLinkData = ad.creative?.object_story_spec?.link_data?.picture || ad.creative?.object_story_spec?.photo_data?.url;
        const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url || imgFromLinkData || '';
        const videoImg = ad.creative?.object_story_spec?.video_data?.image_url;
        const highRes = videoImg || ad.creative?.image_url || imgFromLinkData || thumb;
        const creativeText = ad.creative?.object_story_spec?.video_data?.message || ad.creative?.object_story_spec?.link_data?.message || ad.creative?.name || '';
        const videoId = ad.creative?.object_story_spec?.video_data?.video_id;

        let videoUrl = '';
        if (videoId) {
          try {
            const vidRes = await fetch(`https://graph.facebook.com/v20.0/${videoId}?fields=source&access_token=${meta.access_token}`).then(r => r.json());
            if (vidRes?.source) videoUrl = vidRes.source;
          } catch {}
        }

        let previewUrl = '';
        try {
          const prevRes = await fetch(`https://graph.facebook.com/v20.0/${ad.id}/previews?ad_format=DESKTOP_FEED_STANDARD&access_token=${meta.access_token}`).then(r => r.json());
          const body = prevRes?.data?.[0]?.body || '';
          const match = body.match(/src="([^"]+)"/);
          if (match) previewUrl = match[1].replace(/&amp;/g, '&');
        } catch {}

        upsertCreative.run(
          ad.id, ad.adset_id, ad.campaign_id, 'meta', ad.name, ad.status, thumb, highRes, videoUrl, previewUrl, creativeText,
          dailyBudget, m.spend, m.impressions, m.reach, m.frequency, m.clicks, m.inline_link_clicks,
          m.ctr, m.cpc, m.cpm, m.landing_page_views, m.initiate_checkout, m.purchases, clock()
        );
      }
    } catch (err) {
      console.error('Meta Sync Exception:', err);
    }
  }

  return {
    syncMeta,

    // 1. Credentials
    getCredentials() {
      const rows = db.prepare('SELECT platform, account_id, access_token, pixel_id, app_secret, mode, updated_at FROM ads_credentials').all();
      const meta = rows.find(r => r.platform === 'meta') || null;
      const tiktok = rows.find(r => r.platform === 'tiktok') || null;

      return {
        meta: meta ? {
          configured: Boolean(meta.access_token),
          accountId: meta.account_id || '',
          pixelId: meta.pixel_id || '',
          mode: meta.mode || 'simulation',
          tokenPreview: mask(meta.access_token, 6, 4),
          updatedAt: meta.updated_at
        } : { configured: false, accountId: '', pixelId: '', mode: 'simulation', tokenPreview: '', updatedAt: null },
        tiktok: tiktok ? {
          configured: Boolean(tiktok.access_token),
          accountId: tiktok.account_id || '',
          pixelId: tiktok.pixel_id || '',
          mode: tiktok.mode || 'simulation',
          tokenPreview: mask(tiktok.access_token, 6, 4),
          updatedAt: tiktok.updated_at
        } : { configured: false, accountId: '', pixelId: '', mode: 'simulation', tokenPreview: '', updatedAt: null }
      };
    },

    saveCredentials(platform, data) {
      if (!['meta', 'tiktok'].includes(platform)) throw new Error('Plataforma no válida.');
      const accountId = String(data.accountId || '').trim();
      const token = String(data.accessToken || '').trim();
      const pixelId = String(data.pixelId || '').trim();
      const appSecret = String(data.appSecret || '').trim();
      const mode = data.mode === 'real' ? 'real' : 'simulation';

      const existing = db.prepare('SELECT access_token FROM ads_credentials WHERE platform=?').get(platform);
      const tokenToSave = token || existing?.access_token || '';

      db.prepare(`
        INSERT INTO ads_credentials (platform, account_id, access_token, pixel_id, app_secret, mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform) DO UPDATE SET
          account_id = excluded.account_id,
          access_token = excluded.access_token,
          pixel_id = excluded.pixel_id,
          app_secret = excluded.app_secret,
          mode = excluded.mode,
          updated_at = excluded.updated_at
      `).run(platform, accountId, tokenToSave, pixelId, appSecret, mode, clock());

      return this.getCredentials();
    },

    // 2. Campaigns
    listCampaigns(filters = {}) {
      let query = 'SELECT * FROM ads_campaigns WHERE 1=1';
      const params = [];
      if (filters.platform && filters.platform !== 'all') {
        query += ' AND platform=?';
        params.push(filters.platform);
      }
      if (filters.status && filters.status !== 'all') {
        query += ' AND status=?';
        params.push(filters.status);
      }
      query += ' ORDER BY spend DESC, orders DESC';
      return db.prepare(query).all(...params);
    },

    getHierarchy(platform = 'meta') {
      let campQuery = 'SELECT * FROM ads_campaigns';
      const params = [];
      if (platform !== 'all') {
        campQuery += ' WHERE platform=?';
        params.push(platform);
      }
      campQuery += " ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC, updated_at DESC";

      const campaigns = db.prepare(campQuery).all(...params);
      const adsets = db.prepare("SELECT * FROM ads_adsets ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC").all();
      const creatives = db.prepare("SELECT * FROM ads_creatives ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC").all();

      return campaigns.map(c => {
        const childAdsets = adsets.filter(a => a.campaign_id === c.id);
        const formattedAdsets = childAdsets.map(a => {
          const childAds = creatives.filter(cr => cr.adset_id === a.id);
          return {
            ...a,
            ads: childAds
          };
        });
        return {
          ...c,
          adsets: formattedAdsets
        };
      });
    },

    toggleCampaign(id, status) {
      const valid = ['ACTIVE', 'PAUSED'].includes(status) ? status : null;
      if (!valid) throw new Error('Estado inválido. Debe ser ACTIVE o PAUSED.');

      try {
        const meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
        if (meta?.access_token && meta.mode === 'real') {
          fetch(`https://graph.facebook.com/v20.0/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: valid, access_token: meta.access_token })
          }).catch(() => {});
        }
      } catch {}

      const res = db.prepare('UPDATE ads_campaigns SET status=?, updated_at=? WHERE id=?').run(valid, clock(), id);
      if (!res.changes) throw new Error('Campaña no encontrada.');
      return db.prepare('SELECT * FROM ads_campaigns WHERE id=?').get(id);
    },

    toggleAdSet(id, status) {
      const valid = ['ACTIVE', 'PAUSED'].includes(status) ? status : null;
      if (!valid) throw new Error('Estado inválido. Debe ser ACTIVE o PAUSED.');

      try {
        const meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
        if (meta?.access_token && meta.mode === 'real') {
          fetch(`https://graph.facebook.com/v20.0/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: valid, access_token: meta.access_token })
          }).catch(() => {});
        }
      } catch {}

      db.prepare('UPDATE ads_adsets SET status=?, updated_at=? WHERE id=?').run(valid, clock(), id);
      return db.prepare('SELECT * FROM ads_adsets WHERE id=?').get(id);
    },

    toggleCreative(id, status) {
      const valid = ['ACTIVE', 'PAUSED'].includes(status) ? status : null;
      if (!valid) throw new Error('Estado inválido. Debe ser ACTIVE o PAUSED.');

      try {
        const meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
        if (meta?.access_token && meta.mode === 'real') {
          fetch(`https://graph.facebook.com/v20.0/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: valid, access_token: meta.access_token })
          }).catch(() => {});
        }
      } catch {}

      db.prepare('UPDATE ads_creatives SET status=?, updated_at=? WHERE id=?').run(valid, clock(), id);
      return db.prepare('SELECT * FROM ads_creatives WHERE id=?').get(id);
    },

    updateBudget(id, { value, type = 'percentage' }) {
      const cmp = db.prepare('SELECT * FROM ads_campaigns WHERE id=?').get(id);
      if (!cmp) throw new Error('Campaña no encontrada.');

      let newBudget = cmp.daily_budget;
      if (type === 'percentage') {
        newBudget = Math.round(cmp.daily_budget * (1 + value / 100));
      } else {
        newBudget = Math.round(Number(value));
      }

      if (newBudget < 1000) newBudget = 1000;
      if (newBudget > 10000000) newBudget = 10000000;

      try {
        const meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
        if (meta?.access_token && meta.mode === 'real') {
          fetch(`https://graph.facebook.com/v20.0/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daily_budget: newBudget, access_token: meta.access_token })
          }).catch(() => {});
        }
      } catch {}

      db.prepare('UPDATE ads_campaigns SET daily_budget=?, updated_at=? WHERE id=?').run(newBudget, clock(), id);
      return db.prepare('SELECT * FROM ads_campaigns WHERE id=?').get(id);
    },

    updateAdSetBudget(id, { value, type = 'percentage' }) {
      const adset = db.prepare('SELECT * FROM ads_adsets WHERE id=?').get(id);
      if (!adset) throw new Error('Conjunto no encontrado.');

      let newBudget = adset.daily_budget;
      if (type === 'percentage') {
        newBudget = Math.round(adset.daily_budget * (1 + value / 100));
      } else {
        newBudget = Math.round(Number(value));
      }

      if (newBudget < 1000) newBudget = 1000;
      if (newBudget > 10000000) newBudget = 10000000;

      try {
        const meta = db.prepare("SELECT * FROM ads_credentials WHERE platform='meta'").get();
        if (meta?.access_token && meta.mode === 'real') {
          fetch(`https://graph.facebook.com/v20.0/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daily_budget: newBudget, access_token: meta.access_token })
          }).catch(() => {});
        }
      } catch {}

      db.prepare('UPDATE ads_adsets SET daily_budget=?, updated_at=? WHERE id=?').run(newBudget, clock(), id);

      // Also update total daily budget on the parent campaign
      try {
        const siblings = db.prepare('SELECT daily_budget FROM ads_adsets WHERE campaign_id=?').all(adset.campaign_id);
        const sum = siblings.reduce((acc, s) => acc + (Number(s.daily_budget) || 0), 0);
        db.prepare('UPDATE ads_campaigns SET daily_budget=?, updated_at=? WHERE id=?').run(sum, clock(), adset.campaign_id);
      } catch {}

      return db.prepare('SELECT * FROM ads_adsets WHERE id=?').get(id);
    },

    // 3. Rules & Automations
    listRules() {
      return db.prepare('SELECT * FROM ads_rules ORDER BY created_at DESC').all();
    },

    createRule(rule) {
      const id = 'rule-' + randomUUID().slice(0, 8);
      const name = String(rule.name || '').trim();
      if (!name) throw new Error('El nombre de la regla es obligatorio.');
      const platform = ['all', 'meta', 'tiktok'].includes(rule.platform) ? rule.platform : 'all';
      const metric = ['orders', 'roas', 'cpa', 'spend', 'ctr'].includes(rule.metric) ? rule.metric : 'orders';
      const operator = ['>=', '<=', '>', '<', '=='].includes(rule.operator) ? rule.operator : '>=';
      const threshold = Number(rule.threshold);
      if (!Number.isFinite(threshold)) throw new Error('El valor umbral debe ser numérico.');
      const action = ['scale_budget_percent', 'reduce_budget_percent', 'pause_campaign', 'activate_campaign'].includes(rule.action) ? rule.action : 'scale_budget_percent';
      const actionValue = Number(rule.actionValue || rule.action_value || 20);
      const frequency = String(rule.frequency || 'every_6h');

      db.prepare(`
        INSERT INTO ads_rules (id, name, platform, metric, operator, threshold, action, action_value, frequency, enabled, trigger_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
      `).run(id, name, platform, metric, operator, threshold, action, actionValue, frequency, clock());

      return db.prepare('SELECT * FROM ads_rules WHERE id=?').get(id);
    },

    toggleRule(id, enabled) {
      const res = db.prepare('UPDATE ads_rules SET enabled=? WHERE id=?').run(enabled ? 1 : 0, id);
      if (!res.changes) throw new Error('Regla no encontrada.');
      return db.prepare('SELECT * FROM ads_rules WHERE id=?').get(id);
    },

    deleteRule(id) {
      const res = db.prepare('DELETE FROM ads_rules WHERE id=?').run(id);
      if (!res.changes) throw new Error('Regla no encontrada.');
      return { deleted: true };
    },

    // 4. Execution Engine
    evaluateAutomations() {
      const rules = db.prepare('SELECT * FROM ads_rules WHERE enabled=1').all();
      const campaigns = db.prepare('SELECT * FROM ads_campaigns').all();
      const executedLogs = [];

      for (const rule of rules) {
        const targetCampaigns = campaigns.filter(c => rule.platform === 'all' || c.platform === rule.platform);

        for (const c of targetCampaigns) {
          let valueToCompare = 0;
          if (rule.metric === 'orders') valueToCompare = c.orders;
          else if (rule.metric === 'roas') valueToCompare = c.roas;
          else if (rule.metric === 'cpa') valueToCompare = c.cpa;
          else if (rule.metric === 'spend') valueToCompare = c.spend;
          else if (rule.metric === 'ctr') valueToCompare = c.ctr;

          let matches = false;
          if (rule.operator === '>=') matches = valueToCompare >= rule.threshold;
          else if (rule.operator === '<=') matches = valueToCompare <= rule.threshold;
          else if (rule.operator === '>') matches = valueToCompare > rule.threshold;
          else if (rule.operator === '<') matches = valueToCompare < rule.threshold;
          else if (rule.operator === '==') matches = valueToCompare === rule.threshold;

          if (rule.id === 'rule-stoploss-zero' && c.orders > 0) {
            matches = false;
          }

          if (matches) {
            let details = '';
            let newBudget = c.daily_budget;

            if (rule.action === 'scale_budget_percent') {
              if (c.status !== 'ACTIVE') continue;
              const pct = rule.action_value || 20;
              newBudget = Math.round(c.daily_budget * (1 + pct / 100));
              details = `Presupuesto incrementado de $${c.daily_budget.toLocaleString('es-CL')} a $${newBudget.toLocaleString('es-CL')} (+${pct}%) al registrar ${c.orders} pedidos.`;
              db.prepare('UPDATE ads_campaigns SET daily_budget=?, updated_at=? WHERE id=?').run(newBudget, clock(), c.id);
            } else if (rule.action === 'reduce_budget_percent') {
              if (c.status !== 'ACTIVE') continue;
              const pct = rule.action_value || 15;
              newBudget = Math.round(c.daily_budget * (1 - pct / 100));
              details = `Presupuesto reducido de $${c.daily_budget.toLocaleString('es-CL')} a $${newBudget.toLocaleString('es-CL')} (-${pct}%) por fatiga o CPA elevado.`;
              db.prepare('UPDATE ads_campaigns SET daily_budget=?, updated_at=? WHERE id=?').run(newBudget, clock(), c.id);
            } else if (rule.action === 'pause_campaign') {
              if (c.status === 'PAUSED') continue;
              details = `Campaña pausada automáticamente por regla Stop-Loss tras gastar $${c.spend.toLocaleString('es-CL')} con ${c.orders} pedidos.`;
              db.prepare('UPDATE ads_campaigns SET status=?, updated_at=? WHERE id=?').run('PAUSED', clock(), c.id);
            } else if (rule.action === 'activate_campaign') {
              if (c.status === 'ACTIVE') continue;
              details = `Campaña reactivada automáticamente por regla programada.`;
              db.prepare('UPDATE ads_campaigns SET status=?, updated_at=? WHERE id=?').run('ACTIVE', clock(), c.id);
            }

            const logId = 'log-' + randomUUID().slice(0, 8);
            db.prepare(`
              INSERT INTO ads_logs (id, rule_id, rule_name, platform, campaign_id, campaign_name, action, details, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(logId, rule.id, rule.name, c.platform, c.id, c.name, rule.action, details, clock());

            db.prepare('UPDATE ads_rules SET last_triggered_at=?, trigger_count=trigger_count+1 WHERE id=?').run(clock(), rule.id);

            executedLogs.push({ id: logId, campaignName: c.name, ruleName: rule.name, action: rule.action, details });
          }
        }
      }

      return {
        evaluatedRules: rules.length,
        actionsExecuted: executedLogs.length,
        logs: executedLogs
      };
    },

    // 5. Logs & Metrics Summary
    listLogs(limit = 50) {
      return db.prepare('SELECT * FROM ads_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
    },

    getSummary() {
      const campaigns = db.prepare('SELECT * FROM ads_campaigns').all();
      const totalSpend = campaigns.reduce((acc, c) => acc + c.spend, 0);
      const totalRevenue = campaigns.reduce((acc, c) => acc + c.revenue, 0);
      const totalOrders = campaigns.reduce((acc, c) => acc + c.orders, 0);
      const totalClicks = campaigns.reduce((acc, c) => acc + c.clicks, 0);
      const totalImpressions = campaigns.reduce((acc, c) => acc + c.impressions, 0);

      const blendedRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : 0;
      const blendedCpa = totalOrders > 0 ? Math.round(totalSpend / totalOrders) : 0;
      const blendedCtr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;

      const metaSpend = campaigns.filter(c => c.platform === 'meta').reduce((acc, c) => acc + c.spend, 0);
      const tiktokSpend = campaigns.filter(c => c.platform === 'tiktok').reduce((acc, c) => acc + c.spend, 0);

      return {
        totalSpend,
        totalRevenue,
        totalOrders,
        blendedRoas,
        blendedCpa,
        blendedCtr,
        totalClicks,
        totalImpressions,
        platformBreakdown: {
          meta: { spend: metaSpend, count: campaigns.filter(c => c.platform === 'meta').length },
          tiktok: { spend: tiktokSpend, count: campaigns.filter(c => c.platform === 'tiktok').length }
        },
        activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
        pausedCampaigns: campaigns.filter(c => c.status === 'PAUSED').length
      };
    }
  };
}
