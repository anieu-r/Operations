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
  };
  const result = buildSOP(input);
  let reference = null;
  try {
    const saved = insert('sops', { purpose: input.purpose, visaCode: input.visaCode, fullName: input.fullName });
    reference = saved.reference;
  } catch {
    /* non-fatal */
  }
  res.json({ ok: true, reference, ...result });
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
  res.status(201).json({ ok: true, reference: saved.reference, message: 'Message received — we’ll reply by email.' });
});

app.get('/api/stats', (_req, res) => {
  res.json({ ok: true, visaCount: visas.length, ...counts() });
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
  app.listen(PORT, () => {
    console.log(`\n  AusWise Migration running →  http://localhost:${PORT}\n`);
  });
}

export default app;
