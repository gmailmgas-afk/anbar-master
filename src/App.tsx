import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RuntimeEnvironment,
  User,
  Device,
  MovementType,
  StockMovement,
  CylinderValveInspection,
  AppNotification
} from './types';
import { LocalStorageManager, LocalDatabaseState } from './database/storage';
import { SyncEngine } from './sync-engine/sync-client';
import { SEED_USERS, SEED_DEVICES, SEED_WAREHOUSES } from './database/seed-data';

import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CylinderValveInspectionView } from './components/CylinderValveInspectionView';
import { GasKardexView } from './components/GasKardexView';
import { GasProductionKardexView } from './components/GasProductionKardexView';
import { CylinderTanksCatalogView } from './components/CylinderTanksCatalogView';
import { InventoryView } from './components/InventoryView';
import { MovementsView } from './components/MovementsView';
import { ReportsView } from './components/ReportsView';
import { CustomersView } from './components/CustomersView';
import { SuppliersView } from './components/SuppliersView';
import { InvoicesView } from './components/InvoicesView';
import { TriSyncInspectorView } from './components/TriSyncInspectorView';
import { SyncQueueView } from './components/SyncQueueView';
import { AuditLogView } from './components/AuditLogView';
import { BackupRestoreView } from './components/BackupRestoreView';
import { Windows7NoticeModal } from './components/Windows7NoticeModal';
import { Windows7TroubleshootingModal } from './components/Windows7TroubleshootingModal';
import { Windows11TroubleshootingModal } from './components/Windows11TroubleshootingModal';
import { LoginView } from './components/LoginView';
import { SecuritySettingsModal } from './components/SecuritySettingsModal';
import { UsersManagementView } from './components/UsersManagementView';
import { ProductSearchSelect } from './components/ProductSearchSelect';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UiFeedbackHost } from './components/UiFeedbackHost';
import { NotificationsCenterModal } from './components/NotificationsCenterModal';

import { ArrowLeftRight, X, LayoutDashboard, Flame, Boxes, FileText, Menu, PackageCheck, KeyRound, Zap, Users, Truck, CheckCircle2 } from 'lucide-react';
import { generateUUID, toPersianDigits, parseDecimalNumber } from './utils/persian';
import { isSafeInput, sanitizeInput, sanitizeNumber, validateFieldSecurity, verifyUserPasswordStrict } from './utils/security';
import { getAuthCookie, saveAuthCookie, clearAuthCookie, purgeClientDataCache } from './utils/cookieAuth';
import { initUserFontSize } from './utils/fontSizeCookie';
import { isPendingRepairCylinderKardex } from './utils/cylinderInspection';
import { isValveCategory, isValveProduct } from './utils/valveProductUtils';
import { showToast } from './utils/uiFeedback';
import {
  readPersistedNavValue,
  readPersistedNavString,
  savePersistedNavValue,
  clearPersistedNavState,
  HASH_PARAM_TAB
} from './utils/navigationPersistence';

const VALID_NAV_TABS: readonly NavTab[] = [
  'dashboard',
  'users_management',
  'tri_sync',
  'cylinder_inspections',
  'gas_kardex',
  'gas_production_kardex',
  'cylinder_tanks_catalog',
  'inventory',
  'movements',
  'reports',
  'customers',
  'suppliers',
  'invoices',
  'sync_queue',
  'audit',
  'backup'
];

const VALID_WAREHOUSE_SUBTABS = ['INSPECTIONS', 'MOVEMENTS'] as const;
const VALID_TRISYNC_SUBTABS = ['MONITORING', 'PASSWORDS', 'CYLINDER_CATALOG', 'ZERO_INVENTORY'] as const;

export const SHELF_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
export const SHELF_NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

export default function App() {
  // Active environment (Defaults to Office PC Windows 11)
  const [currentEnv, setCurrentEnv] = useState<RuntimeEnvironment>('OFFICE_WIN11');

  // Mobile menu open state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if running in desktop Electron application (Windows 7 / Windows 11)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop) {
      window.desktopAPI.getDbInfo().then(info => {
        if (info && info.environment) {
          setCurrentEnv(info.environment);
          if (info.environment === 'WAREHOUSE_WIN7') {
            const whUsers = LocalStorageManager.getUsers('WAREHOUSE_WIN7');
            const whUser = whUsers.find(u => u.user_id === 'USR-003') || SEED_USERS.find(u => u.user_id === 'USR-003');
            if (whUser && !getAuthCookie()) setCurrentUser(whUser);
          }
        }
      }).catch(err => {
        console.warn('Desktop API info error:', err);
      });
    }
  }, []);

  // Single active user session (strictly one user at any moment)
  // Strict requirement: Only username and password/hash are saved on the client in a cookie.
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // 1. Strictly retrieve authentication credentials from client cookie
    const cookieAuth = getAuthCookie();
    const currentUsers = LocalStorageManager.getUsers(currentEnv);
    if (cookieAuth && cookieAuth.username && (cookieAuth.password || cookieAuth.password_hash)) {
      const match = currentUsers.find(u =>
        u.username.toLowerCase() === cookieAuth.username.toLowerCase() ||
        u.user_id === cookieAuth.username
      );
      if (match) {
        if (cookieAuth.password_hash && match.password_hash && cookieAuth.password_hash !== match.password_hash) {
          return null;
        }
        return match;
      }
    }
    // Return null when unauthenticated so LoginView form executes
    return null;
  });

  const [showSwitchUserModal, setShowSwitchUserModal] = useState<boolean>(false);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    readPersistedNavValue('active_tab', VALID_NAV_TABS, 'dashboard', { hashParam: HASH_PARAM_TAB })
  );
  const [warehouseMovementsSubTab, setWarehouseMovementsSubTab] = useState<'INSPECTIONS' | 'MOVEMENTS'>(() =>
    readPersistedNavValue('warehouse_sub_tab', VALID_WAREHOUSE_SUBTABS, 'INSPECTIONS')
  );
  const [triSyncSubTab, setTriSyncSubTab] = useState<'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY'>(() =>
    readPersistedNavValue('tri_sync_sub_tab', VALID_TRISYNC_SUBTABS, 'MONITORING')
  );
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'ALL' | 'OUT_OF_STOCK' | 'CRITICAL' | 'WARN' | 'GOOD'>('ALL');
  const [selectedGasCustomerId, setSelectedGasCustomerId] = useState<string>(() =>
    readPersistedNavString('gas_kardex_customer_id', 'CUST-EXCEL-001')
  );
  const [pendingInspectionForKardex, setPendingInspectionForKardex] = useState<CylinderValveInspection | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showWin7Modal, setShowWin7Modal] = useState(false);
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false);
  const [showWin11TroubleshootingModal, setShowWin11TroubleshootingModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Dark Mode / Light Mode Theme state (in-memory)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    try {
      if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        document.body.classList.add('light');
        document.body.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.body.classList.add('dark');
        document.body.classList.remove('light');
      }
    } catch {}
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Initialize and synchronize per-user font size preferences strictly from document.cookie
  useEffect(() => {
    initUserFontSize(currentUser?.username || currentUser?.user_id);
  }, [currentUser]);

  // Identification of warehouse keeper Hajivand (Strict access control)
  const isHajivand = Boolean(
    (currentEnv === 'WAREHOUSE_WIN7' && (!currentUser || currentUser.role === 'WAREHOUSE_KEEPER')) ||
    (currentUser && (
      currentUser.username === 'hajivand' ||
      currentUser.username?.toLowerCase().includes('haji') ||
      currentUser.username === 'gholizadeh' ||
      currentUser.user_id === 'USR-003' ||
      currentUser.role === 'WAREHOUSE_KEEPER' ||
      currentUser.full_name?.includes('حاجی') ||
      currentUser.full_name?.includes('قلی زاده') ||
      currentUser.full_name?.includes('انباردار')
    ))
  );

  const isManagerAmouei = Boolean(
    currentUser && (
      currentUser.username === 'amouei' ||
      currentUser.user_id === 'USR-001' ||
      currentUser.role === 'ADMIN' ||
      currentUser.full_name?.includes('عمویی')
    )
  );

  // Strictly enforce: sync_queue, audit, backup, tri_sync, cylinder_tanks_catalog, and users_management are ONLY accessible to Senior Manager Mousa Amouei
  useEffect(() => {
    if (
      !isManagerAmouei &&
      (activeTab === 'users_management' ||
        activeTab === 'cylinder_tanks_catalog' ||
        activeTab === 'tri_sync' ||
        activeTab === 'sync_queue' ||
        activeTab === 'audit' ||
        activeTab === 'backup')
    ) {
      setActiveTab(isHajivand ? 'movements' : 'dashboard');
    }
  }, [isManagerAmouei, isHajivand, activeTab]);

  // Strictly prevent Hajivand from accessing Gas Kardex, Production Kardex, and Users Management (redirect immediately)
  useEffect(() => {
    if (isHajivand && (activeTab === 'gas_kardex' || activeTab === 'gas_production_kardex' || activeTab === 'users_management')) {
      setActiveTab('movements');
    }
  }, [isHajivand, activeTab]);

  useEffect(() => {
    if (activeTab === 'cylinder_inspections') {
      setWarehouseMovementsSubTab('INSPECTIONS');
    } else if (activeTab === 'users_management') {
      setTriSyncSubTab('PASSWORDS');
      setActiveTab('tri_sync');
    } else if (activeTab === 'cylinder_tanks_catalog') {
      setTriSyncSubTab('CYLINDER_CATALOG');
      setActiveTab('tri_sync');
    }
  }, [activeTab]);

  // Persist current active page & sub-tabs so refreshing the browser keeps the exact current page
  useEffect(() => {
    savePersistedNavValue('active_tab', activeTab, { hashParam: HASH_PARAM_TAB });
  }, [activeTab]);

  useEffect(() => {
    savePersistedNavValue('warehouse_sub_tab', warehouseMovementsSubTab);
  }, [warehouseMovementsSubTab]);

  useEffect(() => {
    savePersistedNavValue('tri_sync_sub_tab', triSyncSubTab);
  }, [triSyncSubTab]);

  useEffect(() => {
    if (selectedGasCustomerId) {
      savePersistedNavValue('gas_kardex_customer_id', selectedGasCustomerId);
    }
  }, [selectedGasCustomerId]);

  // Keep activeTab synchronized when user navigates with browser Back/Forward buttons
  useEffect(() => {
    const syncFromHash = () => {
      const fromHash = readPersistedNavValue('active_tab', VALID_NAV_TABS, activeTab, { hashParam: HASH_PARAM_TAB });
      if (fromHash !== activeTab) {
        setActiveTab(fromHash);
      }
    };
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('popstate', syncFromHash);
    };
  }, [activeTab]);

  // Global Quick New Movement Modal
  const [showQuickMovementModal, setShowQuickMovementModal] = useState(false);
  const [openSkuPrintDirectly, setOpenSkuPrintDirectly] = useState(false);

  // Global Escape key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQuickMovementModal(false);
        setShowSwitchUserModal(false);
        setShowSecurityModal(false);
        setShowWin7Modal(false);
        setShowTroubleshootingModal(false);
        setShowWin11TroubleshootingModal(false);
        setShowNotificationsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [quickMovForm, setQuickMovForm] = useState<{
    product_id: string;
    warehouse_id: string;
    to_warehouse_id: string;
    quantity: number | string;
    movement_type: MovementType;
    reference_id: string;
    notes: string;
    valve_condition: 'HEALTHY' | 'DEFECTIVE';
    valve_ownership?: 'MGAS' | 'CUSTOMER';
    customer_id?: string;
    customer_name?: string;
    party_type?: 'SUPPLIER' | 'CUSTOMER';
    supplier_id?: string;
    supplier_name?: string;
    driver_name?: string;
    plate_number?: string;
    waybill_number?: string;
  }>({
    product_id: '',
    warehouse_id: '',
    to_warehouse_id: '',
    quantity: '1',
    movement_type: 'STOCK_IN' as MovementType,
    reference_id: '',
    notes: '',
    valve_condition: 'HEALTHY',
    valve_ownership: 'MGAS',
    customer_id: '',
    customer_name: 'شرکت ام‌گاز',
    party_type: 'SUPPLIER',
    supplier_id: 'SUP-MGAS-BRANCH',
    supplier_name: 'شعبه ام گاز (انبار مرکزی)',
    driver_name: '',
    plate_number: '',
    waybill_number: ''
  });

  // Switch to differentiate M-Gas Suppliers and Customers in movement document
  const [partyTypeSwitch, setPartyTypeSwitch] = useState<'SUPPLIER' | 'CUSTOMER'>('SUPPLIER');

  const [quickShelfLetter, setQuickShelfLetter] = useState('A');
  const [quickShelfNumber, setQuickShelfNumber] = useState(1);
  const [quickDestShelfLetter, setQuickDestShelfLetter] = useState('B');
  const [quickDestShelfNumber, setQuickDestShelfNumber] = useState(1);

  // Local state for the active environment
  const [localDb, setLocalDb] = useState<LocalDatabaseState>(() =>
    LocalStorageManager.getState(currentEnv)
  );

  // Reload local state when environment changes with defensive immutable array cloning
  const refreshLocalState = useCallback(() => {
    const fresh = LocalStorageManager.getState(currentEnv);
    setLocalDb({
      ...fresh,
      gas_kardex_entries: fresh.gas_kardex_entries ? [...fresh.gas_kardex_entries] : [],
      gas_production_kardex_entries: fresh.gas_production_kardex_entries ? [...fresh.gas_production_kardex_entries] : [],
      cylinder_valve_inspections: fresh.cylinder_valve_inspections ? [...fresh.cylinder_valve_inspections] : [],
      stock_movements: fresh.stock_movements ? [...fresh.stock_movements] : [],
      goods_receipts: fresh.goods_receipts ? [...fresh.goods_receipts] : [],
      invoices: fresh.invoices ? [...fresh.invoices] : [],
      notifications: fresh.notifications ? [...fresh.notifications] : [],
      products: fresh.products ? [...fresh.products] : [],
      customers: fresh.customers ? [...fresh.customers] : [],
      suppliers: fresh.suppliers ? [...fresh.suppliers] : [],
      warehouses: fresh.warehouses ? [...fresh.warehouses] : []
    });
  }, [currentEnv]);

  // Navigate to Password & User Management inside the Sync Menu ("همگام‌سازی ابری و کلاینت‌ها")
  const handleOpenUsersManagement = useCallback(() => {
    if (!isManagerAmouei) return;
    setTriSyncSubTab('PASSWORDS');
    setActiveTab('tri_sync');
    refreshLocalState();
    setIsMobileMenuOpen(false);
  }, [isManagerAmouei, refreshLocalState]);

  // Sync shelf letter and number when modal opens
  useEffect(() => {
    if (showQuickMovementModal) {
      const whId = quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id;
      const targetWh = localDb.warehouses.find(w => w.warehouse_id === whId) || localDb.warehouses[0];
      if (targetWh) {
        const letter = targetWh.shelf_letter || targetWh.shelf_location?.match(/[A-Z]/i)?.[0]?.toUpperCase() || 'A';
        const num = targetWh.shelf_number || parseInt(targetWh.shelf_location?.replace(/[^0-9]/g, '') || '1', 10) || 1;
        setQuickShelfLetter(letter);
        setQuickShelfNumber(num);
      }
    }
  }, [showQuickMovementModal, localDb.warehouses]);

  const [instantSyncToast, setInstantSyncToast] = useState<{ message: string; timestamp: number } | null>(null);

  useEffect(() => {
    refreshLocalState();
    const unsubscribe = LocalStorageManager.subscribe(() => {
      refreshLocalState();
    });
    const handleDbRefreshed = () => {
      refreshLocalState();
    };
    const handleInstantDocumentSync = (e: any) => {
      refreshLocalState();
      const count = e?.detail?.events?.length || 1;
      setInstantSyncToast({
        message: `⚡ ${count} سند/آیتم جدید بلافاصله در پل کاربر و پایگاه ابری کلودفلر ثبت و به‌روزرسانی شد (صرف‌نظر از قانون ۲۰ ثانیه).`,
        timestamp: Date.now()
      });
      setTimeout(() => {
        setInstantSyncToast(prev => (prev && Date.now() - prev.timestamp >= 3400 ? null : prev));
      }, 3500);
    };

    const handleRemoteNotification = (e: any) => {
      refreshLocalState();
      const notif: AppNotification | undefined = e?.detail;
      if (notif && (!currentUser || notif.actor_user_id !== currentUser.user_id)) {
        const ts = Date.now();
        setInstantSyncToast({
          message: `🔔 ${notif.title}: ${notif.message}`,
          timestamp: ts
        });
        setTimeout(() => {
          setInstantSyncToast(prev => (prev && Date.now() - prev.timestamp >= 4400 ? null : prev));
        }, 4500);
      }
    };

    window.addEventListener('mgas:db_refreshed', handleDbRefreshed);
    window.addEventListener('mgas:database_refreshed', handleDbRefreshed);
    window.addEventListener('mgas:database_purged', handleDbRefreshed);
    window.addEventListener('mgas:notifications_updated', handleDbRefreshed);
    window.addEventListener('mgas:remote_notification_received', handleRemoteNotification);
    window.addEventListener('mgas:inspection_updated', handleDbRefreshed);
    window.addEventListener('mgas:inspection_added', handleDbRefreshed);
    window.addEventListener('mgas:kardex_trash_updated', handleDbRefreshed);
    window.addEventListener('mgas:inventory_updated', handleDbRefreshed);
    window.addEventListener('mgas:document_synced_instantly', handleInstantDocumentSync);

    return () => {
      unsubscribe();
      window.removeEventListener('mgas:db_refreshed', handleDbRefreshed);
      window.removeEventListener('mgas:database_refreshed', handleDbRefreshed);
      window.removeEventListener('mgas:database_purged', handleDbRefreshed);
      window.removeEventListener('mgas:notifications_updated', handleDbRefreshed);
      window.removeEventListener('mgas:remote_notification_received', handleRemoteNotification);
      window.removeEventListener('mgas:inspection_updated', handleDbRefreshed);
      window.removeEventListener('mgas:inspection_added', handleDbRefreshed);
      window.removeEventListener('mgas:kardex_trash_updated', handleDbRefreshed);
      window.removeEventListener('mgas:inventory_updated', handleDbRefreshed);
      window.removeEventListener('mgas:document_synced_instantly', handleInstantDocumentSync);
    };
  }, [currentEnv, refreshLocalState, currentUser]);

  // Enforce active session validity whenever user records change (auto-logout if password changed elsewhere)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const validateActiveSession = async () => {
      const latestUsers = LocalStorageManager.getUsers(currentEnv);
      const latestUser = latestUsers.find(
        u => u.user_id === currentUser.user_id || u.username.toLowerCase() === currentUser.username.toLowerCase()
      );
      if (!latestUser) {
        if (!cancelled) {
          setCurrentUser(null);
          clearAuthCookie();
          purgeClientDataCache();
        }
        return;
      }

      const cookieAuth = getAuthCookie();
      if (cookieAuth && (cookieAuth.username.toLowerCase() === latestUser.username.toLowerCase() || cookieAuth.username === latestUser.user_id)) {
        if (cookieAuth.password) {
          const stillValid = await verifyUserPasswordStrict(cookieAuth.password, latestUser);
          if (!stillValid) {
            if (!cancelled) {
              setCurrentUser(null);
              clearAuthCookie();
              purgeClientDataCache();
            }
            return;
          }
        } else if (cookieAuth.password_hash && latestUser.password_hash && cookieAuth.password_hash !== latestUser.password_hash) {
          if (!cancelled) {
            setCurrentUser(null);
            clearAuthCookie();
            purgeClientDataCache();
          }
          return;
        }
      }

      if (
        !cancelled &&
        (latestUser.password_hash !== currentUser.password_hash ||
         latestUser.password_updated_at !== currentUser.password_updated_at ||
         latestUser.username !== currentUser.username ||
         latestUser.full_name !== currentUser.full_name)
      ) {
        setCurrentUser(latestUser);
      }
    };

    validateActiveSession();
    const handleUsersUpdated = () => {
      validateActiveSession();
    };
    window.addEventListener('mgas:users_updated', handleUsersUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('mgas:users_updated', handleUsersUpdated);
    };
  }, [currentEnv, currentUser?.user_id, currentUser?.password_hash, localDb.users]);

  const handleLoginSuccess = (user: User, password?: string) => {
    setCurrentUser(user);
    // Strictly save username, current password (if provided), and password_hash in client cookie
    saveAuthCookie(user.username, password || '', user.password_hash);
    if (user.username === 'karami' || user.role === 'INTERNAL_MANAGER') {
      LocalStorageManager.renewKaramiSession();
    }
    setShowSwitchUserModal(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
    clearAuthCookie();
    purgeClientDataCache();
    clearPersistedNavState();
  };

  // Real-time Auto-Sync loop & SSE Live Stream with instant reactivity
  useEffect(() => {
    // 1. Start live stream & periodic background sync every 20 seconds via encrypted HTTPS
    SyncEngine.startAutoSync(currentEnv, 20000);

    // 2. Immediate subscription to local storage changes
    const unsubscribeStorage = LocalStorageManager.subscribe(() => {
      refreshLocalState();
    });

    // 3. Custom event listener for instant Kardex AJAX updates
    const handleKardexUpdated = () => {
      refreshLocalState();
    };
    window.addEventListener('mgas:kardex_updated' as any, handleKardexUpdated);
    window.addEventListener('mgas:stock_movement_added' as any, handleKardexUpdated);

    // 4. Cross-tab and Electron multi-window BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.onmessage = () => {
          refreshLocalState();
        };
      }
    } catch {}

    return () => {
      SyncEngine.stopAutoSync(currentEnv);
      unsubscribeStorage();
      window.removeEventListener('mgas:kardex_updated' as any, handleKardexUpdated);
      window.removeEventListener('mgas:stock_movement_added' as any, handleKardexUpdated);
      if (bc) bc.close();
    };
  }, [currentEnv, refreshLocalState]);

  // Manual immediate sync trigger
  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await SyncEngine.syncNow(currentEnv);
      refreshLocalState();
    } catch (e: any) {
      console.warn('Sync notice:', e?.message || e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle simulated offline mode
  const handleToggleOffline = () => {
    const state = LocalStorageManager.getState(currentEnv);
    const newOffline = !state.isOfflineSimulated;
    state.isOfflineSimulated = newOffline;
    state.sync_state.status = newOffline ? 'OFFLINE' : 'ONLINE';
    LocalStorageManager.saveState(currentEnv, state);
    refreshLocalState();
  };

  // Compute stock quantities mapping for active environment
  const stockQuantities = LocalStorageManager.getStockQuantities(currentEnv);

  // Available products & categories for quick movement modal:
  // Strict User Requirement:
  // Since incoming valves have a separate dedicated intake form (ورودی شیرآلات),
  // valves and valve categories must NOT be displayed or selectable in the movement registration form
  // when movement_type is 'STOCK_IN' (رسید ورود).
  // However, when 'STOCK_OUT' (حواله خروج), 'TRANSFER_OUT' (جابجایی بین انبارها),
  // or 'ADJUSTMENT' (تعدیل انبارگردانی) is chosen, valves must be fully visible and selectable.
  // Available products & categories for quick movement modal:
  // Strict User Requirement:
  // Since incoming valves have a separate dedicated intake form (ورودی شیرآلات),
  // valves and valve categories must NOT be displayed or selectable in the movement registration form
  // when movement_type is 'STOCK_IN' (رسید ورود).
  // However, when 'STOCK_OUT' (حواله خروج), 'TRANSFER_OUT' (جابجایی بین انبارها),
  // or 'ADJUSTMENT' (تعدیل انبارگردانی) is chosen, valves must be fully visible and selectable.
  const isStockInMovement = quickMovForm.movement_type === 'STOCK_IN';

  const availableMovementProducts = useMemo(() => {
    if (isStockInMovement) {
      return localDb.products.filter(p => !isValveProduct(p, localDb.categories));
    }
    return localDb.products;
  }, [localDb.products, localDb.categories, isStockInMovement]);

  const availableMovementCategories = useMemo(() => {
    if (isStockInMovement) {
      return localDb.categories.filter(c => !isValveCategory(c));
    }
    return localDb.categories;
  }, [localDb.categories, isStockInMovement]);

  // When STOCK_IN is chosen, if the current product is a valve, reset immediately to first non-valve product
  useEffect(() => {
    if (quickMovForm.movement_type === 'STOCK_IN') {
      const currentProd = localDb.products.find(p => p.product_id === quickMovForm.product_id);
      if (currentProd && isValveProduct(currentProd, localDb.categories)) {
        const firstNonValve = localDb.products.find(p => !isValveProduct(p, localDb.categories));
        setQuickMovForm(prev => ({
          ...prev,
          product_id: firstNonValve ? firstNonValve.product_id : ''
        }));
      }
    }
  }, [quickMovForm.movement_type, quickMovForm.product_id, localDb.products, localDb.categories]);

  // When STOCK_OUT is chosen and a valve is selected:
  // Auto-switch to customer party and ensure customer is selected so that it gets recorded in customer repair kardex
  useEffect(() => {
    if (quickMovForm.movement_type === 'STOCK_OUT') {
      const prod = localDb.products.find(p => p.product_id === quickMovForm.product_id);
      if (prod && isValveProduct(prod, localDb.categories)) {
        if (partyTypeSwitch !== 'CUSTOMER') {
          setPartyTypeSwitch('CUSTOMER');
          const firstCust = localDb.customers?.[0];
          setQuickMovForm(prev => ({
            ...prev,
            party_type: 'CUSTOMER',
            valve_ownership: 'CUSTOMER',
            customer_id: prev.customer_id || firstCust?.customer_id || '',
            customer_name: (prev.customer_name && prev.customer_name !== 'شرکت ام‌گاز') ? prev.customer_name : (firstCust?.name || '')
          }));
        }
      }
    }
  }, [quickMovForm.movement_type, quickMovForm.product_id, localDb.products, localDb.categories, partyTypeSwitch]);

  // Current selected product and valve detection
  const selectedMovementProduct = useMemo(() => {
    const prodId = quickMovForm.product_id || availableMovementProducts[0]?.product_id;
    return localDb.products.find(p => p.product_id === prodId);
  }, [localDb.products, quickMovForm.product_id, availableMovementProducts]);

  const isCurrentProductValve = useMemo(() => {
    return selectedMovementProduct ? isValveProduct(selectedMovementProduct, localDb.categories) : false;
  }, [selectedMovementProduct, localDb.categories]);

  // Quick Movement save handler
  const handleSaveQuickMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveProducts = availableMovementProducts;
    const prodId = quickMovForm.product_id || effectiveProducts[0]?.product_id;
    const prod = localDb.products.find(p => p.product_id === prodId);
    if (!prod) return;

    // Strict Guard: Incoming valves are exclusively handled in dedicated valve intake form
    if (quickMovForm.movement_type === 'STOCK_IN' && isValveProduct(prod, localDb.categories)) {
      showToast('ثبت ورود برای کالاهای دسته شیرآلات و اتصالات فشارقوی در این فرم مجاز نمی‌باشد زیرا برای آن فرم اختصاصی «ورودی شیرآلات» تعریف شده است. لطفاً از دکمه «ورودی شیرآلات» استفاده فرمایید.', 'warning');
      return;
    }

    // Anti-Injection & Security Checks
    const refCheck = validateFieldSecurity(quickMovForm.reference_id, 'شماره سند / بارنامه', { required: true, maxLength: 100 });
    if (!refCheck.isValid) {
      showToast(refCheck.error || 'شماره سند / بارنامه نامعتبر است.', 'error');
      return;
    }
    const notesCheck = validateFieldSecurity(quickMovForm.notes, 'توضیحات گردش انبار', { maxLength: 500, allowMultiline: true });
    if (!notesCheck.isValid) {
      showToast(notesCheck.error || 'توضیحات وارد شده نامعتبر است.', 'error');
      return;
    }

    const parsedQty = parseDecimalNumber(quickMovForm.quantity, NaN);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      showToast('لطفاً تعداد / مقدار معتبر و بزرگتر از صفر (صحیح یا اعشاری) وارد نمایید.', 'warning');
      return;
    }

    const chosenWhId = quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id || 'WH-VALVES';
    const shelf_location = `${quickShelfLetter}${quickShelfNumber}`;

    // Handle Inter-Warehouse Transfer
    if (quickMovForm.movement_type === 'TRANSFER_OUT') {
      const destWhId = quickMovForm.to_warehouse_id || localDb.warehouses.find(w => w.warehouse_id !== chosenWhId)?.warehouse_id;
      if (!destWhId) {
        showToast('لطفاً انبار مقصد را انتخاب نمایید.', 'warning');
        return;
      }
      if (chosenWhId === destWhId) {
        showToast('انبار مبدأ و انبار مقصد نمی‌توانند یکسان باشند. لطفاً انبار مقصد متفاوتی را انتخاب نمایید.', 'warning');
        return;
      }

      try {
        const ownerLabel = quickMovForm.party_type === 'CUSTOMER' && quickMovForm.customer_id
          ? `مشتری: ${quickMovForm.customer_name || quickMovForm.customer_id}`
          : quickMovForm.party_type === 'SUPPLIER' && quickMovForm.supplier_id && quickMovForm.supplier_id !== 'MGAS' && quickMovForm.supplier_id !== 'SUP-MGAS-BRANCH'
          ? `تأمین‌کننده ام‌گاز: ${quickMovForm.supplier_name || quickMovForm.customer_name}`
          : 'شرکت ام‌گاز (شعبه و انبار مرکزی)';

        LocalStorageManager.executeWarehouseTransfer(currentEnv, currentUser, {
          productId: prodId,
          sourceWarehouseId: chosenWhId,
          destWarehouseId: destWhId,
          quantity: parsedQty,
          referenceId: refCheck.cleanValue || `TRF-${Date.now().toString().slice(-5)}`,
          notes: notesCheck.cleanValue ? `${notesCheck.cleanValue} - [طرف حساب: ${ownerLabel}]` : `[طرف حساب: ${ownerLabel}]`,
          valveCondition: quickMovForm.valve_condition || 'HEALTHY',
          valveOwnership: quickMovForm.party_type === 'CUSTOMER' ? 'CUSTOMER' : 'MGAS',
          customerId: quickMovForm.party_type === 'CUSTOMER' ? quickMovForm.customer_id : undefined,
          customerName: quickMovForm.party_type === 'CUSTOMER' ? quickMovForm.customer_name : (quickMovForm.supplier_name || 'شرکت ام‌گاز'),
          sourceShelfLetter: quickShelfLetter,
          sourceShelfNumber: quickShelfNumber,
          destShelfLetter: quickDestShelfLetter,
          destShelfNumber: quickDestShelfNumber
        });

        showToast('جابجایی بین انبارها با موفقیت انجام شد و موجودی انبار مبدأ و انبار مقصد به‌روزرسانی گردید.', 'success');
      } catch (err: any) {
        showToast(err.message || 'خطا در ثبت جابجایی بین انبارها', 'error');
        return;
      }

      setQuickMovForm({
        product_id: '',
        warehouse_id: '',
        to_warehouse_id: '',
        quantity: '1',
        movement_type: 'STOCK_IN',
        reference_id: '',
        notes: '',
        valve_condition: 'HEALTHY',
        valve_ownership: 'MGAS',
        customer_id: '',
        customer_name: 'شرکت ام‌گاز',
        party_type: 'SUPPLIER',
        supplier_id: 'SUP-MGAS-BRANCH',
        supplier_name: 'شعبه ام گاز (انبار مرکزی)',
        driver_name: '',
        plate_number: '',
        waybill_number: ''
      });
      setPartyTypeSwitch('SUPPLIER');
      setShowQuickMovementModal(false);
      refreshLocalState();
      return;
    }

    // Update shelf location for the selected warehouse
    LocalStorageManager.updateWarehouseShelf(currentEnv, chosenWhId, quickShelfLetter, quickShelfNumber);

    const isExitValve = quickMovForm.movement_type === 'STOCK_OUT' && isValveProduct(prod, localDb.categories);
    const isCustomerParty = quickMovForm.party_type === 'CUSTOMER' || isExitValve;
    const targetCustomerId = isCustomerParty ? (quickMovForm.customer_id || localDb.customers[0]?.customer_id) : undefined;
    const targetCustomerName = isCustomerParty ? (quickMovForm.customer_name || localDb.customers.find(c => c.customer_id === targetCustomerId)?.name || localDb.customers[0]?.name) : undefined;

    try {
      LocalStorageManager.recordWarehouseMovementWithDualLogic(currentEnv, currentUser, {
        productId: prodId,
        warehouseId: chosenWhId,
        quantity: parsedQty,
        movementType: quickMovForm.movement_type,
        referenceId: refCheck.cleanValue || `DOC-${Date.now().toString().slice(-5)}`,
        partyType: isCustomerParty ? 'CUSTOMER' : 'SUPPLIER',
        customerId: targetCustomerId,
        customerName: targetCustomerName,
        supplierId: !isCustomerParty ? (quickMovForm.supplier_id || 'SUP-MGAS-BRANCH') : undefined,
        supplierName: !isCustomerParty ? (quickMovForm.supplier_name || 'شعبه ام گاز (انبار مرکزی)') : undefined,
        itemCondition: quickMovForm.valve_condition || 'HEALTHY',
        notes: notesCheck.cleanValue || undefined,
        shelfLocation: shelf_location,
        driverName: quickMovForm.driver_name,
        plateNumber: quickMovForm.plate_number,
        waybillNumber: quickMovForm.waybill_number
      });

      if (isCustomerParty) {
        showToast(`سند خروج انبار با موفقیت ثبت شد و در کاردکس تعمیر مشتری (${targetCustomerName || 'مشتری'}) همراه با «توضیحات و شرح گردش» لحاظ گردید. برگه رسمی ${quickMovForm.movement_type === 'STOCK_OUT' ? 'خروج' : 'ورود'} کالا نیز آماده چاپ و بایگانی می‌باشد.`, 'success');
      } else {
        showToast(`سند گردش انبار با موفقیت ثبت شد و در موجودی ام‌گاز اعمال گردید. برگه رسمی ${quickMovForm.movement_type === 'STOCK_OUT' ? 'خروج' : 'ورود'} کالا نیز آماده چاپ و بایگانی می‌باشد.`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'خطا در ثبت سند گردش انبار', 'error');
      return;
    }

    setQuickMovForm({
      product_id: '',
      warehouse_id: '',
      to_warehouse_id: '',
      quantity: '1',
      movement_type: 'STOCK_IN',
      reference_id: '',
      notes: '',
      valve_condition: 'HEALTHY',
      valve_ownership: 'MGAS',
      customer_id: '',
      customer_name: 'شرکت ام‌گاز',
      party_type: 'SUPPLIER',
      supplier_id: 'SUP-MGAS-BRANCH',
      supplier_name: 'شعبه ام گاز (انبار مرکزی)',
      driver_name: '',
      plate_number: '',
      waybill_number: ''
    });
    setPartyTypeSwitch('SUPPLIER');
    setShowQuickMovementModal(false);
    refreshLocalState();
  };

  const pendingQueueCount = Array.isArray(localDb?.sync_queue)
    ? localDb.sync_queue.filter(q => q?.status === 'PENDING').length
    : 0;

  const visibleNotifications = useMemo(() => {
    return LocalStorageManager.getNotificationsForUser(currentEnv, currentUser);
  }, [currentEnv, currentUser, localDb.notifications]);

  const unreadNotificationsCount = useMemo(() => {
    const uid = currentUser?.user_id || '';
    return visibleNotifications.filter(n => !Array.isArray(n.read_by) || !n.read_by.includes(uid)).length;
  }, [visibleNotifications, currentUser?.user_id]);

  // Single user exclusive login screen
  if (!currentUser) {
    return <LoginView currentEnv={currentEnv} onLoginSuccess={handleLoginSuccess} theme={theme} onToggleTheme={handleToggleTheme} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white antialiased w-full max-w-full overflow-x-hidden transition-colors duration-200" dir="rtl">
      
      {/* Top Application Header */}
      <Header
        currentEnv={currentEnv}
        onSelectEnv={(env) => setCurrentEnv(env)}
        currentUser={currentUser}
        onSelectUser={handleLoginSuccess}
        users={localDb.users && localDb.users.length > 0 ? localDb.users : SEED_USERS}
        devices={SEED_DEVICES}
        syncState={localDb.sync_state}
        isOfflineSimulated={localDb.isOfflineSimulated}
        onToggleOffline={handleToggleOffline}
        onSyncNow={handleManualSync}
        isSyncing={isSyncing}
        onOpenTriSync={() => setActiveTab('tri_sync')}
        onOpenWinCompat={() => setShowWin7Modal(true)}
        onLogout={handleLogout}
        onSwitchUser={() => setShowSwitchUserModal(true)}
        onOpenSecurity={isManagerAmouei ? () => setShowSecurityModal(true) : undefined}
        onOpenUsersManagement={isManagerAmouei ? handleOpenUsersManagement : undefined}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(prev => !prev)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setShowNotificationsModal(true)}
      />

      {/* Instant Document Sync Notification Banner (Bypasses 20s rule) */}
      {instantSyncToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-800/95 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs sm:text-sm font-bold backdrop-blur-md animate-fade-in transition-all">
          <Zap className="w-4 h-4 text-amber-300 animate-pulse shrink-0" />
          <span>{instantSyncToast.message}</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Navigation Sidebar (Desktop Sidebar + Mobile Drawer) */}
        {(() => {
          const pendingInspections = localDb.cylinder_valve_inspections?.filter(i =>
            isPendingRepairCylinderKardex(i, localDb.custom_cylinder_item_types)
          ) || [];
          return (
            <Sidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                refreshLocalState();
                setIsMobileMenuOpen(false);
              }}
              triSyncSubTab={triSyncSubTab}
              onSelectTriSyncSubTab={(subTab) => {
                setTriSyncSubTab(subTab);
                setActiveTab('tri_sync');
                refreshLocalState();
                setIsMobileMenuOpen(false);
              }}
              onOpenSkuPrint={() => {
                setActiveTab('inventory');
                setOpenSkuPrintDirectly(true);
                setIsMobileMenuOpen(false);
              }}
              currentEnv={currentEnv}
              pendingCount={pendingQueueCount}
              pendingInspectionsCount={pendingInspections.length}
              isMobileOpen={isMobileMenuOpen}
              onCloseMobile={() => setIsMobileMenuOpen(false)}
              currentUser={currentUser}
              onSelectEnv={setCurrentEnv}
              onLogout={handleLogout}
              onSwitchUser={() => {
                setShowSwitchUserModal(true);
                setIsMobileMenuOpen(false);
              }}
              onOpenSecurity={isManagerAmouei ? () => {
                setShowSecurityModal(true);
                setIsMobileMenuOpen(false);
              } : undefined}
              onOpenUsersManagement={isManagerAmouei ? handleOpenUsersManagement : undefined}
              onOpenWinCompat={() => {
                setShowWin7Modal(true);
                setIsMobileMenuOpen(false);
              }}
              onOpenTroubleshooting={() => {
                setShowTroubleshootingModal(true);
                setIsMobileMenuOpen(false);
              }}
              onOpenWin11Troubleshooting={() => {
                setShowWin11TroubleshootingModal(true);
                setIsMobileMenuOpen(false);
              }}
              isOfflineSimulated={localDb.isOfflineSimulated}
              onToggleOffline={handleToggleOffline}
              isSyncing={isSyncing}
              onSyncNow={handleManualSync}
              syncState={localDb.sync_state}
              theme={theme}
              onToggleTheme={handleToggleTheme}
            />
          );
        })()}

        {/* View Router Area */}
        <main className="flex-1 p-2 sm:p-4 md:p-6 overflow-y-auto w-full max-w-full min-w-0 pb-24 md:pb-6 overflow-x-hidden">
          <ErrorBoundary onReset={refreshLocalState}>
          {/* Cylinder Repair Kardex notifications are now cleanly organized inside the GasKardexView popup center */}

          {activeTab === 'dashboard' && (
            <DashboardView
              products={localDb.products}
              customers={localDb.customers}
              suppliers={localDb.suppliers}
              warehouses={localDb.warehouses}
              stockMovements={localDb.stock_movements}
              stockQuantities={stockQuantities}
              syncState={localDb.sync_state}
              currentEnv={currentEnv}
              currentUser={currentUser}
              categories={localDb.categories}
              gasKardexEntries={localDb.gas_kardex_entries}
              onSelectGasCustomer={!isHajivand ? (custId) => {
                setSelectedGasCustomerId(custId);
                setActiveTab('gas_kardex');
              } : undefined}
              onNavigate={(tab, filter) => {
                if (isHajivand && tab === 'gas_kardex') {
                  setActiveTab('cylinder_inspections');
                  return;
                }
                if (tab === 'inventory' && filter) {
                  setInventoryStatusFilter(filter);
                } else if (tab === 'inventory') {
                  setInventoryStatusFilter('ALL');
                }
                setActiveTab(tab);
                refreshLocalState();
              }}
              onOpenNewMovement={() => setShowQuickMovementModal(true)}
              onOpenBatchCustomer={() => setActiveTab('customers')}
              onSyncNow={handleManualSync}
              isSyncing={isSyncing}
              onOpenSecurity={isManagerAmouei ? () => setShowSecurityModal(true) : undefined}
              onOpenUsersManagement={isManagerAmouei ? handleOpenUsersManagement : undefined}
            />
          )}

          {activeTab === 'users_management' && (
            <TriSyncInspectorView
              currentEnv={currentEnv}
              currentUser={currentUser}
              onSwitchEnv={(env) => setCurrentEnv(env)}
              isOfflineSimulated={localDb.isOfflineSimulated}
              onToggleOffline={handleToggleOffline}
              onSyncNow={handleManualSync}
              isSyncing={isSyncing}
              syncState={localDb.sync_state}
              onOpenWinCompat={() => setShowWin7Modal(true)}
              onOpenSecurity={() => setShowSecurityModal(true)}
              onOpenUsersManagement={handleOpenUsersManagement}
              activeSubTab={triSyncSubTab}
              onChangeSubTab={(tab) => {
                setTriSyncSubTab(tab);
                setActiveTab('tri_sync');
              }}
              onRefreshDatabase={refreshLocalState}
              onOpenSwitchUser={() => setShowSwitchUserModal(true)}
            />
          )}

          {(activeTab === 'movements' || activeTab === 'cylinder_inspections') && (
            <div className="space-y-4">
              {/* Unified Header & Sub-Tabs Navigation */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/90 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setWarehouseMovementsSubTab('INSPECTIONS');
                      if (activeTab !== 'cylinder_inspections') setActiveTab('cylinder_inspections');
                    }}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      warehouseMovementsSubTab === 'INSPECTIONS'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>ورودی سیلندر تعمیری</span>
                    {(() => {
                      const pendingInspections = localDb.cylinder_valve_inspections?.filter(i => i.status === 'COUNTED_READY_FOR_KARDEX') || [];
                      if (pendingInspections.length > 0) {
                        return (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {toPersianDigits(pendingInspections.length)}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWarehouseMovementsSubTab('MOVEMENTS');
                      if (activeTab !== 'movements') setActiveTab('movements');
                    }}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      warehouseMovementsSubTab === 'MOVEMENTS'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>ورود/خروج انبار</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {toPersianDigits(localDb.stock_movements.length)}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickMovementModal(true)}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500" />
                    <span>ثبت سند ورود/خروج جدید</span>
                  </button>
                </div>
              </div>

              {/* Active Tab View */}
              {warehouseMovementsSubTab === 'INSPECTIONS' ? (
                <CylinderValveInspectionView
                  currentEnv={currentEnv}
                  currentUser={currentUser}
                  customers={localDb.customers}
                  suppliers={localDb.suppliers}
                  inspections={localDb.cylinder_valve_inspections || []}
                  onRefresh={refreshLocalState}
                  onOpenKardexWithInspection={!isHajivand ? (insp) => {
                    setPendingInspectionForKardex(insp);
                    setActiveTab('gas_kardex');
                  } : undefined}
                />
              ) : (
                <MovementsView
                  stockMovements={localDb.stock_movements}
                  products={localDb.products}
                  warehouses={localDb.warehouses}
                  users={localDb.users && localDb.users.length > 0 ? localDb.users : SEED_USERS}
                  currentEnv={currentEnv}
                  currentUser={currentUser}
                  customers={localDb.customers}
                  suppliers={localDb.suppliers}
                  onRefresh={refreshLocalState}
                  onOpenNewMovement={() => setShowQuickMovementModal(true)}
                />
              )}
            </div>
          )}

          {activeTab === 'gas_kardex' && (
            isHajivand ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4 max-w-lg mx-auto my-12" dir="rtl">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
                  <Flame className="w-7 h-7" />
                </div>
                <h2 className="text-base font-bold text-white">عدم دسترسی به کاردکس تعمیر سیلندر</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  کاربر محترم مهندس حاجی‌وند، دسترسی به این بخش طبق ضوابط کارخانه منحصراً در اختیار مدیریت و مدیر داخلی (خانم کرمی) می‌باشد و برای انباردار غیرمجاز است.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWarehouseMovementsSubTab('INSPECTIONS');
                    setActiveTab('movements');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  انتقال به ورود و خروج انبار و سیلندر
                </button>
              </div>
            ) : (
              <GasKardexView
                currentEnv={currentEnv}
                currentUser={currentUser}
                customers={localDb.customers}
                initialCustomerId={selectedGasCustomerId}
                onCustomerChange={(id) => setSelectedGasCustomerId(id)}
                pendingInspectionToRegister={pendingInspectionForKardex}
                onClearPendingInspection={() => setPendingInspectionForKardex(null)}
                onNavigateToInspections={() => {
                  setWarehouseMovementsSubTab('INSPECTIONS');
                  setActiveTab('movements');
                }}
                onNavigateToProductionKardex={() => setActiveTab('gas_production_kardex')}
                onRefresh={refreshLocalState}
              />
            )
          )}

          {activeTab === 'gas_production_kardex' && (
            isHajivand ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4 max-w-lg mx-auto my-12" dir="rtl">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
                  <Boxes className="w-7 h-7" />
                </div>
                <h2 className="text-base font-bold text-white">عدم دسترسی به کاردکس تولید ام‌گاز</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  کاربر محترم مهندس حاجی‌وند، دسترسی به کاردکس تولید ام‌گاز منحصراً در اختیار مدیریت و واحدهای مجاز می‌باشد.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWarehouseMovementsSubTab('INSPECTIONS');
                    setActiveTab('movements');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  انتقال به ورود و خروج انبار و سیلندر
                </button>
              </div>
            ) : (
              <GasProductionKardexView
                currentEnv={currentEnv}
                currentUser={currentUser}
                onNavigateToRepairKardex={() => setActiveTab('gas_kardex')}
                onRefresh={refreshLocalState}
              />
            )
          )}

          {activeTab === 'cylinder_tanks_catalog' && isManagerAmouei && (
            <TriSyncInspectorView
              currentEnv={currentEnv}
              currentUser={currentUser}
              onSwitchEnv={(env) => setCurrentEnv(env)}
              isOfflineSimulated={localDb.isOfflineSimulated}
              onToggleOffline={handleToggleOffline}
              onSyncNow={handleManualSync}
              isSyncing={isSyncing}
              syncState={localDb.sync_state}
              onOpenWinCompat={() => setShowWin7Modal(true)}
              onOpenSecurity={() => setShowSecurityModal(true)}
              onOpenUsersManagement={handleOpenUsersManagement}
              activeSubTab={triSyncSubTab}
              onChangeSubTab={(tab) => {
                setTriSyncSubTab(tab);
                setActiveTab('tri_sync');
              }}
              onRefreshDatabase={refreshLocalState}
              onOpenSwitchUser={() => setShowSwitchUserModal(true)}
              onNavigateToRepairKardex={() => setActiveTab('gas_kardex')}
              onNavigateToProductionKardex={() => setActiveTab('gas_production_kardex')}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              products={localDb.products}
              categories={localDb.categories}
              warehouses={localDb.warehouses}
              stockQuantities={stockQuantities}
              currentEnv={currentEnv}
              currentUser={currentUser}
              initialStatusFilter={inventoryStatusFilter}
              openSkuPrintDirectly={openSkuPrintDirectly}
              onCloseSkuPrintDirectly={() => setOpenSkuPrintDirectly(false)}
              onOpenNewMovement={() => setShowQuickMovementModal(true)}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              products={localDb.products}
              categories={localDb.categories}
              warehouses={localDb.warehouses}
              stockMovements={localDb.stock_movements}
              stockQuantities={stockQuantities}
              currentEnv={currentEnv}
              currentUser={currentUser}
              customers={localDb.customers}
              suppliers={localDb.suppliers}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              customers={localDb.customers}
              currentEnv={currentEnv}
              currentUser={currentUser}
              onOpenGasKardex={!isHajivand ? (custId) => {
                setSelectedGasCustomerId(custId);
                setActiveTab('gas_kardex');
              } : undefined}
              onRefresh={refreshLocalState}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={localDb.suppliers}
              currentEnv={currentEnv}
              currentUser={currentUser}
              onRefresh={refreshLocalState}
              onSwitchToCustomers={() => setActiveTab('customers')}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesView
              invoices={localDb.invoices}
              customers={localDb.customers}
              suppliers={localDb.suppliers}
              products={localDb.products}
              categories={localDb.categories}
              warehouses={localDb.warehouses}
              stockMovements={localDb.stock_movements}
              stockQuantities={stockQuantities}
              users={localDb.users && localDb.users.length > 0 ? localDb.users : SEED_USERS}
              currentEnv={currentEnv}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'tri_sync' && isManagerAmouei && (
            <TriSyncInspectorView
              currentEnv={currentEnv}
              currentUser={currentUser}
              onSwitchEnv={(env) => setCurrentEnv(env)}
              isOfflineSimulated={localDb.isOfflineSimulated}
              onToggleOffline={handleToggleOffline}
              onSyncNow={handleManualSync}
              isSyncing={isSyncing}
              syncState={localDb.sync_state}
              onOpenWinCompat={() => setShowWin7Modal(true)}
              onOpenSecurity={() => setShowSecurityModal(true)}
              onOpenUsersManagement={handleOpenUsersManagement}
              activeSubTab={triSyncSubTab}
              onChangeSubTab={(tab) => setTriSyncSubTab(tab)}
              onRefreshDatabase={refreshLocalState}
              onOpenSwitchUser={() => setShowSwitchUserModal(true)}
              onNavigateToRepairKardex={() => setActiveTab('gas_kardex')}
              onNavigateToProductionKardex={() => setActiveTab('gas_production_kardex')}
            />
          )}

          {activeTab === 'sync_queue' && isManagerAmouei && (
            <SyncQueueView
              syncQueue={localDb.sync_queue}
              currentEnv={currentEnv}
              currentUser={currentUser}
              onRefresh={refreshLocalState}
            />
          )}

          {activeTab === 'audit' && isManagerAmouei && (
            <AuditLogView
              auditLogs={localDb.audit_logs}
              currentEnv={currentEnv}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'backup' && isManagerAmouei && (
            <BackupRestoreView
              currentEnv={currentEnv}
              currentUser={currentUser}
              onRefresh={refreshLocalState}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav aria-label="منوی دسترسی سریع موبایل" className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 z-30 flex items-center justify-around py-1 pb-2 sm:pb-1.5 px-1 select-none shadow-2xl">
        <button
          onClick={() => {
            setActiveTab('dashboard');
            refreshLocalState();
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'dashboard'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>داشبورد</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('cylinder_inspections');
            refreshLocalState();
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer relative ${
            activeTab === 'cylinder_inspections'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PackageCheck className="w-4 h-4 shrink-0" />
          <span className="truncate max-w-[68px]">ورودی شیر</span>
        </button>

        {!isHajivand && (
          <button
            onClick={() => {
              setActiveTab('gas_kardex');
              refreshLocalState();
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer relative ${
              activeTab === 'gas_kardex'
                ? 'text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-4 h-4 shrink-0" />
            <span>کاردکس</span>
            {(localDb.cylinder_valve_inspections?.filter(i =>
              isPendingRepairCylinderKardex(i, localDb.custom_cylinder_item_types)
            ).length || 0) > 0 && (
              <span className="absolute top-1 right-1/4 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        )}

        <button
          onClick={() => {
            setActiveTab('inventory');
            refreshLocalState();
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'inventory'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4 shrink-0" />
          <span>تعریف کالا</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('invoices');
            refreshLocalState();
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'invoices'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>فاکتورها</span>
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(prev => !prev)}
          className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors cursor-pointer relative ${
            isMobileMenuOpen
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Menu className="w-4 h-4 shrink-0" />
          <span>منو</span>
          {pendingQueueCount > 0 && (
            <span className="absolute top-1 right-1/4 px-1 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
              {toPersianDigits(pendingQueueCount)}
            </span>
          )}
        </button>
      </nav>

      {/* GLOBAL QUICK STOCK MOVEMENT MODAL */}
      {/* GLOBAL QUICK STOCK MOVEMENT MODAL */}
      {showQuickMovementModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl lg:max-w-4xl shadow-2xl overflow-hidden cursor-default h-[88vh] max-h-[88vh] flex flex-col my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">ثبت سند گردش و جابجایی انبار</h3>
                  <p className="text-[11px] text-slate-400">ثبت رسمی در لجر با توالی انحصاری و بروزرسانی لحظه‌ای موجودی انبارها</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickMovementModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="بستن پنجره"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickMovement} className="flex flex-col flex-1 overflow-hidden min-h-0 text-xs">
              <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0 overscroll-contain">
                {/* Active User Registrant Indicator */}
                <div className="flex items-center justify-between px-3.5 py-2 bg-indigo-950/40 border border-indigo-700/50 rounded-xl text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400">کاربر ثبت‌کننده سند:</span>
                    <span className="font-bold text-white">{currentUser.full_name}</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-900/60 text-indigo-300 text-[10px] font-bold border border-indigo-700/60">
                    {currentUser.role_title || (currentUser.role === 'ADMIN' ? 'مدیریت ارشد' : 'مدیر داخلی')}
                  </span>
                </div>

                {/* 1. TOPMOST: Segmented Movement Type Selector Buttons */}
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-200">
                    نوع عملیات و گردش انبار:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickMovForm({ ...quickMovForm, movement_type: 'STOCK_IN' })}
                      className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        quickMovForm.movement_type === 'STOCK_IN'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/50 ring-2 ring-emerald-500/30'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>رسید ورود (+)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickMovForm({ ...quickMovForm, movement_type: 'STOCK_OUT' })}
                      className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        quickMovForm.movement_type === 'STOCK_OUT'
                          ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/50 ring-2 ring-rose-500/30'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      <span>حواله خروج (-)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const currentSource = quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id || 'WH-VALVES';
                        const currentDest = quickMovForm.to_warehouse_id === currentSource
                          ? (localDb.warehouses.find(w => w.warehouse_id !== currentSource)?.warehouse_id || 'WH-SUPPLIES')
                          : (quickMovForm.to_warehouse_id || localDb.warehouses.find(w => w.warehouse_id !== currentSource)?.warehouse_id || 'WH-SUPPLIES');
                        setQuickMovForm({
                          ...quickMovForm,
                          movement_type: 'TRANSFER_OUT',
                          warehouse_id: currentSource,
                          to_warehouse_id: currentDest
                        });
                      }}
                      className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        quickMovForm.movement_type === 'TRANSFER_OUT'
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-950/50 ring-2 ring-indigo-500/40'
                          : 'bg-slate-950/80 border-slate-800 text-indigo-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-indigo-200" />
                      <span>جابجایی بین انبارها</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickMovForm({ ...quickMovForm, movement_type: 'ADJUSTMENT' })}
                      className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        quickMovForm.movement_type === 'ADJUSTMENT'
                          ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-950/50 ring-2 ring-amber-500/30'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span>تعدیل انبارگردانی</span>
                    </button>
                  </div>

                  {/* Informational Alerts based on Movement Type */}
                  {quickMovForm.movement_type === 'STOCK_IN' && (
                    <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/50 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 animate-ping" />
                        <span>
                          <strong>تفکیک فرم ورودی:</strong> اقلام دسته شیرآلات و اتصالات فشارقوی در فرم ورود حذف شده‌اند، زیرا ثبت ورود آن‌ها دارای فرم اختصاصی مجزا می‌باشد.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickMovementModal(false);
                          window.dispatchEvent(new CustomEvent('mgas:open_valve_intake_modal'));
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] shrink-0 cursor-pointer transition-colors active:scale-95 shadow-sm self-start sm:self-auto flex items-center gap-1"
                      >
                        <span>فرم اختصاصی ورودی شیرآلات</span>
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {quickMovForm.movement_type === 'STOCK_OUT' && (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-600/50 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                        <span>
                          <strong>خروج کالا و شیرآلات:</strong> در صورت انتخاب شیر متعلق به مشتری، ردیف گردش و همچنین «توضیحات و شرح گردش» مستقیماً در کاردکس تعمیرات سیلندر ثبت خواهد شد.
                        </span>
                      </div>
                      {isCurrentProductValve && (
                        <span className="px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-600/60 font-mono text-[10px] shrink-0 font-bold">
                          کاردکس تعمیر مشتری
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Party Selector Box (طرف حساب سند گردش انبار: تأمین‌کنندگان ام‌گاز یا مشتریان) */}
                {quickMovForm.movement_type !== 'ADJUSTMENT' && (
                  <div className="p-3.5 rounded-2xl bg-slate-950/95 border-2 border-indigo-600/70 shadow-lg space-y-3 text-xs animate-fadeIn">
                    {/* Switch for separating M-Gas Suppliers and Customers */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800">
                      <label htmlFor="quick-movement-party-select" className="text-xs font-extrabold text-slate-100 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-4 ring-indigo-400/20 shrink-0" />
                        <span className="text-sm font-black">طرف حساب سند گردش انبار:</span>
                      </label>

                      {/* Segmented Switch */}
                      <div className="inline-flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 gap-1 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setPartyTypeSwitch('SUPPLIER');
                            setQuickMovForm(prev => ({
                              ...prev,
                              party_type: 'SUPPLIER',
                              valve_ownership: 'MGAS',
                              customer_id: '',
                              customer_name: 'شرکت ام‌گاز',
                              supplier_id: 'SUP-MGAS-BRANCH',
                              supplier_name: 'شعبه ام گاز (انبار مرکزی)'
                            }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                            partyTypeSwitch === 'SUPPLIER'
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50 ring-1 ring-indigo-400/40'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5 shrink-0" />
                          <span>تأمین‌کنندگان ام‌گاز</span>
                          <span className="text-[10px] opacity-80 font-mono">({toPersianDigits((localDb.suppliers?.length || 0) + 1)})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPartyTypeSwitch('CUSTOMER');
                            const firstCust = localDb.customers?.[0];
                            setQuickMovForm(prev => ({
                              ...prev,
                              party_type: 'CUSTOMER',
                              valve_ownership: 'CUSTOMER',
                              customer_id: firstCust?.customer_id || '',
                              customer_name: firstCust?.name || '',
                              supplier_id: '',
                              supplier_name: ''
                            }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                            partyTypeSwitch === 'CUSTOMER'
                              ? 'bg-amber-600 text-white shadow-md shadow-amber-900/50 ring-1 ring-amber-400/40'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>مشتریان</span>
                          <span className="text-[10px] opacity-80 font-mono">({toPersianDigits(localDb.customers?.length || 0)})</span>
                        </button>
                      </div>
                    </div>

                    {isCurrentProductValve && quickMovForm.movement_type === 'STOCK_OUT' && (
                      <div className="p-2 bg-amber-950/60 border border-amber-600/60 rounded-xl text-amber-300 text-[11px] flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          این قلم کالا جزو شیرآلات است؛ خروج آن عینا به نام مشتری منتخب در کاردکس تعمیر سیلندر ثبت و ردیابی می‌گردد.
                        </span>
                      </div>
                    )}

                    {/* Dropdown list populated based on the selected switch */}
                    <div className="relative">
                      {partyTypeSwitch === 'SUPPLIER' ? (
                        <select
                          id="quick-movement-party-select"
                          value={quickMovForm.supplier_id || 'SUP-MGAS-BRANCH'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'MGAS' || val === 'SUP-MGAS-BRANCH') {
                              setQuickMovForm(prev => ({
                                ...prev,
                                party_type: 'SUPPLIER',
                                valve_ownership: 'MGAS',
                                customer_id: '',
                                customer_name: 'شرکت ام‌گاز',
                                supplier_id: 'SUP-MGAS-BRANCH',
                                supplier_name: 'شعبه ام گاز (انبار مرکزی)'
                              }));
                            } else {
                              const foundSup = localDb.suppliers?.find(s => s.supplier_id === val);
                              setQuickMovForm(prev => ({
                                ...prev,
                                party_type: 'SUPPLIER',
                                valve_ownership: 'MGAS',
                                customer_id: '',
                                customer_name: foundSup?.company_name || foundSup?.name || 'تأمین‌کننده ام‌گاز',
                                supplier_id: val,
                                supplier_name: foundSup ? `${foundSup.name} (${foundSup.company_name})` : val
                              }));
                            }
                          }}
                          className="w-full p-2.5 bg-slate-900 border border-slate-700/80 hover:border-indigo-500 rounded-xl text-slate-100 font-sans text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 cursor-pointer shadow-inner"
                          title="انتخاب تأمین‌کننده ام‌گاز"
                        >
                          <option value="SUP-MGAS-BRANCH" className="bg-slate-900 text-emerald-300 font-bold py-1">
                            🏢 شرکت ام‌گاز (شعبه و انبار مرکزی تأمین شیرآلات و تجهیزات)
                          </option>
                          {localDb.suppliers?.filter(s => s.supplier_id !== 'SUP-MGAS-BRANCH').map((s) => (
                            <option key={s.supplier_id} value={s.supplier_id} className="bg-slate-900 text-slate-100 py-1">
                              تأمین‌کننده: {s.name} - {s.company_name} (شناسه: {s.supplier_id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          id="quick-movement-party-select"
                          value={quickMovForm.customer_id || (localDb.customers[0]?.customer_id || '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            const foundCust = localDb.customers?.find(c => c.customer_id === val);
                            setQuickMovForm(prev => ({
                              ...prev,
                              party_type: 'CUSTOMER',
                              valve_ownership: 'CUSTOMER',
                              customer_id: val,
                              customer_name: foundCust?.name || '',
                              supplier_id: '',
                              supplier_name: ''
                            }));
                          }}
                          className="w-full p-2.5 bg-slate-900 border border-slate-700/80 hover:border-amber-500 rounded-xl text-slate-100 font-sans text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-400 cursor-pointer shadow-inner"
                          title="انتخاب مشتری ام‌گاز"
                        >
                          {localDb.customers?.map((c) => (
                            <option key={c.customer_id} value={c.customer_id} className="bg-slate-900 text-slate-100 py-1">
                              مشتری: {c.name} {c.company_name ? `(${c.company_name})` : ''} - شناسه: {c.customer_id}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Product Search & Select */}
                <ProductSearchSelect
                  products={availableMovementProducts}
                  categories={availableMovementCategories}
                  stockQuantities={stockQuantities}
                  selectedProductId={quickMovForm.product_id || availableMovementProducts[0]?.product_id || ''}
                  selectedWarehouseId={quickMovForm.warehouse_id}
                  onChange={(id) => setQuickMovForm({ ...quickMovForm, product_id: id })}
                  label="انتخاب کالا برای گردش انبار"
                  infoBadge={
                    quickMovForm.movement_type === 'STOCK_IN' ? (
                      <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-800/50 text-[11px] text-emerald-300 flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <span>
                            اقلام شیرآلات و اتصالات فشارقوی برای ورود فیلتر شده‌اند (ورود اختصاصی دارند).
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-700/50 shrink-0">
                          {toPersianDigits(availableMovementProducts.length)} قلم کالا
                        </span>
                      </div>
                    ) : quickMovForm.movement_type === 'ADJUSTMENT' ? (
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-indigo-800/50 text-[11px] text-slate-300 flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span>
                            تعدیل انبارگردانی برای کلیه کالاها از جمله شیرآلات مجاز می‌باشد.
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/50 shrink-0">
                          {toPersianDigits(availableMovementProducts.length)} قلم کالا
                        </span>
                      </div>
                    ) : undefined
                  }
                  required
                />

                {/* TRANSFER MODE: 2-Column Comparative Warehouse & Condition Layout */}
                {quickMovForm.movement_type === 'TRANSFER_OUT' ? (
                  <div className="bg-gradient-to-b from-indigo-950/40 to-slate-900 border border-indigo-700/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-indigo-800/60 pb-2.5">
                      <div className="flex items-center gap-2 text-indigo-200 font-bold text-xs">
                        <ArrowLeftRight className="w-4 h-4 text-indigo-400 animate-pulse" />
                        <span>تنظیمات انبار مبدأ و انبار مقصد برای جابجایی بین انبارها</span>
                      </div>
                      <span className="text-[10px] bg-indigo-900/90 text-indigo-200 px-2 py-0.5 rounded-md border border-indigo-700/60 font-mono">
                        Inter-Warehouse Transfer
                      </span>
                    </div>

                    {/* Source & Destination Side-by-Side Columns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Column 1: Source Warehouse & Shelf */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <label className="font-bold text-xs text-rose-300 flex items-center gap-1.5">
                            <span>📤 انبار مبدأ (ارسال‌کننده کالا) *</span>
                          </label>
                          <span className="text-[10px] text-slate-400">کسر موجودی</span>
                        </div>

                        {/* Interactive Warehouse Buttons for Source */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] text-slate-400 block font-medium">انتخاب انبار ارسال‌کننده:</span>
                          <div className="grid grid-cols-1 gap-1.5">
                            {localDb.warehouses.map(w => {
                              const isSelected = (quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id) === w.warehouse_id;
                              return (
                                <button
                                  key={w.warehouse_id}
                                  type="button"
                                  onClick={() => {
                                    const nextToWh = quickMovForm.to_warehouse_id === w.warehouse_id
                                      ? localDb.warehouses.find(other => other.warehouse_id !== w.warehouse_id)?.warehouse_id || ''
                                      : quickMovForm.to_warehouse_id;
                                    setQuickMovForm({ ...quickMovForm, warehouse_id: w.warehouse_id, to_warehouse_id: nextToWh });
                                    const letter = w.shelf_letter || w.shelf_location?.match(/[A-Z]/i)?.[0]?.toUpperCase() || 'A';
                                    const num = w.shelf_number || parseInt(w.shelf_location?.replace(/[^0-9]/g, '') || '1', 10) || 1;
                                    setQuickShelfLetter(letter);
                                    setQuickShelfNumber(num);
                                  }}
                                  className={`p-2 rounded-lg border text-right transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                    isSelected
                                      ? 'bg-rose-950/80 border-rose-500 text-rose-100 ring-2 ring-rose-500/40 shadow-sm'
                                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-rose-400' : 'bg-slate-600'}`} />
                                    <span className="font-bold text-xs">{w.name}</span>
                                  </div>
                                  <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                    {w.code || w.warehouse_id}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Shelf Location for Source */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-300">محل قفسه در انبار مبدأ:</span>
                            <span className="font-mono font-bold text-xs bg-rose-950/80 text-rose-300 border border-rose-700/60 px-2 py-0.5 rounded">
                              {quickShelfLetter}{quickShelfNumber}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <select
                                value={quickShelfLetter}
                                onChange={(e) => setQuickShelfLetter(e.target.value)}
                                className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold text-xs cursor-pointer focus:border-rose-500"
                                title="ردیف قفسه مبدأ"
                              >
                                {SHELF_LETTERS.map(l => (
                                  <option key={l} value={l}>ردیف {l}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <select
                                value={quickShelfNumber}
                                onChange={(e) => setQuickShelfNumber(Number(e.target.value))}
                                className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold text-xs cursor-pointer focus:border-rose-500"
                                title="شماره قفسه مبدأ"
                              >
                                {SHELF_NUMBERS.map(n => (
                                  <option key={n} value={n}>شماره {n}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Destination Warehouse & Shelf */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <label className="font-bold text-xs text-emerald-300 flex items-center gap-1.5">
                            <span>📥 انبار مقصد (دریافت‌کننده کالا) *</span>
                          </label>
                          <span className="text-[10px] text-slate-400">افزایش موجودی</span>
                        </div>

                        {/* Interactive Warehouse Buttons for Destination */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] text-slate-400 block font-medium">انتخاب انبار دریافت‌کننده:</span>
                          <div className="grid grid-cols-1 gap-1.5">
                            {localDb.warehouses.map(w => {
                              const currentSource = quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id;
                              const isSource = w.warehouse_id === currentSource;
                              const currentDest = quickMovForm.to_warehouse_id || localDb.warehouses.find(other => other.warehouse_id !== currentSource)?.warehouse_id;
                              const isSelected = currentDest === w.warehouse_id;

                              return (
                                <button
                                  key={w.warehouse_id}
                                  type="button"
                                  disabled={isSource}
                                  onClick={() => {
                                    if (isSource) return;
                                    setQuickMovForm({ ...quickMovForm, to_warehouse_id: w.warehouse_id });
                                    const letter = w.shelf_letter || w.shelf_location?.match(/[A-Z]/i)?.[0]?.toUpperCase() || 'B';
                                    const num = w.shelf_number || parseInt(w.shelf_location?.replace(/[^0-9]/g, '') || '1', 10) || 1;
                                    setQuickDestShelfLetter(letter);
                                    setQuickDestShelfNumber(num);
                                  }}
                                  className={`p-2 rounded-lg border text-right transition-all flex items-center justify-between gap-2 ${
                                    isSource
                                      ? 'opacity-40 bg-slate-950 border-slate-900 text-slate-500 cursor-not-allowed'
                                      : isSelected
                                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-100 ring-2 ring-emerald-500/40 shadow-sm cursor-pointer'
                                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSource ? 'bg-slate-700' : isSelected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                    <span className="font-bold text-xs">{w.name}</span>
                                  </div>
                                  {isSource ? (
                                    <span className="text-[10px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800">
                                      انبار مبدأ
                                    </span>
                                  ) : (
                                    <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                      {w.code || w.warehouse_id}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Shelf Location for Destination */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-300">محل قفسه در انبار مقصد:</span>
                            <span className="font-mono font-bold text-xs bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded">
                              {quickDestShelfLetter}{quickDestShelfNumber}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <select
                                value={quickDestShelfLetter}
                                onChange={(e) => setQuickDestShelfLetter(e.target.value)}
                                className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold text-xs cursor-pointer focus:border-emerald-500"
                                title="ردیف قفسه مقصد"
                              >
                                {SHELF_LETTERS.map(l => (
                                  <option key={l} value={l}>ردیف {l}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <select
                                value={quickDestShelfNumber}
                                onChange={(e) => setQuickDestShelfNumber(Number(e.target.value))}
                                className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold text-xs cursor-pointer focus:border-emerald-500"
                                title="شماره قفسه مقصد"
                              >
                                {SHELF_NUMBERS.map(n => (
                                  <option key={n} value={n}>شماره {n}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Valve Condition Selection (سالم است یا معیوب شده؟) */}
                    <div className="pt-3 border-t border-indigo-900/60 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <label className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          <span>وضعیت شیر انتقالی / برگشتی (تعیین سالم یا معیوب بودن):</span>
                        </label>
                        <span className="text-[11px] text-amber-300 font-medium bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/40">
                          آیا شیر نو سالم مانده یا معیوب شده است؟
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Healthy Option Button Card */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'HEALTHY' }))}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              setQuickMovForm(prev => ({ ...prev, valve_condition: 'HEALTHY' }));
                            }
                          }}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none active:scale-[0.99] ${
                            quickMovForm.valve_condition === 'HEALTHY'
                              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100 shadow-md ring-2 ring-emerald-500/40'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                          }`}
                        >
                          <input
                            type="radio"
                            id="quick_valve_cond_healthy"
                            name="quick_valve_cond"
                            value="HEALTHY"
                            checked={quickMovForm.valve_condition === 'HEALTHY'}
                            onChange={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'HEALTHY' }))}
                            className="mt-1 w-4 h-4 text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                          />
                          <label htmlFor="quick_valve_cond_healthy" className="space-y-1 cursor-pointer">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-xs text-emerald-300">🟢 شیر سالم است</span>
                              <span className="text-[10px] bg-emerald-900/90 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-700/60 font-sans font-bold">
                                نو و قابل استفاده
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              شیر کاملاً سالم است. موجودی «قطعه شیر نو» در انبار مبدأ کسر و به انبار مقصد افزوده می‌شود.
                            </p>
                          </label>
                        </div>

                        {/* Defective Option Button Card */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'DEFECTIVE' }))}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              setQuickMovForm(prev => ({ ...prev, valve_condition: 'DEFECTIVE' }));
                            }
                          }}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none active:scale-[0.99] ${
                            quickMovForm.valve_condition === 'DEFECTIVE'
                              ? 'bg-rose-950/90 border-rose-500 text-rose-100 shadow-md ring-2 ring-rose-500/40'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                          }`}
                        >
                          <input
                            type="radio"
                            id="quick_valve_cond_defective"
                            name="quick_valve_cond"
                            value="DEFECTIVE"
                            checked={quickMovForm.valve_condition === 'DEFECTIVE'}
                            onChange={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'DEFECTIVE' }))}
                            className="mt-1 w-4 h-4 text-rose-600 focus:ring-rose-500 shrink-0 cursor-pointer"
                          />
                          <label htmlFor="quick_valve_cond_defective" className="space-y-1 cursor-pointer">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-xs text-rose-300">🔴 شیر معیوب شده است</span>
                              <span className="text-[10px] bg-rose-900/90 text-rose-200 px-1.5 py-0.5 rounded border border-rose-700/60 font-sans font-bold">
                                خراب / ضایعات / اسقاط
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              شیر نو در انبار دیگر معیوب شده است. این مقدار از شیر نو انبار مبدأ کسر و به عنوان <strong className="text-rose-300 font-bold">«قطعه شیر معیوب و ضایعات»</strong> در انبار مقصد وارد می‌گردد.
                            </p>
                          </label>
                        </div>
                      </div>

                      {/* Live summary banner */}
                      <div className="bg-slate-950/90 p-3 rounded-xl border border-indigo-700/40 text-[11px] text-slate-200 flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0 animate-pulse" />
                        <span>
                          گردش انتقال فعال: موجودی انبار مبدأ (<strong>{localDb.warehouses.find(w => w.warehouse_id === (quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id))?.name}</strong>) کاهش یافته و موجودی انبار مقصد (<strong>{localDb.warehouses.find(w => w.warehouse_id === (quickMovForm.to_warehouse_id || localDb.warehouses.find(x => x.warehouse_id !== (quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id))?.warehouse_id))?.name}</strong>) همزمان بروزرسانی خواهد شد.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard Mode for STOCK_IN, STOCK_OUT, ADJUSTMENT */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-300 mb-1">انبار محل استقرار *</label>
                      <select
                        value={quickMovForm.warehouse_id || localDb.warehouses[0]?.warehouse_id}
                        onChange={(e) => {
                          const whId = e.target.value;
                          setQuickMovForm({ ...quickMovForm, warehouse_id: whId });
                          const targetWh = localDb.warehouses.find(w => w.warehouse_id === whId);
                          if (targetWh) {
                            const letter = targetWh.shelf_letter || targetWh.shelf_location?.match(/[A-Z]/i)?.[0]?.toUpperCase() || 'A';
                            const num = targetWh.shelf_number || parseInt(targetWh.shelf_location?.replace(/[^0-9]/g, '') || '1', 10) || 1;
                            setQuickShelfLetter(letter);
                            setQuickShelfNumber(num);
                          }
                        }}
                        className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {localDb.warehouses.map(w => (
                          <option key={w.warehouse_id} value={w.warehouse_id}>
                            {w.name} {w.shelf_location ? `(قفسه ${w.shelf_location})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-200">محل استقرار قفسه</label>
                        <span className="font-mono font-bold text-xs bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded shadow-sm">
                          {quickShelfLetter}{quickShelfNumber}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={quickShelfLetter}
                          onChange={(e) => setQuickShelfLetter(e.target.value)}
                          className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold focus:outline-none focus:border-indigo-500"
                          title="منوی حروف انگلیسی"
                        >
                          {SHELF_LETTERS.map(l => (
                            <option key={l} value={l}>ردیف {l}</option>
                          ))}
                        </select>
                        <select
                          value={quickShelfNumber}
                          onChange={(e) => setQuickShelfNumber(Number(e.target.value))}
                          className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-center font-bold focus:outline-none focus:border-indigo-500"
                          title="منوی عدد"
                        >
                          {SHELF_NUMBERS.map(n => (
                            <option key={n} value={n}>شماره {n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Item Condition (نو و سالم یا کهنه و مستعمل/معیوب) when not transfer */}
                {quickMovForm.movement_type !== 'TRANSFER_OUT' && (
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>کیفیت و وضعیت فیزیکی کالا / شیرآلات:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        quickMovForm.valve_condition === 'HEALTHY'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {quickMovForm.valve_condition === 'HEALTHY' ? 'نو و سالم' : 'کهنه / کارکرده / اسقاط'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'HEALTHY' }))}
                        className={`p-2 rounded-lg border text-center font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          quickMovForm.valve_condition === 'HEALTHY'
                            ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 shadow-xs ring-1 ring-emerald-500/50'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span>نو و سالم (استاندارد)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickMovForm(prev => ({ ...prev, valve_condition: 'DEFECTIVE' }))}
                        className={`p-2 rounded-lg border text-center font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          quickMovForm.valve_condition === 'DEFECTIVE'
                            ? 'bg-amber-950/90 border-amber-500 text-amber-300 shadow-xs ring-1 ring-amber-500/50'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span>کهنه / تعمیری / اسقاط</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Quantity & Reference ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-medium text-slate-300 mb-1">تعداد / مقدار (اعشاری یا صحیح) *</label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      required
                      value={quickMovForm.quantity}
                      onChange={(e) => setQuickMovForm({ ...quickMovForm, quantity: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === ',' || e.key === '/' || e.key === '٫') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          const start = input.selectionStart || 0;
                          const end = input.selectionEnd || 0;
                          const val = input.value;
                          if (!val.includes('.')) {
                            const newVal = val.slice(0, start) + '.' + val.slice(end);
                            setQuickMovForm({ ...quickMovForm, quantity: newVal });
                          }
                        }
                      }}
                      placeholder="مثال: 1 یا 2.5"
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">شماره سند / بارنامه / فاکتور *</label>
                    <input
                      type="text"
                      required
                      value={quickMovForm.reference_id}
                      onChange={(e) => setQuickMovForm({ ...quickMovForm, reference_id: e.target.value })}
                      placeholder="مثال: بارنامه شماره 98745"
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Driver Name & Plate Number (Optional Logistics Details) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-300 mb-1 text-xs">نام راننده / تحویل‌گیرنده یا دهنده</label>
                    <input
                      type="text"
                      value={quickMovForm.driver_name || ''}
                      onChange={(e) => setQuickMovForm({ ...quickMovForm, driver_name: e.target.value })}
                      placeholder="مثال: آقای اکبری"
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1 text-xs">شماره پلاک خودرو</label>
                    <input
                      type="text"
                      value={quickMovForm.plate_number || ''}
                      onChange={(e) => setQuickMovForm({ ...quickMovForm, plate_number: e.target.value })}
                      placeholder="مثال: ایران 11 - 123 ب 45"
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500 text-left dir-ltr"
                    />
                  </div>
                </div>

                {/* Accounting destination callout */}
                <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  quickMovForm.party_type === 'CUSTOMER'
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-current shrink-0 animate-pulse" />
                    <span>
                      {quickMovForm.party_type === 'CUSTOMER'
                        ? `حساب مشتری: این گردش مستقیماً در کاردکس تعمیر مشتری لحاظ شده و برگه رسمی صدور می‌گردد.`
                        : `حساب تأمین‌کننده: این گردش در موجودی انبار اختصاصی ام‌گاز اعمال و برگه رسمی صدور می‌گردد.`}
                    </span>
                  </div>
                  <span className="font-bold text-[10px] bg-slate-950/80 px-2 py-0.5 rounded border border-current font-mono">
                    {quickMovForm.party_type === 'CUSTOMER' ? 'کاردکس تعمیر' : 'موجودی ام‌گاز'}
                  </span>
                </div>

                {/* Notes and Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block font-medium text-slate-300">توضیحات و شرح گردش</label>
                    {isCurrentProductValve && quickMovForm.movement_type === 'STOCK_OUT' && (
                      <span className="text-[11px] text-amber-300 font-bold flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/60">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ثبت در کاردکس تعمیر سیلندر مشتری
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={quickMovForm.notes}
                    onChange={(e) => setQuickMovForm({ ...quickMovForm, notes: e.target.value })}
                    placeholder={
                      isCurrentProductValve && quickMovForm.movement_type === 'STOCK_OUT'
                        ? "توضیحات تکمیلی یا علت تعویض/تحویل شیر به مشتری (عینا در ردیف کاردکس تعمیر و رسید حواله خروج ثبت می‌گردد)..."
                        : "توضیحات تکمیلی گردش انبار و علت جابجایی..."
                    }
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
                  />
                  {isCurrentProductValve && quickMovForm.movement_type === 'STOCK_OUT' && (
                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                      * با ثبت این حواله خروج، این شرح و توضیحات علاوه بر سند گردش انبار، در ردیف کاردکس تعمیر سیلندر مشتری مربوطه نیز درج خواهد شد.
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons footer: fixed at bottom and always 100% visible and accessible */}
              <div className="p-3.5 sm:px-6 sm:py-4 border-t border-slate-800 bg-slate-950/98 backdrop-blur z-30 shrink-0 flex items-center justify-between gap-3 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setShowQuickMovementModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold transition-all cursor-pointer text-xs active:scale-95 flex items-center gap-1.5 border border-slate-700/60"
                >
                  <X className="w-4 h-4" />
                  <span>انصراف</span>
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg shadow-indigo-600/30 transition-all cursor-pointer text-xs flex items-center gap-2 active:scale-95 border border-indigo-400/30"
                >
                  <ArrowLeftRight className="w-4 h-4 shrink-0" />
                  <span>ثبت سند و همگام‌سازی انبارها</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WINDOWS 7 COMPATIBILITY MODAL */}
      <Windows7NoticeModal
        isOpen={showWin7Modal}
        onClose={() => setShowWin7Modal(false)}
        onOpenTroubleshooting={() => setShowTroubleshootingModal(true)}
      />

      {/* WINDOWS 7 PREREQUISITES & TROUBLESHOOTING CHECKLIST MODAL */}
      <Windows7TroubleshootingModal
        isOpen={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
      />

      {/* WINDOWS 11 PREREQUISITES & IN-FOLDER LOGGING CHECKLIST MODAL */}
      <Windows11TroubleshootingModal
        isOpen={showWin11TroubleshootingModal}
        onClose={() => setShowWin11TroubleshootingModal(false)}
      />

      {/* SECURITY SETTINGS & DATABASE PROTECTION MODAL */}
      <SecuritySettingsModal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          refreshLocalState();
        }}
        currentUser={currentUser}
        currentEnv={currentEnv}
      />

      {/* SWITCH USER / LOGIN MODAL */}
      {showSwitchUserModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowSwitchUserModal(false)}
        >
          <div
            className="relative w-full max-w-lg cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSwitchUserModal(false)}
              className="absolute top-4 left-4 z-50 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              انصراف و بازگشت
            </button>
            <LoginView
              currentActiveUser={currentUser}
              currentEnv={currentEnv}
              onLoginSuccess={handleLoginSuccess}
            />
          </div>
        </div>
      )}

      <NotificationsCenterModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        notifications={visibleNotifications}
        currentUser={currentUser}
        onMarkRead={(nid) => {
          LocalStorageManager.markNotificationRead(currentEnv, nid, currentUser.user_id);
          refreshLocalState();
        }}
        onMarkAllRead={() => {
          LocalStorageManager.markAllNotificationsRead(currentEnv, currentUser.user_id);
          refreshLocalState();
        }}
        onClearAll={() => {
          LocalStorageManager.clearAllNotifications(currentEnv, currentUser.user_id);
          refreshLocalState();
        }}
        onNavigate={(tab) => {
          if (isHajivand && (tab === 'gas_kardex' || tab === 'gas_production_kardex' || tab === 'users_management' || tab === 'invoices')) {
            setActiveTab('movements');
          } else {
            setActiveTab(tab as NavTab);
          }
          refreshLocalState();
        }}
      />

      <UiFeedbackHost />
    </div>
  );
}
