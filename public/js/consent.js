/* AusWise — browser storage consent.
   We set no cookies. localStorage is used for:
     essential: the storage choice itself, and an agent's login token (only when they log in)
     optional:  saving draft SOP and questionnaire answers on this device
   Optional storage only happens after the visitor chooses "Allow". */

export const CONSENT_KEY = 'auswise-storage-consent';
const OPTIONAL_PREFIXES = ['auswise-sop', 'auswise-apply-'];

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function storageChoice() {
  return safe(() => localStorage.getItem(CONSENT_KEY));
}

export function canStoreOptional() {
  return storageChoice() === 'all';
}

export function setStorageChoice(choice) {
  safe(() => localStorage.setItem(CONSENT_KEY, choice));
  if (choice !== 'all') clearOptional();
  document.dispatchEvent(new CustomEvent('auswise:consent', { detail: choice }));
}

export function clearOptional() {
  safe(() => {
    Object.keys(localStorage)
      .filter((k) => OPTIONAL_PREFIXES.some((p) => k.startsWith(p)))
      .forEach((k) => localStorage.removeItem(k));
  });
}

/** Read/write optional data — silently does nothing without consent. */
export function getOptional(key) {
  return canStoreOptional() ? safe(() => localStorage.getItem(key)) : null;
}
export function setOptional(key, value) {
  if (canStoreOptional()) safe(() => localStorage.setItem(key, value));
}
export function removeOptional(key) {
  safe(() => localStorage.removeItem(key));
}

export function optionalKeys() {
  return canStoreOptional()
    ? safe(() => Object.keys(localStorage).filter((k) => OPTIONAL_PREFIXES.some((p) => k.startsWith(p))), [])
    : [];
}
