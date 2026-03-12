import { Scenario } from '../types';

export const SCENARIOS: Scenario[] = [
  {
    id: 'campaign-roi',
    title: 'The Marketing ROI Dilemma',
    description: 'The marketing team just ran two campaigns and wants to know which one was better. You need to present the results to the CMO.',
    stakeholder: 'Sarah',
    stakeholderRole: 'Chief Marketing Officer',
    steps: [
      {
        id: 'step-1-viz',
        type: 'VISUALIZATION',
        context: 'You have the following data:\n- Campaign A: Cost $10,000, Acquired 500 users.\n- Campaign B: Cost $20,000, Acquired 800 users.',
        dataSummary: 'Campaign A CPA: $20. Campaign B CPA: $25.',
        question: 'How do you visualize this data for the CMO?',
        choices: [
          {
            id: 'c1-a',
            text: 'A pie chart showing the total users acquired by each campaign.',
            isCorrect: false,
            feedback: 'Pie charts are terrible for comparing values, and this completely ignores the cost aspect, which is crucial for ROI.',
            scoreImpact: -10,
          },
          {
            id: 'c1-b',
            text: 'A bar chart comparing the Cost Per Acquisition (CPA) of both campaigns.',
            isCorrect: true,
            feedback: 'Excellent! A bar chart clearly compares the efficiency (CPA) of the campaigns, which is exactly what a CMO cares about.',
            scoreImpact: 20,
          },
          {
            id: 'c1-c',
            text: 'A massive table with all the raw data points from both campaigns.',
            isCorrect: false,
            feedback: 'Stakeholders don\'t want to do the math themselves. You need to synthesize the data into insights.',
            scoreImpact: -15,
          }
        ],
        chartData: [
          { name: 'Campaign A', CPA: 20, Users: 500 },
          { name: 'Campaign B', CPA: 25, Users: 800 }
        ],
        chartType: 'BAR'
      },
      {
        id: 'step-2-narrative',
        type: 'NARRATIVE',
        context: 'Now that you have the right chart, you need a headline for your slide.',
        dataSummary: 'Campaign A was more cost-effective.',
        question: 'What is the most effective headline?',
        choices: [
          {
            id: 'c2-a',
            text: '"Campaign B brought in more users than Campaign A."',
            isCorrect: false,
            feedback: 'While true, this is misleading because it ignores the fact that Campaign B was much more expensive per user.',
            scoreImpact: -10,
          },
          {
            id: 'c2-b',
            text: '"Campaign A was 20% more cost-effective at acquiring users."',
            isCorrect: true,
            feedback: 'Perfect! This is an actionable insight that directly addresses the ROI question.',
            scoreImpact: 20,
          },
          {
            id: 'c2-c',
            text: '"An analysis of user acquisition costs across marketing channels."',
            isCorrect: false,
            feedback: 'This is a descriptive title, not an insight. Tell them what the data *means*, not just what it *is*.',
            scoreImpact: -5,
          }
        ]
      }
    ],
    bossQuestion: 'I see Campaign A is cheaper per user, but Campaign B got us more total volume. We need volume to hit our Q3 targets. Should we just shift all budget to B?'
  },
  {
    id: 'churn-crisis',
    title: 'The Churn Crisis',
    description: 'The product team is panicking because user retention is dropping. They need to know why users are leaving.',
    stakeholder: 'David',
    stakeholderRole: 'VP of Product',
    steps: [
      {
        id: 'step-1-viz',
        type: 'VISUALIZATION',
        context: 'You found that churn spikes dramatically on Day 3. Most of these users never completed the onboarding tutorial.',
        dataSummary: 'Day 3 churn is high for users who skip onboarding.',
        question: 'What is the best way to show this?',
        choices: [
          {
            id: 'c1-a',
            text: 'A line chart showing the overall churn rate over 30 days.',
            isCorrect: false,
            feedback: 'This shows *that* there is a problem, but it doesn\'t show *why* (the onboarding connection).',
            scoreImpact: -5,
          },
          {
            id: 'c1-b',
            text: 'A grouped bar chart comparing Day 3 retention of users who completed onboarding vs. those who skipped it.',
            isCorrect: true,
            feedback: 'Great choice! This clearly isolates the variable (onboarding) and shows its impact on the metric (retention).',
            scoreImpact: 20,
          },
          {
            id: 'c1-c',
            text: 'A scatter plot of user age vs. time spent in app.',
            isCorrect: false,
            feedback: 'Irrelevant to the core finding about onboarding and Day 3 churn. Don\'t distract with noise.',
            scoreImpact: -15,
          }
        ],
        chartData: [
          { day: 'Day 1', 'Completed Onboarding': 95, 'Skipped Onboarding': 80 },
          { day: 'Day 2', 'Completed Onboarding': 90, 'Skipped Onboarding': 60 },
          { day: 'Day 3', 'Completed Onboarding': 85, 'Skipped Onboarding': 20 },
          { day: 'Day 4', 'Completed Onboarding': 82, 'Skipped Onboarding': 15 },
          { day: 'Day 5', 'Completed Onboarding': 80, 'Skipped Onboarding': 10 },
        ],
        chartType: 'LINE'
      },
      {
        id: 'step-2-narrative',
        type: 'NARRATIVE',
        context: 'You need to present this finding to the product team.',
        dataSummary: 'Onboarding completion is strongly correlated with retention.',
        question: 'How do you frame your recommendation?',
        choices: [
          {
            id: 'c2-a',
            text: '"Users who skip onboarding are 3x more likely to churn by Day 3. We should test making onboarding mandatory or more engaging."',
            isCorrect: true,
            feedback: 'Excellent. You stated the insight clearly and provided a concrete, testable recommendation.',
            scoreImpact: 20,
          },
          {
            id: 'c2-b',
            text: '"There is a statistically significant correlation (p < 0.05) between onboarding completion and Day 3 retention."',
            isCorrect: false,
            feedback: 'Too academic. Stakeholders usually don\'t care about p-values; they care about what they should *do* about it.',
            scoreImpact: -10,
          },
          {
            id: 'c2-c',
            text: '"We need to fix the app because everyone is leaving on Day 3."',
            isCorrect: false,
            feedback: 'Too alarmist and vague. It doesn\'t point to the specific issue (onboarding) or offer a solution.',
            scoreImpact: -15,
          }
        ]
      }
    ],
    bossQuestion: 'If we make onboarding mandatory, won\'t that just annoy users and cause them to drop off immediately before they even see the app? How do we balance that?'
  }
];
