# VPS deployment

Target: `https://dropeacrm.cyou`. Nginx terminates TLS. The public branded login issues an opaque HttpOnly/Secure/SameSite cookie. The application requires a valid session for every operational API; only the auth endpoints and HMAC-signed `POST /api/webhooks/dropea` are public. Node binds only `127.0.0.1:3381`.

- Releases: `/opt/dropea-crm/releases/<release>`; `current` is a symlink.
- Isolated Node.js 24 runtime: `/opt/dropea-crm/runtime`.
- Service: `dropea-crm.service`, runs as `dropeacrm` with read-only code.
- Writable application state: `/var/lib/dropea-crm/data/crm.sqlite` (WAL).
- Environment and encryption key: `/etc/dropea-crm/runtime.env` (root only).
- Web login: `ADMIN_USERNAME` and salted scrypt `ADMIN_PASSWORD_HASH` in the root-only environment. No plaintext web password is stored on the VPS. Sessions are stored hashed in SQLite and revoked at logout; failed attempts are limited per IP. The previous htpasswd file is retained only for rollback compatibility.
- Daily backup: `dropea-crm-backup.timer`; SQLite backup plus the encryption key, root-only in `/var/backups/dropea-crm`. Backups remain on this VPS.
- ACME: Certbot webroot `/var/lib/letsencrypt`, certificate renewal with nginx reload hook.

## Verification

```sh
systemctl status dropea-crm --no-pager
curl http://127.0.0.1:3381/api/auth/session
curl -I https://dropeacrm.cyou/ # 200 login page
curl -I https://dropeacrm.cyou/api/status # 401 without a session
journalctl -u dropea-crm -n 50 --no-pager
systemctl list-timers dropea-crm-backup.timer
```

## Updates and rollback

Build and test locally. Upload a new release without `data`, `.env`, credentials, or local node_modules. Install locked production dependencies on Linux. Keep the encryption key and the data directory outside releases. Switch `current` and restart only `dropea-crm.service`. On failure, point `current` back to the previous release and restart it. Before changing Nginx, copy its prior site configuration, run `nginx -t`, then reload (do not stop the existing web server).

Connect the real Dropea account in **Integración Dropea**. When `CONNECTION_ENCRYPTION_KEY` is configured, the API Key and signing secret entered in that screen persist as authenticated AES-256-GCM ciphertext in SQLite. The encryption key is required to restore these credentials; it must be preserved with database backups. The backend never returns plaintext credentials.

Country connections are independent (`connection:<market>:encrypted`). The dashboard country selection is saved in `market:selected` and restored after a restart. The previous single connection migrates automatically without changing its resource scope. Changing country restores that country's stored credentials or shows an unconnected state; it never reuses another market's API Key. Signed webhooks are routed to the matching saved country regardless of the current dashboard selection. Synchronization blocks country changes until complete. Selection is shared by this single-workspace installation.

## Live / Landings deployment

Native offers use live_sources, live_sessions, live_purchases and real persisted landing_orders. Legacy simulation tables are preserved only as archives and excluded from reports; simulation routes return 410. Do not distribute operational data or any environment file.

LIVE_CAMPAIGN_REPORT_URL, LIVE_CAMPAIGN_TOKEN, LIVE_CAMPAIGN_OWNER and LIVE_CAMPAIGN_LANDING_ID provide an owner-only read grant for a real existing campaign. The report cache stores sanitized aggregates, never customer details or credentials; an unavailable feed is marked stale without fabricating live counts. LIVE_GEO_DATABASE remains local to the CRM for native landings.

Back up SQLite and runtime.env before switching releases. Preserve the active campaign checkout and fulfillment destination. Changing an offer to Dropea requires the correct product/variant/store IDs.
