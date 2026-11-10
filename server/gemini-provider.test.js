import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleGenAI } from '@google/genai';
import { createEvaluationProvider } from './gemini-provider.js';
import { createApp } from './app.js';
import { MODEL, SYSTEM_INSTRUCTION, POLICY_VERSION, RESPONSE_JSON_SCHEMA } from './evaluation-policy.js';

const fakeKey = 'offline-test-only';
test('documents installed SDK regression without making a network request', async () => {
  const ai = new GoogleGenAI({ apiKey: fakeKey });
  await assert.rejects(ai.models.countTokens({ model: MODEL, contents: 'test', config: {
    systemInstruction: SYSTEM_INSTRUCTION,
  } }), /systemInstruction parameter is not supported/);
});

test('real SDK generation and REST counting share exact normalized contents and system instruction', async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const expected = { score: 85, feedback: 'Clear evidence-based recommendation.', stakeholderReaction: 'Let us test it.' };
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3-flash-preview:(countTokens|generateContent)$/);
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(String(url).endsWith(':countTokens') ? { totalTokens: 700 } : {
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(expected) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 40, totalTokenCount: 740 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const events = [];
  const logs = [];
  const app = createApp({ env: {
    GEMINI_API_KEY: fakeKey, EVALUATION_ENABLED: 'true', EVALUATION_PRICE_VERSION: POLICY_VERSION,
    EVALUATION_RATE_PER_MINUTE: '30', EVALUATION_DAILY_REQUEST_LIMIT: '250',
    EVALUATION_TOTAL_BUDGET_MICRO_USD: '20000000', EVALUATION_MAX_CONCURRENT: '5',
  }, admission: {
    reserve: async () => { events.push('reserve'); assert.equal(calls.length, 0); return { admitted: true }; },
    complete: async () => { events.push('complete'); },
  }, logger: { info: (v) => logs.push(v), warn: (v) => logs.push(v) } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/evaluate-boss-response`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId: 'campaign-roi', userResponse: 'Test the cheaper campaign at greater scale.' }),
  });
  assert.equal(response.status, 200, logs.join('\n'));
  assert.deepEqual(await response.json(), expected);
  assert.deepEqual(events, ['reserve', 'complete']);
  assert.equal(calls.length, 2);
  const [count, generation] = calls;
  assert.equal(count.options.redirect, 'error');
  assert.equal(count.options.headers['x-goog-api-key'], fakeKey);
  assert.equal(count.body.generateContentRequest.model, `models/${MODEL}`);
  assert.deepEqual(count.body.generateContentRequest.contents, generation.body.contents);
  assert.deepEqual(count.body.generateContentRequest.systemInstruction, generation.body.systemInstruction);
  assert.deepEqual(generation.body.generationConfig.responseJsonSchema, RESPONSE_JSON_SCHEMA);
  assert.equal(generation.body.generationConfig.maxOutputTokens, 2048);
  assert.equal(generation.body.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
  assert.doesNotMatch(logs.join(''), /offline-test-only|Test the cheaper campaign/);
});

test('REST counter rejects errors and oversized replies without retries or raw messages', async () => {
  for (const response of [new Response('PRIVATE_ERROR', { status: 429 }), new Response('x'.repeat(16385))]) {
    let calls = 0;
    const provider = createEvaluationProvider({ apiKey: fakeKey, fetchImpl: async () => { calls++; return response; } });
    await assert.rejects(provider.models.countTokens({ contents: 'test' }), error => !error.message.includes('PRIVATE_ERROR'));
    assert.equal(calls, 1);
  }
});
