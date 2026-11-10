// Local UI fixture only: actual app route, fake admission and provider, no outbound calls.
// Include [scored] in a response for deterministic success; otherwise it fails.
import { createApp } from '../server/app.js';
import { POLICY_VERSION } from '../server/evaluation-policy.js';
const env = {
  EVALUATION_ENABLED: 'true', EVALUATION_PRICE_VERSION: POLICY_VERSION,
  EVALUATION_RATE_PER_MINUTE: '10', EVALUATION_DAILY_REQUEST_LIMIT: '100',
  EVALUATION_TOTAL_BUDGET_MICRO_USD: '2000000', EVALUATION_MAX_CONCURRENT: '3',
};
const admission = { reserve: async () => ({ admitted: true }), complete: async () => ({ completed: true }) };
const ai = { models: {
  countTokens: async () => ({ totalTokens: 100 }),
  generateContent: async ({ contents }) => {
    if (!JSON.parse(contents).studentResponse.includes('[scored]')) throw Object.assign(new Error('Local simulated unavailability'), { status: 429 });
    return { text: JSON.stringify({ score: 85, feedback: 'Local test feedback. No model was called.', stakeholderReaction: 'Local test reaction.' }) };
  },
} };
createApp({ env, admission, ai }).listen(18081, '127.0.0.1', () => console.log('Local-only fixture on 127.0.0.1:18081'));
