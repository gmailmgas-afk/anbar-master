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

const { LocalStorageManager } = require('../src/database/storage.ts');

function runTest() {
  console.log('=== TEST: Supplier vs Customer Valve Intake Segregation ===\n');

  const env = 'anbar1';
  const state = LocalStorageManager.getState(env);
  const customers = state.customers || [];
  const suppliers = state.suppliers || [];

  assert(customers.length > 0, 'Customers must exist in state');
  assert(suppliers.length > 0, 'Suppliers must exist in state');

  const testCustomer = customers[0];
  const testSupplier = suppliers[0];

  console.log(`Test Customer: ${testCustomer.name} (${testCustomer.customer_id})`);
  console.log(`Test Supplier: ${testSupplier.name} (${testSupplier.supplier_id})\n`);

  const initialKardexCount = (state.gas_kardex_entries || []).filter(e => e.customer_id === testCustomer.customer_id && !e.is_deleted).length;
  const initialProfiles = LocalStorageManager.getCustomerValveProfiles(env);
  const initialCustProfile = initialProfiles.find(p => p.customer_id === testCustomer.customer_id);
  const initialCustNewValveBal = initialCustProfile?.new_valves_balance || 0;

  console.log(`Initial Customer Kardex entries: ${initialKardexCount}`);
  console.log(`Initial Customer Valve Balance in Profile: ${initialCustNewValveBal}`);

  // 1. SUPPLIER INTAKE: Supplier brings 50 Parsi 11kg New valves
  console.log('\n--- STEP 1: Recording Supplier Valve Intake (50 Parsi New) ---');
  const supplierResult = LocalStorageManager.recordValveInspection(
    env,
    {
      sourceType: 'SUPPLIER',
      supplierId: testSupplier.supplier_id,
      supplierName: `${testSupplier.name} (${testSupplier.company_name})`,
      date: '1405/06/25',
      sheetNumber: 'SUP-VALVE-001',
      valves11kgNew: { parsi: 50, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
      valves11kgUsed: { parsi: 0, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
      valvesForklift22kgNew: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
      valvesForklift22kgUsed: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
      valvesPicnicNew: { parsi: 0, butane: 0 },
      valvesPicnicUsed: { parsi: 0, butane: 0 },
      valvesPicnic58kgNew: { parsi: 0, butane: 0 },
      valvesPicnic58kgUsed: { parsi: 0, butane: 0 },
      notes: 'ورودی شیر نو از تامین‌کننده برای شرکت ام‌گاز'
    },
    'USR-003'
  );

  assert.strictEqual(supplierResult.totalNewValves, 50, 'Supplier total new valves must be 50');
  assert.strictEqual(supplierResult.inspection.source_type, 'SUPPLIER', 'Inspection source_type must be SUPPLIER');
  assert.strictEqual(supplierResult.inspection.status, 'KARDEX_REGISTERED', 'Supplier inspection status must be KARDEX_REGISTERED');
  assert.strictEqual(supplierResult.inspection.supplier_id, testSupplier.supplier_id, 'Inspection supplier_id must match');
  assert.strictEqual(supplierResult.inspection.customer_id, '', 'Supplier inspection customer_id must be empty');

  // Verify state after supplier intake
  const stateAfterSupplier = LocalStorageManager.getState(env);
  const supplierMovements = stateAfterSupplier.stock_movements.filter(m => m.reference_id === 'SUP-VALVE-001');
  assert(supplierMovements.length > 0, 'Movement must be recorded for supplier intake');
  const supMov = supplierMovements[0];
  assert.strictEqual(supMov.party_type, 'SUPPLIER', 'Movement party_type must be SUPPLIER');
  assert.strictEqual(supMov.valve_ownership, 'MGAS', 'Movement valve_ownership must be MGAS');
  assert.strictEqual(supMov.supplier_id, testSupplier.supplier_id, 'Movement supplier_id must match');
  assert.strictEqual(supMov.customer_name, 'شرکت ام‌گاز', 'Movement customer_name must be شرکت ام‌گاز');

  // CRITICAL CHECK: Gas Kardex entries count for customer must NOT change!
  const kardexCountAfterSupplier = (stateAfterSupplier.gas_kardex_entries || []).filter(e => e.customer_id === testCustomer.customer_id && !e.is_deleted).length;
  assert.strictEqual(kardexCountAfterSupplier, initialKardexCount, 'Customer Kardex count must NOT increase when supplier brings valves!');

  // CRITICAL CHECK: Customer Valve Profile balance must NOT increase!
  const profilesAfterSupplier = LocalStorageManager.getCustomerValveProfiles(env);
  const custProfileAfterSupplier = profilesAfterSupplier.find(p => p.customer_id === testCustomer.customer_id);
  assert.strictEqual(custProfileAfterSupplier?.new_valves_balance || 0, initialCustNewValveBal, 'Customer Profile new valve balance must NOT change after supplier intake!');
  console.log('✓ SUCCESS: Supplier valves were correctly added to M-Gas inventory and NOT to customer repair kardex!');

  // 2. CUSTOMER INTAKE: Customer brings 15 Parsi 11kg New valves
  console.log('\n--- STEP 2: Recording Customer Valve Intake (15 Parsi New) ---');
  const customerResult = LocalStorageManager.recordValveInspection(
    env,
    {
      sourceType: 'CUSTOMER',
      customerId: testCustomer.customer_id,
      customerName: `${testCustomer.name} (${testCustomer.company_name})`,
      date: '1405/06/26',
      sheetNumber: 'CUST-VALVE-001',
      valves11kgNew: { parsi: 15, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
      valves11kgUsed: { parsi: 0, butane: 0, iranGazi: 0, forklift: 0, iraqi: 0 },
      valvesForklift22kgNew: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
      valvesForklift22kgUsed: { butane: 0, iranGazi: 0, passari: 0, parsi: 0 },
      valvesPicnicNew: { parsi: 0, butane: 0 },
      valvesPicnicUsed: { parsi: 0, butane: 0 },
      valvesPicnic58kgNew: { parsi: 0, butane: 0 },
      valvesPicnic58kgUsed: { parsi: 0, butane: 0 },
      notes: 'ورودی شیر نو از مشتری برای تعمیرات'
    },
    'USR-003'
  );

  assert.strictEqual(customerResult.totalNewValves, 15, 'Customer total new valves must be 15');
  assert.strictEqual(customerResult.inspection.source_type, 'CUSTOMER', 'Inspection source_type must be CUSTOMER');
  assert.strictEqual(customerResult.inspection.customer_id, testCustomer.customer_id, 'Inspection customer_id must match');

  // Verify state after customer intake
  const stateAfterCustomer = LocalStorageManager.getState(env);
  const customerMovements = stateAfterCustomer.stock_movements.filter(m => m.reference_id === 'CUST-VALVE-001');
  assert(customerMovements.length > 0, 'Movement must be recorded for customer intake');
  const custMov = customerMovements[0];
  assert.strictEqual(custMov.party_type, 'CUSTOMER', 'Movement party_type must be CUSTOMER');
  assert.strictEqual(custMov.valve_ownership, 'CUSTOMER', 'Movement valve_ownership must be CUSTOMER');
  assert.strictEqual(custMov.customer_id, testCustomer.customer_id, 'Movement customer_id must match');

  // Verify that customer Kardex entry WAS created
  const kardexCountAfterCustomer = (stateAfterCustomer.gas_kardex_entries || []).filter(e => e.customer_id === testCustomer.customer_id && !e.is_deleted).length;
  assert(kardexCountAfterCustomer > initialKardexCount, 'Customer Kardex count must increase for customer valve intake');

  // Verify Customer Profile balance updated
  const profilesAfterCustomer = LocalStorageManager.getCustomerValveProfiles(env);
  const custProfileAfterCustomer = profilesAfterCustomer.find(p => p.customer_id === testCustomer.customer_id);
  assert.strictEqual(custProfileAfterCustomer?.new_valves_balance, initialCustNewValveBal + 15, 'Customer profile balance must increase by 15');
  console.log('✓ SUCCESS: Customer valves were correctly registered in customer Repair Kardex and Profile!');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

runTest();
