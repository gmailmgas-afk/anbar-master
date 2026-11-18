import { safeGetCookie, safeRemoveCookie, safeSetCookie } from './browserCompatibility';

const STORAGE_PREFIX = 'mgas_nav_state_';
const HASH_PARAM_TAB = 'tab';

/**
 * Safely read a persisted UI navigation value from URL hash (optional), sessionStorage, localStorage, and cookie fallback.
 */
export function readPersistedNavValue<T extends string>(
  key: string,
  allowedValues: readonly T[],
  fallback: T,
  options?: { hashParam?: string }
): T {
  if (typeof window === 'undefined') return fallback;

  const isAllowed = (val: string | null | undefined): val is T =>
    Boolean(val && (allowedValues as readonly string[]).includes(val));

  // 1. Check URL hash first if configured (e.g. #tab=invoices or #/invoices)
  if (options?.hashParam) {
    try {
      const rawHash = window.location.hash || '';
      if (rawHash.startsWith('#')) {
        const clean = rawHash.slice(1);
        if (clean.startsWith('/')) {
          const seg = clean.slice(1).split('?')[0].trim();
          if (isAllowed(seg)) return seg;
        } else {
          const params = new URLSearchParams(clean);
          const hashVal = params.get(options.hashParam);
          if (isAllowed(hashVal)) return hashVal;
        }
      }
    } catch {}
  }

  const storageKey = `${STORAGE_PREFIX}${key}`;

  // 2. Check sessionStorage
  try {
    const sVal = window.sessionStorage?.getItem(storageKey);
    if (isAllowed(sVal)) return sVal;
  } catch {}

  // 3. Check localStorage
  try {
    const lVal = window.localStorage?.getItem(storageKey);
    if (isAllowed(lVal)) return lVal;
  } catch {}

  // 4. Check cookie fallback
  try {
    const cVal = safeGetCookie(storageKey);
    if (isAllowed(cVal)) return cVal;
  } catch {}

  return fallback;
}

/**
 * Safely read an arbitrary non-empty string navigation state (like selected customer ID) without fixed enum allowlist.
 */
export function readPersistedNavString(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const storageKey = `${STORAGE_PREFIX}${key}`;

  try {
    const sVal = window.sessionStorage?.getItem(storageKey);
    if (sVal && sVal.trim()) return sVal;
  } catch {}

  try {
    const lVal = window.localStorage?.getItem(storageKey);
    if (lVal && lVal.trim()) return lVal;
  } catch {}

  try {
    const cVal = safeGetCookie(storageKey);
    if (cVal && cVal.trim()) return decodeURIComponent(cVal);
  } catch {}

  return fallback;
}

/**
 * Persist navigation state across page refreshes using URL hash (optional), sessionStorage, localStorage, and cookies.
 */
export function savePersistedNavValue(
  key: string,
  value: string,
  options?: { hashParam?: string; usePushState?: boolean }
): void {
  if (typeof window === 'undefined' || !value) return;
  const storageKey = `${STORAGE_PREFIX}${key}`;

  try {
    window.sessionStorage?.setItem(storageKey, value);
  } catch {}

  try {
    window.localStorage?.setItem(storageKey, value);
  } catch {}

  try {
    safeSetCookie(storageKey, encodeURIComponent(value), 30 * 24 * 60 * 60);
  } catch {}

  if (options?.hashParam) {
    try {
      const currentHash = window.location.hash || '';
      const clean = currentHash.startsWith('#') ? currentHash.slice(1) : '';
      const params = clean.startsWith('/') ? new URLSearchParams() : new URLSearchParams(clean);
      if (params.get(options.hashParam) !== value) {
        params.set(options.hashParam, value);
        const nextHash = `#${params.toString()}`;
        if (options.usePushState && window.history?.pushState) {
          window.history.pushState(null, '', nextHash);
        } else if (window.history?.replaceState) {
          window.history.replaceState(null, '', nextHash);
        } else {
          window.location.hash = nextHash;
        }
      }
    } catch {}
  }
}

/**
 * Clear all persisted navigation state (used exclusively on explicit logout).
 */
export function clearPersistedNavState(): void {
  if (typeof window === 'undefined') return;
  const keys = [
    'active_tab',
    'warehouse_sub_tab',
    'tri_sync_sub_tab',
    'gas_kardex_customer_id',
    'invoices_sub_tab',
    'reports_type_full',
    'reports_type_financial',
    'reports_party_scope_full',
    'reports_party_scope_financial'
  ];

  for (const k of keys) {
    const storageKey = `${STORAGE_PREFIX}${k}`;
    try {
      window.sessionStorage?.removeItem(storageKey);
    } catch {}
    try {
      window.localStorage?.removeItem(storageKey);
    } catch {}
    try {
      safeRemoveCookie(storageKey);
    } catch {}
  }

  try {
    if (window.location.hash && window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch {}
}

export { HASH_PARAM_TAB };
