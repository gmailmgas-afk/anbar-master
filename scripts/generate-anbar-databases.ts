/**
 * Canonical SQLite Database Builder for M-GAS Multi-Station Deployment
 * Builds db-anbar1.db, db-anbar2.db, db-anbar3.db with full schema and seed catalog.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

import {
  SEED_USERS,
  SEED_DEVICES,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_WAREHOUSES,
  SEED_CUSTOMERS,
  SEED_SUPPLIERS
} from '../src/database/seed-data.js';

import { SEED_GAS_KARDEX_ENTRIES } from '../src/database/gas-kardex-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateAllDatabases() {
  console.log('🚀 [Anbar DB Generator] Initializing sql.js WASM engine...');
  const SQL = await initSqlJs();

  const schemaPath = path.join(__dirname, '../src/database/canonical-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const outputDirs = [
    path.join(__dirname, '../release-dist'),
    path.join(__dirname, '../public'),
    path.join(__dirname, '../public/downloads'),
    path.join(__dirname, '../')
  ];

  for (const dir of outputDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Load server_users.json if modified by Mousa Amouei
  let currentUsers = [...SEED_USERS];
  const serverUsersPath = path.join(__dirname, '../data/server_users.json');
  try {
    if (fs.existsSync(serverUsersPath)) {
      const customUsers = JSON.parse(fs.readFileSync(serverUsersPath, 'utf8'));
      if (Array.isArray(customUsers) && customUsers.length > 0) {
        currentUsers = customUsers;
        console.log(`[Anbar DB Generator] Loaded ${customUsers.length} active users from server_users.json.`);
      }
    }
  } catch (e) {
    console.warn('[Anbar DB Generator] Using seed users fallback:', e);
  }

  const anbarConfigs = [
    {
      id: 'db-anbar1',
      name: 'انبار مرکزی شماره ۱ (سوله اصلی)',
      warehouse_id: 'WH-VALVES',
      device_id: 'WAREHOUSE-PC-001'
    },
    {
      id: 'db-anbar2',
      name: 'انبار توزیع و پخش مویرگی (دفتر مرکزی)',
      warehouse_id: 'WH-SUPPLIES',
      device_id: 'OFFICE-PC-001'
    },
    {
      id: 'db-anbar3',
      name: 'انبار قطعات و تجهیزات فنی (سامانه ابری)',
      warehouse_id: 'WH-RAW-MATERIALS',
      device_id: 'WEB-001'
    }
  ];

  const now = new Date().toISOString();

  for (const anbar of anbarConfigs) {
    console.log(`\n📦 Generating ${anbar.id} (${anbar.name})...`);
    const db = new SQL.Database();

    // 1. Execute Canonical SQL Schema
    db.run(schemaSql);

    // 2. Insert Anbar Metadata
    db.run(`
      CREATE TABLE IF NOT EXISTS anbar_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const insertMetaStmt = db.prepare(`INSERT OR REPLACE INTO anbar_meta (key, value) VALUES (?, ?);`);
    const metaEntries = [
      ['db_name', anbar.id],
      ['title', anbar.name],
      ['warehouse_id', anbar.warehouse_id],
      ['device_id', anbar.device_id],
      ['cloud_server', 'https://anbar.mgas.ir'],
      ['created_at', now],
      ['version', '2.0.0']
    ];
    for (const [k, v] of metaEntries) {
      insertMetaStmt.run([k, v]);
    }
    insertMetaStmt.free();

    // 3. Populate Users
    const insertUserStmt = db.prepare(`
      INSERT OR REPLACE INTO users (
        user_id, username, password_hash, password_salt, is_password_changed,
        full_name, role, role_title, allowed_device_id, system_id, system_name,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const u of currentUsers) {
      insertUserStmt.run([
        u.user_id,
        (u.username || '').toLowerCase().trim(),
        u.password_hash || '',
        u.password_salt || '',
        u.is_password_changed !== false ? 1 : 0,
        u.full_name || '',
        u.role || 'INTERNAL_MANAGER',
        u.role_title || '',
        u.allowed_device_id || u.system_id || anbar.device_id,
        u.system_id || anbar.device_id,
        u.system_name || '',
        u.is_active !== false ? 1 : 0,
        u.created_at || now,
        u.updated_at || now
      ]);
    }
    insertUserStmt.free();

    // 4. Populate Devices
    const insertDeviceStmt = db.prepare(`
      INSERT OR REPLACE INTO devices (device_id, name, os, location, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    for (const d of SEED_DEVICES) {
      insertDeviceStmt.run([
        d.device_id,
        d.name,
        d.os,
        d.location,
        d.last_seen_at || now,
        now
      ]);
    }
    insertDeviceStmt.free();

    // 5. Populate Categories
    const insertCatStmt = db.prepare(`
      INSERT OR REPLACE INTO categories (category_id, name, code, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    for (const c of SEED_CATEGORIES) {
      insertCatStmt.run([
        c.category_id,
        c.name,
        c.code,
        c.description || '',
        c.created_at || now,
        c.updated_at || now
      ]);
    }
    insertCatStmt.free();

    // 6. Populate Products
    const insertPrdStmt = db.prepare(`
      INSERT OR REPLACE INTO products (
        product_id, sku, name, category_id, unit, min_stock, purchase_price, sale_price, barcode, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const p of SEED_PRODUCTS) {
      insertPrdStmt.run([
        p.product_id,
        p.sku,
        p.name,
        p.category_id,
        p.unit || 'عدد',
        p.min_stock || 10,
        p.purchase_price || 0,
        p.sale_price || 0,
        p.barcode || '',
        p.description || '',
        p.created_at || now,
        p.updated_at || now
      ]);
    }
    insertPrdStmt.free();

    // 7. Populate Warehouses
    const insertWhStmt = db.prepare(`
      INSERT OR REPLACE INTO warehouses (warehouse_id, name, code, address, shelf_location, is_active)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    for (const w of SEED_WAREHOUSES) {
      insertWhStmt.run([
        w.warehouse_id,
        w.name,
        w.code,
        w.address,
        w.shelf_location || 'A1',
        w.is_active ? 1 : 0
      ]);
    }
    insertWhStmt.free();

    // 8. Populate Customers (including all 48 Excel customers)
    const insertCustStmt = db.prepare(`
      INSERT OR REPLACE INTO customers (
        customer_id, name, company_name, phone, national_id, economic_code, province, city, address, credit_limit, current_balance, customer_type, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const cust of SEED_CUSTOMERS) {
      insertCustStmt.run([
        cust.customer_id,
        cust.name,
        cust.company_name || cust.name,
        cust.phone || '',
        cust.national_id || '',
        cust.economic_code || '',
        cust.province || 'تهران',
        cust.city || 'تهران',
        cust.address || '',
        cust.credit_limit || 0,
        cust.current_balance || 0,
        cust.customer_type || 'عمده',
        cust.notes || '',
        cust.created_at || now,
        cust.updated_at || now
      ]);
    }
    insertCustStmt.free();

    // 9. Populate Suppliers
    const insertSuppStmt = db.prepare(`
      INSERT OR REPLACE INTO suppliers (
        supplier_id, name, company_name, phone, address, credit_limit, current_balance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const s of SEED_SUPPLIERS) {
      insertSuppStmt.run([
        s.supplier_id,
        s.name,
        s.company_name || s.name,
        s.phone || '',
        s.address || '',
        s.credit_limit || 0,
        s.current_balance || 0,
        s.created_at || now,
        s.updated_at || now
      ]);
    }
    insertSuppStmt.free();

    // 10. Populate Gas Kardex Entries
    const insertKardexStmt = db.prepare(`
      INSERT OR REPLACE INTO gas_kardex (
        entry_id, customer_id, customer_name, date, description, transfer_sheet_number,
        cylinder_in, cylinder_out, scrap_out, cylinder_balance, scrap_balance,
        new_valve_in, new_valve_out, new_valve_balance, dispatched,
        used_valve_in, used_valve_out, used_valve_balance, defective,
        user_id, device_id, event_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const k of SEED_GAS_KARDEX_ENTRIES) {
      insertKardexStmt.run([
        k.entry_id,
        k.customer_id,
        k.customer_name,
        k.date,
        k.description || '',
        k.transfer_sheet_number || '',
        k.cylinder_in || 0,
        k.cylinder_out || 0,
        k.scrap_out || 0,
        k.cylinder_balance || 0,
        k.scrap_balance || 0,
        k.new_valve_in || 0,
        k.new_valve_out || 0,
        k.new_valve_balance || 0,
        k.dispatched || '',
        k.used_valve_in || 0,
        k.used_valve_out || 0,
        k.used_valve_balance || 0,
        k.defective || 0,
        k.user_id || 'USR-001',
        k.device_id || anbar.device_id,
        k.event_id || `EVT-INIT-${k.entry_id}`,
        k.notes || '',
        k.created_at || now,
        k.updated_at || now
      ]);
    }
    insertKardexStmt.free();

    // 11. Populate Settings & Sync State
    db.run(`
      INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES 
        ('strictDomainLock', 'true', '${now}'),
        ('allowedDomain', 'anbar.mgas.ir', '${now}'),
        ('app_title', 'سامانه هوشمند انبارداری صنعتی ام گاز (M-Gas)', '${now}'),
        ('company_name', 'صنعتی و بازرگانی ام گاز', '${now}');

      INSERT OR REPLACE INTO sync_state (device_id, last_server_sequence, last_synced_at, status)
      VALUES ('${anbar.device_id}', 1000, '${now}', 'ONLINE');
    `);

    // Export database binary
    const binaryData = Buffer.from(db.export());

    for (const dir of outputDirs) {
      const withExt = path.join(dir, `${anbar.id}.db`);
      const withoutExt = path.join(dir, anbar.id);
      fs.writeFileSync(withExt, binaryData);
      fs.writeFileSync(withoutExt, binaryData);
      console.log(`  ✓ Wrote ${withExt} (${(binaryData.length / 1024).toFixed(1)} KB)`);
    }

    db.close();
  }

  console.log('\n✅ [Anbar DB Generator] All canonical SQLite databases rebuilt successfully with all tables and seed records!');
}

generateAllDatabases().catch(err => {
  console.error('[Anbar DB Generator] Error:', err);
  process.exit(1);
});
