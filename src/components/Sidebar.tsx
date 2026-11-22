import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  Users,
  Truck,
  FileText,
  Layers,
  Send,
  ShieldCheck,
  HardDriveDownload,
  Building2,
  Flame,
  X,
  UserCheck,
  LogOut,
  Monitor,
  Database,
  Cloud,
  Wifi,
  WifiOff,
  Server,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  Lock,
  PackageCheck,
  Sun,
  Moon,
  KeyRound,
  Zap,
  Settings,
  Type
} from 'lucide-react';
import { RuntimeEnvironment, User, SyncState } from '../types';
import { toPersianDigits } from '../utils/persian';
import { triggerFileDownload } from '../utils/file-download';
import { SyncEngine } from '../sync-engine/sync-client';
import { FontSizeSettingsControl } from './FontSizeSettingsControl';

export type NavTab =
  | 'dashboard'
  | 'users_management'
  | 'tri_sync'
  | 'cylinder_inspections'
  | 'gas_kardex'
  | 'gas_production_kardex'
  | 'cylinder_tanks_catalog'
  | 'inventory'
  | 'movements'
  | 'reports'
  | 'customers'
  | 'suppliers'
  | 'invoices'
  | 'sync_queue'
  | 'audit'
  | 'backup';

export type TriSyncSubTab = 'MONITORING' | 'PASSWORDS' | 'CYLINDER_CATALOG' | 'ZERO_INVENTORY';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  triSyncSubTab?: TriSyncSubTab;
  onSelectTriSyncSubTab?: (subTab: TriSyncSubTab) => void;
  onOpenSkuPrint?: () => void;
  currentEnv: RuntimeEnvironment;
  pendingCount: number;
  pendingInspectionsCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  currentUser?: User | null;
  onSelectEnv?: (env: RuntimeEnvironment) => void;
  onLogout?: () => void;
  onSwitchUser?: () => void;
  onOpenSecurity?: () => void;
  onOpenUsersManagement?: () => void;
  onOpenWinCompat?: () => void;
  onOpenTroubleshooting?: () => void;
  onOpenWin11Troubleshooting?: () => void;
  isOfflineSimulated?: boolean;
  onToggleOffline?: () => void;
  isSyncing?: boolean;
  onSyncNow?: () => void;
  syncState?: SyncState;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  triSyncSubTab = 'MONITORING',
  onSelectTriSyncSubTab,
  onOpenSkuPrint,
  currentEnv,
  pendingCount,
  pendingInspectionsCount = 0,
  isMobileOpen,
  onCloseMobile,
  currentUser,
  onSelectEnv,
  onLogout,
  onSwitchUser,
  onOpenSecurity,
  onOpenUsersManagement,
  onOpenWinCompat,
  onOpenTroubleshooting,
  onOpenWin11Troubleshooting,
  isOfflineSimulated = false,
  onToggleOffline,
  isSyncing = false,
  onSyncNow,
  syncState,
  theme = 'dark',
  onToggleTheme
}) => {
  const isTriSyncRouteActive =
    activeTab === 'tri_sync' || activeTab === 'users_management' || activeTab === 'cylinder_tanks_catalog';

  const [isStatusMenuExpanded, setIsStatusMenuExpanded] = useState<boolean>(isTriSyncRouteActive);
  const [isInstallersMenuExpanded, setIsInstallersMenuExpanded] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(SyncEngine.getRemainingSeconds());

  useEffect(() => {
    if (isTriSyncRouteActive) {
      setIsStatusMenuExpanded(true);
    }
  }, [isTriSyncRouteActive]);

  useEffect(() => {
    const unsub = SyncEngine.subscribeCountdown((sec) => {
      setCountdown(sec);
    });
    return () => unsub();
  }, []);

  const [instantSyncFlash, setInstantSyncFlash] = useState(false);
  useEffect(() => {
    const handleInstantSync = () => {
      setInstantSyncFlash(true);
      const t = setTimeout(() => setInstantSyncFlash(false), 3000);
      return () => clearTimeout(t);
    };
    window.addEventListener('mgas:document_synced_instantly', handleInstantSync);
    return () => window.removeEventListener('mgas:document_synced_instantly', handleInstantSync);
  }, []);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  const menuItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'داشبورد مدیریتی',
      icon: LayoutDashboard
    },
    {
      id: 'movements' as NavTab,
      label: 'ورود و خروج انبار و سیلندر',
      badge: 'شمارش و گردش',
      highlight: false,
      icon: ArrowLeftRight
    },
    {
      id: 'gas_kardex' as NavTab,
      label: 'کاردکس تعمیر سیلندر',
      badge: pendingInspectionsCount > 0 ? `${toPersianDigits(pendingInspectionsCount)} در انتظار ثبت` : undefined,
      count: pendingInspectionsCount > 0 ? pendingInspectionsCount : undefined,
      highlight: pendingInspectionsCount > 0,
      icon: Flame
    },
    {
      id: 'gas_production_kardex' as NavTab,
      label: 'کاردکس تولید ام گاز',
      highlight: true,
      icon: Boxes
    },
    {
      id: 'inventory' as NavTab,
      label: 'تعریف کالا',
      icon: Boxes
    },
    {
      id: 'reports' as NavTab,
      label: 'گزارش‌گیری و چاپ',
      icon: Printer
    },
    {
      id: 'customers' as NavTab,
      label: 'مشتریان و پرونده‌ها',
      icon: Users
    },
    {
      id: 'suppliers' as NavTab,
      label: 'تأمین‌کنندگان',
      icon: Truck
    },
    {
      id: 'invoices' as NavTab,
      label: 'فاکتور خرید و فروش',
      icon: FileText
    },
    {
      id: 'sync_queue' as NavTab,
      label: 'صف ارسال آفلاین',
      count: pendingCount,
      icon: Send
    },
    {
      id: 'audit' as NavTab,
      label: 'لاگ امنیت و ممیزی',
      icon: ShieldCheck
    },
    {
      id: 'backup' as NavTab,
      label: 'پشتیبان‌گیری SQLite',
      icon: HardDriveDownload
    },
    {
      id: 'tri_sync' as NavTab,
      label: 'همگام‌سازی ابری و کلاینت‌ها',
      highlight: true,
      icon: Activity,
      isStatusControl: true
    }
  ];

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
      currentUser.username?.toLowerCase() === 'amouei' ||
      currentUser.user_id === 'USR-001' ||
      currentUser.role === 'ADMIN' ||
      currentUser.full_name?.includes('عمویی')
    )
  );

  const adminOnlyMenuIds: NavTab[] = ['sync_queue', 'audit', 'backup', 'tri_sync'];

  const visibleMenuItems = menuItems.filter(item => {
    // Strictly hide Gas Kardex and Production Kardex from warehouse keeper Hajivand (no access, no view, no edit)
    if (isHajivand && (item.id === 'gas_kardex' || item.id === 'gas_production_kardex')) {
      return false;
    }
    // Strictly hide Sync Queue, Audit Log, SQLite Backup, and Cloud Sync Hub for everyone except Senior Manager Mousa Amouei
    if (!isManagerAmouei && adminOnlyMenuIds.includes(item.id)) {
      return false;
    }
    return true;
  });

  const renderNavContent = (isMobile = false) => (
    <>
      {!isMobile && isCollapsed ? (
        <div className="p-2 border-b border-slate-800/80 bg-slate-950/40 flex flex-col items-center gap-2">
          <button
            onClick={toggleCollapse}
            className="w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer bg-slate-900 border border-slate-700/60 shadow-sm"
            title="باز کردن پنل سایدبار"
          >
            <PanelRightOpen className="w-5 h-5 text-indigo-400" />
          </button>
        </div>
      ) : (
        <div className="p-2.5 px-3 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">
            {currentEnv === 'OFFICE_WIN11'
              ? 'آفیس (ویندوز 11)'
              : currentEnv === 'WAREHOUSE_WIN7'
              ? 'انبار مرکزی (ویندوز 7)'
              : 'وب اپ ابری'}
          </span>
          <div className="flex items-center gap-1">
            {!isMobile && (
              <button
                onClick={toggleCollapse}
                className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-[11px] border border-slate-800 hover:border-slate-700"
                title="جمع کردن پنل سایدبار"
              >
                <PanelRightClose className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[10px] text-slate-300">جمع کردن</span>
              </button>
            )}
            {isMobile && onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="بستن منو"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}


      {/* Mobile-Only: User Profile Card & Actions */}
      {isMobile && currentUser && (
        <div className="p-3 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-100 truncate">{currentUser.full_name}</div>
              <div className="text-[10px] text-amber-300/80 font-medium">
                {currentUser.role_title || (currentUser.role === 'ADMIN' ? 'مدیریت سامانه' : 'انباردار')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {onOpenSecurity && (
              <button
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  onOpenSecurity();
                }}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>تنظیمات امنیت دیتابیس و رمزها</span>
              </button>
            )}
            {onSwitchUser && (
              <button
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  onSwitchUser();
                }}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer text-center"
              >
                تغییر کاربر
              </button>
            )}
            {onLogout && (
              <button
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  onLogout();
                }}
                className="px-2 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav className={`flex-1 overflow-y-auto space-y-1 ${!isMobile && isCollapsed ? 'p-1.5' : 'p-2'}`}>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isStatusItem = item.id === 'tri_sync';
          const isActive =
            activeTab === item.id ||
            (item.id === 'movements' && activeTab === 'cylinder_inspections') ||
            (isStatusItem && isTriSyncRouteActive);

          if (!isMobile && isCollapsed) {
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={item.label + (item.badge ? ` (${item.badge})` : '')}
                className={`w-full flex items-center justify-center p-2.5 rounded-xl text-xs font-medium transition-all relative cursor-pointer group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : item.highlight
                    ? theme === 'light'
                      ? 'text-indigo-900 hover:bg-slate-100 bg-indigo-50 border border-indigo-200'
                      : 'text-indigo-300 hover:bg-slate-800 hover:text-white bg-indigo-950/20'
                    : theme === 'light'
                    ? 'text-slate-700 hover:bg-slate-100 hover:text-black'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive
                    ? 'text-white'
                    : item.highlight
                    ? (theme === 'light' ? 'text-indigo-600' : 'text-indigo-400')
                    : (theme === 'light' ? 'text-slate-600' : 'text-slate-400')
                }`} />

                {item.count !== undefined && item.count > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px] flex items-center justify-center border-2 border-slate-900">
                    {toPersianDigits(item.count)}
                  </span>
                ) : item.badge ? (
                  <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                    theme === 'light' ? 'bg-amber-400 ring-2 ring-white' : 'bg-amber-400 ring-2 ring-slate-900'
                  }`} />
                ) : null}
              </button>
            );
          }

          return (
            <div key={item.id} className="space-y-1">
              <button
                type="button"
                aria-expanded={isStatusItem ? isStatusMenuExpanded : undefined}
                onClick={() => {
                  if (isStatusItem) {
                    if (!isTriSyncRouteActive) {
                      onSelectTab(item.id);
                      setIsStatusMenuExpanded(true);
                    } else {
                      setIsStatusMenuExpanded(prev => !prev);
                    }
                    return;
                  }
                  onSelectTab(item.id);
                  if (isMobile && onCloseMobile) {
                    onCloseMobile();
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : item.highlight
                    ? theme === 'light'
                      ? 'text-indigo-900 hover:bg-slate-100 hover:text-black bg-indigo-50/80 border border-indigo-200'
                      : 'text-indigo-300 hover:bg-slate-800/80 hover:text-white bg-indigo-950/20'
                    : theme === 'light'
                    ? 'text-slate-800 hover:bg-slate-100 hover:text-black'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${
                    isActive
                      ? 'text-white'
                      : item.highlight
                      ? (theme === 'light' ? 'text-indigo-600' : 'text-indigo-400')
                      : (theme === 'light' ? 'text-slate-600' : 'text-slate-400')
                  }`} />
                  <span className={`font-semibold ${
                    isActive
                      ? 'text-white'
                      : theme === 'light'
                      ? 'text-slate-900'
                      : 'text-slate-200'
                  }`}>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      style={
                        !isActive
                          ? { color: '#facc15' }
                          : undefined
                      }
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all shadow-xs ${
                        isActive
                          ? (theme === 'light' ? 'bg-amber-400 text-slate-950 font-black border border-amber-300' : 'bg-white/20 text-white')
                          : theme === 'light'
                          ? 'bg-slate-900 !text-yellow-400 border border-amber-400 font-extrabold shadow-sm'
                          : 'bg-slate-900/90 !text-yellow-400 border border-amber-500/50 font-extrabold shadow-xs'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}

                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold">
                      {toPersianDigits(item.count)}
                    </span>
                  )}

                  {isStatusItem && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isSyncing
                            ? 'bg-amber-400 animate-ping'
                            : isOfflineSimulated || syncState?.status === 'OFFLINE' || syncState?.status === 'SYNC_ERROR'
                            ? 'bg-rose-400'
                            : 'bg-emerald-400'
                        }`}
                        title={
                          isSyncing
                            ? 'در حال همگام‌سازی'
                            : isOfflineSimulated || syncState?.status === 'OFFLINE'
                            ? 'آفلاین'
                            : 'متصل'
                        }
                      />
                      <span className={`${isActive ? 'text-white/90' : 'text-slate-400'}`}>
                        {isStatusMenuExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </button>

              {/* Standardized Category & Subcategory Sub-menu for 'همگام‌سازی ابری و کلاینت‌ها' */}
              {isStatusItem && isStatusMenuExpanded && (
                <div
                  className={`p-2.5 rounded-xl border space-y-3 my-1 shadow-inner ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/90 border-slate-800/90 text-slate-200'
                  }`}
                >
                  {/* Category 1: صفحات داخلی و مانیتورینگ */}
                  <div className="space-y-1.5">
                    <div className={`px-1 text-[10px] font-bold flex items-center gap-1.5 ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Activity className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>بخش‌ها و مانیتورینگ</span>
                    </div>

                    <div className={`pr-2 border-r-2 space-y-1 ${
                      theme === 'light' ? 'border-slate-200' : 'border-slate-800'
                    }`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectTriSyncSubTab) {
                            onSelectTriSyncSubTab('MONITORING');
                          } else {
                            onSelectTab('tri_sync');
                          }
                          if (isMobile && onCloseMobile) onCloseMobile();
                        }}
                        className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer text-right ${
                          isActive && triSyncSubTab === 'MONITORING'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : theme === 'light'
                            ? 'text-slate-700 hover:bg-slate-200/70'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Cloud className="w-3.5 h-3.5 shrink-0 opacity-85" />
                          <span className="truncate">مانیتورینگ ابری و ایستگاه‌ها</span>
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Category 2: مدیریت سیستم و دسترسی‌ها (انحصاری مدیریت ارشد) */}
                  {isManagerAmouei && (
                    <div className={`pt-2 border-t space-y-1.5 ${
                      theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
                    }`}>
                      <div className={`px-1 text-[10px] font-bold flex items-center justify-between gap-1 ${
                        theme === 'light' ? 'text-amber-700' : 'text-amber-300/90'
                      }`}>
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                          <span>مدیریت و تنظیمات ارشد</span>
                        </span>
                        <span className="text-[9px] font-mono opacity-80">مدیر</span>
                      </div>

                      <div className={`pr-2 border-r-2 space-y-1 ${
                        theme === 'light' ? 'border-amber-200' : 'border-amber-500/30'
                      }`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectTriSyncSubTab) {
                              onSelectTriSyncSubTab('PASSWORDS');
                            } else if (onOpenUsersManagement) {
                              onOpenUsersManagement();
                            }
                            if (isMobile && onCloseMobile) onCloseMobile();
                          }}
                          className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer text-right ${
                            isActive && (triSyncSubTab === 'PASSWORDS' || activeTab === 'users_management')
                              ? 'bg-amber-600 text-white shadow-xs'
                              : theme === 'light'
                              ? 'text-slate-700 hover:bg-amber-100/80'
                              : 'text-amber-200/90 hover:bg-amber-950/50 hover:text-amber-100'
                          }`}
                          title="تغییر پسورد و ویرایش مشخصات کاربران (پنل اختصاصی مهندس موسی عمویی)"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <KeyRound className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">کاربران و تغییر رمز عبور</span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectTriSyncSubTab) {
                              onSelectTriSyncSubTab('CYLINDER_CATALOG');
                            } else {
                              onSelectTab('cylinder_tanks_catalog');
                            }
                            if (isMobile && onCloseMobile) onCloseMobile();
                          }}
                          className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer text-right ${
                            isActive && (triSyncSubTab === 'CYLINDER_CATALOG' || activeTab === 'cylinder_tanks_catalog')
                              ? 'bg-amber-600 text-white shadow-xs'
                              : theme === 'light'
                              ? 'text-slate-700 hover:bg-amber-100/80'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                          }`}
                          title="مدیریت کاتالوگ مخازن، شیرآلات و مهره‌ها"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Settings className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">مخازن و ارتباط شیر و مهره</span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectTriSyncSubTab) {
                              onSelectTriSyncSubTab('ZERO_INVENTORY');
                            } else {
                              onSelectTab('tri_sync');
                            }
                            if (isMobile && onCloseMobile) onCloseMobile();
                          }}
                          className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-between gap-1.5 transition-colors cursor-pointer text-right ${
                            isActive && triSyncSubTab === 'ZERO_INVENTORY'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : theme === 'light'
                              ? 'text-rose-700 hover:bg-rose-100/80'
                              : 'text-rose-300 hover:bg-rose-950/50 hover:text-rose-200'
                          }`}
                          title="پاک‌سازی کامل دیتابیس و گزارش‌ها با حفظ کاتالوگ کالاها"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">پاک‌سازی دیتابیس و گزارش‌ها</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Category 3: وضعیت شبکه و کنترل همگام‌سازی */}
                  <div className={`pt-2 border-t space-y-1.5 ${
                    theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
                  }`}>
                    <div className={`px-1 text-[10px] font-bold flex items-center gap-1.5 ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>وضعیت شبکه و کنترل سینک</span>
                    </div>

                    {/* Sync Status Badge + Manual Sync Now Button */}
                    <div className={`flex items-center justify-between gap-1.5 border p-2 rounded-lg text-xs ${
                      theme === 'light'
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-900/90 border-slate-800'
                    }`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSyncing ? (
                          <span className="flex items-center gap-1 text-amber-400 text-[11px] font-semibold">
                            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                            <span className="truncate">در حال تبادل...</span>
                          </span>
                        ) : syncState?.status === 'OFFLINE' || isOfflineSimulated ? (
                          <span className="flex items-center gap-1 text-rose-500 text-[11px] font-semibold">
                            <WifiOff className="w-3 h-3 shrink-0" />
                            <span className="truncate">آفلاین</span>
                          </span>
                        ) : syncState?.status === 'SYNC_ERROR' ? (
                          <span className="flex items-center gap-1 text-rose-500 text-[11px] font-semibold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="truncate">خطا در سینک</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-500 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">همگام با کلودفلر</span>
                          </span>
                        )}

                        {pendingCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px] shrink-0">
                            {toPersianDigits(pendingCount)} صف
                          </span>
                        )}
                      </div>

                      {onSyncNow && (
                        <button
                          type="button"
                          onClick={onSyncNow}
                          disabled={isSyncing || isOfflineSimulated}
                          className={`py-1 px-2 rounded-md border text-[10px] font-medium flex items-center gap-1 transition-all shrink-0 ${
                            isSyncing || isOfflineSimulated
                              ? theme === 'light'
                                ? 'cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                                : 'cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm cursor-pointer'
                          }`}
                          title="همگام‌سازی دستی فوری با سرور مرکزی"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span>سینک دستی</span>
                        </button>
                      )}
                    </div>

                    {/* Offline / Online Simulation Toggle */}
                    {onToggleOffline && (
                      <button
                        type="button"
                        onClick={onToggleOffline}
                        className={`w-full py-1.5 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer ${
                          isOfflineSimulated
                            ? theme === 'light'
                              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                              : 'bg-rose-950/70 border-rose-700/60 text-rose-300 hover:bg-rose-900/60'
                            : theme === 'light'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/50'
                        }`}
                        title="شبیه‌سازی قطع اینترنت و کارکرد آفلاین انبار"
                      >
                        <div className="flex items-center gap-1.5">
                          {isOfflineSimulated ? (
                            <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span>{isOfflineSimulated ? 'اتصال شبکه: آفلاین' : 'اتصال شبکه: آنلاین'}</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          isOfflineSimulated
                            ? theme === 'light' ? 'bg-rose-200 text-rose-900' : 'bg-rose-900/80 text-rose-200'
                            : theme === 'light' ? 'bg-emerald-200 text-emerald-900' : 'bg-emerald-900/80 text-emerald-200'
                        }`}>
                          {isOfflineSimulated ? 'تست قطعی' : 'متصل'}
                        </span>
                      </button>
                    )}

                    {/* Instant Push & Periodic Sync Timers */}
                    <div className="space-y-1">
                      <div className={`flex items-center justify-between px-2 py-1 rounded-md text-[10px] transition-all duration-300 border ${
                        instantSyncFlash
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm animate-pulse'
                          : theme === 'light'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      }`}>
                        <div className="flex items-center gap-1 font-bold">
                          <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>همگام‌سازی اسناد:</span>
                        </div>
                        <span className="font-bold text-[10px]">
                          {instantSyncFlash ? '⚡ همگام شد (آنـی)' : 'فوری با ثبت سند'}
                        </span>
                      </div>

                      <div className={`flex items-center justify-between px-2 py-1 border rounded-md text-[10px] ${
                        theme === 'light'
                          ? 'bg-white border-slate-200 text-slate-600'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-400'
                      }`}>
                        <div className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-cyan-500" />
                          <span className={theme === 'light' ? 'text-slate-700' : 'text-slate-300'}>بررسی دوره‌ای کلودفلر:</span>
                        </div>
                        <span className={`font-mono font-bold ${theme === 'light' ? 'text-cyan-700' : 'text-cyan-300'}`}>
                          {isSyncing ? 'بررسی...' : `${toPersianDigits(countdown)} ثانیه`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Category 4: دیتابیس و راهنما */}
                  <div className={`pt-2 border-t space-y-1.5 ${
                    theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
                  }`}>
                    <div className={`px-1 text-[10px] font-bold flex items-center gap-1.5 ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Database className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>دیتابیس و راهنما</span>
                    </div>

                    <div className="space-y-1">
                      <a
                        href="/mgas_local.db"
                        download="mgas_local.db"
                        onClick={(e) => triggerFileDownload('/mgas_local.db', 'mgas_local.db', e)}
                        className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors text-center shadow-2xs cursor-pointer ${
                          theme === 'light'
                            ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                            : 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 hover:text-white border-indigo-700/60'
                        }`}
                        title="دانلود مستقیم فایل SQLite دیتابیس سیستم فعال (mgas_local.db)"
                      >
                        <Database className="w-3.5 h-3.5 shrink-0" />
                        <span>دانلود دیتابیس محلی (mgas_local.db)</span>
                      </a>

                      {onOpenWin11Troubleshooting && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isMobile && onCloseMobile) onCloseMobile();
                            onOpenWin11Troubleshooting();
                          }}
                          className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center ${
                            theme === 'light'
                              ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-blue-950/50 hover:bg-blue-900/60 text-blue-300 border-blue-800/60'
                          }`}
                          title="راهنمای نصب ویندوز ۱۱، فونت محلی و همگام‌سازی ابری"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>راهنمای نصب ویندوز ۱۱</span>
                        </button>
                      )}

                      {onOpenWinCompat && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isMobile && onCloseMobile) onCloseMobile();
                            onOpenWinCompat();
                          }}
                          className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center ${
                            theme === 'light'
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-slate-900/70 hover:bg-slate-800 text-slate-300 border-slate-700/70'
                          }`}
                          title="راهنمای سازگاری و اجرای انبار در ویندوز ۷"
                        >
                          <Monitor className="w-3.5 h-3.5 shrink-0" />
                          <span>سازگاری ویندوز ۷ (انبار)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category 5: تنظیمات نمایش کاربری */}
                  <div className={`pt-2 border-t space-y-1.5 ${
                    theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
                  }`}>
                    <div className={`px-1 text-[10px] font-bold flex items-center gap-1.5 ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Type className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>تنظیمات نمایش کاربری</span>
                    </div>
                    <FontSizeSettingsControl currentUser={currentUser} defaultExpanded={false} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom-Pinned Public Menu: نسخه‌های نصبی ویندوز (قابل مشاهده و دانلود برای تمامی کاربران) */}
      {!isMobile && isCollapsed ? (
        <div className="p-2 border-t border-slate-800/80 bg-slate-950/60 flex flex-col items-center gap-1.5 justify-center">
          <button
            type="button"
            onClick={() => {
              setIsCollapsed(false);
              setIsInstallersMenuExpanded(true);
            }}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              theme === 'light'
                ? 'text-cyan-700 hover:bg-cyan-100'
                : 'text-cyan-400 hover:text-white hover:bg-slate-800'
            }`}
            title="دانلود نسخه‌های نصبی ویندوز (آفیس ۶۴ بیتی و انبار ۳۲ بیتی)"
          >
            <HardDriveDownload className="w-4 h-4" />
          </button>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                theme === 'light' ? 'text-amber-700 hover:bg-slate-200' : 'text-amber-400 hover:text-white hover:bg-slate-800'
              }`}
              title={theme === 'light' ? 'تغییر به تم تاریک' : 'تغییر به تم روشن'}
            >
              {theme === 'light' ? <Moon className="w-4 h-4 text-indigo-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>
          )}
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="گسترش و باز کردن پنل سایدبار"
          >
            <PanelRightOpen className="w-4 h-4 text-slate-400 hover:text-indigo-400" />
          </button>
        </div>
      ) : (
        <div className={`mt-auto border-t ${
          theme === 'light' ? 'border-slate-200 bg-slate-50/90' : 'border-slate-800/80 bg-slate-950/70'
        }`}>
          {/* New Public Installers Menu Pinned at Bottom */}
          <div className={`p-2 border-b space-y-1.5 ${
            theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
          }`}>
            <button
              type="button"
              aria-expanded={isInstallersMenuExpanded}
              onClick={() => setIsInstallersMenuExpanded(prev => !prev)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                theme === 'light'
                  ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-200'
                  : 'bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 border-cyan-800/60'
              }`}
              title="مشاهده و دانلود نسخه‌های نصبی ویندوز برای همه کاربران"
            >
              <span className="flex items-center gap-2 min-w-0">
                <HardDriveDownload className={`w-4 h-4 shrink-0 ${theme === 'light' ? 'text-cyan-700' : 'text-cyan-400'}`} />
                <span className="truncate">نسخه‌های نصبی ویندوز</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                  theme === 'light'
                    ? 'bg-white text-cyan-800 border-cyan-300'
                    : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                }`}>
                  دانلود
                </span>
                {isInstallersMenuExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 opacity-80" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                )}
              </span>
            </button>

            {isInstallersMenuExpanded && (
              <div className="space-y-1.5 pt-1">
                <a
                  href="/downloads/Office-Windows11-Setup.exe"
                  download="Office-Windows11-Setup.exe"
                  onClick={(e) => {
                    triggerFileDownload('/downloads/Office-Windows11-Setup.exe', 'Office-Windows11-Setup.exe', e);
                    if (isMobile && onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-bold flex items-center justify-between gap-1 transition-colors shadow-2xs cursor-pointer ${
                    theme === 'light'
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 hover:text-emerald-100 border-emerald-700/60'
                  }`}
                  title="دانلود نصاب رسمی ۶۴ بیتی دفتر (ویندوز ۱۰ و ۱۱)"
                >
                  <span className="flex items-center gap-1.5">
                    <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
                    <span>نصاب آفیس ۶۴ بیتی (Win 10/11)</span>
                  </span>
                  <span className={`text-[9px] px-1 py-0.2 rounded border font-mono ${
                    theme === 'light'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  }`}>x64</span>
                </a>

                <a
                  href="/downloads/Warehouse-Windows7-Setup.exe"
                  download="Warehouse-Windows7-Setup.exe"
                  onClick={(e) => {
                    triggerFileDownload('/downloads/Warehouse-Windows7-Setup.exe', 'Warehouse-Windows7-Setup.exe', e);
                    if (isMobile && onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-bold flex items-center justify-between gap-1 transition-colors shadow-2xs cursor-pointer ${
                    theme === 'light'
                      ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200'
                      : 'bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 hover:text-cyan-100 border-cyan-700/60'
                  }`}
                  title="دانلود نصاب رسمی ۳۲ بیتی انبار (ویندوز ۷ و بالاتر)"
                >
                  <span className="flex items-center gap-1.5">
                    <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
                    <span>نصاب انبار ۳۲ بیتی (Win 7)</span>
                  </span>
                  <span className={`text-[9px] px-1 py-0.2 rounded border font-mono ${
                    theme === 'light'
                      ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                      : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  }`}>x86</span>
                </a>
              </div>
            )}
          </div>

          <div className="p-3 text-[11px] text-slate-400 space-y-2">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className={`w-full py-1.5 px-2.5 rounded-lg flex items-center justify-between text-xs font-semibold transition-all border cursor-pointer ${
                theme === 'light'
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 shadow-2xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
              }`}
              title={theme === 'light' ? 'فعال‌سازی تم تاریک (دارک مد)' : 'فعال‌سازی تم روشن با فونت مشکی (لایت مد)'}
            >
              <div className="flex items-center gap-1.5">
                {theme === 'light' ? (
                  <Moon className="w-4 h-4 text-indigo-700" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
                <span>{theme === 'light' ? 'تم روشن (لایت مد)' : 'تم تاریک (دارک مد)'}</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                theme === 'light' ? 'bg-amber-200/80 text-amber-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {theme === 'light' ? 'روز' : 'شب'}
              </span>
            </button>
          )}

          <div className="flex items-center justify-between text-slate-500 text-[10px]">
            <span>معماری همگام‌سازی D1</span>
            {!isMobile ? (
              <button
                onClick={toggleCollapse}
                className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer flex items-center gap-1 transition-colors border border-transparent hover:border-slate-700"
                title="جمع کردن پنل سایدبار"
              >
                <PanelRightClose className="w-3 h-3 text-slate-400" />
                <span>جمع کردن</span>
              </button>
            ) : (
              <span className="font-mono">v2.4.0</span>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900/95 border-l border-slate-800 text-slate-300 shrink-0 min-h-[calc(100vh-65px)] select-none transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer Backdrop & Drawer */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 md:hidden"
        >
          <aside
            className="fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-slate-900 border-l border-slate-800 text-slate-300 flex flex-col shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
