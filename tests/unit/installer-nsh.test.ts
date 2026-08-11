import { readFileSync } from 'node:fs';

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const installerNsh = readFileSync(join(process.cwd(), 'scripts/installer.nsh'), 'utf8');

describe('installer.nsh security and running-app guard', () => {
  it('fails closed when Morpheus.exe remains alive during overwrite install', () => {
    const guardStart = installerNsh.indexOf('Do not continue while the old UI process is still alive');
    const guardEnd = installerNsh.indexOf('!ifndef BUILD_UNINSTALLER', guardStart);
    const guard = installerNsh.slice(guardStart, guardEnd);

    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    expect(guard).toContain('Get-CimInstance -ClassName Win32_Process');
    expect(guard).toContain('tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}"');
    expect(guard).toContain('taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"');
    expect(guard).toContain('wmic process where "name=\'${APP_EXECUTABLE_FILENAME}\'" call terminate');
    expect(guard).toContain('SetErrorLevel 2');
    expect(guard).toContain('Quit');
    expect(guard).toContain('Morpheus is still running and cannot be replaced safely');
    expect(guard).not.toContain('${nsProcess::FindProcess}');
  });

  it('does not silently weaken Windows or rewrite PATH during install', () => {
    const installStart = installerNsh.indexOf('!macro customInstall');
    const installEnd = installerNsh.indexOf('!macro customUnInstall', installStart);
    const install = installerNsh.slice(installStart, installEnd);

    expect(install).not.toContain('Add-MpPreference');
    expect(install).not.toContain('Remove-MpPreference');
    expect(install).not.toContain('LongPathsEnabled');
    expect(install).not.toContain('-Action add');
    expect(install).not.toContain('WriteRegDWORD HKLM "SYSTEM\\CurrentControlSet\\Control\\FileSystem"');
  });

  it('never kills a globally named OpenClaw gateway process', () => {
    expect(installerNsh).not.toMatch(/taskkill[^\r\n]*openclaw-gateway\.exe/i);
  });

  it('cleans up only Morpheus profile data while preserving migration sources', () => {
    const uninstall = installerNsh.slice(installerNsh.indexOf('!macro customUnInstall'));

    expect(uninstall).toContain('$APPDATA\\Morpheus');
    expect(uninstall).toContain('$LOCALAPPDATA\\Morpheus');
    expect(uninstall).not.toMatch(/RMDir[^\r\n]*\\clawx/i);
    expect(uninstall).toContain('original ClawX profile will be preserved');
    expect(uninstall).toContain('-Action remove');
  });
});
