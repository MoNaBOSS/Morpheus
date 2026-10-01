import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { assertRegularFileInside } from '../../../../utils/morpheus-path-guard';
import { MorpheusCapabilityError } from '../../capability-registry';
import { resolveSystemRoot } from './application-discovery';
import { WINDOWS_WINDOW_HELPER } from './window-helper';
import { WINDOWS_MEDIA_HELPER } from './media-helper';

/** Fixed compiler-owned helper choice; only bounded JSON crosses stdin. This is
 * not a generic script runner, and is never exposed through a host API. */
export function runDesktopHelper(kind: 'window' | 'media', request: unknown, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const failure = (message: string) => new MorpheusCapabilityError('execution-failed', message);
    if (signal?.aborted) { reject(failure('Desktop operation cancelled.')); return; }
    const data = JSON.stringify(request);
    if (Buffer.byteLength(data) > 8192 || !['window', 'media'].includes(kind)) { reject(failure('Invalid desktop operation.')); return; }
    const directory = join(resolveSystemRoot(env), 'System32', 'WindowsPowerShell', 'v1.0');
    let executable: string;
    try { executable = assertRegularFileInside(directory, join(directory, 'powershell.exe')); } catch { reject(failure('Windows controls are unavailable.')); return; }
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(kind === 'window' ? WINDOWS_WINDOW_HELPER : WINDOWS_MEDIA_HELPER, 'utf16le').toString('base64')],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'], env });
    let output = '', settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { child.kill(); reject(error); } else resolve(result);
    };
    const abort = () => finish(failure('Desktop operation cancelled; check the target before repeating.'));
    const timer = setTimeout(() => finish(failure('Desktop operation timed out; check the target before repeating.')), 8_000);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish(failure('Windows helper could not start.')));
    child.stdin.on('error', () => finish(failure('Windows helper is unavailable.')));
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (Buffer.byteLength(output) > 32 * 1024) finish(failure('Desktop response exceeds its limit.')); });
    child.on('close', (code) => {
      if (code !== 0) return finish(failure('Windows helper failed.'));
      try { finish(undefined, JSON.parse(output.replace(/^\uFEFF/, '').trim())); } catch { finish(failure('Desktop state could not be verified.')); }
    });
    if (signal?.aborted) abort();
    if (!settled) child.stdin.end(data + '\n');
  });
}
