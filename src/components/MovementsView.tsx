import React, { useState } from 'react';
import {
  StockMovement,
  Product,
  Warehouse,
  MovementType,
  RuntimeEnvironment,
  User,
  Customer,
  Supplier
} from '../types';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  LayoutGrid,
  List,
  X,
  Flame,
  CheckCircle2,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Save,
  Package,
  ShieldAlert,
  FileText
} from 'lucide-react';
import {
  formatPersianDateTime,
  toPersianDigits,
  formatCurrencyToman
} from '../utils/persian';
import { SEED_USERS } from '../database/seed-data';
import { LocalStorageManager } from '../database/storage';
import { SyncEngine } from '../sync-engine/sync-client';
import { ValveEntryModal } from './ValveEntryModal';
import { GoodsEntryReceiptModal } from './GoodsEntryReceiptModal';
import { GoodsExitReceiptModal } from './GoodsExitReceiptModal';

interface MovementsViewProps {
  stockMovements: StockMovement[];
  products: Product[];
  warehouses: Warehouse[];
  users?: User[];
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  onOpenNewMovement: () => void;
  customers?: Customer[];
  suppliers?: Supplier[];
  onRefresh?: () => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({
  stockMovements,
  products,
  warehouses,
  users,
  currentEnv,
  currentUser,
  onOpenNewMovement,
  customers = [],
  suppliers = [],
  onRefresh
}) => {
  const allUsers = users && users.length > 0 ? users : SEED_USERS;
  const [showValveIntakeModal, setShowValveIntakeModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [whFilter, setWhFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'VALVES'>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => 
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
  );

  // Edit movement modal state
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [editForm, setEditForm] = useState<{
    quantity: number;
    movement_type: MovementType;
    warehouse_id: string;
    to_warehouse_id: string;
    shelf_location: string;
    reference_id: string;
    item_condition: 'HEALTHY' | 'DEFECTIVE';
    description: string;
    notes: string;
  }>({
    quantity: 0,
    movement_type: 'STOCK_IN',
    warehouse_id: '',
    to_warehouse_id: '',
    shelf_location: '',
    reference_id: '',
    item_condition: 'HEALTHY',
    description: '',
    notes: ''
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete movement state
  const [deletingMovement, setDeletingMovement] = useState<StockMovement | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Official Goods Entry/Exit Receipt Modal state
  const [receiptMovement, setReceiptMovement] = useState<StockMovement | null>(null);
  const [receiptType, setReceiptType] = useState<'ENTRY' | 'EXIT' | null>(null);

  const handleOpenReceiptModal = (m: StockMovement) => {
    const isExit = m.movement_type === 'STOCK_OUT' || m.movement_type === 'SALE' || m.movement_type === 'RETURN_OUT';
    setReceiptMovement(m);
    setReceiptType(isExit ? 'EXIT' : 'ENTRY');
  };

  // Zero all inventory modal state
  const [showZeroInventoryModal, setShowZeroInventoryModal] = useState(false);
  const [isZeroing, setIsZeroing] = useState(false);

  // Listen for direct navigation/open request to valve intake modal
  React.useEffect(() => {
    const handleOpenIntake = () => setShowValveIntakeModal(true);
    window.addEventListener('mgas:open_valve_intake_modal', handleOpenIntake);
    return () => window.removeEventListener('mgas:open_valve_intake_modal', handleOpenIntake);
  }, []);

  const filtered = stockMovements.filter(m => {
    const prod = products.find(p => p.product_id === m.product_id);
    const term = (searchTerm || '').trim().toLowerCase();
    const matchSearch =
      !term ||
      (m.reference_id ? String(m.reference_id).toLowerCase().includes(term) : false) ||
      (m.movement_id ? String(m.movement_id).toLowerCase().includes(term) : false) ||
      (m.description ? String(m.description).toLowerCase().includes(term) : false) ||
      (m.document_number ? String(m.document_number).toLowerCase().includes(term) : false) ||
      (m.notes ? String(m.notes).toLowerCase().includes(term) : false) ||
      (m.customer_name ? String(m.customer_name).toLowerCase().includes(term) : false) ||
      (m.customer_id ? String(m.customer_id).toLowerCase().includes(term) : false) ||
      ((m as any).supplier_name ? String((m as any).supplier_name).toLowerCase().includes(term) : false) ||
      (prod && prod.name ? String(prod.name).toLowerCase().includes(term) : false) ||
      (prod && prod.sku ? String(prod.sku).toLowerCase().includes(term) : false);

    const matchType =
      typeFilter === 'ALL' ||
      (typeFilter === 'TRANSFER'
        ? m.movement_type === 'TRANSFER_IN' || m.movement_type === 'TRANSFER_OUT'
        : m.movement_type === typeFilter);
    const matchWh =
      whFilter === 'ALL' ||
      m.warehouse_id === whFilter ||
      m.to_warehouse_id === whFilter ||
      m.destination_warehouse_id === whFilter;

    const isValveItem =
      prod?.category_id === 'CAT-02' ||
      (prod?.sku && prod.sku.startsWith('VLV-')) ||
      (prod?.name && (prod.name.includes('شیر') || prod.name.includes('سوپاپ'))) ||
      (m.notes && m.notes.includes('شیر')) ||
      Boolean(m.valve_ownership) ||
      Boolean((m as any).cylinder_valve_details);

    const matchCategory = categoryFilter === 'ALL' || (categoryFilter === 'VALVES' && isValveItem);

    return matchSearch && matchType && matchWh && matchCategory;
  });

  const getMovementBadge = (type?: MovementType | string) => {
    switch (type) {
      case 'STOCK_IN':
      case 'PURCHASE':
      case 'RETURN_IN':
        return {
          label: 'ورود به انبار (رسید)',
          className: 'bg-emerald-950 text-emerald-300 border-emerald-700/50',
          icon: ArrowDownLeft
        };
      case 'STOCK_OUT':
      case 'SALE':
      case 'RETURN_OUT':
        return {
          label: 'خروج از انبار (حواله)',
          className: 'bg-rose-950 text-rose-300 border-rose-700/50',
          icon: ArrowUpRight
        };
      case 'TRANSFER_IN':
        return {
          label: 'انتقال (ورود به مقصد)',
          className: 'bg-cyan-950 text-cyan-300 border-cyan-700/50',
          icon: ArrowLeftRight
        };
      case 'TRANSFER_OUT':
      case 'TRANSFER':
        return {
          label: 'انتقال بین انبارها',
          className: 'bg-indigo-950 text-indigo-300 border-indigo-700/50',
          icon: ArrowLeftRight
        };
      case 'ADJUSTMENT':
        return {
          label: 'تعدیل انبارگردانی',
          className: 'bg-amber-950 text-amber-300 border-amber-700/50',
          icon: Layers
        };
      default:
        return {
          label: type ? String(type) : 'گردش انبار',
          className: 'bg-slate-800 text-slate-300 border-slate-700/50',
          icon: ArrowLeftRight
        };
    }
  };

  const handleStartEdit = (m: StockMovement) => {
    setEditingMovement(m);
    setEditForm({
      quantity: m.quantity,
      movement_type: m.movement_type,
      warehouse_id: m.warehouse_id,
      to_warehouse_id: m.to_warehouse_id || '',
      shelf_location: m.shelf_location || '',
      reference_id: m.reference_id || '',
      item_condition: m.item_condition === 'DEFECTIVE' ? 'DEFECTIVE' : 'HEALTHY',
      description: m.description || '',
      notes: m.notes || ''
    });
    setEditError(null);
  };

  const handleSaveEdit = () => {
    if (!editingMovement) return;
    if (editForm.quantity <= 0) {
      setEditError('لطفاً مقدار معتبر (بزرگتر از صفر) وارد کنید.');
      return;
    }
    const updated: StockMovement = {
      ...editingMovement,
      quantity: Number(editForm.quantity),
      movement_type: editForm.movement_type,
      warehouse_id: editForm.warehouse_id,
      to_warehouse_id: editForm.to_warehouse_id || undefined,
      shelf_location: editForm.shelf_location,
      reference_id: editForm.reference_id,
      item_condition: editForm.item_condition,
      description: editForm.description,
      notes: editForm.notes
    };

    const res = LocalStorageManager.updateStockMovement(currentEnv, updated, currentUser);
    if (!res.success) {
      setEditError(res.error || 'خطا در ویرایش سند گردش کالا');
      return;
    }

    setEditingMovement(null);
    setEditError(null);
    setToastMessage({
      type: 'success',
      text: `سند گردش کالا «${updated.reference_id || updated.movement_id}» با موفقیت ویرایش شد.`
    });
    setTimeout(() => setToastMessage(null), 6000);
    if (onRefresh) onRefresh();
  };

  const handleConfirmDelete = () => {
    if (!deletingMovement) return;
    const res = LocalStorageManager.deleteStockMovement(currentEnv, deletingMovement.movement_id, currentUser);
    if (!res.success) {
      setDeleteError(res.error || 'خطا در حذف سند گردش');
      return;
    }
    const deletedRef = deletingMovement.reference_id || deletingMovement.movement_id;
    setDeletingMovement(null);
    setDeleteError(null);
    setToastMessage({
      type: 'success',
      text: `سند گردش کالا «${deletedRef}» با موفقیت حذف گردید.`
    });
    setTimeout(() => setToastMessage(null), 6000);
    if (onRefresh) onRefresh();
  };

  const handleConfirmZeroAll = async () => {
    setIsZeroing(true);
    try {
      const author = currentUser?.full_name || 'مدیریت ارشد';
      const purgedAt = new Date().toISOString();
      LocalStorageManager.zeroAllWarehouseStock(currentEnv, author, true);
      await SyncEngine.executeRemotePurge(currentEnv, {
        mode: 'ZERO_ALL',
        author,
        purgedAt
      });
      await SyncEngine.syncNow(currentEnv);
      setShowZeroInventoryModal(false);
      setToastMessage({
        type: 'success',
        text: 'تمامی موجودی‌ها، گردش‌ها و کاردکس‌های انبار در هر ۳ پایگاه داده و تمام دستگاه‌ها با موفقیت صفر شدند.'
      });
      setTimeout(() => setToastMessage(null), 8000);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: `خطا در صفر کردن موجودی: ${err?.message || 'نامشخص'}`
      });
    } finally {
      setIsZeroing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
            <span>دفتر کل گردش کالا و اسناد انبار (Stock Movements Ledger)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            امکان ثبت، ویرایش و حذف گردش کالاها با حفظ تاریخچه رویدادهای همگام‌سازی
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Action button: Dedicated Valve Intake */}
          <button
            type="button"
            onClick={() => setShowValveIntakeModal(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="ورودی شیرآلات (شیر نو و کهنه ۱۱ کیلویی، پرسی، بوتان، ایران‌گازی، لیفتراک، عراقی و پیک‌نیک) و ارسال اعلان به خانم کرمی"
          >
            <Flame className="w-4 h-4 text-teal-950" />
            <span>ورودی شیرآلات</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewMovement}
            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>ثبت سند گردش جدید</span>
          </button>
        </div>
      </div>

      {/* Action Toast Banner */}
      {toastMessage && (
        <div className={`rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs border shadow-md ${
          toastMessage.type === 'success'
            ? 'bg-teal-950/90 border-teal-700/80 text-teal-200'
            : toastMessage.type === 'error'
            ? 'bg-rose-950/90 border-rose-700/80 text-rose-200'
            : 'bg-amber-950/90 border-amber-700/80 text-amber-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters - Fully Responsive on Mobile & Tablet */}
      <div className="bg-slate-900/60 p-3 sm:p-4 rounded-xl border border-slate-800 space-y-3">
        {/* Search */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="جستجو در شماره سند، بارنامه، نام کالا یا کد SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-9 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 shadow-inner font-sans"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter controls row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 sm:flex-initial bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-hidden focus:border-indigo-500 cursor-pointer shadow-xs min-w-[130px]"
            >
              <option value="ALL">همه انواع گردش</option>
              <option value="STOCK_IN">رسید ورود</option>
              <option value="STOCK_OUT">حواله خروج</option>
              <option value="TRANSFER">انتقال بین انبارها</option>
              <option value="ADJUSTMENT">تعدیل موجودی</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className={`flex-1 sm:flex-initial rounded-lg text-xs px-3 py-1.5 focus:outline-hidden cursor-pointer shadow-xs min-w-[140px] font-bold transition-all ${
                categoryFilter === 'VALVES'
                  ? 'bg-amber-950/80 border-2 border-amber-500 text-amber-200'
                  : 'bg-slate-950 border border-slate-800 text-slate-200 focus:border-indigo-500'
              }`}
              title="فیلتر بر اساس همه کالاها یا فقط شیرآلات فشارقوی"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100">📦 همه کالاها</option>
              <option value="VALVES" className="bg-slate-900 text-amber-300 font-bold">🔥 فقط شیرآلات فشارقوی</option>
            </select>

            <select
              value={whFilter}
              onChange={(e) => setWhFilter(e.target.value)}
              className="flex-1 sm:flex-initial bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-hidden focus:border-indigo-500 cursor-pointer shadow-xs min-w-[130px]"
            >
              <option value="ALL">همه انبارها</option>
              {warehouses.map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.name} {w.shelf_location ? `(قفسه ${w.shelf_location})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-0.5 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="نمایش جدولی اسناد گردش"
            >
              <List className="w-3.5 h-3.5" />
              <span>جدول</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="نمایش کارتی اسناد گردش (بهینه برای موبایل و تبلت)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>کارتی</span>
            </button>
          </div>
        </div>
      </div>

      {/* Movements View: Table or Responsive Cards */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-900/80 border border-slate-800 rounded-2xl">
              <Layers className="w-12 h-12 mx-auto mb-2 text-slate-600 opacity-50" />
              <div className="font-bold text-slate-300 text-sm">هیچ سندی با فیلترهای انتخابی یافت نشد</div>
              <div className="text-xs text-slate-500 mt-1">کلیه موجودی‌های انبار در حال حاضر صفر می‌باشد.</div>
            </div>
          ) : (
            filtered.map((m, idx) => {
              const prod = products.find(p => p.product_id === m.product_id);
              const wh = warehouses.find(w => w.warehouse_id === m.warehouse_id);
              const badge = getMovementBadge(m?.movement_type);
              const BadgeIcon = badge?.icon || ArrowLeftRight;
              const isPositive =
                m.movement_type === 'STOCK_IN' ||
                m.movement_type === 'PURCHASE' ||
                m.movement_type === 'RETURN_IN';
              const cardKey = m.movement_id ? `${m.movement_id}-${idx}` : (m.event_id ? `${m.event_id}-${idx}` : `mov-card-${idx}`);

              return (
                <div
                  key={cardKey}
                  className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-4 transition-all shadow-md flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div>
                        <span className="font-mono font-bold text-indigo-300 text-sm block">
                          {m.reference_id || m.document_number || 'سند بدون شماره'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {m.movement_id}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1 ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" />
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-800/80 pt-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">کالا:</span>
                        <span className="font-bold text-slate-100">{prod?.name || m.product_id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">کد SKU:</span>
                        <span className="font-mono text-indigo-400">{prod?.sku || '---'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">انبار:</span>
                        <div className="text-left font-medium text-slate-200">
                          {m.movement_type === 'TRANSFER_OUT' && m.to_warehouse_id ? (
                            <span className="text-[11px] text-indigo-300 font-semibold">
                              از {wh?.name || m.warehouse_id} ➔ {warehouses.find(w => w.warehouse_id === m.to_warehouse_id)?.name || m.to_warehouse_id}
                            </span>
                          ) : m.movement_type === 'TRANSFER_IN' && m.to_warehouse_id ? (
                            <span className="text-[11px] text-cyan-300 font-semibold">
                              در {wh?.name || m.warehouse_id} ⬅ از {warehouses.find(w => w.warehouse_id === m.to_warehouse_id)?.name || m.to_warehouse_id}
                            </span>
                          ) : (
                            wh?.name || m.warehouse_id
                          )}
                        </div>
                      </div>
                      {m.item_condition && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">وضعیت کالا:</span>
                          {m.item_condition === 'DEFECTIVE' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                              معیوب شده (ضایعات/اسقاط)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              سالم (نو و قابل استفاده)
                            </span>
                          )}
                        </div>
                      )}
                      {(m.valve_ownership || m.customer_name || (m as any).supplier_name || m.party_type) && (() => {
                        const isSupplier = m.party_type === 'SUPPLIER' ||
                          Boolean((m as any).supplier_id) ||
                          Boolean((m as any).supplier_name) ||
                          m.valve_ownership === 'MGAS' ||
                          m.customer_name === 'شرکت ام‌گاز' ||
                          (m.customer_id && m.customer_id.startsWith('SUP-'));
                        const isCustomer = !isSupplier && (
                          m.party_type === 'CUSTOMER' ||
                          m.valve_ownership === 'CUSTOMER' ||
                          Boolean(m.customer_name && m.customer_name !== 'شرکت ام‌گاز') ||
                          Boolean(m.customer_id && m.customer_id.startsWith('CUST-'))
                        );

                        return (
                          <div className="space-y-1 pt-1 border-t border-slate-800/60">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">طرف حساب:</span>
                              {isCustomer ? (
                                <div className="text-left">
                                  <span className="font-bold text-amber-300 block">{m.customer_name}</span>
                                  <span className="text-[10px] text-amber-400/90 font-medium bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/50">
                                    منعکس در کاردکس تعمیر مشتری
                                  </span>
                                </div>
                              ) : isSupplier ? (
                                <div className="text-left">
                                  <span className="font-bold text-emerald-300 block">{(m as any).supplier_name || (m.customer_name !== 'شرکت ام‌گاز' ? m.customer_name : '') || 'تأمین‌کننده ام‌گاز'}</span>
                                  <span className="text-[10px] text-emerald-400/90 font-medium bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/50">
                                    منعکس در موجودی ام‌گاز
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-xs">---</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {(m.shelf_location || wh?.shelf_location) && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">قفسه:</span>
                          <span className="font-mono text-indigo-300 font-bold">{m.shelf_location || wh?.shelf_location}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">کاربر ثبت:</span>
                        <div className="text-left">
                          <span className="font-mono text-xs text-indigo-300 font-bold block">
                            @{m.created_by_username || (allUsers.find(u => u.user_id === m.user_id)?.username) || 'amouei'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {allUsers.find(u => u.user_id === m.user_id)?.full_name || m.user_id}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>زمان ثبت:</span>
                        <span>{formatPersianDateTime(m.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/90 mt-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">مقدار تغییر:</span>
                      <span className={`font-mono text-base font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : '-'}{toPersianDigits(m.quantity)} {prod?.unit || 'عدد'}
                      </span>
                    </div>

                    {/* Actions: Receipt, Edit & Delete buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenReceiptModal(m)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                        title={`صدور / مشاهده برگه رسمی ${m.movement_type === 'STOCK_OUT' || m.movement_type === 'SALE' || m.movement_type === 'RETURN_OUT' ? 'خروج' : 'ورود'} کالا`}
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        <span>برگه {m.movement_type === 'STOCK_OUT' || m.movement_type === 'SALE' || m.movement_type === 'RETURN_OUT' ? 'خروج' : 'ورود'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                        title="ویرایش این سند گردش"
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-400" />
                        <span>ویرایش</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingMovement(m);
                          setDeleteError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                        title="حذف این سند گردش"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Mobile Horizontal Scroll Indicator Banner */}
          <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] text-indigo-300 select-none">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
              <span>جدول گردش اسناد را به چپ یا راست بکشید (اسکرول لمسی)</span>
            </span>
            <span className="text-slate-500 font-mono text-[10px]">۱۱ ستون گردش + عملیات ⇄</span>
          </div>

          <div className="overflow-x-auto -webkit-overflow-scrolling-touch overscroll-x-contain relative">
            <table className="w-full text-right text-xs min-w-[950px] border-collapse">
              <thead className="bg-slate-950/95 text-slate-400 border-b border-slate-800 text-[11px] select-none">
                <tr>
                  <th className="p-3 sticky right-0 z-20 bg-slate-950 border-b border-slate-800 shadow-[-2px_0_4px_rgba(0,0,0,0.4)] w-14 text-center">ردیف</th>
                  <th className="p-3 font-bold text-slate-200 min-w-[170px]">نام کالا</th>
                  <th className="p-3 min-w-[130px]">شماره سند / پیگیری</th>
                  <th className="p-3 min-w-[140px] text-amber-300 font-bold">طرف حساب (مشتری / تامین)</th>
                  <th className="p-3">نوع گردش</th>
                  <th className="p-3">انبار</th>
                  <th className="p-3">مقدار / تغییر</th>
                  <th className="p-3 print:hidden" data-no-print="true">کاربر و دستگاه</th>
                  <th className="p-3">شناسه رویداد</th>
                  <th className="p-3">زمان ثبت</th>
                  <th className="p-3 text-center min-w-[100px] sticky left-0 z-20 bg-slate-950 border-b border-slate-800 shadow-[2px_0_4px_rgba(0,0,0,0.4)]">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400">
                      هیچ سندی با فیلترهای انتخابی یافت نشد (موجودی‌های انبار صفر هستند).
                    </td>
                  </tr>
                ) : (
                  filtered.map((m, idx) => {
                    const prod = products.find(p => p.product_id === m.product_id);
                    const wh = warehouses.find(w => w.warehouse_id === m.warehouse_id);
                    const badge = getMovementBadge(m?.movement_type);
                    const BadgeIcon = badge?.icon || ArrowLeftRight;
                    const isPositive =
                      m.movement_type === 'STOCK_IN' ||
                      m.movement_type === 'PURCHASE' ||
                      m.movement_type === 'RETURN_IN';

                    const rowKey = m.movement_id ? `${m.movement_id}-${idx}` : (m.event_id ? `${m.event_id}-${idx}` : `movement-row-${idx}`);

                    return (
                      <tr key={rowKey} className="hover:bg-slate-800/40 transition-colors group">
                        <td className="p-3 sticky right-0 z-10 bg-slate-900 group-hover:bg-slate-850 shadow-[-2px_0_4px_rgba(0,0,0,0.4)] text-center font-mono text-slate-400">
                          {toPersianDigits(idx + 1)}
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-100">{prod?.name || m.product_id}</div>
                          <div className="text-[10px] font-mono text-indigo-400">{prod?.sku}</div>
                        </td>

                        <td className="p-3">
                          <div className="font-mono font-bold text-slate-200">{m.reference_id || m.document_number || '---'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{m.movement_id}</div>
                        </td>

                        <td className="p-3">
                          {(() => {
                            const isSupplier = m.party_type === 'SUPPLIER' ||
                              Boolean((m as any).supplier_id) ||
                              Boolean((m as any).supplier_name) ||
                              m.valve_ownership === 'MGAS' ||
                              m.customer_name === 'شرکت ام‌گاز' ||
                              (m.customer_id && m.customer_id.startsWith('SUP-'));
                            const isCustomer = !isSupplier && (
                              m.party_type === 'CUSTOMER' ||
                              m.valve_ownership === 'CUSTOMER' ||
                              Boolean(m.customer_name && m.customer_name !== 'شرکت ام‌گاز') ||
                              Boolean(m.customer_id && m.customer_id.startsWith('CUST-'))
                            );

                            if (isCustomer) {
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                    <span className="font-bold text-slate-100 text-xs truncate max-w-[150px]" title={m.customer_name}>
                                      {m.customer_name}
                                    </span>
                                  </div>
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                    منعکس در کاردکس تعمیر
                                  </span>
                                </div>
                              );
                            }

                            if (isSupplier) {
                              const displayName = (m as any).supplier_name || (m.customer_name !== 'شرکت ام‌گاز' ? m.customer_name : '') || 'تأمین‌کننده ام‌گاز';
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                    <span className="font-bold text-slate-100 text-xs truncate max-w-[150px]" title={displayName}>
                                      {displayName}
                                    </span>
                                  </div>
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                                    منعکس در موجودی ام‌گاز
                                  </span>
                                </div>
                              );
                            }

                            return <span className="text-slate-600 font-mono text-xs">---</span>;
                          })()}
                        </td>

                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border inline-flex items-center gap-1 ${badge.className}`}>
                            <BadgeIcon className="w-3 h-3" />
                            <span>{badge.label}</span>
                          </span>
                        </td>

                        <td className="p-3 text-slate-300">
                          <div className="font-medium text-slate-200">
                            {m.movement_type === 'TRANSFER_OUT' && m.to_warehouse_id ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-300">{wh?.name || m.warehouse_id}</span>
                                <span className="text-indigo-400 font-black">➔</span>
                                <span className="text-indigo-300 font-semibold">{warehouses.find(w => w.warehouse_id === m.to_warehouse_id)?.name || m.to_warehouse_id}</span>
                              </div>
                            ) : m.movement_type === 'TRANSFER_IN' && m.to_warehouse_id ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-300">{wh?.name || m.warehouse_id}</span>
                                <span className="text-cyan-400 font-black">⬅</span>
                                <span className="text-cyan-300 text-[11px] font-semibold">(از {warehouses.find(w => w.warehouse_id === m.to_warehouse_id)?.name || m.to_warehouse_id})</span>
                              </div>
                            ) : (
                              wh?.name || m.warehouse_id
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {(m.shelf_location || wh?.shelf_location) && (
                              <span className="text-[10px] font-mono text-indigo-400">
                                قفسه: {m.shelf_location || wh?.shelf_location}
                              </span>
                            )}
                            {m.item_condition === 'DEFECTIVE' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                                معیوب شده (ضایعات)
                              </span>
                            )}
                            {m.item_condition === 'HEALTHY' && (m.movement_type === 'TRANSFER_IN' || m.movement_type === 'TRANSFER_OUT') && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                سالم
                              </span>
                            )}
                            {(m.valve_ownership || m.customer_name) && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                m.valve_ownership === 'CUSTOMER' && m.customer_name && m.customer_name !== 'شرکت ام‌گاز'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}>
                                {m.valve_ownership === 'CUSTOMER' && m.customer_name && m.customer_name !== 'شرکت ام‌گاز'
                                  ? `شیر مشتری: ${m.customer_name}`
                                  : 'شیر ام‌گاز'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3">
                          <span className={`font-mono text-sm font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : '-'}{toPersianDigits(m.quantity)} {prod?.unit || 'عدد'}
                          </span>
                        </td>

                        <td className="p-3 print:hidden" data-no-print="true" data-user-badge="true">
                          <div className="font-mono font-bold text-xs text-indigo-300">
                            @{m.created_by_username || (allUsers.find(u => u.user_id === m.user_id)?.username) || 'amouei'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {allUsers.find(u => u.user_id === m.user_id)?.full_name || m.user_id}
                          </div>
                        </td>

                        <td className="p-3 font-mono text-[10px] text-slate-400 truncate max-w-[120px]" title={m.event_id}>
                          {m.event_id}
                        </td>

                        <td className="p-3 text-[11px] text-slate-400">
                          {formatPersianDateTime(m.created_at)}
                        </td>

                        {/* Actions column: Receipt, Edit & Delete buttons */}
                        <td className="p-3 text-center sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-850 shadow-[2px_0_4px_rgba(0,0,0,0.4)]">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenReceiptModal(m)}
                              className="p-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white transition-all cursor-pointer shadow-xs flex items-center justify-center"
                              title={`صدور / مشاهده برگه رسمی ${m.movement_type === 'STOCK_OUT' || m.movement_type === 'SALE' || m.movement_type === 'RETURN_OUT' ? 'خروج' : 'ورود'} کالا`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(m)}
                              className="p-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white transition-all cursor-pointer shadow-xs"
                              title="ویرایش سند گردش انبار"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingMovement(m);
                                setDeleteError(null);
                              }}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white transition-all cursor-pointer shadow-xs"
                              title="حذف سند گردش انبار"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      )}

      {/* Edit Movement Modal */}
      {editingMovement && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">ویرایش سند گردش انبار</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMovement(null);
                  setEditError(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Product Info Readonly Box */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">کالای انتخابی:</div>
                  <div className="font-bold text-slate-100 text-sm mt-0.5">
                    {products.find(p => p.product_id === editingMovement.product_id)?.name || editingMovement.product_id}
                  </div>
                  <div className="text-[11px] font-mono text-indigo-400">
                    SKU: {products.find(p => p.product_id === editingMovement.product_id)?.sku || '---'}
                  </div>
                </div>
                <div className="text-left font-mono text-xs text-slate-400">
                  <div>شناسه سند:</div>
                  <div className="text-slate-300 font-bold">{editingMovement.movement_id}</div>
                </div>
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>{editError}</div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    مقدار / تعداد <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: Math.max(0, Number(e.target.value)) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Movement Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    نوع سند گردش <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={editForm.movement_type}
                    onChange={(e) => setEditForm({ ...editForm, movement_type: e.target.value as MovementType })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="STOCK_IN">ورود به انبار (رسید ورود)</option>
                    <option value="STOCK_OUT">خروج از انبار (حواله خروج)</option>
                    <option value="TRANSFER_OUT">انتقال (خروج از مبدأ)</option>
                    <option value="TRANSFER_IN">انتقال (ورود به مقصد)</option>
                    <option value="ADJUSTMENT">تعدیل انبارگردانی</option>
                  </select>
                </div>

                {/* Warehouse */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    انبار <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={editForm.warehouse_id}
                    onChange={(e) => setEditForm({ ...editForm, warehouse_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    {warehouses.map(w => (
                      <option key={w.warehouse_id} value={w.warehouse_id}>
                        {w.name} {w.shelf_location ? `(قفسه ${w.shelf_location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shelf Location */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    موقعیت قفسه
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: A1, B3, قفسه ۲"
                    value={editForm.shelf_location}
                    onChange={(e) => setEditForm({ ...editForm, shelf_location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 font-sans"
                  />
                </div>

                {/* Reference ID / Doc Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    شماره سند / بارنامه / حواله
                  </label>
                  <input
                    type="text"
                    value={editForm.reference_id}
                    onChange={(e) => setEditForm({ ...editForm, reference_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Item Condition */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    وضعیت فیزیکی کالا
                  </label>
                  <select
                    value={editForm.item_condition}
                    onChange={(e) => setEditForm({ ...editForm, item_condition: e.target.value as 'HEALTHY' | 'DEFECTIVE' })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="HEALTHY">سالم (نو و قابل استفاده)</option>
                    <option value="DEFECTIVE">معیوب شده (ضایعات / اسقاط)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  شرح سند
                </label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="توضیح کوتاه در مورد دلیل گردش کالا..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  یادداشت‌ها و جزئیات تکمیلی
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="توضیحات اضافی، نام راننده یا شماره فاکتور..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Security policy notice */}
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                <span className="font-semibold text-indigo-300">قانون دسترسی:</span> کلیه کاربران مجاز سامانه بدون محدودیت زمانی (مهلت یک‌ساعته غیرفعال است) امکان ویرایش اسناد را دارند.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 p-4 border-t border-slate-800 bg-slate-950/70">
              <button
                type="button"
                onClick={() => {
                  setEditingMovement(null);
                  setEditError(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>ذخیره تغییرات سند</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Movement Confirmation Modal */}
      {deletingMovement && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-rose-950/30">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-white text-base">تأیید حذف سند گردش انبار</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeletingMovement(null);
                  setDeleteError(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                آیا از حذف قطعی این سند گردش اطمینان دارید؟ با حذف این سند، محاسبات موجودی انبار به حالت قبلی بازخواهد گشت.
              </p>

              {/* Movement Summary Box */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">کالا:</span>
                  <span className="font-bold text-slate-100">
                    {products.find(p => p.product_id === deletingMovement.product_id)?.name || deletingMovement.product_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">شماره سند:</span>
                  <span className="font-mono text-indigo-300 font-bold">
                    {deletingMovement.reference_id || deletingMovement.movement_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">مقدار:</span>
                  <span className="font-mono text-rose-400 font-black">
                    {toPersianDigits(deletingMovement.quantity)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">کاربر ثبت:</span>
                  <span className="font-mono text-slate-300">
                    @{deletingMovement.created_by_username || deletingMovement.user_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">زمان ثبت:</span>
                  <span className="text-slate-300">
                    {formatPersianDateTime(deletingMovement.created_at)}
                  </span>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>{deleteError}</div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 p-4 border-t border-slate-800 bg-slate-950/70">
              <button
                type="button"
                onClick={() => {
                  setDeletingMovement(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف قطعی سند</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zero All Warehouse Inventory Confirmation Modal */}
      {showZeroInventoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-rose-900/40 bg-rose-950/50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-white text-base">صفر کردن کلیه موجودی‌های انبار</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowZeroInventoryModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-rose-300">
                آیا از صفر کردن کلیه موجودی‌های انبار اطمینان کامل دارید؟
              </p>
              <p>
                این عملیات تمامی گردش‌ها، رسیدها و حواله‌های انبار را در هر سه محیط (ویندوز ۱۱ دفتر مرکزی، ویندوز ۷ انبار، و سرور ابری) کاملاً تخلیه و صفر خواهد کرد تا بتوانید انبار را از نو و با شمارش دقیق موجودی واقعی ثبت فرمایید.
              </p>
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-rose-200 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>توجه مهم:</span>
                </div>
                <div>• کاتالوگ کالاها و مشتریان حفظ خواهند شد.</div>
                <div>• کلیه موجودی‌های عددی انبار دقیقاً برابر با ۰ خواهد شد.</div>
                <div>• این تغییر بلافاصله از طریق لایو استریم به سرور و تمام دستگاه‌ها مخابره می‌شود.</div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 p-4 border-t border-slate-800 bg-slate-950/70">
              <button
                type="button"
                onClick={() => setShowZeroInventoryModal(false)}
                disabled={isZeroing}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmZeroAll}
                disabled={isZeroing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${isZeroing ? 'animate-spin' : ''}`} />
                <span>{isZeroing ? 'در حال صفر کردن...' : 'بله، کلیه موجودی‌ها را صفر کن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dedicated Valve Intake (ورودی شیرآلات به انبار و گردش کالا) */}
      {showValveIntakeModal && (
        <ValveEntryModal
          isOpen={showValveIntakeModal}
          onClose={() => setShowValveIntakeModal(false)}
          currentEnv={currentEnv}
          currentUser={currentUser}
          currentCustomerId={customers && customers[0]?.customer_id ? customers[0].customer_id : ''}
          customers={customers || []}
          suppliers={suppliers}
          onSuccess={(result) => {
            setShowValveIntakeModal(false);
            if (onRefresh) onRefresh();
            setToastMessage({
              text: `ورودی شیرآلات برگه «${result.sheetNumber}» (${toPersianDigits(result.totalAllValves)} عدد) با موفقیت در گردش و موجودی انبار ثبت گردید.`,
              type: 'success'
            });
            setTimeout(() => setToastMessage(null), 8000);
          }}
        />
      )}

      {/* Modal: Official Goods Entry Receipt (برگ ورود کالا به انبار) */}
      {receiptType === 'ENTRY' && receiptMovement && (
        <GoodsEntryReceiptModal
          isOpen={true}
          onClose={() => {
            setReceiptType(null);
            setReceiptMovement(null);
          }}
          currentEnv={currentEnv}
          currentUser={currentUser}
          customers={customers}
          suppliers={suppliers}
          products={products}
          movement={receiptMovement}
          onSuccess={() => {
            setReceiptType(null);
            setReceiptMovement(null);
            if (onRefresh) onRefresh();
            setToastMessage({
              text: 'برگ ورود کالا با موفقیت ذخیره و به‌روزرسانی گردید.',
              type: 'success'
            });
            setTimeout(() => setToastMessage(null), 6000);
          }}
        />
      )}

      {/* Modal: Official Goods Exit Receipt (برگ خروج کالا از انبار) */}
      {receiptType === 'EXIT' && receiptMovement && (
        <GoodsExitReceiptModal
          isOpen={true}
          onClose={() => {
            setReceiptType(null);
            setReceiptMovement(null);
          }}
          currentEnv={currentEnv}
          currentUser={currentUser}
          customers={customers}
          suppliers={suppliers}
          products={products}
          movement={receiptMovement}
          onSuccess={() => {
            setReceiptType(null);
            setReceiptMovement(null);
            if (onRefresh) onRefresh();
            setToastMessage({
              text: 'برگ خروج کالا با موفقیت ذخیره و به‌روزرسانی گردید.',
              type: 'success'
            });
            setTimeout(() => setToastMessage(null), 6000);
          }}
        />
      )}

    </div>
  );
};
