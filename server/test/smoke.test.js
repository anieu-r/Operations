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
  check('checkout config lists services', payCfg.body.services.length >= 3);
  check('checkout disabled without key (demo)', payCfg.body.enabled === false);

  const session = await post('/api/checkout/session', { serviceId: 'consult-30' });
  check('checkout session 503 when not configured', session.status === 503 && session.body.code === 'NOT_CONFIGURED');

  const sessionBad = await post('/api/checkout/session', { serviceId: 'nope', email: 'x@y.com' });
  check('checkout rejects unknown service', sessionBad.status === 503 || sessionBad.status === 400);

  const stats = await get('/api/stats');
  check('stats reports integration status', stats.body.integrations && stats.body.integrations.payments === 'off');

  console.log(`\n${passed} passed, ${failed} failed\n`);
} catch (err) {
  console.error('Test run error:', err);
  failed++;
} finally {
  server.close();
  process.exit(failed === 0 ? 0 : 1);
}
