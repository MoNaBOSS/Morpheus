export type MorpheusSettingsSection = 'connections' | 'voice' | 'personality' | 'account' | 'advanced';
export type MorpheusSettingsSurface = 'full' | 'compact';

function safeReturnTo(value: string | null): string {
  if (!value || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some((char) => char.charCodeAt(0) < 32) || /^\/settings(?:[/?#]|$)/.test(value)) return '/';
  return value;
}

/** Presentation context only. The conversation and draft stay in their existing stores. */
export function morpheusSettingsPath(section: MorpheusSettingsSection = 'connections', returnTo = '/', surface: MorpheusSettingsSurface = 'full'): string {
  return `/settings?${new URLSearchParams({ section, returnTo: safeReturnTo(returnTo), surface })}`;
}

export function readMorpheusSettingsContext(search: string) {
  const params = new URLSearchParams(search);
  return { returnTo: safeReturnTo(params.get('returnTo')), surface: params.get('surface') === 'compact' ? 'compact' as const : 'full' as const };
}

export function morpheusAdvancedSettingsPath(search: string, section?: string): string {
  const context = readMorpheusSettingsContext(search);
  const params = new URLSearchParams(context);
  if (section) params.set('section', section);
  return `/settings/advanced?${params}`;
}
