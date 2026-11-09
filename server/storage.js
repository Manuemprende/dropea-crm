import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
mkdirSync('data', { recursive: true });
export const db = new DatabaseSync('data/crm.sqlite');
let orderObserver=null;
export function observeOrders(callback){orderObserver=callback;}
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS resources (market TEXT, kind TEXT, id TEXT, updated TEXT, payload TEXT, PRIMARY KEY(market,kind,id));
  CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, market TEXT, topic TEXT, resource_id TEXT, received TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`);
export function readResources(market, kind) {
  return db.prepare('SELECT payload FROM resources WHERE market=? AND kind=? ORDER BY updated DESC').all(market, kind).map(r => JSON.parse(r.payload));
}
export function upsert(market, kind, resource, time) {
  const timestamp = new Date(resource.updated_at || time || Date.now()).toISOString();
  const result=db.prepare(`INSERT INTO resources VALUES (?,?,?,?,?) ON CONFLICT(market,kind,id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload WHERE excluded.updated >= resources.updated`)
    .run(market, kind, String(resource.id ?? resource.product_id), timestamp, JSON.stringify(resource));
  if(kind==='orders'&&result.changes)orderObserver?.(market,resource,timestamp);
}
export function getSetting(key) { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
export function setSetting(key, value) { db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, value); }
