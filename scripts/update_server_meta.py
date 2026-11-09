with open('server/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

import_stmt = "import { createMetaWhatsAppManager } from './whatsapp-meta.js';"
if import_stmt not in content:
    content = content.replace("import {createAdsManager} from './ads-manager.js';", "import {createAdsManager} from './ads-manager.js';\nimport { createMetaWhatsAppManager } from './whatsapp-meta.js';")

init_stmt = "const metaWhatsApp = createMetaWhatsAppManager({ db });"
if init_stmt not in content:
    content = content.replace("const ads = createAdsManager({ db, encryptionKey });", "const ads = createAdsManager({ db, encryptionKey });\nconst metaWhatsApp = createMetaWhatsAppManager({ db });")

routes = """// Meta WhatsApp Cloud API Endpoints
app.get('/api/whatsapp/meta', (_req, res) => res.json(metaWhatsApp.getCredentials()));
app.post('/api/whatsapp/meta', asyncRoute(async (req, res) => res.json(await metaWhatsApp.saveCredentials(req.body || {}))));
app.post('/api/whatsapp/meta/test', asyncRoute(async (req, res) => res.json(await metaWhatsApp.sendTestMessage(req.body || {}))));
"""
if '/api/whatsapp/meta' not in content:
    content = content.replace("app.post('/api/whatsapp/disconnect',", routes + "\napp.post('/api/whatsapp/disconnect',")

with open('server/index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated server/index.js successfully')
