import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MORPHEUS_UPDATE_FEED,
  isForbiddenUpdateFeed,
  isUpdateFeedConfigured,
  resolveUpdateConfiguration,
} from '@electron/main/updater-policy';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), 'utf8');

describe('package identity', () => {
  const pkg = JSON.parse(read('package.json')) as Record<string, string>;

  it('is named and versioned as Morpheus 1.0.1', () => {
    expect(pkg.name).toBe('morpheus');
    expect(pkg.version).toBe('1.0.1');
    expect(pkg.description).toContain('Morpheus');
    expect(pkg.description).not.toContain('ClawX');
  });

  it('sets the window title to Morpheus', () => {
    expect(read('index.html')).toContain('<title>Morpheus</title>');
    expect(read('electron/main/index.ts')).toContain("title: 'Morpheus'");
  });

  it('uses the Morpheus application id everywhere it is declared', () => {
    expect(read('electron-builder.yml')).toContain('appId: app.morpheus.desktop');
    expect(read('electron/main/index.ts')).toContain("WINDOWS_APP_USER_MODEL_ID = 'app.morpheus.desktop'");
  });
});

describe('installer identity', () => {
  const builder = read('electron-builder.yml');

  it('produces a Morpheus-named installer', () => {
    expect(builder).toContain('productName: Morpheus');
    // artifactName interpolates productName, so this yields Morpheus-1.0.1-win-x64.exe
    expect(builder).toContain('artifactName: ${productName}-${version}-${os}-${arch}.${ext}');
    expect(builder).toContain('shortcutName: Morpheus');
    expect(builder).toContain('uninstallDisplayName: Morpheus');
  });

  it('carries no ClawX product naming', () => {
    for (const line of builder.split('\n')) {
      // Comments may reference ClawX to explain what was removed.
      if (line.trimStart().startsWith('#')) continue;
      expect(line).not.toContain('ClawX');
    }
  });
});

describe('update feed', () => {
  it('ships with no update feed configured', () => {
    expect(MORPHEUS_UPDATE_FEED).toBeNull();
    expect(isUpdateFeedConfigured()).toBe(false);
    expect(resolveUpdateConfiguration()).toEqual({ configured: false, reason: 'not-configured' });
  });

  it('rejects the inherited ClawX feeds even if someone reconfigures them', () => {
    for (const url of [
      'https://oss.intelli-spectrum.com/latest',
      'https://github.com/ValueCell-ai/ClawX/releases',
      'https://example.com/clawx/latest',
    ]) {
      expect(isForbiddenUpdateFeed(url), url).toBe(true);
      expect(resolveUpdateConfiguration(url)).toEqual({
        configured: false, reason: 'rejected-inherited-feed',
      });
    }
  });

  it('accepts a genuine Morpheus endpoint', () => {
    expect(resolveUpdateConfiguration('https://updates.morpheus.example/latest')).toEqual({
      configured: true, feedUrl: 'https://updates.morpheus.example/latest',
    });
  });

  it('removes the inherited publish targets from packaging config', () => {
    const builder = read('electron-builder.yml');
    expect(builder).toContain('publish: null');
    expect(builder).not.toMatch(/^\s+repo:\s*ClawX/m);
    expect(builder).not.toMatch(/^\s+url:\s*https:\/\/oss\.intelli-spectrum\.com/m);
  });

  it('keeps release automation Windows-only and out of the inherited ClawX feed', () => {
    const workflow = read('.github/workflows/release.yml');
    expect(workflow).toContain('name: Morpheus Windows Release');
    expect(workflow).toContain('release/Morpheus-*-win-x64.exe');
    expect(workflow).toContain('SHA256SUMS-windows.txt');
    expect(workflow).not.toContain('valuecell-clawx');
    expect(workflow).not.toContain('ossutil');
    expect(workflow).not.toContain('ClawX-*');
    expect(workflow).not.toContain('package:mac');
    expect(workflow).not.toContain('package:linux');
  });
});

describe('visible branding', () => {
  it('uses the original Morpheus mark, not ClawX artwork', () => {
    expect(existsSync(join(REPO_ROOT, 'resources/branding/morpheus-mark.svg'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'src/assets/morpheus-logo.svg'))).toBe(true);

    const sidebar = read('src/components/layout/Sidebar.tsx');
    expect(sidebar).toContain("from '@/assets/morpheus-logo.svg'");
    expect(sidebar).toContain('>Morpheus<');
    expect(sidebar).not.toContain('assets/logo.svg');
  });

  it('generates every Windows icon size from the vector source', () => {
    const iconDir = join(REPO_ROOT, 'resources/icons');
    for (const name of ['icon.ico', 'icon.png', '16x16.png', '256x256.png', '512x512.png']) {
      expect(existsSync(join(iconDir, name)), name).toBe(true);
    }
    // The ICO must be a real multi-resolution container, not a renamed PNG.
    const ico = readFileSync(join(iconDir, 'icon.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(5);
  });

  it('keeps icon generation repeatable rather than hand-maintained', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts/generate-morpheus-icons.mjs'))).toBe(true);
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['icons:morpheus']).toContain('generate-morpheus-icons');
  });
});

describe('no visible ClawX text in the rendered UI', () => {
  /** Recursively collects renderer sources that can produce visible text. */
  function collect(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collect(full));
      else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('has no ClawX in user-facing strings across every locale', () => {
    for (const lang of ['en', 'zh', 'ja', 'ru']) {
      const dir = join(REPO_ROOT, 'shared/i18n/locales', lang);
      for (const file of readdirSync(dir)) {
        const content = readFileSync(join(dir, file), 'utf8');
        expect(content, `${lang}/${file}`).not.toContain('ClawX');
      }
    }
  });

  it('describes Morpheus as an execution platform rather than an OpenClaw GUI', () => {
    for (const lang of ['en', 'zh', 'ja', 'ru']) {
      const settings = read(`shared/i18n/locales/${lang}/settings.json`);
      const setup = read(`shared/i18n/locales/${lang}/setup.json`);
      expect(settings).not.toMatch(/Graphical AI Assistant|图形化 AI 助手|グラフィカル AI アシスタント|Графический AI-ассистент/);
      expect(setup).not.toMatch(/graphical interface for OpenClaw|OpenClaw 的图形界面|OpenClawのグラフィカルインターフェース|графический интерфейс для OpenClaw/i);
    }

    const englishSettings = read('shared/i18n/locales/en/settings.json');
    expect(englishSettings).toContain('AI Execution Platform');
    expect(englishSettings).toContain('OpenClaw provides the embedded Chat runtime');
  });

  it('has no ClawX in rendered JSX text or alt attributes', () => {
    const offenders: string[] = [];
    for (const file of collect(join(REPO_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        // Internal identifiers may retain the inherited name; only rendered
        // text, alt text and titles matter for product identity.
        if (/>\s*ClawX\s*</.test(line)
          || /alt="ClawX"/.test(line)
          || /title="ClawX"/.test(line)
          || /placeholder="[^"]*ClawX/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('starts the application log under the Morpheus name', () => {
    expect(read('electron/utils/logger.ts')).toContain('Morpheus Session Start');
    expect(read('electron/main/index.ts')).toContain('Morpheus Application Starting');
  });
});
