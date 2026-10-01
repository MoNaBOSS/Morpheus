import { randomUUID } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';

/** Main-native selected destination only. Never exposed as a renderer path API. */
export async function writeMorpheusMemoryExport(destination: string, document: unknown): Promise<void> {
  const json = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > 1_000_000) throw new Error('Memory export is too large');
  try {
    const existing = await lstat(destination);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Choose a regular file for memory export');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(json, { encoding: 'utf8' });
    await handle.close();
    await rename(temporary, destination);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}
