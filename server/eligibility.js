/**
 * Simple, friendly visa finder.
 *
 * This is a guidance tool, not a legal eligibility assessment. It maps a few
 * plain answers to the visa subclasses most worth exploring, and explains why.
 * Final eligibility always depends on the official criteria and your full
 * circumstances — we tell users this clearly.
 */

import { findVisa } from './data/visas.js';

export const questions = [
  {
    id: 'goal',
    label: 'What do you mainly want to do in Australia?',
    type: 'single',
    options: [
      { value: 'work', label: 'Work / build a career' },
      { value: 'study', label: 'Study' },
      { value: 'family', label: 'Join my partner or family' },
      { value: 'visit', label: 'Visit / holiday' },
      { value: 'business', label: 'Run a business or invest' },
      { value: 'stay', label: 'I already studied/worked here and want to stay' },
    ],
  },
  {
    id: 'location',
    label: 'Where are you right now?',
    type: 'single',
    options: [
      { value: 'offshore', label: 'Outside Australia' },
      { value: 'onshore', label: 'Inside Australia' },
    ],
  },
  {
    id: 'sponsor',
    label: 'Do you have any of these?',
    type: 'single',
    options: [
      { value: 'employer', label: 'An Australian employer who could sponsor me' },
      { value: 'state', label: 'Interest in state/regional nomination' },
      { value: 'partner', label: 'An Australian partner or close family member' },
      { value: 'none', label: 'None of these — just my own skills' },
    ],
  },
  {
    id: 'age',
    label: 'What is your age range?',
    type: 'single',
    options: [
      { value: 'u18', label: 'Under 18' },
      { value: '18-30', label: '18–30' },
      { value: '31-44', label: '31–44' },
      { value: '45plus', label: '45 or older' },
    ],
  },
];

/**
 * Score visas against the answers and return ranked recommendations.
 * @param {object} a answers keyed by question id
 */
export function recommend(a = {}) {
  const scores = new Map();
  const reasons = new Map();

  const add = (code, points, reason) => {
    scores.set(code, (scores.get(code) || 0) + points);
    if (reason) {
      const list = reasons.get(code) || [];
      list.push(reason);
      reasons.set(code, list);
    }
  };

  const goal = a.goal;
  const loc = a.location;
  const sponsor = a.sponsor;
  const age = a.age;

  if (goal === 'work') {
    if (sponsor === 'employer') {
      add('482', 6, 'You have an employer who could sponsor you');
      add('186', 4, 'Employer-sponsored permanent pathway');
      add('494', 3, 'Regional employer-sponsored option');
    }
    if (sponsor === 'state') {
      add('190', 6, 'You’re open to state nomination');
      add('491', 5, 'Regional state/family nomination, with a PR pathway');
    }
    if (sponsor === 'none' || !sponsor) {
      add('189', 6, 'Independent skilled PR with no sponsor needed');
      add('190', 4, 'State-nominated skilled PR');
      add('491', 3, 'Regional skilled provisional visa');
      add('858', 2, 'For an exceptional, internationally recognised record');
    }
  }

  if (goal === 'study') {
    add('500', 8, 'The main visa for studying in Australia');
    add('590', 2, 'If you’re a guardian for a young student');
  }

  if (goal === 'family') {
    if (sponsor === 'partner' || !sponsor) {
      if (loc === 'onshore') add('820-801', 8, 'Partner visa applied for in Australia');
      else add('309-100', 8, 'Partner visa applied for outside Australia');
      add('300', 3, 'If you intend to marry your Australian partner');
    }
    add('870', 3, 'Long-stay temporary option for parents');
    add('143', 2, 'Permanent parent pathway (long queues, higher charge)');
  }

  if (goal === 'visit') {
    add('600', 8, 'The standard visitor visa');
    if (age === '18-30') {
      add('417', 6, 'Working Holiday if your passport is eligible');
      add('462', 5, 'Work and Holiday for other eligible passports');
    }
  }

  if (goal === 'business') {
    add('188', 8, 'Business/investor provisional visa (check current program status)');
    add('858', 3, 'If you have an exceptional record of achievement');
  }

  if (goal === 'stay') {
    if (loc === 'onshore') {
      add('485', 8, 'Post-study work visa for recent graduates');
      add('190', 4, 'Skilled PR while onshore');
      add('189', 3, 'Independent skilled PR');
      add('820-801', 3, 'Partner visa if you have an Australian partner');
    } else {
      add('189', 5, 'Independent skilled PR');
      add('190', 4, 'State-nominated skilled PR');
    }
  }

  // Age adjustments for points-tested skilled visas
  if (age === '45plus') {
    for (const code of ['189', '190', '491', '858']) {
      if (scores.has(code)) add(code, -3, 'Note: most points-tested skilled visas require you to be under 45');
    }
  }
  if (age === 'u18') {
    add('500', 2, 'Students under 18 need welfare arrangements in place');
    add('101', 4, 'Child visa may apply if a parent can sponsor you');
  }
  if (age === '18-30' && goal === 'visit') {
    // already handled above
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([code, score]) => {
      const visa = findVisa(code);
      return visa
        ? {
            code,
            name: visa.name,
            category: visa.category,
            type: visa.type,
            summary: visa.summary,
            officialUrl: visa.officialUrl,
            matchScore: score,
            why: reasons.get(code) || [],
          }
        : null;
    })
    .filter(Boolean);

  return {
    recommendations: ranked,
    disclaimer:
      'This is general guidance to help you explore options — not a formal eligibility assessment or legal advice. Confirm the criteria on the Department of Home Affairs website and consider speaking to a registered migration agent.',
  };
}
