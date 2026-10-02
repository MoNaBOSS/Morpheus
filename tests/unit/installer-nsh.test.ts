import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const installer = readFileSync(join(process.cwd(), 'scripts/installer.nsh'), 'utf8');
const guard = readFileSync(join(process.cwd(), 'scripts/windows/install-guard.ps1'), 'utf8');

describe('recoverable Windows installer', () => {
  it('uses a checked file helper and fails closed instead of killing other processes', () => {
    expect(installer).toContain('-File "$PLUGINSDIR\\morpheus-install-guard.ps1"');
    expect(installer).toContain('morpheusInstallGuard Check');
    expect(installer).toContain('morpheusInstallGuard Prepare');
    expect(installer).toContain('SetErrorLevel 2');
    expect(installer).toContain('Quit');
    expect(installer).not.toMatch(/taskkill|wmic|Stop-Process|nsProcess::FindProcess/i);
    expect(guard).toContain("$prefix = $Target + '\\'");
    expect(guard).toContain('Get-CimInstance -ClassName Win32_Process');
    expect(guard).not.toMatch(/Stop-Process|Remove-Item/);
  });
  it('never deletes old installations, broad registry paths or another user profile', () => {
    expect(installer).toContain('Previous installation retained for recovery');
    expect(installer).not.toMatch(/RMDir|rd \/s|ExecShell|ProfileList|DeleteRegKey|ClawXMoveLegacyInstallDir/i);
    expect(installer).toContain('original ClawX profile will be preserved');
    expect(installer).toContain('-Action remove');
  });
  it('does not weaken system protection or silently enable CLI integration', () => {
    expect(installer).not.toMatch(/Add-MpPreference|Remove-MpPreference|LongPathsEnabled|-Action add/);
  });
  it('checks the final uninstall directory before CLI changes or inherited file removal', () => {
    const uninstall = installer.slice(installer.indexOf('!macro customUnInstall'));
    expect(uninstall).toContain('morpheusInstallGuard CheckUninstall');
    expect(uninstall.indexOf('CheckUninstall')).toBeLessThan(uninstall.indexOf('-Action remove'));
    expect(uninstall).toContain('SetErrorLevel 2');
    expect(uninstall).toContain('No files have been removed');
  });
});
