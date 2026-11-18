import React, { useState, useEffect } from 'react';
import { Supplier, RuntimeEnvironment, User } from '../types';
import { LocalStorageManager } from '../database/storage';
import { showToast, showConfirm } from '../utils/uiFeedback';
import {
  Truck,
  Plus,
  Search,
  CreditCard,
  MapPin,
  ExternalLink,
  Trash2,
  Edit3,
  Save,
  X,
  LayoutGrid,
  List,
  UserCheck,
  Hash,
  FileCheck2,
  PhoneCall,
  Users
} from 'lucide-react';
import {
  formatCurrencyToman,
  formatPersianDateTime,
  toPersianDigits,
  generateUUID
} from '../utils/persian';
import {
  sanitizeInput,
  sanitizeNumber,
  validateFieldSecurity
} from '../utils/security';

interface SuppliersViewProps {
  suppliers: Supplier[];
  currentEnv: RuntimeEnvironment;
  currentUser: User;
  onRefresh?: () => void;
  onSwitchToCustomers?: () => void;
}

const IRAN_PROVINCES = [
  'تهران', 'اصفهان', 'خراسان رضوی', 'فارس', 'آذربایجان شرقی', 'مازندران',
  'خوزستان', 'گیلان', 'البرز', 'کرمان', 'آذربایجان غربی', 'کرمانشاه',
  'همدان', 'یزد', 'قم', 'مرکزی', 'قزوین', 'سمنان', 'زنجان', 'بوشهر',
  'هرمزگان', 'لرستان', 'کردستان', 'گلستان', 'اردبیل', 'چهارمحال و بختیاری',
  'خراسان جنوبی', 'خراسان شمالی', 'کهگیلویه و بویراحمد', 'ایلام', 'سیستان و بلوچستان'
];

interface SupplierFormData {
  name: string;
  company_name: string;
  manager_name: string;
  phone: string;
  phone_secondary: string;
  employer_phone: string;
  national_id: string;
  economic_code: string;
  registration_number: string;
  postal_code: string;
  fax: string;
  province: string;
  city: string;
  address: string;
  credit_limit: number;
  balance_type: 'ZERO' | 'DEBTOR' | 'CREDITOR';
  balance_amount: number;
  supplier_type: 'عمده' | 'خرده' | 'سازمانی' | 'پیمانکاری';
  notes: string;
}

const INITIAL_FORM_DATA: SupplierFormData = {
  name: '',
  company_name: '',
  manager_name: '',
  phone: '',
  phone_secondary: '',
  employer_phone: '',
  national_id: '',
  economic_code: '',
  registration_number: '',
  postal_code: '',
  fax: '',
  province: 'تهران',
  city: 'تهران',
  address: '',
  credit_limit: 500000000,
  balance_type: 'ZERO',
  balance_amount: 0,
  supplier_type: 'عمده',
  notes: ''
};

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  currentEnv,
  currentUser,
  onRefresh,
  onSwitchToCustomers
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'list'
  );

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form states for Add and Edit
  const [addFormData, setAddFormData] = useState<SupplierFormData>(INITIAL_FORM_DATA);
  const [editFormData, setEditFormData] = useState<SupplierFormData>(INITIAL_FORM_DATA);

  // Global Escape key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setEditingSupplier(null);
        setSelectedSupplier(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter suppliers across all customer-equivalent fields
  const filtered = suppliers
    .filter(s => {
      const term = searchTerm.trim().toLowerCase();
      const matchSearch =
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.company_name && s.company_name.toLowerCase().includes(term)) ||
        (s.manager_name && s.manager_name.toLowerCase().includes(term)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
        (s.phone && s.phone.includes(searchTerm)) ||
        (s.phone_secondary && s.phone_secondary.includes(searchTerm)) ||
        (s.employer_phone && s.employer_phone.includes(searchTerm)) ||
        (s.national_id && s.national_id.includes(searchTerm)) ||
        (s.economic_code && s.economic_code.includes(searchTerm)) ||
        (s.registration_number && s.registration_number.includes(searchTerm)) ||
        (s.postal_code && s.postal_code.includes(searchTerm)) ||
        (s.fax && s.fax.includes(searchTerm)) ||
        (s.province && s.province.toLowerCase().includes(term)) ||
        (s.city && s.city.toLowerCase().includes(term)) ||
        (s.address && s.address.toLowerCase().includes(term)) ||
        s.supplier_id.toLowerCase().includes(term);

      const supType = s.supplier_type || 'عمده';
      const matchType = typeFilter === 'ALL' || supType === typeFilter;
      return matchSearch && matchType;
    })
    .sort((a, b) => {
      if (a.row_index && b.row_index) return a.row_index - b.row_index;
      if (a.row_index) return -1;
      if (b.row_index) return 1;
      return 0;
    });

  // Open Add Supplier Modal
  const handleOpenAdd = () => {
    setAddFormData(INITIAL_FORM_DATA);
    setShowAddModal(true);
  };

  // Open Edit Supplier Modal
  const handleOpenEdit = (sup: Supplier) => {
    let bType: 'ZERO' | 'DEBTOR' | 'CREDITOR' = 'ZERO';
    let bAmount = 0;
    if (sup.current_balance < 0) {
      bType = 'DEBTOR';
      bAmount = Math.abs(sup.current_balance);
    } else if (sup.current_balance > 0) {
      bType = 'CREDITOR';
      bAmount = Math.abs(sup.current_balance);
    }

    setEditFormData({
      name: sup.name || '',
      company_name: sup.company_name || '',
      manager_name: sup.manager_name || sup.contact_person || '',
      phone: sup.phone || '',
      phone_secondary: sup.phone_secondary || '',
      employer_phone: sup.employer_phone || '',
      national_id: sup.national_id || '',
      economic_code: sup.economic_code || '',
      registration_number: sup.registration_number || sup.economic_code || '',
      postal_code: sup.postal_code || '',
      fax: sup.fax || '',
      province: sup.province || 'تهران',
      city: sup.city || 'تهران',
      address: sup.address || '',
      credit_limit: sup.credit_limit || 0,
      balance_type: bType,
      balance_amount: bAmount,
      supplier_type: sup.supplier_type || 'عمده',
      notes: sup.notes || ''
    });
    setEditingSupplier(sup);
  };

  // Validate form data helper (exact parity with CustomersView)
  const validateSupplierForm = (formData: SupplierFormData) => {
    const nameCheck = validateFieldSecurity(formData.name, 'نام طرف حساب / شخص حقیقی', { required: true, maxLength: 200 });
    if (!nameCheck.isValid) return { isValid: false, error: nameCheck.error };

    const phoneCheck = validateFieldSecurity(formData.phone, 'تلفن کارفرما / همراه', { required: true, maxLength: 60 });
    if (!phoneCheck.isValid) return { isValid: false, error: phoneCheck.error };

    const companyCheck = validateFieldSecurity(formData.company_name, 'نام شرکت / کارخانه', { maxLength: 200 });
    if (!companyCheck.isValid) return { isValid: false, error: companyCheck.error };

    const managerCheck = validateFieldSecurity(formData.manager_name, 'نام مدیرعامل یا نماینده', { maxLength: 200 });
    if (!managerCheck.isValid) return { isValid: false, error: managerCheck.error };

    const phoneSecCheck = validateFieldSecurity(formData.phone_secondary, 'شماره تلفن ثابت', { maxLength: 60 });
    if (!phoneSecCheck.isValid) return { isValid: false, error: phoneSecCheck.error };

    const employerPhoneCheck = validateFieldSecurity(formData.employer_phone, 'تلفن کارفرما', { maxLength: 60 });
    if (!employerPhoneCheck.isValid) return { isValid: false, error: employerPhoneCheck.error };

    const nationalCheck = validateFieldSecurity(formData.national_id, 'کد ملی یا شناسه ملی', { maxLength: 50 });
    if (!nationalCheck.isValid) return { isValid: false, error: nationalCheck.error };

    const regCheck = validateFieldSecurity(formData.registration_number, 'شماره ثبت شرکت', { maxLength: 50 });
    if (!regCheck.isValid) return { isValid: false, error: regCheck.error };

    const ecoCheck = validateFieldSecurity(formData.economic_code, 'کد اقتصادی', { maxLength: 50 });
    if (!ecoCheck.isValid) return { isValid: false, error: ecoCheck.error };

    const postalCheck = validateFieldSecurity(formData.postal_code, 'کد پستی ۱۰ رقمی', { maxLength: 20 });
    if (!postalCheck.isValid) return { isValid: false, error: postalCheck.error };

    const faxCheck = validateFieldSecurity(formData.fax, 'شماره فکس', { maxLength: 50 });
    if (!faxCheck.isValid) return { isValid: false, error: faxCheck.error };

    const addressCheck = validateFieldSecurity(formData.address, 'نشانی کامل کارخانه / دفتر', { maxLength: 500 });
    if (!addressCheck.isValid) return { isValid: false, error: addressCheck.error };

    const notesCheck = validateFieldSecurity(formData.notes, 'یادداشت و شروط قرارداد', { maxLength: 1000, allowMultiline: true });
    if (!notesCheck.isValid) return { isValid: false, error: notesCheck.error };

    return {
      isValid: true,
      clean: {
        name: nameCheck.cleanValue,
        company_name: companyCheck.cleanValue,
        manager_name: managerCheck.cleanValue,
        phone: phoneCheck.cleanValue,
        phone_secondary: phoneSecCheck.cleanValue,
        employer_phone: employerPhoneCheck.cleanValue,
        national_id: nationalCheck.cleanValue,
        registration_number: regCheck.cleanValue,
        economic_code: ecoCheck.cleanValue || regCheck.cleanValue,
        postal_code: postalCheck.cleanValue,
        fax: faxCheck.cleanValue,
        address: addressCheck.cleanValue,
        notes: notesCheck.cleanValue
      }
    };
  };

  const calculateBalance = (type: 'ZERO' | 'DEBTOR' | 'CREDITOR', amount: number): number => {
    const cleanAmount = sanitizeNumber(amount, 0, 0, 1000000000000);
    if (type === 'DEBTOR') return -cleanAmount;
    if (type === 'CREDITOR') return cleanAmount;
    return 0;
  };

  const triggerDbRefresh = () => {
    onRefresh?.();
    try {
      window.dispatchEvent(new CustomEvent('mgas:db_refreshed'));
    } catch {}
  };

  // Save new supplier
  const handleSaveAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateSupplierForm(addFormData);
    if (!result.isValid || !result.clean) {
      showToast(result.error || 'اطلاعات فرم تأمین‌کننده معتبر نیست.', 'error');
      return;
    }

    const supId = generateUUID('SUP');
    const nowIso = new Date().toISOString();
    const fullSupplier: Supplier = {
      supplier_id: supId,
      name: result.clean.name,
      company_name: result.clean.company_name || result.clean.name,
      manager_name: result.clean.manager_name,
      contact_person: result.clean.manager_name,
      phone: result.clean.phone,
      phone_secondary: result.clean.phone_secondary,
      employer_phone: result.clean.employer_phone,
      national_id: result.clean.national_id,
      economic_code: result.clean.economic_code,
      registration_number: result.clean.registration_number,
      postal_code: result.clean.postal_code,
      fax: result.clean.fax,
      province: sanitizeInput(addFormData.province || 'تهران', { maxLength: 50 }),
      city: sanitizeInput(addFormData.city || 'تهران', { maxLength: 50 }),
      address: result.clean.address,
      credit_limit: sanitizeNumber(addFormData.credit_limit, 0, 0, 1000000000000),
      current_balance: calculateBalance(addFormData.balance_type, addFormData.balance_amount),
      supplier_type: addFormData.supplier_type || 'عمده',
      notes: result.clean.notes,
      created_at: nowIso,
      updated_at: nowIso
    };

    try {
      LocalStorageManager.recordLocalChange(
        currentEnv,
        currentUser.user_id,
        'SUPPLIER',
        'CREATE',
        supId,
        fullSupplier,
        'CREATE_SUPPLIER',
        { name: fullSupplier.name, company: fullSupplier.company_name, national_id: fullSupplier.national_id }
      );
      setShowAddModal(false);
      setAddFormData(INITIAL_FORM_DATA);
      triggerDbRefresh();
      showToast(`پرونده تأمین‌کننده «${fullSupplier.company_name || fullSupplier.name}» با موفقیت ثبت شد.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'خطا در ثبت تأمین‌کننده.', 'error');
    }
  };

  // Save edited supplier
  const handleSaveEditSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;

    const result = validateSupplierForm(editFormData);
    if (!result.isValid || !result.clean) {
      showToast(result.error || 'اطلاعات فرم تأمین‌کننده معتبر نیست.', 'error');
      return;
    }

    const fullSupplier: Supplier = {
      ...editingSupplier,
      name: result.clean.name,
      company_name: result.clean.company_name || result.clean.name,
      manager_name: result.clean.manager_name,
      contact_person: result.clean.manager_name,
      phone: result.clean.phone,
      phone_secondary: result.clean.phone_secondary,
      employer_phone: result.clean.employer_phone,
      national_id: result.clean.national_id,
      economic_code: result.clean.economic_code,
      registration_number: result.clean.registration_number,
      postal_code: result.clean.postal_code,
      fax: result.clean.fax,
      province: sanitizeInput(editFormData.province || 'تهران', { maxLength: 50 }),
      city: sanitizeInput(editFormData.city || 'تهران', { maxLength: 50 }),
      address: result.clean.address,
      credit_limit: sanitizeNumber(editFormData.credit_limit, 0, 0, 1000000000000),
      current_balance: calculateBalance(editFormData.balance_type, editFormData.balance_amount),
      supplier_type: editFormData.supplier_type || 'عمده',
      notes: result.clean.notes,
      updated_at: new Date().toISOString()
    };

    try {
      LocalStorageManager.recordLocalChange(
        currentEnv,
        currentUser.user_id,
        'SUPPLIER',
        'UPDATE',
        fullSupplier.supplier_id,
        fullSupplier,
        'UPDATE_SUPPLIER',
        { name: fullSupplier.name, company: fullSupplier.company_name, national_id: fullSupplier.national_id }
      );

      setEditingSupplier(null);
      if (selectedSupplier?.supplier_id === fullSupplier.supplier_id) {
        setSelectedSupplier(fullSupplier);
      }
      triggerDbRefresh();
      showToast(`تغییرات پرونده تأمین‌کننده «${fullSupplier.company_name || fullSupplier.name}» با موفقیت ذخیره شد.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'خطا در ویرایش تأمین‌کننده.', 'error');
    }
  };

  // Delete supplier
  const handleDeleteSupplier = async (sup: Supplier) => {
    const confirmed = await showConfirm({
      title: 'هشدار حذف پرونده تأمین‌کننده',
      message: `آیا از حذف دائم پرونده تأمین‌کننده «${sup.name}» (${sup.company_name || sup.supplier_id}) اطمینان دارید؟`,
      confirmText: 'حذف تأمین‌کننده',
      cancelText: 'انصراف',
      variant: 'danger'
    });
    if (confirmed) {
      try {
        LocalStorageManager.recordLocalChange(
          currentEnv,
          currentUser.user_id,
          'SUPPLIER',
          'DELETE',
          sup.supplier_id,
          { supplier_id: sup.supplier_id, name: sup.name, company_name: sup.company_name },
          'DELETE_SUPPLIER',
          { name: sup.name, company: sup.company_name }
        );
        if (selectedSupplier?.supplier_id === sup.supplier_id) {
          setSelectedSupplier(null);
        }
        if (editingSupplier?.supplier_id === sup.supplier_id) {
          setEditingSupplier(null);
        }
        triggerDbRefresh();
        showToast(`پرونده تأمین‌کننده «${sup.name}» با موفقیت حذف شد.`, 'success');
      } catch (err: any) {
        showToast(err?.message || 'خطا در حذف تأمین‌کننده.', 'error');
      }
    }
  };

  // Render Form Fields for Add/Edit (100% parity with CustomersView fields)
  const renderSupplierFormFields = (
    data: SupplierFormData,
    setData: React.Dispatch<React.SetStateAction<SupplierFormData>>,
    isEdit: boolean,
    supplierId?: string
  ) => {
    return (
      <div className="space-y-4 text-xs text-slate-200">
        {isEdit && supplierId && (
          <div className="flex flex-wrap items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-700/50">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-400">شناسه اختصاصی دیتابیس:</span>
              <span className="font-mono font-bold text-indigo-200">{supplierId}</span>
            </div>
            <span className="text-[11px] text-indigo-300/80">همگام‌سازی سه‌گانه آنلاین/آفلاین</span>
          </div>
        )}

        {/* SECTION 1: Standard Company, Identity, Type & Location */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80 text-indigo-400 font-bold">
            <UserCheck className="w-4 h-4" />
            <span>بخش اول: نام شرکت، طرف حساب، طبقه‌بندی و موقعیت مکانی</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                نام شرکت / مؤسسه / کارخانه <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                value={data.company_name}
                onChange={(e) => setData({ ...data, company_name: e.target.value, name: data.name || e.target.value })}
                placeholder="مثال: شرکت صنایع فولاد نطنز"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                نام طرف حساب / شخص حقیقی <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                placeholder="مثال: مهندس سهرابی"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                نام مدیرعامل / نماینده / شخص رابط
              </label>
              <input
                type="text"
                value={data.manager_name}
                onChange={(e) => setData({ ...data, manager_name: e.target.value })}
                placeholder="مثال: دکتر رضوانی"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                گروه / نوع تأمین‌کننده
              </label>
              <select
                value={data.supplier_type}
                onChange={(e) => setData({ ...data, supplier_type: e.target.value as SupplierFormData['supplier_type'] })}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="عمده">عمده‌فروشی</option>
                <option value="سازمانی">سازمانی / کارخانه مادر</option>
                <option value="پیمانکاری">پیمانکاری و پروژه‌ای</option>
                <option value="خرده">خرده‌فروشی</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                استان
              </label>
              <select
                value={IRAN_PROVINCES.includes(data.province) ? data.province : 'تهران'}
                onChange={(e) => setData({ ...data, province: e.target.value })}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {IRAN_PROVINCES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                شهر / شهرستان
              </label>
              <input
                type="text"
                value={data.city}
                onChange={(e) => setData({ ...data, city: e.target.value })}
                placeholder="تهران"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: National ID, Registration, Economic Code & Postal Code */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80 text-emerald-400 font-bold">
            <FileCheck2 className="w-4 h-4" />
            <span>بخش دوم: شناسه ملی، شماره ثبت، کد اقتصادی و کد پستی</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                شناسه ملی / کد ملی
              </label>
              <input
                type="text"
                value={data.national_id}
                onChange={(e) => setData({ ...data, national_id: e.target.value })}
                placeholder="10860018980"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-emerald-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                شماره ثبت شرکت
              </label>
              <input
                type="text"
                value={data.registration_number}
                onChange={(e) => setData({
                  ...data,
                  registration_number: e.target.value,
                  economic_code: data.economic_code || e.target.value
                })}
                placeholder="61"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-emerald-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                کد اقتصادی
              </label>
              <input
                type="text"
                value={data.economic_code}
                onChange={(e) => setData({ ...data, economic_code: e.target.value })}
                placeholder="411111111111"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-emerald-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                کد پستی ۱۰ رقمی
              </label>
              <input
                type="text"
                value={data.postal_code}
                onChange={(e) => setData({ ...data, postal_code: e.target.value })}
                placeholder="7961943187"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-emerald-500"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: Phones, Fax & Address */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80 text-amber-400 font-bold">
            <PhoneCall className="w-4 h-4" />
            <span>بخش سوم: تلفن کارفرما، تلفن ثابت، فکس و نشانی دقیق</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                تلفن کارفرما / همراه <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="0912-0000000"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-amber-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                تلفن ثابت
              </label>
              <input
                type="text"
                value={data.phone_secondary}
                onChange={(e) => setData({ ...data, phone_secondary: e.target.value })}
                placeholder="021-44556677"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-amber-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                تلفن کارفرما (مستقیم)
              </label>
              <input
                type="text"
                value={data.employer_phone}
                onChange={(e) => setData({ ...data, employer_phone: e.target.value })}
                placeholder="0917-1987468"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-amber-500"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                فکس
              </label>
              <input
                type="text"
                value={data.fax}
                onChange={(e) => setData({ ...data, fax: e.target.value })}
                placeholder="021-44556678"
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-amber-500"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              آدرس دقیق کارخانه / دفتر
            </label>
            <input
              type="text"
              value={data.address}
              onChange={(e) => setData({ ...data, address: e.target.value })}
              placeholder="استان، شهرستان، شهرک صنعتی، پلاک..."
              className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* SECTION 4: Credit Limit, Balance & Notes */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80 text-cyan-400 font-bold">
            <CreditCard className="w-4 h-4" />
            <span>بخش چهارم: سقف اعتبار، مانده حساب و یادداشت</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                سقف اعتبار تجاری (تومان)
              </label>
              <input
                type="number"
                min="0"
                step="10000000"
                value={data.credit_limit}
                onChange={(e) => setData({ ...data, credit_limit: Number(e.target.value) || 0 })}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-cyan-500"
                dir="ltr"
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                معادل: {formatCurrencyToman(data.credit_limit)}
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                وضعیت مانده حساب
              </label>
              <select
                value={data.balance_type}
                onChange={(e) => setData({
                  ...data,
                  balance_type: e.target.value as SupplierFormData['balance_type'],
                  balance_amount: e.target.value === 'ZERO' ? 0 : data.balance_amount
                })}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="ZERO">تسویه کامل (صفر)</option>
                <option value="DEBTOR">بدهکار به ام‌گاز</option>
                <option value="CREDITOR">بستانکار از ام‌گاز</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                مبلغ مانده حساب (تومان)
              </label>
              <input
                type="number"
                min="0"
                disabled={data.balance_type === 'ZERO'}
                value={data.balance_type === 'ZERO' ? 0 : data.balance_amount}
                onChange={(e) => setData({ ...data, balance_amount: Number(e.target.value) || 0 })}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-left focus:outline-none focus:border-cyan-500 disabled:opacity-40"
                dir="ltr"
              />
              {data.balance_type !== 'ZERO' && (
                <span className="text-[11px] text-slate-400 block mt-1">
                  معادل: {formatCurrencyToman(data.balance_amount)}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              یادداشت و شروط قرارداد
            </label>
            <textarea
              rows={2}
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              placeholder="شروط پرداخت، شماره حساب بانکی، توضیحات قرارداد..."
              className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-slate-900/60 p-3 sm:p-4 rounded-xl border border-slate-800">
        <div className="min-w-0 w-full sm:w-auto">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="truncate">مدیریت تأمین‌کنندگان و کارخانجات طرف قرارداد</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ثبت، ویرایش، حذف و مدیریت کامل پرونده تأمین‌کنندگان با ساختار استاندارد همسان مشتریان و همگام‌سازی سه‌گانه
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
          {onSwitchToCustomers && (
            <button
              type="button"
              onClick={onSwitchToCustomers}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-all whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>بخش مشتریان</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAdd}
            title="افزودن و تعریف پرونده تأمین‌کننده جدید"
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>ثبت تأمین‌کننده جدید</span>
          </button>
        </div>
      </div>

      {/* Filters, Search & View Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجو در نام شرکت، طرف حساب، شناسه ملی، شماره ثبت، کدپستی، تلفن، آدرس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">گروه:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full sm:w-auto bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-indigo-500 truncate"
            >
              <option value="ALL">همه تأمین‌کنندگان ({toPersianDigits(suppliers.length)})</option>
              <option value="عمده">عمده‌فروشی</option>
              <option value="سازمانی">سازمانی / کارخانه مادر</option>
              <option value="پیمانکاری">پیمانکاری و پروژه‌ای</option>
              <option value="خرده">خرده‌فروشی</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="نمایش کارتی"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>کارتی</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="نمایش جدول کامل"
            >
              <List className="w-3.5 h-3.5" />
              <span>جدول</span>
            </button>
          </div>
        </div>
      </div>

      {/* Suppliers List View (Full Customer-parity Columns) */}
      {viewMode === 'list' ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] text-indigo-300 select-none">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
              <span>جدول را به چپ یا راست بکشید (اسکرول لمسی)</span>
            </span>
            <span className="text-slate-500 font-mono text-[10px]">مشخصات کامل ⇄</span>
          </div>

          <div className="overflow-x-auto -webkit-overflow-scrolling-touch overscroll-x-contain relative">
            <table className="w-full text-right text-xs min-w-[1000px] sm:min-w-[1150px] border-collapse">
              <thead className="bg-slate-950/95 text-slate-400 border-b border-slate-800 text-[11px] select-none">
                <tr>
                  <th className="p-3 w-12 text-center sticky right-0 z-20 bg-slate-950 border-b border-slate-800 shadow-[-2px_0_4px_rgba(0,0,0,0.4)]">ردیف</th>
                  <th className="p-3 min-w-[190px] sm:min-w-[210px] sticky right-12 z-20 bg-slate-950 border-b border-slate-800 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]">نام شرکت / تأمین‌کننده</th>
                  <th className="p-3">شناسه ملی</th>
                  <th className="p-3">شماره ثبت / اقتصادی</th>
                  <th className="p-3">کد پستی</th>
                  <th className="p-3">تلفن کارفرما / همراه</th>
                  <th className="p-3">تلفن ثابت</th>
                  <th className="p-3">فکس</th>
                  <th className="p-3 min-w-[220px]">آدرس</th>
                  <th className="p-3">مانده حساب</th>
                  <th className="p-3 text-center sticky left-0 z-20 bg-slate-950 border-b border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filtered.map((s, idx) => (
                  <tr
                    key={s.supplier_id}
                    onClick={() => setSelectedSupplier(s)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    <td className="p-3 text-center font-mono text-slate-400 font-bold sticky right-0 z-10 bg-slate-900 group-hover:bg-slate-850 shadow-[-2px_0_4px_rgba(0,0,0,0.4)] transition-colors">
                      {toPersianDigits(s.row_index || idx + 1)}
                    </td>
                    <td className="p-3 sticky right-12 z-10 bg-slate-900 group-hover:bg-slate-850 shadow-[-4px_0_8px_rgba(0,0,0,0.5)] transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-950/70 border border-amber-700/50 flex items-center justify-center text-amber-300 font-bold text-xs shrink-0">
                          {s.company_name?.slice(0, 1) || s.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-100 group-hover:text-indigo-300 transition-colors truncate max-w-[190px] sm:max-w-[240px]" title={s.company_name || s.name}>
                            {s.company_name || s.name}
                          </div>
                          {s.name && s.name !== s.company_name && (
                            <span className="block text-[10px] text-slate-400 truncate max-w-[180px]">
                              طرف حساب: {s.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-300" dir="ltr">
                      {s.national_id ? toPersianDigits(s.national_id) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-300" dir="ltr">
                      {s.registration_number || s.economic_code ? toPersianDigits(s.registration_number || s.economic_code) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 font-mono text-slate-300" dir="ltr">
                      {s.postal_code ? toPersianDigits(s.postal_code) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 font-mono text-amber-300 font-bold text-[11px] truncate max-w-[160px]" dir="ltr" title={s.phone}>
                      {s.phone ? toPersianDigits(s.phone) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 font-mono text-slate-300 text-[11px] truncate max-w-[140px]" dir="ltr" title={s.phone_secondary}>
                      {s.phone_secondary ? toPersianDigits(s.phone_secondary) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 font-mono text-slate-400 text-[11px] truncate max-w-[120px]" dir="ltr">
                      {s.fax ? toPersianDigits(s.fax) : <span className="text-slate-600 font-normal">--</span>}
                    </td>
                    <td className="p-3 text-[11px] text-slate-300 max-w-xs truncate" title={s.address}>
                      {s.address || <span className="text-slate-600">--</span>}
                    </td>
                    <td className="p-3">
                      <span className={`font-mono font-bold text-xs whitespace-nowrap ${
                        s.current_balance > 0
                          ? 'text-emerald-400'
                          : s.current_balance < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}>
                        {s.current_balance === 0 ? 'تسویه' : formatCurrencyToman(Math.abs(s.current_balance))}
                      </span>
                    </td>
                    <td className="p-3 text-center sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-850 shadow-[4px_0_8px_rgba(0,0,0,0.5)] transition-colors" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(s)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="ویرایش پرونده"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupplier(s)}
                          className="px-2 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="حذف دائم پرونده"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedSupplier(s)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          title="مشاهده پرونده کامل"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View - Fully Responsive on Mobile & Tablet */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((s) => (
            <div
              key={s.supplier_id}
              onClick={() => setSelectedSupplier(s)}
              className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer group hover:shadow-lg hover:shadow-indigo-950/20 relative flex flex-col justify-between min-w-0"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2.5 sm:mb-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-950/70 border border-amber-700/50 flex items-center justify-center text-amber-300 font-bold text-xs sm:text-sm shrink-0 shadow-inner">
                      {s.company_name?.slice(0, 1) || s.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors truncate" title={s.company_name || s.name}>
                          {s.company_name || s.name}
                        </h3>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-950/90 text-amber-300 border border-amber-700/60 inline-flex items-center gap-1 shrink-0">
                          <Truck className="w-2.5 h-2.5 text-amber-400" />
                          <span>تأمین‌کننده ({s.supplier_type || 'عمده'})</span>
                        </span>
                      </div>
                      {s.name && s.name !== s.company_name ? (
                        <span className="text-[10px] sm:text-[11px] text-slate-300 font-semibold block truncate mt-0.5">
                          طرف حساب: {s.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                          {s.province ? `${s.province}${s.city && s.city !== s.province ? ` - ${s.city}` : ''}` : 'ام‌گاز'}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{s.supplier_id}</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">شناسه ملی:</span>
                    <span className="font-mono text-slate-200 font-bold text-[11px] truncate max-w-[65%]" dir="ltr">
                      {s.national_id ? toPersianDigits(s.national_id) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">شماره ثبت / اقتصادی:</span>
                    <span className="font-mono text-slate-200 text-[11px] truncate max-w-[65%]" dir="ltr">
                      {s.registration_number || s.economic_code ? toPersianDigits(s.registration_number || s.economic_code) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">کد پستی:</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[65%]" dir="ltr">
                      {s.postal_code ? toPersianDigits(s.postal_code) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">تلفن کارفرما / همراه:</span>
                    <span className="font-mono text-amber-300 font-bold text-[11px] truncate max-w-[65%] text-left" dir="ltr" title={s.phone}>
                      {s.phone ? toPersianDigits(s.phone) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">تلفن ثابت:</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[65%] text-left" dir="ltr" title={s.phone_secondary}>
                      {s.phone_secondary ? toPersianDigits(s.phone_secondary) : '--'}
                    </span>
                  </div>
                  {s.fax ? (
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-slate-500 shrink-0 text-[11px]">فکس:</span>
                      <span className="font-mono text-slate-400 text-[11px] truncate max-w-[65%] text-left" dir="ltr">
                        {toPersianDigits(s.fax)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0 text-[11px]">مانده حساب:</span>
                    <span className={`font-bold text-[11px] ${
                      s.current_balance > 0 ? 'text-emerald-400' : s.current_balance < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}>
                      {s.current_balance === 0 ? 'تسویه کامل' : formatCurrencyToman(Math.abs(s.current_balance))}
                      {s.current_balance > 0 ? ' (بستانکار)' : s.current_balance < 0 ? ' (بدهکار)' : ''}
                    </span>
                  </div>
                  {s.address ? (
                    <div className="text-[11px] text-slate-400 pt-1 line-clamp-2 break-words leading-relaxed border-t border-slate-800/40" title={s.address}>
                      <span className="text-slate-500">نشانی:</span> {s.address}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pt-2.5 sm:pt-3 border-t border-slate-800/90 mt-2.5 sm:mt-3 flex items-center gap-1.5 flex-wrap sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(s)}
                  className="flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="ویرایش کامل پرونده"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>ویرایش</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSupplier(s)}
                  className="flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="حذف دائمی تأمین‌کننده"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>حذف</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplier(s)}
                  className="py-1.5 px-2.5 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                  title="مشاهده جزئیات کامل پرونده"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-8 text-center text-slate-400">
          <Truck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-medium">هیچ پرونده تأمین‌کننده‌ای با این جستجو یافت نشد</p>
          <p className="text-xs text-slate-500 mt-1">
            برای ثبت تأمین‌کننده جدید روی دکمه «ثبت تأمین‌کننده جدید» کلیک کنید.
          </p>
        </div>
      )}

      {/* ====================================================================== */}
      {/* ADD SINGLE SUPPLIER MODAL                                              */}
      {/* ====================================================================== */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl my-auto shadow-2xl overflow-hidden cursor-default flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تعریف و ثبت پرونده تأمین‌کننده جدید</h3>
                  <p className="text-[11px] text-slate-400">
                    ثبت مشخصات کامل حقوقی، تماس، کدهای قانونی و وضعیت مالی مطابق استاندارد مشتریان
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddSupplier} className="flex-1 overflow-y-auto p-4 sm:p-5">
              {renderSupplierFormFields(addFormData, setAddFormData, false)}

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>ثبت نهایی پرونده</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* EDIT SUPPLIER MODAL                                                    */}
      {/* ====================================================================== */}
      {editingSupplier && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl my-auto shadow-2xl overflow-hidden cursor-default flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>ویرایش پرونده تأمین‌کننده: {editingSupplier.company_name || editingSupplier.name}</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    بروزرسانی مشخصات هویتی و کدهای قانونی با صدور رویداد اتمیک UPDATE
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSupplier(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSupplier} className="flex-1 overflow-y-auto p-4 sm:p-5">
              {renderSupplierFormFields(editFormData, setEditFormData, true, editingSupplier.supplier_id)}

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteSupplier(editingSupplier)}
                    className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="حذف دائمی این تأمین‌کننده"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف پرونده</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSupplier(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                  >
                    انصراف
                  </button>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>ذخیره تغییرات پرونده</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SUPPLIER DETAILS DRAWER / VIEW MODAL                                   */}
      {/* ====================================================================== */}
      {selectedSupplier && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl my-auto shadow-2xl p-5 space-y-4 cursor-default max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-base shrink-0">
                  {selectedSupplier.company_name?.slice(0, 1) || selectedSupplier.name.slice(0, 1)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedSupplier.company_name || selectedSupplier.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    طرف حساب: {selectedSupplier.name}
                    {(selectedSupplier.manager_name || selectedSupplier.contact_person) &&
                      ` — نماینده: ${selectedSupplier.manager_name || selectedSupplier.contact_person}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedSupplier(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">استان یا شهر و گروه:</div>
                <div className="text-amber-300 font-bold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      {selectedSupplier.province
                        ? (selectedSupplier.city && selectedSupplier.city !== selectedSupplier.province
                            ? `${selectedSupplier.province} - ${selectedSupplier.city}`
                            : `استان ${selectedSupplier.province}`)
                        : (selectedSupplier.city ? `شهر ${selectedSupplier.city}` : 'نامشخص')}
                    </span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    {selectedSupplier.supplier_type || 'عمده'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">شناسه ملی / شماره ثبت / اقتصادی:</div>
                <div className="font-mono text-slate-200 text-[11px] space-y-0.5" dir="ltr">
                  <div>ملی: {selectedSupplier.national_id ? toPersianDigits(selectedSupplier.national_id) : '--'}</div>
                  <div>ثبت: {selectedSupplier.registration_number ? toPersianDigits(selectedSupplier.registration_number) : '--'} | اقتصادی: {selectedSupplier.economic_code ? toPersianDigits(selectedSupplier.economic_code) : '--'}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">تلفن همراه / کارفرما:</div>
                <div className="font-mono text-amber-300 font-bold" dir="ltr">
                  {selectedSupplier.phone ? toPersianDigits(selectedSupplier.phone) : '--'}
                  {selectedSupplier.employer_phone && selectedSupplier.employer_phone !== selectedSupplier.phone && (
                    <span className="block text-slate-300 font-normal mt-0.5">
                      کارفرما: {toPersianDigits(selectedSupplier.employer_phone)}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">تلفن ثابت و فکس:</div>
                <div className="font-mono text-slate-200" dir="ltr">
                  <span>ثابت: {selectedSupplier.phone_secondary ? toPersianDigits(selectedSupplier.phone_secondary) : '--'}</span>
                  <span className="mx-2">|</span>
                  <span>فکس: {selectedSupplier.fax ? toPersianDigits(selectedSupplier.fax) : '--'}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">سقف اعتبار تجاری:</div>
                <div className="font-mono text-cyan-300 font-bold">
                  {formatCurrencyToman(selectedSupplier.credit_limit || 0)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px] mb-1">وضعیت مانده حساب:</div>
                <div className={`font-mono font-bold ${
                  selectedSupplier.current_balance > 0
                    ? 'text-emerald-400'
                    : selectedSupplier.current_balance < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}>
                  {selectedSupplier.current_balance === 0
                    ? 'تسویه کامل (صفر)'
                    : `${formatCurrencyToman(Math.abs(selectedSupplier.current_balance))} (${selectedSupplier.current_balance > 0 ? 'بستانکار از ام‌گاز' : 'بدهکار به ام‌گاز'})`}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 sm:col-span-2">
                <div className="text-slate-500 text-[11px] mb-1">کدپستی و آدرس دقیق:</div>
                <div className="text-slate-200 leading-relaxed">
                  {selectedSupplier.postal_code && (
                    <span className="font-mono text-indigo-300 font-bold ml-2">کدپستی: {toPersianDigits(selectedSupplier.postal_code)} - </span>
                  )}
                  {selectedSupplier.address || 'نشانی ثبت نشده است'}
                </div>
              </div>

              {selectedSupplier.notes && (
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 sm:col-span-2">
                  <div className="text-slate-500 text-[11px] mb-1">یادداشت و شروط قرارداد:</div>
                  <div className="text-slate-300 whitespace-pre-line leading-relaxed">{selectedSupplier.notes}</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
              <span>شناسه: <span className="font-mono text-slate-400">{selectedSupplier.supplier_id}</span></span>
              <span>آخرین بروزرسانی: {formatPersianDateTime(selectedSupplier.updated_at)}</span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleDeleteSupplier(selectedSupplier)}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف پرونده</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenEdit(selectedSupplier);
                    setSelectedSupplier(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>ویرایش پرونده</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplier(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
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
