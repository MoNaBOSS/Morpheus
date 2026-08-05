#!/usr/bin/env node
/**
 * Generates every Morpheus application icon from the single vector source at
 * resources/branding/morpheus-mark.svg.
 *
 * Repeatable project tooling: edit the SVG, re-run `pnpm run icons:morpheus`,
 * and every raster artefact is rebuilt. Nothing here is hand-edited.
 *
 * Produces:
 *   resources/icons/<size>.png   Linux icon set
 *   resources/icons/icon.png     512x512 fallback
 *   resources/icons/icon.ico     Windows (multi-resolution)
 *   resources/icons/icon.svg     vector source copy consumed by packaging
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'resources', 'branding', 'morpheus-mark.svg');
const ICON_DIR = join(ROOT, 'resources', 'icons');

const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];
/** Sizes Windows Explorer actually selects between. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Minimal ICO container. `sharp` has no ICO encoder, and pulling a dedicated
 * dependency in for a six-field header is not worth the supply-chain surface.
 * Each entry embeds a complete PNG, which Windows Vista+ accepts.
 */
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;

  images.forEach((image, index) => {
    const entry = 16 * index;
    // 256 is encoded as 0 in the ICO directory.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 0);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.data)]);
}

async function main() {
  mkdirSync(ICON_DIR, { recursive: true });
  const svg = readFileSync(SOURCE);

  const render = (size) => sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  for (const size of PNG_SIZES) {
    writeFileSync(join(ICON_DIR, `${size}x${size}.png`), await render(size));
    console.log(`  wrote ${size}x${size}.png`);
  }

  const fallback = await render(512);
  writeFileSync(join(ICON_DIR, 'icon.png'), fallback);
  console.log('  wrote icon.png');

  const icoImages = [];
  for (const size of ICO_SIZES) icoImages.push({ size, data: await render(size) });
  writeFileSync(join(ICON_DIR, 'icon.ico'), buildIco(icoImages));
  console.log(`  wrote icon.ico (${ICO_SIZES.join(', ')})`);

  writeFileSync(join(ICON_DIR, 'icon.svg'), svg);
  console.log('  wrote icon.svg');

  console.log('\nMorpheus icons generated from resources/branding/morpheus-mark.svg');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
