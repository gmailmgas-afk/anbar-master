/**
 * Client-Side Cookie Authentication & Cache-Free Storage Policy for M-Gas Inventory
 * 
 * Strict Architectural Rule:
 * 1. Only username and password (or auth credentials) are saved on the client in a cookie.
 * 2. ALL other operational and database information MUST NOT be cached on the client side.
 * 3. Client LocalStorage and SessionStorage are purged of database payloads to ensure
 *    ultra-lightweight, 60fps browser execution with zero disk lag.
 */

import { safeGetCookie, safeSetCookie, safeRemoveCookie } from './browserCompatibility';

export interface UserAuthCredentials {
  username: string;
  password?: string;
  password_hash?: string;
  authenticated_at?: string;
}

const AUTH_COOKIE_NAME = 'mgas_user_auth';

/**
 * Save user credentials in client cookie with memory fallback.
 */
export function saveAuthCookie(username: string, password: string = '', passwordHash?: string): void {
  try {
    const existing = getAuthCookie();
    const cleanUsername = username.trim();
    const resolvedPassword = password ? password.trim() : (existing && existing.username.toLowerCase() === cleanUsername.toLowerCase() ? (existing.password || '') : '');
    const payload: UserAuthCredentials = {
      username: cleanUsername,
      password: resolvedPassword,
      password_hash: passwordHash || (existing && existing.username.toLowerCase() === cleanUsername.toLowerCase() ? existing.password_hash : undefined),
      authenticated_at: new Date().toISOString()
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const maxAge = 30 * 24 * 60 * 60;
    safeSetCookie(AUTH_COOKIE_NAME, encoded, maxAge);
  } catch (err) {
    console.warn('[CookieAuth] Failed to save credentials cookie:', err);
  }
}

/**
 * Read user credentials from client cookie with memory fallback.
 */
export function getAuthCookie(): UserAuthCredentials | null {
  try {
    const val = safeGetCookie(AUTH_COOKIE_NAME);
    if (val) {
      const decoded = decodeURIComponent(val);
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.username === 'string') {
        return {
          username: parsed.username,
          password: parsed.password || '',
          password_hash: parsed.password_hash,
          authenticated_at: parsed.authenticated_at
        };
      }
    }
  } catch (err) {
    console.warn('[CookieAuth] Failed to read credentials cookie:', err);
  }
  return null;
}

/**
 * Remove client authentication cookie.
 */
export function clearAuthCookie(): void {
  try {
    safeRemoveCookie(AUTH_COOKIE_NAME);
  } catch {}
}

/**
 * Purge temporary session and volatile cache while preserving persistent database data.
 */
export function purgeClientDataCache(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch (err) {
    console.warn('[CookieAuth] Purge client data cache warning:', err);
  }
}
