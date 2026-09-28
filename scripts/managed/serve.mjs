import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('artifacts/managed/server.mjs');
await build({ entryPoints: ['services/managed/main.ts'], outfile: output, bundle: true,
  platform: 'node', target: 'node22', format: 'esm', packages: 'external' });
await import(pathToFileURL(output).href);
