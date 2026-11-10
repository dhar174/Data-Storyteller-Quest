import { randomUUID } from 'node:crypto';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  MODEL, SYSTEM_INSTRUCTION, RESPONSE_JSON_SCHEMA, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS,
  EvaluationPolicyError, validateEvaluationRequest, buildEvaluationContents,
  validateEvaluationResult, readEvaluationPolicy,
} from './evaluation-policy.js';
import { createFirestoreAdmission, AdmissionError } from './firestore-admission.js';
import { describeEvaluationError } from './evaluation-errors.js';

const APP_ID = 'data-storyteller-quest';
const TIMEOUTS = { admission: 6000, count: 8000, generation: 25000, complete: 3000 };
async function bounded(ms, action) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => action(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new EvaluationPolicyError('EVALUATION_TIMEOUT', 503)); }, ms);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createApp({ env = process.env, admission, ai, logger = console, distPath, timeouts = TIMEOUTS } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12kb', strict: true, inflate: false }));
  let policy;
  let configError;
  try {
    policy = readEvaluationPolicy(env);
    admission ??= createFirestoreAdmission({ projectId: env.EVALUATION_STORE_PROJECT, databaseId: env.EVALUATION_STORE_DATABASE ?? '(default)' });
    if (!admission || typeof admission.reserve !== 'function' || typeof admission.complete !== 'function') throw new Error('Invalid adapter');
    if (!ai && !env.GEMINI_API_KEY) throw new Error('Missing provider configuration');
  } catch { configError = true; }

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.post('/api/evaluate-boss-response', async (req, res) => {
    const requestId = randomUUID();
    let scenarioId;
    try {
      if (!req.is('application/json')) throw new EvaluationPolicyError('INVALID_CONTENT_TYPE', 415);
      const input = validateEvaluationRequest(req.body);
      scenarioId = input.scenarioId;
      if (configError) throw new EvaluationPolicyError('EVALUATION_NOT_CONFIGURED', 503);
      const reservation = await bounded(timeouts.admission, (signal) => admission.reserve({ app: APP_ID, requestId, policy, signal }));
      if (reservation?.admitted !== true) throw new EvaluationPolicyError('EVALUATION_LIMIT_REACHED', 429);

      // No caller-controlled model, upstream URL, prompts, tools or retry options.
      ai ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { retryOptions: { attempts: 1 } } });
      const contents = buildEvaluationContents(input);
      const tokenCount = await bounded(timeouts.count, (signal) => ai.models.countTokens({
        model: MODEL, contents,
        config: { systemInstruction: SYSTEM_INSTRUCTION, abortSignal: signal, httpOptions: { timeout: timeouts.count, retryOptions: { attempts: 1 } } },
      }));
      if (!Number.isInteger(tokenCount?.totalTokens) || tokenCount.totalTokens < 1) throw new EvaluationPolicyError('EVALUATION_INVALID_RESPONSE', 502);
      if (tokenCount.totalTokens > MAX_INPUT_TOKENS) throw new EvaluationPolicyError('EVALUATION_INPUT_TOO_LARGE', 413);

      const response = await bounded(timeouts.generation, (signal) => ai.models.generateContent({
        model: MODEL, contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json', responseJsonSchema: RESPONSE_JSON_SCHEMA,
          candidateCount: 1, maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: 'MINIMAL', includeThoughts: false },
          abortSignal: signal,
          httpOptions: { timeout: timeouts.generation, retryOptions: { attempts: 1 } },
        },
      }));
      const evaluation = validateEvaluationResult(response.text);
      // Release only a completed lease, never the irreversible spend reservation.
      try { await bounded(timeouts.complete, (signal) => admission.complete({ app: APP_ID, requestId, signal })); }
      catch { logger.warn(JSON.stringify({ event: 'evaluation_lease_release_failed', requestId, scenarioId })); }
      logger.info(JSON.stringify({ event: 'boss_evaluation_completed', requestId, scenarioId, model: MODEL, countedInputTokens: tokenCount.totalTokens }));
      res.set('Cache-Control', 'no-store').json(evaluation);
    } catch (error) {
      const mapped = describeEvaluationError(error);
      const policyError = error instanceof EvaluationPolicyError;
      const admissionError = error instanceof AdmissionError;
      const quotaError = admissionError && ['rate_limit', 'daily_limit', 'budget_limit', 'concurrency_limit', 'ledger_capacity'].includes(error.code);
      const code = policyError ? error.code : quotaError ? 'EVALUATION_LIMIT_REACHED' : admissionError ? 'EVALUATION_UNAVAILABLE' : mapped.code;
      const status = policyError ? error.status : quotaError ? 429 : 503;
      logger.warn(JSON.stringify({ event: 'boss_evaluation_failed', requestId, scenarioId, code, upstreamStatus: admissionError ? undefined : mapped.upstreamStatus }));
      const messages = {
        INVALID_EVALUATION_REQUEST: 'Choose a supported scenario and enter a response of at most 2,000 characters.',
        INVALID_CONTENT_TYPE: 'Send a JSON evaluation request.',
        EVALUATION_LIMIT_REACHED: 'The shared evaluation allowance is currently full. Please try later or continue without a score.',
        EVALUATION_INPUT_TOO_LARGE: 'Your response is too large to evaluate. Please shorten it.',
      };
      if (quotaError && error.retryable) res.set('Retry-After', '60');
      res.status(status).set('Cache-Control', 'no-store').json({ error: messages[code] ?? mapped.message, code, requestId });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  app.use('/api-proxy', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  if (distPath) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: distPath }));
  }
  app.use((error, _req, res, _next) => {
    const status = error?.type === 'entity.too.large' ? 413 : error?.status === 415 ? 415 : 400;
    res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Invalid request body.' });
  });
  return app;
}
