/**
 * Provider compatibility shared by Main and the Renderer.
 *
 * This answers only whether Morpheus Core understands the account's planning
 * protocol. Credential presence remains Main-owned and is projected to the
 * Renderer only as a boolean key status.
 */
export const MORPHEUS_PLANNER_PROTOCOLS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'ollama',
] as const;

export type MorpheusPlannerProtocol = (typeof MORPHEUS_PLANNER_PROTOCOLS)[number];

export type MorpheusPlannerProviderShape = {
  vendorId?: string;
  apiProtocol?: string;
  authMode?: string;
};

export function morpheusPlannerProtocolFor(
  account: MorpheusPlannerProviderShape,
): MorpheusPlannerProtocol | null {
  const configured = account.apiProtocol
    ?? (account.vendorId === 'openai' ? 'openai-responses'
      : account.vendorId === 'anthropic'
        || account.vendorId === 'minimax-portal'
        || account.vendorId === 'minimax-portal-cn' ? 'anthropic-messages'
      : account.vendorId === 'google' ? 'google-generative-ai'
        : account.vendorId === 'ollama' ? 'ollama'
          : 'openai-completions');
  return MORPHEUS_PLANNER_PROTOCOLS.includes(configured as MorpheusPlannerProtocol)
    ? configured as MorpheusPlannerProtocol
    : null;
}

/** OAuth browser sessions remain OpenClaw-owned and are not direct planner credentials. */
export function isMorpheusPlannerAccountCompatible(
  account: MorpheusPlannerProviderShape,
): boolean {
  return account.authMode !== 'oauth_browser' && morpheusPlannerProtocolFor(account) !== null;
}
