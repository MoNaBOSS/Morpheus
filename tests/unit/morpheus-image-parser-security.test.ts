// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bundled image parser security patch', () => {
  it('terminates malformed containers and preserves legitimate formats in every shipped representation', () => {
    const result = spawnSync(process.execPath, [resolve('scripts/security/verify-image-size-patch.mjs')], {
      encoding: 'utf8', timeout: 20_000, windowsHide: true, shell: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'passed', boxCopies: 18, icnsCopies: 12 });
  }, 25_000);
});
