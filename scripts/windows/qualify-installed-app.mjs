/**
 * Destructive installation qualification, ONLY on a clean GitHub-hosted Windows VM.
 * Never set these guards locally to test an installer. The physical owner's host,
 * account, profiles and existing installation are outside this script's scope.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guid = '158f2966-6054-565d-9971-03340e4f42d9'; // NSIS UUID v5 of app.morpheus.desktop.
const product = 'Morpheus';
const assertInside = (root, path) => {
  const child = relative(root, path);
  assert(child && !child.startsWith('..') && !isAbsolute(child), `Outside owned root: ${path}`);
};
// Fail before creating evidence, directories, launching PowerShell or changing anything.
assert.equal(process.platform, 'win32', 'Windows hosted runner required');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'GitHub Actions required; never run locally');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Disposable GitHub-hosted runner required');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.equal(process.env.USERNAME?.toLowerCase(), 'runneradmin', 'Clean hosted runner account required');
assert(process.env.RUNNER_TEMP && process.env.GITHUB_WORKSPACE, 'Runner paths required');
const runnerTemp = await realpath(resolve(process.env.RUNNER_TEMP));
assert(isAbsolute(runnerTemp) && dirname(runnerTemp) !== runnerTemp && !/\s/.test(runnerTemp), 'Unsafe runner temp');
assert.equal((await realpath(source)).toLowerCase(), (await realpath(process.env.GITHUB_WORKSPACE)).toLowerCase(), 'Checkout mismatch');
const root = join(runnerTemp, 'morpheus-installer-qualification');
const install = join(root, 'install');
const evidence = join(root, 'evidence');
assertInside(runnerTemp, root); assertInside(root, install); assertInside(root, evidence);
assert(!existsSync(root), 'Qualification directory already exists; refuse reuse');
for (let path = runnerTemp; ; path = dirname(path)) {
  assert(!(await lstat(path)).isSymbolicLink(), `Reparse/symbolic ancestor: ${path}`);
  if (dirname(path) === path) break;
}
const powershell = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000,
}).trim();
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
const registrations = () => JSON.parse(powershell(`
  $ErrorActionPreference='Stop'
  $found=@()
  foreach($hive in @('HKCU:\\Software','HKLM:\\Software','HKLM:\\Software\\WOW6432Node')) {
    $productKey=Join-Path $hive '${guid}'
    if(Test-Path -LiteralPath $productKey) { $found+=@{kind='install';key=$productKey} }
    $uninstall=Join-Path $hive 'Microsoft\\Windows\\CurrentVersion\\Uninstall'
    if(Test-Path -LiteralPath $uninstall) {
      foreach($key in Get-ChildItem -LiteralPath $uninstall) {
        $value=Get-ItemProperty -LiteralPath $key.PSPath
        if($value.DisplayName -match '^Morpheus($|\\s)' -or $key.PSChildName -eq '${guid}' -or $key.PSChildName -eq '{${guid}}') {
          $found+=@{kind='uninstall';key=$key.Name;location=$value.InstallLocation;version=$value.DisplayVersion;command=$value.UninstallString}
        }
      }
    }
  }
  ConvertTo-Json -InputObject @($found) -Compress
`));
const machine = JSON.parse(powershell(`
  $computer=Get-CimInstance Win32_ComputerSystem
  if(-not $computer.HypervisorPresent -or $computer.Model -notmatch 'Virtual Machine|VirtualBox|VMware Virtual Platform|KVM') { throw 'A disposable virtual machine is required' }
  $running=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^Morpheus(\\.exe)?$' })
  if($running.Count) { throw 'An existing Morpheus process was found' }
  $startup=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name Morpheus -ErrorAction SilentlyContinue
  if($startup.Morpheus) { throw 'An existing Morpheus startup registration was found' }
  @{model=$computer.Model;hypervisor=$computer.HypervisorPresent;desktop=[Environment]::GetFolderPath('DesktopDirectory')} | ConvertTo-Json -Compress
`));
assert.deepEqual(registrations(), [], 'Existing Morpheus registration; refuse installation');
const runnerHome = homedir();
const defaultUserData = join(process.env.APPDATA, 'morpheus');
const defaultState = join(runnerHome, '.openclaw');
const shortcuts = [join(machine.desktop, `${product}.lnk`), join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs', `${product}.lnk`)];
for (const path of [defaultUserData, join(process.env.APPDATA, 'ClawX'), join(process.env.LOCALAPPDATA, 'Programs/Morpheus'),
  join(process.env.ProgramFiles, 'Morpheus'), ...shortcuts]) assert(!existsSync(path), `Existing product data/install/shortcut: ${path}`);
assert.equal(runnerHome.toLowerCase(), resolve(process.env.USERPROFILE).toLowerCase());
assert(!/[\\/]monir(?:[\\/]|$)/i.test(runnerHome), 'Owner profile is forbidden');
// The build or hosted image may have its own OpenClaw state. Preserve it and
// qualify the installed application with a fresh normal profile, without E2E mode.
const userHome = join(root, 'runtime-profile/home');
const roaming = join(userHome, 'AppData/Roaming');
const local = join(userHome, 'AppData/Local');
const userData = join(roaming, 'morpheus');
const state = join(userHome, '.openclaw');
for (const path of [userHome, userData, state]) { assertInside(root, path); assert(!existsSync(path), `Runtime profile already exists: ${path}`); }

await mkdir(evidence, { recursive: true });
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const installer = join(source, 'release', `Morpheus-${pkg.version}-win-x64.exe`);
const unpacked = join(source, 'release/win-unpacked');
const digest = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
const record = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  version: pkg.version, machine, installer: { path: installer, sha256: await digest(installer) },
  scope: 'Actual unsigned x64 NSIS install, installed normal runtime with an isolated synthetic profile, same-version reinstall and default uninstall on a clean disposable hosted Windows VM.',
  runtimeProfile: { mode: 'Normal application; E2E unset; fresh HOME and AppData beneath guarded RUNNER_TEMP', home: userHome, userData, state },
  installerEnvironment: 'Normal disposable runner; real per-user registration and shortcuts',
  defaultState: { path: defaultState, existedBefore: existsSync(defaultState), handling: 'Preserved; no reads, writes or deletion' },
  exclusions: ['Previous-version upgrade', 'Owner installation/profile', 'Physical microphone/audio/wake', 'SmartScreen or interactive UAC', 'Signing, hosted accounts, live provider or payment'],
  checks: {}, runs: [], errors: [],
};
const persist = () => writeFile(join(evidence, 'installed-app-qualification.json'), `${JSON.stringify(record, null, 2)}\n`);
const waitUntil = async (probe, description, timeout = 60_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await probe()) return; await new Promise((done) => setTimeout(done, 500)); }
  throw new Error(`Timed out: ${description}`);
};
const run = async (exe, args, stage, timeout = 240_000) => {
  const started = Date.now(); const result = { stage, args, startedAt: new Date().toISOString() };
  record.runs.push(result); await persist();
  result.exitCode = await new Promise((done, fail) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (part) => chunks.push(part)); child.stderr.on('data', (part) => chunks.push(part));
    const timer = setTimeout(() => { child.kill(); fail(new Error(`${stage} timed out (owned child ${child.pid})`)); }, timeout);
    child.once('error', (error) => { clearTimeout(timer); fail(error); });
    child.once('close', (code) => {
      clearTimeout(timer); result.durationMs = Date.now() - started;
      writeFile(join(evidence, `${stage}.log`), Buffer.concat(chunks)).then(() => done(code), fail);
    });
  });
  assert.equal(result.exitCode, 0, `${stage} failed; inspect qualification JSON and ${stage}.log`);
};
const selectedFiles = ['Morpheus.exe', 'resources/app.asar', 'resources/resources/morpheus-orb/motion.css',
  'resources/resources/local-voice/manifest.json', 'resources/resources/local-voice/bin/sherpa-onnx-offline.exe',
  'resources/resources/local-voice/bin/sherpa-onnx-offline-tts.exe', 'resources/resources/local-voice/whisper/tiny.en-encoder.int8.onnx',
  'resources/resources/local-voice/whisper/tiny.en-decoder.int8.onnx', 'resources/resources/local-voice/kokoro/model.int8.onnx',
  'resources/resources/local-voice/kokoro/voices.bin',
  'resources/resources/local-voice/worker/morpheus-tts-worker.cjs',
  'resources/resources/local-voice/worker/node_modules/sherpa-onnx-node/non-streaming-tts.js',
  'resources/resources/local-voice/worker/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node',
  'resources/resources/local-voice/worker/node_modules/sherpa-onnx-win-x64/sherpa-onnx-c-api.dll',
  'resources/resources/local-voice/worker/node_modules/sherpa-onnx-win-x64/onnxruntime.dll'];
const verifyPayload = async () => {
  const hashes = {};
  for (const file of selectedFiles) { hashes[file] = await digest(join(install, file)); assert.equal(hashes[file], await digest(join(unpacked, file)), `Installed payload mismatch: ${file}`); }
  return hashes;
};
const port = async () => {
  const server = createServer(); await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const value = server.address().port; await new Promise((done) => server.close(done)); return value;
};
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(SECRET|TOKEN|PASSWORD|API_KEY|AUTH)/i.test(key) && !/^(CLAWX_|OPENCLAW_|MORPHEUS_|VITE_)/.test(key)));
Object.assign(env, { HOME: userHome, USERPROFILE: userHome, APPDATA: roaming, LOCALAPPDATA: local,
  XDG_CONFIG_HOME: join(userHome, '.config'), OPENCLAW_HOME: userHome, OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: join(state, 'openclaw.json'),
  CLAWX_PORT_CLAWX_HOST_API: String(await port()), CLAWX_PORT_OPENCLAW_GATEWAY: String(await port()) });
let active;
const runtime = async (returning) => {
  const { _electron, expect } = await import('@playwright/test');
  active = await _electron.launch({ executablePath: join(install, 'Morpheus.exe'), args: ['--lang=en-US'], env, timeout: 90_000 });
  let page = await active.firstWindow(); await page.waitForLoadState('domcontentloaded');
  await waitUntil(async () => {
    for (const candidate of active.windows()) { if (await candidate.title() === 'Morpheus') { page = candidate; return true; } }
    return false;
  }, 'Main application window');
  const identity = await active.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), executable: process.execPath,
    userData: app.getPath('userData'), home: process.mainModule.require('node:os').homedir(), state: process.env.OPENCLAW_STATE_DIR,
    e2e: process.env.CLAWX_E2E || null }));
  assert(identity.packaged && !identity.e2e, 'Installed normal application required'); assert.equal(identity.version, pkg.version);
  assert.equal(identity.executable.toLowerCase(), join(install, 'Morpheus.exe').toLowerCase());
  assert.equal(identity.userData.toLowerCase(), userData.toLowerCase());
  assert.equal(identity.home.toLowerCase(), userHome.toLowerCase());
  assert.equal(identity.state.toLowerCase(), state.toLowerCase());
  const invoke = (module, action, payload) => page.evaluate(async ({ module, action, payload }) => {
    const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module, action, ...(payload === undefined ? {} : { payload }) });
    if (!response.ok) throw new Error(response.error?.message || `Host request failed: ${module}.${action}`);
    return response.data;
  }, { module, action, payload });
  await expect.poll(async () => (await invoke('gateway', 'status')).state, { timeout: 120_000 }).toBe('running');
  const voice = await invoke('morpheus', 'voiceStatus');
  assert(voice.neuralSpeechAvailable && voice.speechFormat === 'pcm24' && voice.settings.engine === 'local', 'Included speech readiness failed');
  assert.equal(voice.transcriptionAvailable, !returning, 'Transcription availability must honor persisted manual microphone mute');
  const providerId = 'installed-qualification-openrouter';
  const providerModel = 'fixture/installed-qualification';
  let protectedProvider;
  if (!returning) {
    assert.equal((await invoke('providers', 'accounts')).length, 0, 'No task/voice account may be needed for readiness');
    await expect(page.getByTestId('activation-intro-name')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('activation-intro-name').fill('CI Companion'); await page.getByTestId('activation-intro-name').press('Enter');
    await expect(page.getByTestId('activation-setup-connections')).toBeVisible(); await page.getByTestId('activation-setup-continue').click();
    await expect(page.getByTestId('activation-setup-voice')).toBeVisible(); await page.getByTestId('activation-setup-continue').click();
    await page.getByTestId('activation-spoken-replies').uncheck(); await page.getByTestId('morpheus-activation-finish').click();
    await page.getByTestId('activation-first-request').fill('Show system information'); await page.getByTestId('activation-first-request').press('Enter');
    await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
    await expect.poll(async () => Object.values((await invoke('morpheus', 'objectiveSnapshot')).runsById).find((entry) => entry.objective === 'Show system information')?.state, { timeout: 30_000 }).toBe('complete');
    // Real installed Main and running owned Gateway, with an unmistakably fake
    // credential confined to this disposable profile. No validation/inference
    // request is sent. This exercises config/SecretRef/env delivery hidden by
    // stopped-service fixtures, then preserves the account through reinstall.
    const now = new Date().toISOString();
    const saved = await invoke('providers', 'createAccount', {
      account: { id: providerId, vendorId: 'openrouter', label: 'Synthetic installed qualification',
        authMode: 'api_key', model: providerModel, enabled: true, isDefault: false,
        createdAt: now, updatedAt: now }, apiKey: 'synthetic-installed-qualification-no-real-service-access',
    });
    assert.equal(saved.success, true, `Running installed provider save failed: ${String(saved.error || '')}`);
    await expect.poll(async () => (await invoke('gateway', 'status')).state, { timeout: 120_000 }).toBe('running');
    const selected = await invoke('providers', 'setDefaultAccount', { accountId: providerId });
    assert.equal(selected.success, true, `Installed default selection failed: ${String(selected.error || '')}`);
    protectedProvider = { accountId: providerId, model: providerModel, savedWhileRunning: true, noServiceRequest: true };
  } else {
    await active.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show());
    const onboarding = await invoke('morpheus', 'onboardingStatus');
    assert(onboarding.completed && onboarding.preferences.preferredName === 'CI Companion', 'Onboarding persistence failed');
    assert.equal(onboarding.preferences.personality, record.checks.firstInstalledRuntime.personality, 'Personality persistence failed');
    assert.equal(voice.settings.enabled, false, 'Manual microphone mute did not persist');
    assert.equal(voice.settings.ambientEnabled, false, 'Ambient microphone state did not persist');
    await expect(page.getByTestId('morpheus-activation')).toHaveCount(0);
    protectedProvider = { accountId: providerId, model: providerModel, retainedThroughReinstall: true, noServiceRequest: true };
  }
  const accounts = await invoke('providers', 'accounts');
  assert.equal(accounts.length, 1, 'Synthetic provider count changed');
  assert.equal(accounts[0].id, providerId); assert.equal(accounts[0].model, providerModel);
  assert.equal((await invoke('providers', 'getDefaultAccount')).accountId, providerId);
  assert.equal(await invoke('providers', 'hasAccountApiKey', { accountId: providerId }), true);
  protectedProvider.keyPresent = true;
  if (await page.getByTestId('quick-command-expand').isVisible()) await page.getByTestId('quick-command-expand').click();
  await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
  await page.getByTestId('morpheus-command-input').fill('Keep this draft through settings');
  await page.getByTestId('sidebar-nav-settings').click(); await page.getByTestId('morpheus-settings-voice').click();
  await expect(page.getByTestId('morpheus-microphone-device')).toBeVisible(); await expect(page.getByTestId('morpheus-voice-preview')).toBeVisible();
  await page.getByTestId('morpheus-settings-return').click(); await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep this draft through settings');
  await page.getByTestId('sidebar-nav-settings').click(); await page.getByTestId('morpheus-settings-advanced').click();
  await page.getByTestId('morpheus-advanced-chat').click(); await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await page.screenshot({ path: join(evidence, returning ? 'reinstalled-advanced.png' : 'installed-advanced.png') });
  await invoke('morpheus', 'updateVoiceSettings', { enabled: false, speakResponses: false, ambientEnabled: false });
  const onboarding = await invoke('morpheus', 'onboardingStatus');
  await invoke('gateway', 'stop'); await expect.poll(async () => (await invoke('gateway', 'status')).state).toBe('stopped');
  await active.close(); active = undefined;
  await waitUntil(() => JSON.parse(powershell(`ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith(${quote(`${install}\\`)}, [StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId) -Compress`)).length === 0, 'Installed process shutdown');
  return { identity, includedVoiceReadyWithoutAccount: true, microphoneTested: false, audiblePlaybackTested: false, navigationAndDraft: true, advancedAvailable: true, personality: onboarding.preferences.personality, protectedProvider };
};
try {
  await run(installer, ['/S', '/currentuser', `/D=${install}`], 'install');
  record.checks.installedHashes = await verifyPayload(); record.checks.installRegistration = registrations();
  assert(record.checks.installRegistration.some((entry) => entry.kind === 'uninstall' && entry.version === pkg.version), 'Uninstall registration missing');
  assert(shortcuts.every(existsSync), 'Installed shortcuts missing');
  for (const path of [userData, local, env.XDG_CONFIG_HOME]) await mkdir(path, { recursive: true });
  await writeFile(join(userData, 'settings.json'), JSON.stringify({ language: 'en', telemetryEnabled: false, launchAtStartup: false, gatewayAutoStart: true, autoCheckUpdate: false, startMinimized: false, gatewayPort: Number(env.CLAWX_PORT_OPENCLAW_GATEWAY) }));
  record.checks.firstInstalledRuntime = await runtime(false); await persist();
  // The default-AppData sentinel additionally verifies real NSIS profile retention.
  // It is newly created synthetic data, not a copy of any existing guest profile.
  const markers = [join(userData, 'morpheus/qualification-marker.json'), join(state, 'qualification-marker.json'),
    join(defaultUserData, 'qualification-marker.json')];
  record.profileMarkers = markers;
  for (const path of markers) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, '{"synthetic":true,"keep":"same-version reinstall and default uninstall"}\n'); }
  const markerHashes = await Promise.all(markers.map(digest));
  await run(installer, ['/S', '/currentuser', `/D=${install}`], 'same-version-reinstall');
  assert.deepEqual(await Promise.all(markers.map(digest)), markerHashes, 'Profile bytes changed during reinstall');
  record.checks.reinstalledHashes = await verifyPayload();
  const backups = (await readdir(root)).filter((name) => /^install\._rollback_\d+$/.test(name));
  assert.equal(backups.length, 1, 'Recoverable previous installation missing');
  assert.equal(await digest(join(root, backups[0], 'resources/app.asar')), record.checks.installedHashes['resources/app.asar']);
  record.checks.sameVersionReinstallPreservedMarkersAndRollback = true;
  record.checks.returningInstalledRuntime = await runtime(true); await persist();
  const uninstaller = (await readdir(install)).find((name) => /^Uninstall Morpheus\.exe$/i.test(name));
  assert(uninstaller, 'Actual installed uninstaller missing');
  const copiedUninstaller = join(root, 'qualification-uninstaller.exe'); await copyFile(join(install, uninstaller), copiedUninstaller);
  await run(copiedUninstaller, ['/S', `_?=${install}`], 'uninstall');
  await waitUntil(() => !existsSync(join(install, 'Morpheus.exe')), 'Uninstaller removes installed binaries');
  assert.deepEqual(registrations(), [], 'Uninstall registration remains');
  assert(shortcuts.every((path) => !existsSync(path)), 'Uninstall left product shortcuts');
  assert.deepEqual(await Promise.all(markers.map(digest)), markerHashes, 'Default uninstall erased profile bytes');
  assert(existsSync(join(root, backups[0], 'resources/app.asar')), 'Default uninstall erased rollback');
  record.checks.defaultUninstallPreservedProfilesAndRollback = true;
} catch (error) {
  record.errors.push(String(error)); process.exitCode = 1;
} finally {
  if (active) await active.close().catch((error) => record.errors.push(`Owned application close: ${error}`));
  await persist(); console.log(JSON.stringify(record, null, 2));
}
