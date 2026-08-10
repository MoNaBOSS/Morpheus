import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('preinstalled skill bundle portability', () => {
  it('runs Git inside the temporary checkout instead of interpolating a Windows drive path', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'bundle-preinstalled-skills.mjs'),
      'utf8',
    );

    expect(source).toContain('$.cwd = checkoutDir;');
    expect(source).toContain('await $`git init .`;');
    expect(source).not.toContain('git init ${gitCheckoutDir}');
    expect(source).not.toContain('git -C ${gitCheckoutDir}');
  });
});
