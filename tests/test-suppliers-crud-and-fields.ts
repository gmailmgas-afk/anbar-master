import assert from 'node:assert/strict';
import { LocalStorageManager } from '../src/database/storage';
import { Supplier } from '../src/types';

// Mock localStorage for Node execution
const memStore: Record<string, string> = {};
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => memStore[k] ?? null,
    setItem: (k: string, v: string) => { memStore[k] = v; },
    removeItem: (k: string) => { delete memStore[k]; },
    key: (i: number) => Object.keys(memStore)[i] ?? null,
    get length() { return Object.keys(memStore).length; }
  },
  dispatchEvent: () => true
};

const env = 'OFFICE_WIN11' as const;
const userId = 'USR-001';

// 1. Initial suppliers loaded
const initialState = LocalStorageManager.getState(env);
assert.ok(initialState.suppliers.length >= 1, 'Initial suppliers should exist');

// 2. Create supplier with all Customer fields
const supId = 'SUP-TEST-001';
const createdSupplier: Supplier = {
  supplier_id: supId,
  name: 'مهندس کریمی',
  company_name: 'صنایع گازرسانی البرز',
  manager_name: 'دکتر کریمی',
  contact_person: 'دکتر کریمی',
  phone: '0912-1112233',
  phone_secondary: '021-44550011',
  employer_phone: '0912-9998877',
  national_id: '10860018980',
  economic_code: '411122334455',
  registration_number: '5918',
  postal_code: '7961943187',
  fax: '021-44550012',
  province: 'تهران',
  city: 'کرج',
  address: 'شهرک صنعتی بهارستان پلاک ۱۲',
  credit_limit: 900000000,
  current_balance: -25000000,
  supplier_type: 'سازمانی',
  notes: 'قرارداد تامین سالانه شیرآلات',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

LocalStorageManager.recordLocalChange(
  env,
  userId,
  'SUPPLIER',
  'CREATE',
  supId,
  createdSupplier,
  'CREATE_SUPPLIER',
  { name: createdSupplier.name }
);

const afterCreate = LocalStorageManager.getState(env).suppliers.find(s => s.supplier_id === supId);
assert.ok(afterCreate, 'Created supplier should exist in state');
assert.equal(afterCreate.national_id, '10860018980');
assert.equal(afterCreate.registration_number, '5918');
assert.equal(afterCreate.postal_code, '7961943187');
assert.equal(afterCreate.fax, '021-44550012');
assert.equal(afterCreate.employer_phone, '0912-9998877');
assert.equal(afterCreate.phone_secondary, '021-44550011');
assert.equal(afterCreate.supplier_type, 'سازمانی');
assert.equal(afterCreate.current_balance, -25000000);

// Check cross-env propagation
const whAfterCreate = LocalStorageManager.getState('WAREHOUSE_WIN7').suppliers.find(s => s.supplier_id === supId);
assert.ok(whAfterCreate, 'Created supplier should propagate to WAREHOUSE_WIN7');

// 3. Update supplier
const updatedSupplier: Supplier = {
  ...afterCreate,
  company_name: 'گروه صنعتی گاز البرز (ویرایش‌شده)',
  national_id: '10100288820',
  postal_code: '1553616915',
  current_balance: 50000000,
  supplier_type: 'پیمانکاری',
  notes: 'بروزرسانی قرارداد'
};

LocalStorageManager.recordLocalChange(
  env,
  userId,
  'SUPPLIER',
  'UPDATE',
  supId,
  updatedSupplier,
  'UPDATE_SUPPLIER',
  { name: updatedSupplier.name }
);

const afterUpdate = LocalStorageManager.getState(env).suppliers.find(s => s.supplier_id === supId);
assert.ok(afterUpdate);
assert.equal(afterUpdate.company_name, 'گروه صنعتی گاز البرز (ویرایش‌شده)');
assert.equal(afterUpdate.national_id, '10100288820');
assert.equal(afterUpdate.current_balance, 50000000);
assert.equal(afterUpdate.supplier_type, 'پیمانکاری');

// 4. Delete supplier & verify permanent deletion across getState + ensureSuppliersLoaded
LocalStorageManager.recordLocalChange(
  env,
  userId,
  'SUPPLIER',
  'DELETE',
  supId,
  { supplier_id: supId, name: updatedSupplier.name },
  'DELETE_SUPPLIER',
  { name: updatedSupplier.name }
);

assert.equal(
  LocalStorageManager.getState(env).suppliers.some(s => s.supplier_id === supId),
  false,
  'Deleted supplier should be removed from OFFICE_WIN11'
);
assert.equal(
  LocalStorageManager.getState('WAREHOUSE_WIN7').suppliers.some(s => s.supplier_id === supId),
  false,
  'Deleted supplier should be removed from WAREHOUSE_WIN7'
);

// 5. Verify deleting SUP-MGAS-BRANCH stays deleted even after ensureSuppliersLoaded
LocalStorageManager.recordLocalChange(
  env,
  userId,
  'SUPPLIER',
  'DELETE',
  'SUP-MGAS-BRANCH',
  { supplier_id: 'SUP-MGAS-BRANCH', name: 'شعبه ام گاز' },
  'DELETE_SUPPLIER',
  { name: 'شعبه ام گاز' }
);
LocalStorageManager.ensureSuppliersLoaded(LocalStorageManager.getState(env));
assert.equal(
  LocalStorageManager.getState(env).suppliers.some(s => s.supplier_id === 'SUP-MGAS-BRANCH'),
  false,
  'Deleted SUP-MGAS-BRANCH must not resurrect on ensureSuppliersLoaded'
);

console.log('✅ All Supplier CRUD, customer-field parity, and permanent delete tests passed!');
