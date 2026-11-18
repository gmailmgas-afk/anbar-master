/**
 * Universal Browser & Device Compatibility Engine for M-Gas Inventory
 * 
 * Provides universal polyfills and safe runtime shims for:
 * 1. Google Chrome (all versions: Chrome 49+, 58+, 80+, 100+, 110+, modern) on Windows 7, 10, 11
 * 2. Older and modern versions of Firefox, Safari, Edge, Opera, Samsung Internet
 * 3. Mobile browsers (Android WebView, Chrome Mobile, Safari iOS)
 * 4. Restricted environments (Private / Incognito mode, sandboxed iframes, cookies disabled)
 */

// 1. Polyfill globalThis
if (typeof globalThis === 'undefined') {
  try {
    (window as any).globalThis = window;
  } catch {}
}

// 2. Polyfill AbortSignal.timeout (Used across sync engine and login)
// Chrome added AbortSignal.timeout in v103. Older versions throw TypeError without this.
if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout !== 'function') {
  (AbortSignal as any).timeout = function(ms: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      } catch {
        try { controller.abort(); } catch {}
      }
    }, ms);
    // Do not hold Node process or worker if unref exists
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }
    return controller.signal;
  };
}

// 3. Polyfill Array.prototype.at (Chrome 92+)
if (!(Array.prototype as any).at) {
  (Array.prototype as any).at = function(n: number) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}

// 4. Polyfill String.prototype.replaceAll (Chrome 85+)
if (!(String.prototype as any).replaceAll) {
  (String.prototype as any).replaceAll = function(searchValue: any, replaceValue: any) {
    if (searchValue instanceof RegExp) {
      return this.replace(searchValue, replaceValue);
    }
    return this.split(String(searchValue)).join(String(replaceValue));
  };
}

// 5. Polyfill crypto.randomUUID (Safely handles Safari iOS WebKit Sealed/Read-Only object & Chrome < 92)
try {
  if (typeof window !== 'undefined') {
    if (!window.crypto) {
      try {
        Object.defineProperty(window, 'crypto', {
          value: {} as Crypto,
          configurable: true,
          writable: true
        });
      } catch {}
    }
    if (window.crypto && typeof (window.crypto as any).randomUUID !== 'function') {
      try {
        Object.defineProperty(window.crypto, 'randomUUID', {
          value: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
          },
          configurable: true,
          writable: true
        });
      } catch {
        try {
          (window.crypto as any).randomUUID = function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
          };
        } catch {}
      }
    }
  }
} catch {}

// 6. Safe In-Memory Storage Proxy when LocalStorage is blocked/disabled
// In Chrome on Windows, if third-party cookies or site data are blocked,
// accessing window.localStorage or window.sessionStorage throws a SecurityError.
const inMemoryStore: Record<string, string> = {};

function createMemoryStorage() {
  return {
    getItem(key: string): string | null {
      return inMemoryStore[key] !== undefined ? inMemoryStore[key] : null;
    },
    setItem(key: string, value: string): void {
      inMemoryStore[key] = String(value);
    },
    removeItem(key: string): void {
      delete inMemoryStore[key];
    },
    clear(): void {
      for (const k in inMemoryStore) {
        delete inMemoryStore[k];
      }
    },
    get length(): number {
      return Object.keys(inMemoryStore).length;
    },
    key(index: number): string | null {
      return Object.keys(inMemoryStore)[index] || null;
    }
  };
}

// Validate localStorage access; install in-memory proxy if access throws
let isLocalStorageUsable = false;
try {
  if (typeof window !== 'undefined') {
    const testKey = '__mgas_storage_probe__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isLocalStorageUsable = true;
  }
} catch {
  isLocalStorageUsable = false;
}

if (!isLocalStorageUsable && typeof window !== 'undefined') {
  try {
    const memStorage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      value: memStorage,
      configurable: true,
      writable: true
    });
  } catch {}
}

let isSessionStorageUsable = false;
try {
  if (typeof window !== 'undefined') {
    const testKey = '__mgas_session_probe__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    isSessionStorageUsable = true;
  }
} catch {
  isSessionStorageUsable = false;
}

if (!isSessionStorageUsable && typeof window !== 'undefined') {
  try {
    const memStorage = createMemoryStorage();
    Object.defineProperty(window, 'sessionStorage', {
      value: memStorage,
      configurable: true,
      writable: true
    });
  } catch {}
}

// 7. Safe Document Cookie Proxy when document.cookie is blocked
const inMemoryCookieJar: Record<string, string> = {};
let isCookieUsable = false;
try {
  if (typeof document !== 'undefined') {
    document.cookie = '__mgas_cookie_probe__=1; path=/; SameSite=Lax';
    if (document.cookie.indexOf('__mgas_cookie_probe__') !== -1) {
      isCookieUsable = true;
      document.cookie = '__mgas_cookie_probe__=; path=/; max-age=0; SameSite=Lax';
    }
  }
} catch {
  isCookieUsable = false;
}

export function safeGetCookie(name: string): string | null {
  if (typeof document === 'undefined') return inMemoryCookieJar[name] || null;
  try {
    const all = document.cookie.split(';');
    for (const c of all) {
      const trimmed = c.trim();
      if (trimmed.startsWith(`${name}=`)) {
        return trimmed.substring(name.length + 1);
      }
    }
  } catch {}
  return inMemoryCookieJar[name] || null;
}

export function safeSetCookie(name: string, value: string, maxAgeSeconds: number = 2592000): void {
  inMemoryCookieJar[name] = value;
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {}
}

export function safeRemoveCookie(name: string): void {
  delete inMemoryCookieJar[name];
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch {}
}

// 8. Polyfill ResizeObserver for older browsers & Recharts
if (typeof window !== 'undefined' && !(window as any).ResizeObserver) {
  (window as any).ResizeObserver = class {
    private callback: any;
    constructor(callback: any) {
      this.callback = callback;
    }
    observe(target: any) {
      // Trigger once on observe to satisfy charting components
      if (typeof this.callback === 'function') {
        try {
          const rect = target?.getBoundingClientRect?.() || { width: 400, height: 300, top: 0, left: 0 };
          this.callback([{ target, contentRect: rect }], this);
        } catch {}
      }
    }
    unobserve() {}
    disconnect() {}
  };
}

// 9. Polyfill requestIdleCallback
if (typeof window !== 'undefined' && !(window as any).requestIdleCallback) {
  (window as any).requestIdleCallback = function(cb: any) {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
      });
    }, 1);
  };
  (window as any).cancelIdleCallback = function(id: any) {
    clearTimeout(id);
  };
}

// 10. Safe window.matchMedia polyfill (Prevents crashes in older Chrome/Safari/WebViews)
try {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: function(query: string) {
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: function() {},
          removeListener: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        };
      }
    });
  }
} catch {}

// 11. Safe History API (Prevents SecurityError in Safari iOS/macOS & sandboxed iframes)
export function safePushState(state: any, title: string, url?: string | URL | null): void {
  try {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      window.history.pushState(state, title, url);
    }
  } catch (err) {
    console.warn('[SafeHistory] pushState safely caught:', err);
  }
}

export function safeReplaceState(state: any, title: string, url?: string | URL | null): void {
  try {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(state, title, url);
    }
  } catch (err) {
    console.warn('[SafeHistory] replaceState safely caught:', err);
  }
}

try {
  if (typeof window !== 'undefined' && window.history) {
    const origPush = window.history.pushState?.bind(window.history);
    const origReplace = window.history.replaceState?.bind(window.history);

    if (origPush) {
      window.history.pushState = function(state: any, title: string, url?: string | URL | null) {
        try {
          return origPush(state, title, url);
        } catch (err) {
          console.warn('[SafeHistory] Global pushState error trapped safely:', err);
        }
      };
    }

    if (origReplace) {
      window.history.replaceState = function(state: any, title: string, url?: string | URL | null) {
        try {
          return origReplace(state, title, url);
        } catch (err) {
          console.warn('[SafeHistory] Global replaceState error trapped safely:', err);
        }
      };
    }
  }
} catch {}

// 12. Auto-Unregister Stale Service Workers & Clean Corrupted Caches
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
} catch {}

export const compatibilityStatus = {
  isLocalStorageUsable,
  isSessionStorageUsable,
  isCookieUsable,
  isModernChrome: typeof window !== 'undefined' && /Chrome\/([0-9]+)/.test(navigator.userAgent),
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SERVER'
};
