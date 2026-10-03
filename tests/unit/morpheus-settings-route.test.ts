import { describe, expect, it } from 'vitest';
import { morpheusSettingsPath, morpheusAdvancedSettingsPath, readMorpheusSettingsContext } from '../../src/lib/morpheus-settings-route';

describe('contextual Morpheus settings', () => {
  it('preserves a compact conversation origin through advanced voice settings', () => {
    const path = morpheusSettingsPath('voice', '/chat?session=current', 'compact');
    const search = path.slice(path.indexOf('?'));
    expect(readMorpheusSettingsContext(search)).toEqual({ returnTo: '/chat?session=current', surface: 'compact' });
    expect(readMorpheusSettingsContext(morpheusAdvancedSettingsPath(search, 'voice').split('?')[1])).toEqual({ returnTo: '/chat?session=current', surface: 'compact' });
  });
  it.each(['https://example.com', '//example.com', '/\\example.com', '/settings?section=voice', '/settings/advanced', '/\nexample.com'])('does not return to an external or recursive settings route: %s', (returnTo) => {
    const path = morpheusSettingsPath('voice', returnTo);
    expect(readMorpheusSettingsContext(path.split('?')[1]).returnTo).toBe('/');
  });
});
