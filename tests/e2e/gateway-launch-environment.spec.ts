import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closeElectronApp, expect, test } from './fixtures/electron';

test('actual Electron utility launch omits cleared credentials and retains selected SecretRef values', async ({ launchElectronApp, homeDir }) => {
  const root = resolve('.');
  const launcher = join(homeDir, 'production-gateway-launcher.cjs');
  await build({ entryPoints: [join(root, 'electron/gateway/process-launcher.ts')], outfile: launcher,
    bundle: true, external: ['electron'], format: 'cjs', platform: 'node', target: 'node22',
    tsconfig: join(root, 'tsconfig.node.json'),
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(join(root, 'electron/utils/paths.ts')).href) } });
  const childScript = join(homeDir, 'environment-probe.cjs');
  await writeFile(childScript, `process.parentPort.postMessage({
    clearedAbsent: !Object.hasOwn(process.env, 'OPENAI_API_KEY'),
    selectedPresent: process.env.CLAWX_PROVIDER_SELECTED === 'synthetic-selected',
    emptyNotStringified: process.env.EMPTY_PROBE === '' || process.env.EMPTY_PROBE === undefined,
    bonjourDisabled: process.env.OPENCLAW_DISABLE_BONJOUR === '1'
  }); setTimeout(() => process.exit(0), 50);`);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const result = await app.evaluate(async ({ app: _app }, input) => {
      const { launchGatewayProcess } = process.mainModule!.require(input.launcher);
      const source = { ...process.env, OPENAI_API_KEY: undefined,
        CLAWX_PROVIDER_SELECTED: 'synthetic-selected', EMPTY_PROBE: '', OPENCLAW_DISABLE_BONJOUR: '0' };
      let exitCode: number | null | undefined;
      const { child } = await launchGatewayProcess({ port: 0,
        launchContext: { openclawDir: input.homeDir, entryScript: input.childScript, gatewayArgs: [],
          forkEnv: source, mode: 'isolated-environment-probe', binPathExists: false,
          loadedProviderKeyCount: 1, proxySummary: 'none', channelStartupSummary: 'none' },
        sanitizeSpawnArgs: (args: string[]) => args, getCurrentState: () => 'starting',
        getShouldReconnect: () => false, onStderrLine: () => undefined, onSpawn: () => undefined,
        onError: () => undefined, onExit: (_child: unknown, code: number | null) => { exitCode = code; } });
      try {
        const message = await new Promise((resolveMessage, reject) => {
          const timeout = setTimeout(() => reject(new Error('Child environment probe timed out')), 10000);
          child.once('message', (value: unknown) => { clearTimeout(timeout); resolveMessage(value); });
          child.once('error', (error: Error) => { clearTimeout(timeout); reject(error); });
        });
        if (exitCode === undefined) await new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
        return { message, exitCode, sourceStillContainsUnset: Object.hasOwn(source, 'OPENAI_API_KEY') };
      } finally { if (exitCode === undefined) child.kill(); }
    }, { launcher, childScript, homeDir });
    // Electron on Windows drops empty strings in the actual child environment;
    // our boundary preserves their validity, never the literal "undefined".
    expect(result).toEqual({ message: { clearedAbsent: true, selectedPresent: true, emptyNotStringified: true, bonjourDisabled: true }, exitCode: 0, sourceStillContainsUnset: true });
  } finally { await closeElectronApp(app); }
});
