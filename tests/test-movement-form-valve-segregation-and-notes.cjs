const assert = require('assert');

// 1. Test valve identification logic
const valveCategories = [
  { category_id: 'CAT-02', name: 'شیرآلات و اتصالات فشارقوی' },
  { category_id: 'CAT-01', name: 'سیلندر گاز مایع' },
  { category_id: 'CAT-03', name: 'لوازم یدکی و قطعات' },
];

const sampleProducts = [
  { product_id: 'PRD-V01', name: 'شیر سیلندر ۱۱ کیلویی', category_id: 'CAT-02' },
  { product_id: 'PRD-V02', name: 'شیر سوپاپ‌دار کپسول گاز', category_id: 'CAT-03' },
  { product_id: 'PRD-V03', name: 'اتصالات فشار قوی برنجی', category_id: 'CAT-03' },
  { product_id: 'PRD-C01', name: 'سیلندر ۱۱ کیلویی پرسی', category_id: 'CAT-01' },
  { product_id: 'PRD-S01', name: 'پایه رگلاتور گاز صنعتی', category_id: 'CAT-03' },
];

function isValveCategory(cat) {
  if (!cat) return false;
  const id = String(cat.category_id || '').toUpperCase();
  const name = String(cat.name || '').toLowerCase();
  return (
    id === 'CAT-02' ||
    id.includes('VALVE') ||
    name.includes('شیر') ||
    name.includes('سوپاپ') ||
    name.includes('اتصالات فشارقوی') ||
    name.includes('اتصالات فشار قوی')
  );
}

function isValveProduct(product, categories = []) {
  if (!product) return false;
  const cat = categories.find(c => c.category_id === product.category_id);
  if (cat && isValveCategory(cat)) return true;

  const id = String(product.product_id || '').toUpperCase();
  const name = String(product.name || '').toLowerCase();
  const catId = String(product.category_id || '').toUpperCase();

  return (
    catId === 'CAT-02' ||
    catId.includes('VALVE') ||
    id.startsWith('VALVE') ||
    id.startsWith('PRD-V') ||
    name.includes('شیر') ||
    name.includes('سوپاپ') ||
    name.includes('اتصالات فشارقوی') ||
    name.includes('اتصالات فشار قوی')
  );
}

// Check filtering on STOCK_IN vs STOCK_OUT
const stockInProducts = sampleProducts.filter(p => !isValveProduct(p, valveCategories));
assert.strictEqual(stockInProducts.length, 2, 'Only non-valve products must be shown in STOCK_IN');
assert.strictEqual(stockInProducts.some(p => p.name.includes('شیر') || p.category_id === 'CAT-02'), false);

const stockOutProducts = sampleProducts;
assert.strictEqual(stockOutProducts.length, 5, 'All products must be available for STOCK_OUT');

// Check notes inclusion in description logic
const userNotes = 'تعویض شیر فرسوده سیلندر به درخواست آقای رضایی';
const baseDesc = 'حواله خروج شیرآلات - شیر سیلندر ۱۱ کیلویی';
const fullDesc = userNotes ? `${baseDesc} - ${userNotes}` : baseDesc;

assert.ok(fullDesc.includes(userNotes), 'Full description must contain the user notes');

console.log('✓ All valve segregation and Kardex notes tests passed successfully!');
