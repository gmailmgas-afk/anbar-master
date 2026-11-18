import {
  Product,
  Category,
  Customer,
  Supplier,
  Warehouse,
  StockMovement,
  SyncEvent,
  SyncQueueItem,
  SyncState,
  AuditLog,
  RuntimeEnvironment,
  EntityType,
  EventType,
  Sale,
  Purchase,
  GasKardexEntry,
  GasProductionKardexEntry,
  Invoice,
  GoodsReceiptRecord,
  GoodsReceiptType,
  GoodsReceiptItem,
  User,
  DocumentEditPermissionResult,
  CylinderValveInspection,
  InspectionStatus,
  CustomCylinderItemType,
  CustomerValveProfile,
  CylinderType,
  SegregatedCustomerValveItem,
  CylinderTankMapping,
  MovementType,
  ProductionPartRequirement,
  ProductionPartsAvailabilityResult,
  AppNotification,
  NotificationCategory
} from '../types/index';
import {
  SEED_PRODUCTS,
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_SUPPLIERS,
  SEED_WAREHOUSES,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_SYNC_EVENTS,
  INITIAL_AUDIT_LOGS,
  SEED_USERS,
  SEED_GAS_KARDEX_ENTRIES,
  SEED_CYLINDER_VALVE_INSPECTIONS
} from './seed-data';
import { EXCEL_CUSTOMERS_48 } from './excel-customers';
import { recalculateKardexBalances } from './gas-kardex-data';
import { SEED_GAS_PRODUCTION_KARDEX_ENTRIES, recalculateProductionKardexBalances } from './production-kardex-data';
import { DEFAULT_CYLINDER_TANK_MAPPINGS } from './cylinder-tank-catalog';
import { generateUUID, toPersianDigits, toEnglishDigits, getPersianDate, cleanPersianText } from '../utils/persian';
import { normalizeCylinderType, isPicnic56Type, is11Or25Or50CylinderType, isTankType, getCylinderRelationshipInfo } from '../utils/cylinderRelationship';
import { isRepairCylinderInspection } from '../utils/cylinderInspection';
import { allocateNextUniqueReceiptNumber } from '../utils/receiptSerial';
import { numberToPersianWords } from '../utils/numberToPersianWords';
import { isValveProduct } from '../utils/valveProductUtils';

export const DEFAULT_CYLINDER_ITEM_TYPES: CustomCylinderItemType[] = [
  { id: 'VALVE_NEW', name: 'شیر نو سیلندر گاز ۱۱ کیلوگرمی', category: 'VALVE', unit: 'عدد', created_at: '2026-09-01T00:00:00.000Z' },
  { id: 'VALVE_USED', name: 'شیر کهنه کپسول گاز', category: 'VALVE', unit: 'عدد', created_at: '2026-09-01T00:00:00.000Z' },
  { id: 'CYLINDER_11KG', name: 'سیلندر گاز مایع ۱۱ کیلوگرم', category: 'CYLINDER', unit: 'عدد', created_at: '2026-09-01T00:00:00.000Z' },
  { id: 'CYLINDER_OTHER', name: 'سایر سیلندرها / پیک‌نیک', category: 'CYLINDER', unit: 'عدد', created_at: '2026-09-01T00:00:00.000Z' },
  { id: 'SCRAP', name: 'ضایعات و اسقاط شیر/کپسول', category: 'SCRAP', unit: 'عدد', created_at: '2026-09-01T00:00:00.000Z' }
];

export interface ValveIntakeBreakdown11kg {
  parsi: number;
  butane: number;
  iranGazi?: number;
  forklift?: number;
  iraqi: number;
}

export interface ValveIntakeBreakdownForklift22kg {
  parsi?: number;
  butane: number;
  iranGazi: number;
  passari: number;
}

export interface ValveIntakeBreakdownPicnic {
  parsi: number;
  butane: number;
}

export interface ValveIntakeRecordParams {
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  sourceType?: 'CUSTOMER' | 'SUPPLIER'; // مبدأ: طرف حساب (مشتری) یا تأمین‌کننده (شعبه ام گاز)
  date: string;
  sheetNumber: string;
  driverName?: string;
  plateNumber?: string;
  notes?: string;
  valves11kgNew: ValveIntakeBreakdown11kg;
  valves11kgUsed: ValveIntakeBreakdown11kg;
  valvesForklift22kgNew?: ValveIntakeBreakdownForklift22kg;
  valvesForklift22kgUsed?: ValveIntakeBreakdownForklift22kg;
  valvesPicnicNew?: ValveIntakeBreakdownPicnic;
  valvesPicnicUsed?: ValveIntakeBreakdownPicnic;
  valvesPicnic58kgNew?: ValveIntakeBreakdownPicnic;
  valvesPicnic58kgUsed?: ValveIntakeBreakdownPicnic;
  valvesPicnic5kg?: ValveIntakeBreakdownPicnic;
  valvesPicnic2kg?: ValveIntakeBreakdownPicnic;
}

export interface ValveIntakeResult {
  success: boolean;
  entryId: string;
  totalNewValves: number;
  totalUsedValves: number;
  totalAllValves: number;
  itemsCount: number;
  summaryText: string;
  entry: GasKardexEntry;
}

export interface SecurityPolicyState {
  strictDomainLock: boolean;
  allowedDomain: string;
  enforceDeviceBinding: boolean;
  requireStrongPassword: boolean;
  tamperProtectionEnabled: boolean;
  databaseWriteProtected: boolean;
  internalManagerMaxEditWindowHours: number; // 0 = unlimited (1-hour restriction disabled for all users)
  failedAttempts: Record<string, number>;
  lockedUntil: Record<string, number>;
}

export interface LocalDatabaseState {
  environment: RuntimeEnvironment;
  deviceId: string;
  dbName: string;
  users: User[];
  security_policy: SecurityPolicyState;
  products: Product[];
  categories: Category[];
  customers: Customer[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  stock_movements: StockMovement[];
  sales: Sale[];
  purchases: Purchase[];
  invoices: Invoice[];
  gas_kardex_entries: GasKardexEntry[];
  gas_production_kardex_entries?: GasProductionKardexEntry[];
  goods_receipts: GoodsReceiptRecord[];
  cylinder_valve_inspections: CylinderValveInspection[];
  custom_cylinder_item_types: CustomCylinderItemType[];
  cylinder_tank_mappings?: CylinderTankMapping[];
  deleted_cylinder_mapping_ids?: string[];
  sync_events: SyncEvent[];
  sync_queue: SyncQueueItem[];
  sync_state: SyncState;
  audit_logs: AuditLog[];
  notifications?: AppNotification[];
  isOfflineSimulated: boolean;
  is_purged?: boolean;
  purged_at?: string;
  purge_preserve_products?: boolean;
  pending_purge_sync?: {
    mode: 'ZERO_ALL' | 'PURGE_EXCEPT_PRODUCTS' | 'FULL_PURGE';
    purged_at: string;
    preserve_products: boolean;
    author: string;
    password_hash?: string;
    answer_hash?: string;
  };
  deleted_entity_ids?: string[];
  is_stock_zeroed_v2?: boolean;
  stock_zeroed_at?: string;
  test_items_purged?: boolean;
  test_items_purged_at?: string;
  customers_purged_for_excel_v1?: boolean;
}

const STORAGE_KEYS: Record<RuntimeEnvironment, string> = {
  OFFICE_WIN11: 'mgas_db_office_sqlite_v6',
  WAREHOUSE_WIN7: 'mgas_db_warehouse_sqlite_v6',
  CLOUD_WEB: 'mgas_db_cloud_web_v6'
};

const TOMBSTONE_STORAGE_KEY = 'mgas_permanently_deleted_ids_v1';
const DELETED_CUSTOM_ITEMS_KEY = 'mgas_deleted_custom_item_types_v1';

function getInitialState(env: RuntimeEnvironment): LocalDatabaseState {
  const deviceId =
    env === 'OFFICE_WIN11'
      ? 'OFFICE-PC-001'
      : env === 'WAREHOUSE_WIN7'
      ? 'WAREHOUSE-PC-001'
      : 'WEB-001';

  const dbName =
    env === 'OFFICE_WIN11'
      ? 'Office SQLite (Win 11)'
      : env === 'WAREHOUSE_WIN7'
      ? 'Warehouse SQLite (Win 7)'
      : 'Cloud D1 (Direct)';

  return {
    environment: env,
    deviceId,
    dbName,
    products: JSON.parse(JSON.stringify(SEED_PRODUCTS)),
    categories: JSON.parse(JSON.stringify(SEED_CATEGORIES)),
    customers: JSON.parse(JSON.stringify(SEED_CUSTOMERS)),
    suppliers: JSON.parse(JSON.stringify(SEED_SUPPLIERS)),
    warehouses: JSON.parse(JSON.stringify(SEED_WAREHOUSES)),
    stock_movements: [],
    sales: [],
    purchases: [],
    invoices: [],
    gas_kardex_entries: [],
    gas_production_kardex_entries: JSON.parse(JSON.stringify(SEED_GAS_PRODUCTION_KARDEX_ENTRIES)),
    goods_receipts: [],
    cylinder_valve_inspections: [],
    custom_cylinder_item_types: JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES)),
    cylinder_tank_mappings: JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS)),
    sync_events: [],
    sync_queue: [],
    sync_state: {
      device_id: deviceId,
      last_server_sequence: 1000,
      last_synced_at: new Date().toISOString(),
      pending_events_count: 0,
      status: 'ONLINE'
    },
    audit_logs: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
    notifications: [],
    users: JSON.parse(JSON.stringify(SEED_USERS)),
    security_policy: {
      strictDomainLock: true,
      allowedDomain: 'anbar.mgas.ir',
      enforceDeviceBinding: true,
      requireStrongPassword: true,
      tamperProtectionEnabled: true,
      databaseWriteProtected: false,
      internalManagerMaxEditWindowHours: 0,
      failedAttempts: {},
      lockedUntil: {}
    },
    isOfflineSimulated: false,
    deleted_entity_ids: []
  };
}

export class LocalStorageManager {
  private static states: Partial<Record<RuntimeEnvironment, LocalDatabaseState>> = {};

  private static listeners: Array<() => void> = [];

  static subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notify() {
    const runNotify = () => {
      this.listeners.forEach(l => {
        try {
          l();
        } catch (err) {
          console.warn('Listener notification error:', err);
        }
      });
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('mgas:db_refreshed'));
          window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        } catch {}
      }
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(runNotify);
    } else {
      setTimeout(runNotify, 0);
    }
  }

  private static permanentlyDeletedIds = new Set<string>();

  /**
   * Permanent Tombstone Registry: In-memory registry ensuring items deleted forever never resurrect
   */
  static getPermanentlyDeletedIds(): Set<string> {
    return this.permanentlyDeletedIds;
  }

  static markEntityPermanentlyDeleted(entityId: string) {
    if (!entityId) return;
    const cleanId = String(entityId).trim();
    if (!cleanId) return;

    this.permanentlyDeletedIds.add(cleanId);

    // Synchronize tombstone and strip entity across ALL 3 database states
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const env of allEnvs) {
      try {
        const s = this.states[env] || this.getState(env);
        if (s) {
          if (!s.deleted_entity_ids) s.deleted_entity_ids = [];
          if (!s.deleted_entity_ids.includes(cleanId)) {
            s.deleted_entity_ids.push(cleanId);
          }
          if (s.gas_kardex_entries) {
            s.gas_kardex_entries = s.gas_kardex_entries.filter(e => e.entry_id !== cleanId);
          }
          if (s.cylinder_valve_inspections) {
            s.cylinder_valve_inspections = s.cylinder_valve_inspections.filter(i => i.inspection_id !== cleanId && i.form_number !== cleanId);
          }
          if (s.stock_movements) {
            s.stock_movements = s.stock_movements.filter(m => m.movement_id !== cleanId && m.movement_id !== `MOV-INSP-${cleanId}`);
          }
          if (s.goods_receipts) {
            s.goods_receipts = s.goods_receipts.filter(r => r.receipt_id !== cleanId && r.entry_id !== cleanId);
          }
          if (s.invoices) {
            s.invoices = s.invoices.filter(i => i.invoice_id !== cleanId);
          }
          if (s.custom_cylinder_item_types) {
            s.custom_cylinder_item_types = s.custom_cylinder_item_types.filter(c => c.id !== cleanId);
          }
          if (s.suppliers) {
            s.suppliers = s.suppliers.filter(sup => sup.supplier_id !== cleanId);
          }
          if (s.customers) {
            s.customers = s.customers.filter(c => c.customer_id !== cleanId);
          }
          this.saveState(env, s);
        }
      } catch {}
    }
  }

  static isEntityPermanentlyDeleted(entityId: string): boolean {
    if (!entityId) return false;
    const cleanId = String(entityId).trim();
    if (!cleanId) return false;
    const ids = this.getPermanentlyDeletedIds();
    return ids.has(cleanId);
  }

  private static persistDebounceTimers: Partial<Record<RuntimeEnvironment, any>> = {};

  private static async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject('IndexedDB unavailable');
      }
      const req = window.indexedDB.open('mgas_storage_v1', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'env' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private static async saveStateToIndexedDB(env: string, state: LocalDatabaseState): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      store.put({ env, data: state, updated_at: Date.now() });
    } catch {}
  }

  private static async loadStateFromIndexedDB(env: string): Promise<LocalDatabaseState | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    try {
      const db = await this.openIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const req = store.get(env);
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private static async flushIndexedDBNow(env: RuntimeEnvironment, state: LocalDatabaseState): Promise<void> {
    if (this.persistDebounceTimers[env]) {
      clearTimeout(this.persistDebounceTimers[env]);
      delete this.persistDebounceTimers[env];
    }
    if (typeof window !== 'undefined') {
      try {
        const key = STORAGE_KEYS[env] || `mgas_db_${env}`;
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {}
    }
    await this.saveStateToIndexedDB(env, state);
  }

  private static buildCompactLocalStorageState(state: LocalDatabaseState): LocalDatabaseState {
    const pendingQueue = (state.sync_queue || []).filter(q => q && q.status !== 'CONFIRMED');
    const confirmedQueue = (state.sync_queue || []).filter(q => q && q.status === 'CONFIRMED').slice(-50);
    return {
      ...state,
      sync_queue: [...confirmedQueue, ...pendingQueue],
      audit_logs: (state.audit_logs || []).slice(0, 250),
      notifications: (state.notifications || []).slice(0, 150)
    };
  }

  private static persistStateToClient(env: RuntimeEnvironment, state: LocalDatabaseState) {
    if (typeof window === 'undefined') return;

    // 1. Synchronously and immediately persist to localStorage (0ms delay prevents losing edits on page reload)
    const key = STORAGE_KEYS[env] || `mgas_db_${env}`;
    const compactState = this.buildCompactLocalStorageState(state);
    try {
      window.localStorage.setItem(key, JSON.stringify(compactState));
    } catch (err) {
      // QuotaExceededError fallback: strip historical CONFIRMED sync_events copies from localStorage
      // while preserving 100% of gas_kardex_entries, stock_movements, goods_receipts, inspections, and PENDING queue,
      // and immediately flush full state to IndexedDB.
      try {
        const ultraCompactState: LocalDatabaseState = {
          ...compactState,
          sync_events: (compactState.sync_events || []).slice(-100)
        };
        window.localStorage.setItem(key, JSON.stringify(ultraCompactState));
      } catch (innerErr) {
        console.warn('[LocalStorageManager] Storage quota or persistence warning:', innerErr || err);
      }
      this.saveStateToIndexedDB(env, state).catch(() => {});
    }

    // 2. Debounced background write to IndexedDB
    if (this.persistDebounceTimers[env]) {
      clearTimeout(this.persistDebounceTimers[env]);
    }

    this.persistDebounceTimers[env] = setTimeout(() => {
      this.saveStateToIndexedDB(env, state).catch(() => {});
    }, 60);
  }

  /**
   * Load active environment state with immediate persistence restoration.
   * Guarantees 0ms local boot: restored instantly from localStorage / IndexedDB.
   */
  static loadState(env: RuntimeEnvironment): LocalDatabaseState {
    if (!this.states) {
      this.states = {};
    }

    if (this.states[env]) {
      return this.states[env]!;
    }

    let loadedState: LocalDatabaseState | null = null;

    // 1. Instant synchronous restore from localStorage
    if (typeof window !== 'undefined') {
      try {
        const key = STORAGE_KEYS[env] || `mgas_db_${env}`;
        const raw = (typeof window.localStorage !== 'undefined' && window.localStorage) ? window.localStorage.getItem(key) : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            loadedState = parsed;
          }
        }
      } catch (e) {
        console.warn('[LocalStorageManager] Could not read local storage state:', e);
      }
    }

    // 2. Fallback to initial seed state
    if (!loadedState) {
      loadedState = getInitialState(env);
    }

    // Hydrate permanent tombstone registry from persisted state
    if (Array.isArray(loadedState.deleted_entity_ids)) {
      loadedState.deleted_entity_ids.forEach((id) => {
        if (id && typeof id === 'string') {
          this.permanentlyDeletedIds.add(id.trim());
        }
      });
    }

    this.ensureSeedUsersExist(loadedState);
    this.ensureValveProductsExist(loadedState);
    this.ensureNutCategoryAndProductsExist(loadedState);
    this.ensureExcelCustomersLoaded(loadedState);
    this.ensureSuppliersLoaded(loadedState);
    this.ensureProductionKardexLoaded(loadedState);
    this.ensureCylinderTankMappingsLoaded(loadedState);
    this.ensureCustomItemTypesLoaded(loadedState);
    this.ensureKardexWaybillAndDispatchedHealed(loadedState);
    this.states[env] = loadedState;

    // 3. Background reconciliation with IndexedDB (Safe event merge that never overwrites user edits)
    if (typeof window !== 'undefined') {
      this.loadStateFromIndexedDB(env).then((idbState) => {
        if (!idbState) return;
        const current = this.states[env];
        if (!current) {
          this.ensureSeedUsersExist(idbState);
          this.ensureValveProductsExist(idbState);
          this.ensureNutCategoryAndProductsExist(idbState);
          this.states[env] = idbState;
          this.notify();
          return;
        }

        // Never resurrect pre-purge state or replay pre-purge events from IndexedDB
        const currentPurgedMs = current.purged_at ? new Date(current.purged_at).getTime() : 0;
        const idbPurgedMs = idbState.purged_at ? new Date(idbState.purged_at).getTime() : 0;

        if (idbState.is_purged && idbPurgedMs > currentPurgedMs) {
          this.applyPurgeInPlace(
            current,
            idbState.purged_at!,
            idbState.purge_preserve_products !== false,
            'IndexedDB',
            idbState.sync_state?.last_server_sequence
          );
          this.saveState(env, current);
          return;
        }

        const effectivePurgedMs = Math.max(currentPurgedMs, idbPurgedMs);
        const existingEventIds = new Set((current.sync_events || []).map(e => e.event_id));
        let hasNewEvents = false;
        const getRecordMs = (item: any) => {
          const c = item?.created_at ? new Date(item.created_at).getTime() : 0;
          const u = item?.updated_at ? new Date(item.updated_at).getTime() : 0;
          return Math.max(isNaN(c) ? 0 : c, isNaN(u) ? 0 : u);
        };

        for (const ev of idbState.sync_events || []) {
          if (!ev?.event_id || existingEventIds.has(ev.event_id)) continue;
          const evRawTime = (ev as any).timestamp || ev.client_created_at || (ev as any).server_received_at;
          const evMs = evRawTime ? new Date(evRawTime).getTime() : 0;
          if (effectivePurgedMs > 0 && evMs > 0 && evMs <= effectivePurgedMs && ev.entity_type !== 'USER' && ev.entity_type !== 'SYSTEM') {
            continue;
          }
          this.applyPayloadToLocalState(current, ev);
          if (!current.sync_events.some(e => e.event_id === ev.event_id)) {
            current.sync_events.push(ev);
          }
          existingEventIds.add(ev.event_id);
          hasNewEvents = true;
        }

        // Also reconcile any post-purge transactional entities saved in IndexedDB (e.g. if localStorage hit quota)
        const existingKardexIds = new Set((current.gas_kardex_entries || []).map(k => k.entry_id));
        for (const gk of idbState.gas_kardex_entries || []) {
          if (!gk?.entry_id || existingKardexIds.has(gk.entry_id) || this.isEntityPermanentlyDeleted(gk.entry_id)) continue;
          if (effectivePurgedMs > 0 && getRecordMs(gk) <= effectivePurgedMs) continue;
          if (!current.gas_kardex_entries) current.gas_kardex_entries = [];
          current.gas_kardex_entries.push(gk);
          existingKardexIds.add(gk.entry_id);
          hasNewEvents = true;
        }

        const existingReceiptIds = new Set((current.goods_receipts || []).map(r => r.receipt_id));
        for (const rc of idbState.goods_receipts || []) {
          if (!rc?.receipt_id || existingReceiptIds.has(rc.receipt_id) || this.isEntityPermanentlyDeleted(rc.receipt_id)) continue;
          if (effectivePurgedMs > 0 && getRecordMs(rc) <= effectivePurgedMs) continue;
          if (!current.goods_receipts) current.goods_receipts = [];
          current.goods_receipts.push(rc);
          existingReceiptIds.add(rc.receipt_id);
          hasNewEvents = true;
        }

        const existingInspIds = new Set((current.cylinder_valve_inspections || []).map(i => i.inspection_id));
        for (const insp of idbState.cylinder_valve_inspections || []) {
          if (!insp?.inspection_id || existingInspIds.has(insp.inspection_id) || this.isEntityPermanentlyDeleted(insp.inspection_id)) continue;
          if (effectivePurgedMs > 0 && getRecordMs(insp) <= effectivePurgedMs) continue;
          if (!current.cylinder_valve_inspections) current.cylinder_valve_inspections = [];
          current.cylinder_valve_inspections.push(insp);
          existingInspIds.add(insp.inspection_id);
          hasNewEvents = true;
        }

        const existingMovIds = new Set((current.stock_movements || []).map(m => m.movement_id));
        for (const mov of idbState.stock_movements || []) {
          if (!mov?.movement_id || existingMovIds.has(mov.movement_id) || this.isEntityPermanentlyDeleted(mov.movement_id)) continue;
          if (effectivePurgedMs > 0 && getRecordMs(mov) <= effectivePurgedMs) continue;
          if (!current.stock_movements) current.stock_movements = [];
          current.stock_movements.push(mov);
          existingMovIds.add(mov.movement_id);
          hasNewEvents = true;
        }

        if (hasNewEvents) {
          this.persistStateToClient(env, current);
          this.notify();
        }
      }).catch(() => {});
    }

    return loadedState;
  }

  /**
   * Save active environment state in RAM with immutable array cloning and instant client persistence.
   * Guaranteed: Immediate UI reactivity across all React components and permanent storage.
   */
  static saveState(env: RuntimeEnvironment, state: LocalDatabaseState) {
    if (!this.states) {
      this.states = {};
    }

    // Defensive immutable collection cloning so React useMemo and component dependencies immediately detect mutations
    const immutableState: LocalDatabaseState = {
      ...state,
      gas_kardex_entries: state.gas_kardex_entries ? [...state.gas_kardex_entries] : [],
      gas_production_kardex_entries: state.gas_production_kardex_entries ? [...state.gas_production_kardex_entries] : [],
      cylinder_valve_inspections: state.cylinder_valve_inspections ? [...state.cylinder_valve_inspections] : [],
      stock_movements: state.stock_movements ? [...state.stock_movements] : [],
      products: state.products ? [...state.products] : [],
      categories: state.categories ? [...state.categories] : [],
      customers: state.customers ? [...state.customers] : [],
      suppliers: state.suppliers ? [...state.suppliers] : [],
      warehouses: state.warehouses ? [...state.warehouses] : [],
      goods_receipts: state.goods_receipts ? [...state.goods_receipts] : [],
      invoices: state.invoices ? [...state.invoices] : [],
      custom_cylinder_item_types: state.custom_cylinder_item_types ? [...state.custom_cylinder_item_types] : [],
      cylinder_tank_mappings: state.cylinder_tank_mappings ? [...state.cylinder_tank_mappings] : [],
      users: state.users ? [...state.users] : [],
      notifications: state.notifications ? [...state.notifications] : [],
      sync_queue: state.sync_queue ? [...state.sync_queue] : [],
      audit_logs: state.audit_logs ? [...state.audit_logs] : []
    };

    this.states[env] = immutableState;

    // Notify all reactive UI subscribers immediately (0ms)
    this.notify();

    // Persist to local client disk (localStorage + IndexedDB)
    this.persistStateToClient(env, immutableState);
  }

  static getState(env: RuntimeEnvironment): LocalDatabaseState {
    if (!this.states) {
      this.states = {};
    }
    const state = this.states[env] || this.loadState(env);
    this.ensureSeedUsersExist(state);
    this.ensureValveProductsExist(state);
    this.ensureNutCategoryAndProductsExist(state);
    this.ensureExcelCustomersLoaded(state);
    this.ensureSuppliersLoaded(state);
    this.ensureProductionKardexLoaded(state);
    this.ensureCylinderTankMappingsLoaded(state);
    this.ensureCustomItemTypesLoaded(state);
    this.ensureKardexWaybillAndDispatchedHealed(state);
    return state;
  }

  static getProducts(env: RuntimeEnvironment): Product[] {
    return this.getState(env).products || [];
  }

  static resetDatabase(env: RuntimeEnvironment) {
    const fresh = getInitialState(env);
    this.saveState(env, fresh);
  }

  static updateWarehouseShelf(env: RuntimeEnvironment, warehouse_id: string, shelf_letter: string, shelf_number: number) {
    const s = this.getState(env);
    const shelf_location = `${shelf_letter.toUpperCase()}${shelf_number}`;
    s.warehouses = s.warehouses.map(w => {
      if (w.warehouse_id === warehouse_id) {
        return {
          ...w,
          shelf_location,
          shelf_letter: shelf_letter.toUpperCase(),
          shelf_number
        };
      }
      return w;
    });
    this.saveState(env, s);
  }

  private static resetLocalSerialCounters() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('mgas_last_serial')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
    } catch {}
  }

  static getRecordTimestampMs(item: any): number {
    if (!item) return 0;
    const rawC = item.created_at ? new Date(item.created_at).getTime() : 0;
    const rawU = item.updated_at ? new Date(item.updated_at).getTime() : 0;
    const rawT = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return Math.max(
      isNaN(rawC) ? 0 : rawC,
      isNaN(rawU) ? 0 : rawU,
      isNaN(rawT) ? 0 : rawT
    );
  }

  static hasPrePurgeRecords(state: LocalDatabaseState, purgedAt: string): boolean {
    const purgedMs = purgedAt ? new Date(purgedAt).getTime() : 0;
    if (!purgedMs || isNaN(purgedMs)) return false;
    const checkArr = (arr?: any[]) => (arr || []).some(item => this.getRecordTimestampMs(item) <= purgedMs);
    return (
      checkArr(state.stock_movements) ||
      checkArr(state.gas_kardex_entries) ||
      checkArr(state.gas_production_kardex_entries) ||
      checkArr(state.goods_receipts) ||
      checkArr(state.cylinder_valve_inspections) ||
      checkArr(state.invoices) ||
      checkArr(state.sales) ||
      checkArr(state.purchases) ||
      checkArr(state.notifications)
    );
  }

  static applyPurgeInPlace(
    state: LocalDatabaseState,
    purgedAt: string,
    preserveProducts: boolean = true,
    authorName: string = 'مدیریت ارشد',
    serverSequence?: number
  ): boolean {
    const purgedMs = purgedAt ? new Date(purgedAt).getTime() : Date.now();
    const existingPurgedMs = state.purged_at ? new Date(state.purged_at).getTime() : 0;

    // Never allow an older/historical purge replay to wipe newer post-purge state
    if (state.is_purged && existingPurgedMs > purgedMs) {
      if (serverSequence && serverSequence > 0 && state.sync_state) {
        state.sync_state.last_server_sequence = Math.max(state.sync_state.last_server_sequence || 0, serverSequence);
      }
      return false;
    }

    const keepStrictlyPostPurge = <T>(arr: T[] | undefined): T[] => {
      if (!Array.isArray(arr) || arr.length === 0) return [];
      return arr.filter(item => this.getRecordTimestampMs(item) > purgedMs);
    };

    const prevCounts =
      (state.stock_movements?.length || 0) +
      (state.gas_kardex_entries?.length || 0) +
      (state.gas_production_kardex_entries?.length || 0) +
      (state.goods_receipts?.length || 0) +
      (state.cylinder_valve_inspections?.length || 0) +
      (state.invoices?.length || 0) +
      (state.sales?.length || 0) +
      (state.purchases?.length || 0) +
      (state.notifications?.length || 0);

    state.stock_movements = keepStrictlyPostPurge(state.stock_movements);
    state.gas_kardex_entries = keepStrictlyPostPurge(state.gas_kardex_entries);
    state.gas_production_kardex_entries = keepStrictlyPostPurge(state.gas_production_kardex_entries);
    state.goods_receipts = keepStrictlyPostPurge(state.goods_receipts);
    state.cylinder_valve_inspections = keepStrictlyPostPurge(state.cylinder_valve_inspections);
    state.invoices = keepStrictlyPostPurge(state.invoices);
    state.sales = keepStrictlyPostPurge(state.sales);
    state.purchases = keepStrictlyPostPurge(state.purchases);
    state.notifications = keepStrictlyPostPurge(state.notifications);

    const nextCounts =
      state.stock_movements.length +
      state.gas_kardex_entries.length +
      state.gas_production_kardex_entries.length +
      state.goods_receipts.length +
      state.cylinder_valve_inspections.length +
      state.invoices.length +
      state.sales.length +
      state.purchases.length +
      state.notifications.length;

    const removedAnyData = nextCounts < prevCounts;

    if (!preserveProducts && (!state.is_purged || purgedMs > existingPurgedMs)) {
      state.products = [];
    }

    // Preserve USER identity/password events and strictly post-purge events only
    state.sync_queue = (state.sync_queue || []).filter(q => {
      if (!q?.event) return false;
      if (q.event.entity_type === 'USER') return true;
      const t = q.created_at ? new Date(q.created_at).getTime() : 0;
      return t > purgedMs;
    });

    state.sync_events = (state.sync_events || []).filter(ev => {
      if (!ev) return false;
      if (ev.entity_type === 'USER' || ev.entity_type === 'SYSTEM') return true;
      const rawTime = (ev as any).timestamp || ev.client_created_at || (ev as any).server_received_at;
      const t = rawTime ? new Date(rawTime).getTime() : 0;
      return t > purgedMs;
    });

    const isFreshPurgeAdvance = !state.is_purged || purgedMs > existingPurgedMs;
    state.is_purged = true;
    state.purged_at = existingPurgedMs > purgedMs ? state.purged_at : purgedAt;
    state.purge_preserve_products = preserveProducts;
    state.is_stock_zeroed_v2 = true;
    state.stock_zeroed_at = state.purged_at;

    // Clear pending purge flag once authoritative server/cloud purge timestamp catches up
    if (serverSequence && serverSequence > 0 && state.pending_purge_sync) {
      const pendingMs = new Date(state.pending_purge_sync.purged_at).getTime();
      if (purgedMs >= pendingMs) {
        state.pending_purge_sync = undefined;
      }
    }

    if (state.sync_state) {
      state.sync_state.last_synced_at = purgedAt;
      state.sync_state.pending_events_count = state.sync_queue.filter(q => q.status === 'PENDING').length;
      if (serverSequence && serverSequence > 0) {
        state.sync_state.last_server_sequence = Math.max(state.sync_state.last_server_sequence || 0, serverSequence);
      }
    }

    if (isFreshPurgeAdvance || removedAnyData) {
      state.audit_logs = [
        {
          audit_id: `AUDIT-PURGE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action: 'DATABASE_PURGED',
          entity_type: 'SYSTEM',
          entity_id: 'GLOBAL_PURGE',
          user_id: 'USR-001',
          device_id: state.deviceId || 'DEVICE-ADMIN',
          timestamp: purgedAt,
          metadata: {
            author: authorName,
            preserve_products: preserveProducts,
            environment: state.environment,
            wiped_at: purgedAt
          }
        },
        ...(state.audit_logs || []).filter(a => this.getRecordTimestampMs(a) > purgedMs)
      ];
    }

    return isFreshPurgeAdvance || removedAnyData;
  }

  static applyRemotePurgeToLocalState(
    env: RuntimeEnvironment,
    purgedAt: string,
    preserveProducts: boolean = true,
    authorName: string = 'مدیریت ارشد',
    serverSequence?: number
  ): LocalDatabaseState {
    const state = this.getState(env);
    this.applyPurgeInPlace(state, purgedAt, preserveProducts, authorName, serverSequence);
    this.resetLocalSerialCounters();
    this.saveState(env, state);
    this.flushIndexedDBNow(env, this.getState(env)).catch(() => {});
    return this.getState(env);
  }

  /**
   * Complete Warehouse Stock Zeroing & Reports Purge (Preserving Products Catalog)
   * Clears all stock movements, gas kardex entries, production kardex, receipts, invoices,
   * inspections, notifications, and report transactions across all warehouses, preserving product definitions.
   */
  static zeroAllWarehouseStock(env: RuntimeEnvironment, authorName: string = 'مدیریت / انباردار', applyToAllEnvs: boolean = true) {
    const envsToZero: RuntimeEnvironment[] = applyToAllEnvs
      ? ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB']
      : [env];

    const now = new Date().toISOString();
    this.resetLocalSerialCounters();

    envsToZero.forEach(targetEnv => {
      const state = this.getState(targetEnv);
      this.applyPurgeInPlace(state, now, true, authorName);
      state.pending_purge_sync = {
        mode: 'PURGE_EXCEPT_PRODUCTS',
        purged_at: now,
        preserve_products: true,
        author: authorName
      };
      this.saveState(targetEnv, state);
      this.flushIndexedDBNow(targetEnv, this.getState(targetEnv)).catch(() => {});
    });

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:database_purged', { detail: { purged_at: now, author: authorName, preserve_products: true } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    this.notify();
    return this.getState(env);
  }

  /**
   * Complete Database & Reports Purge (Preserving Products Catalog)
   * Wipes all stock movements, gas kardex entries, production kardex, receipts, invoices, inspections,
   * sales, purchases, notifications, audit history and reports across all warehouses and environments,
   * while keeping product definitions (names, SKUs, categories, units) 100% intact.
   */
  static purgeDatabaseExceptProducts(env: RuntimeEnvironment, authorName: string = 'مهندس موسی عمویی', applyToAllEnvs: boolean = true): LocalDatabaseState {
    return this.zeroAllWarehouseStock(env, authorName, applyToAllEnvs);
  }

  /**
   * Purge all test / dummy products from warehouse across all environments
   */
  static purgeTestProductsFromWarehouse(env?: RuntimeEnvironment, userId: string = 'USR-001') {
    const envs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    const TEST_PRODUCT_IDS = ['PRD-1001', 'PRD-1002', 'PRD-1003', 'PRD-1004', 'PRD-1005'];
    const TEST_PRODUCT_SKUS = ['PRD-TL-01', 'PRD-VL-02', 'PRD-EL-03', 'PRD-LB-04', 'PRD-TL-05'];
    const isTestProduct = (p: any) => {
      if (!p) return false;
      if (TEST_PRODUCT_IDS.includes(p.product_id)) return true;
      if (p.sku && TEST_PRODUCT_SKUS.includes(p.sku)) return true;
      const name = p.name || '';
      return (
        name.includes('آچار بکس بادی') ||
        name.includes('شیر توپی فولادی 2 اینچ') ||
        name.includes('کنتاکتور 32 آمپر') ||
        name.includes('روغن هیدرولیک بهران') ||
        name.includes('فرز انگشتی گلو بلند')
      );
    };

    TEST_PRODUCT_IDS.forEach(id => this.markEntityPermanentlyDeleted(id));

    envs.forEach(targetEnv => {
      const state = this.getState(targetEnv);
      if (state.products && Array.isArray(state.products)) {
        state.products = state.products.filter(p => !isTestProduct(p));
      }
      if (state.stock_movements && Array.isArray(state.stock_movements)) {
        state.stock_movements = state.stock_movements.filter(
          m => !TEST_PRODUCT_IDS.includes(m.product_id)
        );
      }
      state.test_items_purged = true;
      state.test_items_purged_at = new Date().toISOString();
      this.saveState(targetEnv, state);
    });

    this.notify();
  }

  /**
   * Delete single product with tombstone & sync across environments
   */
  static deleteProduct(env: RuntimeEnvironment, productId: string, userId: string = 'USR-001') {
    const envs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    this.markEntityPermanentlyDeleted(productId);

    envs.forEach(targetEnv => {
      const state = this.getState(targetEnv);
      const prod = (state.products || []).find(p => p.product_id === productId);
      if (state.products) {
        state.products = state.products.filter(p => p.product_id !== productId);
      }
      if (state.stock_movements) {
        state.stock_movements = state.stock_movements.filter(m => m.product_id !== productId);
      }
      this.recordLocalChange(
        targetEnv,
        userId,
        'PRODUCT',
        'DELETE',
        productId,
        { product_id: productId, name: prod?.name || '' },
        'DELETE_PRODUCT',
        { productId, name: prod?.name || '' }
      );
      this.saveState(targetEnv, state);
    });

    this.notify();
  }

  /**
   * Complete Database Purge
   * Wipes all stock movements, kardex entries, invoices, goods receipts, sync queues, and events.
   * Can purge the active environment or all storage environments simultaneously.
   */
  static purgeAllDatabaseData(
    env: RuntimeEnvironment,
    authorName: string = 'مدیریت ارشد',
    purgeAllEnvs: boolean = true,
    passwordHash?: string,
    answerHash?: string
  ) {
    const envsToPurge: RuntimeEnvironment[] = purgeAllEnvs
      ? ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB']
      : [env];

    const now = new Date().toISOString();
    this.resetLocalSerialCounters();

    envsToPurge.forEach(targetEnv => {
      const state = this.getState(targetEnv);
      this.applyPurgeInPlace(state, now, true, authorName);
      state.pending_purge_sync = {
        mode: 'FULL_PURGE',
        purged_at: now,
        preserve_products: true,
        author: authorName,
        password_hash: passwordHash,
        answer_hash: answerHash
      };
      this.saveState(targetEnv, state);
      this.flushIndexedDBNow(targetEnv, this.getState(targetEnv)).catch(() => {});
    });

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
        window.dispatchEvent(new CustomEvent('mgas:database_purged', { detail: { purged_at: now, author: authorName, preserve_products: true } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated'));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated'));
      }
    } catch {}

    this.notify();
    return true;
  }

  static restoreSeedData(env: RuntimeEnvironment) {
    const fresh = getInitialState(env);
    fresh.is_purged = false;
    fresh.purged_at = undefined;
    this.saveState(env, fresh);
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:database_refreshed'));
      }
    } catch {}
    return fresh;
  }

  static toggleOffline(env: RuntimeEnvironment) {
    const s = this.getState(env);
    s.isOfflineSimulated = !s.isOfflineSimulated;
    s.sync_state.status = s.isOfflineSimulated ? 'OFFLINE' : 'ONLINE';
    this.saveState(env, s);
  }

  // Calculate live stock from immutable movements for this local database
  static getStockQuantities(env: RuntimeEnvironment): Record<string, Record<string, number>> {
    const state = this.getState(env);
    const stock: Record<string, Record<string, number>> = {};

    state.products.forEach(p => {
      stock[p.product_id] = {};
      state.warehouses.forEach(w => {
        stock[p.product_id][w.warehouse_id] = 0;
      });
    });

    for (const mov of state.stock_movements) {
      if (!stock[mov.product_id]) {
        stock[mov.product_id] = {};
      }
      if (stock[mov.product_id][mov.warehouse_id] === undefined) {
        stock[mov.product_id][mov.warehouse_id] = 0;
      }

      const qty = Number(mov.quantity) || 0;
      switch (mov.movement_type) {
        case 'STOCK_IN':
        case 'PURCHASE':
        case 'RETURN_IN':
          stock[mov.product_id][mov.warehouse_id] += qty;
          break;
        case 'STOCK_OUT':
        case 'SALE':
        case 'RETURN_OUT':
          stock[mov.product_id][mov.warehouse_id] -= qty;
          break;
        case 'TRANSFER_IN':
          stock[mov.product_id][mov.warehouse_id] += qty;
          break;
        case 'TRANSFER_OUT':
          stock[mov.product_id][mov.warehouse_id] -= qty;
          // Fallback: If transfer has to_warehouse_id and no paired TRANSFER_IN exists, update destination warehouse
          if (mov.to_warehouse_id) {
            const destWh = mov.to_warehouse_id;
            const hasPairedIn = state.stock_movements.some(other =>
              other.movement_type === 'TRANSFER_IN' &&
              other.warehouse_id === destWh &&
              (other.reference_id === mov.reference_id || (other as any).linked_transfer_id === mov.movement_id)
            );
            if (!hasPairedIn) {
              const destProd = (mov.item_condition === 'DEFECTIVE' && (mov.product_id === 'PRD-VALVE-NEW' || mov.product_id.includes('VALVE')))
                ? 'PRD-VALVE-DEFECTIVE'
                : mov.product_id;
              if (!stock[destProd]) stock[destProd] = {};
              if (stock[destProd][destWh] === undefined) stock[destProd][destWh] = 0;
              stock[destProd][destWh] += qty;
            }
          }
          break;
        case 'ADJUSTMENT':
          stock[mov.product_id][mov.warehouse_id] += qty;
          break;
      }
    }
    return stock;
  }

  /**
   * Ensures all seed users (Mr. Amouei, Mrs. Karami, Mr. Hajivand, Mrs. Safaei, Mrs. Hakimi) exist in state.users
   */
  static ensureSeedUsersExist(state: LocalDatabaseState) {
    if (!state.users || !Array.isArray(state.users) || state.users.length === 0) {
      state.users = JSON.parse(JSON.stringify(SEED_USERS));
      return;
    }

    for (const seedUser of SEED_USERS) {
      const existingIdx = state.users.findIndex(
        u => u.user_id === seedUser.user_id || u.username.toLowerCase() === seedUser.username.toLowerCase()
      );
      if (existingIdx === -1) {
        state.users.push(JSON.parse(JSON.stringify(seedUser)));
      } else {
        const existing = state.users[existingIdx];
        if (!existing.allowed_device_id && seedUser.allowed_device_id) {
          existing.allowed_device_id = seedUser.allowed_device_id;
        }
        if (!existing.system_id && seedUser.system_id) {
          existing.system_id = seedUser.system_id;
        }
        if (!existing.system_name && seedUser.system_name) {
          existing.system_name = seedUser.system_name;
        }
      }
    }
  }

  /**
   * Ensures standard valve products ("شیر 11/25/50 کیلویی", "شیر پیکنیک 1/1.5/3 لیتری", "شیر 5 و 6 کیلویی") exist in product catalog.
   * Respects user modifications: never forcefully resets names on reload/refresh!
   */
  static ensureValveProductsExist(state: LocalDatabaseState) {
    if (!state.products) state.products = [];

    // Migrate old unedited "قطعه شیر نو" to the new standard name "شیر 11/25/50 کیلویی"
    const legacyNew = state.products.find(p => (p.product_id === 'PRD-VALVE-NEW' || p.sku === 'VALVE-NEW') && p.name === 'قطعه شیر نو');
    if (legacyNew && !legacyNew.user_edited) {
      legacyNew.name = 'شیر 11/25/50 کیلویی';
      legacyNew.sku = 'VLV-11-25-50';
    }

    // Remove legacy unedited valves superseded by standard valves (keep used valves)
    const legacyValveNames = [
      'شیر توپی فولادی 2 اینچ',
      'قطعه شیر معیوب و ضایعات'
    ];
    state.products = state.products.filter(p => {
      if (p.category_id === 'CAT-02' && legacyValveNames.includes(p.name?.trim()) && !p.user_edited) {
        return false;
      }
      return true;
    });

    const defaultValves = [
      {
        id: 'PRD-VLV-11-25-50',
        sku: 'VLV-11-25-50',
        name: 'شیر 11/25/50 کیلویی',
        price: 1850000,
        desc: 'شیر استاندارد کپسول‌های ۱۱، ۲۵ و ۵۰ کیلویی ام‌گاز'
      },
      {
        id: 'PRD-VLV-PK-1-1.5-3',
        sku: 'VLV-PK-1-1.5-3',
        name: 'شیر پیکنیک 1/1.5/3 لیتری',
        price: 950000,
        desc: 'شیر برنجی سیلندرهای پیکنیکی کوچک ۱، ۱.۵ و ۳ لیتری'
      },
      {
        id: 'PRD-VLV-PK-USED',
        sku: 'VLV-PK-USD',
        name: 'شیر کهنه پیکنیک 1/1.5/3 لیتری',
        price: 400000,
        desc: 'شیر کهنه و داغی سیلندرهای پیکنیکی ۱، ۱.۵ و ۳ لیتری'
      },
      {
        id: 'PRD-VLV-PK-5-8',
        sku: 'VLV-PK-5-8',
        name: 'شیر پیکنیک 5/8 کیلویی',
        price: 1250000,
        desc: 'شیر برنجی کپسول‌های پیکنیکی ۵ و ۸ کیلویی ام‌گاز'
      },
      {
        id: 'PRD-VLV-PK-5-8-USED',
        sku: 'VLV-PK-5-8-USD',
        name: 'شیر کهنه پیکنیک 5/8 کیلویی',
        price: 450000,
        desc: 'شیر کهنه و داغی کپسول‌های پیکنیکی ۵ و ۸ کیلویی'
      },
      {
        id: 'PRD-VALVE-FORKLIFT',
        sku: 'VLV-LIFT-LIQ',
        name: 'شیر نو لیفتراکی',
        price: 2100000,
        desc: 'شیر استاندارد سیلندرهای سوخت لیفتراک ام‌گاز (فاز مایع و بخار)'
      },
      {
        id: 'PRD-VLV-LIFT-BUT',
        sku: 'VLV-LIFT-BUT',
        name: 'شیر بوتانی لیفتراکی',
        price: 2100000,
        desc: 'شیر بوتانی استاندارد ۲ شیره فاز مایع و بخار سیلندرهای سوخت لیفتراک'
      },
      {
        id: 'PRD-VLV-LIFT-PAR',
        sku: 'VLV-LIFT-PAR',
        name: 'شیر پاساری لیفتراکی',
        price: 2100000,
        desc: 'شیر پاساری (پرسی) استاندارد ۲ شیره سیلندرهای سوخت لیفتراک ام‌گاز'
      },
      {
        id: 'PRD-VLV-LIFT-IRN',
        sku: 'VLV-LIFT-IRN',
        name: 'شیر ایران‌گازی لیفتراکی',
        price: 2100000,
        desc: 'شیر ایران‌گازی استاندارد ۲ شیره سیلندرهای سوخت لیفتراک ام‌گاز'
      },
      {
        id: 'PRD-VLV-LIFT-IRQ',
        sku: 'VLV-LIFT-IRQ',
        name: 'شیر عراقی لیفتراکی',
        price: 2100000,
        desc: 'شیر عراقی استاندارد ۲ شیره سیلندرهای سوخت لیفتراک ام‌گاز'
      },
      {
        id: 'PRD-VLV-LIFT-USED',
        sku: 'VLV-LIFT-USD',
        name: 'شیر کهنه لیفتراکی',
        price: 550000,
        desc: 'شیر کهنه و داغی سیلندرهای لیفتراک'
      },
      {
        id: 'PRD-VALVE-USED',
        sku: 'VLV-USED-11',
        name: 'شیر کهنه 11/25/50 کیلویی',
        price: 450000,
        desc: 'شیر کهنه و داغی ۱۱، ۲۵ و ۵۰ کیلویی دریافتی از مشتریان و نمایندگی‌ها'
      }
    ];

    for (const v of defaultValves) {
      const existing = state.products.find(
        p => p.product_id === v.id || p.sku === v.sku || p.name.trim() === v.name.trim()
      );
      if (!existing) {
        state.products.push({
          product_id: v.id,
          sku: v.sku,
          name: v.name,
          category_id: 'CAT-02',
          unit: 'عدد',
          min_stock: 30,
          purchase_price: v.price,
          sale_price: Math.round(v.price * 1.35),
          barcode: `6260881${Math.floor(100000 + Math.random() * 900000)}`,
          description: v.desc,
          created_at: '2026-09-01T08:00:00.000Z',
          updated_at: new Date().toISOString()
        });
      }
      // Never overwrite existing product name or details to guarantee user edits persist across refreshes!
    }
  }

  /**
   * Ensures "دسته مهره‌ها" (CAT-NUTS) and the 8 standard nut products exist in categories & product catalog.
   * Respects user modifications: never forcefully resets names on reload/refresh!
   */
  static ensureNutCategoryAndProductsExist(state: LocalDatabaseState) {
    if (!state.categories) state.categories = [];
    let nutCat = state.categories.find(
      c => c.category_id === 'CAT-NUTS' || c.name.includes('مهره') || c.code === 'NUT'
    );
    if (!nutCat) {
      nutCat = {
        category_id: 'CAT-NUTS',
        name: 'دسته مهره‌ها',
        code: 'NUT',
        description: 'انواع مهره‌های ۲ و ۵ و ۱۱/۲۵/۵۰ کیلویی، مخزن زاپاس و تمام مخازن',
        created_at: '2026-09-01T08:00:00.000Z',
        updated_at: new Date().toISOString()
      };
      state.categories.push(nutCat);
    } else {
      if (!nutCat.name.includes('مهره')) {
        nutCat.name = 'دسته مهره‌ها';
      }
    }

    if (!state.products) state.products = [];

    // The 8 nut items requested by the user
    const defaultNuts = [
      { id: 'PRD-NUT-2KG', sku: 'NUT-2KG', name: 'مهره 2 کیلویی', price: 180000, desc: 'مهره برنجی سیلندرهای ۲ کیلویی' },
      { id: 'PRD-NUT-5KG', sku: 'NUT-5KG', name: 'مهره 5 کیلویی', price: 220000, desc: 'مهره برنجی سیلندرهای ۵ کیلویی' },
      { id: 'PRD-NUT-11-25-50-BUT', sku: 'NUT-11-25-50-BUT', name: 'مهره 11/25/50 کیلویی بوتانی', price: 280000, desc: 'مهره برنجی استاندارد سیلندرهای ۱۱، ۲۵ و ۵۰ کیلویی بوتانی' },
      { id: 'PRD-NUT-11-25-50-PRC', sku: 'NUT-11-25-50-PRC', name: 'مهره 11/25/50 کیلویی پرسی', price: 280000, desc: 'مهره برنجی استاندارد سیلندرهای ۱۱، ۲۵ و ۵۰ کیلویی پرسی' },
      { id: 'PRD-NUT-11-25-50-PAS', sku: 'NUT-11-25-50-PAS', name: 'مهره 11/25/50 کیلویی پاساری', price: 280000, desc: 'مهره برنجی استاندارد سیلندرهای ۱۱، ۲۵ و ۵۰ کیلویی پاساری' },
      { id: 'PRD-NUT-11-25-50-IRG', sku: 'NUT-11-25-50-IRG', name: 'مهره 11/25/50 کیلویی ایرانگازی', price: 280000, desc: 'مهره برنجی استاندارد سیلندرهای ۱۱، ۲۵ و ۵۰ کیلویی ایرانگازی' },
      { id: 'PRD-NUT-TANK-SPARE', sku: 'NUT-TANK-SPARE', name: 'مهره مخزن زاپاس', price: 450000, desc: 'مهره و اتصالات یدکی و زاپاس مخازن گاز صنعتی' },
      { id: 'PRD-NUT-TANK-ALL', sku: 'NUT-TANK-ALL', name: 'مهره تمام مخزن ها', price: 520000, desc: 'مهره جامع و فراگیر استاندارد تمام مخازن ثابت و متحرک' }
    ];

    // Remove legacy unedited nuts that were superseded
    const legacyNutNames = [
      'مهره برنجی چپ‌گرد استاندارد',
      'مهره برنجی راست‌گرد استاندارد',
      'مهره کلاه‌دار',
      'مهره ریکشا',
      'مهره فولادی فشارقوی',
      'مهره پیکنیکی',
      'مهره و اتصالات مخزن'
    ];
    state.products = state.products.filter(p => {
      if (p.category_id === nutCat.category_id && legacyNutNames.includes(p.name?.trim()) && !p.user_edited) {
        return false;
      }
      return true;
    });

    for (const n of defaultNuts) {
      const existing = state.products.find(
        p => p.product_id === n.id || p.sku === n.sku || p.name.trim() === n.name.trim()
      );
      if (!existing) {
        state.products.push({
          product_id: n.id,
          sku: n.sku,
          name: n.name,
          category_id: nutCat.category_id,
          unit: 'عدد',
          min_stock: 50,
          purchase_price: n.price,
          sale_price: Math.round(n.price * 1.35),
          barcode: `6260882${Math.floor(100000 + Math.random() * 900000)}`,
          description: n.desc,
          created_at: '2026-09-01T08:00:00.000Z',
          updated_at: new Date().toISOString()
        });
      } else {
        if (existing.category_id !== nutCat.category_id) {
          existing.category_id = nutCat.category_id;
        }
      }
      // Never overwrite existing product name or details to guarantee user edits persist across refreshes!
    }
  }

  /**
   * Ensures all 48 customer profiles from customers.xlsx are registered in state.customers.
   * Note: "شعبه ام گاز" is an internal branch/supplier, NOT a customer.
   */
  static ensureExcelCustomersLoaded(state: LocalDatabaseState) {
    if (!state.customers) state.customers = [];

    // 1. Remove MGas branch from customers list (treat strictly as supplier / internal branch)
    state.customers = state.customers.filter(c =>
      c.customer_id !== 'CUST-MGAS-VALVE' &&
      !c.name?.includes('شعبه امگاز') &&
      !c.name?.includes('شعبه ام گاز') &&
      !c.company_name?.includes('شعبه ام‌گاز') &&
      !c.company_name?.includes('شعبه ام گاز')
    );

    // 2. Ensure all 48 customers from customers.xlsx are present and registered
    for (const xlCust of EXCEL_CUSTOMERS_48) {
      const existingIdx = state.customers.findIndex(c =>
        c.customer_id === xlCust.customer_id ||
        (xlCust.national_id && c.national_id && c.national_id === xlCust.national_id) ||
        (xlCust.company_name && c.company_name && c.company_name.trim() === xlCust.company_name.trim()) ||
        (xlCust.name && c.name && c.name.trim() === xlCust.name.trim())
      );
      if (existingIdx === -1) {
        state.customers.push({ ...xlCust });
      } else {
        state.customers[existingIdx] = {
          ...xlCust,
          ...state.customers[existingIdx],
          row_index: xlCust.row_index,
          registration_number: xlCust.registration_number || state.customers[existingIdx].registration_number,
          fax: xlCust.fax || state.customers[existingIdx].fax,
          employer_phone: xlCust.employer_phone || state.customers[existingIdx].employer_phone,
          postal_code: xlCust.postal_code || state.customers[existingIdx].postal_code
        };
      }
    }
  }

  /**
   * Ensures MGas branch exists as a registered supplier in state.suppliers
   * Fulfills user requirement: "از این پس تامیین کننده ها شعبه ام گاز هستند"
   */
  static ensureSuppliersLoaded(state: LocalDatabaseState) {
    if (!state.suppliers) state.suppliers = [];

    // Do not resurrect SUP-MGAS-BRANCH if explicitly deleted by admin
    if (
      this.isEntityPermanentlyDeleted('SUP-MGAS-BRANCH') ||
      state.deleted_entity_ids?.includes('SUP-MGAS-BRANCH')
    ) {
      return;
    }

    const mgasSupplier: Supplier = {
      supplier_id: 'SUP-MGAS-BRANCH',
      name: 'شعبه ام گاز',
      company_name: 'شرکت ام گاز (شعبه مرکزی تأمین شیرآلات و تجهیزات)',
      phone: '021-44556677',
      province: 'تهران',
      city: 'تهران',
      supplier_type: 'سازمانی',
      address: 'کارخانه مرکزی ام‌گاز - واحد تأمین شیرآلات و سیلندر',
      credit_limit: 10000000000,
      current_balance: 0,
      created_at: '2026-09-01T07:00:00.000Z',
      updated_at: new Date().toISOString()
    };

    const existingIdx = state.suppliers.findIndex(s =>
      s.supplier_id === 'SUP-MGAS-BRANCH' ||
      s.name === 'شعبه ام گاز' ||
      s.name?.includes('شعبه ام گاز') ||
      s.name?.includes('شعبه امگاز')
    );

    if (existingIdx === -1) {
      state.suppliers.unshift(mgasSupplier);
    } else {
      state.suppliers[existingIdx] = {
        ...state.suppliers[existingIdx],
        supplier_id: state.suppliers[existingIdx].supplier_id || 'SUP-MGAS-BRANCH',
        name: state.suppliers[existingIdx].name || 'شعبه ام گاز'
      };
    }
  }

  /**
   * Ensures production kardex entries exist in state
   */
  static ensureProductionKardexLoaded(state: LocalDatabaseState) {
    if (state.is_purged || state.is_stock_zeroed_v2) {
      if (!state.gas_production_kardex_entries) state.gas_production_kardex_entries = [];
      return;
    }
    if (!state.gas_production_kardex_entries || state.gas_production_kardex_entries.length === 0) {
      state.gas_production_kardex_entries = JSON.parse(JSON.stringify(SEED_GAS_PRODUCTION_KARDEX_ENTRIES));
    }
  }

  /**
   * Ensures cylinder/tank catalog and valve/nut mapping definitions exist in state
   */
  static ensureCylinderTankMappingsLoaded(state: LocalDatabaseState) {
    const deletedIds = new Set(state.deleted_cylinder_mapping_ids || []);
    if (!state.cylinder_tank_mappings || !Array.isArray(state.cylinder_tank_mappings) || state.cylinder_tank_mappings.length === 0) {
      state.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS)).filter(
        (m: CylinderTankMapping) => !deletedIds.has(m.id) && !deletedIds.has(m.name)
      );
    } else {
      // Clean up any mapping that was explicitly deleted
      if (deletedIds.size > 0) {
        state.cylinder_tank_mappings = state.cylinder_tank_mappings.filter(
          m => !deletedIds.has(m.id) && !deletedIds.has(m.name)
        );
      }
    }
  }

  /**
   * Ensures custom cylinder item types exist in state
   */
  static ensureCustomItemTypesLoaded(state: LocalDatabaseState) {
    if (!state.custom_cylinder_item_types || !Array.isArray(state.custom_cylinder_item_types) || state.custom_cylinder_item_types.length === 0) {
      state.custom_cylinder_item_types = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
    }
  }

  /**
   * Automatically heals and enriches Gas Kardex entries with waybill numbers and dispatched details
   * from notes, descriptions, linked physical inspections, or linked goods receipts.
   */
  static ensureKardexWaybillAndDispatchedHealed(state: LocalDatabaseState) {
    if (!state.gas_kardex_entries || state.gas_kardex_entries.length === 0) return;
    for (const entry of state.gas_kardex_entries) {
      if ((!entry.dispatched || entry.dispatched === '-' || entry.dispatched === '0' || entry.dispatched === '۰') && !entry.waybill_number) {
        // 1. Try to find waybill from notes or description
        const notesStr = `${entry.notes || ''} ${entry.description || ''}`;
        const m = notesStr.match(/(?:بارنامه|بیجک|حواله)(?:\s+شماره|\s*[:\-]\s*|\s+)([^\s|,;،\n\)]+)/i);
        if (m && m[1] && m[1] !== '-' && m[1] !== 'null') {
          entry.waybill_number = m[1].trim();
          entry.dispatched = entry.waybill_number;
          continue;
        }

        // 2. Try to find from linked inspection by inspection_id
        if (entry.inspection_id && state.cylinder_valve_inspections) {
          const insp = state.cylinder_valve_inspections.find(i => i.inspection_id === entry.inspection_id);
          if (insp && insp.waybill_number) {
            entry.waybill_number = insp.waybill_number;
            entry.dispatched = insp.waybill_number;
            continue;
          }
        }

        // 3. Try to find by transfer_sheet_number matching inspection form_number
        if (entry.transfer_sheet_number && state.cylinder_valve_inspections) {
          const insp = state.cylinder_valve_inspections.find(i => i.form_number === entry.transfer_sheet_number);
          if (insp && insp.waybill_number) {
            entry.waybill_number = insp.waybill_number;
            entry.dispatched = insp.waybill_number;
            continue;
          }
        }

        // 4. Try to find from goods_receipts
        if (state.goods_receipts) {
          const rcp = state.goods_receipts.find(r => r.entry_id === entry.entry_id || (entry.transfer_sheet_number && r.form_number === entry.transfer_sheet_number));
          if (rcp && rcp.waybill_number) {
            entry.waybill_number = rcp.waybill_number;
            entry.dispatched = rcp.waybill_number;
            continue;
          }
        }
      } else if (entry.waybill_number && (!entry.dispatched || entry.dispatched === '-' || entry.dispatched === '0' || entry.dispatched === '۰')) {
        entry.dispatched = entry.waybill_number;
      } else if (entry.dispatched && !entry.waybill_number) {
        entry.waybill_number = entry.dispatched;
      }
    }
  }

  /**
   * Returns all production kardex entries for the given environment
   */
  static getProductionKardexEntries(env: RuntimeEnvironment): GasProductionKardexEntry[] {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    return state.gas_production_kardex_entries || [];
  }

  /**
   * Saves a new production kardex entry and triggers event dispatch
   */
  static saveProductionKardexEntry(
    env: RuntimeEnvironment,
    entry: GasProductionKardexEntry,
    currentUser: User
  ): GasProductionKardexEntry {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) state.gas_production_kardex_entries = [];

    const newEntry: GasProductionKardexEntry = {
      ...entry,
      entry_id: entry.entry_id || generateUUID('PRD'),
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      device_id: currentUser.allowed_device_id,
      event_id: generateUUID('EVT'),
      created_at: entry.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    state.gas_production_kardex_entries.push(newEntry);
    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'CREATE',
      newEntry.entry_id,
      newEntry,
      `ثبت ردیف کاردکس تولید ام‌گاز: ${newEntry.cylinder_type} (برگه ${newEntry.transfer_sheet_number})`
    );

    return newEntry;
  }

  /**
   * Updates an existing production kardex entry
   */
  static updateProductionKardexEntry(
    env: RuntimeEnvironment,
    entry: GasProductionKardexEntry,
    currentUser: User
  ): GasProductionKardexEntry {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) state.gas_production_kardex_entries = [];

    const idx = state.gas_production_kardex_entries.findIndex(e => e.entry_id === entry.entry_id);
    if (idx === -1) {
      throw new Error('ردیف مورد نظر در کاردکس تولید یافت نشد.');
    }

    const updatedEntry: GasProductionKardexEntry = {
      ...state.gas_production_kardex_entries[idx],
      ...entry,
      updated_at: new Date().toISOString()
    };

    state.gas_production_kardex_entries[idx] = updatedEntry;
    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'UPDATE',
      updatedEntry.entry_id,
      updatedEntry,
      `ویرایش ردیف کاردکس تولید ام‌گاز: ${updatedEntry.cylinder_type} (برگه ${updatedEntry.transfer_sheet_number})`
    );

    return updatedEntry;
  }

  /**
   * Trashes (soft deletes) a production kardex entry
   */
  static trashProductionKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    currentUser: User,
    reason: string = 'حذف توسط کاربر'
  ): boolean {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) return false;

    const idx = state.gas_production_kardex_entries.findIndex(e => e.entry_id === entryId);
    if (idx === -1) return false;

    const entry = state.gas_production_kardex_entries[idx];
    entry.is_deleted = true;
    entry.deleted_at = new Date().toISOString();
    entry.deleted_by = currentUser.full_name || currentUser.username;
    entry.delete_reason = reason;
    entry.updated_at = new Date().toISOString();

    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'UPDATE',
      entry.entry_id,
      entry,
      `انتقال سند کاردکس تولید ${entry.cylinder_type} شماره برگه ${entry.transfer_sheet_number} به سطل آشغال`
    );

    return true;
  }

  /**
   * Restores a trashed production kardex entry
   */
  static restoreProductionKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    currentUser: User
  ): boolean {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) return false;

    const idx = state.gas_production_kardex_entries.findIndex(e => e.entry_id === entryId);
    if (idx === -1) return false;

    const entry = state.gas_production_kardex_entries[idx];
    entry.is_deleted = false;
    entry.deleted_at = undefined;
    entry.deleted_by = undefined;
    entry.delete_reason = undefined;
    entry.updated_at = new Date().toISOString();

    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'UPDATE',
      entry.entry_id,
      entry,
      `بازیابی سند کاردکس تولید ${entry.cylinder_type} شماره برگه ${entry.transfer_sheet_number} از سطل آشغال`
    );

    return true;
  }

  /**
   * Permanently deletes a production kardex entry from database
   */
  static permanentlyDeleteProductionKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    currentUser: User
  ): boolean {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) return false;

    const entry = state.gas_production_kardex_entries.find(e => e.entry_id === entryId);
    state.gas_production_kardex_entries = state.gas_production_kardex_entries.filter(e => e.entry_id !== entryId);
    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'DELETE',
      entryId,
      { entry_id: entryId },
      `حذف دائمی سند کاردکس تولید شماره برگه ${entry?.transfer_sheet_number || entryId}`
    );

    return true;
  }

  /**
   * Checks whether the required new valves and nuts are in stock in the Production Line Warehouse (WH-PRODUCTION).
   * Strict Rule: Every cylinder requires valve(s) + nut(s); every tank requires nut(s).
   * If stock is missing or insufficient in WH-PRODUCTION, order completion and dispatch are blocked!
   */
  static checkProductionPartsAvailability(
    env: RuntimeEnvironment,
    params: {
      cylinderType: string;
      subVariant?: string;
      valveType?: string;
      valveType2?: string;
      nutType?: string;
      nutType2?: string;
      quantity: number;
    }
  ): ProductionPartsAvailabilityResult {
    const state = this.getState(env);
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.products) state.products = [];

    // 1. Locate Production Line Warehouse (WH-PRODUCTION / WH-04 / انبار خط تولید)
    let prodWarehouse = state.warehouses.find(
      w => w.warehouse_id === 'WH-PRODUCTION' || w.code === 'WH-04' || w.name.includes('خط تولید')
    );
    if (!prodWarehouse) {
      prodWarehouse = {
        warehouse_id: 'WH-PRODUCTION',
        name: 'انبار خط تولید',
        code: 'WH-04',
        address: 'سالن اصلی تولید و مونتاژ - انبار پای خط تولید',
        shelf_location: 'D1',
        shelf_letter: 'D',
        shelf_number: 1,
        is_active: true
      };
      state.warehouses.push(prodWarehouse);
    }

    const cleanQty = Math.max(1, Number(params.quantity) || 1);
    const isForklift = params.cylinderType === 'سیلندر لیفتراکی' || params.cylinderType?.includes('لیفتراک');
    const isTank = isTankType(params.cylinderType);

    // Get live stock in all warehouses from immutable movements
    const stockQuantities = this.getStockQuantities(env);

    // Retrieve configured relationship info for default parts and ratios
    let relInfo: any = null;
    try {
      relInfo = getCylinderRelationshipInfo(params.cylinderType, env);
    } catch {}

    // 2. Identify required valves
    // Strict Rule: Tanks do NOT require valves (valves_per_cylinder = 0).
    // Cylinders and picnics DO require valves.
    const valvesToRequire: Array<{ type: string; label: string; qtyPerCylinder: number }> = [];

    if (!isTank && (!relInfo || relInfo.valvesPerCylinder !== 0)) {
      const cleanValve1 = (params.valveType || relInfo?.matchingValveName || (isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز')).trim();
      if (cleanValve1 !== '' && cleanValve1 !== 'بدون شیر' && !cleanValve1.startsWith('بدون')) {
        valvesToRequire.push({
          type: cleanValve1,
          label: isForklift ? 'شیر اول فاز مایع' : 'شیر نو استاندارد',
          qtyPerCylinder: 1
        });
      }

      if (isForklift || (params.valveType2 && params.valveType2.trim()) || (relInfo && relInfo.valvesPerCylinder > 1)) {
        const cleanValve2 = (params.valveType2 || relInfo?.matchingValve2Name || cleanValve1).trim();
        if (cleanValve2 !== '' && cleanValve2 !== 'بدون شیر' && !cleanValve2.startsWith('بدون')) {
          valvesToRequire.push({
            type: cleanValve2,
            label: 'شیر دوم فاز بخار',
            qtyPerCylinder: 1
          });
        }
      }
    }

    // 3. Identify required nuts
    // Strict Rule: Every cylinder and every tank requires a nut!
    const nutsToRequire: Array<{ type: string; label: string; qtyPerCylinder: number }> = [];
    const defaultNutName = isTank
      ? (params.cylinderType.includes('ریکشا') ? 'مهره ریکشا / مخزن' : 'مهره مخزن برنجی')
      : (isForklift ? 'مهره لیفتراکی' : 'مهره 11/25/50 کیلویی بوتانی');

    const cleanNut1 = (params.nutType || relInfo?.matchingNutName || defaultNutName).trim();
    if (cleanNut1 !== '' && cleanNut1 !== 'بدون مهره' && !cleanNut1.startsWith('بدون')) {
      nutsToRequire.push({
        type: cleanNut1,
        label: isForklift ? 'مهره اول' : (isTank ? 'مهره مخزن' : 'مهره سیلندر'),
        qtyPerCylinder: 1
      });
    }

    if (isForklift || (relInfo && relInfo.nutsPerCylinder > 1) || (params.nutType2 && params.nutType2.trim())) {
      const cleanNut2 = (params.nutType2 || cleanNut1).trim();
      if (cleanNut2 !== '' && cleanNut2 !== 'بدون مهره' && !cleanNut2.startsWith('بدون')) {
        nutsToRequire.push({
          type: cleanNut2,
          label: 'مهره دوم لیفتراکی',
          qtyPerCylinder: 1
        });
      }
    }

    // Internal helper to locate the product for a valve
    const resolveValveProduct = (vName: string): Product => {
      const cleanV = toEnglishDigits(cleanPersianText(vName)).toLowerCase();
      let found = state.products.find(p => {
        const pClean = toEnglishDigits(cleanPersianText(p.name)).toLowerCase();
        return p.product_id === vName ||
               p.sku === vName ||
               pClean === cleanV ||
               pClean === `قطعه ${cleanV}` ||
               (cleanV.includes(pClean) && pClean.length > 4) ||
               (pClean.includes(cleanV) && cleanV.length > 4);
      });
      if (found) return found;

      if (cleanV.includes('لیفتراک')) {
        found = state.products.find(p => p.product_id === 'PRD-VALVE-FORKLIFT' || p.sku === 'VLV-LIFT-LIQ' || p.name.includes('لیفتراک'));
        if (found) return found;
      }

      if (cleanV.includes('پیکنیک') || cleanV.includes('پیک نیک')) {
        if (cleanV.includes('5') || cleanV.includes('8') || cleanV.includes('6')) {
          found = state.products.find(p => p.product_id === 'PRD-VLV-PK-5-8' || p.sku === 'VLV-PK-5-8' || p.sku === 'VLV-PK-5-6');
        } else {
          found = state.products.find(p => p.product_id === 'PRD-VLV-PK-1-1.5-3' || p.sku === 'VLV-PK-1-1.5-3');
        }
        if (found) return found;
      }

      if (cleanV.includes('11') || cleanV.includes('25') || cleanV.includes('50') || cleanV.includes('استاندارد') || cleanV.includes('نو')) {
        found = state.products.find(p => p.product_id === 'PRD-VLV-11-25-50' || p.sku === 'VLV-11-25-50' || p.product_id === 'PRD-VALVE-NEW');
        if (found) return found;
      }

      found = state.products.find(p => (p.category_id === 'CAT-02' || p.name.includes('شیر')) && toEnglishDigits(cleanPersianText(p.name)).toLowerCase().includes(cleanV));
      if (found) return found;

      // Fallback: create product if not exists
      const newProd: Product = {
        product_id: `PRD-VLV-${Math.floor(1000 + Math.random() * 9000)}`,
        sku: `VLV-${Math.floor(100 + Math.random() * 900)}`,
        name: vName.startsWith('شیر') ? vName : `شیر ${vName}`,
        category_id: 'CAT-02',
        unit: 'عدد',
        min_stock: 50,
        purchase_price: 1850000,
        sale_price: 2400000,
        barcode: `626088${Math.floor(1000000 + Math.random() * 9000000)}`,
        description: `قطعه شیر صنعتی مصرفی خط تولید: ${vName}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.products.push(newProd);
      return newProd;
    };

    // Internal helper to locate the product for a nut
    const resolveNutProduct = (nName: string): Product => {
      const cleanN = toEnglishDigits(cleanPersianText(nName)).toLowerCase();
      let found = state.products.find(p => {
        const pClean = toEnglishDigits(cleanPersianText(p.name)).toLowerCase();
        return p.product_id === nName ||
               p.sku === nName ||
               pClean === cleanN ||
               pClean === `مهره ${cleanN}` ||
               (cleanN.includes(pClean) && pClean.length > 4) ||
               (pClean.includes(cleanN) && cleanN.length > 4);
      });
      if (found) return found;

      if (cleanN.includes('بوتان')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-11-25-50-BUT' || p.sku === 'NUT-11-25-50-BUT');
        if (found) return found;
      } else if (cleanN.includes('پرس')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-11-25-50-PRC' || p.sku === 'NUT-11-25-50-PRC');
        if (found) return found;
      } else if (cleanN.includes('پاسار')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-11-25-50-PAS' || p.sku === 'NUT-11-25-50-PAS');
        if (found) return found;
      } else if (cleanN.includes('2')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-2KG' || p.sku === 'NUT-2KG');
        if (found) return found;
      } else if (cleanN.includes('5')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-5KG' || p.sku === 'NUT-5KG');
        if (found) return found;
      } else if (cleanN.includes('لیفتراک')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-LIFT' || p.sku === 'NUT-LIFT');
        if (found) return found;
      } else if (cleanN.includes('ریکشا')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-RIKSHA' || p.sku === 'NUT-RIKSHA');
        if (found) return found;
      } else if (cleanN.includes('مخزن')) {
        found = state.products.find(p => p.product_id === 'PRD-NUT-TANK' || p.sku === 'NUT-TANK');
        if (found) return found;
      }

      found = state.products.find(
        p => (p.category_id === 'CAT-NUTS' || p.name.includes('مهره')) &&
             (toEnglishDigits(cleanPersianText(p.name)).toLowerCase().includes(cleanN) || cleanN.includes(toEnglishDigits(cleanPersianText(p.name)).toLowerCase()))
      );
      if (found) return found;

      // Fallback: create nut product in CAT-NUTS if not exists
      const newProd: Product = {
        product_id: `PRD-NUT-${Math.floor(1000 + Math.random() * 9000)}`,
        sku: `NUT-${Math.floor(100 + Math.random() * 900)}`,
        name: nName.startsWith('مهره') ? nName : `مهره ${nName}`,
        category_id: 'CAT-NUTS',
        unit: 'عدد',
        min_stock: 50,
        purchase_price: 280000,
        sale_price: 390000,
        barcode: `626089${Math.floor(1000000 + Math.random() * 9000000)}`,
        description: `قطعه مهره اتصال خط تولید: ${nName}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.products.push(newProd);
      return newProd;
    };

    // Group parts by product ID to evaluate exact cumulative demand
    const productDemands = new Map<string, {
      product: Product;
      partType: 'VALVE' | 'NUT';
      roleLabels: string[];
      totalRequiredQty: number;
    }>();

    for (const vItem of valvesToRequire) {
      const prod = resolveValveProduct(vItem.type);
      const reqQty = cleanQty * vItem.qtyPerCylinder;
      const existing = productDemands.get(prod.product_id);
      if (existing) {
        existing.totalRequiredQty += reqQty;
        if (!existing.roleLabels.includes(vItem.label)) existing.roleLabels.push(vItem.label);
      } else {
        productDemands.set(prod.product_id, {
          product: prod,
          partType: 'VALVE',
          roleLabels: [vItem.label],
          totalRequiredQty: reqQty
        });
      }
    }

    for (const nItem of nutsToRequire) {
      const prod = resolveNutProduct(nItem.type);
      const reqQty = cleanQty * nItem.qtyPerCylinder;
      const existing = productDemands.get(prod.product_id);
      if (existing) {
        existing.totalRequiredQty += reqQty;
        if (!existing.roleLabels.includes(nItem.label)) existing.roleLabels.push(nItem.label);
      } else {
        productDemands.set(prod.product_id, {
          product: prod,
          partType: 'NUT',
          roleLabels: [nItem.label],
          totalRequiredQty: reqQty
        });
      }
    }

    const requiredParts: ProductionPartRequirement[] = [];
    const missingParts: ProductionPartRequirement[] = [];

    productDemands.forEach(({ product, partType, roleLabels, totalRequiredQty }) => {
      const availableQty = stockQuantities[product.product_id]?.[prodWarehouse.warehouse_id] || 0;
      const deficit = Math.max(0, totalRequiredQty - availableQty);
      const isSufficient = availableQty >= totalRequiredQty;

      const itemReq: ProductionPartRequirement = {
        partType,
        product_id: product.product_id,
        sku: product.sku,
        name: product.name,
        roleLabel: roleLabels.join(' و '),
        requiredQty: totalRequiredQty,
        availableQty,
        deficit,
        isSufficient
      };

      requiredParts.push(itemReq);
      if (!isSufficient) {
        missingParts.push(itemReq);
      }
    });

    const isAvailable = missingParts.length === 0;

    let message = '';
    if (!isAvailable) {
      const lines = missingParts.map(m =>
        `• ${m.name} (${m.roleLabel}): نیاز ${toPersianDigits(m.requiredQty)} عدد | موجودی فعلی خط تولید: ${toPersianDigits(m.availableQty)} عدد (کسری: ${toPersianDigits(m.deficit)} عدد)`
      );
      message = `امکان اتمام کار و تحویل کپسول به دلیل عدم موجودی قطعات زیر در «${prodWarehouse.name}» وجود ندارد:\n` +
        lines.join('\n') +
        `\n\nانباردار ابتدا باید قطعات مورد نظر را از انبار مرکزی به «${prodWarehouse.name}» انتقال دهد.`;
    }

    return {
      available: isAvailable,
      warehouseId: prodWarehouse.warehouse_id,
      warehouseName: prodWarehouse.name,
      warehouseCode: prodWarehouse.code,
      requiredParts,
      missingParts,
      message
    };
  }

  /**
   * Automatically deducts matched valves and nuts from production line warehouse (انبار خط تولید - WH-PRODUCTION)
   * Triggered when a manufacturing order is completed/delivered.
   * Strict Rule: Validates that parts are available before performing deduction.
   */
  static deductProductionParts(
    env: RuntimeEnvironment,
    params: {
      valveType: string;
      valveType2?: string;
      nutType: string;
      nutType2?: string;
      quantity: number;
      orderSheetNumber: string;
      deliverySheetNumber: string;
      customerName: string;
      cylinderType: string;
      actorUser: User;
    }
  ): {
    success: boolean;
    error?: string;
    missingParts?: ProductionPartRequirement[];
    valveMovement?: StockMovement;
    nutMovement?: StockMovement;
    valveMovements?: StockMovement[];
    nutMovements?: StockMovement[];
  } {
    // 1. First, check availability of valves and nuts in WH-PRODUCTION
    const availability = this.checkProductionPartsAvailability(env, {
      cylinderType: params.cylinderType,
      valveType: params.valveType,
      valveType2: params.valveType2,
      nutType: params.nutType,
      nutType2: params.nutType2,
      quantity: params.quantity
    });

    if (!availability.available) {
      return {
        success: false,
        error: availability.message,
        missingParts: availability.missingParts,
        valveMovements: [],
        nutMovements: []
      };
    }

    const state = this.getState(env);
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.products) state.products = [];

    // 2. Locate Production Line Warehouse (WH-PRODUCTION / WH-04 / انبار خط تولید)
    let prodWarehouse = state.warehouses.find(
      w => w.warehouse_id === 'WH-PRODUCTION' || w.code === 'WH-04' || w.name.includes('خط تولید')
    );
    if (!prodWarehouse) {
      prodWarehouse = {
        warehouse_id: 'WH-PRODUCTION',
        name: 'انبار خط تولید',
        code: 'WH-04',
        address: 'سالن اصلی تولید و مونتاژ - انبار پای خط تولید',
        shelf_location: 'D1',
        shelf_letter: 'D',
        shelf_number: 1,
        is_active: true
      };
      state.warehouses.push(prodWarehouse);
    }

    const cleanQty = Math.max(1, Number(params.quantity) || 1);
    const nowIso = new Date().toISOString();
    const isForklift = params.cylinderType === 'سیلندر لیفتراکی' || params.cylinderType.includes('لیفتراک');
    const isTank = isTankType(params.cylinderType);

    const valveMovements: StockMovement[] = [];
    const nutMovements: StockMovement[] = [];

    // Deduct each required part identified by checkProductionPartsAvailability
    for (const req of availability.requiredParts) {
      const movementId = generateUUID('MOV');
      const isValve = req.partType === 'VALVE';
      const movement: StockMovement = {
        movement_id: movementId,
        product_id: req.product_id,
        warehouse_id: prodWarehouse.warehouse_id,
        shelf_location: prodWarehouse.shelf_location || 'D1',
        quantity: req.requiredQty,
        movement_type: 'STOCK_OUT',
        reference_id: params.deliverySheetNumber,
        document_number: `حواله مصرف خط تولید ${params.deliverySheetNumber}`,
        description: `کسر اتوماتیک قطعه ${req.roleLabel} (${req.name}) بابت تکمیل و تحویل ${cleanQty} عدد ${params.cylinderType} به ${params.customerName}`,
        notes: `کسر از ${prodWarehouse.name} | سفارش مبدأ: ${params.orderSheetNumber} | حواله تحویل: ${params.deliverySheetNumber}`,
        user_id: params.actorUser.user_id,
        created_by_username: params.actorUser.username,
        device_id: params.actorUser.allowed_device_id || state.deviceId,
        event_id: generateUUID('EVT'),
        created_at: nowIso
      };

      state.stock_movements.unshift(movement);
      if (isValve) {
        valveMovements.push(movement);
      } else {
        nutMovements.push(movement);
      }

      this.recordLocalChange(
        env,
        params.actorUser.user_id,
        'STOCK_MOVEMENT',
        'CREATE',
        movementId,
        movement,
        `کسر ${req.requiredQty} عدد ${req.name} (${req.roleLabel}) از ${prodWarehouse.name} بابت حواله ${params.deliverySheetNumber}`,
        { warehouse: prodWarehouse.name, product: req.name, quantity: req.requiredQty, label: req.roleLabel }
      );
    }

    this.saveState(env, state);

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_created', { detail: { valveMovements, nutMovements } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return {
      success: true,
      valveMovement: valveMovements[0],
      nutMovement: nutMovements[0],
      valveMovements,
      nutMovements
    };
  }

  /**
   * Empties all trashed production kardex entries permanently
   */
  static emptyProductionKardexTrash(
    env: RuntimeEnvironment,
    currentUser: User
  ): boolean {
    const state = this.getState(env);
    this.ensureProductionKardexLoaded(state);
    if (!state.gas_production_kardex_entries) return false;

    state.gas_production_kardex_entries = state.gas_production_kardex_entries.filter(e => !e.is_deleted);
    this.saveState(env, state);

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GAS_PRODUCTION_KARDEX',
      'DELETE',
      'TRASH_ALL',
      {},
      'تخلیه کامل سطل آشغال کاردکس تولید ام‌گاز'
    );

    return true;
  }

  /**
   * Returns current warehouse stock of "قطعه شیر نو" across all warehouses
   */
  static getNewValveWarehouseStock(env: RuntimeEnvironment): number {
    const state = this.getState(env);
    this.ensureValveProductsExist(state);

    const newValveProductIds = new Set(
      state.products
        .filter(p => p.product_id === 'PRD-VALVE-NEW' || p.name.includes('شیر نو') || p.sku.includes('VALVE-NEW'))
        .map(p => p.product_id)
    );
    newValveProductIds.add('PRD-VALVE-NEW');

    let total = 0;
    for (const mov of state.stock_movements || []) {
      const isNewValve =
        newValveProductIds.has(mov.product_id) ||
        mov.product_id.includes('VALVE-NEW') ||
        mov.product_id.includes('VLV-11N') ||
        mov.product_id.includes('VLV-PK') ||
        (mov.description && mov.description.includes('شیر نو')) ||
        (mov.notes && mov.notes.includes('شیر نو'));

      if (isNewValve) {
        const qty = Number(mov.quantity) || 0;
        if (mov.movement_type === 'STOCK_IN' || mov.movement_type === 'PURCHASE' || mov.movement_type === 'RETURN_IN') {
          total += qty;
        } else if (mov.movement_type === 'STOCK_OUT' || mov.movement_type === 'SALE' || mov.movement_type === 'RETURN_OUT') {
          total -= qty;
        }
      }
    }
    return Math.max(0, total);
  }

  /**
   * Returns current warehouse stock of a SPECIFIC valve product (NOT summing other valve types)
   */
  static getSpecificValveWarehouseStock(
    env: RuntimeEnvironment,
    criteria: { valveId?: string; valveName?: string; valveSku?: string }
  ): number {
    const state = this.getState(env);
    this.ensureValveProductsExist(state);
    const stockQuantities = this.getStockQuantities(env);

    const targetProductIds = new Set<string>();

    if (criteria.valveId && state.products.some(p => p.product_id === criteria.valveId)) {
      targetProductIds.add(criteria.valveId);
    }

    if (criteria.valveSku) {
      const skuClean = cleanPersianText(criteria.valveSku).toUpperCase();
      state.products
        .filter(p => cleanPersianText(p.sku).toUpperCase() === skuClean)
        .forEach(p => targetProductIds.add(p.product_id));
    }

    if (criteria.valveName) {
      const nameClean = cleanPersianText(criteria.valveName);
      state.products
        .filter(p => cleanPersianText(p.name).includes(nameClean) || nameClean.includes(cleanPersianText(p.name)))
        .forEach(p => targetProductIds.add(p.product_id));
    }

    // Precise domain matching without lumping all valves together
    if (targetProductIds.size === 0 && criteria.valveName) {
      const nameClean = cleanPersianText(criteria.valveName);
      if (nameClean.includes('لیفتراک')) {
        if (nameClean.includes('بوتان')) {
          state.products
            .filter(p => {
              const pName = cleanPersianText(p.name);
              const pSku = cleanPersianText(p.sku).toUpperCase();
              return pName.includes('لیفتراک') && (pName.includes('بوتان') || pSku.includes('BUT'));
            })
            .forEach(p => targetProductIds.add(p.product_id));
        } else if (nameClean.includes('پاسار') || nameClean.includes('پرس')) {
          state.products
            .filter(p => {
              const pName = cleanPersianText(p.name);
              const pSku = cleanPersianText(p.sku).toUpperCase();
              return pName.includes('لیفتراک') && (pName.includes('پاسار') || pName.includes('پرس') || pSku.includes('PAR') || pSku.includes('PRC'));
            })
            .forEach(p => targetProductIds.add(p.product_id));
        } else if (nameClean.includes('ایران')) {
          state.products
            .filter(p => {
              const pName = cleanPersianText(p.name);
              const pSku = cleanPersianText(p.sku).toUpperCase();
              return pName.includes('لیفتراک') && (pName.includes('ایران') || pSku.includes('IRN'));
            })
            .forEach(p => targetProductIds.add(p.product_id));
        } else if (nameClean.includes('عراق')) {
          state.products
            .filter(p => {
              const pName = cleanPersianText(p.name);
              const pSku = cleanPersianText(p.sku).toUpperCase();
              return pName.includes('لیفتراک') && (pName.includes('عراق') || pSku.includes('IRQ'));
            })
            .forEach(p => targetProductIds.add(p.product_id));
        } else {
          state.products
            .filter(p => {
              const pName = cleanPersianText(p.name);
              const pSku = cleanPersianText(p.sku).toUpperCase();
              return pName.includes('لیفتراک') && (pName.includes('شیر') || pSku.includes('LIFT'));
            })
            .forEach(p => targetProductIds.add(p.product_id));
        }
      } else if (nameClean.includes('5/6') || nameClean.includes('۵/۶') || nameClean.includes('5/8') || nameClean.includes('۵/۸') || nameClean.includes('3/5/8') || nameClean.includes('۳/۵/۸')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            const pSku = cleanPersianText(p.sku).toUpperCase();
            return (pName.includes('5/6') || pName.includes('۵/۶') || pName.includes('5/8') || pName.includes('۵/۸') || pSku.includes('5-6') || pSku.includes('56') || pSku.includes('5-8') || pSku.includes('58')) && (pName.includes('شیر') || pSku.includes('VLV')) && !pName.includes('1/1.5') && !pName.includes('۱/۱.۵');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      } else if (nameClean.includes('1/1.5') || nameClean.includes('۱/۱.۵') || nameClean.includes('1/1.5/3') || nameClean.includes('۱/۱.۵/۳') || nameClean.includes('پیکنیک')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            const pSku = cleanPersianText(p.sku).toUpperCase();
            return (pName.includes('پیکنیک') || pSku.includes('PK')) && !pName.includes('5/6') && !pName.includes('۵/۶') && !pName.includes('5/8') && !pName.includes('۵/۸') && !pSku.includes('58') && !pSku.includes('5-8');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      } else if (nameClean.includes('11') || nameClean.includes('۱۱')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            const pSku = cleanPersianText(p.sku).toUpperCase();
            return (pName.includes('11') || pName.includes('۱۱') || pSku.includes('11-25-50')) && pName.includes('شیر') && !pName.includes('لیفتراک') && !pName.includes('پیکنیک');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      } else if (nameClean.includes('8/10') || nameClean.includes('۸/۱۰') || nameClean.includes('25') || nameClean.includes('۲۵')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            const pSku = cleanPersianText(p.sku).toUpperCase();
            return (pName.includes('25') || pName.includes('۲۵') || pName.includes('8/10') || pName.includes('۸/۱۰') || pSku.includes('11-25-50')) && pName.includes('شیر') && !pName.includes('لیفتراک') && !pName.includes('پیکنیک');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      } else if (nameClean.includes('50') || nameClean.includes('۵۰')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            const pSku = cleanPersianText(p.sku).toUpperCase();
            return (pName.includes('50') || pName.includes('۵۰') || pSku.includes('11-25-50')) && pName.includes('شیر') && !pName.includes('لیفتراک');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      } else if (nameClean.includes('مخزن') || nameClean.includes('ریکشا')) {
        state.products
          .filter(p => {
            const pName = cleanPersianText(p.name);
            return (pName.includes('مخزن') || pName.includes('ریکشا')) && pName.includes('شیر');
          })
          .forEach(p => targetProductIds.add(p.product_id));
      }
    }

    let total = 0;
    targetProductIds.forEach(pId => {
      const whMap = stockQuantities[pId];
      if (whMap) {
        Object.values(whMap).forEach(q => {
          total += Number(q) || 0;
        });
      }
    });

    return Math.max(0, total);
  }

  /**
   * Executes an atomic inter-warehouse transfer (جابجایی بین انبارها)
   * Updates both source and destination warehouses:
   * - Source warehouse loses the quantity of the product
   * - Destination warehouse receives the quantity
   * - If product is a new valve and marked DEFECTIVE (شیر نو که قبلا به انبار دیگر رفته و حالا برگشته معیوب شده):
   *   Destination warehouse receives it as "قطعه شیر معیوب و ضایعات" (PRD-VALVE-DEFECTIVE)
   * - If product is marked HEALTHY (شیر سالم است):
   *   Destination warehouse receives it as the original product (e.g. "قطعه شیر نو")
   */
  static executeWarehouseTransfer(
    env: RuntimeEnvironment,
    user: User,
    params: {
      productId: string;
      sourceWarehouseId: string;
      destWarehouseId: string;
      quantity: number;
      referenceId: string;
      notes?: string;
      valveCondition?: 'HEALTHY' | 'DEFECTIVE';
      valveOwnership?: 'MGAS' | 'CUSTOMER';
      customerId?: string;
      customerName?: string;
      sourceShelfLetter?: string;
      sourceShelfNumber?: number;
      destShelfLetter?: string;
      destShelfNumber?: number;
    }
  ): { outMovement: StockMovement; inMovement: StockMovement } {
    if (!params.sourceWarehouseId || !params.destWarehouseId) {
      throw new Error('لطفاً انبار مبدأ و انبار مقصد را مشخص نمایید.');
    }
    if (params.sourceWarehouseId === params.destWarehouseId) {
      throw new Error('انبار مبدأ و انبار مقصد نمی‌توانند یکسان باشند. لطفاً انبار مقصد متفاوتی را انتخاب نمایید.');
    }
    const cleanQty = Number(params.quantity);
    if (isNaN(cleanQty) || cleanQty <= 0) {
      throw new Error('مقدار جابجایی باید عددی معتبر و بزرگتر از صفر باشد.');
    }

    const state = this.getState(env);
    this.ensureValveProductsExist(state);

    const sourceProd = state.products.find(p => p.product_id === params.productId);
    if (!sourceProd) {
      throw new Error('کالای مورد نظر در کاتالوگ محصولات یافت نشد.');
    }

    const sourceWh = state.warehouses.find(w => w.warehouse_id === params.sourceWarehouseId);
    const destWh = state.warehouses.find(w => w.warehouse_id === params.destWarehouseId);

    const sourceWhName = sourceWh?.name || params.sourceWarehouseId;
    const destWhName = destWh?.name || params.destWarehouseId;

    const isValve =
      params.productId === 'PRD-VALVE-NEW' ||
      params.productId.includes('VALVE') ||
      sourceProd.name.includes('شیر') ||
      sourceProd.category_id === 'CAT-02';

    const condition = params.valveCondition || 'HEALTHY';
    const isDefectiveReturnedValve = isValve && condition === 'DEFECTIVE';

    // Target product in destination warehouse
    let destProductId = params.productId;
    let destProdName = sourceProd.name;

    if (isDefectiveReturnedValve) {
      let defProd = state.products.find(
        p => p.product_id === 'PRD-VALVE-DEFECTIVE' || p.sku === 'VALVE-DEFECTIVE' || p.name.includes('معیوب')
      );
      if (!defProd) {
        defProd = {
          product_id: 'PRD-VALVE-DEFECTIVE',
          sku: 'VALVE-DEFECTIVE',
          name: 'قطعه شیر معیوب و ضایعات',
          category_id: 'CAT-02',
          unit: 'عدد',
          min_stock: 0,
          purchase_price: 300000,
          sale_price: 450000,
          barcode: '6260881001003',
          description: 'قطعه شیر معیوب، خراب یا اسقاطی برگشتی از سایر انبارها',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.products.push(defProd);
      }
      destProductId = defProd.product_id;
      destProdName = defProd.name;
    }

    const sourceShelf = params.sourceShelfLetter && params.sourceShelfNumber
      ? `${params.sourceShelfLetter.toUpperCase()}${params.sourceShelfNumber}`
      : sourceWh?.shelf_location || 'A1';

    const destShelf = params.destShelfLetter && params.destShelfNumber
      ? `${params.destShelfLetter.toUpperCase()}${params.destShelfNumber}`
      : destWh?.shelf_location || 'B1';

    const cleanRef = (params.referenceId || '').trim() || `TRF-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    const conditionLabel = condition === 'DEFECTIVE'
      ? 'معیوب شده (اسقاط/ضایعات)'
      : 'سالم و نو (قابل استفاده)';

    const ownerLabel = params.valveOwnership === 'CUSTOMER' && params.customerName
      ? `شیر مشتری (${params.customerName})`
      : 'شیر اختصاصی ام‌گاز';

    const outMovId = generateUUID('MOV');
    const outMovement: StockMovement = {
      movement_id: outMovId,
      product_id: params.productId,
      warehouse_id: params.sourceWarehouseId,
      to_warehouse_id: params.destWarehouseId,
      destination_warehouse_id: params.destWarehouseId,
      shelf_location: sourceShelf,
      quantity: cleanQty,
      movement_type: 'TRANSFER_OUT',
      item_condition: condition,
      valve_ownership: params.valveOwnership || 'MGAS',
      customer_id: params.customerId,
      customer_name: params.customerName || (params.valveOwnership === 'CUSTOMER' ? 'مشتری' : 'شرکت ام‌گاز'),
      reference_id: cleanRef,
      unit_price: sourceProd.purchase_price || 0,
      user_id: user.user_id,
      created_by_username: user.username,
      device_id: user.allowed_device_id || state.deviceId,
      event_id: generateUUID('EVT'),
      notes: `حواله خروج انتقال از [${sourceWhName}] به انبار [${destWhName}] - مالکیت: ${ownerLabel} - وضعیت شیر برگشتی: ${conditionLabel}${params.notes ? ` - ${params.notes}` : ''}`,
      created_at: nowIso
    };

    const inMovId = generateUUID('MOV');
    const inMovement: StockMovement = {
      movement_id: inMovId,
      product_id: destProductId,
      warehouse_id: params.destWarehouseId,
      to_warehouse_id: params.sourceWarehouseId,
      destination_warehouse_id: params.destWarehouseId,
      shelf_location: destShelf,
      quantity: cleanQty,
      movement_type: 'TRANSFER_IN',
      item_condition: condition,
      valve_ownership: params.valveOwnership || 'MGAS',
      customer_id: params.customerId,
      customer_name: params.customerName || (params.valveOwnership === 'CUSTOMER' ? 'مشتری' : 'شرکت ام‌گاز'),
      reference_id: cleanRef,
      unit_price: sourceProd.purchase_price || 0,
      user_id: user.user_id,
      created_by_username: user.username,
      device_id: user.allowed_device_id || state.deviceId,
      event_id: generateUUID('EVT'),
      notes: `رسید ورود انتقال در [${destWhName}] از مبدأ [${sourceWhName}] - مالکیت: ${ownerLabel} - وضعیت شیر: ${conditionLabel} (ثبت به عنوان: ${destProdName})${params.notes ? ` - ${params.notes}` : ''}`,
      created_at: nowIso
    };

    // Update shelves if custom selected
    if (params.sourceShelfLetter && params.sourceShelfNumber) {
      this.updateWarehouseShelf(env, params.sourceWarehouseId, params.sourceShelfLetter, params.sourceShelfNumber);
    }
    if (params.destShelfLetter && params.destShelfNumber) {
      this.updateWarehouseShelf(env, params.destWarehouseId, params.destShelfLetter, params.destShelfNumber);
    }

    // Record both sync events
    this.recordLocalChange(
      env,
      user.user_id,
      'STOCK_MOVEMENT',
      'CREATE',
      outMovId,
      outMovement,
      `حواله خروج انتقال بین انبارها: ${cleanQty} عدد ${sourceProd.name} از ${sourceWhName} به ${destWhName} (${conditionLabel})`,
      { source_warehouse: sourceWhName, dest_warehouse: destWhName, quantity: cleanQty, condition }
    );

    this.recordLocalChange(
      env,
      user.user_id,
      'STOCK_MOVEMENT',
      'CREATE',
      inMovId,
      inMovement,
      `رسید ورود انتقال بین انبارها: ${cleanQty} عدد ${destProdName} در ${destWhName} از ${sourceWhName} (${conditionLabel})`,
      { source_warehouse: sourceWhName, dest_warehouse: destWhName, quantity: cleanQty, condition }
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_created', { detail: { outMovement, inMovement } }));
      }
    } catch {}

    return { outMovement, inMovement };
  }

  // ATOMIC EVENT CREATION:
  // Creates a business record, immutable sync_event, and inserts into local sync_queue
  static recordLocalChange(
    env: RuntimeEnvironment,
    userId: string,
    entityType: EntityType,
    eventType: EventType,
    entityId: string,
    payload: any,
    auditAction: string,
    auditMetadata?: Record<string, any>
  ): SyncEvent {
    const state = this.getState(env);
    const eventId = generateUUID('EVT');
    const purgedMs = state.is_purged && state.purged_at ? new Date(state.purged_at).getTime() : 0;
    const safeNowMs = purgedMs > 0 && !isNaN(purgedMs) ? Math.max(Date.now(), purgedMs + 1000) : Date.now();
    const now = new Date(safeNowMs).toISOString();

    if (purgedMs > 0 && payload && typeof payload === 'object' && entityType !== 'SYSTEM') {
      const cMs = payload.created_at ? new Date(payload.created_at).getTime() : 0;
      const uMs = payload.updated_at ? new Date(payload.updated_at).getTime() : 0;
      if (!cMs || cMs <= purgedMs) payload.created_at = now;
      if (!uMs || uMs <= purgedMs) payload.updated_at = now;
    }

    // Strict Architectural Rule: Hajivand (Warehouse Keeper) is strictly forbidden from touching GAS_KARDEX!
    // "ثبت کاردکس برای کاربر حاجی وند در دسترس نباشد" - "کاربر حاجی وند خودش نمیتواند کاردکس را بزند"
    if (entityType === 'GAS_KARDEX') {
      const actor = this.getUserById(env, userId);
      if (actor && (actor.role === 'WAREHOUSE_KEEPER' || actor.username === 'hajivand' || actor.username === 'gholizadeh' || userId === 'USR-003')) {
        throw new Error('خطای عدم دسترسی: طبق معماری جدید سامانه، انباردار (مهندس حاجی‌وند) مجاز به ثبت کاردکس نمی‌باشد. لطفاً اقلام را در بخش «ورودی شیر و سیلندر» ثبت فرمایید.');
      }
    }

    // 1-hour editing restriction is disabled for all users; all authenticated authorized users can edit documents without timeout.

    const syncEvent: SyncEvent = {
      event_id: eventId,
      user_id: userId,
      device_id: state.deviceId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload,
      client_created_at: now,
      schema_version: 1
    };

    // Apply change to local tables
    this.applyPayloadToLocalState(state, syncEvent);

    // Generate persistent cross-device notification if applicable
    if (entityType !== 'NOTIFICATION' && entityType !== 'SYSTEM') {
      this.appendNotificationFromEvent(state, syncEvent);
    }

    // Add to local sync_events ledger
    state.sync_events.push(syncEvent);

    // Queue for sync to Central API
    const queueItem: SyncQueueItem = {
      event_id: eventId,
      status: 'PENDING',
      retry_count: 0,
      created_at: now,
      event: syncEvent
    };
    state.sync_queue.push(queueItem);
    state.sync_state.pending_events_count = state.sync_queue.filter(q => q.status === 'PENDING').length;

    // Audit log
    state.audit_logs.unshift({
      audit_id: generateUUID('AUD'),
      user_id: userId,
      device_id: state.deviceId,
      action: auditAction,
      entity_type: entityType,
      entity_id: entityId,
      event_id: eventId,
      timestamp: now,
      metadata: auditMetadata
    });

    this.saveState(env, state);

    // Synchronize the change across the other local environment states on this client
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const targetEnv of allEnvs) {
      if (targetEnv !== env) {
        try {
          const otherState = this.getState(targetEnv);
          const exists = otherState.sync_events.some(e => e.event_id === syncEvent.event_id);
          if (!exists) {
            this.applyPayloadToLocalState(otherState, syncEvent);
            if (entityType !== 'NOTIFICATION' && entityType !== 'SYSTEM') {
              this.appendNotificationFromEvent(otherState, syncEvent);
            }
            otherState.sync_events.push(syncEvent);
            this.saveState(targetEnv, otherState);
          }
        } catch {}
      }
    }

    // If running in real desktop environment, persist to SQLite directly
    if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop) {
      window.desktopAPI.recordLocalEvent(syncEvent).catch(err => {
        console.warn('[Desktop SQLite Bridge Warning]', err);
      });
    }

    // Trigger immediate real-time upload to central database (<100ms)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:local_change_queued', { detail: { env, event: syncEvent } }));
        window.dispatchEvent(new CustomEvent('mgas:notifications_updated', { detail: { env, event: syncEvent } }));
      }
    } catch {}

    return syncEvent;
  }

  static buildNotificationFromEvent(state: LocalDatabaseState, event: SyncEvent): AppNotification | null {
    if (!event || !event.event_id) return null;
    if (event.entity_type === 'NOTIFICATION' || event.entity_type === 'SYSTEM') return null;

    const p: any = event.payload || {};
    const actorUser = (state.users || SEED_USERS).find(
      u => u.user_id === event.user_id || u.username === p?.created_by_username || u.username === p?.inspector_name
    );
    const actorName =
      p?.inspector_name ||
      actorUser?.full_name ||
      p?.created_by_username ||
      (event.user_id === 'USR-001' ? 'مهندس موسی عمویی' : event.user_id === 'USR-003' ? 'مهندس حاجی‌وند' : 'کاربر سامانه');

    const createdAt = event.server_received_at || event.client_created_at || new Date().toISOString();
    const isDelete = event.event_type === 'DELETE';
    const isUpdate = event.event_type === 'UPDATE';

    let category: NotificationCategory = 'INVENTORY';
    let targetTab = 'dashboard';
    let level: AppNotification['level'] = 'info';
    let title = '';
    let message = '';

    switch (event.entity_type) {
      case 'CYLINDER_VALVE_INSPECTION': {
        category = 'INSPECTION';
        targetTab = 'cylinder_inspections';
        const cust = p.customer_name || p.supplier_name || 'طرف حساب';
        const formNo = p.form_number ? ` (برگه ${p.form_number})` : '';
        if (isDelete) {
          level = 'warning';
          title = 'حذف ورودی بازرسی / شمارش';
          message = `${actorName} بازرسی ${p.item_name || ''} برای ${cust}${formNo} را حذف کرد.`;
        } else if (p.status === 'KARDEX_REGISTERED') {
          level = 'success';
          targetTab = 'gas_kardex';
          title = 'ثبت در کاردکس از روی شمارش انبار';
          message = `${actorName} برگه ${p.form_number || ''} (${cust}) را در کاردکس تعمیر ثبت کرد.`;
        } else {
          level = 'info';
          title = p.source_type === 'SUPPLIER' ? 'ورودی جدید تأمین‌کننده ام‌گاز' : 'ورودی جدید آماده ثبت در کاردکس';
          message = `${actorName} تعداد ${toPersianDigits(p.actual_healthy_quantity ?? 0)} عدد «${p.item_name || 'شیر/سیلندر'}» برای ${cust}${formNo} شمارش و ثبت کرد.`;
        }
        break;
      }
      case 'GAS_KARDEX': {
        category = 'KARDEX_REPAIR';
        targetTab = 'gas_kardex';
        const cust = p.customer_name || 'مشتری';
        const sheet = p.transfer_sheet_number ? ` [برگه ${p.transfer_sheet_number}]` : '';
        if (isDelete || p.is_deleted) {
          level = 'warning';
          title = 'حذف/انتقال ردیف کاردکس تعمیر';
          message = `${actorName} ردیف کاردکس ${cust} (${p.cylinder_type || ''})${sheet} را حذف کرد.`;
        } else if (isUpdate) {
          level = 'info';
          title = 'ویرایش کاردکس تعمیر سیلندر';
          message = `${actorName} کاردکس ${cust} (${p.cylinder_type || ''})${sheet} را ویرایش کرد.`;
        } else {
          level = 'success';
          title = 'ثبت ردیف جدید کاردکس تعمیر';
          message = `${actorName} ردیف جدید برای ${cust} (${p.cylinder_type || 'سیلندر'})${sheet} ثبت کرد.`;
        }
        break;
      }
      case 'GAS_PRODUCTION_KARDEX': {
        category = 'KARDEX_PRODUCTION';
        targetTab = 'gas_production_kardex';
        const cyl = p.cylinder_type || 'سیلندر تولیدی';
        const sheet = p.transfer_sheet_number ? ` [برگه ${p.transfer_sheet_number}]` : '';
        if (isDelete || p.is_deleted) {
          level = 'warning';
          title = 'حذف ردیف کاردکس تولید';
          message = `${actorName} ردیف کاردکس تولید ${cyl}${sheet} را حذف کرد.`;
        } else {
          level = isUpdate ? 'info' : 'success';
          title = isUpdate ? 'بروزرسانی کاردکس تولید' : 'ثبت ردیف کاردکس تولید';
          message = `${actorName} ردیف کاردکس تولید ${cyl}${sheet} را ثبت/بروزرسانی کرد.`;
        }
        break;
      }
      case 'STOCK_MOVEMENT': {
        const movId = p.movement_id || event.entity_id || '';
        if (movId.startsWith('MOV-INSP-')) return null;
        category = 'INVENTORY';
        targetTab = 'movements';
        const prodName = state.products?.find(pr => pr.product_id === p.product_id)?.name || p.product_id || 'کالا';
        const isOut = p.movement_type === 'STOCK_OUT' || p.movement_type === 'SALE' || p.movement_type === 'TRANSFER_OUT';
        level = isDelete ? 'warning' : isOut ? 'warning' : 'success';
        title = isDelete ? 'حذف سند گردش انبار' : isOut ? 'ثبت خروج کالا از انبار' : 'ثبت ورود کالا به انبار';
        message = `${actorName}: ${isOut ? 'خروج' : 'ورود'} ${toPersianDigits(p.quantity ?? 0)} عدد «${prodName}» (${p.reference_id || movId})`;
        break;
      }
      case 'GOODS_RECEIPT': {
        category = 'INVENTORY';
        targetTab = 'movements';
        const isExit = p.receipt_type === 'EXIT';
        level = isDelete ? 'warning' : 'success';
        title = isDelete ? 'حذف برگه رسمی کالا' : isExit ? 'صدور برگه خروج کالا' : 'صدور برگه ورود کالا';
        message = `${actorName} برگه شماره ${p.form_number || event.entity_id} برای ${p.party_name || p.customer_name || 'طرف حساب'} را ثبت کرد.`;
        break;
      }
      case 'INVOICE': {
        category = 'INVOICE';
        targetTab = 'invoices';
        level = isDelete ? 'warning' : 'success';
        title = isDelete ? 'حذف فاکتور' : isUpdate ? 'بروزرسانی فاکتور' : 'صدور فاکتور جدید';
        message = `${actorName} فاکتور ${p.invoice_number || event.entity_id} (${p.party_name || ''}) را ${isDelete ? 'حذف' : isUpdate ? 'ویرایش' : 'ثبت'} کرد.`;
        break;
      }
      case 'USER': {
        category = 'USER';
        targetTab = 'tri_sync';
        level = 'warning';
        title = 'تغییر مشخصات یا رمز عبور کاربر';
        message = `${actorName} مشخصات یا رمز عبور کاربر «${p.full_name || p.username || event.entity_id}» را بروزرسانی کرد.`;
        break;
      }
      case 'PRODUCT': {
        category = 'INVENTORY';
        targetTab = 'inventory';
        level = isDelete ? 'warning' : 'info';
        title = isDelete ? 'حذف کالا از کاتالوگ' : isUpdate ? 'ویرایش مشخصات کالا' : 'افزودن کالای جدید';
        message = `${actorName} کالای «${p.name || event.entity_id}» را ${isDelete ? 'حذف' : isUpdate ? 'ویرایش' : 'تعریف'} کرد.`;
        break;
      }
      case 'SUPPLIER': {
        category = 'INVENTORY';
        targetTab = 'suppliers';
        level = isDelete ? 'warning' : isUpdate ? 'info' : 'success';
        title = isDelete ? 'حذف پرونده تأمین‌کننده' : isUpdate ? 'ویرایش پرونده تأمین‌کننده' : 'ثبت تأمین‌کننده جدید';
        message = `${actorName} پرونده تأمین‌کننده «${p.company_name || p.name || event.entity_id}» را ${isDelete ? 'حذف' : isUpdate ? 'ویرایش' : 'ثبت'} کرد.`;
        break;
      }
      default:
        return null;
    }

    return {
      notification_id: `NOTIF-${event.event_id}`,
      title,
      message,
      level,
      category,
      target_tab: targetTab,
      actor_user_id: event.user_id,
      actor_name: actorName,
      device_id: event.device_id || state.deviceId,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      read_by: event.user_id ? [event.user_id] : [],
      created_at: createdAt
    };
  }

  static appendNotificationFromEvent(state: LocalDatabaseState, event: SyncEvent): AppNotification | null {
    const notif = this.buildNotificationFromEvent(state, event);
    if (!notif) return null;
    if (!state.notifications) state.notifications = [];
    const idx = state.notifications.findIndex(n => n.notification_id === notif.notification_id);
    if (idx === -1) {
      state.notifications.unshift(notif);
      if (state.notifications.length > 200) {
        state.notifications = state.notifications.slice(0, 200);
      }
      return notif;
    }
    return null;
  }

  static getNotificationsForUser(env: RuntimeEnvironment, user: User | null): AppNotification[] {
    const state = this.getState(env);
    const list = state.notifications || [];
    if (!user) return [];
    const isWarehouseKeeper =
      user.role === 'WAREHOUSE_KEEPER' ||
      user.username === 'hajivand' ||
      user.username === 'gholizadeh' ||
      user.user_id === 'USR-003';

    const filtered = isWarehouseKeeper
      ? list.filter(n => n.category !== 'KARDEX_REPAIR' && n.category !== 'KARDEX_PRODUCTION' && n.category !== 'INVOICE')
      : list;

    return [...filtered].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  static markNotificationRead(env: RuntimeEnvironment, notificationId: string, userId: string) {
    const state = this.getState(env);
    if (!state.notifications) return;
    const target = state.notifications.find(n => n.notification_id === notificationId);
    if (!target) return;
    if (!Array.isArray(target.read_by)) target.read_by = [];
    if (target.read_by.includes(userId)) return;

    target.read_by = [...target.read_by, userId];
    this.saveState(env, state);
    this.recordLocalChange(
      env,
      userId,
      'NOTIFICATION',
      'UPDATE',
      notificationId,
      { action: 'MARK_READ', notification_id: notificationId, user_id: userId },
      'MARK_NOTIFICATION_READ'
    );
  }

  static markAllNotificationsRead(env: RuntimeEnvironment, userId: string) {
    const state = this.getState(env);
    if (!state.notifications || state.notifications.length === 0) return;
    const now = new Date().toISOString();
    let changed = false;
    state.notifications = state.notifications.map(n => {
      const readBy = Array.isArray(n.read_by) ? n.read_by : [];
      if (!readBy.includes(userId)) {
        changed = true;
        return { ...n, read_by: [...readBy, userId] };
      }
      return n;
    });
    if (!changed) return;
    this.saveState(env, state);
    this.recordLocalChange(
      env,
      userId,
      'NOTIFICATION',
      'UPDATE',
      `ALL-${userId}`,
      { action: 'MARK_ALL_READ', user_id: userId, timestamp: now },
      'MARK_ALL_NOTIFICATIONS_READ'
    );
  }

  static clearAllNotifications(env: RuntimeEnvironment, userId: string) {
    const state = this.getState(env);
    const now = new Date().toISOString();
    state.notifications = [];
    this.saveState(env, state);
    this.recordLocalChange(
      env,
      userId,
      'NOTIFICATION',
      'DELETE',
      'CLEAR_ALL',
      { action: 'CLEAR_ALL', user_id: userId, timestamp: now },
      'CLEAR_ALL_NOTIFICATIONS'
    );
  }

  // Internal helper to apply entity mutations locally
  static applyPayloadToLocalState(state: LocalDatabaseState, event: SyncEvent) {
    const payload = event.payload;
    if (!payload && event.event_type !== 'DELETE') return;

    // Tombstone Protection: If entity was deleted forever, reject any recreate/resurrection event
    const targetEntityId = event.entity_id || (payload as any)?.entry_id || (payload as any)?.inspection_id || (payload as any)?.receipt_id || (payload as any)?.invoice_id;
    if (event.event_type !== 'DELETE' && this.isEntityPermanentlyDeleted(targetEntityId)) {
      return;
    }

    switch (event.entity_type) {
      case 'STOCK_MOVEMENT': {
        const mov = payload as StockMovement;
        if (mov) mov.event_id = event.event_id;
        const targetId = mov?.movement_id || event.entity_id;
        const idx = state.stock_movements.findIndex(m => m.movement_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.stock_movements.splice(idx, 1);
        } else if (idx >= 0) {
          state.stock_movements[idx] = { ...state.stock_movements[idx], ...mov };
        } else if (mov) {
          state.stock_movements.push(mov);
        }
        break;
      }
      case 'PRODUCT': {
        const prod = payload as Product;
        const targetId = prod?.product_id || event.entity_id;
        const idx = state.products.findIndex(p => p.product_id === targetId || (prod?.sku && p.sku === prod.sku));
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.products.splice(idx, 1);
        } else if (idx >= 0) {
          state.products[idx] = { ...state.products[idx], ...prod, user_edited: true, updated_at: new Date().toISOString() };
        } else if (prod) {
          state.products.push({ ...prod, user_edited: true });
        }
        break;
      }
      case 'CUSTOMER': {
        const cust = payload as Customer;
        const targetId = cust?.customer_id || event.entity_id;
        if (!state.customers) state.customers = [];
        const idx = state.customers.findIndex(c => c.customer_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.customers.splice(idx, 1);
          if (!state.deleted_entity_ids) state.deleted_entity_ids = [];
          if (targetId && !state.deleted_entity_ids.includes(targetId)) {
            state.deleted_entity_ids.push(targetId);
          }
          this.markEntityPermanentlyDeleted(targetId);
        } else if (idx >= 0) {
          state.customers[idx] = { ...state.customers[idx], ...cust, updated_at: new Date().toISOString() };
        } else if (cust) {
          state.customers.push(cust);
        }
        break;
      }
      case 'CATEGORY': {
        const cat = payload as Category;
        if (!state.categories) state.categories = [];
        const targetId = cat?.category_id || event.entity_id;
        const idx = state.categories.findIndex(c => c.category_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.categories.splice(idx, 1);
        } else if (idx >= 0) {
          state.categories[idx] = { ...state.categories[idx], ...cat, updated_at: new Date().toISOString() };
        } else if (cat) {
          state.categories.push(cat);
        }
        break;
      }
      case 'SUPPLIER': {
        const sup = payload as Supplier;
        const targetId = sup?.supplier_id || event.entity_id;
        if (!state.suppliers) state.suppliers = [];
        const idx = state.suppliers.findIndex(s => s.supplier_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.suppliers.splice(idx, 1);
          if (!state.deleted_entity_ids) state.deleted_entity_ids = [];
          if (targetId && !state.deleted_entity_ids.includes(targetId)) {
            state.deleted_entity_ids.push(targetId);
          }
          this.markEntityPermanentlyDeleted(targetId);
        } else if (idx >= 0) {
          state.suppliers[idx] = { ...state.suppliers[idx], ...sup, updated_at: new Date().toISOString() };
        } else if (sup) {
          state.suppliers.push(sup);
        }
        break;
      }
      case 'SALE': {
        const sale = payload as Sale;
        const targetId = sale?.sale_id || event.entity_id;
        const idx = state.sales.findIndex(s => s.sale_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.sales.splice(idx, 1);
        } else if (idx >= 0) {
          state.sales[idx] = { ...state.sales[idx], ...sale };
        } else if (sale) {
          state.sales.push(sale);
        }
        break;
      }
      case 'PURCHASE': {
        const pur = payload as Purchase;
        const targetId = pur?.purchase_id || event.entity_id;
        const idx = state.purchases.findIndex(p => p.purchase_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.purchases.splice(idx, 1);
        } else if (idx >= 0) {
          state.purchases[idx] = { ...state.purchases[idx], ...pur };
        } else if (pur) {
          state.purchases.push(pur);
        }
        break;
      }
      case 'INVOICE': {
        const inv = payload as Invoice;
        if (!state.invoices) state.invoices = [];
        const targetId = inv?.invoice_id || event.entity_id;
        const idx = state.invoices.findIndex(i => i.invoice_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.invoices.splice(idx, 1);
        } else if (idx >= 0) {
          state.invoices[idx] = { ...state.invoices[idx], ...inv, updated_at: new Date().toISOString() };
        } else if (inv) {
          state.invoices.push(inv);
        }
        break;
      }
      case 'USER': {
        const u = payload as User;
        if (!state.users) state.users = [];
        const targetId = u?.user_id || event.entity_id;
        const targetUsername = u?.username?.toLowerCase();
        const idx = state.users.findIndex(item =>
          item.user_id === targetId ||
          (targetUsername && item.username?.toLowerCase() === targetUsername)
        );
        if (event.event_type === 'DELETE') {
          if (idx >= 0 && state.users[idx].user_id !== 'USR-001') state.users.splice(idx, 1);
        } else if (idx >= 0) {
          const existing = state.users[idx];
          const existingTimeStr = existing.password_updated_at || existing.updated_at;
          const incomingTimeStr = u?.password_updated_at || u?.updated_at || event.client_created_at;
          const existingTime = existingTimeStr ? new Date(existingTimeStr).getTime() : 0;
          const incomingTime = incomingTimeStr ? new Date(incomingTimeStr).getTime() : 0;
          // Do not overwrite a newer password change with an older stale sync event
          if (existingTime > 0 && incomingTime > 0 && incomingTime < existingTime) {
            break;
          }
          state.users[idx] = {
            ...existing,
            ...u,
            username: targetUsername || existing.username,
            password_hash: u?.password_hash || existing.password_hash,
            password_salt: u?.password_salt || existing.password_salt,
            password_updated_at: u?.password_updated_at || existing.password_updated_at,
            password: undefined
          };
        } else if (u) {
          state.users.push({ ...u, password: undefined });
        }
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mgas:users_updated', { detail: { targetUserId: targetId, updatedUser: u } }));
          }
        } catch {}
        break;
      }
      case 'GAS_KARDEX': {
        const gk = payload as GasKardexEntry;
        if (!state.gas_kardex_entries) state.gas_kardex_entries = [];
        const targetId = gk?.entry_id || event.entity_id;
        const idx = state.gas_kardex_entries.findIndex(k => k.entry_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.gas_kardex_entries = state.gas_kardex_entries.filter(k => k.entry_id !== targetId);
        } else if (idx >= 0) {
          state.gas_kardex_entries = state.gas_kardex_entries.map(k => k.entry_id === targetId ? { ...k, ...gk, updated_at: new Date().toISOString() } : k);
        } else if (gk) {
          state.gas_kardex_entries.push(gk);
        }
        // Recalculate running balances for this customer's entries partitioned by cylinder type
        const custId = gk?.customer_id || (idx >= 0 ? state.gas_kardex_entries[idx]?.customer_id : undefined);
        if (custId) {
          LocalStorageManager.recalculateCustomerKardex(state, custId);
        }
        break;
      }
      case 'GOODS_RECEIPT': {
        const rc = payload as GoodsReceiptRecord;
        if (!state.goods_receipts) state.goods_receipts = [];
        const targetId = rc?.receipt_id || event.entity_id;
        const idx = state.goods_receipts.findIndex(r => r.receipt_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.goods_receipts = state.goods_receipts.filter(r => r.receipt_id !== targetId);
          if (state.stock_movements) {
            state.stock_movements = state.stock_movements.filter(m => !m.movement_id.startsWith(`MOV-RCP-${targetId}`));
          }
        } else if (idx >= 0) {
          state.goods_receipts = state.goods_receipts.map(r => r.receipt_id === targetId ? { ...r, ...rc, updated_at: new Date().toISOString() } : r);
        } else if (rc) {
          state.goods_receipts = [rc, ...state.goods_receipts];
        }
        break;
      }
      case 'CYLINDER_VALVE_INSPECTION': {
        const insp = payload as CylinderValveInspection;
        if (!state.cylinder_valve_inspections) state.cylinder_valve_inspections = [];
        const targetId = insp?.inspection_id || event.entity_id;
        const idx = state.cylinder_valve_inspections.findIndex(i => i.inspection_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.cylinder_valve_inspections = state.cylinder_valve_inspections.filter(i => i.inspection_id !== targetId);
        } else if (idx >= 0) {
          const updatedInsp = { ...state.cylinder_valve_inspections[idx], ...insp, updated_at: new Date().toISOString() };
          state.cylinder_valve_inspections = state.cylinder_valve_inspections.map(i => i.inspection_id === targetId ? updatedInsp : i);
          this.syncInspectionToWarehouseAndInventory(state, updatedInsp, insp?.inspector_user_id || 'USR-003');
        } else if (insp) {
          state.cylinder_valve_inspections = [insp, ...state.cylinder_valve_inspections];
          this.syncInspectionToWarehouseAndInventory(state, insp, insp.inspector_user_id || 'USR-003');
        }
        break;
      }
      case 'GAS_PRODUCTION_KARDEX': {
        const pk = payload as GasProductionKardexEntry;
        if (!state.gas_production_kardex_entries) state.gas_production_kardex_entries = [];
        const targetId = pk?.entry_id || event.entity_id;
        const idx = state.gas_production_kardex_entries.findIndex(k => k.entry_id === targetId);
        if (event.event_type === 'DELETE') {
          if (idx >= 0) state.gas_production_kardex_entries = state.gas_production_kardex_entries.filter(k => k.entry_id !== targetId);
        } else if (idx >= 0) {
          state.gas_production_kardex_entries = state.gas_production_kardex_entries.map(k => k.entry_id === targetId ? { ...k, ...pk, updated_at: new Date().toISOString() } : k);
        } else if (pk) {
          state.gas_production_kardex_entries.push(pk);
        }
        break;
      }
      case 'NOTIFICATION': {
        if (!state.notifications) state.notifications = [];
        const p = payload as any;
        if (p?.action === 'MARK_READ' && p.notification_id && p.user_id) {
          state.notifications = state.notifications.map(n =>
            n.notification_id === p.notification_id
              ? { ...n, read_by: Array.isArray(n.read_by) && n.read_by.includes(p.user_id) ? n.read_by : [...(n.read_by || []), p.user_id] }
              : n
          );
        } else if (p?.action === 'MARK_ALL_READ' && p.user_id) {
          const cutoff = p.timestamp ? new Date(p.timestamp).getTime() : Date.now();
          state.notifications = state.notifications.map(n => {
            const nt = n.created_at ? new Date(n.created_at).getTime() : 0;
            if (nt <= cutoff) {
              const rb = Array.isArray(n.read_by) ? n.read_by : [];
              return rb.includes(p.user_id) ? n : { ...n, read_by: [...rb, p.user_id] };
            }
            return n;
          });
        } else if (event.event_type === 'DELETE' || p?.action === 'CLEAR_ALL') {
          const cutoff = p?.timestamp ? new Date(p.timestamp).getTime() : 0;
          if (cutoff > 0) {
            state.notifications = state.notifications.filter(n => new Date(n.created_at || 0).getTime() > cutoff);
          } else if (p?.notification_id) {
            state.notifications = state.notifications.filter(n => n.notification_id !== p.notification_id);
          } else {
            state.notifications = [];
          }
        } else if (p?.notification_id) {
          const idx = state.notifications.findIndex(n => n.notification_id === p.notification_id);
          if (idx >= 0) {
            state.notifications[idx] = { ...state.notifications[idx], ...p };
          } else {
            state.notifications.unshift(p as AppNotification);
          }
        }
        break;
      }
      case 'SYSTEM': {
        const p = payload as any;
        const action = p?.action || '';
        if (
          action === 'DATABASE_PURGED' ||
          action === 'INVENTORY_ZEROED' ||
          event.entity_id === 'GLOBAL_PURGE' ||
          event.entity_id === 'ZERO_ALL_INVENTORY'
        ) {
          const purgedAt = p?.purged_at || p?.timestamp || event.server_received_at || event.client_created_at || new Date().toISOString();
          const preserveProducts = p?.preserve_products !== false;
          this.applyPurgeInPlace(state, purgedAt, preserveProducts, p?.author || 'مدیریت ارشد', event.server_sequence);
        }
        break;
      }
    }
  }

  /**
   * Recalculates running balances for a customer partitioned by cylinder type
   * Ensures each cylinder type (11kg, 25kg, 50kg, 22kg forklift) maintains its own independent kardex balance
   * Items are sorted in ascending chronological order (older items first, newer items sit lower down)
   */
  static recalculateCustomerKardex(state: LocalDatabaseState, custId: string) {
    if (!state.gas_kardex_entries || !custId) return;
    const custEntries = state.gas_kardex_entries.filter(k => k.customer_id === custId && !k.is_deleted);
    const groups = new Map<string, GasKardexEntry[]>();
    custEntries.forEach(k => {
      const type = normalizeCylinderType(k.cylinder_type);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(k);
    });
    groups.forEach(groupEntries => {
      const sorted = [...groupEntries].sort((a, b) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
      const recalculated = recalculateKardexBalances(sorted);
      recalculated.forEach(rec => {
        if (!rec.dispatched && !rec.waybill_number) {
          if (rec.inspection_id && state.cylinder_valve_inspections) {
            const insp = state.cylinder_valve_inspections.find(i => i.inspection_id === rec.inspection_id);
            if (insp && insp.waybill_number) {
              rec.waybill_number = insp.waybill_number;
              rec.dispatched = insp.waybill_number;
            }
          }
          if (!rec.waybill_number && state.cylinder_valve_inspections) {
            const insp = state.cylinder_valve_inspections.find(i => i.form_number === rec.transfer_sheet_number);
            if (insp && insp.waybill_number) {
              rec.waybill_number = insp.waybill_number;
              rec.dispatched = insp.waybill_number;
            }
          }
          if (!rec.waybill_number && state.goods_receipts) {
            const rcp = state.goods_receipts.find(r => r.entry_id === rec.entry_id || r.form_number === rec.transfer_sheet_number);
            if (rcp && rcp.waybill_number) {
              rec.waybill_number = rcp.waybill_number;
              rec.dispatched = rcp.waybill_number;
            }
          }
        }
        const targetIndex = state.gas_kardex_entries.findIndex(e => e.entry_id === rec.entry_id);
        if (targetIndex >= 0) state.gas_kardex_entries[targetIndex] = rec;
      });
    });
  }

  // Goods Receipt Specific Helpers
  static saveGoodsReceipt(
    env: RuntimeEnvironment,
    receiptData: Omit<GoodsReceiptRecord, 'receipt_id' | 'created_at' | 'updated_at'> & { receipt_id?: string },
    userId: string = 'USR-001'
  ): GoodsReceiptRecord {
    const state = this.getState(env);
    if (!state.goods_receipts) state.goods_receipts = [];

    const now = new Date().toISOString();
    const existing = receiptData.receipt_id
      ? state.goods_receipts.find(r => r.receipt_id === receiptData.receipt_id)
      : receiptData.entry_id
      ? state.goods_receipts.find(r => r.entry_id === receiptData.entry_id && r.receipt_type === receiptData.receipt_type)
      : undefined;

    const receipt_id = existing ? existing.receipt_id : (receiptData.receipt_id || generateUUID('RCP'));
    const isNew = !existing;

    // Unrestricted editing for all authorized users (1-hour timeout disabled)

    const actorUser = this.getUserById(env, userId);
    const creatorUsername =
      receiptData.created_by_username ||
      actorUser?.username ||
      (userId === 'USR-002' ? 'karami' : userId === 'USR-003' ? 'hajivand' : 'amouei');

    const fullRecord: GoodsReceiptRecord = {
      ...receiptData,
      receipt_id,
      user_id: userId,
      created_by_username: existing?.created_by_username || creatorUsername,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    this.recordLocalChange(
      env,
      userId,
      'GOODS_RECEIPT',
      isNew ? 'CREATE' : 'UPDATE',
      receipt_id,
      fullRecord,
      isNew
        ? `ثبت سند برگه ${receiptData.receipt_type === 'ENTRY' ? 'ورود' : 'خروج'} کالا شماره ${receiptData.form_number}`
        : `ویرایش سند برگه ${receiptData.receipt_type === 'ENTRY' ? 'ورود' : 'خروج'} کالا شماره ${receiptData.form_number}`,
      { form_number: receiptData.form_number, receipt_type: receiptData.receipt_type, entry_id: receiptData.entry_id }
    );

    // Sync dispatched quantity, waybill_number, and scrap_balance back to linked GasKardexEntry if present
    if (fullRecord.entry_id && (fullRecord.dispatched !== undefined || fullRecord.scrap_balance !== undefined || fullRecord.waybill_number)) {
      const kardexEntry = state.gas_kardex_entries?.find(e => e.entry_id === fullRecord.entry_id);
      if (kardexEntry) {
        if (fullRecord.dispatched !== undefined && String(fullRecord.dispatched).trim() !== '') {
          kardexEntry.dispatched = String(fullRecord.dispatched || '').trim();
        }
        if (fullRecord.waybill_number && String(fullRecord.waybill_number).trim() !== '') {
          kardexEntry.waybill_number = String(fullRecord.waybill_number).trim();
          if (!kardexEntry.dispatched) {
            kardexEntry.dispatched = kardexEntry.waybill_number;
          }
        }
        if (fullRecord.scrap_balance !== undefined) {
          kardexEntry.scrap_balance = Math.max(0, Number(fullRecord.scrap_balance) || 0);
        }
        kardexEntry.updated_at = now;
        this.recordLocalChange(
          env,
          userId,
          'GAS_KARDEX',
          'UPDATE',
          kardexEntry.entry_id,
          kardexEntry,
          `به‌روزرسانی ستون ارسالی (${kardexEntry.dispatched || '-'}) و مانده ضایعات (${kardexEntry.scrap_balance || 0}) کاردکس از برگه ${receiptData.receipt_type === 'ENTRY' ? 'ورود' : 'خروج'}`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: kardexEntry }));
        }
      }
    }

    // Immediately synchronize receipt items with warehouse stock movements (ورود/خروج موجودی کالا در پل کاربر)
    if (fullRecord.items && Array.isArray(fullRecord.items) && fullRecord.items.length > 0) {
      this.syncGoodsReceiptItemsToWarehouse(env, fullRecord, userId);
    }

    return fullRecord;
  }

  /**
   * Synchronize all items from a Goods Receipt (ورود یا خروج کالا) into warehouse inventory & stock movements
   * Guarantees that items are immediately updated in the user bridge (موجودی انبار و پل کاربر)
   */
  static syncGoodsReceiptItemsToWarehouse(
    env: RuntimeEnvironment,
    receipt: GoodsReceiptRecord,
    userId: string = 'USR-001'
  ): StockMovement[] {
    const state = this.getState(env);
    if (!state.products) state.products = [];
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.warehouses || state.warehouses.length === 0) {
      state.warehouses = JSON.parse(JSON.stringify(SEED_WAREHOUSES));
    }

    const defaultWarehouse = state.warehouses.find(w => w.warehouse_id === 'WH-VALVES' || w.warehouse_id === 'WH-01') || state.warehouses[0];
    const createdMovements: StockMovement[] = [];
    const now = new Date().toISOString();

    // 1. Remove previous stock movements linked to this receipt form or receipt_id
    state.stock_movements = state.stock_movements.filter(
      m => !(
        (m.reference_id === receipt.form_number && ((m as any).linked_receipt_id === receipt.receipt_id || m.document_number?.includes(receipt.form_number))) ||
        m.movement_id.startsWith(`MOV-RCP-${receipt.receipt_id}`)
      )
    );

    // 2. Process each item in the receipt
    const items = receipt.items || [];
    items.forEach((item, index) => {
      const rawDesc = (item.itemDescription || item.description || '').trim();
      const qty = Number(item.quantity) || 0;
      if (!rawDesc || qty <= 0) return;

      // Find or create product in product catalog
      let product = state.products.find(
        p => p.name.trim().toLowerCase() === rawDesc.toLowerCase() ||
             p.product_id === rawDesc ||
             (p.sku && p.sku.toLowerCase() === rawDesc.toLowerCase())
      );

      if (!product) {
        // Keyword heuristic for category
        let catId = 'CAT-02';
        const lower = rawDesc.toLowerCase();
        if (lower.includes('سیلندر') || lower.includes('کپسول')) {
          catId = 'CAT-01';
        } else if (lower.includes('مهره') || lower.includes('nut')) {
          catId = 'CAT-NUTS';
        } else if (lower.includes('ضایعات') || lower.includes('اسقاط')) {
          catId = 'CAT-04';
        }

        product = {
          product_id: `PRD-RCP-${Date.now()}-${index}`,
          sku: `ITEM-${Math.floor(100 + Math.random() * 900)}`,
          name: rawDesc,
          category_id: catId,
          unit: item.unit || 'عدد',
          min_stock: 10,
          purchase_price: 1500000,
          sale_price: 2100000,
          barcode: `626088${Math.floor(1000000 + Math.random() * 9000000)}`,
          description: `کالای ثبت‌شده از برگه ${receipt.receipt_type === 'ENTRY' ? 'ورود' : 'خروج'} شماره ${receipt.form_number} (${receipt.party_name || receipt.customer_name || ''})`,
          created_at: now,
          updated_at: now
        };
        state.products.push(product);
      }

      const movId = `MOV-RCP-${receipt.receipt_id}-${index + 1}`;
      const isEntry = receipt.receipt_type === 'ENTRY';
      const movement: StockMovement = {
        movement_id: movId,
        product_id: product.product_id,
        warehouse_id: defaultWarehouse.warehouse_id,
        shelf_location: defaultWarehouse.shelf_location || 'A1',
        quantity: qty,
        movement_type: isEntry ? 'STOCK_IN' : 'STOCK_OUT',
        reference_id: receipt.form_number,
        document_number: `برگه ${isEntry ? 'ورود' : 'خروج'} کالا شماره ${receipt.form_number}`,
        description: `${isEntry ? 'ورود به انبار' : 'خروج از انبار'} بابت برگه شماره ${receipt.form_number} (${receipt.party_name || receipt.customer_name || 'ام‌گاز'}) - ${rawDesc}`,
        customer_id: receipt.customer_id || ((receipt as any).party_type === 'CUSTOMER' ? (receipt as any).party_id : undefined),
        customer_name: receipt.customer_name || receipt.party_name,
        valve_ownership: ((receipt as any).party_type === 'CUSTOMER' || receipt.customer_id) ? 'CUSTOMER' : 'MGAS',
        item_condition: item.condition || 'HEALTHY',
        notes: `طرف حساب: ${receipt.party_name || receipt.customer_name || ''} | راننده: ${receipt.driver_name || ''} | خودرو: ${receipt.plate_number || ''}`,
        user_id: userId,
        created_by_username: receipt.created_by_username || 'karami',
        device_id: state.deviceId,
        event_id: generateUUID('EVT'),
        created_at: receipt.date || receipt.created_at || now
      };
      (movement as any).linked_receipt_id = receipt.receipt_id;

      state.stock_movements.unshift(movement);
      createdMovements.push(movement);

      // Record local change for real-time sync across user bridge and Cloudflare
      this.recordLocalChange(
        env,
        userId,
        'STOCK_MOVEMENT',
        'CREATE',
        movement.movement_id,
        movement,
        `${isEntry ? 'ورود' : 'خروج'} ${qty} ${product.unit || 'عدد'} ${product.name} بابت برگه ${receipt.form_number}`,
        { form_number: receipt.form_number, product_name: product.name, quantity: qty, receipt_type: receipt.receipt_type }
      );
    });

    this.saveState(env, state);

    // Sync to all other local environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        try {
          const otherState = this.getState(otherEnv);
          otherState.stock_movements = otherState.stock_movements.filter(
            m => !(
              (m.reference_id === receipt.form_number && ((m as any).linked_receipt_id === receipt.receipt_id || m.document_number?.includes(receipt.form_number))) ||
              m.movement_id.startsWith(`MOV-RCP-${receipt.receipt_id}`)
            )
          );
          for (const m of createdMovements) {
            otherState.stock_movements.unshift(m);
          }
          this.saveState(otherEnv, otherState);
        } catch {}
      }
    }

    // Broadcast instant UI updates
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: createdMovements }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated', { detail: createdMovements }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return createdMovements;
  }

  static getGoodsReceiptByEntryId(
    env: RuntimeEnvironment,
    entryId: string,
    receiptType?: GoodsReceiptType
  ): GoodsReceiptRecord | undefined {
    const state = this.getState(env);
    if (!state.goods_receipts) return undefined;
    return state.goods_receipts.find(r => {
      if (r.entry_id !== entryId) return false;
      if (receiptType && r.receipt_type !== receiptType) return false;
      return true;
    });
  }

  static getGoodsReceiptByFormNumber(
    env: RuntimeEnvironment,
    formNumber: string,
    receiptType?: GoodsReceiptType
  ): GoodsReceiptRecord | undefined {
    const state = this.getState(env);
    if (!state.goods_receipts) return undefined;
    return state.goods_receipts.find(r => {
      if (r.form_number !== formNumber) return false;
      if (receiptType && r.receipt_type !== receiptType) return false;
      return true;
    });
  }

  static getAllGoodsReceipts(env: RuntimeEnvironment, receiptType?: GoodsReceiptType): GoodsReceiptRecord[] {
    const state = this.getState(env);
    if (!state.goods_receipts) return [];
    if (receiptType) {
      return state.goods_receipts.filter(r => r.receipt_type === receiptType);
    }
    return [...state.goods_receipts];
  }

  static deleteGoodsReceipt(env: RuntimeEnvironment, receiptId: string, userId: string = 'USR-001') {
    const state = this.getState(env);
    const existing = state.goods_receipts?.find(r => r.receipt_id === receiptId);

    if (existing) {
      // Remove stock movements associated with this receipt
      state.stock_movements = (state.stock_movements || []).filter(
        m => !(
          (m.reference_id === existing.form_number && ((m as any).linked_receipt_id === existing.receipt_id || m.document_number?.includes(existing.form_number))) ||
          m.movement_id.startsWith(`MOV-RCP-${receiptId}`)
        )
      );
      state.goods_receipts = (state.goods_receipts || []).filter(r => r.receipt_id !== receiptId);
      this.saveState(env, state);

      // Clean other local environments
      const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
      for (const otherEnv of allEnvs) {
        if (otherEnv !== env) {
          try {
            const otherState = this.getState(otherEnv);
            otherState.stock_movements = (otherState.stock_movements || []).filter(
              m => !(
                (m.reference_id === existing.form_number && ((m as any).linked_receipt_id === existing.receipt_id || m.document_number?.includes(existing.form_number))) ||
                m.movement_id.startsWith(`MOV-RCP-${receiptId}`)
              )
            );
            otherState.goods_receipts = (otherState.goods_receipts || []).filter(r => r.receipt_id !== receiptId);
            this.saveState(otherEnv, otherState);
          } catch {}
        }
      }
    }

    this.recordLocalChange(
      env,
      userId,
      'GOODS_RECEIPT',
      'DELETE',
      receiptId,
      { receipt_id: receiptId },
      `حذف سند برگه با شناسه ${receiptId}`,
      { receipt_id: receiptId }
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}
  }

  /**
   * Update an existing stock movement in warehouse inventory
   */
  static updateStockMovement(
    env: RuntimeEnvironment,
    updatedMovement: StockMovement,
    actorUser?: User | null
  ): { success: boolean; movement?: StockMovement; error?: string } {
    const state = this.getState(env);
    if (!state.stock_movements) state.stock_movements = [];

    const existingIdx = state.stock_movements.findIndex(m => m.movement_id === updatedMovement.movement_id);
    if (existingIdx === -1) {
      return { success: false, error: 'سند گردش انبار مورد نظر یافت نشد.' };
    }
    const existing = state.stock_movements[existingIdx];

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    const sanitized: StockMovement = {
      ...existing,
      ...updatedMovement,
      movement_id: existing.movement_id,
      quantity: Math.max(0, Number(updatedMovement.quantity) || 0)
    };

    state.stock_movements[existingIdx] = sanitized;
    this.saveState(env, state);

    // Reconcile across all environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        try {
          const oState = this.getState(otherEnv);
          const oIdx = (oState.stock_movements || []).findIndex(m => m.movement_id === sanitized.movement_id);
          if (oIdx >= 0) {
            oState.stock_movements[oIdx] = { ...sanitized };
            this.saveState(otherEnv, oState);
          }
        } catch {}
      }
    }

    this.recordLocalChange(
      env,
      actorUser?.user_id || 'USR-001',
      'STOCK_MOVEMENT',
      'UPDATE',
      sanitized.movement_id,
      sanitized,
      `ویرایش سند گردش کالا شماره ${sanitized.reference_id || sanitized.movement_id}`,
      { movement_id: sanitized.movement_id, quantity: sanitized.quantity }
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: [sanitized] }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return { success: true, movement: sanitized };
  }

  /**
   * Delete a stock movement from warehouse inventory
   */
  static deleteStockMovement(
    env: RuntimeEnvironment,
    movementId: string,
    actorUser?: User | null
  ): { success: boolean; error?: string } {
    const state = this.getState(env);
    if (!state.stock_movements) state.stock_movements = [];

    const existing = state.stock_movements.find(m => m.movement_id === movementId);
    if (!existing) {
      return { success: false, error: 'سند گردش انبار مورد نظر یافت نشد.' };
    }

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    this.markEntityPermanentlyDeleted(movementId);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.stock_movements) {
        s.stock_movements = s.stock_movements.filter(m => m.movement_id !== movementId);
        this.saveState(targetEnv, s);
      }
    }

    this.recordLocalChange(
      env,
      actorUser?.user_id || 'USR-001',
      'STOCK_MOVEMENT',
      'DELETE',
      movementId,
      { movement_id: movementId },
      `حذف سند گردش کالا شماره ${existing.reference_id || movementId}`,
      { movement_id: movementId }
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated'));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added'));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return { success: true };
  }

  /**
   * Registers a detailed warehouse movement (ورود یا خروج کالا / قطعات / شیرآلات / سیلندرها)
   * with automated dual accounting/inventory logic:
   * 1. If Party is CUSTOMER (مشتری):
   *    - Directly updates the customer's Repair Kardex (کاردکس تعمیر - gas_kardex_entries)
   *    - Inflow (STOCK_IN) adds to customer repair kardex (e.g. cylinder_in, new_valve_in, or used_valve_in)
   *    - Outflow (STOCK_OUT) deducts from customer repair kardex (e.g. cylinder_out, new_valve_out, or used_valve_out)
   *    - Recalculates running balances (cylinder_balance, new_valve_balance, used_valve_balance)
   *    - Tags movement with valve_ownership: 'CUSTOMER'
   * 2. If Party is SUPPLIER (تأمین‌کننده ام‌گاز):
   *    - Directly adds to or deducts from M-Gas company inventory (موجودی ام‌گاز)
   *    - Tags movement with valve_ownership: 'MGAS'
   *    - Does NOT touch customer repair kardex
   * 3. Automatically pre-generates formal GoodsReceiptRecord (برگه ورود یا خروج کالا)
   */
  static recordWarehouseMovementWithDualLogic(
    env: RuntimeEnvironment,
    currentUser: User,
    params: {
      movementType: MovementType;
      partyType: 'CUSTOMER' | 'SUPPLIER';
      customerId?: string;
      customerName?: string;
      supplierId?: string;
      supplierName?: string;
      productId: string;
      warehouseId: string;
      toWarehouseId?: string;
      quantity: number;
      itemCondition: 'HEALTHY' | 'DEFECTIVE';
      referenceId: string;
      shelfLetter?: string;
      shelfNumber?: number;
      shelfLocation?: string;
      driverName?: string;
      plateNumber?: string;
      waybillNumber?: string;
      notes?: string;
    }
  ): {
    success: boolean;
    movement: StockMovement;
    kardexEntry?: GasKardexEntry;
    receipt: GoodsReceiptRecord;
    error?: string;
  } {
    const state = this.getState(env);
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];
    if (!state.goods_receipts) state.goods_receipts = [];
    if (!state.products) state.products = [];

    const qty = Math.max(0, Number(params.quantity) || 1);
    const prod = state.products.find(p => p.product_id === params.productId);
    const prodName = prod?.name || params.productId;
    const nowIso = new Date().toISOString();
    const persianDate = getPersianDate(nowIso);

    const isStockIn = params.movementType === 'STOCK_IN' || params.movementType === 'PURCHASE' || params.movementType === 'RETURN_IN';
    const isValve = prod?.category_id === 'CAT-02' || prod?.sku?.includes('VLV') || prodName.includes('شیر') || prodName.includes('سوپاپ') || isValveProduct(prod, state.categories);
    const isCylinder = prod?.category_id === 'CAT-01' || prod?.sku?.includes('CYL') || prodName.includes('سیلندر') || prodName.includes('کپسول') || prodName.includes('مخزن');
    const isUsed = params.itemCondition === 'DEFECTIVE' || prodName.includes('کهنه') || prodName.includes('داغی');

    let kardexEntry: GasKardexEntry | undefined;

    // 1. BUSINESS LOGIC A: If Customer, reflect in Repair Kardex (کاردکس تعمیر مشتری)
    if (params.partyType === 'CUSTOMER' || Boolean(params.customerId)) {
      const custId = params.customerId || state.customers[0]?.customer_id || 'CUST-001';
      const custObj = state.customers.find(c => c.customer_id === custId);
      const custName = custObj?.name || params.customerName || 'مشتری طرف حساب';

      let matchedCylType = 'سیلندر 11 کیلویی';
      if (prodName.includes('۵۰') || prodName.includes('50')) {
        matchedCylType = 'سیلندر 50 کیلویی';
      } else if (prodName.includes('۲۵') || prodName.includes('25')) {
        matchedCylType = 'سیلندر 25 کیلویی';
      } else if (prodName.includes('لیفتراک')) {
        matchedCylType = 'سیلندر لیفتراکی';
      } else if (prodName.includes('5/8') || prodName.includes('۵/۸') || prodName.includes('5/6') || prodName.includes('۵/۶')) {
        matchedCylType = 'پیکنیک 5/6 کیلویی';
      } else if (prodName.includes('پیکنیک') || prodName.includes('1/1.5/3') || prodName.includes('۱/۱.۵/۳') || prodName.includes('2kg') || prodName.includes('5kg')) {
        matchedCylType = 'پیکنیک 1/1.5/3 لیتری';
      } else {
        matchedCylType = 'سیلندر 11 کیلویی';
      }

      let cylIn = 0;
      let cylOut = 0;
      let newValIn = 0;
      let newValOut = 0;
      let usedValIn = 0;
      let usedValOut = 0;

      if (isCylinder) {
        if (isStockIn) cylIn = qty;
        else cylOut = qty;
      } else if (isValve) {
        if (isUsed) {
          if (isStockIn) usedValIn = qty;
          else usedValOut = qty;
        } else {
          if (isStockIn) newValIn = qty;
          else newValOut = qty;
        }
      }

      const userNotes = (params.notes || '').trim();
      const baseDesc = isStockIn
        ? `ورود از حساب مشتری: ${qty} عدد ${prodName} (${params.itemCondition === 'DEFECTIVE' ? 'کهنه/داغی' : 'نو/سالم'}) به انبار`
        : `خروج از انبار به حساب مشتری: ${qty} عدد ${prodName} (${params.itemCondition === 'DEFECTIVE' ? 'کهنه/داغی' : 'نو/سالم'})`;

      // CRITICAL USER REQUIREMENT:
      // "همینطور باید توضیحات و شرح گردش هم در کاردکس تعمیر سیلندر وارد شود"
      const finalDesc = userNotes
        ? `${baseDesc} - ${userNotes}`
        : baseDesc;

      const valveCategory: 'NEW' | 'USED' = isUsed ? 'USED' : 'NEW';
      const valveItemsList = isValve ? [
        {
          valve_name: prodName,
          valve_category: valveCategory,
          quantity: qty,
          direction: (isStockIn ? 'IN' : 'OUT') as 'IN' | 'OUT'
        }
      ] : undefined;

      const kardexId = generateUUID('GK');
      kardexEntry = {
        entry_id: kardexId,
        customer_id: custId,
        customer_name: custName,
        cylinder_type: matchedCylType,
        date: persianDate,
        description: finalDesc,
        transfer_sheet_number: params.referenceId || `MOV-${Date.now().toString().slice(-5)}`,
        cylinder_in: cylIn,
        cylinder_out: cylOut,
        scrap_out: 0,
        cylinder_balance: 0,
        scrap_balance: 0,
        new_valve_in: newValIn,
        new_valve_out: newValOut,
        new_valve_balance: 0,
        used_valve_in: usedValIn,
        used_valve_out: usedValOut,
        used_valve_balance: 0,
        defective: 0,
        dispatched: params.waybillNumber || (!isStockIn ? String(qty) : ''),
        waybill_number: params.waybillNumber || '',
        valve_items: valveItemsList,
        notes: userNotes || baseDesc,
        user_id: currentUser.user_id,
        created_by_username: currentUser.username,
        device_id: state.deviceId,
        event_id: generateUUID('EVT'),
        created_at: nowIso,
        updated_at: nowIso
      };

      state.gas_kardex_entries.push(kardexEntry);
      this.recalculateCustomerKardex(state, custId);

      this.recordLocalChange(
        env,
        currentUser.user_id,
        'GAS_KARDEX',
        'CREATE',
        kardexId,
        kardexEntry,
        `ثبت در کاردکس تعمیر ${custName} بابت گردش کالا برگه ${params.referenceId}${userNotes ? ` (شرح: ${userNotes})` : ''}`,
        { customer_name: custName, quantity: qty, product_name: prodName, notes: userNotes }
      );
    }

    // 2. STOCK MOVEMENT ENTRY
    const movId = generateUUID('MOV');
    const shelfLoc = params.shelfLetter && params.shelfNumber
      ? `${params.shelfLetter}${params.shelfNumber}`
      : undefined;

    const partyLabel = params.partyType === 'CUSTOMER'
      ? (params.customerName || 'مشتری')
      : (params.supplierName || 'شعبه ام گاز (انبار مرکزی)');

    const movement: StockMovement = {
      movement_id: movId,
      product_id: params.productId,
      warehouse_id: params.warehouseId,
      to_warehouse_id: params.toWarehouseId,
      quantity: qty,
      movement_type: params.movementType,
      reference_id: params.referenceId,
      document_number: `سند ${isStockIn ? 'ورود' : 'خروج'} شماره ${params.referenceId}`,
      description: `${isStockIn ? 'ورود به انبار' : 'خروج از انبار'}: ${qty} عدد ${prodName} (${params.itemCondition === 'DEFECTIVE' ? 'کهنه/معیوب' : 'نو/سالم'}) - طرف حساب: ${partyLabel}`,
      shelf_location: shelfLoc,
      item_condition: params.itemCondition,
      valve_ownership: params.partyType === 'CUSTOMER' ? 'CUSTOMER' : 'MGAS',
      customer_id: params.partyType === 'CUSTOMER' ? params.customerId : undefined,
      customer_name: params.partyType === 'CUSTOMER' ? params.customerName : undefined,
      party_type: params.partyType,
      supplier_id: params.partyType === 'SUPPLIER' ? params.supplierId : undefined,
      supplier_name: params.partyType === 'SUPPLIER' ? params.supplierName : undefined,
      driver_name: params.driverName,
      plate_number: params.plateNumber,
      waybill_number: params.waybillNumber,
      linked_kardex_entry_id: kardexEntry?.entry_id,
      notes: params.notes ? `${params.notes} | طرف حساب: ${partyLabel}` : `طرف حساب: ${partyLabel}`,
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      device_id: state.deviceId,
      event_id: generateUUID('EVT'),
      created_at: nowIso
    };

    state.stock_movements.unshift(movement);

    if (shelfLoc && params.shelfLetter && params.shelfNumber) {
      this.updateWarehouseShelf(env, params.warehouseId, params.shelfLetter, params.shelfNumber);
    }

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'STOCK_MOVEMENT',
      'CREATE',
      movId,
      movement,
      `${isStockIn ? 'ورود' : 'خروج'} ${qty} ${prod?.unit || 'عدد'} ${prodName} بابت برگه ${params.referenceId}`,
      { product_name: prodName, quantity: qty, party_type: params.partyType, owner: partyLabel }
    );

    // 3. FORMAL GOODS RECEIPT (برگه ورود یا خروج کالا)
    const receiptType: GoodsReceiptType = isStockIn ? 'ENTRY' : 'EXIT';
    const rcpId = generateUUID('RCP');
    const formNum = params.referenceId?.match(/\d+/)?.[0] || params.referenceId || allocateNextUniqueReceiptNumber(env, receiptType);

    const condSuffix = params.itemCondition === 'DEFECTIVE' ? ' (کهنه / داغی)' : ' (نو / سالم)';
    const itemDesc = `${prodName}${condSuffix}`;

    const receipt: GoodsReceiptRecord = {
      receipt_id: rcpId,
      receipt_type: receiptType,
      form_number: formNum,
      date: persianDate,
      customer_id: params.partyType === 'CUSTOMER' ? params.customerId : undefined,
      customer_name: params.partyType === 'CUSTOMER' ? params.customerName : undefined,
      party_name: partyLabel,
      party_type: params.partyType,
      entry_id: movement.movement_id,
      vehicle_type: params.plateNumber ? 'کامیون / خاور حمل بار' : 'خاور مسقف',
      plate_number: params.plateNumber || 'ایران 22 - 345 ع 78',
      driver_name: params.driverName || 'راننده توزیع / حمل',
      waybill_number: params.waybillNumber || params.referenceId,
      items: [
        {
          rowNum: 1,
          description: itemDesc,
          itemDescription: itemDesc,
          quantity: qty,
          quantityInWords: numberToPersianWords(qty),
          remarks: params.notes || (params.itemCondition === 'DEFECTIVE' ? 'شیر کهنه و داغی' : 'شیر نو و سالم')
        }
      ],
      signer_1: currentUser.full_name || 'مسئول انبار و تحویل',
      signer_2: 'سرپرست انبار',
      signer_3: 'امور مالی و اداری',
      signer_4: params.driverName || 'امضاء راننده',
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      created_at: nowIso,
      updated_at: nowIso
    };

    state.goods_receipts.unshift(receipt);
    movement.linked_receipt_id = rcpId;

    this.recordLocalChange(
      env,
      currentUser.user_id,
      'GOODS_RECEIPT',
      'CREATE',
      rcpId,
      receipt,
      `صدور خودکار برگه ${isStockIn ? 'ورود' : 'خروج'} شماره ${formNum} برای ${partyLabel}`,
      { form_number: formNum, receipt_type: receiptType, movement_id: movId }
    );

    this.saveState(env, state);

    // Reconcile to other environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        try {
          const oState = this.getState(otherEnv);
          if (!oState.stock_movements) oState.stock_movements = [];
          if (!oState.goods_receipts) oState.goods_receipts = [];
          if (!oState.gas_kardex_entries) oState.gas_kardex_entries = [];

          oState.stock_movements.unshift({ ...movement });
          oState.goods_receipts.unshift({ ...receipt });
          if (kardexEntry) {
            oState.gas_kardex_entries.push({ ...kardexEntry });
            if (params.customerId) this.recalculateCustomerKardex(oState, params.customerId);
          }
          this.saveState(otherEnv, oState);
        } catch {}
      }
    }

    // Broadcast instant reactive events
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: [movement] }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated', { detail: [movement] }));
        if (kardexEntry) {
          window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: kardexEntry }));
        }
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return {
      success: true,
      movement,
      kardexEntry,
      receipt
    };
  }

  // Cylinder & Valve Inspections Helpers (Hajivand Entry & Karami Kardex Workflow)
  static getCylinderValveInspections(env: RuntimeEnvironment): CylinderValveInspection[] {
    const state = this.getState(env);
    return state.cylinder_valve_inspections || SEED_CYLINDER_VALVE_INSPECTIONS;
  }

  static ensureInspectionProductExists(
    state: LocalDatabaseState,
    inspection: CylinderValveInspection
  ): Product | null {
    if (!state.products) state.products = [];
    const rawName = (inspection.item_name || '').trim();
    if (!rawName) return null;

    if (inspection.item_type === 'VALVE_NEW' || (rawName.includes('شیر') && rawName.includes('نو'))) {
      this.ensureValveProductsExist(state);
      return state.products.find(
        p => p.product_id === 'PRD-VALVE-NEW' || 
             p.product_id === 'PRD-VLV-11-25-50' || 
             p.sku === 'VLV-11-25-50' ||
             p.name.trim() === 'قطعه شیر نو' || 
             p.name.trim() === 'شیر 11/25/50 کیلویی' ||
             p.name.includes('شیر نو')
      ) || state.products.find(p => p.category_id === 'CAT-02') || null;
    }

    if (inspection.item_type === 'VALVE_USED' || (rawName.includes('شیر') && (rawName.includes('کهنه') || rawName.includes('داغی')))) {
      this.ensureValveProductsExist(state);
      return state.products.find(
        p => p.product_id === 'PRD-VALVE-USED' || 
             p.sku === 'VLV-USED-11' ||
             p.name.trim() === 'قطعه شیر کهنه' || 
             p.name.trim() === 'قطعه شیر کهنه و داغی' ||
             p.name.includes('شیر کهنه')
      ) || null;
    }

    let product = state.products.find(
      p => p.name.trim().toLowerCase() === rawName.toLowerCase() || p.product_id === inspection.item_type
    );

    if (!product) {
      let categoryId = 'CAT-02';
      const lower = rawName.toLowerCase();
      if (lower.includes('سیلندر') || lower.includes('کپسول')) {
        categoryId = 'CAT-01';
      } else if (lower.includes('ضایعات') || lower.includes('اسقاط')) {
        categoryId = 'CAT-04';
      }

      product = {
        product_id: `PRD-${inspection.item_type && inspection.item_type.startsWith('PRD-') ? inspection.item_type : inspection.item_type ? `ITEM-${inspection.item_type}` : `AUTO-${Date.now()}`}`,
        sku: `GAS-${Math.floor(1000 + Math.random() * 9000)}`,
        name: rawName,
        category_id: categoryId,
        unit: 'عدد',
        min_stock: 20,
        purchase_price: 2500000,
        sale_price: 3200000,
        barcode: `626099${Math.floor(1000000 + Math.random() * 9000000)}`,
        description: `کالای ثبت‌شده به صورت خودکار از ورودی شیر و سیلندر (برگه ${inspection.form_number}) - طرف حساب: ${inspection.customer_name}`,
        created_at: inspection.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.products.push(product);
    }
    return product;
  }

  static syncInspectionToWarehouseAndInventory(
    state: LocalDatabaseState,
    inspection: CylinderValveInspection,
    userId: string = 'USR-003'
  ): StockMovement | null {
    if (!state.products) state.products = [];
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.warehouses || state.warehouses.length === 0) {
      state.warehouses = JSON.parse(JSON.stringify(SEED_WAREHOUSES));
    }

    const defaultWarehouse = state.warehouses[0] || {
      warehouse_id: 'WH-001',
      name: 'انبار شیرآلات و اتصالات',
      code: 'WH-VALVES',
      address: 'تهران، جاده مخصوص کرج، کارخانه ام گاز',
      shelf_location: 'A1',
      is_active: true
    };

    const healthyQty = Number(inspection.actual_healthy_quantity) || 0;
    const rawName = (inspection.item_name || '').trim();
    if (!rawName) return null;

    // 1. Ensure product exists in product catalog (Inventory)
    let product: Product | undefined;
    if (inspection.item_type === 'VALVE_NEW' || (rawName.includes('شیر') && rawName.includes('نو'))) {
      this.ensureValveProductsExist(state);
      product = state.products.find(
        p => p.product_id === 'PRD-VALVE-NEW' || 
             p.product_id === 'PRD-VLV-11-25-50' || 
             p.sku === 'VLV-11-25-50' ||
             p.name.trim() === 'قطعه شیر نو' || 
             p.name.trim() === 'شیر 11/25/50 کیلویی' ||
             p.name.includes('شیر نو')
      );
    } else if (inspection.item_type === 'VALVE_USED' || (rawName.includes('شیر') && (rawName.includes('کهنه') || rawName.includes('داغی')))) {
      this.ensureValveProductsExist(state);
      product = state.products.find(
        p => p.product_id === 'PRD-VALVE-USED' || 
             p.sku === 'VLV-USED-11' ||
             p.name.trim() === 'قطعه شیر کهنه' || 
             p.name.trim() === 'قطعه شیر کهنه و داغی' ||
             p.name.includes('شیر کهنه')
      );
    } else {
      product = state.products.find(
        p => p.name.trim().toLowerCase() === rawName.toLowerCase() || p.product_id === inspection.item_type
      );
    }

    if (!product) {
      let categoryId = 'CAT-02';
      const lower = rawName.toLowerCase();
      if (lower.includes('سیلندر') || lower.includes('کپسول')) {
        categoryId = 'CAT-01';
      } else if (lower.includes('ضایعات') || lower.includes('اسقاط')) {
        categoryId = 'CAT-04';
      }

      product = {
        product_id: `PRD-${inspection.item_type && inspection.item_type.startsWith('PRD-') ? inspection.item_type : inspection.item_type ? `ITEM-${inspection.item_type}` : `AUTO-${Date.now()}`}`,
        sku: `GAS-${Math.floor(1000 + Math.random() * 9000)}`,
        name: rawName,
        category_id: categoryId,
        unit: 'عدد',
        min_stock: 20,
        purchase_price: 2500000,
        sale_price: 3200000,
        barcode: `626099${Math.floor(1000000 + Math.random() * 9000000)}`,
        description: `کالای ثبت‌شده به صورت خودکار از ورودی شیر و سیلندر (برگه ${inspection.form_number}) - طرف حساب: ${inspection.customer_name}`,
        created_at: inspection.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.products.push(product);
    }

    // 2. Ensure StockMovement exists in warehouse movements (Stock In / Out)
    const movementRef = inspection.form_number;
    const movementId = `MOV-INSP-${inspection.inspection_id}`;

    // If itemized segregated movements already exist for this inspection or if it has valve_breakdown, do not create duplicate unsegregated MOV-INSP-
    const hasItemizedMovements = state.stock_movements.some(
      m => m.reference_id === movementRef && (m.movement_id.startsWith('MOV-VLV-') || m.movement_id.startsWith('MOV-VALVE-'))
    );
    if (hasItemizedMovements || inspection.valve_breakdown) {
      return null;
    }

    const existingMovIdx = state.stock_movements.findIndex(
      m => m.movement_id === movementId || (m.reference_id === movementRef && m.product_id === product!.product_id)
    );

    const actorUser = this.getUserById(state.environment, userId) || SEED_USERS.find(u => u.user_id === userId);
    const username = actorUser?.username || 'hajivand';

    const isSupplier = inspection.source_type === 'SUPPLIER' || Boolean(inspection.supplier_id) || Boolean(inspection.customer_id?.startsWith('SUP-'));

    const movementData: StockMovement = {
      movement_id: movementId,
      product_id: product.product_id,
      warehouse_id: defaultWarehouse.warehouse_id,
      shelf_location: defaultWarehouse.shelf_location || 'A1',
      quantity: healthyQty,
      movement_type: 'STOCK_IN',
      reference_id: movementRef,
      document_number: `برگه ورود ${inspection.form_number}`,
      party_type: isSupplier ? 'SUPPLIER' : 'CUSTOMER',
      supplier_id: isSupplier ? (inspection.supplier_id || (inspection.customer_id?.startsWith('SUP-') ? inspection.customer_id : undefined)) : undefined,
      supplier_name: isSupplier ? (inspection.supplier_name || inspection.customer_name) : undefined,
      customer_id: isSupplier ? undefined : inspection.customer_id,
      customer_name: isSupplier ? 'شرکت ام‌گاز' : inspection.customer_name,
      valve_ownership: isSupplier ? 'MGAS' : 'CUSTOMER',
      description: isSupplier
        ? `ورود اتوماتیک انبار از ورودی تأمین‌کننده [${inspection.item_name}] (برگه ${inspection.form_number})`
        : `ورود اتوماتیک انبار از ورودی شیر و سیلندر [${inspection.item_name}] (برگه ${inspection.form_number} - طرف حساب: ${inspection.customer_name})`,
      notes: `ثبت خودکار سیستمی با تایید مهندس حاجی‌وند - بارنامه: ${inspection.waybill_number} - راننده: ${inspection.driver_name}${inspection.defective_quantity > 0 ? ` (معیوب: ${inspection.defective_quantity} عدد)` : ''}`,
      user_id: actorUser ? actorUser.user_id : userId,
      created_by_username: username,
      device_id: state.deviceId,
      event_id: generateUUID(),
      created_at: inspection.created_at || new Date().toISOString()
    };

    if (existingMovIdx >= 0) {
      state.stock_movements[existingMovIdx] = {
        ...state.stock_movements[existingMovIdx],
        ...movementData,
        quantity: healthyQty
      };
      return state.stock_movements[existingMovIdx];
    } else {
      state.stock_movements.unshift(movementData);
      return movementData;
    }
  }

  static saveCylinderValveInspection(
    env: RuntimeEnvironment,
    inspection: CylinderValveInspection,
    userId: string = 'USR-003'
  ): CylinderValveInspection {
    const state = this.getState(env);
    if (!state.cylinder_valve_inspections) state.cylinder_valve_inspections = [];

    const existingIdx = state.cylinder_valve_inspections.findIndex(i => i.inspection_id === inspection.inspection_id);
    const eventType = existingIdx >= 0 ? 'UPDATE' : 'CREATE';

    // Strictly resolve actor user
    const actorUser = this.getUserById(env, userId) || SEED_USERS.find(u => u.user_id === userId);
    const inspectorName = actorUser ? actorUser.full_name : inspection.inspector_name || 'مهندس حاجی وند';
    const finalInspection: CylinderValveInspection = {
      ...inspection,
      inspector_user_id: actorUser ? actorUser.user_id : userId,
      inspector_name: inspectorName,
      updated_at: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      state.cylinder_valve_inspections = state.cylinder_valve_inspections.map((item, idx) => idx === existingIdx ? finalInspection : item);
    } else {
      state.cylinder_valve_inspections = [finalInspection, ...state.cylinder_valve_inspections];
    }

    // Automatically enter into warehouse movements (STOCK_IN) and product catalog (Inventory)
    const createdMovement = this.syncInspectionToWarehouseAndInventory(state, finalInspection, userId);

    this.saveState(env, state);

    // Record sync event for inspection
    this.recordLocalChange(
      env,
      userId,
      'CYLINDER_VALVE_INSPECTION',
      eventType,
      finalInspection.inspection_id,
      finalInspection,
      `ثبت بازرسی و ورود فیزیکی شیر/سیلندر توسط ${inspectorName} (برگه ${finalInspection.form_number} - ${finalInspection.customer_name})`,
      {
        form_number: finalInspection.form_number,
        declared: finalInspection.declared_quantity,
        healthy: finalInspection.actual_healthy_quantity,
        defective: finalInspection.defective_quantity
      }
    );

    // Record sync event for stock movement
    if (createdMovement) {
      this.recordLocalChange(
        env,
        userId,
        'STOCK_MOVEMENT',
        eventType === 'CREATE' ? 'CREATE' : 'UPDATE',
        createdMovement.movement_id,
        createdMovement,
        `ورود اتوماتیک کالا به انبار مرکزی از برگه بازرسی ${finalInspection.form_number} (${finalInspection.item_name} - ${finalInspection.actual_healthy_quantity} عدد سالم)`
      );
    }

    // Dispatch custom events for live reactive UI updates across all tabs
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: createdMovement }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: finalInspection }));
        window.dispatchEvent(new CustomEvent('mgas:inspection_updated', { detail: finalInspection }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return finalInspection;
  }

  static recordValveIntake(
    env: RuntimeEnvironment,
    params: ValveIntakeRecordParams,
    userId: string = 'USR-002'
  ): ValveIntakeResult {
    const state = this.getState(env);
    if (!state.products) state.products = [];
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];

    // Calculate totals
    const sum11k = (b: ValveIntakeBreakdown11kg) =>
      (Number(b.parsi) || 0) + (Number(b.butane) || 0) + (Number(b.iranGazi) || 0) + (Number(b.forklift) || 0) + (Number(b.iraqi) || 0);
    const sumPicnic = (b?: ValveIntakeBreakdownPicnic) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0)) : 0;

    const totalNew11kg = sum11k(params.valves11kgNew);
    const totalUsed11kg = sum11k(params.valves11kgUsed);
    const picnicNew = params.valvesPicnicNew || params.valvesPicnic5kg || { parsi: 0, butane: 0 };
    const picnicUsed = params.valvesPicnicUsed || params.valvesPicnic2kg || { parsi: 0, butane: 0 };
    const totalNewPicnic = sumPicnic(picnicNew);
    const totalUsedPicnic = sumPicnic(picnicUsed);

    const picnic58New = params.valvesPicnic58kgNew || { parsi: 0, butane: 0 };
    const picnic58Used = params.valvesPicnic58kgUsed || { parsi: 0, butane: 0 };
    const totalNewPicnic58 = sumPicnic(picnic58New);
    const totalUsedPicnic58 = sumPicnic(picnic58Used);

    const totalNewValves = totalNew11kg + totalNewPicnic + totalNewPicnic58;
    const totalUsedValves = totalUsed11kg + totalUsedPicnic + totalUsedPicnic58;
    const totalAllValves = totalNewValves + totalUsedValves;

    if (totalAllValves <= 0) {
      throw new Error('حداقل مقدار یکی از اقلام شیرآلات باید بزرگتر از صفر باشد.');
    }

    const actorUser = this.getUserById(env, userId) || SEED_USERS.find(u => u.user_id === userId) || {
      user_id: userId,
      username: 'karami',
      full_name: 'مدیر داخلی'
    };
    const username = actorUser.username;

    // Default warehouse for valves
    const valveWarehouse = state.warehouses?.find(w => w.warehouse_id === 'WH-VALVES' || w.warehouse_id === 'WH-01') || state.warehouses?.[0] || {
      warehouse_id: 'WH-VALVES',
      name: 'انبار شیر آلات',
      shelf_location: 'A1'
    };

    // Prepare catalog of items to register in inventory
    const itemsToRecord: Array<{ sku: string; name: string; qty: number; category: string; purchasePrice: number; salePrice: number }> = [
      // 11/25/50kg New
      { sku: 'VLV-11N-PARSI', name: 'شیر نو پرسی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.parsi) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-BUTANE', name: 'شیر نو بوتان 11/25/50 کیلویی', qty: Number(params.valves11kgNew.butane) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-IRAN', name: 'شیر نو ایران‌گازی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.iranGazi) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-LIFT', name: 'شیر نو لیفتراک 11/25/50 کیلویی', qty: Number(params.valves11kgNew.forklift) || 0, category: 'CAT-02', purchasePrice: 1950000, salePrice: 2600000 },
      { sku: 'VLV-11N-IRAQI', name: 'شیر نو عراقی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.iraqi) || 0, category: 'CAT-02', purchasePrice: 1900000, salePrice: 2500000 },
      // 11/25/50kg Used
      { sku: 'VLV-11U-PARSI', name: 'شیر کهنه پرسی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.parsi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-BUTANE', name: 'شیر کهنه بوتان 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.butane) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-IRAN', name: 'شیر کهنه ایران‌گازی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.iranGazi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-LIFT', name: 'شیر کهنه لیفتراک 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.forklift) || 0, category: 'CAT-02', purchasePrice: 500000, salePrice: 750000 },
      { sku: 'VLV-11U-IRAQI', name: 'شیر کهنه عراقی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.iraqi) || 0, category: 'CAT-02', purchasePrice: 480000, salePrice: 720000 },
      // Picnic 1/1.5/3L New
      { sku: 'VLV-PK-PARSI-N', name: 'شیر نو پرسی 1/1.5/3 لیتری', qty: Number(picnicNew.parsi) || 0, category: 'CAT-02', purchasePrice: 1200000, salePrice: 1600000 },
      { sku: 'VLV-PK-BUTANE-N', name: 'شیر نو بوتان 1/1.5/3 لیتری', qty: Number(picnicNew.butane) || 0, category: 'CAT-02', purchasePrice: 1200000, salePrice: 1600000 },
      // Picnic 1/1.5/3L Used
      { sku: 'VLV-PK-PARSI-U', name: 'شیر کهنه پرسی 1/1.5/3 لیتری', qty: Number(picnicUsed.parsi) || 0, category: 'CAT-02', purchasePrice: 400000, salePrice: 650000 },
      { sku: 'VLV-PK-BUTANE-U', name: 'شیر کهنه بوتان 1/1.5/3 لیتری', qty: Number(picnicUsed.butane) || 0, category: 'CAT-02', purchasePrice: 400000, salePrice: 650000 },
      // Picnic 5/8kg New
      { sku: 'VLV-PK-58-PARSI-N', name: 'شیر نو پرسی 5/8 کیلویی', qty: Number(picnic58New.parsi) || 0, category: 'CAT-02', purchasePrice: 1250000, salePrice: 1650000 },
      { sku: 'VLV-PK-58-BUTANE-N', name: 'شیر نو بوتان 5/8 کیلویی', qty: Number(picnic58New.butane) || 0, category: 'CAT-02', purchasePrice: 1250000, salePrice: 1650000 },
      // Picnic 5/8kg Used
      { sku: 'VLV-PK-58-PARSI-U', name: 'شیر کهنه پرسی 5/8 کیلویی', qty: Number(picnic58Used.parsi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-PK-58-BUTANE-U', name: 'شیر کهنه بوتان 5/8 کیلویی', qty: Number(picnic58Used.butane) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 }
    ].filter(i => i.qty > 0);

    // Build human-readable breakdown text
    const parts11n: string[] = [];
    if (params.valves11kgNew.parsi > 0) parts11n.push(`پرسی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.parsi}`);
    if (params.valves11kgNew.butane > 0) parts11n.push(`بوتان ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.butane}`);
    if (params.valves11kgNew.iranGazi > 0) parts11n.push(`ایران‌گازی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.iranGazi}`);
    if (params.valves11kgNew.forklift > 0) parts11n.push(`لیفتراک ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.forklift}`);
    if (params.valves11kgNew.iraqi > 0) parts11n.push(`عراقی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.iraqi}`);

    const parts11u: string[] = [];
    if (params.valves11kgUsed.parsi > 0) parts11u.push(`پرسی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.parsi}`);
    if (params.valves11kgUsed.butane > 0) parts11u.push(`بوتان ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.butane}`);
    if (params.valves11kgUsed.iranGazi > 0) parts11u.push(`ایران‌گازی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.iranGazi}`);
    if (params.valves11kgUsed.forklift > 0) parts11u.push(`لیفتراک ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.forklift}`);
    if (params.valves11kgUsed.iraqi > 0) parts11u.push(`عراقی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.iraqi}`);

    const partsPicnicN: string[] = [];
    if (picnicNew.parsi > 0) partsPicnicN.push(`پرسی ۱/۱.۵/۳ لیتری: ${picnicNew.parsi}`);
    if (picnicNew.butane > 0) partsPicnicN.push(`بوتان ۱/۱.۵/۳ لیتری: ${picnicNew.butane}`);

    const partsPicnicU: string[] = [];
    if (picnicUsed.parsi > 0) partsPicnicU.push(`پرسی ۱/۱.۵/۳ لیتری: ${picnicUsed.parsi}`);
    if (picnicUsed.butane > 0) partsPicnicU.push(`بوتان ۱/۱.۵/۳ لیتری: ${picnicUsed.butane}`);

    const partsPicnic58N: string[] = [];
    if (picnic58New.parsi > 0) partsPicnic58N.push(`پرسی ۵/۸ کیلویی: ${picnic58New.parsi}`);
    if (picnic58New.butane > 0) partsPicnic58N.push(`بوتان ۵/۸ کیلویی: ${picnic58New.butane}`);

    const partsPicnic58U: string[] = [];
    if (picnic58Used.parsi > 0) partsPicnic58U.push(`پرسی ۵/۸ کیلویی: ${picnic58Used.parsi}`);
    if (picnic58Used.butane > 0) partsPicnic58U.push(`بوتان ۵/۸ کیلویی: ${picnic58Used.butane}`);

    const descSections: string[] = [];
    if (parts11n.length > 0) descSections.push(`شیر نو ۱۱/۲۵/۵۰ (${parts11n.join('، ')})`);
    if (parts11u.length > 0) descSections.push(`شیر کهنه ۱۱/۲۵/۵۰ (${parts11u.join('، ')})`);
    if (partsPicnicN.length > 0) descSections.push(`شیر نو پیکنیک ۱/۱.۵/۳ لیتری (${partsPicnicN.join('، ')})`);
    if (partsPicnicU.length > 0) descSections.push(`شیر کهنه پیکنیک ۱/۱.۵/۳ لیتری (${partsPicnicU.join('، ')})`);
    if (partsPicnic58N.length > 0) descSections.push(`شیر نو پیکنیک ۵/۸ کیلویی (${partsPicnic58N.join('، ')})`);
    if (partsPicnic58U.length > 0) descSections.push(`شیر کهنه پیکنیک ۵/۸ کیلویی (${partsPicnic58U.join('، ')})`);

    const summaryText = descSections.join(' | ');
    const fullDescription = `ورودی شیرآلات انبار: ${summaryText}`;

    // Ensure standard valve products exist
    this.ensureValveProductsExist(state);

    // 1. Process as "شیر نو" and "شیر کهنه" in warehouse inventory
    if (totalNewValves > 0) {
      let productNew = state.products.find(
        p => p.product_id === 'PRD-VALVE-NEW' || 
             p.product_id === 'PRD-VLV-11-25-50' || 
             p.sku === 'VLV-11-25-50' ||
             p.name.trim() === 'قطعه شیر نو' || 
             p.name.trim() === 'شیر 11/25/50 کیلویی' ||
             (p.category_id === 'CAT-02' && (p.name.includes('شیر نو') || p.name.includes('11/25/50')))
      );
      if (!productNew) {
        productNew = {
          product_id: 'PRD-VLV-11-25-50',
          sku: 'VLV-11-25-50',
          name: 'شیر 11/25/50 کیلویی',
          category_id: 'CAT-02',
          unit: 'عدد',
          min_stock: 30,
          purchase_price: 1850000,
          sale_price: 2400000,
          barcode: '6260881125501',
          description: 'شیر استاندارد کپسول‌های ۱۱، ۲۵ و ۵۰ کیلویی ام‌گاز',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.products.push(productNew);
      }

      const movementId = `MOV-VLV-NEW-${generateUUID().substring(0, 8)}`;
      const movementNew: StockMovement = {
        movement_id: movementId,
        product_id: productNew.product_id,
        warehouse_id: valveWarehouse.warehouse_id,
        shelf_location: valveWarehouse.shelf_location || 'A1',
        quantity: totalNewValves,
        movement_type: 'STOCK_IN',
        reference_id: params.sheetNumber,
        document_number: `حواله ورود شیر ${params.sheetNumber}`,
        customer_id: params.customerId,
        customer_name: params.customerName,
        valve_ownership: 'CUSTOMER',
        item_condition: 'HEALTHY',
        description: `ورود مستقیم به انبار: قطعه شیر نو (${totalNewValves} عدد) - طرف حساب: ${params.customerName}`,
        notes: `ورودی شیر نو انبار [${params.sheetNumber}] - تفکیک: ${parts11n.concat(partsPicnicN).join('، ')}${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`,
        user_id: actorUser.user_id,
        created_by_username: username,
        device_id: state.deviceId,
        event_id: generateUUID(),
        created_at: new Date().toISOString()
      };
      state.stock_movements.unshift(movementNew);

      this.recordLocalChange(
        env,
        actorUser.user_id,
        'STOCK_MOVEMENT',
        'CREATE',
        movementNew.movement_id,
        movementNew,
        `ورود کالا به انبار شیرآلات (قطعه شیر نو - ${totalNewValves} عدد) - حواله ${params.sheetNumber}`
      );
    }

    if (totalUsedValves > 0) {
      let productUsed = state.products.find(
        p => p.product_id === 'PRD-VALVE-USED' || 
             p.sku === 'VLV-USED-11' ||
             p.name.trim() === 'قطعه شیر کهنه' || 
             p.name.trim() === 'قطعه شیر کهنه و داغی' ||
             (p.category_id === 'CAT-02' && (p.name.includes('کهنه') || p.name.includes('داغی')))
      );
      if (!productUsed) {
        productUsed = {
          product_id: 'PRD-VALVE-USED',
          sku: 'VLV-USED-11',
          name: 'قطعه شیر کهنه و داغی',
          category_id: 'CAT-02',
          unit: 'عدد',
          min_stock: 10,
          purchase_price: 450000,
          sale_price: 700000,
          barcode: '6260881100022',
          description: 'شیر کهنه و داغی دریافتی از مشتریان و نمایندگی‌ها',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.products.push(productUsed);
      }

      const movementId = `MOV-VLV-USD-${generateUUID().substring(0, 8)}`;
      const movementUsed: StockMovement = {
        movement_id: movementId,
        product_id: productUsed.product_id,
        warehouse_id: valveWarehouse.warehouse_id,
        shelf_location: valveWarehouse.shelf_location || 'A1',
        quantity: totalUsedValves,
        movement_type: 'STOCK_IN',
        reference_id: params.sheetNumber,
        document_number: `حواله ورود شیر ${params.sheetNumber}`,
        customer_id: params.customerId,
        customer_name: params.customerName,
        valve_ownership: 'CUSTOMER',
        item_condition: 'DEFECTIVE',
        description: `ورود مستقیم به انبار: قطعه شیر کهنه (${totalUsedValves} عدد) - طرف حساب: ${params.customerName}`,
        notes: `ورودی شیر کهنه انبار [${params.sheetNumber}] - تفکیک: ${parts11u.join('، ')}${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`,
        user_id: actorUser.user_id,
        created_by_username: username,
        device_id: state.deviceId,
        event_id: generateUUID(),
        created_at: new Date().toISOString()
      };
      state.stock_movements.unshift(movementUsed);

      this.recordLocalChange(
        env,
        actorUser.user_id,
        'STOCK_MOVEMENT',
        'CREATE',
        movementUsed.movement_id,
        movementUsed,
        `ورود کالا به انبار شیرآلات (قطعه شیر کهنه - ${totalUsedValves} عدد) - حواله ${params.sheetNumber}`
      );
    }

    // 2. Create GasKardexEntry
    const entryId = `KDX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const kardexEntry: GasKardexEntry = {
      entry_id: entryId,
      customer_id: params.customerId,
      customer_name: params.customerName,
      date: params.date,
      description: fullDescription,
      transfer_sheet_number: params.sheetNumber,
      cylinder_in: 0,
      cylinder_out: 0,
      scrap_out: 0,
      scrap_stock_in: 0,
      cylinder_balance: 0,
      scrap_balance: 0,
      new_valve_in: totalNewValves,
      new_valve_out: 0,
      new_valve_balance: 0,
      dispatched: '',
      used_valve_in: totalUsedValves,
      used_valve_out: 0,
      used_valve_balance: 0,
      defective: 0,
      user_id: actorUser.user_id,
      created_by_username: username,
      device_id: state.deviceId,
      event_id: generateUUID(),
      notes: `${params.notes ? `${params.notes} | ` : ''}اقلام ورودی شیرآلات: ${summaryText}${params.driverName ? ` | راننده: ${params.driverName}` : ''}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    state.gas_kardex_entries.push(kardexEntry);

    // Recalculate balances for this customer partitioned by cylinder type
    LocalStorageManager.recalculateCustomerKardex(state, params.customerId);

    // 3. Save state
    this.saveState(env, state);

    // 4. Record sync event for Kardex entry
    this.recordLocalChange(
      env,
      actorUser.user_id,
      'GAS_KARDEX',
      'CREATE',
      kardexEntry.entry_id,
      kardexEntry,
      `ثبت ورودی شیرآلات در کاردکس گاز برای ${params.customerName} (برگه ${params.sheetNumber}) - شیر نو: ${totalNewValves} عدد`
    );

    // 5. Reactive broadcasts
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: kardexEntry }));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: itemsToRecord }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated', { detail: itemsToRecord }));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('mgas_kardex_sync_channel');
          bc.postMessage({ type: 'KARDEX_ENTRY_ADDED', entry: kardexEntry });
          bc.close();
        }
      }
    } catch {}

      return {
        success: true,
        entryId,
        totalNewValves,
        totalUsedValves,
        totalAllValves,
        itemsCount: itemsToRecord.length,
        summaryText,
        entry: kardexEntry
      };
    }

  static recordValveInspection(
    env: RuntimeEnvironment,
    params: ValveIntakeRecordParams,
    userId: string = 'USR-003'
  ): {
    inspection: CylinderValveInspection;
    totalNewValves: number;
    totalUsedValves: number;
    totalAllValves: number;
    summaryText: string;
  } {
    const state = this.getState(env);
    if (!state.products) state.products = [];
    if (!state.stock_movements) state.stock_movements = [];
    if (!state.cylinder_valve_inspections) state.cylinder_valve_inspections = [];

    // Calculate totals
    const sum11k = (b: ValveIntakeBreakdown11kg) =>
      (Number(b.parsi) || 0) + (Number(b.butane) || 0) + (Number(b.iranGazi) || 0) + (Number(b.forklift) || 0) + (Number(b.iraqi) || 0);
    const sumForklift22 = (b?: ValveIntakeBreakdownForklift22kg) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0) + (Number(b.iranGazi) || 0) + (Number(b.passari) || 0)) : 0;
    const sumPicnic = (b?: ValveIntakeBreakdownPicnic) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0)) : 0;

    const totalNew11kg = sum11k(params.valves11kgNew);
    const totalUsed11kg = sum11k(params.valves11kgUsed);
    const totalNewForklift22 = sumForklift22(params.valvesForklift22kgNew);
    const totalUsedForklift22 = sumForklift22(params.valvesForklift22kgUsed);
    const picnicNew = params.valvesPicnicNew || params.valvesPicnic5kg || { parsi: 0, butane: 0 };
    const picnicUsed = params.valvesPicnicUsed || params.valvesPicnic2kg || { parsi: 0, butane: 0 };
    const totalNewPicnic = sumPicnic(picnicNew);
    const totalUsedPicnic = sumPicnic(picnicUsed);

    const picnic58New = params.valvesPicnic58kgNew || { parsi: 0, butane: 0 };
    const picnic58Used = params.valvesPicnic58kgUsed || { parsi: 0, butane: 0 };
    const totalNewPicnic58 = sumPicnic(picnic58New);
    const totalUsedPicnic58 = sumPicnic(picnic58Used);

    const totalNewValves = totalNew11kg + totalNewForklift22 + totalNewPicnic + totalNewPicnic58;
    const totalUsedValves = totalUsed11kg + totalUsedForklift22 + totalUsedPicnic + totalUsedPicnic58;
    const totalAllValves = totalNewValves + totalUsedValves;

    if (totalAllValves <= 0) {
      throw new Error('حداقل مقدار یکی از اقلام شیرآلات باید بزرگتر از صفر باشد.');
    }

    const actorUser: User = this.getUserById(env, userId) || SEED_USERS.find(u => u.user_id === userId) || {
      user_id: userId,
      username: 'hajivand',
      full_name: 'مهندس حاجی وند',
      role: 'ADMIN',
      allowed_device_id: '*'
    };
    const username = actorUser.username;
    const inspectorFullName = actorUser.full_name || 'مهندس حاجی وند';

    // Default warehouse for valves
    const valveWarehouse = state.warehouses?.find(w => w.warehouse_id === 'WH-VALVES' || w.warehouse_id === 'WH-01') || state.warehouses?.[0] || {
      warehouse_id: 'WH-VALVES',
      name: 'انبار شیر آلات',
      shelf_location: 'A1'
    };

    // Prepare catalog of items to register in inventory
    const itemsToRecord: Array<{ sku: string; name: string; qty: number; category: string; purchasePrice: number; salePrice: number }> = [
      // 11/25/50kg New
      { sku: 'VLV-11N-PARSI', name: 'شیر نو پرسی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.parsi) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-BUTANE', name: 'شیر نو بوتان 11/25/50 کیلویی', qty: Number(params.valves11kgNew.butane) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-IRAN', name: 'شیر نو ایران‌گازی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.iranGazi) || 0, category: 'CAT-02', purchasePrice: 1850000, salePrice: 2400000 },
      { sku: 'VLV-11N-LIFT', name: 'شیر نو لیفتراک 11/25/50 کیلویی', qty: Number(params.valves11kgNew.forklift) || 0, category: 'CAT-02', purchasePrice: 1950000, salePrice: 2600000 },
      { sku: 'VLV-11N-IRAQI', name: 'شیر نو عراقی 11/25/50 کیلویی', qty: Number(params.valves11kgNew.iraqi) || 0, category: 'CAT-02', purchasePrice: 1900000, salePrice: 2500000 },
      // 11/25/50kg Used
      { sku: 'VLV-11U-PARSI', name: 'شیر کهنه پرسی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.parsi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-BUTANE', name: 'شیر کهنه بوتان 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.butane) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-IRAN', name: 'شیر کهنه ایران‌گازی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.iranGazi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-11U-LIFT', name: 'شیر کهنه لیفتراک 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.forklift) || 0, category: 'CAT-02', purchasePrice: 500000, salePrice: 750000 },
      { sku: 'VLV-11U-IRAQI', name: 'شیر کهنه عراقی 11/25/50 کیلویی', qty: Number(params.valves11kgUsed.iraqi) || 0, category: 'CAT-02', purchasePrice: 480000, salePrice: 720000 },
      // 22kg Forklift New
      { sku: 'VLV-LIFT-BUTANE-N', name: 'شیر نو بوتان لیفتراکی', qty: Number(params.valvesForklift22kgNew?.butane) || 0, category: 'CAT-02', purchasePrice: 2100000, salePrice: 2800000 },
      { sku: 'VLV-LIFT-IRAN-N', name: 'شیر نو ایران‌گازی لیفتراکی', qty: Number(params.valvesForklift22kgNew?.iranGazi) || 0, category: 'CAT-02', purchasePrice: 2100000, salePrice: 2800000 },
      { sku: 'VLV-LIFT-PASSARI-N', name: 'شیر نو پاساری لیفتراکی', qty: Number(params.valvesForklift22kgNew?.passari) || 0, category: 'CAT-02', purchasePrice: 2100000, salePrice: 2800000 },
      { sku: 'VLV-LIFT-PARSI-N', name: 'شیر نو پرسی لیفتراکی', qty: Number(params.valvesForklift22kgNew?.parsi) || 0, category: 'CAT-02', purchasePrice: 2100000, salePrice: 2800000 },
      // 22kg Forklift Used
      { sku: 'VLV-LIFT-BUTANE-U', name: 'شیر کهنه بوتان لیفتراکی', qty: Number(params.valvesForklift22kgUsed?.butane) || 0, category: 'CAT-02', purchasePrice: 550000, salePrice: 800000 },
      { sku: 'VLV-LIFT-IRAN-U', name: 'شیر کهنه ایران‌گازی لیفتراکی', qty: Number(params.valvesForklift22kgUsed?.iranGazi) || 0, category: 'CAT-02', purchasePrice: 550000, salePrice: 800000 },
      { sku: 'VLV-LIFT-PASSARI-U', name: 'شیر کهنه پاساری لیفتراکی', qty: Number(params.valvesForklift22kgUsed?.passari) || 0, category: 'CAT-02', purchasePrice: 550000, salePrice: 800000 },
      { sku: 'VLV-LIFT-PARSI-U', name: 'شیر کهنه پرسی لیفتراکی', qty: Number(params.valvesForklift22kgUsed?.parsi) || 0, category: 'CAT-02', purchasePrice: 550000, salePrice: 800000 },
      // Picnic 1/1.5/3L New
      { sku: 'VLV-PK-PARSI-N', name: 'شیر نو پرسی 1/1.5/3 لیتری', qty: Number(picnicNew.parsi) || 0, category: 'CAT-02', purchasePrice: 1200000, salePrice: 1600000 },
      { sku: 'VLV-PK-BUTANE-N', name: 'شیر نو بوتان 1/1.5/3 لیتری', qty: Number(picnicNew.butane) || 0, category: 'CAT-02', purchasePrice: 1200000, salePrice: 1600000 },
      // Picnic 1/1.5/3L Used
      { sku: 'VLV-PK-PARSI-U', name: 'شیر کهنه پرسی 1/1.5/3 لیتری', qty: Number(picnicUsed.parsi) || 0, category: 'CAT-02', purchasePrice: 400000, salePrice: 650000 },
      { sku: 'VLV-PK-BUTANE-U', name: 'شیر کهنه بوتان 1/1.5/3 لیتری', qty: Number(picnicUsed.butane) || 0, category: 'CAT-02', purchasePrice: 400000, salePrice: 650000 },
      // Picnic 5/8kg New
      { sku: 'VLV-PK-58-PARSI-N', name: 'شیر نو پرسی 5/8 کیلویی', qty: Number(picnic58New.parsi) || 0, category: 'CAT-02', purchasePrice: 1250000, salePrice: 1650000 },
      { sku: 'VLV-PK-58-BUTANE-N', name: 'شیر نو بوتان 5/8 کیلویی', qty: Number(picnic58New.butane) || 0, category: 'CAT-02', purchasePrice: 1250000, salePrice: 1650000 },
      // Picnic 5/8kg Used
      { sku: 'VLV-PK-58-PARSI-U', name: 'شیر کهنه پرسی 5/8 کیلویی', qty: Number(picnic58Used.parsi) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 },
      { sku: 'VLV-PK-58-BUTANE-U', name: 'شیر کهنه بوتان 5/8 کیلویی', qty: Number(picnic58Used.butane) || 0, category: 'CAT-02', purchasePrice: 450000, salePrice: 700000 }
    ].filter(i => i.qty > 0);

    // Build human-readable breakdown text
    const parts11n: string[] = [];
    if (params.valves11kgNew.parsi > 0) parts11n.push(`پرسی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.parsi}`);
    if (params.valves11kgNew.butane > 0) parts11n.push(`بوتان ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.butane}`);
    if (params.valves11kgNew.iranGazi && params.valves11kgNew.iranGazi > 0) parts11n.push(`ایران‌گازی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.iranGazi}`);
    if (params.valves11kgNew.forklift && params.valves11kgNew.forklift > 0) parts11n.push(`لیفتراک ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.forklift}`);
    if (params.valves11kgNew.iraqi > 0) parts11n.push(`عراقی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgNew.iraqi}`);

    const parts11u: string[] = [];
    if (params.valves11kgUsed.parsi > 0) parts11u.push(`پرسی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.parsi}`);
    if (params.valves11kgUsed.butane > 0) parts11u.push(`بوتان ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.butane}`);
    if (params.valves11kgUsed.iranGazi && params.valves11kgUsed.iranGazi > 0) parts11u.push(`ایران‌گازی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.iranGazi}`);
    if (params.valves11kgUsed.forklift && params.valves11kgUsed.forklift > 0) parts11u.push(`لیفتراک ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.forklift}`);
    if (params.valves11kgUsed.iraqi > 0) parts11u.push(`عراقی ۱۱/۲۵/۵۰ کیلویی: ${params.valves11kgUsed.iraqi}`);

    const partsLift22n: string[] = [];
    if (params.valvesForklift22kgNew?.butane) partsLift22n.push(`بوتان لیفتراکی: ${params.valvesForklift22kgNew.butane}`);
    if (params.valvesForklift22kgNew?.iranGazi) partsLift22n.push(`ایران‌گازی لیفتراکی: ${params.valvesForklift22kgNew.iranGazi}`);
    if (params.valvesForklift22kgNew?.passari) partsLift22n.push(`پاساری لیفتراکی: ${params.valvesForklift22kgNew.passari}`);
    if (params.valvesForklift22kgNew?.parsi) partsLift22n.push(`پرسی لیفتراکی: ${params.valvesForklift22kgNew.parsi}`);

    const partsLift22u: string[] = [];
    if (params.valvesForklift22kgUsed?.butane) partsLift22u.push(`بوتان لیفتراکی: ${params.valvesForklift22kgUsed.butane}`);
    if (params.valvesForklift22kgUsed?.iranGazi) partsLift22u.push(`ایران‌گازی لیفتراکی: ${params.valvesForklift22kgUsed.iranGazi}`);
    if (params.valvesForklift22kgUsed?.passari) partsLift22u.push(`پاساری لیفتراکی: ${params.valvesForklift22kgUsed.passari}`);
    if (params.valvesForklift22kgUsed?.parsi) partsLift22u.push(`پرسی لیفتراکی: ${params.valvesForklift22kgUsed.parsi}`);

    const partsPicnicN: string[] = [];
    if (picnicNew.parsi > 0) partsPicnicN.push(`پرسی ۱/۱.۵/۳ لیتری: ${picnicNew.parsi}`);
    if (picnicNew.butane > 0) partsPicnicN.push(`بوتان ۱/۱.۵/۳ لیتری: ${picnicNew.butane}`);

    const partsPicnicU: string[] = [];
    if (picnicUsed.parsi > 0) partsPicnicU.push(`پرسی ۱/۱.۵/۳ لیتری: ${picnicUsed.parsi}`);
    if (picnicUsed.butane > 0) partsPicnicU.push(`بوتان ۱/۱.۵/۳ لیتری: ${picnicUsed.butane}`);

    const partsPicnic58N: string[] = [];
    if (picnic58New.parsi > 0) partsPicnic58N.push(`پرسی ۵/۸ کیلویی: ${picnic58New.parsi}`);
    if (picnic58New.butane > 0) partsPicnic58N.push(`بوتان ۵/۸ کیلویی: ${picnic58New.butane}`);

    const partsPicnic58U: string[] = [];
    if (picnic58Used.parsi > 0) partsPicnic58U.push(`پرسی ۵/۸ کیلویی: ${picnic58Used.parsi}`);
    if (picnic58Used.butane > 0) partsPicnic58U.push(`بوتان ۵/۸ کیلویی: ${picnic58Used.butane}`);

    const descSections: string[] = [];
    if (parts11n.length > 0) descSections.push(`شیر نو ۱۱/۲۵/۵۰ (${parts11n.join('، ')})`);
    if (parts11u.length > 0) descSections.push(`شیر کهنه ۱۱/۲۵/۵۰ (${parts11u.join('، ')})`);
    if (partsLift22n.length > 0) descSections.push(`شیر نو لیفتراکی (${partsLift22n.join('، ')})`);
    if (partsLift22u.length > 0) descSections.push(`شیر کهنه لیفتراکی (${partsLift22u.join('، ')})`);
    if (partsPicnicN.length > 0) descSections.push(`شیر نو پیکنیک ۱/۱.۵/۳ لیتری (${partsPicnicN.join('، ')})`);
    if (partsPicnicU.length > 0) descSections.push(`شیر کهنه پیکنیک ۱/۱.۵/۳ لیتری (${partsPicnicU.join('، ')})`);
    if (partsPicnic58N.length > 0) descSections.push(`شیر نو پیکنیک ۵/۸ کیلویی (${partsPicnic58N.join('، ')})`);
    if (partsPicnic58U.length > 0) descSections.push(`شیر کهنه پیکنیک ۵/۸ کیلویی (${partsPicnic58U.join('، ')})`);

    const summaryText = descSections.join(' | ');

    // Ensure standard valve products exist
    this.ensureValveProductsExist(state);

    // Distinguish Supplier vs Customer
    const isSupplierSource =
      params.sourceType === 'SUPPLIER' ||
      Boolean(params.supplierId) ||
      Boolean(params.customerId && params.customerId.startsWith('SUP-'));

    const effectiveSupplierId = isSupplierSource
      ? (params.supplierId || (params.customerId?.startsWith('SUP-') ? params.customerId : undefined))
      : undefined;

    let effectiveSupplierName = isSupplierSource
      ? (params.supplierName || (params.customerId?.startsWith('SUP-') ? params.customerName : undefined))
      : undefined;

    if (isSupplierSource && !effectiveSupplierName && effectiveSupplierId) {
      const sup = state.suppliers?.find(s => s.supplier_id === effectiveSupplierId);
      if (sup) {
        effectiveSupplierName = `${sup.name}${sup.company_name ? ` (${sup.company_name})` : ''}`;
      } else {
        effectiveSupplierName = 'تأمین‌کننده ام‌گاز';
      }
    }

    const effectiveCustomerId = !isSupplierSource ? params.customerId : undefined;
    const effectiveCustomerName = !isSupplierSource
      ? (params.customerName || 'طرف حساب نامشخص')
      : 'شرکت ام‌گاز';

    // 1. Enter into warehouse movements (STOCK_IN) with strict item-level segregation per specific valve type
    const movementsCreated: StockMovement[] = [];

    const entryTimestamp = (params.date && params.date.includes('/') && params.date.length >= 8)
      ? `${params.date} ${new Date().toTimeString().slice(0, 8)}`
      : new Date().toISOString();

    if (itemsToRecord.length > 0) {
      itemsToRecord.forEach((itm) => {
        let prod = state.products.find(
          p => p.sku === itm.sku || p.name.trim() === itm.name.trim()
        );
        if (!prod) {
          prod = {
            product_id: `PRD-${itm.sku}`,
            sku: itm.sku,
            name: itm.name,
            category_id: itm.category || 'CAT-02',
            unit: 'عدد',
            min_stock: 10,
            purchase_price: itm.purchasePrice,
            sale_price: itm.salePrice,
            description: `شیر استاندارد ${itm.name}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          state.products.push(prod);
        }

        const isUsed = itm.name.includes('کهنه') || itm.sku.includes('U');
        const movement: StockMovement = {
          movement_id: `MOV-VLV-${itm.sku}-${generateUUID().substring(0, 8)}`,
          product_id: prod.product_id,
          warehouse_id: valveWarehouse.warehouse_id,
          shelf_location: valveWarehouse.shelf_location || 'A1',
          quantity: itm.qty,
          movement_type: 'STOCK_IN',
          reference_id: params.sheetNumber,
          document_number: `حواله ورود شیر ${params.sheetNumber}`,
          party_type: isSupplierSource ? 'SUPPLIER' : 'CUSTOMER',
          supplier_id: isSupplierSource ? effectiveSupplierId : undefined,
          supplier_name: isSupplierSource ? effectiveSupplierName : undefined,
          customer_id: isSupplierSource ? undefined : effectiveCustomerId,
          customer_name: isSupplierSource ? 'شرکت ام‌گاز' : effectiveCustomerName,
          valve_ownership: isSupplierSource ? 'MGAS' : 'CUSTOMER',
          item_condition: isUsed ? 'DEFECTIVE' : 'HEALTHY',
          description: isSupplierSource
            ? `ورود شیر نو از تأمین‌کننده (${effectiveSupplierName}) به انبار مرکزی ام‌گاز: ${itm.name} (${itm.qty} عدد)`
            : `ورود شیرآلات طرف حساب (${effectiveCustomerName}) به انبار: ${itm.name} (${itm.qty} عدد)`,
          notes: isSupplierSource
            ? `ورودی شیرآلات انبار مرکزی ام‌گاز [برگه ${params.sheetNumber}] - تأمین‌کننده: ${effectiveSupplierName} | شیر نو متعلق به ام‌گاز${params.driverName ? ` | راننده: ${params.driverName}` : ''}${params.notes ? ` | توضیحات: ${params.notes}` : ''}`
            : `ورودی شیرآلات طرف حساب [برگه ${params.sheetNumber}] - طرف حساب: ${effectiveCustomerName} | ثبت در کاردکس تعمیر${params.driverName ? ` | راننده: ${params.driverName}` : ''}${params.notes ? ` | توضیحات: ${params.notes}` : ''}`,
          user_id: actorUser.user_id,
          created_by_username: username,
          device_id: state.deviceId,
          event_id: generateUUID(),
          created_at: entryTimestamp
        };

        state.stock_movements.unshift(movement);
        movementsCreated.push(movement);

        this.recordLocalChange(
          env,
          actorUser.user_id,
          'STOCK_MOVEMENT',
          'CREATE',
          movement.movement_id,
          movement,
          isSupplierSource
            ? `ورود شیر نو از تأمین‌کننده (${effectiveSupplierName}) به انبار مرکزی ام‌گاز: ${itm.name} (${itm.qty} عدد) - حواله ${params.sheetNumber}`
            : `ورود کالا به انبار (${itm.name} - ${itm.qty} عدد) طرف حساب: ${effectiveCustomerName} - حواله ${params.sheetNumber}`
        );
      });
    } else {
      // Fallback if no detailed breakdown is present
      if (totalNewValves > 0) {
        let productNew = state.products.find(
          p => p.product_id === 'PRD-VLV-11-25-50' || p.sku === 'VLV-11-25-50'
        );
        if (!productNew) {
          productNew = {
            product_id: 'PRD-VLV-11-25-50',
            sku: 'VLV-11-25-50',
            name: 'شیر 11/25/50 کیلویی',
            category_id: 'CAT-02',
            unit: 'عدد',
            min_stock: 30,
            purchase_price: 1850000,
            sale_price: 2400000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          state.products.push(productNew);
        }

        const movementNew: StockMovement = {
          movement_id: `MOV-VLV-NEW-${generateUUID().substring(0, 8)}`,
          product_id: productNew.product_id,
          warehouse_id: valveWarehouse.warehouse_id,
          shelf_location: valveWarehouse.shelf_location || 'A1',
          quantity: totalNewValves,
          movement_type: 'STOCK_IN',
          reference_id: params.sheetNumber,
          document_number: `حواله ورود شیر ${params.sheetNumber}`,
          party_type: isSupplierSource ? 'SUPPLIER' : 'CUSTOMER',
          supplier_id: isSupplierSource ? effectiveSupplierId : undefined,
          supplier_name: isSupplierSource ? effectiveSupplierName : undefined,
          customer_id: isSupplierSource ? undefined : effectiveCustomerId,
          customer_name: isSupplierSource ? 'شرکت ام‌گاز' : effectiveCustomerName,
          valve_ownership: isSupplierSource ? 'MGAS' : 'CUSTOMER',
          item_condition: 'HEALTHY',
          description: isSupplierSource
            ? `ورود مستقیم قطعه شیر نو به انبار ام‌گاز (${totalNewValves} عدد) - تأمین‌کننده: ${effectiveSupplierName}`
            : `ورود مستقیم به انبار: قطعه شیر نو (${totalNewValves} عدد) - طرف حساب: ${effectiveCustomerName}`,
          notes: isSupplierSource
            ? `ورودی شیر نو انبار ام‌گاز [${params.sheetNumber}] - تأمین‌کننده: ${effectiveSupplierName}${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`
            : `ورودی شیر نو انبار [${params.sheetNumber}]${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`,
          user_id: actorUser.user_id,
          created_by_username: username,
          device_id: state.deviceId,
          event_id: generateUUID(),
          created_at: entryTimestamp
        };
        state.stock_movements.unshift(movementNew);
        movementsCreated.push(movementNew);
      }
      if (totalUsedValves > 0) {
        let productUsed = state.products.find(
          p => p.product_id === 'PRD-VALVE-USED' || p.sku === 'VLV-USED-11'
        );
        if (!productUsed) {
          productUsed = {
            product_id: 'PRD-VALVE-USED',
            sku: 'VLV-USED-11',
            name: 'قطعه شیر کهنه و داغی',
            category_id: 'CAT-02',
            unit: 'عدد',
            min_stock: 10,
            purchase_price: 450000,
            sale_price: 700000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          state.products.push(productUsed);
        }

        const movementUsed: StockMovement = {
          movement_id: `MOV-VLV-USD-${generateUUID().substring(0, 8)}`,
          product_id: productUsed.product_id,
          warehouse_id: valveWarehouse.warehouse_id,
          shelf_location: valveWarehouse.shelf_location || 'A1',
          quantity: totalUsedValves,
          movement_type: 'STOCK_IN',
          reference_id: params.sheetNumber,
          document_number: `حواله ورود شیر ${params.sheetNumber}`,
          party_type: isSupplierSource ? 'SUPPLIER' : 'CUSTOMER',
          supplier_id: isSupplierSource ? effectiveSupplierId : undefined,
          supplier_name: isSupplierSource ? effectiveSupplierName : undefined,
          customer_id: isSupplierSource ? undefined : effectiveCustomerId,
          customer_name: isSupplierSource ? 'شرکت ام‌گاز' : effectiveCustomerName,
          valve_ownership: isSupplierSource ? 'MGAS' : 'CUSTOMER',
          item_condition: 'DEFECTIVE',
          description: isSupplierSource
            ? `ورود شیر کهنه به انبار ام‌گاز (${totalUsedValves} عدد) - تأمین‌کننده: ${effectiveSupplierName}`
            : `ورود مستقیم به انبار: قطعه شیر کهنه (${totalUsedValves} عدد) - طرف حساب: ${effectiveCustomerName}`,
          notes: isSupplierSource
            ? `ورودی شیر کهنه انبار ام‌گاز [${params.sheetNumber}] - تأمین‌کننده: ${effectiveSupplierName}${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`
            : `ورودی شیر کهنه انبار [${params.sheetNumber}]${params.driverName ? ` - راننده: ${params.driverName}` : ''}${params.notes ? ` - توضیحات: ${params.notes}` : ''}`,
          user_id: actorUser.user_id,
          created_by_username: username,
          device_id: state.deviceId,
          event_id: generateUUID(),
          created_at: entryTimestamp
        };
        state.stock_movements.unshift(movementUsed);
        movementsCreated.push(movementUsed);
      }
    }

    // 2. Prepare receipt items for official receipt print & Kardex transfer
    const receiptItems: GoodsReceiptItem[] = [];
    if (itemsToRecord.length > 0) {
      itemsToRecord.forEach((itm, idx) => {
        const isUsed = itm.name.includes('کهنه') || itm.name.includes('داغی') || itm.sku.includes('11U') || itm.sku.includes('22U');
        receiptItems.push({
          rowNum: idx + 1,
          description: itm.name,
          quantity: itm.qty,
          quantityInWords: `${toPersianDigits(itm.qty)} عدد`,
          remarks: isUsed ? 'شیر کهنه و داغی' : 'شیر نو استاندارد'
        });
      });
    } else {
      if (totalNewValves > 0) {
        receiptItems.push({
          rowNum: 1,
          description: 'قطعه شیر نو (ورودی انبار شیرآلات)',
          quantity: totalNewValves,
          quantityInWords: `${toPersianDigits(totalNewValves)} عدد`,
          remarks: `شیر نو: ${parts11n.concat(partsLift22n, partsPicnicN).join('، ')}`
        });
      }
      if (totalUsedValves > 0) {
        receiptItems.push({
          rowNum: receiptItems.length + 1,
          description: 'قطعه شیر کهنه و داغی',
          quantity: totalUsedValves,
          quantityInWords: `${toPersianDigits(totalUsedValves)} عدد`,
          remarks: `شیر کهنه: ${parts11u.concat(partsLift22u, partsPicnicU).join('، ')}`
        });
      }
    }

    // 3. Create CylinderValveInspection
    // For customers: status COUNTED_READY_FOR_KARDEX (triggers Kardex alert and auto-registers to customer repair kardex)
    // For suppliers: status KARDEX_REGISTERED (saved directly in M-Gas central stock, NEVER added to customer repair kardex)
    const inspectionId = `INSP-VLV-${Date.now()}`;
    const inspection: CylinderValveInspection = {
      inspection_id: inspectionId,
      form_number: params.sheetNumber,
      receipt_type: 'ENTRY',
      date: params.date,
      customer_id: isSupplierSource ? '' : (effectiveCustomerId || ''),
      customer_name: isSupplierSource ? 'شرکت ام‌گاز (موجودی مرکزی)' : effectiveCustomerName,
      supplier_id: isSupplierSource ? effectiveSupplierId : undefined,
      supplier_name: isSupplierSource ? effectiveSupplierName : undefined,
      source_type: isSupplierSource ? 'SUPPLIER' : 'CUSTOMER',
      item_type: 'VALVE_NEW',
      item_name: isSupplierSource
        ? `ورودی شیر نو ام‌گاز از تأمین‌کننده (${effectiveSupplierName}): ${summaryText}`
        : `ورودی شیرآلات طرف حساب (${effectiveCustomerName}): ${summaryText}`,
      declared_quantity: totalAllValves,
      actual_healthy_quantity: totalAllValves,
      defective_quantity: 0,
      discrepancy_quantity: 0,
      driver_name: params.driverName || 'تحویل با بارنامه',
      plate_number: params.plateNumber || '',
      waybill_number: `BAR-${params.sheetNumber.replace(/[^0-9]/g, '') || Date.now().toString().slice(-4)}`,
      inspector_user_id: actorUser.user_id,
      inspector_name: inspectorFullName,
      status: isSupplierSource ? 'KARDEX_REGISTERED' : 'COUNTED_READY_FOR_KARDEX',
      notes: isSupplierSource
        ? `شمارش فیزیکی و تایید انباردار ${inspectorFullName} (شیر نو: ${totalNewValves} عدد | شیر کهنه: ${totalUsedValves} عدد). ورود مستقیم از تأمین‌کننده (${effectiveSupplierName}) به موجودی انبار مرکزی ام‌گاز. بدون انتساب به کاردکس تعمیر مشتری.${params.notes ? ` توضیحات: ${params.notes}` : ''}`
        : `شمارش فیزیکی و تایید انباردار ${inspectorFullName} (شیر نو: ${totalNewValves} عدد | شیر کهنه: ${totalUsedValves} عدد). ارسال اعلان به کاردکس تعمیر سیلندر جهت ثبت در کاردکس و دارایی مشتری «${effectiveCustomerName}».${params.notes ? ` توضیحات: ${params.notes}` : ''}`,
      receipt_items: receiptItems,
      valve_breakdown: {
        valves11kgNew: params.valves11kgNew,
        valves11kgUsed: params.valves11kgUsed,
        valvesForklift22kgNew: params.valvesForklift22kgNew,
        valvesForklift22kgUsed: params.valvesForklift22kgUsed,
        valvesPicnicNew: picnicNew,
        valvesPicnicUsed: picnicUsed,
        valvesPicnic5kg: picnicNew,
        valvesPicnic2kg: picnicUsed,
        valvesPicnic58kgNew: picnic58New,
        valvesPicnic58kgUsed: picnic58Used
      },
      total_new_valves: totalNewValves,
      total_used_valves: totalUsedValves,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    state.cylinder_valve_inspections = [inspection, ...state.cylinder_valve_inspections];

    // Save state
    this.saveState(env, state);

    // If source is a CUSTOMER, IMMEDIATELY register into Gas Kardex so customer repair balance reflects it right away!
    // If source is a SUPPLIER, do NOT register into any customer repair Kardex!
    if (!isSupplierSource && effectiveCustomerId) {
      try {
        this.registerPendingInspectionDirectlyToKardex(env, inspection.inspection_id, actorUser);
      } catch (err) {
        console.warn('Auto kardex register error:', err);
      }
    }

    // Record sync event for inspection
    this.recordLocalChange(
      env,
      actorUser.user_id,
      'CYLINDER_VALVE_INSPECTION',
      'CREATE',
      inspection.inspection_id,
      inspection,
      isSupplierSource
        ? `ثبت و تایید فیزیکی ورودی شیرآلات ام‌گاز از تأمین‌کننده (${effectiveSupplierName}) توسط انباردار ${inspectorFullName} (برگه ${inspection.form_number})`
        : `ثبت و تایید فیزیکی ورودی شیرآلات توسط انباردار ${inspectorFullName} (برگه ${inspection.form_number})`
    );

    // Dispatch events & notify Karami
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:inspection_added', { detail: inspection }));
        window.dispatchEvent(new CustomEvent('mgas:inspection_updated', { detail: inspection }));
        window.dispatchEvent(new CustomEvent('mgas:stock_movement_added', { detail: itemsToRecord }));
        window.dispatchEvent(new CustomEvent('mgas:inventory_updated', { detail: itemsToRecord }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));

        if (!isSupplierSource) {
          window.dispatchEvent(new CustomEvent('mgas:karami_notification', {
            detail: {
              type: 'VALVE_INTAKE_READY',
              title: 'اعلان ورودی تاییدشده توسط انباردار',
              message: `ورودی شیرآلات برگه ${inspection.form_number} (${totalAllValves} عدد شامل ${totalNewValves} شیر نو و ${totalUsedValves} شیر کهنه) توسط ${inspectorFullName} تایید شد و در کاردکس تعمیر سیلندر و دارایی مشتری «${effectiveCustomerName}» ثبت گردید.`,
              inspection
            }
          }));
          if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel('mgas_kardex_sync_channel');
            bc.postMessage({ type: 'INSPECTION_READY_FOR_KARDEX', inspection });
            bc.close();
          }
        }
      }
    } catch {}

    return {
      inspection,
      totalNewValves,
      totalUsedValves,
      totalAllValves,
      summaryText
    };
  }

  static markInspectionAsKardexRegistered(
    env: RuntimeEnvironment,
    inspectionId: string,
    kardexEntryId: string,
    registeredByUsername: string
  ): boolean {
    const state = this.getState(env);
    if (!state.cylinder_valve_inspections) return false;

    const target = state.cylinder_valve_inspections.find(i => i.inspection_id === inspectionId);
    if (!target) return false;

    target.status = 'KARDEX_REGISTERED';
    target.kardex_entry_id = kardexEntryId;
    target.kardex_registered_by = registeredByUsername;
    target.kardex_registered_at = new Date().toISOString();
    target.updated_at = new Date().toISOString();

    this.saveState(env, state);

    const user = (state.users || SEED_USERS).find(u => u.username === registeredByUsername);
    this.recordLocalChange(
      env,
      user?.user_id || 'USR-002',
      'CYLINDER_VALVE_INSPECTION',
      'UPDATE',
      target.inspection_id,
      target,
      `ثبت ردیف کاردکس متناظر برای بازرسی ${target.form_number} توسط @${registeredByUsername}`,
      { inspection_id: inspectionId, kardex_entry_id: kardexEntryId }
    );

    return true;
  }

  /**
   * Directly registers a pending cylinder/valve inspection into Gas Kardex in one step (ثبت مستقیم و آنی)
   * Adds new & used valves to the customer's repair kardex and updates their segregated inventory in warehouse
   */
  static registerPendingInspectionDirectlyToKardex(
    env: RuntimeEnvironment,
    inspectionId: string,
    currentUser: User,
    cylinderType: CylinderType = 'سیلندر 11 کیلویی'
  ): { success: boolean; entry?: GasKardexEntry; error?: string } {
    const state = this.getState(env);
    if (!state.cylinder_valve_inspections) return { success: false, error: 'فهرست بازرسی‌ها خالی است.' };
    const insp = state.cylinder_valve_inspections.find(i => i.inspection_id === inspectionId);
    if (!insp) return { success: false, error: 'برگه بازرسی مورد نظر یافت نشد.' };
    if (insp.status === 'KARDEX_REGISTERED') {
      return { success: false, error: 'این برگه قبلاً در کاردکس ثبت گردیده است.' };
    }

    // Strict guard: Supplier intake belongs strictly to M-Gas central stock and NEVER to customer repair kardex!
    if (
      insp.source_type === 'SUPPLIER' ||
      Boolean(insp.supplier_id) ||
      (insp.customer_id && insp.customer_id.startsWith('SUP-')) ||
      insp.customer_name === 'شرکت ام‌گاز' ||
      insp.customer_name?.includes('موجودی مرکزی')
    ) {
      return {
        success: false,
        error: 'شیرآلات وارده از تأمین‌کننده متعلق به انبار مرکزی شرکت ام‌گاز بوده و در کاردکس تعمیر مشتری ثبت نمی‌شود.'
      };
    }

    // Check if this inspection is for repair cylinders (سیلندر تعمیری) vs valve intake (شیرآلات)
    const isValveInspection = Boolean(
      (insp.item_type && String(insp.item_type).includes('VALVE')) ||
      (insp.item_name && (insp.item_name.includes('شیر') || insp.item_name.includes('شیرآلات')))
    );
    const isCylinderInspection = !isValveInspection && Boolean(
      isRepairCylinderInspection(insp, state.custom_cylinder_item_types) ||
      (insp.item_type && String(insp.item_type).includes('CYLINDER')) ||
      (insp.item_name && (insp.item_name.includes('سیلندر') || insp.item_name.includes('کپسول')))
    );

    // Determine new and used valve quantities & individual breakdown
    let calcNewValves = Number(insp.total_new_valves) || 0;
    let calcUsedValves = Number(insp.total_used_valves) || 0;
    const valveItems: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];

    // ONLY populate valve breakdowns if this is NOT a cylinder inspection!
    if (!isCylinderInspection) {
      if (insp.receipt_items && insp.receipt_items.length > 0) {
        let rNew = 0;
        let rUsed = 0;
        insp.receipt_items.forEach(item => {
          const desc = (item.description || '').toLowerCase();
          const rem = (item.remarks || '').toLowerCase();
          const qty = Number(item.quantity) || 0;
          if (qty <= 0) return;

          const isUsed = desc.includes('کهنه') || desc.includes('داغی') || rem.includes('کهنه') || rem.includes('داغی');
          if (isUsed) {
            rUsed += qty;
            valveItems.push({
              valve_name: item.description || 'شیر کهنه و داغی',
              valve_category: 'USED',
              quantity: qty,
              direction: 'IN'
            });
          } else if (desc.includes('شیر') || rem.includes('شیر') || (insp.item_type && String(insp.item_type).includes('VALVE'))) {
            rNew += qty;
            valveItems.push({
              valve_name: item.description || 'شیر نو استاندارد',
              valve_category: 'NEW',
              quantity: qty,
              direction: 'IN'
            });
          }
        });
        if (rNew > 0 || rUsed > 0) {
          calcNewValves = rNew;
          calcUsedValves = rUsed;
        }
      }

      if (calcNewValves === 0 && calcUsedValves === 0) {
        const name = (insp.item_name || '').toLowerCase();
        const healthy = Number(insp.actual_healthy_quantity) || 0;
        if (name.includes('کهنه') || name.includes('داغی')) {
          calcUsedValves = healthy;
          valveItems.push({ valve_name: insp.item_name, valve_category: 'USED', quantity: healthy, direction: 'IN' });
        } else if (name.includes('شیر') || (insp.item_type && String(insp.item_type).includes('VALVE'))) {
          calcNewValves = healthy;
          valveItems.push({ valve_name: insp.item_name, valve_category: 'NEW', quantity: healthy, direction: 'IN' });
        }
      }

      if (valveItems.length === 0) {
        if (calcNewValves > 0) {
          valveItems.push({ valve_name: 'قطعه شیر نو استاندارد', valve_category: 'NEW', quantity: calcNewValves, direction: 'IN' });
        }
        if (calcUsedValves > 0) {
          valveItems.push({ valve_name: 'قطعه شیر کهنه و داغی', valve_category: 'USED', quantity: calcUsedValves, direction: 'IN' });
        }
      }
    }

    // Calculate segregated quantities from valve_breakdown
    const sum11k = (b?: ValveIntakeBreakdown11kg) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0) + (Number(b.iranGazi) || 0) + (Number(b.forklift) || 0) + (Number(b.iraqi) || 0)) : 0;
    const sumForklift22 = (b?: ValveIntakeBreakdownForklift22kg) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0) + (Number(b.iranGazi) || 0) + (Number(b.passari) || 0)) : 0;
    const sumPicnic = (b?: ValveIntakeBreakdownPicnic) =>
      b ? ((Number(b.parsi) || 0) + (Number(b.butane) || 0)) : 0;

    const v11New = sum11k(insp.valve_breakdown?.valves11kgNew);
    const v11Used = sum11k(insp.valve_breakdown?.valves11kgUsed);
    const vForkNew = sumForklift22(insp.valve_breakdown?.valvesForklift22kgNew);
    const vForkUsed = sumForklift22(insp.valve_breakdown?.valvesForklift22kgUsed);
    const vPicnicNew = sumPicnic(insp.valve_breakdown?.valvesPicnicNew || insp.valve_breakdown?.valvesPicnic5kg);
    const vPicnicUsed = sumPicnic(insp.valve_breakdown?.valvesPicnicUsed || insp.valve_breakdown?.valvesPicnic2kg);
    const vPicnic58New = sumPicnic(insp.valve_breakdown?.valvesPicnic58kgNew);
    const vPicnic58Used = sumPicnic(insp.valve_breakdown?.valvesPicnic58kgUsed);

    // Helpers to build exact segregated valve items per cylinder type
    const buildSegregatedItems11k = (): Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> => {
      const items: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];
      const bNew = insp.valve_breakdown?.valves11kgNew;
      if (bNew) {
        if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
        if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
        if (Number(bNew.iranGazi) > 0) items.push({ valve_name: 'شیر نو ایران‌گازی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
        if (Number(bNew.forklift) > 0) items.push({ valve_name: 'شیر نو لیفتراک 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.forklift), direction: 'IN' });
        if (Number(bNew.iraqi) > 0) items.push({ valve_name: 'شیر نو عراقی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iraqi), direction: 'IN' });
      }
      const bUsed = insp.valve_breakdown?.valves11kgUsed;
      if (bUsed) {
        if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
        if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
        if (Number(bUsed.iranGazi) > 0) items.push({ valve_name: 'شیر کهنه ایران‌گازی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
        if (Number(bUsed.forklift) > 0) items.push({ valve_name: 'شیر کهنه لیفتراک 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.forklift), direction: 'IN' });
        if (Number(bUsed.iraqi) > 0) items.push({ valve_name: 'شیر کهنه عراقی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iraqi), direction: 'IN' });
      }
      return items;
    };

    const buildSegregatedItemsForklift = (): Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> => {
      const items: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];
      const bNew = insp.valve_breakdown?.valvesForklift22kgNew;
      if (bNew) {
        if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
        if (Number(bNew.iranGazi) > 0) items.push({ valve_name: 'شیر نو ایران‌گازی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
        if (Number(bNew.passari) > 0) items.push({ valve_name: 'شیر نو پاساری لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.passari), direction: 'IN' });
        if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
      }
      const bUsed = insp.valve_breakdown?.valvesForklift22kgUsed;
      if (bUsed) {
        if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
        if (Number(bUsed.iranGazi) > 0) items.push({ valve_name: 'شیر کهنه ایران‌گازی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
        if (Number(bUsed.passari) > 0) items.push({ valve_name: 'شیر کهنه پاساری لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.passari), direction: 'IN' });
        if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
      }
      return items;
    };

    const buildSegregatedItemsPicnic1L = (): Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> => {
      const items: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];
      const bNew = insp.valve_breakdown?.valvesPicnicNew || insp.valve_breakdown?.valvesPicnic5kg;
      if (bNew) {
        if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
        if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
      }
      const bUsed = insp.valve_breakdown?.valvesPicnicUsed || insp.valve_breakdown?.valvesPicnic2kg;
      if (bUsed) {
        if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
        if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
      }
      return items;
    };

    const buildSegregatedItemsPicnic58 = (): Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> => {
      const items: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];
      const bNew = insp.valve_breakdown?.valvesPicnic58kgNew;
      if (bNew) {
        if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
        if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
      }
      const bUsed = insp.valve_breakdown?.valvesPicnic58kgUsed;
      if (bUsed) {
        if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
        if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
      }
      return items;
    };

    // Build segregated entries list to register per cylinder type
    const entriesToCreate: Array<{
      targetCylinderType: CylinderType;
      cylinderIn?: number;
      newValves: number;
      usedValves: number;
      label: string;
      segregatedItems: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }>;
    }> = [];

    if (isCylinderInspection) {
      let deducedType: CylinderType = 'سیلندر 11 کیلویی';
      const iname = (insp.item_name || '').toLowerCase();
      if (iname.includes('5/8') || iname.includes('۵/۸') || iname.includes('5/6') || iname.includes('۵/۶') || iname.includes('پیکنیک 5') || iname.includes('پیکنیک 8')) {
        deducedType = 'پیکنیک 5/8 کیلویی';
      } else if (iname.includes('1/1.5') || iname.includes('۱/۱.۵') || iname.includes('1 لیتری') || iname.includes('پیکنیک')) {
        deducedType = 'پیکنیک 1/1.5/3 لیتری';
      } else if (iname.includes('لیفتراک')) {
        deducedType = 'سیلندر لیفتراکی';
      } else if (iname.includes('50') || iname.includes('۵۰')) {
        deducedType = 'سیلندر 50 کیلویی';
      } else if (cylinderType && !cylinderType.includes('مخزن')) {
        deducedType = cylinderType;
      }
      entriesToCreate.push({
        targetCylinderType: deducedType,
        cylinderIn: Number(insp.actual_healthy_quantity) || 0,
        newValves: 0,
        usedValves: 0,
        label: insp.item_name || 'سیلندر تعمیری',
        segregatedItems: []
      });
    } else if (insp.valve_breakdown && (v11New > 0 || v11Used > 0 || vForkNew > 0 || vForkUsed > 0 || vPicnicNew > 0 || vPicnicUsed > 0 || vPicnic58New > 0 || vPicnic58Used > 0)) {
      if (v11New > 0 || v11Used > 0) {
        if (cylinderType === 'سیلندر 50 کیلویی' || cylinderType === 'سیلندر 8/10 کیلویی') {
          entriesToCreate.push({
            targetCylinderType: cylinderType,
            newValves: v11New,
            usedValves: v11Used,
            label: 'شیر نو/کهنه ۱۱/۲۵/۵۰ کیلویی',
            segregatedItems: buildSegregatedItems11k()
          });
        } else {
          entriesToCreate.push({
            targetCylinderType: 'سیلندر 11 کیلویی',
            newValves: v11New,
            usedValves: v11Used,
            label: 'شیر نو/کهنه ۱۱/۲۵/۵۰ کیلویی',
            segregatedItems: buildSegregatedItems11k()
          });
        }
      }
      if (vForkNew > 0 || vForkUsed > 0) {
        entriesToCreate.push({
          targetCylinderType: 'سیلندر لیفتراکی',
          newValves: vForkNew,
          usedValves: vForkUsed,
          label: 'شیر نو/کهنه لیفتراکی',
          segregatedItems: buildSegregatedItemsForklift()
        });
      }
      if (vPicnicNew > 0 || vPicnicUsed > 0) {
        entriesToCreate.push({
          targetCylinderType: 'پیکنیک 1/1.5/3 لیتری',
          newValves: vPicnicNew,
          usedValves: vPicnicUsed,
          label: 'شیر نو/کهنه پیک‌نیک ۱/۱.۵/۳ لیتری',
          segregatedItems: buildSegregatedItemsPicnic1L()
        });
      }
      if (vPicnic58New > 0 || vPicnic58Used > 0) {
        entriesToCreate.push({
          targetCylinderType: 'پیکنیک 5/8 کیلویی',
          newValves: vPicnic58New,
          usedValves: vPicnic58Used,
          label: 'شیر نو/کهنه پیک‌نیک ۵/۸ کیلویی',
          segregatedItems: buildSegregatedItemsPicnic58()
        });
      }
    } else {
      let deducedType: CylinderType = 'سیلندر 11 کیلویی';
      const iname = (insp.item_name || '').toLowerCase();
      if (iname.includes('5/8') || iname.includes('۵/۸') || iname.includes('5/6') || iname.includes('۵/۶') || iname.includes('پیکنیک 5') || iname.includes('پیکنیک 8')) {
        deducedType = 'پیکنیک 5/6 کیلویی';
      } else if (iname.includes('1/1.5') || iname.includes('۱/۱.۵') || iname.includes('پیکنیک 1') || iname.includes('1 لیتری') || iname.includes('پیکنیک')) {
        deducedType = 'پیکنیک 1/1.5/3 لیتری';
      } else if (iname.includes('لیفتراک')) {
        deducedType = 'سیلندر لیفتراکی';
      } else if (iname.includes('11') || iname.includes('25') || iname.includes('50') || iname.includes('۱۱') || iname.includes('۲۵') || iname.includes('۵۰') || iname.includes('شیر')) {
        deducedType = 'سیلندر 11 کیلویی';
      } else {
        // Never assign valves to tanks! If cylinderType is tank, route to standard cylinder
        deducedType = (cylinderType && !cylinderType.includes('مخزن')) ? cylinderType : 'سیلندر 11 کیلویی';
      }
      entriesToCreate.push({
        targetCylinderType: deducedType,
        newValves: calcNewValves,
        usedValves: calcUsedValves,
        label: insp.item_name || 'شیرآلات',
        segregatedItems: valveItems
      });
    }

    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];
    let lastCreatedEntry: GasKardexEntry | undefined;

    for (const item of entriesToCreate) {
      // Prior balances for this customer and cylinder type (and shared valve family for 11/25/50)
      const is11_25_50 = is11Or25Or50CylinderType(item.targetCylinderType);
      const prevEntries = state.gas_kardex_entries.filter(
        k => k.customer_id === insp.customer_id && !k.is_deleted && (
          normalizeCylinderType(k.cylinder_type) === normalizeCylinderType(item.targetCylinderType) ||
          (is11_25_50 && is11Or25Or50CylinderType(k.cylinder_type))
        )
      );
      const sorted = [...prevEntries].sort((a, b) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
      const lastValve = sorted[sorted.length - 1];
      const prevCylEntries = prevEntries.filter(k => normalizeCylinderType(k.cylinder_type) === normalizeCylinderType(item.targetCylinderType));
      const lastCyl = prevCylEntries[prevCylEntries.length - 1];
      const prevCylBal = lastCyl ? lastCyl.cylinder_balance : 0;
      const prevScrapBal = lastCyl ? (lastCyl.scrap_balance ?? 0) : 0;
      const prevNewBal = lastValve ? lastValve.new_valve_balance : 0;
      const prevUsedBal = lastValve ? (lastValve.used_valve_balance ?? 0) : 0;

      // Filter exact segregated items matching this specific target cylinder
      const matchingItems = item.segregatedItems && item.segregatedItems.length > 0
        ? item.segregatedItems
        : valveItems.filter(vi => {
            const nm = (vi.valve_name || '').toLowerCase();
            if (item.targetCylinderType === 'پیکنیک 5/8 کیلویی' || item.targetCylinderType === 'پیکنیک 5/6 کیلویی') return nm.includes('5/8') || nm.includes('۵/۸') || nm.includes('5/6') || nm.includes('۵/۶');
            if (item.targetCylinderType === 'پیکنیک 1/1.5/3 لیتری') return nm.includes('پیکنیک') && !nm.includes('5/8') && !nm.includes('۵/۸');
            if (item.targetCylinderType === 'سیلندر لیفتراکی') return nm.includes('لیفتراک');
            return !nm.includes('پیکنیک') && !nm.includes('لیفتراک');
          });

      const finalValveItems = [...matchingItems];
      if (finalValveItems.length === 0) {
        if (item.newValves > 0) finalValveItems.push({ valve_name: `شیر نو متناظر ${item.targetCylinderType}`, valve_category: 'NEW', quantity: item.newValves, direction: 'IN' });
        if (item.usedValves > 0) finalValveItems.push({ valve_name: `شیر کهنه متناظر ${item.targetCylinderType}`, valve_category: 'USED', quantity: item.usedValves, direction: 'IN' });
      }

      const itemSummaryText = finalValveItems
        .map(v => `${v.valve_name.replace(' 11/25/50 کیلویی', '').replace(' 1/1.5/3 لیتری', '').replace(' 5/8 کیلویی', '').replace(' 5/6 کیلویی', '').replace(' لیفتراکی', '')}: ${toPersianDigits(v.quantity)}`)
        .join('، ');

      const kardexAuthor = (currentUser && currentUser.role !== 'WAREHOUSE_KEEPER' && currentUser.user_id !== 'USR-003' && currentUser.username !== 'hajivand')
        ? currentUser
        : ((state.users || SEED_USERS).find(u => u.username === 'karami') || { user_id: 'USR-002', username: 'karami', full_name: 'خانم کرمی' } as User);

      const cylInCount = item.cylinderIn !== undefined ? item.cylinderIn : 0;
      const cylBalCalc = prevCylBal + cylInCount;

      const entryId = `KDX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const kardexEntry: GasKardexEntry = {
        entry_id: entryId,
        customer_id: insp.customer_id,
        customer_name: insp.customer_name,
        cylinder_type: item.targetCylinderType,
        date: insp.date || getPersianDate(),
        description: isCylinderInspection
          ? `ورودی سیلندر تعمیری تاییدشده انباردار [برگه ${insp.form_number}] (${insp.item_name}: ${toPersianDigits(cylInCount)} عدد سالم)`
          : `ورودی تاییدشده ${item.label} توسط انباردار [برگه ${insp.form_number}] (${itemSummaryText || `شیر نو: ${toPersianDigits(item.newValves)} عدد، شیر کهنه: ${toPersianDigits(item.usedValves)} عدد`})`,
        transfer_sheet_number: insp.form_number,
        cylinder_in: cylInCount,
        cylinder_out: 0,
        scrap_out: 0,
        scrap_stock_in: 0,
        cylinder_balance: cylBalCalc,
        final_scrap_out: 0,
        scrap_balance: prevScrapBal,
        new_valve_in: item.newValves,
        new_valve_out: 0,
        new_valve_balance: prevNewBal + item.newValves,
        dispatched: insp.waybill_number || '',
        waybill_number: insp.waybill_number || '',
        used_valve_in: item.usedValves,
        used_valve_out: 0,
        used_valve_balance: prevUsedBal + item.usedValves,
        defective: insp.defective_quantity || 0,
        user_id: kardexAuthor.user_id,
        created_by_username: kardexAuthor.username,
        inspection_id: insp.inspection_id,
        custom_item_name: insp.item_name,
        valve_items: finalValveItems,
        device_id: state.deviceId,
        event_id: generateUUID(),
        notes: isCylinderInspection
          ? `ثبت ورودی سیلندر تعمیری طرف‌حساب با تایید مهندس حاجی‌وند - بارنامه: ${insp.waybill_number} - راننده: ${insp.driver_name}`
          : `ثبت تفکیک‌شده ورودی ${item.label} با تایید انباردار ${insp.inspector_name} - بارنامه: ${insp.waybill_number} - راننده: ${insp.driver_name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      state.gas_kardex_entries.push(kardexEntry);
      lastCreatedEntry = kardexEntry;
    }

    this.recalculateCustomerKardex(state, insp.customer_id);

    const kardexAuthor = (currentUser && currentUser.role !== 'WAREHOUSE_KEEPER' && currentUser.user_id !== 'USR-003' && currentUser.username !== 'hajivand')
      ? currentUser
      : ((state.users || SEED_USERS).find(u => u.username === 'karami') || { user_id: 'USR-002', username: 'karami', full_name: 'خانم کرمی' } as User);

    // Update inspection
    insp.status = 'KARDEX_REGISTERED';
    insp.kardex_entry_id = lastCreatedEntry?.entry_id || '';
    insp.kardex_registered_by = kardexAuthor.username;
    insp.kardex_registered_at = new Date().toISOString();
    insp.updated_at = new Date().toISOString();

    this.saveState(env, state);

    // Record local sync events
    if (lastCreatedEntry) {
      this.recordLocalChange(
        env,
        kardexAuthor.user_id,
        'GAS_KARDEX',
        'CREATE',
        lastCreatedEntry.entry_id,
        lastCreatedEntry,
        `ثبت ردیف کاردکس گاز برای ${insp.customer_name} از اعلان ورودی شیرآلات ${insp.form_number}`
      );
    }
    this.recordLocalChange(
      env,
      kardexAuthor.user_id,
      'CYLINDER_VALVE_INSPECTION',
      'UPDATE',
      insp.inspection_id,
      insp,
      `ثبت ردیف کاردکس متناظر برای بازرسی ${insp.form_number} توسط @${kardexAuthor.username}`,
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: lastCreatedEntry }));
        window.dispatchEvent(new CustomEvent('mgas:inspection_updated', { detail: insp }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('mgas_kardex_sync_channel');
          bc.postMessage({ type: 'KARDEX_ENTRY_ADDED', entry: lastCreatedEntry });
          bc.close();
        }
      }
    } catch {}

    return { success: true, entry: lastCreatedEntry };
  }

  /**
   * Retrieves real-time Valve Inventory Profiles for all customers in the warehouse
   * Tracks customer valve balance, repairs deducted, and M-Gas central stock coverage when kardex is negative
   */
  static getCustomerValveProfiles(env: RuntimeEnvironment): CustomerValveProfile[] {
    const state = this.getState(env);
    const customers = state.customers || [];
    const kardexEntries = (state.gas_kardex_entries || []).filter(k => !k.is_deleted);
    const inspections = state.cylinder_valve_inspections || [];

    return customers.map(cust => {
      const custKardex = kardexEntries.filter(k => k.customer_id === cust.customer_id);
      
      let totalNewValveIn = 0;
      let totalUsedValveIn = 0;
      let totalNewValveOut = 0;
      let totalUsedValveOut = 0;
      let totalCylIn = 0;
      let totalCylOut = 0;
      let latestDate = cust.created_at || '1405/01/01';

      custKardex.forEach(k => {
        totalNewValveIn += Number(k.new_valve_in) || 0;
        totalUsedValveIn += Number(k.used_valve_in) || 0;
        totalNewValveOut += Number(k.new_valve_out) || 0;
        totalUsedValveOut += Number(k.used_valve_out) || 0;
        totalCylIn += Number(k.cylinder_in) || 0;
        totalCylOut += Number(k.cylinder_out) || 0;
        if (k.date && k.date > latestDate) latestDate = k.date;
      });

      // Also account for counted inspections not yet registered into kardex (strictly customer only)
      const unlinkedInspections = inspections.filter(
        i => i.customer_id === cust.customer_id && i.source_type !== 'SUPPLIER' && !i.supplier_id && i.status === 'COUNTED_READY_FOR_KARDEX'
      );

      unlinkedInspections.forEach(i => {
        // Strict guard: Incoming repair cylinders only increase cylinder intake, NEVER valve intake!
        if (
          isRepairCylinderInspection(i, state.custom_cylinder_item_types) ||
          (i.item_type && String(i.item_type).includes('CYLINDER')) ||
          (i.item_name && (i.item_name.includes('سیلندر') || i.item_name.includes('کپسول')))
        ) {
          totalCylIn += Number(i.actual_healthy_quantity) || 0;
          if (i.date && i.date > latestDate) latestDate = i.date;
          return;
        }

        if (i.valve_breakdown) {
          const sum11 = (b: any) => (Number(b?.parsi) || 0) + (Number(b?.butane) || 0) + (Number(b?.iranGazi) || 0) + (Number(b?.forklift) || 0) + (Number(b?.iraqi) || 0);
          const sumFork = (b: any) => (Number(b?.parsi) || 0) + (Number(b?.butane) || 0) + (Number(b?.iranGazi) || 0) + (Number(b?.passari) || 0);
          const sumP = (b: any) => (Number(b?.parsi) || 0) + (Number(b?.butane) || 0);
          const n = sum11(i.valve_breakdown.valves11kgNew) + sumFork(i.valve_breakdown.valvesForklift22kgNew) + sumP(i.valve_breakdown.valvesPicnicNew || i.valve_breakdown.valvesPicnic5kg) + sumP(i.valve_breakdown.valvesPicnic58kgNew);
          const u = sum11(i.valve_breakdown.valves11kgUsed) + sumFork(i.valve_breakdown.valvesForklift22kgUsed) + sumP(i.valve_breakdown.valvesPicnicUsed || i.valve_breakdown.valvesPicnic2kg) + sumP(i.valve_breakdown.valvesPicnic58kgUsed);
          totalNewValveIn += n;
          totalUsedValveIn += u;
        } else if (i.total_new_valves !== undefined || i.total_used_valves !== undefined) {
          totalNewValveIn += Number(i.total_new_valves) || 0;
          totalUsedValveIn += Number(i.total_used_valves) || 0;
        } else {
          const healthy = Number(i.actual_healthy_quantity) || 0;
          const name = (i.item_name || '').toLowerCase();
          if (name.includes('شیر') && (name.includes('کهنه') || name.includes('داغی'))) {
            totalUsedValveIn += healthy;
          } else if (name.includes('شیر') || (i.item_type && String(i.item_type).includes('VALVE'))) {
            totalNewValveIn += healthy;
          } else if (name.includes('سیلندر') || (i.item_type && String(i.item_type).includes('CYLINDER'))) {
            totalCylIn += healthy;
          }
        }
        if (i.date && i.date > latestDate) latestDate = i.date;
      });

      const netNewValves = totalNewValveIn - totalNewValveOut;
      const netUsedValves = totalUsedValveIn - totalUsedValveOut;
      // If negative, covered automatically from M-Gas main stock
      const mgasCovered = netNewValves < 0 ? Math.abs(netNewValves) : 0;

      return {
        customer_id: cust.customer_id,
        customer_name: cust.name,
        company_name: cust.company_name,
        province: cust.province,
        total_new_valve_in: totalNewValveIn,
        total_new_valve_out: totalNewValveOut,
        new_valves_balance: netNewValves,
        total_used_valve_in: totalUsedValveIn,
        total_used_valve_out: totalUsedValveOut,
        used_valves_balance: netUsedValves,
        mgas_covered_valves: mgasCovered,
        total_cylinders_in: totalCylIn,
        total_cylinders_out: totalCylOut,
        last_activity_date: latestDate
      };
    });
  }

  /**
   * Retrieves segregated valve reporting data per customer and valve type
   * Shows exact IN (ورود), OUT (خروج) and REMAINING (باقی‌مانده) for every valve model per customer.
   */
  /**
   * Retrieves segregated valve reporting data per party (customers and branches/suppliers) and valve model.
   * Tracks exact IN (ورود), OUT (خروج) and RUNNING/FINAL REMAINING BALANCE (مانده شیر x) per model and transaction.
   * Integrates warehouse stock movements, cylinder valve inspections, and gas kardex entries with zero double-counting.
   */
  static getCustomerValveDetailedReport(
    env: RuntimeEnvironment,
    filterCustomerId?: string,
    startDate?: string,
    endDate?: string,
    categoryFilter?: 'ALL' | 'NEW' | 'USED'
  ) {
    const state = this.getState(env);
    const customers = state.customers || [];
    const suppliers = state.suppliers || [];
    const kardexEntries = (state.gas_kardex_entries || []).filter(k => !k.is_deleted);
    const inspections = state.cylinder_valve_inspections || [];
    const stockMovements = state.stock_movements || [];
    const products = state.products || [];

    // Unified party list: customers + suppliers/branches + any party found in valve movements
    interface UnifiedParty {
      party_id: string;
      name: string;
      company_name?: string;
      province?: string;
      party_type: 'CUSTOMER' | 'SUPPLIER';
    }

    const partyMap = new Map<string, UnifiedParty>();
    customers.forEach(c => {
      partyMap.set(c.customer_id, {
        party_id: c.customer_id,
        name: c.name,
        company_name: c.company_name,
        province: c.province,
        party_type: 'CUSTOMER'
      });
    });
    suppliers.forEach(s => {
      if (!partyMap.has(s.supplier_id)) {
        partyMap.set(s.supplier_id, {
          party_id: s.supplier_id,
          name: s.name,
          company_name: s.company_name,
          province: s.province,
          party_type: 'SUPPLIER'
        });
      }
    });

    // Also pick up any party referenced directly in inspections or stock movements
    inspections.forEach(i => {
      const pid = i.customer_id || i.customer_name;
      if (pid && !partyMap.has(pid)) {
        partyMap.set(pid, {
          party_id: pid,
          name: i.customer_name || pid,
          party_type: i.source_type === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER'
        });
      }
    });

    stockMovements.forEach(m => {
      const isValveProd = products.find(p => p.product_id === m.product_id)?.category_id === 'CAT-02' ||
        m.description?.includes('شیر') || m.notes?.includes('شیر');
      if (isValveProd) {
        const cId = m.customer_id || (m as any).supplier_id;
        const cName = m.customer_name || (m as any).supplier_name;
        if (cId && !partyMap.has(cId)) {
          partyMap.set(cId, {
            party_id: cId,
            name: cName || cId,
            party_type: (m as any).supplier_id ? 'SUPPLIER' : 'CUSTOMER'
          });
        }
      }
    });

    const allParties = Array.from(partyMap.values());
    const targetParties = filterCustomerId && filterCustomerId !== 'all'
      ? allParties.filter(p => p.party_id === filterCustomerId || p.name === filterCustomerId)
      : allParties;

    const segregatedRows: SegregatedCustomerValveItem[] = [];

    const customerSummaryRows: Array<{
      customer_id: string;
      customer_name: string;
      company_name?: string;
      province?: string;
      total_new_in: number;
      total_new_out: number;
      new_balance: number;
      total_used_in: number;
      total_used_out: number;
      used_balance: number;
      total_all_in: number;
      total_all_out: number;
      all_balance: number;
      mgas_covered: number;
      last_activity_date: string;
      status_label: string;
      status_type: 'healthy' | 'zero' | 'covered';
    }> = [];

    const allLedgerTransactions: Array<{
      id: string;
      customer_id: string;
      customer_name: string;
      date: string;
      time?: string;
      sheet_number: string;
      description: string;
      valve_name: string;
      valve_category: 'NEW' | 'USED';
      direction: 'IN' | 'OUT';
      quantity: number;
      running_balance?: number;
      source_type: string;
      verified_by?: string;
      driver_name?: string;
    }> = [];

    let sumNewIn = 0;
    let sumNewOut = 0;
    let sumNewBal = 0;
    let sumUsedIn = 0;
    let sumUsedOut = 0;
    let sumUsedBal = 0;
    let sumMgasCovered = 0;

    targetParties.forEach(party => {
      // Per-party valve model accumulation map
      const partyValveMap = new Map<string, {
        valve_name: string;
        valve_category: 'NEW' | 'USED';
        quantity_in: number;
        quantity_out: number;
        last_date: string;
      }>();

      const getOrCreateValveRecord = (name: string, category: 'NEW' | 'USED', date: string) => {
        const cleanName = name.trim() || (category === 'NEW' ? 'قطعه شیر نو استاندارد کپسول' : 'قطعه شیر کهنه و داغی');
        if (!partyValveMap.has(cleanName)) {
          partyValveMap.set(cleanName, {
            valve_name: cleanName,
            valve_category: category,
            quantity_in: 0,
            quantity_out: 0,
            last_date: date || '1405/01/01'
          });
        }
        const rec = partyValveMap.get(cleanName)!;
        if (date && date > rec.last_date) rec.last_date = date;
        return rec;
      };

      // Raw transactions for this party to be sorted and assigned running balances
      const partyRawTxs: Array<{
        id: string;
        customer_id: string;
        customer_name: string;
        date: string;
        time?: string;
        sheet_number: string;
        description: string;
        valve_name: string;
        valve_category: 'NEW' | 'USED';
        direction: 'IN' | 'OUT';
        quantity: number;
        running_balance?: number;
        source_type: string;
        verified_by?: string;
        driver_name?: string;
      }> = [];

      // Sets of sheet/reference IDs processed to prevent double-counting across sources
      const processedMovementRefs = new Set<string>();
      const processedKardexSheets = new Set<string>();
      let latestDate = '1405/01/01';

      // 1. PRIMARY SOURCE: state.stock_movements (ground truth of physical warehouse transactions)
      const partyMovements = stockMovements.filter(m => {
        const prod = products.find(p => p.product_id === m.product_id);
        const isValve =
          prod?.category_id === 'CAT-02' ||
          prod?.sku?.includes('VLV') ||
          prod?.name?.includes('شیر') ||
          m.description?.includes('شیر') ||
          m.notes?.includes('شیر');
        if (!isValve) return false;

        const mCustId = m.customer_id || (m as any).supplier_id;
        const mCustName = m.customer_name || (m as any).supplier_name;
        const matchesParty =
          mCustId === party.party_id ||
          mCustName === party.name ||
          (party.name && m.description?.includes(party.name)) ||
          (party.name && m.notes?.includes(party.name));
        return matchesParty;
      });

      partyMovements.forEach((m, mIdx) => {
        // If this movement is an unsegregated auto-sync placeholder from an inspection (MOV-INSP-),
        // and either Kardex or the Inspection has the actual segregated breakdown, skip the unsegregated placeholder
        if (m.movement_id.startsWith('MOV-INSP-')) {
          const inspId = m.movement_id.replace('MOV-INSP-', '');
          const hasKardex = kardexEntries.some(k => k.inspection_id === inspId || (k.transfer_sheet_number && k.transfer_sheet_number === m.reference_id));
          const hasInsp = inspections.some(i => i.inspection_id === inspId && (i.valve_breakdown || (i.receipt_items && i.receipt_items.length > 0)));
          if (hasKardex || hasInsp) {
            return;
          }
        }

        const recordDate = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordDate < startDate) return;
        if (endDate && recordDate > endDate) return;
        if (recordDate > latestDate) latestDate = recordDate;

        const prod = products.find(p => p.product_id === m.product_id);
        const isUsed =
          prod?.name?.includes('کهنه') ||
          prod?.name?.includes('داغی') ||
          prod?.sku?.includes('U') ||
          m.item_condition === 'DEFECTIVE' ||
          m.description?.includes('کهنه') ||
          m.notes?.includes('کهنه');
        const vCategory: 'NEW' | 'USED' = isUsed ? 'USED' : 'NEW';

        const vName = prod?.name || (isUsed ? 'قطعه شیر کهنه و داغی' : 'قطعه شیر نو استاندارد');
        const isInput =
          m.movement_type === 'STOCK_IN' ||
          m.movement_type === 'PURCHASE' ||
          m.movement_type === 'RETURN_IN';
        const direction: 'IN' | 'OUT' = isInput ? 'IN' : 'OUT';
        const qty = Math.abs(Number(m.quantity)) || 0;
        if (qty <= 0) return;

        const sheetNo = m.reference_id || m.document_number || '---';
        if (m.reference_id && m.reference_id.trim() !== '---') {
          processedMovementRefs.add(m.reference_id.trim());
        }

        const rawTime = m.created_at?.includes('T') ? m.created_at.split('T')[1]?.slice(0, 5) : '';

        partyRawTxs.push({
          id: `TX-MOV-${m.movement_id || mIdx}`,
          customer_id: party.party_id,
          customer_name: party.name,
          date: recordDate,
          time: rawTime,
          sheet_number: sheetNo,
          description: m.description || `گردش انبار: ${vName}`,
          valve_name: vName,
          valve_category: vCategory,
          direction,
          quantity: qty,
          source_type: 'رسید انبار / ورودی شیرآلات',
          verified_by: m.created_by_username
        });
      });

      // 2. SECONDARY SOURCE: Gas Kardex Entries (Historical & direct kardex repair records)
      let custKardex = kardexEntries.filter(k => k.customer_id === party.party_id);
      custKardex.forEach(k => {
        const kDate = getPersianDate(k.date || k.created_at);
        if (startDate && kDate < startDate) return;
        if (endDate && kDate > endDate) return;
        if (kDate > latestDate) latestDate = kDate;

        // Skip if this kardex entry's transfer sheet was already processed via specific stock_movements
        if (k.transfer_sheet_number && processedMovementRefs.has(k.transfer_sheet_number.trim())) {
          return;
        }
        if (k.transfer_sheet_number) {
          processedKardexSheets.add(k.transfer_sheet_number.trim());
        }

        const nIn = Number(k.new_valve_in) || 0;
        const nOut = Number(k.new_valve_out) || 0;
        const uIn = Number(k.used_valve_in) || 0;
        const uOut = Number(k.used_valve_out) || 0;

        if (k.valve_items && k.valve_items.length > 0) {
          k.valve_items.forEach((itm, itmIdx) => {
            partyRawTxs.push({
              id: `TX-GK-${itm.direction}-${k.entry_id}-${itmIdx}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: kDate,
              sheet_number: k.transfer_sheet_number || '---',
              description: k.description || `گردش کاردکس ${itm.valve_name}`,
              valve_name: itm.valve_name,
              valve_category: itm.valve_category,
              direction: itm.direction,
              quantity: itm.quantity,
              source_type: 'کاردکس تعمیر سیلندر',
              verified_by: k.created_by_username
            });
          });
        } else {
          // General classification fallback based on cylinder type
          const cylLabel = k.cylinder_type || 'سیلندر ۱۱ک';
          if (nIn > 0) {
            partyRawTxs.push({
              id: `TX-NIN-${k.entry_id}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: kDate,
              sheet_number: k.transfer_sheet_number || '---',
              description: k.description || 'ورود شیر نو به کاردکس',
              valve_name: `شیر نو متناظر ${cylLabel}`,
              valve_category: 'NEW',
              direction: 'IN',
              quantity: nIn,
              source_type: 'کاردکس تعمیرات',
              verified_by: k.created_by_username
            });
          }
          if (nOut > 0) {
            partyRawTxs.push({
              id: `TX-NOUT-${k.entry_id}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: kDate,
              sheet_number: k.transfer_sheet_number || '---',
              description: k.description || 'خروج/مصرف شیر نو',
              valve_name: `شیر نو متناظر ${cylLabel}`,
              valve_category: 'NEW',
              direction: 'OUT',
              quantity: nOut,
              source_type: 'کاردکس تعمیرات',
              verified_by: k.created_by_username
            });
          }
          if (uIn > 0) {
            partyRawTxs.push({
              id: `TX-UIN-${k.entry_id}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: kDate,
              sheet_number: k.transfer_sheet_number || '---',
              description: k.description || 'ورود شیر کهنه و داغی',
              valve_name: `شیر کهنه متناظر ${cylLabel}`,
              valve_category: 'USED',
              direction: 'IN',
              quantity: uIn,
              source_type: 'کاردکس تعمیرات',
              verified_by: k.created_by_username
            });
          }
          if (uOut > 0) {
            partyRawTxs.push({
              id: `TX-UOUT-${k.entry_id}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: kDate,
              sheet_number: k.transfer_sheet_number || '---',
              description: k.description || 'خروج و تحویل شیر کهنه',
              valve_name: `شیر کهنه متناظر ${cylLabel}`,
              valve_category: 'USED',
              direction: 'OUT',
              quantity: uOut,
              source_type: 'کاردکس تعمیرات',
              verified_by: k.created_by_username
            });
          }
        }
      });

      // 3. TERTIARY SOURCE: Cylinder Valve Inspections (Intakes not yet synced to movements or Kardex)
      const partyInspections = inspections.filter(
        i => (i.customer_id === party.party_id || i.customer_name === party.name)
      );
      partyInspections.forEach(i => {
        const iDate = getPersianDate(i.date || i.created_at);
        if (startDate && iDate < startDate) return;
        if (endDate && iDate > endDate) return;
        if (iDate > latestDate) latestDate = iDate;

        // Skip if already covered by stock movements or kardex
        if (i.form_number && (processedMovementRefs.has(i.form_number.trim()) || processedKardexSheets.has(i.form_number.trim()))) {
          return;
        }
        if (i.form_number) {
          processedKardexSheets.add(i.form_number.trim());
        }

        if (i.valve_breakdown) {
          const addBreakdown = (
            groupName: string,
            data?: { parsi?: number; butane?: number; iranGazi?: number; forklift?: number; iraqi?: number; passari?: number },
            cat: 'NEW' | 'USED' = 'NEW'
          ) => {
            if (!data) return;
            Object.entries(data).forEach(([brand, val]) => {
              const qty = Number(val) || 0;
              if (qty <= 0) return;
              const brandLabel = brand === 'parsi' ? 'پرسی' : brand === 'butane' ? 'بوتان' : brand === 'iranGazi' ? 'ایران‌گازی' : brand === 'forklift' ? 'لیفتراک' : brand === 'iraqi' ? 'عراقی' : brand === 'passari' ? 'پاساری' : brand;
              const name = cat === 'NEW' ? `شیر نو ${brandLabel} ${groupName}` : `شیر کهنه ${brandLabel} ${groupName}`;

              partyRawTxs.push({
                id: `TX-INSP-${cat}-${i.inspection_id}-${brand}`,
                customer_id: party.party_id,
                customer_name: party.name,
                date: iDate,
                sheet_number: i.form_number,
                description: `ورودی تاییدشده انباردار (${name})`,
                valve_name: name,
                valve_category: cat,
                direction: 'IN',
                quantity: qty,
                source_type: 'رسید ورود انباردار',
                verified_by: i.inspector_name,
                driver_name: i.driver_name
              });
            });
          };

          addBreakdown('۱۱/۲۵/۵۰ کیلویی', i.valve_breakdown.valves11kgNew, 'NEW');
          addBreakdown('۱۱/۲۵/۵۰ کیلویی', i.valve_breakdown.valves11kgUsed, 'USED');
          addBreakdown('لیفتراکی', i.valve_breakdown.valvesForklift22kgNew, 'NEW');
          addBreakdown('لیفتراکی', i.valve_breakdown.valvesForklift22kgUsed, 'USED');
          addBreakdown('۱/۱.۵/۳ لیتری', i.valve_breakdown.valvesPicnicNew || i.valve_breakdown.valvesPicnic5kg, 'NEW');
          addBreakdown('۱/۱.۵/۳ لیتری', i.valve_breakdown.valvesPicnicUsed || i.valve_breakdown.valvesPicnic2kg, 'USED');
          addBreakdown('۵/۸ کیلویی', i.valve_breakdown.valvesPicnic58kgNew, 'NEW');
          addBreakdown('۵/۸ کیلویی', i.valve_breakdown.valvesPicnic58kgUsed, 'USED');
        } else if (i.receipt_items && i.receipt_items.length > 0) {
          i.receipt_items.forEach((item, rIdx) => {
            const desc = (item.description || '').toLowerCase();
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) return;
            const isUsed = desc.includes('کهنه') || desc.includes('داغی') || (item.remarks || '').includes('کهنه');
            const vName = item.description || (isUsed ? 'قطعه شیر کهنه و داغی' : 'قطعه شیر نو استاندارد');
            const vCat = isUsed ? 'USED' : 'NEW';

            partyRawTxs.push({
              id: `TX-INSP-${i.inspection_id}-${rIdx}`,
              customer_id: party.party_id,
              customer_name: party.name,
              date: iDate,
              sheet_number: i.form_number,
              description: `ورودی تاییدشده انباردار (${vName})`,
              valve_name: vName,
              valve_category: vCat,
              direction: 'IN',
              quantity: qty,
              source_type: 'رسید ورود انباردار',
              verified_by: i.inspector_name,
              driver_name: i.driver_name
            });
          });
        }
      });

      // 4. CHRONOLOGICAL RUNNING BALANCE CALCULATION FOR EACH SPECIFIC VALVE MODEL
      // Sort oldest to newest to compute running balance after each movement
      partyRawTxs.sort((a, b) => {
        const dateComp = (a.date || '').localeCompare(b.date || '');
        if (dateComp !== 0) return dateComp;
        return (a.time || '').localeCompare(b.time || '');
      });

      const valveRunningBalanceMap = new Map<string, number>();

      partyRawTxs.forEach(tx => {
        const vRec = getOrCreateValveRecord(tx.valve_name, tx.valve_category, tx.date);
        if (tx.direction === 'IN') {
          vRec.quantity_in += tx.quantity;
        } else {
          vRec.quantity_out += tx.quantity;
        }

        const currentBal = valveRunningBalanceMap.get(tx.valve_name) || 0;
        const newBal = tx.direction === 'IN' ? currentBal + tx.quantity : currentBal - tx.quantity;
        valveRunningBalanceMap.set(tx.valve_name, newBal);
        tx.running_balance = newBal;
      });

      // Push all raw transactions into global ledger
      partyRawTxs.forEach(tx => allLedgerTransactions.push(tx));

      // Calculate totals for this party
      let cNewIn = 0;
      let cNewOut = 0;
      let cUsedIn = 0;
      let cUsedOut = 0;

      partyValveMap.forEach(v => {
        if (v.valve_category === 'NEW') {
          cNewIn += v.quantity_in;
          cNewOut += v.quantity_out;
        } else {
          cUsedIn += v.quantity_in;
          cUsedOut += v.quantity_out;
        }
      });

      // Only create placeholder rows if explicitly searching for a single party and has zero records
      if (partyValveMap.size === 0 && filterCustomerId && filterCustomerId !== 'all') {
        getOrCreateValveRecord('قطعه شیر نو استاندارد کپسول', 'NEW', latestDate);
        getOrCreateValveRecord('قطعه شیر کهنه و داغی', 'USED', latestDate);
      }

      // Generate Segregated Rows for each distinct valve of this party
      partyValveMap.forEach(v => {
        if (categoryFilter && categoryFilter !== 'ALL' && v.valve_category !== categoryFilter) {
          return;
        }

        const bal = v.quantity_in - v.quantity_out;
        const mgasCov = (v.valve_category === 'NEW' && bal < 0) ? Math.abs(bal) : 0;

        segregatedRows.push({
          customer_id: party.party_id,
          customer_name: party.name,
          company_name: party.company_name,
          province: party.province,
          valve_name: v.valve_name,
          valve_category: v.valve_category,
          quantity_in: v.quantity_in,
          quantity_out: v.quantity_out,
          balance: bal,
          mgas_covered: mgasCov,
          last_activity_date: v.last_date,
          status_label: bal > 0 ? `موجود نزد انبار (+${toPersianDigits(bal)})` : bal === 0 ? 'تراز صفر' : `کسری با تامین ام‌گاز (${toPersianDigits(Math.abs(bal))})`,
          status_type: bal > 0 ? 'healthy' : bal === 0 ? 'zero' : 'covered'
        });
      });

      const newBal = cNewIn - cNewOut;
      const usedBal = cUsedIn - cUsedOut;
      const mgasCovered = newBal < 0 ? Math.abs(newBal) : 0;

      sumNewIn += cNewIn;
      sumNewOut += cNewOut;
      sumNewBal += newBal;
      sumUsedIn += cUsedIn;
      sumUsedOut += cUsedOut;
      sumUsedBal += usedBal;
      sumMgasCovered += mgasCovered;

      // Only push to summary if party has activity or was specifically selected
      if (cNewIn > 0 || cNewOut > 0 || cUsedIn > 0 || cUsedOut > 0 || (filterCustomerId && filterCustomerId !== 'all')) {
        customerSummaryRows.push({
          customer_id: party.party_id,
          customer_name: party.name,
          company_name: party.company_name,
          province: party.province,
          total_new_in: cNewIn,
          total_new_out: cNewOut,
          new_balance: newBal,
          total_used_in: cUsedIn,
          total_used_out: cUsedOut,
          used_balance: usedBal,
          total_all_in: cNewIn + cUsedIn,
          total_all_out: cNewOut + cUsedOut,
          all_balance: newBal + usedBal,
          mgas_covered: mgasCovered,
          last_activity_date: latestDate,
          status_label: newBal > 0 ? `مانده مثبت شیر نو (+${toPersianDigits(newBal)})` : newBal === 0 ? 'تراز صفر' : `کسری شیر نو (-${toPersianDigits(Math.abs(newBal))})`,
          status_type: newBal > 0 ? 'healthy' : newBal === 0 ? 'zero' : 'covered'
        });
      }
    });

    // Sort global ledger newest to oldest for display, preserving the computed running_balance
    allLedgerTransactions.sort((a, b) => {
      const dateComp = (b.date || '').localeCompare(a.date || '');
      if (dateComp !== 0) return dateComp;
      return (b.time || '').localeCompare(a.time || '');
    });

    return {
      segregatedRows,
      customerSummaryRows,
      ledgerTransactions: allLedgerTransactions,
      totals: {
        totalNewValveIn: sumNewIn,
        totalNewValveOut: sumNewOut,
        totalNewValveBalance: sumNewBal,
        totalUsedValveIn: sumUsedIn,
        totalUsedValveOut: sumUsedOut,
        totalUsedValveBalance: sumUsedBal,
        totalValvesIn: sumNewIn + sumUsedIn,
        totalValvesOut: sumNewOut + sumUsedOut,
        totalValvesBalance: sumNewBal + sumUsedBal,
        totalMgasCovered: sumMgasCovered
      }
    };
  }

  static deleteCylinderValveInspection(
    env: RuntimeEnvironment,
    inspectionId: string,
    userId: string = 'USR-003'
  ): boolean {
    this.markEntityPermanentlyDeleted(inspectionId);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    let removed: CylinderValveInspection | undefined;

    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.cylinder_valve_inspections) {
        const targetIdx = s.cylinder_valve_inspections.findIndex(i => i.inspection_id === inspectionId);
        if (targetIdx >= 0) {
          if (!removed) removed = s.cylinder_valve_inspections[targetIdx];
          s.cylinder_valve_inspections = s.cylinder_valve_inspections.filter(i => i.inspection_id !== inspectionId);
        }
      }
      if (removed) {
        this.markEntityPermanentlyDeleted(removed.form_number);
        // Also remove associated automatic stock movement if present
        if (s.stock_movements) {
          const movementId = `MOV-INSP-${removed.inspection_id}`;
          s.stock_movements = s.stock_movements.filter(
            m => m.movement_id !== movementId && !(m.reference_id === removed!.form_number && m.movement_type === 'STOCK_IN')
          );
        }
      }
      this.saveState(targetEnv, s);
    }

    if (!removed) return false;

    const actorUser = this.getUserById(env, userId) || SEED_USERS.find(u => u.user_id === userId);
    this.recordLocalChange(
      env,
      userId,
      'CYLINDER_VALVE_INSPECTION',
      'DELETE',
      removed.inspection_id,
      removed,
      `حذف برگه بازرسی و ورودی شیر و سیلندر شماره ${removed.form_number} (${removed.item_name})`,
      { form_number: removed.form_number }
    );

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:inspection_updated', { detail: { deletedInspectionId: inspectionId } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: { deletedInspectionId: inspectionId } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      }
    } catch {}

    return true;
  }

  static getCustomItemTypes(env: RuntimeEnvironment): CustomCylinderItemType[] {
    const state = this.getState(env);
    const tombstones = this.getPermanentlyDeletedIds();

    this.ensureCustomItemTypesLoaded(state);
    state.custom_cylinder_item_types = state.custom_cylinder_item_types.filter(
      item => !tombstones.has(item.id)
    );

    return state.custom_cylinder_item_types;
  }

  static addCustomItemType(
    env: RuntimeEnvironment,
    item: CustomCylinderItemType,
    userId: string
  ): CustomCylinderItemType {
    const state = this.getState(env);
    if (!state.custom_cylinder_item_types) {
      state.custom_cylinder_item_types = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
    }
    const existing = state.custom_cylinder_item_types.find(
      i => i.id === item.id || i.name.trim() === item.name.trim()
    );
    if (existing) {
      existing.name = item.name;
      existing.category = item.category;
      existing.unit = item.unit;
      existing.description = item.description;
      this.saveState(env, state);
      return existing;
    }

    state.custom_cylinder_item_types.push(item);
    this.saveState(env, state);

    // Ensure all 3 in-memory database environments receive this item immediately
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState) {
          if (!otherState.custom_cylinder_item_types) {
            otherState.custom_cylinder_item_types = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
          }
          if (!otherState.custom_cylinder_item_types.some(x => x.id === item.id || x.name.trim() === item.name.trim())) {
            otherState.custom_cylinder_item_types.push(item);
            this.saveState(otherEnv, otherState);
          }
        }
      }
    }

    // Broadcast across windows / desktop tabs
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.postMessage({ type: 'CUSTOM_ITEM_TYPE_ADDED', item });
        bc.close();
      }
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:custom_item_types_updated', { detail: item }));
      }
    } catch {}

    // Record sync event
    this.recordLocalChange(
      env,
      userId,
      'SETTING',
      'CREATE',
      `ITEM_TYPE_${item.id}`,
      item,
      `تعریف نوع قلم وارده جدید: ${item.name}`,
      { item_name: item.name, category: item.category }
    );

    return item;
  }

  static updateCustomItemType(
    env: RuntimeEnvironment,
    updatedItem: CustomCylinderItemType,
    userId: string
  ): CustomCylinderItemType {
    const state = this.getState(env);
    if (!state.custom_cylinder_item_types) {
      state.custom_cylinder_item_types = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
    }

    const idx = state.custom_cylinder_item_types.findIndex(i => i.id === updatedItem.id);
    if (idx !== -1) {
      state.custom_cylinder_item_types[idx] = { ...updatedItem };
    } else {
      state.custom_cylinder_item_types.push(updatedItem);
    }
    this.saveState(env, state);

    // Sync to other environments in memory
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState?.custom_cylinder_item_types) {
          const oIdx = otherState.custom_cylinder_item_types.findIndex(x => x.id === updatedItem.id);
          if (oIdx !== -1) {
            otherState.custom_cylinder_item_types[oIdx] = { ...updatedItem };
          } else {
            otherState.custom_cylinder_item_types.push(updatedItem);
          }
          this.saveState(otherEnv, otherState);
        }
      }
    }

    // Broadcast change
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.postMessage({ type: 'CUSTOM_ITEM_TYPE_UPDATED', item: updatedItem });
        bc.close();
      }
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:custom_item_types_updated', { detail: updatedItem }));
      }
    } catch {}

    this.recordLocalChange(
      env,
      userId,
      'SETTING',
      'UPDATE',
      `ITEM_TYPE_${updatedItem.id}`,
      updatedItem,
      `ویرایش مشخصات نوع قلم وارده: ${updatedItem.name}`,
      { item_name: updatedItem.name, category: updatedItem.category }
    );

    return updatedItem;
  }

  static deleteCustomItemType(
    env: RuntimeEnvironment,
    itemId: string,
    userId: string
  ): boolean {
    this.markEntityPermanentlyDeleted(itemId);
    this.markEntityPermanentlyDeleted(`ITEM_TYPE_${itemId}`);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    let removed: CustomCylinderItemType | undefined;

    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.custom_cylinder_item_types) {
        if (!removed) removed = s.custom_cylinder_item_types.find(i => i.id === itemId);
        s.custom_cylinder_item_types = s.custom_cylinder_item_types.filter(i => i.id !== itemId);
        this.saveState(targetEnv, s);
      }
    }

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.postMessage({ type: 'CUSTOM_ITEM_TYPE_DELETED', itemId });
        bc.close();
      }
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:custom_item_types_updated', { detail: { itemId } }));
      }
    } catch {}

    if (removed) {
      this.recordLocalChange(
        env,
        userId,
        'SETTING',
        'DELETE',
        `ITEM_TYPE_${itemId}`,
        removed,
        `حذف نوع قلم وارده: ${removed.name}`,
        { item_name: removed.name }
      );
    }

    return true;
  }

  // Tank & Cylinder Catalog and Valve/Nut Mapping Management (منحصراً مهندس موسی عمویی)
  static getCylinderTankMappings(env: RuntimeEnvironment): CylinderTankMapping[] {
    const state = this.getState(env);
    this.ensureCylinderTankMappingsLoaded(state);
    return state.cylinder_tank_mappings;
  }

  static saveCylinderTankMapping(
    env: RuntimeEnvironment,
    mapping: CylinderTankMapping,
    updatedByUsername = 'amouei'
  ): CylinderTankMapping {
    const state = this.getState(env);
    if (!state.cylinder_tank_mappings) {
      state.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS));
    }

    const updatedMapping: CylinderTankMapping = {
      ...mapping,
      updated_at: new Date().toISOString(),
      updated_by: updatedByUsername
    };

    // If this item was previously marked as deleted, remove it from the deleted set
    if (state.deleted_cylinder_mapping_ids) {
      state.deleted_cylinder_mapping_ids = state.deleted_cylinder_mapping_ids.filter(
        id => id !== mapping.id && id !== mapping.name
      );
    }

    const idx = state.cylinder_tank_mappings.findIndex(
      m => m.id === mapping.id || m.name.trim() === mapping.name.trim()
    );

    let oldName = '';
    if (idx !== -1) {
      oldName = state.cylinder_tank_mappings[idx].name;
      state.cylinder_tank_mappings[idx] = updatedMapping;
    } else {
      state.cylinder_tank_mappings.push(updatedMapping);
    }

    // When a cylinder is renamed, migrate existing kardex records to the new cylinder name
    if (oldName && oldName !== mapping.name) {
      if (state.gas_kardex_entries) {
        state.gas_kardex_entries.forEach(e => {
          if (e.cylinder_type === oldName) {
            e.cylinder_type = mapping.name;
          }
        });
      }
      if (state.gas_production_kardex_entries) {
        state.gas_production_kardex_entries.forEach(e => {
          if (e.cylinder_type === oldName) {
            e.cylinder_type = mapping.name as any;
          }
        });
      }
      if (state.cylinder_valve_inspections) {
        state.cylinder_valve_inspections.forEach(i => {
          if (i.item_name === oldName) {
            i.item_name = mapping.name;
          }
        });
      }
    }

    this.saveState(env, state);

    // Sync across in-memory environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState) {
          if (!otherState.cylinder_tank_mappings) {
            otherState.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS));
          }
          if (otherState.deleted_cylinder_mapping_ids) {
            otherState.deleted_cylinder_mapping_ids = otherState.deleted_cylinder_mapping_ids.filter(
              id => id !== mapping.id && id !== mapping.name
            );
          }
          const oIdx = otherState.cylinder_tank_mappings.findIndex(
            m => m.id === mapping.id || m.name.trim() === mapping.name.trim()
          );
          if (oIdx !== -1) {
            otherState.cylinder_tank_mappings[oIdx] = updatedMapping;
          } else {
            otherState.cylinder_tank_mappings.push(updatedMapping);
          }

          if (oldName && oldName !== mapping.name) {
            if (otherState.gas_kardex_entries) {
              otherState.gas_kardex_entries.forEach(e => {
                if (e.cylinder_type === oldName) e.cylinder_type = mapping.name;
              });
            }
            if (otherState.gas_production_kardex_entries) {
              otherState.gas_production_kardex_entries.forEach(e => {
                if (e.cylinder_type === oldName) e.cylinder_type = mapping.name as any;
              });
            }
            if (otherState.cylinder_valve_inspections) {
              otherState.cylinder_valve_inspections.forEach(i => {
                if (i.item_name === oldName) i.item_name = mapping.name;
              });
            }
          }
          this.saveState(otherEnv, otherState);
        }
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:cylinder_mappings_updated', {
          detail: { action: idx !== -1 ? 'UPDATE' : 'CREATE', mapping: updatedMapping, oldName }
        }));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('mgas_kardex_sync_channel');
          bc.postMessage({ type: 'CYLINDER_MAPPINGS_UPDATED', action: idx !== -1 ? 'UPDATE' : 'CREATE', mapping: updatedMapping, oldName });
          bc.close();
        }
      }
    } catch {}

    this.recordLocalChange(
      env,
      'USR-001',
      'SETTING',
      idx !== -1 ? 'UPDATE' : 'CREATE',
      `CYL_MAP_${mapping.id}`,
      updatedMapping,
      `بروزرسانی تناظر شیر و مهره مخزن/سیلندر: ${mapping.name}`,
      { mapping_id: mapping.id, name: mapping.name, oldName }
    );

    return updatedMapping;
  }

  static deleteCylinderTankMapping(
    env: RuntimeEnvironment,
    mappingId: string,
    deletedByUsername = 'amouei'
  ): boolean {
    const state = this.getState(env);
    if (!state.cylinder_tank_mappings) {
      state.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS));
    }

    const target = state.cylinder_tank_mappings.find(m => m.id === mappingId || m.name === mappingId);
    if (!target) return false;

    if (!state.deleted_cylinder_mapping_ids) {
      state.deleted_cylinder_mapping_ids = [];
    }
    if (!state.deleted_cylinder_mapping_ids.includes(target.id)) {
      state.deleted_cylinder_mapping_ids.push(target.id);
    }
    if (!state.deleted_cylinder_mapping_ids.includes(target.name)) {
      state.deleted_cylinder_mapping_ids.push(target.name);
    }

    state.cylinder_tank_mappings = state.cylinder_tank_mappings.filter(
      m => m.id !== target.id && m.name !== target.name
    );

    // Completely remove/soft-delete any active entries for this deleted cylinder from both Repair and Production Kardex
    if (state.gas_kardex_entries) {
      state.gas_kardex_entries.forEach(e => {
        if (e.cylinder_type === target.name || e.cylinder_type === target.id) {
          e.is_deleted = true;
          e.deleted_at = new Date().toISOString();
          e.deleted_by = deletedByUsername;
        }
      });
    }
    if (state.gas_production_kardex_entries) {
      state.gas_production_kardex_entries.forEach(e => {
        if (e.cylinder_type === target.name || e.cylinder_type === target.id) {
          e.is_deleted = true;
          e.deleted_at = new Date().toISOString();
          e.deleted_by = deletedByUsername;
        }
      });
    }

    this.saveState(env, state);

    // Sync across in-memory environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState) {
          if (!otherState.deleted_cylinder_mapping_ids) {
            otherState.deleted_cylinder_mapping_ids = [];
          }
          if (!otherState.deleted_cylinder_mapping_ids.includes(target.id)) {
            otherState.deleted_cylinder_mapping_ids.push(target.id);
          }
          if (!otherState.deleted_cylinder_mapping_ids.includes(target.name)) {
            otherState.deleted_cylinder_mapping_ids.push(target.name);
          }
          if (otherState.cylinder_tank_mappings) {
            otherState.cylinder_tank_mappings = otherState.cylinder_tank_mappings.filter(
              m => m.id !== target.id && m.name !== target.name
            );
          }
          if (otherState.gas_kardex_entries) {
            otherState.gas_kardex_entries.forEach(e => {
              if (e.cylinder_type === target.name || e.cylinder_type === target.id) {
                e.is_deleted = true;
                e.deleted_at = new Date().toISOString();
                e.deleted_by = deletedByUsername;
              }
            });
          }
          if (otherState.gas_production_kardex_entries) {
            otherState.gas_production_kardex_entries.forEach(e => {
              if (e.cylinder_type === target.name || e.cylinder_type === target.id) {
                e.is_deleted = true;
                e.deleted_at = new Date().toISOString();
                e.deleted_by = deletedByUsername;
              }
            });
          }
          this.saveState(otherEnv, otherState);
        }
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:cylinder_mappings_updated', {
          detail: { action: 'DELETE', id: target.id, name: target.name }
        }));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('mgas_kardex_sync_channel');
          bc.postMessage({ type: 'CYLINDER_MAPPINGS_UPDATED', action: 'DELETE', id: target.id, name: target.name });
          bc.close();
        }
      }
    } catch {}

    this.recordLocalChange(
      env,
      'USR-001',
      'SETTING',
      'DELETE',
      `CYL_MAP_${target.id}`,
      target,
      `حذف مخزن/سیلندر از کاتالوگ و کاردکس‌های تعمیر و تولید: ${target.name}`,
      { mapping_id: target.id, name: target.name }
    );

    return true;
  }


  static saveAllCylinderTankMappings(
    env: RuntimeEnvironment,
    mappings: CylinderTankMapping[],
    updatedByUsername = 'amouei'
  ): void {
    const state = this.getState(env);
    state.cylinder_tank_mappings = mappings.map(m => ({
      ...m,
      updated_at: new Date().toISOString(),
      updated_by: updatedByUsername
    }));
    this.saveState(env, state);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState) {
          otherState.cylinder_tank_mappings = JSON.parse(JSON.stringify(state.cylinder_tank_mappings));
          this.saveState(otherEnv, otherState);
        }
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:cylinder_mappings_updated', { detail: state.cylinder_tank_mappings }));
      }
    } catch {}
  }

  static resetCylinderTankMappings(env: RuntimeEnvironment): CylinderTankMapping[] {
    const state = this.getState(env);
    state.deleted_cylinder_mapping_ids = [];
    state.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS));
    this.saveState(env, state);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState) {
          otherState.deleted_cylinder_mapping_ids = [];
          otherState.cylinder_tank_mappings = JSON.parse(JSON.stringify(DEFAULT_CYLINDER_TANK_MAPPINGS));
          this.saveState(otherEnv, otherState);
        }
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:cylinder_mappings_updated', { detail: DEFAULT_CYLINDER_TANK_MAPPINGS }));
      }
    } catch {}

    return state.cylinder_tank_mappings;
  }

  // User & Security Management
  static getUsers(env: RuntimeEnvironment): User[] {
    const state = this.getState(env);
    return state.users || SEED_USERS;
  }

  static getUserById(env: RuntimeEnvironment, userId: string): User | undefined {
    const state = this.getState(env);
    return (state.users || SEED_USERS).find(u => u.user_id === userId);
  }

  /**
   * Enforce that ONLY Mr. Eng. Amouei (Management / Admin) can edit user credentials and system IDs
   */
  static isManagerAmoueiAuthorized(actorUser?: User | null): boolean {
    if (!actorUser) return false;
    const username = (actorUser.username || '').toLowerCase();
    const isAmouei =
      username === 'amouei' ||
      actorUser.user_id === 'USR-001' ||
      actorUser.role === 'ADMIN' ||
      (typeof actorUser.full_name === 'string' && actorUser.full_name.includes('عمویی')) ||
      (typeof actorUser.role_title === 'string' && actorUser.role_title.includes('مدیریت'));
    return Boolean(isAmouei);
  }

  private static karamiSessionStartedAt: string = new Date().toISOString();

  /**
   * 1-hour editing session restriction is disabled for all users.
   */
  static getKaramiSessionRemaining(_maxHours: number = 0): {
    remainingMs: number;
    remainingMinutes: number;
    remainingSeconds: number;
    isExpired: boolean;
    startedAt: string;
  } {
    const startedAt = this.karamiSessionStartedAt || new Date().toISOString();
    return {
      remainingMs: Number.MAX_SAFE_INTEGER,
      remainingMinutes: 999999,
      remainingSeconds: 0,
      isExpired: false,
      startedAt
    };
  }

  /**
   * Renewal helper retained as benign no-op for compatibility.
   */
  static renewKaramiSession(): void {
    const nowIso = new Date().toISOString();
    this.karamiSessionStartedAt = nowIso;
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('mgas:karami_session_renewed', { detail: { renewedAt: nowIso } }));
      } catch (e) {
        console.warn('Could not dispatch renewed event:', e);
      }
    }
  }

  /**
   * Check document edit permission: 1-hour time restriction is disabled for ALL users.
   * Any authenticated user has unrestricted edit permission without session timeout.
   */
  static checkDocumentEditPermission(
    _env: RuntimeEnvironment,
    actorUser: User | null,
    _documentCreatedAt?: string,
    _sessionAuthenticatedAt?: string
  ): DocumentEditPermissionResult {
    if (!actorUser) {
      return {
        allowed: false,
        reason: 'جهت انجام عملیات ویرایش، ورود به حساب کاربری معتبر الزامی است.',
        isInternalManager: false,
        restrictionType: 'ROLE_DENIED'
      };
    }

    return {
      allowed: true,
      isInternalManager: false,
      maxHoursAllowed: 0
    };
  }

  /**
   * Update an existing Gas Kardex entry with audit trail and 1-hour policy validation.
   */
  static updateKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    updatedData: Partial<GasKardexEntry>,
    actorUser: User | null
  ): { success: boolean; entry?: GasKardexEntry; error?: string } {
    const state = this.getState(env);
    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];

    const existing = state.gas_kardex_entries.find(e => e.entry_id === entryId);
    if (!existing) {
      return { success: false, error: 'سند کاردکس مورد نظر در پایگاه داده یافت نشد.' };
    }

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    const sanitizedData = { ...updatedData };
    if (sanitizedData.scrap_balance !== undefined) {
      sanitizedData.scrap_balance = Math.max(0, Number(sanitizedData.scrap_balance) || 0);
    }

    const fullEntry: GasKardexEntry = {
      ...existing,
      ...sanitizedData,
      entry_id: existing.entry_id,
      customer_id: sanitizedData.customer_id || existing.customer_id,
      customer_name: sanitizedData.customer_name || existing.customer_name,
      updated_at: new Date().toISOString()
    };

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'GAS_KARDEX',
        'UPDATE',
        entryId,
        fullEntry,
        `ویرایش سند ردیف کاردکس گاز شماره برگه ${fullEntry.transfer_sheet_number || fullEntry.entry_id}`,
        { entry_id: entryId, sheet_number: fullEntry.transfer_sheet_number }
      );
      return { success: true, entry: fullEntry };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در ویرایش سند کاردکس' };
    }
  }

  /**
   * Move Kardex entry to Trash (Soft Delete with Recovery capability)
   */
  static moveKardexEntryToTrash(
    env: RuntimeEnvironment,
    entryId: string,
    actorUser: User | null,
    reason?: string
  ): { success: boolean; entry?: GasKardexEntry; error?: string } {
    const state = this.getState(env);
    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];

    const existingIndex = state.gas_kardex_entries.findIndex(e => e.entry_id === entryId);
    if (existingIndex === -1) {
      return { success: false, error: 'سند کاردکس مورد نظر در پایگاه داده یافت نشد.' };
    }
    const existing = state.gas_kardex_entries[existingIndex];

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    const trashedEntry: GasKardexEntry = {
      ...existing,
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: actorUser?.username || actorUser?.full_name || 'کاربر سیستم',
      delete_reason: reason || 'انتقال به سطل آشغال توسط کاربر',
      updated_at: new Date().toISOString()
    };

    // Immediately reflect the soft deletion in memory state
    state.gas_kardex_entries[existingIndex] = trashedEntry;

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'GAS_KARDEX',
        'UPDATE',
        entryId,
        trashedEntry,
        `انتقال سند کاردکس گاز شماره برگه ${trashedEntry.transfer_sheet_number || trashedEntry.entry_id} به سطل آشغال`,
        { entry_id: entryId, sheet_number: trashedEntry.transfer_sheet_number, reason }
      );

      // Recalculate remaining active entries for this customer partitioned by cylinder type
      const custId = existing.customer_id;
      LocalStorageManager.recalculateCustomerKardex(state, custId);
      this.saveState(env, state);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:kardex_trash_updated', { detail: trashedEntry }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: trashedEntry }));
      }
      return { success: true, entry: trashedEntry };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در انتقال سند کاردکس به سطل آشغال' };
    }
  }

  /**
   * Restore Kardex entry from Trash (Recovery)
   */
  static restoreKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    actorUser: User | null
  ): { success: boolean; entry?: GasKardexEntry; error?: string } {
    const state = this.getState(env);
    if (!state.gas_kardex_entries) state.gas_kardex_entries = [];

    const existingIndex = state.gas_kardex_entries.findIndex(e => e.entry_id === entryId);
    if (existingIndex === -1) {
      return { success: false, error: 'سند کاردکس مورد نظر در سطل آشغال یافت نشد.' };
    }
    const existing = state.gas_kardex_entries[existingIndex];

    const restoredEntry: GasKardexEntry = {
      ...existing,
      is_deleted: false,
      deleted_at: undefined,
      deleted_by: undefined,
      delete_reason: undefined,
      updated_at: new Date().toISOString()
    };

    // Immediately reflect the recovery in memory state
    state.gas_kardex_entries[existingIndex] = restoredEntry;

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'GAS_KARDEX',
        'UPDATE',
        entryId,
        restoredEntry,
        `بازیابی و ریکاوری سند کاردکس گاز شماره برگه ${restoredEntry.transfer_sheet_number || restoredEntry.entry_id} از سطل آشغال`,
        { entry_id: entryId, sheet_number: restoredEntry.transfer_sheet_number }
      );

      // Recalculate balances including the restored entry partitioned by cylinder type
      const custId = existing.customer_id;
      LocalStorageManager.recalculateCustomerKardex(state, custId);
      this.saveState(env, state);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:kardex_trash_updated', { detail: restoredEntry }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: restoredEntry }));
      }
      return { success: true, entry: restoredEntry };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در بازیابی و ریکاوری سند کاردکس' };
    }
  }

  /**
   * Permanently delete a single entry from trash (Never resurrects)
   */
  static permanentDeleteKardexEntry(
    env: RuntimeEnvironment,
    entryId: string,
    actorUser: User | null
  ): { success: boolean; error?: string } {
    // 1. Mark permanently deleted in tombstone registry
    this.markEntityPermanentlyDeleted(entryId);

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    let deletedItem: GasKardexEntry | undefined;

    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.gas_kardex_entries) {
        const idx = s.gas_kardex_entries.findIndex(e => e.entry_id === entryId);
        if (idx >= 0) {
          if (!deletedItem) deletedItem = s.gas_kardex_entries[idx];
          s.gas_kardex_entries.splice(idx, 1);
          const custId = deletedItem?.customer_id;
          if (custId) {
            LocalStorageManager.recalculateCustomerKardex(s, custId);
          }
          this.saveState(targetEnv, s);
        }
      }
    }

    if (!deletedItem) {
      return { success: false, error: 'سند کاردکس مورد نظر یافت نشد.' };
    }

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'GAS_KARDEX',
        'DELETE',
        entryId,
        null,
        `حذف دائمی سند کاردکس گاز شماره برگه ${deletedItem.transfer_sheet_number || entryId} از سطل آشغال`,
        { entry_id: entryId }
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mgas:kardex_trash_updated', { detail: { entry_id: entryId, permanent: true } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
        window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: { entry_id: entryId, deleted: true } }));
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در حذف دائمی سند' };
    }
  }

  /**
   * Empty all items in trash (Permanently deletes and never resurrects)
   */
  static emptyKardexTrash(
    env: RuntimeEnvironment,
    customerId?: string,
    actorUser?: User | null
  ): { success: boolean; count: number; error?: string } {
    if (actorUser && (actorUser.role === 'WAREHOUSE_KEEPER' || actorUser.username === 'hajivand' || actorUser.username === 'gholizadeh' || actorUser.user_id === 'USR-003')) {
      return { success: false, count: 0, error: 'خطای عدم دسترسی: انباردار مجاز به تغییر یا تخلیه کاردکس نمی‌باشد.' };
    }
    const state = this.getState(env);
    if (!state.gas_kardex_entries) return { success: true, count: 0 };

    const toRemove = state.gas_kardex_entries.filter(e => {
      if (!e.is_deleted) return false;
      if (customerId && e.customer_id !== customerId) return false;
      return true;
    });

    if (toRemove.length === 0) return { success: true, count: 0 };

    // 1. Mark each entry permanently deleted in tombstone registry
    toRemove.forEach(item => {
      this.markEntityPermanentlyDeleted(item.entry_id);
    });

    // 2. Remove from ALL 3 local environments and recalculate balances
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    const affectedCustomerIds = Array.from(new Set(toRemove.map(r => r.customer_id)));

    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.gas_kardex_entries) {
        s.gas_kardex_entries = s.gas_kardex_entries.filter(e => {
          if (!e.is_deleted) return true;
          if (customerId && e.customer_id !== customerId) return true;
          return false;
        });
        affectedCustomerIds.forEach(cId => {
          LocalStorageManager.recalculateCustomerKardex(s, cId);
        });
        this.saveState(targetEnv, s);
      }
    }

    // 3. Record individual DELETE sync events so server and other nodes know each entry was purged
    for (const item of toRemove) {
      try {
        this.recordLocalChange(
          env,
          actorUser?.user_id || 'USR-001',
          'GAS_KARDEX',
          'DELETE',
          item.entry_id,
          null,
          `حذف دائمی سند کاردکس گاز شماره برگه ${item.transfer_sheet_number || item.entry_id} در تخلیه کامل سطل آشغال`,
          { entry_id: item.entry_id }
        );
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mgas:kardex_trash_updated', { detail: { count: toRemove.length } }));
      window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: { count: toRemove.length, emptied: true } }));
    }
    return { success: true, count: toRemove.length };
  }

  /**
   * Update an existing Invoice with audit trail and 1-hour policy validation.
   */
  static updateInvoice(
    env: RuntimeEnvironment,
    invoiceId: string,
    updatedData: Partial<Invoice>,
    actorUser: User | null
  ): { success: boolean; invoice?: Invoice; error?: string } {
    const state = this.getState(env);
    if (!state.invoices) state.invoices = [];

    const existing = state.invoices.find(i => i.invoice_id === invoiceId);
    if (!existing) {
      return { success: false, error: 'فاکتور مورد نظر یافت نشد.' };
    }

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    const fullInvoice: Invoice = {
      ...existing,
      ...updatedData,
      invoice_id: existing.invoice_id,
      updated_at: new Date().toISOString()
    };

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'INVOICE',
        'UPDATE',
        invoiceId,
        fullInvoice,
        `ویرایش سند فاکتور شماره ${fullInvoice.invoice_number}`,
        { invoice_number: fullInvoice.invoice_number, status: fullInvoice.status }
      );
      return { success: true, invoice: fullInvoice };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در ویرایش سند فاکتور' };
    }
  }

  /**
   * Delete an existing Invoice with audit trail and 1-hour policy validation.
   */
  static deleteInvoice(
    env: RuntimeEnvironment,
    invoiceId: string,
    actorUser: User | null
  ): { success: boolean; error?: string } {
    const state = this.getState(env);
    if (!state.invoices) state.invoices = [];
    const existing = state.invoices.find(i => i.invoice_id === invoiceId);
    if (!existing) {
      return { success: false, error: 'فاکتور مورد نظر یافت نشد.' };
    }

    const check = this.checkDocumentEditPermission(env, actorUser, existing.created_at);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    try {
      this.recordLocalChange(
        env,
        actorUser?.user_id || 'USR-001',
        'INVOICE',
        'DELETE',
        invoiceId,
        { invoice_id: invoiceId },
        `حذف فاکتور شماره ${existing.invoice_number}`,
        { invoice_number: existing.invoice_number }
      );
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'خطا در حذف فاکتور' };
    }
  }

  /**
   * Update credentials & system ID for a user.
   * Strictly gated: ONLY Manager Mr. Eng. Amouei can perform this action!
   */
  static updateUserCredentials(
    env: RuntimeEnvironment,
    actorUser: User | null,
    targetUserId: string,
    params: {
      username?: string;
      password_hash?: string;
      password_salt?: string;
      system_id?: string;
      system_name?: string;
      full_name?: string;
      role_title?: string;
    }
  ): { success: boolean; error?: string; user?: User } {
    if (!this.isManagerAmoueiAuthorized(actorUser)) {
      const state = this.getState(env);
      state.audit_logs.unshift({
        audit_id: `AUD-SEC-VIOLATION-${Date.now()}`,
        user_id: actorUser?.user_id || 'UNAUTHORIZED',
        device_id: state.deviceId,
        action: 'UNAUTHORIZED_CREDENTIALS_EDIT_BLOCKED',
        entity_type: 'USER',
        entity_id: targetUserId,
        timestamp: new Date().toISOString(),
        metadata: {
          attempted_by: actorUser?.username || 'anonymous',
          reason: 'Only Manager Mr. Eng. Amouei can edit credentials and system IDs'
        }
      });
      this.saveState(env, state);
      return {
        success: false,
        error: 'خطای عدم دسترسی: تنها کاربر آقای مهندس عمویی (مدیریت ارشد) مجاز به ویرایش نام کاربران و پسوردها می‌باشد.'
      };
    }

    const state = this.getState(env);
    const users = state.users || [...SEED_USERS];
    const idx = users.findIndex(u => u.user_id === targetUserId);
    if (idx === -1) {
      return { success: false, error: 'کاربر مورد نظر در پایگاه داده یافت نشد.' };
    }

    const target = users[idx];
    const oldUsername = target.username;

    let targetUsername = target.username;
    if (params.username && params.username.trim()) {
      const cleanUsername = params.username.trim().toLowerCase();
      if (cleanUsername.length < 2) {
        return { success: false, error: 'نام کاربری باید حداقل دارای ۲ نویسه باشد.' };
      }
      const isTaken = users.some(u => u.user_id !== targetUserId && u.username.toLowerCase() === cleanUsername);
      if (isTaken) {
        return { success: false, error: `نام کاربری «${cleanUsername}» قبلاً توسط کاربر دیگری ثبت شده است.` };
      }
      targetUsername = cleanUsername;
    }

    const now = new Date().toISOString();
    const updatedUser: User = {
      ...target,
      username: targetUsername,
      is_password_changed: true,
      password_updated_at: (params.password_hash && params.password_salt) ? now : target.password_updated_at,
      updated_at: now,
      password: undefined // NEVER store plain text
    };

    if (params.password_hash && params.password_salt) {
      updatedUser.password_hash = params.password_hash;
      updatedUser.password_salt = params.password_salt;
    }
    if (params.system_id) {
      updatedUser.system_id = params.system_id.trim();
      updatedUser.allowed_device_id = params.system_id.trim();
    }
    if (params.system_name) {
      updatedUser.system_name = params.system_name.trim();
    }
    if (params.full_name && params.full_name.trim()) {
      updatedUser.full_name = params.full_name.trim();
    }
    if (params.role_title && params.role_title.trim()) {
      updatedUser.role_title = params.role_title.trim();
    }

    users[idx] = updatedUser;
    state.users = users;

    // Reset failed login attempts & account lock for both old and new username / user_id
    if (state.security_policy?.failedAttempts) {
      delete state.security_policy.failedAttempts[targetUserId];
      delete state.security_policy.failedAttempts[oldUsername];
      delete state.security_policy.failedAttempts[targetUsername];
    }
    if (state.security_policy?.lockedUntil) {
      delete state.security_policy.lockedUntil[targetUserId];
      delete state.security_policy.lockedUntil[oldUsername];
      delete state.security_policy.lockedUntil[targetUsername];
    }

    // Immutable audit log
    state.audit_logs.unshift({
      audit_id: `AUD-SEC-CRED-${Date.now()}`,
      user_id: actorUser!.user_id,
      device_id: state.deviceId,
      action: 'UPDATE_CREDENTIALS_AND_SYSTEM_ID',
      entity_type: 'USER',
      entity_id: targetUserId,
      timestamp: new Date().toISOString(),
      metadata: {
        old_username: oldUsername,
        updated_username: updatedUser.username,
        updated_full_name: updatedUser.full_name,
        new_system_id: updatedUser.system_id,
        password_updated: !!params.password_hash,
        authorized_by: 'مدیر عامل آقای مهندس عمویی'
      }
    });

    this.saveState(env, state);

    // Record authoritative SyncEvent so change is immediately propagated to Cloudflare D1 and all clients
    try {
      this.recordLocalChange(
        env,
        actorUser!.user_id,
        'USER',
        'UPDATE',
        targetUserId,
        updatedUser,
        `به‌روزرسانی اطلاعات هویتی (@${updatedUser.username}) و کلمه عبور کاربر ${updatedUser.full_name} توسط مدیریت ارشد`,
        {
          target_username: updatedUser.username,
          old_username: oldUsername,
          target_user_id: targetUserId,
          system_id: updatedUser.system_id,
          has_new_password: !!params.password_hash
        }
      );
    } catch (syncErr) {
      console.warn('[LocalStorageManager] User update sync recording notice:', syncErr);
    }

    // Synchronize user update across ALL 3 database environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const targetEnv of allEnvs) {
      if (targetEnv !== env) {
        try {
          const otherState = this.getState(targetEnv);
          if (otherState && otherState.users) {
            const oIdx = otherState.users.findIndex(u => u.user_id === targetUserId || u.username.toLowerCase() === oldUsername.toLowerCase());
            if (oIdx >= 0) {
              otherState.users[oIdx] = { ...updatedUser };
            } else {
              otherState.users.push({ ...updatedUser });
            }
            if (otherState.security_policy?.failedAttempts) {
              delete otherState.security_policy.failedAttempts[targetUserId];
              delete otherState.security_policy.failedAttempts[oldUsername];
              delete otherState.security_policy.failedAttempts[targetUsername];
            }
            if (otherState.security_policy?.lockedUntil) {
              delete otherState.security_policy.lockedUntil[targetUserId];
              delete otherState.security_policy.lockedUntil[oldUsername];
              delete otherState.security_policy.lockedUntil[targetUsername];
            }
            this.saveState(targetEnv, otherState);
          }
        } catch {}
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('mgas:users_updated', { detail: { targetUserId, updatedUser } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      } catch {}
    }

    return { success: true, user: updatedUser };
  }

  /**
   * Save or Update a User and synchronize immediately across all client databases
   */
  static saveOrUpdateUser(
    env: RuntimeEnvironment,
    actorUser: User | null,
    targetUser: User,
    isNew: boolean = false
  ): { success: boolean; user?: User; error?: string } {
    if (!this.isManagerAmoueiAuthorized(actorUser)) {
      return {
        success: false,
        error: 'خطای عدم دسترسی: تنها کاربر آقای مهندس عمویی (مدیریت ارشد) مجاز به تعریف یا ویرایش کاربران می‌باشد.'
      };
    }

    const state = this.getState(env);
    if (!state.users) state.users = [];

    const existingIdx = state.users.findIndex(
      u => u.user_id === targetUser.user_id || u.username.toLowerCase() === targetUser.username.toLowerCase()
    );

    const sanitizedUser: User = {
      ...targetUser,
      username: targetUser.username.trim().toLowerCase(),
      full_name: targetUser.full_name.trim(),
      password: undefined
    };

    if (existingIdx >= 0) {
      state.users[existingIdx] = sanitizedUser;
    } else {
      state.users.push(sanitizedUser);
    }

    this.saveState(env, state);

    // Sync to all local environments
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState && otherState.users) {
          const oIdx = otherState.users.findIndex(
            u => u.user_id === sanitizedUser.user_id || u.username.toLowerCase() === sanitizedUser.username.toLowerCase()
          );
          if (oIdx >= 0) {
            otherState.users[oIdx] = { ...sanitizedUser };
          } else {
            otherState.users.push({ ...sanitizedUser });
          }
          this.saveState(otherEnv, otherState);
        }
      }
    }

    // Record SyncEvent for propagation to Cloudflare D1 and other stations
    try {
      this.recordLocalChange(
        env,
        actorUser!.user_id,
        'USER',
        isNew ? 'CREATE' : 'UPDATE',
        sanitizedUser.user_id,
        sanitizedUser,
        `${isNew ? 'ثبت کاربر جدید' : 'ویرایش مشخصات کاربر'} ${sanitizedUser.full_name} (@${sanitizedUser.username})`,
        { username: sanitizedUser.username, role: sanitizedUser.role, system_id: sanitizedUser.system_id }
      );
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('mgas:users_updated', { detail: { targetUserId: sanitizedUser.user_id, updatedUser: sanitizedUser } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      } catch {}
    }

    return { success: true, user: sanitizedUser };
  }

  /**
   * Delete a User and broadcast deletion across all client databases
   */
  static deleteUser(
    env: RuntimeEnvironment,
    actorUser: User | null,
    targetUserId: string
  ): { success: boolean; error?: string } {
    if (!this.isManagerAmoueiAuthorized(actorUser)) {
      return {
        success: false,
        error: 'خطای عدم دسترسی: تنها کاربر آقای مهندس عمویی مجاز به حذف کاربران می‌باشد.'
      };
    }

    // Prevent deleting primary admin Amouei
    if (targetUserId === 'USR-001') {
      return {
        success: false,
        error: 'امکان حذف کاربر اصلی مدیریت عامل (مهندس موسی عمویی) وجود ندارد.'
      };
    }

    const state = this.getState(env);
    const existing = state.users.find(u => u.user_id === targetUserId);
    if (!existing) {
      return { success: false, error: 'کاربر مورد نظر یافت نشد.' };
    }

    // Mark permanently deleted in tombstone
    this.markEntityPermanentlyDeleted(targetUserId);

    // Delete from all local database states
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const targetEnv of allEnvs) {
      const s = this.getState(targetEnv);
      if (s.users) {
        s.users = s.users.filter(u => u.user_id !== targetUserId && u.username.toLowerCase() !== existing.username.toLowerCase());
        this.saveState(targetEnv, s);
      }
    }

    // Record SyncEvent for Cloudflare and client network
    try {
      this.recordLocalChange(
        env,
        actorUser!.user_id,
        'USER',
        'DELETE',
        targetUserId,
        { user_id: targetUserId, username: existing.username },
        `حذف کاربر ${existing.full_name} (@${existing.username}) توسط مدیریت ارشد`,
        { user_id: targetUserId, username: existing.username }
      );
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('mgas:users_updated', { detail: { targetUserId, deleted: true } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      } catch {}
    }

    return { success: true };
  }

  /**
   * Reconcile users received from Cloudflare D1 into all local client database states
   * Guarantees all clients have up-to-date user credentials offline.
   */
  static syncUsersFromCloud(env: RuntimeEnvironment, cloudUsers: User[]): number {
    if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return 0;

    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    let updatedCount = 0;

    for (const targetEnv of allEnvs) {
      const state = this.getState(targetEnv);
      if (!state.users) state.users = [];

      for (const cu of cloudUsers) {
        if (!cu || !cu.user_id) continue;
        const cleanUser: User = {
          ...cu,
          username: cu.username.toLowerCase().trim(),
          password: undefined
        };

        const existingIdx = state.users.findIndex(
          u => u.user_id === cleanUser.user_id || u.username.toLowerCase() === cleanUser.username
        );

        if (existingIdx >= 0) {
          const current = state.users[existingIdx];

          // Only preserve local password if there is a PENDING local USER change in sync_queue
          let targetHash = cleanUser.password_hash;
          let targetSalt = cleanUser.password_salt;
          let targetChanged = Boolean(cleanUser.is_password_changed);
          let targetPasswordUpdatedAt = cleanUser.password_updated_at;

          const hasPendingLocalUserChange = (state.sync_queue || []).some(
            q => (q.status === 'PENDING' || q.status === 'UPLOADING') &&
              q.event?.entity_type === 'USER' &&
              (q.event?.entity_id === cleanUser.user_id ||
               (q.event?.payload as any)?.username?.toLowerCase?.() === cleanUser.username)
          );

          if (hasPendingLocalUserChange && current.password_hash && current.password_salt) {
            const currentTime = (current.password_updated_at || current.updated_at)
              ? new Date(current.password_updated_at || current.updated_at!).getTime()
              : 0;
            const cloudTime = (cleanUser.password_updated_at || cleanUser.updated_at)
              ? new Date(cleanUser.password_updated_at || cleanUser.updated_at!).getTime()
              : 0;
            if (currentTime >= cloudTime || !cleanUser.password_hash) {
              targetHash = current.password_hash;
              targetSalt = current.password_salt;
              targetChanged = true;
              targetPasswordUpdatedAt = current.password_updated_at;
            }
          } else if (!cleanUser.password_hash || !cleanUser.password_salt) {
            targetHash = current.password_hash;
            targetSalt = current.password_salt;
            targetChanged = Boolean(current.is_password_changed);
            targetPasswordUpdatedAt = current.password_updated_at;
          }

          // Check if any field changed
          const isChanged =
            current.username !== cleanUser.username ||
            current.full_name !== cleanUser.full_name ||
            current.password_hash !== targetHash ||
            current.password_salt !== targetSalt ||
            Boolean(current.is_password_changed) !== Boolean(targetChanged) ||
            current.password_updated_at !== targetPasswordUpdatedAt ||
            current.role !== cleanUser.role ||
            current.role_title !== cleanUser.role_title ||
            current.system_id !== cleanUser.system_id ||
            current.system_name !== cleanUser.system_name;

          if (isChanged) {
            state.users[existingIdx] = {
              ...current,
              ...cleanUser,
              password_hash: targetHash,
              password_salt: targetSalt,
              is_password_changed: targetChanged,
              password_updated_at: targetPasswordUpdatedAt,
              password: undefined
            };
            if (targetEnv === env) updatedCount++;
          }
        } else {
          state.users.push(cleanUser);
          if (targetEnv === env) updatedCount++;
        }
      }

      this.saveState(targetEnv, state);
    }

    if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop && window.desktopAPI?.execute) {
      const latestUsers = this.getState(env).users || [];
      for (const u of latestUsers) {
        window.desktopAPI.execute(
          `INSERT OR REPLACE INTO users (
            user_id, username, password_hash, password_salt, is_password_changed,
            full_name, role, role_title, allowed_device_id, system_id, system_name,
            is_active, updated_at, password_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.user_id,
            u.username,
            u.password_hash || '',
            u.password_salt || '',
            u.is_password_changed ? 1 : 0,
            u.full_name || '',
            u.role || 'INTERNAL_MANAGER',
            u.role_title || '',
            u.allowed_device_id || u.system_id || 'OFFICE-PC-001',
            u.system_id || u.allowed_device_id || 'OFFICE-PC-001',
            u.system_name || '',
            (u as any).is_active !== false ? 1 : 0,
            u.updated_at || new Date().toISOString(),
            u.password_updated_at || null
          ]
        ).catch(() => {});
      }
    }

    if (updatedCount > 0 && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('mgas:users_updated', { detail: { count: updatedCount } }));
        window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env } }));
      } catch {}
    }

    return updatedCount;
  }

  static updateUserPassword(
    env: RuntimeEnvironment,
    userId: string,
    newPasswordHash: string,
    saltHex: string,
    plainPasswordForAudit?: string
  ): boolean {
    const state = this.getState(env);
    const users = state.users || [...SEED_USERS];
    const idx = users.findIndex(u => u.user_id === userId);
    if (idx === -1) return false;

    const now = new Date().toISOString();
    const updated = {
      ...users[idx],
      password_hash: newPasswordHash,
      password_salt: saltHex,
      is_password_changed: true,
      password_updated_at: now,
      updated_at: now
    };
    delete (updated as any).password;
    users[idx] = updated;

    state.users = users;

    // Reset failed attempts upon successful password change
    if (state.security_policy?.failedAttempts) {
      delete state.security_policy.failedAttempts[userId];
    }
    if (state.security_policy?.lockedUntil) {
      delete state.security_policy.lockedUntil[userId];
    }

    // Synchronize to all local database environments (Office Win11, Warehouse Win7, Cloud Web)
    const allEnvs: RuntimeEnvironment[] = ['OFFICE_WIN11', 'WAREHOUSE_WIN7', 'CLOUD_WEB'];
    for (const otherEnv of allEnvs) {
      if (otherEnv !== env) {
        const otherState = this.getState(otherEnv);
        if (otherState && otherState.users) {
          const oIdx = otherState.users.findIndex(u => u.user_id === userId);
          if (oIdx >= 0) {
            otherState.users[oIdx] = {
              ...otherState.users[oIdx],
              password_hash: newPasswordHash,
              password_salt: saltHex,
              is_password_changed: true,
              password_updated_at: now,
              updated_at: now
            };
            this.saveState(otherEnv, otherState);
          }
        }
      }
    }

    // Add immutable audit log
    state.audit_logs.unshift({
      audit_id: `AUD-SEC-PASS-${Date.now()}`,
      user_id: userId,
      device_id: state.deviceId,
      action: 'UPDATE_PASSWORD_PBKDF2',
      entity_type: 'USER',
      entity_id: userId,
      timestamp: new Date().toISOString(),
      metadata: {
        algorithm: 'PBKDF2-SHA512',
        salt_prefix: saltHex.substring(0, 8),
        ip_lock: 'anbar.mgas.ir'
      }
    });

    this.saveState(env, state);

    try {
      this.recordLocalChange(
        env,
        userId,
        'USER',
        'UPDATE',
        userId,
        updated,
        `تغییر رمز عبور کاربر ${updated.full_name} (@${updated.username}) با الگوریتم PBKDF2-SHA512`,
        { username: updated.username, password_updated: true }
      );
    } catch {}

    return true;
  }

  static recordFailedLogin(env: RuntimeEnvironment, userIdOrName: string): { attempts: number; isLocked: boolean; lockMinutes: number } {
    const state = this.getState(env);
    if (!state.security_policy) {
      state.security_policy = {
        strictDomainLock: true,
        allowedDomain: 'anbar.mgas.ir',
        enforceDeviceBinding: true,
        requireStrongPassword: true,
        tamperProtectionEnabled: true,
        databaseWriteProtected: false,
        internalManagerMaxEditWindowHours: 0,
        failedAttempts: {},
        lockedUntil: {}
      };
    }

    const currentAttempts = (state.security_policy.failedAttempts[userIdOrName] || 0) + 1;
    state.security_policy.failedAttempts[userIdOrName] = currentAttempts;

    let isLocked = false;
    let lockMinutes = 0;

    // Brute force threshold: 5 failed attempts locks for 15 minutes
    if (currentAttempts >= 5) {
      isLocked = true;
      lockMinutes = 15;
      state.security_policy.lockedUntil[userIdOrName] = Date.now() + 15 * 60 * 1000;

      state.audit_logs.unshift({
        audit_id: `AUD-BRUTE-FORCE-${Date.now()}`,
        user_id: userIdOrName,
        device_id: state.deviceId,
        action: 'ACCOUNT_TEMPORARILY_LOCKED',
        entity_type: 'AUTH',
        entity_id: userIdOrName,
        timestamp: new Date().toISOString(),
        metadata: {
          failed_attempts: currentAttempts,
          locked_for_minutes: lockMinutes
        }
      });
    }

    this.saveState(env, state);
    return { attempts: currentAttempts, isLocked, lockMinutes };
  }

  static checkAccountLock(env: RuntimeEnvironment, userIdOrName: string): { isLocked: boolean; remainingSeconds: number } {
    const state = this.getState(env);
    const lockExpiry = state.security_policy?.lockedUntil?.[userIdOrName];
    if (!lockExpiry) return { isLocked: false, remainingSeconds: 0 };

    const remainingMs = lockExpiry - Date.now();
    if (remainingMs > 0) {
      return { isLocked: true, remainingSeconds: Math.ceil(remainingMs / 1000) };
    }

    // Expired lock, clear it
    if (state.security_policy?.lockedUntil) {
      delete state.security_policy.lockedUntil[userIdOrName];
      delete state.security_policy.failedAttempts[userIdOrName];
      this.saveState(env, state);
    }
    return { isLocked: false, remainingSeconds: 0 };
  }

  static resetFailedLogin(env: RuntimeEnvironment, userIdOrName: string) {
    const state = this.getState(env);
    if (state.security_policy?.failedAttempts?.[userIdOrName]) {
      delete state.security_policy.failedAttempts[userIdOrName];
    }
    if (state.security_policy?.lockedUntil?.[userIdOrName]) {
      delete state.security_policy.lockedUntil[userIdOrName];
    }
    this.saveState(env, state);
  }

  static recordSecurityIncident(
    env: RuntimeEnvironment,
    action: string,
    description: string,
    metadata?: Record<string, any>
  ): void {
    const state = this.getState(env);
    if (!state.audit_logs) state.audit_logs = [];
    state.audit_logs.unshift({
      audit_id: `AUD-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: 'SECURITY_SHIELD',
      device_id: state.deviceId || 'WEB_CLIENT',
      action: action as any,
      entity_type: 'AUTH',
      entity_id: 'HONEYPOT_TRAP',
      timestamp: new Date().toISOString(),
      metadata: {
        description,
        ...metadata
      }
    });
    this.saveState(env, state);
  }

  static setSecurityPolicy(env: RuntimeEnvironment, policy: Partial<SecurityPolicyState>) {
    const state = this.getState(env);
    state.security_policy = {
      ...state.security_policy,
      ...policy
    };
    this.saveState(env, state);
  }

  // Backup & Restore
  static exportBackupJSON(env: RuntimeEnvironment): string {
    const state = this.getState(env);
    return JSON.stringify(state, null, 2);
  }

  static importBackupJSON(env: RuntimeEnvironment, jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.products && parsed.customers && parsed.stock_movements) {
        this.saveState(env, parsed);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
