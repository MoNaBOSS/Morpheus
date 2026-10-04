import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';
import './morpheus-appearance.css';

/** Mirrors the saved presentation choice across routes; owns no runtime access. */
export function MorpheusAppearanceRuntime() {
  const appearance = useSettingsStore((state) => state.morpheusAppearance);
  useEffect(() => {
    document.documentElement.dataset.morpheusAppearance = appearance;
    return () => { delete document.documentElement.dataset.morpheusAppearance; };
  }, [appearance]);
  return null;
}
