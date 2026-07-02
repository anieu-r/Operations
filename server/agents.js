/**
 * MARN agent directory, accounts and public reviews.
 *
 * Honesty rules baked in:
 * - MARNs are format-validated (7 digits) but NOT auto-verified against OMARA —
 *   there is no public verification API. Every profile therefore carries a
 *   "verify on the official register" link, and the UI says so plainly.
 * - Seed profiles are FICTIONAL examples, flagged `demo: true`, and labelled
 *   "Example profile" in the UI so nobody mistakes them for real agents.
 * - Reviews are open (no account needed) and labelled "unverified reviews".
 */

import { all, insert, findOne, update } from './store.js';
import { hashPassword, verifyPassword, issueToken, resolveToken, revokeToken, newId } from './auth.js';

export const OMARA_SEARCH_URL = 'https://portal.mara.gov.au/search-the-register-of-migration-agents/';

/**
 * Payout program: when a client books the A$99 one-on-one session with an
 * agent through AusWise, the agent delivers the session and receives the full
 * A$99 — the platform keeps nothing (consistent with the no-commissions
 * promise; AusWise's own revenue is the SOP review product).
 */
export const PAYOUT_PROGRAM = {
  amountCents: 9900,
  display: 'A$99',
  description:
    'You receive the full A$99 for every one-on-one client session booked with you through AusWise. The platform keeps nothing. Payouts are transferred to your nominated bank account after each delivered session.',
};

export const SPECIALTIES = [
  'Skilled & points-tested',
  'Employer sponsored',
  'Student visas',
  'Partner & family',
  'Visitor visas',
  'Business & investment',
  'Appeals & reviews (ART)',
  'Protection & humanitarian',
];

const MARN_RE = /^\d{7}$/;

/* --------------------------------------------------------- demo seed data */
const DEMO_AGENTS = [
  {
    name: 'Sarah Nguyen (Example profile)',
    marn: '0000001',
    bio: 'Fictional example agent shown while the directory is new. 12+ years in skilled and employer-sponsored migration. Real agents can register and replace these examples.',
    specialties: ['Skilled & points-tested', 'Employer sponsored'],
    languages: ['English', 'Vietnamese'],
    location: 'Melbourne, VIC',
  },
  {
    name: 'Daniel Okafor (Example profile)',
    marn: '0000002',
    bio: 'Fictional example agent. Focused on student visas and graduate pathways, including Genuine Student statements and appeals.',
    specialties: ['Student visas', 'Appeals & reviews (ART)'],
    languages: ['English'],
    location: 'Brisbane, QLD',
  },
  {
    name: 'Mei-Lin Chow (Example profile)',
    marn: '0000003',
    bio: 'Fictional example agent. Partner, family and parent visas, with a focus on relationship evidence and complex cases.',
    specialties: ['Partner & family', 'Visitor visas'],
    languages: ['English', 'Mandarin', 'Cantonese'],
    location: 'Sydney, NSW',
  },
];

const DEMO_REVIEWS = [
  { marn: '0000001', rating: 5, name: 'Demo review', comment: 'Example review — clear advice on my 482 → 186 pathway. (Sample data)' },
  { marn: '0000001', rating: 4, name: 'Demo review', comment: 'Example review — responsive and honest about my chances. (Sample data)' },
  { marn: '0000002', rating: 5, name: 'Demo review', comment: 'Example review — helped my GS statement enormously. (Sample data)' },
  { marn: '0000003', rating: 4, name: 'Demo review', comment: 'Example review — great with our partner evidence. (Sample data)' },
];

/** Seed demo profiles once (idempotent). */
export function seedDemoAgents() {
  for (const demo of DEMO_AGENTS) {
    if (!findOne('agents', { marn: demo.marn })) {
      const row = insert('agents', {
        agentId: newId(),
        ...demo,
        email: null,
        passwordHash: null,
        demo: true,
        approved: true,
      });
      for (const r of DEMO_REVIEWS.filter((x) => x.marn === demo.marn)) {
        insert('reviews', { agentId: row.agentId, rating: r.rating, name: r.name, comment: r.comment, demo: true });
      }
    }
  }
}

/* --------------------------------------------------------- helpers */
function publicAgent(a) {
  const reviews = all('reviews').filter((r) => r.agentId === a.agentId);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  return {
    agentId: a.agentId,
    name: a.name,
    marn: a.marn,
    bio: a.bio || '',
    specialties: a.specialties || [],
    languages: a.languages || [],
    location: a.location || '',
    demo: Boolean(a.demo),
    rating: avg ? Math.round(avg * 10) / 10 : null,
    reviewCount: reviews.length,
    omaraVerifyUrl: OMARA_SEARCH_URL,
  };
}

/* --------------------------------------------------------- API surface */
export function listAgents({ q, specialty } = {}) {
  let rows = all('agents').filter((a) => a.approved !== false);
  if (specialty) rows = rows.filter((a) => (a.specialties || []).includes(specialty));
  if (q) {
    const n = q.toLowerCase();
    rows = rows.filter((a) =>
      [a.name, a.bio, a.location, a.marn, ...(a.specialties || []), ...(a.languages || [])]
        .join(' ')
        .toLowerCase()
        .includes(n)
    );
  }
  return rows
    .map(publicAgent)
    .sort((x, y) => (y.rating || 0) - (x.rating || 0) || y.reviewCount - x.reviewCount);
}

export function getAgent(agentId) {
  const a = findOne('agents', { agentId });
  if (!a || a.approved === false) return null;
  const profile = publicAgent(a);
  const reviews = all('reviews')
    .filter((r) => r.agentId === agentId)
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    .map((r) => ({
      rating: r.rating,
      name: r.name || 'Anonymous',
      comment: r.comment || '',
      demo: Boolean(r.demo),
      createdAt: r.createdAt,
    }));
  return { ...profile, reviews };
}

export function registerAgent({ name, marn, email, password, bio, specialties, languages, location }) {
  if (!name) return { error: 'Please enter your name.' };
  if (!MARN_RE.test(marn || '')) return { error: 'MARN must be a 7-digit number (as shown on the OMARA register).' };
  if (!email) return { error: 'Please enter your email.' };
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (findOne('agents', { marn })) return { error: 'An account with this MARN already exists. Try logging in.' };
  if (findOne('agents', { email })) return { error: 'An account with this email already exists. Try logging in.' };

  const row = insert('agents', {
    agentId: newId(),
    name: String(name).slice(0, 120),
    marn,
    email: String(email).slice(0, 160).toLowerCase(),
    passwordHash: hashPassword(password),
    bio: String(bio || '').slice(0, 1500),
    specialties: (Array.isArray(specialties) ? specialties : []).filter((s) => SPECIALTIES.includes(s)),
    languages: (Array.isArray(languages) ? languages : []).map((l) => String(l).slice(0, 40)).slice(0, 8),
    location: String(location || '').slice(0, 120),
    demo: false,
    approved: true,
  });
  const token = issueToken(row.agentId);
  return { agent: publicAgent(row), token };
}

export function loginAgent({ email, marn, password }) {
  const agent = email
    ? findOne('agents', { email: String(email).toLowerCase() })
    : marn
      ? findOne('agents', { marn })
      : null;
  if (!agent || agent.demo || !verifyPassword(password || '', agent.passwordHash)) {
    return { error: 'Invalid credentials. Check your email/MARN and password.' };
  }
  return { agent: publicAgent(agent), token: issueToken(agent.agentId) };
}

/** Masked view of stored bank details — safe to return to the logged-in agent. */
function maskedPayout(a) {
  if (!a.payout) return { set: false };
  return {
    set: true,
    accountName: a.payout.accountName,
    bsb: a.payout.bsb.replace(/^(\d{3})(\d{3})$/, '$1-$2'),
    accountNumberMasked: '•'.repeat(Math.max(0, a.payout.accountNumber.length - 3)) + a.payout.accountNumber.slice(-3),
    updatedAt: a.payout.updatedAt,
  };
}

export function agentFromToken(token) {
  const agentId = resolveToken(token);
  if (!agentId) return null;
  const a = findOne('agents', { agentId });
  // Private view: public profile + masked payout state + program terms.
  return a ? { ...publicAgent(a), payout: maskedPayout(a), payoutProgram: PAYOUT_PROGRAM } : null;
}

/**
 * Attach payout bank details to the logged-in agent. Details are never exposed
 * publicly and are returned masked. NOTE for production: move to a payment
 * provider (e.g. Stripe Connect) and encrypt at rest — the bundled JSON store
 * is demo-grade and stores what you give it.
 */
export function setPayoutDetails(token, { accountName, bsb, accountNumber } = {}) {
  const agentId = resolveToken(token);
  if (!agentId) return { error: 'Not logged in.' };
  const name = String(accountName || '').trim().slice(0, 120);
  const bsbDigits = String(bsb || '').replace(/[^\d]/g, '');
  const accDigits = String(accountNumber || '').replace(/[^\d]/g, '');
  if (!name) return { error: 'Please enter the account holder name.' };
  if (!/^\d{6}$/.test(bsbDigits)) return { error: 'BSB must be 6 digits (e.g. 062-000).' };
  if (!/^\d{5,10}$/.test(accDigits)) return { error: 'Account number must be 5–10 digits.' };
  const row = update(
    'agents',
    { agentId },
    { payout: { accountName: name, bsb: bsbDigits, accountNumber: accDigits, updatedAt: new Date().toISOString() } }
  );
  if (!row) return { error: 'Account not found.' };
  return { payout: maskedPayout(row), payoutProgram: PAYOUT_PROGRAM };
}

export function updateAgentProfile(token, patch) {
  const agentId = resolveToken(token);
  if (!agentId) return { error: 'Not logged in.' };
  const safe = {};
  if (patch.bio != null) safe.bio = String(patch.bio).slice(0, 1500);
  if (patch.location != null) safe.location = String(patch.location).slice(0, 120);
  if (Array.isArray(patch.specialties)) safe.specialties = patch.specialties.filter((s) => SPECIALTIES.includes(s));
  if (Array.isArray(patch.languages)) safe.languages = patch.languages.map((l) => String(l).slice(0, 40)).slice(0, 8);
  const row = update('agents', { agentId }, safe);
  return row ? { agent: publicAgent(row) } : { error: 'Account not found.' };
}

export function logoutAgent(token) {
  revokeToken(token);
  return { ok: true };
}

export function addReview(agentId, { rating, name, comment }) {
  const agent = findOne('agents', { agentId });
  if (!agent || agent.approved === false) return { error: 'Agent not found.' };
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) return { error: 'Rating must be between 1 and 5.' };
  const row = insert('reviews', {
    agentId,
    rating: r,
    name: String(name || 'Anonymous').slice(0, 80),
    comment: String(comment || '').slice(0, 1500),
    demo: false,
  });
  return { review: { rating: row.rating, name: row.name, comment: row.comment, createdAt: row.createdAt } };
}
