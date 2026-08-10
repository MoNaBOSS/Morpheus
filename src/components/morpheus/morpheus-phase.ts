/**
 * Presentation mapping for run phases.
 *
 * Kept separate from the components so the timeline, the audit panel and the
 * permission dialog cannot drift into showing the same phase differently.
 */
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldQuestion,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import {
  getMorpheusActionDescriptor,
  isMorpheusActionId,
} from '@shared/morpheus/actions/registry';

import type { MorpheusRunPhase } from '@shared/morpheus/action-types';
import type { BadgeProps } from '@/components/ui/badge';

export type MorpheusPhaseAppearance = {
  variant: NonNullable<BadgeProps['variant']>;
  icon: LucideIcon;
  spin?: boolean;
};

const APPEARANCE: Record<MorpheusRunPhase, MorpheusPhaseAppearance> = {
  requested: { variant: 'secondary', icon: Clock },
  'awaiting-permission': { variant: 'warning', icon: ShieldQuestion },
  running: { variant: 'default', icon: Loader2, spin: true },
  succeeded: { variant: 'success', icon: CheckCircle2 },
  denied: { variant: 'outline', icon: XCircle },
  cancelled: { variant: 'outline', icon: XCircle },
  failed: { variant: 'destructive', icon: AlertTriangle },
  'timed-out': { variant: 'destructive', icon: AlertTriangle },
  'unsupported-platform': { variant: 'outline', icon: Ban },
};

export function getMorpheusPhaseAppearance(phase: MorpheusRunPhase): MorpheusPhaseAppearance {
  return APPEARANCE[phase] ?? APPEARANCE.requested;
}

/** i18n key for a phase label. */
export function morpheusPhaseLabelKey(phase: MorpheusRunPhase): string {
  return `morpheus.phases.${phase}`;
}

/** i18n key for an action label, resolved through the shared registry ids. */
/**
 * The i18n key for a capability's label, taken from its own descriptor.
 *
 * Previously a hardcoded ternary that fell through to `systemReport` for
 * anything it did not recognise — so every capability added after the first
 * three silently rendered as "Report system information". The registry already
 * carries the key; deriving it there means a new capability cannot be
 * mislabelled by forgetting to extend a mapping.
 */
export function morpheusActionLabelKey(actionId: string): string {
  return isMorpheusActionId(actionId)
    ? getMorpheusActionDescriptor(actionId).labelKey
    : actionId;
}
