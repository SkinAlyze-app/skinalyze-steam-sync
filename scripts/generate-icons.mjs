/**
 * Generates icon16.png, icon48.png, icon128.png from icons/icon.svg.
 * Run: node scripts/generate-icons.mjs (requires sharp: npm install --no-save sharp)
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'icons', 'icon.svg');
const sizes = [16, 48, 128];

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Install sharp first: npm install --no-save sharp');
  process.exit(1);
}

const svg = readFileSync(svgPath);
for (const size of sizes) {
  const out = join(root, 'icons', `icon${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}
