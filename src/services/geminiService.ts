import { GoogleGenAI, Type } from '@google/genai';
import { BossEvaluation } from '../types';

let aiInstance: GoogleGenAI | null = null;

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

export async function evaluateBossResponse(
  stakeholderRole: string,
  question: string,
  userResponse: string
): Promise<BossEvaluation> {
  const ai = getAI();
  
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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
      throw new Error('No response from Gemini');
    }
    
    return JSON.parse(text) as BossEvaluation;
  } catch (error) {
    console.error('Error evaluating boss response:', error);
    return {
      score: 50,
      feedback: 'There was an error connecting to your manager. They gave you a neutral score.',
      stakeholderReaction: 'I guess that\'s fine for now.',
    };
  }
}
