/**
 * Generates canonical SQLite binary databases for all environments.
 * Delegates to TypeScript builder via tsx.
 */
const { execSync } = require('child_process');
const path = require('path');

console.log('[Anbar DB Generator] Running canonical database build...');
try {
  execSync(`npx tsx ${path.join(__dirname, 'generate-anbar-databases.ts')}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('[Anbar DB Generator] Database regeneration complete.');
} catch (err) {
  console.error('[Anbar DB Generator] Build failed:', err.message);
  process.exit(1);
}
