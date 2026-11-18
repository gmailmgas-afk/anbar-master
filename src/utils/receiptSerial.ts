import { RuntimeEnvironment, GoodsReceiptType } from '../types';
import { LocalStorageManager } from '../database/storage';

const DEFAULT_BASE_SERIAL = 52601;

/**
 * Extracts pure integer numbers from a string if present.
 */
function extractNumericSerial(val?: string | null): number | null {
  if (!val) return null;
  const digitsOnly = val.replace(/\D/g, '');
  if (!digitsOnly) return null;
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) ? null : num;
}

/**
 * Finds all existing receipt and sheet numbers across the database
 * to guarantee that generated numbers are strictly unique and sequential.
 */
export function getHighestExistingReceiptSerial(
  env: RuntimeEnvironment,
  receiptType?: GoodsReceiptType
): number {
  let highest = DEFAULT_BASE_SERIAL - 1;

  try {
    const state = LocalStorageManager.getState(env);

    // 1. Check all goods_receipts
    if (state.goods_receipts && state.goods_receipts.length > 0) {
      for (const r of state.goods_receipts) {
        if (!receiptType || r.receipt_type === receiptType) {
          const num = extractNumericSerial(r.form_number);
          if (num !== null && num > highest && num < 9999999) {
            highest = num;
          }
        }
      }
    }

    // 2. Check gas_kardex_entries
    if (state.gas_kardex_entries && state.gas_kardex_entries.length > 0) {
      for (const entry of state.gas_kardex_entries) {
        const num = extractNumericSerial(entry.transfer_sheet_number);
        if (num !== null && num > highest && num < 9999999) {
          highest = num;
        }
      }
    }

    // 3. Check gas_production_kardex_entries
    if (state.gas_production_kardex_entries && state.gas_production_kardex_entries.length > 0) {
      for (const entry of state.gas_production_kardex_entries) {
        const num1 = extractNumericSerial(entry.delivery_sheet_number);
        const num2 = extractNumericSerial(entry.transfer_sheet_number);
        if (num1 !== null && num1 > highest && num1 < 9999999) highest = num1;
        if (num2 !== null && num2 > highest && num2 < 9999999) highest = num2;
      }
    }

    // 4. Check persistent localStorage counter for this type & env
    if (typeof window !== 'undefined') {
      const typeKey = receiptType ? `_${receiptType}` : '';
      const stored = localStorage.getItem(`mgas_last_serial${typeKey}_${env}`);
      if (stored) {
        const storedNum = parseInt(stored, 10);
        if (!isNaN(storedNum) && storedNum > highest) {
          highest = storedNum;
        }
      }
    }
  } catch (err) {
    console.warn('[ReceiptSerial] Error inspecting highest serial:', err);
  }

  return highest;
}

/**
 * Generates and permanently reserves the next unique serial number
 * formatted as a standard 6-digit number (e.g. '052601', '052602').
 */
export function allocateNextUniqueReceiptNumber(
  env: RuntimeEnvironment,
  receiptType: GoodsReceiptType
): string {
  const highest = getHighestExistingReceiptSerial(env, receiptType);
  const nextNum = Math.max(DEFAULT_BASE_SERIAL, highest + 1);

  if (typeof window !== 'undefined') {
    try {
      const typeKey = `_${receiptType}`;
      localStorage.setItem(`mgas_last_serial${typeKey}_${env}`, String(nextNum));
      localStorage.setItem(`mgas_last_serial_${env}`, String(nextNum));
    } catch {}
  }

  return String(nextNum).padStart(6, '0');
}
