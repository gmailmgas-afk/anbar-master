/**
 * End-to-End Verification: Cross-User Notification Sync + Authoritative Purge Propagation
 * Tests against live server on http://localhost:3000
 */
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

function httpRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE_URL}${urlPath}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function openSseClient(sinceSequence = 0, sincePurgedAt = '') {
  return new Promise((resolve, reject) => {
    const events = [];
    const qs = `?since_sequence=${sinceSequence}&since_purged_at=${encodeURIComponent(sincePurgedAt)}`;
    const req = http.get(`${BASE_URL}/api/sync/stream${qs}`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE status ${res.statusCode}`));
        return;
      }
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6).trim());
              events.push(parsed);
            } catch {}
          }
        }
      });
      resolve({
        events,
        close: () => {
          try { req.destroy(); } catch {}
        }
      });
    });
    req.on('error', reject);
  });
}

function waitFor(predicate, timeoutMs = 4000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const val = predicate();
        if (val) {
          clearInterval(timer);
          resolve(val);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for condition'));
        }
      } catch (e) {
        clearInterval(timer);
        reject(e);
      }
    }, 50);
  });
}

async function run() {
  console.log('1. Checking server health...');
  const health = await httpRequest('GET', '/api/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.status, 'healthy');

  // Snapshot files on disk so test leaves workspace clean
  const dataDir = path.join(__dirname, '..', 'data');
  const snapshotFiles = ['server_events.json', 'server_users.json', 'server_purge_marker.json'].map(f => {
    const fp = path.join(dataDir, f);
    return { fp, exists: fs.existsSync(fp), content: fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null };
  });

  let sseManager = null;
  try {
    console.log('2. Opening Manager SSE stream listener...');
    const initialSync = await httpRequest('GET', '/api/sync?since_sequence=0');
    const startSeq = initialSync.body.server_sequence || 0;
    const startPurged = initialSync.body.last_purged_at || '';

    sseManager = await openSseClient(startSeq, startPurged);
    await waitFor(() => sseManager.events.find(e => e.type === 'CONNECTED'));

    console.log('3. Simulating cross-user event from Hajivand (inspection) + Karami (kardex) + Notification...');
    const now1 = new Date().toISOString();
    const evtKardex = {
      event_id: `EVT-TEST-KARDEX-${Date.now()}`,
      user_id: 'USR-002',
      device_id: 'SYS-KARAMI-OFFICE-02',
      event_type: 'CREATE',
      entity_type: 'GAS_KARDEX',
      entity_id: `KDX-TEST-${Date.now()}`,
      payload: {
        entry_id: `KDX-TEST-${Date.now()}`,
        customer_id: 'CUST-001',
        customer_name: 'مشتری تست همگام‌سازی',
        transfer_sheet_number: '9999i',
        cylinder_in: 10
      },
      client_created_at: now1,
      schema_version: 1
    };

    const evtNotification = {
      event_id: `EVT-TEST-NOTIF-${Date.now()}`,
      user_id: 'USR-003',
      device_id: 'SYS-HAJIVAND-ANBAR-03',
      event_type: 'CREATE',
      entity_type: 'NOTIFICATION',
      entity_id: `NTF-TEST-${Date.now()}`,
      payload: {
        notification_id: `NTF-TEST-${Date.now()}`,
        title: 'اعلان تست انباردار',
        message: 'حاجی‌وند یک برگه ورود ثبت کرد',
        level: 'info',
        category: 'INSPECTION',
        actor_user_id: 'USR-003',
        actor_name: 'آقای حاجی‌وند',
        read_by: ['USR-003'],
        created_at: now1
      },
      client_created_at: now1,
      schema_version: 1
    };

    const uploadRes = await httpRequest('POST', '/api/sync/events', {
      device_id: 'SYS-HAJIVAND-ANBAR-03',
      events: [evtKardex, evtNotification]
    });
    assert.strictEqual(uploadRes.status, 200);
    assert.strictEqual(uploadRes.body.accepted_events.length, 2);

    const sseMsg = await waitFor(() =>
      sseManager.events.find(
        e => e.type === 'SYNC_EVENTS' && Array.isArray(e.events) && e.events.some(ev => ev.event_id === evtNotification.event_id)
      )
    );
    assert(sseMsg, 'Manager SSE stream must immediately receive Hajivand & Karami events');
    console.log('   ✓ Cross-user KARDEX & NOTIFICATION events delivered live via SSE.');

    console.log('4. Executing Manager authoritative purge (/api/database/purge-all-except-products)...');
    const purgeRes = await httpRequest('POST', '/api/database/purge-all-except-products', {
      author: 'مهندس موسی عمویی',
      preserve_products: true
    });
    assert.strictEqual(purgeRes.status, 200);
    assert.strictEqual(purgeRes.body.success, true);
    assert(purgeRes.body.last_purged_at, 'Purge response must return last_purged_at');
    const purgedAt = purgeRes.body.last_purged_at;
    const postPurgeSeq = purgeRes.body.server_sequence;
    assert(postPurgeSeq > startSeq, 'Server sequence after purge must advance monotonically (never reset to 0)');

    const ssePurge = await waitFor(() =>
      sseManager.events.find(e => e.type === 'DATABASE_PURGED' && e.last_purged_at === purgedAt)
    );
    assert(ssePurge, 'Manager & connected stations must immediately receive DATABASE_PURGED via SSE');
    console.log('   ✓ Authoritative DATABASE_PURGED received via SSE; monotonic seq =', postPurgeSeq);

    console.log('5. Verifying lagging offline client pulling /api/sync?since_sequence=0 sees zero wiped events...');
    const pullAfterPurge = await httpRequest('GET', '/api/sync?since_sequence=0');
    assert.strictEqual(pullAfterPurge.status, 200);
    assert.strictEqual(pullAfterPurge.body.last_purged_at, purgedAt);
    const leakedNonUser = (pullAfterPurge.body.events || []).filter(
      e => e.entity_type !== 'USER' && e.entity_type !== 'SYSTEM'
    );
    assert.strictEqual(leakedNonUser.length, 0, 'Pre-purge KARDEX/NOTIFICATION/MOVEMENT events must NOT remain after purge');
    console.log('   ✓ Full pull after purge returns 0 wiped non-USER/SYSTEM events and carries last_purged_at.');

    console.log('6. Verifying stale offline upload created BEFORE purge cannot resurrect wiped data...');
    const stalePrePurgeEvent = {
      event_id: `EVT-STALE-${Date.now()}`,
      user_id: 'USR-003',
      device_id: 'OFFLINE-PC-STALE',
      event_type: 'CREATE',
      entity_type: 'GAS_KARDEX',
      entity_id: `KDX-STALE-${Date.now()}`,
      payload: { entry_id: 'KDX-STALE', customer_name: 'رستاخیز ممنوع', cylinder_in: 999 },
      client_created_at: new Date(new Date(purgedAt).getTime() - 60000).toISOString(),
      schema_version: 1
    };
    const staleUpload = await httpRequest('POST', '/api/sync/events', {
      device_id: 'OFFLINE-PC-STALE',
      events: [stalePrePurgeEvent]
    });
    assert.strictEqual(staleUpload.status, 200);
    assert.strictEqual(staleUpload.body.last_purged_at, purgedAt);

    const pullAfterStale = await httpRequest('GET', '/api/sync?since_sequence=0');
    const resurrected = (pullAfterStale.body.events || []).find(e => e.event_id === stalePrePurgeEvent.event_id);
    assert.strictEqual(resurrected, undefined, 'Stale pre-purge event must be dropped and never returned to other devices');
    console.log('   ✓ Stale pre-purge event safely discarded; wiped data stayed zero.');

    console.log('\nALL PURGE & NOTIFICATION SYNC ASSERTIONS PASSED!');
  } finally {
    if (sseManager) sseManager.close();
    for (const s of snapshotFiles) {
      if (s.exists && s.content !== null) {
        fs.writeFileSync(s.fp, s.content, 'utf8');
      } else if (!s.exists && fs.existsSync(s.fp)) {
        fs.unlinkSync(s.fp);
      }
    }
  }
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
