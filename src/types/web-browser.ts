export interface WebBrowserDidFailLoadEvent extends Event {
  errorCode: number;
  isMainFrame: boolean;
}

interface HTMLWebViewElement extends HTMLElement {
  readonly tagName: 'WEBVIEW';
  isLoading(): boolean;
}

/**
 * Renderer-local projection of the only webview method this surface uses.
 * Keeping this structural avoids importing Electron packages into Renderer.
 */
export type WebBrowserWebviewElement = HTMLWebViewElement;
