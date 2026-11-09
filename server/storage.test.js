import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('cache isolates markets and rejects stale or out-of-order resource updates', async () => {
  process.chdir(mkdtempSync(join(tmpdir(), 'dropea-storage-test-')));
  const { upsert, readResources, db } = await import('./storage.js');
  try {
    upsert('CL','orders',{id:1,status:'SHIPPING',updated_at:'2026-11-05T15:00:00Z'});
    upsert('CL','orders',{id:1,status:'PENDING',updated_at:'2026-11-05T11:00:00Z'});
    upsert('MX','orders',{id:1,status:'PENDING',updated_at:'2026-11-05T16:00:00Z'});
    assert.equal(readResources('CL','orders').length,1);
    assert.equal(readResources('CL','orders')[0].status,'SHIPPING');
    assert.equal(readResources('MX','orders')[0].status,'PENDING');
    // Same instant in another time zone is normalized before comparing.
    upsert('CL','orders',{id:1,status:'FINISH',updated_at:'2026-11-05T13:00:00-03:00'});
    assert.equal(readResources('CL','orders')[0].status,'FINISH');
    db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?)').run('event-1','CL','order.created','1','2026-11-05T16:00:00Z');
    const replay = db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?)').run('event-1','CL','order.created','1','2026-11-05T16:00:00Z');
    assert.equal(replay.changes,0);
  } finally { db.close(); }
});
