/**
 * MARN agent directory, accounts and public reviews.
 *
 * Honesty rules baked in:
 * - MARNs are format-validated (7 digits) but NOT auto-verified against OMARA —
 *   there is no public verification API. Every profile therefore carries a
 *   "verify on the official register" link, and the UI says so plainly.
 * - No fictional profiles or sample reviews are ever seeded; any left over
 *   from earlier versions are purged at startup (purgeDemoContent).
 * - Reviews are open (no account needed), labelled "unverified", require a
 *   genuine-client declaration, and agents cannot review themselves.
 */

import { all, insert, findOne, update, removeWhere } from './store.js';
import { encrypt, canEncrypt } from './privacy.js';
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
    'You receive the full A$99 for every one-on-one client session booked with you through AusWise. The platform keeps nothing. Payouts go to your nominated bank account after each delivered session, as set out in the Terms of Service.',
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

/* --------------------------------------------------------- legacy cleanup */
/** Remove fictional example agents and sample reviews seeded by older versions. */
export function purgeDemoContent() {
  const demoIds = all('agents').filter((a) => a.demo).map((a) => a.agentId);
  let removed = removeWhere('reviews', { demo: true });
  for (const agentId of demoIds) {
    removed += removeWhere('reviews', { agentId });
    removed += removeWhere('agents', { agentId });
  }
  return removed;
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
      createdAt: r.createdAt,
    }));
  return { ...profile, reviews };
}

export function registerAgent({ name, marn, email, password, bio, specialties, languages, location, consent }) {
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
    approved: true,
    consent,
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
  if (!agent || !verifyPassword(password || '', agent.passwordHash)) {
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
    bsb: a.payout.bsbMasked,
    accountNumberMasked: a.payout.accountMasked,
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
 * Attach payout bank details to the logged-in agent. The BSB and account
 * number are encrypted at rest (AES-256-GCM, DATA_ENCRYPTION_KEY); only
 * masked forms are stored in clear and returned. Without a key configured the
 * details are refused rather than stored in plain text.
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
  if (!canEncrypt()) return { error: 'Payout storage is not enabled on this server.', code: 'NO_KEY' };
  const row = update('agents', { agentId }, {
    payout: {
      accountName: name,
      bsbMasked: `${bsbDigits.slice(0, 3)}-•••`,
      accountMasked: '•'.repeat(accDigits.length - 3) + accDigits.slice(-3),
      encrypted: encrypt({ bsb: bsbDigits, accountNumber: accDigits }),
      updatedAt: new Date().toISOString(),
    },
  });
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

/** Permanently delete the logged-in agent's account, sessions and reviews. */
export function deleteAgentAccount(token) {
  const agentId = resolveToken(token);
  if (!agentId) return { error: 'Not logged in.' };
  removeWhere('reviews', { agentId });
  removeWhere('sessions', { agentId });
  removeWhere('agents', { agentId });
  return { ok: true };
}

export function logoutAgent(token) {
  revokeToken(token);
  return { ok: true };
}

export function addReview(agentId, { rating, name, comment, reviewerToken }) {
  const agent = findOne('agents', { agentId });
  if (!agent || agent.approved === false) return { error: 'Agent not found.' };
  if (reviewerToken && resolveToken(reviewerToken) === agentId) return { error: 'Agents cannot review their own profile.' };
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) return { error: 'Rating must be between 1 and 5.' };
  const row = insert('reviews', {
    agentId,
    rating: r,
    name: String(name || 'Anonymous').slice(0, 80),
    comment: String(comment || '').slice(0, 1500),
  });
  return { review: { rating: row.rating, name: row.name, comment: row.comment, createdAt: row.createdAt } };
}
