import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  RuntimeEnvironment,
  User,
  GasProductionKardexEntry,
  ProductionCylinderType,
  PRODUCTION_CYLINDER_TYPES,
  DEFAULT_PRODUCTION_CYLINDER_TYPE,
  STANDARD_VALVE_TYPES,
  STANDARD_NUT_TYPES,
  CylinderTankMapping,
  ProductionPartsAvailabilityResult,
  ProductionPartRequirement
} from '../types';
import { LocalStorageManager } from '../database/storage';
import { showConfirm } from '../utils/uiFeedback';
import {
  exportProductionKardexToXLSX,
  recalculateProductionKardexBalances,
  getSubVariantsForProduct,
  calculateSubVariantStockMap
} from '../database/production-kardex-data';
import {
  Boxes,
  Flame,
  Plus,
  Search,
  Printer,
  Trash2,
  Edit3,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Wrench,
  ChevronDown,
  Truck,
  PackageCheck,
  FileText,
  Clock,
  UserCheck,
  ShieldAlert,
  ArrowLeft,
  Copy,
  Calendar,
  Users,
  Filter,
  Sparkles,
  Download
} from 'lucide-react';
import { toPersianDigits, getPersianDate, formatNumberEn, generateUUID } from '../utils/persian';
import { PersianDatePicker } from './PersianDatePicker';
import { MGasOfficialLogo } from './MGasOfficialLogo';
import { GoodsExitReceiptModal } from './GoodsExitReceiptModal';
import { printReceiptSheet } from '../utils/receiptPrint';
import { exportElementToPdf } from '../utils/pdfExport';

export const FACTORY_VALVE_OPTIONS = [
  'شیر 11/25/50 کیلویی',
  'شیر پیکنیک 1/1.5/3 لیتری',
  'شیر 5 و 6 کیلویی',
  'شیر نو استاندارد ام‌گاز',
  'شیر نو ۱۱ کیلویی پرسی',
  'شیر نو ۱۱ کیلویی بوتان',
  'شیر نو ۱۱ کیلویی ایران گازی',
  'شیر نو ۱۱ کیلویی لیفتراک',
  'شیر نو ۱۱ کیلویی عراقی',
  'شیر نو پیکنیک ۵ کیلویی',
  'شیر نو پیکنیک ۲ کیلویی',
  'شیر استاندارد مخزن ۲ تن',
  'شیر استاندارد مخزن ۱ تن',
  'شیر ریکشا',
  'شیر بدون سوپاپ / سوپاپ‌دار',
  'بدون شیر'
];

export const FACTORY_NUT_OPTIONS = [
  'مهره 2 کیلویی',
  'مهره 5 کیلویی',
  'مهره 11/25/50 کیلویی بوتانی',
  'مهره 11/25/50 کیلویی پرسی',
  'مهره 11/25/50 کیلویی پاساری',
  'مهره 11/25/50 کیلویی ایرانگازی',
  'مهره مخزن زاپاس',
  'مهره تمام مخزن ها',
  'مهره لیفتراکی',
  'بدون مهره'
];

export interface ProductionOrderItem {
  id: string;
  cylinder_type: ProductionCylinderType;
  sub_variant: string;
  valve_type: string;
  valve_type_2?: string;
  nut_type: string;
  nut_type_2?: string;
  order_quantity: number;
  item_notes?: string;
}

interface GasProductionKardexViewProps {
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  onNavigateToRepairKardex?: () => void;
  onRefresh?: () => void;
}

export const GasProductionKardexView: React.FC<GasProductionKardexViewProps> = ({
  currentEnv,
  currentUser,
  onNavigateToRepairKardex,
  onRefresh
}) => {
  // 0. Dynamic Cylinder/Tank Catalog Mappings and available Production Products
  const [catalogMappings, setCatalogMappings] = useState<CylinderTankMapping[]>(() => {
    try {
      return LocalStorageManager.getCylinderTankMappings(currentEnv);
    } catch {
      return [];
    }
  });

  const [availableProductionCylinderTypes, setAvailableProductionCylinderTypes] = useState<ProductionCylinderType[]>(() => {
    try {
      const mappings = LocalStorageManager.getCylinderTankMappings(currentEnv);
      const produced = mappings.filter(m => m.is_produced).map(m => m.name as ProductionCylinderType);
      return produced.length > 0 ? produced : [...PRODUCTION_CYLINDER_TYPES];
    } catch {
      return [...PRODUCTION_CYLINDER_TYPES];
    }
  });

  // Synchronize available production cylinders when catalog mappings are added/edited/deleted
  useEffect(() => {
    const handleMappingsUpdated = () => {
      try {
        const mappings = LocalStorageManager.getCylinderTankMappings(currentEnv);
        setCatalogMappings(mappings);
        const produced = mappings.filter(m => m.is_produced).map(m => m.name as ProductionCylinderType);
        const nextTypes = produced.length > 0 ? produced : [...PRODUCTION_CYLINDER_TYPES];
        setAvailableProductionCylinderTypes(nextTypes);
        setSelectedProductType(prev => {
          if (!nextTypes.includes(prev)) {
            return (nextTypes[0] as ProductionCylinderType) || DEFAULT_PRODUCTION_CYLINDER_TYPE;
          }
          return prev;
        });
        setAllEntries(LocalStorageManager.getProductionKardexEntries(currentEnv));
      } catch {}
    };

    window.addEventListener('mgas:cylinder_mappings_updated', handleMappingsUpdated);
    window.addEventListener('mgas:database_refreshed', handleMappingsUpdated);
    return () => {
      window.removeEventListener('mgas:cylinder_mappings_updated', handleMappingsUpdated);
      window.removeEventListener('mgas:database_refreshed', handleMappingsUpdated);
    };
  }, [currentEnv]);

  // 1. Selected Product category
  const [selectedProductType, setSelectedProductType] = useState<ProductionCylinderType>(
    DEFAULT_PRODUCTION_CYLINDER_TYPE
  );

  // 2. Active sub-variant filter ('ALL' or specific sub-item like 'تپل', 'دراز', 'ریکشا', 'ساده', '1 لیتری'...)
  const [selectedSubVariant, setSelectedSubVariant] = useState<string>('استاندارد');

  // Track the chosen sub-variant for each of the products
  const [selectedSubVariantsByProduct, setSelectedSubVariantsByProduct] = useState<Record<string, string>>({
    'سیلندر 11 کیلویی': 'استاندارد',
    'سیلندر 25 کیلویی': 'استاندارد',
    'سیلندر 50 کیلویی': 'استاندارد',
    'سیلندر لیفتراکی': 'استاندارد',
    'مخزن 20 کیلویی(تپل/دراز)': 'تپل',
    'مخزن 25 کیلویی (تپل/دراز)': 'تپل',
    'مخزن 30 کیلویی(ریکشا/ساده)': 'ریکشا',
    'مخزن 35 کیلویی (ریکشا/ساده/تپل)': 'ریکشا',
    'مخزن 60 لیتری': 'استاندارد',
    'مخزن 80 لیتری': 'استاندارد',
    'مخزن 105 لیتری': 'استاندارد',
    'مخزن 125 لیتری': 'استاندارد',
    'پیکنیک 1/1.5/3 لیتری': '1 لیتری',
    'پیکنیک 5/8 کیلویی': '5 کیلویی'
  });

  // 3. Entries State
  const [allEntries, setAllEntries] = useState<GasProductionKardexEntry[]>(() => {
    return LocalStorageManager.getProductionKardexEntries(currentEnv);
  });

  // 4. Customers List for quick selection in Order registration
  const customerList = useMemo(() => {
    try {
      return LocalStorageManager.getState(currentEnv).customers || [];
    } catch {
      return [];
    }
  }, [currentEnv]);

  // 5. Professional Search and Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'orders' | 'completed' | 'rejects'>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('ALL');
  const [selectedValveFilter, setSelectedValveFilter] = useState<string>('ALL');
  const [searchAllProducts, setSearchAllProducts] = useState<boolean>(false);

  // Toggle for showing/hiding action bar and search/filter box
  const [isActionBarExpanded, setIsActionBarExpanded] = useState<boolean>(true);

  // List of all unique customer names for filter dropdown with their record counts
  const customerFilterOptions = useMemo(() => {
    const countsMap = new Map<string, number>();

    allEntries.forEach(e => {
      if (e.is_deleted) return;
      const c = e.customer_name?.trim() || e.destination_or_source?.trim();
      if (c) {
        countsMap.set(c, (countsMap.get(c) || 0) + 1);
      }
    });

    customerList.forEach(cust => {
      const name = cust.company_name?.trim() || cust.name?.trim();
      if (name && !countsMap.has(name)) {
        countsMap.set(name, 0);
      }
    });

    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count && (a.count === 0 || b.count === 0)) {
          return b.count - a.count;
        }
        return a.name.localeCompare(b.name, 'fa');
      });
  }, [allEntries, customerList]);

  // List of all unique valve options for filter dropdown with their record counts
  const valveFilterOptions = useMemo(() => {
    const countsMap = new Map<string, number>();

    allEntries.forEach(e => {
      if (e.is_deleted) return;
      const v1 = e.valve_type?.trim();
      const v2 = e.valve_type_2?.trim();
      if (v1) countsMap.set(v1, (countsMap.get(v1) || 0) + 1);
      if (v2 && v2 !== v1) countsMap.set(v2, (countsMap.get(v2) || 0) + 1);
    });

    FACTORY_VALVE_OPTIONS.forEach(opt => {
      if (!countsMap.has(opt)) {
        countsMap.set(opt, 0);
      }
    });

    return Array.from(countsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count && (a.count === 0 || b.count === 0)) {
          return b.count - a.count;
        }
        return a.name.localeCompare(b.name, 'fa');
      });
  }, [allEntries]);

  // Quick Persian date preset setter
  const handleSetDatePreset = (preset: 'today' | 'last7' | 'last30' | 'thisMonth' | 'thisYear' | 'clear') => {
    const todayStr = getPersianDate();
    if (preset === 'clear') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
      return;
    }
    if (preset === 'last7') {
      const past = new Date(Date.now() - 7 * 86400000);
      setFromDate(getPersianDate(past));
      setToDate(todayStr);
      return;
    }
    if (preset === 'last30') {
      const past = new Date(Date.now() - 30 * 86400000);
      setFromDate(getPersianDate(past));
      setToDate(todayStr);
      return;
    }
    if (preset === 'thisMonth') {
      const parts = todayStr.split('/');
      if (parts.length === 3) {
        setFromDate(`${parts[0]}/${parts[1]}/01`);
        setToDate(todayStr);
      }
      return;
    }
    if (preset === 'thisYear') {
      const parts = todayStr.split('/');
      const year = parts[0] || '1405';
      setFromDate(`${year}/01/01`);
      setToDate(`${year}/12/29`);
      return;
    }
  };

  // Flag to know if any filter is actively applied
  const isAnyFilterActive = useMemo(() => {
    return Boolean(
      searchQuery.trim() ||
      fromDate.trim() ||
      toDate.trim() ||
      (selectedCustomerFilter && selectedCustomerFilter !== 'ALL') ||
      (selectedValveFilter && selectedValveFilter !== 'ALL') ||
      directionFilter !== 'all' ||
      shiftFilter !== 'all' ||
      searchAllProducts
    );
  }, [searchQuery, fromDate, toDate, selectedCustomerFilter, selectedValveFilter, directionFilter, shiftFilter, searchAllProducts]);

  // Reset all filters back to defaults
  const handleResetAllFilters = () => {
    setSearchQuery('');
    setFromDate('');
    setToDate('');
    setSelectedCustomerFilter('ALL');
    setSelectedValveFilter('ALL');
    setDirectionFilter('all');
    setShiftFilter('all');
    setSearchAllProducts(false);
  };

  // 6. Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'NEW_ORDER' | 'COMPLETE_DELIVERY'>('NEW_ORDER');
  const [selectedOrderIdForDelivery, setSelectedOrderIdForDelivery] = useState<string>('');
  const [partsDeficitModalData, setPartsDeficitModalData] = useState<ProductionPartsAvailabilityResult | null>(null);

  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<GasProductionKardexEntry | null>(null);
  const [showTrashModal, setShowTrashModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [deletingEntry, setDeletingEntry] = useState<GasProductionKardexEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');

  const handlePrintProductionKardex = () => {
    printReceiptSheet({
      elementId: 'printable-production-kardex',
      title: `کاردکس تولید - ${selectedProductType}`,
      paperSize: 'A4',
      orientation: 'landscape'
    });
  };

  const handleExportProductionKardexPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportElementToPdf('printable-production-kardex', {
        filename: `kardex_tolid_${selectedProductType.replace(/\s+/g, '_')}.pdf`,
        orientation: 'landscape',
        format: 'a4',
        marginMm: 4
      });
    } catch (err) {
      console.error('Production Kardex PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Factory Exit Receipt Modal (برگه فقط خروج از کارخانه مطابق کاردکس تعمیر)
  const [showExitReceiptModal, setShowExitReceiptModal] = useState<boolean>(false);
  const [selectedProductionEntryForExitReceipt, setSelectedProductionEntryForExitReceipt] = useState<GasProductionKardexEntry | null>(null);

  // Dedicated Order Details Modal (نوشتن شماره برگه در جزئیات سفارش در بخش عملیات)
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<GasProductionKardexEntry | null>(null);

  // Helper to summarize & shorten movement descriptions for ultra-compact table display
  const summarizeProductionDescription = (desc: string | undefined, isOrder: boolean, isDelivery: boolean) => {
    if (!desc || !desc.trim()) {
      return isOrder ? 'سفارش ساخت' : (isDelivery ? 'تحویل سفارش' : 'گردش تولید');
    }
    const clean = desc.trim();
    if (clean.includes('اتمام کار و تحویل')) return 'تحویل سفارش';
    if (clean.includes('سفارش ساخت') || clean.includes('ثبت سفارش')) return 'سفارش ساخت';
    if (clean.includes('موجودی اولیه') || clean.includes('تراز اول دوره')) return 'موجودی اولیه';
    if (clean.includes('تولید')) return 'تولید محصول';
    if (clean.includes('تحویل')) return 'تحویل محصول';
    if (clean.length > 22) return clean.slice(0, 20) + '…';
    return clean;
  };

  const handleOpenExitReceipt = (entry: GasProductionKardexEntry) => {
    setSelectedProductionEntryForExitReceipt(entry);
    setShowExitReceiptModal(true);
  };

  // Notification toast
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Sync state when environment updates
  const refreshLocalState = useCallback(() => {
    const fresh = LocalStorageManager.getProductionKardexEntries(currentEnv);
    setAllEntries([...fresh]);
    onRefresh?.();
  }, [currentEnv, onRefresh]);

  useEffect(() => {
    refreshLocalState();
    const handleUpdated = () => refreshLocalState();
    const handlePurged = () => {
      setAllEntries([]);
      onRefresh?.();
    };
    window.addEventListener('mgas:db_refreshed', handleUpdated);
    window.addEventListener('mgas:database_purged', handlePurged);
    return () => {
      window.removeEventListener('mgas:db_refreshed', handleUpdated);
      window.removeEventListener('mgas:database_purged', handlePurged);
    };
  }, [refreshLocalState, onRefresh]);

  // Real-time stock map for each product and its sub-variants
  const subVariantStockMap = useMemo(() => {
    return calculateSubVariantStockMap(allEntries, catalogMappings);
  }, [allEntries, catalogMappings]);

  // All active open orders that have not been fully completed/delivered yet
  const openOrders = useMemo(() => {
    return allEntries.filter(e => {
      if (e.is_deleted) return false;
      const isCompleted = e.order_status === 'COMPLETED' || (e.dispatch_out > 0 && !e.order_status);
      const isOrder =
        e.order_status === 'IN_PROGRESS' ||
        e.order_status === 'ORDER_PENDING' ||
        e.transfer_sheet_number?.startsWith('ORD-') ||
        (e.production_in > 0 && e.dispatch_out === 0 && !e.completed_at);
      return isOrder && !isCompleted;
    });
  }, [allEntries]);

  // Open orders specifically for the current active product and sub-variant
  const openOrdersForSelectedProduct = useMemo(() => {
    return openOrders.filter(e => {
      if (e.cylinder_type !== selectedProductType) return false;
      if (selectedSubVariant && selectedSubVariant !== 'ALL') {
        return (e.sub_variant || 'استاندارد') === selectedSubVariant;
      }
      return true;
    });
  }, [openOrders, selectedProductType, selectedSubVariant]);

  // 1. Form State for "ثبت سفارش جدید"
  const [orderForm, setOrderForm] = useState({
    date: getPersianDate(),
    order_sheet_number: `ORD-${getPersianDate().replace(/\//g, '')}-${Date.now().toString().slice(-3)}`,
    batch_number: '',
    customer_name: '',
    shift_name: 'صبح',
    supervisor: currentUser.full_name || 'مهندس عمویی',
    delivery_deadline: '',
    notes: ''
  });

  // Multiple product items in a single order (پشتیبانی از ثبت همزمان چند محصول)
  const [orderItems, setOrderItems] = useState<ProductionOrderItem[]>([
    {
      id: 'item-1',
      cylinder_type: DEFAULT_PRODUCTION_CYLINDER_TYPE as ProductionCylinderType,
      sub_variant: 'استاندارد',
      valve_type: 'شیر نو استاندارد ام‌گاز',
      valve_type_2: 'شیر نو ۱۱ کیلویی لیفتراک',
      nut_type: 'مهره 11/25/50 کیلویی بوتانی',
      nut_type_2: 'مهره لیفتراکی',
      order_quantity: 50,
      item_notes: ''
    }
  ]);

  // 2. Form State for "اتمام کار و تحویل"
  const [deliveryForm, setDeliveryForm] = useState({
    date: getPersianDate(),
    delivery_sheet_number: `DSP-${getPersianDate().replace(/\//g, '')}-${Date.now().toString().slice(-3)}`,
    delivered_quantity: 50,
    defect_reject: 0,
    driver_name: '',
    plate_number: '',
    waybill_number: '',
    supervisor: currentUser.full_name || 'مهندس عمویی',
    shift_name: 'صبح',
    notes: ''
  });

  // Available sub-variants for current selected category
  const currentCategorySubVariants = useMemo(() => {
    return getSubVariantsForProduct(selectedProductType, catalogMappings);
  }, [selectedProductType, catalogMappings]);

  // Dynamic Nut list retrieved EXCLUSIVELY from "دسته مهره‌ها" category in warehouse catalog
  const availableNutOptions = useMemo(() => {
    const state = LocalStorageManager.getState(currentEnv);
    const nutCat = (state.categories || []).find(
      c => c.category_id === 'CAT-NUTS' || c.name.includes('مهره') || c.code === 'NUT'
    );
    const catId = nutCat ? nutCat.category_id : 'CAT-NUTS';

    // Get all products assigned to the Nuts category
    const nutProducts = (state.products || []).filter(
      p => p.category_id === catId || p.category_id === 'CAT-NUTS'
    );

    const names = nutProducts.map(p => p.name.trim()).filter(Boolean);

    // Fallback if none found
    if (names.length === 0) {
      names.push(
        'مهره 2 کیلویی',
        'مهره 5 کیلویی',
        'مهره 11/25/50 کیلویی بوتانی',
        'مهره 11/25/50 کیلویی پرسی',
        'مهره 11/25/50 کیلویی پاساری',
        'مهره 11/25/50 کیلویی ایرانگازی',
        'مهره مخزن زاپاس',
        'مهره تمام مخزن ها',
        'مهره لیفتراکی'
      );
    }

    // Always include "بدون مهره" as an option
    if (!names.includes('بدون مهره')) {
      names.push('بدون مهره');
    }

    return names;
  }, [currentEnv, allEntries]);

  // Synchronize orderItems nut_type and nut_type_2 if current values are not in availableNutOptions
  useEffect(() => {
    if (showAddModal) return; // Do not overwrite values while user is actively filling the modal
    if (availableNutOptions.length > 0) {
      setOrderItems(prev => prev.map(item => {
        let changed = false;
        let newNut = item.nut_type;
        let newNut2 = item.nut_type_2;
        if (!availableNutOptions.includes(item.nut_type)) {
          newNut = availableNutOptions[0];
          changed = true;
        }
        if (item.nut_type_2 && !availableNutOptions.includes(item.nut_type_2)) {
          newNut2 = availableNutOptions.find(n => n.includes('لیفتراک')) || availableNutOptions[0];
          changed = true;
        }
        return changed ? { ...item, nut_type: newNut, nut_type_2: newNut2 } : item;
      }));
    }
  }, [availableNutOptions, showAddModal]);

  // Synchronize orderItems defaults when product or sub-variant changes
  useEffect(() => {
    if (showAddModal) return; // CRITICAL: Never overwrite orderForm while the modal is open!
    const currentSub = selectedSubVariantsByProduct[selectedProductType] || getSubVariantsForProduct(selectedProductType)[0] || 'استاندارد';
    const isForklift = selectedProductType === 'سیلندر لیفتراکی';
    const forkliftNut = availableNutOptions.find(n => n.includes('لیفتراک')) || 'مهره لیفتراکی';
    setOrderItems(prev => {
      if (prev.length === 0) return prev;
      return [
        {
          ...prev[0],
          cylinder_type: selectedProductType,
          sub_variant: currentSub,
          valve_type: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : (prev[0].valve_type.includes('لیفتراک') ? 'شیر نو استاندارد ام‌گاز' : prev[0].valve_type),
          valve_type_2: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : prev[0].valve_type_2,
          nut_type: isForklift ? forkliftNut : prev[0].nut_type,
          nut_type_2: isForklift ? forkliftNut : prev[0].nut_type_2,
        },
        ...prev.slice(1)
      ];
    });
  }, [selectedProductType, selectedSubVariantsByProduct, showAddModal, availableNutOptions]);

  // When opening "اتمام کار و تحویل" or selecting an order, load its data into deliveryForm
  const activeOrderToDeliver = useMemo(() => {
    if (!selectedOrderIdForDelivery) {
      return openOrdersForSelectedProduct[0] || openOrders[0] || null;
    }
    return allEntries.find(e => e.entry_id === selectedOrderIdForDelivery) || null;
  }, [selectedOrderIdForDelivery, openOrdersForSelectedProduct, openOrders, allEntries]);

  useEffect(() => {
    if (activeOrderToDeliver) {
      setDeliveryForm(prev => ({
        ...prev,
        delivered_quantity: activeOrderToDeliver.order_quantity || activeOrderToDeliver.production_in || 1,
        delivery_sheet_number: `DSP-${getPersianDate().replace(/\//g, '')}-${Date.now().toString().slice(-3)}`
      }));
    }
  }, [activeOrderToDeliver]);

  // Real-time stock verification of required valves and nuts in Production Line Warehouse (WH-PRODUCTION)
  const partsAvailability = useMemo(() => {
    if (!activeOrderToDeliver || modalMode !== 'COMPLETE_DELIVERY') return null;
    const isForklift = activeOrderToDeliver.cylinder_type === 'سیلندر لیفتراکی' || activeOrderToDeliver.cylinder_type?.includes('لیفتراک');
    const valveType = activeOrderToDeliver.valve_type || (isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز');
    const valveType2 = activeOrderToDeliver.valve_type_2 || (isForklift ? valveType : undefined);
    const nutType = activeOrderToDeliver.nut_type || (isForklift ? 'مهره لیفتراکی' : 'مهره 11/25/50 کیلویی بوتانی');
    const nutType2 = activeOrderToDeliver.nut_type_2 || (isForklift ? nutType : undefined);
    const deliveredQty = Math.max(1, Number(deliveryForm.delivered_quantity) || 1);

    return LocalStorageManager.checkProductionPartsAvailability(currentEnv, {
      cylinderType: activeOrderToDeliver.cylinder_type,
      subVariant: activeOrderToDeliver.sub_variant,
      valveType,
      valveType2,
      nutType,
      nutType2,
      quantity: deliveredQty
    });
  }, [activeOrderToDeliver, modalMode, deliveryForm.delivered_quantity, currentEnv, allEntries]);

  // Active entries filtered by selected product (Active only, excluding trashed)
  const productEntries = useMemo(() => {
    const filtered = allEntries.filter(
      e => e.cylinder_type === selectedProductType && !e.is_deleted
    );
    const sorted = [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const calculated = recalculateProductionKardexBalances(sorted);

    // If a specific sub-variant is chosen, filter down to it
    if (selectedSubVariant && selectedSubVariant !== 'ALL') {
      return calculated.filter(e => (e.sub_variant || 'استاندارد') === selectedSubVariant);
    }
    return calculated;
  }, [allEntries, selectedProductType, selectedSubVariant]);

  // Trashed entries
  const trashedEntries = useMemo(() => {
    return allEntries.filter(e => e.is_deleted);
  }, [allEntries]);

  // KPI Statistics for current selected product & sub-variant
  const stats = useMemo(() => {
    const subs = getSubVariantsForProduct(selectedProductType);
    let curBal = 0;

    if (selectedSubVariant && selectedSubVariant !== 'ALL') {
      curBal = subVariantStockMap[selectedProductType]?.[selectedSubVariant] || 0;
    } else {
      curBal = subs.reduce((sum, s) => sum + (subVariantStockMap[selectedProductType]?.[s] || 0), 0);
    }

    const totalProdIn = productEntries.reduce((acc, cur) => acc + (Number(cur.production_in) || 0), 0);
    const totalDispOut = productEntries.reduce((acc, cur) => acc + (Number(cur.dispatch_out) || 0), 0);
    const totalRejects = productEntries.reduce((acc, cur) => acc + (Number(cur.defect_reject) || 0), 0);
    const pendingOrdersCount = productEntries.filter(e => e.order_status === 'IN_PROGRESS' || (e.production_in > 0 && e.dispatch_out === 0 && !e.completed_at)).length;

    return {
      currentBalance: curBal,
      totalProductionIn: totalProdIn,
      totalDispatchOut: totalDispOut,
      totalRejects,
      pendingOrdersCount,
      totalRecords: productEntries.length
    };
  }, [productEntries, selectedProductType, selectedSubVariant, subVariantStockMap]);

  // Filtered entries for table view (Search, Customer, Date Range & Status filters)
  const displayedEntries = useMemo(() => {
    let baseList = searchAllProducts
      ? allEntries.filter(e => !e.is_deleted)
      : productEntries;

    let result = baseList;

    // 1. Status / Direction Filter
    if (directionFilter === 'orders') {
      result = result.filter(e => e.order_status === 'IN_PROGRESS' || Number(e.production_in) > 0 || (e.transfer_sheet_number && e.transfer_sheet_number.startsWith('ORD-')));
    } else if (directionFilter === 'completed') {
      result = result.filter(e => e.order_status === 'COMPLETED' || Number(e.dispatch_out) > 0 || (e.transfer_sheet_number && e.transfer_sheet_number.startsWith('DSP-')));
    } else if (directionFilter === 'rejects') {
      result = result.filter(e => Number(e.defect_reject) > 0);
    }

    // 2. Customer Filter
    if (selectedCustomerFilter && selectedCustomerFilter !== 'ALL') {
      const targetCust = selectedCustomerFilter.trim().toLowerCase();
      result = result.filter(e => {
        const c1 = (e.customer_name || '').trim().toLowerCase();
        const c2 = (e.destination_or_source || '').trim().toLowerCase();
        const c3 = (e.description || '').trim().toLowerCase();
        return c1 === targetCust || c2 === targetCust || c3.includes(targetCust);
      });
    }

    // 2.5 Valve Type Filter (نوع شیر مصرفی)
    if (selectedValveFilter && selectedValveFilter !== 'ALL') {
      const targetValve = selectedValveFilter.trim().toLowerCase();
      result = result.filter(e => {
        const v1 = (e.valve_type || '').trim().toLowerCase();
        const v2 = (e.valve_type_2 || '').trim().toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const notes = (e.notes || '').toLowerCase();
        return (
          v1 === targetValve ||
          v2 === targetValve ||
          v1.includes(targetValve) ||
          v2.includes(targetValve) ||
          desc.includes(targetValve) ||
          notes.includes(targetValve)
        );
      });
    }

    // 3. Date Range Filter (From Date / To Date)
    if (fromDate.trim()) {
      result = result.filter(e => (e.date || '') >= fromDate.trim());
    }
    if (toDate.trim()) {
      result = result.filter(e => (e.date || '') <= toDate.trim());
    }

    // 4. Shift Filter
    if (shiftFilter !== 'all') {
      result = result.filter(e => e.shift_name === shiftFilter);
    }

    // 5. Full text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(e =>
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.customer_name && e.customer_name.toLowerCase().includes(q)) ||
        (e.sub_variant && e.sub_variant.toLowerCase().includes(q)) ||
        (e.cylinder_type && e.cylinder_type.toLowerCase().includes(q)) ||
        (e.transfer_sheet_number && e.transfer_sheet_number.toLowerCase().includes(q)) ||
        (e.reference_order_id && e.reference_order_id.toLowerCase().includes(q)) ||
        (e.delivery_sheet_number && e.delivery_sheet_number.toLowerCase().includes(q)) ||
        (e.batch_number && e.batch_number.toLowerCase().includes(q)) ||
        (e.supervisor && e.supervisor.toLowerCase().includes(q)) ||
        (e.destination_or_source && e.destination_or_source.toLowerCase().includes(q)) ||
        (e.valve_type && e.valve_type.toLowerCase().includes(q)) ||
        (e.nut_type && e.nut_type.toLowerCase().includes(q)) ||
        (e.driver_name && e.driver_name.toLowerCase().includes(q)) ||
        (e.plate_number && e.plate_number.toLowerCase().includes(q)) ||
        (e.waybill_number && e.waybill_number.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.date && e.date.includes(q))
      );
    }

    return result;
  }, [allEntries, productEntries, searchAllProducts, directionFilter, shiftFilter, selectedCustomerFilter, selectedValveFilter, fromDate, toDate, searchQuery]);

  // Handle Switch Product & Sub-Variant
  const handleSelectProduct = (type: ProductionCylinderType, subVar?: string) => {
    setSelectedProductType(type);
    const targetSub = subVar || selectedSubVariantsByProduct[type] || getSubVariantsForProduct(type, catalogMappings)[0] || 'استاندارد';
    setSelectedSubVariant(targetSub);
    setSelectedSubVariantsByProduct(prev => ({ ...prev, [type]: targetSub }));
    showToast(`کاردکس تولید: «${type}» ${targetSub !== 'ALL' && targetSub !== 'استاندارد' ? `(مدل ${targetSub})` : ''}`);
  };

  // Item handlers for multi-product orders
  const handleAddOrderItem = () => {
    const existingTypes = new Set(orderItems.map(i => i.cylinder_type));
    const nextType: ProductionCylinderType = availableProductionCylinderTypes.find(t => !existingTypes.has(t)) || selectedProductType || availableProductionCylinderTypes[0] || PRODUCTION_CYLINDER_TYPES[0];
    const subs = getSubVariantsForProduct(nextType, catalogMappings);
    const isForklift = nextType === 'سیلندر لیفتراکی';
    const forkliftNut = availableNutOptions.find(n => n.includes('لیفتراک')) || 'مهره لیفتراکی';
    const standardNut = availableNutOptions.find(n => n.includes('بوتانی') || n.includes('11/25/50')) || availableNutOptions[0] || 'مهره 11/25/50 کیلویی بوتانی';

    setOrderItems(prev => [
      ...prev,
      {
        id: generateUUID('ITEM'),
        cylinder_type: nextType,
        sub_variant: subs[0] || 'استاندارد',
        valve_type: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز',
        valve_type_2: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو ۱۱ کیلویی لیفتراک',
        nut_type: isForklift ? forkliftNut : standardNut,
        nut_type_2: isForklift ? forkliftNut : 'مهره لیفتراکی',
        order_quantity: 50,
        item_notes: ''
      }
    ]);
  };

  const handleRemoveOrderItem = (itemId: string) => {
    if (orderItems.length <= 1) return;
    setOrderItems(prev => prev.filter(i => i.id !== itemId));
  };

  const handleUpdateOrderItem = (itemId: string, updates: Partial<ProductionOrderItem>) => {
    setOrderItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, ...updates };
      if (updates.cylinder_type && updates.cylinder_type !== item.cylinder_type) {
        const subs = getSubVariantsForProduct(updates.cylinder_type, catalogMappings);
        const isForklift = updates.cylinder_type === 'سیلندر لیفتراکی';
        const forkliftNut = availableNutOptions.find(n => n.includes('لیفتراک')) || 'مهره لیفتراکی';
        const standardNut = availableNutOptions.find(n => n.includes('بوتانی') || n.includes('11/25/50')) || availableNutOptions[0] || 'مهره 11/25/50 کیلویی بوتانی';
        updated.sub_variant = subs[0] || 'استاندارد';
        updated.valve_type = isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : (item.valve_type?.includes('لیفتراک') ? 'شیر نو استاندارد ام‌گاز' : item.valve_type);
        updated.nut_type = isForklift ? forkliftNut : (item.nut_type?.includes('لیفتراک') ? standardNut : item.nut_type);
      }
      return updated;
    }));
  };

  // Open "ثبت سفارش جدید" Modal
  const handleOpenNewOrderModal = () => {
    const currentSub = selectedSubVariantsByProduct[selectedProductType] || getSubVariantsForProduct(selectedProductType, catalogMappings)[0] || 'استاندارد';
    const isForklift = selectedProductType === 'سیلندر لیفتراکی';
    const forkliftNut = availableNutOptions.find(n => n.includes('لیفتراک')) || 'مهره لیفتراکی';
    const standardNut = availableNutOptions.find(n => n.includes('بوتانی') || n.includes('11/25/50')) || availableNutOptions[0] || 'مهره 11/25/50 کیلویی بوتانی';
    setOrderForm({
      date: getPersianDate(),
      order_sheet_number: `ORD-${getPersianDate().replace(/\//g, '')}-${Date.now().toString().slice(-3)}`,
      batch_number: '',
      customer_name: '',
      shift_name: 'صبح',
      supervisor: currentUser.full_name || 'مهندس عمویی',
      delivery_deadline: '',
      notes: ''
    });
    setOrderItems([
      {
        id: generateUUID('ITEM'),
        cylinder_type: selectedProductType,
        sub_variant: currentSub,
        valve_type: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز',
        valve_type_2: isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو ۱۱ کیلویی لیفتراک',
        nut_type: isForklift ? forkliftNut : standardNut,
        nut_type_2: isForklift ? forkliftNut : 'مهره لیفتراکی',
        order_quantity: 50,
        item_notes: ''
      }
    ]);
    setModalMode('NEW_ORDER');
    setShowAddModal(true);
  };

  // Open "اتمام کار و تحویل" Modal with strict direct validation
  const handleOpenCompleteDeliveryModal = (targetOrderId?: string) => {
    if (targetOrderId) {
      setSelectedOrderIdForDelivery(targetOrderId);
    } else {
      const bestOrder = openOrdersForSelectedProduct[0] || openOrders[0];
      setSelectedOrderIdForDelivery(bestOrder ? bestOrder.entry_id : '');
    }
    setDeliveryForm(prev => ({
      ...prev,
      delivery_sheet_number: `DSP-${getPersianDate().replace(/\//g, '')}-${Date.now().toString().slice(-3)}`
    }));
    setModalMode('COMPLETE_DELIVERY');
    setShowAddModal(true);
  };

  // 1. Submit "ثبت سفارش جدید" (پشتیبانی کامل از ثبت همزمان چند محصول)
  const handleSubmitNewOrder = (e: React.FormEvent) => {
    e.preventDefault();

    if (orderItems.length === 0) {
      showToast('حداقل یک محصول برای ثبت سفارش لازم است.', 'error');
      return;
    }

    const customer = orderForm.customer_name.trim() || 'سفارش متفرقه / نمایندگی';
    const baseSheetNo = orderForm.order_sheet_number.trim() || `ORD-${Date.now().toString().slice(-5)}`;
    const totalItems = orderItems.length;
    let totalCylinders = 0;

    orderItems.forEach((item, index) => {
      const orderQty = Math.max(1, Number(item.order_quantity) || 1);
      totalCylinders += orderQty;
      const subVar = item.sub_variant || 'استاندارد';
      const isForklift = item.cylinder_type === 'سیلندر لیفتراکی';
      const valveType = item.valve_type?.trim() || (isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز');
      const valveType2 = isForklift ? (item.valve_type_2?.trim() || valveType) : undefined;
      const nutType = item.nut_type?.trim() || (isForklift ? 'مهره لیفتراکی' : 'مهره 11/25/50 کیلویی بوتانی');
      const nutType2 = isForklift ? (item.nut_type_2?.trim() || nutType) : undefined;

      const itemSheetNo = totalItems > 1 ? `${baseSheetNo}-${toPersianDigits(index + 1)}` : baseSheetNo;

      const partsDesc = isForklift
        ? `شیرها: [۱: ${valveType}، ۲: ${valveType2}] | مهره‌ها: [۱: ${nutType}، ۲: ${nutType2}]`
        : `شیر: ${valveType} | مهره: ${nutType}`;

      const newOrderEntry: GasProductionKardexEntry = {
        entry_id: generateUUID('ORD'),
        cylinder_type: item.cylinder_type,
        sub_variant: subVar,
        valve_type: valveType,
        valve_type_2: valveType2,
        nut_type: nutType,
        nut_type_2: nutType2,
        date: orderForm.date || getPersianDate(),
        description: `سفارش جدید: ساخت و تولید ${formatNumberEn(orderQty)} عدد ${item.cylinder_type} (${subVar}) ${totalItems > 1 ? `(قلم ${toPersianDigits(index + 1)} از ${toPersianDigits(totalItems)})` : ''} - ${partsDesc} - سفارش‌دهنده: ${customer}`,
        transfer_sheet_number: itemSheetNo,
        batch_number: orderForm.batch_number.trim(),
        order_id: itemSheetNo,
        order_status: 'IN_PROGRESS',
        order_quantity: orderQty,
        customer_name: customer,
        production_in: orderQty,
        dispatch_out: 0,
        defect_reject: 0,
        stock_balance: 0,
        shift_name: orderForm.shift_name,
        supervisor: orderForm.supervisor.trim() || currentUser.full_name,
        destination_or_source: customer,
        notes: [
          orderForm.notes.trim(),
          item.item_notes?.trim() || '',
          isForklift ? 'سیلندر لیفتراکی مجهز به ۲ عدد شیر و ۲ عدد مهره' : '',
          orderForm.delivery_deadline ? `مهلت تحویل: ${orderForm.delivery_deadline}` : ''
        ].filter(Boolean).join(' | '),
        user_id: currentUser.user_id,
        created_by_username: currentUser.username,
        device_id: currentUser.allowed_device_id,
        event_id: generateUUID('EVT'),
        created_at: new Date(Date.now() + index * 50).toISOString(),
        updated_at: new Date(Date.now() + index * 50).toISOString()
      };

      LocalStorageManager.saveProductionKardexEntry(currentEnv, newOrderEntry, currentUser);
    });

    const firstItem = orderItems[0];
    if (firstItem) {
      setSelectedProductType(firstItem.cylinder_type);
      setSelectedSubVariant(firstItem.sub_variant);
      setSelectedSubVariantsByProduct(prev => ({ ...prev, [firstItem.cylinder_type]: firstItem.sub_variant }));
    }
    setShowAddModal(false);
    refreshLocalState();

    if (totalItems > 1) {
      showToast(`سفارش چندمحصولی شماره «${baseSheetNo}» شامل ${toPersianDigits(totalItems)} قلم کالا و مجموعاً ${toPersianDigits(totalCylinders)} عدد کپسول با موفقیت ثبت شد.`, 'success');
    } else {
      showToast(`سفارش شماره «${baseSheetNo}» با تیراژ ${toPersianDigits(totalCylinders)} عدد با موفقیت ثبت شد.`, 'success');
    }
  };

  // 2. Submit "اتمام کار و تحویل"
  const handleSubmitCompleteDelivery = (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeOrderToDeliver) {
      showToast('خطا: هیچ سفارشی جهت اتمام کار و تحویل انتخاب نشده است.', 'error');
      return;
    }

    const deliveredQty = Math.max(1, Number(deliveryForm.delivered_quantity) || 1);
    const defectQty = Math.max(0, Number(deliveryForm.defect_reject) || 0);
    const dspSheetNo = deliveryForm.delivery_sheet_number.trim() || `DSP-${Date.now().toString().slice(-5)}`;
    const customer = activeOrderToDeliver.customer_name || activeOrderToDeliver.destination_or_source || 'نمایندگی / مشتری';
    const subVar = activeOrderToDeliver.sub_variant || 'استاندارد';
    const isForklift = activeOrderToDeliver.cylinder_type === 'سیلندر لیفتراکی' || activeOrderToDeliver.cylinder_type?.includes('لیفتراک');
    const valveType = activeOrderToDeliver.valve_type || (isForklift ? 'شیر نو ۱۱ کیلویی لیفتراک' : 'شیر نو استاندارد ام‌گاز');
    const valveType2 = activeOrderToDeliver.valve_type_2 || (isForklift ? valveType : undefined);
    const nutType = activeOrderToDeliver.nut_type || (isForklift ? 'مهره لیفتراکی' : 'مهره 11/25/50 کیلویی بوتانی');
    const nutType2 = activeOrderToDeliver.nut_type_2 || (isForklift ? nutType : undefined);

    // CRITICAL REQUIREMENT:
    // Before completing or creating delivery kardex, verify required valves and nuts in WH-PRODUCTION!
    const availability = LocalStorageManager.checkProductionPartsAvailability(
      currentEnv,
      {
        cylinderType: activeOrderToDeliver.cylinder_type,
        subVariant: subVar,
        valveType,
        valveType2,
        nutType,
        nutType2,
        quantity: deliveredQty
      }
    );

    if (!availability.available) {
      setPartsDeficitModalData(availability);
      showToast(
        `اخطار عدم امکان اتمام کار: ${toPersianDigits(availability.missingParts.length)} قلم کالا (شیر/مهره) در انبار خط تولید موجود نیست یا کسری دارد. انباردار ابتدا باید انتقال را ثبت کند.`,
        'error'
      );
      return;
    }

    // 1. Deduct the corresponding valve and nut parts from Production Warehouse (انبار خط تولید)
    const deductionResult = LocalStorageManager.deductProductionParts(
      currentEnv,
      {
        valveType,
        valveType2,
        nutType,
        nutType2,
        quantity: deliveredQty,
        orderSheetNumber: activeOrderToDeliver.transfer_sheet_number || dspSheetNo,
        deliverySheetNumber: dspSheetNo,
        customerName: customer,
        cylinderType: activeOrderToDeliver.cylinder_type,
        actorUser: currentUser
      }
    );

    if (!deductionResult.success) {
      showToast(deductionResult.error || 'خطا در کسر قطعات از خط تولید', 'error');
      return;
    }

    // 2. Mark the original order as COMPLETED
    const updatedOrder: GasProductionKardexEntry = {
      ...activeOrderToDeliver,
      order_status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      completed_by: currentUser.full_name || currentUser.username,
      delivery_sheet_number: dspSheetNo,
      updated_at: new Date().toISOString()
    };
    LocalStorageManager.updateProductionKardexEntry(currentEnv, updatedOrder, currentUser);

    // 3. Register the Delivery & Dispatch Entry in Kardex
    const partsDescSummary = isForklift
      ? `۲ شیر (${valveType}${valveType2 && valveType2 !== valveType ? ` + ${valveType2}` : ''}) و ۲ مهره (${nutType}${nutType2 && nutType2 !== nutType ? ` + ${nutType2}` : ''})`
      : `شیر: ${valveType}، مهره: ${nutType}`;

    const deliveryEntry: GasProductionKardexEntry = {
      entry_id: generateUUID('DSP'),
      cylinder_type: activeOrderToDeliver.cylinder_type,
      sub_variant: subVar,
      valve_type: valveType,
      valve_type_2: valveType2,
      nut_type: nutType,
      nut_type_2: nutType2,
      date: deliveryForm.date || getPersianDate(),
      description: `اتمام کار و تحویل سفارش ${activeOrderToDeliver.transfer_sheet_number} به ${customer} (${partsDescSummary})`,
      transfer_sheet_number: dspSheetNo,
      batch_number: activeOrderToDeliver.batch_number || '',
      production_in: 0,
      dispatch_out: deliveredQty,
      defect_reject: defectQty,
      stock_balance: 0,
      order_id: activeOrderToDeliver.transfer_sheet_number,
      reference_order_id: activeOrderToDeliver.transfer_sheet_number,
      order_status: 'COMPLETED',
      customer_name: customer,
      shift_name: deliveryForm.shift_name,
      supervisor: deliveryForm.supervisor.trim() || currentUser.full_name,
      destination_or_source: customer,
      driver_name: deliveryForm.driver_name.trim(),
      plate_number: deliveryForm.plate_number.trim(),
      waybill_number: deliveryForm.waybill_number.trim(),
      notes: [
        deliveryForm.notes.trim(),
        deliveryForm.driver_name ? `راننده: ${deliveryForm.driver_name}` : '',
        deliveryForm.plate_number ? `پلاک: ${deliveryForm.plate_number}` : '',
        deliveryForm.waybill_number ? `بارنامه: ${deliveryForm.waybill_number}` : '',
        deductionResult.success ? `کسر قطعات انبار: ${formatNumberEn(deliveredQty * (isForklift ? 2 : 1))} شیر و ${formatNumberEn(deliveredQty * (isForklift ? 2 : 1))} مهره خط تولید` : ''
      ].filter(Boolean).join(' | '),
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      device_id: currentUser.allowed_device_id,
      event_id: generateUUID('EVT'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    LocalStorageManager.saveProductionKardexEntry(currentEnv, deliveryEntry, currentUser);
    setShowAddModal(false);
    refreshLocalState();
    setSelectedProductionEntryForExitReceipt(deliveryEntry);
    setShowExitReceiptModal(true);
    showToast(
      isForklift
        ? `اتمام کار سفارش «${activeOrderToDeliver.transfer_sheet_number}» ثبت شد. ${formatNumberEn(deliveredQty * 2)} عدد شیر (۲ عدد به ازای هر سیلندر) و ${formatNumberEn(deliveredQty * 2)} عدد مهره از انبار خط تولید کسر گردید.`
        : `اتمام کار سفارش «${activeOrderToDeliver.transfer_sheet_number}» ثبت شد. ${formatNumberEn(deliveredQty)} عدد شیر (${valveType}) و ${formatNumberEn(deliveredQty)} عدد مهره (${nutType}) از انبار خط تولید کسر گردید.`,
      'success'
    );
  };

  // Handle Edit Entry
  const handleSaveEditEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    LocalStorageManager.updateProductionKardexEntry(currentEnv, editingEntry, currentUser);
    setShowEditModal(false);
    setEditingEntry(null);
    refreshLocalState();
    showToast('ردیف کاردکس تولید با موفقیت ویرایش گردید.', 'success');
  };

  // Handle Trash Entry
  const handleConfirmTrash = () => {
    if (!deletingEntry) return;
    LocalStorageManager.trashProductionKardexEntry(currentEnv, deletingEntry.entry_id, currentUser, deleteReason || 'حذف سطر کاردکس');
    setDeletingEntry(null);
    setDeleteReason('');
    refreshLocalState();
    showToast('سند به سطل آشغال منتقل شد.', 'info');
  };

  // Handle Restore Entry
  const handleRestore = (entryId: string) => {
    LocalStorageManager.restoreProductionKardexEntry(currentEnv, entryId, currentUser);
    refreshLocalState();
    showToast('سند از سطل آشغال بازیابی شد.', 'success');
  };

  // Handle Permanently Delete Entry
  const handlePermanentDelete = async (entryId: string) => {
    const confirmed = await showConfirm({
      title: 'حذف دائمی ردیف کاردکس',
      message: 'آیا از حذف دائمی این سند اطمینان دارید؟ این عمل غیرقابل بازگشت است.',
      confirmText: 'حذف دائم',
      cancelText: 'انصراف',
      variant: 'danger'
    });
    if (confirmed) {
      LocalStorageManager.permanentlyDeleteProductionKardexEntry(currentEnv, entryId, currentUser);
      refreshLocalState();
      showToast('سند به طور دائم حذف شد.', 'info');
    }
  };

  // Excel Export Handler (smartly exports filtered entries when filters are active)
  const handleExportExcel = () => {
    const exportName = selectedSubVariant && selectedSubVariant !== 'ALL'
      ? `${selectedProductType} (${selectedSubVariant})`
      : selectedProductType;
    const entriesToExport = isAnyFilterActive ? displayedEntries : productEntries;
    exportProductionKardexToXLSX(isAnyFilterActive ? `${exportName}-فیلترشده` : exportName, entriesToExport);
    showToast(`فایل اکسل کاردکس تولید (${formatNumberEn(entriesToExport.length)} ردیف) با موفقیت دانلود شد.`, 'success');
  };

  return (
    <div className="space-y-4 sm:space-y-6 antialiased" dir="rtl">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border-2 border-indigo-500 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* ======================================================================
          THE SELECTOR BOX (باکس انتخاب گر کالا با منوی دراپ‌داون زیردسته و دکمه‌های سفارش و تحویل)
          ====================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 space-y-4">
        
        {/* Header of Box with Title, Active Product and Kardex Tools */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none transition-colors rounded-xl pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  کاردکس تولید ام گاز
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80">
                  {selectedProductType}
                </span>
                {openOrdersForSelectedProduct.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span>{toPersianDigits(openOrdersForSelectedProduct.length)} سفارش در حال انجام</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowTrashModal(true)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
              title="سطل زباله اسناد حذف‌شده کاردکس تولید"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>سطل آشغال ({toPersianDigits(trashedEntries.length)})</span>
            </button>
          </div>
        </div>

        {/* Responsive Content: Vertical Action Buttons on one side, 10 Product Options on the other side (Always Open) */}
        <div className="flex flex-col xl:flex-row items-stretch gap-3 sm:gap-4 pt-1">
          
          {/* Vertical Action Buttons: ۱. ثبت سفارش جدید  ۲. اتمام کار و تحویل (با رابطه کاملاً مستقیم) */}
          <div className="w-full xl:w-56 flex flex-col gap-2.5 justify-center shrink-0">
            {/* BUTTON 1: ثبت سفارش جدید */}
            <button
              type="button"
              onClick={handleOpenNewOrderModal}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm border border-emerald-500/60 transition-colors cursor-pointer"
              title="ایجاد و ثبت سفارش ساخت و تولید جدید برای این کالا"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>ثبت سفارش جدید</span>
            </button>

            {/* BUTTON 2: اتمام کار و تحویل */}
            <button
              type="button"
              onClick={() => handleOpenCompleteDeliveryModal()}
              className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm border border-amber-500/60 transition-colors cursor-pointer relative"
              title="اتمام کار و تحویل سفارش‌های باز به مشتری یا نمایندگی"
            >
              <PackageCheck className="w-4 h-4 shrink-0" />
              <span>اتمام کار و تحویل</span>
              {openOrdersForSelectedProduct.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-white text-amber-700 text-[10px] font-black font-mono flex items-center justify-center shadow-xs">
                  {openOrdersForSelectedProduct.length}
                </span>
              )}
            </button>
          </div>

          {/* Selectable Product Cards Grid (Fully Responsive with Dropdown instead of word موجودی) */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
              {availableProductionCylinderTypes.map((type, idx) => {
                const isSelected = selectedProductType === type;
                const subVariants = getSubVariantsForProduct(type, catalogMappings);
                const hasMultipleSubs = subVariants.length > 1;
                const isTank = type.includes('مخزن');
                const isPicnic = type.includes('پیکنیک');
                const cardChosenSubVariant = selectedSubVariantsByProduct[type] || subVariants[0] || 'استاندارد';

                const totalBalance = subVariants.reduce(
                  (sum, s) => sum + (subVariantStockMap[type]?.[s] || 0),
                  0
                );

                return (
                  <div
                    key={type}
                    onClick={() => handleSelectProduct(type, cardChosenSubVariant)}
                    className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between gap-2 cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-500/30'
                        : 'bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Top Row: # Index & Icon */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-black/30 text-indigo-100 font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        #{toPersianDigits(idx + 1)}
                      </span>
                      {isPicnic ? (
                        <Flame className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-200' : 'text-amber-500'}`} />
                      ) : isTank ? (
                        <Layers className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-200' : 'text-cyan-400'}`} />
                      ) : (
                        <Boxes className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-indigo-400'}`} />
                      )}
                    </div>

                    {/* Product Name */}
                    <div className="min-w-0">
                      <div className={`text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 ${isSelected ? 'text-white font-extrabold' : 'text-slate-900 dark:text-slate-200'}`}>
                        {type}
                      </div>
                    </div>

                    {/* Dropdown Menu for Sub-Category Items (بجای کلمه موجودی) */}
                    <div
                      className="pt-1.5 border-t border-slate-200/60 dark:border-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="sr-only">زیردسته کالا</label>
                      <div className="relative">
                        <select
                          value={cardChosenSubVariant}
                          onChange={(e) => {
                            e.stopPropagation();
                            const val = e.target.value;
                            setSelectedProductType(type);
                            setSelectedSubVariant(val);
                            setSelectedSubVariantsByProduct(prev => ({ ...prev, [type]: val }));
                            showToast(`کاردکس ${type}: ${val === 'ALL' ? 'همه زیردسته‌ها' : `مدل ${val}`}`);
                          }}
                          className={`w-full text-[11px] font-bold py-1 px-2 pr-2 pl-6 rounded-lg border appearance-none cursor-pointer outline-none transition-colors ${
                            isSelected
                              ? 'bg-indigo-700/90 text-white border-indigo-400 focus:ring-1 focus:ring-white'
                              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          {subVariants.map(sub => {
                            const subBal = subVariantStockMap[type]?.[sub] || 0;
                            return (
                              <option
                                key={sub}
                                value={sub}
                                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold"
                              >
                                {sub} ({toPersianDigits(subBal)} عدد)
                              </option>
                            );
                          })}
                          {hasMultipleSubs && (
                            <option
                              value="ALL"
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold"
                            >
                              همه مدل‌ها ({toPersianDigits(totalBalance)} عدد)
                            </option>
                          )}
                        </select>
                        <ChevronDown className={`w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          isSelected ? 'text-white' : 'text-slate-400'
                        }`} />
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      {/* KPI Cards for the Selected Product and Sub-variant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Stock Balance */}
        <div className="bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>موجودی آماده تحویل انبار</span>
            <Boxes className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono tracking-tight">
            {formatNumberEn(stats.currentBalance)}
            <span className="text-xs font-normal text-slate-500 mr-1.5">عدد</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            {selectedProductType} {selectedSubVariant !== 'ALL' && `(${selectedSubVariant})`}
          </div>
        </div>

        {/* Card 2: Total Production In */}
        <div className="bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>کل سفارش‌های ورودی تولید</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
            {formatNumberEn(stats.totalProductionIn)}
            <span className="text-xs font-normal text-slate-500 mr-1.5">عدد</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400/80 mt-1 flex items-center justify-between">
            <span>سفارش‌های در حال انجام:</span>
            <span className="font-mono font-bold text-amber-500">{toPersianDigits(stats.pendingOrdersCount)}</span>
          </div>
        </div>

        {/* Card 3: Total Dispatch Out */}
        <div className="bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>کل کارهای اتمام‌شده و تحویلی</span>
            <ArrowUpRight className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tracking-tight">
            {formatNumberEn(stats.totalDispatchOut)}
            <span className="text-xs font-normal text-slate-500 mr-1.5">عدد</span>
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400/80 mt-1">
            تحویل قطعی با بارنامه به مشتری
          </div>
        </div>

        {/* Card 4: Defect / Scrap Rejects */}
        <div className="bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>ضایعات و رد آزمون QC</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight">
            {formatNumberEn(stats.totalRejects)}
            <span className="text-xs font-normal text-slate-500 mr-1.5">عدد</span>
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400/80 mt-1">
            اقلام معیوب یا نیازمند بازکاری
          </div>
        </div>

      </div>

      {/* Action Bar & Professional Search / Filters (Collapsible Box with Hide/Show Toggle) */}
      <div className={`bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 ${
        isActionBarExpanded ? 'p-3.5 sm:p-5 space-y-4' : 'p-3.5'
      }`}>
        
        {/* Header Row with Title, Active Filter Badges, Reset & Dedicated Hide/Show Toggle Button */}
        <div 
          onClick={() => setIsActionBarExpanded(prev => !prev)}
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer select-none transition-colors rounded-xl ${
            isActionBarExpanded 
              ? 'pb-3 border-b border-slate-200 dark:border-slate-800' 
              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
          }`}
        >
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>جستجو و فیلترهای پیشرفته کاردکس تولید</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
                  {formatNumberEn(displayedEntries.length)} ردیف یافت شد
                </span>
              </h2>

              {/* Active Filter Tags */}
              {isAnyFilterActive && (
                <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
                      <span>متن: «{searchQuery}»</span>
                      <button type="button" onClick={() => setSearchQuery('')} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedCustomerFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                      <Users className="w-2.5 h-2.5" />
                      <span>مشتری: {selectedCustomerFilter}</span>
                      <button type="button" onClick={() => setSelectedCustomerFilter('ALL')} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedValveFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                      <Wrench className="w-2.5 h-2.5" />
                      <span>شیر: {selectedValveFilter}</span>
                      <button type="button" onClick={() => setSelectedValveFilter('ALL')} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {(fromDate || toDate) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 font-bold">
                      <Calendar className="w-2.5 h-2.5" />
                      <span>{fromDate ? `از ${fromDate}` : ''} {toDate ? `تا ${toDate}` : ''}</span>
                      <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {directionFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                      <span>
                        {directionFilter === 'orders' ? 'سفارش‌های جدید' : directionFilter === 'completed' ? 'اتمام کار و تحویلی‌ها' : 'ضایعات QC'}
                      </span>
                      <button type="button" onClick={() => setDirectionFilter('all')} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {shiftFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 font-bold">
                      <span>شیفت: {shiftFilter}</span>
                      <button type="button" onClick={() => setShiftFilter('all')} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {searchAllProducts && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-bold">
                      <span>همه سیلندرها</span>
                      <button type="button" onClick={() => setSearchAllProducts(false)} className="hover:text-rose-500 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}

              {!isActionBarExpanded && !isAnyFilterActive && (
                <span className="text-[11px] text-slate-400 font-normal">
                  (جهت اعمال فیلتر تاریخ، مشتری یا کلمات کلیک کنید)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
            {/* Reset All Filters Button */}
            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="پاکسازی تمام فیلترهای فعال"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>حذف فیلترها</span>
              </button>
            )}

            {/* Dedicated Hide / Show Button */}
            <button
              type="button"
              onClick={() => setIsActionBarExpanded(prev => !prev)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs cursor-pointer active:scale-95"
              title={isActionBarExpanded ? 'مخفی کردن باکس فیلترها و ابزارها' : 'نمایش باکس فیلترها و ابزارها'}
            >
              <span>{isActionBarExpanded ? 'مخفی کردن باکس' : 'نمایش باکس'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-300 ${
                  isActionBarExpanded ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : 'text-indigo-600 dark:text-indigo-400'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Expandable / Collapsible Filter Panel Content */}
        {isActionBarExpanded && (
          <div className="space-y-4 pt-1">
            
            {/* ROW 1: Free-text Search & Customer Selector & Valve Type Selector & Scope Toggle */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              
              {/* Text Search Input (col-span 4) */}
              <div className="md:col-span-4 space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  جستجو در متن، شماره برگه، شماره بچ یا مشخصات:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="جستجو در شرح سفارش، شماره برگه، بچ، راننده، سرپرست، شیر..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pr-9 pl-8 py-2 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 rounded cursor-pointer"
                      title="پاک کردن جستجو"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Customer List Dropdown (col-span 3) */}
              <div className="md:col-span-3 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    <span>فهرست مشتری‌ها / نمایندگی‌ها:</span>
                  </label>
                  {selectedCustomerFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerFilter('ALL')}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      نمایش همه
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={selectedCustomerFilter}
                    onChange={(e) => setSelectedCustomerFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pr-3 pl-8 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 cursor-pointer transition-colors appearance-none"
                  >
                    <option value="ALL">همه مشتری‌ها و نمایندگی‌ها</option>
                    {customerFilterOptions.map((cust) => (
                      <option key={cust.name} value={cust.name}>
                        {cust.name} {cust.count > 0 ? `(${toPersianDigits(cust.count)} سند)` : '(بدون سند)'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Valve Type Selector (col-span 3) */}
              <div className="md:col-span-3 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    <span>نوع شیر مصرفی:</span>
                  </label>
                  {selectedValveFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedValveFilter('ALL')}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      همه شیرها
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={selectedValveFilter}
                    onChange={(e) => setSelectedValveFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pr-3 pl-8 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500 cursor-pointer transition-colors appearance-none"
                  >
                    <option value="ALL">همه انواع شیر مصرفی (کل اسناد)</option>
                    {valveFilterOptions.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} {v.count > 0 ? `(${toPersianDigits(v.count)} سند)` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Scope: Search Across All Cylinder Types (col-span 2) */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={searchAllProducts}
                    onChange={(e) => setSearchAllProducts(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="text-[11px] leading-tight font-bold text-slate-800 dark:text-slate-200">
                    <span>همه سیلندرها</span>
                    <span className="block text-[9.5px] text-slate-400 font-normal mt-0.5">
                      (خارج از محدوده فعلی)
                    </span>
                  </div>
                </label>
              </div>

            </div>

            {/* ROW 2: Professional Date Range Filtering (از تاریخ تا تاریخ) with Presets */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    بازه زمانی کاردکس (از تاریخ تا تاریخ)
                  </span>
                  {(fromDate || toDate) && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 font-bold">
                      {fromDate || 'ابتدا'} ➔ {toDate || 'انتها'}
                    </span>
                  )}
                </div>

                {/* Quick Date Presets Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10.5px] text-slate-500 font-medium">میانبر:</span>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('today')}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    امروز
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('last7')}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    ۷ روز اخیر
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('last30')}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    ۳۰ روز اخیر
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('thisMonth')}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    ماه جاری
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDatePreset('thisYear')}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    کل سال جاری
                  </button>
                  {(fromDate || toDate) && (
                    <button
                      type="button"
                      onClick={() => handleSetDatePreset('clear')}
                      className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer flex items-center gap-1"
                      title="پاک کردن فیلتر تاریخ"
                    >
                      <X className="w-3 h-3" />
                      <span>حذف تاریخ</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Date Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    از تاریخ:
                  </label>
                  <div className="relative">
                    <PersianDatePicker
                      value={fromDate}
                      onChange={(d) => setFromDate(d)}
                      placeholder="از تاریخ (مثلاً 1405/01/01)"
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    تا تاریخ:
                  </label>
                  <div className="relative">
                    <PersianDatePicker
                      value={toDate}
                      onChange={(d) => setToDate(d)}
                      placeholder="تا تاریخ (مثلاً 1405/12/29)"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 3: Direction Filter, Shift Filter & Action Buttons */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1 min-w-0 max-w-full">
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap min-w-0">
                {/* Direction / Status Filter */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs w-full sm:w-auto overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('all')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer whitespace-nowrap text-xs ${
                      directionFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    همه گردش‌ها
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('orders')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer whitespace-nowrap text-xs ${
                      directionFilter === 'orders'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    سفارش‌های جدید
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('completed')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer whitespace-nowrap text-xs ${
                      directionFilter === 'completed'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    اتمام کار و تحویلی‌ها
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('rejects')}
                    className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg font-bold text-center transition-all cursor-pointer whitespace-nowrap text-xs ${
                      directionFilter === 'rejects'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    ضایعات QC
                  </button>
                </div>

                {/* Shift Filter */}
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs w-full sm:w-auto">
                  <span className="text-slate-500 text-[11px] font-bold">شیفت:</span>
                  <select
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value)}
                    className="bg-transparent text-slate-800 dark:text-slate-200 font-bold text-xs outline-hidden cursor-pointer"
                  >
                    <option value="all">همه شیفت‌ها</option>
                    <option value="صبح">صبح</option>
                    <option value="عصر">عصر</option>
                    <option value="شب">شب</option>
                  </select>
                </div>
              </div>

              {/* Actions: Excel, Print & Trash */}
              <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-stretch sm:justify-end min-w-0">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex-1 sm:flex-initial min-w-[120px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  title="دانلود فایل اکسل راست به چپ کاردکس تولید بر اساس فیلترهای فعال"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>خروجی اکسل {isAnyFilterActive ? `(${toPersianDigits(displayedEntries.length)})` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className="flex-1 sm:flex-initial min-w-[130px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  title="چاپ رسمی کاردکس تولید در قطع A4 افقی"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>چاپ رسمی کاردکس</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTrashModal(true)}
                  className="flex-1 sm:flex-initial min-w-[110px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                  title="سطل زباله اسناد حذف‌شده کاردکس تولید"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>سطل آشغال ({toPersianDigits(trashedEntries.length)})</span>
                </button>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* Production Kardex Ledger Table */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        
        {/* Table Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
              {searchAllProducts ? (
                <span className="text-cyan-600 dark:text-cyan-400">
                  دفتر کاردکس تولید: همه محصولات و سیلندرها
                </span>
              ) : (
                <>
                  دفتر کاردکس تولید: {selectedProductType}
                  {selectedSubVariant && selectedSubVariant !== 'ALL' && (
                    <span className="text-cyan-600 dark:text-cyan-400 mr-1.5">
                      ({selectedSubVariant})
                    </span>
                  )}
                </>
              )}
            </h3>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold text-[11px]">
                <th className="px-1.5 py-2.5 w-8 sm:w-9 text-center">ردیف</th>
                <th className="col-vertical-date text-center font-bold" title="تاریخ سند">
                  <span className="vertical-text-20">تاریخ</span>
                </th>
                <th className="px-2 py-2.5 min-w-[95px]">شرح سفارش</th>
                <th className="px-1.5 py-2.5 w-28 sm:w-32 text-center bg-amber-950/10 text-amber-700 dark:text-amber-300 font-black" title="نوع شیر مصرفی نصب‌شده روی سیلندر">
                  نوع شیر مصرفی
                </th>
                <th className="px-1.5 py-2.5 w-24 sm:w-28 text-center bg-cyan-950/10 text-cyan-700 dark:text-cyan-300 font-bold" title="نوع مهره (انتخاب انحصاری از دسته مهره‌های انبار)">
                  نوع مهره
                </th>
                <th className="px-1.5 py-2.5 w-24 sm:w-28 text-center">سفارش دهنده</th>
                <th className="px-1.5 py-2.5 w-12 sm:w-14 text-center bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-black">
                  تیراژ
                </th>
                <th className="px-1.5 py-2.5 w-12 sm:w-14 text-center bg-amber-950/20 text-amber-700 dark:text-amber-400 font-black">
                  تحویل
                </th>
                <th className="px-1 py-2.5 w-10 sm:w-12 text-center bg-rose-950/20 text-rose-700 dark:text-rose-400 font-black">
                  رد QC
                </th>
                <th className="px-1.5 py-2.5 w-12 sm:w-14 text-center bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 font-black">
                  مانده
                </th>
                <th className="px-1 py-2.5 w-9 sm:w-10 text-center bg-amber-950/20 text-amber-600 dark:text-amber-400 font-bold" title="برگه خروج کارخانه">
                  <div className="flex items-center justify-center" title="برگه خروج کارخانه">
                    <Truck className="w-4 h-4" />
                  </div>
                </th>
                <th className="px-1.5 py-2.5 w-14 sm:w-16 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {displayedEntries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500">
                    {isAnyFilterActive ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                          هیچ سندی با فیلترهای انتخابی یافت نشد.
                        </span>
                        <span className="text-xs text-slate-400 max-w-md text-center">
                          فیلترهای تاریخ، نام مشتری، نوع شیر مصرفی یا کلمات جستجو را تغییر دهید یا با کلیک روی دکمه زیر تمام فیلترها را ریست کنید.
                        </span>
                        <button
                          type="button"
                          onClick={handleResetAllFilters}
                          className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>پاکسازی تمام فیلترها و نمایش همه اسناد</span>
                        </button>
                      </div>
                    ) : (
                      `هیچ ردیفی برای «${selectedProductType} ${selectedSubVariant !== 'ALL' ? `(${selectedSubVariant})` : ''}» یافت نشد. با دکمه «ثبت سفارش جدید» سفارش را ایجاد نمایید.`
                    )}
                  </td>
                </tr>
              ) : (
                displayedEntries.map((row, index) => {
                  const subLabel = row.sub_variant || 'استاندارد';
                  const isOrder = row.transfer_sheet_number?.startsWith('ORD-') || (row.production_in > 0 && row.dispatch_out === 0);
                  const isDelivery = row.transfer_sheet_number?.startsWith('DSP-') || row.dispatch_out > 0;
                  const isOrderCompleted = row.order_status === 'COMPLETED';
                  const isOrderInProgress = isOrder && !isOrderCompleted;

                  // Prominent valve computation with intelligent default fallback
                  const effectiveValveType = row.valve_type?.trim() || (
                    row.cylinder_type === 'سیلندر لیفتراکی' ? 'شیر نو ۱۱ کیلویی لیفتراک' :
                    row.cylinder_type?.includes('پیکنیک') ? 'شیر نو پیکنیک' :
                    row.cylinder_type?.includes('مخزن') ? 'شیر مخزن استاندارد' :
                    'شیر نو استاندارد ام‌گاز'
                  );

                  return (
                    <tr
                      key={row.entry_id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group text-[11px] sm:text-xs"
                    >
                      {/* 1. ردیف */}
                      <td className="px-1.5 py-2 text-center text-slate-500 font-mono text-[11px]">
                        {toPersianDigits(index + 1)}
                      </td>

                      {/* 2. تاریخ (عمودی برای حداقل اشغال فضا) */}
                      <td className="col-vertical-date text-center" title={`تاریخ: ${row.date}`}>
                        <div className="vertical-date-text font-mono text-slate-800 dark:text-slate-200" dir="ltr">
                          {row.date}
                        </div>
                      </td>

                      {/* 3. شرح (خلاصه و کوتاه شده - بدون شماره برگه در جدول) */}
                      <td className="px-2 py-2" title={`${row.description}${row.notes ? ` | ${row.notes}` : ''}`}>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span className="leading-snug">{summarizeProductionDescription(row.description, isOrder, isDelivery)}</span>
                          {isOrder && (
                            isOrderCompleted ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                <span>تکمیل</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                <Clock className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
                                <span>در ساخت</span>
                              </span>
                            )
                          )}
                          {isDelivery && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <Truck className="w-2.5 h-2.5 text-emerald-500" />
                              <span>تحویل</span>
                            </span>
                          )}
                        </div>

                        {/* نشانگر نوع شیر مصرفی به صورت واضح */}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span 
                            className="text-[9.5px] text-amber-800 dark:text-amber-300 font-semibold bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800/80 inline-flex items-center gap-1"
                            title="نوع شیر مصرفی این سفارش"
                          >
                            <Wrench className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="text-[9.5px] font-medium">شیر مصرفی: {effectiveValveType}{row.valve_type_2 ? ` + ${row.valve_type_2}` : ''}</span>
                          </span>
                        </div>

                        {searchAllProducts ? (
                          <div className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
                            کالا: {row.cylinder_type} {subLabel && subLabel !== 'استاندارد' ? `(${subLabel})` : ''}
                          </div>
                        ) : (
                          subLabel && subLabel !== 'استاندارد' && (
                            <div className="text-[10px] text-slate-400 mt-0.5 font-sans">
                              مدل: {subLabel}
                            </div>
                          )
                        )}
                        {row.notes && (
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 font-sans">
                            {row.notes}
                          </div>
                        )}
                      </td>

                      {/* 4. نوع شیر مصرفی (ستون اختصاصی برجسته) */}
                      <td className="px-1.5 py-2 text-center bg-amber-500/5 dark:bg-amber-950/10">
                        {(row.cylinder_type === 'سیلندر لیفتراکی' || row.valve_type_2) ? (
                          <div className="flex flex-col gap-1 items-center justify-center">
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-950 dark:text-amber-200 border border-amber-500/40 leading-tight max-w-[110px]"
                              title={`شیر مصرفی اول: ${row.valve_type || 'شیر مایع'}`}
                            >
                              <span className="text-[8px] bg-amber-600/30 text-amber-950 dark:text-amber-200 px-1 py-0.2 rounded font-bold shrink-0">۱:</span>
                              <span className="truncate text-[9px] font-semibold">{row.valve_type || 'شیر مایع'}</span>
                            </span>
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-950 dark:text-amber-200 border border-amber-500/40 leading-tight max-w-[110px]"
                              title={`شیر مصرفی دوم: ${row.valve_type_2 || row.valve_type || 'شیر بخار'}`}
                            >
                              <span className="text-[8px] bg-amber-600/30 text-amber-950 dark:text-amber-200 px-1 py-0.2 rounded font-bold shrink-0">۲:</span>
                              <span className="truncate text-[9px] font-semibold">{row.valve_type_2 || row.valve_type || 'شیر بخار'}</span>
                            </span>
                          </div>
                        ) : (
                          <span 
                            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 leading-tight shadow-xs"
                            title={`نوع شیر مصرفی: ${effectiveValveType}`}
                          >
                            <Wrench className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="line-clamp-2 max-w-[95px] text-[9.5px] font-semibold">{effectiveValveType}</span>
                          </span>
                        )}
                      </td>

                      {/* 5. نوع مهره (بدون ستون اضافه - برای لیفتراکی ۲ مهره در همان سلول مشخص می‌شود) */}
                      <td className="px-1.5 py-2 text-center">
                        {(row.cylinder_type === 'سیلندر لیفتراکی' || row.nut_type_2) ? (
                          <div className="flex flex-col gap-1 items-center justify-center">
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-900 dark:text-cyan-200 border border-cyan-500/30 leading-tight max-w-[105px]"
                              title={`مهره اول: ${row.nut_type || 'مهره لیفتراکی'}`}
                            >
                              <span className="text-[8px] bg-cyan-600/30 text-cyan-900 dark:text-cyan-200 px-1 py-0.2 rounded font-black shrink-0">۱:</span>
                              <span className="truncate">{row.nut_type || 'مهره اول'}</span>
                            </span>
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-900 dark:text-cyan-200 border border-cyan-500/30 leading-tight max-w-[105px]"
                              title={`مهره دوم: ${row.nut_type_2 || row.nut_type || 'مهره لیفتراکی'}`}
                            >
                              <span className="text-[8px] bg-cyan-600/30 text-cyan-900 dark:text-cyan-200 px-1 py-0.2 rounded font-black shrink-0">۲:</span>
                              <span className="truncate">{row.nut_type_2 || row.nut_type || 'مهره دوم'}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border border-cyan-500/20 leading-tight">
                            <Layers className="w-3 h-3 text-cyan-500 shrink-0" />
                            <span className="line-clamp-2 max-w-[90px]">{row.nut_type || 'مهره 11/25/50 کیلویی بوتانی'}</span>
                          </span>
                        )}
                      </td>

                      {/* 6. سفارش دهنده */}
                      <td className="px-1.5 py-2 text-center">
                        <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="truncate max-w-[100px]">{row.customer_name || row.destination_or_source || 'نمایندگی / مشتری'}</span>
                        </div>
                        {row.supervisor && (
                          <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[100px]">
                            {row.supervisor}
                          </div>
                        )}
                      </td>

                      {/* 7. تیراژ سفارش (ورودی) */}
                      <td className="px-1.5 py-2 text-center font-mono font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10">
                        {row.production_in > 0 ? formatNumberEn(row.production_in) : '-'}
                      </td>

                      {/* 8. تحویل نهایی (خروجی) */}
                      <td className="px-1.5 py-2 text-center font-mono font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/10">
                        {row.dispatch_out > 0 ? formatNumberEn(row.dispatch_out) : '-'}
                      </td>

                      {/* 9. رد QC */}
                      <td className="px-1 py-2 text-center font-mono font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/10 text-[11px]">
                        {row.defect_reject > 0 ? formatNumberEn(row.defect_reject) : '-'}
                      </td>

                      {/* 10. مانده موجودی */}
                      <td className="px-1.5 py-2 text-center font-mono font-black text-cyan-700 dark:text-cyan-300 bg-cyan-50/60 dark:bg-cyan-950/20 text-xs">
                        {formatNumberEn(row.stock_balance)}
                      </td>

                      {/* 11. برگه فقط خروج از کارخانه (فقط آیکون بدون نوشته متنی) */}
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenExitReceipt(row)}
                          className="w-7 h-7 mx-auto rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center shadow-xs shadow-amber-600/30 transition-all cursor-pointer active:scale-95"
                          title="صدور و چاپ برگه خروج کالا از کارخانه"
                          aria-label="صدور و چاپ برگه خروج کالا از کارخانه"
                        >
                          <Truck className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </td>

                      {/* 12. عملیات (نوشتن شماره برگه در جزئیات سفارش در بخش عملیات) */}
                      <td className="px-1.5 py-2 text-center">
                        <div className="flex flex-col items-center justify-center gap-1 opacity-90 group-hover:opacity-100">
                          {/* جزئیات سفارش با شماره برگه در بخش عملیات */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForDetails(row)}
                            className="w-full max-w-[76px] px-1 py-0.5 rounded text-[9.5px] font-mono font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center gap-0.5 shadow-2xs transition-colors cursor-pointer"
                            title={`مشاهده جزئیات سفارش (شماره برگه: ${row.transfer_sheet_number})`}
                          >
                            <FileText className="w-2.5 h-2.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                            <span className="truncate">{row.transfer_sheet_number}</span>
                          </button>

                          {isOrderInProgress && (
                            <button
                              type="button"
                              onClick={() => handleOpenCompleteDeliveryModal(row.entry_id)}
                              className="w-full max-w-[76px] px-1 py-0.5 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-0.5 shadow-xs cursor-pointer active:scale-95"
                              title="اتمام کار و تحویل این سفارش"
                            >
                              <PackageCheck className="w-3 h-3 shrink-0" />
                              <span>تحویل</span>
                            </button>
                          )}

                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntry({ ...row });
                                setShowEditModal(true);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="ویرایش ردیف"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingEntry(row);
                                setDeleteReason('');
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="انتقال به سطل آشغال"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================================
          MODAL: POPUP FOR 1. ثبت سفارش جدید  OR  2. اتمام کار و تحویل
          (بسته شدن حتمی با کلیک روی فضای خالی / بک‌دراپ + ارتباط کاملاً مستقیم)
          ====================================================================== */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden my-6 cursor-default transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`p-4 text-white flex items-center justify-between border-b ${
              modalMode === 'NEW_ORDER'
                ? 'bg-gradient-to-r from-emerald-900 via-slate-900 to-indigo-950 border-emerald-700/40'
                : 'bg-gradient-to-r from-amber-900 via-slate-900 to-indigo-950 border-amber-700/40'
            }`}>
              <div className="flex items-center gap-2.5">
                {modalMode === 'NEW_ORDER' ? (
                  <Plus className="w-5 h-5 text-emerald-400" />
                ) : (
                  <PackageCheck className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    {modalMode === 'NEW_ORDER' ? 'ثبت سفارش جدید ساخت و تولید (درج مستقیم ردیف در کاردکس)' : 'اتمام کار و تحویل سفارش'}
                  </h3>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    کاردکس تولید ام‌گاز - نمایش ردیفی و ستونی فیلدها منطبق بر جدول کاردکس
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="بستن فرم"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switch Tabs (ثبت سفارش جدید / اتمام کار و تحویل) */}
            <div className="p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalMode('NEW_ORDER')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  modalMode === 'NEW_ORDER'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>مرحله ۱: ثبت سفارش جدید (قالب جدولی کاردکس)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalMode('COMPLETE_DELIVERY')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  modalMode === 'COMPLETE_DELIVERY'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                <PackageCheck className="w-4 h-4" />
                <span>مرحله ۲: اتمام کار و تحویل</span>
              </button>
            </div>

            {/* FORM 1: ثبت سفارش جدید - با پشتیبانی کامل از ثبت همزمان چند محصول */}
            {modalMode === 'NEW_ORDER' && (
              <form onSubmit={handleSubmitNewOrder} className="p-4 sm:p-5 space-y-4 text-xs">
                {/* General Order Information Card */}
                <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-inner space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        مشخصات کلی برگه سفارش ساخت و تولید
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-800">
                      ثبت همزمان چند محصول در یک سفارش
                    </span>
                  </div>

                  {/* Header Attributes Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    {/* 1. تاریخ ثبت */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        تاریخ ثبت سفارش:
                      </label>
                      <div className="flex items-center justify-between bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5">
                        <span className="font-mono font-bold text-xs">{toPersianDigits(orderForm.date)}</span>
                        <PersianDatePicker
                          value={orderForm.date}
                          onChange={(d) => setOrderForm({ ...orderForm, date: d })}
                          iconOnly
                          asModal
                        />
                      </div>
                    </div>

                    {/* 2. شماره سفارش */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        شماره برگه سفارش:
                      </label>
                      <input
                        type="text"
                        value={orderForm.order_sheet_number}
                        onChange={(e) => setOrderForm({ ...orderForm, order_sheet_number: e.target.value })}
                        required
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs text-center text-indigo-600 dark:text-indigo-400"
                      />
                    </div>

                    {/* 3. سفارش‌دهنده */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        سفارش‌دهنده (مشتری / نمایندگی):
                      </label>
                      <input
                        type="text"
                        list="customers_list"
                        placeholder="نام مشتری یا سازمان..."
                        value={orderForm.customer_name}
                        onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                        required
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                      />
                      <datalist id="customers_list">
                        {customerList.map(c => (
                          <option key={c.customer_id} value={c.name} />
                        ))}
                      </datalist>
                    </div>

                    {/* 4. شیفت کاری */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        شیفت کاری:
                      </label>
                      <select
                        value={orderForm.shift_name}
                        onChange={(e) => setOrderForm({ ...orderForm, shift_name: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-bold text-xs text-slate-900 dark:text-white"
                      >
                        <option value="صبح">شیفت صبح</option>
                        <option value="عصر">شیفت عصر</option>
                        <option value="شب">شیفت شب</option>
                      </select>
                    </div>
                  </div>

                  {/* Secondary Details Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        شماره بچ خط:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: BAT-2604"
                        value={orderForm.batch_number}
                        onChange={(e) => setOrderForm({ ...orderForm, batch_number: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        سرپرست سفارش:
                      </label>
                      <input
                        type="text"
                        value={orderForm.supervisor}
                        onChange={(e) => setOrderForm({ ...orderForm, supervisor: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-bold text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        توضیحات و مشخصات فنی سفارش:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: الزام تست هیدرواستاتیک ۳۰ بار، رنگ‌آمیزی استاندارد..."
                        value={orderForm.notes}
                        onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Multiple Products Table Card */}
                <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-inner space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-emerald-500" />
                      <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        اقلام محصولات این سفارش ({toPersianDigits(orderItems.length)} محصول مختلف)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOrderItem}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>افزودن محصول دیگر به این سفارش</span>
                    </button>
                  </div>

                  <div className="w-full overflow-x-auto pb-1">
                    <table className="w-full text-right border-collapse text-xs min-w-[880px]">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700 font-bold text-[11px]">
                          <th className="px-2 py-2.5 w-12 text-center">ردیف</th>
                          <th className="px-2.5 py-2.5 min-w-[220px]">نوع و مدل محصول</th>
                          <th className="px-2 py-2.5 min-w-[170px] text-center bg-amber-950/10 text-amber-700 dark:text-amber-300 font-bold">نوع شیر</th>
                          <th className="px-2 py-2.5 min-w-[170px] text-center bg-cyan-950/10 text-cyan-700 dark:text-cyan-300 font-bold">نوع مهره</th>
                          <th className="px-2 py-2.5 w-28 text-center bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-black">تیراژ سفارش</th>
                          <th className="px-2.5 py-2.5 min-w-[150px]">یادداشت قلم</th>
                          <th className="px-2 py-2.5 w-14 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, idx) => {
                          const isForklift = item.cylinder_type === 'سیلندر لیفتراکی';
                          const forkliftNut = availableNutOptions.find(n => n.includes('لیفتراک')) || 'مهره لیفتراکی';
                          return (
                            <tr key={item.id} className="bg-white dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                              {/* ردیف */}
                              <td className="px-2 py-2.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                {toPersianDigits(idx + 1)}
                              </td>

                              {/* نوع و مدل محصول */}
                              <td className="px-2.5 py-2.5">
                                <div className="space-y-1.5">
                                  <select
                                    value={item.cylinder_type}
                                    onChange={(e) => {
                                      const newType = e.target.value as ProductionCylinderType;
                                      handleUpdateOrderItem(item.id, { cylinder_type: newType });
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 dark:text-white text-xs"
                                  >
                                    {availableProductionCylinderTypes.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>

                                  <select
                                    value={item.sub_variant}
                                    onChange={(e) => handleUpdateOrderItem(item.id, { sub_variant: e.target.value })}
                                    className="w-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-400 dark:border-indigo-800 rounded-lg px-2.5 py-1 font-bold text-indigo-900 dark:text-indigo-200 text-xs"
                                  >
                                    {getSubVariantsForProduct(item.cylinder_type, catalogMappings).map(sub => {
                                      const stock = subVariantStockMap[item.cylinder_type]?.[sub] || 0;
                                      return (
                                        <option key={sub} value={sub}>
                                          مدل {sub} (موجودی فعلی: {toPersianDigits(stock)})
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </td>

                              {/* نوع شیر */}
                              <td className="px-2 py-2.5 bg-amber-950/5">
                                {isForklift ? (
                                  <div className="space-y-1.5 text-right">
                                    <div>
                                      <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold block mb-0.5">
                                        شیر ۱ (مایع):
                                      </span>
                                      <select
                                        value={item.valve_type}
                                        onChange={(e) => handleUpdateOrderItem(item.id, { valve_type: e.target.value })}
                                        className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1 text-xs font-bold text-amber-950 dark:text-amber-200"
                                      >
                                        {FACTORY_VALVE_OPTIONS.map(v => (
                                          <option key={v} value={v}>{v}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold block mb-0.5">
                                        شیر ۲ (بخار):
                                      </span>
                                      <select
                                        value={item.valve_type_2 || 'شیر نو ۱۱ کیلویی لیفتراک'}
                                        onChange={(e) => handleUpdateOrderItem(item.id, { valve_type_2: e.target.value })}
                                        className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1 text-xs font-bold text-amber-950 dark:text-amber-200"
                                      >
                                        {FACTORY_VALVE_OPTIONS.map(v => (
                                          <option key={v} value={v}>{v}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ) : (
                                  <select
                                    value={item.valve_type}
                                    onChange={(e) => handleUpdateOrderItem(item.id, { valve_type: e.target.value })}
                                    className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1.5 font-bold text-xs text-amber-950 dark:text-amber-200"
                                  >
                                    {FACTORY_VALVE_OPTIONS.map(v => (
                                      <option key={v} value={v}>{v}</option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              {/* نوع مهره */}
                              <td className="px-2 py-2.5 bg-cyan-950/5">
                                {isForklift ? (
                                  <div className="space-y-1.5 text-right">
                                    <div>
                                      <span className="text-[10px] text-cyan-800 dark:text-cyan-300 font-bold block mb-0.5">
                                        مهره ۱:
                                      </span>
                                      <select
                                        value={item.nut_type}
                                        onChange={(e) => handleUpdateOrderItem(item.id, { nut_type: e.target.value })}
                                        className="w-full bg-white dark:bg-slate-950 border border-cyan-300 dark:border-cyan-800 rounded-lg px-2 py-1 text-xs font-bold text-cyan-950 dark:text-cyan-200"
                                      >
                                        {availableNutOptions.map(n => (
                                          <option key={n} value={n}>{n}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-cyan-800 dark:text-cyan-300 font-bold block mb-0.5">
                                        مهره ۲:
                                      </span>
                                      <select
                                        value={item.nut_type_2 || forkliftNut}
                                        onChange={(e) => handleUpdateOrderItem(item.id, { nut_type_2: e.target.value })}
                                        className="w-full bg-white dark:bg-slate-950 border border-cyan-300 dark:border-cyan-800 rounded-lg px-2 py-1 text-xs font-bold text-cyan-950 dark:text-cyan-200"
                                      >
                                        {availableNutOptions.map(n => (
                                          <option key={n} value={n}>{n}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ) : (
                                  <select
                                    value={item.nut_type}
                                    onChange={(e) => handleUpdateOrderItem(item.id, { nut_type: e.target.value })}
                                    className="w-full bg-white dark:bg-slate-950 border border-cyan-300 dark:border-cyan-800 rounded-lg px-2 py-1.5 font-bold text-xs text-cyan-950 dark:text-cyan-200"
                                  >
                                    {availableNutOptions.map(n => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              {/* تیراژ سفارش */}
                              <td className="px-2 py-2.5 bg-emerald-950/10">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.order_quantity}
                                  onChange={(e) => handleUpdateOrderItem(item.id, { order_quantity: Math.max(1, Number(e.target.value) || 1) })}
                                  required
                                  className="w-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 rounded-lg px-2 py-1.5 font-mono font-black text-xs text-center text-emerald-800 dark:text-emerald-300"
                                />
                              </td>

                              {/* یادداشت قلم */}
                              <td className="px-2.5 py-2.5">
                                <input
                                  type="text"
                                  placeholder="توضیح این قلم..."
                                  value={item.item_notes || ''}
                                  onChange={(e) => handleUpdateOrderItem(item.id, { item_notes: e.target.value })}
                                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs"
                                />
                              </td>

                              {/* عملیات حذف */}
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  disabled={orderItems.length <= 1}
                                  onClick={() => handleRemoveOrderItem(item.id)}
                                  title={orderItems.length <= 1 ? 'حداقل یک محصول باید در سفارش وجود داشته باشد' : 'حذف این محصول از سفارش'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    orderItems.length <= 1
                                      ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-40'
                                      : 'text-rose-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span>تعداد اقلام سفارش: <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">{toPersianDigits(orderItems.length)}</strong> محصول</span>
                      <span>مجموع تیراژ کل کپسول‌ها: <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-base">{toPersianDigits(orderItems.reduce((sum, itm) => sum + (Number(itm.order_quantity) || 0), 0))}</strong> عدد</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOrderItem}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>افزودن محصول دیگر</span>
                    </button>
                  </div>
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تایید و درج {toPersianDigits(orderItems.length)} محصول در کاردکس تولید</span>
                  </button>
                </div>
              </form>
            )}

            {/* FORM 2: اتمام کار و تحویل (رابطه مستقیم با سفارش‌های باز) */}
            {modalMode === 'COMPLETE_DELIVERY' && (
              <div className="p-4 sm:p-5 text-xs">
                
                {/* CASE A: No Open Orders Found */}
                {openOrders.length === 0 ? (
                  <div className="py-8 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                      <Clock className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">
                        هیچ سفارش بازی برای اتمام کار و تحویل وجود ندارد!
                      </h4>
                      <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                        طبق چرخه رسمی سیستم ام‌گاز، <strong>حتماً باید ابتدا سفارش جدید ثبت شود</strong> تا بتوانید پس از ساخت، اتمام کار و تحویل آن را ثبت فرمایید.
                      </p>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setModalMode('NEW_ORDER')}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 mx-auto cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>ثبت سفارش جدید برای این محصول</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* CASE B: Open Orders Exist - Select Order & Complete Delivery */
                  <form onSubmit={handleSubmitCompleteDelivery} className="space-y-4">
                    
                    {/* DIRECT RELATIONSHIP: Select which pending order is being completed */}
                    <div>
                      <label className="block text-amber-700 dark:text-amber-400 font-black mb-1.5 flex items-center justify-between">
                        <span>انتخاب سفارش باز جهت اتمام کار و تحویل:</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          ({toPersianDigits(openOrders.length)} سفارش در نوبت تحویل)
                        </span>
                      </label>
                      <select
                        value={selectedOrderIdForDelivery || (activeOrderToDeliver ? activeOrderToDeliver.entry_id : '')}
                        onChange={(e) => setSelectedOrderIdForDelivery(e.target.value)}
                        className="w-full bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 rounded-xl px-3 py-2.5 font-bold text-amber-950 dark:text-amber-200"
                        required
                      >
                        {openOrders.map(order => (
                          <option key={order.entry_id} value={order.entry_id}>
                            سفارش {order.transfer_sheet_number} | {order.cylinder_type} ({order.sub_variant || 'استاندارد'}) | {order.customer_name || order.destination_or_source} | تیراژ: {toPersianDigits(order.order_quantity || order.production_in)} عدد
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Order Information Banner */}
                    {activeOrderToDeliver && (
                      <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {activeOrderToDeliver.cylinder_type} - مدل {activeOrderToDeliver.sub_variant || 'استاندارد'}
                          </span>
                          <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                            {activeOrderToDeliver.transfer_sheet_number}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs">
                          <span>سفارش‌دهنده: <strong className="text-slate-900 dark:text-white">{activeOrderToDeliver.customer_name || activeOrderToDeliver.destination_or_source}</strong></span>
                          <span>تیراژ سفارشی: <strong className="font-mono text-emerald-600">{formatNumberEn(activeOrderToDeliver.order_quantity || activeOrderToDeliver.production_in)} عدد</strong></span>
                        </div>
                        <div className="flex items-center gap-3 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] flex-wrap">
                          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <Wrench className="w-3.5 h-3.5 text-amber-500" />
                            <span>شیر: <strong>{activeOrderToDeliver.valve_type || 'شیر نو استاندارد ام‌گاز'}</strong></span>
                          </span>
                          <span className="flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                            <Layers className="w-3.5 h-3.5 text-cyan-500" />
                            <span>مهره: <strong>{activeOrderToDeliver.nut_type || 'مهره 11/25/50 کیلویی بوتانی'}</strong></span>
                          </span>
                        </div>

                        {/* Real-time WH-PRODUCTION Stock Availability Control */}
                        {partsAvailability && (
                          <div className={`p-3 rounded-xl border transition-all ${
                            partsAvailability.available
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                              : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                {partsAvailability.available ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 animate-pulse" />
                                )}
                                <span className="font-black text-xs text-slate-800 dark:text-slate-100">
                                  کنترل موجودی قطعات در {partsAvailability.warehouseName} ({partsAvailability.warehouseCode}):
                                </span>
                              </div>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                                partsAvailability.available
                                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                                  : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200'
                              }`}>
                                {partsAvailability.available ? 'موجودی قطعات کافی است ✓' : 'کسری موجودی قطعات ⚠'}
                              </span>
                            </div>

                            <div className="space-y-1.5 text-xs">
                              {partsAvailability.requiredParts.map((part, pIdx) => (
                                <div
                                  key={pIdx}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] ${
                                    part.isSufficient
                                      ? 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800'
                                      : 'bg-rose-100/60 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {part.partType === 'VALVE' ? (
                                      <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    ) : (
                                      <Layers className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                                    )}
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{part.name}</span>
                                    <span className="text-[10px] text-slate-500">({part.roleLabel})</span>
                                  </div>
                                  <div className="flex items-center gap-2.5 font-mono">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      نیاز: <strong className="text-slate-900 dark:text-white">{toPersianDigits(part.requiredQty)}</strong>
                                    </span>
                                    <span className="text-slate-600 dark:text-slate-400">
                                      موجودی خط: <strong className={part.isSufficient ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-black'}>{toPersianDigits(part.availableQty)}</strong>
                                    </span>
                                    {part.isSufficient ? (
                                      <span className="text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">تأیید ✓</span>
                                    ) : (
                                      <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">
                                        کسری: {toPersianDigits(part.deficit)} عدد
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {!partsAvailability.available ? (
                              <div className="mt-2 p-2 bg-rose-100/80 dark:bg-rose-900/40 rounded-lg border border-rose-300 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 leading-relaxed">
                                <strong>اخطار عدم امکان اتمام کار:</strong> شیر و مهره مرتبط در «انبار خط تولید» موجود نیست یا با تیراژ تحویل همخوانی ندارد. طبق ضوابط تولید، <u>انباردار ابتدا باید قطعات فوق را به انبار خط تولید انتقال دهد</u> تا اجازه ثبت تحویل داده شود.
                              </div>
                            ) : (
                              <div className="mt-1.5 text-[10px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>با ثبت تحویل، قطعات فوق به طور اتوماتیک از انبار خط تولید کسر و حواله خروج صادر خواهد شد.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delivery Details In Horizontal Kardex Grid - Side by Side */}
                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                        <div>
                          <label className="block text-emerald-700 dark:text-emerald-400 font-black mb-1 text-[11px]">
                            تعداد تحویل قطعی:
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={deliveryForm.delivered_quantity}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, delivered_quantity: Number(e.target.value) || 1 })}
                            required
                            className="w-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-400 rounded-xl px-3 py-1.5 font-mono font-black text-xs text-emerald-800 dark:text-emerald-300 text-center"
                          />
                        </div>

                        <div>
                          <label className="block text-rose-700 dark:text-rose-400 font-bold mb-1 text-[11px]">
                            ضایعات / رد QC:
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={deliveryForm.defect_reject}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, defect_reject: Number(e.target.value) || 0 })}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 font-mono font-bold text-xs text-center text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[11px]">
                            تاریخ تحویل نهایی:
                          </label>
                          <PersianDatePicker
                            value={deliveryForm.date}
                            onChange={(d) => setDeliveryForm({ ...deliveryForm, date: d })}
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[11px]">
                            شماره حواله تحویل:
                          </label>
                          <input
                            type="text"
                            value={deliveryForm.delivery_sheet_number}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_sheet_number: e.target.value })}
                            required
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 font-mono font-bold text-xs text-center text-amber-600 dark:text-amber-400"
                          />
                        </div>
                      </div>

                      {/* Transport Strip - Side by Side */}
                      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-center">
                        <div>
                          <label className="block text-amber-900 dark:text-amber-300 font-bold mb-1 text-[10px]">
                            راننده حامل کالا:
                          </label>
                          <input
                            type="text"
                            placeholder="نام راننده"
                            value={deliveryForm.driver_name}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, driver_name: e.target.value })}
                            className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-amber-900 dark:text-amber-300 font-bold mb-1 text-[10px]">
                            پلاک خودرو باربری:
                          </label>
                          <input
                            type="text"
                            placeholder="۱۲ب۴۴۵ ایران ۶۸"
                            value={deliveryForm.plate_number}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, plate_number: e.target.value })}
                            className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-amber-900 dark:text-amber-300 font-bold mb-1 text-[10px]">
                            شماره بارنامه:
                          </label>
                          <input
                            type="text"
                            placeholder="BR-98442"
                            value={deliveryForm.waybill_number}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, waybill_number: e.target.value })}
                            className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[10px]">
                            سرپرست بارگیری:
                          </label>
                          <input
                            type="text"
                            value={deliveryForm.supervisor}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, supervisor: e.target.value })}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[10px]">
                            شیفت کاری:
                          </label>
                          <select
                            value={deliveryForm.shift_name}
                            onChange={(e) => setDeliveryForm({ ...deliveryForm, shift_name: e.target.value })}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-bold"
                          >
                            <option value="صبح">شیفت صبح</option>
                            <option value="عصر">شیفت عصر</option>
                            <option value="شب">شیفت شب</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Submit Buttons */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                      >
                        انصراف
                      </button>
                      <button
                        type="submit"
                        disabled={partsAvailability !== null && !partsAvailability.available}
                        title={
                          partsAvailability && !partsAvailability.available
                            ? 'امکان ثبت تحویل به دلیل کسری شیر یا مهره در انبار خط تولید وجود ندارد. انباردار ابتدا باید انتقال را ثبت کند.'
                            : 'تایید اتمام کار و ثبت تحویل کالا'
                        }
                        className={`px-6 py-2 rounded-xl font-black shadow-md flex items-center gap-1.5 transition-all ${
                          partsAvailability && !partsAvailability.available
                            ? 'bg-slate-400 dark:bg-slate-700 text-slate-200 cursor-not-allowed opacity-80'
                            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 cursor-pointer active:scale-95'
                        }`}
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>تایید اتمام کار و ثبت تحویل کالا</span>
                      </button>
                    </div>

                  </form>
                )}

              </div>
            )}

          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: EDIT ENTRY (بسته شدن با کلیک روی فضای خالی)
          ====================================================================== */}
      {showEditModal && editingEntry && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-6 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <span>ویرایش ردیف کاردکس تولید</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEntry(null);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditEntry} className="p-4 sm:p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    نوع محصول:
                  </label>
                  <input
                    type="text"
                    value={editingEntry.cylinder_type}
                    disabled
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-bold text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                    زیردسته / مدل:
                  </label>
                  <select
                    value={editingEntry.sub_variant || 'استاندارد'}
                    onChange={(e) => setEditingEntry({ ...editingEntry, sub_variant: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-bold"
                  >
                    {getSubVariantsForProduct(editingEntry.cylinder_type as ProductionCylinderType, catalogMappings).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    تاریخ شمسی:
                  </label>
                  <PersianDatePicker
                    value={editingEntry.date}
                    onChange={(d) => setEditingEntry({ ...editingEntry, date: d })}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    شماره برگه:
                  </label>
                  <input
                    type="text"
                    value={editingEntry.transfer_sheet_number}
                    onChange={(e) => setEditingEntry({ ...editingEntry, transfer_sheet_number: e.target.value })}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-emerald-600 dark:text-emerald-400 font-bold mb-1">
                    تیراژ سفارش:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingEntry.production_in}
                    onChange={(e) => setEditingEntry({ ...editingEntry, production_in: Number(e.target.value) || 0 })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-mono font-bold text-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-amber-600 dark:text-amber-400 font-bold mb-1">
                    تحویل قطعی:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingEntry.dispatch_out}
                    onChange={(e) => setEditingEntry({ ...editingEntry, dispatch_out: Number(e.target.value) || 0 })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-mono font-bold text-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-rose-600 dark:text-rose-400 font-bold mb-1">
                    رد QC:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingEntry.defect_reject}
                    onChange={(e) => setEditingEntry({ ...editingEntry, defect_reject: Number(e.target.value) || 0 })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-mono font-bold text-rose-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  شرح عملیات / سفارش:
                </label>
                <input
                  type="text"
                  value={editingEntry.description}
                  onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  نام مشتری / مقصد:
                </label>
                <input
                  type="text"
                  value={editingEntry.destination_or_source || editingEntry.customer_name || ''}
                  onChange={(e) => setEditingEntry({ ...editingEntry, destination_or_source: e.target.value, customer_name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-medium"
                />
              </div>

              {/* Valve & Nut Selection in Edit Modal */}
              {(editingEntry.cylinder_type === 'سیلندر لیفتراکی' || editingEntry.valve_type_2) ? (
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-xl space-y-3">
                  <div className="font-bold text-xs text-amber-900 dark:text-amber-300 flex items-center justify-between">
                    <span>مشخصات ۲ عدد شیر و ۲ عدد مهره لیفتراک:</span>
                    <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded">
                      سیلندر لیفتراکی
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-amber-800 dark:text-amber-300 font-bold mb-1 text-[11px]">
                        شیر اول (مایع):
                      </label>
                      <select
                        value={editingEntry.valve_type || 'شیر نو ۱۱ کیلویی لیفتراک'}
                        onChange={(e) => setEditingEntry({ ...editingEntry, valve_type: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1.5 font-bold text-xs"
                      >
                        {FACTORY_VALVE_OPTIONS.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-amber-800 dark:text-amber-300 font-bold mb-1 text-[11px]">
                        شیر دوم (بخار):
                      </label>
                      <select
                        value={editingEntry.valve_type_2 || editingEntry.valve_type || 'شیر نو ۱۱ کیلویی لیفتراک'}
                        onChange={(e) => setEditingEntry({ ...editingEntry, valve_type_2: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800 rounded-lg px-2 py-1.5 font-bold text-xs"
                      >
                        {FACTORY_VALVE_OPTIONS.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-cyan-800 dark:text-cyan-300 font-bold mb-1 text-[11px] flex items-center justify-between">
                        <span>مهره اول:</span>
                        <span className="text-[9px] text-cyan-600 font-normal">(دسته مهره‌ها)</span>
                      </label>
                      <select
                        value={editingEntry.nut_type || availableNutOptions[0]}
                        onChange={(e) => setEditingEntry({ ...editingEntry, nut_type: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-cyan-300 dark:border-cyan-800 rounded-lg px-2 py-1.5 font-bold text-xs"
                      >
                        {availableNutOptions.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-cyan-800 dark:text-cyan-300 font-bold mb-1 text-[11px] flex items-center justify-between">
                        <span>مهره دوم:</span>
                        <span className="text-[9px] text-cyan-600 font-normal">(دسته مهره‌ها)</span>
                      </label>
                      <select
                        value={editingEntry.nut_type_2 || editingEntry.nut_type || availableNutOptions[0]}
                        onChange={(e) => setEditingEntry({ ...editingEntry, nut_type_2: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 border border-cyan-300 dark:border-cyan-800 rounded-lg px-2 py-1.5 font-bold text-xs"
                      >
                        {availableNutOptions.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-amber-700 dark:text-amber-300 font-bold mb-1">
                      نوع شیر:
                    </label>
                    <select
                      value={editingEntry.valve_type || 'شیر نو استاندارد ام‌گاز'}
                      onChange={(e) => setEditingEntry({ ...editingEntry, valve_type: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-bold"
                    >
                      {FACTORY_VALVE_OPTIONS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-cyan-700 dark:text-cyan-300 font-bold mb-1 flex items-center justify-between">
                      <span>نوع مهره:</span>
                      <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-normal">
                        (فقط از دسته مهره‌ها)
                      </span>
                    </label>
                    <select
                      value={editingEntry.nut_type || availableNutOptions[0]}
                      onChange={(e) => setEditingEntry({ ...editingEntry, nut_type: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 font-bold"
                    >
                      {availableNutOptions.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingEntry(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-md cursor-pointer"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: TRASH CONFIRMATION (بسته شدن با کلیک روی فضای خالی)
          ====================================================================== */}
      {deletingEntry && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                انتقال به سطل آشغال کاردکس تولید
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              آیا از انتقال برگه <strong>{deletingEntry.transfer_sheet_number}</strong> ({deletingEntry.description}) به سطل آشغال اطمینان دارید؟
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                علت حذف (جهت لاگ ممیزی):
              </label>
              <input
                type="text"
                placeholder="مثال: سند تکراری، اشتباه در ثبت..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-medium"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmTrash}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md cursor-pointer"
              >
                انتقال به سطل آشغال
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: RECYCLE BIN (بسته شدن با کلیک روی فضای خالی)
          ====================================================================== */}
      {showTrashModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-6 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  سطل آشغال اسناد کاردکس تولید ام‌گاز ({toPersianDigits(trashedEntries.length)})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTrashModal(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
              {trashedEntries.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  سطل آشغال خالی است و هیچ سند کاردکس تولید حذف‌شده‌ای وجود ندارد.
                </div>
              ) : (
                trashedEntries.map((row) => (
                  <div
                    key={row.entry_id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{row.transfer_sheet_number}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px]">
                          {row.cylinder_type} {row.sub_variant && `(${row.sub_variant})`}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">{row.date}</span>
                      </div>
                      <div className="text-slate-500 mt-1">{row.description}</div>
                      {row.delete_reason && (
                        <div className="text-[11px] text-rose-500 mt-0.5">علت حذف: {row.delete_reason}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestore(row.entry_id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                        title="بازیابی و بازگردانی سند به جدول کاردکس"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>بازیابی</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(row.entry_id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                        title="حذف دائمی از پایگاه داده"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف دائم</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                اسناد بازیابی‌شده بلافاصله در محاسبات مانده موجودی شرکت داده می‌شوند.
              </span>
              <button
                type="button"
                onClick={() => setShowTrashModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: OFFICIAL PRINT SHEET (بسته شدن با کلیک روی فضای خالی)
          ====================================================================== */}
      {showPrintModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div
            className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-6 p-6 sm:p-8 space-y-6 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Action Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-base">
                  پیش‌نمایش چاپ رسمی کاردکس تولید: {selectedProductType} {selectedSubVariant !== 'ALL' && `(مدل ${selectedSubVariant})`}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintProductionKardex}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>ارسال به چاپگر (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportProductionKardexPdf}
                  disabled={isExportingPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                  title="دانلود مستقیم به صورت فایل استاندارد PDF A4 افقی"
                >
                  <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'در حال تولید PDF...' : 'دانلود فایل PDF (A4)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>

            {/* Official Print Document Content */}
            <div id="printable-production-kardex" className="space-y-4 bg-white p-2 rounded-xl">
              
              {/* Header Box */}
              <div className="border-2 border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div className="w-24 flex items-center justify-center">
                  <MGasOfficialLogo className="w-16 h-16" />
                </div>
                <div className="text-center space-y-1">
                  <div className="text-xs font-bold text-slate-600">شرکت صنعتی و بازرگانی ام‌گاز (سهامی خاص)</div>
                  <h2 className="text-lg font-black text-slate-900">
                    دفتر رسمی کاردکس و گردش تولید: {selectedProductType} {selectedSubVariant !== 'ALL' && `(مدل ${selectedSubVariant})`}
                  </h2>
                  <div className="text-[11px] text-slate-500">واحد کنترل سفارشات، خط تولید و تحویل به مشتریان</div>
                </div>
                <div className="w-32 text-[10px] space-y-1 text-left font-mono">
                  <div>تاریخ چاپ: {getPersianDate()}</div>
                  <div>سیستم: M-GAS WIN</div>
                  <div>صفحه: ۱ از ۱</div>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
                  <div className="text-[10px] text-slate-500">کل تیراژ سفارشات</div>
                  <div className="font-mono font-black text-emerald-700 text-base">{formatNumberEn(stats.totalProductionIn)}</div>
                </div>
                <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
                  <div className="text-[10px] text-slate-500">کل تحویل قطعی</div>
                  <div className="font-mono font-black text-amber-700 text-base">{formatNumberEn(stats.totalDispatchOut)}</div>
                </div>
                <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
                  <div className="text-[10px] text-slate-500">ضایعات / رد آزمون</div>
                  <div className="font-mono font-black text-rose-700 text-base">{formatNumberEn(stats.totalRejects)}</div>
                </div>
                <div className="border-2 border-indigo-600 rounded-lg p-2 bg-indigo-50">
                  <div className="text-[10px] text-indigo-900 font-bold">مانده موجودی انبار</div>
                  <div className="font-mono font-black text-indigo-800 text-base">{formatNumberEn(stats.currentBalance)}</div>
                </div>
              </div>

              {/* Print Table */}
              <table className="w-full text-right border-collapse text-[11px] border border-slate-300 leading-normal">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 font-bold leading-snug">
                    <th className="p-2 border-l border-slate-300 text-center w-10 align-middle">ردیف</th>
                    <th className="p-2 border-l border-slate-300 w-24 text-center align-middle">تاریخ</th>
                    <th className="p-2 border-l border-slate-300 align-middle">شرح سفارش / گردش</th>
                    <th className="p-2 border-l border-slate-300 text-center w-28 align-middle">نوع شیر</th>
                    <th className="p-2 border-l border-slate-300 text-center w-28 align-middle">نوع مهره</th>
                    <th className="p-2 border-l border-slate-300 text-center w-32 align-middle">سفارش دهنده</th>
                    <th className="p-2 border-l border-slate-300 text-center w-20 align-middle">تیراژ سفارش</th>
                    <th className="p-2 border-l border-slate-300 text-center w-20 align-middle">تحویل نهایی</th>
                    <th className="p-2 border-l border-slate-300 text-center w-16 align-middle">رد QC</th>
                    <th className="p-2 border-l border-slate-300 text-center w-24 font-black align-middle">مانده انبار</th>
                    <th className="p-2 text-center w-20 align-middle">سرپرست</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {productEntries.map((item, idx) => (
                    <tr key={item.entry_id} className="leading-normal">
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono align-middle">{idx + 1}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono align-middle">{item.date}</td>
                      <td className="p-1.5 border-l border-slate-300 align-middle">{item.description}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center text-[10px] align-middle">
                        {(item.cylinder_type === 'سیلندر لیفتراکی' || item.valve_type_2) ? (
                          <div className="flex flex-col leading-snug">
                            <span>۱: {item.valve_type || 'شیر مایع'}</span>
                            <span className="text-slate-500">۲: {item.valve_type_2 || item.valve_type || 'شیر بخار'}</span>
                          </div>
                        ) : (
                          item.valve_type || 'شیر نو استاندارد ام‌گاز'
                        )}
                      </td>
                      <td className="p-1.5 border-l border-slate-300 text-center text-[10px] align-middle">
                        {(item.cylinder_type === 'سیلندر لیفتراکی' || item.nut_type_2) ? (
                          <div className="flex flex-col leading-snug">
                            <span>۱: {item.nut_type || 'مهره اول'}</span>
                            <span className="text-slate-500">۲: {item.nut_type_2 || item.nut_type || 'مهره دوم'}</span>
                          </div>
                        ) : (
                          item.nut_type || 'مهره 11/25/50 کیلویی بوتانی'
                        )}
                      </td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-bold align-middle">{item.customer_name || item.destination_or_source || '-'}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono font-bold align-middle">{item.production_in || '-'}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono font-bold align-middle">{item.dispatch_out || '-'}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono font-bold align-middle">{item.defect_reject || '-'}</td>
                      <td className="p-1.5 border-l border-slate-300 text-center font-mono font-black text-indigo-900 align-middle">{item.stock_balance}</td>
                      <td className="p-1.5 text-center align-middle">{item.supervisor || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-4 gap-4 pt-6 text-center text-xs">
                <div className="border border-slate-300 rounded-lg p-3 h-24 flex flex-col justify-between">
                  <span className="font-bold">سرپرست خط تولید</span>
                  <span className="text-[10px] text-slate-400">امضاء و اثر انگشت</span>
                </div>
                <div className="border border-slate-300 rounded-lg p-3 h-24 flex flex-col justify-between">
                  <span className="font-bold">مسئول کنترل کیفی (QC)</span>
                  <span className="text-[10px] text-slate-400">امضاء و تایید آزمون</span>
                </div>
                <div className="border border-slate-300 rounded-lg p-3 h-24 flex flex-col justify-between">
                  <span className="font-bold">تحویل‌گیرنده / مشتری</span>
                  <span className="text-[10px] text-slate-400">امضاء و تحویل قطعی</span>
                </div>
                <div className="border border-slate-300 rounded-lg p-3 h-24 flex flex-col justify-between">
                  <span className="font-bold">مدیریت ارشد کارخانه</span>
                  <span className="text-[10px] text-slate-400">مهندس موسی عمویی</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: PHYSICAL GOODS EXIT RECEIPT (برگه فقط خروج از کارخانه - M.Gas cylinder)
          دقیقاً مطابق برگه خروج موجود با تمام تنظیمات مشابه در منو کاردکس تعمیر سیلندر
          ====================================================================== */}
      {showExitReceiptModal && selectedProductionEntryForExitReceipt && (
        <GoodsExitReceiptModal
          isOpen={showExitReceiptModal}
          onClose={() => {
            setShowExitReceiptModal(false);
            setSelectedProductionEntryForExitReceipt(null);
          }}
          productionEntry={selectedProductionEntryForExitReceipt}
          customer={customerList.find(c => c.name === (selectedProductionEntryForExitReceipt.customer_name || selectedProductionEntryForExitReceipt.destination_or_source)) || null}
          currentEnv={currentEnv}
          currentUser={currentUser}
          isExitOnly={true}
          onSaved={(receipt) => {
            refreshLocalState();
            showToast(`برگه خروج از کارخانه شماره ${receipt.form_number} با موفقیت در سیستم ثبت گردید.`, 'success');
          }}
        />
      )}

      {/* ======================================================================
          MODAL: INSUFFICIENT PRODUCTION PARTS WARNING (هشدار عدم موجودی شیر و مهره خط تولید)
          طبق دستور کاربر: اگر شیر و مهره مرتبط در انبار خط تولید موجود نباشد اجازه تحویل داده نمی‌شود
          ====================================================================== */}
      {partsDeficitModalData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-6">
            <div className="bg-gradient-to-r from-rose-600 to-red-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm">اخطار کسری موجودی در انبار خط تولید</h3>
                  <p className="text-[11px] text-rose-100">عدم اجازه اتمام کار و صدور کاردکس تحویل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPartsDeficitModalData(null)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 leading-relaxed font-bold">
                طبق الزامات مهندسی و انبارداری، هر سیلندر یا مخزن تولیدی به شیر نو و مهره نیاز دارد و این اقلام باید پیش از اتمام سفارش، توسط انباردار به <span className="underline">انبار خط تولید ({partsDeficitModalData.warehouseCode})</span> انتقال داده شده باشند.
              </div>

              <div>
                <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 mb-2">
                  اقلام الزامی دارای کسری در «{partsDeficitModalData.warehouseName}»:
                </h4>
                <div className="space-y-2">
                  {partsDeficitModalData.missingParts.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                          {item.partType === 'VALVE' ? <Wrench className="w-3.5 h-3.5 text-amber-500" /> : <Layers className="w-3.5 h-3.5 text-cyan-500" />}
                          <span>{item.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          نقش فنی: {item.roleLabel} | کد کالا: {item.sku}
                        </div>
                      </div>
                      <div className="text-left text-xs font-mono">
                        <div className="text-slate-500">نیاز: <strong className="text-slate-800 dark:text-slate-200">{toPersianDigits(item.requiredQty)}</strong></div>
                        <div className="text-slate-500">موجودی: <strong className="text-rose-600">{toPersianDigits(item.availableQty)}</strong></div>
                        <div className="text-rose-600 font-black">کسری: {toPersianDigits(item.deficit)} عدد</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>راهنمای انباردار جهت رفع اخطار:</span>
                </div>
                <p>
                  ۱. به منوی <strong>«انبار و گردش کالا»</strong> مراجعه فرمایید.
                </p>
                <p>
                  ۲. برای قطعات فوق، عملیات <strong>«جابجایی بین انبارها (انتقال)»</strong> را انتخاب کرده و از انبار مرکزی به <strong>«انبار خط تولید»</strong> حواله انتقال ثبت کنید.
                </p>
                <p>
                  ۳. پس از ثبت انتقال و تأمین موجودی، مجدداً به این بخش مراجعه کرده و تحویل سفارش را با موفقیت تأیید فرمایید.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPartsDeficitModalData(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  متوجه شدم و بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: ORDER DETAILS MODAL (جزئیات کامل سفارش با نمایش برجسته شماره برگه)
          درخواست کاربر: «نوشتن شماره برگه در جزئیات سفارش که در بخش عملیات قرار میدهی»
          ====================================================================== */}
      {selectedOrderForDetails && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-6 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-800/60 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">جزئیات سفارش و مشخصات سند</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">کاردکس ساخت و تولید ام‌گاز</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetails(null)}
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
                  <span className="text-[11px] font-bold text-indigo-300 block">شماره برگه سفارش / حواله:</span>
                  <span className="font-mono text-base sm:text-lg font-black text-indigo-200 tracking-wider font-mono-en" dir="ltr">
                    {selectedOrderForDetails.transfer_sheet_number}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedOrderForDetails.transfer_sheet_number);
                    showToast(`شماره برگه «${selectedOrderForDetails.transfer_sheet_number}» با موفقیت کپی شد.`, 'success');
                  }}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  title="کپی شماره برگه در کلیپ‌بورد"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی برگه</span>
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">تاریخ ثبت:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetails.date}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">سفارش‌دهنده:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{selectedOrderForDetails.customer_name || selectedOrderForDetails.destination_or_source || 'نامشخص'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">نوع محصول:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedOrderForDetails.cylinder_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">مدل / زیردسته:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedOrderForDetails.sub_variant || 'استاندارد'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">نوع شیر:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">{selectedOrderForDetails.valve_type || 'استاندارد'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">نوع مهره:</span>
                  <span className="font-bold text-cyan-700 dark:text-cyan-400">{selectedOrderForDetails.nut_type || 'استاندارد'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">تیراژ سفارش (ورودی):</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{selectedOrderForDetails.production_in ? formatNumberEn(selectedOrderForDetails.production_in) : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">تحویل نهایی (خروجی):</span>
                  <span className="font-mono font-black text-amber-600 dark:text-amber-400">{selectedOrderForDetails.dispatch_out ? formatNumberEn(selectedOrderForDetails.dispatch_out) : '-'}</span>
                </div>
              </div>

              {/* Full Description & Notes */}
              <div className="space-y-1.5 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] font-bold block">شرح کامل گردش:</span>
                <p className="text-slate-800 dark:text-slate-200 leading-relaxed text-[11.5px]">{selectedOrderForDetails.description || 'بدون شرح'}</p>
                {selectedOrderForDetails.notes && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                    یادداشت: {selectedOrderForDetails.notes}
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenExitReceipt(selectedOrderForDetails);
                    setSelectedOrderForDetails(null);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>برگه خروج کارخانه</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDetails(null)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
