export function variantStocks(product) {
  return Object.fromEntries((product.variants || []).filter(v => v.variant_id != null && Number.isFinite(v.stock) && v.stock >= 0).map(v => [String(v.variant_id), v.stock]));
}

export function compareStocks(before, after) {
  let decrease = 0, increase = 0, compared = 0;
  for (const [id, stock] of Object.entries(after)) {
    if (!Object.hasOwn(before, id)) continue;
    compared++;
    const delta = stock - before[id];
    if (delta < 0) decrease -= delta;
    else increase += delta;
  }
  return { decrease, increase, compared };
}

export function createStockRadar(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS stock_snapshots (
    scope TEXT NOT NULL, product_id TEXT NOT NULL, observed_at TEXT NOT NULL,
    stocks TEXT NOT NULL, total REAL NOT NULL, decrease REAL NOT NULL,
    increase REAL NOT NULL, compared INTEGER NOT NULL,
    PRIMARY KEY(scope,product_id,observed_at));
    CREATE INDEX IF NOT EXISTS stock_snapshots_recent ON stock_snapshots(scope,observed_at);`);
  const previous = db.prepare('SELECT stocks,observed_at FROM stock_snapshots WHERE scope=? AND product_id=? ORDER BY observed_at DESC LIMIT 1');
  const insert = db.prepare('INSERT OR IGNORE INTO stock_snapshots VALUES (?,?,?,?,?,?,?,?)');
  return {
    record(scope, products, at = new Date().toISOString()) {
      for (const product of products) {
        const id = String(product.id ?? product.product_id), stocks = variantStocks(product);
        if (!Object.keys(stocks).length) continue;
        const old = previous.get(scope, id);
        if (old && old.observed_at >= at) continue;
        // A comparison older than 24h is too broad to label as a daily signal.
        const comparable = old && Date.parse(at) - Date.parse(old.observed_at) <= 86400000;
        const delta = comparable ? compareStocks(JSON.parse(old.stocks), stocks) : { decrease: 0, increase: 0, compared: 0 };
        insert.run(scope, id, at, JSON.stringify(stocks), Object.values(stocks).reduce((s, n) => s+n, 0), delta.decrease, delta.increase, delta.compared);
      }
      db.prepare('DELETE FROM stock_snapshots WHERE scope=? AND observed_at<?').run(scope, new Date(Date.parse(at)-3*86400000).toISOString());
    },
    hasBaseline(scope) { return Boolean(db.prepare('SELECT 1 FROM stock_snapshots WHERE scope=? LIMIT 1').get(scope)); },
    signals(scope, now = Date.now()) {
      const rows = db.prepare('SELECT product_id,observed_at,total,decrease,increase,compared FROM stock_snapshots WHERE scope=? AND observed_at>=? ORDER BY observed_at').all(scope, new Date(now-86400000).toISOString());
      const map = {};
      for (const row of rows) {
        const signal = map[row.product_id] ||= { drop24h: 0, restocked24h: 0, observations: 0, compared: false, previousStock: null, currentStock: row.total, lastObserved: row.observed_at, lastDrop: null, history: [] };
        signal.drop24h += row.decrease; signal.restocked24h += row.increase;
        signal.observations++; signal.compared ||= row.compared > 0;
        signal.previousStock = signal.currentStock; signal.currentStock = row.total; signal.lastObserved = row.observed_at;
        if (row.decrease > 0) signal.lastDrop = row.observed_at;
        signal.history.push({ at: row.observed_at, stock: row.total });
        if (signal.history.length > 12) signal.history.shift();
      }
      return map;
    },
  };
}
