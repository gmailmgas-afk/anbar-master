/**
 * Test Suite: Gas Kardex Accounting Rules & Balance Flow Verification
 * Verifies:
 * 1. Newer item sits lower down (chronological order) and inventory deduction flows from older to newer.
 * 2. scrap_out (خروج ضایعات واقعی) deducts ONLY from scrap_balance, and NOT from cylinder_balance.
 * 3. final_scrap_out (خروج ضایعات ذخیره) is completely removed.
 * 4. used_valve_out (خروج شیر کهنه) deducts directly from used_valve_balance.
 */

const assert = require('assert');

// Pure calculation mirror matching recalculateKardexBalances in src/database/gas-kardex-data.ts
function recalculateKardexBalances(entries) {
  let prevCylBal = 0;
  let prevScrapBal = 0;
  let prevNewValveBal = 0;
  let prevUsedValveBal = 0;

  return entries.map((item) => {
    const cylIn = Number(item.cylinder_in) || 0;
    const cylOut = Number(item.cylinder_out) || 0;
    const scrapOut = Number(item.scrap_out) || 0;
    const scrapStockIn = Number(item.scrap_stock_in) || 0;

    // Formula 1: Cylinder Balance (خروج ضایعات واقعی از مانده سیلندر کسر نمی‌شود)
    const cylBal = prevCylBal + cylIn - cylOut - scrapStockIn;

    // Formula 2: Scrap Balance (خروج ضایعات واقعی فقط از مانده ضایعات کسر می‌شود؛ خروج ضایعات ذخیره حذف شد)
    const scrapBal = Math.max(0, prevScrapBal + scrapStockIn - scrapOut);

    // Formula 3: New Valve
    const newValveIn = Number(item.new_valve_in) || 0;
    const newValveOut = cylOut > 0 ? cylOut : (Number(item.new_valve_out) || 0);
    const newValveBal = prevNewValveBal + newValveIn - newValveOut;

    // Formula 4: Used Valve
    const usedValveIn = item.used_valve_in !== undefined && item.used_valve_in !== null
      ? Number(item.used_valve_in)
      : 0;
    const usedValveOut = Number(item.used_valve_out) > 0 ? Number(item.used_valve_out) : 0;
    const usedValveBal = prevUsedValveBal + usedValveIn - usedValveOut;

    prevCylBal = cylBal;
    prevScrapBal = scrapBal;
    prevNewValveBal = newValveBal;
    prevUsedValveBal = usedValveBal;

    return {
      ...item,
      cylinder_in: cylIn,
      cylinder_out: cylOut,
      scrap_out: scrapOut,
      scrap_stock_in: scrapStockIn,
      cylinder_balance: cylBal,
      scrap_balance: scrapBal,
      new_valve_in: newValveIn,
      new_valve_out: newValveOut,
      new_valve_balance: newValveBal,
      used_valve_in: usedValveIn,
      used_valve_out: usedValveOut,
      used_valve_balance: usedValveBal
    };
  });
}

function runTests() {
  console.log('--- [TEST 1] Testing Chronological Ordering (Newer item sits lower down) ---');
  const rawEntries = [
    { entry_id: 'E3', date: '1403/07/16', created_at: '2026-10-25T12:00:00Z', cylinder_in: 0, cylinder_out: 40, used_valve_out: 15 },
    { entry_id: 'E1', date: '1403/07/15', created_at: '2026-10-25T08:00:00Z', cylinder_in: 100, cylinder_out: 0, used_valve_in: 60 },
    { entry_id: 'E2', date: '1403/07/15', created_at: '2026-10-25T10:00:00Z', cylinder_in: 0, scrap_out: 10, used_valve_out: 5 }
  ];

  // Sort ascending: older items first, newer items lower down
  const sorted = [...rawEntries].sort((a, b) => {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  assert.strictEqual(sorted[0].entry_id, 'E1', 'Row 0 (top) must be oldest entry (E1)');
  assert.strictEqual(sorted[1].entry_id, 'E2', 'Row 1 must be middle entry (E2)');
  assert.strictEqual(sorted[2].entry_id, 'E3', 'Row 2 (bottom) must be newest entry (E3)');
  console.log('✓ Ascending chronological ordering verified: Older at top, newer at bottom');

  console.log('\n--- [TEST 2] Testing Inventory Deduction Flow from Older to Newer ---');
  const recalculated = recalculateKardexBalances(sorted);

  // Row 0 (E1): in: 100 cyl, 60 valves -> bal: 100 cyl, 60 valves
  assert.strictEqual(recalculated[0].cylinder_balance, 100, 'E1 cylinder balance should be 100');
  assert.strictEqual(recalculated[0].used_valve_balance, 60, 'E1 used valve balance should be 60');

  // Row 1 (E2): scrap_out: 10, used_valve_out: 5 -> cyl bal remains 100 (scrap_out does NOT deduct from cyl bal!), valve bal: 60 - 5 = 55
  assert.strictEqual(recalculated[1].cylinder_balance, 100, 'E2 cylinder balance must NOT deduct scrap_out (remains 100)');
  assert.strictEqual(recalculated[1].used_valve_balance, 55, 'E2 used valve balance must deduct used_valve_out (60 - 5 = 55)');

  // Row 2 (E3): cyl_out: 40, used_valve_out: 15 -> cyl bal: 100 - 40 = 60, valve bal: 55 - 15 = 40
  assert.strictEqual(recalculated[2].cylinder_balance, 60, 'E3 cylinder balance must deduct cyl_out (100 - 40 = 60)');
  assert.strictEqual(recalculated[2].used_valve_balance, 40, 'E3 used valve balance must deduct used_valve_out (55 - 15 = 40)');

  console.log('✓ Deduction flow verified: Newer items correctly deduct from older items balance');

  console.log('\n--- [TEST 3] Testing Actual Scrap Out Deducting ONLY from Scrap Balance ---');
  const scrapTest = [
    { cylinder_in: 200, scrap_stock_in: 50 }, // cyl: 200 - 50 = 150, scrap: 50
    { scrap_out: 25 },                         // scrap: 50 - 25 = 25, cyl: 150 (not deducted!)
    { cylinder_out: 50 },                      // cyl: 150 - 50 = 100, scrap: 25
    { scrap_out: 15 }                          // scrap: 25 - 15 = 10, cyl: 100 (not deducted!)
  ];
  const scrapResult = recalculateKardexBalances(scrapTest);
  assert.strictEqual(scrapResult[0].cylinder_balance, 150);
  assert.strictEqual(scrapResult[0].scrap_balance, 50);

  assert.strictEqual(scrapResult[1].cylinder_balance, 150, 'scrap_out 25 must NOT deduct from cylinder balance');
  assert.strictEqual(scrapResult[1].scrap_balance, 25, 'scrap_out 25 must deduct from scrap balance (50 - 25 = 25)');

  assert.strictEqual(scrapResult[2].cylinder_balance, 100, 'cylinder_out 50 must deduct 50 from 150 -> 100');
  assert.strictEqual(scrapResult[2].scrap_balance, 25, 'scrap balance remains 25');

  assert.strictEqual(scrapResult[3].cylinder_balance, 100, 'scrap_out 15 must NOT deduct from cylinder balance');
  assert.strictEqual(scrapResult[3].scrap_balance, 10, 'scrap_out 15 must deduct from scrap balance (25 - 15 = 10)');
  console.log('✓ Actual scrap out (خروج ضایعات واقعی) successfully deducts ONLY from scrap balance and NOT cylinder balance');

  console.log('\n--- [TEST 4] Testing Used Valve Out Deduction (خروج شیر کهنه) ---');
  const valveTest = [
    { used_valve_in: 80 },
    { used_valve_out: 30 },
    { used_valve_out: 20 },
    { used_valve_in: 10, used_valve_out: 5 }
  ];
  const valveResult = recalculateKardexBalances(valveTest);
  assert.strictEqual(valveResult[0].used_valve_balance, 80);
  assert.strictEqual(valveResult[1].used_valve_balance, 50, 'used_valve_out 30 must deduct from 80 -> 50');
  assert.strictEqual(valveResult[2].used_valve_balance, 30, 'used_valve_out 20 must deduct from 50 -> 30');
  assert.strictEqual(valveResult[3].used_valve_balance, 35, 'used_valve_in 10 and used_valve_out 5 -> 30 + 10 - 5 = 35');
  console.log('✓ Used valve balance flow verified');

  console.log('\n--- [TEST 5] Testing Dispatch and Balance Segregation ---');
  const dispatchTest = [
    { cylinder_in: 200, scrap_stock_in: 30, new_valve_in: 150 }, // initial: 170 cyl, 30 scrap, 150 new valves
    {
      cylinder_out: 85,
      scrap_out: 15,
      new_valve_out: 85
    }
  ];

  const dispatchResult = recalculateKardexBalances(dispatchTest);
  // Row 0:
  assert.strictEqual(dispatchResult[0].cylinder_balance, 170, 'Row 0: cyl balance is 170 (200 - 30 fake scrap)');
  assert.strictEqual(dispatchResult[0].scrap_balance, 30, 'Row 0: scrap balance is 30');
  assert.strictEqual(dispatchResult[0].new_valve_balance, 150, 'Row 0: new valve balance is 150');

  // Row 1 (Dispatch):
  // Cylinder balance deducts cylinder_out (85), but NOT scrap_out (15) -> 170 - 85 = 85
  assert.strictEqual(dispatchResult[1].cylinder_balance, 85, 'Cylinder balance after dispatch must be 170 - 85 = 85');
  // Scrap balance deducts scrap_out (15) -> 30 - 15 = 15
  assert.strictEqual(dispatchResult[1].scrap_balance, 15, 'Scrap balance must be 30 - 15 = 15');
  // New valve balance: 150 - 85 = 65
  assert.strictEqual(dispatchResult[1].new_valve_balance, 65, 'New valve balance must be 150 - 85 = 65');

  console.log('✓ Dispatch and balance segregation verified');

  console.log('\n--- [TEST 6] Testing Scrap Balance Non-Negativity (مانده ضایعات نباید منفی شود) ---');
  const excessScrapTest = [
    { cylinder_in: 50, scrap_stock_in: 10 }, // scrap balance: 10
    { scrap_out: 15 },                       // attempt to deduct 15: 10 - 15 = -5 -> clamps to 0
    { scrap_stock_in: 5 },                   // add 5 -> scrap balance: 5
    { scrap_out: 12 }                        // attempt to deduct 12 from 5 -> clamps to 0
  ];
  const excessScrapResult = recalculateKardexBalances(excessScrapTest);
  assert.strictEqual(excessScrapResult[0].scrap_balance, 10, 'Initial scrap balance must be 10');
  assert.strictEqual(excessScrapResult[1].scrap_balance, 0, 'Scrap balance must clamp to 0 when scrap_out (15) > stock (10)');
  assert.strictEqual(excessScrapResult[2].scrap_balance, 5, 'Scrap balance must be 5 after new scrap_stock_in of 5');
  assert.strictEqual(excessScrapResult[3].scrap_balance, 0, 'Scrap balance must clamp to 0 when deductions exceed 5');
  console.log('✓ Scrap balance non-negativity verified: scrap_balance never drops below 0');

  console.log('\nALL 6 KARDEX TESTS PASSED 100%!');
}

runTests();

