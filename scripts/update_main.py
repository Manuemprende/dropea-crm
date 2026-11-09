import re

with open('src/main.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Reorder navigation
content = re.sub(
    r"const navigation = \[[\s\S]*?\{ name: 'Meta & TikTok Ads'[\s\S]*?\];",
    """const navigation = [
  { name: 'Vista general', icon: SquaresFour, color: '#69b8ff' },
  { name: 'Meta & TikTok Ads', icon: Megaphone, color: '#38bdf8' },
  { name: 'Pedidos', icon: Package, color: '#f2b963' },
  { name: 'WhatsApp', icon: WhatsappLogo, color: '#25D366' },
  { name: 'Live / Landings', icon: Pulse, color: '#a69bff' },
  { name: 'Seguimiento', icon: Truck, color: '#3b82f6' },
  { name: 'Estadísticas', icon: ChartLineUp, color: '#63dfb3' },
  { name: 'Tiendas', icon: Storefront, color: '#ff95b6' },
  { name: 'Productos', icon: Cube, color: '#b499ff' },
  { name: 'Landings', icon: GlobeHemisphereWest, color: '#60d7ec' },
  { name: 'Incidencias', icon: WarningCircle, color: '#ff966f' },
  { name: 'Wallet', icon: Wallet, color: '#f1d26d' }
];""",
    content
)

# 2. Remove test-sale-btn
content = re.sub(
    r'<button type="button" className="test-sale-btn"[\s\S]*?<\/button>',
    '',
    content
)

# 3. Remove test-sale-head-btn
content = re.sub(
    r'<button className="button test-sale-head-btn"[\s\S]*?<\/button>',
    '',
    content
)

with open('src/main.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated src/main.tsx successfully')
