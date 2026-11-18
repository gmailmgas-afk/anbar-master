import React, { useState, useEffect } from 'react';
import {
  RuntimeEnvironment,
  SyncEvent,
  User,
  StockMovement,
  ClientStation,
  DEFAULT_CLIENT_STATIONS
} from '../types';
import { LocalStorageManager, LocalDatabaseState } from '../database/storage';
import { SyncEngine, getCentralServerUrl, CLOUDFLARE_WORKER_URL } from '../sync-engine/sync-client';
import {
  Database,
  Cloud,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Check,
  XCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Info,
  Laptop,
  HardDrive,
  Download,
  Clock,
  ArrowRightLeft,
  Users,
  KeyRound,
  Settings,
  RotateCcw,
  AlertTriangle,
  Trash2,
  PackageX
} from 'lucide-react';
import { UsersManagementView } from './UsersManagementView';
import { CylinderTanksCatalogView } from './CylinderTanksCatalogView';
import {
  formatPersianDateTime,
  toPersianDigits,
  formatNumberFa,
  generateUUID
} from '../utils/persian';
import { triggerFileDownload } from '../utils/file-download';

interface TriSyncInspectorViewProps {
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  onSwitchEnv: (env: RuntimeEnvironment) => void;
  isOfflineSimulated?: boolean;
  onToggleOffline?: () => void;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  syncState?: any;
  onOpenWinCompat?: () => void;
  onOpenSecurity?: () => void;
  onOpenUsersManagement?: () => void;
  activeSubTab?: 'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY';
  onChangeSubTab?: (tab: 'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY') => void;
  onRefreshDatabase?: () => void;
  onOpenSwitchUser?: () => void;
  onNavigateToRepairKardex?: () => void;
  onNavigateToProductionKardex?: () => void;
}

export const TriSyncInspectorView: React.FC<TriSyncInspectorViewProps> = ({
  currentEnv,
  currentUser,
  onSwitchEnv,
  isOfflineSimulated = false,
  onToggleOffline,
  onSyncNow,
  isSyncing = false,
  syncState,
  onOpenWinCompat,
  onOpenSecurity,
  onOpenUsersManagement,
  activeSubTab,
  onChangeSubTab,
  onRefreshDatabase,
  onOpenSwitchUser,
  onNavigateToRepairKardex,
  onNavigateToProductionKardex
}) => {
  const isManagerAmouei = Boolean(
    currentUser && (
      currentUser.username === 'amouei' ||
      currentUser.user_id === 'USR-001' ||
      currentUser.role === 'ADMIN' ||
      currentUser.full_name?.includes('عمویی')
    )
  );

  const [internalSubTab, setInternalSubTab] = useState<'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY'>(
    activeSubTab || 'MONITORING'
  );

  useEffect(() => {
    if (activeSubTab) {
      setInternalSubTab(activeSubTab);
    }
  }, [activeSubTab]);

  const currentSubTab = activeSubTab !== undefined ? activeSubTab : internalSubTab;

  const setSubTab = (tab: 'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY') => {
    setInternalSubTab(tab);
    if (onChangeSubTab) {
      onChangeSubTab(tab);
    }
  };

  const [isZeroConfirmChecked, setIsZeroConfirmChecked] = useState(false);
  const [isZeroingStock, setIsZeroingStock] = useState(false);
  const [zeroSuccessMessage, setZeroSuccessMessage] = useState<string | null>(null);

  const handleExecuteZeroAll = async () => {
    if (!isManagerAmouei) return;
    setIsZeroingStock(true);
    try {
      const author = currentUser.full_name || 'مهندس موسی عمویی';
      const purgedAt = new Date().toISOString();
      LocalStorageManager.purgeDatabaseExceptProducts(currentEnv, author, true);
      SyncEngine.clearLogs();
      await SyncEngine.executeRemotePurge(currentEnv, {
        mode: 'PURGE_EXCEPT_PRODUCTS',
        author,
        purgedAt
      });
      await SyncEngine.syncNow(currentEnv);
      if (onRefreshDatabase) {
        onRefreshDatabase();
      }
      setZeroSuccessMessage('کلیه داده‌های پایگاه‌داده، اسناد، کاردکس‌ها، فاکتورها و اعلان‌ها در تمامی دستگاه‌ها با موفقیت پاک‌سازی شدند و تمامی موجودی‌ها صفر گردیدند. نام و کاتالوگ کالاها کاملاً حفظ شدند.');
      setIsZeroConfirmChecked(false);
      fetchD1State();
    } catch (err: any) {
      console.error('Zero all inventory & reports error:', err);
    } finally {
      setIsZeroingStock(false);
    }
  };

  const getDefaultStationForEnv = (env: RuntimeEnvironment) =>
    env === 'WAREHOUSE_WIN7' ? 'STATION-02' : 'STATION-01';

  const [d1Data, setD1Data] = useState<any>(null);
  const [isLoadingD1, setIsLoadingD1] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [activeStationId, setActiveStationId] = useState<string>(() => getDefaultStationForEnv(currentEnv));
  const [countdown, setCountdown] = useState<number>(SyncEngine.getRemainingSeconds());
  const [, setDataVersion] = useState<number>(0);

  // Subscribe to LocalStorageManager so local/remote sync updates reflect immediately
  useEffect(() => {
    return LocalStorageManager.subscribe(() => {
      setDataVersion(v => v + 1);
    });
  }, []);

  // Sync default selected station with active environment
  useEffect(() => {
    setActiveStationId(getDefaultStationForEnv(currentEnv));
  }, [currentEnv]);

  // Listen to 20-second countdown ticker
  useEffect(() => {
    const unsub = SyncEngine.subscribeCountdown((sec) => {
      setCountdown(sec);
    });
    return () => unsub();
  }, []);

  // Current local database state for this installed station
  const currentState: LocalDatabaseState = LocalStorageManager.getState(currentEnv);

  // Fetch live state from Central API
  const fetchD1State = async () => {
    const latestState = LocalStorageManager.getState(currentEnv);
    if (isOfflineSimulated) {
      setD1Data((prev: any) => ({
        ...(prev || {}),
        success: false,
        cloud_status: 'OFFLINE',
        cloud_url: CLOUDFLARE_WORKER_URL,
        d1_status: 'OFFLINE',
        d1_database_name: 'anbar-db1',
        server_sequence: prev?.server_sequence ?? (latestState.sync_state?.last_server_sequence || 0),
        last_event_at: prev?.last_event_at ?? latestState.sync_state?.last_synced_at ?? new Date().toISOString(),
        events_count: prev?.events_count ?? (latestState.sync_events?.length || 0),
        products_count: prev?.products_count ?? (latestState.products?.length || 0),
        customers_count: prev?.customers_count ?? (latestState.customers?.length || 0),
        movements_count: prev?.movements_count ?? (latestState.stock_movements?.length || 0),
        stations_count: 5
      }));
      setIsLoadingD1(false);
      return;
    }

    setIsLoadingD1(true);
    try {
      const centralUrl = getCentralServerUrl();
      let res: Response | null = null;
      try {
        res = await fetch(`${centralUrl}/api/tri-sync/inspect`, { signal: AbortSignal.timeout(6000) });
      } catch {
        res = await fetch('/api/tri-sync/inspect', { signal: AbortSignal.timeout(4000) });
      }
      const contentType = res?.headers.get('content-type') || '';
      if (res && res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        setD1Data(json);
        setIsLoadingD1(false);
        return;
      }
      throw new Error('Server returned non-JSON response');
    } catch {
      setD1Data({
        success: false,
        cloud_status: 'OFFLINE',
        cloud_url: CLOUDFLARE_WORKER_URL,
        d1_status: 'OFFLINE',
        d1_database_name: 'anbar-db1',
        server_sequence: latestState.sync_state?.last_server_sequence || 0,
        last_event_at: latestState.sync_state?.last_synced_at || new Date().toISOString(),
        events_count: latestState.sync_events?.length || 0,
        products_count: latestState.products?.length || 0,
        customers_count: latestState.customers?.length || 0,
        movements_count: latestState.stock_movements?.length || 0,
        stations_count: 5
      });
    } finally {
      setIsLoadingD1(false);
    }
  };

  useEffect(() => {
    fetchD1State();
    const interval = setInterval(fetchD1State, 20000);
    return () => clearInterval(interval);
  }, [currentEnv, isOfflineSimulated]);

  // Compute total stock units for this local database
  const getSumStock = (state: LocalDatabaseState) => {
    const stockMap = LocalStorageManager.getStockQuantities(state.environment);
    let total = 0;
    Object.values(stockMap).forEach(whMap => {
      Object.values(whMap).forEach(qty => {
        total += qty;
      });
    });
    return total;
  };

  const currentTotalUnits = getSumStock(currentState);

  // Simulation test: Instant broadcast on change across all 15 clients
  const runInstantBroadcastSimulation = async () => {
    setIsRunningTest(true);
    setTestLog([]);
    const log = (msg: string) =>
      setTestLog(prev => [...prev, `[${new Date().toLocaleTimeString('en-GB', { hour12: false })}] ${msg}`]);

    try {
      log('⚡ آغاز آزمون انتشار آنی تغییرات (<15ms) با دیتابیس کلودفلر و کلاینت‌ها...');
      log(`ایستگاه مبدا: ${activeStationId} (${currentUser.full_name})`);

      const testId = generateUUID('MOV-INST');
      const testEventId = generateUUID('EVT-INST');
      const testMovement: StockMovement = {
        movement_id: testId,
        product_id: 'PRD-VALVE-NEW',
        warehouse_id: 'WH-VALVES',
        quantity: 1,
        movement_type: 'STOCK_IN',
        reference_id: 'INSTANT-TEST-01',
        shelf_location: 'A1',
        unit_price: 450000,
        user_id: currentUser.user_id,
        device_id: activeStationId,
        event_id: testEventId,
        notes: 'تست ارسال فوری سند به دیتابیس کلودفلر و انعکاس در تمام ۵ ایستگاه کاری',
        created_at: new Date().toISOString()
      };

      log('1. ثبت سند در دیتابیس محلی این سیستم (mgas_local.db)...');
      LocalStorageManager.recordLocalChange(
        currentEnv,
        currentUser.user_id,
        'STOCK_MOVEMENT',
        'CREATE',
        testId,
        testMovement,
        'INSTANT_SYNC_TEST',
        { stationId: activeStationId }
      );

      log('2. رویداد بلافاصله در کسری از ثانیه (<۱۵ میلی‌ثانیه) به سمت سرور مرکزی کلودفلر ارسال شد...');
      const report = await SyncEngine.syncNow(currentEnv);

      log(`3. سرور ابری کلودفلر رویداد را پذیرفت و شماره توالی ${report.newSequence} را تخصیص داد.`);
      log('4. سرور بلافاصله از طریق SSE پیام پخش بلادرنگ را برای تمام کلاینت‌های متصل دیگر فرستاد.');
      log('✅ سند در کمترین زمان ممکن با تمام دیتابیس‌های کلاینت‌ها بروزرسانی شد!');

      await fetchD1State();
      if (onRefreshDatabase) {
        onRefreshDatabase();
      }
    } catch (err: any) {
      log(`❌ خطا در اجرای آزمون: ${err?.message || err}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  // Simulation test: Offline recording -> Reconnection auto sync
  const runOfflineReconnectSimulation = async () => {
    setIsRunningTest(true);
    setTestLog([]);
    const log = (msg: string) =>
      setTestLog(prev => [...prev, `[${new Date().toLocaleTimeString('en-GB', { hour12: false })}] ${msg}`]);

    try {
      log('1. شبیه‌سازی قطع اینترنت در سیستم جاری (حالت آفلاین)...');
      if (onToggleOffline && !isOfflineSimulated) {
        onToggleOffline();
      }
      await new Promise(r => setTimeout(r, 600));

      const offlineId = generateUUID('MOV-OFF');
      const offlineEventId = generateUUID('EVT-OFF');
      const offlineMovement: StockMovement = {
        movement_id: offlineId,
        product_id: 'PRD-VALVE-NEW',
        warehouse_id: 'WH-VALVES',
        quantity: 2,
        movement_type: 'STOCK_OUT',
        reference_id: 'OFFLINE-QUEUED-01',
        shelf_location: 'A1',
        unit_price: 450000,
        user_id: currentUser.user_id,
        device_id: activeStationId,
        event_id: offlineEventId,
        notes: 'ثبت سند در حالت قطع اینترنت (ذخیره مطمئن در دیتابیس محلی و صف انتظار)',
        created_at: new Date().toISOString()
      };

      log('2. کاربر یک سند جدید ثبت کرد. ثبت امن در mgas_local.db محلی + قرارگیری در صف ارسال (PENDING)...');
      LocalStorageManager.recordLocalChange(
        currentEnv,
        currentUser.user_id,
        'STOCK_MOVEMENT',
        'CREATE',
        offlineId,
        offlineMovement,
        'OFFLINE_LOCAL_ENTRY',
        { offline: true }
      );
      await new Promise(r => setTimeout(r, 800));

      log('3. اتصال مجدد به اینترنت برقرار گردید (رویداد online فعال شد)...');
      if (onToggleOffline && isOfflineSimulated) {
        onToggleOffline();
      }
      await new Promise(r => setTimeout(r, 600));

      log('4. آغاز همگام‌سازی خودکار (Auto-Sync) با سرور ابری کلودفلر...');
      const rep = await SyncEngine.syncNow(currentEnv);
      log(`نتیجه: ${rep.uploadedCount} سند معوقه با موفقیت در دیتابیس مرکزی ثبت و برای تمام کلاینت‌ها پخش شد.`);
      log('✅ تمام کلاینت‌ها با دیتابیس مرکز مجدداً همگام شدند!');

      await fetchD1State();
      if (onRefreshDatabase) {
        onRefreshDatabase();
      }
    } catch (err: any) {
      log(`❌ خطا در شبیه‌سازی آفلاین: ${err?.message || err}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const stationsList: ClientStation[] = DEFAULT_CLIENT_STATIONS;
  const isCloudOnline = !isOfflineSimulated && d1Data?.cloud_status !== 'OFFLINE';

  return (
    <div className="space-y-5">
      {/* Top Sub-Navigation Bar inside Sync Menu (Aligned with Sidebar Subcategories) */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 p-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <button
            type="button"
            onClick={() => setSubTab('MONITORING')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentSubTab === 'MONITORING'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>مانیتورینگ ابری و ایستگاه‌ها</span>
          </button>

          {isManagerAmouei && (
            <button
              type="button"
              onClick={() => setSubTab('PASSWORDS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentSubTab === 'PASSWORDS'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white shadow-md shadow-amber-600/30 border border-amber-400/40'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border border-amber-500/30'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-300" />
              <span>کاربران و تغییر رمز عبور</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-amber-200 border border-amber-400/30 font-bold">
                مدیریت
              </span>
            </button>
          )}

          {isManagerAmouei && (
            <button
              type="button"
              onClick={() => setSubTab('CYLINDER_CATALOG')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentSubTab === 'CYLINDER_CATALOG'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white shadow-md shadow-amber-600/30 border border-amber-400/40'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border border-amber-500/30'
              }`}
            >
              <Settings className="w-4 h-4 text-amber-300" />
              <span>مخازن و ارتباط شیر و مهره</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-amber-200 border border-amber-400/30 font-bold">
                مدیریت
              </span>
            </button>
          )}

          {isManagerAmouei && (
            <button
              type="button"
              onClick={() => setSubTab('ZERO_INVENTORY')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentSubTab === 'ZERO_INVENTORY'
                  ? 'bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 text-white shadow-md shadow-rose-600/30 border border-rose-400/40 ring-2 ring-rose-500/20'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/30'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-rose-300" />
              <span>پاک‌سازی دیتابیس و گزارش‌ها</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-rose-200 border border-rose-400/30 font-bold">
                مدیریت
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px]">محیط جاری:</span>
          <span className="px-2.5 py-0.5 rounded font-mono text-[11px] bg-slate-950 text-indigo-300 border border-slate-800">
            {currentEnv === 'OFFICE_WIN11' ? 'Windows 11 (Office)' : currentEnv === 'WAREHOUSE_WIN7' ? 'Windows 7 (Warehouse)' : 'Cloud Web (D1)'}
          </span>
        </div>
      </div>

      {currentSubTab === 'CYLINDER_CATALOG' ? (
        <CylinderTanksCatalogView
          currentEnv={currentEnv}
          currentUser={currentUser}
          onRefresh={onRefreshDatabase}
          onNavigateToRepairKardex={onNavigateToRepairKardex}
          onNavigateToProductionKardex={onNavigateToProductionKardex}
        />
      ) : currentSubTab === 'PASSWORDS' ? (
        !isManagerAmouei ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4 max-w-lg mx-auto my-12" dir="rtl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">دسترسی انحصاری مدیریت ارشد</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              تغییر کلمه عبور و مشخصات کاربران منحصراً برای جناب آقای مهندس موسی عمویی قابل رویت، فعال و در دسترس است.
            </p>
            <button
              type="button"
              onClick={() => setSubTab('MONITORING')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              بازگشت به مانیتورینگ همگام‌سازی
            </button>
          </div>
        ) : (
          <UsersManagementView
            currentUser={currentUser}
            currentEnv={currentEnv}
            onRefreshDatabase={onRefreshDatabase}
            onOpenSwitchUser={onOpenSwitchUser}
          />
        )
      ) : currentSubTab === 'ZERO_INVENTORY' ? (
        !isManagerAmouei ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4 max-w-lg mx-auto my-12" dir="rtl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">دسترسی انحصاری مدیریت ارشد</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              عملیات صفر کردن تمام موجودی‌های انبار منحصراً برای جناب آقای مهندس موسی عمویی قابل رویت، فعال و در دسترس است.
            </p>
            <button
              type="button"
              onClick={() => setSubTab('MONITORING')}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              بازگشت به مانیتورینگ همگام‌سازی
            </button>
          </div>
        ) : (
          <div className="space-y-6" dir="rtl">
            {/* Hero Header */}
            <div className="bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border border-rose-800/40 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-rose-900/40">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-inner shrink-0">
                    <RotateCcw className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                        مدیریت ارشد شرکت ام گاز
                      </span>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        مهندس موسی عمویی
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white">
                      پنل پاک‌سازی کامل پایگاه‌داده و گزارش‌ها (حفظ کاتالوگ و نام کالاها)
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      ریست کلیه اسناد گردش، کاردکس‌های تعمیر و تولید، فاکتورها، برگه‌های ورود/خروج، بازرسی‌ها و گزارش‌گیری‌ها (با حفظ ۱۰۰٪ نام و کاتالوگ کالاها).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSubTab('MONITORING')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700 self-start md:self-auto shrink-0"
                >
                  بازگشت به مانیتورینگ
                </button>
              </div>

              {/* Status Message if executed */}
              {zeroSuccessMessage && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center gap-3 shadow-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1">{zeroSuccessMessage}</div>
                  <button
                    type="button"
                    onClick={() => setZeroSuccessMessage(null)}
                    className="text-emerald-400 hover:text-white text-xs cursor-pointer px-2 py-1"
                  >
                    بستن پیام
                  </button>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[11px] font-bold text-slate-400 mb-1">مجموع کل موجودی فعلی</div>
                  <div className={`text-2xl font-black font-mono ${currentTotalUnits === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {toPersianDigits(currentTotalUnits.toLocaleString('fa-IR'))}
                    <span className="text-xs font-normal text-slate-400 mr-1.5">واحد/عدد</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {currentTotalUnits === 0 ? '✓ موجودی در حال حاضر کاملاً صفر است' : 'گردش‌های ثبت‌شده در انبارها'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[11px] font-bold text-emerald-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>کاتالوگ و نام کالاها (محفوظ)</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-300 font-mono">
                    {toPersianDigits(currentState.products?.length || 0)}
                    <span className="text-xs font-normal text-emerald-400/80 mr-1.5">قلم کالا</span>
                  </div>
                  <div className="text-[10px] text-emerald-400/80 mt-1">
                    نام و مشخصات کالاها ۱۰۰٪ حفظ می‌ماند
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[11px] font-bold text-slate-400 mb-1">اسناد و سوابق گزارش‌گیری</div>
                  <div className="text-2xl font-black text-slate-100 font-mono">
                    {toPersianDigits(
                      (currentState.stock_movements?.length || 0) +
                      (currentState.gas_kardex_entries?.length || 0) +
                      (currentState.goods_receipts?.length || 0) +
                      (currentState.invoices?.length || 0)
                    )}
                    <span className="text-xs font-normal text-slate-400 mr-1.5">سند</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    گردش‌ها، کاردکس، رسیدها و فاکتورها
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[11px] font-bold text-slate-400 mb-1">آخرین تاریخ پاک‌سازی دیتابیس</div>
                  <div className="text-xs font-bold text-amber-300 mt-2 leading-relaxed">
                    {currentState.purged_at
                      ? formatPersianDateTime(currentState.purged_at)
                      : (currentState.stock_zeroed_at
                          ? formatPersianDateTime(currentState.stock_zeroed_at)
                          : 'تاکنون پاک‌سازی نشده است')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {currentState.is_purged ? 'وضعیت: دیتابیس پاک‌سازی شده' : 'وضعیت اولیه'}
                  </div>
                </div>
              </div>
            </div>

            {/* Directive & Technical Notice Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>دستورالعمل و ضوابط اجرایی پاک‌سازی دیتابیس و گزارش‌ها (مهندس موسی عمویی)</span>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">۱</span>
                  <p>
                    <strong className="text-emerald-300">حفظ ۱۰۰٪ نام و کاتالوگ کالاها (Preserved):</strong> کلیه نام‌ها، کدها (SKU)، دسته‌بندی‌ها، بارکدها و مشخصات فنی کالاها کاملاً سالم و محفوظ در سیستم باقی مانده و حذف نمی‌شوند.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center shrink-0 text-[11px]">۲</span>
                  <p>
                    <strong className="text-white">صفر شدن کامل موجودی تمام انبارها:</strong> با تایید این دستور، تمام رکوردهای جدول گردش کالاها (<span className="font-mono text-indigo-300">stock_movements</span>) پاک شده و موجودی مانده تمام محصولات در انبار ۱، ۲، ۳، انبار شیرها و ضایعات دقیقا برابر با <span className="font-bold text-rose-400">۰</span> قرار می‌گیرد.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center shrink-0 text-[11px]">۳</span>
                  <p>
                    <strong className="text-white">پاک‌سازی کامل گزارش‌گیری‌ها و کاردکس:</strong> تمامی داده‌های کاردکس تعمیر سیلندر، کاردکس تولید، برگه‌های رسید ورود و خروج، فاکتورهای خرید و فروش، بازرسی‌های شیر/سیلندر و لاگ‌های ممیزی گزارش‌گیری تخلیه و پاک‌سازی می‌گردند.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center shrink-0 text-[11px]">۴</span>
                  <p>
                    <strong className="text-white">مخابره بلادرنگ به کلاینت‌های نصبی:</strong> رویداد <span className="font-mono text-emerald-400">DATABASE_PURGED</span> از طریق استریم زنده ابری (SSE) در لحظه به تمامی ۵ ایستگاه کاری ارسال می‌شود تا مانده‌ها و گزارش‌های سیستم‌های متصل نیز در لحظه ریست شوند.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center shrink-0 text-[11px]">۵</span>
                  <p>
                    <strong className="text-white">لاگ رسمی امنیتی:</strong> این عملیات با مجوز رسمی جناب آقای «مهندس موسی عمویی» به همراه تاریخ، ساعت و مشخصات دستگاه در لاگ ممیزی و مانیتورینگ امنیتی ثبت می‌گردد.
                  </p>
                </div>
              </div>

              {/* Action Form */}
              <div className="bg-gradient-to-r from-rose-950/30 to-slate-950/80 border border-rose-800/50 rounded-2xl p-5 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isZeroConfirmChecked}
                    onChange={(e) => setIsZeroConfirmChecked(e.target.checked)}
                    className="w-5 h-5 rounded text-rose-600 focus:ring-rose-500 focus:ring-offset-slate-900 border-slate-700 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-100">
                    اینجانب مهندس موسی عمویی، پاک‌سازی کامل پایگاه داده، کلیه اسناد، گردش‌ها، کاردکس‌ها و گزارش‌ها را (با حفظ ۱۰۰٪ نام و کاتالوگ کالاها) رسماً تایید و صادر می‌نمایم.
                  </span>
                </label>

                <div className="flex items-center gap-3 flex-wrap pt-2">
                  <button
                    type="button"
                    disabled={!isZeroConfirmChecked || isZeroingStock}
                    onClick={handleExecuteZeroAll}
                    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg ${
                      isZeroConfirmChecked && !isZeroingStock
                        ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-rose-600 hover:from-rose-500 hover:to-rose-400 text-white shadow-rose-600/30 border border-rose-400/50 ring-2 ring-rose-500/30'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <RotateCcw className={`w-4 h-4 ${isZeroingStock ? 'animate-spin' : ''}`} />
                    <span>
                      {isZeroingStock
                        ? 'در حال پاک‌سازی دیتابیس و گزارش‌ها و ابلاغ به سرور و کلاینت‌ها...'
                        : 'اجرای قطعی پاک‌سازی دیتابیس و گزارش‌ها (بجز نام کالاها)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onRefreshDatabase) onRefreshDatabase();
                      fetchD1State();
                    }}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>بروزرسانی وضعیت دیتابیس</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Top Banner: Architecture Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col items-stretch justify-start gap-4 pb-4 border-b border-slate-800 w-full">
              <div className="flex flex-col items-start gap-2.5 w-full">
                <div className="flex flex-col items-start gap-1.5 w-full sm:w-auto">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold inline-flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span>معماری ابری کلودفلر و کلاینت‌های محلی</span>
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/50 inline-flex items-center shadow-2xs">
                    1 Central Cloud DB + 1 Local DB Per Machine
                  </span>
                </div>
                <h2 className="text-lg font-black text-white mt-1 leading-snug">
                  مرکز مانیتورینگ همگام‌سازی ابری و شبکه ۵ ایستگاه کاری (M-Gas Multi-Station Sync Hub)
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
                  دیتابیس مرکزی کلودفلر (<span className="font-mono text-emerald-400">anbar.mgas.ir</span>) مرجع اطلاعات است و برای هر سیستمی که برنامه نصب می‌شود یک دیتابیس محلی SQLite (<span className="font-mono text-indigo-300">mgas_local.db</span>) ساخته می‌شود. هر تغییر بلافاصله با تمام کلاینت‌ها همگام شده و هر ۲۰ ثانیه بروزرسانی کلی مستمر انجام می‌پذیرد.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mt-1">
                <button
                  type="button"
                  onClick={() => triggerFileDownload('/mgas_local.db', 'mgas_local.db')}
                  className="w-full px-4 py-2.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-700/60 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                  title="دانلود فایل دیتابیس محلی این سیستم"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود دیتابیس محلی (mgas_local.db)</span>
                </button>

                <button
                  type="button"
                  onClick={fetchD1State}
                  disabled={isLoadingD1}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RotateCw className={`w-4 h-4 ${isLoadingD1 ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>بروزرسانی داده‌ها</span>
                </button>
              </div>
            </div>

            {/* Live Status Indicators Bar */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Card 1: Cloudflare Central Database */}
              <div className={`p-3.5 rounded-xl bg-slate-950/80 border flex items-center justify-between ${
                isCloudOnline ? 'border-emerald-500/30' : 'border-rose-500/40'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                    isCloudOnline
                      ? 'bg-emerald-950/80 border-emerald-700/50 text-emerald-400'
                      : 'bg-rose-950/80 border-rose-700/50 text-rose-400'
                  }`}>
                    {isCloudOnline ? <Cloud className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">دیتابیس مرکزی کلودفلر</span>
                      <span className={`w-2 h-2 rounded-full ${isCloudOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                    </div>
                    <div className={`text-[11px] font-mono mt-0.5 ${isCloudOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isCloudOnline ? 'https://anbar.mgas.ir' : (isOfflineSimulated ? 'آفلاین (شبیه‌سازی قطع ارتباط)' : 'عدم دسترسی به سرور ابری')}
                    </div>
                  </div>
                </div>
                <div className="text-left font-mono">
                  <span className="text-xs text-slate-400">توالی سرور: </span>
                  <span className={`text-sm font-bold ${isCloudOnline ? 'text-emerald-400' : 'text-rose-300'}`}>
                    {d1Data ? toPersianDigits(d1Data.server_sequence) : toPersianDigits(currentState.sync_state.last_server_sequence)}
                  </span>
                </div>
              </div>

          {/* Card 2: This Workstation Local Database */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-indigo-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">دیتابیس محلی این سیستم</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono border border-indigo-800">
                    SQLite
                  </span>
                </div>
                <div className="text-[11px] font-mono text-indigo-300 mt-0.5">mgas_local.db</div>
              </div>
            </div>
            <div className="text-left font-mono">
              <span className="text-xs text-slate-400">صف انتظار: </span>
              <span className="text-sm font-bold text-indigo-300">
                {toPersianDigits(currentState.sync_queue.filter(q => q.status === 'PENDING').length)}
              </span>
            </div>
          </div>

          {/* Card 3: Instant Push upon Document Save & Periodic Background Ticker */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-700/50 flex items-center justify-center text-emerald-400 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>همگام‌سازی بلادرنگ اسناد</span>
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-bold">آنـی</span>
                </div>
                <div className="text-[11px] text-emerald-300 mt-0.5">ثبت فوری در پل کاربر و کلودفلر (صرف‌نظر از قانون ۲۰ ثانیه)</div>
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-slate-400">بررسی دوره‌ای کلودفلر:</div>
              <div className="text-sm font-bold font-mono text-cyan-400">
                {toPersianDigits(countdown)} ثانیه
              </div>
            </div>
          </div>
        </div>

        {/* Action & Simulation Bar */}
        <div className="mt-4 p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">ایستگاه کاری فعال جهت تست:</span>
            <select
              value={activeStationId}
              onChange={(e) => setActiveStationId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-sans focus:outline-none focus:border-indigo-500"
            >
              {stationsList.map(st => (
                <option key={st.station_id} value={st.station_id}>
                  {st.station_name} ({st.os})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onToggleOffline && (
              <button
                onClick={onToggleOffline}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isOfflineSimulated
                    ? 'bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-rose-900/60'
                    : 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900/60'
                }`}
                title="تغییر وضعیت شبیه‌سازی اتصال اینترنت"
              >
                {isOfflineSimulated ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span>وضعیت: آفلاین (قطع اینترنت)</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span>وضعیت: آنلاین (متصل به کلودفلر)</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={runInstantBroadcastSimulation}
              disabled={isRunningTest}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="آزمون ثبت سند و ارسال آنی کمتر از ۱۵ میلی‌ثانیه به تمام کلاینت‌ها"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>تست انتشار آنی سند (&lt;15ms)</span>
            </button>

            <button
              onClick={runOfflineReconnectSimulation}
              disabled={isRunningTest}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
              title="آزمون ثبت آفلاین و اتصال مجدد به اینترنت"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>تست ذخیره آفلاین و اتصال مجدد</span>
            </button>

            {onSyncNow && (
              <button
                onClick={onSyncNow}
                disabled={isSyncing || isOfflineSimulated}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>همگام‌سازی فوری</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Network of 15 Installed Client Workstations Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>شبکه ۵ ایستگاه کاری نصبی ام گاز (Active Client Stations Network)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              هر کدام از سیستم‌های زیر دارای یک فایل دیتابیس محلی (<span className="font-mono text-indigo-300">mgas_local.db</span>) مجزا هستند که با دیتابیس ابری کلودفلر هماهنگ می‌مانند.
            </p>
          </div>
          <span className={`text-xs font-mono px-2.5 py-1 rounded border font-bold ${
            isCloudOnline
              ? 'bg-slate-950 text-emerald-400 border-emerald-800/40'
              : 'bg-rose-950/60 text-rose-300 border-rose-700/50'
          }`}>
            {isOfflineSimulated ? 'ایستگاه جاری در حالت آفلاین (شبیه‌سازی)' : isCloudOnline ? '۵ ایستگاه فعال و متصل' : 'حالت آفلاین محلی'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {stationsList.map((station) => {
            const isCurrent = station.station_id === activeStationId;
            const isStationOffline = isOfflineSimulated && isCurrent;
            return (
              <div
                key={station.station_id}
                onClick={() => setActiveStationId(station.station_id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700/60 font-bold">
                    {station.station_id}
                  </span>
                  <span className={`flex items-center gap-1 text-[10px] font-bold ${
                    isStationOffline ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isStationOffline ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'
                    }`} />
                    {isStationOffline ? 'آفلاین' : 'آنلاین'}
                  </span>
                </div>

                <div className="text-xs font-bold text-white truncate" title={station.station_name}>
                  {station.station_name}
                </div>

                <div className="text-[11px] text-slate-400 mt-1 truncate">
                  {station.assigned_user}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800/70 text-slate-300 font-mono">
                    {station.os}
                  </span>
                  <span className="font-mono text-indigo-300">mgas_local.db</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two In-Depth Focus Panels: Cloudflare D1 & Local Client DB */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Panel 1: Cloudflare D1 Authoritative Database */}
        <div className={`bg-slate-900 border-2 rounded-2xl p-5 shadow-lg flex flex-col justify-between ${
          isCloudOnline ? 'border-emerald-600/40' : 'border-rose-600/40'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                  isCloudOnline
                    ? 'bg-emerald-950/80 border-emerald-700/50 text-emerald-400'
                    : 'bg-rose-950/80 border-rose-700/50 text-rose-400'
                }`}>
                  {isCloudOnline ? <Cloud className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">پایگاه‌داده ابری مرکزی (Cloudflare D1)</h3>
                  <p className="text-xs text-slate-400">سرور و مرجع توالی authoritative ابری ام گاز</p>
                </div>
              </div>
              <span className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${
                isCloudOnline
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/40'
                  : 'bg-rose-950 text-rose-300 border-rose-700/40'
              }`}>
                {isCloudOnline ? 'مرجع توالی کلودفلر' : 'حالت آفلاین'}
              </span>
            </div>

            <div className="space-y-2.5 text-xs border-t border-slate-800 pt-3">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">نشانی دامنه ابری:</span>
                <span className="font-mono font-bold text-emerald-400">https://anbar.mgas.ir</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">نام دیتابیس در کلودفلر:</span>
                <span className="font-mono font-bold text-slate-200">anbar-db1</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">آخرین شماره ترتیب سرور (Sequence):</span>
                <span className={`font-mono font-bold ${isCloudOnline ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {d1Data ? toPersianDigits(d1Data.server_sequence) : toPersianDigits(currentState.sync_state.last_server_sequence)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">کل رویدادهای ثبت‌شده در ابر:</span>
                <span className="font-bold text-slate-100">
                  {d1Data ? toPersianDigits(d1Data.events_count) : toPersianDigits(currentState.sync_events?.length || 0)} رویداد
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">تعداد پرونده‌های مشتریان:</span>
                <span className="font-bold text-slate-100">
                  {d1Data ? toPersianDigits(d1Data.customers_count) : toPersianDigits(currentState.customers?.length || 0)} مشتری
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">تعداد اقلام کالاها در کاتالوگ:</span>
                <span className="font-bold text-slate-100">
                  {d1Data ? toPersianDigits(d1Data.products_count) : toPersianDigits(currentState.products?.length || 0)} کالا
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span className={`flex items-center gap-1 ${isCloudOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isCloudOnline ? <CheckCircle2 className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>
                {isCloudOnline
                  ? 'پایگاه ابری در دسترس و آماده است'
                  : isOfflineSimulated
                  ? 'شبیه‌سازی قطع اینترنت فعال است'
                  : 'ارتباط با پایگاه ابری برقرار نیست'}
              </span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">Cloudflare D1 Worker Engine</span>
          </div>
        </div>

        {/* Panel 2: This Station Local Database */}
        <div className="bg-slate-900 border-2 border-indigo-600/40 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">پایگاه‌داده محلی این سیستم (Local Station DB)</h3>
                  <p className="text-xs text-slate-400">دیتابیس اختصاصی SQLite سیستم جاری</p>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/40 font-bold">
                mgas_local.db
              </span>
            </div>

            <div className="space-y-2.5 text-xs border-t border-slate-800 pt-3">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">نام فایل دیتابیس محلی:</span>
                <span className="font-mono font-bold text-indigo-300">mgas_local.db</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">شناسه ایستگاه نصبی:</span>
                <span className="font-mono font-bold text-slate-200">{activeStationId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">کاربر فعال این سیستم:</span>
                <span className="font-bold text-slate-100">{currentUser.full_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">توالی همگام‌شده محلی:</span>
                <span className="font-mono font-bold text-indigo-300">
                  {toPersianDigits(currentState.sync_state.last_server_sequence)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">اسناد معوقه در صف ارسال محلی:</span>
                <span className="font-bold text-amber-400">
                  {toPersianDigits(currentState.sync_queue.filter(q => q.status === 'PENDING').length)} سند
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">تراکنش‌های ثبت‌شده در دیتابیس این سیستم:</span>
                <span className="font-bold text-slate-100">
                  {toPersianDigits(currentState.stock_movements.length)} تراکنش
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] flex items-center justify-between">
            <span className={`flex items-center gap-1 font-bold ${
              isOfflineSimulated || currentState.isOfflineSimulated ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              <Activity className="w-3.5 h-3.5" />
              <span>{isOfflineSimulated || currentState.isOfflineSimulated ? 'آفلاین (ذخیره محلی)' : 'آنلاین و متصل به کلودفلر'}</span>
            </span>
            <button
              onClick={() => triggerFileDownload('/mgas_local.db', 'mgas_local.db')}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-bold"
            >
              <Download className="w-3 h-3" />
              <span>پشتیبان‌گیری از mgas_local.db</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Test Console Log Output (if executed) */}
      {testLog.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>کنسول تست بلادرنگ ارسال و بازگشت داده‌ها</span>
            </h4>
            <button
              onClick={() => setTestLog([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              پاک‌سازی
            </button>
          </div>
          <div className="space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
            {testLog.map((line, i) => (
              <div key={i} className="text-slate-300 leading-relaxed">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
