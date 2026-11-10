import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScenarioRecap } from '../types';
import { getJourneySummary } from './journeySummary';

function recap(id: string, bossSkipped: boolean, bossScore?: number): ScenarioRecap {
  return {
    scenarioId: id, scenarioTitle: id, totalSteps: 2, correctAnswers: 2,
    takeaway: 'Test takeaway', bossOutcomeSummary: 'Test outcome', bossSkipped, bossScore,
  };
}

test('two scored boss responses produce a complete assessment', () => {
  const summary = getJourneySummary([recap('a', false, 85), recap('b', false, 90)], 2, 100);
  assert.equal(summary.assessmentComplete, true);
  assert.equal(summary.assessedCount, 2);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.title, 'Simulation Complete');
  assert.equal(summary.scoreLabel, 'Final Trust Score');
  assert.match(summary.feedback, /high stakeholder trust in this simulation/);
});

for (const skippedCount of [1, 2]) {
  test(`${skippedCount} skipped evaluation(s) keep a 100% trust score provisional`, () => {
    const recaps = [recap('a', skippedCount === 2, skippedCount === 2 ? undefined : 85), recap('b', true)];
    const summary = getJourneySummary(recaps, 2, 100);
    assert.equal(summary.assessmentComplete, false);
    assert.equal(summary.assessedCount, 2 - skippedCount);
    assert.equal(summary.skippedCount, skippedCount);
    assert.equal(summary.title, 'Practice Complete');
    assert.equal(summary.scoreLabel, 'Provisional Trust Score');
    assert.match(summary.description, /Assessment incomplete/);
    assert.doesNotMatch(summary.feedback, /master|high stakeholder trust/);
  });
}

test('missing and invalid scores do not count as assessed', () => {
  for (const score of [undefined, NaN, Infinity, -1, 101]) {
    const summary = getJourneySummary([recap('a', false, 80), recap('b', false, score)], 2, 100);
    assert.equal(summary.assessmentComplete, false);
    assert.equal(summary.assessedCount, 1);
  }
});

test('a zero score is an assessment, while a skipped fallback score is not', () => {
  assert.equal(getJourneySummary([recap('a', false, 0)], 1, 30).assessmentComplete, true);
  assert.equal(getJourneySummary([recap('a', true, 50)], 1, 100).assessmentComplete, false);
});

test('empty or partial journeys cannot claim a completed assessment', () => {
  assert.equal(getJourneySummary([], 0, 100).assessmentComplete, false);
  assert.equal(getJourneySummary([recap('a', false, 80)], 2, 100).assessmentComplete, false);
});

test('duplicate recaps cannot substitute for a missing scenario evaluation', () => {
  const summary = getJourneySummary([recap('a', false, 80), recap('a', false, 90)], 2, 100);
  assert.equal(summary.assessmentComplete, false);
  assert.equal(summary.assessedCount, 1);
});

test('complete lower-trust journeys retain appropriate feedback', () => {
  const recaps = [recap('a', false, 50), recap('b', false, 50)];
  assert.match(getJourneySummary(recaps, 2, 60).feedback, /room to improve/);
  assert.match(getJourneySummary(recaps, 2, 30).feedback, /trust is low/);
});
