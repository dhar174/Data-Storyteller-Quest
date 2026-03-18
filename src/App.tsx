import { type ReactNode, useEffect, useRef, useState } from 'react';
import { GameState, BossEvaluation, ScenarioStepResult, ScenarioRecap } from './types';
import { SCENARIOS } from './data/scenarios';
import { evaluateBossResponse } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, Legend } from 'recharts';
import { AlertCircle, ArrowRight, CheckCircle, XCircle, Trophy, Play, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SCENARIO_CARD_ENTRANCE_MS = 220;
const MENU_PRIMER_STEPS = [
  {
    id: '01',
    title: 'Read the scenario',
    body: 'Review the stakeholder context and the data in front of you before you make your call.',
  },
  {
    id: '02',
    title: 'Pick the strongest story',
    body: 'Choose the chart or narrative framing that best supports the stakeholder decision.',
  },
  {
    id: '03',
    title: 'Handle the boss prompt',
    body: 'Wrap each scenario with a short free-response answer that balances empathy, logic, and action.',
  },
] as const;

function ChartFrame({ children }: { children: (size: { width: number; height: number }) => ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      setSize((prev) => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', updateSize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateSize);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="h-56 sm:h-64 w-full min-w-0 mt-4">
      {size.width > 0 && size.height > 0 ? (
        children(size)
      ) : (
        <div className="h-full w-full rounded-lg border border-slate-800/80 bg-slate-900/40" />
      )}
    </div>
  );
}

type HeadingTag = `h${1 | 2 | 3 | 4 | 5 | 6}`;

function ContextPanel({
  badges,
  title,
  description,
  children,
  className,
  headingLevel = 2,
}: {
  badges: string[];
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const HeadingTag = `h${headingLevel}` as HeadingTag;

  return (
    <div className={cn("bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-xl", className)}>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-mono uppercase tracking-[0.2em] text-slate-400">
        {badges.map((badge) => (
          <span key={badge} className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">
            {badge}
          </span>
        ))}
      </div>
      <HeadingTag className="text-3xl font-black tracking-tight text-white mb-2">{title}</HeadingTag>
      <p className="text-slate-300 leading-relaxed max-w-3xl">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function getScenarioTakeaway(scenarioId: string, stepResults: ScenarioStepResult[], totalSteps: number) {
  const correctAnswers = stepResults.filter((result) => result.wasCorrect).length;

  if (correctAnswers === totalSteps) {
    if (scenarioId === 'campaign-roi') {
      return 'You kept the CMO focused on efficient growth and translated the data into a clear ROI story.';
    }

    if (scenarioId === 'churn-crisis') {
      return 'You tied the Day 3 retention drop to onboarding and turned the finding into a practical product experiment.';
    }

    return 'You translated the evidence into a clear stakeholder-ready story.';
  }

  const incorrectStepIds = stepResults
    .filter((result) => !result.wasCorrect)
    .map((result) => result.stepId);

  if (scenarioId === 'campaign-roi') {
    if (incorrectStepIds.includes('step-1-viz') && incorrectStepIds.includes('step-2-narrative')) {
      return 'Lead with CPA, not raw user totals, and turn that efficiency gap into the headline so the CMO knows what to do next.';
    }

    if (incorrectStepIds.includes('step-1-viz')) {
      return 'Lead with a CPA comparison so the CMO can judge efficiency before getting distracted by total user volume.';
    }

    if (incorrectStepIds.includes('step-2-narrative')) {
      return 'Turn the ROI chart into a headline that names the efficiency win instead of describing the slide.';
    }
  }

  if (scenarioId === 'churn-crisis') {
    if (incorrectStepIds.includes('step-1-viz') && incorrectStepIds.includes('step-2-narrative')) {
      return 'Show the onboarding gap as a retention trend and pair it with a concrete experiment the product team can run next.';
    }

    if (incorrectStepIds.includes('step-1-viz')) {
      return 'Use a retention trend so the Day 3 divergence after skipped onboarding is obvious over time, not just at one checkpoint.';
    }

    if (incorrectStepIds.includes('step-2-narrative')) {
      return 'Translate the churn signal into a specific onboarding experiment instead of stopping at a technical finding.';
    }
  }

  return 'Focus on making the data actionable and relevant for the stakeholder.';
}

function summarizeBossFeedback(feedback: string) {
  const normalized = feedback.trim();
  const firstSentenceMatch = normalized.match(/^.*?[.!?](?:\s|$)/);
  const summary = (firstSentenceMatch?.[0] ?? normalized).trim();

  if (summary.length <= 140) {
    return summary;
  }

  return `${summary.slice(0, 137).trimEnd()}...`;
}

function getSkillLabel(stepType: ScenarioStepResult['stepType']) {
  return stepType === 'VISUALIZATION' ? 'visual framing' : 'narrative framing';
}

function getBossCoachingSummary(recaps: ScenarioRecap[]) {
  const scoredRecaps = recaps.filter((recap) => typeof recap.bossScore === 'number');
  const skippedCount = recaps.filter((recap) => recap.bossSkipped).length;

  if (scoredRecaps.length === 0) {
    return skippedCount > 0
      ? 'Retry the boss prompts when you can—those answers are where you practice acknowledging concerns and landing on a recommendation.'
      : 'Use the boss prompts to practice acknowledging the concern, naming the trade-off, and ending with a recommendation.';
  }

  const averageBossScore = scoredRecaps.reduce((sum, recap) => sum + (recap.bossScore ?? 0), 0) / scoredRecaps.length;

  if (averageBossScore >= 75) {
    return 'Your boss responses worked best when you balanced stakeholder concerns with a clear recommendation. Keep that structure.'
  }

  if (averageBossScore >= 50) {
    return 'Your boss responses are on the right track. Push them further by naming the trade-off and ending with a firmer next step.'
  }

  return 'Focus your boss responses on empathy first, then tie the data to a concrete recommendation so the stakeholder knows what to do next.'
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [trustScore, setTrustScore] = useState(50); // Start at 50/100
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [bossInput, setBossInput] = useState('');
  const [bossEvaluation, setBossEvaluation] = useState<BossEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [bossError, setBossError] = useState<string | null>(null);
  const [showScenarioChart, setShowScenarioChart] = useState(false);
  const [currentScenarioStepResults, setCurrentScenarioStepResults] = useState<ScenarioStepResult[]>([]);
  const [completedScenarioRecaps, setCompletedScenarioRecaps] = useState<ScenarioRecap[]>([]);

  const currentScenario = SCENARIOS[currentScenarioIndex];
  const currentStep = currentScenario?.steps[currentStepIndex];
  const totalScenarios = SCENARIOS.length;
  const totalStepsInScenario = currentScenario.steps.length;
  const hasRevealedAnalysis = showFeedback;
  const currentDataSummary =
    hasRevealedAnalysis && currentStep?.revealedDataSummary
      ? currentStep.revealedDataSummary
      : currentStep?.dataSummary;
  const allStepResults = completedScenarioRecaps.flatMap((recap) => recap.stepResults);
  const missedStepResults = completedScenarioRecaps.flatMap((recap) =>
    recap.stepResults
      .filter((result) => !result.wasCorrect)
      .map((result) => ({
        ...result,
        scenarioId: recap.scenarioId,
        scenarioTitle: recap.scenarioTitle,
      }))
  );
  const correctByStepType = allStepResults.reduce(
    (totals, result) => {
      if (result.wasCorrect) {
        totals[result.stepType] += 1;
      }

      return totals;
    },
    { VISUALIZATION: 0, NARRATIVE: 0 }
  );
  const strongestSkillType =
    correctByStepType.VISUALIZATION === correctByStepType.NARRATIVE
      ? null
      : correctByStepType.VISUALIZATION > correctByStepType.NARRATIVE
        ? 'VISUALIZATION'
        : 'NARRATIVE';
  const perfectScenarioCount = completedScenarioRecaps.filter(
    (recap) => recap.correctAnswers === recap.totalSteps
  ).length;
  const strongestSkillSummary = strongestSkillType
    ? `Your best choices came in ${getSkillLabel(strongestSkillType)}. Keep leaning into that instinct when you shape the story.`
    : perfectScenarioCount > 0
      ? `You delivered a complete read on ${perfectScenarioCount} scenario${perfectScenarioCount === 1 ? '' : 's'}, balancing the chart choice and the narrative well.`
      : 'You showed flashes of strong stakeholder judgment. The next step is making those good instincts feel more consistent across scenarios.';
  const missedQuestionSummary =
    missedStepResults.length > 0
      ? `${missedStepResults.length} question${missedStepResults.length === 1 ? '' : 's'} tripped you up. Review the stronger answer choices below to tighten your next run.`
      : 'You did not miss any questions. That means your recap is mostly about reinforcing what already worked.';
  const bossCoachingSummary = getBossCoachingSummary(completedScenarioRecaps);

  useEffect(() => {
    if (gameState !== 'SCENARIO' || !currentStep?.chartData || !showFeedback) {
      setShowScenarioChart(false);
      return;
    }

    setShowScenarioChart(false);
    // Let the scenario card finish its entrance animation before Recharts measures.
    const timeoutId = window.setTimeout(() => {
      setShowScenarioChart(true);
    }, SCENARIO_CARD_ENTRANCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentStep?.id, currentStep?.chartData, gameState, showFeedback]);

  const startGame = () => {
    setGameState('SCENARIO');
    setCurrentScenarioIndex(0);
    setCurrentStepIndex(0);
    setTrustScore(50);
    setSelectedChoiceId(null);
    setShowFeedback(false);
    setBossError(null);
    setBossInput('');
    setBossEvaluation(null);
    setCurrentScenarioStepResults([]);
    setCompletedScenarioRecaps([]);
  };

  const handleChoice = (choiceId: string) => {
    if (showFeedback) return;
    setSelectedChoiceId(choiceId);
    setShowFeedback(true);
    
    const choice = currentStep.choices.find(c => c.id === choiceId);
    const correctChoice = currentStep.choices.find((candidate) => candidate.isCorrect);
    if (choice) {
      setTrustScore(prev => Math.max(0, Math.min(100, prev + choice.scoreImpact)));
      setCurrentScenarioStepResults((prev) => {
        const remainingResults = prev.filter((result) => result.stepId !== currentStep.id);

        return [
          ...remainingResults,
          {
            stepId: currentStep.id,
            stepType: currentStep.type,
            question: currentStep.question,
            selectedChoiceId: choice.id,
            selectedChoiceText: choice.text,
            correctChoiceText: correctChoice?.text ?? choice.text,
            wasCorrect: choice.isCorrect,
            feedback: choice.feedback,
          },
        ];
      });
    }
  };

  const nextStep = () => {
    setShowFeedback(false);
    setSelectedChoiceId(null);
    
    if (currentStepIndex < currentScenario.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setGameState('BOSS');
    }
  };

  const handleBossSubmit = async () => {
    if (!bossInput.trim() || isEvaluating) return;
    setIsEvaluating(true);
    setBossError(null);

    try {
      const evaluation = await evaluateBossResponse(
        currentScenario.stakeholderRole,
        currentScenario.bossQuestion,
        bossInput
      );

      setBossEvaluation(evaluation);
      setTrustScore(prev => Math.max(0, Math.min(100, prev + (evaluation.score > 70 ? 20 : evaluation.score < 40 ? -20 : 0))));
    } catch (error) {
      setBossError(
        error instanceof Error && error.message
          ? error.message
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const nextScenario = () => {
    const correctAnswers = currentScenarioStepResults.filter((result) => result.wasCorrect).length;
    const recap: ScenarioRecap = {
      scenarioId: currentScenario.id,
      scenarioTitle: currentScenario.title,
      totalSteps: currentScenario.steps.length,
      correctAnswers,
      takeaway: getScenarioTakeaway(currentScenario.id, currentScenarioStepResults, currentScenario.steps.length),
      bossScore: bossEvaluation?.score,
      bossOutcomeSummary: bossEvaluation
        ? summarizeBossFeedback(bossEvaluation.feedback)
        : 'Skipped due to connection issue.',
      bossSkipped: !bossEvaluation,
      bossNote: bossEvaluation ? undefined : 'Skipped due to connection issue.',
      stepResults: currentScenarioStepResults,
    };

    setCompletedScenarioRecaps((prev) => [...prev, recap]);
    setCurrentScenarioStepResults([]);
    setBossEvaluation(null);
    setBossInput('');
    setBossError(null);
    
    if (currentScenarioIndex < SCENARIOS.length - 1) {
      setCurrentScenarioIndex(prev => prev + 1);
      setCurrentStepIndex(0);
      setGameState('SCENARIO');
    } else {
      setGameState('END');
    }
  };

  const skipBossEvaluation = () => {
    nextScenario();
  };

  const renderTrustMeter = () => (
    <div className="w-full bg-slate-800 p-4 rounded-xl mb-6 flex items-center gap-4 shadow-lg border border-slate-700">
      <div className="font-mono text-sm uppercase tracking-wider text-slate-400 w-32">Stakeholder Trust</div>
      <div className="flex-1 h-4 bg-slate-900 rounded-full overflow-hidden relative">
        <motion.div 
          className={cn(
            "h-full rounded-full",
            trustScore > 70 ? "bg-emerald-500" : trustScore > 30 ? "bg-amber-500" : "bg-rose-500"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${trustScore}%` }}
          transition={{ type: "spring", stiffness: 50 }}
        />
      </div>
      <div className="font-mono font-bold text-lg text-white w-12 text-right">{trustScore}%</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-4xl mx-auto p-6 pt-12">
        
        <AnimatePresence mode="wait">
          {gameState === 'MENU' && (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8"
            >
              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400">
                  Data Storyteller Quest
                </h1>
                <p className="text-xl text-slate-400 max-w-2xl mx-auto font-light">
                  Learn to communicate insights, handle difficult stakeholders, and build trust through effective data storytelling.
                </p>
              </div>

              <div className="w-full max-w-4xl space-y-5">
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-slate-400">
                  <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2">
                    {totalScenarios} scenarios
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2">
                    Multiple choice + free response
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2">
                    Finish with a trust score
                  </span>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 md:p-6 shadow-xl">
                  <div className="flex items-center justify-center gap-3 mb-5">
                    <div className="h-px w-10 bg-slate-800" aria-hidden="true" />
                    <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-slate-500">
                      How It Works
                    </h2>
                    <div className="h-px w-10 bg-slate-800" aria-hidden="true" />
                  </div>

                  <ol className="grid gap-4 md:grid-cols-3 list-none p-0 m-0">
                    {MENU_PRIMER_STEPS.map((step) => (
                      <li
                        key={step.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 text-left shadow-[0_18px_45px_-28px_rgba(15,23,42,0.9)]"
                      >
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/10 font-mono text-sm font-bold text-indigo-300 mb-4" aria-hidden="true">
                          {step.id}
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                        <p className="text-sm leading-relaxed text-slate-400">{step.body}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              
              <button 
                onClick={startGame}
                className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-indigo-600 font-mono text-lg rounded-xl hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 focus:ring-offset-slate-900 shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-15px_rgba(79,70,229,0.7)]"
              >
                <span className="mr-2">START SIMULATION</span>
                <Play className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {gameState === 'SCENARIO' && currentStep && (
            <motion.div 
              key={`scenario-${currentScenario.id}-${currentStep.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {renderTrustMeter()}

              <ContextPanel
                badges={[
                  `Scenario ${currentScenarioIndex + 1} of ${totalScenarios}`,
                  `Step ${currentStepIndex + 1} of ${totalStepsInScenario}`,
                ]}
                title={currentScenario.title}
                description={currentScenario.description}
              />
              
              <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xl">
                    {currentScenario.stakeholder.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{currentScenario.stakeholder}</h3>
                    <p className="text-sm text-slate-400 font-mono">{currentScenario.stakeholderRole}</p>
                  </div>
                </div>
                
                <div className="prose prose-invert max-w-none mb-8">
                  <p className="text-lg leading-relaxed text-slate-300">{currentStep.context}</p>
                </div>

                <div className="bg-slate-950 rounded-xl p-4 sm:p-6 border border-slate-800 mb-8">
                  <h3 className="text-sm font-mono text-slate-500 mb-4 uppercase tracking-wider">Data Summary</h3>
                  <p className="font-medium text-indigo-300 mb-6">{currentDataSummary}</p>
                  
                  {showFeedback && !showScenarioChart && currentStep.chartData && (
                    <div className="h-56 sm:h-64 w-full mt-4 rounded-lg border border-slate-800/80 bg-slate-900/40" />
                  )}

                  {showScenarioChart && currentStep.chartData && currentStep.chartType === 'BAR' && (
                    <ChartFrame>
                      {({ width, height }) => (
                        <BarChart data={currentStep.chartData} width={width} height={height} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                          <XAxis
                            dataKey="name"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#334155' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#334155' }}
                            width={44}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#e2e8f0' }}
                          />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                          <Bar dataKey="CPA" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Users" fill="#ec4899" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ChartFrame>
                  )}

                  {showScenarioChart && currentStep.chartData && currentStep.chartType === 'LINE' && (
                    <ChartFrame>
                      {({ width, height }) => (
                        <LineChart data={currentStep.chartData} width={width} height={height} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                          <XAxis
                            dataKey="day"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#334155' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#334155' }}
                            width={44}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#e2e8f0' }}
                          />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                          <Line type="monotone" dataKey="Completed Onboarding" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Skipped Onboarding" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      )}
                    </ChartFrame>
                  )}
                </div>

                <h3 className="text-xl font-semibold text-white mb-6">{currentStep.question}</h3>
                
                <div className="space-y-4">
                  {currentStep.choices.map((choice) => {
                    const isSelected = selectedChoiceId === choice.id;
                    const isCorrectChoice = choice.isCorrect;
                    const showResult = showFeedback && (isSelected || isCorrectChoice);
                    const isSelectedIncorrectChoice = showFeedback && isSelected && !isCorrectChoice;
                    const isRevealedCorrectChoice = showFeedback && isCorrectChoice;
                    const feedbackLabel = isCorrectChoice
                      ? isSelected
                        ? 'Good Choice'
                        : 'Correct Answer'
                      : 'Needs Improvement';
                    
                    return (
                      <button
                        key={choice.id}
                        onClick={() => handleChoice(choice.id)}
                        disabled={showFeedback}
                        className={cn(
                          "w-full text-left p-6 rounded-xl border transition-all duration-200 relative overflow-hidden",
                          !showFeedback && "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg",
                          showFeedback && !isSelected && !isCorrectChoice && "bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed",
                          isRevealedCorrectChoice && "bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/50",
                          isSelectedIncorrectChoice && "bg-rose-950/30 border-rose-500/50 ring-1 ring-rose-500/50"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <p className={cn("text-lg", showResult ? "text-white" : "text-slate-300")}>
                              {choice.text}
                            </p>
                            
                            <AnimatePresence>
                              {showResult && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                                  className="text-sm text-slate-400 bg-slate-950/50 p-4 rounded-lg border border-slate-800/50"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    {isCorrectChoice ? (
                                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <XCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={cn("font-bold", isCorrectChoice ? "text-emerald-400" : "text-rose-400")}>
                                      {feedbackLabel}
                                    </span>
                                  </div>
                                  <p>{choice.feedback}</p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {showFeedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 flex justify-end"
                    >
                      <button
                        onClick={nextStep}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-950 font-bold rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {gameState === 'BOSS' && (
            <motion.div 
              key={`boss-${currentScenario.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              {renderTrustMeter()}

              <ContextPanel
                badges={[
                  `Scenario ${currentScenarioIndex + 1} of ${totalScenarios}`,
                  'Boss Review',
                ]}
                title={currentScenario.title}
                description={currentScenario.description}
              />
              
              <div className="bg-slate-900 rounded-2xl p-8 border border-indigo-500/30 shadow-[0_0_50px_-12px_rgba(79,70,229,0.2)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg ring-4 ring-indigo-500/20">
                    {currentScenario.stakeholder.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{currentScenario.stakeholder}</h2>
                    <p className="text-indigo-300 font-mono text-sm uppercase tracking-wider">{currentScenario.stakeholderRole}</p>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-6 border-l-4 border-indigo-500 mb-8">
                  <p className="text-xl text-white font-medium italic">"{currentScenario.bossQuestion}"</p>
                </div>

                {!bossEvaluation ? (
                  <div className="space-y-4">
                    <label className="block text-sm font-mono text-slate-400 uppercase tracking-wider">Your Response</label>
                    <textarea
                      value={bossInput}
                      onChange={(e) => {
                        setBossInput(e.target.value);
                        if (bossError) {
                          setBossError(null);
                        }
                      }}
                      placeholder="Type your response here. Focus on empathy, clarity, and actionable data..."
                      className="w-full h-40 bg-slate-950 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                    />

                    {bossError && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-mono uppercase tracking-[0.2em] text-amber-200">
                              Evaluation Unavailable
                            </p>
                            <p className="text-sm leading-relaxed text-amber-100">
                              {bossError}
                            </p>
                            <p className="text-sm leading-relaxed text-amber-200/90">
                              Retry when you are ready, or continue without changing your trust score.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                      {bossError && (
                        <button
                          onClick={skipBossEvaluation}
                          className="px-5 py-3 border border-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          Continue Without Score
                        </button>
                      )}
                      <button
                        onClick={handleBossSubmit}
                        disabled={isEvaluating || !bossInput.trim()}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/25"
                      >
                        {isEvaluating ? (
                          <span className="animate-pulse">Evaluating...</span>
                        ) : (
                          <>
                            {bossError ? 'Retry Response' : 'Submit Response'} <ChevronRight className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="bg-slate-950 rounded-xl p-6 border border-slate-800">
                      <div className="flex items-center gap-4 mb-4">
                        <div className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black",
                          bossEvaluation.score >= 70 ? "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50" :
                          bossEvaluation.score >= 40 ? "bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/50" :
                          "bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/50"
                        )}>
                          {bossEvaluation.score}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Evaluation Score</h3>
                          <p className="text-sm text-slate-400">Based on empathy, logic, and clarity.</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">Stakeholder Reaction</h4>
                          <p className="text-slate-300 italic border-l-2 border-slate-700 pl-4 py-1">"{bossEvaluation.stakeholderReaction}"</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">Manager's Feedback</h4>
                          <p className="text-slate-300">{bossEvaluation.feedback}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={nextScenario}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-950 font-bold rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        {currentScenarioIndex < SCENARIOS.length - 1 ? 'Next Scenario' : 'View Final Results'} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {gameState === 'END' && (
            <motion.div 
              key="end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-h-[70vh] space-y-8"
            >
              <ContextPanel
                badges={[`Completed ${totalScenarios} of ${totalScenarios} scenarios`, 'Journey Summary']}
                title="Simulation Complete"
                description="You've successfully navigated the treacherous waters of stakeholder communication."
                className="text-left"
              >
                <div className="flex flex-wrap gap-2">
                  {SCENARIOS.map((scenario, index) => (
                    <span
                      key={scenario.id}
                      className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.2em] text-indigo-200"
                    >
                      {index + 1}. {scenario.title}
                    </span>
                  ))}
                </div>
              </ContextPanel>

              <div className="flex flex-col items-center justify-center text-center space-y-8">
                <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-indigo-500/30">
                  <Trophy className="w-16 h-16 text-indigo-400" />
                </div>

                <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 w-full max-w-md">
                  <h3 className="text-sm font-mono text-slate-500 uppercase tracking-wider mb-2">Final Trust Score</h3>
                  <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 mb-4">
                    {trustScore}%
                  </div>
                  <p className="text-slate-300">
                    {trustScore >= 80 ? "Outstanding! You are a master data storyteller. Stakeholders trust your insights implicitly." :
                     trustScore >= 50 ? "Good job. You have a solid foundation, but there's room to improve your narrative framing." :
                     "You survived, but trust is low. Remember to focus on actionable insights and empathy for the stakeholder's goals."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/90 p-5 text-left shadow-xl">
                  <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-300 mb-3">What You Did Well</h3>
                  <p className="text-slate-300 leading-relaxed">{strongestSkillSummary}</p>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-slate-900/90 p-5 text-left shadow-xl">
                  <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-amber-300 mb-3">Review Next</h3>
                  <p className="text-slate-300 leading-relaxed">{missedQuestionSummary}</p>
                </div>

                <div className="rounded-2xl border border-indigo-500/20 bg-slate-900/90 p-5 text-left shadow-xl">
                  <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-indigo-300 mb-3">Boss-Response Habit</h3>
                  <p className="text-slate-300 leading-relaxed">{bossCoachingSummary}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {completedScenarioRecaps.map((recap) => (
                  <div
                    key={recap.scenarioId}
                    className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-left shadow-xl"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-mono uppercase tracking-[0.2em] text-slate-400">
                      <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">
                        {recap.correctAnswers} / {recap.totalSteps} correct
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1">
                        {recap.bossSkipped ? 'Boss Skipped' : `Boss Score ${recap.bossScore}`}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight text-white mb-3">{recap.scenarioTitle}</h3>
                    <p className="text-slate-300 leading-relaxed mb-5">{recap.takeaway}</p>

                    {recap.stepResults.some((result) => !result.wasCorrect) ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-5">
                        <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-amber-200 mb-3">
                          Missed Questions
                        </h4>
                        <div className="space-y-4">
                          {recap.stepResults
                            .filter((result) => !result.wasCorrect)
                            .map((result) => (
                              <div key={result.stepId} className="space-y-2">
                                <p className="text-sm font-semibold text-white">{result.question}</p>
                                <p className="text-sm text-slate-300">
                                  <span className="text-slate-500">You picked:</span> {result.selectedChoiceText}
                                </p>
                                <p className="text-sm text-emerald-300">
                                  Better answer: {result.correctChoiceText}
                                </p>
                                <p className="text-sm text-slate-400">{result.feedback}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-5">
                        <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-200 mb-2">
                          Strong Choices
                        </h4>
                        <p className="text-sm text-slate-300">
                          You answered every question in this scenario correctly. That is the stakeholder-ready framing to repeat.
                        </p>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                      <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                        Boss-Response Guidance
                      </h4>
                      <p className="text-slate-300">
                        {recap.bossSkipped ? recap.bossNote : recap.bossOutcomeSummary}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <button 
                  onClick={startGame}
                  className="px-8 py-4 font-bold text-white bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors"
                >
                  PLAY AGAIN
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
