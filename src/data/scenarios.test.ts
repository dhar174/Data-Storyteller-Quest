import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENARIOS } from './scenarios';
import { SCENARIO_PROMPTS } from '../../server/evaluation-policy.js';

test('server-owned evaluation scenarios match the lessons shown to students', () => {
  assert.deepEqual(Object.keys(SCENARIO_PROMPTS).sort(), SCENARIOS.map((scenario) => scenario.id).sort());
  for (const scenario of SCENARIOS) {
    assert.equal(SCENARIO_PROMPTS[scenario.id].question, scenario.bossQuestion);
    assert.equal(SCENARIO_PROMPTS[scenario.id].stakeholderRole, scenario.stakeholderRole);
  }
});

test('the rewarded Day 3 narrative agrees with the plotted retention rates', () => {
  const scenario = SCENARIOS.find((scenario) => scenario.id === 'churn-crisis')!;
  const chart = scenario.steps.find((step) => step.chartType === 'LINE')!;
  const day3 = chart.chartData!.find((row) => row.day === 'Day 3');
  const narrative = scenario.steps.find((step) => step.type === 'NARRATIVE')!;
  const answer = narrative.choices.find((choice) => choice.isCorrect)!;

  assert.match(answer.text, new RegExp(`retention is ${day3['Skipped Onboarding']}% for users who skipped onboarding, versus ${day3['Completed Onboarding']}% for those who completed it`));
  assert.doesNotMatch(answer.text, /3x|more likely to churn/);
  assert.match(answer.feedback, /does not prove/);
});
