import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Invoice,
  Customer,
  Supplier,
  Product,
  Category,
  Warehouse,
  RuntimeEnvironment,
  User,
  StockMovement,
  GoodsReceiptRecord
} from '../types';
import { LocalStorageManager, LocalDatabaseState } from '../database/storage';
import { SEED_USERS } from '../database/seed-data';
import { printReceiptSheet } from '../utils/receiptPrint';
import { showToast } from '../utils/uiFeedback';
import { ReportsView } from './ReportsView';
import { readPersistedNavValue, savePersistedNavValue } from '../utils/navigationPersistence';
import {
  FileText,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  ShoppingCart,
  Calendar,
  X,
  Save,
  Check,
  Edit2,
  Trash2,
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
  Calculator,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Wallet,
  AlertCircle,
  Filter,
  Printer,
  Receipt,
  BookOpen,
  Users,
  Building2,
  Clock,
  Coins,
  Eye,
  Scale,
  RefreshCw,
  FileSpreadsheet,
  CheckCheck,
  HelpCircle,
  BadgeAlert
} from 'lucide-react';
import {
  formatCurrencyToman,
  formatPersianDateTime,
  toPersianDigits,
  generateUUID,
  getPersianDate,
  formatNumberFa
} from '../utils/persian';
import { numberToPersianWords } from '../utils/numberToPersianWords';
import { isSafeInput, sanitizeInput, sanitizeNumber, validateFieldSecurity } from '../utils/security';

export interface ExtendedInvoice extends Invoice {
  payment_method?: 'CASH' | 'CHEQUE' | 'CREDIT' | 'TRANSFER';
  paid_amount?: number;
  remaining_amount?: number;
  cheque_number?: string;
  cheque_due_date?: string;
  cheque_bank?: string;
  cheque_status?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  source_type?: 'WAREHOUSE_ENTRY' | 'DIRECT_MANUAL';
  source_receipt_id?: string;
  source_receipt_number?: string;
  source_movement_id?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  unit?: string;
  accounting_voucher_no?: string;
  accounting_status?: 'PRICED' | 'AWAITING_PRICE';
  accounting_notes?: string;
  priced_at?: string;
  priced_by?: string;
}

interface InvoicesViewProps {
  invoices: Invoice[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  categories?: Category[];
  warehouses: Warehouse[];
  stockMovements?: StockMovement[];
  stockQuantities?: Record<string, Record<string, number>>;
  users?: User[];
  currentEnv: RuntimeEnvironment;
  currentUser: User;
}

type AccountingTab = 'INVOICES' | 'LEDGER' | 'CHEQUES' | 'PROFIT_LOSS' | 'FINANCIAL_REPORTS';
const VALID_ACCOUNTING_TABS: readonly AccountingTab[] = [
  'INVOICES',
  'LEDGER',
  'CHEQUES',
  'PROFIT_LOSS',
  'FINANCIAL_REPORTS'
];

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices: initialInvoices,
  customers,
  suppliers,
  products,
  categories,
  warehouses,
  stockMovements,
  stockQuantities,
  users,
  currentEnv,
  currentUser
}) => {
  const allUsers = users && users.length > 0 ? users : SEED_USERS;

  // Active accounting sub-tab (persisted across page refresh)
  const [accountingTab, setAccountingTab] = useState<AccountingTab>(() =>
    readPersistedNavValue('invoices_sub_tab', VALID_ACCOUNTING_TABS, 'INVOICES')
  );

  useEffect(() => {
    savePersistedNavValue('invoices_sub_tab', accountingTab);
  }, [accountingTab]);

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'SALE' | 'PURCHASE' | 'AWAITING_PRICE' | 'CHEQUE' | 'UNSETTLED'>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('ALL');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ExtendedInvoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<ExtendedInvoice | null>(null);
  const [quickPaymentInvoice, setQuickPaymentInvoice] = useState<ExtendedInvoice | null>(null);
  const [printingInvoice, setPrintingInvoice] = useState<ExtendedInvoice | null>(null);

  // Edit form fields
  const [editUnitPrice, setEditUnitPrice] = useState<number>(0);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editTax, setEditTax] = useState<number>(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState<'CASH' | 'CHEQUE' | 'CREDIT' | 'TRANSFER'>('CREDIT');
  const [editPaidAmount, setEditPaidAmount] = useState<number>(0);
  const [editChequeNumber, setEditChequeNumber] = useState<string>('');
  const [editChequeDueDate, setEditChequeDueDate] = useState<string>('');
  const [editChequeBank, setEditChequeBank] = useState<string>('');
  const [editChequeStatus, setEditChequeStatus] = useState<'PENDING' | 'CLEARED' | 'BOUNCED'>('PENDING');
  const [editStatus, setEditStatus] = useState<string>('ISSUED');
  const [editNotes, setEditNotes] = useState('');
  const [editAccountingVoucher, setEditAccountingVoucher] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Quick Payment Modal form
  const [quickPayAmount, setQuickPayAmount] = useState<number>(0);
  const [quickPayMethod, setQuickPayMethod] = useState<'CASH' | 'TRANSFER' | 'CHEQUE'>('CASH');
  const [quickPayNotes, setQuickPayNotes] = useState<string>('');

  // New Invoice Form (for manually issuing direct invoices)
  const [invType, setInvType] = useState<'SALE' | 'PURCHASE'>('SALE');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.warehouse_id || '');
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.product_id || '');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemUnitPrice, setItemUnitPrice] = useState(products[0]?.sale_price || 100000);
  const [newInvPaymentMethod, setNewInvPaymentMethod] = useState<'CASH' | 'CHEQUE' | 'CREDIT' | 'TRANSFER'>('CASH');
  const [newInvPaidAmount, setNewInvPaidAmount] = useState<number>(0);
  const [newInvDiscount, setNewInvDiscount] = useState<number>(0);
  const [newInvTax, setNewInvTax] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Local synced list of all invoices
  const [allInvoices, setAllInvoices] = useState<ExtendedInvoice[]>(() => {
    const state = LocalStorageManager.getState(currentEnv);
    return (state.invoices as ExtendedInvoice[]) || (initialInvoices as ExtendedInvoice[]) || [];
  });

  /**
   * SILENT SYNC ROUTINE (بدون اعلان)
   * Automatically discovers warehouse entries (Goods Entry Receipts and Stock In movements)
   * created by the warehouse keeper (or anyone) and converts them into purchase invoice drafts
   * in this menu, waiting for the accountant/manager to enter the purchase amount.
   */
  const syncWarehouseEntriesSilently = useCallback(() => {
    const state = LocalStorageManager.getState(currentEnv);
    if (!state) return;

    if (
      state.is_purged &&
      (!state.goods_receipts || state.goods_receipts.length === 0) &&
      (!state.stock_movements || state.stock_movements.length === 0) &&
      (!state.invoices || state.invoices.length === 0)
    ) {
      setAllInvoices([]);
      return;
    }

    let changed = false;
    const currentList: ExtendedInvoice[] = [...((state.invoices as ExtendedInvoice[]) || [])];

    // 1. Ingest Goods Entry Receipts (برگه ورود کالا به انبار)
    const goodsReceipts = state.goods_receipts || [];
    for (const receipt of goodsReceipts) {
      if (receipt.receipt_type !== 'ENTRY') continue;

      // Check if this receipt is already represented in invoices
      const exists = currentList.some(inv =>
        inv.source_receipt_id === receipt.receipt_id ||
        inv.source_receipt_number === receipt.form_number ||
        inv.invoice_number === `PUR-${receipt.form_number}` ||
        inv.invoice_number === `FA-IN-${receipt.form_number}`
      );

      if (!exists) {
        // Construct silent purchase invoice
        const receiptItems = receipt.items || [];
        const firstItem = receiptItems[0];
        const totalQty = receiptItems.reduce((acc, itm) => acc + (Number(itm.quantity) || 0), 0) || 1;
        const matchedProduct = firstItem
          ? state.products?.find(p => p.name.trim() === (firstItem.itemDescription || '').trim())
          : undefined;

        // Default unit purchase price from product catalog if available, or 0 (awaiting price)
        const unitPurchasePrice = matchedProduct?.purchase_price || 0;
        const totalAmount = unitPurchasePrice * totalQty;

        const partyName = receipt.party_name || receipt.customer_name || 'تأمین‌کننده / انبارداری';
        const matchedSupplier = state.suppliers?.find(s =>
          s.name.trim() === partyName.trim() || s.company_name?.trim() === partyName.trim()
        );

        const newPurInvoice: ExtendedInvoice = {
          invoice_id: generateUUID('INV-PUR'),
          invoice_number: `PUR-${receipt.form_number}`,
          invoice_type: 'PURCHASE',
          supplier_id: matchedSupplier?.supplier_id || receipt.customer_id || 'SUP-MGAS-BRANCH',
          party_name: partyName,
          warehouse_id: state.warehouses?.[0]?.warehouse_id || 'WH-001',
          product_id: matchedProduct?.product_id,
          product_name: receiptItems.length > 1
            ? `${receiptItems.map(i => `${i.itemDescription} (${i.quantity})`).slice(0, 2).join('، ')} +${receiptItems.length - 2} قلم دیگر`
            : firstItem?.itemDescription || 'اقلام وارده به انبار',
          quantity: totalQty,
          unit_price: unitPurchasePrice,
          total_amount: totalAmount,
          tax_amount: 0,
          discount_amount: 0,
          final_amount: totalAmount,
          paid_amount: 0,
          remaining_amount: totalAmount,
          payment_method: 'CREDIT',
          status: 'ISSUED',
          accounting_status: unitPurchasePrice > 0 ? 'PRICED' : 'AWAITING_PRICE',
          source_type: 'WAREHOUSE_ENTRY',
          source_receipt_id: receipt.receipt_id,
          source_receipt_number: receipt.form_number,
          user_id: receipt.user_id || currentUser.user_id,
          created_by_username: receipt.created_by_username || 'انباردار',
          due_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
          notes: `ورود خودکار از برگه ورود کالا شماره ${receipt.form_number} (انباردار: ${receipt.created_by_username || 'حاجی‌وند'})`,
          created_at: receipt.date || receipt.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        currentList.unshift(newPurInvoice);
        changed = true;
      }
    }

    // 2. Ingest Direct Warehouse Stock In Movements (ورودی‌های مستقیم انبار)
    const stockMovements = state.stock_movements || [];
    for (const mov of stockMovements) {
      if (mov.movement_type !== 'STOCK_IN') continue;
      // Skip if generated from existing invoice or already tracked
      if (mov.reference_id?.startsWith('PUR-') || mov.reference_id?.startsWith('FA-')) continue;
      if (mov.movement_id.startsWith('MOV-RCP-')) continue; // already handled by receipt

      const exists = currentList.some(inv =>
        inv.source_movement_id === mov.movement_id ||
        (mov.reference_id && inv.source_receipt_number === mov.reference_id)
      );

      if (!exists) {
        const prod = state.products?.find(p => p.product_id === mov.product_id);
        const qty = Number(mov.quantity) || 1;
        const unitPrice = mov.unit_price || prod?.purchase_price || 0;
        const total = unitPrice * qty;

        const partyName = mov.customer_name || 'تأمین‌کننده ام‌گاز';
        const matchedSup = state.suppliers?.find(s => s.name.trim() === partyName.trim() || s.supplier_id === mov.customer_id);

        const newMovInvoice: ExtendedInvoice = {
          invoice_id: generateUUID('INV-PUR'),
          invoice_number: `PUR-IN-${mov.reference_id || mov.movement_id.slice(-6)}`,
          invoice_type: 'PURCHASE',
          supplier_id: matchedSup?.supplier_id || mov.customer_id || 'SUP-MGAS-BRANCH',
          party_name: partyName,
          warehouse_id: mov.warehouse_id,
          product_id: mov.product_id,
          product_name: prod?.name || 'کالای ورودی انبار',
          quantity: qty,
          unit_price: unitPrice,
          total_amount: total,
          tax_amount: 0,
          discount_amount: 0,
          final_amount: total,
          paid_amount: 0,
          remaining_amount: total,
          payment_method: 'CREDIT',
          status: 'ISSUED',
          accounting_status: unitPrice > 0 ? 'PRICED' : 'AWAITING_PRICE',
          source_type: 'WAREHOUSE_ENTRY',
          source_movement_id: mov.movement_id,
          source_receipt_number: mov.reference_id,
          user_id: mov.user_id || currentUser.user_id,
          created_by_username: mov.created_by_username || 'انباردار',
          due_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
          notes: `ورود مستقیم به انبار بابت سند ${mov.document_number || mov.reference_id || mov.movement_id}`,
          created_at: mov.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        currentList.unshift(newMovInvoice);
        changed = true;
      }
    }

    if (changed) {
      state.invoices = currentList as Invoice[];
      LocalStorageManager.saveState(currentEnv, state);
      setAllInvoices(currentList);
    } else {
      // Just refresh local view in case of updates
      setAllInvoices((state.invoices as ExtendedInvoice[]) || []);
    }
  }, [currentEnv, currentUser]);

  // Initial and reactive silent synchronization on mount and events
  useEffect(() => {
    syncWarehouseEntriesSilently();

    const handleSyncEvent = () => {
      syncWarehouseEntriesSilently();
    };
    const handleDatabasePurged = () => {
      setAllInvoices([]);
    };

    const unsub = LocalStorageManager.subscribe(handleSyncEvent);
    window.addEventListener('mgas:inventory_updated', handleSyncEvent);
    window.addEventListener('mgas:stock_movement_added', handleSyncEvent);
    window.addEventListener('mgas:stock_movement_created', handleSyncEvent);
    window.addEventListener('mgas:goods_receipt_created', handleSyncEvent);
    window.addEventListener('mgas:db_refreshed', handleSyncEvent);
    window.addEventListener('mgas:database_purged', handleDatabasePurged);

    // Fast background check interval (2.5s) to guarantee instant silent updates
    const timer = setInterval(() => {
      syncWarehouseEntriesSilently();
    }, 2500);

    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener('mgas:inventory_updated', handleSyncEvent);
      window.removeEventListener('mgas:stock_movement_added', handleSyncEvent);
      window.removeEventListener('mgas:stock_movement_created', handleSyncEvent);
      window.removeEventListener('mgas:goods_receipt_created', handleSyncEvent);
      window.removeEventListener('mgas:db_refreshed', handleSyncEvent);
      window.removeEventListener('mgas:database_purged', handleDatabasePurged);
    };
  }, [syncWarehouseEntriesSilently]);

  // Global Escape key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setEditingInvoice(null);
        setDeletingInvoice(null);
        setQuickPaymentInvoice(null);
        setPrintingInvoice(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered Invoices
  const filtered = useMemo(() => {
    return allInvoices.filter(i => {
      // Search
      const searchLower = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        i.invoice_number.toLowerCase().includes(searchLower) ||
        i.invoice_id.toLowerCase().includes(searchLower) ||
        (i.party_name && i.party_name.toLowerCase().includes(searchLower)) ||
        (i.product_name && i.product_name.toLowerCase().includes(searchLower)) ||
        (i.source_receipt_number && i.source_receipt_number.toLowerCase().includes(searchLower)) ||
        (i.notes && i.notes.toLowerCase().includes(searchLower));

      // Type & Accounting filter
      let matchType = true;
      if (typeFilter === 'SALE') matchType = i.invoice_type === 'SALE';
      else if (typeFilter === 'PURCHASE') matchType = i.invoice_type === 'PURCHASE';
      else if (typeFilter === 'AWAITING_PRICE') matchType = i.invoice_type === 'PURCHASE' && (!i.final_amount || i.final_amount === 0 || i.accounting_status === 'AWAITING_PRICE');
      else if (typeFilter === 'CHEQUE') matchType = i.payment_method === 'CHEQUE' || Boolean(i.cheque_number);
      else if (typeFilter === 'UNSETTLED') matchType = i.status !== 'PAID' && (i.remaining_amount ? i.remaining_amount > 0 : i.final_amount > 0);

      // Date Range filter
      let matchDate = true;
      if (dateRangeFilter === 'TODAY') {
        const todayStr = getPersianDate();
        const docDate = getPersianDate(i.created_at);
        matchDate = docDate === todayStr;
      } else if (dateRangeFilter === 'MONTH') {
        const todayStr = getPersianDate();
        const currentMonth = todayStr.slice(0, 7); // e.g. 1405/08
        const docDate = getPersianDate(i.created_at);
        matchDate = docDate.startsWith(currentMonth);
      }

      return matchSearch && matchType && matchDate;
    });
  }, [allInvoices, searchTerm, typeFilter, dateRangeFilter]);

  // Accounting Summary Totals
  const accountingSummary = useMemo(() => {
    let totalPurchases = 0;
    let totalSales = 0;
    let awaitingPriceCount = 0;
    let totalPayables = 0;   // دیون به تامین‌کنندگان
    let totalReceivables = 0; // مطالبات از مشتریان
    let totalChequesAmount = 0;
    let pendingChequesCount = 0;

    allInvoices.forEach(inv => {
      const isSale = inv.invoice_type === 'SALE';
      const finalAmt = Number(inv.final_amount) || 0;
      const paidAmt = Number(inv.paid_amount) || (inv.status === 'PAID' ? finalAmt : 0);
      const remaining = Math.max(0, finalAmt - paidAmt);

      if (isSale) {
        totalSales += finalAmt;
        if (inv.status !== 'PAID') {
          totalReceivables += remaining;
        }
      } else {
        totalPurchases += finalAmt;
        if (finalAmt === 0 || inv.accounting_status === 'AWAITING_PRICE') {
          awaitingPriceCount++;
        }
        if (inv.status !== 'PAID') {
          totalPayables += remaining;
        }
      }

      if (inv.payment_method === 'CHEQUE' || inv.cheque_number) {
        totalChequesAmount += finalAmt;
        if (inv.cheque_status === 'PENDING' || inv.status !== 'PAID') {
          pendingChequesCount++;
        }
      }
    });

    const grossProfit = totalSales - totalPurchases;
    const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0';

    return {
      totalPurchases,
      totalSales,
      grossProfit,
      profitMargin,
      awaitingPriceCount,
      totalPayables,
      totalReceivables,
      totalChequesAmount,
      pendingChequesCount
    };
  }, [allInvoices]);

  // Ledger summary by Party (دفتر معین اشخاص)
  const partyLedger = useMemo(() => {
    const map = new Map<string, {
      partyName: string;
      partyType: 'CUSTOMER' | 'SUPPLIER';
      invoicesCount: number;
      totalAmount: number;
      totalPaid: number;
      balance: number; // positive = we owe them (creditor), negative = they owe us (debtor)
      lastDate: string;
    }>();

    allInvoices.forEach(inv => {
      const isSale = inv.invoice_type === 'SALE';
      const party = inv.party_name || (isSale
        ? customers.find(c => c.customer_id === inv.customer_id)?.name || inv.customer_id || 'مشتری نامشخص'
        : suppliers.find(s => s.supplier_id === inv.supplier_id)?.name || inv.supplier_id || 'تأمین‌کننده نامشخص');

      const finalAmt = Number(inv.final_amount) || 0;
      const paidAmt = Number(inv.paid_amount) || (inv.status === 'PAID' ? finalAmt : 0);
      const remaining = Math.max(0, finalAmt - paidAmt);

      const existing = map.get(party);
      if (!existing) {
        map.set(party, {
          partyName: party,
          partyType: isSale ? 'CUSTOMER' : 'SUPPLIER',
          invoicesCount: 1,
          totalAmount: finalAmt,
          totalPaid: paidAmt,
          balance: isSale ? remaining : -remaining, // customers owe us (+), we owe suppliers (-)
          lastDate: inv.created_at
        });
      } else {
        existing.invoicesCount += 1;
        existing.totalAmount += finalAmt;
        existing.totalPaid += paidAmt;
        existing.balance += isSale ? remaining : -remaining;
        if (new Date(inv.created_at) > new Date(existing.lastDate)) {
          existing.lastDate = inv.created_at;
        }
      }
    });

    return Array.from(map.values());
  }, [allInvoices, customers, suppliers]);

  // Cheques Ledger (دفتر اسناد و چک‌ها)
  const chequesList = useMemo(() => {
    return allInvoices.filter(i => i.payment_method === 'CHEQUE' || Boolean(i.cheque_number));
  }, [allInvoices]);

  // Open Edit Modal for an Invoice
  const handleOpenEdit = (inv: ExtendedInvoice) => {
    setEditingInvoice(inv);
    const qty = Number(inv.quantity) || 1;
    const finalAmt = Number(inv.final_amount) || 0;
    const unitP = inv.unit_price || (qty > 0 && finalAmt > 0 ? Math.round(finalAmt / qty) : 0);

    setEditUnitPrice(unitP);
    setEditQuantity(qty);
    setEditDiscount(Number(inv.discount_amount) || 0);
    setEditTax(Number(inv.tax_amount) || 0);
    setEditPaymentMethod(inv.payment_method || (inv.invoice_type === 'PURCHASE' ? 'CREDIT' : 'CASH'));
    setEditPaidAmount(Number(inv.paid_amount) || (inv.status === 'PAID' ? finalAmt : 0));
    setEditChequeNumber(inv.cheque_number || '');
    setEditChequeDueDate(inv.cheque_due_date || getPersianDate());
    setEditChequeBank(inv.cheque_bank || '');
    setEditChequeStatus(inv.cheque_status || 'PENDING');
    setEditStatus(inv.status || 'ISSUED');
    setEditNotes(inv.notes || '');
    setEditAccountingVoucher(inv.accounting_voucher_no || '');
    setEditError(null);
  };

  // Real-time calculation in Edit Modal
  const editCalculatedGross = editQuantity * editUnitPrice;
  const editCalculatedFinal = Math.max(0, editCalculatedGross - editDiscount + editTax);
  const editCalculatedRemaining = Math.max(0, editCalculatedFinal - editPaidAmount);

  // Quick auto-tax toggle (10% standard VAT)
  const handleApplyTenPercentTax = () => {
    const calculated = Math.round((editCalculatedGross - editDiscount) * 0.1);
    setEditTax(calculated > 0 ? calculated : 0);
  };

  // Quick 100% Paid Settlement
  const handleSetFullSettlement = () => {
    setEditPaidAmount(editCalculatedFinal);
    setEditStatus('PAID');
  };

  // Quick 0% Unpaid
  const handleSetZeroPaid = () => {
    setEditPaidAmount(0);
    setEditStatus('ISSUED');
  };

  // Save Edit Invoice with strict accounting and security checks
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    if (editUnitPrice < 0) {
      setEditError('مبلغ قیمت واحد خرید/فروش نمی‌تواند منفی باشد.');
      return;
    }

    // Security validation on notes and accounting voucher
    const notesCheck = validateFieldSecurity(editNotes, 'یادداشت فاکتور', { maxLength: 500, allowMultiline: true });
    if (!notesCheck.isValid) {
      setEditError(notesCheck.error || 'خطای امنیتی در یادداشت فاکتور.');
      return;
    }

    const voucherCheck = validateFieldSecurity(editAccountingVoucher, 'شماره سند حسابداری', { maxLength: 100 });
    if (!voucherCheck.isValid) {
      setEditError(voucherCheck.error || 'شماره سند نامعتبر است.');
      return;
    }

    const finalAmount = sanitizeNumber(editCalculatedFinal, 0, 0, 1000000000000);
    const paidAmount = sanitizeNumber(editPaidAmount, 0, 0, finalAmount);
    const remainingAmount = Math.max(0, finalAmount - paidAmount);

    let finalStatus: 'ISSUED' | 'PAID' | 'CANCELLED' = editStatus as any;
    if (finalStatus !== 'CANCELLED') {
      if (paidAmount >= finalAmount && finalAmount > 0) {
        finalStatus = 'PAID';
      } else {
        finalStatus = 'ISSUED';
      }
    }

    const updatedData: Partial<ExtendedInvoice> = {
      unit_price: editUnitPrice,
      quantity: editQuantity,
      total_amount: editCalculatedGross,
      discount_amount: editDiscount,
      tax_amount: editTax,
      final_amount: finalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      payment_method: editPaymentMethod,
      cheque_number: editPaymentMethod === 'CHEQUE' ? editChequeNumber.trim() : undefined,
      cheque_due_date: editPaymentMethod === 'CHEQUE' ? editChequeDueDate.trim() : undefined,
      cheque_bank: editPaymentMethod === 'CHEQUE' ? editChequeBank.trim() : undefined,
      cheque_status: editPaymentMethod === 'CHEQUE' ? editChequeStatus : undefined,
      status: finalStatus,
      accounting_status: finalAmount > 0 ? 'PRICED' : 'AWAITING_PRICE',
      accounting_voucher_no: voucherCheck.cleanValue,
      accounting_notes: notesCheck.cleanValue,
      notes: notesCheck.cleanValue,
      priced_at: new Date().toISOString(),
      priced_by: currentUser.username,
      updated_at: new Date().toISOString()
    };

    const res = LocalStorageManager.updateInvoice(
      currentEnv,
      editingInvoice.invoice_id,
      updatedData as any,
      currentUser
    );

    if (res.success) {
      // Also update catalog purchase price if it's a purchase invoice with a matched product
      if (editingInvoice.invoice_type === 'PURCHASE' && editingInvoice.product_id && editUnitPrice > 0) {
        const state = LocalStorageManager.getState(currentEnv);
        const prod = state.products?.find(p => p.product_id === editingInvoice.product_id);
        if (prod) {
          prod.purchase_price = editUnitPrice;
          prod.updated_at = new Date().toISOString();
          LocalStorageManager.saveState(currentEnv, state);
        }
      }

      setEditingInvoice(null);
      setEditError(null);
      syncWarehouseEntriesSilently();
    } else {
      setEditError(res.error || 'خطا در ویرایش فاکتور');
    }
  };

  // Quick Payment Execution
  const handleOpenQuickPayment = (inv: ExtendedInvoice) => {
    setQuickPaymentInvoice(inv);
    const finalAmt = Number(inv.final_amount) || 0;
    const paidAmt = Number(inv.paid_amount) || 0;
    const remaining = Math.max(0, finalAmt - paidAmt);
    setQuickPayAmount(remaining);
    setQuickPayMethod('CASH');
    setQuickPayNotes(`تسویه مالی فاکتور ${inv.invoice_number}`);
  };

  const handleSaveQuickPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPaymentInvoice) return;

    const finalAmt = Number(quickPaymentInvoice.final_amount) || 0;
    const currentPaid = Number(quickPaymentInvoice.paid_amount) || 0;
    const newTotalPaid = Math.min(finalAmt, currentPaid + quickPayAmount);
    const newRemaining = Math.max(0, finalAmt - newTotalPaid);
    const newStatus = newRemaining === 0 ? 'PAID' : 'ISSUED';

    const updatedData: Partial<ExtendedInvoice> = {
      paid_amount: newTotalPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      payment_method: quickPayMethod,
      accounting_notes: `${quickPaymentInvoice.accounting_notes ? quickPaymentInvoice.accounting_notes + ' | ' : ''}ثبت پرداخت ${formatCurrencyToman(quickPayAmount)} (${quickPayMethod === 'CASH' ? 'نقدی' : quickPayMethod === 'TRANSFER' ? 'حواله' : 'چک'}) توسط ${currentUser.username}`,
      updated_at: new Date().toISOString()
    };

    const res = LocalStorageManager.updateInvoice(
      currentEnv,
      quickPaymentInvoice.invoice_id,
      updatedData as any,
      currentUser
    );

    if (res.success) {
      setQuickPaymentInvoice(null);
      syncWarehouseEntriesSilently();
      showToast('پرداخت فاکتور با موفقیت ثبت شد.', 'success');
    } else {
      showToast(res.error || 'خطا در ثبت پرداخت', 'error');
    }
  };

  // Delete Invoice
  const handleDeleteInvoice = (inv: ExtendedInvoice) => {
    setDeletingInvoice(inv);
  };

  const handleConfirmDeleteInvoice = () => {
    if (!deletingInvoice) return;
    const res = LocalStorageManager.deleteInvoice(currentEnv, deletingInvoice.invoice_id, currentUser);
    if (!res.success) {
      showToast(res.error || 'خطا در حذف فاکتور', 'error');
    } else {
      syncWarehouseEntriesSilently();
      showToast(`فاکتور ${deletingInvoice.invoice_number} با موفقیت حذف شد.`, 'info');
    }
    setDeletingInvoice(null);
  };

  // Create Direct New Invoice
  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find(p => p.product_id === selectedProduct);
    if (!prod) return;

    const notesCheck = validateFieldSecurity(invoiceNotes, 'توضیحات فاکتور', { maxLength: 500, allowMultiline: true });
    if (!notesCheck.isValid) {
      showToast(notesCheck.error || 'توضیحات فاکتور نامعتبر است.', 'error');
      return;
    }

    const invoiceId = generateUUID('INV');
    const invoiceNumber = `${invType === 'SALE' ? 'FA' : 'PUR'}-${Date.now().toString().slice(-6)}`;
    const grossTotal = itemQuantity * itemUnitPrice;
    const finalAmount = sanitizeNumber(grossTotal - newInvDiscount + newInvTax, 0, 0, 1000000000000);
    const paidAmount = sanitizeNumber(newInvPaidAmount, 0, 0, finalAmount);
    const remainingAmount = Math.max(0, finalAmount - paidAmount);

    const party = invType === 'SALE'
      ? customers.find(c => c.customer_id === partyId)?.name || 'مشتری'
      : suppliers.find(s => s.supplier_id === partyId)?.name || 'تأمین‌کننده';

    const newInvoice: ExtendedInvoice = {
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      invoice_type: invType,
      customer_id: invType === 'SALE' ? partyId || customers[0]?.customer_id : undefined,
      supplier_id: invType === 'PURCHASE' ? partyId || suppliers[0]?.supplier_id : undefined,
      party_name: party,
      warehouse_id: warehouseId,
      product_id: prod.product_id,
      product_name: prod.name,
      quantity: itemQuantity,
      unit_price: itemUnitPrice,
      total_amount: grossTotal,
      tax_amount: newInvTax,
      discount_amount: newInvDiscount,
      final_amount: finalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      payment_method: newInvPaymentMethod,
      status: remainingAmount === 0 ? 'PAID' : 'ISSUED',
      accounting_status: 'PRICED',
      due_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      notes: notesCheck.cleanValue,
      source_type: 'DIRECT_MANUAL',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. Record Invoice in Local Database & Sync Queue
    LocalStorageManager.recordLocalChange(
      currentEnv,
      currentUser.user_id,
      'INVOICE',
      'CREATE',
      invoiceId,
      newInvoice,
      `صدور فاکتور ${invType === 'SALE' ? 'فروش' : 'خرید'} شماره ${invoiceNumber}`,
      { invoice_number: invoiceNumber, total_amount: finalAmount }
    );

    // 2. Automatically generate corresponding Stock Movement
    const movId = generateUUID('MOV');
    const stockMov: StockMovement = {
      movement_id: movId,
      product_id: prod.product_id,
      warehouse_id: warehouseId,
      quantity: itemQuantity,
      movement_type: invType === 'SALE' ? 'STOCK_OUT' : 'STOCK_IN',
      reference_id: invoiceNumber,
      unit_price: itemUnitPrice,
      user_id: currentUser.user_id,
      created_by_username: currentUser.username,
      device_id: currentUser.allowed_device_id,
      event_id: generateUUID('EVT'),
      notes: `صدور خودکار حواله/رسید ناشی از فاکتور ${invoiceNumber}`,
      created_at: new Date().toISOString()
    };

    LocalStorageManager.recordLocalChange(
      currentEnv,
      currentUser.user_id,
      'STOCK_MOVEMENT',
      'CREATE',
      movId,
      stockMov,
      `گردش انبار بابت فاکتور ${invoiceNumber}`,
      { invoice_id: invoiceId, quantity: itemQuantity }
    );

    setShowAddModal(false);
    setInvoiceNotes('');
    setNewInvDiscount(0);
    setNewInvTax(0);
    setNewInvPaidAmount(0);
    syncWarehouseEntriesSilently();
  };

  return (
    <div className="space-y-6">

      {/* TOP HEADER & ACCOUNTING BANNER */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950/40 to-slate-900 p-4 sm:p-5 rounded-2xl border border-indigo-900/50 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Scale className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black text-white tracking-wide">
                سیستم حسابداری و مدیریت فاکتورهای خرید و فروش
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-900/60 text-indigo-200 border border-indigo-700/60 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-300" />
                <span>حسابداری کوچک اختصاصی ام‌گاز</span>
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              ثبت مبالغ خرید اختصاصی این منو است. با ورود کالا توسط انباردار، اقلام بدون اعلان در این جدول پدیدار شده و حسابداری می‌تواند مبالغ خرید، تسویه، مالیات و چک‌های مربوطه را مدیریت نماید.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => syncWarehouseEntriesSilently()}
              title="بررسی فوری و همگام‌سازی ورودی‌های انباردار"
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>بازخوانی ورودی‌های انبار</span>
            </button>

            <button
              onClick={() => {
                setInvType('SALE');
                setShowAddModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all active:scale-95 border border-indigo-400/40"
            >
              <Plus className="w-4 h-4" />
              <span>صدور فاکتور جدید</span>
            </button>
          </div>
        </div>

        {/* ACCOUNTING KPI CARDS (داشبورد مالی حسابداری) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-800/80">
          
          {/* 1. Total Purchases */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
                <span>کل خریدها</span>
              </span>
              <span className="text-[10px] text-blue-400 font-medium">بهای وارده</span>
            </div>
            <div className="font-mono font-black text-sm text-blue-300">
              {formatNumberFa(accountingSummary.totalPurchases)}
            </div>
            <div className="text-[10px] text-slate-400">تومان</div>
          </div>

          {/* 2. Total Sales */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>کل فروش‌ها</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">درآمد ناخالص</span>
            </div>
            <div className="font-mono font-black text-sm text-emerald-300">
              {formatNumberFa(accountingSummary.totalSales)}
            </div>
            <div className="text-[10px] text-slate-400">تومان</div>
          </div>

          {/* 3. Gross Profit / Difference */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                <span>سود ناخالص</span>
              </span>
              <span className={`text-[10px] font-bold ${Number(accountingSummary.grossProfit) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                %{accountingSummary.profitMargin}
              </span>
            </div>
            <div className={`font-mono font-black text-sm ${Number(accountingSummary.grossProfit) >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
              {formatNumberFa(accountingSummary.grossProfit)}
            </div>
            <div className="text-[10px] text-slate-400">تومان</div>
          </div>

          {/* 4. Accounts Payable (بدهی به تامین‌کنندگان) */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>بدهی به تأمین‌کننده</span>
              </span>
              <span className="text-[10px] text-amber-400 font-medium">بستانکاران</span>
            </div>
            <div className="font-mono font-black text-sm text-amber-300">
              {formatNumberFa(accountingSummary.totalPayables)}
            </div>
            <div className="text-[10px] text-slate-400">تومان</div>
          </div>

          {/* 5. Accounts Receivable (مطالبات از مشتریان) */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-teal-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-teal-400" />
                <span>مطالبات از مشتریان</span>
              </span>
              <span className="text-[10px] text-teal-400 font-medium">بدهکاران</span>
            </div>
            <div className="font-mono font-black text-sm text-teal-300">
              {formatNumberFa(accountingSummary.totalReceivables)}
            </div>
            <div className="text-[10px] text-slate-400">تومان</div>
          </div>

          {/* 6. Awaiting Purchase Price Entry Badge */}
          <div
            onClick={() => {
              setAccountingTab('INVOICES');
              setTypeFilter('AWAITING_PRICE');
            }}
            className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1 select-none active:scale-95 ${
              accountingSummary.awaitingPriceCount > 0
                ? 'bg-rose-950/50 border-rose-600/70 hover:bg-rose-900/40 animate-pulse'
                : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-300 text-[11px]">
              <span className="flex items-center gap-1">
                <BadgeAlert className={`w-3.5 h-3.5 ${accountingSummary.awaitingPriceCount > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                <span>نیازمند قیمت خرید</span>
              </span>
            </div>
            <div className={`font-mono font-black text-sm ${accountingSummary.awaitingPriceCount > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
              {toPersianDigits(accountingSummary.awaitingPriceCount)} قلم
            </div>
            <div className="text-[10px] text-slate-400">کلیک جهت قیمت‌گذاری</div>
          </div>

        </div>
      </div>

      {/* ACCOUNTING SUB-TABS NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setAccountingTab('INVOICES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            accountingTab === 'INVOICES'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>اسناد و فاکتورها (خرید و فروش)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/60 font-mono">
            {toPersianDigits(allInvoices.length)}
          </span>
        </button>

        <button
          onClick={() => setAccountingTab('LEDGER')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            accountingTab === 'LEDGER'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>دفتر معین اشخاص (مشتریان و تأمین‌کنندگان)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/60 font-mono">
            {toPersianDigits(partyLedger.length)}
          </span>
        </button>

        <button
          onClick={() => setAccountingTab('CHEQUES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            accountingTab === 'CHEQUES'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>دفتر اسناد و چک‌های صیادی</span>
          {accountingSummary.pendingChequesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
              {toPersianDigits(accountingSummary.pendingChequesCount)}
            </span>
          )}
        </button>

        <button
          onClick={() => setAccountingTab('PROFIT_LOSS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            accountingTab === 'PROFIT_LOSS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>تراز مالی و صورت سود و زیان کوچک</span>
        </button>

        <button
          type="button"
          onClick={() => setAccountingTab('FINANCIAL_REPORTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            accountingTab === 'FINANCIAL_REPORTS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>گزارش گیری مالی</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: INVOICES LIST & SEARCH */}
      {/* ========================================================================= */}
      {accountingTab === 'INVOICES' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="جستجو در شماره فاکتور، طرف حساب، شماره برگه انباردار..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">همه فاکتورها و اسناد</option>
                <option value="AWAITING_PRICE">⚠️ نیازمند درج مبلغ خرید</option>
                <option value="PURCHASE">اسناد خرید (ورودی‌های انبار)</option>
                <option value="SALE">فاکتورهای فروش</option>
                <option value="UNSETTLED">دارای مانده بدهی / تسویه نشده</option>
                <option value="CHEQUE">اسناد دارای چک صیادی</option>
              </select>

              {/* Date Filter */}
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">همه تاریخ‌ها</option>
                <option value="TODAY">امروز</option>
                <option value="MONTH">ماه جاری</option>
              </select>
            </div>
          </div>

          {/* Invoices List / Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-slate-300 font-bold text-xs">هیچ فاکتور یا سند خریدی با این مشخصات یافت نشد.</p>
                <p className="text-slate-500 text-[11px]">با ورود کالا توسط انباردار، اقلام به صورت خودکار در این جدول ظاهر خواهند شد.</p>
              </div>
            ) : (
              <>
                {/* Mobile View */}
                <div className="md:hidden divide-y divide-slate-800/60">
                  {filtered.map(inv => {
                    const isSale = inv.invoice_type === 'SALE';
                    const isAwaitingPrice = !isSale && (!inv.final_amount || inv.final_amount === 0 || inv.accounting_status === 'AWAITING_PRICE');
                    const paid = Number(inv.paid_amount) || (inv.status === 'PAID' ? inv.final_amount : 0);
                    const remaining = Math.max(0, (inv.final_amount || 0) - paid);

                    return (
                      <div key={inv.invoice_id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-indigo-300">
                              {inv.invoice_number}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${
                              isSale ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60' : 'bg-blue-950 text-blue-300 border-blue-800/60'
                            }`}>
                              {isSale ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                              <span>{isSale ? 'فروش' : 'خرید'}</span>
                            </span>
                          </div>

                          {isAwaitingPrice ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700/60 animate-pulse">
                              درج مبلغ خرید
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800/50'
                                : inv.status === 'CANCELLED'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                                : 'bg-amber-950 text-amber-300 border-amber-800/50'
                            }`}>
                              {inv.status === 'PAID' ? 'تسویه کامل' : inv.status === 'CANCELLED' ? 'لغو شده' : 'مانده بدهی'}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                          <span className="text-slate-400 font-normal">طرف حساب:</span>
                          <span>{inv.party_name || (isSale ? 'مشتری' : 'تأمین‌کننده')}</span>
                        </div>

                        <div className="text-xs text-slate-300 flex items-center justify-between">
                          <span className="text-slate-400">کالا / اقلام:</span>
                          <span className="truncate max-w-[200px]">{inv.product_name || 'کالای انبار'}</span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">مبلغ نهایی فاکتور:</span>
                          <span className="font-bold text-amber-400 font-mono text-sm">
                            {isAwaitingPrice ? '--- (ثبت نشده)' : `${formatNumberFa(inv.final_amount)} تومان`}
                          </span>
                        </div>

                        {remaining > 0 && !isAwaitingPrice && (
                          <div className="flex items-center justify-between text-xs text-rose-300">
                            <span>مانده تسویه نشده:</span>
                            <span className="font-mono font-bold">{formatNumberFa(remaining)} تومان</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                          <span>{formatPersianDateTime(inv.created_at)}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(inv)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 flex items-center gap-1 text-xs cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>{isAwaitingPrice ? 'درج مبلغ خرید' : 'ویرایش مبلغ'}</span>
                            </button>
                            {!isAwaitingPrice && remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenQuickPayment(inv)}
                                className="px-2 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 flex items-center gap-1 text-xs cursor-pointer"
                              >
                                <DollarSign className="w-3 h-3" />
                                <span>تسویه</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-xs min-w-[950px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="p-3">شماره سند / فاکتور</th>
                        <th className="p-3">نوع سند</th>
                        <th className="p-3">طرف حساب</th>
                        <th className="p-3">کالا و اقلام وارده/صادره</th>
                        <th className="p-3">تعداد</th>
                        <th className="p-3">مبلغ نهایی (تومان)</th>
                        <th className="p-3">وضعیت حسابداری و تسویه</th>
                        <th className="p-3">تاریخ سند</th>
                        <th className="p-3 text-center">عملیات حسابداری</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {filtered.map(inv => {
                        const isSale = inv.invoice_type === 'SALE';
                        const isAwaitingPrice = !isSale && (!inv.final_amount || inv.final_amount === 0 || inv.accounting_status === 'AWAITING_PRICE');
                        const paid = Number(inv.paid_amount) || (inv.status === 'PAID' ? inv.final_amount : 0);
                        const remaining = Math.max(0, (inv.final_amount || 0) - paid);

                        return (
                          <tr key={inv.invoice_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3">
                              <div className="font-mono font-bold text-indigo-300">
                                {inv.invoice_number}
                              </div>
                              {inv.source_receipt_number && (
                                <div className="text-[10px] text-slate-400">
                                  برگه ورود: {inv.source_receipt_number}
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${
                                isSale ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60' : 'bg-blue-950 text-blue-300 border-blue-800/60'
                              }`}>
                                {isSale ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                                <span>{isSale ? 'فاکتور فروش' : 'خرید (ورود انبار)'}</span>
                              </span>
                            </td>

                            <td className="p-3">
                              <div className="font-bold text-slate-100">
                                {inv.party_name || (isSale ? 'مشتری' : 'تأمین‌کننده')}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {inv.created_by_username ? `انباردار: @${inv.created_by_username}` : ''}
                              </div>
                            </td>

                            <td className="p-3 max-w-[220px]">
                              <div className="truncate font-medium text-slate-200" title={inv.product_name}>
                                {inv.product_name || 'کالای وارده'}
                              </div>
                              {inv.unit_price ? (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  فی: {formatNumberFa(inv.unit_price)} تومان
                                </div>
                              ) : null}
                            </td>

                            <td className="p-3 font-mono font-bold text-slate-200">
                              {inv.quantity ? formatNumberFa(inv.quantity) : '-'}
                            </td>

                            <td className="p-3">
                              {isAwaitingPrice ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-700/60 text-[11px] font-bold">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>در انتظار درج مبلغ خرید</span>
                                </span>
                              ) : (
                                <div>
                                  <div className="font-mono font-bold text-amber-300 text-sm">
                                    {formatNumberFa(inv.final_amount)}
                                  </div>
                                  {remaining > 0 ? (
                                    <div className="text-[10px] text-rose-400 font-mono">
                                      مانده: {formatNumberFa(remaining)} تومان
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                      <Check className="w-3 h-3" />
                                      <span>تسویه کامل</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              {isAwaitingPrice ? (
                                <button
                                  onClick={() => handleOpenEdit(inv)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow animate-bounce"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>درج مبلغ خرید</span>
                                </button>
                              ) : (
                                <div className="space-y-1">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${
                                    inv.status === 'PAID'
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800/50'
                                      : inv.status === 'CANCELLED'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                                      : 'bg-amber-950 text-amber-300 border-amber-800/50'
                                  }`}>
                                    {inv.status === 'PAID' ? 'تسویه کامل' : inv.status === 'CANCELLED' ? 'لغو شده' : 'مانده دار / نسیه'}
                                  </span>
                                  {inv.payment_method === 'CHEQUE' && (
                                    <div className="text-[10px] text-indigo-300 flex items-center gap-1">
                                      <CreditCard className="w-3 h-3" />
                                      <span>چک: {inv.cheque_number || 'صیادی'}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="p-3 text-[11px] text-slate-400 font-mono">
                              {formatPersianDateTime(inv.created_at)}
                            </td>

                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEdit(inv)}
                                  title="ویرایش و اعمال مبلغ خرید و شرایط مالی"
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isAwaitingPrice
                                      ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400'
                                      : 'bg-slate-800 hover:bg-indigo-600/40 text-slate-300 hover:text-indigo-200 border-slate-700'
                                  }`}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {!isAwaitingPrice && remaining > 0 && (
                                  <button
                                    onClick={() => handleOpenQuickPayment(inv)}
                                    title="ثبت تسویه و پرداخت وجه"
                                    className="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-700/50 transition-all cursor-pointer"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  onClick={() => setPrintingInvoice(inv)}
                                  title="مشاهده و چاپ سند فاکتور"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteInvoice(inv)}
                                  title="حذف سند"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 border border-slate-700 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LEDGER (دفتر معین اشخاص - مشتریان و تأمین‌کنندگان) */}
      {/* ========================================================================= */}
      {accountingTab === 'LEDGER' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span>دفتر معین طرف‌حساب‌ها (تأمین‌کنندگان مواد و مشتریان)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تراز حساب هر شخص با تفکیک کل اسناد وارده، مبالغ تسویه شده و مانده بدهکار یا بستانکار
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="p-3">نام طرف‌حساب</th>
                  <th className="p-3">نقش تجاری</th>
                  <th className="p-3">تعداد فاکتورها</th>
                  <th className="p-3">جمع کل گردش (تومان)</th>
                  <th className="p-3">کل پرداختی‌ها (تومان)</th>
                  <th className="p-3">تراز مانده نهایی (تومان)</th>
                  <th className="p-3">وضعیت حسابداری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {partyLedger.map(item => {
                  const isCustomer = item.partyType === 'CUSTOMER';
                  const absBalance = Math.abs(item.balance);
                  const isSettled = absBalance === 0;

                  return (
                    <tr key={item.partyName} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-100 flex items-center gap-2">
                        {isCustomer ? (
                          <Users className="w-4 h-4 text-teal-400" />
                        ) : (
                          <Building2 className="w-4 h-4 text-amber-400" />
                        )}
                        <span>{item.partyName}</span>
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isCustomer
                            ? 'bg-teal-950 text-teal-300 border-teal-800/60'
                            : 'bg-amber-950 text-amber-300 border-amber-800/60'
                        }`}>
                          {isCustomer ? 'مشتری' : 'تأمین‌کننده کالای انبار'}
                        </span>
                      </td>

                      <td className="p-3 font-mono font-bold">{toPersianDigits(item.invoicesCount)}</td>
                      <td className="p-3 font-mono font-bold text-slate-100">{formatNumberFa(item.totalAmount)}</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">{formatNumberFa(item.totalPaid)}</td>

                      <td className="p-3">
                        <div className={`font-mono font-black text-sm ${
                          isSettled
                            ? 'text-slate-400'
                            : item.balance > 0
                            ? 'text-teal-300'
                            : 'text-amber-300'
                        }`}>
                          {formatNumberFa(absBalance)}
                        </div>
                      </td>

                      <td className="p-3">
                        {isSettled ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                            تسویه شده (تراز صفر)
                          </span>
                        ) : item.balance > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 text-[10px]">
                            بدهکار به ما (طلبکاریم)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                            بستانکار از ما (بدهکاریم)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CHEQUES (دفتر اسناد و چک‌های صیادی) */}
      {/* ========================================================================= */}
      {accountingTab === 'CHEQUES' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-400" />
                <span>دفتر چک‌ها و اسناد دریافتنی/پرداختنی صیادی</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                پیگیری وضعیت و سررسید چک‌های ثبت شده در فاکتورها
              </p>
            </div>
          </div>

          {chequesList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              هیچ چکی در فاکتورها ثبت نشده است. هنگام ویرایش یا صدور فاکتور، روش پرداخت را بر روی «چک صیادی» قرار دهید.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="p-3">شماره فاکتور</th>
                    <th className="p-3">طرف حساب</th>
                    <th className="p-3">شماره صیادی ۱۶ رقمی</th>
                    <th className="p-3">بانک عامل</th>
                    <th className="p-3">سررسید چک</th>
                    <th className="p-3">مبلغ چک (تومان)</th>
                    <th className="p-3">وضعیت وصول</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {chequesList.map(inv => (
                    <tr key={inv.invoice_id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-indigo-300">{inv.invoice_number}</td>
                      <td className="p-3 font-bold text-slate-100">{inv.party_name || '-'}</td>
                      <td className="p-3 font-mono font-bold text-amber-300">{inv.cheque_number || 'ثبت نشده'}</td>
                      <td className="p-3">{inv.cheque_bank || 'بانک مرکزی'}</td>
                      <td className="p-3 font-mono text-slate-300">{inv.cheque_due_date || '-'}</td>
                      <td className="p-3 font-mono font-black text-emerald-400 text-sm">
                        {formatNumberFa(inv.final_amount)}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          inv.cheque_status === 'CLEARED'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : inv.cheque_status === 'BOUNCED'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}>
                          {inv.cheque_status === 'CLEARED' ? 'وصول شده' : inv.cheque_status === 'BOUNCED' ? 'برگشتی' : 'در جریان وصول'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleOpenEdit(inv)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 text-xs font-bold"
                        >
                          تغییر وضعیت
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PROFIT & LOSS / BALANCE (تراز مالی و صورت سود و زیان کوچک) */}
      {/* ========================================================================= */}
      {accountingTab === 'PROFIT_LOSS' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-5 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                <span>صورت سود و زیان و تراز عملیاتی کوچک ام‌گاز</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                گزارش عملکرد مالی مبتنی بر اسناد ورودی انبار و فاکتورهای فروش صادر شده
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income Statement Table */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="font-bold text-xs text-indigo-300 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Receipt className="w-4 h-4" />
                <span>صورت عملکرد درآمدها و هزینه‌های خرید</span>
              </h4>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-300">درآمدهای ناخالص حاصل از فروش:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatCurrencyToman(accountingSummary.totalSales)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-300">بهای تمام شده کالای خریداری شده (ورود به انبار):</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    {formatCurrencyToman(accountingSummary.totalPurchases)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40">
                  <span className="font-bold text-white">سود / اختلاف ناخالص عملیاتی:</span>
                  <span className={`font-mono font-black text-base ${Number(accountingSummary.grossProfit) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrencyToman(accountingSummary.grossProfit)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 pt-1">
                  حاشیه سود ناخالص: <strong className="text-white font-mono">%{accountingSummary.profitMargin}</strong>
                </div>
              </div>
            </div>

            {/* Balance & Working Capital Table */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="font-bold text-xs text-amber-300 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Wallet className="w-4 h-4" />
                <span>تراز مطالبات و تعهدات نقدی</span>
              </h4>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-300">کل مطالبات سررسید شده از مشتریان (بدهکاران):</span>
                  <span className="font-mono font-bold text-teal-400 text-sm">
                    {formatCurrencyToman(accountingSummary.totalReceivables)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-300">کل دیون و بدهی به تأمین‌کنندگان (بستانکاران):</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {formatCurrencyToman(accountingSummary.totalPayables)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="font-bold text-slate-200">چک‌های در جریان وصول:</span>
                  <span className="font-mono font-bold text-indigo-300">
                    {formatCurrencyToman(accountingSummary.totalChequesAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="font-bold text-slate-200">خالص نقدینگی در جریان (طلب - بدهی):</span>
                  <span className={`font-mono font-black text-sm ${accountingSummary.totalReceivables - accountingSummary.totalPayables >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrencyToman(accountingSummary.totalReceivables - accountingSummary.totalPayables)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FINANCIAL REPORTS (گزارش گیری مالی - کلیه گزارش‌های دارای مبلغ) */}
      {/* ========================================================================= */}
      {accountingTab === 'FINANCIAL_REPORTS' && (
        <ReportsView
          variant="financial"
          products={products}
          categories={categories ?? LocalStorageManager.getState(currentEnv)?.categories ?? []}
          warehouses={warehouses}
          stockMovements={stockMovements ?? LocalStorageManager.getState(currentEnv)?.stock_movements ?? []}
          stockQuantities={stockQuantities ?? LocalStorageManager.getStockQuantities(currentEnv)}
          currentEnv={currentEnv}
          currentUser={currentUser}
          customers={customers}
          suppliers={suppliers}
        />
      )}

      {/* ========================================================================= */}
      {/* EDIT INVOICE / PURCHASE PRICE ENTRY MODAL (اختصاصی ورود مبلغ خرید در این منو) */}
      {/* ========================================================================= */}
      {editingInvoice && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-slate-900 border border-indigo-800/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden cursor-default my-8"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-950 via-indigo-950/60 to-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/40">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>
                      {editingInvoice.invoice_type === 'PURCHASE'
                        ? 'ثبت و اعمال مبلغ خرید (سیستم حسابداری)'
                        : 'ویرایش سند مالی فاکتور'}
                    </span>
                    <span className="font-mono font-bold text-indigo-300">
                      [{editingInvoice.invoice_number}]
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    طرف حساب: {editingInvoice.party_name || 'تأمین‌کننده / مشتری'} | تاریخ ورود: {formatPersianDateTime(editingInvoice.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingInvoice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveEdit} className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Origin Notice */}
              {editingInvoice.source_type === 'WAREHOUSE_ENTRY' && (
                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/50 text-[11px] text-blue-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownLeft className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>
                      این قلم توسط انباردار وارد شده است ({editingInvoice.product_name}). اکنون مبلغ خرید و شرایط حسابداری را ثبت نمایید.
                    </span>
                  </div>
                  {editingInvoice.source_receipt_number && (
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-blue-900/60 border border-blue-700">
                      برگه {editingInvoice.source_receipt_number}
                    </span>
                  )}
                </div>
              )}

              {/* Primary Pricing Fields (میزان مبلغ خرید) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-indigo-300 flex items-center justify-between">
                  <span>محاسبه بهای خرید و اقلام (تومان)</span>
                  <span className="text-[11px] text-slate-400">
                    تعداد وارده: <strong className="text-white font-mono">{toPersianDigits(editQuantity)}</strong> عدد
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {editingInvoice.invoice_type === 'PURCHASE' ? 'قیمت خرید واحد (تومان)' : 'قیمت فروش واحد (تومان)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editUnitPrice === 0 ? '' : editUnitPrice}
                      onChange={(e) => setEditUnitPrice(Number(e.target.value) || 0)}
                      placeholder="مثال: ۵۰۰۰۰۰"
                      className="w-full p-2.5 bg-slate-900 border border-indigo-700/60 rounded-xl text-slate-100 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {formatNumberFa(editUnitPrice)} تومان
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">تعداد وارده / اقلام</label>
                    <input
                      type="number"
                      min={1}
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">تخفیف نقدی / تجاری (تومان)</label>
                    <input
                      type="number"
                      min={0}
                      value={editDiscount === 0 ? '' : editDiscount}
                      onChange={(e) => setEditDiscount(Number(e.target.value) || 0)}
                      placeholder="۰"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">مالیات بر ارزش افزوده (تومان)</label>
                      <button
                        type="button"
                        onClick={handleApplyTenPercentTax}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                      >
                        محاسبه خودکار ۱۰٪
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={editTax === 0 ? '' : editTax}
                      onChange={(e) => setEditTax(Number(e.target.value) || 0)}
                      placeholder="۰"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Final Calculated Amount Badge */}
                <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-700/60 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-[11px] text-indigo-300 font-medium">مبلغ نهایی و قطعی فاکتور خرید:</div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      به حروف: <strong className="text-amber-300">{numberToPersianWords(editCalculatedFinal)}</strong> تومان
                    </div>
                  </div>
                  <div className="text-lg font-black font-mono text-emerald-400">
                    {formatNumberFa(editCalculatedFinal)} تومان
                  </div>
                </div>
              </div>

              {/* Settlement and Payment Method */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                  <span>شرایط تسویه و نحوه پرداخت</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSetFullSettlement}
                      className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border border-emerald-700 text-[10px] font-bold cursor-pointer"
                    >
                      تسویه کامل (۱۰۰٪)
                    </button>
                    <button
                      type="button"
                      onClick={handleSetZeroPaid}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 text-[10px] font-bold cursor-pointer"
                    >
                      تسویه نشده (نسیه)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">روش تسویه / پرداخت</label>
                    <select
                      value={editPaymentMethod}
                      onChange={(e) => setEditPaymentMethod(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="CREDIT">نسیه / حساب باز (در انتظار پرداخت)</option>
                      <option value="CASH">نقدی / کارت‌خوان</option>
                      <option value="TRANSFER">حواله پایا / ساتنا / انتقال بانکی</option>
                      <option value="CHEQUE">چک صیادی مدت‌دار</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">مبلغ پرداخت شده (تومان)</label>
                    <input
                      type="number"
                      min={0}
                      max={editCalculatedFinal}
                      value={editPaidAmount === 0 ? '' : editPaidAmount}
                      onChange={(e) => setEditPaidAmount(Number(e.target.value) || 0)}
                      placeholder="۰"
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Remaining debt display */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <span className="text-slate-400">مانده بدهی / بستانکاری:</span>
                  <span className={`font-mono font-bold ${editCalculatedRemaining > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {editCalculatedRemaining > 0 ? `${formatNumberFa(editCalculatedRemaining)} تومان (تسویه نشده)` : 'تسویه کامل'}
                  </span>
                </div>

                {/* Cheque Specific Fields */}
                {editPaymentMethod === 'CHEQUE' && (
                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
                    <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      <span>مشخصات چک صیادی</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">شماره صیادی ۱۶ رقمی</label>
                        <input
                          type="text"
                          maxLength={16}
                          value={editChequeNumber}
                          onChange={(e) => setEditChequeNumber(e.target.value)}
                          placeholder="مثال: ۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶"
                          className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">نام بانک صادرکننده</label>
                        <input
                          type="text"
                          value={editChequeBank}
                          onChange={(e) => setEditChequeBank(e.target.value)}
                          placeholder="مثال: بانک ملت، سپه..."
                          className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">تاریخ سررسید چک</label>
                        <input
                          type="text"
                          value={editChequeDueDate}
                          onChange={(e) => setEditChequeDueDate(e.target.value)}
                          placeholder="1405/09/20"
                          className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accounting Voucher & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">شماره سند معین / عطف حسابداری</label>
                  <input
                    type="text"
                    value={editAccountingVoucher}
                    onChange={(e) => setEditAccountingVoucher(e.target.value)}
                    placeholder="مثال: SANAD-1405-88"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">وضعیت کلی سند</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ISSUED">صادر شده (جاری)</option>
                    <option value="PAID">تسویه شده کامل</option>
                    <option value="CANCELLED">ابطال / لغو سند</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">توضیحات و یادداشت حسابداری</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  placeholder="شرح ثبت حسابداری، مرکز هزینه، جزئیات توافق با طرف حساب..."
                />
              </div>

              {/* Action Buttons */}
              <div className="p-3 border-t border-slate-800 flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>ذخیره مبلغ خرید و تایید حسابداری</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK PAYMENT / SETTLEMENT MODAL */}
      {/* ========================================================================= */}
      {quickPaymentInvoice && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            className="bg-slate-900 border border-emerald-800/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden cursor-default"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <DollarSign className="w-5 h-5" />
                <span>ثبت پرداخت و تسویه: {quickPaymentInvoice.invoice_number}</span>
              </div>
              <button onClick={() => setQuickPaymentInvoice(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPayment} className="p-4 space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">طرف حساب:</span>
                  <span className="font-bold text-white">{quickPaymentInvoice.party_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">مبلغ کل فاکتور:</span>
                  <span className="font-mono font-bold text-amber-300">{formatCurrencyToman(quickPaymentInvoice.final_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">پرداختی تاکنون:</span>
                  <span className="font-mono font-bold text-slate-300">{formatCurrencyToman(quickPaymentInvoice.paid_amount || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1 text-rose-300">
                  <span>مانده فعلی:</span>
                  <span className="font-mono font-bold">{formatCurrencyToman(quickPaymentInvoice.remaining_amount || quickPaymentInvoice.final_amount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">مبلغ پرداختی این نوبت (تومان)</label>
                <input
                  type="number"
                  min={1}
                  value={quickPayAmount}
                  onChange={(e) => setQuickPayAmount(Number(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">روش پرداخت</label>
                <select
                  value={quickPayMethod}
                  onChange={(e) => setQuickPayMethod(e.target.value as any)}
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="CASH">نقدی</option>
                  <option value="TRANSFER">حواله بانکی پایا / ساتنا</option>
                  <option value="CHEQUE">چک صیادی</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">توضیحات پرداخت</label>
                <input
                  type="text"
                  value={quickPayNotes}
                  onChange={(e) => setQuickPayNotes(e.target.value)}
                  placeholder="شماره پیگیری فیش..."
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 border-t border-slate-800 flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setQuickPaymentInvoice(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-700/30"
                >
                  تأیید و ثبت پرداخت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINTING INVOICE MODAL */}
      {/* ========================================================================= */}
      {printingInvoice && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setPrintingInvoice(null)}
        >
          <div
            className="bg-white text-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-5 cursor-default my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="invoice-print-sheet" className="space-y-5 bg-white text-slate-900 p-2" dir="rtl">
              {/* Print Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">شرکت تولیدی و صنعتی ام‌گاز</h2>
                  <p className="text-xs text-slate-600">
                    {printingInvoice.invoice_type === 'SALE' ? 'فاکتور رسمی فروش کالا و خدمات' : 'سند قطعی خرید و ورود به انبار'}
                  </p>
                </div>
                <div className="text-left font-mono text-xs space-y-1">
                  <div>شماره سند: <strong className="text-sm font-black">{printingInvoice.invoice_number}</strong></div>
                  <div>تاریخ: {getPersianDate(printingInvoice.created_at)}</div>
                </div>
              </div>

              {/* Parties info */}
              <div className="grid grid-cols-2 gap-4 text-xs p-3 bg-slate-100 rounded-xl">
                <div>
                  <span className="text-slate-500">طرف حساب: </span>
                  <strong className="text-slate-900 font-bold">{printingInvoice.party_name || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">روش تسویه: </span>
                  <strong className="text-slate-900 font-bold">
                    {printingInvoice.payment_method === 'CASH' ? 'نقدی' : printingInvoice.payment_method === 'CHEQUE' ? 'چک صیادی' : 'نسیه / حساب باز'}
                  </strong>
                </div>
              </div>

              {/* Table */}
              <table className="w-full text-right text-xs border border-slate-300 receipt-print-table">
                <thead className="bg-slate-200 border-b border-slate-300 font-bold">
                  <tr>
                    <th className="p-2">شرح کالا / قلم</th>
                    <th className="p-2">تعداد</th>
                    <th className="p-2">قیمت واحد (تومان)</th>
                    <th className="p-2">جمع کل (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="p-2 font-bold">{printingInvoice.product_name || 'کالای انبار'}</td>
                    <td className="p-2 font-mono">{formatNumberFa(printingInvoice.quantity || 1)}</td>
                    <td className="p-2 font-mono">{formatNumberFa(printingInvoice.unit_price || 0)}</td>
                    <td className="p-2 font-mono font-bold">{formatNumberFa(printingInvoice.total_amount || 0)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Totals & Signatures */}
              <div className="flex justify-between items-end pt-2 text-xs">
                <div className="space-y-1 text-slate-600">
                  <div>مبلغ نهایی به حروف: <strong>{numberToPersianWords(printingInvoice.final_amount)}</strong> تومان</div>
                  {printingInvoice.remaining_amount ? (
                    <div>مانده تسویه نشده: <strong className="text-rose-600 font-mono">{formatNumberFa(printingInvoice.remaining_amount)}</strong> تومان</div>
                  ) : (
                    <div className="text-emerald-700 font-bold">تسویه شده کامل</div>
                  )}
                </div>
                <div className="text-left font-mono font-black text-base text-slate-900">
                  مبلغ کل: {formatNumberFa(printingInvoice.final_amount)} تومان
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs text-slate-700 border-t border-slate-300">
                <div>امضای انباردار</div>
                <div>امضای مسئول حسابداری</div>
                <div>تأیید مدیریت ارشد</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 no-print">
              <button
                type="button"
                onClick={() => setPrintingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={() =>
                  printReceiptSheet({
                    elementId: 'invoice-print-sheet',
                    title: `سند فاکتور ${printingInvoice.invoice_number} - ام‌گاز`,
                    paperSize: 'A4',
                    orientation: 'portrait'
                  })
                }
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>پرینت سند</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE INVOICE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {deletingInvoice && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setDeletingInvoice(null)}
        >
          <div
            className="bg-slate-900 border border-rose-800/80 rounded-2xl w-full max-w-md shadow-2xl p-5 text-right space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <span>حذف سند فاکتور</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              آیا از حذف فاکتور شماره <strong className="text-white font-mono">{deletingInvoice.invoice_number}</strong> اطمینان دارید؟ این تغییر در سیستم‌های دیگر نیز همگام‌سازی خواهد شد.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteInvoice}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-900/40 cursor-pointer"
              >
                حذف فاکتور
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIRECT INVOICE CREATION MODAL */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden cursor-default my-8"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>صدور فاکتور جدید و اعمال خودکار بر انبار</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">نوع فاکتور</label>
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value as any)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="SALE">فاکتور فروش به مشتری (کسر از انبار)</option>
                    <option value="PURCHASE">فاکتور خرید از تأمین‌کننده (ورود به انبار)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {invType === 'SALE' ? 'انتخاب مشتری' : 'انتخاب تأمین‌کننده'}
                  </label>
                  <select
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {invType === 'SALE'
                      ? customers.map(c => (
                          <option key={c.customer_id} value={c.customer_id}>
                            {c.name} {c.company_name ? `(${c.company_name})` : ''}
                          </option>
                        ))
                      : suppliers.map(s => (
                          <option key={s.supplier_id} value={s.supplier_id}>
                            {s.name}
                          </option>
                        ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">انبار درگیر</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.warehouse_id} value={w.warehouse_id}>
                        {w.name} {w.shelf_location ? `(قفسه ${w.shelf_location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">کالای انتخابی</label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => {
                      setSelectedProduct(e.target.value);
                      const prod = products.find(p => p.product_id === e.target.value);
                      if (prod) {
                        setItemUnitPrice(invType === 'SALE' ? prod.sale_price : prod.purchase_price);
                      }
                    }}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">تعداد / مقدار</label>
                  <input
                    type="number"
                    min={1}
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(Number(e.target.value))}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">قیمت واحد (تومان)</label>
                  <input
                    type="number"
                    value={itemUnitPrice}
                    onChange={(e) => setItemUnitPrice(Number(e.target.value))}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">جمع کل فاکتور:</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {formatCurrencyToman(itemQuantity * itemUnitPrice)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">توضیحات و شرایط پرداخت</label>
                <textarea
                  rows={2}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  placeholder="نحوه تسویه، چک، مدت اعتبار..."
                />
              </div>

              <div className="p-3 border-t border-slate-800 flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow"
                >
                  تأیید و صدور فاکتور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
