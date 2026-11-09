"""Extend the existing read-only demonstration grant with validated date ranges."""
from datetime import datetime, timezone
from pathlib import Path
import os
import paramiko

root = Path(__file__).resolve().parent.parent
ssh = paramiko.SSHClient()
ssh.load_host_keys(str(root / 'data/vps-known-hosts'))
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect('161.97.160.76', username='root', password=os.environ['DROPEA_SSH_PASSWORD'], look_for_keys=False, allow_agent=False, timeout=20)
sftp = ssh.open_sftp()
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
paths = ['/opt/nexora/server/index.mjs', '/opt/nexora/server/live-share.mjs']
original = {path: sftp.open(path).read().decode() for path in paths}

def command(value):
    _, out, err = ssh.exec_command(value, timeout=40)
    output, errors = out.read().decode(), err.read().decode()
    if out.channel.recv_exit_status():
        raise RuntimeError(errors[-1500:] or output[-1500:])

try:
    index = original[paths[0]]
    assert "if(!['today','7d','month','all'].includes(period))" in index, 'Shared report route changed; inspect before editing.'
    assert 'const report=sharedLiveReport(db,token,period);' in index
    index = index.replace("if(!['today','7d','month','all'].includes(period))", "if(!['today','7d','month','all','custom'].includes(period))", 1)
    index = index.replace('const report=sharedLiveReport(db,token,period);', """const dates={from:url.searchParams.get('from'),to:url.searchParams.get('to')};
        if(period==='custom'){
          const valid=value=>typeof value==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
          if(!valid(dates.from)||!valid(dates.to)||dates.from>dates.to)return send(400,{error:'Rango de fechas invalido'});
        }
        const report=sharedLiveReport(db,token,period,dates);""", 1)
    share = original[paths[1]]
    assert "export function sharedLiveReport(db,token,period='7d')" in share
    assert 'const data=getLandingLiveDashboard(db,{period});' in share
    share = share.replace("export function sharedLiveReport(db,token,period='7d')", "export function sharedLiveReport(db,token,period='7d',dates={})")
    share = share.replace('const data=getLandingLiveDashboard(db,{period});', "const data=getLandingLiveDashboard(db,{period,...(period==='custom'?{from:dates.from,to:dates.to}:{})});")
    share = share.replace('return {landings:rows,refreshed_at:data.refreshed_at};', "return {landings:rows,refreshed_at:data.refreshed_at,...(period==='custom'?{range:{from:dates.from,to:dates.to}}:{})};")
    for path, value in zip(paths, [index, share]):
        with sftp.open(path + '.before-date-range-' + stamp, 'w') as handle:
            handle.write(original[path])
        with sftp.open(path, 'w') as handle:
            handle.write(value)
        command('/opt/dropea-crm/runtime/bin/node --check ' + path)
    command('systemctl restart nexora.service && systemctl is-active nexora.service')
    print('Read-only demonstration date range enabled; existing grant validation preserved.')
except Exception:
    for path, value in original.items():
        with sftp.open(path, 'w') as handle:
            handle.write(value)
    command('systemctl restart nexora.service')
    raise
finally:
    sftp.close()
    ssh.close()
