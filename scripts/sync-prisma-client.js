/**
 * Copies the generated Prisma client into dist/.
 *
 * Compiled sources land in dist/src/**, so their relative imports of
 * '../../prisma/generated/prisma' resolve to dist/prisma/generated/prisma.
 * The Dockerfile already does this copy for the production image; doing it
 * here keeps a plain local `node dist/src/main.js` working the same way.
 */
const { cpSync, existsSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const from = join(root, 'prisma', 'generated');
const to = join(root, 'dist', 'prisma', 'generated');

if (!existsSync(from)) {
  console.error('Prisma client not found at prisma/generated — run "prisma generate" first.');
  process.exit(1);
}

cpSync(from, to, { recursive: true });
console.log('Synced Prisma client -> dist/prisma/generated');
