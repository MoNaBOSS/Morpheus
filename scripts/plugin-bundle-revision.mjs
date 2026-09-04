import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Keep upstream versions intact while identifying Morpheus dependency backports. */
export function stampPluginBundleRevision(pluginDir, repositoryRoot) {
  const app = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const lock = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8').replaceAll('\r\n', '\n');
  const revision = createHash('sha256').update(`${app.version}\n${lock}`).digest('hex');
  const path = join(pluginDir, 'package.json');
  const plugin = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify({ ...plugin, morpheusBundleRevision: revision }, null, 2)}\n`);
  return revision;
}
