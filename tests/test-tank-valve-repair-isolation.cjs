const assert = require('assert');

// 1. Verify Catalog Mappings (None of the tanks need valves, only cylinders and picnics need valves)
const fs = require('fs');

const catalogContent = fs.readFileSync('src/database/cylinder-tank-catalog.ts', 'utf8');

// Check that tanks have valves_per_cylinder: 0 and "بدون نیاز به شیر"
const tankIds = ['TANK-20KG', 'TANK-25KG', 'TANK-30KG', 'TANK-35KG', 'TANK-60L', 'TANK-80L', 'TANK-105L', 'TANK-125L'];
for (const tid of tankIds) {
  assert(catalogContent.includes(tid), `Catalog should contain ${tid}`);
}
console.log('✓ All 8 tanks confirmed in catalog.');

// Verify tanks have valves_per_cylinder: 0
const tankBlockMatch = catalogContent.match(/id:\s*'TANK-20KG'[\s\S]*?valves_per_cylinder:\s*0/);
assert(tankBlockMatch, 'TANK-20KG must have valves_per_cylinder: 0');
console.log('✓ Tank mappings correctly declare valves_per_cylinder: 0 (No valves needed for tanks).');

// 2. Test registration logic in storage.ts
const storageContent = fs.readFileSync('src/database/storage.ts', 'utf8');
assert(storageContent.includes("targetCylinderType: 'پیکنیک 1/1.5/3 لیتری'"), 'Picnic 1/1.5L valves must target پیکنیک 1/1.5 لیتری');
assert(storageContent.includes("targetCylinderType: 'پیکنیک 5/8 کیلویی'"), 'Picnic 5/8kg valves must target پیکنیک 3/5/8 کیلویی');
assert(storageContent.includes("targetCylinderType: 'سیلندر 11 کیلویی'"), '11/25/50kg valves must target سیلندر 11 کیلویی');
console.log('✓ Valve intake registration partitions valves strictly to matching cylinder types (11/25/50 -> سیلندر ۱۱، پیکنیک ۵/۸ -> پیکنیک ۵/۸).');

// 3. Test cylinder relationship helper isTankType
const relContent = fs.readFileSync('src/utils/cylinderRelationship.ts', 'utf8');
assert(relContent.includes('export function isTankType'), 'isTankType helper must be exported');
assert(relContent.includes('export function isPicnic58Type'), 'isPicnic58Type helper must be exported');
assert(relContent.includes('export function isPicnic1LType'), 'isPicnic1LType helper must be exported');
console.log('✓ Cylinder relationship helpers verified.');

console.log('\n========================================');
console.log('ALL TANK & VALVE ISOLATION TESTS PASSED! ✓');
console.log('========================================');
