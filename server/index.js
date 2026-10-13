/**
 * AusWise Migration — backend API + static site server.
 *
 * Serves the front end from /public and exposes a small JSON API:
 *   GET  /api/health
 *   GET  /api/visas?location=&category=&q=
 *   GET  /api/visas/:code
 *   GET  /api/categories
 *   GET  /api/news?category=&impact=
 *   GET  /api/payments
 *   GET  /api/eligibility/questions
 *   POST /api/eligibility            { answers }
 *   POST /api/sop                    { ...sop fields }
 *   POST /api/applications           { name, email, visaCode, location, message }
 *   POST /api/contact                { name, email, message }
 *   GET  /api/stats
 */

import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { visas, categories, findVisa, filterVisas } from './data/visas.js';
import { listNews, liveSources } from './data/news.js';
import { officialBodies, safetyTips, omaraRegisterUrl } from './data/payments.js';
import { questions, recommend } from './eligibility.js';
import { buildSOP } from './sop.js';
import { insert, counts } from './store.js';
import {
  SUPPORTED_VERSIONS,
  VERSION_NOTES,
  activeVersion,
  categories as vevoCategories,
  scopesFor,
  isLiveConfigured,
  validateRequest,
  checkEntitlements,
  healthCheck,
} from './vevo.js';
import { notifySubmission, sendToUser, isEmailConfigured } from './notify.js';
import {
  POLICY_VERSION,
  ADULT_AGE,
  businessDetails,
  requireConsents,
  ageFromDob,
  deleteByReference,
  recordPrivacyRequest,
  verifyUnsubscribeToken,
  suppress,
  canEncrypt,
  retentionDays,
  startRetentionJob,
} from './privacy.js';
import { rateLimit } from './ratelimit.js';
import { timingSafeEqual } from 'node:crypto';
import { publicConfig, createCheckoutSession, isStripeConfigured } from './payments-stripe.js';
import {
  purgeDemoContent,
  deleteAgentAccount,
  listAgents,
  getAgent,
  registerAgent,
  loginAgent,
  agentFromToken,
  updateAgentProfile,
  setPayoutDetails,
  logoutAgent,
  addReview,
  SPECIALTIES,
  OMARA_SEARCH_URL,
  PAYOUT_PROGRAM,
} from './agents.js';
import { getQuestionnaire, validateResponses, allowedFieldIds } from './data/questionnaires.js';
import {
  filterInstitutions,
  states as institutionStates,
  institutionTypes,
  CRICOS_SEARCH_URL,
  STUDY_AUSTRALIA_URL,
} from './data/institutions.js';
import { bearerFrom } from './auth.js';

purgeDemoContent();
startRetentionJob();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind the hosting proxy (rate limits)
app.use(express.json({ limit: '256kb' }));

// Security headers. The CSP allows only this origin: no third-party scripts,
// fonts, trackers or iframes can load (see docs/THIRD_PARTY_AUDIT.md).
app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'X-Frame-Options': 'DENY',
  });
  next();
});

// Basic request logging (lightweight).
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// ----------------------------------------------------------------- helpers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}
function str(v, max = 4000) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function bad(res, message) {
  return res.status(400).json({ ok: false, error: message });
}
function baseUrlOf(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// Consent checkboxes shared by the public forms (all unticked by default).
const PRIVACY_CONSENT = { privacyConsent: 'Please confirm you have read and agree to the Privacy Policy.' };
const AGE_CONFIRM = {
  ageConfirm: `Please confirm you are ${ADULT_AGE} or over, or a parent/guardian submitting for someone under ${ADULT_AGE}.`,
};

const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, envOverride: 'FORM_RATE_LIMIT' });
const reviewLimiter = rateLimit({ windowMs: 24 * 3600 * 1000, max: 5, message: 'Review limit reached for today.' });
const vevoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Too many entitlement checks — try again later.' });

// ----------------------------------------------------------------- API
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'auswise-migration', time: new Date().toISOString() });
});

app.get('/api/categories', (_req, res) => {
  res.json({ ok: true, categories });
});

app.get('/api/visas', (req, res) => {
  const { location, category, q } = req.query;
  const result = filterVisas({
    location: location ? String(location) : undefined,
    category: category ? String(category) : undefined,
    q: q ? String(q) : undefined,
  });
  res.json({ ok: true, count: result.length, visas: result });
});

app.get('/api/visas/:code', (req, res) => {
  const visa = findVisa(req.params.code);
  if (!visa) return res.status(404).json({ ok: false, error: 'Visa not found' });
  res.json({ ok: true, visa });
});

app.get('/api/news', (req, res) => {
  const { category, impact } = req.query;
  const items = listNews({
    category: category ? String(category) : undefined,
    impact: impact ? String(impact) : undefined,
  });
  res.json({ ok: true, count: items.length, news: items, liveSources });
});

app.get('/api/payments', (_req, res) => {
  res.json({ ok: true, officialBodies, safetyTips, omaraRegisterUrl });
});

app.get('/api/eligibility/questions', (_req, res) => {
  res.json({ ok: true, questions });
});

app.post('/api/eligibility', (req, res) => {
  const answers = req.body && typeof req.body.answers === 'object' ? req.body.answers : null;
  if (!answers) return bad(res, 'Please provide your answers.');
  const result = recommend(answers);
  // Persist anonymised answers for product insight (no PII collected here).
  try {
    insert('eligibility', { answers, topMatch: result.recommendations[0]?.code || null });
  } catch {
    /* non-fatal */
  }
  res.json({ ok: true, ...result });
});

app.post('/api/sop', (req, res) => {
  const b = req.body || {};
  const fullName = str(b.fullName, 120);
  const purpose = str(b.purpose, 40);
  if (!fullName) return bad(res, 'Please enter your full name.');
  if (!purpose) return bad(res, 'Please choose what the statement is for.');

  const input = {
    fullName,
    nationality: str(b.nationality, 80),
    purpose,
    visaCode: str(b.visaCode, 20),
    course: str(b.course, 200),
    institution: str(b.institution, 200),
    occupation: str(b.occupation, 120),
    employer: str(b.employer, 200),
    ties: str(b.ties, 1500),
    funds: str(b.funds, 1000),
    goals: str(b.goals, 1500),
    partnerName: str(b.partnerName, 120),
    extra: str(b.extra, 2000),
    tone: str(b.tone, 12),
    length: str(b.length, 12),
  };
  const result = buildSOP(input);
  let reference = null;
  // Live-preview calls (preview: true) skip persistence and notifications so
  // typing in the builder doesn't spam the store or the inbox.
  if (b.preview !== true) {
    try {
      // Data minimisation: only the purpose and subclass are kept, never the name or free text.
      const saved = insert('sops', { purpose: input.purpose, visaCode: input.visaCode });
      reference = saved.reference;
      notifySubmission('sop', saved).catch(() => {});
    } catch {
      /* non-fatal */
    }
  }
  res.json({ ok: true, reference, preview: b.preview === true, ...result });
});

app.post('/api/applications', formLimiter, (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  const visaCode = str(b.visaCode, 20);
  if (!name) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  const { consent, error } = requireConsents(b, { ...PRIVACY_CONSENT, ...AGE_CONFIRM });
  if (error) return bad(res, error);

  const record = {
    name,
    email,
    phone: str(b.phone, 40),
    visaCode,
    visaName: findVisa(visaCode)?.name || '',
    location: str(b.location, 20),
    nationality: str(b.nationality, 80),
    message: str(b.message, 3000),
    status: 'received',
    consent,
  };
  const saved = insert('applications', record);
  notifySubmission('application', saved).catch(() => {});
  if (b.emailCopy === true) emailReference(req, email, saved.reference, 'enquiry');
  res.status(201).json({
    ok: true,
    reference: saved.reference,
    message:
      'Thanks — your enquiry has been received and we’ll reply by email. Keep your reference: you can use it to delete your data at any time. Government Visa Application Charges are always paid directly to Home Affairs.',
  });
});

app.post('/api/contact', formLimiter, (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  const message = str(b.message, 3000);
  if (!name) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!message) return bad(res, 'Please enter a message.');
  const { consent, error } = requireConsents(b, { ...PRIVACY_CONSENT, ...AGE_CONFIRM });
  if (error) return bad(res, error);
  const saved = insert('contacts', { name, email, message, consent });
  notifySubmission('contact', saved).catch(() => {});
  res.status(201).json({ ok: true, reference: saved.reference, message: 'Message received — we’ll reply by email.' });
});

app.get('/api/stats', (_req, res) => {
  res.json({
    ok: true,
    visaCount: visas.length,
    ...counts(),
    integrations: {
      vevo: isLiveConfigured() ? 'live' : 'demo',
      email: isEmailConfigured() ? 'on' : 'off',
      payments: isStripeConfigured() ? 'on' : 'off',
      payoutEncryption: canEncrypt() ? 'on' : 'off',
      businessDetails: businessDetails().complete ? 'complete' : 'incomplete',
    },
  });
});

/** Send the applicant their reference (opt-in only), with unsubscribe link. */
function emailReference(req, to, reference, what) {
  sendToUser({
    to,
    baseUrl: baseUrlOf(req),
    subject: `Your AusWise reference ${reference}`,
    lines: [
      `Thanks — we received your ${what}. Your reference is ${reference}.`,
      `Keep it safe: with this reference and your email you can delete your data at ${baseUrlOf(req)}/data-requests.html`,
    ],
  }).catch(() => {});
}

// ---- Business identity, privacy rights, unsubscribe ------------------------
app.get('/api/business', (_req, res) => {
  const { missing, ...details } = businessDetails();
  res.json({ ok: true, ...details, policyVersion: POLICY_VERSION, retentionDays: retentionDays() });
});

app.post('/api/privacy/delete', formLimiter, (req, res) => {
  const b = req.body || {};
  const reference = str(b.reference, 30);
  const email = str(b.email, 160);
  if (!reference || !isEmail(email)) return bad(res, 'Enter your reference number and the email you used.');
  const removed = deleteByReference(reference, email);
  // Both the reference AND the email must match, so neither alone can erase someone's data.
  res.json({
    ok: true,
    deleted: removed > 0,
    message: removed
      ? 'Done — that record has been permanently deleted.'
      : 'No record matched that reference and email. If you think we hold other data about you, send a privacy request below.',
  });
});

app.post('/api/privacy/request', formLimiter, (req, res) => {
  const b = req.body || {};
  const type = str(b.type, 20);
  const email = str(b.email, 160);
  if (!['access', 'correction', 'deletion', 'complaint'].includes(type)) return bad(res, 'Please choose a request type.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  const saved = recordPrivacyRequest({ type, email, reference: str(b.reference, 30), details: str(b.details, 2000) });
  notifySubmission('privacy', { reference: saved.reference, email, message: `${type.toUpperCase()} request\n${saved.details}`, createdAt: saved.createdAt }).catch(() => {});
  res.status(201).json({
    ok: true,
    reference: saved.reference,
    message: 'Request received. We will respond within 30 days, as required by the Australian Privacy Principles.',
  });
});

function unsubscribe(req, res, html) {
  const email = str(req.query.e || req.body?.e, 160);
  const token = str(req.query.t || req.body?.t, 64);
  if (!isEmail(email) || !verifyUnsubscribeToken(email, token)) {
    return html ? res.status(400).type('html').send(page('That unsubscribe link is invalid or has expired.')) : bad(res, 'Invalid unsubscribe link.');
  }
  suppress(email);
  return html ? res.type('html').send(page('You have been unsubscribed. We won’t email you again.')) : res.json({ ok: true });
}
function page(msg) {
  return `<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences — AusWise</title><link rel="stylesheet" href="/css/styles.css"><main class="page-hero"><h1>Email preferences</h1><p>${msg}</p><a class="btn btn-ghost" href="/">Back to AusWise</a></main></html>`;
}
app.get('/api/unsubscribe', (req, res) => unsubscribe(req, res, true));
app.post('/api/unsubscribe', express.urlencoded({ extended: false }), (req, res) => unsubscribe(req, res, false));

// ---- VEVO: Visa Entitlement Verification (for organisations) -------------
// Implements the Home Affairs "(Visa) Entitlements" API, contract versions
// 1.0.34 and 1.0.38 (VEVO_API_VERSION). Live checks use the organisation's own
// enrolment, so they are restricted to authorised staff holding
// VEVO_OPERATOR_KEY; the public can only run the labelled simulation.
function operatorAuthorised(req) {
  const key = process.env.VEVO_OPERATOR_KEY || '';
  const given = String(req.get('x-operator-key') || '');
  return key.length > 0 && given.length === key.length && timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

app.get('/api/vevo/info', (_req, res) => {
  const live = isLiveConfigured();
  const version = activeVersion();
  res.json({
    ok: true,
    mode: live ? 'live' : 'demo',
    version,
    supportedVersions: SUPPORTED_VERSIONS,
    versionNotes: VERSION_NOTES,
    operatorRequired: live,
    categories: vevoCategories(version).map((c) => ({ id: c, scopes: scopesFor(c, version) })),
    source: {
      api: `(Visa) Entitlements v${version}`,
      docs:
        'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online/for-organisations',
      accessManager: 'https://am.homeaffairs.gov.au',
      selfCheck: 'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online',
    },
    notice: live
      ? 'Live VEVO: checks go to the Department of Home Affairs and are limited to authorised staff of this organisation.'
      : 'Demo mode: results are simulated and labelled. Checking your own visa? Use the free official VEVO service.',
  });
});

app.get('/api/vevo/health', async (_req, res) => {
  try {
    const h = await healthCheck();
    res.status(h.ok ? 200 : 502).json(h);
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Health check failed', detail: err.message });
  }
});

app.post('/api/vevo/check', vevoLimiter, async (req, res) => {
  const b = req.body || {};
  if (b.holderConsent !== true) {
    return bad(res, 'Confirm the visa holder has consented to this check — VEVO checks require their consent.');
  }
  const live = isLiveConfigured();
  if (live && !process.env.VEVO_OPERATOR_KEY) {
    return res.status(503).json({ ok: false, error: 'Live checks are disabled until VEVO_OPERATOR_KEY is set for authorised staff.' });
  }
  if (live && !operatorAuthorised(req)) {
    return res.status(401).json({ ok: false, error: 'Live VEVO checks are restricted to authorised staff. Enter a valid operator key.' });
  }
  const result = validateRequest(b);
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
  try {
    const outcome = await checkEntitlements(result.data);
    if (outcome.error) {
      return res.status(outcome.status || 502).json({ ok: false, ...outcome });
    }
    res.json({ ok: true, ...outcome });
  } catch (err) {
    console.error('VEVO check failed:', err.message); // message only — never the request body
    res.status(502).json({ ok: false, error: 'Unable to complete the entitlement check right now.' });
  }
});

// ---- MARN agents: directory, accounts, reviews ----------------------------
app.get('/api/agents', (req, res) => {
  const { q, specialty } = req.query;
  res.json({
    ok: true,
    agents: listAgents({ q: q ? String(q) : undefined, specialty: specialty ? String(specialty) : undefined }),
    specialties: SPECIALTIES,
    omaraSearchUrl: OMARA_SEARCH_URL,
    payoutProgram: PAYOUT_PROGRAM,
    notice:
      'MARNs are format-checked but not auto-verified — always confirm an agent on the official OMARA register before engaging them. Reviews are unverified and shown as submitted. Listing and reviews are free.',
  });
});

app.get('/api/agents/me', (req, res) => {
  const agent = agentFromToken(bearerFrom(req));
  if (!agent) return res.status(401).json({ ok: false, error: 'Not logged in.' });
  res.json({ ok: true, agent });
});

app.get('/api/agents/:id', (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
  res.json({ ok: true, agent });
});

app.post('/api/agents/register', formLimiter, (req, res) => {
  const b = req.body || {};
  if (!isEmail(str(b.email, 160))) return bad(res, 'Please enter a valid email address.');
  const { consent, error } = requireConsents(b, {
    acceptTerms: 'Please accept the Terms of Service and Privacy Policy.',
    adultConfirm: `Agents must be ${ADULT_AGE} or over.`,
  });
  if (error) return bad(res, error);
  const result = registerAgent({
    name: str(b.name, 120),
    marn: str(b.marn, 10),
    email: str(b.email, 160),
    password: typeof b.password === 'string' ? b.password : '',
    bio: str(b.bio, 1500),
    specialties: b.specialties,
    languages: b.languages,
    location: str(b.location, 120),
    consent,
  });
  if (result.error) return bad(res, result.error);
  res.status(201).json({ ok: true, ...result });
});

app.post('/api/agents/login', (req, res) => {
  const b = req.body || {};
  const result = loginAgent({
    email: str(b.email, 160),
    marn: str(b.marn, 10),
    password: typeof b.password === 'string' ? b.password : '',
  });
  if (result.error) return res.status(401).json({ ok: false, error: result.error });
  res.json({ ok: true, ...result });
});

app.post('/api/agents/logout', (req, res) => {
  logoutAgent(bearerFrom(req));
  res.json({ ok: true });
});

app.patch('/api/agents/me', (req, res) => {
  const result = updateAgentProfile(bearerFrom(req), req.body || {});
  if (result.error) return res.status(401).json({ ok: false, error: result.error });
  res.json({ ok: true, ...result });
});

// Payout bank details ($99-per-client program). Stored server-side only,
// returned masked, never present on public profiles.
app.delete('/api/agents/me', (req, res) => {
  const result = deleteAgentAccount(bearerFrom(req));
  if (result.error) return res.status(401).json({ ok: false, error: result.error });
  res.json({ ok: true, message: 'Your account, profile and reviews have been permanently deleted.' });
});

app.put('/api/agents/me/payout', (req, res) => {
  const result = setPayoutDetails(bearerFrom(req), req.body || {});
  if (result.error) {
    const status = result.error === 'Not logged in.' ? 401 : result.code === 'NO_KEY' ? 503 : 400;
    return res.status(status).json({ ok: false, error: result.error });
  }
  res.json({ ok: true, ...result });
});

app.post('/api/agents/:id/reviews', reviewLimiter, (req, res) => {
  const b = req.body || {};
  if (b.genuineClient !== true) {
    return bad(res, 'Please confirm you were a client of this agent and the review reflects your genuine experience.');
  }
  const result = addReview(req.params.id, {
    rating: b.rating,
    name: str(b.name, 80),
    comment: str(b.comment, 1500),
    reviewerToken: bearerFrom(req),
  });
  if (result.error) return bad(res, result.error);
  res.status(201).json({ ok: true, ...result });
});

// ---- Application questionnaires (per visa) ---------------------------------
app.get('/api/questionnaires/:visaCode', (req, res) => {
  const q = getQuestionnaire(req.params.visaCode);
  if (!q) return res.status(404).json({ ok: false, error: 'No questionnaire for that visa code.' });
  res.json({ ok: true, questionnaire: q });
});

app.post('/api/questionnaires', formLimiter, (req, res) => {
  const b = req.body || {};
  const visaCode = str(b.visaCode, 20);
  const q = getQuestionnaire(visaCode);
  if (!q) return bad(res, 'Please choose a valid visa.');
  const raw = b.answers && typeof b.answers === 'object' ? b.answers : null;
  if (!raw) return bad(res, 'Please provide your answers.');

  // Keep only fields the questionnaire defines (no unexpected data is stored).
  const allowed = allowedFieldIds(q);
  const answers = {};
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k) && (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')) {
      answers[k] = typeof v === 'string' ? v.trim().slice(0, 3000) : v;
    }
  }
  // Under-18 status is derived server-side from the date of birth, never trusted from the client.
  const age = ageFromDob(answers.dob);
  answers.under18 = age != null && age < ADULT_AGE;
  if (answers.under18 && !isEmail(String(answers.guardianEmail || ''))) {
    return bad(res, 'Applicants under 18 need a parent or guardian’s valid email and consent.');
  }
  const missing = validateResponses(q, answers);
  if (missing.length) {
    return res.status(400).json({ ok: false, error: 'Some required answers are missing.', missing });
  }
  if (!isEmail(String(answers.email || ''))) return bad(res, 'Please enter a valid email address.');
  const consent = {
    policyVersion: POLICY_VERSION,
    at: new Date().toISOString(),
    items: ['privacyConsent', 'truthful', answers.sensitiveConsent && 'sensitiveConsent', answers.under18 && 'guardianConsent'].filter(Boolean),
  };
  const saved = insert('questionnaireResponses', {
    visaCode,
    visaName: q.visaName,
    answers,
    consent,
  });
  if (answers.emailCopy === true) emailReference(req, answers.email, saved.reference, `${q.visaName} questionnaire`);
  notifySubmission('application', {
    reference: saved.reference,
    name: String(answers.fullName || ''),
    email: String(answers.email || ''),
    visaCode,
    visaName: q.visaName,
    message: `Completed the ${q.visaName} application questionnaire.`,
    createdAt: saved.createdAt,
  }).catch(() => {});
  res.status(201).json({
    ok: true,
    reference: saved.reference,
    message:
      'Questionnaire saved. We’ll reply by email with general information and your options, including connecting you with a registered migration agent if you want personal advice. This costs nothing.',
  });
});

// ---- Education institutions -------------------------------------------------
app.get('/api/institutions', (req, res) => {
  const { q, state, type } = req.query;
  res.json({
    ok: true,
    institutions: filterInstitutions({
      q: q ? String(q) : undefined,
      state: state ? String(state) : undefined,
      type: type ? String(type) : undefined,
    }),
    states: institutionStates,
    types: institutionTypes,
    cricosUrl: CRICOS_SEARCH_URL,
    studyAustraliaUrl: STUDY_AUSTRALIA_URL,
    notice:
      'We list public, factual information only and take no commissions — always verify a provider and course on the official CRICOS register.',
  });
});

app.post('/api/institutions/enquiry', formLimiter, (req, res) => {
  const b = req.body || {};
  const name = str(b.institutionName, 160);
  const contactName = str(b.contactName, 120);
  const email = str(b.email, 160);
  if (!name) return bad(res, 'Please enter the institution name.');
  if (!contactName) return bad(res, 'Please enter a contact name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  const { consent, error } = requireConsents(b, PRIVACY_CONSENT);
  if (error) return bad(res, error);
  const saved = insert('institutionLeads', {
    institutionName: name,
    contactName,
    email,
    consent,
    cricosCode: str(b.cricosCode, 20),
    message: str(b.message, 2000),
  });
  notifySubmission('contact', {
    reference: saved.reference,
    name: `${contactName} (${name})`,
    email,
    message: `Institution partnership enquiry. CRICOS: ${saved.cricosCode || '-'}\n${saved.message}`,
    createdAt: saved.createdAt,
  }).catch(() => {});
  res.status(201).json({ ok: true, reference: saved.reference, message: 'Thanks — we’ll be in touch about listing your institution.' });
});

// ---- Stripe: AusWise service-fee payments (NOT government visa charges) ----
app.get('/api/checkout/config', (_req, res) => {
  res.json({ ok: true, ...publicConfig() });
});

app.post('/api/checkout/session', async (req, res) => {
  const b = req.body || {};
  const serviceId = str(b.serviceId, 40);
  const email = str(b.email, 160);
  if (email && !isEmail(email)) return bad(res, 'Please enter a valid email address.');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    const session = await createCheckoutSession({ serviceId, email, baseUrl });
    res.json({ ok: true, url: session.url });
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') {
      return res.status(503).json({
        ok: false,
        code: 'NOT_CONFIGURED',
        error: 'Online payment isn’t enabled yet. Please send a free enquiry and we’ll arrange it.',
      });
    }
    if (err.code === 'UNKNOWN_SERVICE') return bad(res, 'Please choose a valid service.');
    console.error('Stripe checkout failed:', err);
    res.status(502).json({ ok: false, error: 'Could not start checkout. Please try again or send an enquiry.' });
  }
});

// ----------------------------------------------------------------- static + SPA fallback
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

// ----------------------------------------------------------------- start
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  AusWise Migration running →  http://localhost:${PORT}\n`);
  });
}

export default app;
