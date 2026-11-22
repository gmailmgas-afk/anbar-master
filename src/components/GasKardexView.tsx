import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Customer,
  GasKardexEntry,
  RuntimeEnvironment,
  User,
  CylinderValveInspection,
  CYLINDER_TYPES,
  CylinderType,
  DEFAULT_CYLINDER_TYPE,
  FORKLIFT_VALVE_TYPES,
  ForkliftValveType,
  CustomCylinderItemType
} from '../types';
import { LocalStorageManager, DEFAULT_CYLINDER_ITEM_TYPES } from '../database/storage';
import { SEED_USERS } from '../database/seed-data';
import { SyncEngine } from '../sync-engine/sync-client';
import {
  exportKardexToXLSX,
  parseKardexFromXLSX,
  recalculateKardexBalances
} from '../database/gas-kardex-data';
import {
  normalizeCylinderType,
  isTankType,
  isPicnic58Type,
  isPicnic56Type,
  isPicnic1LType,
  is11Or25Or50CylinderType,
  getCylinderRelationshipInfo,
  getCylinderDetailedStock,
  matchesForkliftSubtype,
  matchesValveSubtype,
  CYLINDER_VALVE_SUBTYPES_MAP,
  CylinderDetailedStockStatus,
  extractValveBrand,
  getEntrySegregatedValveQuantities,
  getCustomerSpecificValveBalance,
  getCustomerSpecificValveBalanceDetails
} from '../utils/cylinderRelationship';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  Search,
  Users,
  Flame,
  Boxes,
  Wrench,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  Layers,
  FileDown,
  Printer,
  UserPlus,
  ArrowUpDown,
  Filter,
  RefreshCw,
  Phone,
  MapPin,
  Check,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Hash,
  Sparkles,
  Copy,
  Info,
  Eye,
  FileText,
  Truck,
  Edit3,
  Lock,
  Clock,
  Timer,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  LayoutGrid,
  List,
  RotateCcw,
  Calculator,
  ChevronDown,
  Bell,
  BellOff,
  PackageCheck
} from 'lucide-react';
import { formatPersianNumber, formatNumberEn, toEnglishDigits, toPersianDigits, generateUUID, getPersianDate } from '../utils/persian';
import { PersianDatePicker } from './PersianDatePicker';
import {
  printGasKardexDocument,
  resolveKardexDispatchedOrWaybill,
  wrapTextAfterWords
} from '../utils/gasKardexPrint';
import { exportElementToPdf } from '../utils/pdfExport';
import {
  generateSheetNumber,
  parseSheetNumber,
  getCustomerEnglishCode,
  extractMonthAndDay,
  calculateDailyRequestCount,
  formatPersianDateToSheetDateCode
} from '../utils/sheetNumber';
import { GoodsEntryReceiptModal } from './GoodsEntryReceiptModal';
import { GoodsExitReceiptModal } from './GoodsExitReceiptModal';
import { MGasOfficialLogo } from './MGasOfficialLogo';
import { isSafeInput, sanitizeInput, sanitizeNumber, validateFieldSecurity } from '../utils/security';
import { isPendingRepairCylinderKardex, isCustomerValveInspection, isRepairCylinderInspection } from '../utils/cylinderInspection';
import { showToast as showGlobalToast } from '../utils/uiFeedback';
import * as XLSX from 'xlsx';

// Helper to summarize and shorten Kardex movement descriptions for ultra-compact table display
// طبق دستور کاربر:
// ۱. اگر ورود شیر نو بود بنویسد «ورود شیر نو»
// ۲. اگر ورود شیر کهنه بود بنویسد «ورود شیر کهنه»
// ۳. اگر ورودی سیلندر بود با نوع سیلندر نوشته شود (مثلاً: «ورود سیلندر 11 کیلویی»)
export const summarizeKardexDescription = (
  desc: string | undefined,
  entry?: Partial<GasKardexEntry> | null,
  activeCylinderType?: string,
  customItemNames?: string[]
): string => {
  const clean = (desc || '').trim();

  if (clean && customItemNames && customItemNames.some(name => name.trim() === clean)) {
    return clean;
  }

  // تراز اول دوره و ورود از اکسل
  if (clean.includes('موجودی اولیه') || clean.includes('تراز اول دوره')) {
    return 'موجودی اولیه';
  }
  if (clean.includes('ورود از اکسل') || clean.includes('اکسل')) {
    return 'ورود اکسل';
  }

  const cylType = entry?.cylinder_type || activeCylinderType || 'سیلندر 11 کیلویی';
  const normCyl = normalizeCylinderType(cylType);
  const formattedCylName = normCyl.startsWith('سیلندر') ? normCyl : (normCyl.includes('سیلندر') ? normCyl : `سیلندر ${normCyl}`);

  const cylIn = Number(entry?.cylinder_in || 0);
  const cylOut = Number(entry?.cylinder_out || 0);
  const newValveIn = Number(entry?.new_valve_in || 0);
  const newValveOut = Number(entry?.new_valve_out || 0);
  const usedValveIn = Number(entry?.used_valve_in || 0);
  const usedValveOut = Number(entry?.used_valve_out || 0);
  const scrapOut = Number(entry?.scrap_out || 0);
  const scrapStockIn = Number(entry?.scrap_stock_in || 0);

  // بررسی وضعیت رویداد ورودی
  const isIncoming =
    cylIn > 0 ||
    newValveIn > 0 ||
    usedValveIn > 0 ||
    scrapStockIn > 0 ||
    (entry?.transfer_sheet_number && entry.transfer_sheet_number.toLowerCase().includes('i')) ||
    clean.includes('ورود') ||
    clean.includes('وارده') ||
    clean.includes('دریافت');

  if (isIncoming) {
    // قانون ۳: اگر ورودی سیلندر بود با نوع سیلندر نوشته شود
    if (cylIn > 0) {
      return `ورود ${formattedCylName}`;
    }

    // قانون ۱: اگر ورود شیر نو بود بنویسد ورود شیر نو
    if (newValveIn > 0 && usedValveIn === 0 && cylIn === 0) {
      return 'ورود شیر نو';
    }

    // قانون ۲: اگر ورود شیر کهنه بود بنویسد ورود شیر کهنه
    if (usedValveIn > 0 && newValveIn === 0 && cylIn === 0) {
      return 'ورود شیر کهنه';
    }

    // هر دو شیر نو و کهنه همزمان
    if (newValveIn > 0 && usedValveIn > 0 && cylIn === 0) {
      return 'ورود شیر نو و کهنه';
    }

    // اگر مقادیر عددی در آبجکت صفر بودند، استخراج از روی متن شرح
    if (clean.includes('شیر نو') || clean.includes('شیر جدید')) {
      return 'ورود شیر نو';
    }
    if (clean.includes('شیر کهنه') || clean.includes('شیر داغی') || clean.includes('شیر مستعمل')) {
      return 'ورود شیر کهنه';
    }
    if (clean.includes('شیر')) {
      return 'ورود شیر نو';
    }
    if (clean.includes('سیلندر') || clean.includes('کپسول')) {
      return `ورود ${formattedCylName}`;
    }
    if (scrapStockIn > 0 || clean.includes('ضایعات')) {
      return 'ورود ضایعات';
    }

    return `ورود ${formattedCylName}`;
  }

  // رویدادهای خروجی
  if (scrapOut > 0 || clean.includes('ضایعات')) {
    return 'خروج ضایعات';
  }
  if (cylOut > 0) {
    return `خروج ${formattedCylName}`;
  }
  if (newValveOut > 0 && usedValveOut === 0 && cylOut === 0) {
    return 'خروج شیر نو';
  }
  if (usedValveOut > 0 && newValveOut === 0 && cylOut === 0) {
    return 'خروج شیر کهنه';
  }
  if (clean.includes('ارسال و خروج محموله کپسول و بارنامه') || (clean.includes('خروج') && clean.includes('بارنامه'))) {
    return 'خروج و ارسال بار';
  }
  if (clean.includes('خروج') || clean.includes('ارسال') || clean.includes('تحویل') || clean.includes('صادره')) {
    return 'خروج کالا';
  }

  if (clean.length > 22) return clean.slice(0, 20) + '…';
  return clean || `ورود ${formattedCylName}`;
};

interface GasKardexViewProps {
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  customers: Customer[];
  initialCustomerId?: string;
  onCustomerChange?: (id: string) => void;
  pendingInspectionToRegister?: CylinderValveInspection | null;
  onClearPendingInspection?: () => void;
  onNavigateToInspections?: () => void;
  onNavigateToProductionKardex?: () => void;
  onRefresh?: () => void;
}

export const GasKardexView: React.FC<GasKardexViewProps> = ({
  currentEnv,
  currentUser,
  customers,
  initialCustomerId,
  onCustomerChange,
  pendingInspectionToRegister,
  onClearPendingInspection,
  onNavigateToInspections,
  onNavigateToProductionKardex,
  onRefresh
}) => {
  // Active selected customer state - Default: initialCustomerId or البرز گاز (CUST-GAS-011) or first customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || 'CUST-GAS-011'
  );
  const [linkedInspectionId, setLinkedInspectionId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);
  const customerSearchContainerRef = React.useRef<HTMLDivElement>(null);
  const [tableFilterQuery, setTableFilterQuery] = useState<string>('');
  
  // Sheet Number Specific Filters
  const [sheetNumberFilter, setSheetNumberFilter] = useState<string>('');
  const [sheetDirectionFilter, setSheetDirectionFilter] = useState<'all' | 'in' | 'out'>('all');

  // Date Range Specific Filters (از تاریخ - تا تاریخ)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<
    'all' | 'today' | 'last_7_days' | 'last_30_days' | 'current_month' | 'current_year' | 'custom'
  >('all');
  const [showAdvancedDateFilter, setShowAdvancedDateFilter] = useState<boolean>(false);

  // Helper to normalize Shamsi date string for robust chronological comparison
  const normalizeShamsiDate = (d: string | undefined | null): string => {
    if (!d) return '';
    const eng = toEnglishDigits(d).trim().split(/\s+/)[0].replace(/-/g, '/');
    const parts = eng.split('/');
    if (parts.length === 3) {
      const y = parts[0].padStart(4, '0');
      const m = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
    return eng;
  };

  const handleSelectDatePreset = (
    preset: 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'current_month' | 'current_year'
  ) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const todayShamsi = getPersianDate(new Date());
    if (preset === 'today') {
      setStartDate(todayShamsi);
      setEndDate(todayShamsi);
      return;
    }
    if (preset === 'last_7_days') {
      const past = new Date(Date.now() - 7 * 86400000);
      setStartDate(getPersianDate(past));
      setEndDate(todayShamsi);
      return;
    }
    if (preset === 'last_30_days') {
      const past = new Date(Date.now() - 30 * 86400000);
      setStartDate(getPersianDate(past));
      setEndDate(todayShamsi);
      return;
    }
    if (preset === 'current_month') {
      const [year, month] = todayShamsi.split('/');
      const mNum = parseInt(month, 10);
      const maxDays = mNum <= 6 ? 31 : (mNum <= 11 ? 30 : 29);
      setStartDate(`${year}/${month}/01`);
      setEndDate(`${year}/${month}/${String(maxDays).padStart(2, '0')}`);
      return;
    }
    if (preset === 'current_year') {
      const [year] = todayShamsi.split('/');
      setStartDate(`${year}/01/01`);
      setEndDate(`${year}/12/29`);
      return;
    }
  };

  const handleClearAllFilters = () => {
    setSheetNumberFilter('');
    setTableFilterQuery('');
    setSheetDirectionFilter('all');
    setStartDate('');
    setEndDate('');
    setDatePreset('all');
  };
  
  // Modals
  const [showAddEntryModal, setShowAddEntryModal] = useState<boolean>(false);
  const [showEditKardexModal, setShowEditKardexModal] = useState<boolean>(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showNamesListModal, setShowNamesListModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  
  // Dedicated Goods Entry / برگ ورود کالا Modal (M.Gas cylinder)
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [selectedReceiptEntry, setSelectedReceiptEntry] = useState<GasKardexEntry | null>(null);

  // Dedicated Goods Exit / برگه خروج کالا Modal (M.Gas cylinder)
  const [showExitReceiptModal, setShowExitReceiptModal] = useState<boolean>(false);
  const [selectedExitReceiptEntry, setSelectedExitReceiptEntry] = useState<GasKardexEntry | null>(null);

  // Dedicated Order / Document Details Modal (نوشتن شماره برگه در جزئیات سفارش در بخش عملیات)
  const [selectedEntryForDetails, setSelectedEntryForDetails] = useState<GasKardexEntry | null>(null);

  // Trash / Recycle Bin & Deletion Modal States
  const [showTrashModal, setShowTrashModal] = useState<boolean>(false);
  const [deletingEntry, setDeletingEntry] = useState<GasKardexEntry | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState<string>('');
  const [trashCustomerFilter, setTrashCustomerFilter] = useState<'current' | 'all'>('all');
  const [trashSearchQuery, setTrashSearchQuery] = useState<string>('');
  const [showEmptyTrashConfirmModal, setShowEmptyTrashConfirmModal] = useState<boolean>(false);
  const [entryToPermanentlyDelete, setEntryToPermanentlyDelete] = useState<GasKardexEntry | null>(null);

  // Dynamic Custom Item Types (انواع اقلام وارده تعریف‌شده در ورودی سیلندر تعمیری)
  const [customItemTypes, setCustomItemTypes] = useState<CustomCylinderItemType[]>(() => {
    try {
      const items = LocalStorageManager.getCustomItemTypes(currentEnv);
      return items && items.length > 0 ? items : JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES));
    }
  });

  const customItemNames = useMemo(
    () => customItemTypes.map(it => it.name),
    [customItemTypes]
  );

  useEffect(() => {
    const refreshCustomItems = () => {
      try {
        const items = LocalStorageManager.getCustomItemTypes(currentEnv);
        setCustomItemTypes(items && items.length > 0 ? [...items] : JSON.parse(JSON.stringify(DEFAULT_CYLINDER_ITEM_TYPES)));
      } catch {}
    };

    refreshCustomItems();
    const unsub = LocalStorageManager.subscribe(refreshCustomItems);
    window.addEventListener('mgas:custom_item_types_updated', refreshCustomItems);
    window.addEventListener('mgas:database_refreshed', refreshCustomItems);
    window.addEventListener('mgas:database_purged', refreshCustomItems);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.onmessage = (event) => {
          const msgType = event?.data?.type;
          if (
            msgType === 'CUSTOM_ITEM_TYPE_ADDED' ||
            msgType === 'CUSTOM_ITEM_TYPE_UPDATED' ||
            msgType === 'CUSTOM_ITEM_TYPE_DELETED'
          ) {
            refreshCustomItems();
          }
        };
      }
    } catch {}

    return () => {
      unsub();
      window.removeEventListener('mgas:custom_item_types_updated', refreshCustomItems);
      window.removeEventListener('mgas:database_refreshed', refreshCustomItems);
      window.removeEventListener('mgas:database_purged', refreshCustomItems);
      try {
        bc?.close();
      } catch {}
    };
  }, [currentEnv, showAddEntryModal, showEditKardexModal]);

  // Dynamic Repair Cylinder Types loaded from catalog mappings
  const [availableCylinderTypes, setAvailableCylinderTypes] = useState<string[]>(() => {
    try {
      const mappings = LocalStorageManager.getCylinderTankMappings(currentEnv);
      const repairable = mappings.filter(m => m.is_repairable).map(m => m.name);
      return repairable.length > 0 ? repairable : [...CYLINDER_TYPES];
    } catch {
      return [...CYLINDER_TYPES];
    }
  });

  // Active Selected Cylinder Type for Kardex Partitioning
  const [selectedCylinderType, setSelectedCylinderType] = useState<CylinderType>('سیلندر 11 کیلویی');
  const isCurrentTypeTank = isTankType(selectedCylinderType);
  const [selectedForkliftValveSubtype, setSelectedForkliftValveSubtype] = useState<string>('ALL');
  const [selectedValveSubtype, setSelectedValveSubtype] = useState<string>('همه');

  // Synchronize available cylinder types when catalog mappings are added/edited/deleted
  useEffect(() => {
    const handleMappingsUpdated = () => {
      try {
        const mappings = LocalStorageManager.getCylinderTankMappings(currentEnv);
        const repairable = mappings.filter(m => m.is_repairable).map(m => m.name);
        const nextTypes = repairable.length > 0 ? repairable : [...CYLINDER_TYPES];
        setAvailableCylinderTypes(nextTypes);
        setSelectedCylinderType(prev => {
          if (!nextTypes.includes(prev)) {
            return (nextTypes[0] as CylinderType) || 'سیلندر 11 کیلویی';
          }
          return prev;
        });
        setAllKardexEntries([...(LocalStorageManager.getState(currentEnv).gas_kardex_entries || []).map(e => ({ ...e }))]);
      } catch {}
    };

    window.addEventListener('mgas:cylinder_mappings_updated', handleMappingsUpdated);
    window.addEventListener('mgas:database_refreshed', handleMappingsUpdated);
    window.addEventListener('mgas:database_purged', handleMappingsUpdated);
    return () => {
      window.removeEventListener('mgas:cylinder_mappings_updated', handleMappingsUpdated);
      window.removeEventListener('mgas:database_refreshed', handleMappingsUpdated);
      window.removeEventListener('mgas:database_purged', handleMappingsUpdated);
    };
  }, [currentEnv]);

  const [showCylinderDropdown, setShowCylinderDropdown] = useState<boolean>(false);
  const cylinderDropdownRef = React.useRef<HTMLDivElement>(null);

  // Cylinder Dropdown in Customer Header (Next to Edit Customer Button)
  const [showCustomerHeaderCylinderDropdown, setShowCustomerHeaderCylinderDropdown] = useState<boolean>(false);
  const customerHeaderCylinderDropdownRef = React.useRef<HTMLDivElement>(null);

  // Outside click listener for cylinder selection dropdowns and customer search suggestions
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (cylinderDropdownRef.current && !cylinderDropdownRef.current.contains(e.target as Node)) {
        setShowCylinderDropdown(false);
      }
      if (customerHeaderCylinderDropdownRef.current && !customerHeaderCylinderDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerHeaderCylinderDropdown(false);
      }
      if (customerSearchContainerRef.current && !customerSearchContainerRef.current.contains(e.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // KPI Metrics View Mode (Cards vs List)
  const [kpiViewMode, setKpiViewMode] = useState<'cards' | 'list'>('cards');

  // Global Escape key listener to close active modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCylinderDropdown(false);
        setShowAddEntryModal(false);
        setShowNewCustomerModal(false);
        setShowImportModal(false);
        setShowNamesListModal(false);
        setShowPrintModal(false);
        setShowReceiptModal(false);
        setShowExitReceiptModal(false);
        setShowEditCustomerModal(false);
        setShowEditKardexModal(false);
        setEditingKardexEntry(null);
        setShowEmptyTrashConfirmModal(false);
        setEntryToPermanentlyDelete(null);
        setSelectedEntryForDetails(null);
        setShowNotificationsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Edit Customer Modal State
  const [showEditCustomerModal, setShowEditCustomerModal] = useState<boolean>(false);
  const [editCustomerForm, setEditCustomerForm] = useState({
    name: '',
    company_name: '',
    province: 'تهران',
    city: 'تهران',
    phone: '',
    national_id: '',
    economic_code: '',
    address: '',
    customer_type: 'عمده' as Customer['customer_type'],
    notes: ''
  });

  // Modal for viewing this customer's segregated valve stock (IN, OUT, REMAINING)
  const [showCustomerValveReportModal, setShowCustomerValveReportModal] = useState<boolean>(false);

  // Helper to determine if an entry is outgoing (خروج سیلندر، ضایعات یا شیرآلات نو و کهنه)
  const isOutgoingEntry = (entry: GasKardexEntry | null | undefined): boolean => {
    if (!entry) return false;
    if (entry.cylinder_out > 0 || entry.scrap_out > 0) return true;
    if (entry.new_valve_out > 0 || entry.used_valve_out > 0) return true;
    if (entry.valve_items && entry.valve_items.some(v => v.direction === 'OUT' || (Number(v.quantity) > 0 && !v.direction))) return true;
    if (entry.transfer_sheet_number && entry.transfer_sheet_number.toLowerCase().includes('e')) return true;
    if (entry.description && (entry.description.includes('خروج') || entry.description.includes('ارسال') || entry.description.includes('تحویل') || entry.description.includes('توزیع') || entry.description.includes('حواله'))) return true;
    return false;
  };

  // Helper to determine if an entry is incoming (ورود سیلندر، ضایعات یا شیرآلات نو و کهنه)
  const isIncomingEntry = (entry: GasKardexEntry | null | undefined): boolean => {
    if (!entry) return false;
    if (entry.cylinder_in > 0 || entry.scrap_stock_in > 0) return true;
    if (entry.new_valve_in > 0 || entry.used_valve_in > 0) return true;
    if (entry.valve_items && entry.valve_items.some(v => v.direction === 'IN')) return true;
    if (entry.transfer_sheet_number && entry.transfer_sheet_number.toLowerCase().includes('i')) return true;
    if (entry.description && (entry.description.includes('ورود') || entry.description.includes('وارده') || entry.description.includes('دریافت') || entry.description.includes('رسید'))) return true;
    return false;
  };
  
  // Tab inside Add Entry Modal: 'in' = ورودی (i) | 'out' = خروجی (e)
  const [entryTab, setEntryTab] = useState<'in' | 'out'>('in');
  const [copiedSheet, setCopiedSheet] = useState<boolean>(false);
  const [dailyLoadingCount, setDailyLoadingCount] = useState<number>(1);

  // Notifications Popup Modal & History State
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);
  const [notificationsTab, setNotificationsTab] = useState<'all' | 'pending' | 'status' | 'logs'>('all');
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string>('');
  const [notificationHistory, setNotificationHistory] = useState<
    Array<{ id: string; message: string; type: 'success' | 'info' | 'error'; time: string; read: boolean }>
  >([]);

  // Form State for new Kardex Entry
  const [newEntry, setNewEntry] = useState<{
    date: string;
    description: string;
    transfer_sheet_number: string;
    cylinder_type: CylinderType;
    forklift_valve_type: ForkliftValveType;
    valve_subtype: string;
    cylinder_in: number;
    cylinder_out: number;
    scrap_out: number;
    scrap_stock_in: number;
    cylinder_balance: number;
    scrap_balance: number;
    new_valve_in: number;
    new_valve_out: number;
    new_valve_balance: number;
    dispatched: string;
    waybill_number?: string;
    used_valve_in: number;
    used_valve_out: number;
    used_valve_balance: number;
    defective: number;
    notes: string;
    valve_items?: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }>;
  }>({
    date: getPersianDate(),
    description: '',
    transfer_sheet_number: '',
    cylinder_type: 'سیلندر 11 کیلویی',
    forklift_valve_type: 'شیر بوتانی لیفتراکی',
    valve_subtype: 'شیر بوتانی لیفتراکی',
    cylinder_in: 0,
    cylinder_out: 0,
    scrap_out: 0,
    scrap_stock_in: 0,
    cylinder_balance: 0,
    scrap_balance: 0,
    new_valve_in: 0,
    new_valve_out: 0,
    new_valve_balance: 0,
    dispatched: '',
    waybill_number: '',
    used_valve_in: 0,
    used_valve_out: 0,
    used_valve_balance: 0,
    defective: 0,
    notes: '',
    valve_items: []
  });

  // Form State for New Customer
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    company_name: '',
    province: 'تهران',
    city: 'تهران',
    phone: '',
    national_id: '',
    economic_code: '',
    address: '',
    credit_limit: 100000000,
    current_balance: 0,
    customer_type: 'عمده' as const,
    notes: 'طرف حساب جدید ثبت‌شده در کاردکس گاز'
  });

  // Import File State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Database State and Reactive Kardex Entries State (Instant AJAX / Optimistic UI)
  const dbState = LocalStorageManager.getState(currentEnv);
  const [allKardexEntries, setAllKardexEntries] = useState<GasKardexEntry[]>(() => {
    const state = LocalStorageManager.getState(currentEnv);
    return state.gas_kardex_entries || [];
  });

  // Track the most recently added entry for instant visual Ajax highlight
  const [recentlyAddedEntryId, setRecentlyAddedEntryId] = useState<string | null>(null);

  // Unrestricted document editing for all authenticated users (1-hour timer disabled)


  // Seamless and subtle refresh helper to keep React UI 100% synchronized with storage after all creates/deletes
  const triggerSeamlessRefresh = useCallback(() => {
    const updated = LocalStorageManager.getState(currentEnv);
    setAllKardexEntries([...(updated.gas_kardex_entries || []).map(e => ({ ...e }))]);
    onRefresh?.();
    try {
      window.dispatchEvent(new CustomEvent('mgas:db_refreshed', { detail: { env: currentEnv } }));
      window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: { env: currentEnv } }));
      window.dispatchEvent(new CustomEvent('mgas:kardex_trash_updated', { detail: { env: currentEnv } }));
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.postMessage({ type: 'KARDEX_REFRESHED' });
        bc.close();
      }
    } catch {}
  }, [currentEnv, onRefresh]);

  // Synchronize state instantaneously with storage, custom events, BroadcastChannel, and Windows desktop updates
  useEffect(() => {
    // 1. Initial sync
    const fresh = LocalStorageManager.getState(currentEnv);
    setAllKardexEntries([...(fresh.gas_kardex_entries || []).map(e => ({ ...e }))]);

    const syncGlobalKardexNotifications = () => {
      const updated = LocalStorageManager.getState(currentEnv);
      if (updated.is_purged && (!updated.notifications || updated.notifications.length === 0)) {
        setNotificationHistory([]);
        return;
      }
      const globalItems = LocalStorageManager.getNotificationsForUser(currentEnv, currentUser)
        .filter(n => n.category === 'KARDEX_REPAIR' || n.category === 'INSPECTION')
        .slice(0, 20)
        .map(n => ({
          id: n.notification_id,
          message: `${n.title}: ${n.message}`,
          type: (n.level === 'error' ? 'error' : n.level === 'success' ? 'success' : 'info') as 'success' | 'info' | 'error',
          time: new Date(n.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          read: Array.isArray(n.read_by) && currentUser?.user_id ? n.read_by.includes(currentUser.user_id) : false
        }));
      if (globalItems.length > 0) {
        setNotificationHistory(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const merged = [...globalItems.filter(g => !existingIds.has(g.id)), ...prev];
          return merged.slice(0, 30);
        });
      }
    };
    syncGlobalKardexNotifications();

    // 2. LocalStorageManager subscriber (fired whenever recordLocalChange/saveState runs anywhere)
    const unsubscribeStorage = LocalStorageManager.subscribe(() => {
      const updated = LocalStorageManager.getState(currentEnv);
      setAllKardexEntries([...(updated.gas_kardex_entries || []).map(e => ({ ...e }))]);
      if (updated.is_purged && (!updated.notifications || updated.notifications.length === 0)) {
        setNotificationHistory([]);
      }
    });

    // 3. Database refreshed event handler (silent instant update)
    const handleDbRefreshed = () => {
      const updated = LocalStorageManager.getState(currentEnv);
      setAllKardexEntries([...(updated.gas_kardex_entries || []).map(e => ({ ...e }))]);
      syncGlobalKardexNotifications();
    };
    window.addEventListener('mgas:db_refreshed' as any, handleDbRefreshed);
    window.addEventListener('mgas:notifications_updated' as any, syncGlobalKardexNotifications);

    const handleDatabasePurged = () => {
      const updated = LocalStorageManager.getState(currentEnv);
      setAllKardexEntries([...(updated.gas_kardex_entries || []).map(e => ({ ...e }))]);
      if (!updated.notifications || updated.notifications.length === 0) {
        setNotificationHistory([]);
      }
      setWarehouseStockVersion(v => v + 1);
    };
    window.addEventListener('mgas:database_purged' as any, handleDatabasePurged);

    // 4. Trash updated event handler (instant row removal/restoration)
    const handleTrashUpdated = () => {
      const updated = LocalStorageManager.getState(currentEnv);
      setAllKardexEntries([...(updated.gas_kardex_entries || []).map(e => ({ ...e }))]);
    };
    window.addEventListener('mgas:kardex_trash_updated' as any, handleTrashUpdated);

    // 5. Window custom event for instant local ajax row insertion
    const handleKardexUpdated = (e: any) => {
      const entryDetail: GasKardexEntry | undefined = e?.detail;
      const updated = LocalStorageManager.getState(currentEnv);
      setAllKardexEntries([...(updated.gas_kardex_entries || []).map(item => ({ ...item }))]);
      if (entryDetail && entryDetail.customer_id === selectedCustomerId) {
        setRecentlyAddedEntryId(entryDetail.entry_id);
        setTimeout(() => setRecentlyAddedEntryId(null), 3500);
      }
    };
    window.addEventListener('mgas:kardex_updated' as any, handleKardexUpdated);

    // 6. Cross-tab & Multi-window BroadcastChannel (for multiple tabs and Windows Electron instances)
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.onmessage = (event) => {
          const updated = LocalStorageManager.getState(currentEnv);
          setAllKardexEntries([...(updated.gas_kardex_entries || []).map(item => ({ ...item }))]);
          if (event.data?.entry && event.data.entry.customer_id === selectedCustomerId) {
            setRecentlyAddedEntryId(event.data.entry.entry_id);
            setTimeout(() => setRecentlyAddedEntryId(null), 3500);
          }
        };
      }
    } catch {}

    // 7. Windows Desktop API / Electron Bridge event listener if running in Windows 11 / Windows 7
    let cleanupDesktop: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.desktopAPI?.onDatabaseUpdated) {
      cleanupDesktop = window.desktopAPI.onDatabaseUpdated(() => {
        const updated = LocalStorageManager.getState(currentEnv);
        setAllKardexEntries([...(updated.gas_kardex_entries || []).map(item => ({ ...item }))]);
      });
    }

    return () => {
      unsubscribeStorage();
      window.removeEventListener('mgas:db_refreshed' as any, handleDbRefreshed);
      window.removeEventListener('mgas:notifications_updated' as any, syncGlobalKardexNotifications);
      window.removeEventListener('mgas:database_purged' as any, handleDatabasePurged);
      window.removeEventListener('mgas:kardex_trash_updated' as any, handleTrashUpdated);
      window.removeEventListener('mgas:kardex_updated' as any, handleKardexUpdated);
      if (bc) bc.close();
      if (cleanupDesktop) cleanupDesktop();
    };
  }, [currentEnv, selectedCustomerId, currentUser]);

  // Active Customer Object
  const currentCustomer = useMemo(() => {
    return customers.find(c => c.customer_id === selectedCustomerId) || customers[0];
  }, [customers, selectedCustomerId]);

  const availableValveSubtypes = useMemo(() => {
    const norm = normalizeCylinderType(selectedCylinderType);
    const is11_25_50 = is11Or25Or50CylinderType(norm);
    const standardList = CYLINDER_VALVE_SUBTYPES_MAP[norm] || ['همه'];

    // Dynamically discover any valve types recorded in entries for this customer & cylinder (or shared 11/25/50 family)
    const recordedValveTypes = new Set<string>();
    if (currentCustomer) {
      allKardexEntries.forEach(e => {
        if (e.customer_id === currentCustomer.customer_id && !e.is_deleted) {
          const eNorm = normalizeCylinderType(e.cylinder_type);
          const typeMatches = (eNorm === norm) || (is11_25_50 && is11Or25Or50CylinderType(eNorm));
          if (typeMatches) {
            if (e.valve_items && e.valve_items.length > 0) {
              e.valve_items.forEach(vi => {
                if (vi.valve_name) recordedValveTypes.add(vi.valve_name);
              });
            }
            if (e.valve_subtype) recordedValveTypes.add(e.valve_subtype);
            if (e.forklift_valve_type && norm === 'سیلندر لیفتراکی') recordedValveTypes.add(e.forklift_valve_type);
          }
        }
      });
    }

    const result: string[] = ['همه'];
    standardList.forEach(s => {
      if (s !== 'همه' && !result.includes(s)) result.push(s);
    });

    recordedValveTypes.forEach(rv => {
      const brand = extractValveBrand(rv);
      if (brand !== 'UNKNOWN') {
        const alreadyHas = result.some(item => extractValveBrand(item) === brand);
        if (!alreadyHas) {
          result.push(rv);
        }
      } else if (!result.includes(rv)) {
        result.push(rv);
      }
    });

    return result.filter(item => {
      if (item === 'همه') return true;
      if (item.includes('ام‌گاز') || item.includes('ام گاز') || item.toLowerCase().includes('mgas')) return false;
      return true;
    });
  }, [selectedCylinderType, currentCustomer, allKardexEntries]);



  // Entries for selected customer and cylinder type sorted by date (Active only - excludes Trashed/Deleted entries)
  // User Rule: شیر سیلندر 11 کیلویی برابر است با شیر سیلندر 25 کیلویی و 50 کیلویی (شیر ۱۱/۲۵/۵۰)
  const customerEntries = useMemo(() => {
    if (!currentCustomer) return [];
    const isForklift = selectedCylinderType === 'سیلندر لیفتراکی';
    const is11_25_50_selected = is11Or25Or50CylinderType(selectedCylinderType);
    const effectiveValveSubtype = (selectedValveSubtype && selectedValveSubtype !== 'همه' && selectedValveSubtype !== 'ALL')
      ? selectedValveSubtype
      : (isForklift && selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') && selectedForkliftValveSubtype !== 'همه' ? selectedForkliftValveSubtype : undefined);

    const filtered = allKardexEntries.filter(
      e => {
        if (e.customer_id !== currentCustomer.customer_id || e.is_deleted) return false;
        const cType = normalizeCylinderType(e.cylinder_type);
        const cTypeMatches = (cType === selectedCylinderType) || (is11_25_50_selected && is11Or25Or50CylinderType(cType));
        if (!cTypeMatches) return false;
        if (effectiveValveSubtype) {
          return matchesValveSubtype(e, effectiveValveSubtype, currentEnv);
        }
        return true;
      }
    );
    const sorted = [...filtered].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // If an entry came from another cylinder size in the 11/25/50 family, zero out cylinder body quantities so it doesn't inflate cylinder body balance
    const normalizedSorted = sorted.map(e => {
      const cType = normalizeCylinderType(e.cylinder_type);
      if (cType !== selectedCylinderType && is11_25_50_selected && is11Or25Or50CylinderType(cType)) {
        return {
          ...e,
          cylinder_in: 0,
          cylinder_out: 0,
          scrap_out: 0,
          scrap_stock_in: 0
        };
      }
      return e;
    });

    if (effectiveValveSubtype) {
      // Map entries to their exact segregated valve numbers entered for this subtype!
      const mapped = normalizedSorted.map(e => {
        const seg = getEntrySegregatedValveQuantities(e, effectiveValveSubtype, currentEnv);
        return {
          ...e,
          new_valve_in: seg.new_valve_in,
          new_valve_out: seg.new_valve_out,
          used_valve_in: seg.used_valve_in,
          used_valve_out: seg.used_valve_out
        };
      });
      return recalculateKardexBalances(mapped, true);
    }

    return recalculateKardexBalances(normalizedSorted);
  }, [allKardexEntries, currentCustomer, selectedCylinderType, selectedForkliftValveSubtype, selectedValveSubtype, currentEnv]);

  // Count of entries per cylinder type for current customer
  const cylinderTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'سیلندر 11 کیلویی': 0,
      'سیلندر 8/10 کیلویی': 0,
      'سیلندر 50 کیلویی': 0,
      'سیلندر لیفتراکی': 0
    };
    if (!currentCustomer) return counts;
    allKardexEntries
      .filter(e => e.customer_id === currentCustomer.customer_id && !e.is_deleted)
      .forEach(e => {
        const type = normalizeCylinderType(e.cylinder_type);
        counts[type] = (counts[type] || 0) + 1;
      });
    return counts;
  }, [allKardexEntries, currentCustomer]);

  // Real-time stock status and cylinder-valve-nut relationships for all cylinder types
  const cylinderStocksMap = useMemo(() => {
    if (!currentCustomer) return {} as Record<CylinderType, CylinderDetailedStockStatus>;
    const map: Partial<Record<CylinderType, CylinderDetailedStockStatus>> = {};
    const activeSub = (selectedValveSubtype && selectedValveSubtype !== 'همه' && selectedValveSubtype !== 'ALL')
      ? selectedValveSubtype
      : (selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') && selectedForkliftValveSubtype !== 'همه' ? selectedForkliftValveSubtype : undefined);

    availableCylinderTypes.forEach(t => {
      const norm = normalizeCylinderType(t);
      const isFork = norm === 'سیلندر لیفتراکی';
      map[t] = getCylinderDetailedStock(
        currentEnv,
        currentCustomer.customer_id,
        t,
        allKardexEntries,
        isFork ? activeSub : (norm === selectedCylinderType ? activeSub : undefined)
      );
    });
    return map as Record<CylinderType, CylinderDetailedStockStatus>;
  }, [currentEnv, currentCustomer, allKardexEntries, selectedForkliftValveSubtype, selectedValveSubtype, selectedCylinderType, availableCylinderTypes]);

  // Active selected cylinder stock status
  const currentCylinderStockStatus = useMemo(() => {
    if (!currentCustomer) return null;
    return cylinderStocksMap[selectedCylinderType] || getCylinderDetailedStock(
      currentEnv,
      currentCustomer.customer_id,
      selectedCylinderType,
      allKardexEntries,
      selectedCylinderType === 'سیلندر لیفتراکی' ? selectedForkliftValveSubtype : undefined
    );
  }, [cylinderStocksMap, currentCustomer, selectedCylinderType, currentEnv, allKardexEntries, selectedForkliftValveSubtype]);

  // Trashed / Deleted entries across the system (Recycle Bin)
  const trashedEntries = useMemo(() => {
    return allKardexEntries.filter(e => e.is_deleted);
  }, [allKardexEntries]);

  // Trashed entries filtered for display in Recycle Bin modal
  const filteredTrashedEntries = useMemo(() => {
    let list = trashedEntries;
    if (trashCustomerFilter === 'current' && currentCustomer) {
      list = list.filter(e => e.customer_id === currentCustomer.customer_id);
    }
    if (trashSearchQuery.trim()) {
      const q = trashSearchQuery.toLowerCase().trim();
      list = list.filter(e =>
        (e.transfer_sheet_number && e.transfer_sheet_number.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.customer_name && e.customer_name.toLowerCase().includes(q)) ||
        (e.date && e.date.includes(q)) ||
        (e.delete_reason && e.delete_reason.toLowerCase().includes(q)) ||
        (e.deleted_by && e.deleted_by.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.deleted_at || b.updated_at || '').localeCompare(a.deleted_at || a.updated_at || ''));
  }, [trashedEntries, trashCustomerFilter, currentCustomer, trashSearchQuery]);

  // Filtered rows inside table based on search and sheet number
  const displayedEntries = useMemo(() => {
    let result = customerEntries;

    // Filter by Sheet Direction (all / in / out)
    if (sheetDirectionFilter === 'in') {
      result = result.filter(item => {
        const num = (item.transfer_sheet_number || '').trim().toLowerCase();
        return num.endsWith('i') || (item.cylinder_in > 0 || item.new_valve_in > 0 || item.used_valve_in > 0);
      });
    } else if (sheetDirectionFilter === 'out') {
      result = result.filter(item => {
        const num = (item.transfer_sheet_number || '').trim().toLowerCase();
        return num.endsWith('e') || (item.cylinder_out > 0 || item.new_valve_out > 0 || item.used_valve_out > 0 || item.scrap_out > 0);
      });
    }

    // Filter by Dedicated Sheet Number search
    if (sheetNumberFilter.trim()) {
      const snQ = sheetNumberFilter.toLowerCase().trim();
      result = result.filter(item =>
        item.transfer_sheet_number && item.transfer_sheet_number.toLowerCase().includes(snQ)
      );
    }

    // Filter by Date Range (از تاریخ - تا تاریخ)
    if (startDate.trim()) {
      const normStart = normalizeShamsiDate(startDate);
      result = result.filter(item => {
        const itemDate = normalizeShamsiDate(item.date);
        return !itemDate || itemDate >= normStart;
      });
    }
    if (endDate.trim()) {
      const normEnd = normalizeShamsiDate(endDate);
      result = result.filter(item => {
        const itemDate = normalizeShamsiDate(item.date);
        return !itemDate || itemDate <= normEnd;
      });
    }

    // General text query (description, date, etc.)
    if (tableFilterQuery.trim()) {
      const q = tableFilterQuery.toLowerCase().trim();
      result = result.filter(
        item =>
          item.description.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q) ||
          (item.transfer_sheet_number && item.transfer_sheet_number.toLowerCase().includes(q)) ||
          (item.custom_item_name && item.custom_item_name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [customerEntries, sheetDirectionFilter, sheetNumberFilter, tableFilterQuery, startDate, endDate]);

  // Ledger summary metrics strictly for current customer
  const stats = useMemo(() => {
    const last = customerEntries[customerEntries.length - 1];
    const totalScrapStockIn = customerEntries.reduce((acc, cur) => acc + (cur.scrap_stock_in || 0), 0);
    const totalScrapOut = customerEntries.reduce((acc, cur) => acc + (cur.scrap_out || 0), 0);
    const netTempScrap = Math.max(0, totalScrapStockIn - totalScrapOut);

    return {
      currentCylinders: last ? last.cylinder_balance : 0,
      currentScrap: last ? Math.max(0, last.scrap_balance || 0) : 0,
      netTempScrap, // خالص ذخیره انبار ضایعات (موقت ماهانه که خروج ضایعات از آن کم می‌کند)
      currentNewValves: last ? last.new_valve_balance : 0,
      currentUsedValves: last ? (last.used_valve_balance ?? 0) : 0,
      totalEntries: customerEntries.length,
      totalDispatched: customerEntries.filter(cur => Boolean(resolveKardexDispatchedOrWaybill(cur))).length,
      totalDefective: customerEntries.reduce((acc, cur) => acc + (cur.defective || 0), 0),
      totalCylinderIn: customerEntries.reduce((acc, cur) => acc + (cur.cylinder_in || 0), 0),
      totalCylinderOut: customerEntries.reduce((acc, cur) => acc + (cur.cylinder_out || 0), 0),
      totalScrapOut,
      totalScrapStockIn,
      totalNewValveIn: customerEntries.reduce((acc, cur) => acc + (cur.new_valve_in || 0), 0),
      totalNewValveOut: customerEntries.reduce((acc, cur) => acc + (cur.new_valve_out || 0), 0),
      totalUsedValveIn: customerEntries.reduce((acc, cur) => acc + (cur.used_valve_in || 0), 0),
      totalUsedValveOut: customerEntries.reduce((acc, cur) => acc + (cur.used_valve_out || 0), 0)
    };
  }, [customerEntries]);

  // Filtered customer list for instant suggestions (name, company, province, id)
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    if (!q) return [];
    return customers.filter(
      c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.province && c.province.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.customer_id && c.customer_id.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [customers, customerSearchQuery]);

  // All customers sorted alphabetically for full dropdown menu
  const allSortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
  }, [customers]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    showGlobalToast(message, type, 4500);
    const timeLabel = new Date().toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setNotificationHistory(prev => [
      { id: generateUUID(), message, type, time: timeLabel, read: false },
      ...prev
    ].slice(0, 30));
  };

  // Switch customer handler (syncing all parts of view)
  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    onCustomerChange?.(custId);
    const target = customers.find(c => c.customer_id === custId);
    if (target) {
      showToast(`کاردکس گاز «${target.name}» فعال شد.`, 'info');
    }
  };

  // Live Warehouse Stock of "قطعه شیر نو" & reactive updates
  const [warehouseStockVersion, setWarehouseStockVersion] = useState(0);

  useEffect(() => {
    const handleStockChanged = () => {
      setWarehouseStockVersion(v => v + 1);
    };
    window.addEventListener('mgas:stock_movement_added', handleStockChanged);
    window.addEventListener('mgas:inspection_added', handleStockChanged);
    window.addEventListener('mgas:database_refreshed', handleStockChanged);
    window.addEventListener('mgas:database_purged', handleStockChanged);
    window.addEventListener('mgas:cylinder_mappings_updated', handleStockChanged);
    return () => {
      window.removeEventListener('mgas:stock_movement_added', handleStockChanged);
      window.removeEventListener('mgas:inspection_added', handleStockChanged);
      window.removeEventListener('mgas:database_refreshed', handleStockChanged);
      window.removeEventListener('mgas:database_purged', handleStockChanged);
      window.removeEventListener('mgas:cylinder_mappings_updated', handleStockChanged);
    };
  }, []);

  const newValveWarehouseStock = useMemo(() => {
    try {
      return LocalStorageManager.getNewValveWarehouseStock(currentEnv);
    } catch {
      return 0;
    }
  }, [currentEnv, showAddEntryModal, showEditKardexModal, allKardexEntries, warehouseStockVersion]);

  // Pending Repair Cylinder Inspections from Hajivand (Strictly filtered to repair cylinders only)
  const pendingInspections = useMemo(() => {
    try {
      const customTypes = LocalStorageManager.getCustomItemTypes(currentEnv);
      return LocalStorageManager.getCylinderValveInspections(currentEnv).filter(
        i => isPendingRepairCylinderKardex(i, customTypes)
      );
    } catch {
      return [];
    }
  }, [currentEnv, allKardexEntries, warehouseStockVersion]);

  // Handler to load an unlinked inspection (valve intake or cylinder repair) into the entry form
  const handleLoadInspectionIntoEntry = (insp: CylinderValveInspection) => {
    if (insp.customer_id && insp.customer_id !== selectedCustomerId) {
      setSelectedCustomerId(insp.customer_id);
      onCustomerChange?.(insp.customer_id);
    }
    setEntryTab('in');
    setDailyLoadingCount(1);
    setLinkedInspectionId(insp.inspection_id);

    const localCustomTypes = LocalStorageManager.getCustomItemTypes(currentEnv);
    const isRepairCylinder = isRepairCylinderInspection(insp, localCustomTypes) ||
      insp.item_type?.includes('CYLINDER') ||
      (insp.item_name || '').includes('سیلندر') ||
      Boolean(insp.receipt_items && insp.receipt_items.some(it => (it as any).item_type?.includes('CYLINDER') || ((it as any).item_name || '').includes('سیلندر') || (it.description || '').includes('سیلندر')));

    const isCustomerValve = !isRepairCylinder && isCustomerValveInspection(insp);
    const isValve = !isRepairCylinder && (isCustomerValve || insp.item_type?.includes('VALVE') || (insp.item_name || '').includes('شیر'));
    const isCylinder = isRepairCylinder;

    let calcNewValves = 0;
    let calcUsedValves = 0;

    // Strict Target Cylinder Determination
    // Rule:
    // 1) 11/25/50 valves strictly map to 'سیلندر 11 کیلویی'
    // 2) Picnic 5/8 kg valves strictly map to 'پیکنیک 5/8 کیلویی'
    // 3) Picnic 1/1.5/3 L valves strictly map to 'پیکنیک 1/1.5/3 لیتری'
    // 4) Forklift valves strictly map to 'سیلندر لیفتراکی'
    // 5) Tanks NEVER take valves!
    let targetCylinderType: CylinderType = 'سیلندر 11 کیلویی';

    let segregatedItemsForTarget: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];

    if (insp.valve_breakdown) {
      const sum11 = (b: any) =>
        (Number(b?.parsi) || 0) +
        (Number(b?.butane) || 0) +
        (Number(b?.iranGazi) || 0) +
        (Number(b?.forklift) || 0) +
        (Number(b?.iraqi) || 0);
      const sumFork = (b: any) =>
        (Number(b?.parsi) || 0) +
        (Number(b?.butane) || 0) +
        (Number(b?.iranGazi) || 0) +
        (Number(b?.passari) || 0);
      const sumP = (b: any) => (Number(b?.parsi) || 0) + (Number(b?.butane) || 0);

      const v11New = sum11(insp.valve_breakdown.valves11kgNew);
      const v11Used = sum11(insp.valve_breakdown.valves11kgUsed);
      const vForkNew = sumFork(insp.valve_breakdown.valvesForklift22kgNew);
      const vForkUsed = sumFork(insp.valve_breakdown.valvesForklift22kgUsed);
      const vPicnicNew = sumP(insp.valve_breakdown.valvesPicnicNew || insp.valve_breakdown.valvesPicnic5kg);
      const vPicnicUsed = sumP(insp.valve_breakdown.valvesPicnicUsed || insp.valve_breakdown.valvesPicnic2kg);
      const vPicnic58New = sumP(insp.valve_breakdown.valvesPicnic58kgNew);
      const vPicnic58Used = sumP(insp.valve_breakdown.valvesPicnic58kgUsed);

      const currentNorm = normalizeCylinderType(selectedCylinderType);
      let matchedCurrent = false;

      if ((currentNorm === 'سیلندر 11 کیلویی' || currentNorm === 'سیلندر 50 کیلویی' || currentNorm === 'سیلندر 8/10 کیلویی') && (v11New + v11Used > 0)) {
        targetCylinderType = currentNorm;
        calcNewValves = v11New;
        calcUsedValves = v11Used;
        matchedCurrent = true;
      } else if (currentNorm === 'سیلندر لیفتراکی' && (vForkNew + vForkUsed > 0)) {
        targetCylinderType = 'سیلندر لیفتراکی';
        calcNewValves = vForkNew;
        calcUsedValves = vForkUsed;
        matchedCurrent = true;
      } else if ((currentNorm === 'پیکنیک 5/6 کیلویی' || currentNorm === 'پیکنیک 5/8 کیلویی' || isPicnic58Type(currentNorm) || isPicnic56Type(currentNorm)) && (vPicnic58New + vPicnic58Used > 0)) {
        targetCylinderType = 'پیکنیک 5/6 کیلویی';
        calcNewValves = vPicnic58New;
        calcUsedValves = vPicnic58Used;
        matchedCurrent = true;
      } else if (currentNorm === 'پیکنیک 1/1.5/3 لیتری' && (vPicnicNew + vPicnicUsed > 0)) {
        targetCylinderType = 'پیکنیک 1/1.5/3 لیتری';
        calcNewValves = vPicnicNew;
        calcUsedValves = vPicnicUsed;
        matchedCurrent = true;
      }

      if (!matchedCurrent) {
        if (v11New + v11Used > 0) {
          targetCylinderType = 'سیلندر 11 کیلویی';
          calcNewValves = v11New;
          calcUsedValves = v11Used;
        } else if (vPicnic58New + vPicnic58Used > 0) {
          targetCylinderType = 'پیکنیک 5/6 کیلویی';
          calcNewValves = vPicnic58New;
          calcUsedValves = vPicnic58Used;
        } else if (vPicnicNew + vPicnicUsed > 0) {
          targetCylinderType = 'پیکنیک 1/1.5/3 لیتری';
          calcNewValves = vPicnicNew;
          calcUsedValves = vPicnicUsed;
        } else if (vForkNew + vForkUsed > 0) {
          targetCylinderType = 'سیلندر لیفتراکی';
          calcNewValves = vForkNew;
          calcUsedValves = vForkUsed;
        }
      }

      // Build segregated valve items strictly matching the chosen target cylinder
      const normTarget = normalizeCylinderType(targetCylinderType);
      if (normTarget === 'سیلندر 11 کیلویی' || normTarget === 'سیلندر 50 کیلویی' || normTarget === 'سیلندر 8/10 کیلویی') {
        const bNew = insp.valve_breakdown.valves11kgNew;
        if (bNew) {
          if (Number(bNew.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو پرسی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
          if (Number(bNew.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو بوتان 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
          if (Number(bNew.iranGazi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو ایران‌گازی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
          if (Number(bNew.forklift) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو لیفتراک 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.forklift), direction: 'IN' });
          if (Number(bNew.iraqi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو عراقی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iraqi), direction: 'IN' });
        }
        const bUsed = insp.valve_breakdown.valves11kgUsed;
        if (bUsed) {
          if (Number(bUsed.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه پرسی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
          if (Number(bUsed.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه بوتان 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
          if (Number(bUsed.iranGazi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه ایران‌گازی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
          if (Number(bUsed.forklift) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه لیفتراک 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.forklift), direction: 'IN' });
          if (Number(bUsed.iraqi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه عراقی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iraqi), direction: 'IN' });
        }
      } else if (normTarget === 'سیلندر لیفتراکی') {
        const bNew = insp.valve_breakdown.valvesForklift22kgNew;
        if (bNew) {
          if (Number(bNew.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو بوتان لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
          if (Number(bNew.iranGazi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو ایران‌گازی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
          if (Number(bNew.passari) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو پاساری لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.passari), direction: 'IN' });
          if (Number(bNew.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو پرسی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
        }
        const bUsed = insp.valve_breakdown.valvesForklift22kgUsed;
        if (bUsed) {
          if (Number(bUsed.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه بوتان لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
          if (Number(bUsed.iranGazi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه ایران‌گازی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
          if (Number(bUsed.passari) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه پاساری لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.passari), direction: 'IN' });
          if (Number(bUsed.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه پرسی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
        }
      } else if (normTarget === 'پیکنیک 1/1.5/3 لیتری') {
        const bNew = insp.valve_breakdown.valvesPicnicNew || insp.valve_breakdown.valvesPicnic5kg;
        if (bNew) {
          if (Number(bNew.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو پرسی 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
          if (Number(bNew.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو بوتان 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
        }
        const bUsed = insp.valve_breakdown.valvesPicnicUsed || insp.valve_breakdown.valvesPicnic2kg;
        if (bUsed) {
          if (Number(bUsed.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه پرسی 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
          if (Number(bUsed.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه بوتان 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
        }
      } else if (normTarget === 'پیکنیک 5/6 کیلویی' || normTarget === 'پیکنیک 5/8 کیلویی' || isPicnic58Type(normTarget) || isPicnic56Type(normTarget)) {
        const bNew = insp.valve_breakdown.valvesPicnic58kgNew;
        if (bNew) {
          if (Number(bNew.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو پرسی 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
          if (Number(bNew.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر نو بوتان 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
        }
        const bUsed = insp.valve_breakdown.valvesPicnic58kgUsed;
        if (bUsed) {
          if (Number(bUsed.parsi) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه پرسی 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
          if (Number(bUsed.butane) > 0) segregatedItemsForTarget.push({ valve_name: 'شیر کهنه بوتان 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
        }
      }
    } else if (insp.receipt_items && insp.receipt_items.length > 0) {
      insp.receipt_items.forEach(item => {
        const desc = (item.description || '').toLowerCase();
        const remarks = (item.remarks || '').toLowerCase();
        const qty = Number(item.quantity) || 0;
        if (
          desc.includes('کهنه') ||
          desc.includes('داغی') ||
          remarks.includes('کهنه') ||
          remarks.includes('داغی') ||
          ((item as any).item_id && String((item as any).item_id).includes('USED'))
        ) {
          calcUsedValves += qty;
        } else if (
          desc.includes('شیر') ||
          remarks.includes('شیر') ||
          ((item as any).item_id && (String((item as any).item_id).includes('NEW') || String((item as any).item_id).includes('VALVE')))
        ) {
          calcNewValves += qty;
        }
      });
    }

    if (calcNewValves === 0 && calcUsedValves === 0 && isValve) {
      if ((insp.item_name || '').includes('کهنه') || (insp.item_name || '').includes('داغی')) {
        calcUsedValves = insp.actual_healthy_quantity || 0;
      } else {
        calcNewValves = insp.actual_healthy_quantity || 0;
      }
    }

    // Deduction from item name if no breakdown
    if (!insp.valve_breakdown) {
      const iname = (insp.item_name || '').toLowerCase();
      if (iname.includes('5/8') || iname.includes('۵/۸') || iname.includes('پیکنیک 5') || iname.includes('پیکنیک 8')) {
        targetCylinderType = 'پیکنیک 5/8 کیلویی';
      } else if (iname.includes('1/1.5') || iname.includes('۱/۱.۵') || iname.includes('1 لیتری') || iname.includes('1.5') || iname.includes('3 لیتری') || iname.includes('۳ لیتری') || iname.includes('پیکنیک')) {
        targetCylinderType = 'پیکنیک 1/1.5/3 لیتری';
      } else if (iname.includes('لیفتراک')) {
        targetCylinderType = 'سیلندر لیفتراکی';
      } else if (iname.includes('11') || iname.includes('25') || iname.includes('50') || iname.includes('۱۱') || iname.includes('۲۵') || iname.includes('۵۰') || iname.includes('شیر')) {
        targetCylinderType = 'سیلندر 11 کیلویی';
      } else if (isCylinder) {
        targetCylinderType = normalizeCylinderType(insp.item_name);
      }
    }

    // Immediately switch the active tab to the EXACT matching cylinder
    setSelectedCylinderType(targetCylinderType);

    // Calculate customer balance for this exact target cylinder type
    const targetStock = getCylinderDetailedStock(
      currentEnv,
      insp.customer_id,
      targetCylinderType,
      allKardexEntries
    );

    const derivedForkliftSubtype = normalizeCylinderType(targetCylinderType) === 'سیلندر لیفتراکی'
      ? (selectedForkliftValveSubtype !== 'ALL' ? selectedForkliftValveSubtype : 'شیر بوتانی لیفتراکی')
      : 'شیر بوتانی لیفتراکی';

    const segregatedSummaryText = segregatedItemsForTarget.length > 0
      ? ` [تفکیک: ${segregatedItemsForTarget.map(v => `${v.valve_name.replace(' 11/25/50 کیلویی', '').replace(' 1/1.5/3 لیتری', '').replace(' 5/8 کیلویی', '').replace(' لیفتراکی', '')}: ${toPersianDigits(v.quantity)}`).join('، ')}]`
      : '';

    const cylInCount = isCylinder ? (insp.actual_healthy_quantity || 0) : 0;
    const finalNewValves = isCylinder ? 0 : calcNewValves;
    const finalUsedValves = isCylinder ? 0 : calcUsedValves;
    const prevCylBal = targetStock ? targetStock.customerCylinderBalance : (stats.currentCylinders || 0);
    const prevScrapBal = targetStock ? targetStock.customerScrapBalance : (stats.currentScrap || 0);
    const prevNewValves = targetStock ? targetStock.customerNewValveBalance : (stats.currentNewValves || 0);
    const prevUsedValves = targetStock ? targetStock.customerUsedValveBalance : (stats.currentUsedValves || 0);

    setNewEntry({
      date: insp.date || getPersianDate(),
      description: isCustomerValve
        ? `ورودی تاییدشده شیرآلات توسط انباردار [${insp.item_name}] (شیر نو: ${toPersianDigits(finalNewValves)}، شیر کهنه: ${toPersianDigits(finalUsedValves)} | بارنامه ${insp.waybill_number})${segregatedSummaryText}`
        : `ورودی تاییدشده سیلندر تعمیری توسط مهندس حاجی‌وند [${insp.item_name}] (بارنامه ${insp.waybill_number} - اعلامی: ${toPersianDigits(insp.declared_quantity)}، سالم: ${toPersianDigits(insp.actual_healthy_quantity)}، معیوب: ${toPersianDigits(insp.defective_quantity)})`,
      transfer_sheet_number: insp.form_number || '',
      cylinder_type: targetCylinderType,
      forklift_valve_type: derivedForkliftSubtype,
      valve_subtype: derivedForkliftSubtype,
      cylinder_in: cylInCount,
      cylinder_out: 0,
      scrap_out: 0,
      scrap_stock_in: 0,
      cylinder_balance: prevCylBal + cylInCount,
      scrap_balance: prevScrapBal,
      new_valve_in: finalNewValves,
      new_valve_out: 0,
      new_valve_balance: prevNewValves + finalNewValves,
      dispatched: insp.waybill_number || '',
      waybill_number: insp.waybill_number || '',
      used_valve_in: finalUsedValves,
      used_valve_out: 0,
      used_valve_balance: Math.max(0, prevUsedValves + finalUsedValves),
      defective: insp.defective_quantity || 0,
      notes: `نوع قلم وارده: ${insp.item_name} ${insp.notes ? `| ${insp.notes}` : ''}`,
      valve_items: isCylinder ? undefined : segregatedItemsForTarget
    });
    setShowAddEntryModal(true);
    showToast(
      isCustomerValve
        ? `اطلاعات برگه ورودی شیرآلات «${insp.form_number}» برای «${insp.customer_name}» بارگذاری شد. با ثبت کاردکس، شیرهای نو (${toPersianDigits(finalNewValves)}) و کهنه (${toPersianDigits(finalUsedValves)}) تفکیک‌شده به دارایی مشتری اضافه می‌شوند.`
        : `اطلاعات برگه ورودی سیلندر تعمیری «${insp.form_number}» (${insp.item_name}) با تعداد ${toPersianDigits(cylInCount)} سیلندر برای «${insp.customer_name}» بارگذاری شد. این ورودی به کاردکس سیلندر اضافه می‌شود و ارتباطی با شیرآلات ندارد.`,
      'info'
    );
  };

  // Direct 1-Click Registration of incoming customer valve inspection
  const handleDirectRegisterValve = (insp: CylinderValveInspection) => {
    // Role enforcement: Hajivand CANNOT register Kardex
    if (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER') {
      showToast('ثبت کاردکس در حیطه اختیارات انباردار نیست. مسئولیت تایید کاردکس با خانم کرمی یا مدیر سیستم است.', 'error');
      return;
    }

    try {
      const res = LocalStorageManager.registerPendingInspectionDirectlyToKardex(
        currentEnv,
        insp.inspection_id,
        currentUser || ({ user_id: 'USR-002', username: 'karami', full_name: 'خانم کرمی' } as User),
        selectedCylinderType
      );

      if (res.success && res.entry) {
        const latestEntries = LocalStorageManager.getState(currentEnv).gas_kardex_entries || [];
        setAllKardexEntries(latestEntries);
        triggerSeamlessRefresh();
        showToast(
          `ورودی شیرآلات برگه «${insp.form_number}» با موفقیت در کاردکس ثبت و به صورت تفکیک‌شده به دارایی انبار «${insp.customer_name}» اضافه شد.`,
          'success'
        );
        onClearPendingInspection?.();
      } else {
        showToast(res.error || 'خطا در ثبت مستقیم ورودی شیر در کاردکس', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'خطا در ثبت مستقیم ورودی شیر', 'error');
    }
  };

  // If a pending inspection was passed from notification banner
  useEffect(() => {
    if (pendingInspectionToRegister) {
      handleLoadInspectionIntoEntry(pendingInspectionToRegister);
    }
  }, [pendingInspectionToRegister]);

  // Helper to open the add entry modal with incoming/outgoing preset
  const openAddEntryModal = (type: 'in' | 'out' = 'in') => {
    // 1. Role enforcement: Hajivand CANNOT register Kardex
    if (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER') {
      showToast('عدم دسترسی: کاربر محترم مهندس حاجی‌وند، ثبت کاردکس در حیطه مسئولیت مدیر داخلی (خانم کرمی) و مدیریت است. وظیفه شما شمارش فیزیکی در منوی «ورودی شیر و سیلندر» می‌باشد.', 'error');
      return;
    }

    // 2. Role enforcement: Karami can only register incoming kardex after Hajivand inspection
    if (currentUser?.username === 'karami' && type === 'in') {
      const customTypes = LocalStorageManager.getCustomItemTypes(currentEnv);
      const readyInspections = LocalStorageManager.getCylinderValveInspections(currentEnv).filter(
        i => isPendingRepairCylinderKardex(i, customTypes)
      );

      if (readyInspections.length === 0) {
        showToast('توجه: ثبت کاردکس ورودی منوط به شمارش فیزیکی و تایید قبلی توسط انباردار (مهندس حاجی‌وند) در منوی «ورود شیر و سیلندر» می‌باشد. در حال حاضر ورودی تاییدشده جدیدی وجود ندارد.', 'info');
        return;
      }

      // If there is an inspection for this customer or generally, link it
      const matchForCurrent = readyInspections.find(i => i.customer_id === selectedCustomerId) || readyInspections[0];
      if (matchForCurrent) {
        handleLoadInspectionIntoEntry(matchForCurrent);
        return;
      }
    }

    // Default flow (for Outgoing entries or Admin Amouei)
    setLinkedInspectionId(null);
    setEntryTab(type);
    const currentDate = getPersianDate();
    const autoCount = calculateDailyRequestCount(
      allKardexEntries,
      currentCustomer?.name || currentCustomer?.customer_id || '',
      currentDate
    );
    setDailyLoadingCount(autoCount);
    const standardSheet = generateSheetNumber(
      currentCustomer?.name || 'البرز گاز',
      currentDate,
      type === 'in' ? 'i' : 'e',
      autoCount
    );
    const derivedForkliftSubtype = normalizeCylinderType(selectedCylinderType) === 'سیلندر لیفتراکی'
      ? (selectedForkliftValveSubtype !== 'ALL' ? selectedForkliftValveSubtype : 'شیر بوتانی لیفتراکی')
      : 'شیر بوتانی لیفتراکی';

    try {
      const latestItems = LocalStorageManager.getCustomItemTypes(currentEnv);
      if (latestItems && latestItems.length > 0) {
        setCustomItemTypes([...latestItems]);
      }
    } catch {}

    setNewEntry({
      date: currentDate,
      description: '',
      transfer_sheet_number: standardSheet,
      cylinder_type: selectedCylinderType,
      forklift_valve_type: derivedForkliftSubtype,
      valve_subtype: derivedForkliftSubtype,
      cylinder_in: 0,
      cylinder_out: 0,
      scrap_out: 0,
      scrap_stock_in: 0,
      cylinder_balance: stats.currentCylinders || 0,
      scrap_balance: stats.currentScrap || 0,
      new_valve_in: 0,
      new_valve_out: 0,
      new_valve_balance: stats.currentNewValves || 0,
      dispatched: '',
      used_valve_in: 0,
      used_valve_out: 0,
      used_valve_balance: stats.currentUsedValves || 0,
      defective: 0,
      notes: ''
    });
    setShowAddEntryModal(true);
  };

  // Switch between incoming (i) and outgoing (e) tabs inside popup
  const handleTabChange = (newTab: 'in' | 'out') => {
    setEntryTab(newTab);
    const dateToUse = newEntry.date || getPersianDate();
    const calculatedCount = calculateDailyRequestCount(
      allKardexEntries,
      currentCustomer?.name || currentCustomer?.customer_id || '',
      dateToUse
    );
    setDailyLoadingCount(calculatedCount);
    const updatedSheet = generateSheetNumber(
      currentCustomer?.name || 'البرز گاز',
      dateToUse,
      newTab === 'in' ? 'i' : 'e',
      calculatedCount
    );

    const prevCyl = stats.currentCylinders || 0;
    const prevScrap = stats.currentScrap || 0;
    const prevNewValves = stats.currentNewValves || 0;
    const prevUsedValves = stats.currentUsedValves || 0;

    const cylIn = newTab === 'in' ? (Number(newEntry.cylinder_in) || 0) : 0;
    const cylOut = newTab === 'out' ? (Number(newEntry.cylinder_out) || 0) : 0;
    const scrapOut = newTab === 'out' ? (Number(newEntry.scrap_out) || 0) : 0;
    const scrapStockIn = Number(newEntry.scrap_stock_in) || 0;

    // خروج ضایعات واقعی فقط از مانده ضایعات کسر می‌شود و نه از مانده سیلندر
    const calculatedCylBal = prevCyl + cylIn - cylOut - scrapStockIn;
    const calculatedScrapBal = Math.max(0, prevScrap + scrapStockIn - scrapOut);

    // New valve calculation on tab change:
    const newValveIn = newTab === 'in' ? (Number(newEntry.new_valve_in) || 0) : 0;
    const newValveOut = newTab === 'out' ? (cylOut > 0 ? cylOut : (Number(newEntry.new_valve_out) || 0)) : 0;
    const calculatedNewValveBal = prevNewValves + newValveIn - newValveOut;

    // Used valve calculation on tab change (ورودی شیر کهنه به صورت دستی وارد می‌شود و خروج شیر کهنه مستقیماً از مانده کسر می‌کند):
    const usedValveIn = newTab === 'in' ? (Number(newEntry.used_valve_in) || 0) : 0;
    const usedValveOut = Number(newEntry.used_valve_out) || 0;
    const calculatedUsedValveBal = prevUsedValves + usedValveIn - usedValveOut;

    setNewEntry(prev => ({
      ...prev,
      transfer_sheet_number: updatedSheet,
      description: customItemNames.includes(prev.description) ? prev.description : (prev.description || ''),
      cylinder_in: cylIn,
      cylinder_out: cylOut,
      scrap_out: scrapOut,
      scrap_stock_in: scrapStockIn,
      cylinder_balance: calculatedCylBal,
      scrap_balance: calculatedScrapBal,
      new_valve_in: newValveIn,
      new_valve_out: newValveOut,
      new_valve_balance: calculatedNewValveBal,
      used_valve_in: usedValveIn,
      used_valve_out: usedValveOut,
      used_valve_balance: calculatedUsedValveBal,
      dispatched: prev.dispatched,
      defective: newTab === 'in' ? prev.defective : 0
    }));
  };

  // Build canonical sheet number preserving prefix/date/count when present
  const buildDirectionalSheetNumber = (
    currentSheet: string | undefined,
    direction: 'i' | 'e',
    dateStr?: string
  ): string => {
    const trimmed = String(currentSheet || '').trim();
    if (/^[A-Z]{2}\d{6}[ieIE]$/.test(trimmed)) {
      return `${trimmed.slice(0, -1)}${direction}`;
    }
    return generateSheetNumber(
      currentCustomer?.name || 'البرز گاز',
      dateStr || getPersianDate(),
      direction,
      dailyLoadingCount
    );
  };

  // Regenerate sheet number strictly on demand
  const handleRegenerateSheetNumber = (direction = entryTab, date = newEntry.date, count = dailyLoadingCount) => {
    const cylIn = Number(newEntry.cylinder_in) || 0;
    const cylOut = Number(newEntry.cylinder_out) || 0;
    const effectiveDirection: 'in' | 'out' =
      cylOut > 0 && cylIn <= 0 ? 'out' : cylIn > 0 && cylOut <= 0 ? 'in' : direction;
    const calculatedCount = count || calculateDailyRequestCount(
      allKardexEntries,
      currentCustomer?.name || currentCustomer?.customer_id || '',
      date || getPersianDate()
    );
    setDailyLoadingCount(calculatedCount);
    const generated = generateSheetNumber(
      currentCustomer?.name || 'البرز گاز',
      date || getPersianDate(),
      effectiveDirection === 'in' ? 'i' : 'e',
      calculatedCount
    );
    setNewEntry(prev => ({ ...prev, transfer_sheet_number: generated }));
    showToast(`شماره برگه بر اساس فرمول استاندارد (${generated}) بازتولید شد.`, 'info');
  };

  // Adjust daily loading count (1 to 100) directly and update sheet number
  const handleDailyCountChange = (newCount: number) => {
    const clamped = Math.min(100, Math.max(1, Math.floor(newCount || 1)));
    setDailyLoadingCount(clamped);
    const generated = generateSheetNumber(
      currentCustomer?.name || 'البرز گاز',
      newEntry.date || getPersianDate(),
      entryTab === 'in' ? 'i' : 'e',
      clamped
    );
    setNewEntry(prev => ({ ...prev, transfer_sheet_number: generated }));
  };

  // Copy sheet number to clipboard
  const handleCopySheetNumber = () => {
    if (newEntry.transfer_sheet_number) {
      navigator.clipboard?.writeText(newEntry.transfer_sheet_number);
      setCopiedSheet(true);
      setTimeout(() => setCopiedSheet(false), 2000);
      showToast(`شماره برگه «${newEntry.transfer_sheet_number}» کپی شد.`, 'success');
    }
  };

  // User Formula Implementation for Add Modal & Edit Modal:
  // 1. ("مانده سیلندر" در هر سطر از کاردکس) = (مانده سطر قبل) + ("ورودی سیلندر" همان سطر) – ("خروج سیلندر" واقعی همان سطر) – ("خروج ضایعات سوری" همان سطر)
  // 2. ("مانده ضایعات" در هر سطر) = ("مانده ضایعات" از سطر قبل) + ("خروج ضایعات سوری" در همان سطر) – ("خروج واقعی" در همان سطر) - ("خروج ضایعات ذخیره")
  // 3. شیر نو: ورودی شیر نو هر عددی می‌پذیرد. خروج شیر نو همیشه برابر است با خروج سیلندر و از مانده قبل کم می‌شود.
  //    مانده شیر نو = مانده قبل + ورودی شیر نو - خروج شیر نو (مقدار منفی می‌پذیرد و غیرقابل ویرایش است، کسری از موجودی خود ام‌گاز)
  // 4. شیر کهنه: مقدار ورودی شیر کهنه نیازی نیست مستقیماً با ورودی سیلندر پر شود و به صورت دستی نوشته می‌شود.
  //    مانده شیر کهنه = مانده قبل + ورودی شیر کهنه - خروج شیر کهنه (نمی‌تواند منفی شود و حداقل صفر است)
  const updateNewEntryField = (field: string, value: any) => {
    if (field === 'cylinder_in' || field === 'cylinder_out') {
      const prevCylIn = Number(newEntry.cylinder_in) || 0;
      const prevCylOut = Number(newEntry.cylinder_out) || 0;
      const nextCylIn = field === 'cylinder_in' ? (Number(value) || 0) : prevCylIn;
      const nextCylOut = field === 'cylinder_out' ? (Number(value) || 0) : prevCylOut;

      if (nextCylIn > 0 && nextCylOut > 0) {
        if (!(prevCylIn > 0 && prevCylOut > 0)) {
          showToast('هشدار: امکان پر کردن همزمان دو کاردکس (ورود و خروج سیلندر) وجود ندارد!', 'error');
        }
      } else if (nextCylIn > 0 && nextCylOut <= 0 && entryTab !== 'in') {
        setEntryTab('in');
      } else if (nextCylOut > 0 && nextCylIn <= 0 && entryTab !== 'out') {
        setEntryTab('out');
      }
    }

    setNewEntry(prev => {
      const next = { ...prev, [field]: value };
      if (
        field === 'cylinder_balance' ||
        field === 'scrap_balance' ||
        field === 'new_valve_balance' ||
        field === 'used_valve_balance'
      ) {
        return next;
      }
      const activeType = normalizeCylinderType(next.cylinder_type || selectedCylinderType);
      const targetStock = cylinderStocksMap[activeType] || (currentCustomer ? getCylinderDetailedStock(currentEnv, currentCustomer.customer_id, activeType, allKardexEntries) : null);
      const prevCyl = targetStock ? targetStock.customerCylinderBalance : (stats.currentCylinders || 0);
      const prevScrap = targetStock ? targetStock.customerScrapBalance : (stats.currentScrap || 0);
      const prevNewValves = targetStock ? targetStock.customerNewValveBalance : (stats.currentNewValves || 0);
      const prevUsedValves = targetStock ? targetStock.customerUsedValveBalance : (stats.currentUsedValves || 0);

      const cylIn = field === 'cylinder_in' ? (Number(value) || 0) : (Number(next.cylinder_in) || 0);
      const cylOut = field === 'cylinder_out' ? (Number(value) || 0) : (Number(next.cylinder_out) || 0);
      const scrapOut = field === 'scrap_out' ? (Number(value) || 0) : (Number(next.scrap_out) || 0);
      const scrapStockIn = field === 'scrap_stock_in' ? (Number(value) || 0) : (Number(next.scrap_stock_in) || 0);

      // تغییر خودکار شماره برگه انتقال بر اساس ورود (i) یا خروج (e) سیلندر
      if (field === 'cylinder_in' || field === 'cylinder_out') {
        if (cylIn > 0 && cylOut <= 0) {
          next.transfer_sheet_number = buildDirectionalSheetNumber(prev.transfer_sheet_number, 'i', next.date);
        } else if (cylOut > 0 && cylIn <= 0) {
          next.transfer_sheet_number = buildDirectionalSheetNumber(prev.transfer_sheet_number, 'e', next.date);
        }
      }

      // Rule: فیلد "خروج شیر نو" همیشه برابر است با مقدار "خروج سیلندر" است و از "مانده شیر نو" سطر قبل کم میشود.
      // سلول شیر کهنه وابسته به جایی نیست و با خروج سیلندر تغییر نمی‌کند
      if (field === 'cylinder_out') {
        next.new_valve_out = cylOut;
      }

      // خروج ضایعات واقعی فقط از مانده ضایعات کسر می‌شود و نه از مانده سیلندر
      const calculatedCylBal = prevCyl + cylIn - cylOut - scrapStockIn;
      const calculatedScrapBal = Math.max(0, prevScrap + scrapStockIn - scrapOut);

      const newValveIn = field === 'new_valve_in' ? (Number(value) || 0) : (Number(next.new_valve_in) || 0);
      const newValveOut = field === 'new_valve_out' ? (Number(value) || 0) : (field === 'cylinder_out' ? cylOut : (Number(next.new_valve_out) || 0));
      const calculatedNewValveBal = prevNewValves + newValveIn - newValveOut;

      // ورودی شیر کهنه به صورت دستی وارد می‌شود و مستقیماً با ورودی سیلندر پر نمی‌شود
      const usedValveIn = field === 'used_valve_in' ? (Number(value) || 0) : (Number(next.used_valve_in) || 0);
      // سلول خروج شیر کهنه مستقل است و مستقیماً از مانده شیر کهنه کسر می‌کند
      const usedValveOut = field === 'used_valve_out' ? (Number(value) || 0) : (Number(next.used_valve_out) || 0);
      // مانده شیر کهنه = مانده قبل + ورودی شیر کهنه - خروج شیر کهنه
      const calculatedUsedValveBal = prevUsedValves + usedValveIn - usedValveOut;

      if (isTankType(activeType)) {
        return {
          ...next,
          cylinder_balance: calculatedCylBal,
          scrap_balance: calculatedScrapBal,
          new_valve_in: 0,
          new_valve_out: 0,
          new_valve_balance: 0,
          used_valve_in: 0,
          used_valve_out: 0,
          used_valve_balance: 0
        };
      }

      return {
        ...next,
        cylinder_balance: calculatedCylBal,
        scrap_balance: calculatedScrapBal,
        new_valve_in: newValveIn,
        new_valve_out: newValveOut,
        new_valve_balance: calculatedNewValveBal,
        used_valve_in: usedValveIn,
        used_valve_out: usedValveOut,
        used_valve_balance: calculatedUsedValveBal
      };
    });
  };

  const updateEditFormField = (field: string, value: any) => {
    if (field === 'cylinder_in' || field === 'cylinder_out') {
      const prevCylIn = Number(editKardexForm.cylinder_in) || 0;
      const prevCylOut = Number(editKardexForm.cylinder_out) || 0;
      const nextCylIn = field === 'cylinder_in' ? (Number(value) || 0) : prevCylIn;
      const nextCylOut = field === 'cylinder_out' ? (Number(value) || 0) : prevCylOut;
      if (nextCylIn > 0 && nextCylOut > 0 && !(prevCylIn > 0 && prevCylOut > 0)) {
        showToast('هشدار: امکان پر کردن همزمان دو کاردکس (ورود و خروج سیلندر) وجود ندارد!', 'error');
      }
    }

    setEditKardexForm(prev => {
      const next = { ...prev, [field]: value };
      if (
        field === 'cylinder_balance' ||
        field === 'scrap_balance' ||
        field === 'new_valve_balance' ||
        field === 'used_valve_balance'
      ) {
        return next;
      }
      const editIdx = customerEntries.findIndex(e => e.entry_id === editingKardexEntry?.entry_id);
      const prevEntry = editIdx > 0 ? customerEntries[editIdx - 1] : null;
      const prevCyl = prevEntry ? (prevEntry.cylinder_balance || 0) : 0;
      const prevScrap = prevEntry ? Math.max(0, prevEntry.scrap_balance || 0) : 0;
      const prevNewValves = prevEntry ? (prevEntry.new_valve_balance || 0) : 0;
      const prevUsedValves = prevEntry ? (prevEntry.used_valve_balance || 0) : 0;

      const cylIn = field === 'cylinder_in' ? (Number(value) || 0) : (Number(next.cylinder_in) || 0);
      const cylOut = field === 'cylinder_out' ? (Number(value) || 0) : (Number(next.cylinder_out) || 0);
      const scrapOut = field === 'scrap_out' ? (Number(value) || 0) : (Number(next.scrap_out) || 0);
      const scrapStockIn = field === 'scrap_stock_in' ? (Number(value) || 0) : (Number(next.scrap_stock_in) || 0);

      if ((field === 'cylinder_in' || field === 'cylinder_out') && /^[A-Z]{2}\d{6}[ieIE]$/.test(String(prev.transfer_sheet_number || '').trim())) {
        if (cylIn > 0 && cylOut <= 0) {
          next.transfer_sheet_number = `${String(prev.transfer_sheet_number).trim().slice(0, -1)}i`;
        } else if (cylOut > 0 && cylIn <= 0) {
          next.transfer_sheet_number = `${String(prev.transfer_sheet_number).trim().slice(0, -1)}e`;
        }
      }

      // Rule: خروج شیر نو برابر خروج سیلندر؛ اما سلول شیر کهنه مستقل است و وابسته به جایی نیست
      if (field === 'cylinder_out') {
        next.new_valve_out = cylOut;
      }

      // خروج ضایعات واقعی فقط از مانده ضایعات کسر می‌شود و نه از مانده سیلندر
      const calculatedCylBal = prevCyl + cylIn - cylOut - scrapStockIn;
      const calculatedScrapBal = Math.max(0, prevScrap + scrapStockIn - scrapOut);

      const newValveIn = field === 'new_valve_in' ? (Number(value) || 0) : (Number(next.new_valve_in) || 0);
      const newValveOut = field === 'new_valve_out' ? (Number(value) || 0) : (field === 'cylinder_out' ? cylOut : (Number(next.new_valve_out) || 0));
      const calculatedNewValveBal = prevNewValves + newValveIn - newValveOut;

      // ورودی شیر کهنه به صورت دستی وارد می‌شود و مستقیماً با ورودی سیلندر پر نمی‌شود
      const usedValveIn = field === 'used_valve_in' ? (Number(value) || 0) : (Number(next.used_valve_in) || 0);
      // سلول خروج شیر کهنه مستقل است و مستقیماً از مانده شیر کهنه کسر می‌کند
      const usedValveOut = field === 'used_valve_out' ? (Number(value) || 0) : (Number(next.used_valve_out) || 0);
      // مانده شیر کهنه = مانده قبل + ورودی شیر کهنه - خروج شیر کهنه
      const calculatedUsedValveBal = prevUsedValves + usedValveIn - usedValveOut;

      const editCylType = normalizeCylinderType(next.cylinder_type || selectedCylinderType);
      if (isTankType(editCylType)) {
        return {
          ...next,
          cylinder_balance: calculatedCylBal,
          scrap_balance: calculatedScrapBal,
          new_valve_in: 0,
          new_valve_out: 0,
          new_valve_balance: 0,
          used_valve_in: 0,
          used_valve_out: 0,
          used_valve_balance: 0
        };
      }

      return {
        ...next,
        cylinder_balance: calculatedCylBal,
        scrap_balance: calculatedScrapBal,
        new_valve_in: newValveIn,
        new_valve_out: newValveOut,
        new_valve_balance: calculatedNewValveBal,
        used_valve_in: usedValveIn,
        used_valve_out: usedValveOut,
        used_valve_balance: calculatedUsedValveBal
      };
    });
  };

  // Add new Kardex Entry with synchronization and optional immediate print
  const handleCreateEntry = (e?: React.FormEvent, andPrint: boolean = false) => {
    if (e) e.preventDefault();
    if (!currentCustomer) return;

    // Strict Anti-Injection & Input Security Guards
    const descCheck = validateFieldSecurity(newEntry.description, 'شرح سند', { maxLength: 500 });
    if (!descCheck.isValid) {
      showToast(descCheck.error!, 'error');
      return;
    }
    const notesCheck = validateFieldSecurity(newEntry.notes, 'یادداشت', { maxLength: 1000, allowMultiline: true });
    if (!notesCheck.isValid) {
      showToast(notesCheck.error!, 'error');
      return;
    }
    const sheetCheck = validateFieldSecurity(newEntry.transfer_sheet_number, 'شماره برگه حواله', { maxLength: 100 });
    if (!sheetCheck.isValid) {
      showToast(sheetCheck.error!, 'error');
      return;
    }
    const dateCheck = validateFieldSecurity(newEntry.date, 'تاریخ سند', { maxLength: 20 });
    if (!dateCheck.isValid) {
      showToast(dateCheck.error!, 'error');
      return;
    }

    const cylInVal = sanitizeNumber(newEntry.cylinder_in, 0, 0, 1000000);
    const cylOutVal = sanitizeNumber(newEntry.cylinder_out, 0, 0, 1000000);
    if (cylInVal > 0 && cylOutVal > 0) {
      showToast('امکان پر کردن همزمان دو کاردکس (ورود و خروج سیلندر) وجود ندارد! لطفاً فقط یکی از فیلدهای ورود یا خروج سیلندر را پر کنید.', 'error');
      return;
    }

    const entryId = generateUUID('GK');
    const eventId = generateUUID('EVT-GK');

    const resolvedDirection: 'i' | 'e' =
      cylOutVal > 0 && cylInVal === 0
        ? 'e'
        : cylInVal > 0 && cylOutVal === 0
        ? 'i'
        : entryTab === 'in'
        ? 'i'
        : 'e';

    // Canonical sheet number strictly conforming to: [CustomerCode] + [MMDDCC] + [i/e]
    const finalSheetNumber = sheetCheck.cleanValue
      ? (/^[A-Z]{2}\d{6}[ieIE]$/.test(sheetCheck.cleanValue) && (cylInVal > 0 || cylOutVal > 0)
          ? `${sheetCheck.cleanValue.slice(0, -1)}${resolvedDirection}`
          : sheetCheck.cleanValue)
      : generateSheetNumber(
          currentCustomer.name,
          dateCheck.cleanValue || getPersianDate(),
          resolvedDirection,
          dailyLoadingCount
        );

    const isIncoming = resolvedDirection === 'i';

    // ستون ارسالی و شماره بارنامه: هم عدد (شماره بارنامه) و هم متن ارسالی را می‌پذیرد
    const rawDispatched = typeof newEntry.dispatched === 'string' ? newEntry.dispatched.trim() : (newEntry.dispatched ? String(newEntry.dispatched).trim() : '');
    const cleanDispatched = rawDispatched && rawDispatched !== '0' && rawDispatched !== '۰' ? sanitizeInput(rawDispatched) : '';
    const rawWaybill = newEntry.waybill_number && String(newEntry.waybill_number).trim() !== '' ? sanitizeInput(String(newEntry.waybill_number).trim()) : cleanDispatched;

      const targetType = normalizeCylinderType(newEntry.cylinder_type || selectedCylinderType);
      const targetStock = cylinderStocksMap[targetType] || (currentCustomer ? getCylinderDetailedStock(currentEnv, currentCustomer.customer_id, targetType, allKardexEntries) : null);
      const prevCyl = targetStock ? targetStock.customerCylinderBalance : (stats.currentCylinders || 0);
      const prevScrap = targetStock ? targetStock.customerScrapBalance : Math.max(0, stats.currentScrap || 0);
      const prevNewValves = targetStock ? targetStock.customerNewValveBalance : (stats.currentNewValves || 0);
      const prevUsedValves = targetStock ? targetStock.customerUsedValveBalance : (stats.currentUsedValves || 0);

      const scrapOutVal = sanitizeNumber(newEntry.scrap_out, 0, 0, 1000000);
      const scrapStockInVal = sanitizeNumber(newEntry.scrap_stock_in, 0, 0, 1000000);

      // Exact Formula 1: ("مانده سیلندر" در هر سطر از کاردکس) = (مانده سطر قبل) + ("ورودی سیلندر" همان سطر) – ("خروج سیلندر" واقعی همان سطر) – ("خروج ضایعات سوری" همان سطر)
      // خروج ضایعات واقعی فقط از مانده ضایعات کسر می‌شود و نه از مانده سیلندر
      const calculatedCylBal = prevCyl + cylInVal - cylOutVal - scrapStockInVal;
      // Exact Formula 2: ("مانده ضایعات" در هر سطر) = ("مانده ضایعات" از سطر قبل) + ("خروج ضایعات سوری" در همان سطر) – ("خروج واقعی ضایعات" در همان سطر)
      const calculatedScrapBal = Math.max(0, prevScrap + scrapStockInVal - scrapOutVal);

      // Exact Formula 3: شیر نو (ورودی هر عددی میپذیرد؛ خروج همیشه برابر با خروج سیلندر؛ مانده = مانده قبل + ورودی - خروج)
      const newValveInVal = sanitizeNumber(newEntry.new_valve_in, 0, 0, 1000000);
      const newValveOutVal = cylOutVal > 0 ? cylOutVal : sanitizeNumber(newEntry.new_valve_out, 0, 0, 1000000);
      const calculatedNewValveBal = prevNewValves + newValveInVal - newValveOutVal;

      // Exact Formula 4: شیر کهنه (سلول مستقل؛ ورودی به صورت دستی؛ خروج مستقیماً از مانده شیر کهنه کسر می‌کند)
      const usedValveInVal = sanitizeNumber(newEntry.used_valve_in, 0, 0, 1000000);
      const usedValveOutVal = sanitizeNumber(newEntry.used_valve_out, 0, 0, 1000000);
      const calculatedUsedValveBal = prevUsedValves + usedValveInVal - usedValveOutVal;

      const isForkliftCyl = targetType === 'سیلندر لیفتراکی';
      const chosenForkliftValve = isForkliftCyl ? (newEntry.forklift_valve_type || newEntry.valve_subtype || 'شیر بوتانی لیفتراکی') : undefined;

      let resolvedValveItems = newEntry.valve_items && newEntry.valve_items.length > 0 ? newEntry.valve_items : undefined;
      if (!resolvedValveItems && linkedInspectionId) {
        const insp = pendingInspections.find(i => i.inspection_id === linkedInspectionId) ||
                     LocalStorageManager.getCylinderValveInspections(currentEnv).find(i => i.inspection_id === linkedInspectionId);
        if (insp?.valve_breakdown) {
          const normTarget = normalizeCylinderType(targetType);
          const items: Array<{ valve_name: string; valve_category: 'NEW' | 'USED'; quantity: number; direction: 'IN' | 'OUT' }> = [];
          if (normTarget === 'سیلندر 11 کیلویی' || normTarget === 'سیلندر 50 کیلویی' || normTarget === 'سیلندر 8/10 کیلویی') {
            const bNew = insp.valve_breakdown.valves11kgNew;
            if (bNew) {
              if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
              if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
              if (Number(bNew.iranGazi) > 0) items.push({ valve_name: 'شیر نو ایران‌گازی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
              if (Number(bNew.forklift) > 0) items.push({ valve_name: 'شیر نو لیفتراک 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.forklift), direction: 'IN' });
              if (Number(bNew.iraqi) > 0) items.push({ valve_name: 'شیر نو عراقی 11/25/50 کیلویی', valve_category: 'NEW', quantity: Number(bNew.iraqi), direction: 'IN' });
            }
            const bUsed = insp.valve_breakdown.valves11kgUsed;
            if (bUsed) {
              if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
              if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
              if (Number(bUsed.iranGazi) > 0) items.push({ valve_name: 'شیر کهنه ایران‌گازی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
              if (Number(bUsed.forklift) > 0) items.push({ valve_name: 'شیر کهنه لیفتراک 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.forklift), direction: 'IN' });
              if (Number(bUsed.iraqi) > 0) items.push({ valve_name: 'شیر کهنه عراقی 11/25/50 کیلویی', valve_category: 'USED', quantity: Number(bUsed.iraqi), direction: 'IN' });
            }
          } else if (normTarget === 'سیلندر لیفتراکی') {
            const bNew = insp.valve_breakdown.valvesForklift22kgNew;
            if (bNew) {
              if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
              if (Number(bNew.iranGazi) > 0) items.push({ valve_name: 'شیر نو ایران‌گازی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.iranGazi), direction: 'IN' });
              if (Number(bNew.passari) > 0) items.push({ valve_name: 'شیر نو پاساری لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.passari), direction: 'IN' });
              if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی لیفتراکی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
            }
            const bUsed = insp.valve_breakdown.valvesForklift22kgUsed;
            if (bUsed) {
              if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
              if (Number(bUsed.iranGazi) > 0) items.push({ valve_name: 'شیر کهنه ایران‌گازی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.iranGazi), direction: 'IN' });
              if (Number(bUsed.passari) > 0) items.push({ valve_name: 'شیر کهنه پاساری لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.passari), direction: 'IN' });
              if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی لیفتراکی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
            }
          } else if (normTarget === 'پیکنیک 1/1.5/3 لیتری') {
            const bNew = insp.valve_breakdown.valvesPicnicNew || insp.valve_breakdown.valvesPicnic5kg;
            if (bNew) {
              if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
              if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 1/1.5/3 لیتری', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
            }
            const bUsed = insp.valve_breakdown.valvesPicnicUsed || insp.valve_breakdown.valvesPicnic2kg;
            if (bUsed) {
              if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
              if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 1/1.5/3 لیتری', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
            }
          } else if (normTarget === 'پیکنیک 5/6 کیلویی' || normTarget === 'پیکنیک 5/8 کیلویی' || isPicnic58Type(normTarget) || isPicnic56Type(normTarget)) {
            const bNew = insp.valve_breakdown.valvesPicnic58kgNew;
            if (bNew) {
              if (Number(bNew.parsi) > 0) items.push({ valve_name: 'شیر نو پرسی 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.parsi), direction: 'IN' });
              if (Number(bNew.butane) > 0) items.push({ valve_name: 'شیر نو بوتان 5/8 کیلویی', valve_category: 'NEW', quantity: Number(bNew.butane), direction: 'IN' });
            }
            const bUsed = insp.valve_breakdown.valvesPicnic58kgUsed;
            if (bUsed) {
              if (Number(bUsed.parsi) > 0) items.push({ valve_name: 'شیر کهنه پرسی 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.parsi), direction: 'IN' });
              if (Number(bUsed.butane) > 0) items.push({ valve_name: 'شیر کهنه بوتان 5/8 کیلویی', valve_category: 'USED', quantity: Number(bUsed.butane), direction: 'IN' });
            }
          }
          if (items.length > 0) resolvedValveItems = items;
        }
      }

      const entryData: GasKardexEntry = {
        entry_id: entryId,
        customer_id: currentCustomer.customer_id,
        customer_name: currentCustomer.name,
        cylinder_type: targetType,
        valve_subtype: chosenForkliftValve,
        forklift_valve_type: chosenForkliftValve,
        date: dateCheck.cleanValue || getPersianDate(),
        description: descCheck.cleanValue || (isIncoming ? 'دریافت و ورود محموله کپسول و شیرآلات' : 'ارسال و خروج محموله کپسول و بارنامه'),
        transfer_sheet_number: finalSheetNumber,
        cylinder_in: cylInVal,
        cylinder_out: cylOutVal,
        scrap_out: scrapOutVal,
        scrap_stock_in: scrapStockInVal,
        cylinder_balance: calculatedCylBal,
        scrap_balance: calculatedScrapBal,
        new_valve_in: newValveInVal,
        new_valve_out: newValveOutVal,
        new_valve_balance: calculatedNewValveBal,
        dispatched: cleanDispatched || rawWaybill,
        waybill_number: rawWaybill || cleanDispatched,
        used_valve_in: usedValveInVal,
        used_valve_out: usedValveOutVal,
        used_valve_balance: calculatedUsedValveBal,
        defective: sanitizeNumber(newEntry.defective, 0, 0, 1000000),
        valve_items: resolvedValveItems,
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      inspection_id: linkedInspectionId || undefined,
      custom_item_name: linkedInspectionId
        ? (pendingInspections.find(i => i.inspection_id === linkedInspectionId)?.item_name ||
           LocalStorageManager.getCylinderValveInspections(currentEnv).find(i => i.inspection_id === linkedInspectionId)?.item_name)
        : undefined,
      device_id: dbState.deviceId,
      event_id: eventId,
      notes: notesCheck.cleanValue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Auto-switch view to match the cylinder type of the newly added entry
    if (entryData.cylinder_type && entryData.cylinder_type !== selectedCylinderType) {
      setSelectedCylinderType(entryData.cylinder_type as CylinderType);
    }

    // 1. Record change locally and enqueue in SyncQueue (strictly performing sync behind the scenes)
    LocalStorageManager.recordLocalChange(
      currentEnv,
      currentUser.user_id,
      'GAS_KARDEX',
      'CREATE',
      entryId,
      entryData,
      `ثبت ردیف کاردکس گاز برای ${currentCustomer.name} (برگه ${entryData.transfer_sheet_number})`
    );

    // 2. INSTANT OPTIMISTIC & SEAMLESS REFRESH: Immediately push into React state at the end (newer items sit lower down)
    setAllKardexEntries(prev => [...prev.filter(e => e.entry_id !== entryId), entryData]);
    triggerSeamlessRefresh();
    setRecentlyAddedEntryId(entryId);
    setTimeout(() => setRecentlyAddedEntryId(null), 4000);

    // 3. Dispatch window custom event and BroadcastChannel for cross-window / Windows software
    try {
      window.dispatchEvent(new CustomEvent('mgas:kardex_updated', { detail: entryData }));
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('mgas_kardex_sync_channel');
        bc.postMessage({ type: 'KARDEX_ENTRY_ADDED', entry: entryData });
        bc.close();
      }
    } catch (e) {
      console.warn('Broadcast notice:', e);
    }

    // 4. Windows Desktop Electron Bridge Notification (if running in Windows 11 / Windows 7 native app)
    if (typeof window !== 'undefined' && window.desktopAPI?.notifyKardexChange) {
      window.desktopAPI.notifyKardexChange(entryData).catch(() => {});
    }

    // 5. Trigger sync engine immediately to push to central server without waiting for background interval
    SyncEngine.syncNow(currentEnv).catch(() => {});

    // 6. Mark linked inspection registered if any
    if (linkedInspectionId) {
      LocalStorageManager.markInspectionAsKardexRegistered(
        currentEnv,
        linkedInspectionId,
        entryId,
        currentUser.username
      );
      setLinkedInspectionId(null);
      onClearPendingInspection?.();
    }

    setShowAddEntryModal(false);
    setNewEntry({
      date: getPersianDate(),
      description: '',
      transfer_sheet_number: '',
      cylinder_type: selectedCylinderType,
      forklift_valve_type: (selectedForkliftValveSubtype && selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') ? selectedForkliftValveSubtype : 'شیر بوتانی لیفتراکی') as ForkliftValveType,
      valve_subtype: (selectedForkliftValveSubtype && selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') ? selectedForkliftValveSubtype : 'شیر بوتانی لیفتراکی'),
      cylinder_in: 0,
      cylinder_out: 0,
      scrap_out: 0,
      scrap_stock_in: 0,
      cylinder_balance: 0,
      scrap_balance: 0,
      new_valve_in: 0,
      new_valve_out: 0,
      new_valve_balance: 0,
      dispatched: '',
      waybill_number: '',
      used_valve_in: 0,
      used_valve_out: 0,
      used_valve_balance: 0,
      defective: 0,
      notes: ''
    });

    if (calculatedNewValveBal < 0 || calculatedUsedValveBal < 0) {
      showToast(`ردیف در کاردکس «${currentCustomer.name}» ثبت شد. هشدار: به دلیل مانده منفی شیرآلات، کسری از موجودی خود ام‌گاز کسر گردید.`, 'info');
    } else {
      showToast(`ردیف جدید در کارتکس «${currentCustomer.name}» با شماره برگه ${entryData.transfer_sheet_number} ثبت شد.`);
    }

    // Always immediately display the Entry or Exit receipt sheet after submission for user convenience:
    // «بعد از ثبت کاردکس ورود/خروج بهتر است برای راحتی کاربر بلافاصله برگه ورود/خروج را نمایش دهد: اگر فیلد خروج دارای مقدار بود برگه خروج و اگر فیلد ورود دارای مقدار بود برگه ورود نمایش داده شود»
    const hasExitValue = (
      (Number(entryData.cylinder_out) || 0) > 0 ||
      (Number(entryData.scrap_out) || 0) > 0 ||
      (Number(entryData.new_valve_out) || 0) > 0 ||
      (Number(entryData.used_valve_out) || 0) > 0 ||
      Boolean(entryData.valve_items?.some(v => v.direction === 'OUT' || (Number(v.quantity) > 0 && !v.direction)))
    );

    const hasEntryValue = (
      (Number(entryData.cylinder_in) || 0) > 0 ||
      (Number(entryData.scrap_stock_in) || 0) > 0 ||
      (Number(entryData.new_valve_in) || 0) > 0 ||
      (Number(entryData.used_valve_in) || 0) > 0 ||
      Boolean(entryData.valve_items?.some(v => v.direction === 'IN'))
    );

    if (hasExitValue && !hasEntryValue) {
      setSelectedExitReceiptEntry(entryData);
      setShowExitReceiptModal(true);
    } else if (hasEntryValue && !hasExitValue) {
      setSelectedReceiptEntry(entryData);
      setShowReceiptModal(true);
    } else if (entryTab === 'out' || isOutgoingEntry(entryData)) {
      setSelectedExitReceiptEntry(entryData);
      setShowExitReceiptModal(true);
    } else {
      setSelectedReceiptEntry(entryData);
      setShowReceiptModal(true);
    }
  };

  // Create New Customer Handler
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim()) {
      showToast('لطفاً نام طرف حساب یا نمایندگی را وارد کنید.', 'error');
      return;
    }

    const newCustId = `CUST-GAS-${String(customers.length + 1).padStart(3, '0')}`;
    const newCust: Customer = {
      customer_id: newCustId,
      name: newCustomerForm.name.trim(),
      company_name: newCustomerForm.company_name.trim() || `مجموعه گاز ${newCustomerForm.name.trim()}`,
      province: newCustomerForm.province.trim() || 'تهران',
      city: newCustomerForm.city.trim() || 'تهران',
      phone: newCustomerForm.phone.trim() || `0912${Math.floor(1000000 + Math.random() * 9000000)}`,
      national_id: newCustomerForm.national_id.trim() || '',
      economic_code: newCustomerForm.economic_code.trim() || '',
      address: `${newCustomerForm.province}، ${newCustomerForm.city}، پایانه توزیع گاز`,
      credit_limit: Number(newCustomerForm.credit_limit) || 100000000,
      current_balance: Number(newCustomerForm.current_balance) || 0,
      customer_type: newCustomerForm.customer_type,
      notes: newCustomerForm.notes || 'طرف حساب ثبت‌شده در کاردکس',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save to Local Database & enqueue sync
    LocalStorageManager.recordLocalChange(
      currentEnv,
      currentUser.user_id,
      'CUSTOMER',
      'CREATE',
      newCustId,
      newCust,
      `ایجاد طرف حساب جدید: ${newCust.name}`,
      { name: newCust.name, province: newCust.province }
    );

    // Trigger sync
    SyncEngine.syncNow(currentEnv).catch(() => {});

    // Automatically select the new customer so their Kardex is instantly displayed!
    triggerSeamlessRefresh();
    setSelectedCustomerId(newCustId);
    onCustomerChange?.(newCustId);
    setShowNewCustomerModal(false);

    // Reset Form
    setNewCustomerForm({
      name: '',
      company_name: '',
      province: 'تهران',
      city: 'تهران',
      phone: '',
      national_id: '',
      economic_code: '',
      address: '',
      credit_limit: 100000000,
      current_balance: 0,
      customer_type: 'عمده',
      notes: 'طرف حساب جدید ثبت‌شده در کاردکس گاز'
    });

    showToast(`طرف حساب «${newCust.name}» با موفقیت اضافه شد و کاردکس آن فعال گردید.`);
  };

  // Open Edit Customer Modal
  const handleOpenEditCustomer = () => {
    if (!currentCustomer) return;
    const perm = LocalStorageManager.checkDocumentEditPermission(currentEnv, currentUser, currentCustomer.created_at);
    if (!perm.allowed) {
      showToast(perm.reason || 'ویرایش مشخصات طرف حساب مجاز نیست.', 'error');
      return;
    }
    setEditCustomerForm({
      name: currentCustomer.name || '',
      company_name: currentCustomer.company_name || '',
      province: currentCustomer.province || 'تهران',
      city: currentCustomer.city || 'تهران',
      phone: currentCustomer.phone || '',
      national_id: currentCustomer.national_id || '',
      economic_code: currentCustomer.economic_code || '',
      address: currentCustomer.address || '',
      customer_type: currentCustomer.customer_type || 'عمده',
      notes: currentCustomer.notes || ''
    });
    setShowEditCustomerModal(true);
  };

  // Update Customer Handler
  const handleUpdateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCustomer) return;
    if (!editCustomerForm.name.trim()) {
      showToast('نام طرف حساب نمی‌تواند خالی باشد.', 'error');
      return;
    }

    const updatedCust: Customer = {
      ...currentCustomer,
      name: editCustomerForm.name.trim(),
      company_name: editCustomerForm.company_name.trim(),
      province: editCustomerForm.province.trim() || currentCustomer.province,
      city: editCustomerForm.city.trim() || currentCustomer.city,
      phone: editCustomerForm.phone.trim() || currentCustomer.phone,
      national_id: editCustomerForm.national_id.trim(),
      economic_code: editCustomerForm.economic_code.trim(),
      customer_type: editCustomerForm.customer_type,
      notes: editCustomerForm.notes.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      // Save update to LocalStorage & queue sync
      LocalStorageManager.recordLocalChange(
        currentEnv,
        currentUser.user_id,
        'CUSTOMER',
        'UPDATE',
        currentCustomer.customer_id,
        updatedCust,
        `ویرایش مشخصات طرف حساب: ${updatedCust.name}`,
        { name: updatedCust.name, province: updatedCust.province }
      );

      SyncEngine.syncNow(currentEnv).catch(() => {});
      setShowEditCustomerModal(false);
      triggerSeamlessRefresh();
      showToast(`اطلاعات طرف حساب «${updatedCust.name}» با موفقیت ویرایش شد.`);
    } catch (err: any) {
      showToast(err?.message || 'خطا در ویرایش طرف حساب', 'error');
    }
  };

  // State for Editing Kardex Entry (سطر کاردکس)
  const [editingKardexEntry, setEditingKardexEntry] = useState<GasKardexEntry | null>(null);
  const [editKardexForm, setEditKardexForm] = useState({
    date: '',
    transfer_sheet_number: '',
    cylinder_type: 'سیلندر 11 کیلویی' as CylinderType,
    forklift_valve_type: '' as ForkliftValveType,
    valve_subtype: '',
    description: '',
    cylinder_in: 0,
    cylinder_out: 0,
    scrap_out: 0,
    scrap_stock_in: 0,
    cylinder_balance: 0,
    scrap_balance: 0,
    new_valve_in: 0,
    new_valve_out: 0,
    new_valve_balance: 0,
    used_valve_in: 0,
    used_valve_out: 0,
    used_valve_balance: 0,
    dispatched: '',
    waybill_number: '',
    defective: 0,
    notes: ''
  });

  const handleOpenEditKardex = (entry: GasKardexEntry) => {
    const perm = LocalStorageManager.checkDocumentEditPermission(currentEnv, currentUser, entry.created_at);
    if (!perm.allowed) {
      showToast(perm.reason || 'ویرایش این سند مجاز نیست.', 'error');
      return;
    }
    setEditingKardexEntry(entry);
    setEditKardexForm({
      date: entry.date || '',
      transfer_sheet_number: entry.transfer_sheet_number || '',
      cylinder_type: (entry.cylinder_type || 'سیلندر 11 کیلویی') as CylinderType,
      forklift_valve_type: (entry.forklift_valve_type || entry.valve_subtype || '') as ForkliftValveType,
      valve_subtype: entry.valve_subtype || entry.forklift_valve_type || '',
      description: entry.description || '',
      cylinder_in: entry.cylinder_in || 0,
      cylinder_out: entry.cylinder_out || 0,
      scrap_out: entry.scrap_out || 0,
      scrap_stock_in: entry.scrap_stock_in || 0,
      cylinder_balance: entry.cylinder_balance ?? 0,
      scrap_balance: Math.max(0, entry.scrap_balance ?? 0),
      new_valve_in: entry.new_valve_in || 0,
      new_valve_out: entry.new_valve_out || 0,
      new_valve_balance: entry.new_valve_balance ?? 0,
      used_valve_in: entry.used_valve_in || 0,
      used_valve_out: entry.used_valve_out || 0,
      used_valve_balance: entry.used_valve_balance ?? 0,
      dispatched: resolveKardexDispatchedOrWaybill(entry) || (entry.dispatched !== undefined && entry.dispatched !== null && String(entry.dispatched) !== '0' && String(entry.dispatched) !== '۰' ? String(entry.dispatched) : ''),
      waybill_number: entry.waybill_number || resolveKardexDispatchedOrWaybill(entry) || '',
      defective: entry.defective || 0,
      notes: entry.notes || ''
    });
    setShowEditKardexModal(true);
  };

  const handleSaveEditKardex = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKardexEntry) return;

    // Strict Anti-Injection & Input Security Guards for Edit / Correction Form
    const descCheck = validateFieldSecurity(editKardexForm.description, 'شرح سند / راننده', { maxLength: 500 });
    if (!descCheck.isValid) {
      showToast(descCheck.error!, 'error');
      return;
    }
    const notesCheck = validateFieldSecurity(editKardexForm.notes, 'یادداشت و ملاحظات سند', { maxLength: 1000, allowMultiline: true });
    if (!notesCheck.isValid) {
      showToast(notesCheck.error!, 'error');
      return;
    }
    const sheetCheck = validateFieldSecurity(editKardexForm.transfer_sheet_number, 'شماره برگه حواله', { maxLength: 100 });
    if (!sheetCheck.isValid) {
      showToast(sheetCheck.error!, 'error');
      return;
    }
    const dateCheck = validateFieldSecurity(editKardexForm.date, 'تاریخ سند', { maxLength: 20 });
    if (!dateCheck.isValid) {
      showToast(dateCheck.error!, 'error');
      return;
    }

    const editCylIn = sanitizeNumber(editKardexForm.cylinder_in, 0, 0, 1000000);
    const editCylOut = sanitizeNumber(editKardexForm.cylinder_out, 0, 0, 1000000);
    if (editCylIn > 0 && editCylOut > 0) {
      showToast('امکان پر کردن همزمان دو کاردکس (ورود و خروج سیلندر) وجود ندارد! لطفاً یکی از فیلدهای ورود یا خروج سیلندر را صفر کنید.', 'error');
      return;
    }

    // ستون ارسالی و شماره بارنامه: هم عدد (شماره بارنامه) و هم متن ارسالی را می‌پذیرد
    const editDispatched = typeof editKardexForm.dispatched === 'string' ? editKardexForm.dispatched.trim() : (editKardexForm.dispatched ? String(editKardexForm.dispatched).trim() : '');
    const cleanEditDispatched = editDispatched && editDispatched !== '0' && editDispatched !== '۰' ? sanitizeInput(editDispatched) : '';
    const cleanEditWaybill = editKardexForm.waybill_number && String(editKardexForm.waybill_number).trim() !== '' ? sanitizeInput(String(editKardexForm.waybill_number).trim()) : cleanEditDispatched;

    const isEditForklift = normalizeCylinderType(editKardexForm.cylinder_type || editingKardexEntry.cylinder_type) === 'سیلندر لیفتراکی';
    const chosenEditForkliftValve = isEditForklift ? (editKardexForm.forklift_valve_type || editKardexForm.valve_subtype || 'شیر بوتانی لیفتراکی') : undefined;

    const res = LocalStorageManager.updateKardexEntry(
      currentEnv,
      editingKardexEntry.entry_id,
      {
        cylinder_type: editKardexForm.cylinder_type || editingKardexEntry.cylinder_type || 'سیلندر 11 کیلویی',
        forklift_valve_type: chosenEditForkliftValve,
        valve_subtype: chosenEditForkliftValve,
        date: dateCheck.cleanValue,
        transfer_sheet_number: sheetCheck.cleanValue,
        description: descCheck.cleanValue,
        cylinder_in: sanitizeNumber(editKardexForm.cylinder_in, 0, 0, 1000000),
        cylinder_out: sanitizeNumber(editKardexForm.cylinder_out, 0, 0, 1000000),
        scrap_out: sanitizeNumber(editKardexForm.scrap_out, 0, 0, 1000000),
        scrap_stock_in: sanitizeNumber(editKardexForm.scrap_stock_in, 0, 0, 1000000),
        cylinder_balance: sanitizeNumber(editKardexForm.cylinder_balance, 0, -1000000, 1000000),
        scrap_balance: Math.max(0, sanitizeNumber(editKardexForm.scrap_balance, 0, 0, 1000000)),
        new_valve_in: sanitizeNumber(editKardexForm.new_valve_in, 0, 0, 1000000),
        new_valve_out: sanitizeNumber(editKardexForm.new_valve_out, 0, 0, 1000000),
        new_valve_balance: sanitizeNumber(editKardexForm.new_valve_balance, 0, -1000000, 1000000),
        used_valve_in: sanitizeNumber(editKardexForm.used_valve_in, 0, 0, 1000000),
        used_valve_out: sanitizeNumber(editKardexForm.used_valve_out, 0, 0, 1000000),
        used_valve_balance: sanitizeNumber(editKardexForm.used_valve_balance, 0, -1000000, 1000000),
        dispatched: cleanEditDispatched || cleanEditWaybill,
        waybill_number: cleanEditWaybill || cleanEditDispatched,
        defective: sanitizeNumber(editKardexForm.defective, 0, 0, 1000000),
        notes: notesCheck.cleanValue
      },
      currentUser
    );

    if (!res.success) {
      showToast(res.error || 'خطا در ویرایش سند سطر کاردکس', 'error');
      return;
    }

    if (editKardexForm.cylinder_type && editKardexForm.cylinder_type !== selectedCylinderType) {
      setSelectedCylinderType(editKardexForm.cylinder_type as CylinderType);
    }

    setShowEditKardexModal(false);
    setEditingKardexEntry(null);
    if (res.entry) {
      setAllKardexEntries(prev => prev.map(e => e.entry_id === res.entry!.entry_id ? res.entry! : e));
    }
    triggerSeamlessRefresh();
    showToast('سند سطر کاردکس با موفقیت ویرایش و ذخیره شد.');
    SyncEngine.syncNow(currentEnv).catch(() => {});
  };

  // Open Delete / Move to Trash Modal (supports quick delete or confirmation modal)
  const handleOpenDeleteModal = (entry: GasKardexEntry, isQuick: boolean = false) => {
    const perm = LocalStorageManager.checkDocumentEditPermission(currentEnv, currentUser, entry.created_at);
    if (!perm.allowed) {
      showToast(perm.reason || 'حذف این سند مجاز نیست.', 'error');
      return;
    }

    if (isQuick) {
      const sheetNo = entry.transfer_sheet_number || entry.entry_id;
      // 1. Instant optimistic exclusion
      setAllKardexEntries(prev => prev.filter(e => e.entry_id !== entry.entry_id));
      const res = LocalStorageManager.moveKardexEntryToTrash(
        currentEnv,
        entry.entry_id,
        currentUser,
        'حذف سریع توسط کاربر'
      );
      if (!res.success) {
        triggerSeamlessRefresh();
        showToast(res.error || 'خطا در انتقال سند به سطل آشغال', 'error');
        return;
      }
      triggerSeamlessRefresh();
      showToast(`سند شماره برگه «${sheetNo}» با موفقیت به سطل آشغال منتقل شد و جدول به‌روزرسانی شد.`, 'success');
      SyncEngine.syncNow(currentEnv).catch(() => {});
      return;
    }

    setDeletingEntry(entry);
    setDeleteReasonInput('');
  };

  // Confirm moving Kardex entry to Trash
  const handleConfirmMoveToTrash = () => {
    if (!deletingEntry) return;
    const target = deletingEntry;
    const sheetNo = target.transfer_sheet_number || target.entry_id;

    // 1. Instant Optimistic UI Update: exclude from table in 0ms so the section refreshes visibly right away!
    setAllKardexEntries(prev => prev.filter(e => e.entry_id !== target.entry_id));
    setDeletingEntry(null);
    setDeleteReasonInput('');

    // 2. Persist soft-delete to storage
    const res = LocalStorageManager.moveKardexEntryToTrash(
      currentEnv,
      target.entry_id,
      currentUser,
      deleteReasonInput.trim() || undefined
    );

    if (!res.success) {
      triggerSeamlessRefresh();
      showToast(res.error || 'خطا در انتقال سند به سطل آشغال', 'error');
      return;
    }

    // 3. Fully seamless refresh
    triggerSeamlessRefresh();
    showToast(`سند شماره برگه «${sheetNo}» با موفقیت به سطل آشغال منتقل شد و مانده‌ها بازتراز شدند.`, 'success');
    SyncEngine.syncNow(currentEnv).catch(() => {});
  };

  // Restore entry from Trash (Recovery)
  const handleRestoreFromTrash = (entry: GasKardexEntry) => {
    // 1. Optimistic recovery in state
    setAllKardexEntries(prev => prev.map(e => e.entry_id === entry.entry_id ? { ...e, is_deleted: false } : e));

    const res = LocalStorageManager.restoreKardexEntry(currentEnv, entry.entry_id, currentUser);
    if (!res.success) {
      triggerSeamlessRefresh();
      showToast(res.error || 'خطا در بازیابی سند', 'error');
      return;
    }

    triggerSeamlessRefresh();
    showToast(`سند شماره برگه «${entry.transfer_sheet_number || entry.entry_id}» با موفقیت ریکاوری شد و به کاردکس بازگشت.`, 'success');
    SyncEngine.syncNow(currentEnv).catch(() => {});
  };

  // Permanently delete from Trash (Opens confirmation modal without window.confirm)
  const handleOpenPermanentDeleteModal = (entry: GasKardexEntry) => {
    setEntryToPermanentlyDelete(entry);
  };

  // Execute permanent delete after user confirmation in modal
  const handleExecutePermanentDelete = () => {
    if (!entryToPermanentlyDelete) return;
    const entry = entryToPermanentlyDelete;
    const sheetNo = entry.transfer_sheet_number || entry.entry_id;

    // 1. Optimistic removal
    setAllKardexEntries(prev => prev.filter(e => e.entry_id !== entry.entry_id));
    setEntryToPermanentlyDelete(null);

    const res = LocalStorageManager.permanentDeleteKardexEntry(currentEnv, entry.entry_id, currentUser);
    if (!res.success) {
      triggerSeamlessRefresh();
      showToast(res.error || 'خطا در حذف دائمی سند', 'error');
      return;
    }

    triggerSeamlessRefresh();
    showToast(`سند «${sheetNo}» به‌صورت دائمی و برای همیشه حذف گردید.`, 'success');
    SyncEngine.syncNow(currentEnv).catch(() => {});
  };

  // Empty Trash completely (Opens confirmation modal without window.confirm)
  const handleOpenEmptyTrashModal = () => {
    if (trashedEntries.length === 0) {
      showToast('سطل آشغال خالی است.', 'info');
      return;
    }
    setShowEmptyTrashConfirmModal(true);
  };

  // Execute emptying trash after user confirmation in modal
  const handleExecuteEmptyTrash = () => {
    if (trashedEntries.length === 0) return;

    const res = LocalStorageManager.emptyKardexTrash(currentEnv, undefined, currentUser);
    if (!res.success) {
      showToast(res.error || 'خطا در تخلیه سطل آشغال', 'error');
      setShowEmptyTrashConfirmModal(false);
      return;
    }

    setShowEmptyTrashConfirmModal(false);
    triggerSeamlessRefresh();
    showToast(`سطل آشغال با موفقیت تخلیه شد (${toPersianDigits(res.count)} سند برای همیشه حذف گردید).`);
    SyncEngine.syncNow(currentEnv).catch(() => {});
  };

  // Export current Kardex to Excel with Right-to-Left (RTL) format
  const handleExportExcel = () => {
    if (!currentCustomer) return;
    const entriesToExport = displayedEntries.length > 0 ? displayedEntries : customerEntries;
    exportKardexToXLSX(currentCustomer.name, entriesToExport, selectedCylinderType);
    const filterNote = (startDate || endDate) ? ` در بازه ${startDate || 'ابتدا'} تا ${endDate || 'امروز'}` : '';
    showToast(`فایل اکسل راست‌به‌چپ (RTL) کاردکس گاز «${currentCustomer.name}» (${selectedCylinderType}) شامل ${formatPersianNumber(entriesToExport.length)} ردیف${filterNote} با موفقیت تولید شد.`);
  };

  // Download Blank template
  const handleDownloadBlank = () => {
    const link = document.createElement('a');
    link.href = '/kardex_gas_blank.xlsx';
    link.download = 'kardex_gas_blank.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('فایل نمونه خام اکسل (kardex_gas_blank.xlsx) دانلود شد.');
  };

  // Handle Excel file upload and parsing
  const handleImportFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !currentCustomer) return;

    try {
      setIsImporting(true);
      const importedEntries = await parseKardexFromXLSX(
        importFile,
        currentCustomer.customer_id,
        currentCustomer.name,
        currentUser.user_id,
        dbState.deviceId,
        selectedCylinderType
      );

      // Record each entry in local DB & sync queue
      for (const entry of importedEntries) {
        LocalStorageManager.recordLocalChange(
          currentEnv,
          currentUser.user_id,
          'GAS_KARDEX',
          'CREATE',
          entry.entry_id,
          entry,
          `ورود از اکسل کاردکس گاز (${selectedCylinderType}): ${entry.description}`
        );
      }

      // Trigger sync
      SyncEngine.syncNow(currentEnv).catch(() => {});

      setShowImportModal(false);
      setImportFile(null);
      showToast(`${formatPersianNumber(importedEntries.length)} ردیف کاردکس «${selectedCylinderType}» از فایل اکسل با موفقیت وارد سیستم شد.`);
    } catch (err: any) {
      console.warn('Import warning:', err?.message || err);
      showToast(`خطا در پردازش فایل اکسل: ${err.message || 'فرمت فایل نامعتبر است'}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Direct print action: triggers browser native print dialog or Save as PDF
  const handleTriggerPrint = () => {
    const isForklift = selectedCylinderType === 'سیلندر لیفتراکی';
    const hasForkliftSubtype = isForklift && selectedForkliftValveSubtype && selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') && selectedForkliftValveSubtype !== 'همه';
    const activeCylLabel = hasForkliftSubtype
      ? `سیلندر لیفتراکی (${selectedForkliftValveSubtype})`
      : selectedCylinderType;

    printGasKardexDocument({
      customer: currentCustomer,
      entries: displayedEntries.length > 0 ? displayedEntries : customerEntries,
      currentUser,
      stats,
      cylinderType: activeCylLabel,
      customItemNames
    });
    showToast(`سند رسمی کاردکس گاز (${activeCylLabel}) به چاپگر ارسال گردید.`, 'success');
  };

  // Direct vector PDF export action
  const handleExportKardexPdf = async () => {
    setIsExportingPdf(true);
    try {
      const custName = currentCustomer?.name ? currentCustomer.name.replace(/\s+/g, '_') : 'customer';
      const isForklift = selectedCylinderType === 'سیلندر لیفتراکی';
      const hasForkliftSubtype = isForklift && selectedForkliftValveSubtype && selectedForkliftValveSubtype !== 'ALL' && !selectedForkliftValveSubtype.includes('تجمیعی') && selectedForkliftValveSubtype !== 'همه';
      const tag = hasForkliftSubtype ? `_forklift_${selectedForkliftValveSubtype.replace(/\s+/g, '_')}` : '';

      const ok = await exportElementToPdf('printable-gas-kardex', {
        filename: `kardex_gas_${custName}${tag}.pdf`,
        orientation: 'landscape',
        format: 'a4',
        marginMm: 4
      });
      if (ok) {
        showToast('فایل برداری PDF کاردکس با موفقیت ذخیره گردید.', 'success');
      }
    } catch (err) {
      console.error('Kardex PDF export error:', err);
      showToast('خطا در تولید مستقیم PDF؛ می‌توانید از چاپگر (گزینه Save as PDF) استفاده کنید.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

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

  // Strictly block Hajivand from viewing or interacting with Gas Kardex
  if (isHajivand) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4 max-w-lg mx-auto my-12" dir="rtl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-white">عدم دسترسی به کاردکس تعمیر سیلندر</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          کاربر محترم مهندس حاجی‌وند، طبق معماری سامانه و فرآیندهای انبارداری، بخش کاردکس گاز منحصراً در اختیار مدیریت و مدیر داخلی (خانم کرمی) می‌باشد و برای انباردار مخفی و غیرقابل دسترسی است. وظیفه شما شمارش فیزیکی اقلام در بخش «ورودی شیر و سیلندر» می‌باشد.
        </p>
        {onNavigateToInspections && (
          <button
            type="button"
            onClick={onNavigateToInspections}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-md shadow-indigo-900/40"
          >
            انتقال به منوی ورودی شیر و سیلندر
          </button>
        )}
      </div>
    );
  }

  const hasNegativeValveNotice = Boolean(
    currentCylinderStockStatus &&
    !currentCylinderStockStatus.relationship.isTank &&
    currentCylinderStockStatus.customerNewValveBalance < 0
  );
  const unreadNotificationLogsCount = notificationHistory.filter(n => !n.read).length;
  const statusNoticesCount = hasNegativeValveNotice ? 1 : 0;
  const notificationsBadgeCount =
    pendingInspections.length +
    unreadNotificationLogsCount +
    (hasNegativeValveNotice ? 1 : 0);

  const openNotificationsCenter = () => {
    setPendingSearchQuery('');
    setNotificationsTab(pendingInspections.length > 0 ? 'pending' : 'all');
    setNotificationHistory(prev => prev.map(item => (item.read ? item : { ...item, read: true })));
    setShowNotificationsModal(true);
  };

  return (
    <div className="space-y-6" dir="rtl">



      {/* Synchronized Customer Selector & Active Details Banner (Dark Theme) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Compact Instant Search with Auto-Suggestions (triggers on 4 letters or typing) */}
          <div className="relative w-full sm:w-64 md:w-72" ref={customerSearchContainerRef}>
            <Search className="w-3.5 h-3.5 text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="جستجوی مشتری یا شرکت (۴+ حرف)..."
              value={customerSearchQuery}
              onChange={e => {
                setCustomerSearchQuery(e.target.value);
                setShowCustomerSuggestions(true);
              }}
              onFocus={() => {
                if (customerSearchQuery.trim().length > 0) {
                  setShowCustomerSuggestions(true);
                }
              }}
              className="w-full text-xs bg-slate-950 border border-slate-700/80 rounded-xl pr-8 pl-7 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all font-sans"
            />
            {customerSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setCustomerSearchQuery('');
                  setShowCustomerSuggestions(false);
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                title="پاک کردن جستجو"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Instant Suggestion Dropdown */}
            {showCustomerSuggestions && customerSearchQuery.trim().length > 0 && (
              <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 max-h-72 overflow-y-auto bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-800/80">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400 text-center">
                    مشتری یا شرکتی با عبارت «{customerSearchQuery}» یافت نشد.
                  </div>
                ) : (
                  filteredCustomers.map(c => {
                    const isSelected = c.customer_id === selectedCustomerId;
                    return (
                      <button
                        key={c.customer_id}
                        type="button"
                        onClick={() => {
                          handleSelectCustomer(c.customer_id);
                          setCustomerSearchQuery('');
                          setShowCustomerSuggestions(false);
                        }}
                        className={`w-full text-right p-2.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected ? 'bg-amber-950/50 text-amber-300' : 'text-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs flex items-center gap-1.5 truncate">
                            <span className="text-white">{c.name}</span>
                            {c.company_name && (
                              <span className="text-slate-400 font-normal text-[11px] truncate">
                                ({c.company_name})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-amber-400/90">{c.customer_id}</span>
                            {c.province && <span>استان: {c.province}</span>}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Active Customer Indicator Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 shadow-xs text-xs">
              <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-bold text-white">
                {currentCustomer?.name || 'انتخاب نشده'}
              </span>
              {currentCustomer?.company_name && (
                <span className="text-slate-400 text-[11px] font-medium border-r border-slate-800 pr-2 mr-1 truncate max-w-[160px]">
                  {currentCustomer.company_name}
                </span>
              )}
              {/* Province / City instead of Database UUID */}
              <span className="text-[11px] font-semibold text-amber-400/90 px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-800/40 mr-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                <span>
                  {currentCustomer?.province
                    ? (currentCustomer.city && currentCustomer.city !== currentCustomer.province
                        ? `${currentCustomer.province} - ${currentCustomer.city}`
                        : `استان ${currentCustomer.province}`)
                    : (currentCustomer?.city ? `شهر ${currentCustomer.city}` : 'نامشخص')}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Dropdown Menu of All Customers (جایگزین دکمه‌ها طبق درخواست کاربر) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 shrink-0">
            <Users className="w-4 h-4" />
            <span>انتخاب از فهرست تمام مشتری‌ها:</span>
          </div>

          <div className="flex-1 relative">
            <select
              id="all-customers-dropdown-menu"
              value={selectedCustomerId}
              onChange={e => handleSelectCustomer(e.target.value)}
              className="w-full text-xs sm:text-sm font-semibold bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-hidden focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-xs"
            >
              {allSortedCustomers.map(c => (
                <option
                  key={c.customer_id}
                  value={c.customer_id}
                  className="bg-slate-900 text-slate-100 py-1.5"
                >
                  {c.name} {c.company_name ? `(${c.company_name})` : ''} {c.province ? `- استان ${c.province}` : ''} [{c.customer_id}]
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 font-mono">
              تعداد: <strong className="text-amber-400 font-bold">{toPersianDigits(customers.length)}</strong> طرف حساب
            </span>
          </div>
        </div>
      </div>

      {/* Main Header & Top Toolbar (Dark Slate Theme) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="text-lg md:text-xl font-bold text-slate-100 flex items-center gap-2 cursor-help"
                title="مدیریت و تراز لحظه‌ای گردش کپسول گاز، شیر نو، شیر کهنه و ضایعات طرف‌های حساب"
              >
                <span>کاردکس تخصصی سیلندر و شیرآلات گاز</span>
                <Info className="w-4 h-4 text-slate-400" />
              </h1>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Add Incoming Entry Button */}
          <button
            onClick={() => openAddEntryModal('in')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-black rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors shadow-xs whitespace-nowrap cursor-pointer ${
              (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER')
                ? 'bg-slate-200 text-slate-400 border border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 opacity-60 cursor-not-allowed'
                : 'text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 dark:text-emerald-950 dark:bg-emerald-400 dark:hover:bg-emerald-300 dark:border-transparent'
            }`}
            title={
              (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER')
                ? 'ثبت کاردکس در حیطه اختیارات مهندس حاجی‌وند نیست (ورودی را در منوی «ورودی شیر و سیلندر» ثبت فرمایید)'
                : 'ثبت سند ورود کپسول، شیرآلات و قطعات (کد i)'
            }
          >
            {(currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER') ? (
              <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            ) : (
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white dark:text-emerald-950 shrink-0" />
            )}
            <span>ورودی (i)</span>
          </button>

          {/* Add Outgoing Entry Button */}
          <button
            onClick={() => openAddEntryModal('out')}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-black rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors shadow-xs whitespace-nowrap cursor-pointer ${
              (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER')
                ? 'bg-slate-200 text-slate-400 border border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 opacity-60 cursor-not-allowed'
                : 'text-white bg-amber-600 hover:bg-amber-500 border border-amber-700 dark:text-amber-950 dark:bg-amber-400 dark:hover:bg-amber-300 dark:border-transparent'
            }`}
            title={
              (currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER')
                ? 'ثبت کاردکس در حیطه اختیارات مهندس حاجی‌وند نیست'
                : 'ثبت سند خروج و ارسال کپسول، بارنامه و قطعات (کد e)'
            }
          >
            {(currentUser?.username === 'hajivand' || currentUser?.username === 'gholizadeh' || currentUser?.role === 'WAREHOUSE_KEEPER') ? (
              <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            ) : (
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white dark:text-amber-950 shrink-0" />
            )}
            <span>خروجی (e)</span>
          </button>

          {/* Print Kardex Button (Selected Toolbar Action) */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:text-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs active:scale-98"
            title="پیش‌نمایش، چاپ رسمی و دریافت فایل PDF کاردکس گاز"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>چاپ / PDF</span>
          </button>

          {/* Dedicated Goods Entry Form Button (مشاهده برگ ورود کالا) */}
          <button
            onClick={() => {
              // Open with first entry or incoming entry if available
              const incoming = customerEntries.find(e => !isOutgoingEntry(e)) || customerEntries[0] || null;
              setSelectedReceiptEntry(incoming);
              setShowReceiptModal(true);
            }}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 border border-amber-700 dark:text-amber-950 dark:bg-amber-400 dark:hover:bg-amber-300 dark:border-amber-300 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            title="مشاهده و چاپ فرم فیزیکی برگ ورود کالا (M.Gas cylinder)"
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white dark:text-amber-900 shrink-0" />
            <span>برگ ورود</span>
          </button>

          {/* Dedicated Goods Exit Form Button (مشاهده برگه خروج کالا) */}
          <button
            onClick={() => {
              // Open with first outgoing entry if available
              const outgoing = customerEntries.find(e => isOutgoingEntry(e)) || customerEntries[0] || null;
              setSelectedExitReceiptEntry(outgoing);
              setShowExitReceiptModal(true);
            }}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 border border-sky-700 dark:text-sky-950 dark:bg-sky-400 dark:hover:bg-sky-300 dark:border-sky-300 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            title="مشاهده و چاپ فرم فیزیکی برگه خروج کالا و تعهدنامه راننده (M.Gas cylinder)"
          >
            <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white dark:text-sky-900 shrink-0" />
            <span>برگ خروج</span>
          </button>


          {/* Export Excel (.xlsx RTL) */}
          <button
            onClick={handleExportExcel}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-300 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/70 dark:border-emerald-800/70 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
            title={`خروجی اکسل کاردکس ${selectedCylinderType} با فرمت کامپوننت راست‌به‌چپ`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>اکسل</span>
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => setShowImportModal(true)}
            title="ورود داده‌ها از فایل اکسل"
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-slate-400 shrink-0" />
            <span>ورود اکسل</span>
          </button>

          {/* Notifications Center Popup Trigger Button */}
          <button
            type="button"
            onClick={openNotificationsCenter}
            title="مشاهده مرکز اعلان‌های کاردکس تعمیر سیلندر (ورودی‌های در انتظار، قوانین و پیام‌ها)"
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold border rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shadow-xs ${
              pendingInspections.length > 0
                ? 'text-white bg-amber-600 hover:bg-amber-500 border-amber-700 dark:text-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900/80 dark:border-amber-600/80'
                : notificationsBadgeCount > 0
                ? 'text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border-indigo-300 dark:text-indigo-200 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 dark:border-indigo-700/80'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-300 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700'
            }`}
          >
            <Bell
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                pendingInspections.length > 0
                  ? 'text-white dark:text-amber-400 animate-pulse'
                  : notificationsBadgeCount > 0
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            />
            <span>اعلان‌ها</span>
            {notificationsBadgeCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold font-mono shadow-xs ${
                  pendingInspections.length > 0
                    ? 'bg-white text-amber-700 dark:bg-amber-500 dark:text-slate-950'
                    : 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white'
                }`}
              >
                {toPersianDigits(notificationsBadgeCount)}
              </span>
            )}
          </button>

          {/* Recycle Bin / Trash Section Button */}
          <button
            onClick={() => setShowTrashModal(true)}
            title="سطل آشغال و مرکز ریکاوری اسناد حذف‌شده کاردکس"
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold border rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shadow-xs ${
              trashedEntries.length > 0
                ? 'text-white bg-rose-600 hover:bg-rose-500 border-rose-700 dark:text-rose-200 dark:bg-rose-950/70 dark:border-rose-800/80 shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-300 dark:text-slate-400 dark:bg-slate-800/80 dark:border-slate-700'
            }`}
          >
            <Trash2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${trashedEntries.length > 0 ? 'text-white dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`} />
            <span>سطل آشغال</span>
            {trashedEntries.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white text-rose-700 dark:bg-rose-500 dark:text-white font-mono shadow-xs">
                {toPersianDigits(trashedEntries.length)}
              </span>
            )}
          </button>

          {/* Blank Template Download */}
          <button
            onClick={handleDownloadBlank}
            className="px-2 sm:px-2.5 py-1.5 sm:py-2 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:bg-slate-800/40 dark:hover:bg-slate-800 dark:border-slate-800 rounded-lg sm:rounded-xl transition-colors cursor-pointer shadow-xs"
            title="دانلود فایل نمونه خام اکسل (kardex_gas_blank.xlsx)"
          >
            <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          </button>
        </div>
      </div>



      {/* The 16-Column Kardex Table (Dark Theme Matching Entire App) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-col gap-3 bg-slate-950/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <FileSpreadsheet className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-sm font-bold text-slate-200">
                کاردکس جاری: <span className="text-amber-400 font-extrabold">{currentCustomer?.name}</span>
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                ({formatPersianNumber(displayedEntries.length)} ردیف تراکنش)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Quick Print / PDF Button - Strict Standard A4 Landscape */}
              <button
                type="button"
                onClick={handleTriggerPrint}
                className="px-3 py-1.5 text-xs font-bold text-amber-300 bg-slate-800 hover:bg-slate-700 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                title="چاپ رسمی کاردکس گاز در قطع استاندارد A4 به صورت افقی (Landscape)"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span className="font-bold">پرینت کاردکس (A4 افقی)</span>
              </button>

              {/* Primary Cylinder Selection Dropdown - انتخاب سیلندر تعمیری و نمایش موجودی مانده و شیر متناسب */}
              <div className="relative flex flex-col gap-2 w-full lg:w-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedCylinderType}
                    onChange={(e) => {
                      const val = normalizeCylinderType(e.target.value as CylinderType);
                      setSelectedCylinderType(val);
                      setSelectedValveSubtype('همه');
                      setSelectedForkliftValveSubtype('ALL');
                      showToast(`کاردکس تعمیری تغییر یافت به: ${val}`);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-amber-950 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/90 hover:bg-amber-100 dark:hover:bg-amber-900/90 border-2 border-amber-400 dark:border-amber-600 rounded-xl transition-all cursor-pointer shadow-xs focus:ring-2 focus:ring-amber-500"
                    title="انتخاب سیلندر کاردکس تعمیری و مشاهده موجودی انبار و شیر متناسب"
                  >
                    {availableCylinderTypes.map((type) => {
                      const norm = normalizeCylinderType(type);
                      const cStock = cylinderStocksMap[norm] || cylinderStocksMap[type];
                      const rel = cStock?.relationship || getCylinderRelationshipInfo(norm, currentEnv);
                      const cylBal = cStock ? cStock.customerCylinderBalance : 0;
                      const vStock = cStock ? cStock.warehouseMatchingValveStock : 0;
                      const isForklift = norm === 'سیلندر لیفتراکی';
                      const isTank = isTankType(norm);
                      return (
                        <option key={type} value={norm} className="bg-slate-900 text-slate-100 font-sans py-1.5">
                          {norm} {isForklift ? '(مدل واحد ۲ شیره)' : ''} ◀ {isTank ? `مخزن [بدون نیاز به شیر] | موجودی انبار: ${toPersianDigits(cylBal)}` : `[شیر متناظر: ${rel.matchingValveName}] | موجودی انبار: ${toPersianDigits(vStock)}`}
                        </option>
                      );
                    })}
                  </select>

                  {/* Direct Live Stock Badges Beside Dropdown */}
                  {currentCylinderStockStatus && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
                      <span
                        className="px-2 py-1 rounded-lg bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 font-bold flex items-center gap-1 shadow-xs"
                        title="مانده سیلندر این مشتری در کاردکس تعمیر"
                      >
                        <span className="font-sans text-[10px] text-emerald-400 font-normal">موجودی سیلندر:</span>
                        <strong className="text-emerald-200">{formatPersianNumber(currentCylinderStockStatus.customerCylinderBalance)}</strong>
                      </span>

                      {!currentCylinderStockStatus.relationship.isTank && (
                        <>
                          <span
                            className="px-2 py-1 rounded-lg bg-amber-950/90 text-amber-300 border border-amber-700/80 font-bold flex items-center gap-1 shadow-xs"
                            title="مانده شیر نو متعلق به این مشتری در کاردکس تعمیر سیلندر"
                          >
                            <span className="font-sans text-[10px] text-amber-400 font-normal">مانده شیر نو مشتری:</span>
                            <strong className="text-amber-200">{formatPersianNumber(currentCylinderStockStatus.customerNewValveBalance)}</strong>
                            <span className="text-[9px] font-sans text-amber-400">عدد</span>
                          </span>

                          {currentCylinderStockStatus.customerUsedValveBalance > 0 && (
                            <span
                              className="px-2 py-1 rounded-lg bg-slate-900/90 text-slate-300 border border-slate-700/80 font-bold flex items-center gap-1 shadow-xs"
                              title="مانده شیر کهنه و داغی متعلق به این مشتری در کاردکس تعمیر سیلندر"
                            >
                              <span className="font-sans text-[10px] text-slate-400 font-normal">مانده داغی مشتری:</span>
                              <strong className="text-slate-200">{formatPersianNumber(currentCylinderStockStatus.customerUsedValveBalance)}</strong>
                              <span className="text-[9px] font-sans text-slate-400">عدد</span>
                            </span>
                          )}

                          <span
                            className="px-2 py-1 rounded-lg bg-teal-950/90 text-teal-300 border border-teal-700/80 font-bold flex items-center gap-1 shadow-xs"
                            title={`موجودی کل شیر نو متناسب با ${currentCylinderStockStatus.relationship.displayName} در انبار مرکزی ام‌گاز (تأمین‌شده توسط تأمین‌کنندگان)`}
                          >
                            <span className="font-sans text-[10px] text-teal-400 font-normal">موجودی انبار ام‌گاز:</span>
                            <strong className="text-teal-200">{formatPersianNumber(currentCylinderStockStatus.warehouseMatchingValveStock)}</strong>
                            <span className="text-[9px] font-sans text-teal-400">عدد</span>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Secondary Valve Selection Dropdown: دقیقا زیر این لیست کشویی یک لیست کشویی دیگر ظاهر شود برای تفکیک نوع شیر های موجود */}
                {!isTankType(selectedCylinderType) && availableValveSubtypes && availableValveSubtypes.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap pt-0.5 animate-fadeIn">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black text-amber-500 dark:text-amber-400 flex items-center gap-1 shrink-0">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>تفکیک نوع شیر:</span>
                      </span>
                      <select
                        value={selectedValveSubtype}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedValveSubtype(val);
                          setSelectedForkliftValveSubtype(val);
                          showToast(val === 'همه' || val === 'ALL' ? 'نمایش کاردکس تجمیعی تمام انواع شیرها' : `کاردکس با شیر «${val}» تفکیک شد`, 'info');
                        }}
                        className="px-3 py-1.5 text-xs font-black text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/90 hover:bg-amber-200 dark:hover:bg-amber-900 border-2 border-amber-500 rounded-xl transition-all cursor-pointer shadow-xs focus:ring-2 focus:ring-amber-500"
                        title="تفکیک و انتخاب از بین انواع شیرهای موجود در کاردکس"
                      >
                        {availableValveSubtypes.map((vSub) => {
                          const isAll = vSub === 'همه';
                          const det = getCustomerSpecificValveBalanceDetails(
                            currentCustomer?.customer_id,
                            selectedCylinderType,
                            vSub,
                            allKardexEntries,
                            currentEnv
                          );
                          const label = isAll
                            ? `همه انواع شیرها (کل: ${formatPersianNumber(det.total_balance)} | نو: ${formatPersianNumber(det.new_balance)} | کهنه: ${formatPersianNumber(det.used_balance)})`
                            : `${vSub} (مانده کل: ${formatPersianNumber(det.total_balance)} | نو: ${formatPersianNumber(det.new_balance)} | کهنه: ${formatPersianNumber(det.used_balance)})`;
                          return (
                            <option key={vSub} value={vSub} className="bg-slate-900 text-slate-100 font-sans py-1.5">
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {selectedValveSubtype && selectedValveSubtype !== 'همه' && selectedValveSubtype !== 'ALL' && (() => {
                      const selDet = getCustomerSpecificValveBalanceDetails(
                        currentCustomer?.customer_id,
                        selectedCylinderType,
                        selectedValveSubtype,
                        allKardexEntries,
                        currentEnv
                      );
                      return (
                        <span className="text-[10.5px] font-mono text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-xl border border-amber-700/80 flex items-center gap-1.5 shadow-xs">
                          <span className="font-sans font-bold text-amber-400 text-[10px]">فیلتر کاردکس:</span>
                          <strong>{selectedValveSubtype}</strong>
                          <span className="font-sans text-[10px] text-emerald-300 font-bold bg-emerald-950/90 px-1.5 py-0.5 rounded border border-emerald-700/60">
                            مانده کل: {formatPersianNumber(selDet.total_balance)} عدد
                          </span>
                          <span className="font-sans text-[9.5px] text-teal-300 bg-teal-950/90 px-1.5 py-0.5 rounded border border-teal-800">
                            نو: {formatPersianNumber(selDet.new_balance)}
                          </span>
                          <span className="font-sans text-[9.5px] text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800">
                            کهنه: {formatPersianNumber(selDet.used_balance)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedValveSubtype('همه');
                              setSelectedForkliftValveSubtype('ALL');
                            }}
                            className="text-amber-400 hover:text-white mr-1 cursor-pointer font-bold px-1"
                            title="حذف فیلتر و بازگشت به همه"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Quick Export Excel */}
              <button
                onClick={handleExportExcel}
                className="px-2.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80 rounded-lg flex items-center gap-1 transition-colors"
                title={`خروجی اکسل کاردکس ${selectedCylinderType} با فرمت راست‌به‌چپ`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>اکسل (RTL)</span>
              </button>
            </div>
          </div>

          {/* Segregated Valve Stock Breakdown Panel - نمایش واضح موجودی تفکیک‌شده شیرآلات مشتری به تفکیک مدل و برند */}
          {!isTankType(selectedCylinderType) && currentCustomer && availableValveSubtypes && availableValveSubtypes.length > 1 && (
            <div className="p-3.5 bg-slate-900/90 border border-amber-500/30 rounded-2xl shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>موجودی تفکیک‌شده شیرآلات:</span>
                      <span className="text-amber-400 font-extrabold">{normalizeCylinderType(selectedCylinderType)}</span>
                      <span className="text-slate-400 font-normal">| مشتری: {currentCustomer.name}</span>
                    </h3>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 self-end sm:self-auto">
                  <span className="text-amber-400 font-bold">راهنما:</span>
                  <span>جهت مشاهده کاردکس اختصاصی هر شیر، روی کارت آن کلیک نمایید</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {availableValveSubtypes.map((vSub) => {
                  const isAll = vSub === 'همه';
                  const isSelected = isAll
                    ? (!selectedValveSubtype || selectedValveSubtype === 'همه' || selectedValveSubtype === 'ALL')
                    : selectedValveSubtype === vSub;
                  const det = getCustomerSpecificValveBalanceDetails(
                    currentCustomer.customer_id,
                    selectedCylinderType,
                    vSub,
                    allKardexEntries,
                    currentEnv
                  );

                  return (
                    <button
                      key={vSub}
                      type="button"
                      onClick={() => {
                        if (isAll) {
                          setSelectedValveSubtype('همه');
                          setSelectedForkliftValveSubtype('ALL');
                          showToast('نمایش کاردکس تجمیعی تمام انواع شیرها', 'info');
                        } else {
                          setSelectedValveSubtype(vSub);
                          setSelectedForkliftValveSubtype(vSub);
                          showToast(`کاردکس با شیر «${vSub}» تفکیک شد`, 'info');
                        }
                      }}
                      className={`p-2.5 rounded-xl text-right transition-all cursor-pointer border text-xs flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/60 shadow-md text-amber-200'
                          : 'bg-slate-950/70 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                      title={isAll ? 'مشاهده تمام شیرها' : `فیلتر کاردکس بر روی شیر ${vSub}`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={`font-black text-[11px] truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                          {isAll ? 'همه مدل‌ها (تجمیعی)' : vSub}
                        </span>
                        {isSelected ? (
                          <span className="text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded-full shrink-0">
                            فعال
                          </span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-baseline justify-between gap-1 mb-1 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800/80">
                        <span className="text-[10px] text-slate-400">مانده کل:</span>
                        <strong className={`font-mono text-xs ${det.total_balance > 0 ? 'text-emerald-400' : det.total_balance < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {formatPersianNumber(det.total_balance)} <span className="text-[9px] font-sans font-normal text-slate-400">عدد</span>
                        </strong>
                      </div>

                      <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span title="شیر نو موجود">
                          نو: <b className="text-emerald-400">{formatPersianNumber(det.new_balance)}</b>
                        </span>
                        <span title="شیر کهنه موجود">
                          کهنه: <b className="text-amber-400">{formatPersianNumber(det.used_balance)}</b>
                        </span>
                      </div>

                      {(det.new_in > 0 || det.used_in > 0 || det.new_out > 0 || det.used_out > 0) && (
                        <div className="mt-1 pt-0.5 text-[9px] text-slate-500 font-mono flex items-center justify-between">
                          <span>ورود: {formatPersianNumber(det.new_in + det.used_in)}</span>
                          <span>خروج: {formatPersianNumber(det.new_out + det.used_out)}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="pt-2.5 border-t border-slate-800/70 space-y-2.5">
            {/* Primary Filter Toolbar Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Label */}
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  <span>فیلتر کاردکس:</span>
                </div>

                {/* Direction Tabs Filter: All / Incoming (i) / Outgoing (e) */}
                <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setSheetDirectionFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      sheetDirectionFilter === 'all'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    همه اسناد
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetDirectionFilter('in')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                      sheetDirectionFilter === 'in'
                        ? 'bg-emerald-500 text-emerald-950 font-bold'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                    title="فقط اسناد و بارنامه‌های ورودی (i)"
                  >
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>ورودی (i)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetDirectionFilter('out')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                      sheetDirectionFilter === 'out'
                        ? 'bg-amber-500 text-amber-950 font-bold'
                        : 'text-amber-400 hover:text-amber-300'
                    }`}
                    title="فقط اسناد و بارنامه‌های خروجی (e)"
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    <span>خروجی (e)</span>
                  </button>
                </div>

                {/* Dedicated Sheet Number Search Input */}
                <div className="relative">
                  <Hash className="w-3.5 h-3.5 text-amber-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="فیلتر شماره برگه (مثلاً Ab2306405e)..."
                    value={sheetNumberFilter}
                    onChange={e => setSheetNumberFilter(e.target.value)}
                    className="text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg pr-8 pl-6 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 w-52 sm:w-60"
                  />
                  {sheetNumberFilter && (
                    <button
                      type="button"
                      onClick={() => setSheetNumberFilter('')}
                      className="absolute left-2 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      title="پاک کردن فیلتر شماره برگه"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* General Description/Date Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="جستجوی شرح، تاریخ یا کالا..."
                    value={tableFilterQuery}
                    onChange={e => setTableFilterQuery(e.target.value)}
                    className="text-xs bg-slate-900 border border-slate-700 rounded-lg pr-8 pl-6 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 w-44 sm:w-52"
                  />
                  {tableFilterQuery && (
                    <button
                      type="button"
                      onClick={() => setTableFilterQuery('')}
                      className="absolute left-2 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      title="پاک کردن جستجو"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Advanced Date Range Filter Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedDateFilter(!showAdvancedDateFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    startDate || endDate || showAdvancedDateFilter
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600'
                  }`}
                  title="فیلتر پیشرفته بر اساس بازه زمانی (از تاریخ - تا تاریخ)"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>فیلتر بازه زمانی</span>
                  {(startDate || endDate) && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedDateFilter ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Status counter & Clear All Filters */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                  نمایش <b className="text-amber-400 font-mono">{toPersianDigits(displayedEntries.length)}</b> از <span className="font-mono">{toPersianDigits(customerEntries.length)}</span> سطر
                </span>

                {(sheetNumberFilter || tableFilterQuery || sheetDirectionFilter !== 'all' || startDate || endDate) && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="text-xs text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 flex items-center gap-1 py-1 px-2.5 rounded-md transition-colors cursor-pointer shadow-xs"
                    title="حذف تمام فیلترهای اعمال‌شده و نمایش کل سطرها"
                  >
                    <RefreshCw className="w-3 h-3 text-rose-400" />
                    <span>حذف همه فیلترها</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Date Filter Quick Badge (Shown when panel is closed but date filter is active) */}
            {!showAdvancedDateFilter && (startDate || endDate) && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-bold">بازه زمانی فعال:</span>
                  <span className="font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                    از {startDate ? toPersianDigits(startDate) : 'ابتدای دوره'} تا {endDate ? toPersianDigits(endDate) : 'امروز'}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ({toPersianDigits(displayedEntries.length)} سطر در این بازه)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDateFilter(true)}
                    className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                  >
                    تغییر بازه
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setDatePreset('all');
                    }}
                    className="p-1 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="حذف فیلتر تاریخ"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Advanced Date Range Filter Expandable Panel */}
            {showAdvancedDateFilter && (
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/30 shadow-xl space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>فیلتر پیشرفته بر اساس بازه زمانی کاردکس</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 font-mono">
                          از تاریخ - تا تاریخ
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        محدود کردن سطرهای طولانی کاردکس به اسناد صادرشده در یک دوره زمانی مشخص
                      </p>
                    </div>
                  </div>

                  {/* Fast Date Range Presets */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
                    {[
                      { id: 'all', label: 'همه تاریخ‌ها' },
                      { id: 'today', label: 'امروز' },
                      { id: 'last_7_days', label: '۷ روز اخیر' },
                      { id: 'last_30_days', label: '۳۰ روز اخیر' },
                      { id: 'current_month', label: 'ماه جاری' },
                      { id: 'current_year', label: 'سال جاری' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectDatePreset(p.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                          datePreset === p.id
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2 Persian Date Pickers + Status Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                  {/* Start Date Picker (از تاریخ) */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <ArrowDownLeft className="w-3 h-3" />
                        <span>از تاریخ شمسی (شروع بازه):</span>
                      </span>
                      {startDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setStartDate('');
                            setDatePreset('custom');
                          }}
                          className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                        >
                          پاک کردن
                        </button>
                      )}
                    </label>
                    <PersianDatePicker
                      value={startDate}
                      onChange={(val) => {
                        setStartDate(val);
                        setDatePreset('custom');
                      }}
                      placeholder="انتخاب تاریخ شروع..."
                    />
                  </div>

                  {/* End Date Picker (تا تاریخ) */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1 text-amber-400">
                        <ArrowUpRight className="w-3 h-3" />
                        <span>تا تاریخ شمسی (پایان بازه):</span>
                      </span>
                      {endDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setEndDate('');
                            setDatePreset('custom');
                          }}
                          className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                        >
                          پاک کردن
                        </button>
                      )}
                    </label>
                    <PersianDatePicker
                      value={endDate}
                      onChange={(val) => {
                        setEndDate(val);
                        setDatePreset('custom');
                      }}
                      placeholder="انتخاب تاریخ پایان..."
                    />
                  </div>

                  {/* Range Result Status & Quick Reset */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">سطرهای منطبق:</span>
                        <span className="font-bold text-amber-300 font-mono">
                          {toPersianDigits(displayedEntries.length)} از {toPersianDigits(customerEntries.length)} سطر
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400 truncate font-mono">
                        {(startDate || endDate) ? (
                          <span>بازه: {startDate ? toPersianDigits(startDate) : 'ابتدا'} تا {endDate ? toPersianDigits(endDate) : 'امروز'}</span>
                        ) : (
                          <span className="text-slate-500">تمامی سوابق بدون محدودیت زمانی</span>
                        )}
                      </div>
                    </div>

                    {(startDate || endDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('');
                          setEndDate('');
                          setDatePreset('all');
                        }}
                        className="p-2.5 rounded-xl bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 text-xs font-bold transition-colors cursor-pointer shrink-0"
                        title="پاک کردن فیلتر تاریخ"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse kardex-table">
            <thead>
              {/* Grouped Header */}
              <tr className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 divide-x divide-slate-800/80">
                <th colSpan={2} className="px-0.5 py-1 text-center bg-slate-900/90 text-slate-300 text-[9.5px] leading-tight w-[50px] max-w-[54px]" title="مشخصات سند">
                  مشخصات سند
                </th>
                <th colSpan={6} className="kardex-th-wrap px-1 py-1 text-center bg-blue-950/40 text-blue-300 text-[11px] leading-tight whitespace-normal break-all [overflow-wrap:anywhere]">
                  سیلندر و ضایعات کپسول گاز
                </th>
                <th colSpan={3} className="kardex-th-wrap px-1 py-1 text-center bg-emerald-950/40 text-emerald-300 text-[11px] leading-tight whitespace-normal break-all [overflow-wrap:anywhere]">
                  شیر نو
                </th>
                <th className="kardex-th-wrap px-1 py-1 text-center bg-slate-900/90 text-slate-300 text-[11px] leading-tight whitespace-normal break-all [overflow-wrap:anywhere]">
                  توزیع
                </th>
                <th colSpan={3} className="kardex-th-wrap px-1 py-1 text-center bg-amber-950/40 text-amber-300 text-[11px] leading-tight whitespace-normal break-all [overflow-wrap:anywhere]">
                  شیر کهنه (برگشتی)
                </th>
                <th className="kardex-th-wrap px-1 py-1 text-center bg-rose-950/40 text-rose-300 text-[11px] leading-tight whitespace-normal break-all [overflow-wrap:anywhere]">
                  کنترل کیفی
                </th>
                <th className="sticky left-0 z-20 col-actions-vertical bg-slate-900 text-amber-400 border-r border-slate-700/90 shadow-[4px_0_12px_rgba(0,0,0,0.5)]" title="فرم و چاپ">
                  <span className="vertical-text-20 text-[9px] text-amber-400">فرم/چاپ</span>
                </th>
              </tr>

              {/* Exact 16 Columns with Divided Scrap & Total Cylinder Balance + 1 Column for Form/Print */}
              <tr className="bg-slate-950/90 text-slate-400 font-bold border-b border-slate-800 divide-x divide-slate-800/80 text-center">
                <th className="col-vertical-date text-slate-400 font-bold border-b border-slate-800" title="تاریخ سند">
                  <span className="vertical-text-20">تاریخ</span>
                </th>
                <th className="px-1 py-1 text-slate-400 font-bold border-b border-slate-800 min-w-[70px] max-w-[90px]" title="شرح رویداد / انتقال">
                  <span>شرح</span>
                </th>

                {/* Cylinder & Scrap Columns */}
                <th className="kardex-th-wrap px-0.5 py-1 text-blue-400 bg-blue-950/20" title="ورودی سیلندر">
                  <span>ورودی</span><br /><span>سیلندر</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 text-rose-400 bg-rose-950/20" title="خروجی سیلندر">
                  <span>خروجی</span><br /><span>سیلندر</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 text-rose-300 bg-rose-950/30 font-bold" title="خروجی ضایعات (خروج ضایعات واقعی)">
                  <span>خروج ضایعات</span><br /><span>واقعی</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 text-amber-300 bg-amber-950/30 font-bold" title="ذخیره انبار ضایعات (خروج ضایعات سوری)">
                  <span>خروج ضایعات</span><br /><span>سوری</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 bg-emerald-950/60 text-emerald-300 font-extrabold border-x border-emerald-800/80 shadow-xs" title="مانده سیلندر">
                  <span>مانده</span><br /><span>سیلندر</span>
                </th>
                <th
                  className="kardex-th-wrap px-0.5 py-1 bg-amber-950/70 text-amber-200 font-extrabold border-x border-amber-800/80 shadow-xs"
                  title="مانده ذخیره ضایعات (مانده ضایعات)"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <Layers className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>مانده</span>
                    <span>ضایعات</span>
                  </div>
                </th>

                {/* New Valve Columns */}
                <th className="kardex-th-wrap px-0.5 py-1 text-emerald-400 bg-emerald-950/20" title="ورود شیر نو">
                  <span>ورود</span><br /><span>شیر نو</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 text-rose-400 bg-rose-950/20" title="خروج شیر نو">
                  <span>خروج</span><br /><span>شیر نو</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 bg-emerald-950/60 text-emerald-300 font-extrabold border-x border-emerald-800/80 shadow-xs" title="مانده شیر نو">
                  <span>مانده</span><br /><span>شیر نو</span>
                </th>

                {/* Dispatched / Waybill */}
                <th
                  className="kardex-th-wrap px-0.5 py-1 bg-blue-950/50 text-blue-300 font-bold border-x border-slate-800 shadow-xs"
                  title="ستون ارسالی و شماره بارنامه"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <Truck className="w-3 h-3 text-blue-400 shrink-0" />
                    <span>ارسالی</span>
                    <span className="text-[8.5px] text-blue-300 font-medium">بارنامه</span>
                  </div>
                </th>

                {/* Used Valve Columns */}
                <th className="kardex-th-wrap px-0.5 py-1 text-amber-400 bg-amber-950/20" title="ورود شیر کهنه">
                  <span>ورود</span><br /><span>شیر کهنه</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 text-rose-400 bg-rose-950/20" title="خروج شیر کهنه">
                  <span>خروج</span><br /><span>شیر کهنه</span>
                </th>
                <th className="kardex-th-wrap px-0.5 py-1 bg-amber-950/50 text-amber-200 font-extrabold" title="مانده شیر کهنه">
                  <span>مانده</span><br /><span>شیر کهنه</span>
                </th>

                {/* Defective */}
                <th className="kardex-th-wrap px-0.5 py-1 text-rose-400 bg-rose-950/30" title="معیوب">
                  <span>معیوب</span>
                </th>

                {/* Actions / Receipt Form: Vertical with minimal space */}
                <th className="sticky left-0 z-20 col-actions-vertical bg-slate-900 text-amber-400 border-r border-slate-700/90 shadow-[4px_0_12px_rgba(0,0,0,0.5)]" title="عملیات سند">
                  <span className="vertical-text-20 text-[9.5px] font-bold text-amber-400">عملیات سند</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {displayedEntries.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-14 text-center text-slate-500">
                    <Flame className="w-9 h-9 mx-auto mb-2 text-slate-700" />
                    {customerEntries.length === 0 ? (
                      <>
                        <p className="text-sm text-slate-400 font-medium">
                          تراکنشی برای طرف حساب «{currentCustomer?.name}» یافت نشد.
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          می‌توانید با دکمه «ثبت سطر کاردکس» یا «ورود از اکسل» اطلاعات را ثبت فرمایید.
                        </p>
                      </>
                    ) : (
                      <div className="max-w-md mx-auto space-y-2 text-center">
                        <p className="text-sm text-amber-300 font-bold">
                          هیچ ردیفی در این بازه زمانی یا با شرایط فیلتر جستجو یافت نشد.
                        </p>
                        <p className="text-xs text-slate-400">
                          از مجموع {toPersianDigits(customerEntries.length)} ردیف موجود در کاردکس این مشتری، موردی با فیلتر تاریخ یا جستجوی جاری همخوانی ندارد.
                        </p>
                        <button
                          type="button"
                          onClick={handleClearAllFilters}
                          className="mt-2 px-3.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>حذف تمام فیلترها و نمایش همه سوابق</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                displayedEntries.map((item, idx) => (
                  <tr
                    key={item.entry_id || `kardex-${idx}`}
                    className={`group transition-all duration-500 divide-x divide-slate-800/60 text-center ${
                      item.entry_id === recentlyAddedEntryId
                        ? 'bg-emerald-950/80 ring-2 ring-emerald-400 shadow-lg'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* 1. Date column: vertical ~22px */}
                    <td className="col-vertical-date font-mono text-slate-300 text-center" title={`تاریخ: ${item.date}`}>
                      <div className="vertical-date-text font-mono text-slate-300" dir="ltr">
                        {item.entry_id === recentlyAddedEntryId && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mb-1" title="ثبت آنی Ajax" />
                        )}
                        <span>{item.date}</span>
                      </div>
                    </td>

                    {/* 2. Description column: summarized & concise */}
                    <td className="px-1 py-1.5 text-center min-w-[70px] max-w-[110px]" title={`${item.description}${item.custom_item_name ? ` (${item.custom_item_name})` : ''}${item.forklift_valve_type ? ` [${item.forklift_valve_type}]` : ''} - کاربر: @${item.created_by_username || (SEED_USERS.find(u => u.user_id === item.user_id)?.username) || 'amouei'}`}>
                      <span className="text-[10.5px] font-bold text-slate-200 block truncate leading-tight">
                        {summarizeKardexDescription(item.description, item, item.cylinder_type || selectedCylinderType, customItemNames)}
                      </span>
                      {(item.forklift_valve_type || item.valve_subtype) && (
                        <span className="inline-block text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 truncate max-w-full mt-0.5 leading-tight" title={item.forklift_valve_type || item.valve_subtype}>
                          {item.forklift_valve_type || item.valve_subtype}
                        </span>
                      )}
                      {item.valve_items && item.valve_items.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-0.5 mt-0.5 max-w-full">
                          {item.valve_items.slice(0, 2).map((vi, viIdx) => (
                            <span
                              key={viIdx}
                              className={`inline-block text-[7.5px] px-1 py-0.2 rounded font-bold border truncate max-w-[85px] leading-tight ${
                                vi.valve_category === 'NEW'
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                  : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                              }`}
                              title={`${vi.valve_name}: ${toPersianDigits(vi.quantity)} عدد (${vi.valve_category === 'NEW' ? 'نو' : 'کهنه'})`}
                            >
                              {vi.valve_name.replace('شیر نو ', '').replace('شیر کهنه ', '').replace(' 11/25/50 کیلویی', '').replace(' لیفتراکی', '').replace(' 1/1.5/3 لیتری', '').replace(' 5/8 کیلویی', '')}: {toPersianDigits(vi.quantity)}
                            </span>
                          ))}
                          {item.valve_items.length > 2 && (
                            <span
                              className="text-[7.5px] text-amber-300 font-bold px-0.5 cursor-help"
                              title={item.valve_items.map(v => `${v.valve_name}: ${toPersianDigits(v.quantity)} عدد`).join('\n')}
                            >
                              +{toPersianDigits(item.valve_items.length - 2)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Cylinder & Scrap */}
                    <td className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-blue-400 bg-blue-950/15" title={`ورودی سیلندر: ${formatPersianNumber(item.cylinder_in || 0)}`}>
                      {formatPersianNumber(item.cylinder_in || 0)}
                    </td>
                    <td className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-rose-400 bg-rose-950/15" title={`خروجی سیلندر: ${formatPersianNumber(item.cylinder_out || 0)}`}>
                      {formatPersianNumber(item.cylinder_out || 0)}
                    </td>
                    <td
                      className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-rose-400 bg-rose-950/15"
                      title={`خروج ضایعات واقعی: ${formatPersianNumber(item.scrap_out || 0)}`}
                    >
                      {formatPersianNumber(item.scrap_out || 0)}
                    </td>
                    <td
                      className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-amber-300 bg-amber-950/30"
                      title={`خروج ضایعات سوری: ${formatPersianNumber(item.scrap_stock_in || 0)}`}
                    >
                      {formatPersianNumber(item.scrap_stock_in || 0)}
                    </td>
                    <td
                      className={`px-1 py-1.5 font-black font-mono text-sm sm:text-base border-x transition-colors ${
                        (item.cylinder_balance || 0) < 0
                          ? 'text-rose-200 bg-rose-950/70 border-rose-600/80 shadow-inner'
                          : 'text-emerald-300 bg-emerald-950/40 border-emerald-900/40'
                      }`}
                      title={(item.cylinder_balance || 0) < 0
                        ? `مانده سیلندر: ${formatPersianNumber(item.cylinder_balance || 0)} (تراز منفی)`
                        : `مانده سیلندر: ${formatPersianNumber(item.cylinder_balance || 0)}`}
                    >
                      <div className="flex items-center justify-center gap-1" dir="ltr">
                        {(item.cylinder_balance || 0) < 0 && (
                          <span className="text-[10px] text-rose-400" title="تراز منفی سیلندر">⚠️</span>
                        )}
                        <span className={(item.cylinder_balance || 0) < 0 ? 'text-rose-200 font-black' : ''}>
                          {formatPersianNumber(item.cylinder_balance || 0)}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`px-1 py-1.5 font-black font-mono text-sm sm:text-base border-x border-slate-800 ${
                        (item.scrap_balance || 0) <= 0
                          ? 'text-emerald-400 bg-emerald-950/20'
                          : 'text-amber-300 bg-amber-950/40'
                      }`}
                      title={`مانده ضایعات: ${formatPersianNumber(Math.max(0, item.scrap_balance || 0))}`}
                    >
                      {formatPersianNumber(Math.max(0, item.scrap_balance || 0))}
                    </td>

                    {/* New Valve */}
                    <td
                      className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-emerald-400 bg-emerald-950/15"
                      title={
                        selectedValveSubtype && selectedValveSubtype !== 'همه' && selectedValveSubtype !== 'ALL'
                          ? `ورود شیر نو تفکیکی «${selectedValveSubtype}»: ${formatPersianNumber(item.new_valve_in || 0)} عدد`
                          : (item.valve_items && item.valve_items.some(v => v.valve_category === 'NEW')
                              ? `ورود تفکیکی شیر نو:\n${item.valve_items.filter(v => v.valve_category === 'NEW').map(v => `${v.valve_name}: ${formatPersianNumber(v.quantity)} عدد`).join('\n')}\n(مجموع: ${formatPersianNumber(item.new_valve_in || 0)})`
                              : `ورود شیر نو: ${formatPersianNumber(item.new_valve_in || 0)}`)
                      }
                    >
                      <div className="flex items-center justify-center">
                        <span>{formatPersianNumber(item.new_valve_in || 0)}</span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-rose-400 bg-rose-950/15" title={`خروج شیر نو: ${formatPersianNumber(item.new_valve_out || 0)}`}>
                      {formatPersianNumber(item.new_valve_out || 0)}
                    </td>
                    <td
                      className={`px-1 py-1.5 font-black font-mono text-sm sm:text-base border-x transition-colors ${
                        (item.new_valve_balance || 0) < 0
                          ? 'text-rose-200 bg-rose-950/70 border-rose-600/80 shadow-inner'
                          : 'text-emerald-300 bg-emerald-950/40 border-emerald-900/40'
                      }`}
                      title={(item.new_valve_balance || 0) < 0
                        ? `مانده شیر نو: ${formatPersianNumber(item.new_valve_balance || 0)} (هشدار: تراز منفی - کسر از موجودی خود ام‌گاز)`
                        : `مانده شیر نو: ${formatPersianNumber(item.new_valve_balance || 0)}`}
                    >
                      <div className="flex items-center justify-center gap-1" dir="ltr">
                        {(item.new_valve_balance || 0) < 0 && (
                          <span className="text-[10px] text-rose-400" title="کسر از موجودی ام‌گاز">⚠️</span>
                        )}
                        <span className={(item.new_valve_balance || 0) < 0 ? 'text-rose-200 font-black' : ''}>
                          {formatPersianNumber(item.new_valve_balance || 0)}
                        </span>
                      </div>
                    </td>

                    {/* Dispatched / Waybill - ستون ارسالی و شماره بارنامه */}
                    <td
                      className="px-1 py-1.5 font-bold font-mono text-xs sm:text-sm text-slate-200 bg-slate-900/70 whitespace-normal text-center"
                      title={(() => {
                        const val = resolveKardexDispatchedOrWaybill(item);
                        return val ? `ارسالی / بارنامه: ${val}` : undefined;
                      })()}
                    >
                      {(() => {
                        const val = resolveKardexDispatchedOrWaybill(item);
                        return val ? toPersianDigits(val) : <span className="text-slate-600 font-mono">-</span>;
                      })()}
                    </td>

                    {/* Used Valve */}
                    <td
                      className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-amber-400 bg-amber-950/15"
                      title={
                        selectedValveSubtype && selectedValveSubtype !== 'همه' && selectedValveSubtype !== 'ALL'
                          ? `ورود شیر کهنه تفکیکی «${selectedValveSubtype}»: ${formatPersianNumber(item.used_valve_in || 0)} عدد`
                          : (item.valve_items && item.valve_items.some(v => v.valve_category === 'USED')
                              ? `ورود تفکیکی شیر کهنه:\n${item.valve_items.filter(v => v.valve_category === 'USED').map(v => `${v.valve_name}: ${formatPersianNumber(v.quantity)} عدد`).join('\n')}\n(مجموع: ${formatPersianNumber(item.used_valve_in || 0)})`
                              : `ورود شیر کهنه: ${formatPersianNumber(item.used_valve_in || 0)}`)
                      }
                    >
                      <div className="flex items-center justify-center">
                        <span>{formatPersianNumber(item.used_valve_in || 0)}</span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-rose-400 bg-rose-950/15" title={`خروج شیر کهنه: ${formatPersianNumber(item.used_valve_out || 0)}`}>
                      {formatPersianNumber(item.used_valve_out || 0)}
                    </td>
                    <td
                      className={`px-1 py-1.5 font-black font-mono text-sm sm:text-base transition-colors ${
                        (item.used_valve_balance || 0) < 0
                          ? 'text-rose-200 bg-rose-950/70 border-x border-rose-600/80 shadow-inner'
                          : 'text-amber-300 bg-amber-950/40'
                      }`}
                      title={(item.used_valve_balance || 0) < 0
                        ? `مانده شیر کهنه: ${formatPersianNumber(item.used_valve_balance || 0)} (هشدار: تراز منفی - کسر از موجودی خود ام‌گاز)`
                        : `مانده شیر کهنه: ${formatPersianNumber(item.used_valve_balance || 0)}`}
                    >
                      <div className="flex items-center justify-center gap-1" dir="ltr">
                        {(item.used_valve_balance || 0) < 0 && (
                          <span className="text-[10px] text-rose-400" title="کسر از موجودی ام‌گاز">⚠️</span>
                        )}
                        <span className={(item.used_valve_balance || 0) < 0 ? 'text-rose-200 font-black' : ''}>
                          {formatPersianNumber(item.used_valve_balance || 0)}
                        </span>
                      </div>
                    </td>

                    {/* Defective */}
                    <td className="px-1 py-1.5 font-black font-mono text-xs sm:text-sm text-rose-400 bg-rose-950/20" title={`معیوب: ${formatPersianNumber(item.defective || 0)}`}>
                      {formatPersianNumber(item.defective || 0)}
                    </td>

                    {/* Actions: Vertical Minimal Column (ستون عملیات سند عمودی با حداقل فضا) */}
                    <td className="sticky left-0 z-10 col-actions-vertical bg-slate-900 group-hover:bg-slate-800 border-r border-slate-700/80 shadow-[4px_0_12px_rgba(0,0,0,0.5)] transition-colors">
                      <div className="flex flex-col items-center justify-center gap-1 py-1 mx-auto">
                        {/* Order & Document Details with Sheet Number (نوشتن شماره برگه در جزئیات سفارش در بخش عملیات) */}
                        <button
                          type="button"
                          onClick={() => setSelectedEntryForDetails(item)}
                          className="w-5 h-5 p-0.5 text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                          title={`مشاهده جزئیات سفارش و سند (شماره برگه: ${item.transfer_sheet_number || '-'})`}
                        >
                          <Info className="w-3 h-3 text-indigo-400" />
                        </button>

                        {/* Outgoing Goods Receipt (برگه خروج کالا - سیلندر و شیرآلات) */}
                        {isOutgoingEntry(item) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExitReceiptEntry(item);
                              setShowExitReceiptModal(true);
                            }}
                            className="w-5 h-5 p-0.5 text-sky-300 bg-sky-950/70 hover:bg-sky-900/90 border border-sky-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="مشاهده و چاپ فرم برگه خروج کالا (سیلندر و شیرآلات)"
                          >
                            <Truck className="w-3 h-3 text-sky-400" />
                          </button>
                        )}

                        {/* Incoming Goods Receipt (برگ ورود کالا - سیلندر و شیرآلات) */}
                        {isIncomingEntry(item) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReceiptEntry(item);
                              setShowReceiptModal(true);
                            }}
                            className="w-5 h-5 p-0.5 text-amber-300 bg-amber-950/70 hover:bg-amber-900/90 border border-amber-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="مشاهده و چاپ فرم برگ ورود کالا (سیلندر و شیرآلات)"
                          >
                            <FileText className="w-3 h-3 text-amber-400" />
                          </button>
                        )}

                        {/* Fallback if neither condition matched explicitly */}
                        {!isOutgoingEntry(item) && !isIncomingEntry(item) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReceiptEntry(item);
                              setShowReceiptModal(true);
                            }}
                            className="w-5 h-5 p-0.5 text-amber-300 bg-amber-950/70 hover:bg-amber-900/90 border border-amber-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="مشاهده فرم استاندارد برگ ورود کالا"
                          >
                            <FileText className="w-3 h-3 text-amber-400" />
                          </button>
                        )}

                        {/* Print Row Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isOutgoingEntry(item)) {
                              setSelectedExitReceiptEntry(item);
                              setShowExitReceiptModal(true);
                            } else {
                              setSelectedReceiptEntry(item);
                              setShowReceiptModal(true);
                            }
                          }}
                          className="w-5 h-5 p-0.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center justify-center transition-colors cursor-pointer"
                          title="چاپ و خروجی PDF برگه سند"
                        >
                          <Printer className="w-3 h-3 text-slate-300" />
                        </button>

                        {/* Edit Kardex Row Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditKardex(item)}
                          className="w-5 h-5 p-0.5 text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs active:scale-95"
                          title="ویرایش سند و اطلاعات ردیف کاردکس گاز"
                        >
                          <Edit3 className="w-3 h-3 text-emerald-400" />
                        </button>

                        {/* Move to Trash Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDeleteModal(item, e.shiftKey || e.altKey);
                          }}
                          className="w-5 h-5 p-0.5 text-rose-300 bg-rose-950/70 hover:bg-rose-900/90 border border-rose-800/80 rounded flex items-center justify-center transition-colors cursor-pointer shadow-2xs active:scale-95"
                          title="انتقال به سطل آشغال (قابل بازیابی)"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Table Footer: Totals and Final Balances */}
            {displayedEntries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-950 text-slate-200 font-bold border-t-2 border-slate-700 divide-x divide-slate-800 text-center">
                  <td colSpan={2} className="w-[50px] max-w-[54px] px-0.5 py-1 text-center" title="تراز کل و مانده نهایی گردش طرف حساب">
                    <span className="vertical-text-20 text-[9px] font-bold text-amber-400">تراز کل:</span>
                  </td>
                  <td className="px-1 py-2 font-mono text-blue-400 font-black text-xs sm:text-sm" title={`مجموع ورودی سیلندر: ${formatPersianNumber(stats.totalCylinderIn)}`}>{formatPersianNumber(stats.totalCylinderIn)}</td>
                  <td className="px-1 py-2 font-mono text-rose-400 font-black text-xs sm:text-sm" title={`مجموع خروجی سیلندر: ${formatPersianNumber(stats.totalCylinderOut)}`}>{formatPersianNumber(stats.totalCylinderOut)}</td>
                  <td className="px-1 py-2 font-mono text-rose-400 font-black text-xs sm:text-sm" title={`مجموع خروج ضایعات واقعی: ${formatPersianNumber(stats.totalScrapOut)}`}>{formatPersianNumber(stats.totalScrapOut)}</td>
                  <td className="px-1 py-2 font-mono text-amber-300 font-black text-xs sm:text-sm bg-amber-950/30" title={`مجموع خروج ضایعات سوری: ${formatPersianNumber(stats.totalScrapStockIn)}`}>{formatPersianNumber(stats.totalScrapStockIn)}</td>
                  <td className="px-1 py-2 font-mono text-emerald-300 bg-emerald-950/60 font-black text-sm sm:text-base border-x border-emerald-800/80" title={`مانده سیلندر: ${formatPersianNumber(stats.currentCylinders)}`}>{formatPersianNumber(stats.currentCylinders)}</td>
                  <td className="px-1 py-2 font-mono text-amber-300 bg-amber-950/60 font-black text-sm sm:text-base border-x border-amber-800/80" title={`مانده ضایعات: ${formatPersianNumber(stats.currentScrap)}`}>{formatPersianNumber(stats.currentScrap)}</td>

                  <td className="px-1 py-2 font-mono text-emerald-400 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalNewValveIn)}</td>
                  <td className="px-1 py-2 font-mono text-rose-400 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalNewValveOut)}</td>
                  <td className={`px-1 py-2 font-mono font-black text-sm sm:text-base border-x border-emerald-800/80 ${stats.currentNewValves < 0 ? 'text-rose-300 bg-rose-950/70' : 'text-emerald-300 bg-emerald-950/60'}`} dir="ltr" title={stats.currentNewValves < 0 ? 'مانده شیر نو: تراز منفی (کسر از موجودی خود ام‌گاز)' : undefined}>
                    {stats.currentNewValves < 0 && '⚠️ '}
                    {formatPersianNumber(stats.currentNewValves)}
                  </td>

                  <td className="px-1 py-2 font-mono text-slate-300 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalDispatched)}</td>

                  <td className="px-1 py-2 font-mono text-amber-400 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalUsedValveIn)}</td>
                  <td className="px-1 py-2 font-mono text-rose-400 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalUsedValveOut)}</td>
                  <td className={`px-1 py-2 font-mono font-black text-sm sm:text-base ${stats.currentUsedValves < 0 ? 'text-rose-300 bg-rose-950/70 border-x border-rose-800/80' : 'text-amber-300 bg-amber-950/60'}`} dir="ltr" title={stats.currentUsedValves < 0 ? 'مانده شیر کهنه: تراز منفی (کسر از موجودی خود ام‌گاز)' : undefined}>
                    {stats.currentUsedValves < 0 && '⚠️ '}
                    {formatPersianNumber(stats.currentUsedValves)}
                  </td>

                  <td className="px-1 py-2 font-mono text-rose-400 font-black text-xs sm:text-sm">{formatPersianNumber(stats.totalDefective)}</td>
                  <td className="sticky left-0 z-20 col-actions-vertical text-slate-400 font-bold bg-slate-950 border-r border-slate-700/90 shadow-[4px_0_12px_rgba(0,0,0,0.5)]" title="تکمیل">
                    <span className="vertical-text-20 text-[9px] text-slate-400 font-bold">تکمیل</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal: Create New Customer (طرف حساب / نمایندگی جدید) */}
      {showNewCustomerModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-100">
                  تعریف طرف حساب / نمایندگی جدید گاز
                </h3>
              </div>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نام طرف حساب / نمایندگی *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.name}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    placeholder="مثال: پارس ام گاز"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نام شرکت / برند تجاری
                  </label>
                  <input
                    type="text"
                    value={newCustomerForm.company_name}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, company_name: e.target.value })}
                    placeholder="شرکت توزیع گاز پارس"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    استان
                  </label>
                  <input
                    type="text"
                    value={newCustomerForm.province}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, province: e.target.value })}
                    placeholder="تهران / آذربایجان / کردستان ..."
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شهر / منطقه
                  </label>
                  <input
                    type="text"
                    value={newCustomerForm.city}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, city: e.target.value })}
                    placeholder="تهران"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شماره تلفن همراه *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.phone}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    placeholder="09123456789"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نوع طرف حساب
                  </label>
                  <select
                    value={newCustomerForm.customer_type}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, customer_type: e.target.value as any })}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-indigo-500"
                  >
                    <option value="عمده">عمده (توزیع‌کننده)</option>
                    <option value="سازمانی">سازمانی / صادراتی</option>
                    <option value="خرده">خرده‌فروشی</option>
                    <option value="پیمانکاری">پیمانکاری و خدمات</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  توضیحات و مشخصات کپسول‌ها
                </label>
                <textarea
                  rows={2}
                  value={newCustomerForm.notes}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, notes: e.target.value })}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>ثبت طرف حساب و فعال‌سازی کاردکس</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Current Customer (ویرایش اطلاعات طرف حساب جاری) */}
      {showEditCustomerModal && currentCustomer && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    ویرایش اطلاعات طرف حساب جاری
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    کد سیستمی: <span className="font-mono text-amber-400">{currentCustomer.customer_id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditCustomerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نام طرف حساب / نمایندگی *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCustomerForm.name}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                    placeholder="مثال: البرز گاز"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نام شرکت / برند تجاری
                  </label>
                  <input
                    type="text"
                    value={editCustomerForm.company_name}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, company_name: e.target.value })}
                    placeholder="شرکت توزیع گاز البرز"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    استان
                  </label>
                  <input
                    type="text"
                    value={editCustomerForm.province}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, province: e.target.value })}
                    placeholder="تهران / کرج / ..."
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شهر / منطقه
                  </label>
                  <input
                    type="text"
                    value={editCustomerForm.city}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, city: e.target.value })}
                    placeholder="تهران"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شماره تلفن تماس *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCustomerForm.phone}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, phone: e.target.value })}
                    placeholder="0912..."
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    نوع طرف حساب
                  </label>
                  <select
                    value={editCustomerForm.customer_type}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, customer_type: e.target.value as any })}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="عمده">عمده</option>
                    <option value="سازمانی">سازمانی / صادراتی</option>
                    <option value="خرده">خرده‌فروشی</option>
                    <option value="پیمانکاری">پیمانکاری و خدمات</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شناسه ملی / کد ملی
                  </label>
                  <input
                    type="text"
                    value={editCustomerForm.national_id}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, national_id: e.target.value })}
                    placeholder="کد ملی 10 رقمی"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    کد اقتصادی
                  </label>
                  <input
                    type="text"
                    value={editCustomerForm.economic_code}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, economic_code: e.target.value })}
                    placeholder="کد اقتصادی 12 رقمی"
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  یادداشت و توضیحات کاردکس
                </label>
                <textarea
                  rows={2}
                  value={editCustomerForm.notes}
                  onChange={e => setEditCustomerForm({ ...editCustomerForm, notes: e.target.value })}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditCustomerModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>ذخیره تغییرات طرف حساب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Kardex Entry */}
      {showAddEntryModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-[96vw] 2xl:max-w-[1550px] xl:max-w-[1450px] p-4 sm:p-5 shadow-2xl space-y-3 max-h-[94vh] overflow-y-auto text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flame className={`w-5 h-5 ${entryTab === 'in' ? 'text-emerald-400' : 'text-amber-500'}`} />
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                    <span>ثبت سطر در کاردکس گاز «{currentCustomer?.name}»</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-950/80 text-amber-300 border-amber-600/60 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-400" />
                      <span>{selectedCylinderType}</span>
                    </span>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                      entryTab === 'in'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
                        : 'bg-amber-950/80 text-amber-300 border-amber-700/80'
                    }`}>
                      {entryTab === 'in' ? 'سند ورودی (i)' : 'سند خروجی (e)'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {entryTab === 'in'
                      ? 'ثبت ورود کپسول گاز، شیرآلات دریافتی و افزایش مانده تحویلی به مشتری'
                      : 'ثبت خروج و توزیع کپسول گاز، حواله ارسالی، ضایعات و قطعات'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEntryModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* In-Modal Tab Switcher: Incoming (i) vs Outgoing (e) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/90 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => handleTabChange('in')}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  entryTab === 'in'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                <span>فرم ثبت ورودی (i)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-bold">i</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('out')}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  entryTab === 'out'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
                <span>فرم ثبت خروجی (e)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono font-bold">e</span>
              </button>
            </div>

            <form onSubmit={handleCreateEntry} className="space-y-4">
              {/* Active User Registrant Indicator */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-indigo-950/40 border border-indigo-700/50 rounded-xl text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400">کاربر ثبت‌کننده سند کاردکس:</span>
                  <span className="font-bold text-white">{currentUser.full_name}</span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-indigo-900/60 text-indigo-300 text-[10px] font-bold border border-indigo-700/60">
                  {currentUser.role_title || (currentUser.role === 'ADMIN' ? 'مدیریت ارشد' : 'مدیر داخلی')}
                </span>
              </div>

              {/* Row 1: Date and Automatically Generated Sheet Number */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/70">
                {/* Date Picker (5 cols) */}
                <div className="md:col-span-5">
                  <div className="flex items-center justify-between h-5 mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      تاریخ سند (شمسی) *
                    </label>
                  </div>
                  <PersianDatePicker
                    value={newEntry.date}
                    onChange={(val) => {
                      const autoCount = calculateDailyRequestCount(
                        allKardexEntries,
                        currentCustomer?.name || currentCustomer?.customer_id || '',
                        val
                      );
                      setDailyLoadingCount(autoCount);
                      const newSheet = generateSheetNumber(
                        currentCustomer?.name || 'البرز گاز',
                        val,
                        entryTab === 'in' ? 'i' : 'e',
                        autoCount
                      );
                      setNewEntry(prev => ({
                        ...prev,
                        date: val,
                        transfer_sheet_number: newSheet
                      }));
                    }}
                    required
                    placeholder={getPersianDate()}
                  />
                </div>

                {/* Sheet Number Input with Auto-Calculated Loading Sequence (7 cols) - Read Only */}
                <div className="md:col-span-7">
                  <div className="flex items-center justify-between h-5 mb-1.5 gap-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Hash className={`w-3.5 h-3.5 shrink-0 ${
                        (Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0
                          ? 'text-rose-400'
                          : entryTab === 'in'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }`} />
                      <span>شماره برگه انتقال (تولید خودکار سیستمی) *</span>
                      {(Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-500/70 text-rose-300 font-bold">
                          تداخل ورود و خروج
                        </span>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                          entryTab === 'in'
                            ? 'bg-emerald-950/80 border-emerald-700/70 text-emerald-300'
                            : 'bg-amber-950/80 border-amber-700/70 text-amber-300'
                        }`}>
                          {entryTab === 'in' ? 'شماره ورود (i)' : 'شماره خروج (e)'}
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRegenerateSheetNumber()}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 transition-colors cursor-pointer"
                        title="محاسبه مجدد بر اساس تاریخ و نوبت بارگیری"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>بازتولید</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopySheetNumber}
                        className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors cursor-pointer"
                        title="کپی در حافظه"
                      >
                        {copiedSheet ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedSheet ? 'کپی شد' : 'کپی'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      dir="ltr"
                      readOnly
                      tabIndex={-1}
                      value={newEntry.transfer_sheet_number}
                      placeholder={generateSheetNumber(currentCustomer?.name || 'البرز گاز', newEntry.date || getPersianDate(), entryTab === 'in' ? 'i' : 'e', dailyLoadingCount)}
                      className={`w-full h-[38px] text-xs font-mono font-bold tracking-wider rounded-xl pr-3 pl-9 bg-slate-900/90 border cursor-not-allowed select-all focus:outline-hidden ${
                        (Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0
                          ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/60'
                          : entryTab === 'in'
                            ? 'border-emerald-500/50 text-emerald-300'
                            : 'border-amber-500/50 text-amber-300'
                      }`}
                      title="این شماره به‌صورت سیستمی بر اساس ورود یا خروج سیلندر تولید می‌شود."
                    />
                    <div className="absolute left-3 text-slate-500 pointer-events-none" title="قفل‌شده">
                      <Lock className="w-3.5 h-3.5 text-slate-400/70" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  شرح رویداد / اقلام بار *
                </label>
                <select
                  value={newEntry.description}
                  onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
                  required
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer font-medium"
                >
                  <option value="" disabled>
                    -- انتخاب شرح از لیست اقلام تعریف‌شده --
                  </option>
                  {newEntry.description && !customItemNames.includes(newEntry.description) && (
                    <option value={newEntry.description}>
                      {newEntry.description} (مقدار فعلی)
                    </option>
                  )}
                  {customItemTypes.map(it => (
                    <option key={it.id} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unified 15-Column Kardex Strip Layout: فیلدهای ورودی در یک ردیف جدول مطابق نمای کاردکس */}
              <div className="space-y-2">
                {/* Header Strip with Previous Balances */}
                <div className="flex items-center justify-between p-2 bg-slate-950/90 rounded-xl border border-slate-800 flex-wrap gap-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-lg font-bold flex items-center gap-1.5 ${
                      entryTab === 'in'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                        : 'bg-amber-950/80 text-amber-300 border border-amber-700/80'
                    }`}>
                      {entryTab === 'in' ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{entryTab === 'in' ? 'سند ورودی (i)' : 'سند خروجی (e)'}</span>
                    </span>
                    <span className="text-[10.5px] text-slate-400 hidden sm:inline">
                      (تمامی ۱۵ ستون کاردکس به‌صورت مستقیم در یک ردیف افقی بدون نیاز به اسکرول)
                    </span>
                  </div>

                  {/* Previous Balances Pills for Active Cylinder */}
                  {(() => {
                    const activeType = normalizeCylinderType(newEntry.cylinder_type || selectedCylinderType);
                    const activeStock = cylinderStocksMap[activeType] || (currentCustomer ? getCylinderDetailedStock(currentEnv, currentCustomer.customer_id, activeType, allKardexEntries) : null);
                    const prevCyl = activeStock ? activeStock.customerCylinderBalance : (stats.currentCylinders || 0);
                    const prevScrap = activeStock ? activeStock.customerScrapBalance : (stats.currentScrap || 0);
                    const prevNewValves = activeStock ? activeStock.customerNewValveBalance : (stats.currentNewValves || 0);
                    const prevUsedValves = activeStock ? activeStock.customerUsedValveBalance : (stats.currentUsedValves || 0);

                    return (
                      <div className="flex items-center gap-1.5 font-mono text-[10.5px] flex-wrap">
                        <span className="text-slate-400 font-sans text-[10px]">مانده‌های قبل ({activeType}):</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800 font-bold" title="مانده کپسول سالم سطر قبل این نوع سیلندر">
                          کپسول: {formatPersianNumber(prevCyl)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800 font-bold" title="مانده ضایعات سطر قبل این نوع سیلندر">
                          ضایعات: {formatPersianNumber(prevScrap)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border font-bold ${
                          prevNewValves < 0
                            ? 'bg-rose-950/80 text-rose-300 border-rose-600'
                            : 'bg-teal-950/70 text-teal-300 border-teal-800'
                        }`} title="مانده شیر نو سطر قبل این مشتری">
                          شیر نو: {formatPersianNumber(prevNewValves)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded border font-bold bg-cyan-950/70 text-cyan-300 border-cyan-800" title="مانده شیر کهنه سطر قبل (حداقل ۰)">
                          شیر کهنه: {formatPersianNumber(Math.max(0, prevUsedValves))}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* 15-Column Table Strip (نمای فشرده و کاردکس بدون اسکرول) */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-xl overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-center">
                    <thead>
                      {/* Level 1: Category Groups matching Kardex */}
                      <tr className="text-[9.5px] font-bold border-b border-slate-700">
                        <th colSpan={6} className="py-1 px-1 bg-blue-950/40 text-blue-300 border-x border-slate-700">
                          <div className="flex items-center justify-center gap-1">
                            <Flame className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="truncate">کپسول و ضایعات (خانواده سیلندر - ۶ ستون)</span>
                          </div>
                        </th>
                        <th colSpan={3} className="py-1 px-1 bg-teal-950/40 text-teal-300 border-x border-slate-700">
                          <div className="flex items-center justify-center gap-1">
                            <Layers className="w-3 h-3 text-teal-400 shrink-0" />
                            <span className="truncate">شیر نو (۳ ستون)</span>
                          </div>
                        </th>
                        <th colSpan={1} className="py-1 px-0.5 bg-slate-900 text-sky-300 border-x border-slate-700">
                          <div className="flex items-center justify-center gap-0.5">
                            <Truck className="w-3 h-3 text-sky-400 shrink-0" />
                            <span className="truncate">ارسالی</span>
                          </div>
                        </th>
                        <th colSpan={3} className="py-1 px-1 bg-cyan-950/40 text-cyan-300 border-x border-slate-700">
                          <div className="flex items-center justify-center gap-1">
                            <Layers className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">شیر کهنه (۳ ستون)</span>
                          </div>
                        </th>
                        <th colSpan={1} className="py-1 px-0.5 bg-rose-950/40 text-rose-300 border-x border-slate-700">
                          <div className="flex items-center justify-center gap-0.5">
                            <Trash2 className="w-3 h-3 text-rose-400 shrink-0" />
                            <span className="truncate">معیوب</span>
                          </div>
                        </th>
                      </tr>

                      {/* Level 2: Exact Column Headers matching Kardex Table (Total 100% width) */}
                      <tr className="text-[9.5px] font-bold border-b border-slate-800 bg-slate-900/80 leading-tight">
                        {/* 1. ورودی سیلندر */}
                        <th className={`py-1 px-0.5 border-x border-slate-800 w-[7%] ${entryTab === 'in' ? 'text-emerald-300 bg-emerald-950/40 font-black' : 'text-blue-300'}`} title="تعداد سیلندرهای ورودی">
                          ورودی سیلندر
                        </th>
                        {/* 2. خروجی سیلندر */}
                        <th className={`py-1 px-0.5 border-x border-slate-800 w-[7%] ${entryTab === 'out' ? 'text-rose-200 bg-rose-950/40 font-black' : 'text-rose-300'}`} title="تعداد سیلندرهای خروجی">
                          خروجی سیلندر
                        </th>
                        {/* 3. خروج ضایعات واقعی */}
                        <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6%] text-[7.5px] sm:text-[8px] font-bold leading-tight" title="خروج واقعی ضایعات">
                          <span>خروج ضایعات</span><br /><span>واقعی</span>
                        </th>
                        {/* 4. خروج ضایعات سوری */}
                        <th className="py-1 px-0.5 text-amber-300 border-x border-slate-800 w-[6%] text-[7.5px] sm:text-[8px] font-bold leading-tight" title="خروج ضایعات سوری (کاهش سالم)">
                          <span>خروج ضایعات</span><br /><span>سوری</span>
                        </th>
                        {/* 5. مانده سیلندر */}
                        <th className="py-1 px-0.5 text-emerald-300 bg-emerald-950/50 border-x border-emerald-800/80 w-[7.5%] font-black" title="محاسبه خودکار زنده مانده سیلندر">
                          مانده سیلندر
                        </th>
                        {/* 6. مانده ضایعات */}
                        <th className="py-1 px-0.5 text-amber-300 bg-amber-950/50 border-x border-amber-800/80 w-[7.5%] font-black" title="محاسبه خودکار زنده مانده ضایعات">
                          مانده ضایعات
                        </th>

                        {/* 8. ورود شیر نو */}
                        <th className={`py-1 px-0.5 border-x border-slate-800 w-[6.5%] ${entryTab === 'in' ? 'text-emerald-300 bg-emerald-950/30' : 'text-teal-300'}`} title="ورود شیر نو (هر عددی مجاز است)">
                          ورود شیر نو
                        </th>
                        {/* 9. خروج شیر نو */}
                        <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6.5%]" title="خروج شیر نو (= خروج سیلندر)">
                          خروج شیر نو
                        </th>
                        {/* 10. مانده شیر نو */}
                        <th className={`py-1 px-0.5 border-x w-[7.5%] font-black ${
                          newEntry.new_valve_balance < 0
                            ? 'text-rose-200 bg-rose-950/80 border-rose-500'
                            : 'text-teal-300 bg-teal-950/50 border-teal-800'
                        }`} title="مانده سطر قبل + ورودی - خروجی">
                          مانده شیر نو
                        </th>

                        {/* 11. ستون ارسالی */}
                        <th className="py-1 px-0.5 text-sky-300 border-x border-slate-800 w-[9%]" title="ستون ارسالی فقط متنی فاقد عدد">
                          ارسالی (متن)
                        </th>

                        {/* 12. ورود شیر کهنه */}
                        <th className="py-1 px-0.5 text-cyan-300 border-x border-slate-800 w-[6.5%]" title="ورود شیر کهنه (= ورودی سیلندر، قابل تغییر)">
                          ورود شیر کهنه
                        </th>
                        {/* 13. خروج شیر کهنه */}
                        <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6.5%]" title="خروج شیر کهنه (= خروج سیلندر، قابل تغییر)">
                          خروج شیر کهنه
                        </th>
                        {/* 14. مانده شیر کهنه */}
                        <th className={`py-1 px-0.5 border-x w-[7.5%] font-black ${
                          newEntry.used_valve_balance < 0
                            ? 'text-rose-200 bg-rose-950/80 border-rose-500'
                            : 'text-cyan-300 bg-cyan-950/50 border-cyan-800'
                        }`} title="مانده سطر قبل + ورودی - خروجی">
                          مانده کهنه
                        </th>

                        {/* 15. معیوب */}
                        <th className="py-1 px-0.5 text-amber-300 border-x border-slate-800 w-[4.5%]" title="تعداد اقلام معیوب و داغی">
                          معیوب
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {/* Input Controls Row: تمام فیلدها کنار هم بدون اسکرول */}
                      <tr className="bg-slate-900/30">
                        {/* 1. ورودی سیلندر */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={newEntry.cylinder_in ?? 0}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('cylinder_in', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              (Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0
                                ? 'bg-rose-950/60 border border-rose-500 ring-2 ring-rose-500/70 text-rose-100'
                                : entryTab === 'in'
                                  ? 'bg-slate-900 border border-emerald-500/80 ring-1 ring-emerald-500/50 text-blue-100 focus:border-emerald-400'
                                  : 'bg-slate-900 border border-blue-600/70 text-blue-100 focus:border-blue-400'
                            }`}
                          />
                        </td>

                        {/* 2. خروجی سیلندر */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={newEntry.cylinder_out ?? 0}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('cylinder_out', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              (Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0
                                ? 'bg-rose-950/60 border border-rose-500 ring-2 ring-rose-500/70 text-rose-100'
                                : entryTab === 'out'
                                  ? 'bg-slate-900 border border-rose-500 ring-1 ring-rose-500/50 text-rose-100 focus:border-rose-400'
                                  : 'bg-slate-900 border border-rose-600/60 text-rose-100 focus:border-rose-400'
                            }`}
                          />
                        </td>

                        {/* 3. ضایعات واقعی */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={newEntry.scrap_out ?? 0}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('scrap_out', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-slate-700 rounded px-0.5 py-0.5 h-7 leading-none text-slate-100 placeholder-slate-600 focus:outline-hidden focus:border-rose-400"
                          />
                        </td>

                        {/* 4. ضایعات سوری */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={newEntry.scrap_stock_in ?? 0}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('scrap_stock_in', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-amber-600/60 rounded px-0.5 py-0.5 h-7 leading-none text-amber-100 placeholder-slate-600 focus:outline-hidden focus:border-amber-400"
                          />
                        </td>

                        {/* 5. مانده سیلندر (محاسبه خودکار زنده) */}
                        <td className="p-0.5 border-x border-emerald-800/80 bg-emerald-950/30">
                          <input
                            type="number"
                            readOnly
                            value={newEntry.cylinder_balance ?? 0}
                            className="w-full text-center text-[11px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/70 rounded px-0.5 py-0.5 h-7 leading-none text-emerald-200 cursor-not-allowed select-all"
                            title="فرمول: مانده سطر قبل + ورودی سیلندر – خروج سیلندر – خروج ضایعات سوری"
                          />
                        </td>

                        {/* 6. مانده ضایعات (محاسبه خودکار زنده) */}
                        <td className="p-0.5 border-x border-amber-800/80 bg-amber-950/30">
                          <input
                            type="number"
                            readOnly
                            value={Math.max(0, newEntry.scrap_balance ?? 0)}
                            className="w-full text-center text-[11px] font-mono font-bold bg-amber-950/60 border border-amber-500/70 rounded px-0.5 py-0.5 h-7 leading-none text-amber-200 cursor-not-allowed select-all"
                            title="فرمول: مانده ضایعات سطر قبل + خروج ضایعات سوری – خروج واقعی ضایعات"
                          />
                        </td>

                        {/* 8. ورود شیر نو */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.new_valve_in ?? 0)}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('new_valve_in', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : 'ورود شیر نو'}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                                : 'bg-slate-900 border border-teal-600/70 text-teal-100 focus:border-teal-400'
                            }`}
                          />
                        </td>

                        {/* 9. خروج شیر نو */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.new_valve_out ?? 0)}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('new_valve_out', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : 'خروج شیر نو (= خروج سیلندر)'}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                                : 'bg-slate-900 border border-rose-600/60 text-rose-100 focus:border-rose-400'
                            }`}
                          />
                        </td>

                        {/* 10. مانده شیر نو (محاسبه زنده - پذیرش منفی) */}
                        <td className={`p-0.5 border-x ${
                          isTankType(newEntry.cylinder_type || selectedCylinderType)
                            ? 'border-slate-800'
                            : (newEntry.new_valve_balance < 0 ? 'bg-rose-950/50 border-rose-600' : 'bg-teal-950/30 border-teal-800')
                        }`}>
                          <input
                            type="number"
                            readOnly
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.new_valve_balance ?? 0)}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none cursor-not-allowed select-all border ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border-slate-800'
                                : newEntry.new_valve_balance < 0
                                  ? 'bg-rose-950/90 border-rose-500 text-rose-200 ring-1 ring-rose-500'
                                  : 'bg-teal-950/60 border-teal-500/70 text-teal-200'
                            }`}
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : `مانده قبل (${stats.currentNewValves || 0}) + ورودی (${newEntry.new_valve_in || 0}) - خروجی (${newEntry.new_valve_out || 0}) = ${newEntry.new_valve_balance || 0}`}
                          />
                        </td>

                        {/* 11. ستون ارسالی و شماره بارنامه */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="text"
                            value={newEntry.dispatched ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setNewEntry(prev => ({
                                ...prev,
                                dispatched: val,
                                waybill_number: val
                              }));
                            }}
                            placeholder="شماره بارنامه/ارسالی"
                            className="w-full text-center text-[10px] bg-slate-900 border border-blue-700/60 rounded px-0.5 py-0.5 h-7 leading-none text-blue-100 placeholder-slate-600 placeholder:text-[9px] focus:outline-hidden focus:border-blue-400 truncate"
                            title="شماره بارنامه یا مشخصات ارسالی"
                          />
                        </td>

                        {/* 12. ورود شیر کهنه */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.used_valve_in ?? 0)}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('used_valve_in', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : 'ورود شیر کهنه'}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                                : 'bg-slate-900 border border-cyan-600/70 text-cyan-100 focus:border-cyan-400'
                            }`}
                          />
                        </td>

                        {/* 13. خروج شیر کهنه */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.used_valve_out ?? 0)}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('used_valve_out', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : 'خروج شیر کهنه (سلول مستقل و بدون وابستگی)'}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                                : 'bg-slate-900 border border-rose-600/60 text-rose-100 focus:border-rose-400'
                            }`}
                          />
                        </td>

                        {/* 14. مانده شیر کهنه (حداقل صفر) */}
                        <td className={`p-0.5 border-x ${isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'border-slate-800' : 'bg-cyan-950/30 border-cyan-800'}`}>
                          <input
                            type="number"
                            readOnly
                            disabled={isTankType(newEntry.cylinder_type || selectedCylinderType)}
                            value={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 0 : (newEntry.used_valve_balance ?? 0)}
                            className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none cursor-not-allowed select-all border ${
                              isTankType(newEntry.cylinder_type || selectedCylinderType)
                                ? 'bg-slate-900/50 text-slate-500 border-slate-800'
                                : 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200'
                            }`}
                            title={isTankType(newEntry.cylinder_type || selectedCylinderType) ? 'مخازن گاز نیازی به شیر ندارند' : `مانده سطر قبل (${stats.currentUsedValves || 0}) + ورودی (${newEntry.used_valve_in || 0})${newEntry.used_valve_out ? ` - خروجی (${newEntry.used_valve_out})` : ''} = حداقل صفر (${newEntry.used_valve_balance || 0})`}
                          />
                        </td>

                        {/* 15. معیوب */}
                        <td className="p-0.5 border-x border-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={newEntry.defective ?? 0}
                            onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                            onChange={e => updateNewEntryField('defective', e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0"
                            className="w-full text-center text-[11px] font-mono bg-slate-900 border border-slate-700 rounded px-0.5 py-0.5 h-7 leading-none text-slate-100 placeholder-slate-600 focus:outline-hidden focus:border-amber-400 font-bold"
                          />
                        </td>
                      </tr>

                      {/* Sub-hints Row: راهنمای فشرده فیلدها */}
                      <tr className="text-[8.5px] text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800/60 font-medium leading-tight">
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">
                          {entryTab === 'in' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">ورودی</span> : 'افزایش'}
                        </td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">
                          {entryTab === 'out' ? <span className="text-rose-600 dark:text-rose-400 font-bold">خروجی</span> : 'کاهش'}
                        </td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">قطعی</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">کاهش سالم</td>
                        <td className="py-0.5 px-0.5 border-x border-emerald-300 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold truncate">خودکار</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">ذخیره</td>
                        <td className="py-0.5 px-0.5 border-x border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 font-bold truncate">خودکار</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">هر عدد</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">= خروج</td>
                        <td className={`py-0.5 px-0.5 border-x font-bold truncate ${newEntry.new_valve_balance < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'}`}>
                          {newEntry.new_valve_balance < 0 ? '⚠️ ام‌گاز' : 'خودکار'}
                        </td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 text-sky-600 dark:text-sky-400 truncate">فقط متن</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate" title="ورودی شیر کهنه همیشه برابر ورودی سیلندر است و قابل ویرایش">= ورود</td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate" title="خروج شیر کهنه سلول مستقل است و وابسته به خروج سیلندر نیست">مستقل</td>
                        <td className="py-0.5 px-0.5 border-x font-bold truncate text-cyan-700 dark:text-cyan-300" title="مانده شیر کهنه = مانده قبل + ورودی">
                          مانده قبل + ورود
                        </td>
                        <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">داغی</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Simultaneous Entry + Exit Conflict Warning Banner */}
                {(Number(newEntry.cylinder_in) || 0) > 0 && (Number(newEntry.cylinder_out) || 0) > 0 && (
                  <div className="p-2.5 bg-rose-950/85 border-2 border-rose-500 rounded-xl flex items-start gap-2.5 text-rose-100 text-xs shadow-lg">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-rose-100 block text-[11.5px]">
                        هشدار: امکان پر کردن همزمان دو کاردکس وجود ندارد
                      </strong>
                      <span className="text-[10.5px] text-rose-200 leading-relaxed block mt-0.5">
                        فیلدهای «ورودی سیلندر» و «خروجی سیلندر» هم‌زمان دارای عدد هستند. لطفاً برای ثبت ورود فقط فیلد ورودی و برای ثبت خروج فقط فیلد خروجی را پر کرده و فیلد دیگر را صفر (۰) کنید.
                      </span>
                    </div>
                  </div>
                )}

                {/* Negative Warning Banner if new valve balance is negative */}
                {!isTankType(newEntry.cylinder_type || selectedCylinderType) && newEntry.new_valve_balance < 0 && (
                  <div className="p-2 bg-rose-950/60 border border-rose-500/70 rounded-xl flex items-start gap-2 text-rose-200 text-xs animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-rose-100 block text-[11px]">
                        هشدار کسر از موجودی خود ام‌گاز:
                      </strong>
                      <span className="text-[10px] text-rose-300 leading-relaxed block">
                        مانده شیر نو منفی شده است ({newEntry.new_valve_balance} عدد). این مقدار از موجودی خود ام‌گاز کسر خواهد شد.
                      </span>
                    </div>
                  </div>
                )}

                {/* Summary Strip (خلاصه تراز سطر ثبتی کاردکس) */}
                <div className="p-2 bg-slate-950/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
                  <span className="text-slate-300 flex items-center gap-1.5 font-bold text-[11px]">
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${entryTab === 'in' ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <span>خلاصه تراز سطر کاردکس:</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono font-bold text-slate-200 flex-wrap text-[11px]">
                    <span className="text-blue-300">
                      ورودی: {formatPersianNumber(newEntry.cylinder_in || 0)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-rose-300">
                      خروجی: {formatPersianNumber(newEntry.cylinder_out || 0)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800">
                      مانده کپسول: {formatPersianNumber(newEntry.cylinder_balance || 0)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-amber-300 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800">
                      مانده ضایعات: {formatPersianNumber(Math.max(0, newEntry.scrap_balance || 0))}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className={`px-1.5 py-0.5 rounded border ${newEntry.new_valve_balance < 0 ? 'text-rose-300 bg-rose-950/80 border-rose-500' : 'text-teal-300 bg-teal-950/70 border-teal-800'}`}>
                      مانده شیر نو: {formatPersianNumber(newEntry.new_valve_balance || 0)}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="px-1.5 py-0.5 rounded border text-cyan-300 bg-cyan-950/70 border-cyan-800">
                      مانده شیر کهنه: {formatPersianNumber(newEntry.used_valve_balance || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800 flex-wrap">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="font-medium">شماره برگه نهایی:</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                    entryTab === 'in'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}>
                    {newEntry.transfer_sheet_number || generateSheetNumber(currentCustomer?.name || 'البرز گاز', newEntry.date || getPersianDate(), entryTab === 'in' ? 'i' : 'e')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddEntryModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    onClick={(e) => {
                      e.preventDefault();
                      handleCreateEntry(undefined, false);
                    }}
                    className={`px-5 py-2 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                      entryTab === 'in'
                        ? 'text-emerald-950 bg-emerald-400 hover:bg-emerald-300'
                        : 'text-amber-950 bg-amber-400 hover:bg-amber-300'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ثبت سند {entryTab === 'in' ? 'ورودی (i)' : 'خروجی (e)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateEntry(undefined, true)}
                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-indigo-200" />
                    <span>ثبت و پرینت</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Official Print & Print Preview (چاپ کارتکس جاری) */}
      {showPrintModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 no-print">
              <div className="flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  پیش‌نمایش چاپ رسمی کاردکس گاز «{currentCustomer?.name}»
                </h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportKardexPdf}
                  disabled={isExportingPdf}
                  className="px-3.5 py-1.5 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  title="دانلود مستقیم سند کاردکس به صورت فایل PDF"
                >
                  <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'در حال تولید PDF...' : 'دانلود فایل PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  title="ارسال مستقیم به پرینتر یا ذخیره PDF مرورگر"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ رسمی (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* The Printable Paper Sheet */}
            <div
              id="printable-gas-kardex"
              className="bg-white text-slate-950 rounded-xl p-6 border border-slate-300 overflow-y-auto flex-1 text-right text-sm font-bold"
            >
              {/* Official Header */}
              <div className="border-b-2 border-slate-900 pb-3 mb-4">
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-2">
                    <MGasOfficialLogo />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg sm:text-xl font-black text-slate-950">
                      سامانه جامع انبار و توزیع گاز مایع ام گاز
                    </h2>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">
                      کارتکس تخصصی گردش سیلندر، کپسول و شیرآلات گاز
                    </h3>
                  </div>
                  <div className="text-left text-xs font-extrabold text-slate-900 space-y-0.5">
                    <div>تاریخ چاپ: <strong className="font-black text-slate-950">{toEnglishDigits(new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))}</strong></div>
                    <div className="print:hidden">کاربر متصدی در سیستم: {currentUser.full_name}</div>
                    <div>کد طرف حساب: <strong className="font-black text-slate-950">{toEnglishDigits(currentCustomer?.customer_id)}</strong></div>
                  </div>
                </div>

                {/* Customer Details Box */}
                <div className="mt-4 bg-slate-100 p-3 rounded-lg border border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm font-extrabold">
                  <div>
                    <span className="text-slate-700 font-bold">طرف حساب: </span>
                    <strong className="text-slate-950 font-black">{currentCustomer?.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-700 font-bold">شرکت/برند: </span>
                    <strong className="text-slate-950 font-black">{currentCustomer?.company_name || '-'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-700 font-bold">استان و شهر: </span>
                    <strong className="text-slate-950 font-black">{currentCustomer?.province} - {currentCustomer?.city}</strong>
                  </div>
                  <div>
                    <span className="text-slate-700 font-bold">تلفن: </span>
                    <strong className="text-slate-950 font-black">{toEnglishDigits(currentCustomer?.phone)}</strong>
                  </div>
                </div>
              </div>

              {/* Printable Table */}
              <div className="overflow-x-auto w-full">
                <table className="w-full text-right text-[12px] font-extrabold border border-slate-400 border-collapse kardex-table kardex-print-table table-fixed">
                  <colgroup>
                    <col style={{ width: '2.8%' }} />
                    <col style={{ width: '6.6%' }} />
                    <col style={{ width: '14.5%' }} />
                    <col style={{ width: '6.4%' }} />
                    <col style={{ width: '4.8%' }} />
                    <col style={{ width: '4.8%' }} />
                    <col style={{ width: '4.8%' }} />
                    <col style={{ width: '4.8%' }} />
                    <col style={{ width: '5.6%' }} />
                    <col style={{ width: '5.2%' }} />
                    <col style={{ width: '4.6%' }} />
                    <col style={{ width: '4.6%' }} />
                    <col style={{ width: '5.2%' }} />
                    <col style={{ width: '6.7%' }} />
                    <col style={{ width: '4.6%' }} />
                    <col style={{ width: '4.6%' }} />
                    <col style={{ width: '5.0%' }} />
                    <col style={{ width: '4.4%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-200 border-b border-slate-400 text-center font-black text-[11px] sm:text-[11.5px] leading-snug text-slate-950">
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">ردیف</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">تاریخ</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle text-center font-black">شرح عملیات</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">شماره<br/>برگه</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">ورودی<br/>سیلندر</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">خروجی<br/>سیلندر</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">ضایعات<br/>واقعی</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle bg-amber-50 text-amber-950 font-black">ضایعات<br/>سوری</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle bg-slate-100 text-slate-950 font-black">مانده<br/>سیلندر</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle bg-amber-100 text-amber-950 font-black">مانده<br/>ضایعات</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">شیر نو<br/>(+)</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">شیر نو<br/>(-)</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle bg-slate-100 text-slate-950 font-black">مانده<br/>نو</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">ارسالی /<br/>بارنامه</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">داغی<br/>(+)</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">داغی<br/>(-)</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle bg-amber-100 text-amber-950 font-black">مانده<br/>داغی</th>
                      <th className="border border-slate-400 px-1 py-1.5 align-middle font-black">معیوب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(displayedEntries.length > 0 ? displayedEntries : customerEntries).map((row, idx) => {
                      const overviewDesc = summarizeKardexDescription(row.description, row, row.cylinder_type || selectedCylinderType, customItemNames);
                      const fullDesc = `${overviewDesc}${(row.forklift_valve_type || row.valve_subtype) ? ` [${row.forklift_valve_type || row.valve_subtype}]` : ''}`;
                      const wrappedDesc = wrapTextAfterWords(fullDesc, 4);
                      const dispVal = resolveKardexDispatchedOrWaybill(row);

                      return (
                        <tr key={row.entry_id || idx} className="text-center divide-x divide-slate-300 text-[11.5px] sm:text-[12px] font-extrabold text-slate-950 leading-normal">
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-black">{toEnglishDigits(idx + 1)}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{toEnglishDigits(row.date)}</td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-center font-extrabold whitespace-pre-line break-words leading-snug align-middle">{wrappedDesc}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-black">{toEnglishDigits(row.transfer_sheet_number) || '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.cylinder_in > 0 ? toEnglishDigits(formatNumberEn(row.cylinder_in)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.cylinder_out > 0 ? toEnglishDigits(formatNumberEn(row.cylinder_out)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.scrap_out > 0 ? toEnglishDigits(formatNumberEn(row.scrap_out)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle bg-amber-50/50 text-amber-950 font-black">{(row.scrap_stock_in || 0) > 0 ? toEnglishDigits(formatNumberEn(row.scrap_stock_in)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle bg-slate-50 text-slate-950 font-black">{toEnglishDigits(formatNumberEn(row.cylinder_balance))}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle bg-amber-50 text-amber-950 font-black">{toEnglishDigits(formatNumberEn(Math.max(0, row.scrap_balance || 0)))}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.new_valve_in > 0 ? toEnglishDigits(formatNumberEn(row.new_valve_in)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.new_valve_out > 0 ? toEnglishDigits(formatNumberEn(row.new_valve_out)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle bg-slate-50 text-slate-950 font-black">{toEnglishDigits(formatNumberEn(row.new_valve_balance))}</td>
                          <td className="border border-slate-300 px-1 py-1.5 font-black whitespace-normal break-words leading-snug text-center align-middle">{dispVal ? toEnglishDigits(dispVal) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.used_valve_in > 0 ? toEnglishDigits(formatNumberEn(row.used_valve_in)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.used_valve_out > 0 ? toEnglishDigits(formatNumberEn(row.used_valve_out)) : '-'}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle bg-amber-50 text-amber-950 font-black">{toEnglishDigits(formatNumberEn(row.used_valve_balance))}</td>
                          <td className="border border-slate-300 px-1 py-1.5 align-middle font-extrabold">{row.defective > 0 ? toEnglishDigits(formatNumberEn(row.defective)) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-200 font-black border-t-2 border-slate-500 text-center text-[12px] sm:text-[12.5px] leading-normal text-slate-950">
                      <td colSpan={4} className="border border-slate-400 px-2.5 py-1.5 align-middle text-right font-black leading-normal">تراز نهایی:</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalCylinderIn))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalCylinderOut))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalScrapOut))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle bg-amber-100 text-amber-950 font-black">{toEnglishDigits(formatNumberEn(stats.totalScrapStockIn))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black bg-slate-200 text-slate-950">{toEnglishDigits(formatNumberEn(stats.currentCylinders))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black bg-amber-100 text-amber-950">{toEnglishDigits(formatNumberEn(stats.currentScrap))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalNewValveIn))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalNewValveOut))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black bg-slate-200 text-slate-950">{toEnglishDigits(formatNumberEn(stats.currentNewValves))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalDispatched))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalUsedValveIn))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalUsedValveOut))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black bg-amber-100 text-amber-950">{toEnglishDigits(formatNumberEn(stats.currentUsedValves))}</td>
                      <td className="border border-slate-400 px-1 py-1.5 align-middle font-black">{toEnglishDigits(formatNumberEn(stats.totalDefective))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures Footer */}
              <div className="kardex-signatures-block mt-6 pt-3 border-t border-slate-300 grid grid-cols-3 text-center text-sm font-extrabold text-slate-950">
                <div>
                  <p className="font-black">تحویل‌دهنده (انباردار گاز)</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">نام، امضا و اثر انگشت</p>
                  <div className="h-8 mt-1"></div>
                </div>
                <div>
                  <p className="font-black">تحویل‌گیرنده (نماینده / راننده)</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">نام، امضا و شماره تماس</p>
                  <div className="h-8 mt-1"></div>
                </div>
                <div>
                  <p className="font-black">تاییدیه حسابداری و مدیریت</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">مهر و امضای شرکت</p>
                  <div className="h-8 mt-1"></div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-800 no-print">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>در صفحه پرینت مرورگر، برای خروجی پی‌دی‌اف گزینه <strong>Save as PDF</strong> یا <strong>ذخیره به عنوان PDF</strong> را انتخاب نمایید.</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  بستن پنجره
                </button>
                <button
                  type="button"
                  onClick={handleExportKardexPdf}
                  disabled={isExportingPdf}
                  className="px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'در حال تولید PDF...' : 'دانلود مستقیم PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>ارسال به پرینتر (Print)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Import Excel File */}
      {showImportModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100">
                  ورود کاردکس از فایل اکسل (.xlsx)
                </h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              فایل اکسل پرشده مطابق الگوی <span className="font-bold text-amber-400">kardex_gas_blank.xlsx</span> را انتخاب کنید. ستون‌های 16 گانه به‌صورت خودکار خوانده شده و در کاردکس طرف حساب انتخابی درج و همگام‌سازی می‌شوند.
            </p>

            <form onSubmit={handleImportFile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  طرف حساب مقصد برای بارگذاری:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={e => handleSelectCustomer(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                >
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.name} - {c.province}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  نوع محصول و سیلندر کاردکس مقصد:
                </label>
                <select
                  value={selectedCylinderType}
                  onChange={e => setSelectedCylinderType(e.target.value as CylinderType)}
                  className="w-full text-xs font-semibold bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                >
                  {availableCylinderTypes.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Dropzone */}
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-6 text-center transition-colors bg-slate-950/40">
                <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <label className="cursor-pointer">
                  <span className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                    انتخاب فایل اکسل کاردکس
                  </span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setImportFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-1">فرمت‌های مجاز: .xlsx یا .xls</p>

                {importFile && (
                  <div className="mt-3 p-2 bg-emerald-950/50 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
                    <span>فایل انتخاب‌شده: <strong>{importFile.name}</strong></span>
                    <span className="text-[10px] text-slate-400">
                      ({Math.round(importFile.size / 1024)} KB)
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={!importFile || isImporting}
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isImporting ? 'در حال پردازش...' : 'شروع پردازش و ثبت'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Full 57 Names Explorer */}
      {showNamesListModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-slate-100 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-slate-100">
                  فهرست 57 طرف حساب و نمایندگی گاز مایع
                </h3>
              </div>
              <button
                onClick={() => setShowNamesListModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              برای هرکدام از طرف حساب‌های زیر، یک کاردکس اختصاصی در هر سه پایگاه داده (Cloudflare D1 و دو دیتابیس لوکال SQLite) ایجاد شده است. با کلیک بر روی دکمه «مشاهده کاردکس»، صفحه جاری به کاردکس همان طرف حساب تغییر می‌یابد.
            </p>

            <div className="overflow-y-auto flex-1 border border-slate-800 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5">ردیف</th>
                    <th className="px-3 py-2.5">نام طرف حساب / نمایندگی</th>
                    <th className="px-3 py-2.5 font-mono">کد شناسه</th>
                    <th className="px-3 py-2.5">حوزه / استان</th>
                    <th className="px-3 py-2.5 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {customers.map((c, idx) => {
                    const isCurrent = c.customer_id === selectedCustomerId;
                    return (
                      <tr
                        key={c.customer_id}
                        className={`transition-colors ${
                          isCurrent ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-slate-500" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                          {toEnglishDigits(idx + 1)}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-200">
                          {c.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">
                          {c.customer_id}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {c.province}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              handleSelectCustomer(c.customer_id);
                              setShowNamesListModal(false);
                            }}
                            className={`px-3 py-1 text-[11px] font-medium rounded-lg transition-colors border ${
                              isCurrent
                                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
                            }`}
                          >
                            {isCurrent ? 'کاردکس فعال' : 'مشاهده کاردکس'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowNamesListModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Kardex Entry (ویرایش سطر کاردکس - کاملاً منطبق بر ساختار و ظاهر فرم ورود/خروج) */}
      {showEditKardexModal && editingKardexEntry && (() => {
        const editIdx = customerEntries.findIndex(e => e.entry_id === editingKardexEntry.entry_id);
        const prevEntry = editIdx > 0 ? customerEntries[editIdx - 1] : null;
        const prevCyl = prevEntry ? (prevEntry.cylinder_balance || 0) : 0;
        const prevScrap = prevEntry ? Math.max(0, prevEntry.scrap_balance || 0) : 0;
        const prevNewValves = prevEntry ? (prevEntry.new_valve_balance || 0) : 0;
        const prevUsedValves = prevEntry ? Math.max(0, prevEntry.used_valve_balance || 0) : 0;
        const isEntryIn = (editKardexForm.cylinder_in > 0 && editKardexForm.cylinder_out === 0) || editKardexForm.transfer_sheet_number?.endsWith('i');

        return (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-slate-100 cursor-default"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>ویرایش سند سطر کاردکس:</span>
                      <span className="text-amber-400 font-extrabold">{currentCustomer?.name}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>طرف حساب: <strong className="text-slate-200">{currentCustomer?.name}</strong></span>
                      <span>•</span>
                      <span>شماره برگه: <strong className="font-mono text-amber-400">{editKardexForm.transfer_sheet_number || '-'}</strong></span>
                      <span>•</span>
                      <span>کاربر ثبت‌کننده در سیستم:</span>
                      <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                        @{editingKardexEntry.created_by_username || (SEED_USERS.find(u => u.user_id === editingKardexEntry.user_id)?.username) || 'amouei'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditKardexModal(false);
                    setEditingKardexEntry(null);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1-hour editing restriction disabled for all users */}

              {/* Tabs: Entry / Exit Switcher matching Add Modal */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (editKardexForm.cylinder_out > 0 && editKardexForm.cylinder_in === 0) {
                      updateEditFormField('cylinder_in', editKardexForm.cylinder_out);
                      updateEditFormField('cylinder_out', 0);
                    }
                    if (editKardexForm.transfer_sheet_number?.endsWith('e')) {
                      setEditKardexForm(p => ({
                        ...p,
                        transfer_sheet_number: p.transfer_sheet_number.slice(0, -1) + 'i'
                      }));
                    }
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isEntryIn
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                  <span>سند ورودی (i)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-bold">i</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (editKardexForm.cylinder_in > 0 && editKardexForm.cylinder_out === 0) {
                      updateEditFormField('cylinder_out', editKardexForm.cylinder_in);
                      updateEditFormField('cylinder_in', 0);
                    }
                    if (editKardexForm.transfer_sheet_number?.endsWith('i')) {
                      setEditKardexForm(p => ({
                        ...p,
                        transfer_sheet_number: p.transfer_sheet_number.slice(0, -1) + 'e'
                      }));
                    }
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    !isEntryIn
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  <span>سند خروجی (e)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono font-bold">e</span>
                </button>
              </div>

              <form onSubmit={handleSaveEditKardex} className="space-y-4">
                {/* Row 1: Date and Transfer Sheet Number */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/70">
                  {/* Date Picker (5 cols) */}
                  <div className="md:col-span-5">
                    <div className="flex items-center justify-between h-5 mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        تاریخ سند (شمسی) *
                      </label>
                    </div>
                    <PersianDatePicker
                      value={editKardexForm.date}
                      onChange={(d) => setEditKardexForm(prev => ({ ...prev, date: d }))}
                      required
                      placeholder={getPersianDate()}
                    />
                  </div>

                  {/* Transfer Sheet Number (7 cols) */}
                  <div className="md:col-span-7">
                    <div className="flex items-center justify-between h-5 mb-1.5">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Hash className={`w-3.5 h-3.5 shrink-0 ${isEntryIn ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span>شماره برگه حواله و انتقال *</span>
                      </label>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (editKardexForm.transfer_sheet_number) {
                              navigator.clipboard?.writeText(editKardexForm.transfer_sheet_number);
                              showToast('شماره برگه در حافظه کپی شد', 'success');
                            }
                          }}
                          className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors cursor-pointer"
                          title="کپی در حافظه"
                        >
                          <Copy className="w-2.5 h-2.5" />
                          <span>کپی</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        dir="ltr"
                        value={editKardexForm.transfer_sheet_number}
                        onChange={(e) => setEditKardexForm(prev => ({ ...prev, transfer_sheet_number: e.target.value }))}
                        className={`w-full h-[38px] text-xs font-mono font-bold tracking-wider rounded-xl px-3 bg-slate-900 border focus:outline-hidden ${
                          isEntryIn
                            ? 'border-emerald-500/60 text-emerald-300 focus:border-emerald-400'
                            : 'border-amber-500/60 text-amber-300 focus:border-amber-400'
                        }`}
                        title="شماره برگه انتقال سند"
                      />
                    </div>
                  </div>
                </div>

                {/* Cylinder Type Selection in Edit Modal */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>نوع محصول و سیلندر (کاردکس اختصاصی) *</span>
                    </label>
                    <span className="text-[11px] font-normal text-amber-400">
                      تغییر کاردکس اختصاصی این سطر
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {availableCylinderTypes.map((type) => {
                      const normType = normalizeCylinderType(type);
                      const isSelected = normalizeCylinderType(editKardexForm.cylinder_type || selectedCylinderType) === normType;
                      const cStock = cylinderStocksMap[normType];
                      const rel = cStock?.relationship || getCylinderRelationshipInfo(normType);
                      const cylBal = cStock ? cStock.customerCylinderBalance : 0;
                      const isTank = isTankType(normType);

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setEditKardexForm(prev => ({
                            ...prev,
                            cylinder_type: normType,
                            ...(isTank ? {
                              new_valve_in: 0,
                              new_valve_out: 0,
                              new_valve_balance: 0,
                              used_valve_in: 0,
                              used_valve_out: 0,
                              used_valve_balance: 0
                            } : {})
                          }))}
                          className={`p-2.5 rounded-lg text-right transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-500/20 text-amber-300 border-2 border-amber-500 shadow-xs'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold">{rel.displayName}</span>
                            <Flame className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                          </div>
                          <div className="mb-1.5">
                            {isTank ? (
                              <span className="inline-block text-[9.5px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                                بدون نیاز به شیر
                              </span>
                            ) : (
                              <span className="inline-block text-[9.5px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 font-medium truncate max-w-full">
                                شیر: {rel.matchingValveName}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            مانده {isTank ? 'مخزن' : 'کپسول'}: <strong className="text-emerald-400 font-mono">{formatPersianNumber(cylBal)}</strong>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Forklift Valve Type Submenu and Fields in Edit Modal (تعیین نوع دقیق شیر لیفتراکی) */}
                {normalizeCylinderType(editKardexForm.cylinder_type || selectedCylinderType) === 'سیلندر لیفتراکی' && (
                  <div className="bg-amber-950/40 border-2 border-amber-500/70 rounded-2xl p-4 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-600/40">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-amber-200">
                          تعیین نوع دقیق شیر لیفتراکی در سند ویرایشی:
                        </span>
                      </div>
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/40">
                        ۲ عدد شیر + ۲ عدد مهره
                      </span>
                    </div>

                    {/* Buttons for each Forklift Valve Type */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FORKLIFT_VALVE_TYPES.map((vType) => {
                        const isVSelected = (editKardexForm.forklift_valve_type || editKardexForm.valve_subtype || 'شیر بوتانی لیفتراکی') === vType;
                        const vStock = LocalStorageManager.getSpecificValveWarehouseStock(currentEnv, { valveName: vType });
                        return (
                          <button
                            key={vType}
                            type="button"
                            onClick={() => {
                              setEditKardexForm(prev => ({
                                ...prev,
                                forklift_valve_type: vType,
                                valve_subtype: vType
                              }));
                              showToast(`نوع شیر لیفتراکی تغییر یافت به: «${vType}»`, 'info');
                            }}
                            className={`p-2.5 rounded-xl text-right transition-all cursor-pointer border flex flex-col justify-between ${
                              isVSelected
                                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md ring-2 ring-amber-400/50'
                                : 'bg-slate-900 text-slate-200 hover:bg-slate-850 border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-black">{vType}</span>
                              {isVSelected && <Check className="w-3.5 h-3.5 text-slate-950" />}
                            </div>
                            <div className={`text-[10px] ${isVSelected ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                              موجودی انبار: <strong className="font-mono">{formatPersianNumber(vStock)}</strong> عدد
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-between text-[11px] text-amber-200 gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          نوع شیر انتخاب‌شده: <strong className="text-white font-bold">{editKardexForm.forklift_valve_type || editKardexForm.valve_subtype || 'شیر بوتانی لیفتراکی'}</strong>
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-300">
                        تغییر این گزینه سطر را به جریان دقیق شیر انتخابی منتقل خواهد کرد.
                      </span>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    شرح رویداد / اقلام بار *
                  </label>
                  <select
                    value={editKardexForm.description}
                    onChange={(e) => setEditKardexForm(prev => ({ ...prev, description: e.target.value }))}
                    required
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer font-medium"
                  >
                    <option value="" disabled>
                      -- انتخاب شرح از لیست اقلام تعریف‌شده --
                    </option>
                    {editKardexForm.description && !customItemNames.includes(editKardexForm.description) && (
                      <option value={editKardexForm.description}>
                        {editKardexForm.description} (مقدار فعلی سند)
                      </option>
                    )}
                    {customItemTypes.map(it => (
                      <option key={it.id} value={it.name}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unified 15-Column Kardex Strip Layout: کاملاً منطبق بر فرم ورود و خروج */}
                <div className="space-y-2">
                  {/* Header Strip with Previous Balances */}
                  <div className="flex items-center justify-between p-2 bg-slate-950/90 rounded-xl border border-slate-800 flex-wrap gap-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg font-bold flex items-center gap-1.5 ${
                        isEntryIn
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-700/80'
                      }`}>
                        {isEntryIn ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{isEntryIn ? 'سند ورودی (i)' : 'سند خروجی (e)'}</span>
                      </span>
                      <span className="text-[10.5px] text-slate-400 hidden sm:inline">
                        (تمامی ۱۵ ستون کاردکس به‌صورت مستقیم در یک ردیف افقی بدون نیاز به اسکرول)
                      </span>
                    </div>

                    {/* Previous Balances Pills */}
                    <div className="flex items-center gap-1.5 font-mono text-[10.5px] flex-wrap">
                      <span className="text-slate-400 font-sans text-[10px]">مانده‌های سطر قبل:</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800 font-bold" title="مانده کپسول سالم سطر قبل">
                        کپسول: {formatPersianNumber(prevCyl)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800 font-bold" title="مانده ضایعات سطر قبل">
                        ضایعات: {formatPersianNumber(prevScrap)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border font-bold ${
                        prevNewValves < 0
                          ? 'bg-rose-950/80 text-rose-300 border-rose-600'
                          : 'bg-teal-950/70 text-teal-300 border-teal-800'
                      }`} title="مانده شیر نو سطر قبل">
                        شیر نو: {formatPersianNumber(prevNewValves)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded border font-bold bg-cyan-950/70 text-cyan-300 border-cyan-800" title="مانده شیر کهنه سطر قبل (حداقل ۰)">
                        شیر کهنه: {formatPersianNumber(Math.max(0, prevUsedValves))}
                      </span>
                    </div>
                  </div>

                  {/* 15-Column Table Strip (نمای فشرده و کاردکس بدون اسکرول) */}
                  <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-xl overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-center">
                      <thead>
                        {/* Level 1: Category Groups matching Kardex */}
                        <tr className="text-[9.5px] font-bold border-b border-slate-700">
                          <th colSpan={6} className="py-1 px-1 bg-blue-950/40 text-blue-300 border-x border-slate-700">
                            <div className="flex items-center justify-center gap-1">
                              <Flame className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="truncate">کپسول و ضایعات (خانواده سیلندر - ۶ ستون)</span>
                            </div>
                          </th>
                          <th colSpan={3} className="py-1 px-1 bg-teal-950/40 text-teal-300 border-x border-slate-700">
                            <div className="flex items-center justify-center gap-1">
                              <Layers className="w-3 h-3 text-teal-400 shrink-0" />
                              <span className="truncate">شیر نو (۳ ستون)</span>
                            </div>
                          </th>
                          <th colSpan={1} className="py-1 px-0.5 bg-slate-900 text-sky-300 border-x border-slate-700">
                            <div className="flex items-center justify-center gap-0.5">
                              <Truck className="w-3 h-3 text-sky-400 shrink-0" />
                              <span className="truncate">ارسالی</span>
                            </div>
                          </th>
                          <th colSpan={3} className="py-1 px-1 bg-cyan-950/40 text-cyan-300 border-x border-slate-700">
                            <div className="flex items-center justify-center gap-1">
                              <Layers className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span className="truncate">شیر کهنه (۳ ستون)</span>
                            </div>
                          </th>
                          <th colSpan={1} className="py-1 px-0.5 bg-rose-950/40 text-rose-300 border-x border-slate-700">
                            <div className="flex items-center justify-center gap-0.5">
                              <Trash2 className="w-3 h-3 text-rose-400 shrink-0" />
                              <span className="truncate">معیوب</span>
                            </div>
                          </th>
                        </tr>

                        {/* Level 2: Exact Column Headers matching Kardex Table (Total 100% width) */}
                        <tr className="text-[9.5px] font-bold border-b border-slate-800 bg-slate-900/80 leading-tight">
                          {/* 1. ورودی سیلندر */}
                          <th className={`py-1 px-0.5 border-x border-slate-800 w-[7%] ${isEntryIn ? 'text-emerald-300 bg-emerald-950/40 font-black' : 'text-blue-300'}`} title="تعداد سیلندرهای ورودی">
                            ورودی سیلندر
                          </th>
                          {/* 2. خروجی سیلندر */}
                          <th className={`py-1 px-0.5 border-x border-slate-800 w-[7%] ${!isEntryIn ? 'text-rose-200 bg-rose-950/40 font-black' : 'text-rose-300'}`} title="تعداد سیلندرهای خروجی">
                            خروجی سیلندر
                          </th>
                          {/* 3. خروج ضایعات واقعی */}
                          <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6%] text-[7.5px] sm:text-[8px] font-bold leading-tight" title="خروج واقعی ضایعات">
                            <span>خروج ضایعات</span><br /><span>واقعی</span>
                          </th>
                          {/* 4. خروج ضایعات سوری */}
                          <th className="py-1 px-0.5 text-amber-300 border-x border-slate-800 w-[6%] text-[7.5px] sm:text-[8px] font-bold leading-tight" title="خروج ضایعات سوری (کاهش سالم)">
                            <span>خروج ضایعات</span><br /><span>سوری</span>
                          </th>
                          {/* 5. مانده سیلندر */}
                          <th className="py-1 px-0.5 text-emerald-300 bg-emerald-950/50 border-x border-emerald-800/80 w-[7.5%] font-black" title="محاسبه خودکار زنده مانده سیلندر">
                            مانده سیلندر
                          </th>
                          {/* 6. مانده ضایعات */}
                          <th className="py-1 px-0.5 text-amber-300 bg-amber-950/50 border-x border-amber-800/80 w-[7.5%] font-black" title="محاسبه خودکار زنده مانده ضایعات">
                            مانده ضایعات
                          </th>

                          {/* 8. ورود شیر نو */}
                          <th className={`py-1 px-0.5 border-x border-slate-800 w-[6.5%] ${isEntryIn ? 'text-emerald-300 bg-emerald-950/30' : 'text-teal-300'}`} title="ورود شیر نو (هر عددی مجاز است)">
                            ورود شیر نو
                          </th>
                          {/* 9. خروج شیر نو */}
                          <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6.5%]" title="خروج شیر نو (= خروج سیلندر)">
                            خروج شیر نو
                          </th>
                          {/* 10. مانده شیر نو */}
                          <th className={`py-1 px-0.5 border-x w-[7.5%] font-black ${
                            editKardexForm.new_valve_balance < 0
                              ? 'text-rose-200 bg-rose-950/80 border-rose-500'
                              : 'text-teal-300 bg-teal-950/50 border-teal-800'
                          }`} title="مانده سطر قبل + ورودی - خروجی">
                            مانده شیر نو
                          </th>

                          {/* 11. ستون ارسالی */}
                          <th className="py-1 px-0.5 text-sky-300 border-x border-slate-800 w-[9%]" title="ستون ارسالی فقط متنی فاقد عدد">
                            ارسالی (متن)
                          </th>

                          {/* 12. ورود شیر کهنه */}
                          <th className="py-1 px-0.5 text-cyan-300 border-x border-slate-800 w-[6.5%]" title="ورود شیر کهنه (= ورودی سیلندر، قابل تغییر)">
                            ورود شیر کهنه
                          </th>
                          {/* 13. خروج شیر کهنه */}
                          <th className="py-1 px-0.5 text-rose-300 border-x border-slate-800 w-[6.5%]" title="خروج شیر کهنه (= خروج سیلندر، قابل تغییر)">
                            خروج شیر کهنه
                          </th>
                          {/* 14. مانده شیر کهنه */}
                          <th className="py-1 px-0.5 border-x w-[7.5%] font-black text-cyan-300 bg-cyan-950/50 border-cyan-800" title="مانده سطر قبل + ورودی - خروجی (حداقل صفر)">
                            مانده کهنه
                          </th>

                          {/* 15. معیوب */}
                          <th className="py-1 px-0.5 text-amber-300 border-x border-slate-800 w-[4.5%]" title="تعداد اقلام معیوب و داغی">
                            معیوب
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {/* Input Controls Row: تمام فیلدها کنار هم بدون اسکرول */}
                        <tr className="bg-slate-900/30">
                          {/* 1. ورودی سیلندر */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              value={editKardexForm.cylinder_in ?? 0}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('cylinder_in', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                                (Number(editKardexForm.cylinder_in) || 0) > 0 && (Number(editKardexForm.cylinder_out) || 0) > 0
                                  ? 'bg-rose-950/60 border border-rose-500 ring-2 ring-rose-500/70 text-rose-100'
                                  : isEntryIn
                                    ? 'bg-slate-900 border border-emerald-500/80 ring-1 ring-emerald-500/50 text-blue-100 focus:border-emerald-400'
                                    : 'bg-slate-900 border border-blue-600/70 text-blue-100 focus:border-blue-400'
                              }`}
                            />
                          </td>

                          {/* 2. خروجی سیلندر */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              value={editKardexForm.cylinder_out ?? 0}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('cylinder_out', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none placeholder-slate-600 focus:outline-hidden ${
                                (Number(editKardexForm.cylinder_in) || 0) > 0 && (Number(editKardexForm.cylinder_out) || 0) > 0
                                  ? 'bg-rose-950/60 border border-rose-500 ring-2 ring-rose-500/70 text-rose-100'
                                  : !isEntryIn
                                    ? 'bg-slate-900 border border-rose-500 ring-1 ring-rose-500/50 text-rose-100 focus:border-rose-400'
                                    : 'bg-slate-900 border border-rose-600/60 text-rose-100 focus:border-rose-400'
                              }`}
                            />
                          </td>

                          {/* 3. ضایعات واقعی */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              value={editKardexForm.scrap_out ?? 0}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('scrap_out', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-slate-700 rounded px-0.5 py-0.5 h-7 leading-none text-slate-100 placeholder-slate-600 focus:outline-hidden focus:border-rose-400"
                            />
                          </td>

                          {/* 4. ضایعات سوری */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              value={editKardexForm.scrap_stock_in ?? 0}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('scrap_stock_in', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-amber-600/60 rounded px-0.5 py-0.5 h-7 leading-none text-amber-100 placeholder-slate-600 focus:outline-hidden focus:border-amber-400"
                            />
                          </td>

                          {/* 5. مانده سیلندر (محاسبه خودکار زنده) */}
                          <td className="p-0.5 border-x border-emerald-800/80 bg-emerald-950/30">
                            <input
                              type="number"
                              readOnly
                              value={editKardexForm.cylinder_balance ?? 0}
                              className="w-full text-center text-[11px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/70 rounded px-0.5 py-0.5 h-7 leading-none text-emerald-200 cursor-not-allowed select-all"
                              title="فرمول: مانده سطر قبل + ورودی سیلندر – خروج سیلندر – خروج ضایعات سوری"
                            />
                          </td>

                          {/* 6. مانده ضایعات (محاسبه خودکار زنده) */}
                          <td className="p-0.5 border-x border-amber-800/80 bg-amber-950/30">
                            <input
                              type="number"
                              readOnly
                              value={Math.max(0, editKardexForm.scrap_balance ?? 0)}
                              className="w-full text-center text-[11px] font-mono font-bold bg-amber-950/60 border border-amber-500/70 rounded px-0.5 py-0.5 h-7 leading-none text-amber-200 cursor-not-allowed select-all"
                              title="فرمول: مانده ضایعات سطر قبل + خروج ضایعات سوری – خروج واقعی ضایعات"
                            />
                          </td>

                          {/* 8. ورود شیر نو */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              disabled={isTankType(editKardexForm.cylinder_type || selectedCylinderType)}
                              value={isTankType(editKardexForm.cylinder_type || selectedCylinderType) ? 0 : (editKardexForm.new_valve_in ?? 0)}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('new_valve_in', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-teal-600/70 rounded px-0.5 py-0.5 h-7 leading-none text-teal-100 placeholder-slate-600 focus:outline-hidden focus:border-teal-400"
                            />
                          </td>

                          {/* 9. خروج شیر نو */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              disabled={isTankType(editKardexForm.cylinder_type || selectedCylinderType)}
                              value={isTankType(editKardexForm.cylinder_type || selectedCylinderType) ? 0 : (editKardexForm.new_valve_out ?? 0)}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('new_valve_out', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-rose-600/60 rounded px-0.5 py-0.5 h-7 leading-none text-rose-100 placeholder-slate-600 focus:outline-hidden focus:border-rose-400"
                            />
                          </td>

                          {/* 10. مانده شیر نو (محاسبه زنده - پذیرش منفی) */}
                          <td className={`p-0.5 border-x ${
                            editKardexForm.new_valve_balance < 0 ? 'bg-rose-950/50 border-rose-600' : 'bg-teal-950/30 border-teal-800'
                          }`}>
                            <input
                              type="number"
                              readOnly
                              disabled={isTankType(editKardexForm.cylinder_type || selectedCylinderType)}
                              value={isTankType(editKardexForm.cylinder_type || selectedCylinderType) ? 0 : (editKardexForm.new_valve_balance ?? 0)}
                              className={`w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none cursor-not-allowed select-all border ${
                                editKardexForm.new_valve_balance < 0
                                  ? 'bg-rose-950/90 border-rose-500 text-rose-200 ring-1 ring-rose-500'
                                  : 'bg-teal-950/60 border-teal-500/70 text-teal-200'
                              }`}
                              title={`مانده سطر قبل (${prevNewValves}) + ورودی (${editKardexForm.new_valve_in || 0}) - خروجی (${editKardexForm.new_valve_out || 0}) = ${editKardexForm.new_valve_balance || 0}`}
                            />
                          </td>

                          {/* 11. ستون ارسالی و شماره بارنامه */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="text"
                              value={editKardexForm.dispatched ?? ''}
                              onChange={e => {
                                const val = e.target.value;
                                setEditKardexForm(prev => ({
                                  ...prev,
                                  dispatched: val,
                                  waybill_number: val
                                }));
                              }}
                              placeholder="شماره بارنامه/ارسالی"
                              className="w-full text-center text-[10px] bg-slate-900 border border-blue-700/60 rounded px-0.5 py-0.5 h-7 leading-none text-blue-100 placeholder-slate-600 placeholder:text-[9px] focus:outline-hidden focus:border-blue-400 truncate"
                              title="شماره بارنامه یا مشخصات ارسالی"
                            />
                          </td>

                          {/* 12. ورود شیر کهنه */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              disabled={isTankType(editKardexForm.cylinder_type || selectedCylinderType)}
                              value={isTankType(editKardexForm.cylinder_type || selectedCylinderType) ? 0 : (editKardexForm.used_valve_in ?? 0)}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('used_valve_in', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-cyan-600/70 rounded px-0.5 py-0.5 h-7 leading-none text-cyan-100 placeholder-slate-600 focus:outline-hidden focus:border-cyan-400"
                            />
                          </td>

                          {/* 13. خروج شیر کهنه */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              disabled={isTankType(editKardexForm.cylinder_type || selectedCylinderType)}
                              value={isTankType(editKardexForm.cylinder_type || selectedCylinderType) ? 0 : (editKardexForm.used_valve_out ?? 0)}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('used_valve_out', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              title="خروج شیر کهنه (سلول مستقل و بدون وابستگی)"
                              className="w-full text-center text-[11px] font-mono font-bold bg-slate-900 border border-rose-600/60 rounded px-0.5 py-0.5 h-7 leading-none text-rose-100 placeholder-slate-600 focus:outline-hidden focus:border-rose-400"
                            />
                          </td>

                          {/* 14. مانده شیر کهنه (محاسبه زنده - حداقل صفر) */}
                          <td className="p-0.5 border-x bg-cyan-950/30 border-cyan-800">
                            <input
                              type="number"
                              readOnly
                              value={Math.max(0, editKardexForm.used_valve_balance ?? 0)}
                              className="w-full text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 h-7 leading-none cursor-not-allowed select-all border bg-cyan-950/60 border-cyan-500/70 text-cyan-200"
                              title={`مانده سطر قبل (${prevUsedValves}) + ورودی (${editKardexForm.used_valve_in || 0})${editKardexForm.used_valve_out ? ` - خروجی (${editKardexForm.used_valve_out})` : ''} = حداقل صفر (${Math.max(0, editKardexForm.used_valve_balance || 0)})`}
                            />
                          </td>

                          {/* 15. معیوب */}
                          <td className="p-0.5 border-x border-slate-800">
                            <input
                              type="number"
                              min="0"
                              value={editKardexForm.defective ?? 0}
                              onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                              onChange={e => updateEditFormField('defective', e.target.value === '' ? 0 : Number(e.target.value))}
                              placeholder="0"
                              className="w-full text-center text-[11px] font-mono bg-slate-900 border border-slate-700 rounded px-0.5 py-0.5 h-7 leading-none text-slate-100 placeholder-slate-600 focus:outline-hidden focus:border-amber-400 font-bold"
                            />
                          </td>
                        </tr>

                        {/* Sub-hints Row: راهنمای فشرده فیلدها */}
                        <tr className="text-[8.5px] text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800/60 font-medium leading-tight">
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">
                            {isEntryIn ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">ورودی</span> : 'افزایش'}
                          </td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">
                            {!isEntryIn ? <span className="text-rose-600 dark:text-rose-400 font-bold">خروجی</span> : 'کاهش'}
                          </td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">قطعی</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">کاهش سالم</td>
                          <td className="py-0.5 px-0.5 border-x border-emerald-300 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold truncate">خودکار</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">ذخیره</td>
                          <td className="py-0.5 px-0.5 border-x border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 font-bold truncate">خودکار</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">هر عدد</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">= خروج</td>
                          <td className={`py-0.5 px-0.5 border-x font-bold truncate ${editKardexForm.new_valve_balance < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'}`}>
                            {editKardexForm.new_valve_balance < 0 ? '⚠️ ام‌گاز' : 'خودکار'}
                          </td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 text-sky-600 dark:text-sky-400 truncate">فقط متن</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate" title="ورودی شیر کهنه همیشه برابر ورودی سیلندر است و قابل ویرایش">= ورود</td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate" title="خروج شیر کهنه سلول مستقل است و وابسته به خروج سیلندر نیست">مستقل</td>
                          <td className="py-0.5 px-0.5 border-x font-bold truncate text-cyan-700 dark:text-cyan-300" title="مانده شیر کهنه = مانده قبل + ورودی">
                            مانده قبل + ورود
                          </td>
                          <td className="py-0.5 px-0.5 border-x border-slate-200 dark:border-slate-800 truncate">داغی</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Simultaneous Entry + Exit Conflict Warning Banner (Edit Modal) */}
                  {(Number(editKardexForm.cylinder_in) || 0) > 0 && (Number(editKardexForm.cylinder_out) || 0) > 0 && (
                    <div className="p-2.5 bg-rose-950/85 border-2 border-rose-500 rounded-xl flex items-start gap-2.5 text-rose-100 text-xs shadow-lg">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-rose-100 block text-[11.5px]">
                          هشدار: امکان پر کردن همزمان دو کاردکس وجود ندارد
                        </strong>
                        <span className="text-[10.5px] text-rose-200 leading-relaxed block mt-0.5">
                          فیلدهای «ورودی سیلندر» و «خروجی سیلندر» هم‌زمان دارای عدد هستند. لطفاً یکی از این دو فیلد را صفر (۰) کنید.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Negative Warning Banner if new valve balance is negative */}
                  {editKardexForm.new_valve_balance < 0 && (
                    <div className="p-2 bg-rose-950/60 border border-rose-500/70 rounded-xl flex items-start gap-2 text-rose-200 text-xs animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-rose-100 block text-[11px]">
                          هشدار کسر از موجودی خود ام‌گاز:
                        </strong>
                        <span className="text-[10px] text-rose-300 leading-relaxed block">
                          مانده شیر نو منفی شده است ({editKardexForm.new_valve_balance} عدد). این مقدار از موجودی خود ام‌گاز کسر خواهد شد.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Summary Strip (خلاصه تراز سطر ثبتی کاردکس) */}
                  <div className="p-2 bg-slate-950/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-slate-300 flex items-center gap-1.5 font-bold text-[11px]">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isEntryIn ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <span>خلاصه تراز سطر کاردکس:</span>
                    </span>
                    <div className="flex items-center gap-2 font-mono font-bold text-slate-200 flex-wrap text-[11px]">
                      <span className="text-blue-300">
                        ورودی: {formatPersianNumber(editKardexForm.cylinder_in || 0)}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-rose-300">
                        خروجی: {formatPersianNumber(editKardexForm.cylinder_out || 0)}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800">
                        مانده کپسول: {formatPersianNumber(editKardexForm.cylinder_balance || 0)}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-amber-300 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800">
                        مانده ضایعات: {formatPersianNumber(Math.max(0, editKardexForm.scrap_balance || 0))}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className={`px-1.5 py-0.5 rounded border ${editKardexForm.new_valve_balance < 0 ? 'text-rose-300 bg-rose-950/80 border-rose-500' : 'text-teal-300 bg-teal-950/70 border-teal-800'}`}>
                        مانده شیر نو: {formatPersianNumber(editKardexForm.new_valve_balance || 0)}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="px-1.5 py-0.5 rounded border text-cyan-300 bg-cyan-950/70 border-cyan-800">
                        مانده شیر کهنه: {formatPersianNumber(Math.max(0, editKardexForm.used_valve_balance || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    یادداشت و ملاحظات سند:
                  </label>
                  <textarea
                    rows={2}
                    value={editKardexForm.notes}
                    onChange={(e) => setEditKardexForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-hidden"
                    placeholder="توضیحات تکمیلی یا علت ویرایش..."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800 flex-wrap">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="font-medium">شماره برگه ثبت‌شده:</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                      isEntryIn
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border-amber-800'
                    }`}>
                      {editKardexForm.transfer_sheet_number || '-'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditKardexModal(false);
                        setEditingKardexEntry(null);
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className={`px-5 py-2 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isEntryIn
                          ? 'text-emerald-950 bg-emerald-400 hover:bg-emerald-300'
                          : 'text-amber-950 bg-amber-400 hover:bg-amber-300'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ذخیره تغییرات سند {isEntryIn ? 'ورودی (i)' : 'خروجی (e)'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Move to Trash Confirmation (انتقال ردیف کاردکس به سطل آشغال) */}
      {deletingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn"
        >
          <div
            className="bg-slate-900 border border-rose-900/60 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    انتقال سند کاردکس به سطل آشغال
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    قابلیت بازیابی و ریکاوری در هر زمان از بخش «سطل آشغال»
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Document Summary Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span>طرف حساب: <strong className="text-amber-400">{deletingEntry.customer_name}</strong></span>
                  <span className="font-mono text-slate-400">{deletingEntry.date}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>شماره برگه: <strong className="font-mono text-indigo-300">{deletingEntry.transfer_sheet_number || '-'}</strong></span>
                  <span>کاربر ثبت: <strong className="font-mono text-slate-400">@{deletingEntry.created_by_username || 'amouei'}</strong></span>
                </div>
                <div className="text-slate-200 border-t border-slate-800/80 pt-2 text-[11px]">
                  شرح: <span className="font-medium">{deletingEntry.description}</span>
                </div>
                {/* Quantities */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-[11px]">
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">سیلندر:</span>
                    <span className="text-blue-400 font-bold">{toPersianDigits(deletingEntry.cylinder_in > 0 ? `+${deletingEntry.cylinder_in}` : deletingEntry.cylinder_out > 0 ? `-${deletingEntry.cylinder_out}` : 0)}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">شیر نو:</span>
                    <span className="text-emerald-400 font-bold">{toPersianDigits(deletingEntry.new_valve_in > 0 ? `+${deletingEntry.new_valve_in}` : deletingEntry.new_valve_out > 0 ? `-${deletingEntry.new_valve_out}` : 0)}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">شیر کهنه:</span>
                    <span className="text-amber-400 font-bold">{toPersianDigits(deletingEntry.used_valve_in > 0 ? `+${deletingEntry.used_valve_in}` : deletingEntry.used_valve_out > 0 ? `-${deletingEntry.used_valve_out}` : 0)}</span>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 flex items-start gap-2.5 text-amber-300 text-[11px]">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <p className="leading-relaxed">
                  با انتقال این سند به سطل آشغال، اثر این ردیف از کاردکس خارج و مانده‌های کپسول و شیرآلات طرف حساب به‌صورت خودکار بازتراز می‌شوند. این سند حذف دائمی نمی‌شود و در هر زمان می‌توانید آن را ریکاوری نمایید.
                </p>
              </div>

              {/* Reason Input */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  علت حذف (اختیاری):
                </label>
                <input
                  type="text"
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                  placeholder="مثال: اشتباه در شماره برگه، کنسلی بارنامه، ثبت دوباره..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:outline-hidden text-xs"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveToTrash}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Trash2 className="w-4 h-4" />
                <span>انتقال به سطل آشغال</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Kardex Recycle Bin & Recovery Center (سطل آشغال و مرکز ریکاوری اسناد کاردکس) */}
      {showTrashModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-fadeIn"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-100">
                      سطل آشغال و مرکز ریکاوری اسناد کاردکس
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-950 text-rose-300 border border-rose-800/80">
                      {toPersianDigits(trashedEntries.length)} سند حذف‌شده
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    اسناد حذف‌شده به تفکیک نگهداری می‌شوند و با کلیک روی «بازیابی»، فوراً به کاردکس فعال بازمی‌گردند.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTrashModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar inside Trash */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter toggle: Current Customer vs All Customers */}
                <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTrashCustomerFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      trashCustomerFilter === 'all'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    همه طرف‌حساب‌ها ({toPersianDigits(trashedEntries.length)})
                  </button>
                  {currentCustomer && (
                    <button
                      type="button"
                      onClick={() => setTrashCustomerFilter('current')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        trashCustomerFilter === 'current'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      فقط «{currentCustomer.name}»
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Empty Trash */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-60">
                  <input
                    type="text"
                    value={trashSearchQuery}
                    onChange={(e) => setTrashSearchQuery(e.target.value)}
                    placeholder="جستجو در سطل آشغال..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-8 pl-3 py-1.5 text-slate-200 placeholder-slate-500 focus:border-rose-500 focus:outline-hidden text-xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
                </div>

                {trashedEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenEmptyTrashModal}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md shadow-rose-950/40"
                    title="تخلیه کامل سطل آشغال و حذف برای همیشه کلیه اسناد"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تخلیه و حذف برای همیشه</span>
                  </button>
                )}
              </div>
            </div>

            {/* List / Table of Trashed Entries */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredTrashedEntries.length === 0 ? (
                <div className="py-16 text-center text-slate-500 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-600">
                    <Trash2 className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">
                    {trashedEntries.length === 0
                      ? 'سطل آشغال خالی است. هیچ سندی به سطل آشغال منتقل نشده است.'
                      : 'هیچ موردی مطابق فیلتر یا جستجوی شما یافت نشد.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    در جدول کاردکس با فشردن آیکون سطل آشغال روی هر ردیف، می‌توانید سند را به این بخش منتقل نمایید.
                  </p>
                </div>
              ) : (
                filteredTrashedEntries.map((item) => (
                  <div
                    key={item.entry_id}
                    className="bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 transition-colors space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/70 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm">
                          {item.customer_name}
                        </span>
                        {item.transfer_sheet_number && (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-bold">
                            برگه {item.transfer_sheet_number}
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-400">
                          تاریخ سند: {item.date}
                        </span>
                        {item.custom_item_name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                            {item.custom_item_name}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: Restore and Permanent Delete */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Recover / Restore Button */}
                        <button
                          type="button"
                          onClick={() => handleRestoreFromTrash(item)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
                          title="بازیابی و ریکاوری سند به کاردکس جاری"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>ریکاوری و بازیابی سند</span>
                        </button>

                        {/* Permanent Delete */}
                        <button
                          type="button"
                          onClick={() => handleOpenPermanentDeleteModal(item)}
                          className="px-2.5 py-1.5 text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-800 border border-rose-800/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                          title="حذف برای همیشه (غیرقابل بازگشت)"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>حذف برای همیشه</span>
                        </button>
                      </div>
                    </div>

                    {/* Middle Details: Description, Quantities, Reason */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-slate-300">
                          شرح: <span className="font-medium text-slate-200">{item.description}</span>
                        </div>
                        {item.delete_reason && (
                          <div className="text-rose-300 text-[11px] bg-rose-950/40 border border-rose-900/50 rounded-lg p-1.5">
                            علت حذف: <span className="font-medium">{item.delete_reason}</span>
                          </div>
                        )}
                      </div>

                      {/* Quantities summary badges */}
                      <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] md:justify-end">
                        {(item.cylinder_in > 0 || item.cylinder_out > 0) && (
                          <span className={`px-2 py-1 rounded border ${
                            item.cylinder_in > 0
                              ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                              : 'bg-rose-950/60 border-rose-800 text-rose-300'
                          }`}>
                            کپسول: {item.cylinder_in > 0 ? `+${toPersianDigits(item.cylinder_in)}` : `-${toPersianDigits(item.cylinder_out)}`}
                          </span>
                        )}
                        {(item.new_valve_in > 0 || item.new_valve_out > 0) && (
                          <span className="px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                            شیر نو: {item.new_valve_in > 0 ? `+${toPersianDigits(item.new_valve_in)}` : `-${toPersianDigits(item.new_valve_out)}`}
                          </span>
                        )}
                        {(item.used_valve_in > 0 || item.used_valve_out > 0) && (
                          <span className="px-2 py-1 rounded bg-amber-950/60 border border-amber-800 text-amber-300">
                            شیر کهنه: {item.used_valve_in > 0 ? `+${toPersianDigits(item.used_valve_in)}` : `-${toPersianDigits(item.used_valve_out)}`}
                          </span>
                        )}
                        {item.scrap_out > 0 && (
                          <span className="px-2 py-1 rounded bg-rose-950/60 border border-rose-800 text-rose-300">
                            خروج ضایعات: {toPersianDigits(item.scrap_out)}
                          </span>
                        )}
                        {(item.scrap_stock_in || 0) > 0 && (
                          <span className="px-2 py-1 rounded bg-amber-950/60 border border-amber-800 text-amber-300">
                            ذخیره ضایعات: {toPersianDigits(item.scrap_stock_in)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Footer: Deleted At & User */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                      <span>حذف شده توسط: <strong className="text-slate-400">@{item.deleted_by || 'system'}</strong></span>
                      {item.deleted_at && (
                        <span>زمان انتقال به سطل: <span className="font-mono">{new Date(item.deleted_at).toLocaleString('fa-IR')}</span></span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                تعداد کل اسناد سطل آشغال: <strong className="text-slate-200 font-mono">{toPersianDigits(trashedEntries.length)}</strong>
              </span>
              <div className="flex items-center gap-2">
                {trashedEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenEmptyTrashModal}
                    className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-950/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تخلیه سطل و حذف برای همیشه</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTrashModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Empty Trash Completely / تخلیه کامل سطل آشغال و حذف برای همیشه */}
      {showEmptyTrashConfirmModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        >
          <div
            className="bg-slate-900 border border-rose-600/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative text-right cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-rose-900/50 bg-rose-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>تخلیه کامل سطل آشغال و حذف برای همیشه</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmptyTrashConfirmModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 space-y-2 leading-relaxed">
                <p className="font-bold text-rose-300 text-sm">
                  آیا از تخلیه کامل سطل آشغال اطمینان دارید؟
                </p>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  تعداد <strong className="text-white font-mono">{toPersianDigits(trashedEntries.length)}</strong> سند موجود در سطل آشغال <strong className="text-rose-100">برای همیشه حذف خواهند شد</strong> و این عملیات به هیچ عنوان قابل بازگشت نخواهد بود.
                </p>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                کلیه مانده‌های طرف‌حساب‌ها پیش از این بازتراز شده‌اند و با این اقدام صرفاً رکوردهای بایگانی‌شده برای همیشه از پایگاه‌داده حذف خواهند شد.
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowEmptyTrashConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecuteEmptyTrash}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/50 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>بله، تخلیه و حذف برای همیشه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Single Item Permanent Delete / حذف برای همیشه سند */}
      {entryToPermanentlyDelete && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        >
          <div
            className="bg-slate-900 border border-rose-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative text-right cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-rose-900/50 bg-rose-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                <Trash2 className="w-5 h-5 text-rose-400 shrink-0" />
                <span>حذف برای همیشه سند کاردکس</span>
              </div>
              <button
                type="button"
                onClick={() => setEntryToPermanentlyDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 space-y-2 leading-relaxed">
                <p className="font-bold text-rose-300 text-sm">
                  آیا از حذف قطعی و همیشگی این سند اطمینان دارید؟
                </p>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  سند شماره برگه: <strong className="font-mono text-white">«{entryToPermanentlyDelete.transfer_sheet_number || entryToPermanentlyDelete.entry_id}»</strong><br />
                  مربوط به طرف‌حساب: <strong className="text-white">«{entryToPermanentlyDelete.customer_name}»</strong><br />
                  تاریخ سند: <strong className="font-mono text-white">{entryToPermanentlyDelete.date}</strong>
                </p>
                <p className="text-[11px] text-rose-300/90 pt-1.5 border-t border-rose-800/50">
                  این سند به‌صورت قطعی از سطل آشغال و پایگاه‌داده حذف خواهد شد و دیگر قابل بازیابی یا ریکاوری نخواهد بود.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEntryToPermanentlyDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecutePermanentDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/50 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف برای همیشه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Physical Goods Entry Receipt (برگ ورود کالا - M.Gas cylinder) */}
      {showReceiptModal && (
        <GoodsEntryReceiptModal
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setSelectedReceiptEntry(null);
          }}
          entry={selectedReceiptEntry}
          customer={currentCustomer}
          customers={customers}
          currentEnv={currentEnv}
          currentUser={currentUser}
          onSwitchToExitForm={() => {
            setSelectedExitReceiptEntry(selectedReceiptEntry);
            setShowReceiptModal(false);
            setShowExitReceiptModal(true);
          }}
          onSaved={(receipt) => {
            triggerSeamlessRefresh();
            showToast(`برگ ورود شماره ${receipt.form_number} و ستون ارسالی (${receipt.dispatched || 0} عدد) در جدول کاردکس به‌روزرسانی شد.`, 'success');
          }}
        />
      )}

      {/* Modal: Physical Goods Exit Receipt (برگه خروج کالا - M.Gas cylinder) */}
      {showExitReceiptModal && (
        <GoodsExitReceiptModal
          isOpen={showExitReceiptModal}
          onClose={() => {
            setShowExitReceiptModal(false);
            setSelectedExitReceiptEntry(null);
          }}
          entry={selectedExitReceiptEntry}
          customer={currentCustomer}
          customers={customers}
          currentEnv={currentEnv}
          currentUser={currentUser}
          onSwitchToEntryForm={() => {
            setSelectedReceiptEntry(selectedExitReceiptEntry);
            setShowExitReceiptModal(false);
            setShowReceiptModal(true);
          }}
          onSaved={(receipt) => {
            triggerSeamlessRefresh();
            showToast(`برگه خروج شماره ${receipt.form_number} و ستون ارسالی (${receipt.dispatched || 0} عدد) در جدول کاردکس به‌روزرسانی شد.`, 'success');
          }}
        />
      )}

      {/* ======================================================================
          MODAL: DOCUMENT / ORDER DETAILS MODAL (جزئیات سفارش و سند با نمایش برجسته شماره برگه)
          درخواست کاربر: «نوشتن شماره برگه در جزئیات سفارش که در بخش عملیات قرار میدهی»
          ====================================================================== */}
      {selectedEntryForDetails && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-6 cursor-default text-slate-100"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">جزئیات سفارش و مشخصات سند</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">کاردکس گاز طرف حساب: {currentCustomer?.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntryForDetails(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="بستن پنجره"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs">
              {/* Prominent Sheet Number Card */}
              <div className="bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-700/60 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-inner">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-indigo-300 block">شماره برگه حواله / سفارش:</span>
                  <span className="font-mono text-base sm:text-lg font-black text-indigo-200 tracking-wider font-mono-en" dir="ltr">
                    {selectedEntryForDetails.transfer_sheet_number || 'فاقد شماره برگه'}
                  </span>
                </div>
                {selectedEntryForDetails.transfer_sheet_number && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedEntryForDetails.transfer_sheet_number);
                      showToast(`شماره برگه «${selectedEntryForDetails.transfer_sheet_number}» کپی شد.`, 'success');
                    }}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    title="کپی شماره برگه در کلیپ‌بورد"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی برگه</span>
                  </button>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[11px] block">تاریخ سند:</span>
                  <span className="font-mono font-bold text-slate-200">{selectedEntryForDetails.date}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">نوع سیلندر:</span>
                  <span className="font-bold text-indigo-400">{selectedEntryForDetails.cylinder_type || selectedCylinderType}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">ورودی سیلندر:</span>
                  <span className="font-mono font-bold text-blue-400">{formatPersianNumber(selectedEntryForDetails.cylinder_in || 0)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">خروجی سیلندر:</span>
                  <span className="font-mono font-bold text-rose-400">{formatPersianNumber(selectedEntryForDetails.cylinder_out || 0)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">مانده سیلندر:</span>
                  <span className="font-mono font-extrabold text-emerald-300">{formatPersianNumber(selectedEntryForDetails.cylinder_balance || 0)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">مانده ضایعات:</span>
                  <span className="font-mono font-extrabold text-amber-300">{formatPersianNumber(Math.max(0, selectedEntryForDetails.scrap_balance || 0))}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">شیر نو (ورود / خروج / مانده):</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatPersianNumber(selectedEntryForDetails.new_valve_in || 0)} / {formatPersianNumber(selectedEntryForDetails.new_valve_out || 0)} / {formatPersianNumber(selectedEntryForDetails.new_valve_balance || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">شیر کهنه (ورود / خروج / مانده):</span>
                  <span className="font-mono font-bold text-amber-400">
                    {formatPersianNumber(selectedEntryForDetails.used_valve_in || 0)} / {formatPersianNumber(selectedEntryForDetails.used_valve_out || 0)} / {formatPersianNumber(selectedEntryForDetails.used_valve_balance || 0)}
                  </span>
                </div>
              </div>

              {/* Segregated Valve Items Detail Card */}
              {selectedEntryForDetails.valve_items && selectedEntryForDetails.valve_items.length > 0 && (
                <div className="space-y-2 bg-indigo-950/30 p-3 rounded-xl border border-indigo-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-300 text-xs font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      اقلام تفکیک‌شده شیرآلات در این سند:
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      مجموع: {formatPersianNumber(selectedEntryForDetails.valve_items.reduce((acc, v) => acc + (v.quantity || 0), 0))} عدد
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {selectedEntryForDetails.valve_items.map((vi, vIdx) => (
                      <div key={vIdx} className="flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                        <span className="text-slate-200 font-medium truncate ml-2" title={vi.valve_name}>{vi.valve_name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            vi.valve_category === 'NEW'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                          }`}>
                            {vi.valve_category === 'NEW' ? 'نو' : 'کهنه'}
                          </span>
                          <span className="font-mono font-bold text-white text-xs">{formatPersianNumber(vi.quantity)} عدد</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description & Notes */}
              <div className="space-y-1.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 text-[11px] font-bold block">شرح کامل گردش:</span>
                <p className="text-slate-200 leading-relaxed text-[11.5px]">{selectedEntryForDetails.description || 'بدون شرح'}</p>
                {selectedEntryForDetails.notes && (
                  <p className="text-slate-400 text-[11px] mt-1 pt-1 border-t border-slate-800">
                    یادداشت و ملاحظات: {selectedEntryForDetails.notes}
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExitReceiptEntry(selectedEntryForDetails);
                    setShowExitReceiptModal(true);
                    setSelectedEntryForDetails(null);
                  }}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                  title="صدور و مشاهده برگه خروج کالا (سیلندر و شیرآلات)"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>برگه خروج کالا</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedReceiptEntry(selectedEntryForDetails);
                    setShowReceiptModal(true);
                    setSelectedEntryForDetails(null);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                  title="صدور و مشاهده برگ ورود کالا (سیلندر و شیرآلات)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>برگ ورود کالا</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleOpenEditKardex(selectedEntryForDetails);
                    setSelectedEntryForDetails(null);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>ویرایش سند</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEntryForDetails(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Segregated Valve Stock Modal (موجودی تفکیک‌شده شیرهای مشتری) */}
      {showCustomerValveReportModal && currentCustomer && (() => {
        const reportData = LocalStorageManager.getCustomerValveDetailedReport(
          currentEnv,
          currentCustomer.customer_id
        );
        const rows = reportData.segregatedRows;
        const summary = reportData.customerSummaryRows[0] || {
          total_new_in: 0,
          total_new_out: 0,
          new_balance: 0,
          total_used_in: 0,
          total_used_out: 0,
          used_balance: 0,
          total_all_in: 0,
          total_all_out: 0,
          all_balance: 0,
          mgas_covered: 0
        };

        const handleExportCurrentCustomerValves = () => {
          const exportRows = rows.map((r, idx) => ({
            'ردیف': idx + 1,
            'نام مشتری': r.customer_name,
            'مدل و عنوان تفکیکی شیر': r.valve_name,
            'دسته‌بندی': r.valve_category === 'NEW' ? 'شیر نو استاندارد' : 'شیر کهنه/داغی',
            'مقدار ورود (IN)': r.quantity_in,
            'مقدار خروج (OUT)': r.quantity_out,
            'مانده نزد انبار (BALANCE)': r.balance,
            'کسری تامین‌شده با ام‌گاز': r.mgas_covered,
            'وضعیت تراز': r.status_label,
            'تاریخ آخرین گردش': r.last_activity_date || '---'
          }));
          const ws = XLSX.utils.json_to_sheet(exportRows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'موجودی شیرآلات مشتری');
          XLSX.writeFile(wb, `موجودی_شیر_${currentCustomer.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                      <span>موجودی تفکیک‌شده شیرآلات مشتری</span>
                      <span className="text-amber-400 font-extrabold">«{currentCustomer.name}»</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      تفکیک دقیق مقدار ورود، خروج و مانده به ازای هر مدل و دسته‌بندی شیر در انبار کارخانه
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerValveReportModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPI Badges */}
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-slate-900/90 border border-emerald-900/50 rounded-xl p-2.5">
                  <div className="text-[11px] text-emerald-400 font-bold mb-1">شیر نو (استاندارد)</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>ورود: <b className="text-emerald-400 font-mono">{toPersianDigits(summary.total_new_in)}</b></span>
                    <span>خروج: <b className="text-rose-400 font-mono">{toPersianDigits(summary.total_new_out)}</b></span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-800 text-[11px] flex justify-between font-bold">
                    <span className="text-slate-400">مانده شیر نو:</span>
                    <span className={`font-mono ${summary.new_balance < 0 ? 'text-amber-400' : 'text-emerald-300'}`}>
                      {toPersianDigits(summary.new_balance)} عدد
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-amber-900/50 rounded-xl p-2.5">
                  <div className="text-[11px] text-amber-400 font-bold mb-1">شیر کهنه و داغی</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>ورود: <b className="text-emerald-400 font-mono">{toPersianDigits(summary.total_used_in)}</b></span>
                    <span>خروج: <b className="text-rose-400 font-mono">{toPersianDigits(summary.total_used_out)}</b></span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-800 text-[11px] flex justify-between font-bold">
                    <span className="text-slate-400">مانده کهنه:</span>
                    <span className="font-mono text-amber-300">
                      {toPersianDigits(summary.used_balance)} عدد
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-indigo-900/50 rounded-xl p-2.5">
                  <div className="text-[11px] text-indigo-400 font-bold mb-1">مجموع گردش کل شیرها</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>کل ورود: <b className="text-emerald-400 font-mono">{toPersianDigits(summary.total_all_in)}</b></span>
                    <span>کل خروج: <b className="text-rose-400 font-mono">{toPersianDigits(summary.total_all_out)}</b></span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-800 text-[11px] flex justify-between font-bold">
                    <span className="text-slate-400">تراز نهایی:</span>
                    <span className="font-mono text-indigo-300 font-extrabold">
                      {toPersianDigits(summary.all_balance)} عدد
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between">
                  <div className="text-[11px] text-slate-400 font-bold">تامین کسری از ام‌گاز</div>
                  <div className="text-lg font-black font-mono text-amber-400">
                    {toPersianDigits(summary.mgas_covered)} <span className="text-xs font-normal text-slate-400">عدد</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    در صورت مصرف مازاد، از انبار ام‌گاز تامین می‌شود
                  </div>
                </div>
              </div>

              {/* Table of Segregated Valves */}
              <div className="p-4 overflow-y-auto flex-1">
                {rows.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    هنوز گردشی برای شیرآلات این طرف‌حساب ثبت نشده است.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5 text-center w-10">#</th>
                          <th className="p-2.5">مدل و مشخصات تفکیکی شیر</th>
                          <th className="p-2.5 text-center">نوع</th>
                          <th className="p-2.5 text-center text-emerald-400">ورود (IN)</th>
                          <th className="p-2.5 text-center text-rose-400">خروج (OUT)</th>
                          <th className="p-2.5 text-center text-amber-300">مانده (REMAINING)</th>
                          <th className="p-2.5 text-center">تامین کسری</th>
                          <th className="p-2.5 text-center">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {rows.map((row, idx) => (
                          <tr key={`seg-vlv-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-2.5 text-center font-mono text-slate-400">{toPersianDigits(idx + 1)}</td>
                            <td className="p-2.5 font-bold text-slate-100">{row.valve_name}</td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                row.valve_category === 'NEW'
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                                  : 'bg-amber-950/70 text-amber-300 border-amber-800'
                              }`}>
                                {row.valve_category === 'NEW' ? 'شیر نو' : 'شیر کهنه/داغی'}
                              </span>
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-emerald-400">{toPersianDigits(row.quantity_in)}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-rose-400">{toPersianDigits(row.quantity_out)}</td>
                            <td className="p-2.5 text-center font-mono font-black text-amber-300 text-sm">
                              {toPersianDigits(row.balance)}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-400">
                              {row.mgas_covered > 0 ? toPersianDigits(row.mgas_covered) : '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                row.status_type === 'covered'
                                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800'
                                  : row.status_type === 'healthy'
                                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}>
                                {row.status_label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleExportCurrentCustomerValves}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>دانلود اکسل تفکیکی شیرها</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomerValveReportModal(false)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =================================================================================
          ORGANIZED NOTIFICATIONS CENTER POPUP MODAL (مرکز اعلان‌های کاردکس تعمیر سیلندر)
          ================================================================================= */}
      {showNotificationsModal && (() => {
        const normalizedQuery = pendingSearchQuery.trim().toLowerCase();
        const filteredPendingInspections = pendingInspections.filter(insp => {
          if (!normalizedQuery) return true;
          return (
            (insp.customer_name || '').toLowerCase().includes(normalizedQuery) ||
            (insp.form_number || '').toLowerCase().includes(normalizedQuery) ||
            (insp.waybill_number || '').toLowerCase().includes(normalizedQuery) ||
            (insp.item_name || '').toLowerCase().includes(normalizedQuery)
          );
        });

        const totalAllNotifications = pendingInspections.length + statusNoticesCount + notificationHistory.length;

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            dir="rtl"
            onClick={() => setShowNotificationsModal(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                      مرکز اعلان‌های کاردکس تعمیر سیلندر
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {pendingInspections.length > 0
                        ? `${toPersianDigits(pendingInspections.length)} ورودی در انتظار ثبت در کاردکس`
                        : 'همه ورودی‌های شمارش‌شده ثبت شده‌اند'}
                      {statusNoticesCount > 0 ? ` • ${toPersianDigits(statusNoticesCount)} اعلان وضعیت` : ''}
                      {notificationHistory.length > 0 ? ` • ${toPersianDigits(notificationHistory.length)} پیام عملیات` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNotificationsModal(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="بستن مرکز اعلان‌ها"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Category Filter Tabs */}
              <div className="px-4 sm:px-5 py-2.5 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setNotificationsTab('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                    notificationsTab === 'all'
                      ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>همه اعلان‌ها</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/15 dark:bg-black/25">
                    {toPersianDigits(totalAllNotifications)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNotificationsTab('pending')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                    notificationsTab === 'pending'
                      ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>ورودی‌های در انتظار ثبت</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      pendingInspections.length > 0 && notificationsTab !== 'pending'
                        ? 'bg-amber-500 text-white dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-black/15 dark:bg-black/25'
                    }`}
                  >
                    {toPersianDigits(pendingInspections.length)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNotificationsTab('status')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                    notificationsTab === 'status'
                      ? 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>وضعیت و قوانین</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/15 dark:bg-black/25">
                    {toPersianDigits(statusNoticesCount)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNotificationsTab('logs')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                    notificationsTab === 'logs'
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>پیام‌های عملیات</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/15 dark:bg-black/25">
                    {toPersianDigits(notificationHistory.length)}
                  </span>
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 bg-white dark:bg-slate-900">
                {/* Unified Empty State when 'all' has zero items */}
                {notificationsTab === 'all' && totalAllNotifications === 0 && (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
                      <BellOff className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      هیچ اعلان فعالی وجود ندارد
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      تمامی ورودی‌های شمارش‌شده ثبت گردیده‌اند و هیچ هشدار باز یا خطایی برای کاردکس تعمیر سیلندر وجود ندارد.
                    </p>
                  </div>
                )}

                {/* SECTION 1: Pending Repair Cylinder & Customer Valve Intakes */}
                {(notificationsTab === 'pending' || (notificationsTab === 'all' && pendingInspections.length > 0)) && (
                  <section className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-amber-200">
                          ورودی‌های شمارش‌شده در انتظار ثبت در کاردکس ({toPersianDigits(pendingInspections.length)} مورد)
                        </h4>
                      </div>
                      {pendingInspections.length > 2 && (
                        <div className="relative w-full sm:w-56">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={pendingSearchQuery}
                            onChange={e => setPendingSearchQuery(e.target.value)}
                            placeholder="جستجوی مشتری، شماره فرم یا کالا..."
                            className="w-full text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pr-8 pl-2.5 py-1.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    {filteredPendingInspections.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1.5 bg-slate-50/70 dark:bg-slate-950/40">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {pendingInspections.length === 0
                            ? 'تمامی ورودی‌های انبار در کاردکس ثبت شده‌اند.'
                            : 'موردی با عبارت جستجو‌شده یافت نشد.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredPendingInspections.map((insp, idx) => {
                          const isValveItem = isCustomerValveInspection(insp);
                          return (
                            <div
                              key={insp.inspection_id}
                              className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-slate-950/80 border border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:border-amber-400 dark:hover:border-amber-600/70"
                            >
                              <div className="space-y-1.5 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="w-5 h-5 rounded-md bg-amber-200/80 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold font-mono flex items-center justify-center shrink-0">
                                    {toPersianDigits(idx + 1)}
                                  </span>
                                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                    {insp.customer_name || 'مشتری نامشخص'}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                      isValveItem
                                        ? 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/60'
                                        : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60'
                                    }`}
                                  >
                                    {isValveItem ? 'شیرآلات مشتری' : 'سیلندر تعمیری'}
                                  </span>
                                  {insp.form_number && (
                                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                                      فرم: {insp.form_number}
                                    </span>
                                  )}
                                  {insp.waybill_number && (
                                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                      بارنامه: {toPersianDigits(insp.waybill_number)}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-600 dark:text-slate-300">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {insp.item_name}
                                  </span>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                    سالم: {toPersianDigits(insp.actual_healthy_quantity)} عدد
                                  </span>
                                  {insp.defective_quantity > 0 && (
                                    <span className="text-rose-700 dark:text-rose-400 font-bold">
                                      معیوب: {toPersianDigits(insp.defective_quantity)} عدد
                                    </span>
                                  )}
                                  {insp.discrepancy_quantity !== 0 && (
                                    <span className="text-amber-700 dark:text-amber-400 font-bold">
                                      مغایرت: {toPersianDigits(insp.discrepancy_quantity)}
                                    </span>
                                  )}
                                  {insp.date && (
                                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                                      تاریخ: {toPersianDigits(insp.date)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setShowNotificationsModal(false);
                                  handleLoadInspectionIntoEntry(insp);
                                }}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0 whitespace-nowrap active:scale-95"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>ثبت کاردکس از روی این ورودی</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {/* SECTION 2: Status & Policy Notices */}
                {(notificationsTab === 'status' || (notificationsTab === 'all' && statusNoticesCount > 0)) && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <h4 className="text-xs font-extrabold text-slate-800 dark:text-indigo-200">
                        وضعیت کاردکس و قوانین نشست کاری
                      </h4>
                    </div>

                    {statusNoticesCount === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1.5 bg-slate-50/70 dark:bg-slate-950/40">
                        <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          وضعیت کاردکس و تراز اقلام عادی است.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">

                        {/* Negative Customer New Valve Balance Notice */}
                        {hasNegativeValveNotice && currentCylinderStockStatus && (
                          <div className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
                            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 leading-relaxed">
                              <div className="font-extrabold">
                                کسری موجودی شیر نو طرف حساب ({currentCustomer?.name} — {selectedCylinderType})
                              </div>
                              <p className="text-[11px] text-rose-800/90 dark:text-rose-300/90">
                                تراز فعلی شیر نو این مشتری{' '}
                                <strong className="font-mono">{formatPersianNumber(currentCylinderStockStatus.customerNewValveBalance)}</strong>{' '}
                                عدد می‌باشد. کسری شیر نو به‌صورت خودکار از موجودی انبار مرکزی ام‌گاز (موجودی فعلی:{' '}
                                <strong className="font-mono">{formatPersianNumber(currentCylinderStockStatus.warehouseMatchingValveStock)}</strong>{' '}
                                عدد) پوشش داده می‌شود.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* SECTION 3: Operation Messages / Recent Toast History */}
                {(notificationsTab === 'logs' || (notificationsTab === 'all' && notificationHistory.length > 0)) && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                          پیام‌های عملیات اخیر ({toPersianDigits(notificationHistory.length)})
                        </h4>
                      </div>
                      {notificationHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setNotificationHistory([])}
                          className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          پاک کردن تاریخچه
                        </button>
                      )}
                    </div>

                    {notificationHistory.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1.5 bg-slate-50/70 dark:bg-slate-950/40">
                        <Info className="w-6 h-6 text-slate-400 mx-auto" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                          هنوز پیام عملیاتی در این نشست ثبت نشده است.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {notificationHistory.map(item => (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                              item.type === 'error'
                                ? 'bg-rose-50/70 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-200'
                                : item.type === 'info'
                                ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800/60 dark:text-indigo-200'
                                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-200'
                            }`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              {item.type === 'error' ? (
                                <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                              ) : item.type === 'info' ? (
                                <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                              )}
                              <span className="leading-relaxed font-medium">{item.message}</span>
                            </div>
                            <span className="text-[10px] font-mono opacity-75 shrink-0 whitespace-nowrap" dir="ltr">
                              {item.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {onNavigateToInspections ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotificationsModal(false);
                      onNavigateToInspections();
                    }}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>مشاهده تمام برگه‌ها در ورود و خروج انبار و سیلندر</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={() => setShowNotificationsModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
