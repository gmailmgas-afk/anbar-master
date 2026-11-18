const assert = require('assert');

// Test simulation of receipt items building for Kardex entries with valve exits & entries

function numberToPersianWords(n) {
  const words = { 1: 'یک', 5: 'پنج', 10: 'ده', 25: 'بیست و پنج', 50: 'پنجاه' };
  return words[n] || String(n);
}

function buildInitialExitItems(entry) {
  const items = [];
  let rowCount = 1;

  if (entry.cylinder_out > 0) {
    items.push({
      rowNum: rowCount++,
      description: entry.cylinder_type ? `${entry.cylinder_type} گاز مایع ارسال و تحویل` : 'سیلندر گاز مایع 11 کیلوگرمی ارسال و تحویل',
      quantity: entry.cylinder_out,
      quantityInWords: numberToPersianWords(entry.cylinder_out),
      remarks: entry.description || 'سالم و تست شده'
    });
  }

  let coveredNewValveQty = 0;
  let coveredUsedValveQty = 0;

  if (entry.valve_items && entry.valve_items.length > 0) {
    const outValves = entry.valve_items.filter(v => v.direction === 'OUT' || (!v.direction && (entry.new_valve_out > 0 || entry.used_valve_out > 0)));
    outValves.forEach(v => {
      const isNew = v.valve_category === 'NEW';
      const qty = Number(v.quantity) || 1;
      if (isNew) coveredNewValveQty += qty;
      else coveredUsedValveQty += qty;

      items.push({
        rowNum: rowCount++,
        description: `${v.valve_name} ${isNew ? '(شیر نو استاندارد)' : '(داغی شیر کهنه / اسقاط)'}`,
        quantity: qty,
        quantityInWords: numberToPersianWords(qty),
        remarks: entry.notes || entry.description || (isNew ? 'تحویل و خروج شیر نو تعویضی' : 'خروج داغی شیر کهنه')
      });
    });
  }

  const remainingNewValveOut = Math.max(0, (entry.new_valve_out || 0) - coveredNewValveQty);
  if (remainingNewValveOut > 0) {
    const vName = entry.valve_subtype ? `شیر نو (${entry.valve_subtype})` : (entry.cylinder_type ? `شیر نو متناظر ${entry.cylinder_type}` : 'شیر نو سیلندر گاز مایع');
    items.push({
      rowNum: rowCount++,
      description: `${vName} ارسال و تحویل مشتری`,
      quantity: remainingNewValveOut,
      quantityInWords: numberToPersianWords(remainingNewValveOut),
      remarks: entry.notes || entry.description || 'تحویل و خروج شیر نو تعویضی'
    });
  }

  const remainingUsedValveOut = Math.max(0, (entry.used_valve_out || 0) - coveredUsedValveQty);
  if (remainingUsedValveOut > 0) {
    const vName = entry.valve_subtype ? `داغی و شیر کهنه (${entry.valve_subtype})` : (entry.cylinder_type ? `داغی و شیر کهنه ${entry.cylinder_type}` : 'داغی و شیر کهنه سیلندر');
    items.push({
      rowNum: rowCount++,
      description: `${vName} ارسال / اسقاط`,
      quantity: remainingUsedValveOut,
      quantityInWords: numberToPersianWords(remainingUsedValveOut),
      remarks: entry.notes || entry.description || 'خروج شیر کهنه و اسقاط'
    });
  }

  if (entry.scrap_out > 0) {
    items.push({
      rowNum: rowCount++,
      description: 'ضایعات اسقاطی سیلندر گاز مایع',
      quantity: entry.scrap_out,
      quantityInWords: numberToPersianWords(entry.scrap_out),
      remarks: 'اسقاطی غیرقابل شارژ'
    });
  }

  return items;
}

// Case 1: Kardex entry with ONLY valve exit (no cylinder out)
const entryWithOnlyValveOut = {
  entry_id: 'ENT-VALVE-01',
  customer_name: 'شرکت گاز البرز',
  cylinder_type: 'سیلندر 11 کیلویی',
  cylinder_in: 0,
  cylinder_out: 0,
  new_valve_out: 10,
  used_valve_out: 5,
  description: 'حواله خروج شیرآلات - شیر بوتان - تعویض شیرهای فرسوده',
  notes: 'تحویل راننده آقای عباسی',
  valve_items: [
    { valve_name: 'شیر سیلندر ۱۱ کیلویی بوتان', valve_category: 'NEW', quantity: 10, direction: 'OUT' }
  ]
};

const items1 = buildInitialExitItems(entryWithOnlyValveOut);
assert.strictEqual(items1.length, 2, 'Should create 2 items: 1 from valve_items and 1 for remaining used valve');
assert.ok(items1[0].description.includes('شیر سیلندر ۱۱ کیلویی بوتان'), 'First item must have valve name');
assert.strictEqual(items1[0].quantity, 10, 'Quantity must be 10');
assert.strictEqual(items1[0].remarks, 'تحویل راننده آقای عباسی', 'Remarks should use notes/description');
assert.strictEqual(items1[1].quantity, 5, 'Used valve quantity must be 5');
assert.ok(items1[1].description.includes('داغی'), 'Second item must be used/scrap valve');

// Case 2: Mixed Kardex entry with Cylinder Out AND Valve Out
const mixedEntry = {
  entry_id: 'ENT-MIXED-02',
  customer_name: 'اتحاد گاز ساحل بندر',
  cylinder_type: 'سیلندر 11 کیلویی',
  cylinder_out: 50,
  new_valve_out: 25,
  used_valve_out: 0,
  description: 'ارسال محموله کپسول و شیر نو تعویضی',
  notes: 'بارنامه شماره ۹۸۷۶'
};

const items2 = buildInitialExitItems(mixedEntry);
assert.strictEqual(items2.length, 2, 'Should contain both cylinder and new valve');
assert.strictEqual(items2[0].quantity, 50, 'Cylinder out must be 50');
assert.strictEqual(items2[1].quantity, 25, 'New valve out must be 25');

console.log('✓ Kardex valve exit receipt generation tests passed 100%!');
