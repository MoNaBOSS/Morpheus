/** Factual, inspectable attention derived from durable Morpheus state. */
export const MORPHEUS_PROACTIVE_VERSION = 1 as const;

export type MorpheusAttentionSource = 'mission' | 'goal' | 'schedule' | 'routine' | 'reminder';
export type MorpheusAttentionSeverity = 'info' | 'attention' | 'urgent';
export type MorpheusAttentionStatus = 'open' | 'snoozed' | 'dismissed' | 'acted';
export type MorpheusAttentionPresentationKey =
  | 'mission-needs-input'
  | 'mission-failed'
  | 'goal-overdue'
  | 'goal-due'
  | 'schedule-failed'
  | 'routine-candidate'
  | 'reminder';

export type MorpheusAttentionItem = {
  v: typeof MORPHEUS_PROACTIVE_VERSION;
  attentionId: string;
  sourceType: MorpheusAttentionSource;
  sourceId: string;
  sourceFingerprint: string;
  presentationKey: MorpheusAttentionPresentationKey;
  title: string;
  detail: string;
  severity: MorpheusAttentionSeverity;
  status: MorpheusAttentionStatus;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  snoozedUntil?: string;
  lastNotifiedAt?: string;
  suggestedObjective?: string;
};

export type MorpheusProactiveSettings = {
  v: typeof MORPHEUS_PROACTIVE_VERSION;
  enabled: boolean;
  notificationsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  categories: Readonly<Record<MorpheusAttentionSource, boolean>>;
};

export type MorpheusProactiveSettingsPatch = Partial<Omit<MorpheusProactiveSettings, 'v' | 'categories'>> & {
  categories?: Partial<MorpheusProactiveSettings['categories']>;
};

export type MorpheusProactiveSnapshot = {
  settings: MorpheusProactiveSettings;
  items: readonly MorpheusAttentionItem[];
  generatedAt: string;
};

export type CreateMorpheusReminderPayload = {
  title: string;
  detail: string;
  dueAt: string;
  suggestedObjective?: string;
};

export type MorpheusAttentionIdPayload = { attentionId: string };
export type SnoozeMorpheusAttentionPayload = MorpheusAttentionIdPayload & { until: string };

export function isMorpheusAttentionId(value: unknown): value is string {
  return typeof value === 'string' && /^attention-[a-z0-9][a-z0-9-]{0,95}$/i.test(value);
}
