/**
 * Minimal smoke test — no test framework needed.
 * Starts the app on a test port and exercises the key endpoints.
 * Run with: npm test
 */

import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'auswise-test-')); // never touch real data
process.env.FORM_RATE_LIMIT = '1000';
const { default: app } = await import('../index.js');
const store = await import('../store.js');
const privacy = await import('../privacy.js');

const PORT = 4567;
const server = app.listen(PORT);
const base = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
async function get(path) {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function post(path, data, headers = {}) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const CONSENT = { privacyConsent: true, ageConfirm: true };

try {
  console.log('\nAusWise smoke tests\n');

  const health = await get('/api/health');
  check('health ok', health.status === 200 && health.body.ok);

  const visas = await get('/api/visas');
  check('visas list returns items', visas.body.count > 10);

  const onshore = await get('/api/visas?location=onshore');
  check('onshore filter works', onshore.body.visas.every((v) => v.location.includes('onshore')));

  const flexible = await get('/api/visas?location=flexible');
  check(
    'flexible filter returns apply-from-anywhere visas only',
    flexible.body.count > 5 &&
      flexible.body.visas.every((v) => v.location.includes('onshore') && v.location.includes('offshore'))
  );

  const flexRec = await post('/api/eligibility', { answers: { goal: 'family', location: 'flexible', sponsor: 'partner' } });
  check(
    'flexible location recommends both partner streams',
    ['820-801', '309-100'].every((c) => flexRec.body.recommendations.some((r) => r.code === c))
  );

  const search = await get('/api/visas?q=student');
  check('search finds student visa', search.body.visas.some((v) => v.code === '500'));

  const one = await get('/api/visas/189');
  check('single visa 189', one.body.visa?.code === '189');

  const missing = await get('/api/visas/zzz');
  check('unknown visa 404', missing.status === 404);

  const news = await get('/api/news');
  check('news has items + liveSources', news.body.news.length > 0 && news.body.liveSources.length > 0);

  const pay = await get('/api/payments');
  check('payments has official bodies', pay.body.officialBodies.some((b) => b.primary));

  const q = await get('/api/eligibility/questions');
  check('eligibility questions', q.body.questions.length >= 3);

  const rec = await post('/api/eligibility', { answers: { goal: 'study', location: 'offshore' } });
  check('eligibility recommends 500 for study', rec.body.recommendations.some((r) => r.code === '500'));

  const sop = await post('/api/sop', { fullName: 'Test User', purpose: 'study', course: 'Master of IT' });
  check('sop generates draft', sop.body.ok && sop.body.draft.includes('STATEMENT OF PURPOSE'));

  const sopBad = await post('/api/sop', { purpose: 'study' });
  check('sop validates missing name', sopBad.status === 400);

  // ---- VEVO (both contract versions) ------------------------------------------
  const vevoInfo = await get('/api/vevo/info');
  check('vevo info exposes categories with scopes', vevoInfo.body.categories.some((c) => c.id === 'WORK_ENTITLEMENTS' && c.scopes.includes('VSA:ENT:E')));
  check('vevo supports both contract versions, defaults to 1.0.38',
    vevoInfo.body.version === '1.0.38' && ['1.0.34', '1.0.38'].every((v) => vevoInfo.body.supportedVersions.includes(v)));

  const holder = { familyName: 'Intro', travelDocumentId: 'N6129182', travelDocumentIssuingCountry: 'AUS', birthDate: '1993-03-26', entitlementCategory: 'WORK_ENTITLEMENTS' };
  const vevoNoConsent = await post('/api/vevo/check', { data: holder });
  check('vevo requires visa-holder consent', vevoNoConsent.status === 400);

  const vevoBad = await post('/api/vevo/check', { data: { familyName: 'X', birthDate: '2999-01-01' }, holderConsent: true });
  check('vevo validation rejects incomplete / future dob', vevoBad.status === 400 && vevoBad.body.errors.length >= 3);

  const vevoOk = await post('/api/vevo/check', { data: holder, holderConsent: true });
  check('vevo demo check returns entitlements', vevoOk.body.ok && vevoOk.body.data?.familyName === 'Intro');
  check('vevo demo flagged as demo', vevoOk.body.mode === 'demo');
  check('vevo demo conforms to spec field names/enums',
    !!vevoOk.body.data.visaGrantDate && !('grantDate' in vevoOk.body.data) &&
      ['NIL', 'LIMITED', 'UNLIMITED'].includes(vevoOk.body.data.workEntitlementStatus));

  // Live mode against a local mock of the Home Affairs API
  const seen = [];
  const mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push(req.headers);
      const rl = process.env.VEVO_API_VERSION === '1.0.34'
        ? { 'X-RateLimit-Limit': 'name=rate-limit,5000;', 'X-RateLimit-Remaining': 'name=rate-limit,4995;' }
        : { 'RateLimit-Limit': '5000', 'RateLimit-Remaining': '182' };
      if (req.method === 'HEAD') { res.writeHead(204, rl); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/json', ...rl });
      res.end(JSON.stringify({ data: { familyName: JSON.parse(raw).data.familyName, workEntitlementStatus: 'NIL', mustNotArriveAfter: '2027-11-01' } }));
    });
  }).listen(4568);
  Object.assign(process.env, { VEVO_BASE_URL: 'http://localhost:4568/visa/v1/entitlements', VEVO_CLIENT_ID: 'cid', VEVO_ACCESS_TOKEN: 'tok', VEVO_OPERATOR_KEY: 'staff-secret' });
  const liveNoKey = await post('/api/vevo/check', { data: holder, holderConsent: true });
  check('live vevo restricted to authorised staff', liveNoKey.status === 401);
  for (const [ver, remaining] of [['1.0.34', 4995], ['1.0.38', 182]]) {
    process.env.VEVO_API_VERSION = ver;
    const live = await post('/api/vevo/check', { data: holder, holderConsent: true }, { 'x-operator-key': 'staff-secret' });
    const h = seen.at(-1);
    check(`live vevo v${ver}: auth, api key, W3C trace headers`,
      h.authorization === 'Bearer tok' && h['x-api-key'] === 'cid' && /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(h.traceparent) && !!h.tracestate);
    check(`live vevo v${ver}: rate-limit headers parsed`, live.body.mode === 'live' && live.body.rateLimit?.remaining === remaining);
    check(`live vevo v${ver}: normalises mustNotArriveAfter`, live.body.data.mustNotArriveAfterDate === '2027-11-01');
  }
  const vevoHealth = await get('/api/vevo/health');
  check('vevo HEAD health check', vevoHealth.status === 200 && vevoHealth.body.status === 204);
  mock.close();
  for (const k of ['VEVO_BASE_URL', 'VEVO_CLIENT_ID', 'VEVO_ACCESS_TOKEN', 'VEVO_OPERATOR_KEY', 'VEVO_API_VERSION']) delete process.env[k];

  // ---- enquiries need explicit consent ----------------------------------------
  const appNoConsent = await post('/api/applications', { name: 'Jane', email: 'jane@example.com', visaCode: '189' });
  check('application requires privacy consent + age confirmation', appNoConsent.status === 400);

  const app1 = await post('/api/applications', { name: 'Jane', email: 'jane@example.com', visaCode: '189', ...CONSENT });
  check('application accepted with consent', app1.status === 201 && app1.body.reference);
  check('consent record stored with policy version',
    store.all('applications').at(-1).consent?.policyVersion === privacy.POLICY_VERSION);

  const appBad = await post('/api/applications', { name: 'Jane', email: 'not-an-email', ...CONSENT });
  check('application rejects bad email', appBad.status === 400);

  const contact = await post('/api/contact', { name: 'Bob', email: 'bob@example.com', message: 'Hi', ...CONSENT });
  check('contact accepted', contact.status === 201);
  check('contact without consent rejected', (await post('/api/contact', { name: 'Bob', email: 'bob@example.com', message: 'Hi' })).status === 400);

  const payCfg = await get('/api/checkout/config');
  check('checkout config lists services', payCfg.body.services.length === 2);
  check('checkout disabled without key (demo)', payCfg.body.enabled === false);

  const session = await post('/api/checkout/session', { serviceId: 'sop-review' });
  check('checkout session 503 when not configured', session.status === 503 && session.body.code === 'NOT_CONFIGURED');

  const sessionBad = await post('/api/checkout/session', { serviceId: 'nope', email: 'x@y.com' });
  check('checkout rejects unknown service', sessionBad.status === 503 || sessionBad.status === 400);

  const stats = await get('/api/stats');
  check('stats reports integration status', stats.body.integrations && stats.body.integrations.payments === 'off');

  // ---- free-platform pricing -------------------------------------------------
  check('platform is free with exactly 2 paid extras', payCfg.body.freePlatform === true && payCfg.body.services.length === 2);
  check('free features listed', Array.isArray(payCfg.body.freeFeatures) && payCfg.body.freeFeatures.length >= 5);

  // ---- agents ----------------------------------------------------------------
  const dir = await get('/api/agents');
  check('no fictional agents or sample reviews are seeded', dir.body.agents.length === 0 && store.all('reviews').length === 0);

  const AGENT_CONSENT = { acceptTerms: true, adultConfirm: true };
  const badMarn = await post('/api/agents/register', { name: 'X', marn: '12', email: 'x@y.com', password: 'password123', ...AGENT_CONSENT });
  check('register rejects bad MARN', badMarn.status === 400);
  const noTerms = await post('/api/agents/register', { name: 'X', marn: '1112223', email: 'x2@y.com', password: 'password123' });
  check('register requires terms + 18+ confirmation', noTerms.status === 400);

  const reg = await post('/api/agents/register', {
    name: 'Smoke Agent', marn: '7654321', email: `agent-${Date.now()}@test.com`, password: 'password123',
    specialties: ['Student visas'], location: 'Perth, WA', ...AGENT_CONSENT,
  });
  check('agent registers and gets token', reg.status === 201 && !!reg.body.token);

  const me = await fetch(base + '/api/agents/me', { headers: { Authorization: `Bearer ${reg.body.token}` } }).then((r) => r.json());
  check('token resolves to agent', me.agent?.name === 'Smoke Agent');

  const badLogin = await post('/api/agents/login', { marn: '7654321', password: 'wrongpass' });
  check('login rejects wrong password', badLogin.status === 401);

  const patch = await fetch(base + '/api/agents/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.body.token}` },
    body: JSON.stringify({ bio: 'Updated bio' }),
  }).then((r) => r.json());
  check('agent can update profile', patch.agent?.bio === 'Updated bio');

  const agentId = reg.body.agent.agentId;
  const noDeclaration = await post(`/api/agents/${agentId}/reviews`, { rating: 5, comment: 'Great' });
  check('review requires genuine-client declaration', noDeclaration.status === 400);
  const review = await post(`/api/agents/${agentId}/reviews`, { rating: 5, name: 'Client', comment: 'Great', genuineClient: true });
  check('public review accepted', review.status === 201);
  const badReview = await post(`/api/agents/${agentId}/reviews`, { rating: 9, genuineClient: true });
  check('review rejects rating out of range', badReview.status === 400);
  const selfReview = await post(`/api/agents/${agentId}/reviews`, { rating: 5, genuineClient: true }, { Authorization: `Bearer ${reg.body.token}` });
  check('agents cannot review themselves', selfReview.status === 400);
  const agentPage = await get(`/api/agents/${reg.body.agent.agentId}`);
  check('agent page shows rating + reviews', agentPage.body.agent.rating === 5 && agentPage.body.agent.reviews.length === 1);

  // ---- questionnaires --------------------------------------------------------
  const q500 = await get('/api/questionnaires/500');
  check('questionnaire tailored for study visa', q500.body.questionnaire.sections.some((s) => s.id === 'study'));
  const q820 = await get('/api/questionnaires/820-801');
  check('questionnaire tailored for partner visa', q820.body.questionnaire.sections.some((s) => s.id === 'partner'));

  const qMissing = await post('/api/questionnaires', { visaCode: '500', answers: { fullName: 'Only Name' } });
  check('questionnaire validates required fields', qMissing.status === 400 && qMissing.body.missing.length > 0);

  const adultAnswers = {
    fullName: 'Visitor Test', dob: '1990-01-01', nationality: 'Indian', passportNumber: 'P123', hackerField: 'x',
    email: 'v@test.com', country: 'India', inAustralia: 'No',
    visitPurpose: 'Tourism', ties: 'Job and family at home', visaRefusal: 'No', truthful: true, privacyConsent: true,
  };
  const qNoConsent = await post('/api/questionnaires', { visaCode: '600', answers: { ...adultAnswers, privacyConsent: false } });
  check('questionnaire requires privacy consent', qNoConsent.status === 400);
  const qOk = await post('/api/questionnaires', { visaCode: '600', answers: adultAnswers });
  check('questionnaire submission saves with reference', qOk.status === 201 && /^QNR-/.test(qOk.body.reference));
  const savedQ = store.all('questionnaireResponses').at(-1);
  check('questionnaire drops passport number and unknown fields', !('passportNumber' in savedQ.answers) && !('hackerField' in savedQ.answers));

  const minorDob = `${new Date().getUTCFullYear() - 15}-01-01`;
  const qMinor = await post('/api/questionnaires', { visaCode: '600', answers: { ...adultAnswers, dob: minorDob } });
  check('under-18 applicant needs parent/guardian consent', qMinor.status === 400);
  const qMinorOk = await post('/api/questionnaires', {
    visaCode: '600',
    answers: { ...adultAnswers, dob: minorDob, guardianName: 'Parent', guardianEmail: 'parent@test.com', guardianConsent: true },
  });
  check('under-18 accepted with guardian consent', qMinorOk.status === 201);

  const qSensitive = await post('/api/questionnaires', { visaCode: '600', answers: { ...adultAnswers, healthCondition: 'Yes' } });
  check('health/character details need separate consent', qSensitive.status === 400);

  // ---- data rights -------------------------------------------------------------
  const delWrong = await post('/api/privacy/delete', { reference: qOk.body.reference, email: 'someone-else@test.com' });
  check('deletion needs matching email', delWrong.body.deleted === false && store.all('questionnaireResponses').some((r) => r.reference === qOk.body.reference));
  const delOk = await post('/api/privacy/delete', { reference: qOk.body.reference, email: 'V@test.com' });
  check('self-service deletion removes the record', delOk.body.deleted === true && !store.all('questionnaireResponses').some((r) => r.reference === qOk.body.reference));
  const pr = await post('/api/privacy/request', { type: 'access', email: 'v@test.com', details: 'copy please' });
  check('privacy access request recorded', pr.status === 201 && /^PRV-/.test(pr.body.reference));

  const unsubBad = await fetch(`${base}/api/unsubscribe?e=a@b.com&t=nope`);
  check('unsubscribe rejects forged token', unsubBad.status === 400);
  const unsubOk = await fetch(`${base}/api/unsubscribe?e=a@b.com&t=${privacy.unsubscribeToken('a@b.com')}`);
  check('unsubscribe link suppresses address', unsubOk.status === 200 && privacy.isSuppressed('A@b.com'));
  const oneClick = await fetch(`${base}/api/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `e=c@d.com&t=${privacy.unsubscribeToken('c@d.com')}` });
  check('RFC 8058 one-click unsubscribe works', oneClick.status === 200 && privacy.isSuppressed('c@d.com'));

  store.insert('contacts', { name: 'Old', email: 'old@test.com', message: 'x', createdAt: '2020-01-01T00:00:00.000Z' });
  check('retention purge removes expired records', privacy.purgeExpired() >= 1 && !store.all('contacts').some((r) => r.email === 'old@test.com'));

  // ---- business details, legal pages, security headers --------------------------
  check('ABN checksum validation', privacy.isValidAbn('51 824 753 556') && !privacy.isValidAbn('51 824 753 557'));
  const biz = await get('/api/business');
  check('business details flagged incomplete until configured', biz.body.complete === false && biz.body.policyVersion === privacy.POLICY_VERSION);
  for (const page of ['privacy', 'terms', 'refunds', 'cookies', 'data-requests', 'accessibility']) {
    const r = await fetch(`${base}/${page}.html`);
    check(`legal page /${page}.html served`, r.status === 200 && (await r.text()).includes('<h1>'));
  }
  const homeRes = await fetch(`${base}/`);
  const csp = homeRes.headers.get('content-security-policy') || '';
  check('strict CSP: same-origin only', csp.includes("default-src 'self'") && csp.includes("script-src 'self'") && !csp.includes('googleapis'));
  const publicDir = new URL('../../public/', import.meta.url);
  const htmlFiles = readdirSync(publicDir).filter((f) => f.endsWith('.html'));
  check('no third-party fonts or scripts in any page', htmlFiles.every((f) => !/googleapis|gstatic|https?:\/\/[^"']+\.js/.test(readFileSync(new URL(f, publicDir), 'utf8'))));
  check('font licences shipped', readdirSync(new URL('fonts/', publicDir)).filter((f) => f.startsWith('LICENSE')).length === 2);

  // ---- institutions ----------------------------------------------------------
  const inst = await get('/api/institutions');
  check('institutions directory lists providers', inst.body.institutions.length >= 20 && !!inst.body.cricosUrl);
  const instVic = await get('/api/institutions?state=VIC&type=University');
  check('institution filters work', instVic.body.institutions.every((i) => i.state === 'VIC' && i.type === 'University'));
  const leadNo = await post('/api/institutions/enquiry', { institutionName: 'Test Uni', contactName: 'Dean', email: 'dean@test.edu' });
  check('institution enquiry requires consent', leadNo.status === 400);
  const lead = await post('/api/institutions/enquiry', { institutionName: 'Test Uni', contactName: 'Dean', email: 'dean@test.edu', privacyConsent: true });
  check('institution enquiry accepted', lead.status === 201);

  // ---- payouts ($99 per client) ----------------------------------------------
  const payoutUnauth = await fetch(base + '/api/agents/me/payout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountName: 'X', bsb: '062000', accountNumber: '12345678' }),
  });
  check('payout requires login', payoutUnauth.status === 401);

  const payoutBad = await fetch(base + '/api/agents/me/payout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.body.token}` },
    body: JSON.stringify({ accountName: 'Smoke Agent', bsb: '12', accountNumber: '123' }),
  });
  check('payout validates BSB/account', payoutBad.status === 400);

  const payoutNoKey = await fetch(base + '/api/agents/me/payout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.body.token}` },
    body: JSON.stringify({ accountName: 'Smoke Agent', bsb: '062-000', accountNumber: '12345678' }),
  });
  check('payout refused (503) without an encryption key', payoutNoKey.status === 503);

  process.env.DATA_ENCRYPTION_KEY = 'test-key-not-for-production';
  const payoutOk = await fetch(base + '/api/agents/me/payout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.body.token}` },
    body: JSON.stringify({ accountName: 'Smoke Agent', bsb: '062-000', accountNumber: '12345678' }),
  }).then((r) => r.json());
  check('payout saves and masks account number', payoutOk.ok && payoutOk.payout.accountNumberMasked.endsWith('678') && !payoutOk.payout.accountNumberMasked.startsWith('12345'));

  const meAfter = await fetch(base + '/api/agents/me', { headers: { Authorization: `Bearer ${reg.body.token}` } }).then((r) => r.json());
  check('me includes masked payout + $99 program', meAfter.agent.payout.set === true && meAfter.agent.payoutProgram.amountCents === 9900);

  const publicProfile = await get(`/api/agents/${reg.body.agent.agentId}`);
  check('bank details never on public profile', JSON.stringify(publicProfile.body).includes('12345678') === false && publicProfile.body.agent.payout === undefined);
  const storedAgent = store.all('agents').find((a) => a.agentId === agentId);
  check('bank details encrypted at rest', !JSON.stringify(storedAgent).includes('12345678') &&
    privacy.decrypt(storedAgent.payout.encrypted)?.accountNumber === '12345678');

  // ---- expanded catalogue ------------------------------------------------------
  const allVisas = await get('/api/visas');
  check('catalogue has 48+ subclasses', allVisas.body.count >= 48);
  const eta = await get('/api/visas/601');
  check('ETA 601 present', eta.body.visa?.name.includes('Electronic Travel Authority'));
  const bva = await get('/api/visas/010');
  check('Bridging visa A present', bva.body.visa?.category === 'Residence & Other');
  const qBridging = await get('/api/questionnaires/010');
  check('questionnaire works for new subclasses', qBridging.body.questionnaire.sections.length >= 7);

  // ---- SOP upgrades ----------------------------------------------------------
  check('sop store never keeps the name', store.all('sops').every((r) => !('fullName' in r)));
  const sopPrev = await post('/api/sop', { fullName: 'Prev', purpose: 'study', preview: true, tone: 'warm', length: 'detailed' });
  check('sop preview mode skips persistence', sopPrev.body.preview === true && sopPrev.body.reference === null);
  check('sop returns word count + sections', sopPrev.body.wordCount > 50 && Array.isArray(sopPrev.body.sections));

  // ---- review rate limit + account deletion (run last) --------------------------
  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) {
    limited = (await post(`/api/agents/${agentId}/reviews`, { rating: 4, genuineClient: true })).status === 429;
  }
  check('review spam is rate-limited per IP', limited);
  const delAcct = await fetch(base + '/api/agents/me', { method: 'DELETE', headers: { Authorization: `Bearer ${reg.body.token}` } });
  check('agent can delete own account + reviews', delAcct.status === 200 && !store.all('agents').some((a) => a.agentId === agentId) &&
    !store.all('reviews').some((r) => r.agentId === agentId));

  console.log(`\n${passed} passed, ${failed} failed\n`);
} catch (err) {
  console.error('Test run error:', err);
  failed++;
} finally {
  server.close();
  process.exit(failed === 0 ? 0 : 1);
}
