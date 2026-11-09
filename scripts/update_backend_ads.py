import re

# 1. Update server/ads-manager.js
with open('server/ads-manager.js', 'r', encoding='utf-8') as f:
    ads_content = f.read()

# Fix creative parsing in syncMeta
old_creative_parse = """        const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url || '';
        const videoImg = ad.creative?.object_story_spec?.video_data?.image_url;
        const highRes = videoImg || ad.creative?.image_url || thumb;
        const creativeText = ad.creative?.object_story_spec?.video_data?.message || ad.creative?.name || '';
        const videoId = ad.creative?.object_story_spec?.video_data?.video_id;"""

new_creative_parse = """        const imgFromLinkData = ad.creative?.object_story_spec?.link_data?.picture || ad.creative?.object_story_spec?.photo_data?.url;
        const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url || imgFromLinkData || '';
        const videoImg = ad.creative?.object_story_spec?.video_data?.image_url;
        const highRes = videoImg || ad.creative?.image_url || imgFromLinkData || thumb;
        const creativeText = ad.creative?.object_story_spec?.video_data?.message || ad.creative?.object_story_spec?.link_data?.message || ad.creative?.name || '';
        const videoId = ad.creative?.object_story_spec?.video_data?.video_id;"""

assert old_creative_parse in ads_content, 'old_creative_parse not found'
ads_content = ads_content.replace(old_creative_parse, new_creative_parse)

# Fix getHierarchy ordering
old_hierarchy = """    getHierarchy(platform = 'meta') {
      let campQuery = 'SELECT * FROM ads_campaigns';
      const params = [];
      if (platform !== 'all') {
        campQuery += ' WHERE platform=?';
        params.push(platform);
      }
      campQuery += ' ORDER BY spend DESC';

      const campaigns = db.prepare(campQuery).all(...params);
      const adsets = db.prepare('SELECT * FROM ads_adsets ORDER BY spend DESC').all();
      const creatives = db.prepare('SELECT * FROM ads_creatives ORDER BY spend DESC').all();"""

new_hierarchy = """    getHierarchy(platform = 'meta') {
      let campQuery = 'SELECT * FROM ads_campaigns';
      const params = [];
      if (platform !== 'all') {
        campQuery += ' WHERE platform=?';
        params.push(platform);
      }
      campQuery += " ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC, updated_at DESC";

      const campaigns = db.prepare(campQuery).all(...params);
      const adsets = db.prepare("SELECT * FROM ads_adsets ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC").all();
      const creatives = db.prepare("SELECT * FROM ads_creatives ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, spend DESC").all();"""

assert old_hierarchy in ads_content, 'old_hierarchy not found'
ads_content = ads_content.replace(old_hierarchy, new_hierarchy)

with open('server/ads-manager.js', 'w', encoding='utf-8') as f:
    f.write(ads_content)

print('Updated server/ads-manager.js')

# 2. Update server/index.js
with open('server/index.js', 'r', encoding='utf-8') as f:
    idx_content = f.read()

old_idx = """app.get('/api/ads/hierarchy', asyncRoute(async (req, res) => {
  if (req.query.sync === 'true') await ads.syncMeta(true);
  res.json(ads.getHierarchy(req.query.platform || 'all'));
}));"""

new_idx = """let lastAutoMetaSync = 0;
app.get('/api/ads/hierarchy', asyncRoute(async (req, res) => {
  const now = Date.now();
  if (req.query.sync === 'true' || (now - lastAutoMetaSync > 30000)) {
    try {
      await ads.syncMeta(true);
      lastAutoMetaSync = now;
    } catch {}
  }
  res.json(ads.getHierarchy(req.query.platform || 'all'));
}));"""

assert old_idx in idx_content, 'old_idx not found'
idx_content = idx_content.replace(old_idx, new_idx)

with open('server/index.js', 'w', encoding='utf-8') as f:
    f.write(idx_content)

print('Updated server/index.js')
