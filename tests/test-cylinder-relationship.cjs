const assert = require('assert');

// 1. Verify Canonical Cylinder Types
const CYLINDER_TYPES = [
  'سیلندر 11 کیلویی',
  'سیلندر 25 کیلویی',
  'سیلندر 50 کیلویی',
  'سیلندر لیفتراکی'
];

// Replicate normalizeCylinderType logic
function normalizeCylinderType(type) {
  if (!type) return 'سیلندر 11 کیلویی';
  const clean = String(type).trim();
  if (
    clean.includes('لیفتراک') ||
    clean === 'لیفتراکی 22 کیلویی' ||
    clean === 'سیلندر 10 کیلویی' ||
    clean.toLowerCase().includes('forklift')
  ) {
    return 'سیلندر لیفتراکی';
  }
  if (clean.includes('25') || clean.includes('۲۵')) {
    return 'سیلندر 25 کیلویی';
  }
  if (clean.includes('50') || clean.includes('۵۰') || clean === 'سیلندر 8 لیتری') {
    return 'سیلندر 50 کیلویی';
  }
  return 'سیلندر 11 کیلویی';
}

function getCylinderRelationshipInfo(cylinderType) {
  const normalized = normalizeCylinderType(cylinderType);

  switch (normalized) {
    case 'سیلندر 25 کیلویی':
      return {
        cylinderType: 'سیلندر 25 کیلویی',
        displayName: 'سیلندر ۲۵ کیلوگرم',
        valvesPerCylinder: 1,
        nutsPerCylinder: 1,
        isForklift: false,
        ratioSummary: 'رابطه فنی: ۱ سیلندر ۲۵ک = ۱ شیر + ۱ مهره'
      };
    case 'سیلندر 50 کیلویی':
      return {
        cylinderType: 'سیلندر 50 کیلویی',
        displayName: 'سیلندر ۵۰ کیلوگرم',
        valvesPerCylinder: 1,
        nutsPerCylinder: 1,
        isForklift: false,
        ratioSummary: 'رابطه فنی: ۱ سیلندر ۵۰ک = ۱ شیر + ۱ مهره'
      };
    case 'سیلندر لیفتراکی':
      return {
        cylinderType: 'سیلندر لیفتراکی',
        displayName: 'سیلندر لیفتراکی',
        valvesPerCylinder: 2,
        nutsPerCylinder: 2,
        isForklift: true,
        ratioSummary: 'رابطه فنی: ۱ سیلندر لیفتراک = ۲ شیر (مایع/بخار) + ۲ مهره'
      };
    case 'سیلندر 11 کیلویی':
    default:
      return {
        cylinderType: 'سیلندر 11 کیلویی',
        displayName: 'سیلندر ۱۱ کیلوگرم',
        valvesPerCylinder: 1,
        nutsPerCylinder: 1,
        isForklift: false,
        ratioSummary: 'رابطه فنی: ۱ سیلندر ۱۱ک = ۱ شیر + ۱ مهره'
      };
  }
}

console.log('--- [TEST 1] Testing Cylinder Normalization & Single Forklift Model ---');
assert.strictEqual(normalizeCylinderType('لیفتراکی 22 کیلویی'), 'سیلندر لیفتراکی');
assert.strictEqual(normalizeCylinderType('سیلندر لیفتراک'), 'سیلندر لیفتراکی');
assert.strictEqual(normalizeCylinderType('شیر لیفتراکی'), 'سیلندر لیفتراکی');
assert.strictEqual(normalizeCylinderType('سیلندر 10 کیلویی'), 'سیلندر لیفتراکی');
assert.strictEqual(normalizeCylinderType('سیلندر 11 کیلویی'), 'سیلندر 11 کیلویی');
assert.strictEqual(normalizeCylinderType('سیلندر 25 کیلویی'), 'سیلندر 25 کیلویی');
assert.strictEqual(normalizeCylinderType('سیلندر 50 کیلویی'), 'سیلندر 50 کیلویی');
console.log('✓ All variations of forklift normalized to single model: سیلندر لیفتراکی');

console.log('--- [TEST 2] Testing Valve & Nut Relationship Per Cylinder Type ---');
const c11 = getCylinderRelationshipInfo('سیلندر 11 کیلویی');
assert.strictEqual(c11.valvesPerCylinder, 1);
assert.strictEqual(c11.nutsPerCylinder, 1);
assert.strictEqual(c11.isForklift, false);

const c25 = getCylinderRelationshipInfo('سیلندر 25 کیلویی');
assert.strictEqual(c25.valvesPerCylinder, 1);
assert.strictEqual(c25.nutsPerCylinder, 1);
assert.strictEqual(c25.isForklift, false);

const c50 = getCylinderRelationshipInfo('سیلندر 50 کیلویی');
assert.strictEqual(c50.valvesPerCylinder, 1);
assert.strictEqual(c50.nutsPerCylinder, 1);
assert.strictEqual(c50.isForklift, false);

const cLift = getCylinderRelationshipInfo('سیلندر لیفتراکی');
assert.strictEqual(cLift.valvesPerCylinder, 2); // 2 valves: liquid + vapor
assert.strictEqual(cLift.nutsPerCylinder, 2);   // 2 nuts
assert.strictEqual(cLift.isForklift, true);
console.log('✓ Mechanical relationships verified: 1:1:1 for 11/25/50kg, and 1:2:2 for Forklift');

console.log('========================================');
console.log('ALL CYLINDER & VALVE RELATIONSHIP TESTS PASSED! ✓');
console.log('========================================');
