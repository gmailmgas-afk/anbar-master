import React, { useState, useMemo, useEffect } from 'react';
import {
  CylinderTankMapping,
  RuntimeEnvironment,
  User
} from '../types';
import { LocalStorageManager } from '../database/storage';
import {
  DEFAULT_CYLINDER_TANK_MAPPINGS,
  STANDARD_VALVE_OPTIONS,
  STANDARD_NUT_OPTIONS
} from '../database/cylinder-tank-catalog';
import {
  Boxes,
  Flame,
  Wrench,
  Layers,
  Plus,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Lock,
  X,
  Check,
  Info,
  Sliders,
  Settings,
  Hash,
  FileSpreadsheet
} from 'lucide-react';
import { toPersianDigits, formatPersianNumber } from '../utils/persian';
import { isTankType } from '../utils/cylinderRelationship';

interface CylinderTanksCatalogViewProps {
  currentEnv: RuntimeEnvironment;
  currentUser: User | null;
  onRefresh?: () => void;
  onNavigateToRepairKardex?: () => void;
  onNavigateToProductionKardex?: () => void;
}

export const CylinderTanksCatalogView: React.FC<CylinderTanksCatalogViewProps> = ({
  currentEnv,
  currentUser,
  onRefresh,
  onNavigateToRepairKardex,
  onNavigateToProductionKardex
}) => {
  // Access control strictly for Engineer Mousa Amouei
  const isManagerAmouei = Boolean(
    currentUser && (
      currentUser.username === 'amouei' ||
      currentUser.user_id === 'USR-001' ||
      currentUser.role === 'ADMIN' ||
      currentUser.full_name?.includes('عمویی')
    )
  );

  const [mappings, setMappings] = useState<CylinderTankMapping[]>(() => {
    return LocalStorageManager.getCylinderTankMappings(currentEnv);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'REPAIR' | 'PRODUCTION' | 'DUAL'>('ALL');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Edit / Add Modal state
  const [editingItem, setEditingItem] = useState<CylinderTankMapping | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [subVariantsText, setSubVariantsText] = useState<string>('استاندارد');
  const [itemToDelete, setItemToDelete] = useState<CylinderTankMapping | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  // Listen for sync/update events
  useEffect(() => {
    const handleUpdate = () => {
      setMappings(LocalStorageManager.getCylinderTankMappings(currentEnv));
    };
    window.addEventListener('mgas:cylinder_mappings_updated', handleUpdate);
    window.addEventListener('mgas:database_refreshed', handleUpdate);
    return () => {
      window.removeEventListener('mgas:cylinder_mappings_updated', handleUpdate);
      window.removeEventListener('mgas:database_refreshed', handleUpdate);
    };
  }, [currentEnv]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Filtered list
  const filteredMappings = useMemo(() => {
    let result = mappings;

    if (categoryFilter === 'REPAIR') {
      result = result.filter(m => m.is_repairable);
    } else if (categoryFilter === 'PRODUCTION') {
      result = result.filter(m => m.is_produced);
    } else if (categoryFilter === 'DUAL') {
      result = result.filter(m => m.valves_per_cylinder > 1 || m.matching_valve_2_name);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.capacity.toLowerCase().includes(q) ||
        m.matching_valve_name.toLowerCase().includes(q) ||
        (m.matching_valve_2_name && m.matching_valve_2_name.toLowerCase().includes(q)) ||
        m.matching_nut_name.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    }

    return result;
  }, [mappings, categoryFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = mappings.length;
    const repairCount = mappings.filter(m => m.is_repairable).length;
    const prodCount = mappings.filter(m => m.is_produced).length;
    const dualCount = mappings.filter(m => m.valves_per_cylinder > 1 || m.matching_valve_2_name).length;
    return { total, repairCount, prodCount, dualCount };
  }, [mappings]);

  // Dynamically load real inventory products for valve and nut selectors
  const inventoryProducts = useMemo(() => {
    try {
      return LocalStorageManager.getProducts(currentEnv);
    } catch {
      return [];
    }
  }, [currentEnv]);

  // All actual available nuts from inventory products (8 standard nut products)
  const availableNuts = useMemo(() => {
    const list: { id?: string; name: string; sku?: string }[] = [];
    const seenNames = new Set<string>();

    inventoryProducts.forEach(p => {
      const isNut = p.category_id === 'CAT-NUTS' || p.name?.includes('مهره') || p.sku?.startsWith('NUT');
      if (isNut && p.name && !seenNames.has(p.name)) {
        seenNames.add(p.name);
        list.push({ id: p.product_id, name: p.name, sku: p.sku });
      }
    });

    STANDARD_NUT_OPTIONS.forEach(opt => {
      if (!seenNames.has(opt.name)) {
        seenNames.add(opt.name);
        list.push(opt);
      }
    });

    return list;
  }, [inventoryProducts]);

  // All actual available valves from inventory products
  const availableValves = useMemo(() => {
    const list: { id?: string; name: string; sku?: string; category?: string }[] = [];
    const seenNames = new Set<string>();

    inventoryProducts.forEach(p => {
      const isValve = p.category_id === 'CAT-02' || p.name?.includes('شیر') || p.sku?.startsWith('VLV');
      if (isValve && p.name && !seenNames.has(p.name)) {
        seenNames.add(p.name);
        list.push({ id: p.product_id, name: p.name, sku: p.sku, category: 'کالای انبار' });
      }
    });

    STANDARD_VALVE_OPTIONS.forEach(opt => {
      if (!seenNames.has(opt.name)) {
        seenNames.add(opt.name);
        list.push(opt);
      }
    });

    return list;
  }, [inventoryProducts]);

  const handleOpenAddModal = () => {
    const defaultNut = availableNuts[0]?.name || 'مهره 11/25/50 کیلویی بوتانی';
    const defaultValve = availableValves[0]?.name || 'شیر 11/25/50 کیلویی';
    const newItem: CylinderTankMapping = {
      id: `CYL-CUSTOM-${Date.now()}`,
      name: '',
      capacity: '',
      category: 'BOTH',
      subVariants: ['استاندارد'],
      is_repairable: true,
      is_produced: true,
      matching_valve_id: availableValves[0]?.id || 'PRD-VLV-11-25-50',
      matching_valve_name: defaultValve,
      matching_valve_sku: availableValves[0]?.sku || 'VLV-11-25-50',
      valves_per_cylinder: 1,
      matching_nut_id: availableNuts[0]?.id || 'PRD-NUT-11-25-50-BUT',
      matching_nut_name: defaultNut,
      matching_nut_sku: availableNuts[0]?.sku || 'NUT-11-25-50-BUT',
      nuts_per_cylinder: 1,
      notes: ''
    };
    setEditingItem(newItem);
    setSubVariantsText('استاندارد');
    setIsNewItem(true);
    setShowEditModal(true);
  };

  const handleOpenEditModal = (item: CylinderTankMapping) => {
    let cleanNutName = item.matching_nut_name;
    if (!cleanNutName || cleanNutName.includes('چپ‌گرد') || cleanNutName.includes('چپگرد')) {
      cleanNutName = 'مهره 11/25/50 کیلویی بوتانی';
    }
    setEditingItem({
      ...item,
      matching_nut_name: cleanNutName
    });
    setSubVariantsText(item.subVariants && item.subVariants.length > 0 ? item.subVariants.join('، ') : 'استاندارد');
    setIsNewItem(false);
    setShowEditModal(true);
  };

  const handleSaveMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.name.trim()) {
      showToast('لطفاً عنوان سیلندر یا مخزن را وارد نمایید.', 'error');
      return;
    }
    if (!isTankType(editingItem.name) && (!editingItem.matching_valve_name || !editingItem.matching_valve_name.trim())) {
      showToast('لطفاً شیر متناسب را مشخص نمایید.', 'error');
      return;
    }
    if (!editingItem.matching_nut_name.trim()) {
      showToast('لطفاً مهره متناسب را مشخص نمایید.', 'error');
      return;
    }

    const cleanedSubs = subVariantsText
      .split(/[,،]/)
      .map(s => s.trim())
      .filter(Boolean);
    const finalSubs = cleanedSubs.length > 0 ? cleanedSubs : ['استاندارد'];

    const itemToPersist: CylinderTankMapping = {
      ...editingItem,
      subVariants: finalSubs,
      category: editingItem.is_repairable && editingItem.is_produced
        ? 'BOTH'
        : editingItem.is_repairable
        ? 'REPAIR'
        : 'PRODUCTION'
    };

    const saved = LocalStorageManager.saveCylinderTankMapping(
      currentEnv,
      itemToPersist,
      currentUser?.username || 'amouei'
    );

    setMappings(LocalStorageManager.getCylinderTankMappings(currentEnv));
    setShowEditModal(false);
    showToast(`مخزن / سیلندر «${saved.name}» با موفقیت ذخیره و در کاردکس تعمیر و تولید به‌روزرسانی شد.`, 'success');
    onRefresh?.();
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    const deletedName = itemToDelete.name;
    LocalStorageManager.deleteCylinderTankMapping(currentEnv, itemToDelete.id, currentUser?.username || 'amouei');
    setMappings(LocalStorageManager.getCylinderTankMappings(currentEnv));
    setItemToDelete(null);
    showToast(`مخزن / سیلندر «${deletedName}» با موفقیت از سیستم و کاردکس‌های تعمیر و تولید حذف گردید.`, 'success');
    onRefresh?.();
  };

  const handleResetToDefault = () => {
    const def = LocalStorageManager.resetCylinderTankMappings(currentEnv);
    setMappings(def);
    setShowResetConfirmModal(false);
    showToast('تمامی تناظرها و لیست مخازن به مقادیر پیش‌فرض کارخانه بازنشانی شد.', 'info');
    onRefresh?.();
  };

  // If user is not Engineer Mousa Amouei, deny access strictly
  if (!isManagerAmouei) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-5 max-w-lg mx-auto my-14 shadow-2xl" dir="rtl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-black text-white">دسترسی انحصاری مدیریت ارشد (مهندس موسی عمویی)</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            این بخش مربوط به پیکربندی مهندسی کاتالوگ مخازن و تعیین رابطه دقیق فنی شیرآلات و مهره‌ها می‌باشد و طبق سیاست امنیتی منحصراً برای <strong className="text-amber-400">آقای مهندس موسی عمویی</strong> قابل مشاهده و ویرایش است.
          </p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400">
          کاربر فعلی: <span className="font-bold text-white">{currentUser?.full_name || 'ناشناس'}</span> (@{currentUser?.username || 'guest'})
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16" dir="rtl">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 left-6 z-50 animate-bounce">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold border flex items-center gap-2 ${
              notification.type === 'success'
                ? 'bg-emerald-950 text-emerald-200 border-emerald-600'
                : notification.type === 'error'
                ? 'bg-rose-950 text-rose-200 border-rose-600'
                : 'bg-amber-950 text-amber-200 border-amber-600'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {notification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-amber-400" />}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-white">
                  کاتالوگ مخازن، سیلندرها و تناظر شیر و مهره (ام‌گاز)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10.5px] font-bold">
                  پنل مهندس موسی عمویی
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                تعریف رابطه مهندسی و مکانیکی هر مخزن/سیلندر با شیر و مهره متناسب جهت نمایش تفکیک‌شده و دقیق موجودی در کاردکس تعمیر و تولید
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap self-stretch sm:self-auto">
            {onNavigateToRepairKardex && (
              <button
                type="button"
                onClick={onNavigateToRepairKardex}
                className="px-3 py-2 text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-700/80 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="مشاهده کاردکس تعمیر و گردش شیر و کپسول گاز"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>کاردکس تعمیر</span>
              </button>
            )}

            {onNavigateToProductionKardex && (
              <button
                type="button"
                onClick={onNavigateToProductionKardex}
                className="px-3 py-2 text-xs font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/80 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="مشاهده کاردکس تولید کارخانه"
              >
                <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                <span>کاردکس تولید</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>افزودن مخزن / سیلندر جدید</span>
            </button>

            <button
              type="button"
              onClick={() => setShowResetConfirmModal(true)}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-850 hover:bg-slate-800 border border-slate-700/80 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="بازنشانی تمامی تناظرها به مقادیر اولیه کارخانه ام‌گاز"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>بازنشانی به پیش‌فرض</span>
            </button>
          </div>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">کل مخازن و سیلندرها</span>
              <strong className="text-base font-black text-white font-mono mt-0.5 block">{toPersianDigits(stats.total)} مدل</strong>
            </div>
            <Boxes className="w-5 h-5 text-indigo-400" />
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">سیلندرهای تعمیری</span>
              <strong className="text-base font-black text-amber-300 font-mono mt-0.5 block">{toPersianDigits(stats.repairCount)} مدل</strong>
            </div>
            <Flame className="w-5 h-5 text-amber-400" />
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">مخازن خط تولید</span>
              <strong className="text-base font-black text-emerald-300 font-mono mt-0.5 block">{toPersianDigits(stats.prodCount)} مدل</strong>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">مدل‌های دوشیره (لیفتراکی)</span>
              <strong className="text-base font-black text-orange-300 font-mono mt-0.5 block">{toPersianDigits(stats.dualCount)} مدل</strong>
            </div>
            <Wrench className="w-5 h-5 text-orange-400" />
          </div>
        </div>
      </div>

      {/* Toolbar: Search and Filter Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="inline-flex rounded-xl p-1 bg-slate-950 border border-slate-800 text-xs gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            همه اقلام ({toPersianDigits(stats.total)})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('REPAIR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              categoryFilter === 'REPAIR'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            سیلندرهای تعمیری ({toPersianDigits(stats.repairCount)})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('PRODUCTION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              categoryFilter === 'PRODUCTION'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            مخازن تولیدی ({toPersianDigits(stats.prodCount)})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('DUAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              categoryFilter === 'DUAL'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            دوشیره (لیفتراک) ({toPersianDigits(stats.dualCount)})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام مخزن، شیر متناسب یا مهره..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-hidden"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Main Catalog Table / Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="p-3.5 w-12 text-center">ردیف</th>
                <th className="p-3.5">نام مخزن / سیلندر</th>
                <th className="p-3.5">ظرفیت و نوع</th>
                <th className="p-3.5">شیر متناسب ۱</th>
                <th className="p-3.5">شیر متناسب ۲ (در صورت وجود)</th>
                <th className="p-3.5">مهره متناسب</th>
                <th className="p-3.5 text-center">دامنه کاربرد</th>
                <th className="p-3.5 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredMappings.map((item, index) => {
                const isForklift = item.name.includes('لیفتراک') || item.valves_per_cylinder > 1;

                return (
                  <tr key={item.id} className="hover:bg-slate-850/60 transition-colors">
                    {/* Index */}
                    <td className="p-3.5 text-center font-mono text-slate-400">
                      {toPersianDigits(index + 1)}
                    </td>

                    {/* Cylinder Name */}
                    <td className="p-3.5 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isForklift
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          <Flame className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-slate-100">{item.name}</span>
                          {isForklift && (
                            <span className="block text-[10px] text-orange-400 font-medium">
                              تک‌مدل واحد لیفتراکی (۲ شیره)
                            </span>
                          )}
                          {item.subVariants && item.subVariants.length > 1 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              {item.subVariants.map(v => (
                                <span key={v} className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Capacity */}
                    <td className="p-3.5 text-slate-300 font-medium">
                      <span>{item.capacity}</span>
                    </td>

                    {/* Matching Valve 1 */}
                    <td className="p-3.5">
                      {isTankType(item.name) || item.valves_per_cylinder === 0 ? (
                        <div className="space-y-0.5">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            <span>بدون نیاز به شیر (مخزن)</span>
                          </span>
                          <div className="text-[10px] text-slate-500">
                            مخازن ام‌گاز نیازی به شیر ندارند
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="font-bold text-teal-300 flex items-center gap-1">
                            <Wrench className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>{item.matching_valve_name}</span>
                          </span>
                          <div className="text-[10.5px] text-slate-400 font-mono">
                            تعداد به ازای سیلندر: <strong className="text-teal-400">{toPersianDigits(item.valves_per_cylinder)} عدد</strong>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Matching Valve 2 (if any) */}
                    <td className="p-3.5">
                      {item.matching_valve_2_name ? (
                        <div className="space-y-0.5">
                          <span className="font-bold text-teal-300 flex items-center gap-1">
                            <Wrench className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            <span>{item.matching_valve_2_name}</span>
                          </span>
                          <div className="text-[10.5px] text-slate-400 font-mono">
                            تعداد: <strong className="text-orange-400">۱ عدد (فاز بخار)</strong>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Matching Nut */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-amber-300">
                          {item.matching_nut_name}
                        </span>
                        <div className="text-[10.5px] text-slate-400 font-mono">
                          تعداد: <strong className="text-amber-400">{toPersianDigits(item.nuts_per_cylinder)} عدد</strong>
                        </div>
                      </div>
                    </td>

                    {/* Application Domain Badges */}
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {item.is_repairable && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-bold">
                            کاردکس تعمیر
                          </span>
                        )}
                        {item.is_produced && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800 text-[10px] font-bold">
                            خط تولید
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="px-2.5 py-1 text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="ویرایش مشخصات مخزن و تناظر شیر و مهره"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="px-2 py-1 text-xs font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="حذف این مخزن/سیلندر از سیستم و کاردکس‌های تعمیر و تولید"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-4 my-8" dir="rtl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {isNewItem ? 'تعریف مخزن یا سیلندر جدید' : `ویرایش تناظر: ${editingItem.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    تعیین رابطه دقیق شیر، مهره و دسته‌بندی کاردکس توسط مهندس موسی عمویی
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="space-y-4 text-xs">
              {/* Row 1: Name and Capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    نام مخزن / سیلندر *
                  </label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    required
                    placeholder="مثال: سیلندر 11 کیلویی یا مخزن 20 کیلویی"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:border-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    ظرفیت و نوع *
                  </label>
                  <input
                    type="text"
                    value={editingItem.capacity}
                    onChange={e => setEditingItem({ ...editingItem, capacity: e.target.value })}
                    required
                    placeholder="مثال: ۱۱ کیلوگرم خانگی، ۵۰ کیلوگرم صنعتی"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Sub-variants field */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  مدل‌ها و زیرگونه‌های فرعی (با ویرگول جدا کنید):
                </label>
                <input
                  type="text"
                  value={subVariantsText}
                  onChange={e => setSubVariantsText(e.target.value)}
                  placeholder="مثال: استاندارد یا تپل، دراز یا 8 کیلویی، 10 کیلویی"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-amber-400 focus:outline-hidden font-sans"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  این مدل‌ها در کاردکس تعمیر و کاردکس تولید به عنوان مدل‌های فرعی انتخاب‌پذیر خواهند بود (برای اقلام بدون مدل فرعی، «استاندارد» کافیست).
                </p>
              </div>

              {/* Row 2: Checkboxes for kardex domain */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingItem.is_repairable}
                    onChange={e => setEditingItem({ ...editingItem, is_repairable: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-bold text-slate-200">فعال در کاردکس تعمیر سیلندر</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingItem.is_produced}
                    onChange={e => setEditingItem({ ...editingItem, is_produced: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-bold text-slate-200">فعال در کاردکس تولید ام‌گاز</span>
                </label>
              </div>

              {/* Row 3: Primary Valve Configuration */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-teal-500/30 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-teal-300 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-teal-400" />
                    <span>تنظیم شیر متناسب ۱ (اصلی) *</span>
                  </span>
                  <span className="text-[10.5px] text-slate-400 font-mono">
                    شیر اختصاصی این نوع سیلندر
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      انتخاب یا ورود نام شیر متناسب:
                    </label>
                    <select
                      value={editingItem.matching_valve_name}
                      onChange={e => {
                        const chosen = availableValves.find(v => v.name === e.target.value);
                        setEditingItem({
                          ...editingItem,
                          matching_valve_name: e.target.value,
                          matching_valve_id: chosen?.id || editingItem.matching_valve_id,
                          matching_valve_sku: chosen?.sku || editingItem.matching_valve_sku
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:border-teal-400 cursor-pointer text-xs"
                    >
                      {availableValves.map(v => (
                        <option key={v.name} value={v.name}>
                          {v.name} {v.sku ? `(${v.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      تعداد شیر در هر سیلندر:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={editingItem.valves_per_cylinder}
                      onChange={e => setEditingItem({ ...editingItem, valves_per_cylinder: Number(e.target.value) || 1 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Secondary Valve (e.g. Forklift Vapor Valve) */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-orange-500/30 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-orange-300 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-orange-400" />
                    <span>تنظیم شیر دوم (اختیاری - مخصوص سیلندر دوشیره لیفتراک)</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      نام شیر دوم (فاز بخار):
                    </label>
                    <input
                      type="text"
                      value={editingItem.matching_valve_2_name || ''}
                      onChange={e => setEditingItem({ ...editingItem, matching_valve_2_name: e.target.value })}
                      placeholder="در صورت تک‌شیره بودن خالی بگذارید (مثال: شیر نو فاز بخار لیفتراک)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-orange-400 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-end">
                    <span className="text-[10.5px] text-slate-400 p-2">
                      مخصوص سیلندر لیفتراکی که به صورت همزمان از ۲ شیر مایع و بخار استفاده می‌کند.
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 5: Matching Nut Configuration */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>تنظیم مهره متناسب *</span>
                  </span>
                  <span className="text-[10.5px] text-slate-400 font-mono">
                    مهره استاندارد نصب‌شده
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      انتخاب از اسامی مهره‌های موجود در انبار:
                    </label>
                    <select
                      value={editingItem.matching_nut_name}
                      onChange={e => {
                        const chosen = availableNuts.find(n => n.name === e.target.value);
                        setEditingItem({
                          ...editingItem,
                          matching_nut_name: e.target.value,
                          matching_nut_id: chosen?.id || editingItem.matching_nut_id,
                          matching_nut_sku: chosen?.sku || editingItem.matching_nut_sku
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:border-amber-400 cursor-pointer text-xs"
                    >
                      {availableNuts.map(n => (
                        <option key={n.name} value={n.name}>
                          {n.name} {n.sku ? `(${n.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-300 mb-1">
                      تعداد مهره در هر سیلندر:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={editingItem.nuts_per_cylinder}
                      onChange={e => setEditingItem({ ...editingItem, nuts_per_cylinder: Number(e.target.value) || 1 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  توضیحات و یادداشت فنی مهندسی:
                </label>
                <input
                  type="text"
                  value={editingItem.notes || ''}
                  onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })}
                  placeholder="مثال: استاندارد تناظر ۱ به ۱ با شیر ۱۱/۲۵/۵۰ ام‌گاز"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-slate-800">
                <div>
                  {!isNewItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setItemToDelete(editingItem);
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="حذف این مورد از سیستم و کاردکس‌های تعمیر و تولید"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>حذف این مخزن / سیلندر</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
                  >
                    ذخیره مشخصات مخزن / سیلندر
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border-2 border-rose-600/70 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  حذف مخزن / سیلندر «{itemToDelete.name}»
                </h3>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  اعمال خودکار حذف در کاردکس تعمیر و کاردکس تولید
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              آیا از حذف مخزن یا سیلندر <strong className="text-white">«{itemToDelete.name}»</strong> اطمینان دارید؟ با تایید، این محصول بلافاصله از فهرست کاتالوگ مخازن و همچنین از کلیه انتخابگرهای <strong className="text-amber-300">کاردکس تعمیر</strong> و <strong className="text-indigo-300">کاردکس تولید</strong> حذف خواهد شد.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl cursor-pointer shadow-md shadow-rose-900/40 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف قطعی</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">بازنشانی کاتالوگ مخازن به پیش‌فرض کارخانه</h3>
                <p className="text-xs text-slate-400 mt-0.5">آیا از بازنشانی تمامی تناظرها به مقادیر اولیه کارخانه مطمئن هستید؟</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer shadow-xs"
              >
                تایید و بازنشانی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
