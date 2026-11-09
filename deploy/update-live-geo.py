#!/usr/bin/env python3
"""Refresh the offline DB-IP Lite database. Does not handle visitor data."""
import datetime
import gzip
import pathlib
import os
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
folder = pathlib.Path(os.environ.get('LIVE_GEO_DATABASE', '/var/lib/dropea-crm/data/dbip-city-lite.mmdb')).parent
folder.mkdir(exist_ok=True)
month = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m')
temporary = None
compressed = None
try:
    with tempfile.NamedTemporaryFile(dir=folder, suffix='.gz', delete=False) as download:
        compressed = pathlib.Path(download.name)
    url = f'https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz'
    subprocess.run(['/usr/bin/curl', '--fail', '--location', '--silent', '--show-error',
        '--max-time', '180', url, '--output', str(compressed)], check=True)
    with tempfile.NamedTemporaryFile(dir=folder, suffix='.mmdb', delete=False) as target:
        temporary = pathlib.Path(target.name)
        with gzip.open(compressed, 'rb') as source:
            total = 0
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > 512 * 1024 * 1024:
                    raise ValueError('Unexpected database size')
                target.write(chunk)
    subprocess.run(['/opt/dropea-crm/runtime/bin/node', '-e', '''
      const fs=require('fs'); const {Reader}=require(process.argv[1]);
      const reader=new Reader(fs.readFileSync(process.argv[2]));
      if(!reader.get('8.8.8.8')?.country?.iso_code) throw Error('Invalid geo database');
    ''', str(root / 'node_modules/mmdb-lib'), str(temporary)], check=True)
    temporary.chmod(0o644)
    temporary.replace(folder / 'dbip-city-lite.mmdb')
    print(f'Landing geolocation database updated: {month}')
finally:
    if temporary is not None:
        temporary.unlink(missing_ok=True)
    if compressed is not None:
        compressed.unlink(missing_ok=True)
