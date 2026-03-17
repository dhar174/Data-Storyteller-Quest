import { BossEvaluation } from '../types';

const BOSS_EVALUATION_UNAVAILABLE_MESSAGE =
  'We could not reach the manager simulator. Please retry or continue without a score.';

class BossEvaluationRequestError extends Error {}

export async function evaluateBossResponse(
  stakeholderRole: string,
  question: string,
  userResponse: string
): Promise<BossEvaluation> {
  try {
    const response = await fetch('/api/evaluate-boss-response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stakeholderRole,
        question,
        userResponse,
      }),
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const payload = await response.json() as { error?: string; fallback?: BossEvaluation };
        if (payload.error) {
          message = payload.error;
        }
      } catch {
        // Ignore parse errors and fall back to a generic message.
      }
      throw new BossEvaluationRequestError(message);
    }

    return await response.json() as BossEvaluation;
  } catch (error) {
    console.error('Error evaluating boss response:', error);
    if (error instanceof BossEvaluationRequestError && error.message) {
      throw error;
    }

    throw new Error(BOSS_EVALUATION_UNAVAILABLE_MESSAGE, { cause: error });
  }
}
