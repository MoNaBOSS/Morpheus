import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';

// These upstream npm tarballs embed node_modules, outside pnpm's override graph.
// Backport only reviewed same-major packages from the installed locked graph.
const POLICIES = { undici: 8, ws: 8, protobufjs: 7 };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const within = (root, file) => {
  const part = relative(root, file);
  return part !== '' && part !== '..' && !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(part);
};

export function patchBundledPluginDependencies(pluginDir, repositoryRoot) {
  const root = realpathSync(pluginDir);
  const installed = realpathSync(join(repositoryRoot, 'node_modules'));
  if (root === installed || within(installed, root)) throw new Error('Refusing to patch installed source dependencies');
  if (!existsSync(join(root, 'openclaw.plugin.json'))) throw new Error('Expected generated plugin mirror');
  const overrides = readJson(join(repositoryRoot, 'package.json')).pnpm.overrides;
  const applied = {};
  const changes = [];

  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const dest = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected link in generated plugin: ${dest}`);
      if (!entry.isDirectory()) continue;
      const manifestPath = join(dest, 'package.json');
      if (existsSync(manifestPath)) {
        const current = readJson(manifestPath);
        const major = POLICIES[current.name];
        if (major && String(current.version).startsWith(`${major}.`)) {
          const expected = overrides[`${current.name}@^${major}.0.0`];
          if (!new RegExp(`^${major}\\.\\d+\\.\\d+$`).test(expected)) throw new Error(`Missing exact override: ${current.name}`);
          applied[current.name] = expected;
          if (current.version !== expected) {
            const source = realpathSync(join(installed, current.name));
            const replacement = readJson(join(source, 'package.json'));
            if (replacement.name !== current.name || replacement.version !== expected) throw new Error(`Locked replacement mismatch: ${current.name}`);
            // This is a backport, not a new dependency resolver. Refuse a changed
            // runtime dependency graph or nested graph that would be lost on copy.
            if (existsSync(join(dest, 'node_modules'))) throw new Error(`Nested dependency closure needs review: ${dest}`);
            const requireFromTarget = createRequire(manifestPath);
            for (const [dep, range] of Object.entries(replacement.dependencies || {})) {
              if (dep.startsWith('@types/')) continue;
              if (current.dependencies?.[dep] !== range) throw new Error(`Changed dependency requires review: ${current.name} -> ${dep}`);
              requireFromTarget.resolve(dep);
            }
            if (!within(root, resolve(dest)) || realpathSync(dest) !== resolve(dest) || lstatSync(dest).isSymbolicLink()) throw new Error('Unsafe generated dependency target');
            const stage = `${dest}.morpheus-patch`;
            if (existsSync(stage)) throw new Error(`Existing dependency staging directory: ${stage}`);
            cpSync(source, stage, { recursive: true, dereference: true, filter: (file) => file === source || !relative(source, file).split(/[\\/]/).includes('node_modules') });
            // Only a validated generated package inside this mirror is replaced.
            rmSync(dest, { recursive: true });
            renameSync(stage, dest);
            changes.push({ name: current.name, from: current.version, to: expected, path: relative(root, dest) });
          }
        }
      }
      visit(dest);
    }
  }
  const modules = join(root, 'node_modules');
  if (existsSync(modules)) visit(modules);
  const manifestPath = join(root, 'package.json');
  const manifest = readJson(manifestPath);
  // Included in the mirror revision so existing same-version installed plugins
  // refresh after a packaging backport, even when the application lock is stable.
  manifest.morpheusBundledOverrides = Object.fromEntries(Object.entries(applied).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return changes;
}
