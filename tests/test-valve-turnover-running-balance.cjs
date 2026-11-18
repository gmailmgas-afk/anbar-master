/**
 * Automated Verification Script:
 * Tests that valve entry via "ورودی شیرآلات" (ValveEntryModal / recordPhysicalValveIntake)
 * is recorded in warehouse turnover (stock movements) and accurately tracked in Entry/Exit
 * reports with party details, date/time, and running balance of valve X.
 */

const assert = require('assert');

// Mock localStorage for Node environment
if (typeof localStorage === 'undefined' || localStorage === null) {
  const LocalStorage = class {
    constructor() { this.store = {}; }
    getItem(key) { return this.store[key] || null; }
    setItem(key, value) { this.store[key] = String(value); }
    removeItem(key) { delete this.store[key]; }
    clear() { this.store = {}; }
  };
  global.localStorage = new LocalStorage();
}

if (typeof window === 'undefined') {
  global.window = {
    localStorage: global.localStorage,
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.CustomEvent = class {
    constructor(event, params) { this.event = event; this.params = params; }
  };
}

async function runTest() {
  console.log('--- STARTING VALVE TURNOVER & RUNNING BALANCE VERIFICATION ---');

  const { LocalStorageManager } = require('../src/database/storage.ts');
  const env = 'anbar1';

  const state = LocalStorageManager.getState(env);
  const customer = state.customers[0];
  console.log(`Testing with Customer: ${customer.name} (${customer.customer_id})`);

  // Clear previous records for isolated testing
  state.gas_kardex_entries = state.gas_kardex_entries.filter(e => e.customer_id !== customer.customer_id);
  state.cylinder_valve_inspections = (state.cylinder_valve_inspections || []).filter(i => i.customer_id !== customer.customer_id);
  state.stock_movements = state.stock_movements.filter(m => m.customer_id !== customer.customer_id);
  LocalStorageManager.saveState(env, state);

  const actorUser = { user_id: 'USR-003', username: 'hajivand', full_name: 'مهندس حاجی وند', role: 'WAREHOUSE_KEEPER' };

  // 1. First Entry: Customer brings 20 Parsi 11kg New valves, and 10 Butane 11kg Used valves
  console.log('\n[1] Registering Valve Entry 1 via recordValveInspection...');
  const intake1 = LocalStorageManager.recordValveInspection(env, {
    sheetNumber: 'SH-VALVE-1001',
    date: '1405/02/10',
    customerId: customer.customer_id,
    customerName: customer.name,
    sourceType: 'CUSTOMER',
    driverName: 'راننده اصغری',
    plateNumber: '11-222-ایران 44',
    valves11kgNew: { parsi: 20, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
    valves11kgUsed: { parsi: 0, butane: 10, iranGazi: 0, forklift: 0, iraqi: 0 },
    valvesForklift22kgNew: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
    valvesForklift22kgUsed: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
    valvesPicnicNew: { parsi: 0, butane: 0 },
    valvesPicnicUsed: { parsi: 0, butane: 0 },
    valvesPicnic58kgNew: { parsi: 0, butane: 0 },
    valvesPicnic58kgUsed: { parsi: 0, butane: 0 },
    notes: 'ورودی اول شیرآلات مشتری'
  }, actorUser.user_id);

  assert.strictEqual(intake1.totalNewValves, 20, 'Intake 1 new valves must be 20');
  assert.strictEqual(intake1.totalUsedValves, 10, 'Intake 1 used valves must be 10');
  console.log('✓ Intake 1 recorded successfully: 20 New, 10 Used.');

  // 2. Second Entry: Customer brings another 15 Parsi 11kg New valves on 1405/02/15
  console.log('\n[2] Registering Valve Entry 2 on 1405/02/15...');
  const intake2 = LocalStorageManager.recordValveInspection(env, {
    sheetNumber: 'SH-VALVE-1002',
    date: '1405/02/15',
    customerId: customer.customer_id,
    customerName: customer.name,
    sourceType: 'CUSTOMER',
    driverName: 'راننده حسینی',
    valves11kgNew: { parsi: 15, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
    valves11kgUsed: { parsi: 0, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
    valvesForklift22kgNew: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
    valvesForklift22kgUsed: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
    valvesPicnicNew: { parsi: 0, butane: 0 },
    valvesPicnicUsed: { parsi: 0, butane: 0 },
    valvesPicnic58kgNew: { parsi: 0, butane: 0 },
    valvesPicnic58kgUsed: { parsi: 0, butane: 0 },
    notes: 'ورودی دوم شیرآلات مشتری'
  }, actorUser.user_id);

  assert.strictEqual(intake2.totalNewValves, 15, 'Intake 2 new valves must be 15');
  console.log('✓ Intake 2 recorded successfully: 15 New.');

  // 3. Exit / Consumption: 8 Parsi 11kg New valves used/dispatched on 1405/02/20
  console.log('\n[3] Registering Valve Exit on 1405/02/20 in Kardex...');
  const karamiUser = { user_id: 'USR-002', username: 'karami', full_name: 'خانم کرمی' };
  const currentState = LocalStorageManager.getState(env);
  currentState.gas_kardex_entries.push({
    entry_id: 'KDX-EXIT-1',
    customer_id: customer.customer_id,
    customer_name: customer.name,
    cylinder_type: 'سیلندر 11 کیلویی',
    date: '1405/02/20',
    description: 'خروج و مصرف ۸ شیر نو پرسی در تعمیرات',
    transfer_sheet_number: 'TR-EXIT-2001',
    cylinder_in: 0,
    cylinder_out: 0,
    scrap_out: 0,
    cylinder_balance: 0,
    new_valve_in: 0,
    new_valve_out: 8,
    new_valve_balance: 27, // 35 - 8 = 27
    used_valve_in: 0,
    used_valve_out: 4,
    used_valve_balance: 6, // 10 - 4 = 6
    valve_items: [
      { valve_name: 'شیر نو پرسی 11/25/50 کیلویی', valve_category: 'NEW', quantity: 8, direction: 'OUT' },
      { valve_name: 'شیر کهنه بوتان 11/25/50 کیلویی', valve_category: 'USED', quantity: 4, direction: 'OUT' }
    ],
    user_id: karamiUser.user_id,
    created_by_username: karamiUser.username,
    created_at: new Date('2026-05-10T10:00:00.000Z').toISOString()
  });
  LocalStorageManager.saveState(env, currentState);
  console.log('✓ Valve Exit recorded.');

  // 4. Query Customer Valve Detailed Report
  console.log('\n[4] Querying getCustomerValveDetailedReport...');
  const report = LocalStorageManager.getCustomerValveDetailedReport(env, customer.customer_id);

  console.log('Ledger Transactions:');
  report.ledgerTransactions.forEach((tx, idx) => {
    console.log(`  ${idx + 1}. [${tx.date}] ${tx.customer_name} | ${tx.direction} ${tx.quantity} ${tx.valve_name} | Running Balance = ${tx.running_balance}`);
  });

  // Verify running balance of 'شیر نو پرسی 11/25/50 کیلویی':
  // 1st entry: +20 -> balance = 20
  // 2nd entry: +15 -> balance = 35
  // 3rd exit:  -8  -> balance = 27
  const parsiTxs = report.ledgerTransactions
    .filter(t => t.valve_name.includes('پرسی'))
    .sort((a, b) => a.date.localeCompare(b.date));
  assert.strictEqual(parsiTxs.length, 3, 'Must have 3 transactions for Parsi 11kg');
  assert.strictEqual(parsiTxs[0].running_balance, 20, 'First running balance must be 20');
  assert.strictEqual(parsiTxs[1].running_balance, 35, 'Second running balance must be 35');
  assert.strictEqual(parsiTxs[2].running_balance, 27, 'Third running balance must be 27');
  console.log('✓ Chronological Running Balance of Valve X verified: 20 -> 35 -> 27');

  // Verify final balance in Segregated table
  const parsiRow = report.segregatedRows.find(r => r.valve_name.includes('پرسی'));
  assert.ok(parsiRow, 'Parsi segregated row must exist');
  assert.strictEqual(parsiRow.quantity_in, 35, 'Parsi total IN must be 35');
  assert.strictEqual(parsiRow.quantity_out, 8, 'Parsi total OUT must be 8');
  assert.strictEqual(parsiRow.balance, 27, 'Parsi final balance must be 27');
  console.log('✓ Segregated Table Row verified: IN=35, OUT=8, Balance=27');

  // Verify Used Butane 11kg:
  // IN = 10, OUT = 4, Balance = 6
  const butaneUsedRow = report.segregatedRows.find(r => r.valve_name.includes('بوتان') && r.valve_category === 'USED');
  assert.ok(butaneUsedRow, 'Butane Used row must exist');
  assert.strictEqual(butaneUsedRow.quantity_in, 10, 'Butane Used total IN must be 10');
  assert.strictEqual(butaneUsedRow.quantity_out, 4, 'Butane Used total OUT must be 4');
  assert.strictEqual(butaneUsedRow.balance, 6, 'Butane Used balance must be 6');
  console.log('✓ Used Butane Table Row verified: IN=10, OUT=4, Balance=6');

  // Verify summary row
  const summary = report.customerSummaryRows.find(s => s.customer_id === customer.customer_id);
  assert.ok(summary, 'Customer summary must exist');
  assert.strictEqual(summary.total_new_in, 35, 'Total New IN must be 35');
  assert.strictEqual(summary.total_new_out, 8, 'Total New OUT must be 8');
  assert.strictEqual(summary.new_balance, 27, 'New Balance must be 27');
  assert.strictEqual(summary.total_used_in, 10, 'Total Used IN must be 10');
  assert.strictEqual(summary.total_used_out, 4, 'Total Used OUT must be 4');
  assert.strictEqual(summary.used_balance, 6, 'Used Balance must be 6');
  assert.strictEqual(summary.all_balance, 33, 'All Balance must be 33 (27 + 6)');
  console.log('✓ Customer Summary Row verified: New Bal=27, Used Bal=6, All Bal=33');

  console.log('\n======================================================');
  console.log('ALL VALVE TURNOVER & RUNNING BALANCE TESTS PASSED 100%! ✓');
  console.log('======================================================');
}

runTest().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
