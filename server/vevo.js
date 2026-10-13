/**
 * VEVO — Visa Entitlement Verification for Organisations.
 *
 * Integrates the Department of Home Affairs "(Visa) Entitlements" API. Both
 * published contract versions are bundled and the active one is chosen with
 * VEVO_API_VERSION (default 1.0.38):
 *
 *   server/data/visa-entitlements-1.0.34.openapi.json
 *   server/data/visa-entitlements-1.0.38.openapi.json
 *
 *   POST {base}/checks   conduct an entitlement check
 *   HEAD {base}/         connectivity / subscription health check
 *
 * The request validation rules, entitlement categories and the OAuth scopes
 * each category needs are all read from the selected spec, so swapping
 * versions needs no code changes. Differences between the versions handled
 * here: 1.0.34 reports quota in `X-RateLimit-Limit/Remaining` as strings like
 * "name=rate-limit,4995;", while 1.0.38 uses integer `RateLimit-Limit/Remaining`.
 *
 * Live mode (organisation enrolled via Home Affairs Access Manager):
 *   VEVO_CLIENT_ID       x-api-key (clientId from machine-certificate registration)
 *   and EITHER
 *   VEVO_ACCESS_TOKEN    a pre-issued bearer token (valid 8h), OR
 *   VEVO_CLIENT_CERT_PATH + VEVO_CLIENT_KEY_PATH (or VEVO_CLIENT_PFX_PATH +
 *   VEVO_CLIENT_PFX_PASSPHRASE) so tokens are fetched automatically from the
 *   mTLS OAuth endpoint (client-credentials grant) and cached until expiry.
 * Optional: VEVO_BASE_URL, VEVO_TOKEN_URL, VEVO_TRACESTATE.
 *
 * Without credentials, a clearly labelled SIMULATED response is returned that
 * conforms to the selected spec's response schema. It is never presented as
 * real government data. Personal details sent to a check are never stored or
 * logged by this module.
 */

import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SPECS = Object.fromEntries(
  ['1.0.34', '1.0.38'].map((v) => [
    v,
    JSON.parse(readFileSync(join(__dirname, 'data', `visa-entitlements-${v}.openapi.json`), 'utf8')),
  ])
);
export const SUPPORTED_VERSIONS = Object.keys(SPECS);
export const DEFAULT_VERSION = '1.0.38';

export const VERSION_NOTES = {
  '1.0.34': 'Rate-limit quota reported in X-RateLimit-Limit / X-RateLimit-Remaining string headers.',
  '1.0.38':
    'Rate-limit quota reported in integer RateLimit-Limit / RateLimit-Remaining headers; adds the ECAS_VEVO_USER enrolment role.',
};

/* ---------------------------------------------------------------- spec reads */

export function activeVersion() {
  const v = process.env.VEVO_API_VERSION;
  return SPECS[v] ? v : DEFAULT_VERSION;
}

function spec(version = activeVersion()) {
  return SPECS[version] || SPECS[DEFAULT_VERSION];
}

function requestSchema(version) {
  return spec(version).components.schemas.visaEntitlementsRequest.properties.data;
}

export function categories(version) {
  return spec(version).components.schemas.entitlementCategoryType.enum;
}
// Backwards-compatible export (default version's categories).
export const ENTITLEMENT_CATEGORIES = categories(DEFAULT_VERSION);

/**
 * Category → OAuth scopes, parsed from the operation description, e.g.
 * "* WORK_ENTITLEMENTS: VSA:ENT:R VSA:ENT:E".
 */
export function scopesFor(category, version) {
  const desc = spec(version).paths['/checks'].post.description;
  const m = desc.match(new RegExp(`\\*\\s*${category}:\\s*([A-Z:\\s]+?)\\n`));
  return m ? m[1].trim().split(/\s+/) : [];
}

function defaultBaseUrl(version) {
  return spec(version).servers[0].url;
}

function defaultTokenUrl(version) {
  return spec(version).components.securitySchemes['oauth2-entitlements'].flows.clientCredentials.tokenUrl;
}

/* ---------------------------------------------------------------- config */

function config() {
  const version = activeVersion();
  const env = process.env;
  return {
    version,
    baseUrl: (env.VEVO_BASE_URL || defaultBaseUrl(version)).replace(/\/$/, ''),
    tokenUrl: env.VEVO_TOKEN_URL || defaultTokenUrl(version),
    clientId: env.VEVO_CLIENT_ID || '',
    staticToken: env.VEVO_ACCESS_TOKEN || '',
    certPath: env.VEVO_CLIENT_CERT_PATH || '',
    keyPath: env.VEVO_CLIENT_KEY_PATH || '',
    pfxPath: env.VEVO_CLIENT_PFX_PATH || '',
    pfxPass: env.VEVO_CLIENT_PFX_PASSPHRASE || '',
    tracestate: env.VEVO_TRACESTATE || 'auswise=web',
  };
}

export function isLiveConfigured() {
  const c = config();
  const hasCert = Boolean((c.certPath && c.keyPath) || c.pfxPath);
  return Boolean(c.clientId && (c.staticToken || hasCert));
}

/* ---------------------------------------------------------------- validation */

/**
 * Validate a request body against the selected spec's request schema.
 * Returns { ok:true, data } or { ok:false, errors } (jsonapi.org error shape,
 * matching the API's own error format).
 */
export function validateRequest(body, version = activeVersion()) {
  const input = body && typeof body === 'object' ? body.data || body : {};
  const schema = requestSchema(version);
  const errors = [];
  const push = (field, detail) =>
    errors.push({ code: 'VALIDATION_ERROR', detail, source: { pointer: `/data/${field}` } });

  const data = {};
  for (const [field, rules] of Object.entries(schema.properties)) {
    let value = input[field];
    value = value == null ? '' : String(value).trim();
    if (field === 'travelDocumentIssuingCountry' || field === 'entitlementCategory') value = value.toUpperCase();
    const required = schema.required.includes(field);

    if (!value) {
      if (required) push(field, `${field} is required.`);
      continue;
    }
    const enumValues = rules.enum || (rules.$ref ? categories(version) : null);
    if (enumValues && !enumValues.includes(value)) {
      push(field, `${field} must be one of: ${enumValues.join(', ')}.`);
      continue;
    }
    if (rules.minLength && value.length < rules.minLength) push(field, `${field} is too short.`);
    if (rules.maxLength && value.length > rules.maxLength)
      push(field, `${field} must be at most ${rules.maxLength} characters.`);
    if (rules.pattern && !new RegExp(`^(?:${rules.pattern})$`).test(value)) {
      push(field, field === 'travelDocumentIssuingCountry'
        ? 'Must be a 3-letter ICAO country code, e.g. AUS, IND, GBR.'
        : `${field} has an invalid format.`);
    }
    if (rules.format === 'date' && !isRealPastDate(value)) push(field, `${field} must be a valid past date (YYYY-MM-DD).`);
    data[field] = value;
  }
  if (errors.length) return { ok: false, errors };
  data.entitlementCategory = data.entitlementCategory || 'WORK_ENTITLEMENTS';
  return { ok: true, data };
}

function isRealPastDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getTime() <= Date.now();
}

/* ---------------------------------------------------------------- tracing + rate limits */

/** W3C trace-context header, required by both spec versions. */
export function newTraceparent() {
  return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

/**
 * Read the remaining/limit quota from either header style:
 *   1.0.38: RateLimit-Limit: 5000          RateLimit-Remaining: 182
 *   1.0.34: X-RateLimit-Limit: "name=rate-limit,5000;"
 */
export function parseRateLimit(headers) {
  const get = (name) => (typeof headers.get === 'function' ? headers.get(name) : headers[name.toLowerCase()]);
  const num = (raw) => {
    if (raw == null || raw === '') return null;
    const m = String(raw).match(/(\d+)\s*;?\s*$/);
    return m ? Number(m[1]) : null;
  };
  const limit = num(get('RateLimit-Limit')) ?? num(get('X-RateLimit-Limit'));
  const remaining = num(get('RateLimit-Remaining')) ?? num(get('X-RateLimit-Remaining'));
  return limit == null && remaining == null ? null : { limit, remaining };
}

/* ---------------------------------------------------------------- OAuth token */

const tokenCache = new Map(); // scope string → { token, expiresAt }

async function accessToken(scopes) {
  const c = config();
  if (c.staticToken) return c.staticToken;
  const key = scopes.join(' ');
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;

  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, scope: key }).toString();
  const tls = c.pfxPath
    ? { pfx: readFileSync(c.pfxPath), passphrase: c.pfxPass || undefined }
    : { cert: readFileSync(c.certPath), key: readFileSync(c.keyPath) };

  const payload = await new Promise((resolve, reject) => {
    const req = httpsRequest(
      c.tokenUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000,
        ...tls,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (res.statusCode >= 400 || !json.access_token) {
              reject(Object.assign(new Error('Token request rejected'), { status: res.statusCode }));
            } else resolve(json);
          } catch {
            reject(new Error('Token endpoint returned invalid JSON'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Token request timed out')));
    req.on('error', reject);
    req.end(body);
  });

  // Tokens are valid for 8 hours per the API documentation.
  const ttl = (Number(payload.expires_in) || 8 * 3600) * 1000;
  tokenCache.set(key, { token: payload.access_token, expiresAt: Date.now() + ttl });
  return payload.access_token;
}

async function authHeaders(category) {
  const c = config();
  const traceparent = newTraceparent();
  return {
    traceparent,
    headers: {
      Authorization: `Bearer ${await accessToken(scopesFor(category, c.version))}`,
      'x-api-key': c.clientId,
      traceparent,
      tracestate: c.tracestate,
    },
  };
}

/* ---------------------------------------------------------------- checks */

const STATUS_HINTS = {
  400: 'Home Affairs rejected the request details.',
  401: 'The access token or client ID was not accepted — check the VEVO credentials.',
  403: 'Your organisation is not authorised for this entitlement category.',
  429: 'The daily VEVO quota has been reached. Failed requests also count towards it.',
  500: 'The Home Affairs service reported an internal error. Try again later.',
};

/** Run a check: live when configured, otherwise a labelled simulation. */
export async function checkEntitlements(validData) {
  const version = activeVersion();
  if (!isLiveConfigured()) {
    return { mode: 'demo', version, ...simulate(validData, version) };
  }

  const c = config();
  const { headers, traceparent } = await authHeaders(validData.entitlementCategory);
  const res = await fetch(`${c.baseUrl}/checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data: validData }),
  });
  const payload = await res.json().catch(() => ({}));
  const rateLimit = parseRateLimit(res.headers);
  const base = { mode: 'live', version, status: res.status, rateLimit, traceparent };

  if (!res.ok) {
    const errors = Array.isArray(payload.errors) && payload.errors.length
      ? payload.errors
      : [{ code: `HTTP_${res.status}`, detail: STATUS_HINTS[res.status] || 'The entitlement check failed.' }];
    return { ...base, error: true, hint: STATUS_HINTS[res.status] || null, errors };
  }
  return {
    ...base,
    requestedCategory: validData.entitlementCategory,
    checkedAt: new Date().toISOString(),
    data: normalise(payload.data || {}),
  };
}

/** HEAD health check against the API (live), or a no-op in demo mode. */
export async function healthCheck() {
  const version = activeVersion();
  if (!isLiveConfigured()) return { ok: true, mode: 'demo', version };
  const c = config();
  const category = process.env.VEVO_HEALTH_CATEGORY || 'WORK_ENTITLEMENTS';
  const { headers } = await authHeaders(category);
  const res = await fetch(`${c.baseUrl}/`, { method: 'HEAD', headers });
  return { ok: res.status === 204 || res.status === 200, mode: 'live', version, status: res.status, rateLimit: parseRateLimit(res.headers) };
}

/**
 * Smooth over inconsistencies in the published contract: the examples use
 * `mustNotArriveAfter` while the schema names it `mustNotArriveAfterDate`.
 */
function normalise(d) {
  const out = { ...d };
  if (out.mustNotArriveAfter && !out.mustNotArriveAfterDate) out.mustNotArriveAfterDate = out.mustNotArriveAfter;
  delete out.mustNotArriveAfter;
  for (const k of ['workConditions', 'studyConditions', 'visaConditions']) {
    if (out[k] != null && !Array.isArray(out[k])) out[k] = [];
  }
  return out;
}

/* ---------------------------------------------------------------- simulation */

const CONDITIONS = {
  8101: 'NO_WORK',
  8105: 'WORK_LIMITED_WHILE_COURSE_IN_SESSION',
  8201: 'MAX_3_MONTHS_STUDY',
  8202: 'MUST_MAINTAIN_ENROLMENT_ATTENDANCE_AND_PROGRESS',
  8547: 'MAX_6_MONTHS_WITH_ONE_EMPLOYER',
  8607: 'WORK_ONLY_IN_NOMINATED_OCCUPATION_FOR_SPONSOR',
};

const VISA_POOL = [
  { visaClass: 'TU', visaSubclass: '500', visaStream: 'Higher Education Sector', visaType: 'STUDENT_VISA', medicare: 'STUDENT_VISA', residence: 'TEMPORARY_RESIDENT', work: 'LIMITED', study: 'UNLIMITED', workConds: ['8105'], studyConds: ['8202'], educationSector: 'HIGHER_EDUCATION' },
  { visaClass: 'VA', visaSubclass: '485', visaStream: 'Post-Higher Education Work', visaType: 'TEMPORARY_RESIDENT', medicare: 'TEMPORARY_RESIDENT', residence: 'TEMPORARY_RESIDENT', work: 'UNLIMITED', study: 'UNLIMITED', workConds: [], studyConds: [] },
  { visaClass: 'GK', visaSubclass: '482', visaStream: 'Core Skills', visaType: 'TEMPORARY_RESIDENT', medicare: 'TEMPORARY_RESIDENT', residence: 'TEMPORARY_RESIDENT', work: 'LIMITED', study: 'UNLIMITED', workConds: ['8607'], studyConds: [] },
  { visaClass: 'SI', visaSubclass: '189', visaStream: 'Points-tested', visaType: 'PERMANENT_RESIDENT', medicare: 'PERMANENT_RESIDENT', residence: 'PERMANENT_RESIDENT', work: 'UNLIMITED', study: 'UNLIMITED', workConds: [], studyConds: [] },
  { visaClass: 'WH', visaSubclass: '417', visaStream: 'Working Holiday', visaType: 'TEMPORARY_RESIDENT', medicare: 'TEMPORARY_RESIDENT', residence: 'TEMPORARY_RESIDENT', work: 'LIMITED', study: 'LIMITED', workConds: ['8547'], studyConds: ['8201'] },
  { visaClass: 'FA', visaSubclass: '600', visaStream: 'Tourist', visaType: 'TEMPORARY_RESIDENT', medicare: 'TEMPORARY_RESIDENT', residence: 'TEMPORARY_RESIDENT', work: 'NIL', study: 'LIMITED', workConds: ['8101'], studyConds: ['8201'] },
];

/**
 * Build a SIMULATED response with only the fields the selected category
 * returns in the official contract. Deterministic per input, so the same
 * person yields the same demo result. Not real government data.
 */
function simulate(d, version) {
  const seed = hash(`${d.familyName}|${d.travelDocumentId}|${d.birthDate}`);
  const now = new Date();
  const day = (offset) => new Date(now.getTime() + offset * 864e5).toISOString().slice(0, 10);
  const v = VISA_POOL[seed % VISA_POOL.length];
  const onshore = seed % 2 === 0;
  const cond = (codes) => codes.map((c) => ({ conditionCode: c, conditionDescription: CONDITIONS[c] }));
  const permanent = v.visaType === 'PERMANENT_RESIDENT';
  const category = d.entitlementCategory;

  const data = {
    entitlementCategory: category,
    givenName: d.givenName || undefined,
    familyName: d.familyName,
    travelDocumentId: d.travelDocumentId,
    visaClass: v.visaClass,
    visaSubclass: v.visaSubclass,
    visaStream: v.visaStream,
    visaType: v.visaType,
    visaGrantDate: day(-(60 + (seed % 400))),
    visaExpiryDate: permanent ? undefined : day(120 + (seed % 600)),
    applicantRole: seed % 3 === 0 ? 'SECONDARY' : 'PRIMARY',
    location: onshore ? 'ONSHORE' : 'OFFSHORE',
    currentTimestamp: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };

  const add = (fields) => Object.assign(data, fields);
  switch (category) {
    case 'WORK_ENTITLEMENTS':
      add({ workEntitlementStatus: v.work, workConditions: cond(v.workConds) });
      break;
    case 'STUDY_ENTITLEMENTS':
      add({ studyEntitlementStatus: v.study, studyConditions: cond(v.studyConds), residenceStatus: v.residence, educationSector: v.educationSector });
      break;
    case 'MEDICARE_ELIGIBILITY':
      add({
        medicareEligibilityStatus: v.medicare,
        visaHolderIsOnshore: onshore,
        latestArrivalDate: permanent ? day(365) : undefined,
        permanentResidentVisaApplicant: false,
        ministerialInterventionPending: false,
        workEntitlementStatus: v.work,
        workConditions: cond(v.workConds),
      });
      break;
    case 'LICENSING_ELIGIBILITY':
      add({ workEntitlementStatus: v.work, workConditions: cond(v.workConds), residenceStatus: v.residence });
      break;
    case 'IMMIGRATION_STATUS':
      add({ immigrationStatus: v.residence, ministerialInterventionPending: false });
      break;
    case 'RESIDENCE_STATUS':
      add({ residenceStatus: v.residence });
      break;
    case 'REGISTERED_MIGRATION_AGENT':
    case 'LEGAL_PRACTITIONER':
      add({
        visaStatus: 'GRANTED',
        visaDescription: permanent ? 'PERMANENT' : 'TEMPORARY',
        visaGrantNumber: String(1e12 + (seed % 9e11)),
        entriesAllowed: 'M',
        periodOfStay: permanent ? 'I' : 'M12',
        enterBeforeDate: permanent ? day(365) : undefined,
        ministerialInterventionPending: false,
        visaConditions: cond([...v.workConds, ...v.studyConds]),
        workEntitlementStatus: v.work,
        studyEntitlementStatus: v.study,
      });
      break;
    default:
      break;
  }

  return {
    requestedCategory: category,
    checkedAt: now.toISOString(),
    rateLimit: null,
    data: JSON.parse(JSON.stringify(data)), // drop undefined fields
    notice: `SIMULATED RESULT (contract v${version}) — not connected to the live VEVO service and not real government data.`,
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
