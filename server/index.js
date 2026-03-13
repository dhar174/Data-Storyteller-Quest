import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const model = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview';

app.use(express.json({ limit: '1mb' }));

let aiInstance = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fallbackEvaluation() {
  return {
    score: 50,
    feedback: 'There was an error connecting to your manager. They gave you a neutral score.',
    stakeholderReaction: "I guess that's fine for now.",
  };
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/api/evaluate-boss-response', async (req, res) => {
  const { stakeholderRole, question, userResponse } = req.body ?? {};

  if (!isNonEmptyString(stakeholderRole) || !isNonEmptyString(question) || !isNonEmptyString(userResponse)) {
    res.status(400).json({
      error: 'Invalid request body. Expected non-empty stakeholderRole, question, and userResponse strings.',
    });
    return;
  }

  const prompt = `
You are an expert Data Science Manager evaluating a junior data scientist's response to a stakeholder.
The stakeholder is a ${stakeholderRole}.
Stakeholder question: "${question}"
Junior's response: "${userResponse}"

Evaluate the response based on:
1. Empathy/Understanding the stakeholder's goal.
2. Data accuracy/logic (even if hypothetical, is the reasoning sound?).
3. Clarity and actionability.

Return a JSON object with:
- score: An integer from 1 to 100 representing the quality of the response.
- feedback: A short paragraph of constructive feedback explaining why they got that score.
- stakeholderReaction: A quote from the stakeholder reacting to the response (e.g., "That makes sense, let's try it." or "I'm still confused...").
`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: {
              type: Type.INTEGER,
              description: 'Score from 1 to 100',
            },
            feedback: {
              type: Type.STRING,
              description: 'Constructive feedback paragraph',
            },
            stakeholderReaction: {
              type: Type.STRING,
              description: 'Quote from the stakeholder',
            },
          },
          required: ['score', 'feedback', 'stakeholderReaction'],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('No response text from Gemini');
    }

    const parsed = JSON.parse(text);
    if (!Number.isFinite(parsed.score) || typeof parsed.feedback !== 'string' || typeof parsed.stakeholderReaction !== 'string') {
      throw new Error('Gemini response did not match expected schema');
    }

    const safeScore = Math.max(1, Math.min(100, Math.round(parsed.score)));
    res.status(200).json({
      score: safeScore,
      feedback: parsed.feedback,
      stakeholderReaction: parsed.stakeholderReaction,
    });
  } catch (error) {
    console.error('Error evaluating boss response:', error);
    res.status(502).json({
      error: 'Failed to evaluate response via Gemini.',
      fallback: fallbackEvaluation(),
    });
  }
});

app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
