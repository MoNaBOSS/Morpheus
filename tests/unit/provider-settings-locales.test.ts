import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../../shared/i18n/locales/en/settings.json';
import zh from '../../shared/i18n/locales/zh/settings.json';
import ja from '../../shared/i18n/locales/ja/settings.json';
import ru from '../../shared/i18n/locales/ru/settings.json';

describe.each(Object.entries({ en, zh, ja, ru }))('BYOK settings translations (%s)', (language, settings) => {
  it('resolves the complete setup guidance in the selected language without fallback', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: false, ns: ['settings'], defaultNS: 'settings', resources: { [language]: { settings } } });
    for (const key of ['byokDescription', 'dialog.openRouterModelTitle', 'dialog.openRouterModelHelp', 'dialog.openRouterModelCatalog', 'toast.defaultDisabled', 'toast.defaultNeedsKey', 'toast.deliveryChanged', 'toast.deliveryInterrupted']) {
      const path = `aiProviders.${key}`;
      expect(i18n.exists(path)).toBe(true);
      expect(i18n.t(path)).not.toBe(path);
      expect(i18n.t(path).trim().length).toBeGreaterThan(5);
    }
    expect(i18n.t('aiProviders.connectionTest.scope')).toBe(settings.aiProviders.connectionTest.scope);
    expect(i18n.t('aiProviders.connectionTest.results.connected')).toBe(settings.aiProviders.connectionTest.results.connected);
  });
});
