/**
 * Tiny dependency-free JSON store for submissions (applications, SOP requests,
 * contact enquiries). Persists to server/data/db.json. This keeps the project
 * runnable anywhere with zero native dependencies; swap for a real database
 * (Postgres, etc.) in production.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'db.json');

const EMPTY = { applications: [], sops: [], contacts: [], eligibility: [] };

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
}

function read() {
  ensure();
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8'));
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

function write(db) {
  ensure();
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/**
 * Insert a record into a collection, stamping an id + timestamp + reference.
 */
export function insert(collection, record) {
  if (!EMPTY[collection]) throw new Error(`Unknown collection: ${collection}`);
  const db = read();
  const id = randomUUID();
  const reference = makeReference(collection);
  const row = { id, reference, createdAt: new Date().toISOString(), ...record };
  db[collection].push(row);
  write(db);
  return row;
}

export function all(collection) {
  return read()[collection] || [];
}

export function counts() {
  const db = read();
  return {
    applications: db.applications.length,
    sops: db.sops.length,
    contacts: db.contacts.length,
    eligibilityChecks: db.eligibility.length,
  };
}

function makeReference(collection) {
  const prefix = { applications: 'APP', sops: 'SOP', contacts: 'MSG', eligibility: 'ELG' }[collection] || 'REF';
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `${prefix}-${stamp}${rand}`;
}
