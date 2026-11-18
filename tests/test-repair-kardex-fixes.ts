import assert from 'assert';
import { recalculateKardexBalances } from '../src/database/gas-kardex-data.ts';
import { isCustomerValveInspection, isRepairCylinderInspection } from '../src/utils/cylinderInspection.ts';

console.log('--- [TEST 1] خروج ضایعات واقعی فقط باید از مانده ضایعات کسر شود و نه از مانده سیلندر ---');
const entries = [
  {
    entry_id: '1',
    customer_id: 'CUST-001',
    customer_name: 'البرز گاز',
    cylinder_type: 'سیلندر 11 کیلویی',
    date: '1403/07/15',
    description: 'دریافت اولیه',
    transfer_sheet_number: 'ABZ14030715i',
    cylinder_in: 100,
    cylinder_out: 0,
    scrap_stock_in: 20, // 20 fake scrap moves from cylinder to scrap
    scrap_out: 0,
    cylinder_balance: 80,
    scrap_balance: 20,
    new_valve_in: 10,
    new_valve_out: 0,
    new_valve_balance: 10
  },
  {
    entry_id: '2',
    customer_id: 'CUST-001',
    customer_name: 'البرز گاز',
    cylinder_type: 'سیلندر 11 کیلویی',
    date: '1403/07/16',
    description: 'خروج ضایعات واقعی',
    transfer_sheet_number: 'ABZ14030716e',
    cylinder_in: 0,
    cylinder_out: 0,
    scrap_stock_in: 0,
    scrap_out: 15, // 15 real scrap exit
    cylinder_balance: 80,
    scrap_balance: 5,
    new_valve_in: 0,
    new_valve_out: 0,
    new_valve_balance: 10
  }
];

const res = recalculateKardexBalances(entries as any);

// Entry 1:
// cyl balance: 0 + 100 - 0 - 20 = 80
// scrap balance: 0 + 20 - 0 = 20
assert.strictEqual(res[0].cylinder_balance, 80, 'Entry 1: cylinder balance should be 80');
assert.strictEqual(res[0].scrap_balance, 20, 'Entry 1: scrap balance should be 20');

// Entry 2:
// cyl balance: should REMAIN 80! (scrap_out does NOT deduct from cylinder balance)
assert.strictEqual(res[1].cylinder_balance, 80, 'Entry 2: cylinder balance must remain 80 and NOT deduct scrap_out');
// scrap balance: 20 - 15 = 5 (deducted from scrap balance!)
assert.strictEqual(res[1].scrap_balance, 5, 'Entry 2: scrap balance must deduct scrap_out (20 - 15 = 5)');
console.log('✓ Rule 1 verified: scrap_out deducts ONLY from scrap_balance, NOT cylinder_balance');

console.log('\n--- [TEST 2] خروج ضایعات ذخیره کلا حذف شده است ---');
assert.strictEqual(res[0].final_scrap_out, undefined, 'final_scrap_out should be removed/undefined');
assert.strictEqual(res[1].final_scrap_out, undefined, 'final_scrap_out should be removed/undefined');
console.log('✓ Rule 2 verified: final_scrap_out is completely removed');

console.log('\n--- [TEST 3] تفکیک ورود سیلندر تعمیری از ورودی شیر مشتری ---');
const repairCylinderInspection = {
  inspection_id: 'INSP-CYL-1',
  customer_id: 'CUST-001',
  customer_name: 'البرز گاز',
  item_name: 'سیلندر 11 کیلویی',
  item_type: 'CYLINDER_11KG',
  declared_quantity: 290,
  actual_healthy_quantity: 290,
  defective_quantity: 0,
  remarks: 'ورود سیلندر تعمیری جهت بازسازی',
  status: 'PENDING_KARDEX',
  receipt_items: [
    {
      item_name: 'سیلندر 11 کیلویی',
      quantity: 290,
      description: 'سیلندر 11 کیلویی',
      remarks: 'تحویل داده شده جهت تعمیر کپسول گاز'
    }
  ]
};

const isCyl = isRepairCylinderInspection(repairCylinderInspection as any);
const isCustValve = isCustomerValveInspection(repairCylinderInspection as any);

assert.strictEqual(isCyl, true, 'repair cylinder inspection must be recognized as repair cylinder');
assert.strictEqual(isCustValve, false, 'repair cylinder inspection must NOT be recognized as customer valve');
console.log('✓ Rule 3 verified: Repair cylinder inspection is strictly isolated from customer valves');

console.log('\n======================================================');
console.log('ALL THREE USER REQUIREMENTS VERIFIED & PASSED 100%! ✓');
console.log('======================================================');
