import { Product, Category } from '../types';

/**
 * Checks if a category corresponds to valves / valve accessories.
 */
export function isValveCategory(cat: Category | null | undefined): boolean {
  if (!cat) return false;
  const name = (cat.name || '').trim().toLowerCase();
  const code = (cat.code || '').trim().toUpperCase();
  const id = (cat.category_id || '').trim().toUpperCase();

  return (
    id === 'CAT-02' ||
    id === 'CAT-VALVES' ||
    id.includes('VALVE') ||
    code === 'VALVE' ||
    code.includes('VALVE') ||
    name.includes('شیر') ||
    name.includes('اتصالات فشار') ||
    name.includes('اتصالات فشارقوی') ||
    name.includes('اتصالات فشار قوی')
  );
}

/**
 * Checks if a product is a valve item.
 */
export function isValveProduct(
  prod: Product | null | undefined,
  categories?: Category[]
): boolean {
  if (!prod) return false;

  const sku = (prod.sku || '').trim().toUpperCase();
  const name = (prod.name || '').trim().toLowerCase();
  const catId = (prod.category_id || '').trim().toUpperCase();

  // 1. Direct ID match
  if (catId === 'CAT-02' || catId === 'CAT-VALVES' || catId.includes('VALVE')) {
    return true;
  }

  // 2. Parent Category check
  if (categories && categories.length > 0) {
    const parentCat = categories.find(c => c.category_id === prod.category_id);
    if (parentCat && isValveCategory(parentCat)) {
      return true;
    }
  }

  // 3. SKU or name match
  if (
    sku.startsWith('VLV') ||
    sku.includes('VALVE') ||
    sku.startsWith('PRD-VLV') ||
    name.includes('شیر') ||
    name.includes('سوپاپ') ||
    name.includes('اتصالات فشار') ||
    name.includes('اتصالات فشارقوی') ||
    name.includes('اتصالات فشار قوی')
  ) {
    return true;
  }

  return false;
}
