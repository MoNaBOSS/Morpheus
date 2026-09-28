import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const preferences = vi.hoisted(() => ({ level: 'talkative', dnd: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/morpheus-companion', () => ({ useMorpheusCompanionStore: (select: (state: unknown) => unknown) => select({ onboarding: { preferences: { proactivityLevel: preferences.level } } }) }));
vi.mock('@/stores/morpheus-intelligence', () => ({ useMorpheusIntelligenceStore: (select: (state: unknown) => unknown) => select({ proactive: { settings: { enabled: true, doNotDisturb: preferences.dnd } } }) }));
import { MorpheusSocialCheckIn } from '@/components/morpheus/MorpheusSocialCheckIn';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); preferences.dnd = false; });
describe('social check-in interruption', () => {
  it('dismisses immediately when work or DND starts and does not revive the old prompt', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const view = render(<MorpheusSocialCheckIn activeCount={0} />);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.getByTestId('morpheus-social-check-in')).toBeInTheDocument();
    view.rerender(<MorpheusSocialCheckIn activeCount={1} />);
    expect(screen.queryByTestId('morpheus-social-check-in')).toBeNull();
    view.rerender(<MorpheusSocialCheckIn activeCount={0} />);
    expect(screen.queryByTestId('morpheus-social-check-in')).toBeNull();
    act(() => vi.advanceTimersByTime(24 * 60 * 60_000));
    expect(screen.getByTestId('morpheus-social-check-in')).toBeInTheDocument();
    preferences.dnd = true; view.rerender(<MorpheusSocialCheckIn activeCount={0} />);
    expect(screen.queryByTestId('morpheus-social-check-in')).toBeNull();
  });
});
