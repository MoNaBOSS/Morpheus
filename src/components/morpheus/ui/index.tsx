/**
 * Morpheus design-system primitives.
 *
 * Pages compose these; they never solve layout or colour locally. See
 * docs/design/MORPHEUS_DESIGN_SYSTEM.md for the rules these encode.
 *
 * Two of those rules matter enough to restate here, because breaking them is
 * how an honest instrument turns into a dashboard that lies:
 *
 *   1. A primitive NEVER fetches and never invents state. Data arrives via
 *      props. There are no skeletons implying data that does not exist and no
 *      greyed-out sample rows standing in for an empty list.
 *   2. Accent (green) means LIVE or VERIFIED. Risk is never green.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { MorpheusRiskTier } from '@shared/morpheus/actions/registry';
import type { ExecutionStepStatus } from '@shared/morpheus/execution-types';

/* -------------------------------------------------------------------------
 * Panel — the default container. Elevation 2, one border, no shadow.
 * ---------------------------------------------------------------------- */

export type PanelProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
};

export function Panel({ title, description, actions, children, className, testId }: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'rounded-xl border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/90 p-3 backdrop-blur-sm',
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="font-serif text-sm leading-tight text-foreground">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-tiny leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * StatusDot — semantic state. The only place accent is allowed to mean "on".
 * ---------------------------------------------------------------------- */

export type StatusTone = 'running' | 'ok' | 'warn' | 'error' | 'idle';

const TONE_CLASS: Record<StatusTone, string> = {
  running: 'bg-[hsl(var(--morpheus-accent))]',
  ok: 'bg-[hsl(var(--morpheus-accent))]',
  warn: 'bg-[hsl(var(--morpheus-warn))]',
  error: 'bg-[hsl(var(--morpheus-danger))]',
  idle: 'bg-muted-foreground/50',
};

export function StatusDot({ tone, label, testId }: { tone: StatusTone; label?: string; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId} data-tone={tone}>
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          TONE_CLASS[tone],
          // Only a genuinely running thing pulses. A completed one must be still,
          // or motion stops carrying information.
          tone === 'running' && 'motion-safe:animate-pulse',
        )}
      />
      {label && <span className="text-2xs text-muted-foreground">{label}</span>}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * RiskBadge — never green, at any tier.
 * ---------------------------------------------------------------------- */

const RISK_CLASS: Record<MorpheusRiskTier, string> = {
  low: 'border-border text-muted-foreground',
  medium: 'border-[hsl(var(--morpheus-warn))]/40 text-[hsl(var(--morpheus-warn))]',
  high: 'border-[hsl(var(--morpheus-danger))]/40 text-[hsl(var(--morpheus-danger))]',
  critical: 'border-[hsl(var(--morpheus-danger))] text-[hsl(var(--morpheus-danger))] font-medium',
};

export function RiskBadge({ tier, testId }: { tier: MorpheusRiskTier; testId?: string }) {
  return (
    <span
      data-testid={testId}
      data-risk={tier}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-px text-2xs uppercase tracking-wide',
        RISK_CLASS[tier],
      )}
    >
      {tier}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * KeyValue — aligned machine facts.
 * ---------------------------------------------------------------------- */

export function KeyValue({
  label, value, mono = false, testId,
}: { label: ReactNode; value: ReactNode; mono?: boolean; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2.5 py-1.5" data-testid={testId}>
      <span className="shrink-0 text-tiny text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 truncate text-tiny text-foreground', mono && 'font-mono text-2xs')}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * MonoPath — a real path, truncated in the middle so both ends stay readable.
 * ---------------------------------------------------------------------- */

export function MonoPath({ path, className, testId }: { path: string; className?: string; testId?: string }) {
  return (
    <span
      // The full value stays available: a truncated path the user cannot verify
      // is worse than no path, because it looks authoritative.
      title={path}
      data-testid={testId}
      data-full-path={path}
      className={cn(
        'block truncate rounded bg-[hsl(var(--morpheus-surface-3))] px-1.5 py-0.5 font-mono text-2xs text-foreground',
        className,
      )}
      dir="rtl"
    >
      <bdi>{path}</bdi>
    </span>
  );
}

/* -------------------------------------------------------------------------
 * EmptyState — honest. Never a placeholder implying data.
 * ---------------------------------------------------------------------- */

export function EmptyState({ message, hint, testId }: { message: string; hint?: string; testId?: string }) {
  return (
    <div className="px-2.5 py-6 text-center" data-testid={testId}>
      <p className="text-tiny text-muted-foreground">{message}</p>
      {hint && <p className="mt-1 text-2xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function SectionHeading({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <h3
      data-testid={testId}
      className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </h3>
  );
}

/* -------------------------------------------------------------------------
 * PlanTimeline — ordered steps with dependency, status and duration.
 * ---------------------------------------------------------------------- */

/** Maps a step status onto a dot tone. `skipped` is idle, not error. */
export function toneForStepStatus(status: ExecutionStepStatus): StatusTone {
  switch (status) {
    case 'running': return 'running';
    case 'succeeded': return 'ok';
    case 'failed': return 'error';
    case 'denied': return 'error';
    // Skipped and cancelled steps never ran. Colouring them as failures would
    // claim something broke when nothing did.
    case 'skipped':
    case 'cancelled':
    case 'pending':
    default: return 'idle';
  }
}

export type PlanTimelineStep = {
  stepId: string;
  status: ExecutionStepStatus;
  summary: string;
  dependsOn?: readonly string[];
  durationMs?: number;
  detail?: string;
};

export function PlanTimeline({
  steps, emptyMessage, testId,
}: { steps: readonly PlanTimelineStep[]; emptyMessage: string; testId?: string }) {
  if (steps.length === 0) return <EmptyState message={emptyMessage} testId={testId} />;

  return (
    <ol className="space-y-0.5" data-testid={testId}>
      {steps.map((step, index) => {
        const tone = toneForStepStatus(step.status);
        return (
        <li
          key={step.stepId}
          data-testid={`plan-step-${step.stepId}`}
          data-status={step.status}
          className="group relative flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-[hsl(var(--morpheus-surface-3))]/75"
        >
          {index < steps.length - 1 ? (
            <span aria-hidden className="absolute bottom-[-5px] left-[18px] top-7 w-px bg-border/70" />
          ) : null}
          <span
            data-tone={tone}
            className={cn(
              'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-[hsl(var(--morpheus-surface-2))] font-mono text-[9px] text-muted-foreground',
              tone === 'ok' && 'border-[hsl(var(--morpheus-accent-dim))] text-[hsl(var(--morpheus-accent))]',
              tone === 'running' && 'border-[hsl(var(--morpheus-accent))] text-[hsl(var(--morpheus-accent))] shadow-[0_0_12px_hsl(var(--morpheus-glow))]',
              tone === 'error' && 'border-[hsl(var(--morpheus-danger))]/60 text-[hsl(var(--morpheus-danger))]',
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-tiny font-medium text-foreground/90">{step.summary}</span>
              {typeof step.durationMs === 'number' && (
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {step.durationMs}ms
                </span>
              )}
            </div>
            {step.detail && (
              <p className="mt-0.5 text-2xs text-muted-foreground">{step.detail}</p>
            )}
            {step.dependsOn && step.dependsOn.length > 0 && (
              <p className="mt-0.5 font-mono text-2xs text-muted-foreground/70">
                after {step.dependsOn.join(', ')}
              </p>
            )}
          </div>
        </li>
        );
      })}
    </ol>
  );
}
