import { GoogleGenAI } from '@google/genai';
import { MODEL, SYSTEM_INSTRUCTION, EvaluationPolicyError } from './evaluation-policy.js';

// The installed SDK rejects config.systemInstruction on countTokens for the
// Gemini API. Its documented REST generateContentRequest form preserves it.
// Fixed destination, no redirect/retry and no caller-selected options.
export function createEvaluationProvider({ apiKey, fetchImpl = fetch } = {}) {
  const sdk = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return { models: {
    async countTokens({ contents, config = {} }) {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens`, {
        method: 'POST', redirect: 'error', signal: config.abortSignal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ generateContentRequest: {
          model: `models/${MODEL}`,
          systemInstruction: { role: 'user', parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: contents }] }],
        } }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error('TOKEN_COUNT_FAILED'), { status: response.status });
      }
      const reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) throw new EvaluationPolicyError('EVALUATION_INVALID_RESPONSE', 502);
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new EvaluationPolicyError('EVALUATION_INVALID_RESPONSE', 502); }
    },
    generateContent: (args) => sdk.models.generateContent(args),
  } };
}

