import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.urlopen('https://dropeacrm.cyou/api/ads/hierarchy?platform=meta&sync=true', context=ctx)
data = json.loads(req.read().decode('utf-8'))
print(f'Total campaigns returned: {len(data)}')
for i, c in enumerate(data):
    print(f"[{i}] Status: {c.get('status')} | Name: {c.get('name')} | Spend: {c.get('spend')} | Adsets: {len(c.get('adsets', []))}")
    for a in c.get('adsets', []):
        print(f"    -> AdSet: {a.get('name')} | Ads: {len(a.get('ads', []))}")
