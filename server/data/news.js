/**
 * Immigration news & updates.
 *
 * These are curated summaries of significant, verifiable Australian immigration
 * changes. Each item links to a primary/official source so users can read the
 * full detail themselves. The Department of Home Affairs newsroom is the
 * authoritative source for live announcements:
 *   https://minister.homeaffairs.gov.au/  and  https://immi.homeaffairs.gov.au/
 *
 * The API also exposes a "liveSourceUrl" so the front end can deep-link users
 * straight to Home Affairs for anything newer than this curated list. We do NOT
 * scrape Home Affairs (their site blocks automated access and live data should
 * be read from the source), so we keep this list reviewed and source-linked.
 *
 * Last reviewed: 2026-06.
 */

export const liveSources = [
  {
    label: 'Home Affairs — Latest news',
    url: 'https://immi.homeaffairs.gov.au/what-we-do/whats-new',
  },
  {
    label: 'Home Affairs — Immigration & citizenship',
    url: 'https://immi.homeaffairs.gov.au/',
  },
  {
    label: 'Minister for Home Affairs — Media releases',
    url: 'https://minister.homeaffairs.gov.au/',
  },
];

export const news = [
  {
    id: 'graduate-485-fee-2026',
    date: '2026-03-01',
    category: 'Fees',
    impact: 'high',
    title: 'Temporary Graduate (485) application charge doubles',
    summary:
      'From 1 March 2026 the main applicant charge for the Temporary Graduate (subclass 485) visa increased to around AUD $4,600 — roughly double the previous charge. Eligible applicants from Pacific Island nations and Timor-Leste are exempt. Confirm the exact charge before lodging.',
    affects: ['485'],
    source: {
      label: 'Home Affairs — fees & charges',
      url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges',
    },
  },
  {
    id: 'core-skills-threshold-jul-2026',
    date: '2026-07-01',
    category: 'Skilled migration',
    impact: 'high',
    title: 'Employer-sponsored salary thresholds rise from 1 July 2026',
    summary:
      'Minimum salary requirements for employer-sponsored visas increase from 1 July 2026, with the Core Skills Income Threshold rising (around AUD $79,499) and higher thresholds for specialist roles. Employers and applicants on the Skills in Demand (482) and ENS (186) pathways should check the updated figures.',
    affects: ['482', '186', '494'],
    source: {
      label: 'Home Affairs — Skills in Demand visa',
      url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skills-in-demand-visa-482',
    },
  },
  {
    id: 'migration-program-2026-27',
    date: '2026-05-01',
    category: 'Planning levels',
    impact: 'medium',
    title: 'Permanent Migration Program planning levels for 2026–27',
    summary:
      'The permanent Migration Program is planned at around 185,000 places for 2026–27, with the Skill stream the dominant pathway (roughly 132,000 places). A large share is allocated to onshore applicants, reinforcing the advantage of applying while already in Australia where eligible.',
    affects: ['189', '190', '491', '186'],
    source: {
      label: 'Home Affairs — Migration Program planning levels',
      url: 'https://immi.homeaffairs.gov.au/what-we-do/migration-program-planning-levels',
    },
  },
  {
    id: 'points-test-reform-2026',
    date: '2026-04-15',
    category: 'Skilled migration',
    impact: 'medium',
    title: 'Points test reform under consideration',
    summary:
      'The government has signalled reform of the permanent migration points test to better reward skills that contribute to productivity and long-term economic growth. Prospective 189/190/491 applicants should watch for changes to how points are awarded.',
    affects: ['189', '190', '491'],
    source: {
      label: 'Home Affairs — Skilled visas',
      url: 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list',
    },
  },
  {
    id: 'training-407-sponsor-2026',
    date: '2026-03-10',
    category: 'Work visas',
    impact: 'medium',
    title: 'Training (407) visa: sponsor & nomination required up front',
    summary:
      'From 10 March 2026, Training (subclass 407) visa applicants must have an approved sponsor and nomination in place before they can lodge the visa application. Plan the sponsorship and nomination steps before applying.',
    affects: ['407'],
    source: {
      label: 'Home Affairs — Training visa (407)',
      url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/training-visa-407',
    },
  },
  {
    id: 'national-innovation-visa',
    date: '2025-12-01',
    category: 'Talent',
    impact: 'medium',
    title: 'National Innovation visa (858) replaces the Global Talent program',
    summary:
      'The National Innovation visa (subclass 858) is the pathway for individuals with an internationally recognised record of exceptional and outstanding achievement, replacing the former Global Talent program. Selection is by Expression of Interest.',
    affects: ['858'],
    source: {
      label: 'Home Affairs — National Innovation visa',
      url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/national-innovation-858',
    },
  },
  {
    id: 'student-genuine-student',
    date: '2025-11-01',
    category: 'Student visas',
    impact: 'medium',
    title: 'Genuine Student requirement & higher financial capacity for 500',
    summary:
      'Student (subclass 500) applicants must meet the Genuine Student requirement and show increased savings/financial capacity. Prepare a clear, honest Genuine Student statement and up-to-date evidence of funds and OSHC.',
    affects: ['500'],
    source: {
      label: 'Home Affairs — Student visa (500)',
      url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500',
    },
  },
];

export function listNews({ category, impact } = {}) {
  let result = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (category) result = result.filter((n) => n.category === category);
  if (impact) result = result.filter((n) => n.impact === impact);
  return result;
}
