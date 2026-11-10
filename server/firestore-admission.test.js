import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreAdmission } from './firestore-admission.js';

const policy = { perMinuteLimit: 60, dailyRequestLimit: 100, totalBudgetMicroUsd: 60000, reserveCostMicroUsd: 20000, maxConcurrent: 2, leaseMs: 300000, model: 'test-model', version: 'v1' };
const args = (n, custom = policy) => ({ app: 'test-app', requestId: `request-identifier-${n}`, policy: custom });
const rejected = async (promise, code) => assert.rejects(promise, error => error.code === code);
function fixture() {
  let doc, revision = 0, now = Date.parse('2026-11-10T12:00:00Z'), lost = false;
  let writes = 0;
  const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => structuredClone(body) });
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (options.method !== 'PATCH') return reply(doc ? 200 : 404, doc);
    writes++;
    // Yield so parallel reservations necessarily contend on the same snapshot.
    await Promise.resolve();
    if (parsed.searchParams.get('currentDocument.exists') === 'false' ? !!doc : parsed.searchParams.get('currentDocument.updateTime') !== doc?.updateTime) return reply(400, { error: { status: 'FAILED_PRECONDITION' } });
    doc = { ...JSON.parse(options.body), updateTime: `2026-11-10T12:00:00.${String(++revision).padStart(9, '0')}Z` };
    if (lost) { lost = false; throw new Error('lost response with private content'); }
    return reply(200, doc);
  };
  const make = () => createFirestoreAdmission({ projectId: 'test-project', fetchImpl, getAccessToken: async () => 'fake-token', clock: () => now, allowInitialize: true });
  return { make, get doc() { return doc; }, get writes() { return writes; }, advance: ms => { now += ms; }, lose: () => { lost = true; }, state: () => JSON.parse(doc.fields.state.stringValue), corrupt: fn => { const state = JSON.parse(doc.fields.state.stringValue); fn(state); doc.fields.state.stringValue = JSON.stringify(state); } };
}

test('parallel independent instances CAS before admission, never exceeding concurrency', async () => {
  const f = fixture();
  const results = await Promise.allSettled([1, 2, 3].map(n => f.make().reserve(args(n))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'concurrency_limit');
  assert.equal(f.state().reservedMicroUsd, 40000);
});

test('lost write response fails closed without retry or refund, including on restart', async () => {
  const f = fixture(); f.lose();
  await rejected(f.make().reserve(args(1)), 'uncertain_write');
  assert.equal(f.writes, 1);
  assert.equal(f.state().reservedMicroUsd, 20000);
  await rejected(f.make().reserve(args(1)), 'duplicate_request');
});

test('successful completion releases only lease and is idempotent', async () => {
  const f = fixture(), adapter = f.make();
  await adapter.reserve(args(1));
  await adapter.complete(args(1)); await adapter.complete(args(1));
  assert.equal(f.state().reservedMicroUsd, 20000);
  assert.equal(f.state().dailyCount, 1);
  assert.equal(f.state().recent.length, 1);
  assert.equal(Object.keys(f.state().leases).length, 0);
  await rejected(adapter.complete(args(2)), 'missing_reservation');
});

test('budget survives restart, completion, midnight and lease expiration', async () => {
  const f = fixture();
  await f.make().reserve(args(1)); await f.make().complete(args(1));
  f.advance(86400000);
  await f.make().reserve(args(2)); await f.make().reserve(args(3));
  f.advance(300001);
  await rejected(f.make().reserve(args(4)), 'budget_limit');
  assert.equal(f.state().reservedMicroUsd, 60000);
  assert.equal(f.state().dailyCount, 2);
});

test('lease expiration frees capacity but never spend or duplicate identifiers', async () => {
  const f = fixture();
  const p = { ...policy, maxConcurrent: 1 };
  await f.make().reserve(args(1, p));
  await rejected(f.make().reserve(args(2, p)), 'concurrency_limit');
  f.advance(p.leaseMs);
  await f.make().reserve(args(2, p));
  await rejected(f.make().reserve(args(1, p)), 'duplicate_request');
  assert.equal(f.state().reservedMicroUsd, 40000);
});

test('every policy change fails closed', async () => {
  const f = fixture(); await f.make().reserve(args(1));
  for (const key of Object.keys(policy)) {
    const value = policy[key];
    const changed = { ...policy, [key]: typeof value === 'number' ? value - 1 : value + '-changed' };
    await rejected(f.make().reserve(args(2, changed)), 'policy_mismatch');
  }
  assert.equal(f.writes, 1);
});

test('rolling minute and UTC daily counters enforce exact boundaries', async () => {
  const f = fixture(), p = { ...policy, perMinuteLimit: 1, dailyRequestLimit: 2 };
  await f.make().reserve(args(1, p)); await f.make().complete(args(1));
  f.advance(59999);
  await rejected(f.make().reserve(args(2, p)), 'rate_limit');
  f.advance(1); await f.make().reserve(args(2, p)); await f.make().complete(args(2));
  f.advance(60000); await rejected(f.make().reserve(args(3, p)), 'daily_limit');
  f.advance(86400000); await f.make().reserve(args(3, p));
  assert.equal(f.state().dailyCount, 1);
});

test('missing config, inaccessible storage, invalid policy and corrupt state fail closed', async () => {
  await rejected(createFirestoreAdmission({}).reserve(args(1)), 'missing_config');
  const unavailable = createFirestoreAdmission({ projectId: 'test-project', getAccessToken: async () => 'fake-token', fetchImpl: async () => { throw new Error('secret'); } });
  await rejected(unavailable.reserve(args(1)), 'store_unavailable');
  const f = fixture();
  await rejected(f.make().reserve(args(1, { ...policy, perMinuteLimit: 61 })), 'invalid_policy');
  await f.make().reserve(args(1));
  f.corrupt(s => { s.reservedMicroUsd = 0; });
  await rejected(f.make().reserve(args(2)), 'corrupt_state');
});

test('clock regression fails closed', async () => {
  const f = fixture(); await f.make().reserve(args(1)); f.advance(-1);
  await rejected(f.make().reserve(args(2)), 'clock_regressed');
});

test('metadata authentication failures and malformed store responses do not disclose raw errors', async () => {
  const make = fetchImpl => createFirestoreAdmission({ projectId: 'test-project', fetchImpl });
  await rejected(make(async () => { throw new Error('sensitive raw body'); }).reserve(args(1)), 'auth_unavailable');
  const adapter = createFirestoreAdmission({ projectId: 'test-project', getAccessToken: async () => 'fake-token', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  await rejected(adapter.reserve(args(1)), 'corrupt_state');
});

test('CAS retries are bounded and only known conflicts are retried', async () => {
  for (const status of [400, 409, 412, 500]) {
    let writes = 0;
    const adapter = createFirestoreAdmission({ projectId: 'test-project', allowInitialize: true, getAccessToken: async () => 'fake-token', fetchImpl: async (_url, options) => {
      if (options.method !== 'PATCH') return { status: 404 };
      writes++;
      return { status, ok: false, json: async () => ({ error: { status: 'FAILED_PRECONDITION' } }) };
    } });
    await rejected(adapter.reserve(args(1)), status === 500 ? 'uncertain_write' : 'contention');
    assert.equal(writes, status === 500 ? 1 : 6);
  }
});

test('lost completion acknowledgment never refunds reserved spend', async () => {
  const f = fixture(); await f.make().reserve(args(1)); f.lose();
  await rejected(f.make().complete(args(1)), 'uncertain_write');
  assert.equal(f.state().reservedMicroUsd, 20000);
  assert.equal(f.state().dailyCount, 1);
  assert.deepEqual(await f.make().complete(args(1)), { completed: true });
});

test('metadata identity is constrained to its fixed endpoint and never sent to metadata as bearer', async () => {
  let calls = 0;
  const adapter = createFirestoreAdmission({ projectId: 'test-project', fetchImpl: async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
      assert.deepEqual(options.headers, { 'Metadata-Flavor': 'Google' });
      assert.equal(options.redirect, 'error');
      return { ok: true, headers: { get: () => 'Google' }, json: async () => ({ token_type: 'Bearer', access_token: 'fake-token', expires_in: 300 }) };
    }
    assert.equal(new URL(url).origin, 'https://firestore.googleapis.com');
    assert.equal(options.headers.Authorization, 'Bearer fake-token');
    return { status: 403, ok: false };
  } });
  await rejected(adapter.reserve(args(1)), 'store_unavailable');
  assert.equal(calls, 2);
});

test('malformed successful write response is uncertain and is never retried', async () => {
  let writes = 0;
  const adapter = createFirestoreAdmission({ projectId: 'test-project', allowInitialize: true, getAccessToken: async () => 'fake-token', fetchImpl: async (_url, options) => {
    if (options.method !== 'PATCH') return { status: 404 };
    writes++;
    return { status: 200, ok: true, json: async () => ({}) };
  } });
  await rejected(adapter.reserve(args(1)), 'uncertain_write');
  assert.equal(writes, 1);
});

test('missing ledger fails closed by default without issuing a write', async () => {
  let calls = 0;
  const adapter = createFirestoreAdmission({ projectId: 'test-project', getAccessToken: async () => 'fake-token', fetchImpl: async (_url, options) => {
    calls++;
    assert.notEqual(options.method, 'PATCH');
    return { status: 404, ok: false };
  } });
  await rejected(adapter.reserve(args(1)), 'missing_state');
  assert.equal(calls, 1);
});
