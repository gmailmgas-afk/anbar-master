/**
 * Automated Verification Script:
 * Tests that segregated valve intake recorded for a customer strictly matches
 * in both Gas Kardex View (per cylinder type) and Reports View (Segregated, Summary, Ledger).
 */

const fs = require('fs');
const path = require('path');

// Mock localStorage for Node.js
if (typeof localStorage === 'undefined' || localStorage === null) {
  const LocalStorage = class {
    constructor() {
      this.store = {};
    }
    getItem(key) {
      return this.store[key] || null;
    }
    setItem(key, value) {
      this.store[key] = String(value);
    }
    removeItem(key) {
      delete this.store[key];
    }
    clear() {
      this.store = {};
    }
  };
  global.localStorage = new LocalStorage();
}

// Mock window and CustomEvent
if (typeof window === 'undefined') {
  global.window = {
    localStorage: global.localStorage,
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.CustomEvent = class {
    constructor(event, params) {
      this.event = event;
      this.params = params;
    }
  };
}

async function runTest() {
  console.log('--- STARTING VALVE INTAKE KARDEX & REPORTS SEGREGATION TEST ---');

  // Dynamically load tsx to run typescript storage manager directly
  const { LocalStorageManager } = require('../src/database/storage.ts');
  const env = 'anbar1';

  // 1. Get state
  const state = LocalStorageManager.getState(env);

  // Pick a test customer
  const customer = state.customers[0];
  console.log(`Testing with customer: ${customer.name} (ID: ${customer.customer_id})`);

  // Clear existing kardex entries for clean mathematical isolation
  state.gas_kardex_entries = state.gas_kardex_entries.filter(e => e.customer_id !== customer.customer_id);
  state.cylinder_valve_inspections = (state.cylinder_valve_inspections || []).filter(i => i.customer_id !== customer.customer_id);
  LocalStorageManager.saveState(env, state);

  // 2. Prepare exact input values
  const inputValues = {
    valves11kgNew: { parsi: 15, butane: 10, iranGazi: 7, forklift: 0, iraqi: 0 }, // total 32
    valves11kgUsed: { parsi: 4, butane: 6, iranGazi: 0, forklift: 0, iraqi: 2 },  // total 12
    valvesForklift22kgNew: { butane: 8, iranGazi: 5, passari: 0, parsi: 0 },      // total 13
    valvesForklift22kgUsed: { butane: 0, iranGazi: 0, passari: 3, parsi: 0 },     // total 3
    valvesPicnicNew: { parsi: 12, butane: 0 },                                    // total 12
    valvesPicnicUsed: { parsi: 0, butane: 9 },                                    // total 9
    valvesPicnic58kgNew: { parsi: 0, butane: 14 },                                // total 14
    valvesPicnic58kgUsed: { parsi: 11, butane: 0 }                                // total 11
  };

  const expectedTotalNew = 32 + 13 + 12 + 14; // 71
  const expectedTotalUsed = 12 + 3 + 9 + 11;  // 35
  const expectedTotalAll = expectedTotalNew + expectedTotalUsed; // 106

  console.log(`Expected Intake Totals -> New: ${expectedTotalNew}, Used: ${expectedTotalUsed}, Total: ${expectedTotalAll}`);

  // Create physical inspection record
  const inspectionId = `INSP-TEST-${Date.now()}`;
  const inspectionRecord = {
    inspection_id: inspectionId,
    form_number: '1405-TEST-001',
    receipt_type: 'ENTRY',
    date: '1405/08/10',
    customer_id: customer.customer_id,
    customer_name: customer.name,
    item_type: 'VALVE_NEW',
    item_name: 'شیرآلات تفکیک‌شده کپسول گاز',
    declared_quantity: expectedTotalAll,
    actual_healthy_quantity: expectedTotalAll,
    defective_quantity: 0,
    discrepancy_quantity: 0,
    driver_name: 'علی اکبری',
    plate_number: '12-345-ایران 77',
    waybill_number: 'WB-998877',
    inspector_user_id: 'USR-003',
    inspector_name: 'مهندس حاجی وند',
    status: 'COUNTED_READY_FOR_KARDEX',
    source_type: 'CUSTOMER',
    valve_breakdown: inputValues,
    total_new_valves: expectedTotalNew,
    total_used_valves: expectedTotalUsed,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const currentState = LocalStorageManager.getState(env);
  if (!currentState.cylinder_valve_inspections) currentState.cylinder_valve_inspections = [];
  currentState.cylinder_valve_inspections.push(inspectionRecord);
  LocalStorageManager.saveState(env, currentState);

  // 3. Register inspection directly into Kardex
  const karamiUser = { user_id: 'USR-002', username: 'karami', full_name: 'خانم کرمی' };
  const regResult = LocalStorageManager.registerPendingInspectionDirectlyToKardex(
    env,
    inspectionId,
    karamiUser,
    'سیلندر 11 کیلویی'
  );

  if (!regResult.success) {
    throw new Error(`Failed to register inspection in Kardex: ${regResult.error}`);
  }
  console.log('✓ Successfully registered inspection in Gas Kardex via registerPendingInspectionDirectlyToKardex');

  // 4. Verify Gas Kardex entries
  const updatedState = LocalStorageManager.getState(env);
  const custEntries = updatedState.gas_kardex_entries.filter(e => e.customer_id === customer.customer_id);

  console.log(`Customer now has ${custEntries.length} Kardex entries.`);
  if (custEntries.length !== 4) {
    throw new Error(`Expected exactly 4 partitioned Kardex entries (one per cylinder type), got ${custEntries.length}`);
  }

  // Verify Entry 1: 11kg
  const entry11 = custEntries.find(e => e.cylinder_type === 'سیلندر 11 کیلویی');
  if (!entry11) throw new Error('Missing 11kg cylinder entry');
  console.log('Entry 11kg:', { new_in: entry11.new_valve_in, used_in: entry11.used_valve_in, items: entry11.valve_items?.length });
  if (entry11.new_valve_in !== 32 || entry11.used_valve_in !== 12) {
    throw new Error(`11kg entry numbers mismatch: expected 32 / 12, got ${entry11.new_valve_in} / ${entry11.used_valve_in}`);
  }
  // Check that 11kg items only contain 11kg valves
  const non11In11 = (entry11.valve_items || []).filter(v => v.valve_name.includes('لیفتراک') || v.valve_name.includes('پیکنیک'));
  if (non11In11.length > 0) {
    throw new Error(`11kg entry contains non-11kg valve items: ${JSON.stringify(non11In11)}`);
  }

  // Verify Entry 2: Forklift
  const entryFork = custEntries.find(e => e.cylinder_type === 'سیلندر لیفتراکی');
  if (!entryFork) throw new Error('Missing Forklift entry');
  console.log('Entry Forklift:', { new_in: entryFork.new_valve_in, used_in: entryFork.used_valve_in, items: entryFork.valve_items?.length });
  if (entryFork.new_valve_in !== 13 || entryFork.used_valve_in !== 3) {
    throw new Error(`Forklift entry numbers mismatch: expected 13 / 3, got ${entryFork.new_valve_in} / ${entryFork.used_valve_in}`);
  }

  // Verify Entry 3: Picnic 1L
  const entryP1 = custEntries.find(e => e.cylinder_type === 'پیکنیک 1/1.5/3 لیتری');
  if (!entryP1) throw new Error('Missing Picnic 1L entry');
  console.log('Entry Picnic 1L:', { new_in: entryP1.new_valve_in, used_in: entryP1.used_valve_in, items: entryP1.valve_items?.length });
  if (entryP1.new_valve_in !== 12 || entryP1.used_valve_in !== 9) {
    throw new Error(`Picnic 1L entry numbers mismatch: expected 12 / 9, got ${entryP1.new_valve_in} / ${entryP1.used_valve_in}`);
  }

  // Verify Entry 4: Picnic 5/6kg or 5/8kg
  const entryP58 = custEntries.find(e => e.cylinder_type === 'پیکنیک 5/8 کیلویی' || e.cylinder_type === 'پیکنیک 5/6 کیلویی');
  if (!entryP58) throw new Error('Missing Picnic 5/8kg entry');
  console.log('Entry Picnic 5/8kg:', { new_in: entryP58.new_valve_in, used_in: entryP58.used_valve_in, items: entryP58.valve_items?.length });
  if (entryP58.new_valve_in !== 14 || entryP58.used_valve_in !== 11) {
    throw new Error(`Picnic 5/8kg entry numbers mismatch: expected 14 / 11, got ${entryP58.new_valve_in} / ${entryP58.used_valve_in}`);
  }

  console.log('✓ All 4 Kardex entries verified with exact segregated quantities.');

  // 5. Test Reports View generation
  const report = LocalStorageManager.getCustomerValveDetailedReport(env, customer.customer_id);

  console.log('Report totals:', report.totals);
  if (report.totals.totalNewValveIn !== expectedTotalNew) {
    throw new Error(`Report totalNewValveIn mismatch: expected ${expectedTotalNew}, got ${report.totals.totalNewValveIn}`);
  }
  if (report.totals.totalUsedValveIn !== expectedTotalUsed) {
    throw new Error(`Report totalUsedValveIn mismatch: expected ${expectedTotalUsed}, got ${report.totals.totalUsedValveIn}`);
  }
  if (report.totals.totalValvesIn !== expectedTotalAll) {
    throw new Error(`Report totalValvesIn mismatch: expected ${expectedTotalAll}, got ${report.totals.totalValvesIn}`);
  }

  // Verify customer summary row
  const summaryRow = report.customerSummaryRows[0];
  if (!summaryRow) throw new Error('Missing customerSummaryRows');
  console.log('Summary Row:', summaryRow);
  if (summaryRow.total_new_in !== expectedTotalNew || summaryRow.total_used_in !== expectedTotalUsed || summaryRow.total_all_in !== expectedTotalAll) {
    throw new Error(`Summary row mismatch: expected ${expectedTotalNew} / ${expectedTotalUsed} / ${expectedTotalAll}, got ${summaryRow.total_new_in} / ${summaryRow.total_used_in} / ${summaryRow.total_all_in}`);
  }

  // Verify ledger transactions
  const ledgerInSum = report.ledgerTransactions
    .filter(t => t.direction === 'IN')
    .reduce((sum, t) => sum + t.quantity, 0);
  console.log(`Ledger IN Transactions Total: ${ledgerInSum}`);
  if (ledgerInSum !== expectedTotalAll) {
    throw new Error(`Ledger transactions sum mismatch: expected ${expectedTotalAll}, got ${ledgerInSum}`);
  }

  // Verify individual segregated rows
  const segParsi11New = report.segregatedRows.find(r => r.valve_name.includes('پرسی') && r.valve_name.includes('11') && r.valve_category === 'NEW');
  if (!segParsi11New || segParsi11New.quantity_in !== 15) {
    throw new Error(`Segregated row for New Parsi 11kg mismatch: expected 15, got ${segParsi11New?.quantity_in}`);
  }
  const segButane11New = report.segregatedRows.find(r => r.valve_name.includes('بوتان') && r.valve_name.includes('11') && r.valve_category === 'NEW');
  if (!segButane11New || segButane11New.quantity_in !== 10) {
    throw new Error(`Segregated row for New Butane 11kg mismatch: expected 10, got ${segButane11New?.quantity_in}`);
  }
  const segIranGazi11New = report.segregatedRows.find(r => r.valve_name.includes('ایران‌گازی') && r.valve_name.includes('11') && r.valve_category === 'NEW');
  if (!segIranGazi11New || segIranGazi11New.quantity_in !== 7) {
    throw new Error(`Segregated row for New IranGazi 11kg mismatch: expected 7, got ${segIranGazi11New?.quantity_in}`);
  }
  const segForkButaneNew = report.segregatedRows.find(r => r.valve_name.includes('بوتان لیفتراکی') && r.valve_category === 'NEW');
  if (!segForkButaneNew || segForkButaneNew.quantity_in !== 8) {
    throw new Error(`Segregated row for New Forklift Butane mismatch: expected 8, got ${segForkButaneNew?.quantity_in}`);
  }
  const segPicnic1LParsiNew = report.segregatedRows.find(r => r.valve_name.includes('1/1.5/3') && r.valve_name.includes('پرسی') && r.valve_category === 'NEW');
  if (!segPicnic1LParsiNew || segPicnic1LParsiNew.quantity_in !== 12) {
    throw new Error(`Segregated row for New Picnic 1L Parsi mismatch: expected 12, got ${segPicnic1LParsiNew?.quantity_in}`);
  }
  const segPicnic58ButaneNew = report.segregatedRows.find(r => r.valve_name.includes('5/8') && r.valve_name.includes('بوتان') && r.valve_category === 'NEW');
  if (!segPicnic58ButaneNew || segPicnic58ButaneNew.quantity_in !== 14) {
    throw new Error(`Segregated row for New Picnic 5/8kg Butane mismatch: expected 14, got ${segPicnic58ButaneNew?.quantity_in}`);
  }

  console.log('✓ All segregated rows strictly match input values without any duplication or leakage!');
  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTest().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
