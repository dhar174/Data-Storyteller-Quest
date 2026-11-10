import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';
import { AdmissionError, createFirestoreAdmission } from './firestore-admission.js';
import { MODEL, POLICY_VERSION, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, validateEvaluationResult, readEvaluationPolicy } from './evaluation-policy.js';

const enabled = {
  EVALUATION_ENABLED: 'true', EVALUATION_PRICE_VERSION: POLICY_VERSION,
  EVALUATION_RATE_PER_MINUTE: '10', EVALUATION_DAILY_REQUEST_LIMIT: '100',
  EVALUATION_TOTAL_BUDGET_MICRO_USD: '2000000', EVALUATION_MAX_CONCURRENT: '3',
};
const validInput = { scenarioId: 'campaign-roi', userResponse: 'Test campaign A at larger scale while monitoring volume and CPA.' };
const result = { score: 85, feedback: 'Test feedback.', stakeholderReaction: 'Test reaction.' };

async function fixture(t, options = {}) {
  const events = [];
  const logs = [];
  const admission = options.admission ?? {
    reserve: async (args) => { events.push(['reserve', args]); return { admitted: true }; },
    complete: async (args) => { events.push(['complete', args]); return { completed: true }; },
  };
  const ai = options.ai ?? { models: {
    countTokens: async (args) => { events.push(['count', args]); return { totalTokens: 700 }; },
    generateContent: async (args) => { events.push(['generate', args]); return { text: JSON.stringify(result) }; },
  } };
  const app = createApp({ env: enabled, admission, ai,
    logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line) }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = validInput, route = '/api/evaluate-boss-response') => fetch(url + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { events, logs, url, post };
}

test('only server-owned scenario/model/options reach Gemini after durable admission', async (t) => {
  const f = await fixture(t);
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(f.events.map(([event]) => event), ['reserve', 'count', 'generate', 'complete']);
  const [, generation] = f.events.find(([event]) => event === 'generate');
  assert.equal(generation.model, MODEL);
  assert.equal(generation.config.maxOutputTokens, MAX_OUTPUT_TOKENS);
  assert.equal(generation.config.candidateCount, 1);
  assert.equal(generation.config.thinkingConfig.thinkingLevel, 'MINIMAL');
  assert.equal(generation.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(generation.config.tools, undefined);
  assert.equal(generation.config.httpOptions.baseUrl, undefined);
  const contents = JSON.parse(generation.contents);
  assert.equal(contents.stakeholderRole, 'Chief Marketing Officer');
  assert.match(contents.facts, /CPA \$20/);
  assert.equal(contents.studentResponse, validInput.userResponse);
  assert.equal(f.logs.join('').includes(validInput.userResponse), false);
});

test('reject caller overrides, unsupported scenarios, blanks and excessive answers before admission', async (t) => {
  const f = await fixture(t);
  for (const body of [null, [], {}, { ...validInput, model: 'expensive-model' }, { ...validInput, question: 'arbitrary' },
    { ...validInput, stakeholderRole: 'arbitrary' }, { ...validInput, scenarioId: '__proto__' },
    { ...validInput, userResponse: ' ' }, { ...validInput, userResponse: 'x'.repeat(2001) }]) {
    assert.equal((await f.post(body)).status, 400);
  }
  assert.equal(f.events.length, 0);
});

test('body limits, content type, API allowlist and method rules apply before provider calls', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post({ ...validInput, userResponse: 'x'.repeat(20000) })).status, 413);
  assert.equal((await fetch(f.url + '/api/evaluate-boss-response', { method: 'POST', body: 'x' })).status, 415);
  assert.equal((await f.post(validInput, '/api-proxy/models/generateContent')).status, 404);
  assert.equal((await f.post(validInput, '/api/models')).status, 404);
  assert.equal((await fetch(f.url + '/api/evaluate-boss-response')).status, 404);
  assert.equal(f.events.length, 0);
});

test('disabled or incomplete policy leaves public health working but performs no evaluation', async (t) => {
  for (const env of [{}, { ...enabled, EVALUATION_ENABLED: 'false' }, { ...enabled, GEMINI_MODEL: 'other-model' }, { ...enabled, EVALUATION_MAX_CONCURRENT: '' }]) {
    const f = await fixture(t, { env });
    assert.equal((await fetch(f.url + '/healthz')).status, 200);
    assert.equal((await f.post()).status, 503);
    assert.equal(f.events.length, 0);
  }
});

test('shared limit denial and uncertain admissions cannot call countTokens or generate', async (t) => {
  for (const code of ['budget_limit', 'rate_limit', 'concurrency_limit', 'uncertain_write', 'store_unavailable', 'policy_mismatch']) {
    const f = await fixture(t, { admission: {
      reserve: async () => { throw new AdmissionError(code); },
      complete: async () => assert.fail('must not complete'),
    } });
    const response = await f.post();
    assert.equal(response.status, ['budget_limit', 'rate_limit', 'concurrency_limit'].includes(code) ? 429 : 503);
    assert.equal(f.events.length, 0);
  }
});

test('oversized or missing authoritative token counts never generate or refund', async (t) => {
  for (const count of [undefined, 0, MAX_INPUT_TOKENS + 1]) {
    const f = await fixture(t, { ai: { models: {
      countTokens: async () => ({ totalTokens: count }), generateContent: async () => assert.fail('must not generate'),
    } } });
    assert.ok([413, 502].includes((await f.post()).status));
    assert.deepEqual(f.events.map(([event]) => event), ['reserve']);
  }
});

test('provider failures return only safe metadata and keep the reservation', async (t) => {
  const f = await fixture(t, { ai: { models: {
    countTokens: async () => ({ totalTokens: 100 }),
    generateContent: async () => { throw Object.assign(new Error('PRIVATE_PROVIDER_SECRET'), { status: 429 }); },
  } } });
  const response = await f.post();
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /EVALUATION_RATE_LIMITED/);
  assert.doesNotMatch(body + f.logs.join(''), /PRIVATE_PROVIDER_SECRET/);
  assert.deepEqual(f.events.map(([event]) => event), ['reserve']);
});

test('timeout does not retry or release uncertain upstream work', async (t) => {
  let calls = 0;
  const f = await fixture(t, { timeouts: { admission: 1000, count: 1000, generation: 15, complete: 1000 }, ai: { models: {
    countTokens: async () => ({ totalTokens: 100 }),
    generateContent: async () => { calls++; return new Promise(() => {}); },
  } } });
  const response = await f.post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'EVALUATION_TIMEOUT');
  assert.equal(calls, 1);
  assert.deepEqual(f.events.map(([event]) => event), ['reserve']);
});

test('release failure does not turn a completed evaluation into another provider call', async (t) => {
  const f = await fixture(t, { admission: {
    reserve: async () => ({ admitted: true }), complete: async () => { throw new Error('uncertain release'); },
  } });
  assert.equal((await f.post()).status, 200);
  assert.deepEqual(f.events.map(([event]) => event), ['count', 'generate']);
  assert.match(f.logs.join(''), /evaluation_lease_release_failed/);
});

test('response schema rejects null, fractional/out-of-range scores, empty and excessive feedback', () => {
  for (const value of [null, [], { ...result, score: 50.1 }, { ...result, score: 101 }, { ...result, feedback: '' },
    { ...result, feedback: 'x'.repeat(1201) }, { ...result, stakeholderReaction: 'x'.repeat(401) }, { ...result, unexpected: true }]) {
    assert.throws(() => validateEvaluationResult(JSON.stringify(value)), /EVALUATION_INVALID_RESPONSE/);
  }
  assert.throws(() => validateEvaluationResult('bad json'), /EVALUATION_INVALID_RESPONSE/);
});

test('approved limits must be explicit positive bounded integers and fixed price version', () => {
  for (const [key, value] of [['EVALUATION_RATE_PER_MINUTE', '61'], ['EVALUATION_TOTAL_BUDGET_MICRO_USD', '0'],
    ['EVALUATION_MAX_CONCURRENT', '3.5'], ['EVALUATION_DAILY_REQUEST_LIMIT', '-1'], ['EVALUATION_PRICE_VERSION', 'unreviewed']]) {
    assert.throws(() => readEvaluationPolicy({ ...enabled, [key]: value }), /EVALUATION_NOT_CONFIGURED/);
  }
});

test('two HTTP app instances share a single atomic budget and never over-generate', async (t) => {
  let doc;
  let revision = 0;
  let generations = 0;
  const now = Date.parse('2026-11-10T12:00:00Z');
  const env = { ...enabled, EVALUATION_TOTAL_BUDGET_MICRO_USD: '40000' };
  const policy = readEvaluationPolicy(env);
  const name = 'projects/test-project/databases/(default)/documents/aiAdmission/data-storyteller-quest';
  doc = { name, updateTime: '2026-11-10T12:00:00.000000000Z', fields: { state: { stringValue: JSON.stringify({
    schema: 1, app: 'data-storyteller-quest', policy, reservedMicroUsd: 0,
    day: '2026-11-10', dailyCount: 0, recent: [], leases: {}, seen: [], lastNow: now,
  }) } } };
  const fetchImpl = async (url, options) => {
    const reply = (status, body) => ({ status, ok: status === 200, json: async () => structuredClone(body) });
    if (options.method !== 'PATCH') return reply(200, structuredClone(doc));
    await Promise.resolve();
    if (new URL(url).searchParams.get('currentDocument.updateTime') !== doc.updateTime) return reply(400, { error: { status: 'FAILED_PRECONDITION' } });
    doc = { ...JSON.parse(options.body), updateTime: `2026-11-10T12:00:00.${String(++revision).padStart(9, '0')}Z` };
    return reply(200, structuredClone(doc));
  };
  const ai = { models: {
    countTokens: async () => ({ totalTokens: 200 }),
    generateContent: async () => { generations++; return { text: JSON.stringify(result) }; },
  } };
  const make = () => createFirestoreAdmission({ projectId: 'test-project', clock: () => now, fetchImpl, getAccessToken: async () => 'fake-token' });
  const first = await fixture(t, { env, ai, admission: make() });
  const second = await fixture(t, { env, ai, admission: make() });
  const responses = await Promise.all([first.post(), second.post(), first.post(), second.post()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 429, 429]);
  assert.equal(generations, 2);
  assert.equal(JSON.parse(doc.fields.state.stringValue).reservedMicroUsd, 40000);
  const restarted = await fixture(t, { env, ai, admission: make() });
  const denied = await restarted.post();
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('retry-after'), null);
  assert.equal(generations, 2);
});
