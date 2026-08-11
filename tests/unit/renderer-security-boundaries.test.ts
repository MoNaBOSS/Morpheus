import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('renderer security boundaries', () => {
  it('does not expose provider secret reads to the renderer', () => {
    const preload = source('electron/preload/index.ts');
    const contract = source('shared/host-api/contract.ts');
    const facade = source('src/lib/host-api.ts');

    expect(preload).not.toContain("'provider:getApiKey'");
    expect(contract).not.toMatch(/\bget(?:Account)?ApiKey:\s*\(/);
    expect(facade).not.toMatch(/\bget(?:Account)?ApiKey:\s*\(/);
  });

  it('does not expose legacy path-based file or shell operations', () => {
    const preload = source('electron/preload/index.ts');

    for (const channel of [
      'shell:showItemInFolder',
      'shell:openPath',
      'file:readText',
      'file:readBinary',
      'file:writeText',
      'file:stat',
      'file:listDir',
      'file:listTree',
    ]) {
      expect(preload).not.toContain(`'${channel}'`);
    }
    expect(preload).toContain("'host:invoke'");
  });
});
