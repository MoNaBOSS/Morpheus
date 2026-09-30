/** Electron's hidden BrowserWindow can retain document.hidden=false. */
export function isMorpheusPresentationVisible(): boolean {
  return !document.hidden && document.documentElement.dataset.morpheusWindowVisible !== 'false';
}

export function observeMorpheusPresentationVisibility(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-morpheus-window-visible'],
  });
  document.addEventListener('visibilitychange', listener);
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', listener);
  };
}
