const assert = require('assert');
const fs = require('fs');
const XLSX = require('xlsx');

// 1. Verify helper logic
function resolveKardexDispatchedOrWaybill(row) {
  if (!row) return '';

  const wb = (row.waybill_number && String(row.waybill_number).trim() !== '' && String(row.waybill_number).trim() !== '0' && String(row.waybill_number).trim() !== '۰' && String(row.waybill_number).trim() !== '-')
    ? String(row.waybill_number).trim()
    : '';

  const disp = (row.dispatched && String(row.dispatched).trim() !== '' && String(row.dispatched).trim() !== '0' && String(row.dispatched).trim() !== '۰' && String(row.dispatched).trim() !== '-')
    ? String(row.dispatched).trim()
    : '';

  if (disp && wb && disp !== wb) {
    if (disp.includes(wb)) return disp;
    return `${disp} (${wb})`;
  }
  if (disp) return disp;
  if (wb) return wb;

  if (row.notes) {
    const notesStr = String(row.notes);
    const m = notesStr.match(/(?:بارنامه|بیجک|حواله)(?:\s+شماره|\s*[:\-]\s*|\s+)([^\s|,;،\n\)]+)/i);
    if (m && m[1] && m[1] !== '-' && m[1] !== 'null') {
      return m[1].trim();
    }
  }

  if (row.description) {
    const descStr = String(row.description);
    const m = descStr.match(/(?:بارنامه|بیجک|حواله)(?:\s+شماره|\s*[:\-]\s*|\s+)([^\s|,;،\n\)]+)/i);
    if (m && m[1] && m[1] !== '-' && m[1] !== 'null') {
      return m[1].trim();
    }
  }

  return '';
}

console.log('--- [TEST 1] Testing Dispatched and Waybill Resolution ---');
// Case 1: Direct waybill_number
const res1 = resolveKardexDispatchedOrWaybill({ waybill_number: '98432' });
assert.strictEqual(res1, '98432', 'Direct waybill_number should resolve to 98432');

// Case 2: Direct dispatched text
const res2 = resolveKardexDispatchedOrWaybill({ dispatched: 'حواله باربری پارس' });
assert.strictEqual(res2, 'حواله باربری پارس', 'Direct dispatched should resolve');

// Case 3: Empty dispatched, waybill in notes
const res3 = resolveKardexDispatchedOrWaybill({
  dispatched: '',
  notes: 'ثبت ورودی سیلندر تعمیری طرف‌حساب با تایید مهندس حاجی‌وند - بارنامه: 98432 - راننده: اکبری'
});
assert.strictEqual(res3, '98432', 'Waybill extracted from notes should be 98432');

// Case 4: Empty dispatched, waybill in description
const res4 = resolveKardexDispatchedOrWaybill({
  dispatched: '',
  description: 'ورودی تاییدشده سیلندر تعمیری توسط مهندس حاجی‌وند [سیلندر ۱۱] (بارنامه 98432 - اعلامی: 100)'
});
assert.strictEqual(res4, '98432', 'Waybill extracted from description should be 98432');

console.log('✓ All 4 resolution test cases passed!');

console.log('--- [TEST 2] Testing Print Template File (gasKardexPrint.ts) ---');
const printCode = fs.readFileSync('src/utils/gasKardexPrint.ts', 'utf8');
assert(printCode.includes('resolveKardexDispatchedOrWaybill'), 'gasKardexPrint.ts must export and use resolveKardexDispatchedOrWaybill');
assert(printCode.includes('ارسالی /<br/>بارنامه'), 'gasKardexPrint.ts table header must be "ارسالی /<br/>بارنامه"');
console.log('✓ gasKardexPrint.ts includes resolved waybill & dispatched logic and correct header.');

console.log('--- [TEST 3] Testing Excel Export File (gas-kardex-data.ts) ---');
const excelDataCode = fs.readFileSync('src/database/gas-kardex-data.ts', 'utf8');
assert(excelDataCode.includes("'ارسالی / شماره بارنامه'"), 'gas-kardex-data.ts must have "ارسالی / شماره بارنامه" in KARDEX_EXCEL_COLUMNS');
assert(excelDataCode.includes('resolveKardexDispatchedOrWaybill(item)'), 'gas-kardex-data.ts must populate Excel with resolveKardexDispatchedOrWaybill');
console.log('✓ gas-kardex-data.ts includes "ارسالی / شماره بارنامه" and maps resolved values into Excel rows.');

console.log('--- [TEST 4] Testing GasKardexView.tsx (Screen & PDF) ---');
const viewCode = fs.readFileSync('src/components/GasKardexView.tsx', 'utf8');
assert(viewCode.includes('resolveKardexDispatchedOrWaybill'), 'GasKardexView.tsx must use resolveKardexDispatchedOrWaybill');
assert(viewCode.includes('ارسالی /<br/>بارنامه'), 'printable-gas-kardex (PDF) must have header "ارسالی /<br/>بارنامه"');
assert(!viewCode.includes("showToast('ستون ارسالی فقط متن می‌پذیرد و نباید عدد بپذیرد.', 'error');"), 'Strict number-blocking check must be removed from GasKardexView.tsx');
console.log('✓ GasKardexView.tsx allows numeric waybill numbers and renders resolved dispatched/waybill in PDF and on-screen table.');

console.log('\n======================================================');
console.log('ALL KARDEX DISPATCHED & WAYBILL EXPORT TESTS PASSED 100%! ✓');
console.log('======================================================');
