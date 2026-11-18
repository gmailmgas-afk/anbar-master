import { CylinderType, RuntimeEnvironment, GasKardexEntry, CylinderTankMapping } from '../types';
import { LocalStorageManager } from '../database/storage';
import { recalculateKardexBalances } from '../database/gas-kardex-data';
import { DEFAULT_CYLINDER_TANK_MAPPINGS } from '../database/cylinder-tank-catalog';
import { cleanPersianText } from './persian';

/**
 * Normalizes any cylinder type string.
 * Strictly enforces that Forklift cylinder has only ONE unified model:
 * 'سیلندر لیفتراکی' (handles 'لیفتراکی 22 کیلویی', 'سیلندر 10 کیلویی', 'لیفتراک', etc.)
 */
/**
 * Checks if a given cylinder or product type is a Tank (مخزن).
 * RULE: None of the tanks need valves! Only cylinders and picnics need valves.
 */
export function isTankType(type?: string | null): boolean {
  if (!type) return false;
  const clean = cleanPersianText(type).toLowerCase();
  return clean.includes('مخزن') || clean.startsWith('tank');
}

/**
 * Checks if a given item is a Picnic 5/6 kg type (پیک‌نیک ۵/۶ کیلویی).
 */
export function isPicnic56Type(type?: string | null): boolean {
  if (!type) return false;
  const clean = cleanPersianText(type).toLowerCase();
  return (
    clean.includes('5/6') ||
    clean.includes('۵/۶') ||
    clean.includes('5/8') ||
    clean.includes('۵/۸') ||
    clean.includes('3/5/8') ||
    clean.includes('۳/۵/۸') ||
    (clean.includes('پیکنیک') && (clean.includes('5') || clean.includes('۵') || clean.includes('6') || clean.includes('۶') || clean.includes('8') || clean.includes('۸'))) ||
    (clean.includes('پیک‌نیک') && (clean.includes('5') || clean.includes('۵') || clean.includes('6') || clean.includes('۶') || clean.includes('8') || clean.includes('۸')))
  );
}

export function isPicnic58Type(type?: string | null): boolean {
  return isPicnic56Type(type);
}

export function isCylinder810Type(type?: string | null): boolean {
  if (!type) return false;
  const clean = cleanPersianText(type).toLowerCase();
  return (
    clean.includes('8/10') ||
    clean.includes('۸/۱۰') ||
    clean.includes('10/8') ||
    clean.includes('۱۰/۸') ||
    clean.includes('8 و 10') ||
    clean.includes('۸ و ۱۰') ||
    clean.includes('10 و 8') ||
    clean.includes('۱۰ و ۸') ||
    clean.includes('10 و8') ||
    clean.includes('۱۰ و۸') ||
    clean.includes('8و10') ||
    clean.includes('۸و۱۰')
  );
}

/**
 * Checks if a given cylinder type belongs to the 11kg / 25kg / 50kg cylinder valve family.
 * In industry standard and user business rules:
 * شیر سیلندر 11 کیلویی برابر است با شیر سیلندر 25 کیلویی و 50 کیلویی (شیر ۱۱/۲۵/۵۰)
 */
export function is11Or25Or50CylinderType(type?: string | null): boolean {
  if (!type) return false;
  const norm = normalizeCylinderType(type);
  return (
    norm === 'سیلندر 11 کیلویی' ||
    norm === 'سیلندر 8/10 کیلویی' ||
    norm === 'سیلندر 25 کیلویی' ||
    norm === 'سیلندر 50 کیلویی'
  );
}

export function isPicnic1LType(type?: string | null): boolean {
  if (!type) return false;
  const clean = cleanPersianText(type).toLowerCase();
  return (
    clean.includes('1/1.5/3') ||
    clean.includes('۱/۱.۵/۳') ||
    clean.includes('1/1.5') ||
    clean.includes('۱/۱.۵') ||
    clean.includes('1.5') ||
    clean.includes('۱.۵') ||
    clean.includes('1 لیتری') ||
    clean.includes('۱ لیتری') ||
    clean.includes('3 لیتری') ||
    clean.includes('۳ لیتری') ||
    clean.includes('پیکنیک 1') ||
    clean.includes('پیکنیک ۱') ||
    (clean.includes('پیکنیک') && !clean.includes('5') && !clean.includes('6') && !clean.includes('8'))
  );
}

export function normalizeCylinderType(type?: string | null): CylinderType {
  if (!type) return 'سیلندر 11 کیلویی';
  const clean = cleanPersianText(type);

  // 1. Check exact name match in dynamic catalog mappings
  try {
    const customMappings = LocalStorageManager.getCylinderTankMappings('OFFICE_WIN11');
    const customMatch = customMappings.find(
      m => m.name === type || m.name === clean || cleanPersianText(m.name) === clean || m.id === type
    );
    if (customMatch) return customMatch.name;
  } catch {}

  // 2. Check exact match in DEFAULT_CYLINDER_TANK_MAPPINGS
  const matchDef = DEFAULT_CYLINDER_TANK_MAPPINGS.find(
    m => m.name === type || m.name === clean || cleanPersianText(m.name) === clean || m.id === type
  );
  if (matchDef) return matchDef.name;

  // Strict unification: All forklift variants are the single unified model
  if (
    clean.includes('لیفتراک') ||
    clean === 'لیفتراکی 22 کیلویی' ||
    clean.includes('forklift')
  ) {
    return 'سیلندر لیفتراکی';
  }

  // 8/10 Cylinder (سیلندرهای ۱۰ و ۸ کیلویی - مربع قرمز بالایی)
  if (isCylinder810Type(clean)) {
    return 'سیلندر 8/10 کیلویی';
  }

  // Exact or near matches for the other standard catalog types
  if (clean.includes('مخزن 20') || clean.includes('مخزن ۲۰')) return 'مخزن 20 کیلویی(تپل/دراز)';
  if (clean.includes('مخزن 25') || clean.includes('مخزن ۲۵')) return 'مخزن 25 کیلویی (تپل/دراز)';
  if (clean.includes('مخزن 30') || clean.includes('مخزن ۳۰')) return 'مخزن 30 کیلویی(ریکشا/ساده)';
  if (clean.includes('مخزن 35') || clean.includes('مخزن ۳۵')) return 'مخزن 35 کیلویی (ریکشا/ساده/تپل)';
  if (clean.includes('60') || clean.includes('۶۰')) return 'مخزن 60 لیتری';
  if (clean.includes('80') || clean.includes('۸۰')) return 'مخزن 80 لیتری';
  if (clean.includes('105') || clean.includes('۱۰۵')) return 'مخزن 105 لیتری';
  if (clean.includes('125') || clean.includes('۱۲۵')) return 'مخزن 125 لیتری';

  // 1/1.5/3 Liter Picnic
  if (isPicnic1LType(clean)) {
    return 'پیکنیک 1/1.5/3 لیتری';
  }

  // 5/6 Kg Picnic (پیکنیک ۵ و ۶ کیلویی - مربع قرمز پایینی)
  if (isPicnic56Type(clean)) {
    return 'پیکنیک 5/6 کیلویی';
  }

  if (clean.includes('50') || clean.includes('۵۰') || clean === 'سیلندر 8 لیتری') {
    return 'سیلندر 50 کیلویی';
  }

  // 25kg or 25kg inputs map to 'سیلندر 8/10 کیلویی' as requested by user
  if (clean.includes('25') || clean.includes('۲۵')) {
    return 'سیلندر 8/10 کیلویی';
  }

  if (clean.includes('11') || clean.includes('۱۱')) {
    return 'سیلندر 11 کیلویی';
  }

  // If already matching any catalog name or custom name, preserve it
  if (clean && clean.trim().length > 0) {
    return clean.trim();
  }

  return 'سیلندر 11 کیلویی';
}

export interface CylinderRelationshipInfo {
  cylinderType: CylinderType;
  displayName: string;
  capacityLabel: string;
  description: string;
  isForklift: boolean;
  isTank: boolean;
  // Matching Valve Info
  matchingValveId?: string;
  matchingValveName: string;
  matchingValveModel: string;
  valvesPerCylinder: number;
  matchingValveDetails: string;
  matchingValve2Name?: string;
  // Matching Nut Info
  matchingNutId?: string;
  matchingNutName: string;
  nutsPerCylinder: number;
  matchingNutDetails: string;
  // Relationship summary
  ratioSummary: string;
}

export const CYLINDER_VALVE_SUBTYPES_MAP: Record<string, string[]> = {
  'سیلندر لیفتراکی': [
    'همه',
    'بوتان لیفتراکی',
    'پاساری لیفتراکی',
    'ایران گازی لیفتراکی',
    'پرسی لیفتراکی'
  ],
  'سیلندر 11 کیلویی': [
    'همه',
    'بوتان ۱۱ کیلویی',
    'پرسی ۱۱ کیلویی',
    'عراقی ۱۱ کیلویی',
    'ایران گازی ۱۱ کیلویی',
    'پاساری ۱۱ کیلویی'
  ],
  'سیلندر 8/10 کیلویی': [
    'همه',
    'بوتان ۲۵ کیلویی',
    'پرسی ۲۵ کیلویی',
    'عراقی ۲۵ کیلویی',
    'ایران گازی ۲۵ کیلویی'
  ],
  'سیلندر 25 کیلویی': [
    'همه',
    'بوتان ۲۵ کیلویی',
    'پرسی ۲۵ کیلویی',
    'عراقی ۲۵ کیلویی',
    'ایران گازی ۲۵ کیلویی'
  ],
  'سیلندر 50 کیلویی': [
    'همه',
    'بوتان ۵۰ کیلویی',
    'پرسی ۵۰ کیلویی',
    'عراقی ۵۰ کیلویی',
    'ایران گازی ۵۰ کیلویی'
  ],
  'پیکنیک 1/1.5/3 لیتری': [
    'همه',
    'بوتان ۱/۱.۵/۳ لیتری',
    'پرسی ۱/۱.۵/۳ لیتری'
  ],
  'پیکنیک 5/6 کیلویی': [
    'همه',
    'بوتان ۵/۸ کیلویی',
    'پرسی ۵/۸ کیلویی'
  ],
  'پیکنیک 5/8 کیلویی': [
    'همه',
    'بوتان ۵/۸ کیلویی',
    'پرسی ۵/۸ کیلویی'
  ]
};

export type ValveBrandKey = 'BUTANE' | 'PARSI' | 'PASSARI' | 'IRAN_GAZI' | 'IRAQI' | 'UNKNOWN';

/**
 * Extracts normalized brand key from valve title or subtype.
 * Strictly isolates PASSARI ("پاسار") from PARSI ("پرس").
 */
export function extractValveBrand(nameOrSubtype?: string | null): ValveBrandKey {
  if (!nameOrSubtype) return 'UNKNOWN';
  const clean = cleanPersianText(nameOrSubtype).toLowerCase();
  if (clean.includes('بوتان') || clean.includes('but')) return 'BUTANE';
  if (clean.includes('پاسار') || clean.includes('pasar')) return 'PASSARI';
  if (clean.includes('پرس') || clean.includes('parsi') || clean.includes('pars')) return 'PARSI';
  if (clean.includes('ایران') || clean.includes('irn')) return 'IRAN_GAZI';
  if (clean.includes('عراق') || clean.includes('irq')) return 'IRAQI';
  return 'UNKNOWN';
}

export interface SegregatedValveQuantities {
  new_valve_in: number;
  new_valve_out: number;
  used_valve_in: number;
  used_valve_out: number;
  isSegregated: boolean;
}

/**
 * Extracts exact segregated valve quantities for a given entry and target valve subtype.
 * Prioritizes itemized valve_items registered from valve intake / cylinder inspections.
 */
export function getEntrySegregatedValveQuantities(
  entry: GasKardexEntry,
  targetSubtype?: string,
  env?: RuntimeEnvironment
): SegregatedValveQuantities {
  if (!targetSubtype || targetSubtype === 'ALL' || targetSubtype === 'همه' || targetSubtype.includes('تجمیعی')) {
    return {
      new_valve_in: Number(entry.new_valve_in) || 0,
      new_valve_out: Number(entry.new_valve_out) || 0,
      used_valve_in: Number(entry.used_valve_in) || 0,
      used_valve_out: Number(entry.used_valve_out) || 0,
      isSegregated: false
    };
  }

  const targetBrand = extractValveBrand(targetSubtype);
  if (targetBrand === 'UNKNOWN') {
    return {
      new_valve_in: Number(entry.new_valve_in) || 0,
      new_valve_out: Number(entry.new_valve_out) || 0,
      used_valve_in: Number(entry.used_valve_in) || 0,
      used_valve_out: Number(entry.used_valve_out) || 0,
      isSegregated: false
    };
  }

  let segNewIn = 0;
  let segNewOut = 0;
  let segUsedIn = 0;
  let segUsedOut = 0;
  let found = false;

  // 1. Exact match from entry.valve_items (Strict Source of Truth)
  if (entry.valve_items && entry.valve_items.length > 0) {
    entry.valve_items.forEach(itm => {
      if (extractValveBrand(itm.valve_name) === targetBrand) {
        const q = Number(itm.quantity) || 0;
        if (itm.valve_category === 'NEW') {
          if (itm.direction === 'OUT') segNewOut += q;
          else segNewIn += q;
        } else {
          if (itm.direction === 'OUT') segUsedOut += q;
          else segUsedIn += q;
        }
      }
    });
    return {
      new_valve_in: segNewIn,
      new_valve_out: segNewOut,
      used_valve_in: segUsedIn,
      used_valve_out: segUsedOut,
      isSegregated: true
    };
  }

  // 2. From linked inspection breakdown if available
  if (entry.inspection_id && env) {
    try {
      const state = LocalStorageManager.getState(env);
      const insp = state.cylinder_valve_inspections?.find(i => i.inspection_id === entry.inspection_id);
      if (insp?.valve_breakdown) {
        const norm = normalizeCylinderType(entry.cylinder_type);
        let bNew: any;
        let bUsed: any;
        if (norm === 'سیلندر لیفتراکی') {
          bNew = insp.valve_breakdown.valvesForklift22kgNew;
          bUsed = insp.valve_breakdown.valvesForklift22kgUsed;
        } else if (norm === 'پیکنیک 1/1.5/3 لیتری') {
          bNew = insp.valve_breakdown.valvesPicnicNew || insp.valve_breakdown.valvesPicnic5kg;
          bUsed = insp.valve_breakdown.valvesPicnicUsed || insp.valve_breakdown.valvesPicnic2kg;
        } else if (norm === 'پیکنیک 5/6 کیلویی' || norm === 'پیکنیک 5/8 کیلویی') {
          bNew = insp.valve_breakdown.valvesPicnic58kgNew;
          bUsed = insp.valve_breakdown.valvesPicnic58kgUsed;
        } else {
          // 11kg, 25kg, 50kg all share the 11/25/50kg valve breakdown family
          bNew = insp.valve_breakdown.valves11kgNew;
          bUsed = insp.valve_breakdown.valves11kgUsed;
        }

        if (bNew || bUsed) {
          if (targetBrand === 'BUTANE') {
            segNewIn = Number(bNew?.butane) || 0;
            segUsedIn = Number(bUsed?.butane) || 0;
          } else if (targetBrand === 'PARSI') {
            segNewIn = Number(bNew?.parsi) || 0;
            segUsedIn = Number(bUsed?.parsi) || 0;
          } else if (targetBrand === 'PASSARI') {
            segNewIn = Number(bNew?.passari) || 0;
            segUsedIn = Number(bUsed?.passari) || 0;
          } else if (targetBrand === 'IRAN_GAZI') {
            segNewIn = Number(bNew?.iranGazi) || 0;
            segUsedIn = Number(bUsed?.iranGazi) || 0;
          } else if (targetBrand === 'IRAQI') {
            segNewIn = Number(bNew?.iraqi) || 0;
            segUsedIn = Number(bUsed?.iraqi) || 0;
          }

          return {
            new_valve_in: segNewIn,
            new_valve_out: segNewOut,
            used_valve_in: segUsedIn,
            used_valve_out: segUsedOut,
            isSegregated: true
          };
        }
      }
    } catch {}
  }

  // 3. From explicit entry subtype field
  const entrySub = entry.valve_subtype || entry.forklift_valve_type;
  if (entrySub) {
    if (extractValveBrand(entrySub) === targetBrand) {
      return {
        new_valve_in: Number(entry.new_valve_in) || 0,
        new_valve_out: Number(entry.new_valve_out) || 0,
        used_valve_in: Number(entry.used_valve_in) || 0,
        used_valve_out: Number(entry.used_valve_out) || 0,
        isSegregated: true
      };
    } else {
      return {
        new_valve_in: 0,
        new_valve_out: 0,
        used_valve_in: 0,
        used_valve_out: 0,
        isSegregated: true
      };
    }
  }

  // 4. From description text regex if contains brand name with numbers
  if (entry.description || entry.notes) {
    const text = cleanPersianText(`${entry.description || ''} ${entry.notes || ''}`);
    const brandLabel = targetBrand === 'BUTANE' ? 'بوتان' : (targetBrand === 'PARSI' ? 'پرسی' : (targetBrand === 'PASSARI' ? 'پاساری' : (targetBrand === 'IRAN_GAZI' ? 'ایران' : 'عراقی')));
    if (text.includes(brandLabel)) {
      const regex = new RegExp(`${brandLabel}[^۰-۹0-9]*([۰-۹0-9]+)`, 'i');
      const m = text.match(regex);
      if (m) {
        const val = parseInt(cleanPersianText(m[1]).replace(/[^0-9]/g, ''), 10) || 0;
        if (val > 0) {
          segNewIn = val;
          found = true;
        }
      } else {
        // Only use full values if no other competing brand names are in description
        const otherBrands = ['بوتان', 'پرسی', 'پاساری', 'ایران', 'عراقی'].filter(b => b !== brandLabel);
        const hasOtherBrands = otherBrands.some(ob => text.includes(ob));
        if (!hasOtherBrands) {
          segNewIn = Number(entry.new_valve_in) || 0;
          segNewOut = Number(entry.new_valve_out) || 0;
          segUsedIn = Number(entry.used_valve_in) || 0;
          segUsedOut = Number(entry.used_valve_out) || 0;
          found = true;
        }
      }
    }
  }

  return {
    new_valve_in: segNewIn,
    new_valve_out: segNewOut,
    used_valve_in: segUsedIn,
    used_valve_out: segUsedOut,
    isSegregated: true
  };
}

/**
 * Helper to match a GasKardexEntry to a specific valve subtype with strict brand separation.
 */
export function matchesForkliftSubtype(entry: GasKardexEntry, targetSubtype?: string, env?: RuntimeEnvironment): boolean {
  if (!targetSubtype || targetSubtype === 'ALL' || targetSubtype.includes('تجمیعی') || targetSubtype === 'همه') {
    return true;
  }
  const targetBrand = extractValveBrand(targetSubtype);
  if (targetBrand === 'UNKNOWN') return true;

  // 1. Strict match from valve_items if present
  if (entry.valve_items && entry.valve_items.length > 0) {
    return entry.valve_items.some(
      vi => extractValveBrand(vi.valve_name) === targetBrand && Number(vi.quantity) > 0
    );
  }

  // 2. Check explicit subtype fields
  if (entry.valve_subtype && extractValveBrand(entry.valve_subtype) === targetBrand) {
    return true;
  }
  if (entry.forklift_valve_type && extractValveBrand(entry.forklift_valve_type) === targetBrand) {
    return true;
  }

  // 3. Check inspection breakdown
  if (entry.inspection_id && env) {
    const seg = getEntrySegregatedValveQuantities(entry, targetSubtype, env);
    if (seg.new_valve_in > 0 || seg.used_valve_in > 0 || seg.new_valve_out > 0 || seg.used_valve_out > 0) {
      return true;
    }
  }

  // 4. Text match in description or notes
  const text = cleanPersianText(`${entry.description || ''} ${entry.notes || ''} ${entry.custom_item_name || ''}`).toLowerCase();
  if (targetBrand === 'BUTANE') return text.includes('بوتان') || text.includes('but');
  if (targetBrand === 'PASSARI') return text.includes('پاسار') || text.includes('pasar');
  if (targetBrand === 'PARSI') return (text.includes('پرس') || text.includes('parsi') || text.includes('pars')) && !text.includes('پاسار');
  if (targetBrand === 'IRAN_GAZI') return text.includes('ایران') || text.includes('irn');
  if (targetBrand === 'IRAQI') return text.includes('عراق') || text.includes('irq');

  return false;
}

export function matchesValveSubtype(entry: GasKardexEntry, targetSubtype?: string, env?: RuntimeEnvironment): boolean {
  return matchesForkliftSubtype(entry, targetSubtype, env);
}

export interface SegregatedCustomerValveBalanceDetails {
  new_balance: number;
  used_balance: number;
  total_balance: number;
  new_in: number;
  new_out: number;
  used_in: number;
  used_out: number;
}

/**
 * Computes exact segregated valve balance details (New, Used, Total) for a customer and cylinder type.
 * Supports the 11/25/50kg valve family cleanly and eliminates all brand leakage.
 */
export function getCustomerSpecificValveBalanceDetails(
  customerId: string | undefined,
  cylinderType: string,
  targetSubtype: string,
  allEntries: GasKardexEntry[],
  env?: RuntimeEnvironment
): SegregatedCustomerValveBalanceDetails {
  const zeroDetails: SegregatedCustomerValveBalanceDetails = {
    new_balance: 0,
    used_balance: 0,
    total_balance: 0,
    new_in: 0,
    new_out: 0,
    used_in: 0,
    used_out: 0
  };
  if (!customerId) return zeroDetails;

  const normType = normalizeCylinderType(cylinderType);
  const is11_25_50 = is11Or25Or50CylinderType(cylinderType);

  let entries = allEntries.filter(e => {
    if (e.customer_id !== customerId || e.is_deleted) return false;
    const eNorm = normalizeCylinderType(e.cylinder_type);
    if (eNorm === normType) return true;
    if (is11_25_50 && is11Or25Or50CylinderType(eNorm)) return true;
    return false;
  });

  if (!targetSubtype || targetSubtype === 'همه' || targetSubtype === 'ALL') {
    const sorted = [...entries].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
    const recalc = recalculateKardexBalances(sorted);
    const last = recalc[recalc.length - 1];
    const newBal = last ? (last.new_valve_balance || 0) : 0;
    const usedBal = last ? Math.max(0, last.used_valve_balance ?? 0) : 0;
    const totalNewIn = sorted.reduce((sum, e) => sum + (Number(e.new_valve_in) || 0), 0);
    const totalNewOut = sorted.reduce((sum, e) => sum + (Number(e.new_valve_out) || 0), 0);
    const totalUsedIn = sorted.reduce((sum, e) => sum + (Number(e.used_valve_in) || 0), 0);
    const totalUsedOut = sorted.reduce((sum, e) => sum + (Number(e.used_valve_out) || 0), 0);

    return {
      new_balance: newBal,
      used_balance: usedBal,
      total_balance: newBal + usedBal,
      new_in: totalNewIn,
      new_out: totalNewOut,
      used_in: totalUsedIn,
      used_out: totalUsedOut
    };
  }

  let totalNewIn = 0;
  let totalNewOut = 0;
  let totalUsedIn = 0;
  let totalUsedOut = 0;

  entries.forEach(e => {
    const seg = getEntrySegregatedValveQuantities(e, targetSubtype, env);
    totalNewIn += seg.new_valve_in;
    totalNewOut += seg.new_valve_out;
    totalUsedIn += seg.used_valve_in;
    totalUsedOut += seg.used_valve_out;
  });

  const newBal = totalNewIn - totalNewOut;
  const usedBal = Math.max(0, totalUsedIn - totalUsedOut);

  return {
    new_balance: newBal,
    used_balance: usedBal,
    total_balance: newBal + usedBal,
    new_in: totalNewIn,
    new_out: totalNewOut,
    used_in: totalUsedIn,
    used_out: totalUsedOut
  };
}

/**
 * Computes exact segregated valve balance for a customer and cylinder type.
 */
export function getCustomerSpecificValveBalance(
  customerId: string | undefined,
  cylinderType: string,
  targetSubtype: string,
  allEntries: GasKardexEntry[],
  env?: RuntimeEnvironment
): number {
  const details = getCustomerSpecificValveBalanceDetails(customerId, cylinderType, targetSubtype, allEntries, env);
  return details.total_balance;
}

/**
 * Returns the exact technical and warehouse relationship between
 * Cylinder (سیلندر), Valve (شیر), and Nut (مهره).
 * Dynamically queries Eng. Mousa Amouei's configured mappings from LocalStorageManager!
 */
export function getCylinderRelationshipInfo(
  cylinderType: string,
  env: RuntimeEnvironment = 'OFFICE_WIN11',
  forkliftValveType?: string
): CylinderRelationshipInfo {
  const normalized = normalizeCylinderType(cylinderType);

  // 1. First check user-configured mappings from LocalStorageManager
  let mapping: CylinderTankMapping | undefined;
  try {
    const customMappings = LocalStorageManager.getCylinderTankMappings(env);
    mapping = customMappings.find(
      m => m.name === normalized || m.name === cylinderType || normalizeCylinderType(m.name) === normalized
    );
  } catch {}

  // 2. Fallback to default catalog mapping if not found in custom storage
  if (!mapping) {
    mapping = DEFAULT_CYLINDER_TANK_MAPPINGS.find(
      m => m.name === normalized || m.name === cylinderType || normalizeCylinderType(m.name) === normalized
    );
  }

    const isTank = isTankType(normalized) || isTankType(cylinderType);
  if (isTank) {
    const nCount = mapping ? (mapping.nuts_per_cylinder || 1) : 1;
    const mName = mapping ? mapping.name : normalized;
    return {
      cylinderType: mName,
      displayName: mName,
      capacityLabel: mapping?.capacity || 'مخزن تحت فشار',
      description: mapping?.notes || 'مخزن گاز مایع ام‌گاز (بدون نیاز به شیر)',
      isForklift: false,
      isTank: true,
      matchingValveId: undefined,
      matchingValveName: 'بدون نیاز به شیر',
      matchingValveModel: '-',
      valvesPerCylinder: 0,
      matchingValveDetails: 'مخازن گاز نیازی به شیر ندارند',
      matchingNutId: mapping?.matching_nut_id || 'NUT-TANK',
      matchingNutName: mapping?.matching_nut_name || 'مهره مخزن',
      nutsPerCylinder: nCount,
      matchingNutDetails: String(nCount) + ' عدد مهره مخزن',
      ratioSummary: 'رابطه فنی: ۱ ' + mName + ' = بدون نیاز به شیر + ' + String(nCount) + ' مهره'
    };
  }

  if (mapping) {
    const isForklift = normalized === 'سیلندر لیفتراکی' || mapping.name.includes('لیفتراک') || (mapping.valves_per_cylinder || 1) > 1;
    const vCount = mapping.valves_per_cylinder || (isForklift ? 2 : 1);
    const nCount = mapping.nuts_per_cylinder || (isForklift ? 2 : 1);

    const activeForkliftValve = (isForklift && forkliftValveType && forkliftValveType !== 'ALL' && !forkliftValveType.includes('تجمیعی') && forkliftValveType !== 'همه')
      ? forkliftValveType
      : mapping.matching_valve_name;

    let matchingValveId = mapping.matching_valve_id;
    if (isForklift && activeForkliftValve !== mapping.matching_valve_name) {
      const cleanSub = cleanPersianText(activeForkliftValve);
      if (cleanSub.includes('بوتان')) matchingValveId = 'PRD-VLV-LIFT-BUT';
      else if (cleanSub.includes('پاسار') || cleanSub.includes('پرس')) matchingValveId = 'PRD-VLV-LIFT-PAR';
      else if (cleanSub.includes('ایران')) matchingValveId = 'PRD-VLV-LIFT-IRN';
      else if (cleanSub.includes('عراق')) matchingValveId = 'PRD-VLV-LIFT-IRQ';
    }

    const valveSummary = isForklift
      ? (activeForkliftValve !== mapping.matching_valve_name
          ? `${activeForkliftValve} (${vCount} عدد فاز مایع و بخار)`
          : (mapping.matching_valve_2_name
              ? `${mapping.matching_valve_name} (${vCount} عدد) + ${mapping.matching_valve_2_name} (۱ عدد)`
              : `${mapping.matching_valve_name} (${vCount} عدد)`))
      : (mapping.matching_valve_2_name
          ? `${mapping.matching_valve_name} (${vCount} عدد) + ${mapping.matching_valve_2_name} (۱ عدد)`
          : `${mapping.matching_valve_name} (${vCount} عدد)`);

    const ratioSummary = isForklift
      ? `رابطه فنی: ۱ سیلندر لیفتراک = ۲ عدد ${activeForkliftValve} + ۲ مهره`
      : `رابطه فنی: ۱ ${mapping.name} = ${vCount} شیر (${mapping.matching_valve_name}) + ${nCount} مهره (${mapping.matching_nut_name})`;

    return {
      cylinderType: mapping.name,
      displayName: isForklift && activeForkliftValve !== mapping.matching_valve_name ? `سیلندر لیفتراکی (${activeForkliftValve})` : mapping.name,
      capacityLabel: mapping.capacity,
      description: mapping.notes || `${mapping.name} ام‌گاز`,
      isForklift,
      isTank: false,
      matchingValveId,
      matchingValveName: activeForkliftValve,
      matchingValveModel: activeForkliftValve !== mapping.matching_valve_name ? activeForkliftValve : (mapping.matching_valve_sku || mapping.matching_valve_name),
      valvesPerCylinder: vCount,
      matchingValveDetails: valveSummary,
      matchingValve2Name: mapping.matching_valve_2_name,
      matchingNutId: mapping.matching_nut_id,
      matchingNutName: mapping.matching_nut_name,
      nutsPerCylinder: nCount,
      matchingNutDetails: `${nCount} عدد ${mapping.matching_nut_name}`,
      ratioSummary
    };
  }

  // 3. Fallback for 11kg default
  return {
    cylinderType: 'سیلندر 11 کیلویی',
    displayName: 'سیلندر ۱۱ کیلوگرم',
    capacityLabel: '۱۱ کیلوگرم خانگی/تجاری',
    description: 'کپسول گاز مایع ۱۱ کیلوگرمی استاندارد ام‌گاز',
    isForklift: false,
    isTank: false,
    matchingValveId: 'PRD-VLV-11-25-50',
    matchingValveName: 'شیر کپسول ۱۱ کیلویی (شیر ۱۱/۲۵/۵۰)',
    matchingValveModel: 'VLV-11-25-50',
    valvesPerCylinder: 1,
    matchingValveDetails: '۱ عدد شیر استاندارد به ازای هر سیلندر',
    matchingNutId: 'PRD-NUT-11-25-50-BUT',
    matchingNutName: 'مهره 11/25/50 کیلویی بوتانی',
    nutsPerCylinder: 1,
    matchingNutDetails: '۱ عدد مهره استاندارد ۱۱/۲۵/۵۰ کیلویی',
    ratioSummary: 'رابطه فنی: ۱ سیلندر ۱۱ک = ۱ شیر + ۱ مهره'
  };
}

export interface CylinderDetailedStockStatus {
  cylinderType: CylinderType;
  relationship: CylinderRelationshipInfo;
  // Customer Balances for this cylinder type
  customerCylinderBalance: number;
  customerScrapBalance: number;
  customerNewValveBalance: number;
  customerUsedValveBalance: number;
  // Physical Stock in Factory Warehouse (strictly for matching valve - NOT summed across other valves)
  warehouseMatchingValveStock: number;
  warehouseMatchingNutStock: number;
  warehouseCylinderStock: number;
  totalEntriesCount: number;
}

/**
 * Calculates real-time stock and balance for a specific cylinder type,
 * including customer balance and factory warehouse stock of its matching valve and nut.
 * STRICT ISOLATION: Never lumps different valve types together!
 */
export function getCylinderDetailedStock(
  env: RuntimeEnvironment,
  customerId: string,
  cylinderType: string,
  allEntries: GasKardexEntry[],
  forkliftValveSubtype?: string
): CylinderDetailedStockStatus {
  const normType = normalizeCylinderType(cylinderType);
  const relationship = getCylinderRelationshipInfo(normType, env, forkliftValveSubtype);

  const hasSpecificSubtype = Boolean(
    forkliftValveSubtype &&
    forkliftValveSubtype !== 'ALL' &&
    !forkliftValveSubtype.includes('تجمیعی') &&
    forkliftValveSubtype !== 'همه'
  );

  // 1. Calculate customer balance for this partitioned cylinder type
  const is11_25_50 = is11Or25Or50CylinderType(normType);
  let customerFiltered = allEntries.filter(e => {
    if (e.customer_id !== customerId || e.is_deleted) return false;
    const eNorm = normalizeCylinderType(e.cylinder_type);
    if (eNorm === normType) return true;
    if (is11_25_50 && is11Or25Or50CylinderType(eNorm)) return true;
    return false;
  });

  if (hasSpecificSubtype) {
    customerFiltered = customerFiltered.filter(e => matchesValveSubtype(e, forkliftValveSubtype, env));
  }

  const sorted = [...customerFiltered].sort((a, b) => {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  // Normalize entries so cylinder body counts of another size don't corrupt this cylinder size,
  // while valve quantities (which are identical and shared) are fully preserved and accumulated.
  const normalizedSorted = sorted.map(e => {
    const eNorm = normalizeCylinderType(e.cylinder_type);
    if (eNorm !== normType && is11_25_50 && is11Or25Or50CylinderType(eNorm)) {
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

  const toRecalculate = hasSpecificSubtype
    ? normalizedSorted.map(e => {
        const seg = getEntrySegregatedValveQuantities(e, forkliftValveSubtype, env);
        return {
          ...e,
          new_valve_in: seg.new_valve_in,
          new_valve_out: seg.new_valve_out,
          used_valve_in: seg.used_valve_in,
          used_valve_out: seg.used_valve_out
        };
      })
    : normalizedSorted;

  const recalculated = recalculateKardexBalances(toRecalculate, hasSpecificSubtype);
  const lastEntry = recalculated[recalculated.length - 1];

  const customerCylinderBalance = lastEntry ? lastEntry.cylinder_balance : 0;
  const customerScrapBalance = lastEntry ? Math.max(0, lastEntry.scrap_balance || 0) : 0;
  const customerNewValveBalance = relationship.isTank ? 0 : (lastEntry ? lastEntry.new_valve_balance : 0);
  const customerUsedValveBalance = relationship.isTank ? 0 : (lastEntry ? Math.max(0, lastEntry.used_valve_balance ?? 0) : 0);

  // 2. Calculate physical warehouse stock of matching valve and nut STRICTLY for this cylinder
  let warehouseMatchingValveStock = 0;
  let warehouseMatchingNutStock = 0;
  let warehouseCylinderStock = 0;

  try {
    // Specific valve stock query (NOT summing other valve types)
    if (!relationship.isTank) warehouseMatchingValveStock = LocalStorageManager.getSpecificValveWarehouseStock(env, {
      valveId: relationship.matchingValveId,
      valveName: relationship.matchingValveName,
      valveSku: relationship.matchingValveModel
    });

    // Specific nut stock query
    const state = LocalStorageManager.getState(env);
    const stockQuantities = LocalStorageManager.getStockQuantities(env);

    state.products.forEach(p => {
      const pName = (p.name || '').toLowerCase();
      const pSku = (p.sku || '').toUpperCase();
      const pId = (p.product_id || '').toUpperCase();

      let productTotal = 0;
      const whMap = stockQuantities[p.product_id];
      if (whMap) {
        Object.values(whMap).forEach(q => {
          productTotal += Number(q) || 0;
        });
      }

      // Check if product is matching nut
      if (relationship.isForklift) {
        if (pName.includes('لیفتراک') && (pName.includes('مهره') || pSku.includes('NUT-LIFT'))) {
          warehouseMatchingNutStock += Math.max(0, productTotal);
        }
      } else {
        if (
          (relationship.matchingNutId && p.product_id === relationship.matchingNutId) ||
          pName.includes('مهره 11/25/50') ||
          pName.includes('مهره ۱۱/۲۵/۵۰') ||
          pId.includes('NUT-11-25-50') ||
          pSku.includes('NUT-11-25-50')
        ) {
          warehouseMatchingNutStock += Math.max(0, productTotal);
        }
      }

      // Check if product is cylinder of this type
      if (relationship.isForklift) {
        if (pName.includes('سیلندر') && pName.includes('لیفتراک')) {
          warehouseCylinderStock += Math.max(0, productTotal);
        }
      } else if (normType === 'سیلندر 8/10 کیلویی' || normType === 'سیلندر 25 کیلویی') {
        if (pName.includes('سیلندر') && (pName.includes('8/10') || pName.includes('۸/۱۰') || pName.includes('25') || pName.includes('10') || pName.includes('8'))) {
          warehouseCylinderStock += Math.max(0, productTotal);
        }
      } else if (normType === 'پیکنیک 5/6 کیلویی' || normType === 'پیکنیک 5/8 کیلویی') {
        if (pName.includes('پیکنیک') && (pName.includes('5/6') || pName.includes('۵/۶') || pName.includes('5/8') || pName.includes('۵/۸') || pName.includes('5') || pName.includes('6'))) {
          warehouseCylinderStock += Math.max(0, productTotal);
        }
      } else if (normType === 'سیلندر 50 کیلویی') {
        if (pName.includes('سیلندر') && pName.includes('50')) {
          warehouseCylinderStock += Math.max(0, productTotal);
        }
      } else if (normType === 'سیلندر 11 کیلویی') {
        if (pName.includes('سیلندر') && pName.includes('11')) {
          warehouseCylinderStock += Math.max(0, productTotal);
        }
      }
    });
  } catch {
    // Graceful fallback
  }

  return {
    cylinderType: normType,
    relationship,
    customerCylinderBalance,
    customerScrapBalance,
    customerNewValveBalance,
    customerUsedValveBalance,
    warehouseMatchingValveStock,
    warehouseMatchingNutStock,
    warehouseCylinderStock,
    totalEntriesCount: customerFiltered.length
  };
}
