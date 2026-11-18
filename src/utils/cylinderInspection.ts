import { CylinderValveInspection, CustomCylinderItemType } from '../types';

/**
 * Checks if an inspection record is specifically for an Incoming Repair Cylinder (ورود سیلندر تعمیری).
 */
export function isRepairCylinderInspection(
  insp: Partial<CylinderValveInspection> | null | undefined,
  customTypes?: CustomCylinderItemType[]
): boolean {
  if (!insp) return false;

  const itemType = (insp.item_type || '').toUpperCase();
  const itemName = (insp.item_name || '').toLowerCase();

  // 1. If custom item types are provided, verify the defined category
  if (customTypes && customTypes.length > 0) {
    const matched = customTypes.find(
      t => t.id === insp.item_type || t.name.trim().toLowerCase() === itemName.trim()
    );
    if (matched) {
      if (matched.category === 'CYLINDER') return true;
      if (matched.category === 'VALVE' || matched.category === 'SCRAP' || matched.category === 'OTHER') {
        return false;
      }
    }
  }

  // 2. Explicit valve or scrap exclusion: valves and scrap are NOT repair cylinders
  if (
    itemType.startsWith('VALVE') ||
    itemType.includes('VALVE') ||
    itemName.includes('شیر') ||
    itemType.startsWith('SCRAP') ||
    itemName.includes('ضایعات') ||
    itemName.includes('اسقاط')
  ) {
    return false;
  }

  // 3. Must be a cylinder (سیلندر تعمیری گاز)
  return (
    itemType.startsWith('CYLINDER') ||
    itemType.includes('CYLINDER') ||
    itemName.includes('سیلندر') ||
    itemName.includes('کپسول')
  );
}

/**
 * Checks if an inspection is for incoming customer valves (ورودی شیر برای مشتریان / طرف‌حساب‌ها).
 * STRICT: Incoming cylinders / repair cylinders are NEVER customer valves!
 */
export function isCustomerValveInspection(
  insp: Partial<CylinderValveInspection> | null | undefined,
  customTypes?: CustomCylinderItemType[]
): boolean {
  if (!insp) return false;
  // Valves from suppliers to central stock are not customer assets
  if (insp.source_type === 'SUPPLIER') return false;

  // 1. Explicit cylinder inspection check: cylinders are NEVER customer valves
  if (isRepairCylinderInspection(insp, customTypes)) {
    return false;
  }

  const itemType = (insp.item_type || '').toUpperCase();
  const itemName = (insp.item_name || '').toLowerCase();

  // 2. If name or type indicates cylinder/capsule, it's not a valve
  if (
    itemType.startsWith('CYLINDER') ||
    itemType.includes('CYLINDER') ||
    itemName.includes('سیلندر') ||
    itemName.includes('کپسول')
  ) {
    return false;
  }

  if (itemType.includes('VALVE') || itemName.includes('شیر')) return true;

  // 3. Check receipt items: only consider it a valve if description/remarks explicitly has 'شیر' AND does NOT indicate a cylinder
  if (
    insp.receipt_items &&
    insp.receipt_items.some(r => {
      const d = (r.description || '').toLowerCase();
      const m = (r.remarks || '').toLowerCase();
      const hasValveWord = d.includes('شیر') || m.includes('شیر');
      const hasCylinderWord = d.includes('سیلندر') || d.includes('کپسول') || m.includes('سیلندر') || m.includes('کپسول');
      return hasValveWord && !hasCylinderWord;
    })
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if an inspection is a pending inspection awaiting Kardex registration.
 * Includes both incoming repair cylinders AND incoming valves for customers/counterparties.
 */
export function isPendingRepairCylinderKardex(
  insp: CylinderValveInspection,
  customTypes?: CustomCylinderItemType[]
): boolean {
  if (insp.status !== 'COUNTED_READY_FOR_KARDEX') return false;
  return isRepairCylinderInspection(insp, customTypes) || isCustomerValveInspection(insp);
}
