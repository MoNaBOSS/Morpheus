const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export const PROFILES = {
  fast: [
    { name: 'Generate extension bridge', command: pnpmCommand, args: ['run', 'ext:bridge'] },
    { name: 'Lint without autofix', command: pnpmCommand, args: ['run', 'lint:check'] },
    { name: 'Typecheck', command: pnpmCommand, args: ['run', 'typecheck'] },
    { name: 'Unit tests', command: pnpmCommand, args: ['test'] },
  ],
  comms: [
    { name: 'Comms replay', command: pnpmCommand, args: ['run', 'comms:replay'] },
    { name: 'Comms compare', command: pnpmCommand, args: ['run', 'comms:compare'] },
  ],
  e2e: [
    { name: 'Electron E2E', command: pnpmCommand, args: ['run', 'test:e2e'] },
  ],
};

export function selectSteps(requiredProfiles) {
  const selected = [];
  const seen = new Set();
  for (const profile of requiredProfiles) {
    for (const step of PROFILES[profile] ?? []) {
      const key = `${step.command} ${step.args.join(' ')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push({ profile, ...step });
    }
  }
  return selected;
}
