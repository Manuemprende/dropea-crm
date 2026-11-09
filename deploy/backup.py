#!/usr/bin/python3
"""Consistent SQLite backup and its encryption key. Root-only destination."""
from datetime import datetime, timezone
from pathlib import Path
import os
import shutil
import sqlite3

os.umask(0o077)
destination = Path('/var/backups/dropea-crm')
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
source = sqlite3.connect('file:/var/lib/dropea-crm/data/crm.sqlite?mode=ro', uri=True)
target = sqlite3.connect(destination / f'{stamp}.sqlite')
with target:
    source.backup(target)
source.close()
target.close()
shutil.copyfile('/etc/dropea-crm/runtime.env', destination / f'{stamp}.env')
os.chmod(destination / f'{stamp}.sqlite', 0o600)
os.chmod(destination / f'{stamp}.env', 0o600)
print('CRM backup completed')
