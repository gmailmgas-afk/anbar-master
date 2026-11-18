
const fs = require('fs');

// Check cylinder tank catalog mappings
const catalog = fs.readFileSync('src/database/cylinder-tank-catalog.ts', 'utf8');
console.log('Catalog check:');
console.log('Includes CYL-PICNIC-1L:', catalog.includes('CYL-PICNIC-1L'));
console.log('Includes CYL-PICNIC-5KG:', catalog.includes('CYL-PICNIC-5KG'));

// Check storage
const storage = fs.readFileSync('src/database/storage.ts', 'utf8');
console.log('Includes valvesPicnicNew:', storage.includes('valvesPicnicNew'));
console.log('Includes valvesPicnic58kgNew:', storage.includes('valvesPicnic58kgNew'));
