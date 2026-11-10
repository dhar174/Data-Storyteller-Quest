import type { ScenarioRecap } from '../types';

export function getJourneySummary(recaps: ScenarioRecap[], totalScenarios: number, trustScore: number) {
  const scenarioRecaps = Array.from(new Map(recaps.map((recap) => [recap.scenarioId, recap])).values());
  const assessedCount = scenarioRecaps.filter((recap) =>
    !recap.bossSkipped && typeof recap.bossScore === 'number' &&
    Number.isFinite(recap.bossScore) && recap.bossScore >= 0 && recap.bossScore <= 100
  ).length;
  const skippedCount = scenarioRecaps.filter((recap) => recap.bossSkipped).length;
  const assessmentComplete = totalScenarios > 0 && assessedCount === totalScenarios;

  return {
    assessedCount,
    skippedCount,
    assessmentComplete,
    title: assessmentComplete ? 'Simulation Complete' : 'Practice Complete',
    scoreLabel: assessmentComplete ? 'Final Trust Score' : 'Provisional Trust Score',
    description: assessmentComplete
      ? 'You completed every scenario and boss evaluation. Review your results below.'
      : 'Assessment incomplete: one or more boss responses were not scored. Your practice progress is shown in the recap below.',
    feedback: !assessmentComplete
      ? 'Your trust score reflects the scored activities only. Unscored boss responses do not lower it, but this is not a complete assessment. Play again when evaluation is available to complete the assessment.'
      : trustScore >= 80
        ? 'Strong work. You completed every boss evaluation and built high stakeholder trust in this simulation.'
        : trustScore >= 50
          ? "Good job. You have a solid foundation, but there's room to improve your narrative framing."
          : "You survived, but trust is low. Remember to focus on actionable insights and empathy for the stakeholder's goals.",
  };
}
