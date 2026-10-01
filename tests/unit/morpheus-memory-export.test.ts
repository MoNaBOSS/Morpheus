import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeMorpheusMemoryExport } from '@electron/services/morpheus/memory/memory-export';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
describe('native-selected bounded memory export', () => {
  it('atomically replaces selected output and never overwrites a predictable neighboring tmp file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'morpheus-export-')); roots.push(root);
    const target = join(root, 'memory.json'); writeFileSync(target, 'older'); writeFileSync(`${target}.tmp`, 'user file');
    const document = { v: 1, memories: [{ text: 'Short progress updates.' }] };
    await writeMorpheusMemoryExport(target, document);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(document);
    expect(readFileSync(`${target}.tmp`, 'utf8')).toBe('user file');
    expect(readdirSync(root).sort()).toEqual(['memory.json', 'memory.json.tmp']);
  });
  it('rejects oversized export before touching existing output and rejects directory targets', async () => {
    const root = mkdtempSync(join(tmpdir(), 'morpheus-export-')); roots.push(root);
    const target = join(root, 'memory.json'); writeFileSync(target, 'older');
    await expect(writeMorpheusMemoryExport(target, { text: 'a'.repeat(1_000_000) })).rejects.toThrow('too large');
    expect(readFileSync(target, 'utf8')).toBe('older');
    await expect(writeMorpheusMemoryExport(root, {})).rejects.toThrow('regular file');
  });
});
