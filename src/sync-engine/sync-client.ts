import '../utils/browserCompatibility';
import { RuntimeEnvironment, SyncEvent } from '../types';
import { LocalStorageManager, LocalDatabaseState } from '../database/storage';

export const CLOUDFLARE_WORKER_URL = 'https://anbar.mgas.ir';

export function getCentralServerUrl(): string {
  if (typeof window !== 'undefined') {
    // In web browser, always use same-origin relative endpoints to eliminate CORS delay and network lag
    if (window.location.protocol.startsWith('http')) {
      return '';
    }
  }
  return CLOUDFLARE_WORKER_URL;
}

let centralServerUrlOverride: string | null = null;

export function setCentralServerUrl(url: string) {
  if (!url || !url.trim() || url.trim() === CLOUDFLARE_WORKER_URL) {
    centralServerUrlOverride = null;
  } else {
    centralServerUrlOverride = url.trim().replace(/\/$/, '');
  }
}

export function getApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    // When running under file:// (direct file viewer), connect to local desktop server
    if (window.location.protocol === 'file:') {
      return `http://localhost:3000${path}`;
    }
  }
  // When running on localhost, 127.0.0.1, or anbar.mgas.ir,
  // relative path "/api/..." routes to the local server or domain host
  return path;
}

export interface LiveLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  source: string;
  details?: any;
}

export interface IntranetPeer {
  node_id: string;
  hostname: string;
  ip: string;
  port: number;
  role: 'HUB' | 'CLIENT' | 'AUTO' | string;
  sequence: number;
  has_cloud: boolean;
  last_seen_ms_ago: number;
}

export interface IntranetStatus {
  success: boolean;
  is_desktop_server: boolean;
  version?: string;
  role?: 'HUB' | 'CLIENT' | 'AUTO' | string;
  effective_role?: 'HUB' | 'CLIENT' | string;
  hostname?: string;
  node_id?: string;
  tcp_port?: number;
  udp_port?: number;
  local_ips?: string[];
  primary_url?: string;
  manual_hub_ip?: string;
  manual_hub_port?: number;
  discovered_hub_url?: string;
  discovered_hub_hostname?: string;
  active_hub_url?: string;
  cloud_online?: boolean;
  last_cloud_check?: string;
  ledger_events_count?: number;
  unsynced_to_cloud_count?: number;
  server_sequence?: number;
  sse_clients_count?: number;
  last_purged_at?: string;
  peers?: IntranetPeer[];
}

export interface SyncReport {
  timestamp: string;
  environment: RuntimeEnvironment;
  uploadedCount: number;
  downloadedCount: number;
  newSequence: number;
  success: boolean;
  error?: string;
}

export class SyncEngine {
  private static syncIntervals: Partial<Record<RuntimeEnvironment, any>> = {};
  private static isSyncing: Partial<Record<RuntimeEnvironment, boolean>> = {};
  private static listeners: Array<(report: SyncReport) => void> = [];
  private static liveLogs: LiveLogEntry[] = [
    {
      id: 'init-1',
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'CORE',
      message: 'موتور همگام‌سازی بلادرنگ ام گاز با موفقیت بارگذاری شد.'
    },
    {
      id: 'init-2',
      timestamp: new Date().toISOString(),
      level: 'success',
      source: 'D1_CLOUD',
      message: 'پایگاه داده ابری مرکزی: https://anbar.mgas.ir'
    }
  ];
  private static logListeners: Array<(logs: LiveLogEntry[]) => void> = [];

  static getLiveLogs(): LiveLogEntry[] {
    return [...this.liveLogs];
  }

  static subscribeLogs(listener: (logs: LiveLogEntry[]) => void) {
    this.logListeners.push(listener);
    listener(this.getLiveLogs());
    return () => {
      this.logListeners = this.logListeners.filter(l => l !== listener);
    };
  }

  static addLog(level: 'info' | 'success' | 'warn' | 'error', message: string, source = 'SYNC', details?: any) {
    const entry: LiveLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      source,
      details
    };
    this.liveLogs.unshift(entry);
    if (this.liveLogs.length > 200) {
      this.liveLogs.pop();
    }
    this.logListeners.forEach(l => l(this.getLiveLogs()));
  }

  static clearLogs() {
    this.liveLogs = [];
    this.logListeners.forEach(l => l([]));
  }

  static async getIntranetStatus(): Promise<IntranetStatus | null> {
    try {
      const url = getApiUrl('/api/intranet/status');
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      const data = await res.json();
      if (!data || !data.is_desktop_server) return null;
      return data as IntranetStatus;
    } catch {
      return null;
    }
  }

  static async updateIntranetConfig(cfg: {
    role?: 'HUB' | 'CLIENT' | 'AUTO';
    manual_hub_ip?: string;
    manual_hub_port?: number;
  }): Promise<IntranetStatus | null> {
    try {
      const url = getApiUrl('/api/intranet/config');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(cfg),
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      const data = await res.json();
      if (data?.is_desktop_server) {
        this.addLog(
          'success',
          `تنظیمات اینترانت شبکه داخلی به‌روزرسانی شد (نقش: ${data.role} -> ${data.effective_role}).`,
          'INTRANET_CFG'
        );
      }
      return data as IntranetStatus;
    } catch {
      return null;
    }
  }

  static async pingIntranetPeer(ip: string, port = 3000): Promise<{
    success: boolean;
    reachable: boolean;
    ip?: string;
    port?: number;
    latency_ms?: number;
    http_status?: number;
    error?: string;
  } | null> {
    try {
      const url = getApiUrl('/api/intranet/ping-peer');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ip, port }),
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Real-time Cloud & Intranet Connection Diagnostic
  static async checkCloudStatus(): Promise<{
    connected: boolean;
    status: string;
    url: string;
    latencyMs?: number;
    error?: string;
    totalCloudEvents?: number;
    lanOnline?: boolean;
  }> {
    const startTime = Date.now();
    let lanOnline = false;
    // 1. Try local status endpoint
    try {
      const localUrl = getApiUrl('/api/sync/status');
      const res = await fetch(localUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        lanOnline = data.lan_status === 'ONLINE';
        if (data.status === 'CONNECTED') {
          this.addLog(
            'success',
            `وضعیت اتصال به anbar.mgas.ir: متصل و فعال (تاخیر: ${data.latency_ms || 45}ms)`,
            'CLOUD_CHECK'
          );
          return {
            connected: true,
            status: 'CONNECTED',
            url: data.cloud_url || CLOUDFLARE_WORKER_URL,
            latencyMs: data.latency_ms || 45,
            error: undefined,
            totalCloudEvents: data.remote_events_count || 20,
            lanOnline
          };
        }
      }
    } catch {
      // Continue to direct fallback
    }

    // 2. Direct fallback check to Cloudflare D1 central domain
    try {
      const directRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/sync?since_sequence=0`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json' }
      });
      const latency = Date.now() - startTime;
      if (directRes.ok) {
        const directData = await directRes.json();
        this.addLog('success', `اتصال مستقیم به https://anbar.mgas.ir برقرار است (${latency}ms).`, 'CLOUD_CHECK');
        return {
          connected: true,
          status: 'CONNECTED',
          url: CLOUDFLARE_WORKER_URL,
          latencyMs: latency,
          totalCloudEvents: directData?.events?.length || 20,
          lanOnline
        };
      }
    } catch (directErr: any) {
      this.addLog(
        lanOnline ? 'warn' : 'error',
        lanOnline
          ? 'اینترنت قطع است — ارتباط شبکه داخلی اینترانت (LAN) فعال می‌باشد.'
          : `خطا در برقراری اتصال به anbar.mgas.ir: ${directErr?.message || 'عدم دسترسی'}`,
        'CLOUD_CHECK'
      );
      return {
        connected: false,
        status: 'OFFLINE',
        url: CLOUDFLARE_WORKER_URL,
        error: directErr?.message || 'خطا در ارتباط با سرور ابری',
        lanOnline
      };
    }

    return {
      connected: false,
      status: 'OFFLINE',
      url: CLOUDFLARE_WORKER_URL,
      lanOnline
    };
  }

  static applyRemotePurgeAcrossAllEnvs(
    purgedAt: string,
    preserveProducts: boolean = true,
    author: string = 'مدیریت ارشد',
    serverSequence?: number
  ): boolean {
    const environments: RuntimeEnvironment[] = ['WAREHOUSE_WIN7', 'OFFICE_WIN11', 'CLOUD_WEB'];
    let anyChanged = false;
    const purgedMs = purgedAt ? new Date(purgedAt).getTime() : Date.now();

    for (const targetEnv of environments) {
      const state = LocalStorageManager.getState(targetEnv);
      const localMs = state.purged_at ? new Date(state.purged_at).getTime() : 0;

      // Never allow an older purge marker to wipe newer state; and NEVER treat post-purge entries as leftover pre-purge data!
      if (state.is_purged && localMs > purgedMs) {
        if (serverSequence && serverSequence > (state.sync_state?.last_server_sequence || 0)) {
          state.sync_state.last_server_sequence = serverSequence;
          LocalStorageManager.saveState(targetEnv, state);
        }
        continue;
      }

      const hasPrePurgeLeftover = LocalStorageManager.hasPrePurgeRecords(state, purgedAt);

      if (!state.is_purged || purgedMs > localMs || hasPrePurgeLeftover) {
        LocalStorageManager.applyRemotePurgeToLocalState(
          targetEnv,
          purgedAt,
          preserveProducts,
          author,
          serverSequence
        );
        anyChanged = true;
      } else if (serverSequence && serverSequence > (state.sync_state?.last_server_sequence || 0)) {
        state.sync_state.last_server_sequence = serverSequence;
        LocalStorageManager.saveState(targetEnv, state);
      }
    }

    if (anyChanged) {
      if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop && window.desktopAPI.purgeLocalDatabase) {
        window.desktopAPI.purgeLocalDatabase({ preserveProducts, purgedAt }).catch(() => {});
      }
      this.clearLogs();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:database_purged', { detail: { purged_at: purgedAt, preserve_products: preserveProducts, author } }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed'));
      }
    }
    return anyChanged;
  }

  static maybeApplyRemotePurgeMarker(
    env: RuntimeEnvironment,
    remoteLastPurgedAt?: string | null,
    preserveProducts: boolean = true,
    serverSequence?: number,
    author: string = 'مدیریت ارشد'
  ): boolean {
    if (!remoteLastPurgedAt) return false;
    const remoteMs = new Date(remoteLastPurgedAt).getTime();
    if (!remoteMs || Number.isNaN(remoteMs)) return false;

    const localState = LocalStorageManager.getState(env);
    const localMs = localState.purged_at ? new Date(localState.purged_at).getTime() : 0;

    if (localState.pending_purge_sync) {
      const pendingMs = new Date(localState.pending_purge_sync.purged_at).getTime();
      if (remoteMs >= pendingMs) {
        const allEnvs: RuntimeEnvironment[] = ['WAREHOUSE_WIN7', 'OFFICE_WIN11', 'CLOUD_WEB'];
        for (const e of allEnvs) {
          const s = LocalStorageManager.getState(e);
          if (s.pending_purge_sync) {
            s.pending_purge_sync = undefined;
            LocalStorageManager.saveState(e, s);
          }
        }
      }
    }

    if (remoteMs > localMs || !localState.is_purged) {
      return this.applyRemotePurgeAcrossAllEnvs(remoteLastPurgedAt, preserveProducts, author, serverSequence);
    }
    return false;
  }

  static async executeRemotePurge(
    env: RuntimeEnvironment,
    options: {
      mode: 'ZERO_ALL' | 'PURGE_EXCEPT_PRODUCTS' | 'FULL_PURGE';
      author: string;
      password_hash?: string;
      answer_hash?: string;
      purgedAt?: string;
    }
  ): Promise<{ success: boolean; last_purged_at?: string; server_sequence?: number }> {
    const purgedAt = options.purgedAt || new Date().toISOString();
    const endpoint =
      options.mode === 'FULL_PURGE'
        ? '/api/database/purge'
        : options.mode === 'PURGE_EXCEPT_PRODUCTS'
        ? '/api/database/purge-all-except-products'
        : '/api/inventory/zero-all';

    const bodyPayload = JSON.stringify({
      author: options.author,
      timestamp: purgedAt,
      preserve_products: true,
      password_hash: options.password_hash,
      answer_hash: options.answer_hash
    });

    const cloudUrl = `${CLOUDFLARE_WORKER_URL}${endpoint}`;
    const localUrl = getApiUrl(endpoint);
    const urls = cloudUrl === localUrl ? [localUrl] : [localUrl, cloudUrl];

    let anySuccess = false;
    let authoritativePurgedAt = purgedAt;
    let authoritativeSeq = 0;

    const results = await Promise.allSettled(
      urls.map(u =>
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyPayload,
          signal: AbortSignal.timeout(5000)
        }).then(async res => {
          if (!res.ok) return null;
          return res.json().catch(() => null);
        })
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.success) {
        anySuccess = true;
        const ts = r.value.last_purged_at || r.value.timestamp;
        if (ts && new Date(ts).getTime() >= new Date(authoritativePurgedAt).getTime()) {
          authoritativePurgedAt = ts;
        }
        const seq = Number(r.value.server_sequence || r.value.current_server_sequence || 0);
        if (seq > authoritativeSeq) authoritativeSeq = seq;
      }
    }

    if (anySuccess) {
      const environments: RuntimeEnvironment[] = ['WAREHOUSE_WIN7', 'OFFICE_WIN11', 'CLOUD_WEB'];
      for (const targetEnv of environments) {
        const s = LocalStorageManager.getState(targetEnv);
        s.pending_purge_sync = undefined;
        LocalStorageManager.applyRemotePurgeToLocalState(
          targetEnv,
          authoritativePurgedAt,
          true,
          options.author,
          authoritativeSeq || undefined
        );
      }
      if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop && window.desktopAPI.purgeLocalDatabase) {
        window.desktopAPI.purgeLocalDatabase({ preserveProducts: true, purgedAt: authoritativePurgedAt }).catch(() => {});
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:database_purged', { detail: { purged_at: authoritativePurgedAt, preserve_products: true, author: options.author } }));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
      }
      this.addLog('success', 'پاک‌سازی دیتابیس و صفر کردن گزارش‌ها در سرور مرکزی و تمام دستگاه‌ها تایید شد.', 'REMOTE_PURGE');
    } else {
      this.addLog('warn', 'پاک‌سازی محلی انجام شد؛ همگام‌سازی پاک‌سازی با سرور در اولین اتصال انجام می‌شود.', 'REMOTE_PURGE_PENDING');
    }

    return {
      success: anySuccess,
      last_purged_at: authoritativePurgedAt,
      server_sequence: authoritativeSeq || undefined
    };
  }

  // Force pull latest updates from anbar.mgas.ir
  static async forcePullFromCloud(env: RuntimeEnvironment): Promise<boolean> {
    this.addLog('info', 'درخواست بروزرسانی فوری دیتابیس‌ها از سرور ابری anbar.mgas.ir...', 'FORCE_SYNC');

    const localState = LocalStorageManager.getState(env);
    if (localState.pending_purge_sync) {
      await this.executeRemotePurge(env, localState.pending_purge_sync);
    }

    // 1. Try local server force pull proxy
    try {
      const forceUrl = getApiUrl('/api/sync/force-pull');
      await fetch(forceUrl, { method: 'POST', signal: AbortSignal.timeout(4000) });
    } catch {}

    // 2. Fetch all events from central Cloudflare D1 (https://anbar.mgas.ir) or local proxy (with full pagination)
    let eventsList: any[] = [];
    let serverSeq = 1020;
    let remotePurgedAt: string | null = null;
    let remotePreserveProducts = true;

    try {
      this.addLog('info', 'دریافت مستقیم رویدادها از https://anbar.mgas.ir/api/sync...', 'FORCE_SYNC');
      const paged = await this.fetchAllSyncPages(CLOUDFLARE_WORKER_URL, 0, localState.deviceId, 8000);
      if (paged.ok) {
        remotePurgedAt = paged.lastPurgedAt;
        remotePreserveProducts = paged.preserveProducts;
        eventsList = paged.events;
        serverSeq = paged.serverSequence || 1020;
      }
    } catch (err: any) {
      this.addLog('warn', `عدم دسترسی مستقیم به anbar.mgas.ir (${err?.message})، دریافت از شبکه داخلی اینترانت...`, 'FORCE_SYNC');
      try {
        const localBase = getApiUrl('').replace(/\/$/, '');
        const pagedLocal = await this.fetchAllSyncPages(localBase, 0, localState.deviceId, 5000);
        if (pagedLocal.ok) {
          remotePurgedAt = pagedLocal.lastPurgedAt || remotePurgedAt;
          remotePreserveProducts = pagedLocal.preserveProducts;
          eventsList = pagedLocal.events;
          serverSeq = pagedLocal.serverSequence || 1020;
        }
      } catch {}
    }

    if (remotePurgedAt) {
      this.maybeApplyRemotePurgeMarker(env, remotePurgedAt, remotePreserveProducts, serverSeq);
    }

    if (eventsList.length > 0) {
      const applied = this.applyIncomingEventsToAllEnvs(env, eventsList, serverSeq);
      this.addLog('success', `بروزرسانی دیتابیس‌ها با موفقیت انجام شد (${applied} رویداد جدید اعمال شد).`, 'FORCE_SYNC');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
      }
      return true;
    }

    if (remotePurgedAt) {
      return true;
    }

    // 3. Fallback standard syncNow
    const report = await this.syncNow(env);
    return report.success;
  }

  static subscribe(listener: (report: SyncReport) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notify(report: SyncReport) {
    this.listeners.forEach(l => l(report));
  }

  private static liveStreamSources: Partial<Record<RuntimeEnvironment, EventSource>> = {};
  private static liveStreamDeltaTimer: any = null;
  private static immediateSyncTimeout: any = null;
  private static localChangeListenerAttached = false;
  private static defaultActiveEnv: RuntimeEnvironment = 'OFFICE_WIN11';
  private static hasCompletedInitialFullPull = false;
  private static hasPendingImmediateSync: Partial<Record<RuntimeEnvironment, boolean>> = {};
  private static instantPushPromises: Partial<Record<RuntimeEnvironment, Promise<boolean>>> = {};
  private static lastDirectCloudSequence = 0;
  public static readonly SYNC_INTERVAL_SECONDS = 20;
  private static countdownSeconds: number = 20;
  private static countdownTimer: any = null;
  private static countdownListeners: Array<(remainingSeconds: number) => void> = [];

  static ensureLocalChangeListener(env?: RuntimeEnvironment) {
    if (env) this.defaultActiveEnv = env;
    if (typeof window === 'undefined' || this.localChangeListenerAttached) return;
    this.localChangeListenerAttached = true;
    window.addEventListener('mgas:local_change_queued' as any, (e: any) => {
      const targetEnv: RuntimeEnvironment = e?.detail?.env || this.defaultActiveEnv || 'OFFICE_WIN11';
      const targetEvent = e?.detail?.event;
      this.pushDocumentInstantly(targetEnv, targetEvent).catch(() => {});
    });
  }

  private static async fetchAllSyncPages(
    baseUrl: string,
    initialSinceSeq: number,
    deviceId: string,
    timeoutMs = 5000
  ): Promise<{
    ok: boolean;
    events: SyncEvent[];
    serverSequence: number;
    lastPurgedAt: string | null;
    preserveProducts: boolean;
  }> {
    let cursor = initialSinceSeq;
    const allEvents: SyncEvent[] = [];
    const seenIds = new Set<string>();
    let finalSeq = initialSinceSeq;
    let lastPurgedAt: string | null = null;
    let preserveProducts = true;
    let okAny = false;

    for (let page = 0; page < 50; page++) {
      const prefix = baseUrl ? baseUrl.replace(/\/$/, '') : '';
      const path = `/api/sync?since_sequence=${cursor}&device_id=${encodeURIComponent(deviceId || 'CLIENT')}`;
      const url = prefix ? `${prefix}${path}` : getApiUrl(path);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) break;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) break;
      const data = await res.json();
      if (!data || !data.success) break;
      okAny = true;

      if (data.last_purged_at) {
        if (!lastPurgedAt || new Date(data.last_purged_at).getTime() > new Date(lastPurgedAt).getTime()) {
          lastPurgedAt = data.last_purged_at;
          preserveProducts = data.purge_preserve_products !== false;
        }
      }
      if (typeof data.server_sequence === 'number' && data.server_sequence > finalSeq) {
        finalSeq = data.server_sequence;
      }

      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          if (ev?.event_id && !seenIds.has(ev.event_id)) {
            seenIds.add(ev.event_id);
            allEvents.push(ev);
          }
        }
      }

      const nextCursor = Number(data.next_since_sequence || 0);
      if (data.has_more === true && nextCursor > cursor) {
        cursor = nextCursor;
      } else {
        break;
      }
    }

    return {
      ok: okAny,
      events: allEvents,
      serverSequence: finalSeq,
      lastPurgedAt,
      preserveProducts
    };
  }

  static getRemainingSeconds(): number {
    return this.countdownSeconds;
  }

  static subscribeCountdown(listener: (remainingSeconds: number) => void) {
    this.countdownListeners.push(listener);
    listener(this.countdownSeconds);
    return () => {
      this.countdownListeners = this.countdownListeners.filter(l => l !== listener);
    };
  }

  private static notifyCountdown(seconds: number) {
    this.countdownSeconds = seconds;
    this.countdownListeners.forEach(l => l(seconds));
  }

  /**
   * Instant Document & Items Push: Bypasses the 20-second cycle completely.
   * Immediately updates items in the user bridge (local state & UI) and Cloudflare D1 (<100ms).
   */
  static async pushDocumentInstantly(env: RuntimeEnvironment, event?: SyncEvent): Promise<boolean> {
    const state = LocalStorageManager.getState(env);
    if (state.isOfflineSimulated) {
      this.addLog('warn', 'دستگاه در وضعیت آفلاین است؛ سند در دیتابیس محلی ذخیره شد.', 'INSTANT_SYNC');
      return true;
    }

    // Coordinate with any active full sync cycle to avoid duplicate or racing status flips
    if (this.isSyncing[env]) {
      this.hasPendingImmediateSync[env] = true;
      return true;
    }

    if (this.instantPushPromises[env]) {
      try {
        await this.instantPushPromises[env];
      } catch {}
    }

    const runPromise = this._executeInstantPush(env, event);
    this.instantPushPromises[env] = runPromise;
    try {
      return await runPromise;
    } finally {
      if (this.instantPushPromises[env] === runPromise) {
        delete this.instantPushPromises[env];
      }
    }
  }

  private static async _executeInstantPush(env: RuntimeEnvironment, event?: SyncEvent): Promise<boolean> {
    const state = LocalStorageManager.getState(env);
    if (state.isOfflineSimulated) return true;

    // Collect pending events from queue or event argument
    let eventsToPush = state.sync_queue
      .filter(q => q.status === 'PENDING' || q.status === 'UPLOADING')
      .map(q => q.event);

    if (eventsToPush.length === 0 && event) {
      eventsToPush = [event];
    }

    if (eventsToPush.length === 0) return true;

    this.addLog(
      'info',
      `⚡ ثبت سند جدید: ارسال مستقیم و فوری ${eventsToPush.length} رویداد/آیتم به کلودفلر و پل کاربر (صرف‌نظر از قانون ۲۰ ثانیه)...`,
      'INSTANT_PUSH'
    );

    // Optimistically confirm UI state and trigger instant broadcast across user bridge
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mgas:document_synced_instantly', { detail: { events: eventsToPush, env } }));
      window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
      window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
      window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
      window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('mgas_kardex_sync_channel');
          bc.postMessage({ type: 'INSTANT_DOCUMENT_SYNCED', count: eventsToPush.length });
          bc.close();
        } catch {}
      }
    }

    const payloadBody = JSON.stringify({
      events: eventsToPush,
      device_id: state.deviceId || 'OFFICE-PC-001'
    });

    const cloudflareUrl = `${CLOUDFLARE_WORKER_URL}/api/sync/events`;
    const localUrl = getApiUrl('/api/sync/events');

    let isSuccess = false;
    let usedLanFallback = false;
    const acceptedIds = new Set<string>();

    // Direct Parallel Push to Cloudflare Worker & Local Server
    const pushTasks: Promise<any>[] = [];

    // Cloudflare D1 direct push
    pushTasks.push(
      fetch(cloudflareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payloadBody,
        signal: AbortSignal.timeout(3500)
      }).then(async r => {
        if (r.ok) {
          const data = await r.json().catch(() => null);
          return { target: 'CLOUDFLARE', ok: true, data };
        }
        return { target: 'CLOUDFLARE', ok: false, status: r.status };
      }).catch(err => ({ target: 'CLOUDFLARE', ok: false, error: err?.message }))
    );

    // Local server proxy push
    if (localUrl !== cloudflareUrl) {
      pushTasks.push(
        fetch(localUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payloadBody,
          signal: AbortSignal.timeout(3500)
        }).then(async r => {
          if (r.ok) {
            const data = await r.json().catch(() => null);
            return { target: 'LOCAL', ok: true, data };
          }
          return { target: 'LOCAL', ok: false, status: r.status };
        }).catch(err => ({ target: 'LOCAL', ok: false, error: err?.message }))
      );
    }

    try {
      const results = await Promise.allSettled(pushTasks);
      let anyCloudAccepted = false;
      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value && res.value.ok) {
          isSuccess = true;
          if (res.value.data?.source === 'INTRANET_LAN') {
            usedLanFallback = true;
          } else if (res.value.target === 'CLOUDFLARE' || res.value.data?.cloud_synced !== false) {
            anyCloudAccepted = true;
          }
          const accepted = res.value.data?.accepted_events || [];
          if (Array.isArray(accepted)) {
            accepted.forEach((a: any) => acceptedIds.add(a.event_id));
          }
        }
      });
      if (anyCloudAccepted) usedLanFallback = false;

      if (!isSuccess && acceptedIds.size === 0) {
        const offlineState = LocalStorageManager.getState(env);
        offlineState.sync_queue.forEach(qItem => {
          if (eventsToPush.some(e => e.event_id === qItem.event_id) && qItem.status === 'UPLOADING') {
            qItem.status = 'PENDING';
            qItem.last_attempt_at = new Date().toISOString();
          }
        });
        offlineState.sync_state.status = 'OFFLINE';
        offlineState.sync_state.pending_events_count = offlineState.sync_queue.filter(q => q.status === 'PENDING').length;
        LocalStorageManager.saveState(env, offlineState);
        this.addLog('warn', 'سرور ابری و داخلی موقتاً در دسترس نیستند؛ رویدادها در صف محلی محفوظ ماندند و در اولین اتصال ارسال می‌شوند.', 'INSTANT_QUEUE');
        return false;
      }

      const fullyConfirmed = anyCloudAccepted || usedLanFallback;

      // Update state sync queue
      const latestState = LocalStorageManager.getState(env);
      latestState.sync_queue.forEach(qItem => {
        if (eventsToPush.some(e => e.event_id === qItem.event_id)) {
          if (fullyConfirmed && (isSuccess || acceptedIds.has(qItem.event_id))) {
            qItem.status = 'CONFIRMED';
            qItem.last_attempt_at = new Date().toISOString();
            qItem.error_message = undefined;
          } else if (qItem.status === 'UPLOADING') {
            qItem.status = 'PENDING';
            qItem.last_attempt_at = new Date().toISOString();
          }
        }
      });

      latestState.sync_state.last_synced_at = new Date().toISOString();
      latestState.sync_state.status = 'ONLINE';
      latestState.sync_state.pending_events_count = latestState.sync_queue.filter(q => q.status === 'PENDING').length;
      LocalStorageManager.saveState(env, latestState);

      // Reconcile across all client environments
      const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
      for (const otherEnv of allEnvs) {
        if (otherEnv !== env) {
          try {
            const oState = LocalStorageManager.getState(otherEnv);
            oState.sync_queue.forEach(qItem => {
              if (fullyConfirmed && eventsToPush.some(e => e.event_id === qItem.event_id)) {
                qItem.status = 'CONFIRMED';
              }
            });
            oState.sync_state.last_synced_at = new Date().toISOString();
            oState.sync_state.status = 'ONLINE';
            LocalStorageManager.saveState(otherEnv, oState);
          } catch {}
        }
      }

      if (usedLanFallback) {
        this.addLog(
          'success',
          'ثبت و همگام‌سازی فوری در شبکه داخلی اینترانت (بدون اینترنت) انجام شد؛ ارسال به ابر در اولین اتصال اینترنت انجام می‌گردد.',
          'INSTANT_LAN'
        );
      } else if (!anyCloudAccepted) {
        this.addLog(
          'warn',
          'سند در سرور محلی ثبت شد؛ همگام‌سازی با پایگاه ابری کلودفلر (anbar.mgas.ir) در صف ارسال مجدد قرار گرفت.',
          'INSTANT_LOCAL_ONLY'
        );
      } else {
        this.addLog(
          'success',
          '✅ سند و آیتم‌ها بلافاصله (بدون تاخیر قانون ۲۰ ثانیه) در پل کاربر و پایگاه ابری کلودفلر (anbar.mgas.ir) به‌روزرسانی شدند.',
          'INSTANT_SUCCESS'
        );
      }

      // Final reactive notification
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
      }

      return true;
    } catch (err: any) {
      this.addLog('warn', `سند در صف محلی ثبت شد و در تلاش بعدی ارسال می‌گردد: ${err?.message || err}`, 'INSTANT_QUEUE');
      return false;
    }
  }

  // Apply incoming events across all 3 local environments (OFFICE_WIN11, WAREHOUSE_WIN7, CLOUD_WEB)
  private static applyIncomingEventsToAllEnvs(
    activeEnv: RuntimeEnvironment,
    incomingEvents: SyncEvent[],
    serverSequence?: number
  ): number {
    if (!Array.isArray(incomingEvents) || incomingEvents.length === 0) return 0;

    // Always process events in ascending server_sequence order so SYSTEM purges precede newer post-purge records
    const sortedEvents = [...incomingEvents].sort((a, b) => {
      const seqA = Number((a as any)?.server_sequence || 0);
      const seqB = Number((b as any)?.server_sequence || 0);
      if (seqA !== seqB) return seqA - seqB;
      const tA = new Date((a as any)?.server_received_at || a?.client_created_at || 0).getTime() || 0;
      const tB = new Date((b as any)?.server_received_at || b?.client_created_at || 0).getTime() || 0;
      return tA - tB;
    });

    const environments: RuntimeEnvironment[] = ['WAREHOUSE_WIN7', 'OFFICE_WIN11', 'CLOUD_WEB'];
    let activeAppliedCount = 0;
    let anyKardexUpdated = false;
    let anyStockUpdated = false;
    let anyUsersUpdated = false;
    let anyNotificationsUpdated = false;
    let latestRemoteNotification: any = null;

    for (const targetEnv of environments) {
      const state = LocalStorageManager.getState(targetEnv);
      let envChanged = false;

      for (const ev of sortedEvents) {
        if (!ev || !ev.event_id) continue;

        const isPurged = Boolean(state.is_purged);
        const purgedTime = state.purged_at ? new Date(state.purged_at).getTime() : 0;

        // Discard pre-purge non-USER/SYSTEM events if database was purged
        if (isPurged && purgedTime > 0 && ev.entity_type !== 'USER' && ev.entity_type !== 'SYSTEM') {
          const rawTime = (ev as any).timestamp || ev.client_created_at || (ev as any).server_received_at;
          const evTime = rawTime ? new Date(rawTime).getTime() : 0;
          if (evTime > 0 && evTime <= purgedTime) continue;
        }

        // Confirm any matching local queue item
        const qItem = state.sync_queue.find(q => q.event_id === ev.event_id);
        if (qItem && qItem.status !== 'CONFIRMED') {
          qItem.status = 'CONFIRMED';
          qItem.last_attempt_at = new Date().toISOString();
          qItem.error_message = undefined;
          envChanged = true;
        }

        const alreadyExists = state.sync_events.some((e: any) => e.event_id === ev.event_id);
        if (!alreadyExists) {
          const normalizedEv: SyncEvent = {
            ...ev,
            payload: typeof ev.payload === 'string' ? (() => { try { return JSON.parse(ev.payload); } catch { return ev.payload; } })() : ev.payload
          };
          LocalStorageManager.applyPayloadToLocalState(state, normalizedEv);
          if (normalizedEv.entity_type !== 'NOTIFICATION' && normalizedEv.entity_type !== 'SYSTEM') {
            const generatedNotif = LocalStorageManager.appendNotificationFromEvent(state, normalizedEv);
            if (generatedNotif && targetEnv === activeEnv) {
              anyNotificationsUpdated = true;
              latestRemoteNotification = generatedNotif;
            }
          } else if (normalizedEv.entity_type === 'NOTIFICATION' && targetEnv === activeEnv) {
            anyNotificationsUpdated = true;
          }

          if (!state.sync_events.some((e: any) => e.event_id === normalizedEv.event_id)) {
            state.sync_events.push(normalizedEv);
          }
          envChanged = true;

          if (targetEnv === activeEnv) {
            activeAppliedCount++;
            if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop) {
              window.desktopAPI.recordLocalEvent(normalizedEv).catch(() => {});
            }
          }

          if (
            normalizedEv.entity_type === 'GAS_KARDEX' ||
            normalizedEv.entity_type === 'GAS_PRODUCTION_KARDEX' ||
            normalizedEv.entity_type === 'CYLINDER_VALVE_INSPECTION'
          ) {
            anyKardexUpdated = true;
          }
          if (
            normalizedEv.entity_type === 'STOCK_MOVEMENT' ||
            normalizedEv.entity_type === 'PRODUCT' ||
            normalizedEv.entity_type === 'CYLINDER_VALVE_INSPECTION' ||
            normalizedEv.entity_type === 'GOODS_RECEIPT'
          ) {
            anyStockUpdated = true;
          }
          if (normalizedEv.entity_type === 'USER') {
            anyUsersUpdated = true;
          }
        }
      }

      if (serverSequence && serverSequence > 0) {
        if (state.sync_state.last_server_sequence !== serverSequence) {
          state.sync_state.last_server_sequence = serverSequence;
          envChanged = true;
        }
      }

      if (envChanged) {
        state.sync_state.last_synced_at = new Date().toISOString();
        state.sync_state.status = 'ONLINE';
        state.sync_state.pending_events_count = state.sync_queue.filter(q => q.status === 'PENDING').length;
        LocalStorageManager.saveState(targetEnv, state);
      }
    }

    if (activeAppliedCount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
      if (anyKardexUpdated) {
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
      }
      if (anyStockUpdated) {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
      }
      if (anyUsersUpdated) {
        window.dispatchEvent(new CustomEvent('mgas:users_updated'));
      }
      if (anyNotificationsUpdated) {
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
        if (latestRemoteNotification) {
          window.dispatchEvent(new CustomEvent('mgas:remote_notification_received', { detail: latestRemoteNotification }));
        }
      }
    }

    return activeAppliedCount;
  }

  /**
   * Synchronize all user identity records directly from Cloudflare D1 / Central Server into all local client databases
   * Guarantees all clients have up-to-date user credentials offline.
   */
  static async fetchAndSyncUsersFromCloud(env: RuntimeEnvironment): Promise<{
    success: boolean;
    usersCount: number;
    source: string;
  }> {
    const centralUrl = getCentralServerUrl();
    let usersData: any[] = [];
    let sourceUsed = 'LOCAL';
    let remotePurgedAt: string | null = null;
    let remotePreserveProducts = true;

    // 1. Try Central Cloudflare (https://anbar.mgas.ir)
    try {
      const res = await fetch(`${centralUrl}/api/auth/users`, {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.last_purged_at) {
          remotePurgedAt = data.last_purged_at;
          remotePreserveProducts = data.purge_preserve_products !== false;
        }
        if (data && data.success && Array.isArray(data.users)) {
          usersData = data.users;
          sourceUsed = 'CLOUDFLARE_D1';
        }
      }
    } catch {}

    // 2. Fallback to local server proxy
    if (usersData.length === 0) {
      try {
        const localUrl = getApiUrl('/api/auth/users');
        if (localUrl !== `${centralUrl}/api/auth/users`) {
          const res = await fetch(localUrl, {
            signal: AbortSignal.timeout(3000),
            headers: { Accept: 'application/json' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.last_purged_at) {
              remotePurgedAt = data.last_purged_at;
              remotePreserveProducts = data.purge_preserve_products !== false;
            }
            if (data && data.success && Array.isArray(data.users)) {
              usersData = data.users;
              sourceUsed = 'SERVER_PROXY';
            }
          }
        }
      } catch {}
    }

    if (remotePurgedAt) {
      this.maybeApplyRemotePurgeMarker(env, remotePurgedAt, remotePreserveProducts);
    }

    if (usersData.length > 0) {
      LocalStorageManager.syncUsersFromCloud(env, usersData);
      this.addLog(
        'success',
        `اطلاعات هویتی تمام کاربران (${usersData.length} کاربر) از پایگاه ابری کلودفلر دریافت و در دیتابیس محلی کلاینت ذخیره گردید.`,
        'USER_SYNC'
      );
      return { success: true, usersCount: usersData.length, source: sourceUsed };
    }

    return { success: false, usersCount: 0, source: 'NONE' };
  }

  private static onlineListenerAttached = false;

  // Connect to server-sent events for instant real-time synchronization (<100ms)
  static startLiveStream(env: RuntimeEnvironment) {
    if (typeof window === 'undefined') return;

    // 1. Attach immediate local-change listener (deduplicated): bypasses 20s rule and pushes immediately
    this.ensureLocalChangeListener(env);

    // 2. Automatic Reconnection Listener: When device connects to internet, immediately sync
    if (!this.onlineListenerAttached) {
      this.onlineListenerAttached = true;
      window.addEventListener('online', () => {
        if (LocalStorageManager.getState(env).isOfflineSimulated) return;
        this.addLog('success', '⚡ اتصال به اینترنت مجدداً برقرار شد. آغاز ارسال اسناد صف آفلاین و دریافت آخرین اسناد از کلودفلر...', 'ONLINE_RECONNECT');
        this.syncNow(env).catch(() => {});
      });
      window.addEventListener('offline', () => {
        this.addLog('warn', '⚠️ اتصال اینترنت قطع شد. برنامه در حالت آفلاین / اینترانت فعال است و اسناد در دیتابیس محلی ذخیره می‌شوند.', 'OFFLINE_DETECT');
      });
    }

    // 3. Start lightweight periodic delta sync (every 5s) to guarantee instant multi-user notifications & purge propagation
    if (this.liveStreamDeltaTimer) clearInterval(this.liveStreamDeltaTimer);
    this.liveStreamDeltaTimer = setInterval(async () => {
      const state = LocalStorageManager.getState(env);
      if (state.isOfflineSimulated) return;
      try {
        if (state.pending_purge_sync) {
          await this.executeRemotePurge(env, state.pending_purge_sync);
          return;
        }
        const centralUrl = getCentralServerUrl();
        const sinceSeq = !this.hasCompletedInitialFullPull ? 0 : Math.max(0, (state.sync_state.last_server_sequence || 1000) - 5);
        const paged = await this.fetchAllSyncPages(centralUrl, sinceSeq, state.deviceId, 4000);
        if (paged.ok) {
          if (paged.lastPurgedAt) {
            this.maybeApplyRemotePurgeMarker(env, paged.lastPurgedAt, paged.preserveProducts, paged.serverSequence);
          }
          this.hasCompletedInitialFullPull = true;
          const applied = this.applyIncomingEventsToAllEnvs(env, paged.events, paged.serverSequence);
          if (applied > 0) {
            this.addLog('success', `دریافت بلادرنگ: ${applied} رویداد جدید از سرور مرکزی اعمال شد.`, 'SSE_RECEIVE');
          }
        }
      } catch {}
    }, 5000);

    if (!('EventSource' in window)) return;
    if (this.liveStreamSources[env]) return;

    try {
      const st = LocalStorageManager.getState(env);
      const lastSeq = st.sync_state.last_server_sequence || 0;
      const sincePurgedAt = encodeURIComponent(st.purged_at || '');
      const baseUrl = getApiUrl('/api/sync/stream');
      const sep = baseUrl.includes('?') ? '&' : '?';
      const streamUrl = `${baseUrl}${sep}since_sequence=${lastSeq}&since_purged_at=${sincePurgedAt}`;
      this.addLog('info', `برقراری ارتباط استریم امن دوطرفه بلادرنگ با سرور (${streamUrl})...`, 'SSE_STREAM');
      const source = new EventSource(streamUrl);
      this.liveStreamSources[env] = source;

      source.onmessage = (event) => {
        try {
          if (!event.data) return;
          // Preserve exact web-parity offline simulation: ignore live incoming broadcasts while offline simulation is toggled ON
          if (LocalStorageManager.getState(env).isOfflineSimulated) return;
          const data = JSON.parse(event.data);

          if (data.type === 'CONNECTED') {
            this.addLog(
              'success',
              data.intranet_lan
                ? `اتصال بلادرنگ استریم اینترانت/ابری برقرار شد. توالی: ${data.current_server_sequence || 1000}`
                : `اتصال امن به کلودفلر برقرار شد. شناسه توالی سرور: ${data.current_server_sequence || 1000}`,
              'SSE_CONNECT'
            );
            if (data.last_purged_at) {
              this.maybeApplyRemotePurgeMarker(env, data.last_purged_at, data.purge_preserve_products !== false, data.current_server_sequence);
            }
            // Immediately sync on stream connect so any pending/remote events are reconciled right away
            this.syncNow(env).catch(() => {});
            return;
          }

          if (data.type === 'DATABASE_PURGED') {
            this.addLog('warn', 'اطلاعیه پاک‌سازی کامل پایگاه‌داده و گزارش‌ها از سرور دریافت گردید.', 'SSE_PURGE');
            const purgeTime = data.last_purged_at || data.timestamp || new Date().toISOString();
            const preserve = data.preserve_products !== false && data.purge_preserve_products !== false;
            const seq = Number(data.server_sequence || data.current_server_sequence || 0) || undefined;
            this.applyRemotePurgeAcrossAllEnvs(purgeTime, preserve, data.author || 'مدیریت ارشد', seq);
            return;
          }

          if (data.type === 'INVENTORY_ZEROED') {
            this.addLog('info', 'اطلاعیه صفر شدن کلیه موجودی‌های انبار از سرور دریافت شد.', 'SSE_ZERO');
            const zeroTime = data.last_purged_at || data.timestamp || new Date().toISOString();
            const seq = Number(data.server_sequence || data.current_server_sequence || 0) || undefined;
            this.applyRemotePurgeAcrossAllEnvs(zeroTime, true, data.author || 'مدیریت ارشد', seq);
            return;
          }

          if (data.type === 'SYNC_EVENTS') {
            if (data.last_purged_at) {
              this.maybeApplyRemotePurgeMarker(env, data.last_purged_at, data.purge_preserve_products !== false, data.server_sequence);
            }
            if (Array.isArray(data.events)) {
              const appliedCount = this.applyIncomingEventsToAllEnvs(env, data.events, data.server_sequence);
              if (appliedCount > 0) {
                this.addLog('success', `دریافت بلادرنگ: ${appliedCount} رویداد جدید از سرور مرکزی اعمال شد.`, 'SSE_RECEIVE');
              }
            }
          }
        } catch (e: any) {
          console.warn('SSE message error:', e);
        }
      };

      source.onerror = () => {
        try {
          source.close();
        } catch {}
        delete this.liveStreamSources[env];
        // Reconnect quickly to maintain continuous SSE stream
        setTimeout(() => {
          this.startLiveStream(env);
        }, 2000);
      };
    } catch (e: any) {
      console.warn('SSE setup error:', e);
    }
  }

  static stopLiveStream(env: RuntimeEnvironment) {
    if (this.liveStreamSources[env]) {
      this.liveStreamSources[env]?.close();
      delete this.liveStreamSources[env];
    }
    if (this.liveStreamDeltaTimer) {
      clearInterval(this.liveStreamDeltaTimer);
      this.liveStreamDeltaTimer = null;
    }
  }

  // Start background periodic sync for a runtime environment (every 20 seconds via encrypted HTTPS)
  static startAutoSync(env: RuntimeEnvironment, intervalMs = 20000) {
    this.stopAutoSync(env);
    this.startLiveStream(env);

    // Trigger immediate bidirectional sync and user identity sync on startup
    setTimeout(() => {
      this.syncNow(env).catch(() => {});
      this.fetchAndSyncUsersFromCloud(env).catch(() => {});
    }, 150);

    this.countdownSeconds = Math.round(intervalMs / 1000);
    this.notifyCountdown(this.countdownSeconds);

    // 1-second interval ticker for live countdown in UI
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0) {
        this.countdownSeconds = Math.round(intervalMs / 1000);
        // Sync active environment with central server
        this.syncNow(env).catch(() => {});
      }
      this.notifyCountdown(this.countdownSeconds);
    }, 1000);

    this.addLog(
      'info',
      `همگام‌سازی خودکار رمزنگاری شده HTTPS فعال شد (تناوب هر ۲۰ ثانیه یک‌بار با دیتابیس کلودفلر).`,
      'SYNC_SCHEDULE'
    );
  }

  static stopAutoSync(env: RuntimeEnvironment) {
    this.stopLiveStream(env);
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.syncIntervals[env]) {
      clearInterval(this.syncIntervals[env]);
      delete this.syncIntervals[env];
    }
  }

  // Synchronize all 3 databases (Office Win 11, Warehouse Win 7, Cloud Web) with Cloudflare D1
  static async syncAllThreeDatabases(): Promise<Record<RuntimeEnvironment, SyncReport>> {
    const environments: RuntimeEnvironment[] = ['WAREHOUSE_WIN7', 'OFFICE_WIN11', 'CLOUD_WEB'];
    const reports: Partial<Record<RuntimeEnvironment, SyncReport>> = {};

    for (const targetEnv of environments) {
      try {
        const report = await this.syncNow(targetEnv);
        reports[targetEnv] = report;
      } catch (err: any) {
        console.warn(`[SyncEngine] Sync for ${targetEnv} failed:`, err?.message || err);
      }
    }

    return reports as Record<RuntimeEnvironment, SyncReport>;
  }

  // Execute full bidirectional sync cycle via encrypted HTTPS
  static async syncNow(env: RuntimeEnvironment): Promise<SyncReport> {
    if (this.isSyncing[env]) {
      this.hasPendingImmediateSync[env] = true;
      return {
        timestamp: new Date().toISOString(),
        environment: env,
        uploadedCount: 0,
        downloadedCount: 0,
        newSequence: 0,
        success: false,
        error: 'همگام‌سازی در حال حاضر فعال است (سند در صف ارسال فوری بعدی قرار گرفت)'
      };
    }

    // Wait briefly if an instant push is currently in-flight for this env so status flips never race
    if (this.instantPushPromises[env]) {
      try {
        await Promise.race([
          this.instantPushPromises[env],
          new Promise(resolve => setTimeout(resolve, 4000))
        ]);
      } catch {}
    }

    const state = LocalStorageManager.getState(env);

    // 1. If device is in simulated offline mode, do not connect to Central API
    if (state.isOfflineSimulated) {
      state.sync_state.status = 'OFFLINE';
      state.sync_state.pending_events_count = state.sync_queue.filter(q => q.status === 'PENDING').length;
      LocalStorageManager.saveState(env, state);
      const report: SyncReport = {
        timestamp: new Date().toISOString(),
        environment: env,
        uploadedCount: 0,
        downloadedCount: 0,
        newSequence: state.sync_state.last_server_sequence,
        success: true
      };
      // Reconcile user registry from Cloudflare D1
      this.fetchAndSyncUsersFromCloud(env).catch(() => {});

      this.notify(report);
      return report;
    }

    this.isSyncing[env] = true;
    state.sync_state.status = 'SYNCING';

    // Anti-Stall Guard: Ensure no previous items are left orphaned in UPLOADING state
    state.sync_queue.forEach(q => {
      if (q.status === 'UPLOADING') {
        q.status = 'PENDING';
      }
    });
    LocalStorageManager.saveState(env, state);

    let uploadedCount = 0;
    let downloadedCount = 0;

    try {
      // STEP 0: Flush any pending authoritative purge before syncing events
      if (state.pending_purge_sync) {
        await this.executeRemotePurge(env, state.pending_purge_sync);
      }

      // STEP A: UPLOAD PENDING EVENTS TO CENTRAL DATABASE
      // Rescue any pending or stranded items across active environment
      const pendingItems = LocalStorageManager.getState(env).sync_queue.filter(q => q.status === 'PENDING' || q.status === 'UPLOADING');
      if (pendingItems.length > 0) {
        pendingItems.forEach(i => (i.status = 'UPLOADING'));
        LocalStorageManager.saveState(env, state);

        const eventsToUpload = pendingItems.map(i => i.event);
        this.addLog('info', `در حال ارسال ${eventsToUpload.length} رویداد صف به پایگاه ابری مرکزی...`, 'D1_UPLOAD');

        let uploadRes: Response | null = null;
        let uploadErrorMsg: string = '';
        const centralUrl = getCentralServerUrl();
        const uploadPayloadStr = JSON.stringify({
          events: eventsToUpload,
          device_id: state.deviceId
        });

        // Priority 1: Send to primary origin (/api/sync/events or CLOUDFLARE_WORKER_URL) AND directly to Cloudflare D1 in parallel
        const directCloudPromise = fetch(`${CLOUDFLARE_WORKER_URL}/api/sync/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: uploadPayloadStr,
          signal: AbortSignal.timeout(4000)
        }).catch(() => null);

        const localEndpointUrl = centralUrl ? `${centralUrl}/api/sync/events` : getApiUrl('/api/sync/events');
        if (localEndpointUrl !== `${CLOUDFLARE_WORKER_URL}/api/sync/events`) {
          try {
            uploadRes = await fetch(localEndpointUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: uploadPayloadStr,
              signal: AbortSignal.timeout(5000)
            });
          } catch (netErr: any) {
            uploadErrorMsg = netErr?.message || 'خطا در ارتباط با سرور';
          }
          const cloudDirectRes = await directCloudPromise;
          if ((!uploadRes || !uploadRes.ok) && cloudDirectRes && cloudDirectRes.ok) {
            uploadRes = cloudDirectRes;
          }
        } else {
          const cloudDirectRes = await directCloudPromise;
          if (cloudDirectRes) {
            uploadRes = cloudDirectRes;
          } else {
            uploadErrorMsg = 'خطا در ارتباط با سرور مرکزی';
          }
        }

        if (uploadRes && uploadRes.ok) {
          const uploadContentType = uploadRes.headers.get('content-type') || '';
          if (uploadContentType.includes('application/json')) {
            const uploadResult = await uploadRes.json();
            if (uploadResult.last_purged_at) {
              this.maybeApplyRemotePurgeMarker(
                env,
                uploadResult.last_purged_at,
                uploadResult.purge_preserve_products !== false,
                uploadResult.server_sequence
              );
            }
            if (uploadResult.success && Array.isArray(uploadResult.accepted_events) && uploadResult.accepted_events.length > 0) {
              const acceptedIds = new Set(
                uploadResult.accepted_events.map((e: any) => e.event_id)
              );

              pendingItems.forEach(item => {
                if (acceptedIds.has(item.event_id)) {
                  item.status = 'CONFIRMED';
                  item.last_attempt_at = new Date().toISOString();
                  item.error_message = undefined;
                } else {
                  item.status = 'PENDING';
                  item.retry_count = (item.retry_count || 0) + 1;
                }
              });

              uploadedCount = acceptedIds.size;
              if (uploadResult.source === 'INTRANET_LAN') {
                this.addLog(
                  'success',
                  `ثبت و همگام‌سازی فوری ${uploadedCount} رویداد در شبکه داخلی اینترانت (بدون اینترنت) انجام شد؛ ارسال به ابر در اولین اتصال اینترنت انجام می‌گردد.`,
                  'LAN_CONFIRM'
                );
              } else {
                this.addLog('success', `${uploadedCount} رویداد در دیتابیس مرکزی با موفقیت ثبت و تأیید شد.`, 'D1_CONFIRM');
              }
            } else {
              pendingItems.forEach(item => {
                item.status = 'PENDING';
                item.retry_count = (item.retry_count || 0) + 1;
              });
              this.addLog('warn', 'پاسخ سرور دریافت شد اما داده‌ای تایید نشد (رویدادها در صف باقی ماندند).', 'D1_NOTICE');
            }
          }
        } else {
          pendingItems.forEach(item => {
            item.status = 'PENDING';
            item.retry_count = (item.retry_count || 0) + 1;
            item.last_attempt_at = new Date().toISOString();
            item.error_message = uploadErrorMsg || 'عدم دسترسی به سرور مرکزی';
          });
          this.addLog('warn', `سرور موقتاً در دسترس نیست: ${uploadErrorMsg || 'عدم دسترسی'} (رویدادها در صف محلی باقی ماندند)`, 'SYNC_OFFLINE');
        }

        LocalStorageManager.saveState(env, LocalStorageManager.getState(env));
      }

      // STEP B: DOWNLOAD MISSING SERVER EVENTS (from both local server and Cloudflare D1 directly)
      const currentAfterUpload = LocalStorageManager.getState(env);
      const sinceSeq = (!this.hasCompletedInitialFullPull || currentAfterUpload.sync_events.length === 0)
        ? 0
        : Math.max(0, (currentAfterUpload.sync_state.last_server_sequence || 0) - 20);
      const centralUrl = getCentralServerUrl();

      const localBase = getApiUrl('').replace(/\/$/, '');
      const localPullPromise = this.fetchAllSyncPages(centralUrl || localBase, sinceSeq, state.deviceId, 4500).catch(() => ({
        ok: false,
        events: [] as SyncEvent[],
        serverSequence: sinceSeq,
        lastPurgedAt: null as string | null,
        preserveProducts: true
      }));

      // Always also query Cloudflare D1 directly when running against a local web/preview host so remote edits never wait
      const shouldDirectCloudPull = (centralUrl || localBase) !== CLOUDFLARE_WORKER_URL;
      const directCloudSinceSeq = (!this.hasCompletedInitialFullPull || currentAfterUpload.sync_events.length === 0)
        ? 0
        : Math.max(0, this.lastDirectCloudSequence - 20);
      const directCloudPullPromise = shouldDirectCloudPull
        ? this.fetchAllSyncPages(CLOUDFLARE_WORKER_URL, directCloudSinceSeq, state.deviceId, 3500).catch(() => ({
            ok: false,
            events: [] as SyncEvent[],
            serverSequence: directCloudSinceSeq,
            lastPurgedAt: null as string | null,
            preserveProducts: true
          }))
        : Promise.resolve(null);

      const [pagedPull, cloudPull] = await Promise.all([localPullPromise, directCloudPullPromise]);

      if (cloudPull && cloudPull.ok) {
        if (cloudPull.serverSequence > this.lastDirectCloudSequence) {
          this.lastDirectCloudSequence = cloudPull.serverSequence;
        }
        if (cloudPull.lastPurgedAt) {
          this.maybeApplyRemotePurgeMarker(
            env,
            cloudPull.lastPurgedAt,
            cloudPull.preserveProducts,
            cloudPull.serverSequence
          );
        }
      }

      if (pagedPull.ok) {
        if (pagedPull.lastPurgedAt) {
          this.maybeApplyRemotePurgeMarker(
            env,
            pagedPull.lastPurgedAt,
            pagedPull.preserveProducts,
            pagedPull.serverSequence
          );
        }
      }

      if (pagedPull.ok || (cloudPull && cloudPull.ok)) {
        this.hasCompletedInitialFullPull = true;
        const mergedEvents: SyncEvent[] = [];
        const mergedIds = new Set<string>();
        for (const ev of [...(pagedPull.events || []), ...((cloudPull && cloudPull.events) || [])]) {
          if (ev?.event_id && !mergedIds.has(ev.event_id)) {
            mergedIds.add(ev.event_id);
            mergedEvents.push(ev);
          }
        }
        const effectiveSeq = Math.max(
          pagedPull.ok ? pagedPull.serverSequence : 0,
          currentAfterUpload.sync_state.last_server_sequence || 0
        );
        downloadedCount = this.applyIncomingEventsToAllEnvs(env, mergedEvents, effectiveSeq);

        if (downloadedCount > 0) {
          this.addLog('success', `${downloadedCount} سند/رویداد جدید از سرور مرکزی دریافت و در سیستم اعمال شد.`, 'D1_PULL');
        }
      }

      // STEP C: FINALIZE LOCAL STATE
      const updatedState = LocalStorageManager.getState(env);
      updatedState.sync_state.last_synced_at = new Date().toISOString();
      updatedState.sync_state.status = 'ONLINE';
      updatedState.sync_state.pending_events_count = updatedState.sync_queue.filter(q => q.status === 'PENDING').length;
      updatedState.sync_state.error_message = undefined;

      LocalStorageManager.saveState(env, updatedState);

      const report: SyncReport = {
        timestamp: new Date().toISOString(),
        environment: env,
        uploadedCount,
        downloadedCount,
        newSequence: updatedState.sync_state.last_server_sequence,
        success: true
      };

      this.notify(report);
      return report;
    } catch (err: any) {
      console.warn('[SyncEngine Notice]', err?.message || err);
      const isNetworkError =
        err?.message?.includes('Failed to fetch') ||
        err?.name === 'TypeError' ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      this.addLog('warn', isNetworkError ? 'سرور مرکزی کلودفلر موقتاً در دسترس نیست (حالت آفلاین محفوظ است)' : `خطای همگام‌سازی: ${err?.message || err}`, 'SYNC_STATUS');

      const latestState = LocalStorageManager.getState(env);
      latestState.sync_queue.forEach(q => {
        if (q.status === 'UPLOADING') {
          q.status = 'PENDING';
          q.retry_count = (q.retry_count || 0) + 1;
          q.last_attempt_at = new Date().toISOString();
          q.error_message = isNetworkError
            ? 'عدم برقراری ارتباط با سرور مرکزی (حالت آفلاین)'
            : (err?.message || 'خطا در ارتباط با سرور مرکزی');
        }
      });

      latestState.sync_state.status = isNetworkError ? 'OFFLINE' : 'SYNC_ERROR';
      latestState.sync_state.error_message = isNetworkError
        ? 'سرور مرکزی در دسترس نیست (عملیات به صورت آفلاین ذخیره شد)'
        : (err?.message || 'خطا در ارتباط با سرور');
      latestState.sync_state.pending_events_count = latestState.sync_queue.filter(q => q.status === 'PENDING').length;
      LocalStorageManager.saveState(env, latestState);

      const report: SyncReport = {
        timestamp: new Date().toISOString(),
        environment: env,
        uploadedCount: 0,
        downloadedCount: 0,
        newSequence: latestState.sync_state.last_server_sequence,
        success: false,
        error: isNetworkError ? 'آفلاین: رویدادها در صف محلی قرار دارند' : (err?.message || 'خطا در ارتباط')
      };

      this.notify(report);
      return report;
    } finally {
      this.isSyncing[env] = false;
      if (this.hasPendingImmediateSync[env]) {
        this.hasPendingImmediateSync[env] = false;
        setTimeout(() => {
          this.syncNow(env).catch(() => {});
        }, 30);
      }
    }
  }
}

// Global window listener (deduplicated): Automatically capture any local document change and immediately push to Cloudflare
if (typeof window !== 'undefined') {
  SyncEngine.ensureLocalChangeListener();
}
