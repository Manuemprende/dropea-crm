import os
import json
import base64
import urllib.request
import urllib.error

TOKEN = os.environ.get('GITHUB_TOKEN') or os.environ.get('GITHUB_PERSONAL_ACCESS_TOKEN')
OWNER = "Manuemprende"
REPO = "dropea-crm"
BRANCH = "main"

if not TOKEN:
    raise ValueError("GITHUB_TOKEN not found in environment")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Wentix-Sync-Tool"
}

def api_request(endpoint, method="GET", data=None):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/{endpoint}".lstrip('/')
    req = urllib.request.Request(url, headers=HEADERS, method=method)
    if data is not None:
        req.data = json.dumps(data).encode('utf-8')
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"Error {e.code} on {method} {url}: {err_body}")
        raise

print(f"Checking {OWNER}/{REPO}...")
ref_data = api_request(f"git/ref/heads/{BRANCH}")
latest_commit_sha = ref_data["object"]["sha"]
print(f"Latest commit SHA: {latest_commit_sha}")

commit_data = api_request(f"git/commits/{latest_commit_sha}")
base_tree_sha = commit_data["tree"]["sha"]
print(f"Base tree SHA: {base_tree_sha}")

IGNORED_DIRS = {
    'node_modules', 'dist', 'data', 'artifacts', 'test-results', 
    'playwright-report', '.git', '.gemini', '__pycache__', '.vscode', '.idea'
}

IGNORED_EXTS = {'.tsbuildinfo', '.log', '.tar.gz', '.tmp'}

tree_items = []
file_count = 0

for root, dirs, files in os.walk('.'):
    # filter directories in-place
    dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith('.')]
    
    for filename in files:
        if filename.startswith('.') and filename not in ['.env.example', '.gitignore']:
            continue
        _, ext = os.path.splitext(filename)
        if ext in IGNORED_EXTS:
            continue
        if filename == '.env':
            continue
            
        full_path = os.path.join(root, filename)
        rel_path = os.path.relpath(full_path, '.').replace('\\', '/')
        
        # Read file bytes
        with open(full_path, 'rb') as f:
            content_bytes = f.read()
            
        content_b64 = base64.b64encode(content_bytes).decode('utf-8')
        
        # Create blob
        blob_res = api_request("git/blobs", method="POST", data={
            "content": content_b64,
            "encoding": "base64"
        })
        
        tree_items.append({
            "path": rel_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_res["sha"]
        })
        file_count += 1
        if file_count % 20 == 0:
            print(f"Uploaded {file_count} blobs...")

print(f"Total blobs uploaded: {len(tree_items)}")

# Create new tree
print("Creating git tree...")
new_tree = api_request("git/trees", method="POST", data={
    "base_tree": base_tree_sha,
    "tree": tree_items
})
new_tree_sha = new_tree["sha"]
print(f"New Tree SHA: {new_tree_sha}")

# Create commit
commit_msg = "feat: initial release of Dropea CRM community edition (MIT)\n\n- Multi-market Dropea Hub (CL, ES, IT, PT, MX)\n- Meta Ads Manager with Live Graph API v20.0 and Auto-Scaling Rules\n- TikTok Marketing Ads Manager\n- WhatsApp Confirmation & Retention Engine (Baileys QR & Meta Cloud API)\n- Live Landings with Geolocation Tracker & Webhooks\n- Calculadora Proyecto Libertad (Drop Profit Calculator)\n- Mobile-First responsive redesign\n- Full MIT License & Community Documentation"

print("Creating commit...")
new_commit = api_request("git/commits", method="POST", data={
    "message": commit_msg,
    "tree": new_tree_sha,
    "parents": [latest_commit_sha]
})
new_commit_sha = new_commit["sha"]
print(f"New Commit SHA: {new_commit_sha}")

# Update branch ref
print("Updating branch ref...")
updated_ref = api_request(f"git/refs/heads/{BRANCH}", method="PATCH", data={
    "sha": new_commit_sha,
    "force": False
})
print("Successfully pushed to GitHub!")
print(f"Repository URL: https://github.com/{OWNER}/{REPO}")
print(f"Commit URL: https://github.com/{OWNER}/{REPO}/commit/{new_commit_sha}")
