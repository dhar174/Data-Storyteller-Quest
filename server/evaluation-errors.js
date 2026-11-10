// Reused from the earlier diagnostic-hardening patch. Never expose provider text.
export function describeEvaluationError(error) {
  const status = Number(error?.status);
  let code = 'EVALUATION_FAILED';
  let message = 'The manager simulator is unavailable. Please retry later or continue without a score.';
  if (error?.code === 'MISSING_GEMINI_API_KEY') {
    code = 'EVALUATION_NOT_CONFIGURED';
    message = 'The manager simulator is not configured. Please continue without a score.';
  } else if (status === 401 || status === 403) {
    code = 'EVALUATION_ACCESS_DENIED';
    message = 'The manager simulator could not access the AI service. Please continue without a score.';
  } else if (status === 404) {
    code = 'EVALUATION_MODEL_UNAVAILABLE';
    message = 'The configured manager simulator model is unavailable. Please continue without a score.';
  } else if (status === 429) {
    code = 'EVALUATION_RATE_LIMITED';
    message = 'The manager simulator has reached its usage limit. Please retry later or continue without a score.';
  } else if (error?.code === 'INVALID_GEMINI_RESPONSE' || error instanceof SyntaxError) {
    code = 'EVALUATION_INVALID_RESPONSE';
  }
  return { code, message, upstreamStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined };
}
