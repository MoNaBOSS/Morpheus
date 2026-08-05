/**
 * Morpheus update-feed policy.
 *
 * Morpheus inherited ClawX's auto-update configuration (Alibaba OSS plus the
 * ValueCell-ai/ClawX GitHub releases). That feed must never be used: the two
 * products no longer share an application id, a user-data location or an
 * upgrade path, so installing a ClawX release over Morpheus would replace the
 * application with a different one.
 *
 * Until a real Morpheus endpoint exists, the updater is never initialised and
 * the interface reports "not configured" — an honest state — rather than a
 * broken updater that errors on every check.
 *
 * To enable updates later:
 *   1. add a Morpheus provider entry to `publish:` in electron-builder.yml;
 *   2. set MORPHEUS_UPDATE_FEED here to that endpoint;
 *   3. the guards below unlock automatically.
 *
 * See docs/releases/0.1.1-ACCEPTANCE.md §2.9-2.10.
 */

/**
 * Morpheus update endpoint. `null` until a real one is published.
 *
 * Must never point at an intelli-spectrum.com or ValueCell-ai/ClawX URL.
 */
export const MORPHEUS_UPDATE_FEED: string | null = null;

/** Hosts and repositories that must never serve a Morpheus update. */
const FORBIDDEN_FEED_PATTERNS = [
  /oss\.intelli-spectrum\.com/i,
  /ValueCell-ai/i,
  /[/\\]clawx(?:[/\\]|$)/i,
];

export type UpdateConfigurationState =
  | { configured: false; reason: 'not-configured' }
  | { configured: false; reason: 'rejected-inherited-feed' }
  | { configured: true; feedUrl: string };

export function isForbiddenUpdateFeed(url: string): boolean {
  return FORBIDDEN_FEED_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Resolves whether auto-update may initialise at all.
 *
 * The forbidden-feed check is deliberately applied to whatever is configured,
 * not only to the default: a future edit that points Morpheus back at a ClawX
 * feed is rejected here rather than shipping.
 */
export function resolveUpdateConfiguration(
  feed: string | null = MORPHEUS_UPDATE_FEED,
): UpdateConfigurationState {
  if (!feed || !feed.trim()) return { configured: false, reason: 'not-configured' };
  if (isForbiddenUpdateFeed(feed)) return { configured: false, reason: 'rejected-inherited-feed' };
  return { configured: true, feedUrl: feed };
}

export function isUpdateFeedConfigured(): boolean {
  return resolveUpdateConfiguration().configured;
}
