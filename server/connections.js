import { encryptConnection, decryptConnection } from './credentials.js';
import { markets } from './core.js';

export function createConnections({ get, set, encryptionKey, initial }) {
  const memory = new Map();
  const key = market => `connection:${market}:encrypted`;
  const save = connection => {
    if (!markets.includes(connection.market)) throw new Error('Mercado no válido.');
    if (encryptionKey) set(key(connection.market), encryptConnection(connection, encryptionKey));
    memory.set(connection.market, { ...connection });
  };
  const load = market => {
    if (!markets.includes(market)) throw new Error('Mercado no válido.');
    const saved = encryptionKey ? get(key(market)) : null;
    return saved ? decryptConnection(saved, encryptionKey) : { ...(memory.get(market) || { market, apiKey: '', secret: '' }) };
  };
  // Preserve the previous single-country credentials and their existing resource scope.
  const legacy = encryptionKey ? get('connection:encrypted') : null;
  if (legacy) {
    const connection = decryptConnection(legacy, encryptionKey);
    if (!get(key(connection.market))) save(connection);
  }
  if ((initial.apiKey || initial.secret) && !get(key(initial.market))) save(initial);
  const selected = get('market:selected') || (legacy ? decryptConnection(legacy, encryptionKey).market : initial.market);
  const active = load(markets.includes(selected) ? selected : initial.market);
  return {
    active, load, save,
    select(market) {
      const connection = load(market);
      set('market:selected', market);
      Object.assign(active, connection);
      return active;
    },
    list() { return markets.map(market => { const c = load(market); return { market, configured: Boolean(c.apiKey), signingConfigured: Boolean(c.secret) }; }); },
  };
}
