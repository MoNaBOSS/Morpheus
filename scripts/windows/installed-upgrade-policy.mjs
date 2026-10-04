/** Baseline provenance is public metadata, never an owner profile or credential. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const semver = builderRequire('semver');

export const QUALIFIED_BASELINE_SOURCE = '49b0feed7462ddefe6a9b5f50a740b4539c52389';
export const QUALIFIED_BASELINE_VERSION = '1.2.0-preview.13';
export const QUALIFIED_BASELINE_INSTALLER = `Morpheus-${QUALIFIED_BASELINE_VERSION}-win-x64.exe`;

export function assertUpgradeBaseline(metadata, candidateVersion, actualInstallerSha256) {
  if (metadata?.source !== QUALIFIED_BASELINE_SOURCE || metadata?.version !== QUALIFIED_BASELINE_VERSION
    || metadata?.name !== 'morpheus' || metadata?.appId !== 'app.morpheus.desktop'
    || metadata?.installerName !== QUALIFIED_BASELINE_INSTALLER || metadata?.trackedClean !== true) {
    throw new Error('Previous-version installer is not the pinned clean Morpheus baseline.');
  }
  for (const name of ['installerSha256', 'applicationSha256', 'applicationArchiveSha256']) {
    if (typeof metadata[name] !== 'string' || !/^[0-9a-f]{64}$/i.test(metadata[name])) throw new Error('Baseline byte provenance is incomplete.');
  }
  if (metadata.installerSha256.toLowerCase() !== actualInstallerSha256?.toLowerCase()) throw new Error('Baseline installer byte identity mismatch.');
  if (!semver.valid(candidateVersion) || !semver.gt(candidateVersion, metadata.version)) throw new Error('Upgrade candidate must be newer than the pinned baseline.');
  return metadata;
}

export function assertRetainedUpgradeState(previous, current) {
  if (!previous || !current || typeof previous.account?.id !== 'string' || !previous.account.id
    || typeof previous.account.model !== 'string' || !previous.account.model || !previous.memory?.memoryId
    || typeof previous.memory.text !== 'string' || !previous.coreRunId || previous.keyPresent !== true
    || previous.preferredName !== current.preferredName || previous.personality !== current.personality
    || current.microphoneEnabled !== false || current.ambientEnabled !== false
    || previous.account?.id !== current.account?.id || previous.account?.model !== current.account?.model
    || previous.defaultAccountId !== current.defaultAccountId || current.keyPresent !== true
    || previous.memory?.memoryId !== current.memory?.memoryId || previous.memory?.text !== current.memory?.text
    || previous.memory?.title !== current.memory?.title || current.coreRunId !== previous.coreRunId
    || ['vendorId', 'label', 'authMode', 'enabled', 'baseUrl', 'apiProtocol'].some((field) => previous.account[field] !== current.account?.[field])
    || ['kind', 'sensitivity', 'providerUse', 'enabled'].some((field) => previous.memory[field] !== current.memory?.[field])) {
    throw new Error('Previous-version protected account, preferences, memory or Core history were not retained.');
  }
}

export function assertInstalledProviderModel(actualModel, fixtureModel, { baseline = false, returning = false, previousModel } = {}) {
  // Preview.13 persisted its full runtime reference when listing the selected
  // account. Later versions retain that saved value instead of rewriting it.
  const baselineModel = `openrouter/${fixtureModel}`;
  if (returning && previousModel !== fixtureModel && previousModel !== baselineModel) {
    throw new Error('Prior installed provider model is not the qualified fixture.');
  }
  const expected = returning ? previousModel : baseline ? baselineModel : fixtureModel;
  if (actualModel !== expected) throw new Error('Installed provider model does not match its saved qualification state.');
}
