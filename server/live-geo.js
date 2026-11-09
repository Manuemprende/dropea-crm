import { readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { Reader } from 'mmdb-lib';
import { resolve } from 'node:path';

// Offline lookup: no visitor IP is transmitted to a geolocation provider.
const database = resolve(process.env.LIVE_GEO_DATABASE || 'data/dbip-city-lite.mmdb');
let reader, loadedMtime = 0, nextCheck = 0;
function localLookup(ip) {
  try {
    if (Date.now() >= nextCheck) {
      nextCheck = Date.now() + 600000;
      const mtime = statSync(database).mtimeMs;
      if (!reader || mtime !== loadedMtime) {
        reader = new Reader(readFileSync(database));
        loadedMtime = mtime;
      }
    }
    return reader?.get(ip) || null;
  } catch {
    // Analytics must never prevent a visit or order from being accepted.
    return null;
  }
}
function normalizeIP(value) {
  const ip = String(value || '').trim().replace(/^::ffff:/i, '');
  if (!isIP(ip)) return '';
  if (ip === '::1' || ip === '::' || /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(ip)) return '';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^(fc|fd|fe[89ab])/i.test(ip) && isIP(ip) === 6) return '';
  return ip;
}
function clean(value) { return String(value || '').replace(/[\r\n]/g, ' ').trim().slice(0, 100); }

export function createLandingGeo(lookup = localLookup) {
  return function landingGeo(req) {
    const peer = String(req.socket?.remoteAddress || '').replace(/^::ffff:/i, '');
    // Only our loopback Nginx may supply X-Real-IP, which it overwrites.
    const fromProxy = peer === '127.0.0.1' || peer === '::1';
    const ip = normalizeIP(fromProxy ? req.headers?.['x-real-ip'] || peer : peer);
    if (!ip) return { city: '', country: '' };
    try {
      const result = lookup(ip);
      const code = result?.country?.iso_code;
      let country = result?.country?.names?.es || result?.country?.names?.en || '';
      if (/^[A-Z]{2}$/.test(code || '')) {
        try { country = new Intl.DisplayNames(['es-CL'], { type: 'region' }).of(code) || country; } catch {}
      }
      const city = result?.city?.names?.es || result?.city?.names?.en || result?.subdivisions?.[0]?.names?.es || result?.subdivisions?.[0]?.names?.en || '';
      return { city: clean(city), country: clean(country) };
    } catch { return { city: '', country: '' }; }
  };
}

export const landingGeo = createLandingGeo();
