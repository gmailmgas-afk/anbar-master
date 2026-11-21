import React, { useState, useEffect, useRef } from 'react';
import { GasKardexEntry, Customer, Supplier, RuntimeEnvironment, User, GoodsReceiptRecord, StockMovement, Product } from '../types';
import { numberToPersianWords } from '../utils/numberToPersianWords';
import { formatNumberEn, toEnglishDigits, toPersianDigits, getPersianDate } from '../utils/persian';
import { printReceiptSheet } from '../utils/receiptPrint';
import { exportElementToPdf } from '../utils/pdfExport';
import { allocateNextUniqueReceiptNumber } from '../utils/receiptSerial';
import { LocalStorageManager } from '../database/storage';
import { SEED_USERS } from '../database/seed-data';
import { Printer, X, Download, Flame, Edit3, RotateCcw, RefreshCw, Database, Save, CheckCircle2, Lock, Clock, Plus, Trash2, Eraser, Eye } from 'lucide-react';

export interface GoodsEntryItem {
  rowNum: number;
  description: string;
  quantity: number | '';
  quantityInWords: string;
  freightCost: string;
  remarks: string;
}

export interface GoodsEntryFormData {
  formNumber: string;
  date: string;
  sender: string; // فرستنده
  deliveredBy: string; // توسط آقای
  vehicleNumber: string; // وسیله شماره
  receiverName: string; // اینجانب ...
  driverCardOrSheba?: string; // شماره کارت/شبا
  driverNationalId?: string; // شماره کد ملی راننده
  dispatchedQuantity: number | string; // فیلد متنی کاردکس ورود و خروج / ارسالی
  scrapBalance: number | ''; // مانده ضایعات کاردکس گاز
  items: GoodsEntryItem[];
  warehouseSigner: string;
  driverSigner?: string;
  adminSigner: string;
  delivererSigner: string; // امضاء سرپرست
}

interface GoodsEntryReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry?: GasKardexEntry | null;
  customer?: Customer | null;
  customers?: Customer[];
  suppliers?: Supplier[];
  currentEnv?: RuntimeEnvironment;
  currentUser?: User;
  onSwitchToExitForm?: () => void;
  onSaved?: (receipt: GoodsReceiptRecord) => void;
  onSuccess?: () => void;
  movement?: StockMovement | null;
  products?: Product[];
}

export const GoodsEntryReceiptModal: React.FC<GoodsEntryReceiptModalProps> = ({
  isOpen,
  onClose,
  entry,
  customer,
  customers,
  suppliers,
  currentEnv: activeEnv = 'OFFICE_WIN11',
  currentUser,
  onSwitchToExitForm,
  onSaved,
  onSuccess,
  movement,
  products = []
}: GoodsEntryReceiptModalProps) => {
  const currentEnv: RuntimeEnvironment = activeEnv;

  // Build default line items based on entry data or movement data
  const buildInitialItems = (): GoodsEntryItem[] => {
    const items: GoodsEntryItem[] = [];
    let rowCount = 1;

    if (movement) {
      const prod = products.find(p => p.product_id === movement.product_id);
      const isDefective = movement.item_condition === 'DEFECTIVE';
      const condLabel = isDefective ? ' (شیر کهنه)' : ' (نو / سالم)';
      const desc = prod ? `${prod.name}${condLabel}` : `کالا شناسه ${movement.product_id}${condLabel}`;
      const qty = Number(movement.quantity) || 1;
      items.push({
        rowNum: rowCount++,
        description: desc,
        quantity: qty,
        quantityInWords: numberToPersianWords(qty),
        freightCost: '',
        remarks: ''
      });
    } else if (entry) {
      // 1. Incoming cylinder
      if (entry.cylinder_in > 0) {
        items.push({
          rowNum: rowCount++,
          description: entry.cylinder_type ? `${entry.cylinder_type} گاز مایع وارده` : 'سیلندر گاز مایع 11 کیلوگرمی وارده',
          quantity: entry.cylinder_in,
          quantityInWords: numberToPersianWords(entry.cylinder_in),
          freightCost: '',
          remarks: ''
        });
      }

      // 2. Incoming segregated valve items (if recorded in entry.valve_items)
      let coveredNewValveInQty = 0;
      let coveredUsedValveInQty = 0;

      if (entry.valve_items && entry.valve_items.length > 0) {
        const inValves = entry.valve_items.filter(v => v.direction === 'IN' || (!v.direction && (entry.new_valve_in > 0 || entry.used_valve_in > 0)));
        inValves.forEach(v => {
          const isNew = v.valve_category === 'NEW';
          const qty = Number(v.quantity) || 1;
          if (isNew) coveredNewValveInQty += qty;
          else coveredUsedValveInQty += qty;

          items.push({
            rowNum: rowCount++,
            description: `${v.valve_name} ${isNew ? '(شیر نو استاندارد)' : '(شیر کهنه تعویض‌شده)'}`,
            quantity: qty,
            quantityInWords: numberToPersianWords(qty),
            freightCost: '',
            remarks: ''
          });
        });
      }

      // 3. New valves in (if not fully covered by valve_items)
      const remainingNewValveIn = Math.max(0, (entry.new_valve_in || 0) - coveredNewValveInQty);
      if (remainingNewValveIn > 0) {
        const vName = entry.valve_subtype ? `شیر نو (${entry.valve_subtype})` : (entry.cylinder_type ? `شیر نو متناظر ${entry.cylinder_type}` : 'شیر نو سیلندر گاز مایع');
        items.push({
          rowNum: rowCount++,
          description: `${vName} وارده جهت نصب`,
          quantity: remainingNewValveIn,
          quantityInWords: numberToPersianWords(remainingNewValveIn),
          freightCost: '',
          remarks: ''
        });
      }

      // 4. Used valves in (if not fully covered by valve_items)
      const remainingUsedValveIn = Math.max(0, (entry.used_valve_in || 0) - coveredUsedValveInQty);
      if (remainingUsedValveIn > 0) {
        const vName = entry.valve_subtype ? `شیر کهنه (${entry.valve_subtype})` : (entry.cylinder_type ? `شیر کهنه ${entry.cylinder_type}` : 'شیر کهنه سیلندر');
        items.push({
          rowNum: rowCount++,
          description: `${vName} دریافتی از مشتری`,
          quantity: remainingUsedValveIn,
          quantityInWords: numberToPersianWords(remainingUsedValveIn),
          freightCost: '',
          remarks: ''
        });
      }

      // 5. Outgoing cylinder fallback if opened in entry form
      if (items.length === 0 && entry.cylinder_out > 0) {
        items.push({
          rowNum: rowCount++,
          description: entry.cylinder_type ? `ارسال / خروج ${entry.cylinder_type} گاز مایع` : 'ارسال / خروج سیلندر گاز مایع',
          quantity: entry.cylinder_out,
          quantityInWords: numberToPersianWords(entry.cylinder_out),
          freightCost: '',
          remarks: ''
        });
      }

      // 6. Scrap out
      if (entry.scrap_out > 0) {
        items.push({
          rowNum: rowCount++,
          description: 'ضایعات اسقاطی سیلندر گاز',
          quantity: entry.scrap_out,
          quantityInWords: numberToPersianWords(entry.scrap_out),
          freightCost: '',
          remarks: ''
        });
      }
    }

    // Ensure 3 rows default so it fits cleanly in 1 A5 page
    while (items.length < 3) {
      items.push({
        rowNum: rowCount++,
        description: '',
        quantity: '',
        quantityInWords: '',
        freightCost: '',
        remarks: ''
      });
    }

    return items;
  };

  // Check if there is already a saved receipt in the database for this entry
  const [existingDbReceipt, setExistingDbReceipt] = useState<GoodsReceiptRecord | null>(null);
  const [numberingMode, setNumberingMode] = useState<'AUTO' | 'MANUAL'>('AUTO');

  const [formData, setFormData] = useState<GoodsEntryFormData>(() => {
    if (movement) {
      const savedInDb = LocalStorageManager.getGoodsReceiptByEntryId(currentEnv, movement.movement_id, 'ENTRY') ||
        (movement.reference_id ? LocalStorageManager.getGoodsReceiptByFormNumber(currentEnv, movement.reference_id, 'ENTRY') : undefined);
      if (savedInDb) {
        return {
          formNumber: savedInDb.form_number,
          date: savedInDb.date,
          sender: savedInDb.party_name || movement.customer_name || (movement as any).supplier_name || 'شرکت طرف حساب',
          deliveredBy: savedInDb.driver_name || movement.driver_name || 'راننده توزیع / نماینده',
          vehicleNumber: savedInDb.plate_number || movement.plate_number || 'ایران 22 - 345 ع 78',
          receiverName: savedInDb.signer_1 || currentUser?.full_name || 'مسئول دریافت و انبار',
          driverCardOrSheba: savedInDb.driver_card_or_sheba || '',
          driverNationalId: savedInDb.driver_national_id || '',
          dispatchedQuantity: '',
          scrapBalance: '',
          items: savedInDb.items && savedInDb.items.length > 0 ? (savedInDb.items as any) : buildInitialItems(),
          warehouseSigner: savedInDb.signer_3 || 'مسئول انبار',
          adminSigner: 'امور اداری و مالی',
          delivererSigner: savedInDb.signer_2 || 'سرپرست'
        };
      }
      const autoSerial = allocateNextUniqueReceiptNumber(currentEnv, 'ENTRY');
      const numStr = movement.reference_id?.match(/\d+/)?.[0] || movement.reference_id || autoSerial;
      return {
        formNumber: numStr,
        date: getPersianDate(movement.created_at),
        sender: movement.customer_name || (movement as any).supplier_name || customer?.name || 'شرکت طرف حساب',
        deliveredBy: movement.driver_name || (movement.notes?.includes('راننده:') ? movement.notes.split('راننده:')[1]?.split('|')[0]?.trim() : '') || 'راننده توزیع / نماینده',
        vehicleNumber: movement.plate_number || (movement.notes?.includes('خودرو:') ? movement.notes.split('خودرو:')[1]?.split('|')[0]?.trim() : '') || 'ایران 22 - 345 ع 78',
        receiverName: currentUser?.full_name || 'مسئول دریافت و انبار',
        driverCardOrSheba: '',
        driverNationalId: '',
        dispatchedQuantity: '',
        scrapBalance: '',
        items: buildInitialItems(),
        warehouseSigner: 'مسئول انبار',
        adminSigner: 'امور اداری و مالی',
        delivererSigner: 'سرپرست'
      };
    }

    const initialDispatched = (entry?.dispatched !== undefined && Number(entry.dispatched) > 0) ? entry.dispatched : '';
    const initialScrapBalance = (entry?.scrap_balance !== undefined && Number(entry.scrap_balance) > 0) ? entry.scrap_balance : '';
    if (entry?.entry_id) {
      const savedInDb = LocalStorageManager.getGoodsReceiptByEntryId(currentEnv, entry.entry_id, 'ENTRY');
      if (savedInDb) {
        return {
          formNumber: savedInDb.form_number,
          date: savedInDb.date,
          sender: savedInDb.party_name || customer?.name || 'شرکت البرز گاز',
          deliveredBy: savedInDb.driver_name || customer?.manager_name || 'راننده توزیع / نماینده',
          vehicleNumber: savedInDb.plate_number || 'ایران 22 - 345 ع 78',
          receiverName: savedInDb.signer_1 || 'مسئول دریافت و تعمیرات انبار',
          driverCardOrSheba: savedInDb.driver_card_or_sheba || '',
          driverNationalId: savedInDb.driver_national_id || '',
          dispatchedQuantity: savedInDb.dispatched !== undefined ? (Number(savedInDb.dispatched) > 0 ? savedInDb.dispatched : '') : initialDispatched,
          scrapBalance: savedInDb.scrap_balance !== undefined ? (Number(savedInDb.scrap_balance) > 0 ? savedInDb.scrap_balance : '') : initialScrapBalance,
          items: savedInDb.items && savedInDb.items.length > 0 ? (savedInDb.items as any) : buildInitialItems(),
          warehouseSigner: savedInDb.signer_3 || 'مسئول انبار',
          adminSigner: 'امور اداری و مالی',
          delivererSigner: savedInDb.signer_2 || 'سرپرست'
        };
      }
    }

    const autoSerial = allocateNextUniqueReceiptNumber(currentEnv, 'ENTRY');

    // Generate numeric form number or extract from transfer sheet
    let numStr = autoSerial;
    if (entry?.transfer_sheet_number) {
      const match = entry.transfer_sheet_number.match(/\d+/);
      if (match) {
        numStr = match[0];
      }
    }

    return {
      formNumber: numStr,
      date: entry?.date || '1405/06/23',
      sender: customer?.name || 'شرکت البرز گاز',
      deliveredBy: customer?.manager_name || 'راننده توزیع / نماینده',
      vehicleNumber: 'ایران 22 - 345 ع 78',
      receiverName: 'مسئول دریافت و تعمیرات انبار',
      driverCardOrSheba: '',
      driverNationalId: '',
      dispatchedQuantity: initialDispatched,
      scrapBalance: initialScrapBalance,
      items: buildInitialItems(),
      warehouseSigner: 'مسئول انبار',
      adminSigner: 'امور اداری و مالی',
      delivererSigner: 'سرپرست'
    };
  });

  useEffect(() => {
    if (!isOpen) return;

    if (movement) {
      const savedInDb = LocalStorageManager.getGoodsReceiptByEntryId(currentEnv, movement.movement_id, 'ENTRY') ||
        (movement.reference_id ? LocalStorageManager.getGoodsReceiptByFormNumber(currentEnv, movement.reference_id, 'ENTRY') : undefined);
      if (savedInDb) {
        setExistingDbReceipt(savedInDb);
        setFormData({
          formNumber: savedInDb.form_number,
          date: savedInDb.date,
          sender: savedInDb.party_name || movement.customer_name || (movement as any).supplier_name || 'شرکت طرف حساب',
          deliveredBy: savedInDb.driver_name || movement.driver_name || 'راننده توزیع / نماینده',
          vehicleNumber: savedInDb.plate_number || movement.plate_number || 'ایران 22 - 345 ع 78',
          receiverName: savedInDb.signer_1 || currentUser?.full_name || 'مسئول دریافت و انبار',
          driverCardOrSheba: savedInDb.driver_card_or_sheba || '',
          driverNationalId: savedInDb.driver_national_id || '',
          dispatchedQuantity: '',
          scrapBalance: '',
          items: savedInDb.items && savedInDb.items.length > 0 ? (savedInDb.items as any) : buildInitialItems(),
          warehouseSigner: savedInDb.signer_3 || 'مسئول انبار',
          driverSigner: savedInDb.signer_4 || savedInDb.driver_name || movement.driver_name || 'امضاء راننده',
          adminSigner: 'امور اداری و مالی',
          delivererSigner: savedInDb.signer_2 || 'سرپرست'
        });
        return;
      }

      const autoSerial = allocateNextUniqueReceiptNumber(currentEnv, 'ENTRY');
      const numStr = movement.reference_id?.match(/\d+/)?.[0] || movement.reference_id || autoSerial;
      setExistingDbReceipt(null);
      setFormData({
        formNumber: numStr,
        date: getPersianDate(movement.created_at),
        sender: movement.customer_name || (movement as any).supplier_name || customer?.name || 'شرکت طرف حساب',
        deliveredBy: movement.driver_name || (movement.notes?.includes('راننده:') ? movement.notes.split('راننده:')[1]?.split('|')[0]?.trim() : '') || 'راننده توزیع / نماینده',
        vehicleNumber: movement.plate_number || (movement.notes?.includes('خودرو:') ? movement.notes.split('خودرو:')[1]?.split('|')[0]?.trim() : '') || 'ایران 22 - 345 ع 78',
        receiverName: currentUser?.full_name || 'مسئول دریافت و انبار',
        driverCardOrSheba: '',
        driverNationalId: '',
        dispatchedQuantity: '',
        scrapBalance: '',
        items: buildInitialItems(),
        warehouseSigner: 'مسئول انبار',
        driverSigner: movement.driver_name || 'امضاء راننده',
        adminSigner: 'امور اداری و مالی',
        delivererSigner: 'سرپرست'
      });
      return;
    }

    const initialDispatched = (entry?.dispatched !== undefined && Number(entry.dispatched) > 0) ? entry.dispatched : '';
    const initialScrapBalance = (entry?.scrap_balance !== undefined && Number(entry.scrap_balance) > 0) ? entry.scrap_balance : '';

    if (entry?.entry_id) {
      const savedInDb = LocalStorageManager.getGoodsReceiptByEntryId(currentEnv, entry.entry_id, 'ENTRY');
      if (savedInDb) {
        setExistingDbReceipt(savedInDb);
        setFormData({
          formNumber: savedInDb.form_number,
          date: savedInDb.date,
          sender: savedInDb.party_name || customer?.name || 'شرکت البرز گاز',
          deliveredBy: savedInDb.driver_name || customer?.manager_name || 'راننده توزیع / نماینده',
          vehicleNumber: savedInDb.plate_number || 'ایران 22 - 345 ع 78',
          receiverName: savedInDb.signer_1 || 'مسئول دریافت و تعمیرات انبار',
          driverCardOrSheba: savedInDb.driver_card_or_sheba || '',
          driverNationalId: savedInDb.driver_national_id || '',
          dispatchedQuantity: savedInDb.dispatched !== undefined ? (Number(savedInDb.dispatched) > 0 ? savedInDb.dispatched : '') : initialDispatched,
          scrapBalance: savedInDb.scrap_balance !== undefined ? (Number(savedInDb.scrap_balance) > 0 ? savedInDb.scrap_balance : '') : initialScrapBalance,
          items: savedInDb.items && savedInDb.items.length > 0 ? (savedInDb.items as any) : buildInitialItems(),
          warehouseSigner: savedInDb.signer_3 || 'مسئول انبار',
          driverSigner: savedInDb.signer_4 || savedInDb.driver_name || 'امضاء راننده',
          adminSigner: 'امور اداری و مالی',
          delivererSigner: savedInDb.signer_2 || 'سرپرست'
        });
        return;
      }
    }

    const autoSerial = allocateNextUniqueReceiptNumber(currentEnv, 'ENTRY');

    setExistingDbReceipt(null);
    let numStr = autoSerial;
    if (entry?.transfer_sheet_number) {
      const match = entry.transfer_sheet_number.match(/\d+/);
      if (match) {
        numStr = match[0];
      }
    }

    setFormData({
      formNumber: numStr,
      date: entry?.date || '1405/06/23',
      sender: customer?.name || 'شرکت البرز گاز',
      deliveredBy: customer?.manager_name || 'راننده توزیع / نماینده',
      vehicleNumber: 'ایران 22 - 345 ع 78',
      receiverName: 'مسئول دریافت و تعمیرات انبار',
      driverCardOrSheba: '',
      driverNationalId: '',
      dispatchedQuantity: initialDispatched,
      scrapBalance: initialScrapBalance,
      items: buildInitialItems(),
      warehouseSigner: 'مسئول انبار',
      driverSigner: customer?.manager_name || 'امضاء راننده',
      adminSigner: 'امور اداری و مالی',
      delivererSigner: 'سرپرست'
    });
  }, [entry?.entry_id, entry?.dispatched, entry?.scrap_balance, movement?.movement_id, movement?.quantity, isOpen, currentEnv, customer?.name]);

  const handleGenerateNextSerial = () => {
    const nextSerial = allocateNextUniqueReceiptNumber(currentEnv, 'ENTRY');
    setFormData(prev => ({ ...prev, formNumber: nextSerial }));
    setSaveNotification(`شماره سریال جدید (${nextSerial}) اختصاص یافت.`);
    setTimeout(() => setSaveNotification(null), 2500);
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const docCreatedAt = existingDbReceipt?.created_at || entry?.created_at || movement?.created_at;
  const isUpdatingExisting = Boolean(existingDbReceipt);
  const editPermission = LocalStorageManager.checkDocumentEditPermission(
    currentEnv || 'OFFICE_WIN11',
    currentUser || null,
    isUpdatingExisting ? docCreatedAt : undefined
  );

  const handleSaveToDatabase = () => {
    if (isUpdatingExisting && !editPermission.allowed) {
      setSaveNotification(editPermission.reason || 'ویرایش سند مسدود است.');
      return;
    }

    setSaveStatus('saving');
    try {
      const dispVal = formData.dispatchedQuantity !== undefined && formData.dispatchedQuantity !== null && String(formData.dispatchedQuantity).trim() !== '' && String(formData.dispatchedQuantity).trim() !== '0' && String(formData.dispatchedQuantity).trim() !== '۰'
        ? String(formData.dispatchedQuantity).trim()
        : '';
      const scrapNum = formData.scrapBalance !== '' ? Number(formData.scrapBalance) : 0;
      const record = LocalStorageManager.saveGoodsReceipt(
        currentEnv || 'OFFICE_WIN11',
        {
          receipt_id: existingDbReceipt?.receipt_id,
          receipt_type: 'ENTRY',
          form_number: formData.formNumber,
          date: formData.date,
          customer_id: movement?.customer_id || customer?.customer_id || entry?.customer_id,
          customer_name: movement?.customer_name || customer?.name || entry?.customer_name,
          entry_id: movement ? movement.movement_id : entry?.entry_id,
          party_name: formData.sender,
          party_type: movement?.party_type || (movement?.customer_id || customer ? 'CUSTOMER' : 'SUPPLIER'),
          vehicle_type: 'کامیون / خاور حمل گاز',
          plate_number: formData.vehicleNumber,
          driver_name: formData.deliveredBy,
          waybill_number: movement?.waybill_number || movement?.reference_id || '',
          driver_card_or_sheba: formData.driverCardOrSheba,
          driver_national_id: formData.driverNationalId,
          dispatched: dispVal,
          scrap_balance: scrapNum,
          items: formData.items,
          signer_1: formData.receiverName,
          signer_2: formData.delivererSigner,
          signer_3: formData.warehouseSigner,
          signer_4: formData.driverSigner || formData.deliveredBy,
          user_id: currentUser?.user_id || 'USR-001',
          created_by_username: currentUser?.username || (currentUser?.user_id === 'USR-002' ? 'karami' : currentUser?.user_id === 'USR-003' ? 'hajivand' : 'amouei')
        },
        currentUser?.user_id || 'USR-001'
      );

      // Also ensure the GasKardexEntry has the updated dispatched, waybill_number and scrap_balance quantity
      if (entry?.entry_id) {
        const waybillVal = movement?.waybill_number || movement?.reference_id || '';
        const finalDisp = dispVal || waybillVal || '';
        LocalStorageManager.updateKardexEntry(
          currentEnv || 'OFFICE_WIN11',
          entry.entry_id,
          { dispatched: finalDisp, waybill_number: waybillVal, scrap_balance: scrapNum },
          currentUser || null
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mgas:kardex_updated', {
            detail: { ...entry, dispatched: finalDisp, waybill_number: waybillVal, scrap_balance: scrapNum }
          }));
        }
      }

      setExistingDbReceipt(record);
      setSaveStatus('saved');
      setSaveNotification(`برگ ورود کالا شماره ${formData.formNumber} با موفقیت ذخیره و اقلام کالا بلافاصله در پل کاربر و کلودفلر به‌روزرسانی شدند.`);
      if (onSaved) {
        onSaved(record);
      }
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveNotification(null);
      }, 4000);
    } catch (err: any) {
      console.error('Error saving goods entry receipt:', err);
      setSaveStatus('idle');
      setSaveNotification(`خطا در ذخیره‌سازی: ${err?.message || 'خطا در عملیات'}`);
    }
  };

  const [isEditing, setIsEditing] = useState(false);

  // Update quantity and words automatically
  const handleItemChange = (index: number, field: keyof GoodsEntryItem, value: any) => {
    const updated = [...formData.items];
    const current = { ...updated[index], [field]: value };

    if (field === 'quantity') {
      const numVal = parseInt(value, 10);
      if (!isNaN(numVal) && numVal > 0) {
        current.quantity = numVal;
        current.quantityInWords = numberToPersianWords(numVal);
      } else {
        current.quantity = '';
        current.quantityInWords = '';
      }
    }

    updated[index] = current;
    setFormData(prev => ({ ...prev, items: updated }));
  };

  // Row Manipulation Handlers for Print Sheet (حذف و اضافه سطرها برای پرینت)
  const handleAddRow = () => {
    const updated = [...formData.items];
    const newRowNum = updated.length + 1;
    updated.push({
      rowNum: newRowNum,
      description: '',
      quantity: '',
      quantityInWords: '',
      freightCost: '',
      remarks: ''
    });
    setFormData(prev => ({ ...prev, items: updated }));
  };

  const handleRemoveRow = (index: number) => {
    if (formData.items.length <= 1) {
      setFormData(prev => ({
        ...prev,
        items: [{
          rowNum: 1,
          description: '',
          quantity: '',
          quantityInWords: '',
          freightCost: '',
          remarks: ''
        }]
      }));
      return;
    }
    const filtered = formData.items.filter((_, idx) => idx !== index);
    const reindexed = filtered.map((item, idx) => ({
      ...item,
      rowNum: idx + 1
    }));
    setFormData(prev => ({ ...prev, items: reindexed }));
  };

  const handleRemoveEmptyRows = () => {
    const nonEmpty = formData.items.filter(item => {
      const hasDesc = Boolean(item.description && item.description.trim() !== '');
      const hasQty = Boolean(item.quantity !== '' && item.quantity !== undefined && item.quantity !== null && Number(item.quantity) > 0);
      const hasRemarks = Boolean(item.remarks && item.remarks.trim() !== '');
      const hasFreight = Boolean(item.freightCost && item.freightCost.trim() !== '');
      return hasDesc || hasQty || hasRemarks || hasFreight;
    });

    if (nonEmpty.length === 0) {
      setFormData(prev => ({
        ...prev,
        items: [{
          rowNum: 1,
          description: '',
          quantity: '',
          quantityInWords: '',
          freightCost: '',
          remarks: ''
        }]
      }));
    } else {
      const reindexed = nonEmpty.map((item, idx) => ({
        ...item,
        rowNum: idx + 1
      }));
      setFormData(prev => ({ ...prev, items: reindexed }));
    }
  };

  const handleResetTo3Rows = () => {
    const current = [...formData.items];
    const result: GoodsEntryItem[] = [];
    for (let i = 0; i < 3; i++) {
      if (current[i]) {
        result.push({ ...current[i], rowNum: i + 1 });
      } else {
        result.push({
          rowNum: i + 1,
          description: '',
          quantity: '',
          quantityInWords: '',
          freightCost: '',
          remarks: ''
        });
      }
    }
    setFormData(prev => ({ ...prev, items: result }));
  };

  const [paperOrientation, setPaperOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [showDriverCardInPrint, setShowDriverCardInPrint] = useState<boolean>(true);

  const toggleDriverCardInPrint = (checked: boolean) => {
    setShowDriverCardInPrint(checked);
  };
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  const handleActualPrint = () => {
    setIsPrinting(true);
    printReceiptSheet({
      elementId: 'goods-entry-print-sheet',
      title: `برگ ورود کالا - شماره ${formData.formNumber}`,
      paperSize: 'A5',
      orientation: paperOrientation,
      onComplete: () => {
        setIsPrinting(false);
      }
    });
    setSaveNotification('برگه ورود کالا به چاپگر ارسال شد.');
    setTimeout(() => {
      setIsPrinting(false);
      setSaveNotification(null);
    }, 2500);
  };

  const handleOpenPrintPreview = () => {
    setIsEditing(false);
    setShowPrintPreview(true);
  };

  const handlePrint = () => {
    handleOpenPrintPreview();
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const ok = await exportElementToPdf('goods-entry-print-sheet', {
        filename: `barg_voroud_${formData.formNumber}.pdf`,
        orientation: paperOrientation,
        format: 'a5',
        marginMm: 4
      });
      if (ok) {
        setSaveNotification('فایل PDF برگه ورود با موفقیت دانلود شد.');
        setTimeout(() => setSaveNotification(null), 3000);
      }
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute pages for both top bar row management and printable sheet
  const ROWS_PER_PAGE = 3;
  const pagedItems: GoodsEntryItem[][] = [];
  for (let i = 0; i < formData.items.length; i += ROWS_PER_PAGE) {
    pagedItems.push(formData.items.slice(i, i + ROWS_PER_PAGE));
  }
  if (pagedItems.length === 0) {
    pagedItems.push([{
      rowNum: 1,
      description: '',
      quantity: '',
      quantityInWords: '',
      freightCost: '',
      remarks: ''
    }]);
  }
  const totalPages = pagedItems.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto"
    >
      {/* Container */}
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col my-auto max-h-[95vh] overflow-hidden text-slate-100 cursor-default"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        
        {/* Top Control Bar: Normal Mode vs Dedicated Print Preview Mode */}
        {showPrintPreview ? (
          <div className="px-6 py-3.5 bg-slate-950 border-b border-amber-500/40 flex items-center justify-between gap-4 flex-wrap print:hidden animate-fadeIn relative pl-16">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>پیش‌نمایش صفحه پرینت برگ ورود کالا</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30 font-mono">
                    شماره: {formData.formNumber}
                  </span>
                </h2>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  نمای دقیق و استاندارد خروجی بر روی کاغذ A5 قبل از ارسال به چاپگر
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Zoom controls */}
              <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-700 text-xs">
                <span className="px-1.5 text-[11px] text-slate-400">بزرگنمایی:</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.max(60, z - 15))}
                  className="px-2 py-0.5 text-slate-300 hover:text-white font-bold bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                  title="کوچک‌نمایی"
                >
                  -
                </button>
                <span className="px-2 font-mono text-[11px] text-amber-300 font-bold min-w-[42px] text-center">
                  {toPersianDigits(previewZoom)}٪
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.min(140, z + 15))}
                  className="px-2 py-0.5 text-slate-300 hover:text-white font-bold bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                  title="بزرگ‌نمایی"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(100)}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 rounded text-slate-300 ml-1 transition-colors"
                >
                  ۱۰۰٪
                </button>
              </div>

              {/* A5 Orientation selector */}
              <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-700 text-xs">
                <span className="px-1.5 text-[11px] font-bold text-amber-400">A5:</span>
                <button
                  type="button"
                  onClick={() => setPaperOrientation('portrait')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    paperOrientation === 'portrait' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="چاپ عمودی A5"
                >
                  عمودی
                </button>
                <button
                  type="button"
                  onClick={() => setPaperOrientation('landscape')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    paperOrientation === 'landscape' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="چاپ افقی A5"
                >
                  افقی
                </button>
              </div>

              {/* Numbering Mode Switch: Auto Serial vs Manual Typing */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl p-1 text-xs shadow-xs">
                <span className="px-1 text-[11px] font-bold text-slate-400 whitespace-nowrap">شماره:</span>
                <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setNumberingMode('AUTO')}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      numberingMode === 'AUTO'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="تولید خودکار شماره سریال بدون تکرار"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>سریال خودکار</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumberingMode('MANUAL')}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      numberingMode === 'MANUAL'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="ورود دستی و تایپ شماره برگه"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>تایپی (دستی)</span>
                  </button>
                </div>

                {numberingMode === 'AUTO' ? (
                  <button
                    type="button"
                    onClick={handleGenerateNextSerial}
                    className="px-2 py-1 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    title="تولید شماره سریال یکتای جدید بدون تکرار"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-400" />
                    <span>شماره جدید</span>
                  </button>
                ) : (
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.formNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, formNumber: e.target.value }))}
                    placeholder="تایپ شماره..."
                    className="w-24 px-1.5 py-0.5 text-xs font-mono font-bold text-center border border-amber-500 rounded bg-slate-950 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                )}
              </div>

              {/* Confirm & Final Print Button */}
              <button
                type="button"
                onClick={handleActualPrint}
                disabled={isPrinting}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-amber-400/25 cursor-pointer disabled:opacity-75"
                title="تأیید و ارسال به چاپگر"
              >
                {isPrinting ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                <span>{isPrinting ? 'در حال ارسال به پرینتر...' : 'تأیید و چاپ نهایی (Print)'}</span>
              </button>

              {/* Download PDF Button */}
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="px-3 py-2 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                title="دانلود فایل PDF استاندارد A5"
              >
                <Download className="w-4 h-4" />
                <span>دانلود PDF</span>
              </button>

              {/* Return to Edit Mode Button */}
              <button
                type="button"
                onClick={() => {
                  setShowPrintPreview(false);
                  setIsEditing(true);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="بازگشت به ویرایش فیلدها"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>بازگشت به ویرایش</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="absolute top-3.5 left-4 sm:top-4 sm:left-6 z-20 p-2 bg-rose-600/90 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl shadow-md shadow-rose-950/50 border border-rose-500 transition-all cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
                title="بستن"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap print:hidden relative pl-16">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>برگ ورود کالا (M.Gas cylinder)</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30 font-mono">
                    شماره: {formData.formNumber}
                  </span>
                </h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-400">
                    فرم استاندارد سند ورود کالا
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400">ثبت‌کننده:</span>
                  <span className="text-xs font-bold text-amber-300">
                    {currentUser?.full_name || 'کاربر سیستم'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    (@{currentUser?.username || 'amouei'})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Quick switch to Exit Form if desired */}
              {onSwitchToExitForm && (
                <button
                  onClick={onSwitchToExitForm}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="تغییر به برگه خروج کالا"
                >
                  <span>نمایش برگه خروج کالا</span>
                </button>
              )}



              {/* A5 Orientation selector */}
              <div className="flex items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700 text-xs">
                <span className="px-2 text-[11px] font-bold text-amber-400">A5:</span>
                <button
                  type="button"
                  onClick={() => setPaperOrientation('portrait')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    paperOrientation === 'portrait'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="چاپ عمودی استاندارد A5"
                >
                  عمودی
                </button>
                <button
                  type="button"
                  onClick={() => setPaperOrientation('landscape')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    paperOrientation === 'landscape'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="چاپ افقی A5"
                >
                  افقی
                </button>
              </div>

              {/* Numbering Mode Switch: Auto Serial vs Manual Typing */}
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 hover:border-amber-500/50 rounded-xl p-1 text-xs shadow-xs">
                <span className="px-1.5 text-[11px] font-bold text-amber-400 whitespace-nowrap">شماره برگه:</span>
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setNumberingMode('AUTO');
                      if (!formData.formNumber) {
                        handleGenerateNextSerial();
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      numberingMode === 'AUTO'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="تولید خودکار شماره سریال بدون تکرار"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>سریال خودکار</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumberingMode('MANUAL')}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      numberingMode === 'MANUAL'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="ورود دستی و تایپ شماره برگه"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>تایپی (دستی)</span>
                  </button>
                </div>

                {numberingMode === 'AUTO' ? (
                  <button
                    type="button"
                    onClick={handleGenerateNextSerial}
                    className="px-2 py-1 text-[10.5px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                    title="تولید شماره سریال یکتای جدید بدون تکرار"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-400" />
                    <span className="hidden sm:inline">شماره جدید</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 pr-1">
                    <input
                      type="text"
                      dir="ltr"
                      value={formData.formNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, formNumber: e.target.value }))}
                      placeholder="تایپ شماره..."
                      className="w-24 px-1.5 py-0.5 text-xs font-mono font-bold text-center border border-amber-500 rounded bg-slate-950 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                )}
              </div>

              {/* Driver Card / Sheba Print Toggle (تنظیم فعال/غیرفعال بودن چاپ شماره کارت/شبا راننده) */}
              <label
                className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/50 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer select-none transition-all shadow-xs"
                title="تیک فعال یا غیرفعال کردن چاپ فیلد شماره کارت/شبا راننده در برگه پرینت"
              >
                <input
                  type="checkbox"
                  checked={showDriverCardInPrint}
                  onChange={(e) => toggleDriverCardInPrint(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 border-slate-600 bg-slate-900 cursor-pointer accent-amber-500"
                />
                <span className="font-semibold text-[11px] sm:text-xs text-amber-300">
                  چاپ شماره کارت/شبا
                </span>
              </label>

              <button
                onClick={() => {
                  if (isUpdatingExisting && !editPermission.allowed) return;
                  setIsEditing(!isEditing);
                }}
                disabled={isUpdatingExisting && !editPermission.allowed}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors border ${
                  isUpdatingExisting && !editPermission.allowed
                    ? 'cursor-not-allowed bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-800 opacity-80'
                    : isEditing
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold cursor-pointer'
                    : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 cursor-pointer'
                }`}
                title={isUpdatingExisting && !editPermission.allowed ? editPermission.reason : 'ویرایش دستی فیلدها'}
              >
                {isUpdatingExisting && !editPermission.allowed ? (
                  <Lock className="w-3.5 h-3.5 text-slate-600 dark:text-slate-500" />
                ) : (
                  <Edit3 className="w-3.5 h-3.5" />
                )}
                <span>{isEditing ? 'پایان ویرایش' : 'ویرایش دستی فیلدها'}</span>
              </button>

              {/* Save to Database Button */}
              <button
                onClick={handleSaveToDatabase}
                disabled={saveStatus === 'saving' || (isUpdatingExisting && !editPermission.allowed)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md ${
                  isUpdatingExisting && !editPermission.allowed
                    ? 'cursor-not-allowed bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-800 opacity-80'
                    : 'cursor-pointer'
                } ${
                  saveStatus === 'saved'
                    ? 'bg-emerald-500 text-slate-950 border border-emerald-400 font-extrabold shadow-emerald-500/20'
                    : existingDbReceipt
                    ? 'bg-emerald-50 dark:bg-emerald-600/30 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/50 hover:bg-emerald-100 dark:hover:bg-emerald-600/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
                title={isUpdatingExisting && !editPermission.allowed ? editPermission.reason : 'ذخیره و همگام‌سازی اطلاعات برگ ورود کالا در پایگاه داده SQLite و صف همگام‌سازی'}
              >
                {saveStatus === 'saving' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : saveStatus === 'saved' || existingDbReceipt ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>
                  {saveStatus === 'saving'
                    ? 'در حال ذخیره...'
                    : saveStatus === 'saved'
                    ? 'ذخیره شد ✓'
                    : existingDbReceipt
                    ? 'به‌روزرسانی در دیتابیس'
                    : 'ذخیره در پایگاه داده'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="px-3.5 py-2 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                title="دانلود مستقیم فرم به صورت فایل PDF استاندارد A5"
              >
                <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                <span>{isExportingPdf ? 'در حال تولید PDF...' : 'دانلود فایل PDF (A5)'}</span>
              </button>

              {/* Row Management Controls (بخش تنظیم سطرهای چاپ - کنار دکمه چاپ برگه) */}
              <div className="flex items-center bg-slate-900/90 border border-amber-500/40 rounded-xl p-1 gap-1.5 shadow-xs">
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-slate-300 border-l border-slate-700/80">
                  <span className="font-bold text-amber-400 hidden sm:inline">تنظیم سطرها:</span>
                  <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/60 text-xs">
                    {toPersianDigits(formData.items.length)} سطر ({toPersianDigits(totalPages)} برگه A5)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-2.5 py-1 text-xs font-bold text-amber-300 hover:text-white bg-slate-800 hover:bg-amber-600/30 border border-amber-500/30 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="افزودن یک سطر جدید (بیش از ۳ سطر خودکار وارد برگه دوم می‌شود)"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ افزودن سطر</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveEmptyRows}
                  className="px-2.5 py-1 text-xs font-bold text-rose-300 hover:text-white bg-slate-800 hover:bg-rose-600/30 border border-rose-500/30 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="حذف کلیه سطرهای خالی بدون شرح و تعداد جهت بهینه‌سازی چاپ"
                >
                  <Eraser className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">حذف سطرهای خالی</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetTo3Rows}
                  className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                  title="بازنشانی جدول به ۳ سطر استاندارد تک‌برگه A5"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span className="hidden md:inline">۳ سطر پیش‌فرض</span>
                </button>
              </div>

              {/* button:nth-of-type(5): Open Print Preview Page Before Printing */}
              <button
                type="button"
                onClick={handleOpenPrintPreview}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer"
                title="نمایش صفحه پیش‌نمایش پرینت قبل از چاپ برگه A5"
              >
                <Eye className="w-4 h-4 text-slate-950" />
                <span>نمایش صفحه پرینت (چاپ A5)</span>
              </button>

              <button
                onClick={onClose}
                className="absolute top-3.5 left-4 sm:top-4 sm:left-6 z-20 p-2 bg-rose-600/90 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl shadow-md shadow-rose-950/50 border border-rose-500 transition-all cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
                title="بستن"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        )}

        {/* Unrestricted editing for all authorized users */}

        {/* Database Saved Status Notification Banner */}
        {saveNotification && (
          <div className="bg-emerald-950/90 border-b border-emerald-800 px-6 py-2 text-xs text-emerald-300 flex items-center justify-between gap-2 animate-fadeIn print:hidden">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveNotification}</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-900/60 px-2 py-0.5 rounded">
              SQLite + Sync Queue OK
            </span>
          </div>
        )}

        {existingDbReceipt && !saveNotification && (
          <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-2 text-xs text-slate-400 flex items-center justify-between gap-2 print:hidden" data-no-print="true" data-user-badge="true">
            <div className="flex items-center gap-2 flex-wrap">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span>این برگه در پایگاه داده ثبت شده است (شناسه سند: <span className="font-mono text-slate-300">{existingDbReceipt.receipt_id}</span> - تاریخ ثبت: {existingDbReceipt.updated_at.slice(0, 10)})</span>
              <span className="text-slate-600">•</span>
              <span>کاربر ثبت‌کننده در سیستم:</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                @{existingDbReceipt.created_by_username || (SEED_USERS.find(u => u.user_id === existingDbReceipt.user_id)?.username) || entry?.created_by_username || 'amouei'}
              </span>
            </div>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              موجود در دیتابیس
            </span>
          </div>
        )}

        {!existingDbReceipt && currentUser && (
          <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-1.5 text-xs text-slate-400 flex items-center justify-between gap-2 print:hidden" data-no-print="true" data-user-badge="true">
            <div className="flex items-center gap-2 flex-wrap">
              <span>کاربر صادرکننده در سیستم:</span>
              <span className="font-bold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/50">
                {currentUser.full_name}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              مشخصات متصدی صرفاً در سیستم ثبت و نمایش داده می‌شود و در نسخه چاپی درج نمی‌شود
            </span>
          </div>
        )}

        {/* Form Body / Physical Paper Replica */}
        <div className={`p-4 sm:p-6 overflow-y-auto flex flex-col items-center transition-colors ${
          showPrintPreview ? 'bg-slate-950 ring-1 ring-amber-500/20' : 'bg-slate-950/70'
        }`}>
          {/* Print Preview Mode Top Notification */}
          {showPrintPreview && (
            <div className="w-full max-w-[890px] mb-4 px-4 py-2.5 bg-amber-950/90 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3 shadow-lg animate-fadeIn print:hidden">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                <div>
                  <span className="font-bold text-amber-300 ml-1">پیش‌نمایش صفحه پرینت (A5):</span>
                  <span>این برگه با همین ساختار دقیق چاپی و بدون کادر ویرایشی به چاپگر ارسال می‌شود.</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 bg-slate-900/90 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs text-amber-200 cursor-pointer select-none transition-colors">
                  <input
                    type="checkbox"
                    checked={showDriverCardInPrint}
                    onChange={(e) => toggleDriverCardInPrint(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                  />
                  <span className="font-medium text-[11px]">چاپ شماره کارت/شبا</span>
                </label>
                <button
                  type="button"
                  onClick={handleActualPrint}
                  disabled={isPrinting}
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>تأیید و چاپ مستقیم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintPreview(false);
                    setIsEditing(true);
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="بازگشت به ویرایش فیلدها"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>ویرایش</span>
                </button>
              </div>
            </div>
          )}

          {/* Printable Yellow Paper Container (exact replica of physical form) */}
          <div
            id="goods-entry-print-sheet"
            className={`w-full font-sans relative select-text transition-all duration-300 ${
              paperOrientation === 'landscape'
                ? 'max-w-[890px]'
                : 'max-w-[590px]'
            } ${showPrintPreview ? 'shadow-[0_20px_50px_rgba(0,0,0,0.6)]' : ''}`}
            style={showPrintPreview && previewZoom !== 100 ? { transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center' } : undefined}
          >
            {/* Render Each Page (Up to 3 Rows Per Page) - Every page inherits full yellow background and border */}
            {pagedItems.map((pageItems, pageIndex) => (
                  <div
                    key={pageIndex}
                    className={`amgas-receipt-page amgas-entry-page w-full bg-[#fdfbe8] text-slate-900 border-2 border-dashed border-amber-700/60 p-4 sm:p-6 md:p-7 rounded-lg shadow-xl relative select-text transition-all duration-300 ${
                      paperOrientation === 'landscape'
                        ? 'min-h-[480px]'
                        : 'min-h-[730px]'
                    } ${pageIndex > 0 ? 'mt-6 print:mt-0' : ''}`}
                    style={{
                      backgroundColor: '#fdfbe8',
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact'
                    }}
                  >
                    {/* Watermark Logo in background */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center overflow-hidden">
                      <div className="text-center font-black text-6xl md:text-7xl uppercase tracking-widest text-slate-900">
                        M.Gas cylinder
                      </div>
                    </div>

                    {/* Multi-page Screen-only Badge */}
                    {totalPages > 1 && (
                      <div
                        className="mb-2 print:hidden flex items-center justify-between text-[10px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded"
                        data-no-print="true"
                        data-html2canvas-ignore="true"
                      >
                        <span>برگه شماره {toPersianDigits(pageIndex + 1)} از {toPersianDigits(totalPages)}</span>
                        <span>سایز کاغذ: A5 {paperOrientation === 'landscape' ? '(افقی)' : '(عمودی)'}</span>
                      </div>
                    )}

                    {/* HEADER AREA */}
                    {/* First column (RIGHT side in RTL): "به نام خدا" + Date + Sender */}
                    {/* Center column: Title "برگ ورود کالا" */}
                    {/* Third column (LEFT side in RTL): Official Logo (1.5x larger) + Form Number */}
                    <div className="flex items-start justify-between pb-2.5 border-b-2 border-slate-900">
                      
                      {/* First Column (RIGHT): In the Name of God + Date + Sender */}
                      <div className="flex flex-col items-start gap-1 w-1/3 text-right">
                        <div className="font-bold text-xs text-slate-900 pb-1">
                          به نام خدا
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-bold text-slate-800">تاریخ :</span>
                          {isEditing ? (
                            <input
                              type="text"
                              dir="ltr"
                              value={formData.date}
                              onChange={e => setFormData({ ...formData, date: e.target.value })}
                              className="w-24 px-1 py-0.5 text-xs border border-amber-500 rounded bg-amber-50 text-slate-900"
                            />
                          ) : (
                            <span className="font-bold text-slate-900 font-mono" dir="ltr" style={{ unicodeBidi: 'isolate' }}>{toEnglishDigits(formData.date) || '.................'}</span>
                          )}
                        </div>

                        {/* Sender */}
                        <div className="flex items-center gap-1 text-xs pt-0.5">
                          <span className="font-bold text-slate-800">فرستنده :</span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={formData.sender}
                              onChange={e => setFormData({ ...formData, sender: e.target.value })}
                              className="w-32 px-1 py-0.5 text-xs border border-amber-500 rounded bg-amber-50 text-slate-900"
                            />
                          ) : (
                            <span className="font-bold text-slate-950">{formData.sender || '...................'}</span>
                          )}
                        </div>
                      </div>

                      {/* Center Column: Title */}
                      <div className="text-center w-1/3 pt-1">
                        <h1 className="text-xl md:text-2xl font-black text-slate-950 tracking-normal border-b-2 border-slate-900 pb-1 inline-block px-3">
                          برگ ورود کالا
                        </h1>
                        <div className="text-[11px] font-bold text-slate-700 mt-1">
                          (رسید انبار کارخانه تولید سیلندر ام گاز)
                        </div>
                      </div>

                      {/* Third Column (LEFT): Official Logo (1.5x larger) + Form Number */}
                      <div className="flex flex-col items-end gap-1 w-1/3 text-left">
                        {/* Official Site Logo */}
                        <div className="flex items-center justify-end pb-0.5">
                          <img
                            src="/logo.svg"
                            alt="ام گاز - MGAS"
                            className="h-14 sm:h-16 max-h-[70px] w-auto object-contain shrink-0"
                          />
                        </div>

                        {/* Form Number */}
                        <div className="flex items-center gap-1 text-xs font-bold text-red-600 pt-0.5">
                          <span className="text-slate-800">شماره :</span>
                          {isEditing && numberingMode === 'MANUAL' ? (
                            <input
                              type="text"
                              dir="ltr"
                              value={formData.formNumber}
                              onChange={e => setFormData({ ...formData, formNumber: e.target.value })}
                              className="w-24 px-1 py-0.5 text-xs font-bold font-mono border border-amber-500 rounded bg-amber-50 text-slate-900"
                              placeholder="شماره دستی..."
                            />
                          ) : (
                            <span
                              className="text-sm tracking-wider font-bold font-mono text-red-600"
                              dir="ltr"
                              style={{ unicodeBidi: 'isolate' }}
                              title={numberingMode === 'AUTO' ? 'شماره سریال خودکار سیستمی' : 'شماره دستی'}
                            >
                              {toEnglishDigits(formData.formNumber)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* MIDDLE BAR: Delivered by (Right) & Dispatched (Center) & Vehicle Number (Left) */}
                    <div className="py-2 px-3 flex items-center justify-between gap-3 text-xs border-b border-slate-400 bg-amber-100/40 flex-wrap sm:flex-nowrap">
                      {/* Driver Name (توسط آقای) */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                        <span className="font-bold text-slate-900 whitespace-nowrap">توسط آقای :</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={formData.deliveredBy}
                            onChange={e => setFormData({ ...formData, deliveredBy: e.target.value })}
                            className="flex-1 px-2 py-0.5 text-xs border border-amber-500 rounded bg-amber-50 text-slate-900"
                          />
                        ) : (
                          <span className="font-bold text-slate-950 truncate">{formData.deliveredBy || '......................................................'}</span>
                        )}
                      </div>

                      {/* Driver National ID (شماره ملی راننده - جایگزین ستون ارسالی) */}
                      <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-0.5 rounded-md bg-amber-100/80 border border-amber-400 text-slate-950 font-medium">
                        <span className="font-bold whitespace-nowrap text-slate-900">شماره ملی راننده :</span>
                        {isEditing ? (
                          <input
                            type="text"
                            dir="ltr"
                            value={formData.driverNationalId || ''}
                            onChange={e => setFormData({ ...formData, driverNationalId: e.target.value })}
                            placeholder="کد ملی ۱۰ رقمی..."
                            maxLength={10}
                            className="w-28 px-1.5 py-0.5 text-xs text-center font-mono font-bold border border-amber-500 rounded bg-white text-slate-950"
                          />
                        ) : (
                          <span className="font-mono font-bold text-slate-950 min-w-[85px] inline-block text-center" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                            {toEnglishDigits(formData.driverNationalId) || '....................'}
                          </span>
                        )}
                      </div>

                      {/* Vehicle Number (وسیله شماره - دقیقاً روبروی نام راننده در سمت چپ) */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold text-slate-900 whitespace-nowrap">وسیله شماره :</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={formData.vehicleNumber}
                            onChange={e => setFormData({ ...formData, vehicleNumber: e.target.value })}
                            className="w-36 px-1.5 py-0.5 text-xs border border-amber-500 rounded bg-amber-50 text-slate-900"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 min-w-[110px] inline-block text-left">{formData.vehicleNumber || '...................'}</span>
                        )}
                      </div>
                    </div>

                    {/* MAIN 6-COLUMN TABLE (Exact 3 rows for this page) */}
                    <div className="mt-2 overflow-hidden border-2 border-slate-900 rounded-xs">
                      <table className="w-full text-center border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="bg-amber-200/90 text-slate-950 font-black border-b-2 border-slate-900 text-xs sm:text-[13px]">
                            <th className="border-l-2 border-slate-900 py-2 px-1 w-12 font-black">ردیف</th>
                            <th className="border-l-2 border-slate-900 py-2 px-3 text-right font-black">شرح</th>
                            <th className="border-l-2 border-slate-900 py-2 px-1 w-20 font-black">تعداد</th>
                            <th className="border-l-2 border-slate-900 py-2 px-3 w-48 font-black">تعداد (به حروف)</th>
                            <th className="border-l-2 border-slate-900 py-2 px-2 w-28 font-black">هزینه حمل</th>
                            <th className="py-2 px-3 w-32 font-black">ملاحظات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageItems.map((item, localIdx) => {
                            const globalIdx = pageIndex * ROWS_PER_PAGE + localIdx;
                            return (
                              <tr
                                key={globalIdx}
                                className="border-b border-dashed border-slate-400 h-10 hover:bg-amber-50 transition-colors group text-xs sm:text-sm"
                              >
                                {/* 1. ردیف */}
                                <td className="border-l-2 border-slate-900 font-black py-1.5 px-1 bg-amber-100/30 relative text-sm sm:text-base">
                                  <div className="flex items-center justify-center gap-1">
                                    <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="font-mono font-black text-sm sm:text-base text-slate-950">{toEnglishDigits(item.rowNum)}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveRow(globalIdx);
                                      }}
                                      data-no-print="true"
                                      data-html2canvas-ignore="true"
                                      className="print:hidden p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 rounded transition-all cursor-pointer shrink-0"
                                      title={`حذف سطر شماره ${item.rowNum} از برگه`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>

                                {/* 2. شرح */}
                                <td className="border-l-2 border-slate-900 text-right py-1.5 px-3 font-bold text-xs sm:text-sm text-slate-950">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.description}
                                      onChange={e => handleItemChange(globalIdx, 'description', e.target.value)}
                                      placeholder="شرح کالا..."
                                      className="w-full px-2 py-1 text-xs sm:text-sm font-bold border border-amber-400 rounded bg-white text-slate-900 shadow-xs"
                                    />
                                  ) : (
                                    <span className="text-xs sm:text-sm font-bold text-slate-950 leading-snug block">{item.description || ''}</span>
                                  )}
                                </td>

                                {/* 3. تعداد */}
                                <td className="border-l-2 border-slate-900 font-black py-1.5 px-1.5 text-slate-950 text-center text-sm sm:text-base">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={e => handleItemChange(globalIdx, 'quantity', e.target.value)}
                                      placeholder="0"
                                      className="w-full text-center px-1 py-1 text-xs sm:text-sm font-black border border-amber-400 rounded bg-white text-slate-900 shadow-xs"
                                    />
                                  ) : (
                                    <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="font-mono text-sm sm:text-base font-black text-slate-950">{item.quantity !== '' ? toEnglishDigits(formatNumberEn(item.quantity)) : ''}</span>
                                  )}
                                </td>

                                {/* 4. تعداد به حروف */}
                                <td className="border-l-2 border-slate-900 py-1.5 px-3 text-slate-950 font-bold text-xs sm:text-sm">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.quantityInWords}
                                      onChange={e => handleItemChange(globalIdx, 'quantityInWords', e.target.value)}
                                      placeholder="به حروف..."
                                      className="w-full px-2 py-1 text-xs sm:text-sm font-bold border border-amber-400 rounded bg-white text-slate-900 shadow-xs"
                                    />
                                  ) : (
                                    <span className="text-xs sm:text-sm font-bold text-slate-950 leading-snug block">{item.quantityInWords || ''}</span>
                                  )}
                                </td>

                                {/* 5. هزینه حمل */}
                                <td className="border-l-2 border-slate-900 py-1.5 px-2.5 text-slate-950 font-bold text-xs sm:text-sm text-center">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.freightCost}
                                      onChange={e => handleItemChange(globalIdx, 'freightCost', e.target.value)}
                                      placeholder="هزینه حمل..."
                                      className="w-full px-2 py-1 text-xs sm:text-sm font-bold border border-amber-400 rounded bg-white text-slate-900 text-center shadow-xs"
                                    />
                                  ) : (
                                    <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="font-mono text-xs sm:text-sm font-bold text-slate-950">{toEnglishDigits(item.freightCost) || ''}</span>
                                  )}
                                </td>

                                {/* 6. ملاحظات */}
                                <td className="py-1.5 px-3 text-slate-950 font-semibold text-xs sm:text-sm">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.remarks}
                                      onChange={e => handleItemChange(globalIdx, 'remarks', e.target.value)}
                                      placeholder="ملاحظات..."
                                      className="w-full px-2 py-1 text-xs sm:text-sm font-semibold border border-amber-400 rounded bg-white text-slate-900 shadow-xs"
                                    />
                                  ) : (
                                    <span className="text-xs sm:text-sm font-semibold text-slate-950 leading-snug block">{item.remarks || ''}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* ACKNOWLEDGMENT TEXT (Verbatim from photo) */}
                    <div className="mt-2.5 pt-2 border-t-2 border-slate-900 text-xs leading-relaxed text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold">اینجانب :</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={formData.receiverName}
                            onChange={e => setFormData({ ...formData, receiverName: e.target.value })}
                            className="flex-1 min-w-[200px] px-2 py-0.5 text-xs border border-amber-500 rounded bg-amber-50 font-bold"
                          />
                        ) : (
                          <span className="font-bold text-slate-950 px-1 border-b border-dotted border-slate-700 min-w-[180px] inline-block text-center">
                            {formData.receiverName || '...........................................'}
                          </span>
                        )}
                        <span className="font-bold text-slate-950">
                          تأیید می نمایم اقلام مشروحه بالا را برای تعمیر تحویل گرفتم.
                        </span>
                      </div>

                      {/* Driver Card / Sheba (قابل فعال/غیرفعال شدن با تیک تنظیمات بالای برگه) */}
                      {showDriverCardInPrint ? (
                        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap pt-1 text-xs">
                          <span className="font-bold text-slate-950 whitespace-nowrap">شماره کارت/شبا راننده :</span>
                          {isEditing ? (
                            <input
                              type="text"
                              dir="ltr"
                              value={formData.driverCardOrSheba || ''}
                              onChange={e => setFormData({ ...formData, driverCardOrSheba: e.target.value })}
                              placeholder="شماره کارت یا شبا راننده..."
                              className="w-64 px-1.5 py-0.5 text-xs font-mono border border-amber-500 rounded bg-amber-50 text-slate-900"
                            />
                          ) : (
                            <span className="font-semibold text-slate-900 px-1 border-b border-dotted border-slate-700 min-w-[180px] inline-block text-center font-mono" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                              {toEnglishDigits(formData.driverCardOrSheba) || '................................'}
                            </span>
                          )}
                        </div>
                      ) : isEditing ? (
                        <div className="flex items-center gap-2 pt-1 text-xs text-slate-500 bg-amber-50/60 p-1.5 rounded border border-dashed border-amber-300 print:hidden" data-no-print="true">
                          <span className="font-bold whitespace-nowrap text-slate-700">شماره کارت/شبا راننده (غیرفعال در چاپ):</span>
                          <input
                            type="text"
                            dir="ltr"
                            value={formData.driverCardOrSheba || ''}
                            onChange={e => setFormData({ ...formData, driverCardOrSheba: e.target.value })}
                            placeholder="شماره کارت یا شبا راننده..."
                            className="w-64 px-1.5 py-0.5 text-xs font-mono border border-slate-300 rounded bg-white text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => toggleDriverCardInPrint(true)}
                            className="text-[11px] text-amber-700 hover:text-amber-900 underline font-medium cursor-pointer"
                          >
                            فعال‌سازی برای چاپ
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* SIGNATURE BOXES: 4 boxes with horizontal layout (چیدمان افقی برای عنوان و زیرنویس) */}
                    <div className="mt-2.5 pt-1.5 grid grid-cols-4 gap-2 sm:gap-2.5 text-center text-xs font-bold text-slate-900">
                      {/* 1. مسئول انبار */}
                      <div className="flex flex-col justify-between h-16 min-h-[66px] border border-slate-400 rounded-md p-1.5 bg-white/70 shadow-2xs">
                        {/* Horizontal Header: Title + Subtitle side-by-side */}
                        <div className="flex items-center justify-between gap-1 w-full border-b border-slate-300 pb-0.5">
                          <span className="text-[10.5px] sm:text-[11px] font-black text-slate-950 whitespace-nowrap">
                            امضاء مسئول انبار
                          </span>
                          <span className="text-[8.5px] sm:text-[9.5px] text-slate-700 font-semibold whitespace-nowrap">
                            (مهر و امضاء)
                          </span>
                        </div>
                        {/* Horizontal Footer: Signer Name + Signature indicator */}
                        <div className="flex items-center justify-between gap-1 w-full px-0.5 pt-1 mt-auto text-[9.5px] sm:text-[10px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={formData.warehouseSigner}
                              onChange={e => setFormData({ ...formData, warehouseSigner: e.target.value })}
                              placeholder="نام مسئول انبار..."
                              className="w-full text-center px-1 py-0.5 text-[9.5px] border border-amber-400 rounded bg-white text-slate-900 font-bold"
                            />
                          ) : (
                            <>
                              <span className="text-slate-900 font-bold truncate max-w-[65%]">
                                {formData.warehouseSigner || 'مسئول انبار'}
                              </span>
                              <span className="text-slate-400 text-[9px] font-mono whitespace-nowrap shrink-0">
                                محل امضاء
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 2. امضاء راننده (کنار مسئول انبار) */}
                      <div className="flex flex-col justify-between h-16 min-h-[66px] border border-slate-400 rounded-md p-1.5 bg-white/70 shadow-2xs">
                        {/* Horizontal Header: Title + Subtitle side-by-side */}
                        <div className="flex items-center justify-between gap-1 w-full border-b border-slate-300 pb-0.5">
                          <span className="text-[10.5px] sm:text-[11px] font-black text-slate-950 whitespace-nowrap">
                            امضاء راننده
                          </span>
                          <span className="text-[8.5px] sm:text-[9.5px] text-slate-700 font-semibold whitespace-nowrap">
                            (امضاء و اثر انگشت)
                          </span>
                        </div>
                        {/* Horizontal Footer: Signer Name + Signature indicator */}
                        <div className="flex items-center justify-between gap-1 w-full px-0.5 pt-1 mt-auto text-[9.5px] sm:text-[10px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={formData.driverSigner || formData.deliveredBy || ''}
                              onChange={e => setFormData({ ...formData, driverSigner: e.target.value })}
                              placeholder="نام راننده..."
                              className="w-full text-center px-1 py-0.5 text-[9.5px] border border-amber-400 rounded bg-white text-slate-900 font-bold"
                            />
                          ) : (
                            <>
                              <span className="text-slate-900 font-bold truncate max-w-[65%]">
                                {formData.driverSigner || formData.deliveredBy || 'امضاء راننده'}
                              </span>
                              <span className="text-slate-400 text-[9px] font-mono whitespace-nowrap shrink-0">
                                محل امضاء
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 3. سرپرست */}
                      <div className="flex flex-col justify-between h-16 min-h-[66px] border border-slate-400 rounded-md p-1.5 bg-white/70 shadow-2xs">
                        {/* Horizontal Header: Title + Subtitle side-by-side */}
                        <div className="flex items-center justify-between gap-1 w-full border-b border-slate-300 pb-0.5">
                          <span className="text-[10.5px] sm:text-[11px] font-black text-slate-950 whitespace-nowrap">
                            امضاء سرپرست
                          </span>
                          <span className="text-[8.5px] sm:text-[9.5px] text-slate-700 font-semibold whitespace-nowrap">
                            (تأیید و امضاء)
                          </span>
                        </div>
                        {/* Horizontal Footer: Signer Name + Signature indicator */}
                        <div className="flex items-center justify-between gap-1 w-full px-0.5 pt-1 mt-auto text-[9.5px] sm:text-[10px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={formData.delivererSigner}
                              onChange={e => setFormData({ ...formData, delivererSigner: e.target.value })}
                              placeholder="نام سرپرست..."
                              className="w-full text-center px-1 py-0.5 text-[9.5px] border border-amber-400 rounded bg-white text-slate-900 font-bold"
                            />
                          ) : (
                            <>
                              <span className="text-slate-900 font-bold truncate max-w-[65%]">
                                {formData.delivererSigner || 'سرپرست'}
                              </span>
                              <span className="text-slate-400 text-[9px] font-mono whitespace-nowrap shrink-0">
                                محل امضاء
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 4. قسمت اداری */}
                      <div className="flex flex-col justify-between h-16 min-h-[66px] border border-slate-400 rounded-md p-1.5 bg-white/70 shadow-2xs">
                        {/* Horizontal Header: Title + Subtitle side-by-side */}
                        <div className="flex items-center justify-between gap-1 w-full border-b border-slate-300 pb-0.5">
                          <span className="text-[10.5px] sm:text-[11px] font-black text-slate-950 whitespace-nowrap">
                            امضاء قسمت اداری
                          </span>
                          <span className="text-[8.5px] sm:text-[9.5px] text-slate-700 font-semibold whitespace-nowrap">
                            (تأیید اداری)
                          </span>
                        </div>
                        {/* Horizontal Footer: Signer Name + Signature indicator */}
                        <div className="flex items-center justify-between gap-1 w-full px-0.5 pt-1 mt-auto text-[9.5px] sm:text-[10px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={formData.adminSigner}
                              onChange={e => setFormData({ ...formData, adminSigner: e.target.value })}
                              placeholder="نام مسئول اداری..."
                              className="w-full text-center px-1 py-0.5 text-[9.5px] border border-amber-400 rounded bg-white text-slate-900 font-bold"
                            />
                          ) : (
                            <>
                              <span className="text-slate-900 font-bold truncate max-w-[65%]">
                                {formData.adminSigner || 'امور اداری'}
                              </span>
                              <span className="text-slate-400 text-[9px] font-mono whitespace-nowrap shrink-0">
                                محل امضاء
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Form Note with TINY Page Numbering */}
                    <div className="mt-2 pt-1 border-t border-dashed border-slate-400 flex items-center justify-between text-[9px] text-slate-600">
                      <span>M.Gas Cylinder Management System</span>
                      <span className="font-mono font-bold text-slate-700 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300/80 text-[9px]">
                        صفحه {toPersianDigits(pageIndex + 1)} از {toPersianDigits(totalPages)}
                      </span>
                      <span>کد سند کاردکس: {toEnglishDigits(entry?.transfer_sheet_number) || '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

        {/* Footer info (Screen Only) */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>اطلاعات از کارتکس گاز («{customer?.name}») به‌صورت خودکار بارگذاری شد.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود مستقیم فایل PDF (A5)</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="text-amber-400 hover:text-amber-300 font-semibold underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>ارسال مستقیم به پرینتر (سایز A5)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
