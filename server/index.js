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
  ENTITLEMENT_CATEGORIES,
  isLiveConfigured,
  validateRequest,
  checkEntitlements,
} from './vevo.js';
import { notifySubmission, isEmailConfigured } from './notify.js';
import { publicConfig, createCheckoutSession, isStripeConfigured } from './payments-stripe.js';
import {
  seedDemoAgents,
  listAgents,
  getAgent,
  registerAgent,
  loginAgent,
  agentFromToken,
  updateAgentProfile,
  logoutAgent,
  addReview,
  SPECIALTIES,
  OMARA_SEARCH_URL,
} from './agents.js';
import { getQuestionnaire, validateResponses } from './data/questionnaires.js';
import {
  filterInstitutions,
  states as institutionStates,
  institutionTypes,
  CRICOS_SEARCH_URL,
  STUDY_AUSTRALIA_URL,
} from './data/institutions.js';
import { bearerFrom } from './auth.js';

seedDemoAgents();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '256kb' }));

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
      const saved = insert('sops', { purpose: input.purpose, visaCode: input.visaCode, fullName: input.fullName });
      reference = saved.reference;
      notifySubmission('sop', saved).catch(() => {});
    } catch {
      /* non-fatal */
    }
  }
  res.json({ ok: true, reference, preview: b.preview === true, ...result });
});

app.post('/api/applications', (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  const visaCode = str(b.visaCode, 20);
  if (!name) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');

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
  };
  const saved = insert('applications', record);
  notifySubmission('application', saved).catch(() => {});
  res.status(201).json({
    ok: true,
    reference: saved.reference,
    message:
      'Thanks! Your enquiry has been received. A consultant will be in touch. Remember: government Visa Application Charges are always paid directly to Home Affairs via ImmiAccount.',
  });
});

app.post('/api/contact', (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  const message = str(b.message, 3000);
  if (!name) return bad(res, 'Please enter your name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!message) return bad(res, 'Please enter a message.');
  const saved = insert('contacts', { name, email, phone: str(b.phone, 40), message });
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
    },
  });
});

// ---- VEVO: Visa Entitlement Verification (for organisations) -------------
// Implements the Home Affairs "(Visa) Entitlements" API contract. Calls the
// live API when org credentials are configured, otherwise returns a clearly
// labelled simulated result.
app.get('/api/vevo/info', (_req, res) => {
  res.json({
    ok: true,
    mode: isLiveConfigured() ? 'live' : 'demo',
    categories: ENTITLEMENT_CATEGORIES,
    source: {
      api: '(Visa) Entitlements v1.0.34',
      docs:
        'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online/for-organisations',
      accessManager: 'https://am.homeaffairs.gov.au',
    },
    notice:
      isLiveConfigured()
        ? 'Live VEVO mode: requests are forwarded to the Department of Home Affairs.'
        : 'Demo mode: results are simulated and clearly labelled. Enrol via Home Affairs Access Manager and set VEVO_ACCESS_TOKEN + VEVO_CLIENT_ID for live checks.',
  });
});

app.head('/api/vevo/health', (_req, res) => res.status(200).end());

app.post('/api/vevo/check', async (req, res) => {
  const result = validateRequest(req.body);
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
  try {
    const outcome = await checkEntitlements(result.data);
    if (outcome.error) {
      return res.status(outcome.status || 502).json({ ok: false, mode: outcome.mode, errors: outcome.errors });
    }
    res.json({ ok: true, ...outcome });
  } catch (err) {
    console.error('VEVO check failed:', err);
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
    notice:
      'MARNs are format-checked but not auto-verified — always confirm an agent on the official OMARA register before engaging them. Example profiles are clearly labelled. Listing and reviews are free.',
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

app.post('/api/agents/register', (req, res) => {
  const b = req.body || {};
  if (!isEmail(str(b.email, 160))) return bad(res, 'Please enter a valid email address.');
  const result = registerAgent({
    name: str(b.name, 120),
    marn: str(b.marn, 10),
    email: str(b.email, 160),
    password: typeof b.password === 'string' ? b.password : '',
    bio: str(b.bio, 1500),
    specialties: b.specialties,
    languages: b.languages,
    location: str(b.location, 120),
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

app.post('/api/agents/:id/reviews', (req, res) => {
  const b = req.body || {};
  const result = addReview(req.params.id, {
    rating: b.rating,
    name: str(b.name, 80),
    comment: str(b.comment, 1500),
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

app.post('/api/questionnaires', (req, res) => {
  const b = req.body || {};
  const visaCode = str(b.visaCode, 20);
  const q = getQuestionnaire(visaCode);
  if (!q) return bad(res, 'Please choose a valid visa.');
  const answers = b.answers && typeof b.answers === 'object' ? b.answers : null;
  if (!answers) return bad(res, 'Please provide your answers.');
  const missing = validateResponses(q, answers);
  if (missing.length) {
    return res.status(400).json({ ok: false, error: 'Some required answers are missing.', missing });
  }
  const saved = insert('questionnaireResponses', {
    visaCode,
    visaName: q.visaName,
    applicationRef: str(b.applicationRef, 30),
    answers,
  });
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
      'Questionnaire saved. We’ll review it and reply with honest next steps — including anything that could hurt your application. This costs nothing.',
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

app.post('/api/institutions/enquiry', (req, res) => {
  const b = req.body || {};
  const name = str(b.institutionName, 160);
  const contactName = str(b.contactName, 120);
  const email = str(b.email, 160);
  if (!name) return bad(res, 'Please enter the institution name.');
  if (!contactName) return bad(res, 'Please enter a contact name.');
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  const saved = insert('institutionLeads', {
    institutionName: name,
    contactName,
    email,
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
