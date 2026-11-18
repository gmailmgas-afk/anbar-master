import React, { useState, useMemo } from 'react';
import {
  X,
  Flame,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  Truck,
  ShieldCheck,
  Send,
  Boxes
} from 'lucide-react';
import {
  RuntimeEnvironment,
  User,
  Customer,
  Supplier,
  CylinderValveInspection
} from '../types';
import {
  LocalStorageManager,
  ValveIntakeBreakdown11kg,
  ValveIntakeBreakdownForklift22kg,
  ValveIntakeBreakdownPicnic
} from '../database/storage';
import { toPersianDigits, getPersianDate } from '../utils/persian';
import { PersianDatePicker } from './PersianDatePicker';

interface ValveEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEnv: RuntimeEnvironment;
  currentUser: User | null;
  currentCustomerId?: string;
  customers: Customer[];
  suppliers?: Supplier[];
  onSuccess: (result: {
    sheetNumber: string;
    totalNewValves: number;
    totalUsedValves: number;
    totalAllValves: number;
    customerName: string;
    summaryText: string;
    inspection: CylinderValveInspection;
  }) => void;
}

type Valve11kgType = 'NEW_11KG' | 'USED_11KG';
type Forklift22kgType = 'NEW_FORKLIFT_22KG' | 'USED_FORKLIFT_22KG';
type PicnicType = 'NEW_PICNIC' | 'USED_PICNIC';
type Picnic58kgType = 'NEW_PICNIC_58KG' | 'USED_PICNIC_58KG';

const INITIAL_11KG: ValveIntakeBreakdown11kg = {
  parsi: 0,
  butane: 0,
  iraqi: 0
};

const INITIAL_FORKLIFT_22KG: ValveIntakeBreakdownForklift22kg = {
  parsi: 0,
  butane: 0,
  iranGazi: 0,
  passari: 0
};

const INITIAL_PICNIC: ValveIntakeBreakdownPicnic = {
  parsi: 0,
  butane: 0
};

export const ValveEntryModal: React.FC<ValveEntryModalProps> = ({
  isOpen,
  onClose,
  currentEnv,
  currentUser,
  currentCustomerId,
  customers,
  suppliers,
  onSuccess
}) => {
  // Suppliers list - بارگذاری نام تامین‌کنندگان از لیست موجود
  const allSuppliers = useMemo<Supplier[]>(() => {
    if (suppliers && suppliers.length > 0) return suppliers;
    try {
      const fromStorage = LocalStorageManager.getState(currentEnv)?.suppliers;
      if (fromStorage && fromStorage.length > 0) return fromStorage;
    } catch {}
    return [];
  }, [suppliers, currentEnv]);

  const [sourceType, setSourceType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    return currentCustomerId || (customers.length > 0 ? customers[0].customer_id : '');
  });

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    if (allSuppliers.length > 0) return allSuppliers[0].supplier_id;
    return 'SUP-MGAS-BRANCH';
  });

  React.useEffect(() => {
    if (customers.length > 0 && (!selectedCustomerId || !customers.some(c => c.customer_id === selectedCustomerId))) {
      setSelectedCustomerId(customers[0].customer_id);
    }
  }, [customers, selectedCustomerId]);

  React.useEffect(() => {
    if (allSuppliers.length > 0 && (!selectedSupplierId || !allSuppliers.some(s => s.supplier_id === selectedSupplierId))) {
      setSelectedSupplierId(allSuppliers[0].supplier_id);
    }
  }, [allSuppliers, selectedSupplierId]);

  const [entryDate, setEntryDate] = useState<string>(() => {
    try {
      return getPersianDate() || '1405/06/25';
    } catch {
      return '1405/06/25';
    }
  });
  const [sheetNumber, setSheetNumber] = useState<string>(() => {
    const rand = Math.floor(100 + Math.random() * 900);
    return `05260${rand.toString().slice(0, 2)}`;
  });
  const [driverName, setDriverName] = useState<string>('آقای اکبری (راننده توزیع)');
  const [plateNumber, setPlateNumber] = useState<string>('ایران ۲۲ - ۳۴۵ ع ۷۸');
  const [notes, setNotes] = useState<string>('');

  // Dropdown 1 selection: 11/25/50kg valves
  const [selected11kgType, setSelected11kgType] = useState<Valve11kgType>('NEW_11KG');
  const [valves11kgNew, setValves11kgNew] = useState<ValveIntakeBreakdown11kg>({ ...INITIAL_11KG });
  const [valves11kgUsed, setValves11kgUsed] = useState<ValveIntakeBreakdown11kg>({ ...INITIAL_11KG });

  // Dropdown 2 selection: Forklift valves (تک مدل واحد)
  const [selectedForkliftType, setSelectedForkliftType] = useState<Forklift22kgType>('NEW_FORKLIFT_22KG');
  const [valvesForklift22kgNew, setValvesForklift22kgNew] = useState<ValveIntakeBreakdownForklift22kg>({ ...INITIAL_FORKLIFT_22KG });
  const [valvesForklift22kgUsed, setValvesForklift22kgUsed] = useState<ValveIntakeBreakdownForklift22kg>({ ...INITIAL_FORKLIFT_22KG });

  // Dropdown 3 selection: Picnic valves 1/1.5/3L (نو و کهنه)
  const [selectedPicnicType, setSelectedPicnicType] = useState<PicnicType>('NEW_PICNIC');
  const [valvesPicnicNew, setValvesPicnicNew] = useState<ValveIntakeBreakdownPicnic>({ ...INITIAL_PICNIC });
  const [valvesPicnicUsed, setValvesPicnicUsed] = useState<ValveIntakeBreakdownPicnic>({ ...INITIAL_PICNIC });

  // Dropdown 4 selection: Picnic valves 5/8kg (نو و کهنه)
  const [selectedPicnic58kgType, setSelectedPicnic58kgType] = useState<Picnic58kgType>('NEW_PICNIC_58KG');
  const [valvesPicnic58kgNew, setValvesPicnic58kgNew] = useState<ValveIntakeBreakdownPicnic>({ ...INITIAL_PICNIC });
  const [valvesPicnic58kgUsed, setValvesPicnic58kgUsed] = useState<ValveIntakeBreakdownPicnic>({ ...INITIAL_PICNIC });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  // Selected supplier object & display name
  const currentSupplier = allSuppliers.find(s => s.supplier_id === selectedSupplierId) || allSuppliers[0];
  const supplierDisplayName = currentSupplier
    ? `${currentSupplier.name}${currentSupplier.company_name ? ` (${currentSupplier.company_name})` : ''}`
    : 'تامین‌کننده نامشخص';

  // Helper calculations
  const sum11k = (b: ValveIntakeBreakdown11kg) =>
    (b.parsi || 0) + (b.butane || 0) + (b.iraqi || 0);
  const sumForklift22 = (b: ValveIntakeBreakdownForklift22kg) =>
    (b.parsi || 0) + (b.butane || 0) + (b.iranGazi || 0) + (b.passari || 0);
  const sumPicnic = (b: ValveIntakeBreakdownPicnic) =>
    (b.parsi || 0) + (b.butane || 0);

  const totalNew11kg = sum11k(valves11kgNew);
  const totalUsed11kg = sum11k(valves11kgUsed);
  const totalNewForklift22 = sumForklift22(valvesForklift22kgNew);
  const totalUsedForklift22 = sumForklift22(valvesForklift22kgUsed);
  const totalNewPicnic = sumPicnic(valvesPicnicNew);
  const totalUsedPicnic = sumPicnic(valvesPicnicUsed);
  const totalNewPicnic58kg = sumPicnic(valvesPicnic58kgNew);
  const totalUsedPicnic58kg = sumPicnic(valvesPicnic58kgUsed);

  const totalNewValves = totalNew11kg + totalNewForklift22 + totalNewPicnic + totalNewPicnic58kg;
  const totalUsedValves = totalUsed11kg + totalUsedForklift22 + totalUsedPicnic + totalUsedPicnic58kg;
  const grandTotal = totalNewValves + totalUsedValves;

  // Active 11/25/50kg subcategory state
  const active11kgData = selected11kgType === 'NEW_11KG' ? valves11kgNew : valves11kgUsed;
  const setActive11kgData = (updater: (prev: ValveIntakeBreakdown11kg) => ValveIntakeBreakdown11kg) => {
    if (selected11kgType === 'NEW_11KG') {
      setValves11kgNew(updater);
    } else {
      setValves11kgUsed(updater);
    }
  };

  // Active Forklift 22kg subcategory state
  const activeForkliftData = selectedForkliftType === 'NEW_FORKLIFT_22KG' ? valvesForklift22kgNew : valvesForklift22kgUsed;
  const setActiveForkliftData = (updater: (prev: ValveIntakeBreakdownForklift22kg) => ValveIntakeBreakdownForklift22kg) => {
    if (selectedForkliftType === 'NEW_FORKLIFT_22KG') {
      setValvesForklift22kgNew(updater);
    } else {
      setValvesForklift22kgUsed(updater);
    }
  };

  // Active Picnic 1/1.5/3L subcategory state
  const activePicnicData = selectedPicnicType === 'NEW_PICNIC' ? valvesPicnicNew : valvesPicnicUsed;
  const setActivePicnicData = (updater: (prev: ValveIntakeBreakdownPicnic) => ValveIntakeBreakdownPicnic) => {
    if (selectedPicnicType === 'NEW_PICNIC') {
      setValvesPicnicNew(updater);
    } else {
      setValvesPicnicUsed(updater);
    }
  };

  // Active Picnic 5/8kg subcategory state
  const activePicnic58kgData = selectedPicnic58kgType === 'NEW_PICNIC_58KG' ? valvesPicnic58kgNew : valvesPicnic58kgUsed;
  const setActivePicnic58kgData = (updater: (prev: ValveIntakeBreakdownPicnic) => ValveIntakeBreakdownPicnic) => {
    if (selectedPicnic58kgType === 'NEW_PICNIC_58KG') {
      setValvesPicnic58kgNew(updater);
    } else {
      setValvesPicnic58kgUsed(updater);
    }
  };

  const handle11kgChange = (brand: keyof ValveIntakeBreakdown11kg, val: number) => {
    const clamped = Math.max(0, Math.floor(val || 0));
    setActive11kgData(prev => ({ ...prev, [brand]: clamped }));
  };

  const handle11kgIncrement = (brand: keyof ValveIntakeBreakdown11kg, delta: number) => {
    setActive11kgData(prev => ({ ...prev, [brand]: Math.max(0, (prev[brand] || 0) + delta) }));
  };

  const handleForkliftChange = (brand: keyof ValveIntakeBreakdownForklift22kg, val: number) => {
    const clamped = Math.max(0, Math.floor(val || 0));
    setActiveForkliftData(prev => ({ ...prev, [brand]: clamped }));
  };

  const handleForkliftIncrement = (brand: keyof ValveIntakeBreakdownForklift22kg, delta: number) => {
    setActiveForkliftData(prev => ({ ...prev, [brand]: Math.max(0, (prev[brand] || 0) + delta) }));
  };

  const handlePicnicChange = (brand: keyof ValveIntakeBreakdownPicnic, val: number) => {
    const clamped = Math.max(0, Math.floor(val || 0));
    setActivePicnicData(prev => ({ ...prev, [brand]: clamped }));
  };

  const handlePicnicIncrement = (brand: keyof ValveIntakeBreakdownPicnic, delta: number) => {
    setActivePicnicData(prev => ({ ...prev, [brand]: Math.max(0, (prev[brand] || 0) + delta) }));
  };

  const handlePicnic58kgChange = (brand: keyof ValveIntakeBreakdownPicnic, val: number) => {
    const clamped = Math.max(0, Math.floor(val || 0));
    setActivePicnic58kgData(prev => ({ ...prev, [brand]: clamped }));
  };

  const handlePicnic58kgIncrement = (brand: keyof ValveIntakeBreakdownPicnic, delta: number) => {
    setActivePicnic58kgData(prev => ({ ...prev, [brand]: Math.max(0, (prev[brand] || 0) + delta) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (grandTotal <= 0) {
      setErrorMessage('لطفاً حداقل برای یکی از شیرآلات، مقداری بزرگتر از صفر وارد فرمایید.');
      return;
    }

    if (sourceType === 'CUSTOMER' && !selectedCustomerId && customers.length > 0) {
      setErrorMessage('لطفاً طرف حساب و مشتری مورد نظر را از لیست انتخاب فرمایید.');
      return;
    }
    if (sourceType === 'SUPPLIER' && !selectedSupplierId && allSuppliers.length > 0) {
      setErrorMessage('لطفاً تامین‌کننده (شعبه ام گاز) مورد نظر را از لیست انتخاب فرمایید.');
      return;
    }

    setIsSubmitting(true);
    try {
      let targetId = '';
      let targetName = '';
      let targetSupplierId: string | undefined = undefined;
      let targetSupplierName: string | undefined = undefined;
      let targetCustomerId: string | undefined = undefined;
      let targetCustomerName: string | undefined = undefined;

      if (sourceType === 'CUSTOMER') {
        targetId = selectedCustomerId || customers[0]?.customer_id || 'CUST-001';
        const targetCust = customers.find(c => c.customer_id === targetId);
        targetName = targetCust
          ? `${targetCust.name}${targetCust.company_name ? ` (${targetCust.company_name})` : ''}`
          : 'طرف حساب نامشخص';
        targetCustomerId = targetId;
        targetCustomerName = targetName;
      } else {
        targetId = selectedSupplierId || currentSupplier?.supplier_id || 'SUP-101';
        targetName = supplierDisplayName;
        targetSupplierId = targetId;
        targetSupplierName = supplierDisplayName;
      }

      // 1. Warehouse keeper confirms physical intake
      // 2. Registers items into warehouse stock (WH-VALVES)
      // 3. If SUPPLIER: saves directly in M-Gas central stock (valve_ownership: 'MGAS') without touching customer repair kardex
      // 4. If CUSTOMER: registers into customer's repair kardex and customer valve profile
      const result = LocalStorageManager.recordValveInspection(
        currentEnv,
        {
          sourceType: sourceType,
          customerId: targetCustomerId,
          customerName: targetCustomerName,
          supplierId: targetSupplierId,
          supplierName: targetSupplierName,
          date: entryDate.trim(),
          sheetNumber: sheetNumber.trim() || `05260${Date.now().toString().slice(-3)}`,
          driverName: driverName.trim() || undefined,
          plateNumber: plateNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          valves11kgNew,
          valves11kgUsed,
          valvesForklift22kgNew,
          valvesForklift22kgUsed,
          valvesPicnicNew,
          valvesPicnicUsed,
          valvesPicnic5kg: valvesPicnicNew,
          valvesPicnic2kg: valvesPicnicUsed,
          valvesPicnic58kgNew,
          valvesPicnic58kgUsed
        },
        currentUser?.user_id || 'USR-003'
      );

      onSuccess({
        sheetNumber: result.inspection.form_number,
        totalNewValves: result.totalNewValves,
        totalUsedValves: result.totalUsedValves,
        totalAllValves: result.totalAllValves,
        customerName: targetName,
        summaryText: result.summaryText,
        inspection: result.inspection
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در ثبت و تایید ورودی شیرآلات توسط انباردار');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto"
    >
      <div
        className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto text-slate-100 max-h-[94vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-xs">
              <Flame className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>ورودی شیرآلات (تایید انباردار)</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-950 text-teal-300 border border-teal-700/60 font-mono">
                  شمارش فیزیکی انبار
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                شمارش و تایید فیزیکی شیرآلات توسط مهندس حاجی‌وند و ارسال اعلان به خانم کرمی جهت ثبت نهایی کاردکس
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-rose-950/80 border border-rose-800/80 rounded-xl p-3 flex items-center gap-2 text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* General Metadata: Customer vs Supplier Switch & Date / Sheet Number */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 space-y-3">
            {/* Interactive Switch between Customer Profile vs Supplier (M-Gas Branch) */}
            <div className="space-y-2 border-b border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  <span>انتخاب مبدأ ورودی شیرآلات:</span>
                </div>
                <span className="text-[10px] text-teal-300 font-medium bg-teal-950/70 px-2.5 py-0.5 rounded-md border border-teal-800/60">
                  {sourceType === 'CUSTOMER' ? 'ثبت در پروفایل شیر طرف حساب در انبار' : 'ورود از تأمین‌کننده به موجودی اصلی ام گاز'}
                </span>
              </div>

              {/* Segmented Switch */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSourceType('CUSTOMER')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    sourceType === 'CUSTOMER'
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-950/60 ring-2 ring-teal-400/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>طرف حساب و مشتری</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-normal ${
                    sourceType === 'CUSTOMER' ? 'bg-teal-950/60 text-teal-200 border-teal-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    کاردکس و پروفایل طرف حساب
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('SUPPLIER')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    sourceType === 'SUPPLIER'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-950/60 ring-2 ring-amber-400/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Flame className="w-4 h-4 shrink-0" />
                  <span>تأمین‌کننده (ورود شیر نو ام‌گاز)</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-normal ${
                    sourceType === 'SUPPLIER' ? 'bg-amber-950/60 text-amber-200 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    موجودی انبار مرکزی ام‌گاز
                  </span>
                </button>
              </div>

              {/* Informative Guidance Banner */}
              {sourceType === 'SUPPLIER' ? (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 text-[11px] text-amber-200 flex items-start gap-2">
                  <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-amber-300">قاعده ورودی تأمین‌کنندگان:</strong>
                    شیرهای نو وارده از تأمین‌کننده، متعلق به شرکت ام‌گاز بوده و مستقیماً در <span className="underline decoration-amber-400 font-bold">موجودی خود ام‌گاز در انبار</span> ذخیره می‌شوند و در کاردکس تعمیر مشتری وارد نخواهند شد.
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-teal-950/40 border border-teal-600/40 text-[11px] text-teal-200 flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-teal-300">قاعده ورودی طرف حساب و مشتری:</strong>
                    شیرآلات وارده از طرف حساب و مشتری، مستقیماً در <span className="underline decoration-teal-400 font-bold">کاردکس تعمیر و پروفایل اختصاصی همان طرف حساب</span> در انبار ذخیره و ثبت می‌گردند.
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Dynamic Selector based on Switch */}
              <div>
                {sourceType === 'CUSTOMER' ? (
                  <>
                    <label className="block text-[11px] text-teal-300 font-bold mb-1">
                      <span>طرف حساب / مشتری (پروفایل شیر در انبار):</span>
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={e => setSelectedCustomerId(e.target.value)}
                      className="w-full bg-slate-900 border border-teal-600/70 rounded-lg px-2.5 py-1.5 text-teal-100 font-bold focus:border-teal-400 focus:outline-hidden"
                      required
                    >
                      {customers.map(c => (
                        <option key={c.customer_id} value={c.customer_id}>
                          {c.name} {c.company_name ? `(${c.company_name})` : ''} - {c.province}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-[11px] text-amber-300 font-bold mb-1">
                      <span>تأمین‌کننده (شعبه ام گاز):</span>
                    </label>
                    <select
                      value={selectedSupplierId}
                      onChange={e => setSelectedSupplierId(e.target.value)}
                      className="w-full bg-slate-900 border border-amber-600/70 rounded-lg px-2.5 py-1.5 text-amber-100 font-bold focus:border-amber-400 focus:outline-hidden"
                      required
                    >
                      {allSuppliers.length === 0 ? (
                        <option value="">تامین‌کننده‌ای در سیستم ثبت نشده است</option>
                      ) : (
                        allSuppliers.map(s => (
                          <option key={s.supplier_id} value={s.supplier_id}>
                            {s.name} {s.company_name ? `(${s.company_name})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">تاریخ شمارش و تخلیه (شمسی):</label>
                <PersianDatePicker
                  value={entryDate}
                  onChange={val => setEntryDate(val)}
                  placeholder={getPersianDate()}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-2.5 pl-8 py-1.5 text-slate-100 font-mono text-center focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              {/* Sheet Number */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">شماره برگه ورودی انبار:</label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={sheetNumber}
                    onChange={e => setSheetNumber(e.target.value)}
                    placeholder="052601"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-center focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: 11/25/50kg Cylinder Valves Dropdown & Dynamic Subcategories */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-200">منوی دراپ‌داون شیرهای ۱۱/۲۵/۵۰ کیلویی:</span>
              </div>

              {/* Badges showing entered amounts for both 11/25/50kg types */}
              <div className="flex items-center gap-2 text-[11px]">
                {totalNew11kg > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 font-mono">
                    شیر نو ۱۱/۲۵/۵۰: {toPersianDigits(totalNew11kg)} عدد
                  </span>
                )}
                {totalUsed11kg > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800/70 font-mono">
                    شیر کهنه ۱۱/۲۵/۵۰: {toPersianDigits(totalUsed11kg)} عدد
                  </span>
                )}
              </div>
            </div>

            {/* Dropdown 1 */}
            <div>
              <label className="block text-slate-400 mb-1.5 text-[11px]">
                انتخاب نوع شیر ۱۱/۲۵/۵۰ کیلویی (برای نمایش و تنظیم زیردسته‌ها):
              </label>
              <select
                value={selected11kgType}
                onChange={e => setSelected11kgType(e.target.value as Valve11kgType)}
                className="w-full sm:w-80 bg-slate-900 border-2 border-amber-500/50 rounded-xl px-3 py-2 text-slate-100 font-bold text-xs focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="NEW_11KG">شیر نو 11/25/50 کیلویی</option>
                <option value="USED_11KG">شیر کهنه 11/25/50 کیلویی</option>
              </select>
            </div>

            {/* Dynamic Subcategory Inputs: Parsi, Butane, Iraqi */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-amber-300">
                  زیردسته مقادیر «{selected11kgType === 'NEW_11KG' ? 'شیر نو 11/25/50 کیلویی' : 'شیر کهنه 11/25/50 کیلویی'}»:
                </span>
                <span className="text-[11px] text-slate-400">
                  مجموع این بخش:{' '}
                  <strong className="text-amber-400 font-mono">
                    {toPersianDigits(sum11k(active11kgData))}
                  </strong>{' '}
                  عدد
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'parsi', label: 'پرسی ۱۱/۲۵/۵۰ کیلویی' },
                  { key: 'butane', label: 'بوتان ۱۱/۲۵/۵۰ کیلویی' },
                  { key: 'iraqi', label: 'عراقی ۱۱/۲۵/۵۰ کیلویی' }
                ].map(({ key, label }) => {
                  const bKey = key as keyof ValveIntakeBreakdown11kg;
                  const val = active11kgData[bKey] || 0;
                  const hasValue = val > 0;

                  return (
                    <div
                      key={key}
                      className={`p-2.5 rounded-xl border transition-all ${
                        hasValue
                          ? 'bg-amber-950/30 border-amber-500/60 text-slate-100 shadow-xs'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-amber-300">{label}</span>
                        {hasValue && (
                          <button
                            type="button"
                            onClick={() => handle11kgChange(bKey, 0)}
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                            title="صفر کردن"
                          >
                            صفر
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={val === 0 ? '' : val}
                          onChange={e => handle11kgChange(bKey, Number(e.target.value))}
                          placeholder="۰"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sm text-slate-100 focus:border-amber-400 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">عدد</span>
                      </div>

                      {/* Fast + buttons */}
                      <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-slate-800/80">
                        {[1, 5, 20, 50].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handle11kgIncrement(bKey, inc)}
                            className="flex-1 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: Unified Forklift Valves Dropdown & Dynamic Subcategories */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-slate-200">منوی دراپ‌داون شیرهای سیلندر لیفتراکی (تک‌مدل واحد):</span>
              </div>

              {/* Badges showing entered amounts for forklift */}
              <div className="flex items-center gap-2 text-[11px]">
                {totalNewForklift22 > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-orange-950/80 text-orange-300 border border-orange-800/70 font-mono">
                    شیر نو لیفتراکی: {toPersianDigits(totalNewForklift22)} عدد
                  </span>
                )}
                {totalUsedForklift22 > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800/70 font-mono">
                    شیر کهنه لیفتراکی: {toPersianDigits(totalUsedForklift22)} عدد
                  </span>
                )}
              </div>
            </div>

            {/* Dropdown for Forklift */}
            <div>
              <label className="block text-slate-400 mb-1.5 text-[11px]">
                انتخاب نوع شیر سیلندر لیفتراکی (تنها ۱ مدل واحد لیفتراکی موجود است):
              </label>
              <select
                value={selectedForkliftType}
                onChange={e => setSelectedForkliftType(e.target.value as Forklift22kgType)}
                className="w-full sm:w-80 bg-slate-900 border-2 border-orange-500/50 rounded-xl px-3 py-2 text-slate-100 font-bold text-xs focus:border-orange-400 focus:outline-hidden cursor-pointer"
              >
                <option value="NEW_FORKLIFT_22KG">شیر نو سیلندر لیفتراکی (مدل واحد ۲ شیره)</option>
                <option value="USED_FORKLIFT_22KG">شیر کهنه سیلندر لیفتراکی (مدل واحد ۲ شیره)</option>
              </select>
            </div>

            {/* Dynamic Subcategory Inputs: Butane Forklift, Iran Gazi Forklift, Passari Forklift, Parsi Forklift */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-orange-300">
                  زیردسته مقادیر «{selectedForkliftType === 'NEW_FORKLIFT_22KG' ? 'شیر نو سیلندر لیفتراکی' : 'شیر کهنه سیلندر لیفتراکی'}»:
                </span>
                <span className="text-[11px] text-slate-400">
                  مجموع این بخش:{' '}
                  <strong className="text-orange-400 font-mono">
                    {toPersianDigits(sumForklift22(activeForkliftData))}
                  </strong>{' '}
                  عدد
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {[
                  { key: 'butane', label: 'بوتان لیفتراکی' },
                  { key: 'iranGazi', label: 'ایران‌گازی لیفتراکی' },
                  { key: 'passari', label: 'پاساری لیفتراکی' },
                  { key: 'parsi', label: 'پرسی لیفتراکی' }
                ].map(({ key, label }) => {
                  const bKey = key as keyof ValveIntakeBreakdownForklift22kg;
                  const val = activeForkliftData[bKey] || 0;
                  const hasValue = val > 0;

                  return (
                    <div
                      key={key}
                      className={`p-2.5 rounded-xl border transition-all ${
                        hasValue
                          ? 'bg-orange-950/30 border-orange-500/60 text-slate-100 shadow-xs'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-orange-300">{label}</span>
                        {hasValue && (
                          <button
                            type="button"
                            onClick={() => handleForkliftChange(bKey, 0)}
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                            title="صفر کردن"
                          >
                            صفر
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={val === 0 ? '' : val}
                          onChange={e => handleForkliftChange(bKey, Number(e.target.value))}
                          placeholder="۰"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sm text-slate-100 focus:border-orange-400 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">عدد</span>
                      </div>

                      {/* Fast + buttons */}
                      <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-slate-800/80">
                        {[1, 5, 20, 50].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handleForkliftIncrement(bKey, inc)}
                            className="flex-1 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-300 transition-colors cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Picnic Valves 1/1.5/3L Dropdown & Dynamic Subcategories (نو / کهنه) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-slate-200">منوی دراپ‌داون شیرهای پیک‌نیک ۱/۱.۵/۳ لیتری (تک‌مدل واحد با تفکیک نو و کهنه):</span>
              </div>

              {/* Badges showing entered amounts for picnic new and used */}
              <div className="flex items-center gap-2 text-[11px]">
                {totalNewPicnic > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-teal-950/80 text-teal-300 border border-teal-800/70 font-mono">
                    شیر نو پیکنیک: {toPersianDigits(totalNewPicnic)} عدد
                  </span>
                )}
                {totalUsedPicnic > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-800/70 font-mono">
                    شیر کهنه پیکنیک: {toPersianDigits(totalUsedPicnic)} عدد
                  </span>
                )}
              </div>
            </div>

            {/* Dropdown 3 */}
            <div>
              <label className="block text-slate-400 mb-1.5 text-[11px]">
                انتخاب نوع شیر پیک‌نیک ۱/۱.۵/۳ لیتری (برای نمایش و تنظیم زیردسته‌ها):
              </label>
              <select
                value={selectedPicnicType}
                onChange={e => setSelectedPicnicType(e.target.value as PicnicType)}
                className="w-full sm:w-80 bg-slate-900 border-2 border-teal-500/50 rounded-xl px-3 py-2 text-slate-100 font-bold text-xs focus:border-teal-400 focus:outline-hidden cursor-pointer"
              >
                <option value="NEW_PICNIC">شیر نو پیکنیک 1/1.5/3 لیتری</option>
                <option value="USED_PICNIC">شیر کهنه پیکنیک 1/1.5/3 لیتری</option>
              </select>
            </div>

            {/* Dynamic Subcategory Inputs: Parsi, Butane */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-teal-300">
                  زیردسته مقادیر «{selectedPicnicType === 'NEW_PICNIC' ? 'شیر نو پیکنیک 1/1.5/3 لیتری' : 'شیر کهنه پیکنیک 1/1.5/3 لیتری'}»:
                </span>
                <span className="text-[11px] text-slate-400">
                  مجموع این بخش:{' '}
                  <strong className="text-teal-400 font-mono">
                    {toPersianDigits(sumPicnic(activePicnicData))}
                  </strong>{' '}
                  عدد
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                {[
                  { key: 'parsi', label: 'پرسی ۱/۱.۵/۳ لیتری' },
                  { key: 'butane', label: 'بوتان ۱/۱.۵/۳ لیتری' }
                ].map(({ key, label }) => {
                  const bKey = key as keyof ValveIntakeBreakdownPicnic;
                  const val = activePicnicData[bKey] || 0;
                  const hasValue = val > 0;

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition-all ${
                        hasValue
                          ? 'bg-teal-950/30 border-teal-500/60 text-slate-100 shadow-xs'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-teal-300">{label}</span>
                        {hasValue && (
                          <button
                            type="button"
                            onClick={() => handlePicnicChange(bKey, 0)}
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                            title="صفر کردن"
                          >
                            صفر
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={val === 0 ? '' : val}
                          onChange={e => handlePicnicChange(bKey, Number(e.target.value))}
                          placeholder="۰"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sm text-slate-100 focus:border-teal-400 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">عدد</span>
                      </div>

                      {/* Fast + buttons */}
                      <div className="flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-slate-800/80">
                        {[1, 5, 20, 50].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handlePicnicIncrement(bKey, inc)}
                            className="flex-1 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-teal-300 transition-colors cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 4: Picnic Valves 5/6kg Dropdown & Dynamic Subcategories (نو / کهنه) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200">منوی دراپ‌داون شیرهای پیک‌نیک ۵/۶ کیلویی (تک‌مدل واحد با تفکیک نو و کهنه):</span>
              </div>

              {/* Badges showing entered amounts for picnic 5/6kg new and used */}
              <div className="flex items-center gap-2 text-[11px]">
                {totalNewPicnic58kg > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 font-mono">
                    شیر نو پیکنیک ۵/۶: {toPersianDigits(totalNewPicnic58kg)} عدد
                  </span>
                )}
                {totalUsedPicnic58kg > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-teal-950/80 text-teal-300 border border-teal-800/70 font-mono">
                    شیر کهنه پیکنیک ۵/۶: {toPersianDigits(totalUsedPicnic58kg)} عدد
                  </span>
                )}
              </div>
            </div>

            {/* Dropdown 4 */}
            <div>
              <label className="block text-slate-400 mb-1.5 text-[11px]">
                انتخاب نوع شیر پیک‌نیک ۵/۶ کیلویی (برای نمایش و تنظیم زیردسته‌ها):
              </label>
              <select
                value={selectedPicnic58kgType}
                onChange={e => setSelectedPicnic58kgType(e.target.value as Picnic58kgType)}
                className="w-full sm:w-80 bg-slate-900 border-2 border-emerald-500/50 rounded-xl px-3 py-2 text-slate-100 font-bold text-xs focus:border-emerald-400 focus:outline-hidden cursor-pointer"
              >
                <option value="NEW_PICNIC_58KG">شیر نو پیکنیک 5/6 کیلویی</option>
                <option value="USED_PICNIC_58KG">شیر کهنه پیکنیک 5/6 کیلویی</option>
              </select>
            </div>

            {/* Dynamic Subcategory Inputs: Parsi 5/6kg, Butane 5/6kg */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-emerald-300">
                  زیردسته مقادیر «{selectedPicnic58kgType === 'NEW_PICNIC_58KG' ? 'شیر نو پیکنیک 5/6 کیلویی' : 'شیر کهنه پیکنیک 5/6 کیلویی'}»:
                </span>
                <span className="text-[11px] text-slate-400">
                  مجموع این بخش:{' '}
                  <strong className="text-emerald-400 font-mono">
                    {toPersianDigits(sumPicnic(activePicnic58kgData))}
                  </strong>{' '}
                  عدد
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                {[
                  { key: 'parsi', label: 'پرسی ۵/۶ کیلویی' },
                  { key: 'butane', label: 'بوتان ۵/۶ کیلویی' }
                ].map(({ key, label }) => {
                  const bKey = key as keyof ValveIntakeBreakdownPicnic;
                  const val = activePicnic58kgData[bKey] || 0;
                  const hasValue = val > 0;

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition-all ${
                        hasValue
                          ? 'bg-emerald-950/30 border-emerald-500/60 text-slate-100 shadow-xs'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-emerald-300">{label}</span>
                        {hasValue && (
                          <button
                            type="button"
                            onClick={() => handlePicnic58kgChange(bKey, 0)}
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                            title="صفر کردن"
                          >
                            صفر
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={val === 0 ? '' : val}
                          onChange={e => handlePicnic58kgChange(bKey, Number(e.target.value))}
                          placeholder="۰"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sm text-slate-100 focus:border-emerald-400 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">عدد</span>
                      </div>

                      {/* Fast + buttons */}
                      <div className="flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-slate-800/80">
                        {[1, 5, 20, 50].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handlePicnic58kgIncrement(bKey, inc)}
                            className="flex-1 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Driver & Plate & Additional Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">نام راننده / تحویل‌دهنده:</label>
              <div className="relative">
                <Truck className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  placeholder="آقای اکبری"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:border-teal-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">شماره پلاک خودرو:</label>
              <input
                type="text"
                value={plateNumber}
                onChange={e => setPlateNumber(e.target.value)}
                placeholder="ایران ۲۲ - ۳۴۵ ع ۷۸"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">توضیحات و گزارش بازرسی:</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="شمارش کامل بار و سلامت فیزیکی..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Live Summary Box & Confirmation Announcement */}
          <div className="bg-gradient-to-r from-teal-950/70 via-slate-950 to-emerald-950/70 border border-teal-700/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-teal-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>خلاصه شمارش فیزیکی انباردار جهت ارسال به کاردکس:</span>
              </span>
              <span className="text-[11px] text-slate-400">
                تامین‌کننده: <strong className="text-white">{supplierDisplayName}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-center font-mono">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 font-sans">شیر نو ۱۱/۲۵/۵۰</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">{toPersianDigits(totalNew11kg)}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 font-sans">شیر کهنه ۱۱/۲۵/۵۰</div>
                <div className="text-sm font-bold text-amber-400 mt-0.5">{toPersianDigits(totalUsed11kg)}</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 font-sans">شیر لیفتراکی</div>
                <div className="text-sm font-bold text-orange-300 mt-0.5">
                  {toPersianDigits(totalNewForklift22 + totalUsedForklift22)}
                </div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">
                  نو: {toPersianDigits(totalNewForklift22)} | کهنه: {toPersianDigits(totalUsedForklift22)}
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 font-sans">شیر پیکنیک ۱/۱.۵/۳</div>
                <div className="text-sm font-bold text-teal-300 mt-0.5">{toPersianDigits(totalNewPicnic + totalUsedPicnic)}</div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">
                  نو: {toPersianDigits(totalNewPicnic)} | کهنه: {toPersianDigits(totalUsedPicnic)}
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 font-sans">شیر پیکنیک ۵/۸</div>
                <div className="text-sm font-bold text-emerald-300 mt-0.5">{toPersianDigits(totalNewPicnic58kg + totalUsedPicnic58kg)}</div>
                <div className="text-[9px] text-slate-500 font-sans mt-0.5">
                  نو: {toPersianDigits(totalNewPicnic58kg)} | کهنه: {toPersianDigits(totalUsedPicnic58kg)}
                </div>
              </div>
              <div className="bg-emerald-950/80 border border-emerald-800/80 rounded-lg p-2 col-span-2 sm:col-span-1 lg:col-span-1">
                <div className="text-[10px] text-emerald-300 font-sans">جمع کل شیرآلات</div>
                <div className="text-base font-extrabold text-emerald-400 mt-0.5">{toPersianDigits(grandTotal)}</div>
                <div className="text-[9px] text-emerald-500 font-sans mt-0.5">
                  نو: {toPersianDigits(totalNewValves)} | کهنه: {toPersianDigits(totalUsedValves)}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-teal-900/40 text-[11px] text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  ورودی انبار: <strong className="text-white">{toPersianDigits(grandTotal)}</strong> عدد | اعلان کاردکس خانم کرمی: ستون «ورود شیر نو» (<strong className="text-emerald-300">{toPersianDigits(totalNewValves)}</strong>) و «ورود شیر کهنه» (<strong className="text-amber-300">{toPersianDigits(totalUsedValves)}</strong>)
                </span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
            >
              انصراف
            </button>

            <button
              type="submit"
              disabled={isSubmitting || grandTotal === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                grandTotal > 0
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-extrabold shadow-teal-500/20 active:scale-98'
                  : 'bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 cursor-not-allowed opacity-70'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ثبت...' : 'تایید ورودی توسط انباردار و ارسال اعلان به خانم کرمی'}</span>
              {grandTotal > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-950/80 text-teal-300 text-[10px] font-mono">
                  {toPersianDigits(grandTotal)}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
