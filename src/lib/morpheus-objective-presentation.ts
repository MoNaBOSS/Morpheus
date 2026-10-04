import { MORPHEUS_APPLICATIONS } from '@shared/morpheus/actions/registry';
import { isObjectiveTerminalState, type MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';

type Translate = (key: string, values?: Record<string, string | number>) => string;
type SimpleActionOutcome = { kind: 'website'; target: string } | { kind: 'application'; labelKey: string | null };
const LEGACY_UNINTERPRETED_COMMAND = /^I could not safely turn that objective into an execution plan\. Currently supported capabilities: [a-z][a-zA-Z0-9.]*?(?:, [a-z][a-zA-Z0-9.]*)*\.$/;

const SITE_NAMES: Readonly<Record<string, string>> = {
  'youtube.com': 'YouTube', 'www.youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music',
  'github.com': 'GitHub', 'www.github.com': 'GitHub', 'mail.google.com': 'Gmail',
  'google.com': 'Google', 'www.google.com': 'Google',
  'instagram.com': 'Instagram', 'www.instagram.com': 'Instagram',
};

/** Compact only an observed one-step success, never a guess based on the request. */
export function morpheusSimpleActionOutcome(run: MorpheusObjectiveRun | null): SimpleActionOutcome | null {
  if (!run || run.state !== 'complete' || run.error || run.clarification || run.corrections.length
    || run.observations.length !== 1 || run.artifacts.length !== 1) return null;
  const observation = run.observations[0];
  if (observation.status !== 'completed' || observation.steps.length !== 1) return null;
  const step = observation.steps[0];
  const artifact = run.artifacts[0];
  if (step.status !== 'succeeded' || step.artifactIds.length !== 1 || step.artifactIds[0] !== artifact.artifactId) return null;
  if (step.capabilityId === 'web.openUrl' && artifact.kind === 'report'
    && Object.keys(artifact.data).length === 1 && typeof artifact.data.origin === 'string') {
    try {
      const url = new URL(artifact.data.origin);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      return { kind: 'website', target: SITE_NAMES[url.hostname] ?? url.hostname };
    } catch { return null; }
  }
  if (step.capabilityId === 'app.launch' && artifact.kind === 'process') {
    // The durable process artifact contains the Main-verified executable, not
    // an application label. Match only compiled identities; never show its path.
    const basename = artifact.executablePath.split(/[\\/]/).at(-1)?.toLowerCase();
    const application = Object.values(MORPHEUS_APPLICATIONS).find((entry) => entry.fileName.toLowerCase() === basename);
    return { kind: 'application', labelKey: application?.labelKey.replace(/^dashboard:/, '') ?? null };
  }
  return null;
}

/** The real orb and Stop control suffice while a bounded simple action runs. */
export function morpheusQuietSimpleAction(run: MorpheusObjectiveRun, plan?: ExecutionPlan | null): boolean {
  return !isObjectiveTerminalState(run.state) && run.state !== 'waiting-for-approval'
    && !run.error && !run.clarification && !run.corrections.length && run.planIds.length === 1
    && plan?.planId === run.planIds[0] && plan.plannedBy === 'deterministic'
    && plan.steps.length === 1 && ['web.openUrl', 'app.launch'].includes(plan.steps[0].capabilityId);
}

/** One message projection for compact, expanded and spoken task outcomes. */
export function morpheusObjectiveMessage(run: MorpheusObjectiveRun, t: Translate, plan?: ExecutionPlan | null): string | null {
  if (run.clarification) return LEGACY_UNINTERPRETED_COMMAND.test(run.clarification)
    ? t('morpheus.actionOutcome.rephraseCommand') : run.clarification;
  if (run.error) return run.error.message;
  if (run.state === 'waiting-for-approval') return run.summary ?? t('morpheus.objective.states.waiting-for-approval');
  const outcome = morpheusSimpleActionOutcome(run);
  if (outcome?.kind === 'website') return t('morpheus.actionOutcome.openedWebsite', { target: outcome.target });
  if (outcome?.kind === 'application') return outcome.labelKey
    ? t('morpheus.actionOutcome.openedApplication', { target: t(outcome.labelKey) })
    : t('morpheus.actionOutcome.applicationOpened');
  if (morpheusQuietSimpleAction(run, plan)) return null;
  // Admission precedes the validated plan. Avoid flashing generic planning
  // chatter during that gap; real questions and approval always remain visible.
  if (!isObjectiveTerminalState(run.state) && !run.summary) return null;
  // Core's historical fallback remains durable evidence. Translate its known
  // fixed copy here without replacing provider-authored or richer summaries.
  if (run.state === 'complete' && run.summary === 'Done. Your result is ready.') return t('morpheus.actionOutcome.resultReady');
  if (run.state === 'complete' && run.summary === 'Done.') return t('morpheus.actionOutcome.completed');
  return run.summary ?? t(isObjectiveTerminalState(run.state) ? `morpheus.objective.states.${run.state}` : 'morpheus.workspace.working');
}
