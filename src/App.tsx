import { type ReactNode, useEffect, useRef, useState } from 'react';
import { GameState, Scenario, ScenarioStep, BossEvaluation } from './types';
import { SCENARIOS } from './data/scenarios';
import { evaluateBossResponse } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { ArrowRight, CheckCircle, XCircle, Trophy, AlertCircle, Play, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ChartFrame({ children }: { children: (size: { width: number; height: number }) => ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
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
  const [showScenarioChart, setShowScenarioChart] = useState(false);

  const currentScenario = SCENARIOS[currentScenarioIndex];
  const currentStep = currentScenario?.steps[currentStepIndex];

  useEffect(() => {
    if (gameState !== 'SCENARIO' || !currentStep?.chartData) {
      setShowScenarioChart(false);
      return;
    }

    setShowScenarioChart(false);
    // Let the scenario card finish its entrance animation before Recharts measures.
    const timeoutId = window.setTimeout(() => {
      setShowScenarioChart(true);
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentStep?.id, currentStep?.chartData, gameState]);

  const startGame = () => {
    setGameState('SCENARIO');
    setCurrentScenarioIndex(0);
    setCurrentStepIndex(0);
    setTrustScore(50);
    setSelectedChoiceId(null);
    setShowFeedback(false);
  };

  const handleChoice = (choiceId: string) => {
    if (showFeedback) return;
    setSelectedChoiceId(choiceId);
    setShowFeedback(true);
    
    const choice = currentStep.choices.find(c => c.id === choiceId);
    if (choice) {
      setTrustScore(prev => Math.max(0, Math.min(100, prev + choice.scoreImpact)));
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
    
    const evaluation = await evaluateBossResponse(
      currentScenario.stakeholderRole,
      currentScenario.bossQuestion,
      bossInput
    );
    
    setBossEvaluation(evaluation);
    setTrustScore(prev => Math.max(0, Math.min(100, prev + (evaluation.score > 70 ? 20 : evaluation.score < 40 ? -20 : 0))));
    setIsEvaluating(false);
  };

  const nextScenario = () => {
    setBossEvaluation(null);
    setBossInput('');
    
    if (currentScenarioIndex < SCENARIOS.length - 1) {
      setCurrentScenarioIndex(prev => prev + 1);
      setCurrentStepIndex(0);
      setGameState('SCENARIO');
    } else {
      setGameState('END');
    }
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
              
              <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xl">
                    {currentScenario.stakeholder.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{currentScenario.stakeholder}</h2>
                    <p className="text-sm text-slate-400 font-mono">{currentScenario.stakeholderRole}</p>
                  </div>
                </div>
                
                <div className="prose prose-invert max-w-none mb-8">
                  <p className="text-lg leading-relaxed text-slate-300">{currentStep.context}</p>
                </div>

                <div className="bg-slate-950 rounded-xl p-4 sm:p-6 border border-slate-800 mb-8 overflow-hidden">
                  <h3 className="text-sm font-mono text-slate-500 mb-4 uppercase tracking-wider">Data Summary</h3>
                  <p className="font-medium text-indigo-300 mb-6">{currentStep.dataSummary}</p>
                  
                  {!showScenarioChart && currentStep.chartData && (
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
                    const showResult = showFeedback && isSelected;
                    
                    return (
                      <button
                        key={choice.id}
                        onClick={() => handleChoice(choice.id)}
                        disabled={showFeedback}
                        className={cn(
                          "w-full text-left p-6 rounded-xl border transition-all duration-200 relative overflow-hidden",
                          !showFeedback && "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg",
                          showFeedback && !isSelected && "bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed",
                          showResult && choice.isCorrect && "bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/50",
                          showResult && !choice.isCorrect && "bg-rose-950/30 border-rose-500/50 ring-1 ring-rose-500/50"
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
                                    {choice.isCorrect ? (
                                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <XCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={cn("font-bold", choice.isCorrect ? "text-emerald-400" : "text-rose-400")}>
                                      {choice.isCorrect ? "Good Choice" : "Needs Improvement"}
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
                      onChange={(e) => setBossInput(e.target.value)}
                      placeholder="Type your response here. Focus on empathy, clarity, and actionable data..."
                      className="w-full h-40 bg-slate-950 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleBossSubmit}
                        disabled={isEvaluating || !bossInput.trim()}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/25"
                      >
                        {isEvaluating ? (
                          <span className="animate-pulse">Evaluating...</span>
                        ) : (
                          <>Submit Response <ChevronRight className="w-5 h-5" /></>
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
              className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8"
            >
              <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-indigo-500/30">
                <Trophy className="w-16 h-16 text-indigo-400" />
              </div>
              
              <div className="space-y-4">
                <h1 className="text-5xl font-black text-white">Simulation Complete</h1>
                <p className="text-xl text-slate-400 max-w-xl mx-auto">
                  You've successfully navigated the treacherous waters of stakeholder communication.
                </p>
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
              
              <button 
                onClick={startGame}
                className="px-8 py-4 font-bold text-white bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors"
              >
                PLAY AGAIN
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
