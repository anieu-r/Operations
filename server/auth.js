/**
 * Minimal, dependency-free authentication for MARN agent accounts.
 *
 * - Passwords are hashed with scrypt (node:crypto) + per-user salt and compared
 *   timing-safely. Plaintext passwords are never stored or logged.
 * - Login issues a random 32-byte bearer token; only its SHA-256 digest is
 *   persisted (a leaked db.json does not leak usable tokens). Tokens expire
 *   after 7 days.
 *
 * This is intentionally simple and swappable for a managed IdP in production.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { insert, findOne, removeWhere } from './store.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hex] = String(stored || '').split(':');
    if (scheme !== 'scrypt' || !salt || !hex) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hex, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Issue a bearer token for an agent id. Returns the raw token (shown once). */
export function issueToken(agentId) {
  const token = randomBytes(32).toString('hex');
  insert('sessions', {
    tokenHash: digest(token),
    agentId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  return token;
}

/** Resolve a bearer token to an agentId, or null if invalid/expired. */
export function resolveToken(token) {
  if (!token) return null;
  const session = findOne('sessions', { tokenHash: digest(token) });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    removeWhere('sessions', { tokenHash: session.tokenHash });
    return null;
  }
  return session.agentId;
}

export function revokeToken(token) {
  if (!token) return 0;
  return removeWhere('sessions', { tokenHash: digest(token) });
}

export function bearerFrom(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function newId() {
  return randomUUID();
}
