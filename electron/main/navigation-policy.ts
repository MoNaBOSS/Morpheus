export type MainNavigationDecision = 'allow' | 'external' | 'block';

function sameDocumentOrigin(target: URL, allowed: URL): boolean {
  if (target.protocol === 'file:' || allowed.protocol === 'file:') {
    return target.protocol === 'file:'
      && allowed.protocol === 'file:'
      && decodeURIComponent(target.pathname).toLowerCase()
        === decodeURIComponent(allowed.pathname).toLowerCase();
  }
  return target.origin === allowed.origin;
}

/**
 * Main-window navigation is limited to the renderer document itself. Ordinary
 * web links are delegated to the OS browser; custom protocols and local files
 * are blocked instead of reaching Electron's shell integration.
 */
export function classifyMainNavigation(
  targetUrl: string,
  allowedRendererUrls: readonly string[],
): MainNavigationDecision {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return 'block';
  }

  for (const allowedUrl of allowedRendererUrls) {
    try {
      if (sameDocumentOrigin(target, new URL(allowedUrl))) return 'allow';
    } catch {
      // Ignore invalid configuration and continue fail-closed.
    }
  }

  return target.protocol === 'https:' || target.protocol === 'http:'
    ? 'external'
    : 'block';
}
