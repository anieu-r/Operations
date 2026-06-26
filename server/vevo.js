/**
 * VEVO — Visa Entitlement Verification (for Organisations).
 *
 * Implements the contract from the official Department of Home Affairs
 * "(Visa) Entitlements" API (OpenAPI spec saved at
 * server/data/visa-entitlements.openapi.json, v1.0.34):
 *
 *   POST https://api.public.homeaffairs.gov.au/visa/v1/entitlements/checks
 *
 * The real API is restricted to organisations enrolled via Home Affairs Access
 * Manager and requires OAuth2 (Bearer token) + an x-api-key (clientId). When
 * those credentials are supplied via environment variables we call the LIVE
 * API. Otherwise we return a clearly-labelled SIMULATED response that conforms
 * to the official response schema, so the feature works end-to-end in a demo
 * WITHOUT pretending to be real government data.
 *
 * Required env for live mode:
 *   VEVO_BASE_URL      (default https://api.public.homeaffairs.gov.au/visa/v1/entitlements)
 *   VEVO_ACCESS_TOKEN  OAuth2 bearer token (valid 8h)
 *   VEVO_CLIENT_ID     x-api-key / clientId
 */

const DEFAULT_BASE = 'https://api.public.homeaffairs.gov.au/visa/v1/entitlements';

export const ENTITLEMENT_CATEGORIES = [
  'IMMIGRATION_STATUS',
  'LEGAL_PRACTITIONER',
  'LICENSING_ELIGIBILITY',
  'MEDICARE_ELIGIBILITY',
  'REGISTERED_MIGRATION_AGENT',
  'RESIDENCE_STATUS',
  'STUDY_ENTITLEMENTS',
  'WORK_ENTITLEMENTS',
];

export function isLiveConfigured() {
  return Boolean(process.env.VEVO_ACCESS_TOKEN && process.env.VEVO_CLIENT_ID);
}

/**
 * Validate the request body against the official schema's constraints.
 * Returns { ok:true, data } or { ok:false, errors:[...] } using the API's
 * jsonapi.org-style error shape.
 */
export function validateRequest(body) {
  const data = body && typeof body === 'object' ? body.data || body : {};
  const errors = [];
  const push = (pointer, detail, code = 'VALIDATION_ERROR') =>
    errors.push({ code, detail, source: { pointer } });

  const familyName = str(data.familyName);
  const givenName = str(data.givenName);
  const travelDocumentId = str(data.travelDocumentId);
  const country = str(data.travelDocumentIssuingCountry).toUpperCase();
  const birthDate = str(data.birthDate);
  const entitlementCategory = str(data.entitlementCategory).toUpperCase();

  if (!familyName) push('/data/familyName', 'familyName is required (1–100 chars).');
  else if (familyName.length > 100) push('/data/familyName', 'familyName must be ≤ 100 chars.');

  if (givenName && givenName.length > 100) push('/data/givenName', 'givenName must be ≤ 100 chars.');

  if (!travelDocumentId) push('/data/travelDocumentId', 'travelDocumentId (passport number) is required.');
  else if (travelDocumentId.length > 14)
    push('/data/travelDocumentId', 'travelDocumentId must be ≤ 14 chars.');

  if (!country) push('/data/travelDocumentIssuingCountry', 'travelDocumentIssuingCountry is required.');
  else if (!/^[A-Z]{3}$/.test(country))
    push('/data/travelDocumentIssuingCountry', 'Must be a 3-letter ICAO country code, e.g. AUS, IND, GBR.');

  if (!birthDate) push('/data/birthDate', 'birthDate is required (YYYY-MM-DD).');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
    push('/data/birthDate', 'birthDate must be in YYYY-MM-DD format.');

  if (entitlementCategory && !ENTITLEMENT_CATEGORIES.includes(entitlementCategory))
    push('/data/entitlementCategory', `entitlementCategory must be one of: ${ENTITLEMENT_CATEGORIES.join(', ')}.`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      entitlementCategory: entitlementCategory || 'WORK_ENTITLEMENTS',
      givenName,
      familyName,
      travelDocumentId,
      travelDocumentIssuingCountry: country,
      birthDate,
    },
  };
}

/**
 * Perform an entitlement check. Calls the live API when configured, otherwise
 * returns a simulated response (clearly flagged via `mode: "demo"`).
 */
export async function checkEntitlements(validData) {
  if (isLiveConfigured()) {
    return callLive(validData);
  }
  return { mode: 'demo', ...simulate(validData) };
}

async function callLive(validData) {
  const base = process.env.VEVO_BASE_URL || DEFAULT_BASE;
  const url = `${base.replace(/\/$/, '')}/checks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VEVO_ACCESS_TOKEN}`,
      'x-api-key': process.env.VEVO_CLIENT_ID,
    },
    body: JSON.stringify({ data: validData }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { mode: 'live', error: true, status: res.status, ...payload };
  }
  return { mode: 'live', status: res.status, ...payload };
}

/**
 * Build a schema-conformant SIMULATED entitlement response. Deterministic from
 * the inputs so the same person yields the same demo result. This is NOT real
 * government data and is labelled as such everywhere it surfaces.
 */
function simulate(d) {
  const seed = hash(`${d.familyName}|${d.travelDocumentId}|${d.birthDate}`);
  const today = new Date();
  const plus = (days) => new Date(today.getTime() + days * 864e5).toISOString().slice(0, 10);

  const visaPool = [
    { visaClass: 'TU', visaSubclass: '500', label: 'Student visa', medicare: 'STUDENT_VISA', work: ['8105'], study: ['8202'] },
    { visaClass: 'UD', visaSubclass: '485', label: 'Temporary Graduate visa', medicare: 'TEMPORARY_RESIDENT', work: [], study: [] },
    { visaClass: 'GK', visaSubclass: '482', label: 'Skills in Demand visa', medicare: 'TEMPORARY_RESIDENT', work: ['8607'], study: [] },
    { visaClass: 'BC', visaSubclass: '189', label: 'Skilled Independent visa', medicare: 'PERMANENT_RESIDENT', work: [], study: [] },
    { visaClass: 'TZ', visaSubclass: '417', label: 'Working Holiday visa', medicare: 'TEMPORARY_RESIDENT', work: ['8547'], study: ['8201'] },
  ];
  const pick = visaPool[seed % visaPool.length];
  const onshore = seed % 2 === 0;
  const grantDays = -(60 + (seed % 400));
  const expiryDays = 120 + (seed % 600);

  const conditionLib = {
    8105: 'You are permitted to work a maximum number of hours per fortnight while your course is in session, and unrestricted hours during scheduled course breaks.',
    8202: 'You must remain enrolled in a registered course, maintain satisfactory attendance and academic performance.',
    8201: 'You must not engage in any studies or training for more than 4 months.',
    8547: 'You must not work for the same employer for more than 6 months without permission.',
    8607: 'You must work only in your nominated occupation for your approved sponsor.',
  };
  const toCond = (codes) =>
    codes.map((c) => ({ conditionCode: String(c), conditionDescription: conditionLib[c] || 'See visa grant notice.', currentTimestamp: today.toISOString() }));

  const data = {
    familyName: d.familyName,
    givenName: d.givenName || undefined,
    visaClass: pick.visaClass,
    visaSubclass: pick.visaSubclass,
    visaType: pick.label,
    visaStatus: 'IN_EFFECT',
    applicantRole: seed % 3 === 0 ? 'SECONDARY' : 'PRIMARY',
    visaHolderIsOnshore: onshore,
    grantDate: plus(grantDays),
    visaExpiryDate: plus(expiryDays),
    enterBeforeDate: pick.visaSubclass === '189' ? plus(expiryDays) : undefined,
    mustNotArriveAfterDate: undefined,
    medicareEligibilityStatus: pick.medicare,
    residenceStatus: pick.medicare === 'PERMANENT_RESIDENT' ? 'PERMANENT' : 'TEMPORARY',
    educationSector: pick.visaSubclass === '500' ? 'HIGHER_EDUCATION' : undefined,
    workEntitlement:
      pick.visaSubclass === '189' ? 'UNLIMITED' : pick.work.length ? 'CONDITIONAL' : 'UNLIMITED_WHILE_VALID',
    workConditions: toCond(pick.work),
    studyConditions: toCond(pick.study),
  };

  return {
    requestedCategory: d.entitlementCategory,
    checkedAt: today.toISOString(),
    data,
    notice:
      'SIMULATED RESULT — not connected to the live VEVO service. Configure VEVO_ACCESS_TOKEN and VEVO_CLIENT_ID (organisation enrolment required) to return real entitlement data.',
  };
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
