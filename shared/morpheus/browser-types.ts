/** Observations are untrusted page data, never authority or instructions. */
export type MorpheusBrowserControl = {
  ref: string;
  kind: 'link' | 'button' | 'input' | 'select';
  name: string;
  href?: string;
};

export type MorpheusBrowserSnapshot = {
  sessionId: string;
  revision: string;
  url: string;
  title: string;
  text: string;
  controls: MorpheusBrowserControl[];
  truncated: boolean;
  blockedRequests: number;
};

export type MorpheusBrowserCommand =
  | { kind: 'click'; revision: string; ref: string }
  | { kind: 'fill'; revision: string; ref: string; text: string }
  | { kind: 'select'; revision: string; ref: string; value: string }
  | { kind: 'press'; revision: string; ref: string; key: 'Enter' | 'Tab' | 'Escape' | 'ArrowDown' | 'ArrowUp' };
