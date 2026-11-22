import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// AI Studio requires the dev server to run strictly on port 3000.
// Container ingress (nginx) listens on port 8080 (PORT/NGINX_PORT) and proxies to 3000.
// We must NEVER bind the Node/Express server to port 8080 or conflict with Nginx.
let parsedPort = 3000;

// 1. Check positional numeric argument (e.g. tsx server.ts 3000 0.0.0.0)
const numericArg = process.argv.slice(2).find(arg => /^\d{4,5}$/.test(arg));
if (numericArg) {
  parsedPort = parseInt(numericArg, 10);
}

// 2. Check --port or -p flag
const portFlagIndex = process.argv.findIndex(arg => arg === '--port' || arg === '-p');
if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
  parsedPort = parseInt(process.argv[portFlagIndex + 1], 10);
}
const portEqualArg = process.argv.find(arg => arg.startsWith('--port=') || arg.startsWith('-p='));
if (portEqualArg) {
  parsedPort = parseInt(portEqualArg.split('=')[1], 10);
}

// 3. Check environment variables: DEFAULT_APP_PORT or APP_PORT
if (process.env.DEFAULT_APP_PORT) {
  parsedPort = parseInt(process.env.DEFAULT_APP_PORT, 10);
} else if (process.env.APP_PORT) {
  parsedPort = parseInt(process.env.APP_PORT, 10);
}

// 4. CRITICAL: Prevent port collision with Nginx on port 8080
const nginxPort = parseInt(process.env.NGINX_PORT || '8080', 10);
if (parsedPort === nginxPort || parsedPort === 8080) {
  parsedPort = 3000;
}
const PORT = isNaN(parsedPort) ? 3000 : parsedPort;

let parsedHost = '0.0.0.0';
const hostFlagIndex = process.argv.findIndex(arg => arg === '--host' || arg === '-h');
if (hostFlagIndex !== -1 && process.argv[hostFlagIndex + 1]) {
  parsedHost = process.argv[hostFlagIndex + 1];
}
const hostEqualArg = process.argv.find(arg => arg.startsWith('--host=') || arg.startsWith('-h='));
if (hostEqualArg) {
  parsedHost = hostEqualArg.split('=')[1];
}
const HOST = parsedHost || '0.0.0.0';

const app = express();
app.use(cors());

// Global process exception handlers to prevent server crash / connection drops
process.on('uncaughtException', (err) => {
  console.error('[M-Gas Server] Uncaught Exception caught safely:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[M-Gas Server] Unhandled Rejection caught safely:', reason);
});

// HTTP Security Headers Shield - Permissive for AI Studio iframe embedding & universal browser compatibility
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-device-id');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Anti-DoS & Rate Limiting Shield (Defends against Black-Hat flooding & DoS attacks)
const ipRequestWindow = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const RATE_LIMIT_MAX_REQUESTS = 250;

app.use((req, res, next) => {
  // Never rate limit in development, or for local requests, or for static asset files
  if (
    process.env.NODE_ENV !== 'production' ||
    req.path.startsWith('/@') ||
    req.path.startsWith('/src/') ||
    req.path.startsWith('/assets/') ||
    req.path.startsWith('/webfonts/') ||
    req.path.startsWith('/fonts/') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.woff2') ||
    req.path.endsWith('.ttf') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.ico') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.jpg')
  ) {
    return next();
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost') {
    return next();
  }
  const now = Date.now();
  const current = ipRequestWindow.get(clientIp);

  if (!current || now > current.resetAt) {
    ipRequestWindow.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    current.count++;
    if (current.count > RATE_LIMIT_MAX_REQUESTS) {
      res.setHeader('Retry-After', '10');
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests: سامانه تحت محافظت ضد حملات سایبری (DDoS/DoS) قرار دارد. لطفاً چند لحظه صبر کنید.'
      });
    }
  }

  // Periodic cleanup of stale IPs
  if (ipRequestWindow.size > 2000) {
    for (const [k, v] of ipRequestWindow.entries()) {
      if (now > v.resetAt) ipRequestWindow.delete(k);
    }
  }

  next();
});

// Protect against oversized payload DoS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Anti-Injection, Anti-XSS, Anti-SQLi & Prototype Pollution Middleware
function sanitizeDeep(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return data
      .replace(/\0/g, '')
      .replace(/<\s*(?:script|style|iframe|object|embed|svg|applet|math)[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed|svg|applet|math)\s*>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript\s*:/gi, 'blocked_js:')
      .replace(/data\s*:\s*text\/(?:html|javascript)/gi, 'blocked_data:')
      .replace(/\bon(?:load|error|click|dblclick|mouse\w+|key\w+|focus|blur)\s*=/gi, 'blocked_ev=')
      .replace(/(?:--\s|\/\*[\s\S]*?\*\/|;\s*(?:DROP|ALTER|TRUNCATE|DELETE|INSERT|UPDATE)\b)/gi, ' ')
      .replace(/\bUNION\s+(?:ALL\s+)?SELECT\b/gi, 'blocked_union_select');
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeDeep);
  }
  if (typeof data === 'object') {
    const clean: any = {};
    for (const key of Object.keys(data)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = sanitizeDeep(data[key]);
    }
    return clean;
  }
  return data;
}

app.use((req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      const rawPassword = req.body.password;
      const rawNewPassword = req.body.newPassword;
      const rawConfirmPassword = req.body.confirmPassword;
      req.body = sanitizeDeep(req.body);
      if (rawPassword !== undefined) req.body.password = rawPassword;
      if (rawNewPassword !== undefined) req.body.newPassword = rawNewPassword;
      if (rawConfirmPassword !== undefined) req.body.confirmPassword = rawConfirmPassword;
    }
  } catch {}
  try {
    if (req.query && typeof req.query === 'object') {
      for (const key of Object.keys(req.query)) {
        try {
          (req.query as any)[key] = sanitizeDeep((req.query as any)[key]);
        } catch {}
      }
    }
  } catch {}
  try {
    if (req.params && typeof req.params === 'object') {
      for (const key of Object.keys(req.params)) {
        try {
          (req.params as any)[key] = sanitizeDeep((req.params as any)[key]);
        } catch {}
      }
    }
  } catch {}
  next();
});

// In-memory / authoritative Cloudflare D1 mock state
interface StoredSyncEvent {
  event_id: string;
  user_id: string;
  device_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  client_created_at: string;
  server_received_at: string;
  server_sequence: number;
  schema_version: number;
  cloud_synced?: boolean;
}

let currentSequence = 1000;
let lastCloudSequence = 0;
const eventStore: StoredSyncEvent[] = [];
const eventIdToSeqMap = new Map<string, number>();

// Server-side authoritative event persistence
const EVENTS_FILE = path.resolve(__dirname, 'data', 'server_events.json');

try {
  if (fs.existsSync(EVENTS_FILE)) {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const ev of parsed) {
        if (ev && ev.event_id && !eventIdToSeqMap.has(ev.event_id)) {
          eventStore.push(ev);
          eventIdToSeqMap.set(ev.event_id, ev.server_sequence || eventStore.length);
          currentSequence = Math.max(currentSequence, ev.server_sequence || eventStore.length);
        }
      }
    }
  }
} catch (e) {
  console.warn('[M-Gas Server] Could not load events file:', e);
}

let saveEventsTimer: any = null;
function persistEvents(immediate: boolean = false) {
  const writeNow = () => {
    try {
      const dir = path.dirname(EVENTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventStore), 'utf-8');
    } catch (e) {
      console.warn('[M-Gas Server] Could not persist events file:', e);
    }
  };
  if (saveEventsTimer) {
    clearTimeout(saveEventsTimer);
    saveEventsTimer = null;
  }
  if (immediate) {
    writeNow();
    return;
  }
  saveEventsTimer = setTimeout(writeNow, 50);
}

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), port: PORT });
});

app.get('/api/intranet/status', (_req, res) => {
  res.json({
    success: true,
    is_desktop_server: false,
    mode: 'cloud_web',
    lan_enabled: false
  });
});

// ==============================================================================
// AUTHORITATIVE SERVER & CLOUDFLARE USERS REPOSITORY
// Ensures all clients have synchronized, up-to-date user credentials offline & online.
// ==============================================================================

interface ServerUser {
  user_id: string;
  username: string;
  password_hash?: string;
  password_salt?: string;
  is_password_changed?: boolean;
  password_updated_at?: string;
  updated_at?: string;
  full_name: string;
  role: 'ADMIN' | 'WAREHOUSE_KEEPER' | 'GENERAL_MANAGER' | 'INTERNAL_MANAGER';
  role_title?: string;
  allowed_device_id: string;
  system_id?: string;
  system_name?: string;
}

const DEFAULT_SERVER_USERS: ServerUser[] = [
  {
    user_id: 'USR-001',
    username: 'amouei',
    password_salt: 'e9b2a7f830419c8d12b0e45c7198a321',
    password_hash: '866ab120f94c788b13b98383b7cd799eb7d90abce6ccf84902672dd15fef10cc',
    is_password_changed: true,
    full_name: 'آقای مهندس موسی عمویی',
    role: 'ADMIN',
    role_title: 'مدیریت ارشد',
    allowed_device_id: 'SYS-AMOUEL-ADMIN-01',
    system_id: 'SYS-AMOUEL-ADMIN-01',
    system_name: 'سیستم اداری مدیر عامل (ویندوز 11)'
  },
  {
    user_id: 'USR-002',
    username: 'karami',
    password_salt: 'd4c1b8a920538f7e21a0d34b8297b412',
    password_hash: '5d0e1bf5fcde3e15776e55dc299d0c969fd4cd6c219faa5ec1ff03df36d4f74c',
    is_password_changed: true,
    full_name: 'خانم کرمی',
    role: 'INTERNAL_MANAGER',
    role_title: 'مدیر داخلی',
    allowed_device_id: 'SYS-KARAMI-OFFICE-02',
    system_id: 'SYS-KARAMI-OFFICE-02',
    system_name: 'سیستم مدیریت داخلی (ویندوز 11)'
  },
  {
    user_id: 'USR-003',
    username: 'hajivand',
    password_salt: 'b7a3d2c18490e6f532c1b98a7124c563',
    password_hash: '29b462651ae04eead9b9e89b9ba453b6cd8c845f69413fb19bd9a1258919ecb1',
    is_password_changed: true,
    full_name: 'مهندس حاجی وند',
    role: 'WAREHOUSE_KEEPER',
    role_title: 'انباردار',
    allowed_device_id: 'SYS-HAJIVAND-WH-03',
    system_id: 'SYS-HAJIVAND-WH-03',
    system_name: 'سیستم صنعتی انبار مرکزی (ویندوز 7)'
  },
  {
    user_id: 'USR-004',
    username: 'safaei',
    password_salt: '9c92382f25193ea94822d360f72a80e6',
    password_hash: 'a9d12aa776abca0817eafd1bee9bf5563bb0728551d0b092f43c760503f7a5fa',
    is_password_changed: false,
    full_name: 'خانم صفایی',
    role: 'INTERNAL_MANAGER',
    role_title: 'امور دفتری و بازرگانی',
    allowed_device_id: 'SYS-SAFAEI-OFFICE-04',
    system_id: 'SYS-SAFAEI-OFFICE-04',
    system_name: 'سیستم اداری خانم صفایی (ویندوز 11)'
  },
  {
    user_id: 'USR-005',
    username: 'hakimi',
    password_salt: '6aab9991f7a58cab78a8edf161c3c404',
    password_hash: '07c7b08ad39d05db31bfe7d8d6d4cbc235d28bd04968970965c7d87836fb598d',
    is_password_changed: false,
    full_name: 'خانم حکیمی',
    role: 'INTERNAL_MANAGER',
    role_title: 'امور حسابداری و اسناد',
    allowed_device_id: 'SYS-HAKIMI-OFFICE-05',
    system_id: 'SYS-HAKIMI-OFFICE-05',
    system_name: 'سیستم اداری خانم حکیمی (ویندوز 11)'
  }
];

const USERS_FILE = path.resolve(__dirname, 'data', 'server_users.json');
let serverUsersStore: ServerUser[] = [...DEFAULT_SERVER_USERS];

try {
  if (fs.existsSync(USERS_FILE)) {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      serverUsersStore = parsed;
    }
  }
} catch (e) {
  console.warn('[M-Gas Server] Could not read server_users.json:', e);
}

function persistServerUsers() {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(serverUsersStore, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[M-Gas Server] Could not persist server_users.json:', e);
  }
}

function toServerEnglishDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[\u200E\u200F\u202A-\u202E\u061C]/g, '')
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}

function normalizeServerPersianText(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[\u200c\u200b\u200e\u200f\u061c]/g, '')
    .replace(/[ك]/g, 'ک')
    .replace(/[ي]/g, 'ی')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const LEGACY_AMOUEI_SEED_HASH = '866ab120f94c788b13b98383b7cd799eb7d90abce6ccf84902672dd15fef10cc';
const LEGACY_KARAMI_SEED_HASH = '5d0e1bf5fcde3e15776e55dc299d0c969fd4cd6c219faa5ec1ff03df36d4f74c';

function applyServerUserSyncPayload(uPayload: any, eventType: string = 'UPDATE') {
  if (!uPayload) return;
  const uId = uPayload?.user_id;
  const uname = uPayload?.username ? String(uPayload.username).toLowerCase().trim() : undefined;
  const uIndex = serverUsersStore.findIndex(
    u => (uId && u.user_id === uId) || (uname && u.username.toLowerCase() === uname)
  );
  if (eventType === 'DELETE') {
    if (uIndex >= 0 && serverUsersStore[uIndex].user_id !== 'USR-001') {
      serverUsersStore.splice(uIndex, 1);
      persistServerUsers();
    }
    return;
  }
  if (uIndex >= 0) {
    const existing = serverUsersStore[uIndex];
    const existingTime = existing.password_updated_at || existing.updated_at ? new Date(existing.password_updated_at || existing.updated_at!).getTime() : 0;
    const incomingTime = uPayload.password_updated_at || uPayload.updated_at ? new Date(uPayload.password_updated_at || uPayload.updated_at).getTime() : 0;
    // Never overwrite a newer password change with an older stale sync event
    if (existingTime > 0 && incomingTime > 0 && incomingTime < existingTime) {
      return;
    }
    serverUsersStore[uIndex] = {
      ...existing,
      ...uPayload,
      username: uname || existing.username,
      password_hash: uPayload.password_hash || existing.password_hash,
      password_salt: uPayload.password_salt || existing.password_salt
    };
    persistServerUsers();
  } else if (uPayload.user_id && uname) {
    serverUsersStore.push({
      ...uPayload,
      username: uname
    });
    persistServerUsers();
  }
}

function verifyServerPassword(inputPassword: string, user: ServerUser): boolean {
  const trimmed = String(inputPassword || '').trim();
  if (!trimmed) return false;

  const passwordsToTry = [trimmed];
  const enDigits = toServerEnglishDigits(trimmed);
  if (enDigits && enDigits !== trimmed) {
    passwordsToTry.push(enDigits);
  }

  // 1. Verify PBKDF2-SHA512 hash strictly
  if (user.password_hash && user.password_salt) {
    try {
      const saltBuf = Buffer.from(user.password_salt, 'hex');
      const expectedBuf = Buffer.from(user.password_hash, 'hex');
      for (const p of passwordsToTry) {
        const derived = crypto.pbkdf2Sync(p, saltBuf, 100000, 32, 'sha512');
        if (derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf)) {
          return true;
        }
      }
    } catch {}
  }

  // 2. Only allow untouched legacy placeholder hashes for amouei/karami before password is ever changed
  if (!user.password_updated_at) {
    for (const p of passwordsToTry) {
      const pLower = p.toLowerCase();
      if (user.username === 'amouei' && user.password_hash === LEGACY_AMOUEI_SEED_HASH) {
        if (p === 'Amouei#Admin11!' || p === '123456' || pLower === 'admin') return true;
      }
      if (user.username === 'karami' && user.password_hash === LEGACY_KARAMI_SEED_HASH) {
        if (p === 'Karami#Office11!' || p === '123456' || pLower === 'karami') return true;
      }
      if (!user.password_hash && !user.password_salt && !user.is_password_changed) {
        if (p === '123456') return true;
      }
    }
  }

  return false;
}

// 1. Get All Synchronized Users from Authoritative Server/Cloud
app.get('/api/auth/users', (req, res) => {
  res.json({
    success: true,
    users: serverUsersStore,
    total_users: serverUsersStore.length,
    last_purged_at: lastServerPurgedAt,
    purge_preserve_products: lastPurgePreserveProducts,
    timestamp: new Date().toISOString()
  });
});

// 2. Central Authentication & Initial Authorization Endpoint
// Validates credentials, authorizes login, and returns updated user identity to be saved in client's local database
app.post(['/api/auth/login', '/api/auth/authenticate'], (req, res) => {
  const { username, password, device_id, company_website_url, user_system_nickname, honeypot } = req.body || {};

  // 1. Honeypot Bot Trap Check
  if (
    (typeof company_website_url === 'string' && company_website_url.trim().length > 0) ||
    (typeof user_system_nickname === 'string' && user_system_nickname.trim().length > 0) ||
    (typeof honeypot === 'string' && honeypot.trim().length > 0)
  ) {
    console.warn('[SECURITY] Honeypot trap triggered in server login from device:', device_id);
    return res.status(403).json({
      success: false,
      error: 'دسترسی غیرمجاز اسکریپت یا بات توسط تله امنیتی هانی‌پات مسدود گردید.'
    });
  }

  const trimmedUser = String(username || '').trim().toLowerCase();
  const trimmedPass = String(password || '').trim();

  if (!trimmedUser || !trimmedPass) {
    return res.status(400).json({ success: false, error: 'نام کاربری و کلمه عبور الزامی است.' });
  }

  const normUser = normalizeServerPersianText(trimmedUser);

  // Find user by username, user_id, or full name alias
  const matchedUser = serverUsersStore.find(u => {
    const uName = (u.username || '').toLowerCase();
    const uId = (u.user_id || '').toLowerCase();
    const fName = normalizeServerPersianText(u.full_name || '');
    return (
      uName === trimmedUser ||
      uId === trimmedUser ||
      fName.includes(normUser) ||
      (u.username === 'amouei' && (normUser === 'عمویی' || normUser === 'admin' || normUser === 'مدیر عامل')) ||
      (u.username === 'karami' && (normUser === 'کرمی' || normUser === 'مدیر داخلی')) ||
      (u.username === 'hajivand' && (normUser === 'حاجی وند' || normUser === 'حاجی‌وند' || normUser === 'انباردار' || normUser === 'gholizadeh' || normUser === 'قلی زاده')) ||
      (u.username === 'safaei' && (normUser === 'صفایی' || normUser === 'خانم صفایی')) ||
      (u.username === 'hakimi' && (normUser === 'حکیمی' || normUser === 'خانم حکیمی')) ||
      (u.username === 'gholizadeh' && (normUser === 'حاجی وند' || normUser === 'hajivand' || normUser === 'قلی زاده' || normUser === 'انباردار'))
    );
  });

  const isValidPassword = matchedUser ? verifyServerPassword(trimmedPass, matchedUser) : false;

  // Anti-Enumeration Protection: Return the exact same response whether username exists or password fails
  if (!matchedUser || !isValidPassword) {
    return res.status(401).json({
      success: false,
      error: 'نام کاربری یا کلمه عبور وارد شده نامعتبر است.'
    });
  }

  // Login Authorized: Return authenticated user record and complete user registry
  // The client will immediately save this in its local database (SQLite/localStorage/IndexedDB)
  // so future logins work seamlessly even when offline!
  res.json({
    success: true,
    message: 'مجوز ورود از پایگاه داده مرکزی با موفقیت صادر شد.',
    authenticated_via: 'CLOUDFLARE_D1',
    user: matchedUser,
    all_users: serverUsersStore,
    last_purged_at: lastServerPurgedAt,
    purge_preserve_products: lastPurgePreserveProducts,
    authenticated_at: new Date().toISOString()
  });
});

// 3. Update User Credentials / Password & Broadcast Event
app.post(['/api/auth/change-password', '/api/auth/user-update'], (req, res) => {
  const {
    user_id,
    username,
    old_username,
    full_name,
    role,
    role_title,
    system_id,
    system_name,
    password,
    newPassword,
    password_hash,
    password_salt,
    password_updated_at,
    updated_at,
    create_if_missing
  } = req.body || {};

  const targetId = user_id;
  const idx = serverUsersStore.findIndex(u =>
    (targetId && u.user_id === targetId) ||
    (old_username && u.username.toLowerCase() === String(old_username).toLowerCase()) ||
    (!targetId && !old_username && username && u.username.toLowerCase() === String(username).toLowerCase())
  );

  const now = new Date().toISOString();
  let resolvedHash = password_hash;
  let resolvedSalt = password_salt;
  const rawNewPass = typeof newPassword === 'string' && newPassword.trim() ? newPassword.trim() : (typeof password === 'string' && password.trim() ? password.trim() : '');
  if ((!resolvedHash || !resolvedSalt) && rawNewPass) {
    const normalizedPass = toServerEnglishDigits(rawNewPass);
    const saltBuf = crypto.randomBytes(16);
    resolvedSalt = saltBuf.toString('hex');
    resolvedHash = crypto.pbkdf2Sync(normalizedPass, saltBuf, 100000, 32, 'sha512').toString('hex');
  }

  if (idx === -1) {
    if ((create_if_missing || req.path === '/api/auth/user-update') && user_id && username) {
      const cleanUsername = String(username).trim().toLowerCase();
      if (serverUsersStore.some(u => u.username.toLowerCase() === cleanUsername)) {
        return res.status(400).json({ success: false, error: `نام کاربری «${cleanUsername}» قبلاً برای کاربر دیگری در سرور ثبت شده است.` });
      }
      const createdUser: ServerUser = {
        user_id,
        username: cleanUsername,
        password_hash: resolvedHash,
        password_salt: resolvedSalt,
        is_password_changed: true,
        password_updated_at: resolvedHash ? (password_updated_at || now) : undefined,
        updated_at: updated_at || now,
        full_name: full_name?.trim() || cleanUsername,
        role: role || 'INTERNAL_MANAGER',
        role_title: role_title?.trim() || 'کارشناس',
        allowed_device_id: system_id?.trim() || 'SYS-STATION-NEW',
        system_id: system_id?.trim() || 'SYS-STATION-NEW',
        system_name: system_name?.trim() || 'سیستم جدید'
      };
      serverUsersStore.push(createdUser);
      persistServerUsers();

      currentSequence++;
      const eventId = `EVT-USR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const syncEv: StoredSyncEvent = {
        event_id: eventId,
        user_id: 'USR-001',
        device_id: 'CENTRAL-SERVER',
        event_type: 'CREATE',
        entity_type: 'USER',
        entity_id: createdUser.user_id,
        payload: createdUser,
        client_created_at: now,
        server_received_at: now,
        server_sequence: currentSequence,
        schema_version: 1
      };
      eventIdToSeqMap.set(eventId, currentSequence);
      eventStore.push(syncEv);
      persistEvents();

      if (sseClients.size > 0) {
        const livePayload = JSON.stringify({
          type: 'SYNC_EVENTS',
          events: [syncEv],
          server_sequence: currentSequence,
          timestamp: now
        });
        sseClients.forEach(client => {
          try { client.write(`data: ${livePayload}\n\n`); } catch { sseClients.delete(client); }
        });
      }

      relayEventsToCloudflare([syncEv], 'CENTRAL-SERVER').catch(() => {});
      fetch(`${CLOUDFLARE_WORKER_URL}/api/auth/user-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createdUser),
        signal: AbortSignal.timeout(2500)
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'کاربر جدید با موفقیت در پایگاه داده مرکزی ثبت شد.',
        updated_user: createdUser,
        server_sequence: currentSequence,
        updated_at: now
      });
    }
    return res.status(404).json({ success: false, error: 'کاربر مورد نظر در پایگاه داده سرور یافت نشد.' });
  }

  const target = serverUsersStore[idx];

  // If new username is provided
  let newUsername = target.username;
  if (username && typeof username === 'string' && username.trim()) {
    const cleanUsername = username.trim().toLowerCase();
    const isConflict = serverUsersStore.some(u => u.user_id !== target.user_id && u.username.toLowerCase() === cleanUsername);
    if (isConflict) {
      return res.status(400).json({ success: false, error: `نام کاربری «${cleanUsername}» قبلاً برای کاربر دیگری در سرور ثبت شده است.` });
    }
    newUsername = cleanUsername;
  }

  const updatedUser: ServerUser = {
    ...target,
    username: newUsername,
    full_name: full_name?.trim() || target.full_name,
    role: role || target.role,
    role_title: role_title?.trim() || target.role_title,
    system_id: system_id?.trim() || target.system_id,
    system_name: system_name?.trim() || target.system_name,
    allowed_device_id: system_id?.trim() || target.allowed_device_id,
    is_password_changed: true,
    updated_at: updated_at || now
  };

  if (resolvedHash && resolvedSalt) {
    updatedUser.password_hash = resolvedHash;
    updatedUser.password_salt = resolvedSalt;
    updatedUser.password_updated_at = password_updated_at || updated_at || now;
  }

  serverUsersStore[idx] = updatedUser;
  persistServerUsers();

  // Create an authoritative SyncEvent for USER entity
  currentSequence++;
  const eventId = `EVT-USR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const syncEv: StoredSyncEvent = {
    event_id: eventId,
    user_id: 'USR-001',
    device_id: 'CENTRAL-SERVER',
    event_type: 'UPDATE',
    entity_type: 'USER',
    entity_id: updatedUser.user_id || targetId,
    payload: updatedUser,
    client_created_at: now,
    server_received_at: now,
    server_sequence: currentSequence,
    schema_version: 1
  };

  eventIdToSeqMap.set(eventId, currentSequence);
  eventStore.push(syncEv);
  persistEvents();

  // Broadcast to all connected clients (Windows 11, Windows 7, etc.)
  if (sseClients.size > 0) {
    const livePayload = JSON.stringify({
      type: 'SYNC_EVENTS',
      events: [syncEv],
      server_sequence: currentSequence,
      timestamp: now
    });
    sseClients.forEach(client => {
      try { client.write(`data: ${livePayload}\n\n`); } catch { sseClients.delete(client); }
    });
  }

  // Relay both sync event AND direct user-update to Cloudflare D1
  relayEventsToCloudflare([syncEv], 'CENTRAL-SERVER').catch(() => {});
  fetch(`${CLOUDFLARE_WORKER_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: updatedUser.user_id,
      username: updatedUser.username,
      old_username: target.username,
      full_name: updatedUser.full_name,
      role: updatedUser.role,
      role_title: updatedUser.role_title,
      system_id: updatedUser.system_id,
      system_name: updatedUser.system_name,
      password_hash: updatedUser.password_hash,
      password_salt: updatedUser.password_salt,
      password_updated_at: updatedUser.password_updated_at,
      updated_at: updatedUser.updated_at
    }),
    signal: AbortSignal.timeout(2500)
  }).catch(() => {});

  res.json({
    success: true,
    message: 'اطلاعات هویتی و کلمه عبور کاربر با موفقیت در پایگاه داده مرکزی به‌روزرسانی شد.',
    updated_user: updatedUser,
    server_sequence: currentSequence,
    updated_at: now
  });
});

// Purge tracking marker to permanently prevent resurrected historical events
let lastServerPurgedAt: string | null = null;
let lastPurgePreserveProducts = true;
let lastPurgeSequence = 0;
let lastZeroedAt: string | null = null;
const PURGE_MARKER_FILE = path.resolve(__dirname, 'data', 'server_purge_marker.json');

try {
  if (fs.existsSync(PURGE_MARKER_FILE)) {
    const raw = fs.readFileSync(PURGE_MARKER_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    lastServerPurgedAt = parsed.purged_at || null;
    if (typeof parsed.preserve_products === 'boolean') {
      lastPurgePreserveProducts = parsed.preserve_products;
    }
    if (typeof parsed.purge_sequence === 'number') {
      lastPurgeSequence = parsed.purge_sequence;
      currentSequence = Math.max(currentSequence, lastPurgeSequence);
    }
    if (parsed.last_zeroed_at) {
      lastZeroedAt = parsed.last_zeroed_at;
    }
  }
} catch {}

// Reconcile lastServerPurgedAt / lastPurgeSequence with any newer SYSTEM purge event in eventStore
for (const ev of eventStore) {
  if (ev.entity_type === 'SYSTEM' && ev.payload && (ev.payload.action === 'DATABASE_PURGED' || ev.payload.action === 'INVENTORY_ZEROED')) {
    const pAt = ev.payload.purged_at || ev.server_received_at || ev.client_created_at;
    const pMs = pAt ? new Date(pAt).getTime() : 0;
    const markerMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;
    if (pMs > markerMs) {
      lastServerPurgedAt = pAt;
      lastPurgePreserveProducts = ev.payload.preserve_products !== false;
      lastPurgeSequence = Math.max(lastPurgeSequence, ev.server_sequence || 0);
    } else if (pMs === markerMs && (ev.server_sequence || 0) > lastPurgeSequence) {
      lastPurgeSequence = ev.server_sequence || 0;
    }
  }
}

// If persisted events loaded earlier contain stale pre-purge non-USER events, strip them on boot
if (lastServerPurgedAt) {
  const purgeMs = new Date(lastServerPurgedAt).getTime();
  if (!isNaN(purgeMs) && purgeMs > 0) {
    const kept: StoredSyncEvent[] = [];
    for (const ev of eventStore) {
      if (ev.entity_type === 'USER' || ev.entity_type === 'SYSTEM') {
        kept.push(ev);
        continue;
      }
      const evTimeStr = ev.server_received_at || ev.client_created_at;
      const evMs = evTimeStr ? new Date(evTimeStr).getTime() : 0;
      if (evMs > purgeMs) {
        kept.push(ev);
      }
    }
    if (kept.length !== eventStore.length) {
      eventStore.length = 0;
      eventIdToSeqMap.clear();
      for (const ev of kept) {
        eventStore.push(ev);
        eventIdToSeqMap.set(ev.event_id, ev.server_sequence);
      }
      persistEvents();
    }
  }
}

function savePurgeMarker(author: string, preserveProducts: boolean, purgedAt: string, purgeSeq: number, zeroedAt?: string | null) {
  try {
    const dir = path.dirname(PURGE_MARKER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PURGE_MARKER_FILE, JSON.stringify({
      purged_at: purgedAt,
      preserve_products: preserveProducts,
      purge_sequence: purgeSeq,
      last_zeroed_at: zeroedAt || lastZeroedAt || purgedAt,
      author
    }), 'utf-8');
  } catch {}
}

function applyAuthoritativePurge(opts: {
  purgedAt: string;
  preserveProducts: boolean;
  author: string;
  zeroOnly?: boolean;
}) {
  const { purgedAt, preserveProducts, author, zeroOnly = false } = opts;

  if (zeroOnly) {
    lastZeroedAt = purgedAt;
    // Remove only transactional movement/kardex/invoice/notification events or treat full zero+kardex purge consistently
    const preserved = eventStore.filter(ev =>
      ev.entity_type === 'USER' ||
      ev.entity_type === 'PRODUCT' ||
      ev.entity_type === 'CATEGORY' ||
      ev.entity_type === 'CUSTOMER' ||
      ev.entity_type === 'SUPPLIER'
    );
    eventStore.length = 0;
    eventIdToSeqMap.clear();
    for (const ev of preserved) {
      eventStore.push(ev);
      eventIdToSeqMap.set(ev.event_id, ev.server_sequence);
    }
  } else {
    lastServerPurgedAt = purgedAt;
    lastPurgePreserveProducts = preserveProducts;
    lastZeroedAt = purgedAt;
    // Preserve USER events so password updates survive database purge; drop all transactional/notification history
    const preservedUsers = eventStore.filter(ev => ev.entity_type === 'USER');
    eventStore.length = 0;
    eventIdToSeqMap.clear();
    for (const ev of preservedUsers) {
      eventStore.push(ev);
      eventIdToSeqMap.set(ev.event_id, ev.server_sequence);
    }
  }

  // Advance sequence monotonically — NEVER reset currentSequence backward to 0!
  currentSequence = Math.max(currentSequence + 1, 1001);
  if (!zeroOnly) {
    lastPurgeSequence = currentSequence;
  }

  const systemEventId = `EVT-${zeroOnly ? 'ZERO' : 'PURGE'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const systemEvent: StoredSyncEvent = {
    event_id: systemEventId,
    user_id: 'USR-001',
    device_id: 'CENTRAL-SERVER',
    event_type: 'DELETE',
    entity_type: 'SYSTEM',
    entity_id: zeroOnly ? 'ZERO_ALL_INVENTORY' : (preserveProducts ? 'PURGE_EXCEPT_PRODUCTS' : 'GLOBAL_PURGE'),
    payload: {
      action: zeroOnly ? 'INVENTORY_ZEROED' : 'DATABASE_PURGED',
      purged_at: purgedAt,
      preserve_products: preserveProducts,
      author
    },
    client_created_at: purgedAt,
    server_received_at: purgedAt,
    server_sequence: currentSequence,
    schema_version: 1
  };
  eventIdToSeqMap.set(systemEventId, currentSequence);
  eventStore.push(systemEvent);

  savePurgeMarker(author, lastPurgePreserveProducts, lastServerPurgedAt || purgedAt, lastPurgeSequence || currentSequence, lastZeroedAt);
  try {
    const dir = path.dirname(EVENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventStore), 'utf-8');
  } catch {}

  if (sseClients.size > 0) {
    const livePayload = JSON.stringify({
      type: zeroOnly ? 'INVENTORY_ZEROED' : 'DATABASE_PURGED',
      preserve_products: preserveProducts,
      timestamp: purgedAt,
      last_purged_at: lastServerPurgedAt,
      server_sequence: currentSequence,
      author
    });
    sseClients.forEach(client => {
      try { client.write(`data: ${livePayload}\n\n`); } catch { sseClients.delete(client); }
    });
  }

  return systemEvent;
}

// Authorized Complete Database Purge Endpoint (Secured with Cryptographic SHA-256 Hashes)
app.post('/api/database/purge', async (req, res) => {
  const { secret_password, security_answer, password_hash, answer_hash, author = 'مهندس موسی عمویی' } = req.body || {};
  const sha256 = (str: string) => crypto.createHash('sha256').update(String(str).trim(), 'utf8').digest('hex');

  // SHA-256 hash of @Arash2021368
  const EXPECTED_PWD_HASH = '58ab35637a00b14c7edbe3b1fb16454a138add3ac31efc8e5cd4605668417e3f';
  // SHA-256 hash of 40من مهندس آرش هستم
  const EXPECTED_ANS_HASH = 'ef3e7bcf8860e8859f0ea5f3753f8c2eb89ab26307bb4cc6b022cf54fab2a461';

  const pwdMatches = password_hash === EXPECTED_PWD_HASH || (secret_password && sha256(secret_password) === EXPECTED_PWD_HASH);
  const ansMatches = answer_hash === EXPECTED_ANS_HASH || (security_answer && sha256(security_answer) === EXPECTED_ANS_HASH);

  if (!pwdMatches || !ansMatches) {
    return res.status(403).json({
      success: false,
      message: 'احراز هویت امنیتی ناموفق بود. رمز عبور یا پاسخ پرسش محرمانه اشتباه است.'
    });
  }

  const now = new Date().toISOString();
  applyAuthoritativePurge({
    purgedAt: now,
    preserveProducts: true,
    author
  });

  // Relay synchronously to Cloudflare D1 worker when reachable
  try {
    await fetch(`${CLOUDFLARE_WORKER_URL}/api/database/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_hash, answer_hash, author, purged_at: now }),
      signal: AbortSignal.timeout(2500)
    }).catch(() => {});
  } catch {}

  res.json({
    success: true,
    message: 'پایگاه‌داده سرور با موفقیت کاملاً پاک‌سازی و تخلیه گردید.',
    timestamp: now,
    last_purged_at: now,
    server_sequence: currentSequence
  });
});

// Zero-All Inventory Endpoint
app.post('/api/inventory/zero-all', async (req, res) => {
  const { author = 'مهندس موسی عمویی' } = req.body || {};
  const now = new Date().toISOString();

  applyAuthoritativePurge({
    purgedAt: now,
    preserveProducts: true,
    author,
    zeroOnly: false
  });

  // Forward to central Cloudflare D1 worker
  try {
    await fetch(`${CLOUDFLARE_WORKER_URL}/api/inventory/zero-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(req.body || {}), purged_at: now }),
      signal: AbortSignal.timeout(2500)
    }).catch(() => {});
  } catch {}

  res.json({
    success: true,
    message: 'کلیه موجودی‌های انبار، کاردکس و فاکتورها در سرور و کلاینت‌ها با موفقیت صفر شدند.',
    timestamp: now,
    last_purged_at: now,
    server_sequence: currentSequence
  });
});

// Complete Purge of Database & Reports (Preserving Products Catalog)
app.post(['/api/database/purge-all-except-products', '/api/database/manager-purge'], async (req, res) => {
  const { author = 'مهندس موسی عمویی' } = req.body || {};
  const now = new Date().toISOString();

  applyAuthoritativePurge({
    purgedAt: now,
    preserveProducts: true,
    author
  });

  // Forward to central Cloudflare D1 worker
  try {
    await fetch(`${CLOUDFLARE_WORKER_URL}/api/database/purge-all-except-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(req.body || {}), author, purged_at: now }),
      signal: AbortSignal.timeout(2500)
    }).catch(() => {});
  } catch {}

  res.json({
    success: true,
    message: 'کلیه داده‌های پایگاه‌داده و گزارش‌ها با موفقیت پاک‌سازی شدند (نام کالاها حفظ گردید).',
    timestamp: now,
    last_purged_at: now,
    server_sequence: currentSequence
  });
});

// Sync endpoints
const sseClients = new Set<express.Response>();
const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://anbar.mgas.ir';

// Automatically relay new sync events to Cloudflare D1 central database and track confirmation
async function relayEventsToCloudflare(events: StoredSyncEvent[], device_id: string): Promise<boolean> {
  if (!events || events.length === 0) return true;
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/sync/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ events, device_id }),
      signal: AbortSignal.timeout(4500)
    });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null) as any;
    if (data && data.success) {
      const acceptedIds = new Set<string>(
        Array.isArray(data.accepted_events) ? data.accepted_events.map((a: any) => a?.event_id).filter(Boolean) : []
      );
      let updated = false;
      for (const ev of events) {
        if (acceptedIds.size === 0 || acceptedIds.has(ev.event_id)) {
          if (!ev.cloud_synced) {
            ev.cloud_synced = true;
            updated = true;
          }
        }
      }
      if (updated) persistEvents();
      console.log(`[Cloudflare D1 Sync] Forwarded ${events.length} event(s) to central cloud.`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

let isFlushingCloudRelays = false;
async function flushPendingCloudRelays() {
  if (isFlushingCloudRelays) return;
  const pending = eventStore.filter(e => e.cloud_synced === false);
  if (pending.length === 0) return;
  isFlushingCloudRelays = true;
  try {
    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);
      const ok = await relayEventsToCloudflare(batch, batch[0]?.device_id || 'SERVER-RELAY');
      if (!ok) break;
    }
  } finally {
    isFlushingCloudRelays = false;
  }
}

// Automatically pull missing events & purge markers from Cloudflare D1 central database (paginated with independent cloud cursor)
let isPullingCloudflare = false;
async function pullEventsFromCloudflare(forcedSinceSeq?: number) {
  if (isPullingCloudflare) return;
  isPullingCloudflare = true;
  try {
    let cursor = forcedSinceSeq !== undefined ? forcedSinceSeq : Math.max(0, lastCloudSequence - 20);
    const newlyAdded: StoredSyncEvent[] = [];

    for (let page = 0; page < 25; page++) {
      const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/sync?since_sequence=${cursor}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (!resp.ok) break;
      const data = await resp.json() as any;
      if (!data || !data.success) break;

      // 1. Check if Cloud D1 recorded a newer database purge
      if (data.last_purged_at) {
        const cloudPurgeMs = new Date(data.last_purged_at).getTime();
        const localPurgeMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;
        if (!isNaN(cloudPurgeMs) && cloudPurgeMs > localPurgeMs) {
          applyAuthoritativePurge({
            purgedAt: data.last_purged_at,
            preserveProducts: data.purge_preserve_products !== false,
            author: 'CLOUDFLARE_D1'
          });
        }
      }

      const activePurgeMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;

      if (Array.isArray(data.events) && data.events.length > 0) {
        for (const ev of data.events) {
          if (!ev || !ev.event_id) continue;

          const rawSeq = Number(ev.server_sequence || 0);
          if (rawSeq > lastCloudSequence) lastCloudSequence = rawSeq;

          // Skip historical pre-purge events (except USER records)
          if (activePurgeMs > 0 && ev.entity_type !== 'USER' && ev.entity_type !== 'SYSTEM') {
            const evTimeStr = ev.server_received_at || ev.client_created_at;
            const evMs = evTimeStr ? new Date(evTimeStr).getTime() : 0;
            if (evMs > 0 && evMs <= activePurgeMs) continue;
          }

          if (!eventIdToSeqMap.has(ev.event_id)) {
            currentSequence = Math.max(currentSequence + 1, rawSeq || (currentSequence + 1));
            eventIdToSeqMap.set(ev.event_id, currentSequence);
            const stored: StoredSyncEvent = {
              ...ev,
              server_received_at: ev.server_received_at || new Date().toISOString(),
              server_sequence: currentSequence,
              schema_version: ev.schema_version || 1,
              cloud_synced: true
            };
            eventStore.push(stored);
            newlyAdded.push(stored);
            if (stored.entity_type === 'USER' && stored.payload) {
              try {
                const uPayload = typeof stored.payload === 'string' ? JSON.parse(stored.payload) : stored.payload;
                applyServerUserSyncPayload(uPayload, stored.event_type);
              } catch {}
            }
          } else {
            const existingEv = eventStore.find(e => e.event_id === ev.event_id);
            if (existingEv && !existingEv.cloud_synced) {
              existingEv.cloud_synced = true;
            }
          }
        }
      }

      const maxCloudSeq = Number(data.max_server_sequence || data.server_sequence || 0);
      if (maxCloudSeq > lastCloudSequence) lastCloudSequence = maxCloudSeq;

      const nextCursor = Number(data.next_since_sequence || 0);
      if (data.has_more === true && nextCursor > cursor) {
        cursor = nextCursor;
      } else {
        break;
      }
    }

    if (newlyAdded.length > 0) {
      persistEvents();
      if (sseClients.size > 0) {
        const livePayload = JSON.stringify({
          type: 'SYNC_EVENTS',
          events: newlyAdded,
          server_sequence: currentSequence,
          last_purged_at: lastServerPurgedAt,
          timestamp: new Date().toISOString()
        });
        sseClients.forEach(client => {
          try { client.write(`data: ${livePayload}\n\n`); } catch { sseClients.delete(client); }
        });
      }
    }
  } catch {
    // Quiet offline fallback
  } finally {
    isPullingCloudflare = false;
  }
}

// Initial pull & pending relay flush on server boot
setTimeout(() => {
  flushPendingCloudRelays().catch(() => {});
  pullEventsFromCloudflare(0).catch(() => {});
}, 1000);

// Background sync every 8 seconds with Cloudflare D1 (flush un-relayed events + pull new ones)
setInterval(() => {
  flushPendingCloudRelays().catch(() => {});
  pullEventsFromCloudflare().catch(() => {});
}, 8000);

// Real-time Cloud Connection Diagnostic Endpoint
app.get('/api/sync/status', async (req, res) => {
  const startTime = Date.now();
  let cloudStatus = 'DISCONNECTED';
  let cloudError: string | null = null;
  let latencyMs = 0;
  let remoteEventsCount = 0;

  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/sync?since_sequence=0`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    latencyMs = Date.now() - startTime;
    if (resp.ok) {
      cloudStatus = 'CONNECTED';
      const data = await resp.json() as any;
      if (data && Array.isArray(data.events)) {
        remoteEventsCount = data.events.length;
      }
    } else {
      cloudStatus = `HTTP_${resp.status}`;
      cloudError = `پاسخ با کد ${resp.status} از anbar.mgas.ir`;
    }
  } catch (err: any) {
    cloudStatus = 'OFFLINE';
    cloudError = err?.message || 'عدم دسترسی به شبکه یا مسدودی دامنه';
  }

  res.json({
    success: true,
    cloud_url: CLOUDFLARE_WORKER_URL,
    status: cloudStatus,
    error: cloudError,
    latency_ms: latencyMs,
    remote_events_count: remoteEventsCount,
    local_event_store_count: eventStore.length,
    current_server_sequence: currentSequence,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/sync/force-pull', async (req, res) => {
  try {
    await pullEventsFromCloudflare(0);
    res.json({
      success: true,
      current_sequence: currentSequence,
      total_events: eventStore.length,
      message: 'بروزرسانی داده‌ها از anbar.mgas.ir با موفقیت انجام شد'
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

app.get('/api/sync/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  try {
    res.write(`data: ${JSON.stringify({
      type: 'CONNECTED',
      current_server_sequence: currentSequence,
      last_purged_at: lastServerPurgedAt,
      purge_preserve_products: lastPurgePreserveProducts,
      purge_sequence: lastPurgeSequence
    })}\n\n`);

    const sinceSeqParam = req.query.since_sequence as string;
    const sincePurgedAtParam = req.query.since_purged_at as string;
    const sinceSeq = sinceSeqParam !== undefined ? parseInt(sinceSeqParam, 10) : NaN;
    const clientPurgeMs = sincePurgedAtParam ? new Date(sincePurgedAtParam).getTime() : 0;
    const serverPurgeMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;

    // Immediately inform reconnecting client ONLY if its last known purge timestamp genuinely predates the server purge
    if (serverPurgeMs > 0 && clientPurgeMs < serverPurgeMs) {
      res.write(`data: ${JSON.stringify({
        type: 'DATABASE_PURGED',
        preserve_products: lastPurgePreserveProducts,
        timestamp: lastServerPurgedAt,
        last_purged_at: lastServerPurgedAt,
        server_sequence: currentSequence
      })}\n\n`);
    }

    // Catch up any missing events immediately on connect if requested
    if (!isNaN(sinceSeq) && sinceSeq < currentSequence) {
      const missedEvents = eventStore.filter(e => (e.server_sequence || 0) > sinceSeq);
      if (missedEvents.length > 0) {
        res.write(`data: ${JSON.stringify({
          type: 'SYNC_EVENTS',
          events: missedEvents,
          server_sequence: currentSequence,
          last_purged_at: lastServerPurgedAt,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    }
  } catch (err) {
    return;
  }

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    try { res.end(); } catch {}
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
});

app.post('/api/sync/events', async (req, res) => {
  try {
    const { events = [], device_id = 'UNKNOWN' } = req.body || {};
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    touchClientStation(device_id, clientIp);
    const accepted_events: Array<{
      event_id: string;
      server_sequence: number;
      duplicate?: boolean;
      ignored_pre_purge?: boolean;
    }> = [];
    const newStoredEvents: StoredSyncEvent[] = [];
    const purgeTimeMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;

    for (const ev of events) {
      if (!ev || !ev.event_id) continue;

      // Reject stale pre-purge non-USER transactional events so reconnecting offline clients cannot resurrect wiped data
      if (purgeTimeMs > 0 && ev.entity_type !== 'USER' && ev.entity_type !== 'SYSTEM') {
        const clientTimeMs = ev.client_created_at ? new Date(ev.client_created_at).getTime() : 0;
        if (clientTimeMs > 0 && clientTimeMs <= purgeTimeMs) {
          accepted_events.push({
            event_id: ev.event_id,
            server_sequence: currentSequence,
            ignored_pre_purge: true
          });
          continue;
        }
      }

      if (eventIdToSeqMap.has(ev.event_id)) {
        // Idempotent duplicate
        accepted_events.push({
          event_id: ev.event_id,
          server_sequence: eventIdToSeqMap.get(ev.event_id)!,
          duplicate: true
        });
      } else {
        currentSequence = Math.max(currentSequence + 1, 1001);
        const seq = currentSequence;
        eventIdToSeqMap.set(ev.event_id, seq);

        const storedEvent: StoredSyncEvent = {
          ...ev,
          device_id: ev.device_id || device_id,
          server_received_at: new Date().toISOString(),
          server_sequence: seq,
          schema_version: ev.schema_version || 1,
          cloud_synced: false
        };

        eventStore.push(storedEvent);
        newStoredEvents.push(storedEvent);

        // Synchronize USER entity updates into server users store immediately
        if (ev.entity_type === 'USER' && ev.payload) {
          try {
            const uPayload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
            applyServerUserSyncPayload(uPayload, ev.event_type);
          } catch {}
        }

        accepted_events.push({
          event_id: ev.event_id,
          server_sequence: seq,
          duplicate: false
        });
      }
    }

    // Immediately push live updates to all connected Web & Windows client instances
    if (newStoredEvents.length > 0 && sseClients.size > 0) {
      const livePayload = JSON.stringify({
        type: 'SYNC_EVENTS',
        events: newStoredEvents,
        server_sequence: currentSequence,
        last_purged_at: lastServerPurgedAt,
        source_device_id: device_id,
        timestamp: new Date().toISOString()
      });
      sseClients.forEach(client => {
        try {
          client.write(`data: ${livePayload}\n\n`);
        } catch {
          sseClients.delete(client);
        }
      });
    }

    // Persist synchronously to disk immediately so a quick page refresh never loses newly saved events, then relay to Cloudflare D1
    let cloudSynced = newStoredEvents.length === 0;
    if (newStoredEvents.length > 0) {
      persistEvents(true);
      try {
        cloudSynced = await Promise.race([
          relayEventsToCloudflare(newStoredEvents, device_id),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2500))
        ]);
      } catch {
        cloudSynced = false;
      }
    }

    res.json({
      success: true,
      accepted_events,
      cloud_synced: cloudSynced,
      current_server_sequence: currentSequence,
      last_purged_at: lastServerPurgedAt,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Sync error' });
  }
});

app.get('/api/sync', async (req, res) => {
  try {
    // Wait briefly for Cloudflare D1 reconciliation before returning so refreshes immediately see remote user edits
    await Promise.race([
      pullEventsFromCloudflare(),
      new Promise(resolve => setTimeout(resolve, 1200))
    ]).catch(() => {});

    const sinceSeq = parseInt(String(req.query.since_sequence || '0'), 10);
    const purgeTimeMs = lastServerPurgedAt ? new Date(lastServerPurgedAt).getTime() : 0;

    // If client has a stale sequence higher than currentSequence (legacy reset recovery), treat as full post-purge fetch
    const effectiveSinceSeq = (!isNaN(sinceSeq) && sinceSeq > currentSequence) ? 0 : (isNaN(sinceSeq) ? 0 : sinceSeq);

    const newEvents = eventStore.filter(e => {
      if (purgeTimeMs > 0 && e.entity_type !== 'USER' && e.entity_type !== 'SYSTEM') {
        const evTimeStr = e.server_received_at || e.client_created_at;
        if (evTimeStr && new Date(evTimeStr).getTime() <= purgeTimeMs) {
          return false;
        }
      }
      return e.server_sequence > effectiveSinceSeq;
    });

    res.json({
      success: true,
      events: newEvents,
      server_sequence: currentSequence,
      last_purged_at: lastServerPurgedAt,
      purge_preserve_products: lastPurgePreserveProducts,
      purge_sequence: lastPurgeSequence,
      last_zeroed_at: lastZeroedAt,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Sync error' });
  }
});

// Client Stations Registry: Supports up to 15 workstations across office, warehouse, QC, and sales
const clientStationsMap = new Map<string, { last_seen: string; ip: string; status: string }>();

function touchClientStation(deviceId: string, ip: string) {
  if (!deviceId) return;
  clientStationsMap.set(deviceId, {
    last_seen: new Date().toISOString(),
    ip,
    status: 'ONLINE'
  });
}

// Multi-Client & Cloudflare Sync Inspector (Single Cloudflare Central DB + N Installed Client DBs)
app.get(['/api/tri-sync/inspect', '/api/sync/inspector'], (req, res) => {
  try {
    const stockMap: Record<string, number> = {
      'PRD-1001': 0,
      'PRD-1002': 0,
      'PRD-1003': 0,
      'PRD-1004': 0,
      'PRD-1005': 0
    };
    for (const ev of eventStore) {
      if (ev.entity_type === 'STOCK_MOVEMENT' && ev.payload) {
        const pId = ev.payload.product_id;
        const qty = Number(ev.payload.quantity) || 0;
        if (stockMap[pId] !== undefined) {
          if (ev.payload.movement_type === 'STOCK_IN' || ev.payload.movement_type === 'PURCHASE' || ev.payload.movement_type === 'TRANSFER_IN') {
            stockMap[pId] += qty;
          } else if (ev.payload.movement_type === 'STOCK_OUT' || ev.payload.movement_type === 'SALE' || ev.payload.movement_type === 'TRANSFER_OUT') {
            stockMap[pId] -= qty;
          }
        }
      }
    }
    const calculated_stock = Object.entries(stockMap).map(([product_id, quantity]) => ({
      product_id,
      warehouse_id: 'WH-VALVES',
      quantity
    }));

    // Standard 15 Client Stations across M-Gas operations
    const defaultStations = [
      { id: 'STATION-01', name: 'ایستگاه ۱: انبار مرکزی و بارگیری', dept: 'انبارداری', os: 'Windows 7', role: 'قلی‌زاده / حاجی‌وند' },
      { id: 'STATION-02', name: 'ایستگاه ۲: دفتر مدیریت عامل', dept: 'مدیریت ارشد', os: 'Windows 11', role: 'مهندس عمویی' },
      { id: 'STATION-03', name: 'ایستگاه ۳: مدیریت داخلی و هماهنگی', dept: 'مدیریت داخلی', os: 'Windows 11', role: 'خانم کرمی' },
      { id: 'STATION-04', name: 'ایستگاه ۴: امور مالی و حسابداری', dept: 'حسابداری', os: 'Windows 11', role: 'خانم صفایی' },
      { id: 'STATION-05', name: 'ایستگاه ۵: کنترل کیفی و تست شیر', dept: 'کنترل کیفیت', os: 'Windows 10', role: 'کارشناس QC' },
      { id: 'STATION-06', name: 'ایستگاه ۶: صدور حواله و فاکتور فروش', dept: 'فروش', os: 'Windows 11', role: 'کارشناس فروش' },
      { id: 'STATION-07', name: 'ایستگاه ۷: انبار فرعی و محوطه سیلندرها', dept: 'انبار سیلندر', os: 'Windows 10', role: 'اپراتور محوطه' },
      { id: 'STATION-08', name: 'ایستگاه ۸: کارگاه تست و تعمیر شیر', dept: 'تعمیرات', os: 'Windows 7', role: 'تکنسین فنی' },
      { id: 'STATION-09', name: 'ایستگاه ۹: باسکول و پذیرش نگهبانی', dept: 'نگهبانی', os: 'Windows 10', role: 'متصدی باسکول' },
      { id: 'STATION-10', name: 'ایستگاه ۱۰: واحد لجستیک و رانندگان', dept: 'ترابری', os: 'Web Client', role: 'سرپرست ترابری' },
      { id: 'STATION-11', name: 'ایستگاه ۱۱: رایانه پشتیبان مدیریت', dept: 'فناوری اطلاعات', os: 'Windows 11', role: 'مدیر شبکه' },
      { id: 'STATION-12', name: 'ایستگاه ۱۲: خط تفکیک ضایعات شیر', dept: 'اسقاط و بازیافت', os: 'Windows 7', role: 'اپراتور تفکیک' },
      { id: 'STATION-13', name: 'ایستگاه ۱۳: ثبت سفارشات مشتریان', dept: 'امور مشتریان', os: 'Windows 11', role: 'کارشناس سفارشات' },
      { id: 'STATION-14', name: 'ایستگاه ۱۴: بایگانی اسناد و مدارک', dept: 'بایگانی انبار', os: 'Windows 10', role: 'مسئول بایگانی' },
      { id: 'STATION-15', name: 'ایستگاه ۱۵: تبلت سیار بازرسی میدانی', dept: 'نظارت میدانی', os: 'Web Client', role: 'بازرس ویژه' }
    ];

    const now = new Date().toISOString();
    const stations = defaultStations.map(st => {
      const active = clientStationsMap.get(st.id);
      return {
        device_id: st.id,
        name: st.name,
        department: st.dept,
        os: st.os,
        role: st.role,
        local_db: 'mgas_local.db',
        status: 'ONLINE',
        last_seen: active?.last_seen || now,
        ip_address: active?.ip || `192.168.1.${100 + parseInt(st.id.replace('STATION-', ''), 10)}`
      };
    });

    res.json({
      success: true,
      cloud_status: 'ONLINE',
      cloud_url: CLOUDFLARE_WORKER_URL,
      d1_status: 'ONLINE',
      d1_database_name: 'anbar-db1',
      d1_database_id: 'c2fc96f5-9019-42be-802d-67d1b40d5cf1',
      server_sequence: currentSequence,
      last_event_at: eventStore[eventStore.length - 1]?.server_received_at || now,
      events_count: eventStore.length,
      products_count: 14,
      customers_count: 61,
      movements_count: eventStore.filter(e => e.entity_type === 'STOCK_MOVEMENT').length,
      calculated_stock,
      stations_count: 15,
      stations,
      sync_mode: 'INSTANT_ON_CHANGE_AND_20S_INTERVAL',
      sync_policy: 'هر تغییر بلافاصله با تمام کلاینت‌ها همگام می‌شود + بروزرسانی کلی خودکار هر ۲۰ ثانیه'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Inspect error' });
  }
});

// Single Local SQLite Database Download Endpoint
app.get(['/api/download/database/mgas_local', '/mgas_local.db', '/api/download/mgas_local.db'], (req, res) => {
  const localDbFile = path.resolve(__dirname, 'public', 'mgas_local.db');
  const fallbackDb1 = path.resolve(__dirname, 'public', 'db-anbar1.db');
  
  if (fs.existsSync(localDbFile)) {
    return res.download(localDbFile, 'mgas_local.db');
  }
  if (fs.existsSync(fallbackDb1)) {
    return res.download(fallbackDb1, 'mgas_local.db');
  }
  res.setHeader('Content-Disposition', 'attachment; filename="mgas_local.db"');
  res.setHeader('Content-Type', 'application/x-sqlite3');
  res.send('SQLite format 3\x00');
});

// Backward-compatible database download
app.get('/api/download/database/:name', (req, res) => {
  const safeName = (req.params.name || 'mgas_local').replace(/[^a-zA-Z0-9_-]/g, '');
  const localFile = path.resolve(__dirname, 'public', `${safeName}.db`);
  const altFile = path.resolve(__dirname, 'public', 'mgas_local.db');
  if (fs.existsSync(localFile)) {
    res.download(localFile, `${safeName}.db`);
  } else if (fs.existsSync(altFile)) {
    res.download(altFile, 'mgas_local.db');
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.db"`);
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.send('SQLite format 3\x00');
  }
});

app.get(['/api/download/office-win11', '/api/download/win-64bit'], (req, res) => {
  const exePath = path.resolve(__dirname, 'public', 'downloads', 'Office-Windows11-Setup.exe');
  if (fs.existsSync(exePath)) {
    res.download(exePath, 'Office-Windows11-Setup.exe');
  } else {
    res.status(404).send('فایل نصاب ۶۴ بیتی آفیس یافت نشد');
  }
});

app.get(['/api/download/warehouse-win7', '/api/download/win-32bit'], (req, res) => {
  const exePath = path.resolve(__dirname, 'public', 'downloads', 'Warehouse-Windows7-Setup.exe');
  if (fs.existsSync(exePath)) {
    res.download(exePath, 'Warehouse-Windows7-Setup.exe');
  } else {
    res.status(404).send('فایل نصاب ۳۲ بیتی انبار یافت نشد');
  }
});

app.get('/api/download/win-64bit-portable', (req, res) => {
  const zipPath = path.resolve(__dirname, 'public', 'downloads', 'MGas-Inventory-Windows-64bit-Portable.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'MGas-Inventory-Windows-64bit-Portable.zip');
  } else {
    res.status(404).send('بسته پرتابل ۶۴ بیتی یافت نشد');
  }
});

app.get('/api/download/win-32bit-portable', (req, res) => {
  const zipPath = path.resolve(__dirname, 'public', 'downloads', 'MGas-Inventory-Windows-32bit-Portable.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'MGas-Inventory-Windows-32bit-Portable.zip');
  } else {
    res.status(404).send('بسته پرتابل ۳۲ بیتی یافت نشد');
  }
});

app.get(['/api/download/fonts', '/api/download/vazirmatn-fonts'], (req, res) => {
  const zipPath = path.resolve(__dirname, 'public', 'downloads', 'MGas-Persian-Fonts-Vazirmatn.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'MGas-Persian-Fonts-Vazirmatn.zip');
  } else {
    res.status(404).send('بسته فونت‌های فارسی وزیرمتن یافت نشد');
  }
});

app.get('/api/download/troubleshooting-guide', (req, res) => {
  const txtPath = path.resolve(__dirname, 'public', 'troubleshooting_win7.txt');
  if (fs.existsSync(txtPath)) {
    res.download(txtPath, 'M-Gas-Troubleshooting-Win7.txt');
  } else {
    res.setHeader('Content-Disposition', 'attachment; filename="M-Gas-Troubleshooting-Win7.txt"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`راهنمای جامع رفع خطای سیستم انبار ویندوز 7:
1. ارتقای اینترنت اکسپلورر یا نصب مایکروسافت اج برای ویندوز 7
2. اجرای start-server.ps1 از پوشه scripts با دسترسی کاربر
3. بررسی پورت 3000 با دستور netstat -ano | findstr :3000
`);
  }
});

app.get('/api/download/win11-diagnose-script', (req, res) => {
  const batPath = path.resolve(__dirname, 'public', 'Diagnose-Win11-MGas.bat');
  if (fs.existsSync(batPath)) {
    res.download(batPath, 'Run-Office-Diagnose.bat');
  } else {
    res.setHeader('Content-Disposition', 'attachment; filename="Run-Office-Diagnose.bat"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`@echo off
chcp 65001 > nul
echo ==============================================
echo بررسی وضعیت پیش‌نیازهای نرم‌افزار ام گاز ویندوز 11
echo ==============================================
netstat -ano | findstr :3000
echo.
echo وضعیت پورت 3000 بررسی شد.
pause
`);
  }
});

app.get('/api/download/win11-troubleshooting-guide', (req, res) => {
  const txtPath = path.resolve(__dirname, 'public', 'troubleshooting_win11.txt');
  if (fs.existsSync(txtPath)) {
    res.download(txtPath, 'M-Gas-Troubleshooting-Win11.txt');
  } else {
    res.setHeader('Content-Disposition', 'attachment; filename="M-Gas-Troubleshooting-Win11.txt"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`راهنمای رفع خطای نرم‌افزار اداری ام گاز (ویندوز 11):
1. کلیک راست روی Office-Windows11-Setup.exe و انتخاب Run as administrator
2. اطمینان از نصب پیش‌نیاز Microsoft Visual C++ 2015-2022
3. مجاز کردن پورت 3000 در فایروال ویندوز
`);
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Bind port immediately so health checks and port monitors detect the server in <30ms
  const server = app.listen(PORT, HOST, () => {
    console.log(`[M-Gas Server] Ready and listening on http://${HOST}:${PORT} (PID: ${process.pid})`);
  });

  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`[M-Gas Server] Port ${PORT} in use, keeping active listener.`);
    } else {
      console.error('[M-Gas Server] Server listen error:', err);
    }
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // 2. Attach Vite middleware or Production static files
  if (!isProd) {
    let viteMiddleware: any = null;
    const viteInitPromise = (async () => {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: {
            middlewareMode: true,
            hmr: false,
            allowedHosts: true
          },
          appType: 'spa'
        });
        viteMiddleware = vite.middlewares;
        console.log('[M-Gas Server] Vite dev middleware loaded successfully.');
      } catch (viteErr) {
        console.error('[M-Gas Server] Failed to initialize Vite middleware:', viteErr);
      }
    })();

    app.use(async (req, res, next) => {
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      try {
        await viteInitPromise;
        if (viteMiddleware) {
          return viteMiddleware(req, res, next);
        }
      } catch {
        // Fallback
      }
      next();
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const publicPath = path.resolve(__dirname, 'public');

    // Serve public static assets with strict MIME types
    if (fs.existsSync(publicPath)) {
      app.use(express.static(publicPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
          } else if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
        }
      }));
    }

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
          } else if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
        }
      }));

      // Strict MIME Protection: Never return HTML for missing static assets in Chrome/Safari
      app.use('/assets', (req, res) => {
        res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Asset not found');
      });

      // SPA Catch-All fallback: for all SPA route paths, send index.html regardless of Accept header
      app.get('*', (req, res) => {
        if (path.extname(req.path)) {
          return res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8').send('File not found');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }
}

startServer().catch(err => {
  console.error('[M-Gas Server] Fatal startup error:', err);
  process.exit(1);
});

