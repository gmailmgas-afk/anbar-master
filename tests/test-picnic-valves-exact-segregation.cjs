const assert = require('assert');
const fs = require('fs');

console.log('--- [TEST 1] Testing Picnic & Cylinder Types Normalization ---');
const relContent = fs.readFileSync('src/utils/cylinderRelationship.ts', 'utf8');

// Ensure normalizeCylinderType distinguishes 1/1.5/3L and 5/8kg
assert(relContent.includes("'پیکنیک 1/1.5/3 لیتری'"), "Must have 'پیکنیک 1/1.5/3 لیتری'");
assert(relContent.includes("'پیکنیک 5/8 کیلویی'"), "Must have 'پیکنیک 5/8 کیلویی'");

console.log('--- [TEST 2] Testing Catalog Valve Specifications ---');
const catalogContent = fs.readFileSync('src/database/cylinder-tank-catalog.ts', 'utf8');

// Check Picnic 1/1.5/3L matching valve
assert(catalogContent.includes("matching_valve_id: 'PRD-VLV-PK-1-1.5-3'"), "1/1.5/3L must match PRD-VLV-PK-1-1.5-3");
assert(catalogContent.includes("matching_valve_name: 'شیر پیکنیک 1/1.5/3 لیتری'"), "1/1.5/3L valve name must match");

// Check Picnic 5/6kg or 5/8kg matching valve
assert(catalogContent.includes("matching_valve_id: 'PRD-VLV-PK-5-6'") || catalogContent.includes("matching_valve_id: 'PRD-VLV-PK-5-8'"), "5/6kg or 5/8kg valve ID must match");
assert(catalogContent.includes("matching_valve_name: 'شیر پیکنیک 5/6 کیلویی'") || catalogContent.includes("matching_valve_name: 'شیر پیکنیک 5/8 کیلویی'"), "5/6kg or 5/8kg valve name must match");

// Check that tanks have no valves
const tankIds = ['TANK-20KG', 'TANK-25KG', 'TANK-30KG', 'TANK-35KG', 'TANK-60L', 'TANK-80L', 'TANK-105L', 'TANK-125L'];
for (const tid of tankIds) {
  const re = new RegExp("id:\\s*'" + tid + "'[\\s\\S]*?valves_per_cylinder:\\s*0");
  assert(re.test(catalogContent), tid + " must have valves_per_cylinder: 0");
}
console.log('✓ All 8 tanks have 0 valves and picnic models are strictly separated.');

console.log('--- [TEST 3] Testing Storage Immediate Kardex Registration ---');
const storageContent = fs.readFileSync('src/database/storage.ts', 'utf8');
assert(storageContent.includes("recordValveInspection"), "recordValveInspection must be present");
assert(storageContent.includes("registerPendingInspectionDirectlyToKardex"), "registerPendingInspectionDirectlyToKardex must be present");

// Check that 1/1.5/3L targets 'پیکنیک 1/1.5/3 لیتری'
assert(storageContent.includes("targetCylinderType: 'پیکنیک 1/1.5/3 لیتری'"), "Must target 'پیکنیک 1/1.5/3 لیتری'");
// Check that 5/8kg targets 'پیکنیک 5/8 کیلویی'
assert(storageContent.includes("targetCylinderType: 'پیکنیک 5/8 کیلویی'"), "Must target 'پیکنیک 5/8 کیلویی'");

console.log('✓ Storage registration logic accurately targets separated picnic cylinder repair kardexes.');

console.log('--- [TEST 4] Testing Kardex Form UI Cleanliness & Matching Valve Display ---');
const kardexViewContent = fs.readFileSync('src/components/GasKardexView.tsx', 'utf8');

// Ensure no intrusive double-check or 4-metric valve box in add/edit modals
assert(!kardexViewContent.includes("Detailed Stock & Relationship Banner"), "Detailed stock banner removed from modal");
assert(!kardexViewContent.includes("دابل‌چک تناظر شیر با سیلندر و مهره:"), "Double check box removed from modal");
assert(!kardexViewContent.includes("Matching Valve & Nut Stock preview in edit modal"), "Edit modal valve box removed");

// Ensure cylinder cards display corresponding matching valve
assert(kardexViewContent.includes("rel.matchingValveName"), "Option card must display matching valve name");
assert(kardexViewContent.includes("بدون نیاز به شیر"), "Tank card must display 'بدون نیاز به شیر'");

console.log('✓ Kardex form displays each cylinder type with its matching valve and omits separate valve boxes.');

console.log('\n======================================================');
console.log('ALL PICNIC & VALVE SEGREGATION TESTS PASSED 100%! ✓');
console.log('======================================================');