import { BossEvaluation } from '../types';

function fallbackEvaluation(): BossEvaluation {
  return {
    score: 50,
    feedback: 'There was an error connecting to your manager. They gave you a neutral score.',
    stakeholderReaction: 'I guess that\'s fine for now.',
  };
}

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
        if (payload.fallback) {
          return payload.fallback;
        }
      } catch {
        // Ignore parse errors and fall back to a generic message.
      }
      throw new Error(message);
    }

    return await response.json() as BossEvaluation;
  } catch (error) {
    console.error('Error evaluating boss response:', error);
    return fallbackEvaluation();
  }
}
