/**
 * Privacy, consent and data-rights helpers.
 *
 * - POLICY_VERSION is stamped on every consent record so we can show which
 *   policy text a person agreed to.
 * - Business identity comes from BUSINESS_* env vars (never hard-coded), and
 *   the ABN is checksum-validated.
 * - Self-service deletion requires BOTH the reference number and the email
 *   used, so knowing one alone is not enough to erase someone's data.
 * - Payout bank details are encrypted at rest with AES-256-GCM using
 *   DATA_ENCRYPTION_KEY; without a key they are not accepted at all.
 * - Records past RETENTION_DAYS (default 730) are purged automatically.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { all, insert, removeWhere, findOne, purgeOlderThan } from './store.js';

export const POLICY_VERSION = '2026-10-13';
export const ADULT_AGE = 18;

/* ---------------------------------------------------------------- business details */

export function isValidAbn(abn) {
  const digits = String(abn || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = digits
    .split('')
    .map(Number)
    .reduce((acc, d, i) => acc + (i === 0 ? d - 1 : d) * weights[i], 0);
  return sum % 89 === 0;
}

export function businessDetails() {
  const e = process.env;
  const abn = (e.BUSINESS_ABN || '').replace(/\s/g, '');
  const details = {
    tradingName: e.BUSINESS_TRADING_NAME || 'AusWise Migration',
    legalName: e.BUSINESS_LEGAL_NAME || '',
    abn: isValidAbn(abn) ? abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : '',
    address: e.BUSINESS_ADDRESS || '',
    email: e.BUSINESS_EMAIL || '',
    phone: e.BUSINESS_PHONE || '',
    jurisdiction: e.BUSINESS_JURISDICTION || '',
    privacyOfficer: e.PRIVACY_OFFICER_EMAIL || e.BUSINESS_EMAIL || '',
  };
  const missing = ['legalName', 'abn', 'address', 'email', 'jurisdiction'].filter((k) => !details[k]);
  if (abn && !details.abn) missing.push('abn (checksum failed)');
  return { ...details, complete: missing.length === 0, missing };
}

/* ---------------------------------------------------------------- consent */

/** Build a consent record, or return an error message if a required box is unticked. */
export function requireConsents(body, items) {
  for (const [field, message] of Object.entries(items)) {
    if (body?.[field] !== true) return { error: message };
  }
  return { consent: { policyVersion: POLICY_VERSION, at: new Date().toISOString(), items: Object.keys(items) } };
}

export function ageFromDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ''))) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/* ---------------------------------------------------------------- data rights */

// Collections holding applicant data and how to read the email on each row.
const PERSONAL_COLLECTIONS = {
  applications: (r) => r.email,
  contacts: (r) => r.email,
  questionnaireResponses: (r) => r.answers?.email,
  institutionLeads: (r) => r.email,
};

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Delete the record identified by reference, provided the email matches.
 * Returns the number of records removed (0 if no match).
 */
export function deleteByReference(reference, email) {
  const ref = String(reference || '').trim().toUpperCase();
  for (const [collection, emailOf] of Object.entries(PERSONAL_COLLECTIONS)) {
    const row = findOne(collection, { reference: ref });
    if (row && norm(emailOf(row)) === norm(email)) {
      return removeWhere(collection, { reference: ref });
    }
  }
  return 0;
}

export function recordPrivacyRequest({ type, email, reference, details }) {
  return insert('privacyRequests', { type, email, aboutReference: reference, details, status: 'open' });
}

/* ---------------------------------------------------------------- unsubscribe */

function unsubscribeSecret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.DATA_ENCRYPTION_KEY || PROCESS_SECRET;
}
const PROCESS_SECRET = randomBytes(32).toString('hex');

export function unsubscribeToken(email) {
  return createHmac('sha256', unsubscribeSecret()).update(norm(email)).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(email, token) {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function suppress(email) {
  const e = norm(email);
  if (!isSuppressed(e)) insert('suppressions', { email: e });
}

export function isSuppressed(email) {
  return Boolean(findOne('suppressions', { email: norm(email) }));
}

/* ---------------------------------------------------------------- encryption at rest */

function encryptionKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  return raw ? createHash('sha256').update(raw).digest() : null;
}

export function canEncrypt() {
  return Boolean(encryptionKey());
}

export function encrypt(obj) {
  const key = encryptionKey();
  if (!key) throw Object.assign(new Error('DATA_ENCRYPTION_KEY not set'), { code: 'NO_KEY' });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(blob) {
  const key = encryptionKey();
  const [ver, iv, tag, data] = String(blob || '').split(':');
  if (!key || ver !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- retention */

const RETAINED = ['applications', 'contacts', 'questionnaireResponses', 'institutionLeads', 'sops', 'eligibility', 'privacyRequests'];

export function retentionDays() {
  const n = Number(process.env.RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 730;
}

export function purgeExpired() {
  const cutoff = Date.now() - retentionDays() * 864e5;
  return RETAINED.reduce((sum, c) => sum + purgeOlderThan(c, cutoff), 0);
}

export function startRetentionJob() {
  purgeExpired();
  setInterval(purgeExpired, 24 * 3600 * 1000).unref();
}

export { all };
