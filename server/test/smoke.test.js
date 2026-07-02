/**
 * Minimal smoke test — no test framework needed.
 * Starts the app on a test port and exercises the key endpoints.
 * Run with: npm test
 */

process.env.NODE_ENV = 'test';
const { default: app } = await import('../index.js');

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
async function post(path, data) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

try {
  console.log('\nAusWise smoke tests\n');

  const health = await get('/api/health');
  check('health ok', health.status === 200 && health.body.ok);

  const visas = await get('/api/visas');
  check('visas list returns items', visas.body.count > 10);

  const onshore = await get('/api/visas?location=onshore');
  check('onshore filter works', onshore.body.visas.every((v) => v.location.includes('onshore')));

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

  const vevoInfo = await get('/api/vevo/info');
  check('vevo info exposes categories', vevoInfo.body.categories.includes('WORK_ENTITLEMENTS'));

  const vevoBad = await post('/api/vevo/check', { data: { familyName: 'X' } });
  check('vevo validation rejects incomplete', vevoBad.status === 400 && vevoBad.body.errors.length > 0);

  const vevoOk = await post('/api/vevo/check', {
    data: { familyName: 'Intro', travelDocumentId: 'N6129182', travelDocumentIssuingCountry: 'AUS', birthDate: '1993-03-26', entitlementCategory: 'WORK_ENTITLEMENTS' },
  });
  check('vevo demo check returns entitlements', vevoOk.body.ok && vevoOk.body.data?.familyName === 'Intro');
  check('vevo demo flagged as demo', vevoOk.body.mode === 'demo');

  const app1 = await post('/api/applications', { name: 'Jane', email: 'jane@example.com', visaCode: '189' });
  check('application accepted', app1.status === 201 && app1.body.reference);

  const appBad = await post('/api/applications', { name: 'Jane', email: 'not-an-email' });
  check('application rejects bad email', appBad.status === 400);

  const contact = await post('/api/contact', { name: 'Bob', email: 'bob@example.com', message: 'Hi' });
  check('contact accepted', contact.status === 201);

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
  check('agent directory has demo profiles', dir.body.agents.length >= 3 && dir.body.agents.every((a) => a.omaraVerifyUrl));
  check('demo profiles flagged', dir.body.agents.some((a) => a.demo === true));

  const badMarn = await post('/api/agents/register', { name: 'X', marn: '12', email: 'x@y.com', password: 'password123' });
  check('register rejects bad MARN', badMarn.status === 400);

  const reg = await post('/api/agents/register', {
    name: 'Smoke Agent', marn: '7654321', email: `agent-${Date.now()}@test.com`, password: 'password123',
    specialties: ['Student visas'], location: 'Perth, WA',
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

  const review = await post(`/api/agents/${reg.body.agent.agentId}/reviews`, { rating: 5, name: 'Client', comment: 'Great' });
  check('public review accepted', review.status === 201);
  const badReview = await post(`/api/agents/${reg.body.agent.agentId}/reviews`, { rating: 9 });
  check('review rejects rating out of range', badReview.status === 400);
  const agentPage = await get(`/api/agents/${reg.body.agent.agentId}`);
  check('agent page shows rating + reviews', agentPage.body.agent.rating === 5 && agentPage.body.agent.reviews.length === 1);

  // ---- questionnaires --------------------------------------------------------
  const q500 = await get('/api/questionnaires/500');
  check('questionnaire tailored for study visa', q500.body.questionnaire.sections.some((s) => s.id === 'study'));
  const q820 = await get('/api/questionnaires/820-801');
  check('questionnaire tailored for partner visa', q820.body.questionnaire.sections.some((s) => s.id === 'partner'));

  const qMissing = await post('/api/questionnaires', { visaCode: '500', answers: { fullName: 'Only Name' } });
  check('questionnaire validates required fields', qMissing.status === 400 && qMissing.body.missing.length > 0);

  const qOk = await post('/api/questionnaires', {
    visaCode: '600',
    answers: {
      fullName: 'Visitor Test', dob: '1990-01-01', nationality: 'Indian', passportNumber: 'P123',
      email: 'v@test.com', country: 'India', inAustralia: 'No',
      visitPurpose: 'Tourism', ties: 'Job and family at home', visaRefusal: 'No', truthful: true,
    },
  });
  check('questionnaire submission saves with reference', qOk.status === 201 && /^QNR-/.test(qOk.body.reference));

  // ---- institutions ----------------------------------------------------------
  const inst = await get('/api/institutions');
  check('institutions directory lists providers', inst.body.institutions.length >= 20 && !!inst.body.cricosUrl);
  const instVic = await get('/api/institutions?state=VIC&type=University');
  check('institution filters work', instVic.body.institutions.every((i) => i.state === 'VIC' && i.type === 'University'));
  const lead = await post('/api/institutions/enquiry', { institutionName: 'Test Uni', contactName: 'Dean', email: 'dean@test.edu' });
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
  const sopPrev = await post('/api/sop', { fullName: 'Prev', purpose: 'study', preview: true, tone: 'warm', length: 'detailed' });
  check('sop preview mode skips persistence', sopPrev.body.preview === true && sopPrev.body.reference === null);
  check('sop returns word count + sections', sopPrev.body.wordCount > 50 && Array.isArray(sopPrev.body.sections));

  console.log(`\n${passed} passed, ${failed} failed\n`);
} catch (err) {
  console.error('Test run error:', err);
  failed++;
} finally {
  server.close();
  process.exit(failed === 0 ? 0 : 1);
}
