Original prompt: PLEASE IMPLEMENT THIS PLAN:
# Next PR Batch for Issues #14-#17

## Summary
Ship four more single-issue PRs, with related UX work stacked to avoid duplicating the same boss/results scaffolding.

Recommended branch strategy:
- `#17` from `main`
- `#14` from `main`
- `#16` from the existing scenario-progress branch/PR (`codex/fix-issue-7-scenario-progress` / PR #13)
- `#15` from the `#16` branch so the end-screen context and recap land together cleanly

Important interface/type changes:
- `evaluateBossResponse()` should stop returning a fake neutral success on failure and instead surface an error to the caller.
- `#15` should add lightweight recap/history types in `src/types.ts` for completed step outcomes and per-scenario summaries.

## Key Changes
### PR for `#17` Start-Screen Primer
- Add a compact `How it works` block to the menu under the intro copy and above the CTA.
- Use 3 short steps: review the scenario, answer the coached questions, respond to the stakeholder prompt.
- Add one small meta row such as `2 scenarios`, `multiple choice + free response`, `finish with a trust score`.
- Keep the visual treatment lightweight: short cards or badges, not a full rules screen.

### PR for `#14` Boss Failure Recovery
- Change `src/services/geminiService.ts` so request failures throw a meaningful error instead of returning the current neutral fallback object.
- In `src/App.tsx`, add boss-stage error state separate from successful `bossEvaluation`.
- Preserve the textarea draft on failure.
- After a failed submission, show:
  - a clear inline error banner
  - `Retry` by re-submitting the preserved draft
  - `Continue without score` as an explicit skip path
- Skipping advances to the next scenario/end without mutating trust score and without rendering the normal evaluation card.
- Clear the error when the user edits the draft or when a retry succeeds.

### PR for `#16` Boss/Results Context
- Build on the scenario-progress work from PR #13.
- Reuse the same framing pattern for the boss stage: scenario badge, step/journey context, scenario title, and description above the stakeholder prompt.
- Add lightweight completion context to the end screen: overall journey summary plus scenario titles/chips so the results page still feels tied to the run.
- Do not add recap cards here; keep this PR focused on orientation and continuity only.

### PR for `#15` Post-Run Recap
- Build on the `#16` branch.
- Add recap state for the current run:
  - current scenario step results captured at answer time
  - completed scenario summaries finalized when leaving each boss stage
- Add recap types in `src/types.ts` with enough data to render:
  - scenario title
  - correct/incorrect count
  - a short takeaway based on the player’s answers
  - boss outcome summary
  - optional `bossSkipped` / `bossNote` fields for compatibility with `#14`
- Render one compact recap card per scenario on the final screen.
- Each card should show:
  - scenario title
  - `X / Y` coached questions answered correctly
  - one concise coaching takeaway
  - boss outcome: score + short note, or `Skipped due to connection issue`
- Reset recap history on `Play Again`.

Notes:
- PR #18 for issue #17 is already open from `codex/fix-issue-17-start-screen-primer`.
- PR #21 for issue #14 is already open from `codex/fix-issue-14-boss-error-recovery`.
- Current focus is issue #16 on `codex/fix-issue-16-boss-results-context`.

Update:
- Added a reusable `ContextPanel` in `src/App.tsx` and used it for scenario, boss, and end-state framing.
- Boss screens now show scenario badge + boss-review context above the stakeholder prompt.
- Final results screen now includes a lightweight journey summary with scenario title chips before the trophy / score card.
- Validation for issue #16:
  - `npm run lint`
  - `npm run build`
  - Playwright walkthrough from menu through both boss rounds and final results with mocked `/api/evaluate` responses
  - Verified boss context at desktop and mobile widths
  - Verified final journey summary at mobile and desktop widths
  - Console check returned no browser errors
- The standalone `develop-web-game` Playwright client could not be used directly because its runtime is missing the `playwright` package, so browser verification used the built-in persistent Playwright tools instead.

Update:
- Created stacked branch `codex/fix-issue-15-post-run-recap` from `codex/fix-issue-16-boss-results-context`.
- Added `ScenarioStepResult` and `ScenarioRecap` types in `src/types.ts`.
- The app now records step outcomes as answers are chosen and finalizes one recap per scenario when the boss stage is completed.
- Final results now render one compact recap card per scenario with:
  - scenario title
  - coached-question accuracy
  - a takeaway tied to the specific step(s) the player missed
  - boss outcome score + one-sentence feedback summary
- `PLAY AGAIN` clears recap history by resetting run state in `startGame()`.
- Validation for issue #15:
  - `npm run lint`
  - `npm run build`
  - mixed-result Playwright walkthrough with mocked `/api/evaluate-boss-response`
  - verified two recap cards render with distinct takeaways
  - verified boss outcome summaries render on the recap cards
  - verified `PLAY AGAIN` resets the run to scenario 1 with no prior recap state carried forward
  - verified browser console is clean on the mocked success path
