import { createHash } from 'node:crypto';

const POLICY_KEYS = ['perMinuteLimit', 'dailyRequestLimit', 'totalBudgetMicroUsd', 'reserveCostMicroUsd', 'maxConcurrent', 'leaseMs', 'model', 'version'];
const MAX_HISTORY = 4000;
export class AdmissionError extends Error {
  constructor(code, retryable = false) {
    super(`Admission denied: ${code}`);
    this.name = 'AdmissionError';
    this.code = code;
    this.retryable = retryable;
  }
}
const fail = (code, retryable = false) => { throw new AdmissionError(code, retryable); };
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));

function validatePolicy(policy) {
  if (!exact(policy, POLICY_KEYS)) fail('invalid_policy');
  for (const key of POLICY_KEYS.slice(0, 6)) if (!integer(policy[key], 1)) fail('invalid_policy');
  if (policy.perMinuteLimit > 60 || policy.dailyRequestLimit > 10000 || policy.maxConcurrent > 20 || policy.leaseMs > 86400000 ||
      typeof policy.model !== 'string' || !policy.model || policy.model.length > 200 ||
      typeof policy.version !== 'string' || !policy.version || policy.version.length > 100) fail('invalid_policy');
  return Object.fromEntries(POLICY_KEYS.map(key => [key, policy[key]]));
}

function validateState(state, app) {
  if (!exact(state, ['schema', 'app', 'policy', 'reservedMicroUsd', 'day', 'dailyCount', 'recent', 'leases', 'seen', 'lastNow']) || state.schema !== 1 || state.app !== app) fail('corrupt_state');
  try { validatePolicy(state.policy); } catch { fail('corrupt_state'); }
  if (!integer(state.reservedMicroUsd) || !integer(state.dailyCount) || !integer(state.lastNow) ||
      typeof state.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.day) ||
      !Array.isArray(state.recent) || !Array.isArray(state.seen) || !object(state.leases) ||
      state.seen.length > MAX_HISTORY || state.recent.length > MAX_HISTORY ||
      state.seen.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) || new Set(state.seen).size !== state.seen.length ||
      state.recent.some(time => !integer(time) || time > state.lastNow) ||
      Object.entries(state.leases).some(([id, expiry]) => !state.seen.includes(id) || !integer(expiry)) ||
      state.reservedMicroUsd !== state.seen.length * state.policy.reserveCostMicroUsd ||
      state.reservedMicroUsd > state.policy.totalBudgetMicroUsd || state.dailyCount > state.policy.dailyRequestLimit ||
      state.dailyCount > state.seen.length || state.recent.length > state.policy.perMinuteLimit ||
      Object.keys(state.leases).length > state.policy.maxConcurrent ||
      state.day !== new Date(state.lastNow).toISOString().slice(0, 10)) fail('corrupt_state');
  return state;
}

/** Shared irreversible admission ledger. Provision Firestore and IAM separately.
 * complete() releases concurrency only, and must only follow verified completion.
 */
export function createFirestoreAdmission({ projectId, databaseId = '(default)', fetchImpl = fetch, clock = Date.now, getAccessToken, allowInitialize = false } = {}) {
  const configured = typeof projectId === 'string' && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) &&
    typeof databaseId === 'string' && /^(\(default\)|[a-z][a-z0-9-]{0,61}[a-z0-9])$/.test(databaseId);
  async function request(url, options, uncertain = false) {
    try { return await fetchImpl(url, options); }
    catch { fail(uncertain ? 'uncertain_write' : 'store_unavailable'); }
  }
  async function token(signal) {
    try {
      if (getAccessToken) {
        const value = await getAccessToken({ signal });
        if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) fail('auth_unavailable');
        return value;
      }
      const response = await request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' }, signal, redirect: 'error',
      });
      if (!response.ok || response.headers?.get('metadata-flavor') !== 'Google') fail('auth_unavailable');
      const body = await response.json();
      if (body.token_type !== 'Bearer' || typeof body.access_token !== 'string' || !body.access_token || /[\r\n]/.test(body.access_token) || !(body.expires_in > 0)) fail('auth_unavailable');
      return body.access_token;
    } catch { fail('auth_unavailable'); }
  }
  async function operate({ app, requestId, policy, signal }, completing) {
    if (!configured) fail('missing_config');
    if (typeof app !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(app) || typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 200) fail('invalid_request');
    const canonical = completing ? null : validatePolicy(policy);
    const timeout = AbortSignal.timeout(10000);
    const boundedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const accessToken = await token(boundedSignal);
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const name = `projects/${projectId}/databases/${databaseId}/documents/aiAdmission/${app}`;
    const url = `https://firestore.googleapis.com/v1/${name}`;
    const id = createHash('sha256').update(requestId).digest('hex');
    for (let attempt = 0; attempt < 6; attempt++) {
      if (boundedSignal.aborted) fail('store_unavailable');
      const read = await request(url, { headers, signal: boundedSignal, redirect: 'error' });
      let state, updateTime;
      const now = clock();
      if (!integer(now) || now > 8640000000000000) fail('invalid_clock');
      if (read.status === 404) {
        if (completing) fail('missing_reservation');
        if (allowInitialize !== true) fail('missing_state');
        state = { schema: 1, app, policy: canonical, reservedMicroUsd: 0, day: new Date(now).toISOString().slice(0, 10), dailyCount: 0, recent: [], leases: {}, seen: [], lastNow: now };
      } else {
        if (!read.ok) fail('store_unavailable');
        try {
          const doc = await read.json();
          if (doc.name !== name || typeof doc.updateTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(doc.updateTime) ||
              !exact(doc.fields, ['state']) || !exact(doc.fields.state, ['stringValue']) || typeof doc.fields.state.stringValue !== 'string') fail('corrupt_state');
          updateTime = doc.updateTime;
          state = validateState(JSON.parse(doc.fields.state.stringValue), app);
        } catch { fail('corrupt_state'); }
      }
      if (now < state.lastNow) fail('clock_regressed');
      if (!completing && POLICY_KEYS.some(key => state.policy[key] !== canonical[key])) fail('policy_mismatch');
      if (completing) {
        if (!state.seen.includes(id)) fail('missing_reservation');
        if (!Object.hasOwn(state.leases, id)) return { completed: true };
        delete state.leases[id];
      } else {
        if (state.seen.includes(id)) fail('duplicate_request');
        if (state.seen.length >= MAX_HISTORY) fail('ledger_capacity');
        const day = new Date(now).toISOString().slice(0, 10);
        if (day !== state.day) { state.day = day; state.dailyCount = 0; }
        state.recent = state.recent.filter(time => time > now - 60000);
        for (const [key, expiry] of Object.entries(state.leases)) if (expiry <= now) delete state.leases[key];
        if (state.recent.length >= canonical.perMinuteLimit) fail('rate_limit', true);
        if (state.dailyCount >= canonical.dailyRequestLimit) fail('daily_limit', true);
        if (canonical.reserveCostMicroUsd > canonical.totalBudgetMicroUsd - state.reservedMicroUsd) fail('budget_limit');
        if (Object.keys(state.leases).length >= canonical.maxConcurrent) fail('concurrency_limit', true);
        if (!integer(now + canonical.leaseMs)) fail('invalid_clock');
        state.reservedMicroUsd += canonical.reserveCostMicroUsd;
        state.dailyCount++;
        state.recent.push(now);
        state.seen.push(id);
        state.leases[id] = now + canonical.leaseMs;
      }
      // Advancing the date on completion must reset the daily counter as well.
      const day = new Date(now).toISOString().slice(0, 10);
      if (day !== state.day) { state.day = day; state.dailyCount = 0; }
      state.lastNow = now;
      const precondition = updateTime ? `currentDocument.updateTime=${encodeURIComponent(updateTime)}` : 'currentDocument.exists=false';
      const write = await request(`${url}?${precondition}`, {
        method: 'PATCH', headers, signal: boundedSignal, redirect: 'error',
        body: JSON.stringify({ name, fields: { state: { stringValue: JSON.stringify(state) } } }),
      }, true);
      if ([409, 412].includes(write.status)) continue;
      if (write.status === 400) {
        let status;
        try { status = (await write.json()).error?.status; } catch { fail('uncertain_write'); }
        if (status === 'FAILED_PRECONDITION') continue;
      }
      // A known precondition failure is safe to retry; no other failure is.
      if (!write.ok) fail('uncertain_write');
      try {
        const doc = await write.json();
        if (doc.name !== name || typeof doc.updateTime !== 'string' || doc.fields?.state?.stringValue !== JSON.stringify(state)) fail('uncertain_write');
      } catch { fail('uncertain_write'); }
      return completing ? { completed: true } : { admitted: true, reservedMicroUsd: canonical.reserveCostMicroUsd, leaseExpiresAt: now + canonical.leaseMs };
    }
    fail('contention', true);
  }
  return { reserve: (args) => operate(args, false), complete: (args) => operate(args, true) };
}
