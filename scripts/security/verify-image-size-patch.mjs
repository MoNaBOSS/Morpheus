import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), '../..');

// A regressed parser must fail an isolated, memory/time-limited process rather
// than hanging Vitest, CI or the gateway running on the developer's machine.
export function verifyImageSizePatch(packageRoot) {
  const requireLark = createRequire(join(repo, 'node_modules/@larksuite/openclaw-lark/package.json'));
  const root = packageRoot ?? resolve(dirname(requireLark.resolve('image-size')), '..');
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', script, '--probe', root], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true, shell: false,
    maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined, 'Image parser probe timed out or could not start');
  assert.equal(result.status, 0, `Image parser probe failed: ${result.stderr.slice(-2000)}`);
  return JSON.parse(result.stdout);
}

function box(name, payload = Buffer.alloc(0), size) {
  const data = Buffer.alloc(8 + payload.length);
  data.writeUInt32BE(size ?? data.length, 0);
  data.write(name, 4, 4, 'ascii');
  payload.copy(data, 8);
  return data;
}

function icns(length = 8, fileLength = 16) {
  const data = Buffer.alloc(16);
  data.write('icns', 0);
  data.writeUInt32BE(fileLength, 4);
  data.write('icp4', 8);
  data.writeUInt32BE(length, 12);
  return data;
}

function heif(size) {
  const dimensions = Buffer.alloc(12);
  dimensions.writeUInt32BE(16, 4);
  dimensions.writeUInt32BE(24, 8);
  return Buffer.concat([
    box('ftyp', Buffer.from('heic\0\0\0\0')),
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', dimensions, size)))])),
  ]);
}

function jxl(size) {
  // Small-image bitstream: 8px height, aspect ratio 1:1.
  return Buffer.concat([
    box('JXL ', Buffer.from([13, 10, 135, 10])),
    box('ftyp', Buffer.from('jxl \0\0\0\0')),
    box('jxlp', Buffer.from([0, 0, 0, 0, 255, 10, 65, 0]), size),
  ]);
}

async function probe(root) {
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '2.0.2');
  const dist = join(root, 'dist');
  const paths = [dist, join(dist, 'types')].flatMap(folder => readdirSync(folder)
    .filter(name => /\.(cjs|mjs)$/.test(name)).map(name => join(folder, name)));
  let boxCopies = 0;
  let icnsCopies = 0;
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    if (source.includes('function readBox(input, offset)')) {
      boxCopies++;
      assert.ok(source.includes('boxSize < 8'), `${path}: missing progress bound`);
      assert.ok(source.includes('input.length - offset < 8'), `${path}: missing header bound`);
    }
    if (source.includes('const imageHeader = readImageHeader(input, imageOffset)')) {
      icnsCopies++;
      assert.ok(source.includes('imageHeader[1] < 8'), `${path}: missing ICNS progress bound`);
      assert.ok(source.includes('fileLength - imageOffset < 8'), `${path}: missing ICNS header bound`);
    }
  }
  assert.equal(boxCopies, 18, 'All bundled CommonJS and ESM box-parser copies must be covered');
  assert.equal(icnsCopies, 12, 'All bundled CommonJS and ESM ICNS copies must be covered');

  const temporary = mkdtempSync(join(tmpdir(), 'morpheus-image-parser-'));
  let checks = 0;
  try {
    for (const extension of ['cjs', 'mjs']) {
      const main = await import(pathToFileURL(join(dist, `index.${extension}`)).href);
      const lookup = await import(pathToFileURL(join(dist, `lookup.${extension}`)).href);
      const handlers = await import(pathToFileURL(join(dist, `types/index.${extension}`)).href);
      const utils = await import(pathToFileURL(join(dist, `types/utils.${extension}`)).href);
      assert.equal(utils.findBox(box('free'), 'free', 0).size, 8);
      assert.equal(utils.findBox(box('free', Buffer.alloc(12), 0), 'free', 0).size, 20);
      assert.equal(utils.findBox(box('free').subarray(0, 7), 'free', 0), undefined);
      const offsetBoxes = Buffer.concat([box('free'), box('ispe')]);
      assert.equal(utils.findBox(offsetBoxes, 'ispe', 8).offset, 8);
      assert.equal(utils.findBox(box('free', box('ispe'), 0), 'ispe', 0), undefined);
      checks += 5;
      for (const calculate of [main.imageSize, lookup.imageSize]) {
        assert.equal(calculate(icns()).width, 16);
        assert.equal(calculate(heif()).height, 24);
        assert.equal(calculate(heif(0)).height, 24); // Valid box extending to EOF.
        assert.equal(calculate(jxl()).width, 8);
        assert.equal(calculate(jxl(0)).width, 8); // Previously non-progressing partial stream.
        const streamHeader = jxl().subarray(0, 28);
        assert.equal(calculate(Buffer.concat([streamHeader, box('jxlc', Buffer.from([255, 10, 65, 0]))])).width, 8);
        assert.equal(calculate(Buffer.concat([
          streamHeader, box('jxlp', Buffer.from([0, 0, 0, 0, 255, 10])),
          box('jxlp', Buffer.from([128, 0, 0, 1, 65, 0])),
        ])).width, 8);
        const avif = heif();
        avif.write('avif', 8);
        assert.equal(calculate(avif).height, 24);
        const jp2Dimensions = Buffer.alloc(14);
        jp2Dimensions.writeUInt32BE(24, 0);
        jp2Dimensions.writeUInt32BE(16, 4);
        const jp2 = Buffer.concat([
          box('jP  ', Buffer.from([13, 10, 135, 10])), box('ftyp', Buffer.from('jp2 \0\0\0\0')),
          box('jp2h', box('ihdr', jp2Dimensions)),
        ]);
        assert.equal(calculate(jp2).width, 16);
        const multiIcon = Buffer.concat([icns(8, 24), icns().subarray(8)]);
        multiIcon.write('icp5', 16);
        assert.equal(calculate(multiIcon).width, 32);
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=', 'base64');
        assert.equal(calculate(png).width, 1);
        for (const size of [0, 1, 7, 9, 0xffffffff]) assert.throws(() => calculate(icns(size)));
        for (const size of [1, 2, 7, 0xffffffff]) {
          assert.throws(() => calculate(heif(size)));
          assert.throws(() => calculate(jxl(size)));
        }
        // A Buffer view must not read an entry header beyond its visible bytes.
        assert.throws(() => calculate(icns().subarray(0, 12)));
        checks += 25;
      }
      for (const [type, valid, invalid] of [
        ['icns', icns(), icns(0)], ['heif', heif(), heif(1)], ['jxl', jxl(), jxl(1)],
      ]) {
        const standalone = await import(pathToFileURL(join(dist, `types/${type}.${extension}`)).href);
        for (const handler of [standalone[type.toUpperCase()], handlers.typeHandlers.get(type)]) {
          assert.ok(handler.calculate(valid).width > 0);
          assert.throws(() => handler.calculate(invalid));
          checks += 2;
        }
      }
      const fromFile = await import(pathToFileURL(join(dist, `fromFile.${extension}`)).href);
      const file = join(temporary, `icon-${extension}.icns`);
      writeFileSync(file, icns(0));
      await assert.rejects(fromFile.imageSizeFromFile(file));
      // fromFile deliberately reads only the first 512 KiB. A legitimate large
      // ICNS entry still supplies dimensions through its complete entry header.
      const large = Buffer.alloc(600_000);
      icns(large.length - 8, large.length).copy(large);
      writeFileSync(file, large);
      assert.equal((await fromFile.imageSizeFromFile(file)).width, 16);
      for (const [name, data] of [['heif', heif(0)], ['jxl', jxl(0)]]) {
        const media = join(temporary, `sample-${extension}.${name}`);
        writeFileSync(media, data);
        assert.ok((await fromFile.imageSizeFromFile(media)).width > 0);
      }
      checks += 4;
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return { package: 'image-size@2.0.2', boxCopies, icnsCopies, checks, outcome: 'passed' };
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  if (process.argv[2] === '--probe') console.log(JSON.stringify(await probe(process.argv[3])));
  else console.log(JSON.stringify(verifyImageSizePatch(process.argv[2])));
}
