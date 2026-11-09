"""Deploy this CRM to the authorized VPS. SSH password is supplied via the environment."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import sys
import tarfile
from datetime import datetime, timezone

import paramiko

sys.stdout.reconfigure(encoding='utf-8')
workspace = Path(__file__).resolve().parent.parent
os.chdir(workspace)
state = workspace / 'data'
state.mkdir(exist_ok=True)
release = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
remote_release = f'/opt/dropea-crm/releases/{release}'
remote_bundle = f'/tmp/dropea-crm-{release}.tar.gz'
bundle = state / 'deployment-release.tar.gz'
with tarfile.open(bundle, 'w:gz') as archive:
    for name in ['dist', 'server', 'deploy', 'package.json', 'package-lock.json']:
        archive.add(workspace / name, arcname=name, filter=lambda entry: None if '__pycache__' in entry.name else entry)

ssh = paramiko.SSHClient()
known_hosts = state / 'vps-known-hosts'
if known_hosts.exists():
    ssh.load_host_keys(str(known_hosts))
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('161.97.160.76', port=22, username='root', password=os.environ['DROPEA_SSH_PASSWORD'], timeout=20, look_for_keys=False, allow_agent=False)
ssh.get_host_keys().save(str(known_hosts))
sftp = ssh.open_sftp()


def run(label, command, timeout=120):
    print(label, flush=True)
    stdin, stdout, stderr = ssh.exec_command('bash -se', timeout=timeout)
    stdin.write(command)
    stdin.channel.shutdown_write()
    output = stdout.read().decode('utf-8', errors='replace')
    errors = stderr.read().decode('utf-8', errors='replace')
    status = stdout.channel.recv_exit_status()
    if output.strip():
        print(output.strip(), flush=True)
    if status:
        print(errors[-5000:], flush=True)
        raise RuntimeError(f'{label}: remote exit {status}')


def put_text(path, value, mode=0o600):
    with sftp.file(path, 'w') as handle:
        handle.write(value)
    sftp.chmod(path, mode)


try:
    run('Preparing isolated release and backup', f'''
test ! -e /etc/nginx/sites-available/dropeacrm.cyou
test ! -e /etc/nginx/sites-enabled/dropeacrm.cyou
test -z "$(ss -lntH '( sport = :3381 )')"
install -d -m 700 /root/dropea-deploy-backup/{release}
tar -czf /root/dropea-deploy-backup/{release}/nginx-config.tar.gz -C /etc nginx
id dropeacrm >/dev/null 2>&1 || useradd --system --home /var/lib/dropea-crm --shell /usr/sbin/nologin dropeacrm
install -d -m 755 /opt/dropea-crm /opt/dropea-crm/releases {remote_release} /opt/dropea-crm/runtime
install -d -m 700 -o dropeacrm -g dropeacrm /var/lib/dropea-crm
install -d -m 750 -o root -g www-data /etc/dropea-crm
install -d -m 755 /var/lib/letsencrypt/.well-known/acme-challenge
''')
    sftp.put(str(bundle), remote_bundle)
    run('Installing verified Node.js 24 runtime', f'''
install -d -m 700 /root/dropea-deploy-backup/{release}/runtime-download
cd /root/dropea-deploy-backup/{release}/runtime-download
curl -fsSL --retry 2 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
runtime_archive=$(awk '$2 ~ /^node-v24[.][0-9]+[.][0-9]+-linux-x64[.]tar[.]xz$/ {{print $2}}' SHASUMS256.txt)
test -n "$runtime_archive"
curl -fsSL --retry 2 "https://nodejs.org/dist/latest-v24.x/$runtime_archive" -o "$runtime_archive"
grep " $runtime_archive$" SHASUMS256.txt | sha256sum --check -
tar -xJf "$runtime_archive" -C /opt/dropea-crm/runtime --strip-components=1
/opt/dropea-crm/runtime/bin/node --version
tar -xzf {remote_bundle} -C {remote_release}
cd {remote_release}
PATH=/opt/dropea-crm/runtime/bin:$PATH /opt/dropea-crm/runtime/bin/node /opt/dropea-crm/runtime/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev --ignore-scripts --no-audit --no-fund
''', timeout=300)
    run('Testing production backend on Linux', f'''
cd {remote_release}
/opt/dropea-crm/runtime/bin/node --test server/*.test.js
''', timeout=120)

    admin_password = secrets.token_urlsafe(18)
    salt = secrets.token_hex(16)
    derived = hashlib.scrypt(admin_password.encode(), salt=salt.encode(), n=32768, r=8, p=1, maxmem=64*1024*1024, dklen=64)
    admin_hash = f'scrypt:{salt}:{derived.hex()}'
    encryption_key = secrets.token_bytes(32)
    import base64
    put_text('/etc/dropea-crm/runtime.env', '\n'.join([
        'NODE_ENV=production', 'PORT=3381', 'DROPEA_MARKET=CL',
        'PUBLIC_ORIGIN=https://dropeacrm.cyou',
        'CONNECTION_ENCRYPTION_KEY=' + base64.b64encode(encryption_key).decode(),
        'ADMIN_USERNAME=admin', 'ADMIN_PASSWORD_HASH=' + admin_hash,
        'DROPEA_API_KEY=', 'DROPEA_SIGNING_SECRET=', '',
    ]))
    stdin, stdout, stderr = ssh.exec_command('openssl passwd -6 -stdin', timeout=15)
    stdin.write(admin_password + '\n')
    stdin.channel.shutdown_write()
    password_hash = stdout.read().decode().strip()
    if stdout.channel.recv_exit_status() or not password_hash.startswith('$6$'):
        raise RuntimeError('Unable to hash web access password')
    put_text('/etc/dropea-crm/htpasswd', 'admin:' + password_hash + '\n', 0o640)
    access = { 'url': 'https://dropeacrm.cyou', 'username': 'admin', 'password': admin_password, 'release': release, 'webhook': 'https://dropeacrm.cyou/api/webhooks/dropea' }
    (state / 'deployment-access.json').write_text(json.dumps(access, indent=2), encoding='utf-8')

    run('Starting protected application service', f'''
chown root:www-data /etc/dropea-crm/htpasswd
ln -s {shlex.quote(remote_release)} /opt/dropea-crm/current
ln -s /opt/dropea-crm/current/dist /var/lib/dropea-crm/dist
cp {remote_release}/deploy/dropea-crm.service /etc/systemd/system/dropea-crm.service
systemctl daemon-reload
systemctl enable --now dropea-crm.service
for attempt in $(seq 1 15); do
  if curl --fail --silent http://127.0.0.1:3381/api/auth/session; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:3381/api/auth/session
cp {remote_release}/deploy/nginx-http.conf /etc/nginx/sites-available/dropeacrm.cyou
ln -s /etc/nginx/sites-available/dropeacrm.cyou /etc/nginx/sites-enabled/dropeacrm.cyou
nginx -t
systemctl reload nginx
''')
    run('Issuing HTTPS certificate', '''
certbot certonly --webroot -w /var/lib/letsencrypt -d dropeacrm.cyou --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
''', timeout=240)
    put_text('/etc/letsencrypt/renewal-hooks/deploy/dropea-crm-nginx.sh', '''#!/bin/sh
if [ "$RENEWED_LINEAGE" = "/etc/letsencrypt/live/dropeacrm.cyou" ]; then
    /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
fi
''', 0o755)
    run('Enabling HTTPS, authenticated CRM and signed webhook', f'''
cp {remote_release}/deploy/nginx.conf /etc/nginx/sites-available/dropeacrm.cyou
nginx -t
systemctl reload nginx
cp {remote_release}/deploy/dropea-crm-backup.service /etc/systemd/system/
cp {remote_release}/deploy/dropea-crm-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dropea-crm-backup.timer
systemctl start dropea-crm-backup.service
systemctl is-active dropea-crm.service
systemctl is-enabled dropea-crm.service
systemctl is-active dropea-crm-backup.timer
curl --silent --output /dev/null --write-out 'Login page: %{{http_code}}\n' https://dropeacrm.cyou/
curl --silent --output /dev/null --write-out 'Protected API: %{{http_code}}\n' https://dropeacrm.cyou/api/status
curl --silent --output /dev/null --write-out 'Unsigned webhook: %{{http_code}}\n' -H 'Content-Type: application/json' --data '{{}}' https://dropeacrm.cyou/api/webhooks/dropea
''')
    print('Deployment completed. Web login stored in ignored data/deployment-access.json.', flush=True)
finally:
    sftp.close()
    ssh.close()
