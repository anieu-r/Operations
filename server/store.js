/**
 * Tiny dependency-free store for submissions (applications, SOP requests,
 * contact enquiries). Keeps an in-memory copy and best-effort persists to disk,
 * so it works everywhere — including read-only or ephemeral filesystems (e.g.
 * serverless/containers) where it simply falls back to memory-only for the
 * lifetime of the process.
 *
 * Persistence location can be overridden with DATA_DIR (defaults to
 * server/data). Swap for a real database (Postgres, etc.) in production.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? isAbsolute(process.env.DATA_DIR)
    ? process.env.DATA_DIR
    : resolve(process.cwd(), process.env.DATA_DIR)
  : join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'db.json');

const EMPTY = () => ({
  applications: [],
  sops: [],
  contacts: [],
  eligibility: [],
  agents: [],
  reviews: [],
  sessions: [],
  questionnaireResponses: [],
  institutionLeads: [],
});

let persistEnabled = true; // flips to false on first write failure
let memory = load();

function load() {
  try {
    if (existsSync(DB_PATH)) {
      const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8'));
      return { ...EMPTY(), ...parsed };
    }
  } catch {
    /* fall through to empty */
  }
  return EMPTY();
}

function persist() {
  if (!persistEnabled) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(memory, null, 2));
  } catch (err) {
    // Read-only / ephemeral FS — keep serving from memory and stop retrying.
    persistEnabled = false;
    console.warn(`[store] persistence disabled (memory-only): ${err.message}`);
  }
}

/**
 * Insert a record into a collection, stamping an id + timestamp + reference.
 */
export function insert(collection, record) {
  if (!memory[collection]) throw new Error(`Unknown collection: ${collection}`);
  const row = {
    id: randomUUID(),
    reference: makeReference(collection),
    createdAt: new Date().toISOString(),
    ...record,
  };
  memory[collection].push(row);
  persist();
  return row;
}

export function all(collection) {
  return memory[collection] || [];
}

export function counts() {
  return {
    applications: memory.applications.length,
    sops: memory.sops.length,
    contacts: memory.contacts.length,
    eligibilityChecks: memory.eligibility.length,
    agents: memory.agents.length,
    reviews: memory.reviews.length,
    questionnaires: memory.questionnaireResponses.length,
  };
}

/** Update the first record matching `where` with `patch`. Returns the updated row or null. */
export function update(collection, where, patch) {
  const rows = memory[collection] || [];
  const row = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  persist();
  return row;
}

export function findOne(collection, where) {
  return (memory[collection] || []).find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null;
}

export function removeWhere(collection, where) {
  const rows = memory[collection] || [];
  const keep = rows.filter((r) => !Object.entries(where).every(([k, v]) => r[k] === v));
  const removed = rows.length - keep.length;
  memory[collection] = keep;
  if (removed) persist();
  return removed;
}

function makeReference(collection) {
  const prefix =
    {
      applications: 'APP',
      sops: 'SOP',
      contacts: 'MSG',
      eligibility: 'ELG',
      agents: 'AGT',
      reviews: 'REV',
      sessions: 'SES',
      questionnaireResponses: 'QNR',
      institutionLeads: 'INS',
    }[collection] || 'REF';
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `${prefix}-${stamp}${rand}`;
}
