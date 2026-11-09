import json
import sys
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

cfgroot = Path(r'F:/Open Code/Wentix AI Shopify Dropshipping/storage/studio/deployment')
cfg = json.loads((cfgroot / 'credentials.json').read_text(encoding='utf-8-sig'))

client = paramiko.SSHClient()
client.load_system_host_keys()
client.load_host_keys(str(cfgroot / 'known_hosts'))
client.connect(cfg['host'], port=cfg['port'], username=cfg['username'], password=cfg['password'], timeout=20)

cmd = "python3 -c \"content=open('/opt/dropea-crm/releases/20261108T151502Z-metallic-contrast-persist/dist/assets/index-CJ4tcLfi.js').read(); idx=content.find('Nueva venta', 604000); print('Found at:', idx); print(content[idx-100:idx+600])\""
_, out, err = client.exec_command(cmd)
print(out.read().decode('utf-8'))
if err: print('ERR:', err.read().decode('utf-8'))

client.close()
