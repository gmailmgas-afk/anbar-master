import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Product,
  Category,
  Warehouse,
  StockMovement,
  RuntimeEnvironment,
  User,
  Customer,
  Supplier,
  Invoice,
  CylinderValveInspection,
  SegregatedCustomerValveItem
} from '../types';
import {
  Printer,
  FileSpreadsheet,
  Calendar,
  Warehouse as WarehouseIcon,
  Layers,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Boxes,
  ArrowLeftRight,
  TrendingUp,
  Download,
  Info,
  ChevronDown,
  X,
  Code,
  Wifi,
  RefreshCw,
  Copy,
  Terminal,
  Check,
  Activity,
  Building2,
  Users,
  Truck,
  Hash,
  RotateCcw,
  UserCheck
} from 'lucide-react';
import {
  formatCurrencyToman,
  formatNumberFa,
  formatPersianDateTime,
  toPersianDigits,
  toEnglishDigits,
  getPersianDate
} from '../utils/persian';
import { exportElementToPdf } from '../utils/pdfExport';
import { printReceiptSheet } from '../utils/receiptPrint';
import { MGasOfficialLogo } from './MGasOfficialLogo';
import { SyncEngine, LiveLogEntry, CLOUDFLARE_WORKER_URL } from '../sync-engine/sync-client';
import { PersianDatePicker } from './PersianDatePicker';
import { LocalStorageManager } from '../database/storage';
import { readPersistedNavValue, savePersistedNavValue } from '../utils/navigationPersistence';
import * as XLSX from 'xlsx';

interface ReportsViewProps {
  products: Product[];
  categories: Category[];
  warehouses: Warehouse[];
  stockMovements: StockMovement[];
  stockQuantities: Record<string, Record<string, number>>;
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  customers?: Customer[];
  suppliers?: Supplier[];
  variant?: 'full' | 'financial';
}

type ReportType = 'inventory' | 'kardex' | 'suppliers' | 'party_report' | 'customer_valves' | 'live_logs';
type TimeFilterPreset = 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'current_year';
type StockStatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type ReportPartyScope = 'all' | 'suppliers' | 'customers';
type SupplierFilterMode = 'ALL_SUPPLIERS' | 'SINGLE_SUPPLIER';
type CustomerFilterMode = 'ALL_CUSTOMERS' | 'SINGLE_CUSTOMER';

const VALID_REPORT_TYPES_FULL: readonly ReportType[] = [
  'inventory',
  'kardex',
  'suppliers',
  'party_report',
  'customer_valves',
  'live_logs'
];
const VALID_REPORT_TYPES_FINANCIAL: readonly ReportType[] = [
  'inventory',
  'kardex',
  'suppliers',
  'party_report'
];
const VALID_PARTY_SCOPES: readonly ReportPartyScope[] = ['all', 'suppliers', 'customers'];

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  categories,
  warehouses,
  stockMovements,
  stockQuantities,
  currentEnv,
  currentUser,
  customers,
  suppliers,
  variant = 'full'
}) => {
  const isFinancialMode = variant === 'financial';
  const reportTypeStorageKey = isFinancialMode ? 'reports_type_financial' : 'reports_type_full';
  const partyScopeStorageKey = isFinancialMode ? 'reports_party_scope_financial' : 'reports_party_scope_full';

  // Master Party Scope Switch: همه طرف‌های حساب، تامین‌کنندگان، یا مشتریان
  const [reportPartyScope, setReportPartyScope] = useState<ReportPartyScope>(() =>
    readPersistedNavValue(partyScopeStorageKey, VALID_PARTY_SCOPES, 'all')
  );

  // Report Tab Selection - موجودی و گردش تفکیک‌شده شیرآلات در صف اول (و در حالت مالی، گزارش موجودی و ارزش‌گذاری)
  const [reportType, setReportType] = useState<ReportType>(() =>
    readPersistedNavValue(
      reportTypeStorageKey,
      variant === 'financial' ? VALID_REPORT_TYPES_FINANCIAL : VALID_REPORT_TYPES_FULL,
      variant === 'financial' ? 'inventory' : 'customer_valves'
    )
  );

  useEffect(() => {
    savePersistedNavValue(reportTypeStorageKey, reportType);
  }, [reportTypeStorageKey, reportType]);

  useEffect(() => {
    savePersistedNavValue(partyScopeStorageKey, reportPartyScope);
  }, [partyScopeStorageKey, reportPartyScope]);

  // Resolved Customers and Suppliers
  const allCustomers = useMemo(() => {
    if (customers && customers.length > 0) return customers;
    return LocalStorageManager.getState(currentEnv)?.customers || [];
  }, [customers, currentEnv]);

  const allSuppliers = useMemo(() => {
    if (suppliers && suppliers.length > 0) return suppliers;
    return LocalStorageManager.getState(currentEnv)?.suppliers || [];
  }, [suppliers, currentEnv]);

  // Enhanced Shamsi Date Range Filter (X تا X با تقویم شمسی)
  const [startDate, setStartDate] = useState<string>(''); // YYYY/MM/DD
  const [endDate, setEndDate] = useState<string>('');     // YYYY/MM/DD
  const [timePreset, setTimePreset] = useState<'all' | 'today' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'current_year' | 'custom'>('all');

  // Sub-selection Modes: تامین‌کنندگان (کلیه vs تک تامین‌کننده) / مشتریان (کلیه vs تک مشتری)
  const [supplierFilterMode, setSupplierFilterMode] = useState<SupplierFilterMode>('ALL_SUPPLIERS');
  const [customerFilterMode, setCustomerFilterMode] = useState<CustomerFilterMode>('ALL_CUSTOMERS');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [waybillFilter, setWaybillFilter] = useState<string>('');

  // Standard Filter States
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<StockStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  // Segregated Customer Valves Report States
  const [valveCategoryFilter, setValveCategoryFilter] = useState<'ALL' | 'NEW' | 'USED'>('ALL');
  const [valveViewMode, setValveViewMode] = useState<'SEGREGATED' | 'SUMMARY' | 'LEDGER'>('SEGREGATED');
  const [valveSearchQuery, setValveSearchQuery] = useState<string>('');

  // Live auto-refresh counter to immediately reflect new Kardex and inspection registrations
  const [dataVersion, setDataVersion] = useState<number>(0);

  useEffect(() => {
    const handleDataUpdate = () => {
      setDataVersion(v => v + 1);
    };
    const unsubscribe = LocalStorageManager.subscribe(handleDataUpdate);
    window.addEventListener('mgas:kardex_updated', handleDataUpdate);
    window.addEventListener('mgas:inspection_added', handleDataUpdate);
    window.addEventListener('mgas:inspection_updated', handleDataUpdate);
    window.addEventListener('mgas:db_refreshed', handleDataUpdate);
    window.addEventListener('mgas:database_refreshed', handleDataUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener('mgas:kardex_updated', handleDataUpdate);
      window.removeEventListener('mgas:inspection_added', handleDataUpdate);
      window.removeEventListener('mgas:inspection_updated', handleDataUpdate);
      window.removeEventListener('mgas:db_refreshed', handleDataUpdate);
      window.removeEventListener('mgas:database_refreshed', handleDataUpdate);
    };
  }, []);

  // Print Mode state
  const [isPrintPreviewActive, setIsPrintPreviewActive] = useState<boolean>(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Time preset selector
  const handleSelectTimePreset = (preset: 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'current_year') => {
    setTimePreset(preset);
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
    if (preset === 'last_90_days') {
      const past = new Date(Date.now() - 90 * 86400000);
      setStartDate(getPersianDate(past));
      setEndDate(todayShamsi);
      return;
    }
    if (preset === 'current_year') {
      const [year] = todayShamsi.split('/');
      setStartDate(`${year}/01/01`);
      setEndDate(`${year}/12/29`);
      return;
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setTimePreset('custom');
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setTimePreset('custom');
  };

  const handleResetAllFilters = () => {
    setSelectedWarehouseId('all');
    setSelectedCategoryId('all');
    setSelectedStockStatus('all');
    setStartDate('');
    setEndDate('');
    setTimePreset('all');
    setSupplierFilterMode('ALL_SUPPLIERS');
    setSelectedSupplierId('all');
    setCustomerFilterMode('ALL_CUSTOMERS');
    setSelectedCustomerId('all');
    setWaybillFilter('');
    setSearchQuery('');
    setSelectedProductId('all');
    setMovementTypeFilter('all');
  };

  const isAnyFilterActive = useMemo(() => {
    const isPartyFilterActive =
      reportPartyScope === 'suppliers'
        ? supplierFilterMode === 'SINGLE_SUPPLIER' || selectedSupplierId !== 'all'
        : customerFilterMode === 'SINGLE_CUSTOMER' || selectedCustomerId !== 'all';

    return (
      selectedWarehouseId !== 'all' ||
      selectedCategoryId !== 'all' ||
      selectedStockStatus !== 'all' ||
      startDate !== '' ||
      endDate !== '' ||
      isPartyFilterActive ||
      waybillFilter.trim() !== '' ||
      searchQuery.trim() !== '' ||
      selectedProductId !== 'all' ||
      movementTypeFilter !== 'all'
    );
  }, [
    selectedWarehouseId,
    selectedCategoryId,
    selectedStockStatus,
    startDate,
    endDate,
    reportPartyScope,
    supplierFilterMode,
    selectedSupplierId,
    customerFilterMode,
    selectedCustomerId,
    waybillFilter,
    searchQuery,
    selectedProductId,
    movementTypeFilter
  ]);

  // Pre-index invoices and inspections to resolve customer/supplier and waybill for every movement
  const { invoiceMap, inspectionMap } = useMemo(() => {
    const dbState = LocalStorageManager.getState(currentEnv);
    const invoices = dbState?.invoices || [];
    const inspections = dbState?.cylinder_valve_inspections || [];
    const invMap = new Map<string, Invoice>();
    invoices.forEach(inv => {
      if (inv.invoice_number) invMap.set(inv.invoice_number.toLowerCase().trim(), inv);
      if (inv.invoice_id) invMap.set(inv.invoice_id.toLowerCase().trim(), inv);
    });
    const inspMap = new Map<string, CylinderValveInspection>();
    inspections.forEach(insp => {
      if (insp.form_number) inspMap.set(insp.form_number.toLowerCase().trim(), insp);
      if (insp.waybill_number) inspMap.set(insp.waybill_number.toLowerCase().trim(), insp);
      if (insp.inspection_id) inspMap.set(insp.inspection_id.toLowerCase().trim(), insp);
    });
    return { invoiceMap: invMap, inspectionMap: inspMap };
  }, [currentEnv, dataVersion]);

  // ============================================================================
  // 1. FILTERED INVENTORY STOCK REPORT DATA
  // ============================================================================
  const filteredInventoryData = useMemo(() => {
    return products
      .map((p) => {
        const cat = categories.find((c) => c.category_id === p.category_id);
        const whMap = stockQuantities[p.product_id] || {};

        let currentQty = 0;
        if (selectedWarehouseId === 'all') {
          Object.values(whMap).forEach((val) => {
            currentQty += Number(val) || 0;
          });
        } else {
          currentQty = Number(whMap[selectedWarehouseId]) || 0;
        }

        let resolvedWhId = p.warehouse_id;
        if (!resolvedWhId) {
          let maxQ = -1;
          warehouses.forEach(w => {
            const q = Number(whMap[w.warehouse_id]) || 0;
            if (q > maxQ) {
              maxQ = q;
              resolvedWhId = w.warehouse_id;
            }
          });
        }
        const matchedWh = warehouses.find(w => w.warehouse_id === resolvedWhId) || warehouses[0];
        let cleanWhName = (matchedWh?.name || 'انبار مرکزی').replace(/^انبار\s+/, '').trim();
        const shelfLoc =
          p.shelf_location ||
          (p.shelf_letter && p.shelf_number ? `${p.shelf_letter}${p.shelf_number}` : '') ||
          matchedWh?.shelf_location ||
          '---';

        const isLow = currentQty > 0 && currentQty <= p.min_stock;
        const isOut = currentQty <= 0;
        const varianceFromMin = currentQty - (p.min_stock || 0);
        const totalPurchaseValuation = currentQty * (p.purchase_price || 0);
        const totalSaleValuation = currentQty * (p.sale_price || 0);

        return {
          product: p,
          categoryName: cat?.name || 'دسته‌بندی متفرقه',
          warehouseDisplayName: cleanWhName,
          shelfLocation: shelfLoc,
          currentQty,
          varianceFromMin,
          isLow,
          isOut,
          totalPurchaseValuation,
          totalSaleValuation
        };
      })
      .filter((item) => {
        // Warehouse filter (handled above in qty calculation)
        // Category filter
        if (selectedCategoryId !== 'all' && item.product.category_id !== selectedCategoryId) {
          return false;
        }

        // Stock status filter
        if (selectedStockStatus === 'in_stock' && item.currentQty <= 0) return false;
        if (selectedStockStatus === 'low_stock' && !item.isLow) return false;
        if (selectedStockStatus === 'out_of_stock' && item.currentQty > 0) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = item.product.name.toLowerCase().includes(q);
          const matchSku = item.product.sku.toLowerCase().includes(q);
          const matchBarcode = item.product.barcode?.toLowerCase().includes(q);
          if (!matchName && !matchSku && !matchBarcode) return false;
        }

        return true;
      });
  }, [products, categories, warehouses, stockQuantities, selectedWarehouseId, selectedCategoryId, selectedStockStatus, searchQuery]);

  // Inventory Totals
  const inventoryTotals = useMemo(() => {
    let totalItems = filteredInventoryData.length;
    let totalPhysicalQty = 0;
    let totalPurchaseVal = 0;
    let totalSaleVal = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    filteredInventoryData.forEach((item) => {
      totalPhysicalQty += item.currentQty;
      totalPurchaseVal += item.totalPurchaseValuation;
      totalSaleVal += item.totalSaleValuation;
      if (item.isLow) lowStockCount++;
      if (item.isOut) outOfStockCount++;
    });

    return {
      totalItems,
      totalPhysicalQty,
      totalPurchaseVal,
      totalSaleVal,
      lowStockCount,
      outOfStockCount
    };
  }, [filteredInventoryData]);

  // ============================================================================
  // 2. FILTERED KARDEX / STOCK MOVEMENTS REPORT DATA
  // ============================================================================
  const filteredKardexData = useMemo(() => {
    const rawFiltered = stockMovements
      .filter((m) => {
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInv = invoiceMap.get(refClean);
        const linkedInsp = inspectionMap.get(refClean);

        // Resolve Customer ID & Name
        const resolvedCustomerId =
          (m as any).customer_id ||
          linkedInv?.customer_id ||
          linkedInsp?.customer_id ||
          '';
        const resolvedCustomerName =
          (m as any).customer_name ||
          (linkedInv?.invoice_type === 'SALE' ? (linkedInv as any).party_name : '') ||
          linkedInsp?.customer_name ||
          (allCustomers.find(c => c.customer_id === resolvedCustomerId)?.name) ||
          '';

        // Resolve Supplier ID & Name
        const resolvedSupplierId =
          (m as any).supplier_id ||
          linkedInv?.supplier_id ||
          '';
        const resolvedSupplierName =
          (m as any).supplier_name ||
          (linkedInv?.invoice_type === 'PURCHASE' ? (linkedInv as any).party_name : '') ||
          (allSuppliers.find(s => s.supplier_id === resolvedSupplierId)?.name) ||
          '';

        const partyDisplayName =
          resolvedCustomerName ||
          resolvedSupplierName ||
          (linkedInv as any)?.party_name ||
          (m.notes?.includes('البرز') ? 'البرز گاز' : '') ||
          '---';

        const resolvedWaybillNumber =
          (m as any).waybill_number ||
          linkedInsp?.waybill_number ||
          (m.reference_id?.startsWith('BL-') || m.reference_id?.includes('بارنامه') ? m.reference_id : '') ||
          m.reference_id ||
          '---';

        // 1. Time filter via Shamsi Date Range (X تا X)
        const recordPersian = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordPersian < startDate) return false;
        if (endDate && recordPersian > endDate) return false;

        // 2. Party Scope Filter: همه، یا تامین‌کنندگان، یا مشتریان
        if (reportPartyScope === 'suppliers') {
          // گزارش منحصراً برای تامین‌کنندگان (ورود و خرید)
          if (supplierFilterMode === 'SINGLE_SUPPLIER' && selectedSupplierId !== 'all') {
            const targetSup = allSuppliers.find(s => s.supplier_id === selectedSupplierId);
            const sName = targetSup?.name.toLowerCase().trim() || '';
            const matchSupplier =
              resolvedSupplierId === selectedSupplierId ||
              (sName && resolvedSupplierName.toLowerCase().includes(sName)) ||
              (sName && (m.notes || '').toLowerCase().includes(sName)) ||
              (sName && (m.reference_id || '').toLowerCase().includes(sName));
            if (!matchSupplier) return false;
          } else {
            const isSupplierRelated =
              Boolean(resolvedSupplierId) ||
              Boolean(resolvedSupplierName) ||
              linkedInv?.invoice_type === 'PURCHASE' ||
              (m.movement_type === 'STOCK_IN' && !resolvedCustomerId && !m.customer_id);
            if (!isSupplierRelated) return false;
          }
        } else if (reportPartyScope === 'customers') {
          // گزارش مشتریان (شامل ورودی شیرآلات مشتریان، خروجی و فروش)
          if (customerFilterMode === 'SINGLE_CUSTOMER' && selectedCustomerId !== 'all') {
            const targetCust = allCustomers.find(c => c.customer_id === selectedCustomerId);
            const cName = targetCust?.name.toLowerCase().trim() || '';
            const matchCustomer =
              resolvedCustomerId === selectedCustomerId ||
              (cName && resolvedCustomerName.toLowerCase().includes(cName)) ||
              (cName && (m.notes || '').toLowerCase().includes(cName)) ||
              (cName && (m.reference_id || '').toLowerCase().includes(cName));
            if (!matchCustomer) return false;
          } else {
            const isCustomerRelated =
              Boolean(resolvedCustomerId) ||
              Boolean(resolvedCustomerName) ||
              Boolean(m.customer_name) ||
              Boolean(m.customer_id) ||
              m.valve_ownership === 'CUSTOMER' ||
              linkedInv?.invoice_type === 'SALE' ||
              Boolean(linkedInsp?.customer_name) ||
              m.movement_type === 'STOCK_OUT' ||
              m.movement_type === 'SALE';
            if (!isCustomerRelated) return false;
          }
        } else {
          // reportPartyScope === 'all': اگر تامین‌کننده یا مشتری خاص انتخاب شده باشد فیلتر اعمال شود
          if (supplierFilterMode === 'SINGLE_SUPPLIER' && selectedSupplierId !== 'all') {
            const matchSup = resolvedSupplierId === selectedSupplierId ||
              (allSuppliers.find(s => s.supplier_id === selectedSupplierId)?.name && resolvedSupplierName.includes(allSuppliers.find(s => s.supplier_id === selectedSupplierId)!.name));
            if (!matchSup) return false;
          }
          if (customerFilterMode === 'SINGLE_CUSTOMER' && selectedCustomerId !== 'all') {
            const matchCust = resolvedCustomerId === selectedCustomerId ||
              (allCustomers.find(c => c.customer_id === selectedCustomerId)?.name && resolvedCustomerName.includes(allCustomers.find(c => c.customer_id === selectedCustomerId)!.name));
            if (!matchCust) return false;
          }
        }

        // 4. Waybill filter
        if (waybillFilter.trim()) {
          const q = toEnglishDigits(waybillFilter.toLowerCase().trim());
          const matchWaybill =
            toEnglishDigits(m.reference_id || '').toLowerCase().includes(q) ||
            toEnglishDigits(resolvedWaybillNumber || '').toLowerCase().includes(q) ||
            toEnglishDigits(m.document_number || '').toLowerCase().includes(q) ||
            toEnglishDigits(m.notes || '').toLowerCase().includes(q);
          if (!matchWaybill) return false;
        }

        // 5. Warehouse filter
        if (selectedWarehouseId !== 'all') {
          if (m.warehouse_id !== selectedWarehouseId && m.destination_warehouse_id !== selectedWarehouseId) {
            return false;
          }
        }

        // 6. Product filter
        if (selectedProductId !== 'all' && m.product_id !== selectedProductId) {
          return false;
        }

        // 7. Category filter if product selected is all
        if (selectedCategoryId !== 'all') {
          const prod = products.find((p) => p.product_id === m.product_id);
          if (prod && prod.category_id !== selectedCategoryId) {
            return false;
          }
        }

        // 8. Movement type filter
        if (movementTypeFilter === 'TRANSFER') {
          if (m.movement_type !== 'TRANSFER_IN' && m.movement_type !== 'TRANSFER_OUT') {
            return false;
          }
        } else if (movementTypeFilter !== 'all' && m.movement_type !== movementTypeFilter) {
          return false;
        }

        // 9. Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const prod = products.find((p) => p.product_id === m.product_id);
          const matchDoc = m.document_number?.toLowerCase().includes(q);
          const matchRef = m.reference_id?.toLowerCase().includes(q);
          const matchName = prod?.name.toLowerCase().includes(q);
          const matchDesc = m.description?.toLowerCase().includes(q);
          const matchParty = partyDisplayName.toLowerCase().includes(q);
          const matchNotes = m.notes?.toLowerCase().includes(q);
          if (!matchDoc && !matchRef && !matchName && !matchDesc && !matchParty && !matchNotes) return false;
        }

        return true;
      });

    // Sort chronologically ascending to compute running balance per product
    const sortedAsc = [...rawFiltered].sort((a, b) => {
      const aDate = a.created_at || (a as any).date || '';
      const bDate = b.created_at || (b as any).date || '';
      return aDate.localeCompare(bDate);
    });

    const runningBalMap = new Map<string, number>();
    const withBal = sortedAsc.map((m) => {
      const prod = products.find((p) => p.product_id === m.product_id);
      const wh = warehouses.find((w) => w.warehouse_id === m.warehouse_id);
      const destWh = warehouses.find((w) => w.warehouse_id === m.destination_warehouse_id);

      const refClean = (m.reference_id || '').toLowerCase().trim();
      const linkedInv = invoiceMap.get(refClean);
      const linkedInsp = inspectionMap.get(refClean);

      const resolvedCustomerId =
        (m as any).customer_id ||
        linkedInv?.customer_id ||
        linkedInsp?.customer_id ||
        '';
      const resolvedCustomerName =
        (m as any).customer_name ||
        (linkedInv?.invoice_type === 'SALE' ? (linkedInv as any).party_name : '') ||
        linkedInsp?.customer_name ||
        (allCustomers.find(c => c.customer_id === resolvedCustomerId)?.name) ||
        '';

      const resolvedSupplierId =
        (m as any).supplier_id ||
        linkedInv?.supplier_id ||
        '';
      const resolvedSupplierName =
        (m as any).supplier_name ||
        (linkedInv?.invoice_type === 'PURCHASE' ? (linkedInv as any).party_name : '') ||
        (allSuppliers.find(s => s.supplier_id === resolvedSupplierId)?.name) ||
        '';

      const partyDisplayName =
        resolvedCustomerName ||
        resolvedSupplierName ||
        (linkedInv as any)?.party_name ||
        (m.notes?.includes('البرز') ? 'البرز گاز' : '') ||
        '---';

      const waybillNo =
        (m as any).waybill_number ||
        linkedInsp?.waybill_number ||
        (m.reference_id?.startsWith('BL-') || m.reference_id?.includes('بارنامه') ? m.reference_id : '') ||
        m.reference_id ||
        '---';

      const isInput =
        m.movement_type === 'STOCK_IN' ||
        m.movement_type === 'PURCHASE' ||
        m.movement_type === 'RETURN_IN';

      const qtyIn = isInput ? Math.abs(m.quantity) : 0;
      const qtyOut = !isInput ? Math.abs(m.quantity) : 0;
      const key = `${m.product_id}`;
      const curBal = runningBalMap.get(key) || 0;
      const nextBal = curBal + (qtyIn - qtyOut);
      runningBalMap.set(key, nextBal);

      return {
        movement: m,
        productName: prod?.name || 'کالای نامشخص',
        productSku: prod?.sku || '---',
        unit: prod?.unit || 'عدد',
        warehouseName: wh?.name || 'انبار نامشخص',
        destWarehouseName: destWh?.name,
        isInput,
        qtyIn,
        qtyOut,
        runningBalance: nextBal,
        unitPrice: m.unit_price || 0,
        totalPrice: m.total_price || Math.abs(m.quantity) * (m.unit_price || 0),
        partyDisplayName,
        waybillNo,
        persianDate: getPersianDate(m.created_at || (m as any).date)
      };
    });

    return withBal.reverse();
  }, [
    stockMovements,
    products,
    warehouses,
    startDate,
    endDate,
    reportPartyScope,
    supplierFilterMode,
    selectedSupplierId,
    customerFilterMode,
    selectedCustomerId,
    waybillFilter,
    selectedWarehouseId,
    selectedProductId,
    selectedCategoryId,
    movementTypeFilter,
    searchQuery,
    invoiceMap,
    inspectionMap,
    allCustomers,
    allSuppliers
  ]);

  // Kardex Totals
  const kardexTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalValuation = 0;

    filteredKardexData.forEach((row) => {
      totalIn += row.qtyIn;
      totalOut += row.qtyOut;
      totalValuation += row.totalPrice;
    });

    return {
      recordCount: filteredKardexData.length,
      totalIn,
      totalOut,
      netTurnover: totalIn - totalOut,
      totalValuation
    };
  }, [filteredKardexData]);

  // ============================================================================
  // 3. AGGREGATED SUPPLIERS REPORT DATA ("تامین‌کنندگان")
  // ============================================================================
  const suppliersAggregatedData = useMemo(() => {
    return allSuppliers.map((sup) => {
      const supMovements = stockMovements.filter((m) => {
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInv = invoiceMap.get(refClean);
        const resolvedSupplierId = (m as any).supplier_id || linkedInv?.supplier_id || '';
        const resolvedSupplierName = (m as any).supplier_name || (linkedInv?.invoice_type === 'PURCHASE' ? (linkedInv as any).party_name : '') || '';
        const sName = sup.name.toLowerCase().trim();

        const match =
          resolvedSupplierId === sup.supplier_id ||
          (sName && resolvedSupplierName.toLowerCase().includes(sName)) ||
          (sName && (m.notes || '').toLowerCase().includes(sName)) ||
          (sName && (m.reference_id || '').toLowerCase().includes(sName));

        if (!match) return false;

        // Date filter
        const recordPersian = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordPersian < startDate) return false;
        if (endDate && recordPersian > endDate) return false;

        return true;
      });

      const totalItemsIn = supMovements
        .filter((m) => m.movement_type === 'STOCK_IN' || m.movement_type === 'PURCHASE' || m.movement_type === 'RETURN_IN')
        .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

      const totalValuation = supMovements.reduce(
        (sum, m) => sum + (m.total_price || Math.abs(m.quantity) * (m.unit_price || 0)),
        0
      );

      const dbState = LocalStorageManager.getState(currentEnv);
      const invoices = dbState?.invoices || [];
      const supInvoices = invoices.filter(
        (inv) => inv.supplier_id === sup.supplier_id || (inv.party_name && inv.party_name.includes(sup.name))
      );

      const lastActivityDate = supMovements.reduce((latest, m) => {
        const dt = m.created_at || (m as any).date || '';
        return dt > latest ? dt : latest;
      }, '');

      return {
        supplier: sup,
        movementsCount: supMovements.length,
        totalItemsIn,
        totalValuation,
        invoicesCount: supInvoices.length,
        currentBalance: sup.current_balance || 0,
        lastActivityDate
      };
    });
  }, [allSuppliers, stockMovements, invoiceMap, startDate, endDate, currentEnv]);

  const suppliersTotals = useMemo(() => {
    let totalSuppliers = suppliersAggregatedData.length;
    let totalMovements = 0;
    let totalItemsIn = 0;
    let totalValuation = 0;
    let totalInvoices = 0;
    let totalBalance = 0;

    suppliersAggregatedData.forEach((s) => {
      totalMovements += s.movementsCount;
      totalItemsIn += s.totalItemsIn;
      totalValuation += s.totalValuation;
      totalInvoices += s.invoicesCount;
      totalBalance += s.currentBalance;
    });

    return {
      totalSuppliers,
      totalMovements,
      totalItemsIn,
      totalValuation,
      totalInvoices,
      totalBalance
    };
  }, [suppliersAggregatedData]);

  // ============================================================================
  // 4. SINGLE SUPPLIER KARDEX DATA ("تامین‌کننده کالا")
  // ============================================================================
  const singleSupplierData = useMemo(() => {
    const targetSup = allSuppliers.find((s) => s.supplier_id === selectedSupplierId) || allSuppliers[0];
    if (!targetSup) {
      return { supplier: null, rows: [], totalQty: 0, totalVal: 0 };
    }

    const rows = stockMovements
      .filter((m) => {
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInv = invoiceMap.get(refClean);
        const resolvedSupplierId = (m as any).supplier_id || linkedInv?.supplier_id || '';
        const resolvedSupplierName = (m as any).supplier_name || (linkedInv?.invoice_type === 'PURCHASE' ? (linkedInv as any).party_name : '') || '';
        const sName = targetSup.name.toLowerCase().trim();

        const match =
          resolvedSupplierId === targetSup.supplier_id ||
          (sName && resolvedSupplierName.toLowerCase().includes(sName)) ||
          (sName && (m.notes || '').toLowerCase().includes(sName)) ||
          (sName && (m.reference_id || '').toLowerCase().includes(sName));

        if (!match) return false;

        // Date filter
        const recordPersian = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordPersian < startDate) return false;
        if (endDate && recordPersian > endDate) return false;

        // Waybill filter
        if (waybillFilter.trim()) {
          const q = toEnglishDigits(waybillFilter.toLowerCase().trim());
          const matchWaybill =
            toEnglishDigits(m.reference_id || '').toLowerCase().includes(q) ||
            toEnglishDigits((m as any).waybill_number || '').toLowerCase().includes(q) ||
            toEnglishDigits(m.document_number || '').toLowerCase().includes(q);
          if (!matchWaybill) return false;
        }

        return true;
      })
      .map((m) => {
        const prod = products.find((p) => p.product_id === m.product_id);
        const wh = warehouses.find((w) => w.warehouse_id === m.warehouse_id);
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInsp = inspectionMap.get(refClean);
        const waybillNo = (m as any).waybill_number || linkedInsp?.waybill_number || m.reference_id || '---';

        return {
          movement: m,
          productName: prod?.name || 'کالای نامشخص',
          productSku: prod?.sku || '---',
          unit: prod?.unit || 'عدد',
          warehouseName: wh?.name || 'انبار نامشخص',
          qty: Math.abs(m.quantity),
          unitPrice: m.unit_price || 0,
          totalPrice: m.total_price || Math.abs(m.quantity) * (m.unit_price || 0),
          waybillNo,
          persianDate: getPersianDate(m.created_at || (m as any).date)
        };
      });

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const totalVal = rows.reduce((acc, r) => acc + r.totalPrice, 0);

    return {
      supplier: targetSup,
      rows,
      totalQty,
      totalVal
    };
  }, [
    selectedSupplierId,
    allSuppliers,
    stockMovements,
    products,
    warehouses,
    invoiceMap,
    inspectionMap,
    startDate,
    endDate,
    waybillFilter
  ]);

  // ============================================================================
  // 5. AGGREGATED CUSTOMERS REPORT DATA ("مشتریان")
  // ============================================================================
  const customersAggregatedData = useMemo(() => {
    return allCustomers.map((cust) => {
      const custMovements = stockMovements.filter((m) => {
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInv = invoiceMap.get(refClean);
        const linkedInsp = inspectionMap.get(refClean);
        const resolvedCustomerId = (m as any).customer_id || linkedInv?.customer_id || linkedInsp?.customer_id || '';
        const resolvedCustomerName =
          (m as any).customer_name ||
          (linkedInv?.invoice_type === 'SALE' ? (linkedInv as any).party_name : '') ||
          linkedInsp?.customer_name ||
          '';
        const cName = cust.name.toLowerCase().trim();

        const match =
          resolvedCustomerId === cust.customer_id ||
          (cName && resolvedCustomerName.toLowerCase().includes(cName)) ||
          (cName && (m.notes || '').toLowerCase().includes(cName)) ||
          (cName && (m.reference_id || '').toLowerCase().includes(cName));

        if (!match) return false;

        // Date filter
        const recordPersian = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordPersian < startDate) return false;
        if (endDate && recordPersian > endDate) return false;

        return true;
      });

      const totalItemsOut = custMovements
        .filter((m) => m.movement_type === 'STOCK_OUT' || m.movement_type === 'SALE')
        .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

      const totalValuation = custMovements.reduce(
        (sum, m) => sum + (m.total_price || Math.abs(m.quantity) * (m.unit_price || 0)),
        0
      );

      const dbState = LocalStorageManager.getState(currentEnv);
      const invoices = dbState?.invoices || [];
      const custInvoices = invoices.filter(
        (inv) => inv.customer_id === cust.customer_id || (inv.party_name && inv.party_name.includes(cust.name))
      );

      const lastActivityDate = custMovements.reduce((latest, m) => {
        const dt = m.created_at || (m as any).date || '';
        return dt > latest ? dt : latest;
      }, '');

      return {
        customer: cust,
        movementsCount: custMovements.length,
        totalItemsOut,
        totalValuation,
        invoicesCount: custInvoices.length,
        currentBalance: cust.current_balance || 0,
        lastActivityDate
      };
    });
  }, [allCustomers, stockMovements, invoiceMap, inspectionMap, startDate, endDate, currentEnv]);

  const customersTotals = useMemo(() => {
    let totalCustomers = customersAggregatedData.length;
    let totalMovements = 0;
    let totalItemsOut = 0;
    let totalValuation = 0;
    let totalInvoices = 0;
    let totalBalance = 0;

    customersAggregatedData.forEach((c) => {
      totalMovements += c.movementsCount;
      totalItemsOut += c.totalItemsOut;
      totalValuation += c.totalValuation;
      totalInvoices += c.invoicesCount;
      totalBalance += c.currentBalance;
    });

    return {
      totalCustomers,
      totalMovements,
      totalItemsOut,
      totalValuation,
      totalInvoices,
      totalBalance
    };
  }, [customersAggregatedData]);

  // ============================================================================
  // 6. SINGLE CUSTOMER KARDEX DATA ("کاردکس مشتری خاص")
  // ============================================================================
  const singleCustomerData = useMemo(() => {
    const targetCust = allCustomers.find((c) => c.customer_id === selectedCustomerId) || allCustomers[0];
    if (!targetCust) {
      return { customer: null, rows: [], totalQty: 0, totalVal: 0 };
    }

    const rows = stockMovements
      .filter((m) => {
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInv = invoiceMap.get(refClean);
        const linkedInsp = inspectionMap.get(refClean);
        const resolvedCustomerId = (m as any).customer_id || linkedInv?.customer_id || linkedInsp?.customer_id || '';
        const resolvedCustomerName =
          (m as any).customer_name ||
          (linkedInv?.invoice_type === 'SALE' ? (linkedInv as any).party_name : '') ||
          linkedInsp?.customer_name ||
          '';
        const cName = targetCust.name.toLowerCase().trim();

        const match =
          resolvedCustomerId === targetCust.customer_id ||
          (cName && resolvedCustomerName.toLowerCase().includes(cName)) ||
          (cName && (m.notes || '').toLowerCase().includes(cName)) ||
          (cName && (m.reference_id || '').toLowerCase().includes(cName));

        if (!match) return false;

        // Date filter
        const recordPersian = getPersianDate(m.created_at || (m as any).date);
        if (startDate && recordPersian < startDate) return false;
        if (endDate && recordPersian > endDate) return false;

        // Waybill filter
        if (waybillFilter.trim()) {
          const q = toEnglishDigits(waybillFilter.toLowerCase().trim());
          const matchWaybill =
            toEnglishDigits(m.reference_id || '').toLowerCase().includes(q) ||
            toEnglishDigits((m as any).waybill_number || '').toLowerCase().includes(q) ||
            toEnglishDigits(m.document_number || '').toLowerCase().includes(q);
          if (!matchWaybill) return false;
        }

        return true;
      })
      .map((m) => {
        const prod = products.find((p) => p.product_id === m.product_id);
        const wh = warehouses.find((w) => w.warehouse_id === m.warehouse_id);
        const refClean = (m.reference_id || '').toLowerCase().trim();
        const linkedInsp = inspectionMap.get(refClean);
        const waybillNo = (m as any).waybill_number || linkedInsp?.waybill_number || m.reference_id || '---';

        return {
          movement: m,
          productName: prod?.name || 'کالای نامشخص',
          productSku: prod?.sku || '---',
          unit: prod?.unit || 'عدد',
          warehouseName: wh?.name || 'انبار نامشخص',
          qty: Math.abs(m.quantity),
          unitPrice: m.unit_price || 0,
          totalPrice: m.total_price || Math.abs(m.quantity) * (m.unit_price || 0),
          waybillNo,
          persianDate: getPersianDate(m.created_at || (m as any).date)
        };
      });

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const totalVal = rows.reduce((acc, r) => acc + r.totalPrice, 0);

    return {
      customer: targetCust,
      rows,
      totalQty,
      totalVal
    };
  }, [
    selectedCustomerId,
    allCustomers,
    stockMovements,
    products,
    warehouses,
    invoiceMap,
    inspectionMap,
    startDate,
    endDate,
    waybillFilter
  ]);

  // Memoized Segregated Customer Valve Report
  const customerValveReportData = useMemo(() => {
    return LocalStorageManager.getCustomerValveDetailedReport(
      currentEnv,
      selectedCustomerId === 'all' ? undefined : selectedCustomerId,
      startDate || undefined,
      endDate || undefined,
      valveCategoryFilter
    );
  }, [currentEnv, selectedCustomerId, startDate, endDate, valveCategoryFilter, dataVersion]);

  const filteredCustomerValveRows = useMemo(() => {
    if (!valveSearchQuery.trim()) return customerValveReportData.segregatedRows;
    const q = valveSearchQuery.toLowerCase().trim();
    return customerValveReportData.segregatedRows.filter(
      r =>
        r.customer_name.toLowerCase().includes(q) ||
        r.valve_name.toLowerCase().includes(q) ||
        (r.company_name && r.company_name.toLowerCase().includes(q)) ||
        (r.province && r.province.toLowerCase().includes(q))
    );
  }, [customerValveReportData.segregatedRows, valveSearchQuery]);

  const filteredCustomerValveSummaries = useMemo(() => {
    if (!valveSearchQuery.trim()) return customerValveReportData.customerSummaryRows;
    const q = valveSearchQuery.toLowerCase().trim();
    return customerValveReportData.customerSummaryRows.filter(
      r =>
        r.customer_name.toLowerCase().includes(q) ||
        (r.company_name && r.company_name.toLowerCase().includes(q)) ||
        (r.province && r.province.toLowerCase().includes(q))
    );
  }, [customerValveReportData.customerSummaryRows, valveSearchQuery]);

  const filteredCustomerValveLedgers = useMemo(() => {
    if (!valveSearchQuery.trim()) return customerValveReportData.ledgerTransactions;
    const q = valveSearchQuery.toLowerCase().trim();
    return customerValveReportData.ledgerTransactions.filter(
      tx =>
        tx.customer_name.toLowerCase().includes(q) ||
        tx.valve_name.toLowerCase().includes(q) ||
        (tx.sheet_number && tx.sheet_number.toLowerCase().includes(q)) ||
        (tx.driver_name && tx.driver_name.toLowerCase().includes(q))
    );
  }, [customerValveReportData.ledgerTransactions, valveSearchQuery]);

  // ============================================================================
  // EXPORT EXCEL FUNCTION
  // ============================================================================
  const handleExportExcel = () => {
    if (reportType === 'customer_valves') {
      if (valveViewMode === 'SEGREGATED') {
        const rows = filteredCustomerValveRows.map((r, idx) => ({
          'ردیف': idx + 1,
          'نام مشتری / طرف‌حساب': r.customer_name,
          'شرکت / کارخانه': r.company_name || '---',
          'استان': r.province || '---',
          'مدل و مشخصات تفکیکی شیر': r.valve_name,
          'دسته‌بندی شیر': r.valve_category === 'NEW' ? 'شیر نو استاندارد' : 'شیر کهنه و داغی',
          'مقدار ورود (IN)': r.quantity_in,
          'مقدار خروج (OUT)': r.quantity_out,
          'مانده نزد انبار (BALANCE)': r.balance,
          'کسری تامین‌شده با ام‌گاز': r.mgas_covered,
          'وضعیت تراز': r.status_label,
          'تاریخ آخرین گردش': r.last_activity_date || '---'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'موجودی تفکیک‌شده شیرها');
        XLSX.writeFile(wb, `گزارش_تفکیکی_موجودی_شیر_مشتریان_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else if (valveViewMode === 'SUMMARY') {
        const rows = filteredCustomerValveSummaries.map((r, idx) => ({
          'ردیف': idx + 1,
          'نام مشتری': r.customer_name,
          'شرکت': r.company_name || '---',
          'استان': r.province || '---',
          'ورود شیر نو': r.total_new_in,
          'خروج شیر نو': r.total_new_out,
          'مانده شیر نو': r.new_balance,
          'ورود شیر کهنه': r.total_used_in,
          'خروج شیر کهنه': r.total_used_out,
          'مانده شیر کهنه': r.used_balance,
          'کل ورود': r.total_all_in,
          'کل خروج': r.total_all_out,
          'تراز نهایی کل شیرها': r.all_balance,
          'وضعیت تراز': r.status_label,
          'تاریخ آخرین فعالیت': r.last_activity_date || '---'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'خلاصه تراز شیر مشتریان');
        XLSX.writeFile(wb, `گزارش_تراز_کلی_شیر_مشتریان_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        const rows = filteredCustomerValveLedgers.map((tx, idx) => ({
          'ردیف': idx + 1,
          'تاریخ': tx.date,
          'زمان': tx.time || '---',
          'مشتری / طرف‌حساب': tx.customer_name,
          'نوع عملیات': tx.direction === 'IN' ? 'ورود به انبار' : 'خروج از انبار',
          'مدل و عنوان شیر': tx.valve_name,
          'دسته‌بندی': tx.valve_category === 'NEW' ? 'شیر نو' : 'شیر کهنه/داغی',
          'تعداد': tx.quantity,
          'مانده لحظه‌ای شیر X (Running Balance)': tx.running_balance !== undefined ? tx.running_balance : '---',
          'شماره سند / حواله': tx.sheet_number || '---',
          'منبع سند': tx.source_type,
          'راننده / تحویل‌دهنده': tx.driver_name || '---',
          'مسئول تایید': tx.verified_by || '---'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ریز اسناد گردش شیر');
        XLSX.writeFile(wb, `ریز_اسناد_گردش_شیر_مشتریان_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
    } else if (reportType === 'inventory') {
      const rows = filteredInventoryData.map((item, idx) => {
        const base: Record<string, any> = {
          'ردیف': idx + 1,
          'نام کالا': item.product.name,
          'کد کالا': item.product.sku,
          'دسته‌بندی': item.categoryName,
          'انبار و محل قفسه': selectedWarehouseId === 'all'
            ? `${item.warehouseDisplayName} (${item.shelfLocation})`
            : `${warehouses.find(w => w.warehouse_id === selectedWarehouseId)?.name || item.warehouseDisplayName} (${item.shelfLocation})`,
          'موجودی فیزیکی': item.currentQty,
          'واحد سنجش': item.product.unit || 'عدد',
          'حداقل سفارش': item.product.min_stock,
          'اختلاف تا نقطه سفارش': item.varianceFromMin,
          'وضعیت موجودی': item.isOut ? 'ناموجود' : item.isLow ? 'نقطه سفارش' : 'موجود',
          'بارکد': item.product.barcode || '---'
        };
        if (isFinancialMode) {
          base['قیمت خرید تومان'] = item.product.purchase_price;
          base['ارزش کل موجودی تومان'] = item.totalPurchaseValuation;
          base['قیمت فروش تومان'] = item.product.sale_price;
        }
        return base;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'موجودی انبار');
      XLSX.writeFile(wb, `گزارش_موجودی_انبار_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else if (reportType === 'suppliers' || reportType === 'party_report') {
      if (reportPartyScope === 'suppliers') {
        if (supplierFilterMode === 'ALL_SUPPLIERS') {
          const rows = suppliersAggregatedData.map((item, idx) => {
            const base: Record<string, any> = {
              'ردیف': idx + 1,
              'نام تامین‌کننده': item.supplier.name,
              'عنوان شرکت / بازرگانی': item.supplier.company_name || '---',
              'شماره تماس': item.supplier.phone || '---',
              'شهر / استان': `${item.supplier.province || ''} - ${item.supplier.city || ''}`,
              'تعداد اسناد و محموله‌ها': item.movementsCount,
              'تعداد اقلام وارده': item.totalItemsIn,
              'تاریخ آخرین تحویل': item.lastActivityDate ? getPersianDate(item.lastActivityDate) : '---'
            };
            if (isFinancialMode) {
              base['کد اقتصادی'] = item.supplier.economic_code || '---';
              base['ارزش کل خریدهای ثبتی تومان'] = item.totalValuation;
              base['تعداد فاکتورهای خرید'] = item.invoicesCount;
              base['مانده حساب فعلی تومان'] = item.currentBalance;
            }
            return base;
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'تامین‌کنندگان');
          XLSX.writeFile(wb, `گزارش_تامین_کنندگان_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } else {
          const rows = singleSupplierData.rows.map((row, idx) => {
            const base: Record<string, any> = {
              'ردیف': idx + 1,
              'نام کالا': row.productName,
              'کد کالا SKU': row.productSku,
              'شماره سند': row.movement.document_number || '---',
              'شماره بارنامه': row.waybillNo || '---',
              'تاریخ شمسی': row.persianDate,
              'تاریخ و زمان': formatPersianDateTime(row.movement.created_at),
              'مقدار وارده': row.qty,
              'واحد': row.unit,
              'انبار مقصد': row.warehouseName,
              'توضیحات': row.movement.notes || row.movement.description || '---'
            };
            if (isFinancialMode) {
              base['قیمت واحد تومان'] = row.unitPrice;
              base['مبلغ کل تومان'] = row.totalPrice;
            }
            return base;
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          const supName = (singleSupplierData.supplier?.name || 'تامین_کننده').replace(/\s+/g, '_');
          XLSX.utils.book_append_sheet(wb, ws, 'کاردکس تامین‌کننده');
          XLSX.writeFile(wb, `کاردکس_${supName}_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
      } else {
        // reportPartyScope === 'customers'
        if (customerFilterMode === 'ALL_CUSTOMERS') {
          const rows = customersAggregatedData.map((item, idx) => {
            const base: Record<string, any> = {
              'ردیف': idx + 1,
              'نام مشتری': item.customer.name,
              'شماره تماس': item.customer.phone || '---',
              'استان و شهر': `${item.customer.province || ''} - ${item.customer.city || ''}`,
              'تعداد اسناد و حواله‌ها': item.movementsCount,
              'تعداد اقلام صادره': item.totalItemsOut,
              'تاریخ آخرین ارسال': item.lastActivityDate ? getPersianDate(item.lastActivityDate) : '---'
            };
            if (isFinancialMode) {
              base['کد اقتصادی / ملی'] = item.customer.economic_code || item.customer.national_id || '---';
              base['ارزش کل فروش‌های ثبتی تومان'] = item.totalValuation;
              base['تعداد فاکتورها'] = item.invoicesCount;
              base['مانده حساب فعلی تومان'] = item.currentBalance;
            }
            return base;
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'مشتریان');
          XLSX.writeFile(wb, `گزارش_مشتریان_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } else {
          const rows = singleCustomerData.rows.map((row, idx) => {
            const base: Record<string, any> = {
              'ردیف': idx + 1,
              'نام کالا': row.productName,
              'کد کالا SKU': row.productSku,
              'شماره سند': row.movement.document_number || '---',
              'شماره بارنامه': row.waybillNo || '---',
              'تاریخ شمسی': row.persianDate,
              'تاریخ و زمان': formatPersianDateTime(row.movement.created_at),
              'مقدار صادره': row.qty,
              'واحد': row.unit,
              'انبار مبدا': row.warehouseName,
              'توضیحات': row.movement.notes || row.movement.description || '---'
            };
            if (isFinancialMode) {
              base['قیمت واحد تومان'] = row.unitPrice;
              base['مبلغ کل تومان'] = row.totalPrice;
            }
            return base;
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          const custName = (singleCustomerData.customer?.name || 'مشتری').replace(/\s+/g, '_');
          XLSX.utils.book_append_sheet(wb, ws, 'کاردکس مشتری');
          XLSX.writeFile(wb, `کاردکس_${custName}_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
      }
    } else {
      const rows = filteredKardexData.map((row, idx) => {
        const base: Record<string, any> = {
          'ردیف': idx + 1,
          'نام کالا': row.productName,
          'کد کالا': row.productSku,
          'شماره سند': row.movement.document_number || '---',
          'شماره بارنامه': row.waybillNo || '---',
          'طرف حساب': row.partyDisplayName || '---',
          'تاریخ و زمان': formatPersianDateTime(row.movement.created_at),
          'تاریخ شمسی': row.persianDate,
          'نوع عملیات': row.isInput ? 'ورود به انبار' : 'خروج از انبار',
          'انبار': row.warehouseName,
          'مقدار ورود': row.qtyIn,
          'مقدار خروج': row.qtyOut,
          'مانده لحظه‌ای (Running Balance)': row.runningBalance,
          'واحد': row.unit,
          'شماره ارجاع': row.movement.reference_id || '---',
          'شرح عملیات': row.movement.description || row.movement.notes || '---'
        };
        if (isFinancialMode) {
          base['قیمت واحد تومان'] = row.unitPrice;
          base['ارزش کل سند تومان'] = row.totalPrice;
        }
        return base;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'کاردکس کالا');
      XLSX.writeFile(wb, `گزارش_کاردکس_انبار_ام_گاز_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'success'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);

  const filteredLiveLogs = useMemo(() => {
    return liveLogs.filter((log) => {
      if (logFilter !== 'all' && log.level !== logFilter) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const matchMsg = (log.message || '').toLowerCase().includes(q);
        const matchSrc = (log.source || '').toLowerCase().includes(q);
        return matchMsg || matchSrc;
      }
      return true;
    });
  }, [liveLogs, logFilter, logSearchQuery]);
  const [cloudStatusInfo, setCloudStatusInfo] = useState<{
    connected: boolean;
    status: string;
    url: string;
    latencyMs?: number;
    error?: string;
    totalCloudEvents?: number;
  } | null>(null);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(null), 3500);
  };

  // Subscribe to live sync logs
  useEffect(() => {
    const unsub = SyncEngine.subscribeLogs((logs) => {
      setLiveLogs(logs);
    });
    // Check initial cloud status
    SyncEngine.checkCloudStatus().then(info => setCloudStatusInfo(info)).catch(() => {});
    return () => unsub();
  }, []);

  const handleCheckCloud = async () => {
    setIsCheckingCloud(true);
    try {
      const res = await SyncEngine.checkCloudStatus();
      setCloudStatusInfo(res);
      showNotification(res.connected ? `اتصال با دامنه ${res.url} فعال و پایدار است (${res.latencyMs || 0}ms)` : `عدم برقراری ارتباط: ${res.error || res.status}`);
    } finally {
      setIsCheckingCloud(false);
    }
  };

  const handleForceSync = async () => {
    setIsForceSyncing(true);
    try {
      const ok = await SyncEngine.forcePullFromCloud(currentEnv);
      const res = await SyncEngine.checkCloudStatus();
      setCloudStatusInfo(res);
      showNotification(ok ? 'دیتابیس‌ها با سرور مرکزی anbar.mgas.ir با موفقیت بروزرسانی شدند.' : 'خطا در همگام‌سازی، لطفا لاگ‌ها را بررسی نمایید.');
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleCopyLiveLogs = () => {
    const text = liveLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}]: ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    showNotification('لاگ‌های ارتباطی با موفقیت در حافظه کپی شدند.');
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // ============================================================================
  // EXPORT JSON REPORT (100% Reliable on Windows Desktop and Web)
  // ============================================================================
  const handleExportJson = async () => {
    try {
      let exportPayload: any = {};
      if (reportType === 'live_logs') {
        exportPayload = {
          report_title: 'گزارش زنده وضعیت اتصال و لاگ‌های همگام‌سازی ابری anbar.mgas.ir',
          domain: CLOUDFLARE_WORKER_URL,
          generated_at_persian: formatPersianDateTime(new Date().toISOString()),
          generated_at_iso: new Date().toISOString(),
          operator: currentUser.full_name,
          cloud_status: cloudStatusInfo,
          total_logs: liveLogs.length,
          logs: liveLogs
        };
      } else if (reportType === 'suppliers' || reportType === 'party_report') {
        if (reportPartyScope === 'suppliers') {
          exportPayload = {
            report_title: supplierFilterMode === 'ALL_SUPPLIERS'
              ? 'کاربرگ رسمی گزارش تجمیعی تامین‌کنندگان'
              : `کاردکس و گردش رسمی تامین‌کننده کالا: ${singleSupplierData.supplier?.name || 'تامین‌کننده'}`,
            company: 'کارخانه تولید/تعمیر انواع سیلندر ام گاز (M.Gas)',
            domain: 'https://anbar.mgas.ir',
            party_scope: 'suppliers',
            supplier_selection_mode: supplierFilterMode,
            export_date_persian: formatPersianDateTime(new Date().toISOString()),
            export_date_iso: new Date().toISOString(),
            operator: currentUser.full_name,
            summary_totals: isFinancialMode
              ? (supplierFilterMode === 'ALL_SUPPLIERS' ? suppliersTotals : {
                  total_quantity: singleSupplierData.totalQty,
                  total_valuation: singleSupplierData.totalVal
                })
              : (supplierFilterMode === 'ALL_SUPPLIERS' ? {
                  totalSuppliers: suppliersTotals.totalSuppliers,
                  totalMovements: suppliersTotals.totalMovements,
                  totalItemsIn: suppliersTotals.totalItemsIn
                } : {
                  total_quantity: singleSupplierData.totalQty,
                  total_documents: singleSupplierData.rows.length
                }),
            data: isFinancialMode
              ? (supplierFilterMode === 'ALL_SUPPLIERS' ? suppliersAggregatedData : singleSupplierData)
              : (supplierFilterMode === 'ALL_SUPPLIERS'
                ? suppliersAggregatedData.map(item => ({
                    supplier_id: item.supplier.supplier_id,
                    name: item.supplier.name,
                    company_name: item.supplier.company_name,
                    phone: item.supplier.phone,
                    movementsCount: item.movementsCount,
                    totalItemsIn: item.totalItemsIn,
                    lastActivityDate: item.lastActivityDate
                  }))
                : {
                    supplier: singleSupplierData.supplier ? {
                      supplier_id: singleSupplierData.supplier.supplier_id,
                      name: singleSupplierData.supplier.name,
                      company_name: singleSupplierData.supplier.company_name,
                      phone: singleSupplierData.supplier.phone
                    } : null,
                    totalQty: singleSupplierData.totalQty,
                    rows: singleSupplierData.rows.map(r => ({
                      productName: r.productName,
                      productSku: r.productSku,
                      unit: r.unit,
                      warehouseName: r.warehouseName,
                      qty: r.qty,
                      waybillNo: r.waybillNo,
                      persianDate: r.persianDate,
                      document_number: r.movement.document_number,
                      notes: r.movement.notes || r.movement.description || '---'
                    }))
                  })
          };
        } else {
          exportPayload = {
            report_title: customerFilterMode === 'ALL_CUSTOMERS'
              ? 'کاربرگ رسمی گزارش تجمیعی مشتریان ام گاز'
              : `کاردکس و گردش رسمی مشتری: ${singleCustomerData.customer?.name || 'مشتری'}`,
            company: 'کارخانه تولید/تعمیر انواع سیلندر ام گاز (M.Gas)',
            domain: 'https://anbar.mgas.ir',
            party_scope: 'customers',
            customer_selection_mode: customerFilterMode,
            export_date_persian: formatPersianDateTime(new Date().toISOString()),
            export_date_iso: new Date().toISOString(),
            operator: currentUser.full_name,
            summary_totals: isFinancialMode
              ? (customerFilterMode === 'ALL_CUSTOMERS' ? customersTotals : {
                  total_quantity: singleCustomerData.totalQty,
                  total_valuation: singleCustomerData.totalVal
                })
              : (customerFilterMode === 'ALL_CUSTOMERS' ? {
                  totalCustomers: customersTotals.totalCustomers,
                  totalMovements: customersTotals.totalMovements,
                  totalItemsOut: customersTotals.totalItemsOut
                } : {
                  total_quantity: singleCustomerData.totalQty,
                  total_documents: singleCustomerData.rows.length
                }),
            data: isFinancialMode
              ? (customerFilterMode === 'ALL_CUSTOMERS' ? customersAggregatedData : singleCustomerData)
              : (customerFilterMode === 'ALL_CUSTOMERS'
                ? customersAggregatedData.map(item => ({
                    customer_id: item.customer.customer_id,
                    name: item.customer.name,
                    phone: item.customer.phone,
                    province: item.customer.province,
                    city: item.customer.city,
                    movementsCount: item.movementsCount,
                    totalItemsOut: item.totalItemsOut,
                    lastActivityDate: item.lastActivityDate
                  }))
                : {
                    customer: singleCustomerData.customer ? {
                      customer_id: singleCustomerData.customer.customer_id,
                      name: singleCustomerData.customer.name,
                      province: singleCustomerData.customer.province,
                      city: singleCustomerData.customer.city,
                      phone: singleCustomerData.customer.phone
                    } : null,
                    totalQty: singleCustomerData.totalQty,
                    rows: singleCustomerData.rows.map(r => ({
                      productName: r.productName,
                      productSku: r.productSku,
                      unit: r.unit,
                      warehouseName: r.warehouseName,
                      qty: r.qty,
                      waybillNo: r.waybillNo,
                      persianDate: r.persianDate,
                      document_number: r.movement.document_number,
                      notes: r.movement.notes || r.movement.description || '---'
                    }))
                  })
          };
        }
      } else if (reportType === 'customer_valves') {
        exportPayload = {
          report_title: valveViewMode === 'SEGREGATED'
            ? 'کاربرگ رسمی موجودی تفکیک‌شده شیرهای مشتریان ام گاز (مدل به مدل)'
            : valveViewMode === 'SUMMARY'
            ? 'کاربرگ رسمی خلاصه تراز کل شیرهای مشتریان ام گاز'
            : 'کاربرگ رسمی ریز اسناد و حواله‌های گردش شیرآلات مشتریان',
          company: 'کارخانه تولید/تعمیر انواع سیلندر ام گاز (M.Gas)',
          domain: 'https://anbar.mgas.ir',
          report_type: 'customer_valves',
          valve_view_mode: valveViewMode,
          valve_category_filter: valveCategoryFilter,
          customer_filter: selectedCustomerId === 'all' ? 'همه مشتریان' : allCustomers.find(c => c.customer_id === selectedCustomerId)?.name,
          date_range: { start: startDate || 'همه', end: endDate || 'همه' },
          export_date_persian: formatPersianDateTime(new Date().toISOString()),
          export_date_iso: new Date().toISOString(),
          operator: currentUser.full_name,
          totals: customerValveReportData.totals,
          data: valveViewMode === 'SEGREGATED'
            ? filteredCustomerValveRows
            : valveViewMode === 'SUMMARY'
            ? filteredCustomerValveSummaries
            : filteredCustomerValveLedgers
        };
      } else {
        exportPayload = {
          report_title: reportType === 'inventory'
            ? (isFinancialMode ? 'گزارش رسمی موجودی و ارزش‌گذاری انبارها' : 'گزارش رسمی موجودی فیزیکی و نقطه سفارش انبارها')
            : 'کاردکس رسمی گردش اسناد ورود و خروج انبار',
          company: 'کارخانه تولید/تعمیر انواع سیلندر ام گاز (M.Gas)',
          domain: 'https://anbar.mgas.ir',
          report_type: reportType,
          export_date_persian: formatPersianDateTime(new Date().toISOString()),
          export_date_iso: new Date().toISOString(),
          target_warehouse: selectedWarehouseId === 'all' ? 'تمام انبارها' : warehouses.find(w => w.warehouse_id === selectedWarehouseId)?.name,
          operator: currentUser.full_name,
          summary_totals: reportType === 'inventory'
            ? (isFinancialMode ? inventoryTotals : {
                totalItems: inventoryTotals.totalItems,
                totalPhysicalQty: inventoryTotals.totalPhysicalQty,
                lowStockCount: inventoryTotals.lowStockCount,
                outOfStockCount: inventoryTotals.outOfStockCount
              })
            : (isFinancialMode ? kardexTotals : {
                recordCount: kardexTotals.recordCount,
                totalIn: kardexTotals.totalIn,
                totalOut: kardexTotals.totalOut,
                netTurnover: kardexTotals.netTurnover
              }),
          data: reportType === 'inventory' ? filteredInventoryData.map((item, idx) => {
            const base: Record<string, any> = {
              row: idx + 1,
              name: item.product.name,
              sku: item.product.sku,
              category: item.categoryName,
              warehouse: selectedWarehouseId === 'all' ? item.warehouseDisplayName : warehouses.find(w => w.warehouse_id === selectedWarehouseId)?.name,
              shelf: item.shelfLocation,
              current_stock: item.currentQty,
              unit: item.product.unit || 'عدد',
              min_stock: item.product.min_stock,
              variance_from_min: item.varianceFromMin,
              status: item.isOut ? 'ناموجود' : item.isLow ? 'نقطه سفارش' : 'موجود'
            };
            if (isFinancialMode) {
              base.purchase_price = item.product.purchase_price;
              base.total_valuation = item.totalPurchaseValuation;
              base.sale_price = item.product.sale_price;
            }
            return base;
          }) : filteredKardexData.map((row, idx) => {
            const base: Record<string, any> = {
              row: idx + 1,
              product_name: row.productName,
              sku: row.productSku,
              document_number: row.movement.document_number,
              date: formatPersianDateTime(row.movement.created_at),
              operation: row.isInput ? 'ورود به انبار' : 'خروج از انبار',
              warehouse: row.warehouseName,
              quantity_in: row.qtyIn,
              quantity_out: row.qtyOut,
              running_balance: row.runningBalance,
              unit: row.unit,
              reference_id: row.movement.reference_id || '---',
              description: row.movement.description || row.movement.notes || '---'
            };
            if (isFinancialMode) {
              base.unit_price = row.unitPrice;
              base.total_price = row.totalPrice;
            }
            return base;
          })
        };
      }

      const jsonString = JSON.stringify(exportPayload, null, 2);
      const defaultFileName = `report_mgas_${reportType}_${new Date().toISOString().slice(0, 10)}.json`;

      // 1. Windows Desktop Direct Save via Electron Dialog
      if (typeof window !== 'undefined' && window.desktopAPI?.saveJsonFile) {
        const deskRes = await window.desktopAPI.saveJsonFile(defaultFileName, jsonString);
        if (deskRes.success) {
          showNotification(`فایل گزارش JSON با موفقیت در ویندوز ذخیره شد: ${deskRes.filePath || defaultFileName}`);
          return;
        } else if (deskRes.canceled) {
          return;
        }
      }

      // 2. Browser standard Blob download
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);

      // 3. Fallback Clipboard copy for bulletproof access
      try {
        await navigator.clipboard.writeText(jsonString);
        showNotification('فایل گزارش JSON دانلود شد (یک نسخه نیز در حافظه کپی شد).');
      } catch {
        showNotification('فایل گزارش JSON با موفقیت تولید و دانلود شد.');
      }
    } catch (err: any) {
      console.error('JSON export error:', err);
      showNotification('خطا در تولید خروجی JSON: ' + (err?.message || 'نامشخص'));
    }
  };

  // ============================================================================
  // PRINT & PDF ACTIONS
  // ============================================================================
  const handlePrint = () => {
    setIsPrinting(true);
    setIsPrintPreviewActive(true);
    const reportTitleText =
      reportType === 'customer_valves'
        ? valveViewMode === 'SEGREGATED'
          ? 'موجودی تفکیک‌شده شیرهای مشتریان'
          : valveViewMode === 'SUMMARY'
          ? 'خلاصه تراز شیرهای مشتریان'
          : 'ریز اسناد گردش شیر مشتریان'
        : reportType === 'inventory'
        ? 'موجودی کالاها'
        : reportType === 'kardex'
        ? reportPartyScope === 'suppliers'
          ? 'گردش و کاردکس انبار (تامین‌کنندگان)'
          : 'گردش و کاردکس انبار (مشتریان)'
        : reportType === 'suppliers' || reportType === 'party_report'
        ? reportPartyScope === 'suppliers'
          ? supplierFilterMode === 'ALL_SUPPLIERS'
            ? 'گزارش تجمیعی تامین‌کنندگان'
            : `کاردکس تامین‌کننده کالا (${singleSupplierData.supplier?.name || ''})`
          : customerFilterMode === 'ALL_CUSTOMERS'
            ? 'گزارش تجمیعی مشتریان'
            : `کاردکس مشتری (${singleCustomerData.customer?.name || ''})`
        : 'لاگ‌های ارتباطی anbar.mgas.ir';

    printReceiptSheet({
      elementId: 'printable-report-section',
      title: `گزارش انبار ام گاز - ${reportTitleText}`,
      paperSize: 'A4',
      orientation: 'portrait',
      onComplete: () => {
        setIsPrinting(false);
      }
    });
    setTimeout(() => {
      setIsPrinting(false);
    }, 2500);
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const pdfTypeTag =
        reportType === 'customer_valves'
          ? 'mojoodi_shir_moshtarian'
          : reportType === 'inventory'
          ? 'mojoodi'
          : reportType === 'kardex'
          ? reportPartyScope === 'suppliers'
            ? 'gardesh_tamin'
            : 'gardesh_moshtari'
          : reportType === 'suppliers' || reportType === 'party_report'
          ? reportPartyScope === 'suppliers'
            ? supplierFilterMode === 'ALL_SUPPLIERS'
              ? 'tamin_konandegan'
              : 'tamin_konande_kala'
            : customerFilterMode === 'ALL_CUSTOMERS'
              ? 'moshtarian'
              : 'kardex_moshtari'
          : 'loghaye_ertebat';

      await exportElementToPdf('printable-report-section', {
        filename: `gozaresh_${pdfTypeTag}.pdf`,
        orientation: 'portrait',
        format: 'a4',
        marginMm: 4
      });
    } catch (err) {
      console.error('Report PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {noticeMessage && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{noticeMessage}</span>
        </div>
      )}


      {/* Filters & Reports Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        {/* Report Type Navigation Selector */}
        <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80 print:hidden flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
            {/* 1. صف اول: موجودی تفکیک‌شده شیرهای مشتریان (فقط در گزارش‌گیری کامل) */}
            {variant !== 'financial' && (
              <button
                type="button"
                onClick={() => setReportType('customer_valves')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                  reportType === 'customer_valves'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="sm:hidden">شیرهای مشتریان</span>
                <span className="hidden sm:inline">موجودی تفکیک‌شده شیرهای مشتریان</span>
              </button>
            )}

            {/* 2. موجودی انبارها */}
            <button
              type="button"
              onClick={() => setReportType('inventory')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                reportType === 'inventory'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="sm:hidden">موجودی انبارها</span>
              <span className="hidden sm:inline">
                {isFinancialMode ? 'گزارش موجودی و ارزش‌گذاری انبارها' : 'گزارش موجودی فیزیکی و نقطه سفارش'}
              </span>
            </button>

            {/* 3. کاردکس و گردش کالا */}
            <button
              type="button"
              onClick={() => setReportType('kardex')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                reportType === 'kardex'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              <span className="sm:hidden">کاردکس و گردش</span>
              <span className="hidden sm:inline">
                {isFinancialMode ? 'گزارش گردش انبار و کاردکس کالا' : 'گزارش گردش اسناد و کاردکس تعدادی'}
              </span>
            </button>

            {/* 4. تامین‌کنندگان یا مشتریان */}
            <button
              type="button"
              onClick={() => setReportType('party_report')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                reportType === 'party_report' || reportType === 'suppliers'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {reportPartyScope === 'suppliers' ? (
                <>
                  <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="sm:hidden">تامین‌کنندگان</span>
                  <span className="hidden sm:inline">
                    {isFinancialMode ? 'گزارش تامین‌کنندگان و کاردکس کالا' : 'گزارش تامین‌کنندگان و کاردکس دریافتی'}
                  </span>
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="sm:hidden">مشتریان</span>
                  <span className="hidden sm:inline">
                    {isFinancialMode ? 'گزارش مشتریان و کاردکس فروش' : 'گزارش مشتریان و کاردکس ارسال'}
                  </span>
                </>
              )}
            </button>

            {/* 5. لاگ‌های اتصال ابری (فقط در گزارش‌گیری کامل) */}
            {variant !== 'financial' && (
              <button
                type="button"
                onClick={() => setReportType('live_logs')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                  reportType === 'live_logs'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="sm:hidden">لاگ‌های اتصال ابری</span>
                <span className="hidden sm:inline">لاگ‌های اتصال anbar.mgas.ir</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-400 font-medium px-2 hidden lg:block shrink-0">
            {reportType === 'customer_valves' && 'گزارش تفکیک‌شده ورود، خروج و مانده شیرهای طرف‌حساب‌ها'}
            {reportType === 'inventory' && (isFinancialMode ? 'نمایش تراز فیزیکی و ارزش‌گذاری موجودی انبار' : 'کنترل موجودی فیزیکی، محل قفسه و وضعیت نقطه سفارش')}
            {reportType === 'kardex' && (reportPartyScope === 'suppliers' ? 'گردش اسناد ورود و تحویل تامین‌کنندگان' : 'گردش اسناد خروج و ارسال مشتریان')}
            {(reportType === 'party_report' || reportType === 'suppliers') && (reportPartyScope === 'suppliers' ? 'گزارش تجمیعی یا کاردکس تعدادی تامین‌کنندگان' : 'گزارش تجمیعی یا کاردکس تعدادی مشتریان')}
            {reportType === 'live_logs' && 'مانیتورینگ و عیب‌یابی ارتباط زنده پایگاه ابری'}
          </div>
        </div>
        {reportType === 'live_logs' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-100">کنترل‌ها و فیلترهای گزارش زنده ارتباط anbar.mgas.ir</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  cloudStatusInfo?.connected 
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700' 
                    : 'bg-rose-950/80 text-rose-300 border-rose-700'
                }`}>
                  {cloudStatusInfo?.connected ? 'ارتباط برقرار است' : 'قطع ارتباط'}
                </span>
                {cloudStatusInfo?.latencyMs !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400">
                    تاخیر: {cloudStatusInfo.latencyMs}ms
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCheckCloud}
                  disabled={isCheckingCloud}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="تست بلادرنگ پینگ و وضعیت سلامت ارتباط با دامنه anbar.mgas.ir"
                >
                  <Activity className={`w-3.5 h-3.5 ${isCheckingCloud ? 'animate-spin' : ''}`} />
                  <span>{isCheckingCloud ? 'در حال تست...' : 'تست اتصال (Ping)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleForceSync}
                  disabled={isForceSyncing}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="دریافت فوری تمام رویدادها از anbar.mgas.ir و اعمال در دیتابیس‌های محلی"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing ? 'animate-spin' : ''}`} />
                  <span>{isForceSyncing ? 'در حال بروزرسانی...' : 'بروزرسانی فوری دیتابیس‌ها'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLiveLogs}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer active:scale-95"
                  title="کپی متن تمام لاگ‌ها در حافظه کلیپ‌بورد"
                >
                  {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedLogs ? 'کپی شد!' : 'کپی لاگ‌ها'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    SyncEngine.clearLogs();
                    setLiveLogs([]);
                    showNotification('تمام لاگ‌های ارتباطی پاک شدند.');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs font-medium flex items-center gap-1 border border-rose-800/60 transition-all cursor-pointer active:scale-95"
                  title="پاکسازی فهرست لاگ‌های نشست فعلی"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>پاکسازی</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block font-medium">سطح لاگ:</label>
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه سطوح (موفق، خطا، هشدار، اطلاعات)</option>
                  <option value="error">فقط خطاهای ارتباطی (Error)</option>
                  <option value="warn">هشدارها (Warning)</option>
                  <option value="success">عملیات‌های موفق (Success)</option>
                  <option value="info">پیام‌های اطلاعاتی (Info)</option>
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-slate-400 block font-medium">جستجو در لاگ‌ها:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="جستجو در پیام، منبع رویداد، آدرس URL یا جزییات لاگ..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>
        ) : reportType === 'customer_valves' ? (
          <div className="space-y-3">
            {/* Header with Mode Switcher */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-100 flex items-center gap-2">
                    <span>فیلتر و کنترل موجودی تفکیک‌شده شیرهای مشتریان</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      تفکیک نو و کهنه
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    کنترل دقیق مقادیر ورود، خروج و باقی‌مانده شیرهای طرف‌حساب‌ها بر اساس مدل و قطعه در انبار
                  </p>
                </div>
              </div>

              {/* View Mode Toggle: تفکیکی / خلاصه مشتری / ریز اسناد */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setValveViewMode('SEGREGATED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    valveViewMode === 'SEGREGATED'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>تفکیک به ازای هر مدل شیر</span>
                </button>
                <button
                  type="button"
                  onClick={() => setValveViewMode('SUMMARY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    valveViewMode === 'SUMMARY'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>خلاصه تراز مشتریان</span>
                </button>
                <button
                  type="button"
                  onClick={() => setValveViewMode('LEDGER')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    valveViewMode === 'LEDGER'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>ریز اسناد و حواله‌ها</span>
                </button>
              </div>
            </div>

            {/* Date Range Section */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>بازه زمانی گزارش شیرآلات (تقویم شمسی):</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'همه تاریخ‌ها' },
                    { id: 'today', label: 'امروز' },
                    { id: 'last_7_days', label: '۷ روز اخیر' },
                    { id: 'last_30_days', label: '۳۰ روز اخیر' },
                    { id: 'current_year', label: 'سال جاری' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectTimePreset(p.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                        timePreset === p.id
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-300 font-bold block">از تاریخ شمسی:</label>
                  <PersianDatePicker
                    value={startDate}
                    onChange={(val) => {
                      setStartDate(val);
                      setTimePreset('custom');
                    }}
                    placeholder="انتخاب تاریخ شروع..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-300 font-bold block">تا تاریخ شمسی:</label>
                  <PersianDatePicker
                    value={endDate}
                    onChange={(val) => {
                      setEndDate(val);
                      setTimePreset('custom');
                    }}
                    placeholder="انتخاب تاریخ پایان..."
                  />
                </div>
              </div>
            </div>

            {/* Customer, Category & Search Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>انتخاب مشتری / طرف حساب:</span>
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs font-bold text-amber-300 focus:outline-hidden focus:border-amber-500 shadow-xs cursor-pointer truncate"
                >
                  <option value="all">👥 همه مشتریان و طرف‌های حساب ({toPersianDigits(allCustomers.length + allSuppliers.length)} طرف‌حساب)</option>
                  <optgroup label="── اسامی مشتریان ──">
                    {allCustomers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.name} {c.province ? `- ${c.province}` : ''}
                      </option>
                    ))}
                  </optgroup>
                  {allSuppliers.length > 0 && (
                    <optgroup label="── تامین‌کنندگان، شعب و بازرگانی‌ها ──">
                      {allSuppliers.map(s => (
                        <option key={s.supplier_id} value={s.supplier_id}>
                          {s.name} {s.company_name ? `(${s.company_name})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>دسته‌بندی شیرآلات:</span>
                </label>
                <select
                  value={valveCategoryFilter}
                  onChange={(e) => setValveCategoryFilter(e.target.value as any)}
                  className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs font-bold text-emerald-300 focus:outline-hidden focus:border-emerald-500 shadow-xs cursor-pointer"
                >
                  <option value="ALL">همه شیرها (شیر نو + شیر کهنه و داغی)</option>
                  <option value="NEW">فقط شیرهای نو استاندارد</option>
                  <option value="USED">فقط شیرهای کهنه و داغی</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-cyan-400" />
                  <span>جستجو در اقلام و مشتری‌ها:</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={valveSearchQuery}
                    onChange={(e) => setValveSearchQuery(e.target.value)}
                    placeholder="جستجو در مدل شیر، نام مشتری، شرکت..."
                    className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl pr-8 pl-3 text-slate-100 text-xs focus:outline-hidden focus:border-cyan-500 shadow-xs font-medium"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* DEDICATED ACTION TOOLBAR FOR CUSTOMER VALVES: چاپ، PDF، اکسل و آمار رکوردها */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/40 -mx-4 -mb-4 p-4 rounded-b-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-amber-600/30 transition-all cursor-pointer active:scale-95"
                  title="ارسال مستقیم جدول شیرآلات مشتریان به چاپگر رسمی (A4 عمودی)"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'در حال ارسال به چاپگر...' : 'چاپ رسمی جدول شیرآلات (Print)'}</span>
                </button>

                {/* PDF Export Button */}
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-teal-600/30 transition-all cursor-pointer active:scale-95"
                  title="دانلود مستقیم جدول شیرآلات در قالب فایل استاندارد PDF A4 عمودی"
                >
                  <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'در حال تولید...' : 'خروجی PDF شیرآلات'}</span>
                </button>

                {/* Excel Export Button */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95"
                  title="ذخیره جدول شیرآلات در قالب فایل اکسل مایکروسافت (XLSX راست‌به‌چپ)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>ذخیره در اکسل (Excel)</span>
                </button>

                {/* JSON Export Button */}
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer active:scale-95"
                  title="خروجی داده‌های شیرآلات به فرمت استاندارد JSON"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>خروجی JSON</span>
                </button>
              </div>

              {/* Filter Statistics Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">نتایج گزارش شیرآلات:</span>
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-extrabold text-slate-100 flex items-center gap-1.5 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <strong className="text-amber-400 font-mono text-sm tabular-nums" dir="ltr">
                    {toPersianDigits(
                      valveViewMode === 'SEGREGATED'
                        ? filteredCustomerValveRows.length
                        : valveViewMode === 'SUMMARY'
                        ? filteredCustomerValveSummaries.length
                        : filteredCustomerValveLedgers.length
                    )}
                  </strong>
                  <span>
                    {valveViewMode === 'SEGREGATED'
                      ? 'قلم تفکیکی شیر'
                      : valveViewMode === 'SUMMARY'
                      ? 'تراز طرف‌حساب'
                      : 'سند ثبتی و حواله'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Filter Header & Quick Reset */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-100 flex items-center gap-2">
                    <span>فیلتر پیشرفته گزارش و استخراج داده‌ها</span>
                    {isAnyFilterActive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        فیلتر فعال است
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    فیلتر همزمان بر اساس بازه تاریخ شمسی، تامین‌کننده، نام مشتری، شماره بارنامه و انبار با قابلیت چاپ، PDF و اکسل
                  </p>
                </div>
              </div>

              {isAnyFilterActive && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 text-xs font-bold border border-rose-800/60 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                  title="پاکسازی تمام فیلترها و بازنشانی به حالت اولیه"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>حذف همه فیلترها</span>
                </button>
              )}
            </div>

            {/* 1. DATE RANGE SECTION: بازه زمانی X تا X با انتخاب تقویم شمسی */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>بازه زمانی ثبت اسناد (از تاریخ تا تاریخ با تقویم شمسی):</span>
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 flex-nowrap sm:flex-wrap">
                  {[
                    { id: 'all', label: 'همه تاریخ‌ها' },
                    { id: 'today', label: 'امروز' },
                    { id: 'last_7_days', label: '۷ روز اخیر' },
                    { id: 'last_30_days', label: '۳۰ روز اخیر' },
                    { id: 'last_90_days', label: '۳ ماه اخیر' },
                    { id: 'current_year', label: 'سال جاری' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectTimePreset(p.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                        timePreset === p.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {timePreset === 'custom' && (
                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                      بازه دلخواه
                    </span>
                  )}
                </div>
              </div>

              {/* Two Persian Date Pickers: از تاریخ ... تا تاریخ ... */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-center">
                <div className="space-y-1 relative z-30">
                  <label className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="font-extrabold text-indigo-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      از تاریخ (شروع بازه شمسی):
                    </span>
                    {startDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('');
                          setTimePreset('custom');
                        }}
                        className="text-[10px] text-rose-400 hover:underline font-bold"
                      >
                        پاک کردن
                      </button>
                    )}
                  </label>
                  <PersianDatePicker
                    id="report-start-date-input"
                    value={startDate}
                    onChange={handleStartDateChange}
                    defaultToToday={false}
                    placeholder="مثال: 1403/01/01"
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#818cf8',
                      borderColor: 'rgba(99, 102, 241, 0.45)'
                    }}
                    className="report-date-input w-full bg-slate-900 border border-indigo-500/40 hover:border-indigo-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 rounded-xl pr-3.5 pl-14 py-2 text-indigo-400 text-xs sm:text-sm font-mono font-black placeholder:text-indigo-400/60 shadow-sm transition-all cursor-pointer"
                  />
                </div>

                <div className="space-y-1 relative z-20">
                  <label className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="font-extrabold text-indigo-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      تا تاریخ (پایان بازه شمسی):
                    </span>
                    {endDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setEndDate('');
                          setTimePreset('custom');
                        }}
                        className="text-[10px] text-rose-400 hover:underline font-bold"
                      >
                        پاک کردن
                      </button>
                    )}
                  </label>
                  <PersianDatePicker
                    id="report-end-date-input"
                    value={endDate}
                    onChange={handleEndDateChange}
                    defaultToToday={false}
                    placeholder="مثال: 1403/12/29"
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#818cf8',
                      borderColor: 'rgba(99, 102, 241, 0.45)'
                    }}
                    className="report-date-input w-full bg-slate-900 border border-indigo-500/40 hover:border-indigo-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 rounded-xl pr-3.5 pl-14 py-2 text-indigo-400 text-xs sm:text-sm font-mono font-black placeholder:text-indigo-400/60 shadow-sm transition-all cursor-pointer"
                  />
                </div>

                <div className="hidden lg:flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 self-end">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-[11px]">
                    فیلتر بر اساس تقویم شمسی جلالی عمل نموده و اسناد خارج از این بازه حذف می‌گردند.
                  </span>
                </div>
              </div>
            </div>

            {/* 2. PARTIES & WAYBILL ROW: سوئیچ بین تامین‌کنندگان و مشتریان طرف‌حساب - 100% واکنش‌گرا */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Party Filter: کلید سوئیچ بین «تامین‌کنندگان» و «مشتریان طرف‌حساب» */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5 text-xs truncate">
                    {reportPartyScope === 'all' ? (
                      <>
                        <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>طرف‌حساب (همه/مشتری/تامین):</span>
                      </>
                    ) : reportPartyScope === 'suppliers' ? (
                      <>
                        <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>تأمین‌کننده کالا:</span>
                      </>
                    ) : (
                      <>
                        <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>مشتری طرف‌حساب:</span>
                      </>
                    )}
                  </label>

                  {/* سوئیچ بین «همه»، «تامین‌کنندگان» و «مشتریان» */}
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setReportPartyScope('all');
                        setSelectedCustomerId('all');
                        setSelectedSupplierId('all');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        reportPartyScope === 'all'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="نمایش تمام طرف‌های حساب (مشتریان، تامین‌کنندگان و شعب)"
                    >
                      <Layers className="w-3 h-3 shrink-0" />
                      <span>همه</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportPartyScope('suppliers');
                        setSelectedCustomerId('all');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        reportPartyScope === 'suppliers'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="فیلتر بر اساس تأمین‌کنندگان کالا"
                    >
                      <Truck className="w-3 h-3 shrink-0" />
                      <span>تامین‌کنندگان</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportPartyScope('customers');
                        setSelectedSupplierId('all');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        reportPartyScope === 'customers'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="فیلتر بر اساس مشتریان و طرف‌حساب‌ها"
                    >
                      <Users className="w-3 h-3 shrink-0" />
                      <span>مشتریان</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  {reportPartyScope === 'suppliers' ? (
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSupplierId(val);
                        if (val === 'all') {
                          setSupplierFilterMode('ALL_SUPPLIERS');
                        } else {
                          setSupplierFilterMode('SINGLE_SUPPLIER');
                        }
                      }}
                      className={`w-full h-[38px] bg-slate-950 rounded-xl px-3 text-xs font-bold focus:outline-hidden cursor-pointer shadow-xs truncate transition-all ${
                        selectedSupplierId === 'all'
                          ? 'border border-slate-700 text-emerald-300 focus:border-emerald-500'
                          : 'border-2 border-emerald-500 text-emerald-100 bg-emerald-950/25 focus:border-emerald-400'
                      }`}
                    >
                      <option value="all" className="bg-slate-900 text-emerald-400 font-bold">
                        🏢 همه تامین‌کنندگان ({toPersianDigits(allSuppliers.length)} شرکت)
                      </option>
                      <optgroup label="── اسامی تامین‌کنندگان کالا ──" className="bg-slate-950 text-slate-200">
                        {allSuppliers.map((s) => (
                          <option key={s.supplier_id} value={s.supplier_id} className="bg-slate-900 text-slate-100 py-1">
                            {s.name} {s.company_name ? `(${s.company_name})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  ) : reportPartyScope === 'customers' ? (
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCustomerId(val);
                        if (val === 'all') {
                          setCustomerFilterMode('ALL_CUSTOMERS');
                        } else {
                          setCustomerFilterMode('SINGLE_CUSTOMER');
                        }
                      }}
                      className={`w-full h-[38px] bg-slate-950 rounded-xl px-3 text-xs font-bold focus:outline-hidden cursor-pointer shadow-xs truncate transition-all ${
                        selectedCustomerId === 'all'
                          ? 'border border-slate-700 text-amber-300 focus:border-amber-500'
                          : 'border-2 border-amber-500 text-amber-100 bg-amber-950/25 focus:border-amber-400'
                      }`}
                    >
                      <option value="all" className="bg-slate-900 text-amber-400 font-bold">
                        👥 همه مشتریان ({toPersianDigits(allCustomers.length)} خریدار)
                      </option>
                      <optgroup label="── اسامی مشتریان طرف‌حساب ──" className="bg-slate-950 text-slate-200">
                        {allCustomers.map((c) => (
                          <option key={c.customer_id} value={c.customer_id} className="bg-slate-900 text-slate-100 py-1">
                            {c.name} {c.province ? `- ${c.province}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  ) : (
                    <select
                      value={
                        selectedCustomerId !== 'all'
                          ? `cust:${selectedCustomerId}`
                          : selectedSupplierId !== 'all'
                          ? `sup:${selectedSupplierId}`
                          : 'all'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'all') {
                          setSelectedCustomerId('all');
                          setSelectedSupplierId('all');
                        } else if (val.startsWith('cust:')) {
                          setSelectedCustomerId(val.replace('cust:', ''));
                          setSelectedSupplierId('all');
                        } else if (val.startsWith('sup:')) {
                          setSelectedSupplierId(val.replace('sup:', ''));
                          setSelectedCustomerId('all');
                        }
                      }}
                      className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs font-bold text-indigo-300 focus:outline-hidden focus:border-indigo-500 cursor-pointer shadow-xs truncate"
                    >
                      <option value="all">🏢👥 همه طرف‌های حساب (مشتریان + تامین‌کنندگان)</option>
                      <optgroup label="── مشتریان ──">
                        {allCustomers.map((c) => (
                          <option key={`cust-${c.customer_id}`} value={`cust:${c.customer_id}`}>
                            {c.name} {c.province ? `- ${c.province}` : ''}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="── تامین‌کنندگان ──">
                        {allSuppliers.map((s) => (
                          <option key={`sup-${s.supplier_id}`} value={`sup:${s.supplier_id}`}>
                            {s.name} {s.company_name ? `(${s.company_name})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  )}
                </div>
              </div>

              {/* Waybill / Reference Number Filter */}
              <div className="space-y-1 min-w-0">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                  <span>شماره بارنامه / شماره سند:</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={waybillFilter}
                    onChange={(e) => setWaybillFilter(e.target.value)}
                    placeholder="شماره بارنامه، حواله یا ارجاع..."
                    className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl pr-8 pl-7 text-slate-100 text-xs font-mono font-bold focus:outline-hidden focus:border-cyan-500 shadow-xs"
                  />
                  <Hash className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {waybillFilter && (
                    <button
                      type="button"
                      onClick={() => setWaybillFilter('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                      title="پاک کردن شماره بارنامه"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Warehouse Filter */}
              <div className="space-y-1 min-w-0">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <WarehouseIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>انتخاب انبار مبنا:</span>
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-slate-100 focus:outline-hidden focus:border-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="all">همه انبارها ({toPersianDigits(warehouses.length)})</option>
                  {warehouses.map((wh) => (
                    <option key={wh.warehouse_id} value={wh.warehouse_id}>
                      {wh.name} {wh.shelf_location ? `(قفسه ${wh.shelf_location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-1 min-w-0">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-violet-400" />
                  <span>دسته‌بندی کالا:</span>
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full h-[38px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="all">همه دسته‌ها ({toPersianDigits(categories.length)})</option>
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. PRODUCT & SEARCH ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Conditional Filters depending on tab */}
              {reportType === 'inventory' ? (
                <div className="space-y-1 min-w-0">
                  <label className="text-slate-400 block font-medium">وضعیت موجودی اقلام:</label>
                  <select
                    value={selectedStockStatus}
                    onChange={(e) => setSelectedStockStatus(e.target.value as StockStatusFilter)}
                    className="w-full h-[38px] bg-slate-950 border border-slate-800 rounded-xl px-3 text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">همه وضعیت‌ها</option>
                    <option value="in_stock">کالاهای موجود در انبار</option>
                    <option value="low_stock">کالاهای نقطه سفارش و کسری</option>
                    <option value="out_of_stock">کالاهای ناموجود</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1 min-w-0">
                  <label className="text-slate-400 block font-medium">کالای مدنظر کاردکس:</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full h-[38px] bg-slate-950 border border-slate-800 rounded-xl px-3 text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">همه کالاها ({toPersianDigits(products.length)})</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Movement Type */}
              <div className="space-y-1 min-w-0">
                <label className="text-slate-400 block font-medium">نوع گردش سند:</label>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => setMovementTypeFilter(e.target.value)}
                  className="w-full h-[38px] bg-slate-950 border border-slate-800 rounded-xl px-3 text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">تمام اسناد گردش</option>
                  <option value="STOCK_IN">ورود به انبار (رسید)</option>
                  <option value="STOCK_OUT">خروج از انبار (حواله)</option>
                  <option value="PURCHASE">رسید خرید</option>
                  <option value="SALE">حواله فروش</option>
                  <option value="TRANSFER">انتقال بین انبارها</option>
                  <option value="RETURN_IN">برگشت از مشتری</option>
                </select>
              </div>

              {/* Search query input */}
              <div className="space-y-1 sm:col-span-2 min-w-0">
                <label className="text-slate-400 block font-medium">جستجوی آزاد در نام کالا، کد یا متن:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="کد SKU، نام کالا، توضیحات..."
                    className="w-full h-[38px] bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-7 text-slate-200 text-xs focus:outline-hidden focus:border-indigo-500 shadow-xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                      title="پاک کردن جستجو"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 4. DEDICATED ACTION TOOLBAR: خروجی فیلتر باید قابل چاپ و PDF و ذخیره اکسل باشد */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/40 -mx-4 -mb-4 p-4 rounded-b-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                  title="ارسال مستقیم جدول فیلترشده به چاپگر رسمی یا ذخیره در قالب سند چاپی (A4 عمودی)"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'در حال ارسال به چاپگر...' : 'چاپ رسمی جدول (Print)'}</span>
                </button>

                {/* PDF Export Button */}
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-teal-600/30 transition-all cursor-pointer active:scale-95"
                  title="دانلود مستقیم جدول فیلترشده با قالب استاندارد PDF A4 عمودی"
                >
                  <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'در حال تولید...' : 'خروجی PDF'}</span>
                </button>

                {/* Excel Export Button */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95"
                  title="ذخیره جدول فیلترشده در قالب فایل اکسل مایکروسافت (XLSX راست‌به‌چپ)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>ذخیره در اکسل (Excel)</span>
                </button>
              </div>

              {/* Filter Statistics Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">نتایج فیلتر:</span>
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-extrabold text-slate-100 flex items-center gap-1.5 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <strong className="text-amber-400 font-mono text-sm tabular-nums" dir="ltr">
                    {toPersianDigits(
                      reportType === 'inventory'
                        ? filteredInventoryData.length
                        : reportType === 'kardex'
                        ? filteredKardexData.length
                        : reportType === 'party_report' || reportType === 'suppliers'
                        ? reportPartyScope === 'suppliers'
                          ? supplierFilterMode === 'ALL_SUPPLIERS'
                            ? suppliersAggregatedData.length
                            : singleSupplierData.rows.length
                          : customerFilterMode === 'ALL_CUSTOMERS'
                          ? customersAggregatedData.length
                          : singleCustomerData.rows.length
                        : filteredLiveLogs.length
                    )}
                  </strong>
                  <span>ردیف رکورد معتبر</span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Printable / Viewable Report Area */}
      <div
        id="printable-report-section"
        ref={printAreaRef}
        className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black"
      >
        {/* Formal Report Header for PDF / Print with Official M.Gas Logo */}
        <div id="report-formal-header" className="border-b-2 border-slate-900 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:border-black print:pb-4">
          <div className="flex items-center gap-3">
            {/* Exact Official Site Logo matching Goods Entry/Exit Receipts */}
            <div className="flex items-center justify-center shrink-0">
              <img
                src="/logo.svg"
                alt="ام گاز - MGAS"
                className="h-12 sm:h-14 max-h-[56px] w-auto object-contain shrink-0"
              />
            </div>
            <div>
              <div className="text-sm sm:text-base font-black text-slate-950 dark:text-white print:text-black transition-colors">
                کارخانه تولید/تعمیر انواع سیلندر ام گاز
              </div>
              <div className="text-xs text-indigo-700 dark:text-indigo-400 font-extrabold mt-0.5 print:text-black transition-colors">
                {reportType === 'customer_valves'
                  ? valveViewMode === 'SEGREGATED'
                    ? 'کاربرگ رسمی گزارش تفکیک‌شده شیرهای مشتریان (مدل به مدل)'
                    : valveViewMode === 'SUMMARY'
                    ? 'کاربرگ رسمی خلاصه تراز و گردش کل شیرهای مشتریان'
                    : 'کاربرگ رسمی ریز اسناد و حواله‌های گردش شیرآلات مشتریان'
                  : reportType === 'inventory'
                  ? (isFinancialMode ? 'کاربرگ رسمی موجودی و ارزش‌گذاری انبارها' : 'کاربرگ رسمی موجودی فیزیکی و کنترل انبارها')
                  : reportType === 'kardex'
                  ? reportPartyScope === 'suppliers'
                    ? 'کاردکس رسمی گردش اسناد ورود و خروج انبار (انحصاراً تامین‌کنندگان)'
                    : 'کاردکس رسمی گردش اسناد ورود و خروج انبار (انحصاراً مشتریان)'
                  : reportType === 'party_report' || reportType === 'suppliers'
                  ? reportPartyScope === 'suppliers'
                    ? supplierFilterMode === 'ALL_SUPPLIERS'
                      ? 'کاربرگ رسمی گزارش تجمیعی تامین‌کنندگان'
                      : `کاردکس و گردش رسمی تامین‌کننده کالا: ${singleSupplierData.supplier?.name || 'تامین‌کننده'}`
                    : customerFilterMode === 'ALL_CUSTOMERS'
                      ? 'کاربرگ رسمی گزارش تجمیعی مشتریان'
                      : `کاردکس و گردش رسمی مشتری: ${singleCustomerData.customer?.name || 'مشتری'}`
                  : 'گزارش رسمی اتصال پایگاه داده ابری'}
              </div>
            </div>
          </div>

          <div className="text-right sm:text-left text-[11px] text-slate-900 dark:text-slate-100 print:text-black space-y-1 font-semibold">
            <div><span className="text-slate-600 dark:text-slate-300 print:text-black font-medium">تاریخ گزارش:</span> <span className="font-mono tabular-nums font-black text-slate-950 dark:text-white print:text-black" dir="ltr">{formatPersianDateTime(new Date().toISOString())}</span></div>
            {reportType === 'customer_valves' ? (
              <>
                <div><span className="text-slate-600 dark:text-slate-300 print:text-black font-medium">دامنه گزارش:</span> <span className="font-black text-slate-950 dark:text-white print:text-black">موجودی تفکیک‌شده شیرآلات مشتریان</span></div>
                <div><span className="text-slate-600 dark:text-slate-300 print:text-black font-medium">دسته‌بندی:</span> <span className="font-black text-slate-950 dark:text-white print:text-black">{valveCategoryFilter === 'ALL' ? 'همه شیرها (نو و کهنه)' : valveCategoryFilter === 'NEW' ? 'شیر نو استاندارد' : 'شیر کهنه و داغی'}</span></div>
              </>
            ) : (
              <>
                <div><span className="text-slate-600 dark:text-slate-300 print:text-black font-medium">انبار مبنا:</span> <span className="font-black text-slate-950 dark:text-white print:text-black">{selectedWarehouseId === 'all' ? 'تمام انبارها' : warehouses.find(w => w.warehouse_id === selectedWarehouseId)?.name}</span></div>
                <div><span className="text-slate-600 dark:text-slate-300 print:text-black font-medium">دامنه گزارش:</span> <span className="font-black text-slate-950 dark:text-white print:text-black">{reportPartyScope === 'suppliers' ? 'انحصاراً تامین‌کنندگان' : 'انحصاراً مشتریان'}</span></div>
              </>
            )}
            <div className="print:hidden text-slate-500 dark:text-slate-400">تنظیم‌کننده در سیستم: <strong className="font-semibold text-slate-700 dark:text-slate-300">{currentUser.full_name}</strong></div>
          </div>
        </div>

        {/* Active Filter Criteria Summary Bar for Prints and PDF */}
        {reportType === 'customer_valves' ? (
          <div id="report-filter-summary" className="bg-slate-950/70 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl p-2.5 text-[11px] text-slate-200 print:text-black flex flex-wrap items-center gap-x-4 gap-y-1.5 shadow-inner">
            <span className="font-black text-amber-400 print:text-black">مشخصات گزارش شیرآلات:</span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400 print:text-slate-800 font-bold">حالت نمایش:</span>
              <span className="font-extrabold text-amber-300 print:text-black">
                {valveViewMode === 'SEGREGATED' ? 'تفکیک به ازای هر مدل شیر' : valveViewMode === 'SUMMARY' ? 'خلاصه تراز مشتریان' : 'ریز اسناد و حواله‌ها'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400 print:text-slate-800 font-bold">طرف‌حساب:</span>
              <span className="font-extrabold text-slate-100 print:text-black">
                {selectedCustomerId === 'all' ? 'کلیه مشتریان' : allCustomers.find(c => c.customer_id === selectedCustomerId)?.name || 'مشتری انتخابی'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400 print:text-slate-800 font-bold">دسته‌بندی:</span>
              <span className="font-extrabold text-emerald-300 print:text-black">
                {valveCategoryFilter === 'ALL' ? 'همه شیرها (نو و داغی)' : valveCategoryFilter === 'NEW' ? 'شیر نو استاندارد' : 'شیر کهنه و داغی'}
              </span>
            </span>
            {(startDate || endDate) && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400 print:text-slate-800 font-bold">بازه زمانی:</span>
                <span className="font-black text-slate-100 print:text-black font-mono">
                  از {toPersianDigits(startDate || 'ابتدا')} تا {toPersianDigits(endDate || 'اکنون')}
                </span>
              </span>
            )}
          </div>
        ) : (startDate || endDate || selectedSupplierId !== 'all' || selectedCustomerId !== 'all' || waybillFilter.trim() || selectedWarehouseId !== 'all' || reportType === 'party_report' || reportType === 'suppliers') && (
          <div id="report-filter-summary" className="bg-slate-950/70 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl p-2.5 text-[11px] text-slate-200 print:text-black flex flex-wrap items-center gap-x-4 gap-y-1.5 shadow-inner">
            <span className="font-black text-amber-400 print:text-black">فیلترهای اعمال‌شده روی این گزارش:</span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400 print:text-slate-600">دامنه طرف حساب:</span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] print:text-black ${
                reportPartyScope === 'suppliers' ? 'text-emerald-300 bg-emerald-950/80 border border-emerald-800' : 'text-amber-300 bg-amber-950/80 border border-amber-800'
              }`}>
                {reportPartyScope === 'suppliers' ? 'انحصاراً تامین‌کنندگان' : 'انحصاراً مشتریان'}
              </span>
            </span>
            {(startDate || endDate) && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400 print:text-slate-600">بازه زمانی:</span>
                <span className="font-bold text-slate-100 print:text-black font-mono">
                  از {toPersianDigits(startDate || 'ابتدا')} تا {toPersianDigits(endDate || 'اکنون')}
                </span>
              </span>
            )}
            {reportPartyScope === 'suppliers' ? (
              supplierFilterMode === 'SINGLE_SUPPLIER' && selectedSupplierId !== 'all' ? (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400 print:text-slate-600">تامین‌کننده کالا:</span>
                  <span className="font-bold text-emerald-300 print:text-black">
                    {allSuppliers.find(s => s.supplier_id === selectedSupplierId)?.name}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400 print:text-slate-600">وضعیت تامین:</span>
                  <span className="font-bold text-emerald-300 print:text-black">
                    تامین‌کنندگان (کلیه شرکت‌ها)
                  </span>
                </span>
              )
            ) : (
              customerFilterMode === 'SINGLE_CUSTOMER' && selectedCustomerId !== 'all' ? (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400 print:text-slate-600">مشتری طرف حساب:</span>
                  <span className="font-bold text-amber-300 print:text-black">
                    {allCustomers.find(c => c.customer_id === selectedCustomerId)?.name}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400 print:text-slate-600">وضعیت مشتریان:</span>
                  <span className="font-bold text-amber-300 print:text-black">
                    مشتریان (کلیه طرف‌های حساب)
                  </span>
                </span>
              )
            )}
            {waybillFilter.trim() && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400 print:text-slate-600">شماره بارنامه:</span>
                <span className="font-bold text-amber-300 print:text-black font-mono" dir="ltr">
                  {toPersianDigits(waybillFilter)}
                </span>
              </span>
            )}
            {selectedWarehouseId !== 'all' && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400 print:text-slate-600">انبار:</span>
                <span className="font-bold text-slate-200 print:text-black">
                  {warehouses.find(w => w.warehouse_id === selectedWarehouseId)?.name}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Operational KPI Summary Bar (Zero Monetary Data) */}
        {!isFinancialMode && reportType !== 'live_logs' && (
          <div id="report-kpi-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            {reportType === 'inventory' && (
              <>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">تعداد کل اقلام</span>
                  <div className="font-mono font-black text-sm text-indigo-300 print:text-black">{toPersianDigits(inventoryTotals.totalItems)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">مجموع موجودی فیزیکی</span>
                  <div className="font-mono font-black text-sm text-emerald-400 print:text-black">{formatNumberFa(inventoryTotals.totalPhysicalQty)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">زیر نقطه سفارش</span>
                  <div className="font-mono font-black text-sm text-amber-400 print:text-black">{toPersianDigits(inventoryTotals.lowStockCount)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">کالاهای ناموجود</span>
                  <div className="font-mono font-black text-sm text-rose-400 print:text-black">{toPersianDigits(inventoryTotals.outOfStockCount)}</div>
                </div>
              </>
            )}

            {reportType === 'kardex' && (
              <>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">تعداد اسناد گردش</span>
                  <div className="font-mono font-black text-sm text-indigo-300 print:text-black">{toPersianDigits(kardexTotals.recordCount)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">مجموع ورودی (+)</span>
                  <div className="font-mono font-black text-sm text-emerald-400 print:text-black">{formatNumberFa(kardexTotals.totalIn)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">مجموع خروجی (-)</span>
                  <div className="font-mono font-black text-sm text-rose-400 print:text-black">{formatNumberFa(kardexTotals.totalOut)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">خالص گردش تعدادی</span>
                  <div className="font-mono font-black text-sm text-amber-400 print:text-black" dir="ltr">{formatNumberFa(kardexTotals.netTurnover)}</div>
                </div>
              </>
            )}

            {reportType === 'customer_valves' && (
              <>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">ورود کل شیرها</span>
                  <div className="font-mono font-black text-sm text-emerald-400 print:text-black">{toPersianDigits(customerValveReportData.totals.totalValvesIn)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">خروج کل شیرها</span>
                  <div className="font-mono font-black text-sm text-rose-400 print:text-black">{toPersianDigits(customerValveReportData.totals.totalValvesOut)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">تراز مانده شیر نو</span>
                  <div className="font-mono font-black text-sm text-indigo-300 print:text-black">{toPersianDigits(customerValveReportData.totals.totalNewValveBalance)}</div>
                </div>
                <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 print:text-black font-bold">تراز مانده شیر کهنه</span>
                  <div className="font-mono font-black text-sm text-amber-400 print:text-black">{toPersianDigits(customerValveReportData.totals.totalUsedValveBalance)}</div>
                </div>
              </>
            )}

            {(reportType === 'party_report' || reportType === 'suppliers') && (
              reportPartyScope === 'suppliers' ? (
                <>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-slate-400 print:text-black font-bold">تعداد تامین‌کنندگان</span>
                    <div className="font-mono font-black text-sm text-emerald-400 print:text-black">{toPersianDigits(suppliersTotals.totalSuppliers)}</div>
                  </div>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-slate-400 print:text-black font-bold">اسناد و محموله‌ها</span>
                    <div className="font-mono font-black text-sm text-indigo-300 print:text-black">{toPersianDigits(supplierFilterMode === 'ALL_SUPPLIERS' ? suppliersTotals.totalMovements : singleSupplierData.rows.length)}</div>
                  </div>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between sm:col-span-2">
                    <span className="text-slate-400 print:text-black font-bold">مجموع اقلام وارده به انبار</span>
                    <div className="font-mono font-black text-sm text-emerald-400 print:text-black">{formatNumberFa(supplierFilterMode === 'ALL_SUPPLIERS' ? suppliersTotals.totalItemsIn : singleSupplierData.totalQty)} قلم</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-slate-400 print:text-black font-bold">تعداد مشتریان</span>
                    <div className="font-mono font-black text-sm text-amber-400 print:text-black">{toPersianDigits(customersTotals.totalCustomers)}</div>
                  </div>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-slate-400 print:text-black font-bold">اسناد و حواله‌ها</span>
                    <div className="font-mono font-black text-sm text-indigo-300 print:text-black">{toPersianDigits(customerFilterMode === 'ALL_CUSTOMERS' ? customersTotals.totalMovements : singleCustomerData.rows.length)}</div>
                  </div>
                  <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-400 rounded-xl p-2.5 flex items-center justify-between sm:col-span-2">
                    <span className="text-slate-400 print:text-black font-bold">مجموع اقلام صادره از انبار</span>
                    <div className="font-mono font-black text-sm text-rose-400 print:text-black">{formatNumberFa(customerFilterMode === 'ALL_CUSTOMERS' ? customersTotals.totalItemsOut : singleCustomerData.totalQty)} قلم</div>
                  </div>
                </>
              )
            )}
          </div>
        )}

        {/* 1. Inventory Report Table */}
        {reportType === 'inventory' && (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full min-w-[760px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
              <colgroup>
                <col style={{ width: '4.5%' }} />
                <col style={{ width: isFinancialMode ? '25.5%' : '26%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
                {!isFinancialMode && <col style={{ width: '12.5%' }} />}
                <col style={{ width: '8%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: isFinancialMode ? '8%' : '7%' }} />
                {isFinancialMode ? (
                  <>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '8%' }} />
                  </>
                )}
              </colgroup>
              <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                <tr>
                  <th className="p-2 text-center font-bold">ردیف</th>
                  <th className="p-2 font-bold text-slate-100 print:text-black">نام و مشخصات کالا</th>
                  <th className="p-2 text-center">کد کالا</th>
                  <th className="p-2">دسته‌بندی</th>
                  {!isFinancialMode && <th className="p-2 text-center">انبار و قفسه</th>}
                  <th className="p-2 text-center">موجودی</th>
                  <th className="p-2 text-center">واحد</th>
                  <th className="p-2 text-center">نقطه سفارش</th>
                  {!isFinancialMode && <th className="p-2 text-center">تراز تا حداقل</th>}
                  <th className="p-2 text-center font-bold">وضعیت</th>
                  {isFinancialMode && (
                    <>
                      <th className="p-2 text-left">قیمت خرید</th>
                      <th className="p-2 text-left">ارزش کل موجودی</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                {filteredInventoryData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-400">
                      هیچ کالایی با فیلترهای انتخابی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredInventoryData.map((item, idx) => (
                    <tr
                      key={`inv-row-${item.product.product_id || 'prod'}-${idx}`}
                      className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                    >
                      <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="p-2 font-bold text-slate-100 print:text-black truncate" title={item.product.name}>
                        {item.product.name}
                      </td>
                      <td className="p-2 text-center font-mono text-indigo-300 print:text-black font-bold">
                        {item.product.sku}
                      </td>
                      <td className="p-2 text-slate-400 print:text-black truncate">
                        {item.categoryName}
                      </td>
                      {!isFinancialMode && (
                        <td className="p-2 text-center text-slate-300 print:text-black">
                          <span>{item.warehouseDisplayName}</span>
                          <span className="font-mono font-bold text-indigo-300 print:text-black mx-1">({item.shelfLocation})</span>
                        </td>
                      )}
                      <td className="p-2 text-center font-mono font-bold text-slate-100 print:text-black">
                        {toPersianDigits(item.currentQty)}
                      </td>
                      <td className="p-2 text-center text-slate-400 print:text-black">
                        {item.product.unit || 'عدد'}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                        {toPersianDigits(item.product.min_stock)}
                      </td>
                      {!isFinancialMode && (
                        <td className={`p-2 text-center font-mono font-bold print:text-black ${
                          item.varianceFromMin < 0 ? 'text-rose-400' : item.varianceFromMin === 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`} dir="ltr">
                          {item.varianceFromMin > 0 ? `+${toPersianDigits(item.varianceFromMin)}` : toPersianDigits(item.varianceFromMin)}
                        </td>
                      )}
                      <td className="p-2 text-center">
                        {item.isOut ? (
                          <span className="inline-flex items-center justify-center min-w-[70px] text-[10.5px] print:text-[12px] font-bold px-2 py-0.5 rounded-md bg-rose-950/80 text-rose-300 border border-rose-800 print:bg-transparent print:border-none print:shadow-none print:p-0 print:rounded-none print:text-black">
                            ناموجود
                          </span>
                        ) : item.isLow ? (
                          <span className="inline-flex items-center justify-center min-w-[70px] text-[10.5px] print:text-[12px] font-bold px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800 print:bg-transparent print:border-none print:shadow-none print:p-0 print:rounded-none print:text-black">
                            نقطه سفارش
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center min-w-[70px] text-[10.5px] print:text-[12px] font-bold px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800 print:bg-transparent print:border-none print:shadow-none print:p-0 print:rounded-none print:text-black">
                            مطلوب
                          </span>
                        )}
                      </td>
                      {isFinancialMode && (
                        <>
                          <td className="p-2 text-left">
                            <div className="flex items-center justify-end gap-1" dir="ltr">
                              <span className="font-mono tabular-nums font-bold text-slate-200 print:text-black text-xs">
                                {item.product.purchase_price ? formatNumberFa(item.product.purchase_price) : '0'}
                              </span>
                              <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                تومان
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-left">
                            <div className="flex items-center justify-end gap-1" dir="ltr">
                              <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-xs">
                                {formatNumberFa(item.totalPurchaseValuation)}
                              </span>
                              <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                تومان
                              </span>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {filteredInventoryData.length > 0 && (
                <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                  <tr>
                    <td colSpan={isFinancialMode ? 4 : 5} className="p-3 text-slate-200 print:text-black font-bold">
                      مجموع کل اقلام گزارش ({toPersianDigits(inventoryTotals.totalItems)} قلم):
                    </td>
                    <td className="p-3 text-center font-mono font-black text-indigo-300 print:text-black">
                      {formatNumberFa(inventoryTotals.totalPhysicalQty)}
                    </td>
                    {isFinancialMode ? (
                      <>
                        <td colSpan={4}></td>
                        <td className="p-3 text-left">
                          <div className="flex items-center justify-end gap-1" dir="ltr">
                            <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-sm">
                              {formatNumberFa(inventoryTotals.totalPurchaseVal)}
                            </span>
                            <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                              تومان
                            </span>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="p-3 text-center text-slate-300 print:text-black font-bold">
                        نقطه سفارش: {toPersianDigits(inventoryTotals.lowStockCount)} قلم | ناموجود: {toPersianDigits(inventoryTotals.outOfStockCount)} قلم
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* 2. Kardex Report Table */}
        {reportType === 'kardex' && (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full min-w-[980px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
              <colgroup>
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '15.5%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '8.5%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '6.5%' }} />
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                <tr>
                  <th className="p-2 text-center font-bold">ردیف</th>
                  <th className="p-2 font-bold text-slate-100 print:text-black">نام کالا</th>
                  <th className="p-2 text-center">کد کالا</th>
                  <th className="p-2 text-center">شماره سند</th>
                  <th className="p-2 text-center">شماره بارنامه</th>
                  <th className="p-2 text-center">تاریخ ثبت</th>
                  <th className="p-2">طرف حساب (مشتری / تامین‌کننده)</th>
                  <th className="p-2 text-center">نوع سند</th>
                  <th className="p-2">انبار</th>
                  <th className="p-2 text-center">ورود</th>
                  <th className="p-2 text-center">خروج</th>
                  <th className="p-2 text-center text-amber-300 font-bold">مانده لحظه‌ای</th>
                  <th className={isFinancialMode ? 'p-2 text-left' : 'p-2 text-center'}>
                    {isFinancialMode ? 'مبلغ کل' : 'واحد / شرح'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                {filteredKardexData.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-6 text-center text-slate-400">
                      هیچ سند گردشی با فیلترهای انتخابی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredKardexData.map((row, idx) => (
                    <tr
                      key={`kardex-row-${row.movement.movement_id || 'mov'}-${idx}`}
                      className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                    >
                      <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">{toPersianDigits(idx + 1)}</td>
                      <td className="p-2 font-bold text-slate-100 print:text-black truncate" title={row.productName}>{row.productName}</td>
                      <td className="p-2 text-center font-mono text-slate-400 print:text-black">{row.productSku}</td>
                      <td className="p-2 text-center font-mono text-indigo-300 print:text-black font-bold">{row.movement.document_number}</td>
                      <td className="p-2 text-center font-mono text-amber-400 print:text-black font-bold" dir="ltr">
                        {row.waybillNo !== '---' ? toPersianDigits(row.waybillNo) : '---'}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-300 print:text-black">{formatPersianDateTime(row.movement.created_at)}</td>
                      <td className="p-2 font-bold text-slate-100 print:text-black truncate">
                        {row.partyDisplayName !== '---' ? row.partyDisplayName : <span className="text-slate-600 print:text-slate-400">---</span>}
                      </td>
                      <td className="p-2 text-center">
                        {row.isInput ? (
                          <span className="inline-flex items-center justify-center min-w-[65px] text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800 print:bg-slate-100 print:border-black print:text-black font-medium">
                            ورود
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center min-w-[65px] text-[10px] px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800 print:bg-slate-100 print:border-black print:text-black font-medium">
                            خروج
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-slate-400 print:text-black truncate">{row.warehouseName}</td>
                      <td className="p-2 text-center font-mono font-bold text-emerald-400 print:text-black">
                        {row.qtyIn > 0 ? toPersianDigits(row.qtyIn) : '-'}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-rose-400 print:text-black">
                        {row.qtyOut > 0 ? toPersianDigits(row.qtyOut) : '-'}
                      </td>
                      <td className="p-2 text-center font-mono font-black text-amber-300 print:text-black bg-amber-950/20 rounded">
                        {toPersianDigits(row.runningBalance)}
                      </td>
                      {isFinancialMode ? (
                        <td className="p-2 text-left">
                          <div className="flex items-center justify-end gap-1" dir="ltr">
                            <span className="font-mono tabular-nums font-bold text-slate-200 print:text-black text-xs">
                              {formatNumberFa(row.totalPrice)}
                            </span>
                            <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                              تومان
                            </span>
                          </div>
                        </td>
                      ) : (
                        <td className="p-2 text-center text-slate-300 print:text-black truncate" title={row.movement.notes || row.movement.description || row.unit}>
                          {row.movement.notes || row.movement.description || row.unit}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {filteredKardexData.length > 0 && (
                <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                  <tr>
                    <td colSpan={9} className="p-3 text-slate-200 print:text-black font-bold">
                      مجموع ورودی و خروجی اسناد:
                    </td>
                    <td className="p-3 text-center font-mono font-black text-emerald-400 print:text-black">
                      {formatNumberFa(kardexTotals.totalIn)}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-rose-400 print:text-black">
                      {formatNumberFa(kardexTotals.totalOut)}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-amber-400 print:text-black">
                      -
                    </td>
                    {isFinancialMode ? (
                      <td className="p-3 text-left">
                        <div className="flex items-center justify-end gap-1" dir="ltr">
                          <span className="font-mono tabular-nums font-black text-cyan-300 print:text-black text-sm">
                            {formatNumberFa(kardexTotals.totalValuation)}
                          </span>
                          <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                            تومان
                          </span>
                        </div>
                      </td>
                    ) : (
                      <td className="p-3 text-center font-mono font-black text-cyan-300 print:text-black" dir="ltr">
                        خالص: {formatNumberFa(kardexTotals.netTurnover)}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* 3. Party Report: یا انحصاراً برای "تامین‌کنندگان" یا انحصاراً برای "مشتریان" */}
        {(reportType === 'party_report' || reportType === 'suppliers') && (
          <div className="space-y-4">
            {reportPartyScope === 'suppliers' ? (
              /* ================== الف: گزارش انحصاری تامین‌کنندگان ================== */
              <div className="space-y-4">
                {/* Quick In-Report Scope Toggle: یا تامین‌کنندگان یا تامین‌کننده کالا */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-300 whitespace-nowrap">نحوه نمایش گزارش تامین:</span>
                    <div className="grid grid-cols-2 sm:inline-flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-700 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierFilterMode('ALL_SUPPLIERS');
                          setSelectedSupplierId('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          selectedSupplierId === 'all'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">تامین‌کنندگان</span>
                        <span className="hidden sm:inline">تامین‌کنندگان (کلیه شرکت‌ها)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSupplierFilterMode('SINGLE_SUPPLIER');
                          if (selectedSupplierId === 'all' && allSuppliers.length > 0) {
                            setSelectedSupplierId(allSuppliers[0].supplier_id);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          selectedSupplierId !== 'all'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">تامین‌کننده کالا</span>
                        <span className="hidden sm:inline">تامین‌کننده کالا (کاردکس)</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-slate-300 font-bold whitespace-nowrap flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>انتخاب نام تامین‌کننده:</span>
                    </span>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSupplierId(val);
                        if (val === 'all') {
                          setSupplierFilterMode('ALL_SUPPLIERS');
                        } else {
                          setSupplierFilterMode('SINGLE_SUPPLIER');
                        }
                      }}
                      className="w-full sm:w-auto min-w-0 sm:min-w-[240px] max-w-full bg-slate-900 border border-emerald-500 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-bold focus:outline-hidden focus:ring-1 focus:ring-emerald-400 cursor-pointer shadow-xs truncate"
                    >
                      <option value="all">🏢 همه تامین‌کنندگان (نمایش جدول کلان)</option>
                      <optgroup label="── اسامی تامین‌کنندگان کالا ──">
                        {allSuppliers.map((s) => (
                          <option key={s.supplier_id} value={s.supplier_id}>
                            {s.name} {s.company_name ? `(${s.company_name})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Mode A: کلیه "تامین‌کنندگان" */}
                {supplierFilterMode === 'ALL_SUPPLIERS' ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full min-w-[850px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: isFinancialMode ? '16%' : '20%' }} />
                        <col style={{ width: isFinancialMode ? '12%' : '15%' }} />
                        <col style={{ width: isFinancialMode ? '10%' : '11%' }} />
                        {isFinancialMode && <col style={{ width: '9%' }} />}
                        <col style={{ width: isFinancialMode ? '11%' : '15%' }} />
                        {!isFinancialMode && <col style={{ width: '8%' }} />}
                        <col style={{ width: '8%' }} />
                        {isFinancialMode ? (
                          <>
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '10%' }} />
                          </>
                        ) : (
                          <col style={{ width: '9%' }} />
                        )}
                        <col style={{ width: '10%' }} className="print:hidden" />
                      </colgroup>
                      <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                        <tr>
                          <th className="p-2 text-center font-bold">ردیف</th>
                          <th className="p-2 font-bold text-slate-100 print:text-black">نام تامین‌کننده</th>
                          <th className="p-2">عنوان شرکت / بازرگانی</th>
                          <th className="p-2 text-center">شماره تماس</th>
                          {isFinancialMode && <th className="p-2 text-center">کد اقتصادی</th>}
                          <th className="p-2">استان و شهر</th>
                          {!isFinancialMode && <th className="p-2 text-center">تعداد اسناد</th>}
                          <th className="p-2 text-center">تعداد اقلام وارده</th>
                          {isFinancialMode ? (
                            <>
                              <th className="p-2 text-left">ارزش کل خریدهای ثبتی</th>
                              <th className="p-2 text-left">مانده حساب فعلی</th>
                            </>
                          ) : (
                            <th className="p-2 text-center">آخرین تحویل</th>
                          )}
                          <th className="p-2 text-center print:hidden">عملیات کاردکس</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                        {suppliersAggregatedData.length === 0 ? (
                          <tr>
                            <td colSpan={isFinancialMode ? 10 : 9} className="p-8 text-center text-slate-400">
                              هیچ تامین‌کننده‌ای در سیستم ثبت نشده است.
                            </td>
                          </tr>
                        ) : (
                          suppliersAggregatedData.map((item, idx) => (
                            <tr
                              key={`all-sup-${item.supplier.supplier_id}-${idx}`}
                              className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                            >
                              <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">
                                {toPersianDigits(idx + 1)}
                              </td>
                              <td className="p-2 font-bold text-emerald-300 print:text-black truncate" title={item.supplier.name}>
                                {item.supplier.name}
                              </td>
                              <td className="p-2 text-slate-300 print:text-black truncate">
                                {item.supplier.company_name || '---'}
                              </td>
                              <td className="p-2 text-center font-mono text-slate-400 print:text-black" dir="ltr">
                                {item.supplier.phone ? toPersianDigits(item.supplier.phone) : '---'}
                              </td>
                              {isFinancialMode && (
                                <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                                  {item.supplier.economic_code ? toPersianDigits(item.supplier.economic_code) : '---'}
                                </td>
                              )}
                              <td className="p-2 text-slate-400 print:text-black truncate">
                                {item.supplier.province ? `${item.supplier.province} - ${item.supplier.city || ''}` : '---'}
                              </td>
                              {!isFinancialMode && (
                                <td className="p-2 text-center font-mono font-bold text-indigo-300 print:text-black">
                                  {toPersianDigits(item.movementsCount)}
                                </td>
                              )}
                              <td className="p-2 text-center font-mono font-bold text-slate-100 print:text-black">
                                {toPersianDigits(item.totalItemsIn)}
                              </td>
                              {isFinancialMode ? (
                                <>
                                  <td className="p-2 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-xs">
                                        {formatNumberFa(item.totalValuation)}
                                      </span>
                                      <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-amber-400 print:text-black text-xs">
                                        {formatNumberFa(item.currentBalance)}
                                      </span>
                                      <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <td className="p-2 text-center font-mono text-slate-300 print:text-black whitespace-nowrap">
                                  {item.lastActivityDate ? toPersianDigits(getPersianDate(item.lastActivityDate)) : '---'}
                                </td>
                              )}
                              <td className="p-2 text-center print:hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSupplierFilterMode('SINGLE_SUPPLIER');
                                    setSelectedSupplierId(item.supplier.supplier_id);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[11px] font-bold border border-emerald-500/40 transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                  title="مشاهده کاردکس و گردش کالاهای این تامین‌کننده"
                                >
                                  <Truck className="w-3 h-3" />
                                  <span>کاردکس کالا</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {suppliersAggregatedData.length > 0 && (
                        <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                          <tr>
                            <td colSpan={isFinancialMode ? 6 : 5} className="p-3 text-slate-200 print:text-black font-bold">
                              مجموع کل تامین‌کنندگان ({toPersianDigits(suppliersTotals.totalSuppliers)} شرکت):
                            </td>
                            {!isFinancialMode && (
                              <td className="p-3 text-center font-mono font-black text-indigo-300 print:text-black">
                                {formatNumberFa(suppliersTotals.totalMovements)} سند
                              </td>
                            )}
                            <td className="p-3 text-center font-mono font-black text-indigo-300 print:text-black">
                              {formatNumberFa(suppliersTotals.totalItemsIn)}
                            </td>
                            {isFinancialMode ? (
                              <>
                                <td className="p-3 text-left">
                                  <div className="flex items-center justify-end gap-1" dir="ltr">
                                    <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-sm">
                                      {formatNumberFa(suppliersTotals.totalValuation)}
                                    </span>
                                    <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                      تومان
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3 text-left">
                                  <div className="flex items-center justify-end gap-1" dir="ltr">
                                    <span className="font-mono tabular-nums font-black text-amber-400 print:text-black text-sm">
                                      {formatNumberFa(suppliersTotals.totalBalance)}
                                    </span>
                                    <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                      تومان
                                    </span>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td></td>
                            )}
                            <td className="print:hidden"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  /* Mode B: کاردکس تفصیلی "تامین‌کننده کالا" */
                  <div className="space-y-4">
                    {singleSupplierData.supplier && (
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:border-black print:text-black">
                        <div>
                          <span className="text-slate-400 block font-medium">نام تامین‌کننده کالا:</span>
                          <strong className="text-emerald-400 font-bold text-sm">{singleSupplierData.supplier.name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">شرکت / بازرگانی:</span>
                          <span className="font-bold text-slate-100">{singleSupplierData.supplier.company_name || '---'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">شماره تماس:</span>
                          <span className="font-mono font-bold" dir="ltr">{toPersianDigits(singleSupplierData.supplier.phone || '---')}</span>
                        </div>
                        {isFinancialMode ? (
                          <div>
                            <span className="text-slate-400 block font-medium">مانده حساب:</span>
                            <span className="font-mono font-bold text-amber-400">{formatCurrencyToman(singleSupplierData.supplier.current_balance)}</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-400 block font-medium">مجموع اقلام دریافتی:</span>
                            <span className="font-mono font-bold text-emerald-400 print:text-black">
                              {formatNumberFa(singleSupplierData.totalQty)} قلم ({toPersianDigits(singleSupplierData.rows.length)} سند)
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <table className="w-full min-w-[950px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                        <colgroup>
                          <col style={{ width: '4%' }} />
                          <col style={{ width: isFinancialMode ? '18%' : '21%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '6.5%' }} />
                          <col style={{ width: '5%' }} />
                          {isFinancialMode ? (
                            <>
                              <col style={{ width: '11%' }} />
                              <col style={{ width: '12%' }} />
                              <col style={{ width: '9%' }} />
                            </>
                          ) : (
                            <>
                              <col style={{ width: '12%' }} />
                              <col style={{ width: '17%' }} />
                            </>
                          )}
                        </colgroup>
                        <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                          <tr>
                            <th className="p-2 text-center font-bold">ردیف</th>
                            <th className="p-2 font-bold text-slate-100 print:text-black">نام کالا</th>
                            <th className="p-2 text-center">کد کالا SKU</th>
                            <th className="p-2 text-center">شماره سند انبار</th>
                            <th className="p-2 text-center">شماره بارنامه</th>
                            <th className="p-2 text-center">تاریخ ثبت</th>
                            <th className="p-2 text-center">مقدار وارده</th>
                            <th className="p-2 text-center">واحد</th>
                            {isFinancialMode && (
                              <>
                                <th className="p-2 text-left">قیمت واحد خرید</th>
                                <th className="p-2 text-left">ارزش کل سند</th>
                              </>
                            )}
                            <th className="p-2">انبار مقصد</th>
                            {!isFinancialMode && <th className="p-2">شرح / توضیحات محموله</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                          {singleSupplierData.rows.length === 0 ? (
                            <tr>
                              <td colSpan={isFinancialMode ? 11 : 10} className="p-8 text-center text-slate-400">
                                هیچ کالای وارده یا سند گردشی برای تامین‌کننده انتخابی یافت نشد.
                              </td>
                            </tr>
                          ) : (
                            singleSupplierData.rows.map((row, idx) => (
                              <tr
                                key={`single-sup-row-${row.movement.movement_id}-${idx}`}
                                className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                              >
                                <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">
                                  {toPersianDigits(idx + 1)}
                                </td>
                                <td className="p-2 font-bold text-slate-100 print:text-black truncate" title={row.productName}>
                                  {row.productName}
                                </td>
                                <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                                  {row.productSku}
                                </td>
                                <td className="p-2 text-center font-mono text-indigo-300 print:text-black font-bold">
                                  {row.movement.document_number}
                                </td>
                                <td className="p-2 text-center font-mono text-amber-400 print:text-black font-bold" dir="ltr">
                                  {row.waybillNo !== '---' ? toPersianDigits(row.waybillNo) : '---'}
                                </td>
                                <td className="p-2 text-center font-mono text-slate-300 print:text-black">
                                  {formatPersianDateTime(row.movement.created_at)}
                                </td>
                                <td className="p-2 text-center font-mono font-bold text-emerald-400 print:text-black">
                                  {toPersianDigits(row.qty)}
                                </td>
                                <td className="p-2 text-center text-slate-400 print:text-black">
                                  {row.unit}
                                </td>
                                {isFinancialMode && (
                                  <>
                                    <td className="p-2 text-left">
                                      <div className="flex items-center justify-end gap-1" dir="ltr">
                                        <span className="font-mono tabular-nums font-bold text-slate-200 print:text-black text-xs">
                                          {formatNumberFa(row.unitPrice)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                          تومان
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-2 text-left">
                                      <div className="flex items-center justify-end gap-1" dir="ltr">
                                        <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-xs">
                                          {formatNumberFa(row.totalPrice)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                          تومان
                                        </span>
                                      </div>
                                    </td>
                                  </>
                                )}
                                <td className="p-2 text-slate-400 print:text-black truncate">
                                  {row.warehouseName}
                                </td>
                                {!isFinancialMode && (
                                  <td className="p-2 text-slate-300 print:text-black truncate">
                                    {row.movement.notes || row.movement.description || '---'}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                        {singleSupplierData.rows.length > 0 && (
                          <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                            <tr>
                              <td colSpan={6} className="p-3 text-slate-200 print:text-black font-bold">
                                مجموع کل اقلام دریافتی از این تامین‌کننده:
                              </td>
                              <td className="p-3 text-center font-mono font-black text-emerald-400 print:text-black">
                                {formatNumberFa(singleSupplierData.totalQty)}
                              </td>
                              {isFinancialMode ? (
                                <>
                                  <td colSpan={2}></td>
                                  <td className="p-3 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-sm">
                                        {formatNumberFa(singleSupplierData.totalVal)}
                                      </span>
                                      <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                  <td></td>
                                </>
                              ) : (
                                <td colSpan={3} className="p-3 text-center text-slate-300 print:text-black">
                                  تعداد کل اسناد: {toPersianDigits(singleSupplierData.rows.length)} سند
                                </td>
                              )}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ================== ب: گزارش انحصاری مشتریان ================== */
              <div className="space-y-4">
                {/* Quick In-Report Scope Toggle: یا مشتریان یا کاردکس مشتری خاص */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-300 whitespace-nowrap">نحوه نمایش گزارش مشتریان:</span>
                    <div className="grid grid-cols-2 sm:inline-flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-700 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerFilterMode('ALL_CUSTOMERS');
                          setSelectedCustomerId('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          customerFilterMode === 'ALL_CUSTOMERS'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">مشتریان</span>
                        <span className="hidden sm:inline">مشتریان (کلیه خریداران)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomerFilterMode('SINGLE_CUSTOMER');
                          if (selectedCustomerId === 'all' && allCustomers.length > 0) {
                            setSelectedCustomerId(allCustomers[0].customer_id);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          selectedCustomerId !== 'all'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">مشتری خاص</span>
                        <span className="hidden sm:inline">مشتری خاص (کاردکس)</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-slate-300 font-bold whitespace-nowrap flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>انتخاب نام مشتری:</span>
                    </span>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCustomerId(val);
                        if (val === 'all') {
                          setCustomerFilterMode('ALL_CUSTOMERS');
                        } else {
                          setCustomerFilterMode('SINGLE_CUSTOMER');
                        }
                      }}
                      className="w-full sm:w-auto min-w-0 sm:min-w-[240px] max-w-full bg-slate-900 border border-amber-500 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-bold focus:outline-hidden focus:ring-1 focus:ring-amber-400 cursor-pointer shadow-xs truncate"
                    >
                      <option value="all">👥 همه مشتریان (نمایش جدول کلان)</option>
                      <optgroup label="── اسامی مشتریان طرف‌حساب ──">
                        {allCustomers.map((c) => (
                          <option key={c.customer_id} value={c.customer_id}>
                            {c.name} {c.province ? `(${c.province})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Mode A: کلیه "مشتریان" */}
                {customerFilterMode === 'ALL_CUSTOMERS' ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full min-w-[850px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: isFinancialMode ? '18%' : '22%' }} />
                        <col style={{ width: '12%' }} />
                        {isFinancialMode && <col style={{ width: '11%' }} />}
                        <col style={{ width: isFinancialMode ? '14%' : '18%' }} />
                        {!isFinancialMode && <col style={{ width: '11%' }} />}
                        <col style={{ width: isFinancialMode ? '8%' : '11%' }} />
                        {isFinancialMode ? (
                          <>
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '11%' }} />
                          </>
                        ) : (
                          <col style={{ width: '11%' }} />
                        )}
                        <col style={{ width: '11%' }} className="print:hidden" />
                      </colgroup>
                      <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                        <tr>
                          <th className="p-2 text-center font-bold">ردیف</th>
                          <th className="p-2 font-bold text-slate-100 print:text-black">نام مشتری</th>
                          <th className="p-2 text-center">شماره تماس</th>
                          {isFinancialMode && <th className="p-2 text-center">کد ملی / اقتصادی</th>}
                          <th className="p-2">استان و شهر</th>
                          {!isFinancialMode && <th className="p-2 text-center">تعداد اسناد / حواله</th>}
                          <th className="p-2 text-center">تعداد اقلام صادره</th>
                          {isFinancialMode ? (
                            <>
                              <th className="p-2 text-left">ارزش کل فاکتورها</th>
                              <th className="p-2 text-left">مانده حساب فعلی</th>
                            </>
                          ) : (
                            <th className="p-2 text-center">آخرین ارسال</th>
                          )}
                          <th className="p-2 text-center print:hidden">عملیات کاردکس</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                        {customersAggregatedData.length === 0 ? (
                          <tr>
                            <td colSpan={isFinancialMode ? 9 : 8} className="p-8 text-center text-slate-400">
                              هیچ مشتری‌ای در سیستم ثبت نشده است.
                            </td>
                          </tr>
                        ) : (
                          customersAggregatedData.map((item, idx) => (
                            <tr
                              key={`all-cust-${item.customer.customer_id}-${idx}`}
                              className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                            >
                              <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">
                                {toPersianDigits(idx + 1)}
                              </td>
                              <td className="p-2 font-bold text-amber-300 print:text-black truncate" title={item.customer.name}>
                                {item.customer.name}
                              </td>
                              <td className="p-2 text-center font-mono text-slate-400 print:text-black" dir="ltr">
                                {item.customer.phone ? toPersianDigits(item.customer.phone) : '---'}
                              </td>
                              {isFinancialMode && (
                                <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                                  {item.customer.economic_code || item.customer.national_id ? toPersianDigits(item.customer.economic_code || item.customer.national_id || '') : '---'}
                                </td>
                              )}
                              <td className="p-2 text-slate-400 print:text-black truncate">
                                {item.customer.province ? `${item.customer.province} - ${item.customer.city || ''}` : '---'}
                              </td>
                              {!isFinancialMode && (
                                <td className="p-2 text-center font-mono font-bold text-indigo-300 print:text-black">
                                  {toPersianDigits(item.movementsCount)}
                                </td>
                              )}
                              <td className="p-2 text-center font-mono font-bold text-slate-100 print:text-black">
                                {toPersianDigits(item.totalItemsOut)}
                              </td>
                              {isFinancialMode ? (
                                <>
                                  <td className="p-2 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-xs">
                                        {formatNumberFa(item.totalValuation)}
                                      </span>
                                      <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-amber-400 print:text-black text-xs">
                                        {formatNumberFa(item.currentBalance)}
                                      </span>
                                      <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <td className="p-2 text-center font-mono text-slate-300 print:text-black whitespace-nowrap">
                                  {item.lastActivityDate ? toPersianDigits(getPersianDate(item.lastActivityDate)) : '---'}
                                </td>
                              )}
                              <td className="p-2 text-center print:hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomerFilterMode('SINGLE_CUSTOMER');
                                    setSelectedCustomerId(item.customer.customer_id);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white text-[11px] font-bold border border-amber-500/40 transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                  title="مشاهده کاردکس و گردش کالاهای این مشتری"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>کاردکس مشتری</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {customersAggregatedData.length > 0 && (
                        <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                          <tr>
                            <td colSpan={isFinancialMode ? 5 : 4} className="p-3 text-slate-200 print:text-black font-bold">
                              مجموع کل مشتریان ({toPersianDigits(customersTotals.totalCustomers)} خریدار):
                            </td>
                            {!isFinancialMode && (
                              <td className="p-3 text-center font-mono font-black text-indigo-300 print:text-black">
                                {formatNumberFa(customersTotals.totalMovements)} سند
                              </td>
                            )}
                            <td className="p-3 text-center font-mono font-black text-indigo-300 print:text-black">
                              {formatNumberFa(customersTotals.totalItemsOut)}
                            </td>
                            {isFinancialMode ? (
                              <>
                                <td className="p-3 text-left">
                                  <div className="flex items-center justify-end gap-1" dir="ltr">
                                    <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-sm">
                                      {formatNumberFa(customersTotals.totalValuation)}
                                    </span>
                                    <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                      تومان
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3 text-left">
                                  <div className="flex items-center justify-end gap-1" dir="ltr">
                                    <span className="font-mono tabular-nums font-black text-amber-400 print:text-black text-sm">
                                      {formatNumberFa(customersTotals.totalBalance)}
                                    </span>
                                    <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                      تومان
                                    </span>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td></td>
                            )}
                            <td className="print:hidden"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  /* Mode B: کاردکس تفصیلی "مشتری خاص" */
                  <div className="space-y-4">
                    {singleCustomerData.customer && (
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:border-black print:text-black">
                        <div>
                          <span className="text-slate-400 block font-medium">نام مشتری طرف حساب:</span>
                          <strong className="text-amber-400 font-bold text-sm">{singleCustomerData.customer.name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">آدرس / استان:</span>
                          <span className="font-bold text-slate-100">{singleCustomerData.customer.province ? `${singleCustomerData.customer.province} - ${singleCustomerData.customer.city || ''}` : '---'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">شماره تماس:</span>
                          <span className="font-mono font-bold" dir="ltr">{toPersianDigits(singleCustomerData.customer.phone || '---')}</span>
                        </div>
                        {isFinancialMode ? (
                          <div>
                            <span className="text-slate-400 block font-medium">مانده حساب:</span>
                            <span className="font-mono font-bold text-amber-400">{formatCurrencyToman(singleCustomerData.customer.current_balance)}</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-400 block font-medium">مجموع اقلام ارسالی:</span>
                            <span className="font-mono font-bold text-amber-400 print:text-black">
                              {formatNumberFa(singleCustomerData.totalQty)} قلم ({toPersianDigits(singleCustomerData.rows.length)} حواله)
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <table className="w-full min-w-[950px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                        <colgroup>
                          <col style={{ width: '4%' }} />
                          <col style={{ width: isFinancialMode ? '18%' : '21%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '8.5%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '6.5%' }} />
                          <col style={{ width: '5%' }} />
                          {isFinancialMode ? (
                            <>
                              <col style={{ width: '11%' }} />
                              <col style={{ width: '12%' }} />
                              <col style={{ width: '9%' }} />
                            </>
                          ) : (
                            <>
                              <col style={{ width: '12%' }} />
                              <col style={{ width: '17%' }} />
                            </>
                          )}
                        </colgroup>
                        <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                          <tr>
                            <th className="p-2 text-center font-bold">ردیف</th>
                            <th className="p-2 font-bold text-slate-100 print:text-black">نام کالا</th>
                            <th className="p-2 text-center">کد کالا SKU</th>
                            <th className="p-2 text-center">شماره سند / حواله</th>
                            <th className="p-2 text-center">شماره بارنامه</th>
                            <th className="p-2 text-center">تاریخ ثبت</th>
                            <th className="p-2 text-center">مقدار صادره</th>
                            <th className="p-2 text-center">واحد</th>
                            {isFinancialMode && (
                              <>
                                <th className="p-2 text-left">قیمت فروش</th>
                                <th className="p-2 text-left">ارزش کل سند</th>
                              </>
                            )}
                            <th className="p-2">انبار مبدا</th>
                            {!isFinancialMode && <th className="p-2">شرح / توضیحات ارسال</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                          {singleCustomerData.rows.length === 0 ? (
                            <tr>
                              <td colSpan={isFinancialMode ? 11 : 10} className="p-8 text-center text-slate-400">
                                هیچ کالای صادره یا سند ارسال برای مشتری انتخابی یافت نشد.
                              </td>
                            </tr>
                          ) : (
                            singleCustomerData.rows.map((row, idx) => (
                              <tr
                                key={`single-cust-row-${row.movement.movement_id}-${idx}`}
                                className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                              >
                                <td className="p-2 text-center font-mono font-bold text-slate-400 print:text-black">
                                  {toPersianDigits(idx + 1)}
                                </td>
                                <td className="p-2 font-bold text-slate-100 print:text-black truncate" title={row.productName}>
                                  {row.productName}
                                </td>
                                <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                                  {row.productSku}
                                </td>
                                <td className="p-2 text-center font-mono text-amber-300 print:text-black font-bold">
                                  {row.movement.document_number}
                                </td>
                                <td className="p-2 text-center font-mono text-cyan-400 print:text-black font-bold" dir="ltr">
                                  {row.waybillNo !== '---' ? toPersianDigits(row.waybillNo) : '---'}
                                </td>
                                <td className="p-2 text-center font-mono text-slate-300 print:text-black">
                                  {formatPersianDateTime(row.movement.created_at)}
                                </td>
                                <td className="p-2 text-center font-mono font-bold text-rose-400 print:text-black">
                                  {toPersianDigits(row.qty)}
                                </td>
                                <td className="p-2 text-center text-slate-400 print:text-black">
                                  {row.unit}
                                </td>
                                {isFinancialMode && (
                                  <>
                                    <td className="p-2 text-left">
                                      <div className="flex items-center justify-end gap-1" dir="ltr">
                                        <span className="font-mono tabular-nums font-bold text-slate-200 print:text-black text-xs">
                                          {formatNumberFa(row.unitPrice)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                          تومان
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-2 text-left">
                                      <div className="flex items-center justify-end gap-1" dir="ltr">
                                        <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-xs">
                                          {formatNumberFa(row.totalPrice)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                                          تومان
                                        </span>
                                      </div>
                                    </td>
                                  </>
                                )}
                                <td className="p-2 text-slate-400 print:text-black truncate">
                                  {row.warehouseName}
                                </td>
                                {!isFinancialMode && (
                                  <td className="p-2 text-slate-300 print:text-black truncate">
                                    {row.movement.notes || row.movement.description || '---'}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                        {singleCustomerData.rows.length > 0 && (
                          <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                            <tr>
                              <td colSpan={6} className="p-3 text-slate-200 print:text-black font-bold">
                                مجموع کل اقلام صادره به این مشتری:
                              </td>
                              <td className="p-3 text-center font-mono font-black text-rose-400 print:text-black">
                                {formatNumberFa(singleCustomerData.totalQty)}
                              </td>
                              {isFinancialMode ? (
                                <>
                                  <td colSpan={2}></td>
                                  <td className="p-3 text-left">
                                    <div className="flex items-center justify-end gap-1" dir="ltr">
                                      <span className="font-mono tabular-nums font-black text-emerald-400 print:text-black text-sm">
                                        {formatNumberFa(singleCustomerData.totalVal)}
                                      </span>
                                      <span className="text-xs text-slate-300 print:text-black font-sans font-bold">
                                        تومان
                                      </span>
                                    </div>
                                  </td>
                                  <td></td>
                                </>
                              ) : (
                                <td colSpan={3} className="p-3 text-center text-slate-300 print:text-black">
                                  تعداد کل حواله‌ها: {toPersianDigits(singleCustomerData.rows.length)} حواله
                                </td>
                              )}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. Live Connection Logs Report Table & Terminal */}
        {reportType === 'live_logs' && (
          <div className="space-y-4">
            {/* Console Screen Header */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs print:hidden">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-100">کنسول زنده ثبت رویدادها و عیب‌یابی اتصال سرور ابری</span>
                <span className="text-[10px] text-cyan-400 font-mono">https://anbar.mgas.ir</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">لاگ‌های نمایش‌داده‌شده:</span>
                <span className="font-mono font-bold text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {toPersianDigits(filteredLiveLogs.length)} از {toPersianDigits(liveLogs.length)}
                </span>
              </div>
            </div>

            {/* Official Report Table (Clean for PDF & Printouts, Interactive on Screen) */}
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full min-w-[720px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px]">
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[18%]" />
                  <col className="w-[10%]" />
                  <col className="w-[17%]" />
                  <col className="w-[50%]" />
                </colgroup>
                <thead className="bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                  <tr>
                    <th className="p-2.5 text-center">ردیف</th>
                    <th className="p-2.5 whitespace-nowrap">زمان ثبت رویداد</th>
                    <th className="p-2.5 text-center">سطح</th>
                    <th className="p-2.5 whitespace-nowrap">منبع رویداد</th>
                    <th className="p-2.5">شرح و جزییات عملیات همگام‌سازی anbar.mgas.ir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 text-xs">
                  {filteredLiveLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                        هیچ لاگ ارتباطی با معیارهای جستجو یافت نشد. می‌توانید با دکمه «تست اتصال» یا «بروزرسانی فوری» ارتباط با anbar.mgas.ir را آزمایش فرمایید.
                      </td>
                    </tr>
                  ) : (
                    filteredLiveLogs.map((log, idx) => (
                      <tr
                        key={`livelog-row-${log.id || 'log'}-${idx}`}
                        className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                      >
                        <td className="p-2.5 text-center text-slate-400 print:text-black font-mono">
                          {toPersianDigits(idx + 1)}
                        </td>
                        <td className="p-2.5 text-slate-300 print:text-black whitespace-nowrap font-mono text-[11px]">
                          {formatPersianDateTime(log.timestamp)}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border print:text-black ${
                              log.level === 'success'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                : log.level === 'error'
                                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                : log.level === 'warn'
                                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                            }`}
                          >
                            {log.level === 'success'
                              ? 'موفق'
                              : log.level === 'error'
                              ? 'خطا'
                              : log.level === 'warn'
                              ? 'هشدار'
                              : 'اطلاعات'}
                          </span>
                        </td>
                        <td className="p-2.5 text-indigo-300 print:text-black font-mono font-semibold whitespace-nowrap">
                          {log.source}
                        </td>
                        <td className="p-2.5 text-slate-200 print:text-black font-sans leading-relaxed">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-100 print:text-black">{log.message}</span>
                            {log.details && (
                              <pre className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800 overflow-x-auto print:hidden font-mono text-left" dir="ltr">
                                {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                              </pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Segregated Customer Valves Inventory Report */}
        {reportType === 'customer_valves' && (
          <div className="space-y-4">
            {/* Mode 1: SEGREGATED - تفکیک به ازای هر مدل شیر */}
            {valveViewMode === 'SEGREGATED' && (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full min-w-[950px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                  <colgroup>
                    <col className="w-[4%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                    <col className="w-[18%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead className="bg-slate-950/70 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                    <tr>
                      <th className="p-2.5 text-center">ردیف</th>
                      <th className="p-2.5 text-right font-bold text-slate-100 print:text-black">نام مشتری / طرف‌حساب</th>
                      <th className="p-2.5 text-right">شرکت / استان</th>
                      <th className="p-2.5 text-right font-bold text-amber-300 print:text-black">مدل و مشخصات تفکیکی شیر</th>
                      <th className="p-2.5 text-center">نوع شیر</th>
                      <th className="p-2.5 text-center font-bold text-slate-200 print:text-black">ورود (IN)</th>
                      <th className="p-2.5 text-center font-bold text-slate-200 print:text-black">خروج (OUT)</th>
                      <th className="p-2.5 text-center font-bold text-slate-200 print:text-black">باقی‌مانده (BALANCE)</th>
                      <th className="p-2.5 text-center">وضعیت تراز</th>
                      <th className="p-2.5 text-center">آخرین تاریخ گردش</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 text-xs print:text-[12.5px]">
                    {filteredCustomerValveRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                          هیچ ردیف گردشی برای شیرآلات با فیلترهای انتخابی یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomerValveRows.map((row, idx) => (
                        <tr
                          key={`cust-valve-row-${row.customer_id}-${row.valve_name}-${idx}`}
                          className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                        >
                          <td className="p-2.5 text-center font-mono text-slate-400 print:text-black">
                            {toPersianDigits(idx + 1)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-100 print:text-black">
                            {row.customer_name}
                          </td>
                          <td className="p-2.5 text-right text-slate-300 print:text-black">
                            {row.company_name ? `${row.company_name} (${row.province || ''})` : row.province || '---'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-amber-300 print:text-black">
                            {row.valve_name}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] print:text-[12px] font-bold border whitespace-nowrap shadow-2xs print:border-none print:shadow-none print:p-0 print:rounded-none ${
                                row.valve_category === 'NEW'
                                  ? 'bg-transparent text-slate-100 border-slate-700 print:bg-transparent print:text-black'
                                  : 'bg-transparent text-amber-300 border-slate-700 print:bg-transparent print:text-black'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 print:hidden ${
                                  row.valve_category === 'NEW'
                                    ? 'bg-slate-400'
                                    : 'bg-amber-400'
                                }`}
                              />
                              <span>{row.valve_category === 'NEW' ? 'شیر نو' : 'شیر کهنه و داغی'}</span>
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-100 print:text-black">
                            {row.quantity_in > 0 ? toPersianDigits(row.quantity_in) : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-100 print:text-black">
                            {row.quantity_out > 0 ? toPersianDigits(row.quantity_out) : '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold print:text-black">
                            <span
                              className={`inline-flex items-center justify-center min-w-[34px] px-2 py-0.5 rounded-md font-mono text-xs print:text-[12.5px] border print:border-none print:shadow-none print:p-0 print:rounded-none ${
                                row.balance > 0
                                  ? 'text-slate-100 bg-transparent border-slate-700 print:bg-transparent print:text-black font-black'
                                  : row.balance === 0
                                  ? 'text-slate-400 bg-transparent border-slate-800 print:bg-transparent print:text-slate-700'
                                  : 'text-amber-300 bg-transparent border-slate-700 print:bg-transparent print:text-black font-black'
                              }`}
                            >
                              {toPersianDigits(row.balance)}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10.5px] print:text-[12px] font-bold border print:border-none print:shadow-none print:p-0 print:rounded-none ${
                                row.status_type === 'healthy'
                                  ? 'bg-transparent text-slate-200 border-slate-700 print:bg-transparent print:text-black'
                                  : row.status_type === 'covered'
                                  ? 'bg-transparent text-amber-300 border-slate-700 print:bg-transparent print:text-black'
                                  : 'bg-transparent text-slate-400 border-slate-800 print:bg-transparent print:text-slate-700'
                              }`}
                            >
                              {row.status_label}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-800 dark:text-slate-200 print:text-black font-bold whitespace-nowrap">
                            {row.last_activity_date ? toPersianDigits(getPersianDate(row.last_activity_date)) : '---'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredCustomerValveRows.length > 0 && (
                    <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                      <tr>
                        <td colSpan={5} className="p-3 text-right font-bold text-slate-200 print:text-black border border-slate-800 print:border-slate-300">
                          مجموع کل اقلام گزارش تفکیکی شیرها ({toPersianDigits(filteredCustomerValveRows.length)} قلم):
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-400 print:text-black font-bold border border-slate-800 print:border-slate-300">
                          {toPersianDigits(customerValveReportData.totals.totalValvesIn)}
                        </td>
                        <td className="p-3 text-center font-mono text-rose-400 print:text-black font-bold border border-slate-800 print:border-slate-300">
                          {toPersianDigits(customerValveReportData.totals.totalValvesOut)}
                        </td>
                        <td className="p-3 text-center font-mono text-indigo-300 print:text-black font-bold border border-slate-800 print:border-slate-300">
                          {toPersianDigits(customerValveReportData.totals.totalValvesBalance)}
                        </td>
                        <td colSpan={2} className="p-3 border border-slate-800 print:border-slate-300 bg-transparent"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Mode 2: SUMMARY - خلاصه تراز کل مشتریان */}
            {valveViewMode === 'SUMMARY' && (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full min-w-[950px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                  <colgroup>
                    <col className="w-[4%]" />
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead className="bg-slate-950/70 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                    <tr>
                      <th className="p-2.5 text-center">ردیف</th>
                      <th className="p-2.5 font-bold text-slate-100 print:text-black">نام مشتری / طرف‌حساب</th>
                      <th className="p-2.5">شرکت / استان</th>
                      <th className="p-2.5 text-center text-emerald-400">ورود شیر نو</th>
                      <th className="p-2.5 text-center text-rose-400">خروج شیر نو</th>
                      <th className="p-2.5 text-center text-indigo-300 font-bold">مانده شیر نو</th>
                      <th className="p-2.5 text-center text-emerald-400">ورود شیر کهنه</th>
                      <th className="p-2.5 text-center text-rose-400">خروج شیر کهنه</th>
                      <th className="p-2.5 text-center text-amber-400 font-bold">مانده شیر کهنه</th>
                      <th className="p-2.5 text-center font-bold text-slate-100">کل ورود</th>
                      <th className="p-2.5 text-center font-bold text-slate-100">کل خروج</th>
                      <th className="p-2.5 text-center font-bold text-emerald-400">تراز نهایی</th>
                      <th className="p-2.5 text-center">آخرین فعالیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 text-xs">
                    {filteredCustomerValveSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-slate-500 font-medium">
                          هیچ سابقه‌ای برای تراز مشتریان یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomerValveSummaries.map((row, idx) => (
                        <tr
                          key={`cust-summary-row-${row.customer_id}-${idx}`}
                          className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                        >
                          <td className="p-2.5 text-center font-mono text-slate-400 print:text-black">
                            {toPersianDigits(idx + 1)}
                          </td>
                          <td className="p-2.5 font-bold text-slate-100 print:text-black">
                            {row.customer_name}
                          </td>
                          <td className="p-2.5 text-slate-300 print:text-black">
                            {row.company_name ? `${row.company_name} (${row.province || ''})` : row.province || '---'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-emerald-400 font-semibold">
                            {toPersianDigits(row.total_new_in)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-rose-400 font-semibold">
                            {toPersianDigits(row.total_new_out)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-indigo-300 font-bold">
                            {toPersianDigits(row.new_balance)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-emerald-400 font-semibold">
                            {toPersianDigits(row.total_used_in)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-rose-400 font-semibold">
                            {toPersianDigits(row.total_used_out)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-amber-400 font-bold">
                            {toPersianDigits(row.used_balance)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-200">
                            {toPersianDigits(row.total_all_in)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-200">
                            {toPersianDigits(row.total_all_out)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                            {toPersianDigits(row.all_balance)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-800 dark:text-slate-200 print:text-black font-bold whitespace-nowrap">
                            {row.last_activity_date ? toPersianDigits(getPersianDate(row.last_activity_date)) : '---'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredCustomerValveSummaries.length > 0 && (
                    <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                      <tr>
                        <td colSpan={3} className="p-3 text-slate-200 print:text-black">
                          مجموع کل ترازها ({toPersianDigits(filteredCustomerValveSummaries.length)} مشتری):
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalNewValveIn)}
                        </td>
                        <td className="p-3 text-center font-mono text-rose-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalNewValveOut)}
                        </td>
                        <td className="p-3 text-center font-mono text-indigo-300 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalNewValveBalance)}
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalUsedValveIn)}
                        </td>
                        <td className="p-3 text-center font-mono text-rose-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalUsedValveOut)}
                        </td>
                        <td className="p-3 text-center font-mono text-amber-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalUsedValveBalance)}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-100 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalValvesIn)}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-100 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalValvesOut)}
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-400 print:text-black font-bold">
                          {toPersianDigits(customerValveReportData.totals.totalValvesBalance)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Mode 3: LEDGER - ریز اسناد و حواله‌های گردش و مانده لحظه‌ای */}
            {valveViewMode === 'LEDGER' && (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full min-w-[980px] text-right text-xs divide-y divide-slate-800 print:divide-black print:text-[13px] table-fixed">
                  <colgroup>
                    <col className="w-[3.5%]" />
                    <col className="w-[9%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[16%]" />
                    <col className="w-[7%]" />
                    <col className="w-[6.5%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                  </colgroup>
                  <thead className="bg-slate-950/70 print:bg-slate-100 text-slate-400 print:text-black font-bold">
                    <tr>
                      <th className="p-2.5 text-center">ردیف</th>
                      <th className="p-2.5 text-center">تاریخ ثبت</th>
                      <th className="p-2.5 font-bold text-slate-100 print:text-black">طرف‌حساب (مشتری/شعبه)</th>
                      <th className="p-2.5 text-center">نوع عملیات</th>
                      <th className="p-2.5 font-bold text-amber-300">مدل و عنوان قطعه شیر</th>
                      <th className="p-2.5 text-center">دسته‌بندی</th>
                      <th className="p-2.5 text-center font-bold text-indigo-300">تعداد</th>
                      <th className="p-2.5 text-center font-bold text-emerald-400 bg-emerald-950/20 border-x border-emerald-900/40">مانده لحظه‌ای شیر X</th>
                      <th className="p-2.5 font-mono text-center">شماره سند / حواله</th>
                      <th className="p-2.5 text-center">منبع سند</th>
                      <th className="p-2.5 text-center">راننده</th>
                      <th className="p-2.5 text-center">مسئول تایید</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 text-xs">
                    {filteredCustomerValveLedgers.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-slate-500 font-medium">
                          هیچ سند ثبتی یا بارنامه‌ای برای شیرآلات یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomerValveLedgers.map((tx, idx) => (
                        <tr
                          key={`cust-valve-ledger-${tx.id}-${idx}`}
                          className="hover:bg-slate-800/40 print:hover:bg-transparent transition-colors"
                        >
                          <td className="p-2.5 text-center font-mono text-slate-400 print:text-black">
                            {toPersianDigits(idx + 1)}
                          </td>
                          <td className="p-2.5 font-mono text-slate-300 print:text-black text-center" dir="ltr">
                            {toPersianDigits(tx.date)}{tx.time ? ` ${toPersianDigits(tx.time)}` : ''}
                          </td>
                          <td className="p-2.5 font-bold text-slate-100 print:text-black">
                            {tx.customer_name}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10.5px] print:text-[12px] font-bold border whitespace-nowrap shadow-2xs print:border-none print:shadow-none print:p-0 print:rounded-none ${
                                tx.direction === 'IN'
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 print:bg-transparent print:text-black'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-700/60 print:bg-transparent print:text-black'
                              }`}
                            >
                              {tx.direction === 'IN' ? 'ورود به انبار' : 'خروج از انبار'}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold text-amber-300 print:text-black">
                            {tx.valve_name}
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10.5px] print:text-[12px] font-bold border whitespace-nowrap shadow-2xs print:border-none print:shadow-none print:p-0 print:rounded-none ${
                                tx.valve_category === 'NEW'
                                  ? 'bg-transparent text-slate-100 border-slate-700 print:bg-transparent print:text-black'
                                  : 'bg-transparent text-amber-300 border-slate-700 print:bg-transparent print:text-black'
                              }`}
                            >
                              {tx.valve_category === 'NEW' ? 'شیر نو' : 'شیر کهنه/داغی'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-100 print:text-black">
                            <span className={tx.direction === 'IN' ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                              {tx.direction === 'IN' ? '+' : '-'}{toPersianDigits(tx.quantity)}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-black print:text-black bg-emerald-950/15 border-x border-emerald-900/30">
                            <span
                              className={`inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-md font-mono text-xs print:text-[12.5px] border print:border-none print:p-0 font-black ${
                                tx.running_balance !== undefined && tx.running_balance > 0
                                  ? 'text-emerald-300 bg-emerald-950/70 border-emerald-700/70'
                                  : tx.running_balance === 0
                                  ? 'text-slate-400 bg-slate-900 border-slate-800'
                                  : 'text-amber-300 bg-amber-950/70 border-amber-700/70'
                              }`}
                            >
                              {tx.running_balance !== undefined ? toPersianDigits(tx.running_balance) : '---'}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-indigo-300 font-bold print:text-black text-center" dir="ltr">
                            {toPersianDigits(tx.sheet_number || '---')}
                          </td>
                          <td className="p-2.5 text-slate-400 print:text-black text-center">
                            {tx.source_type}
                          </td>
                          <td className="p-2.5 text-slate-300 print:text-black text-center">
                            {tx.driver_name || '---'}
                          </td>
                          <td className="p-2.5 text-slate-300 print:text-black text-center">
                            {tx.verified_by || '---'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredCustomerValveLedgers.length > 0 && (
                    <tfoot className="bg-slate-950/90 print:bg-slate-200 font-bold border-t-2 border-slate-700 print:border-black">
                      <tr>
                        <td colSpan={6} className="p-3 text-slate-200 print:text-black">
                          مجموع کل گردش ورودی و خروجی شیرآلات:
                        </td>
                        <td className="p-3 text-center font-mono text-indigo-300 print:text-black font-bold">
                          {toPersianDigits(filteredCustomerValveLedgers.reduce((a, b) => a + b.quantity, 0))}
                        </td>
                        <td colSpan={5}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* Formal Signatures for Printed Reports - Clean without user names */}
        <div id="report-signatures-block" className="pt-6 border-t border-slate-800 print:border-black grid grid-cols-3 gap-4 text-center text-xs text-slate-400 print:text-black">
          <div className="space-y-4">
            <div>تنظیم‌کننده گزارش</div>
            <div className="text-[10px] text-slate-400 print:hidden font-semibold">{currentUser.full_name}</div>
            <div className="border-b border-dotted border-slate-600 print:border-black w-32 mx-auto pt-6"></div>
          </div>
          <div className="space-y-4">
            <div>تأیید انباردار مسئول</div>
            <div className="border-b border-dotted border-slate-600 print:border-black w-32 mx-auto pt-10"></div>
          </div>
          <div className="space-y-4">
            <div>{isFinancialMode ? 'مدیریت بازرگانی و مالی' : 'مدیریت عامل / عملیات کارخانه'}</div>
            <div className="border-b border-dotted border-slate-600 print:border-black w-32 mx-auto pt-10"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
