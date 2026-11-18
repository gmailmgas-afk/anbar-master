/**
 * Font Size Cookie Manager for M-Gas Inventory
 * 
 * Manages per-user font size preferences for:
 * 1. Headings (h1, h2, h3, h4, h5, h6)
 * 2. Paragraphs (p)
 * 
 * Strict User Request Requirement:
 * - Persisted in browser cookies (document.cookie) per user
 * - Applied globally across all headings and paragraphs
 */

export interface FontSizePreferences {
  headingScale: number; // e.g. 0.85, 1.0, 1.15, 1.30
  paragraphScale: number; // e.g. 0.85, 1.0, 1.15, 1.30
  updatedAt?: string;
}

export const DEFAULT_FONT_PREFERENCES: FontSizePreferences = {
  headingScale: 1.0,
  paragraphScale: 1.0,
};

export const FONT_PRESETS = [
  { label: 'کوچک', scale: 0.85, badge: '۸۵٪' },
  { label: 'استاندارد', scale: 1.0, badge: '۱۰۰٪' },
  { label: 'بزرگ', scale: 1.15, badge: '۱۱۵٪' },
  { label: 'خیلی بزرگ', scale: 1.30, badge: '۱۳۰٪' }
];

const COOKIE_PREFIX = 'mgas_font_prefs_';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 365 days in seconds

/**
 * Normalizes user identifier for safe cookie key.
 */
function normalizeUserKey(userKey?: string): string {
  if (!userKey || !userKey.trim()) return 'default';
  return encodeURIComponent(userKey.trim().toLowerCase());
}

/**
 * Apply the scales to CSS variables on document.documentElement.
 */
export function applyFontScalesToDOM(prefs: FontSizePreferences): void {
  if (typeof document === 'undefined') return;
  try {
    const root = document.documentElement;
    const hScale = Math.min(2.0, Math.max(0.7, prefs.headingScale || 1.0));
    const pScale = Math.min(2.0, Math.max(0.7, prefs.paragraphScale || 1.0));

    root.style.setProperty('--heading-font-scale', hScale.toString());
    root.style.setProperty('--paragraph-font-scale', pScale.toString());
    root.setAttribute('data-heading-scale', Math.round(hScale * 100).toString());
    root.setAttribute('data-paragraph-scale', Math.round(pScale * 100).toString());
  } catch (err) {
    console.warn('[FontSizeCookie] Failed to apply styles to DOM:', err);
  }
}

import { safeGetCookie, safeSetCookie } from './browserCompatibility';

/**
 * Reads user font preferences strictly from document.cookie with memory fallback.
 */
export function getUserFontSizeFromCookie(userIdentifier?: string): FontSizePreferences {
  try {
    const key = normalizeUserKey(userIdentifier);
    const targetCookieName = `${COOKIE_PREFIX}${key}`;
    const defaultCookieName = `${COOKIE_PREFIX}default`;

    const raw = safeGetCookie(targetCookieName) || safeGetCookie(defaultCookieName);
    if (raw) {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.headingScale === 'number' && typeof parsed.paragraphScale === 'number') {
        const result: FontSizePreferences = {
          headingScale: Number(parsed.headingScale) || 1.0,
          paragraphScale: Number(parsed.paragraphScale) || 1.0,
          updatedAt: parsed.updatedAt
        };
        return result;
      }
    }
  } catch (err) {
    console.warn('[FontSizeCookie] Failed to read font cookie:', err);
  }
  return { ...DEFAULT_FONT_PREFERENCES };
}

/**
 * Saves user font preferences with 1-year persistence and memory fallback.
 */
export function saveUserFontSizeToCookie(
  prefs: FontSizePreferences,
  userIdentifier?: string
): void {
  try {
    const key = normalizeUserKey(userIdentifier);
    const cookieName = `${COOKIE_PREFIX}${key}`;
    const payload: FontSizePreferences = {
      headingScale: Number(prefs.headingScale.toFixed(2)),
      paragraphScale: Number(prefs.paragraphScale.toFixed(2)),
      updatedAt: new Date().toISOString()
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));

    safeSetCookie(cookieName, encoded, COOKIE_MAX_AGE);
    safeSetCookie(`${COOKIE_PREFIX}default`, encoded, COOKIE_MAX_AGE);

    // Immediately reflect to DOM
    applyFontScalesToDOM(payload);

    // Dispatch custom event for reactive UI updates across any open components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mgas:font_size_changed', { detail: payload }));
    }
  } catch (err) {
    console.warn('[FontSizeCookie] Failed to save font cookie:', err);
  }
}

/**
 * Initializes font scale on initial load or user change.
 */
export function initUserFontSize(userIdentifier?: string): FontSizePreferences {
  const prefs = getUserFontSizeFromCookie(userIdentifier);
  applyFontScalesToDOM(prefs);
  return prefs;
}
