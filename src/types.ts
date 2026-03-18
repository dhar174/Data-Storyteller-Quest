export type GameState = 'MENU' | 'SCENARIO' | 'BOSS' | 'END';

export interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
  scoreImpact: number;
}

export interface ScenarioStep {
  id: string;
  type: 'VISUALIZATION' | 'NARRATIVE';
  context: string;
  dataSummary: string;
  revealedDataSummary?: string;
  question: string;
  choices: Choice[];
  chartData?: any[];
  chartType?: 'BAR' | 'LINE';
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  stakeholder: string;
  stakeholderRole: string;
  steps: ScenarioStep[];
  bossQuestion: string;
}

export interface BossEvaluation {
  score: number;
  feedback: string;
  stakeholderReaction: string;
}

export interface ScenarioStepResult {
  stepId: string;
  question: string;
  selectedChoiceId: string;
  selectedChoiceText: string;
  wasCorrect: boolean;
  feedback: string;
}

export interface ScenarioRecap {
  scenarioId: string;
  scenarioTitle: string;
  totalSteps: number;
  correctAnswers: number;
  takeaway: string;
  bossScore?: number;
  bossOutcomeSummary: string;
  bossSkipped?: boolean;
  bossNote?: string;
}
