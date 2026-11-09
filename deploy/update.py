"""Update the authorized VPS, preserving state and rolling back on deployment failure."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import sys
import tarfile
import paramiko

sys.stdout.reconfigure(encoding='utf-8')
workspace = Path(__file__).resolve().parent.parent
os.chdir(workspace)
access = json.loads((workspace / 'data/deployment-access.json').read_text(encoding='utf-8'))
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
release = f'/opt/dropea-crm/releases/{stamp}'
backup = f'/root/dropea-deploy-backup/{stamp}'
bundle = workspace / 'data/deployment-update.tar.gz'
with tarfile.open(bundle, 'w:gz') as archive:
    for name in ['dist', 'server', 'deploy', 'package.json', 'package-lock.json']:
        archive.add(workspace / name, arcname=name, filter=lambda entry: None if '__pycache__' in entry.name else entry)

ssh = paramiko.SSHClient()
ssh.load_host_keys(str(workspace / 'data/vps-known-hosts'))
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect('161.97.160.76', username='root', password=os.environ['DROPEA_SSH_PASSWORD'], timeout=20, look_for_keys=False, allow_agent=False)
sftp = ssh.open_sftp()

def run(label, script, timeout=120):
    print(label, flush=True)
    stdin, stdout, stderr = ssh.exec_command('bash -se', timeout=timeout)
    stdin.write(script)
    stdin.channel.shutdown_write()
    output, errors = stdout.read().decode(errors='replace'), stderr.read().decode(errors='replace')
    status = stdout.channel.recv_exit_status()
    if output.strip(): print(output.strip(), flush=True)
    if status:
        print(errors[-4000:], flush=True)
        raise RuntimeError(f'{label} failed (exit {status})')

previous = sftp.normalize('/opt/dropea-crm/current')
mutated = False
try:
    run('Backing up the live database, environment and Nginx site', f'''
install -d -m 700 {backup}
cp -p /etc/dropea-crm/runtime.env {backup}/runtime.env
cp -p /etc/nginx/sites-available/dropeacrm.cyou {backup}/nginx.conf
/usr/bin/python3 /opt/dropea-crm/current/deploy/backup.py
install -d -m 755 {release}
''')
    sftp.put(str(bundle), f'/tmp/dropea-update-{stamp}.tar.gz')
    run('Preparing and testing the new release', f'''
tar -xzf /tmp/dropea-update-{stamp}.tar.gz -C {release}
if cmp -s {release}/package-lock.json {shlex.quote(previous)}/package-lock.json; then
  cp -a {shlex.quote(previous)}/node_modules {release}/node_modules
else
  cd {release}
  PATH=/opt/dropea-crm/runtime/bin:$PATH /opt/dropea-crm/runtime/bin/node /opt/dropea-crm/runtime/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev --ignore-scripts --no-audit --no-fund
fi
cd {release}
NODE_ENV=test /opt/dropea-crm/runtime/bin/node --test server/*.test.js
''')
    with sftp.file('/etc/dropea-crm/runtime.env', 'r') as handle:
        environment = handle.read().decode('utf-8')
    salt = secrets.token_hex(16)
    derived = hashlib.scrypt(access['password'].encode(), salt=salt.encode(), n=32768, r=8, p=1, maxmem=64*1024*1024, dklen=64)
    lines = [line for line in environment.splitlines() if not line.startswith(('ADMIN_USERNAME=', 'ADMIN_PASSWORD_HASH='))]
    lines.extend(['ADMIN_USERNAME=' + access['username'], f'ADMIN_PASSWORD_HASH=scrypt:{salt}:{derived.hex()}', ''])
    mutated = True
    with sftp.file('/etc/dropea-crm/runtime.env', 'w') as handle:
        handle.write('\n'.join(lines))
    sftp.chmod('/etc/dropea-crm/runtime.env', 0o600)
    run('Starting session-authenticated backend before removing browser authentication', f'''
ln -sfn {release} /opt/dropea-crm/current
systemctl restart dropea-crm.service
for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3381/api/auth/session; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3381/api/status)" = 401
curl -fsS http://127.0.0.1:3381/api/auth/session | /usr/bin/python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["enabled"] and not d["authenticated"]'
cp {release}/deploy/nginx.conf /etc/nginx/sites-available/dropeacrm.cyou
nginx -t
systemctl reload nginx
for attempt in $(seq 1 10); do
  if test "$(curl -s -o /dev/null -w '%{{http_code}}' https://dropeacrm.cyou/)" = 200; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{{http_code}}' https://dropeacrm.cyou/)" = 200
curl -fsS https://dropeacrm.cyou/api/auth/session | /usr/bin/python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["enabled"] and not d["authenticated"]'
test "$(curl -s -o /dev/null -w '%{{http_code}}' https://dropeacrm.cyou/api/status)" = 401
systemctl start dropea-crm-backup.service
systemctl is-active dropea-crm.service
''')
    access['release'] = stamp
    (workspace / 'data/deployment-access.json').write_text(json.dumps(access, indent=2), encoding='utf-8')
    print('Published blue identity and branded login. Existing web credentials preserved.', flush=True)
except Exception:
    if mutated:
        run('Rolling back to previous protected release', f'''
cp -p {backup}/runtime.env /etc/dropea-crm/runtime.env
cp -p {backup}/nginx.conf /etc/nginx/sites-available/dropeacrm.cyou
ln -sfn {shlex.quote(previous)} /opt/dropea-crm/current
systemctl restart dropea-crm.service
nginx -t
systemctl reload nginx
''')
    raise
finally:
    sftp.close()
    ssh.close()
