/** Source IDs are Main-owned evidence, not provider-supplied URLs. */
export type MorpheusResearchSource = {
  sourceId: string;
  url: string;
  title: string;
  retrievedAt: string;
  excerpt: string;
  contentSha256: string;
  truncated: boolean;
};

export type MorpheusResearchEvidence = {
  sources: readonly MorpheusResearchSource[];
  unavailable: readonly { url: string; reason: string }[];
};

export type MorpheusResearchDraft = {
  title: string;
  paragraphs: readonly { text: string; sourceIds: readonly string[] }[];
};

/** Public citations deliberately exclude credential-bearing URLs and IP literals.
 * This is a display/export guard; network DNS validation remains in Main. */
export function morpheusCitationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
      || !url.hostname.includes('.') || /^(?:[\d.]+|\[)/.test(url.hostname)
      || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(url.hostname)) return null;
    for (const key of url.searchParams.keys()) {
      if (/(?:token|password|passwd|secret|signature|credential|api[-_]?key|authorization|session|oauth|code|jwt)/i.test(key)) return null;
    }
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function parseMorpheusResearchDraft(value: unknown): MorpheusResearchDraft {
  const record = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid research report.');
    return input as Record<string, unknown>;
  };
  const text = (input: unknown, max: number): string => {
    if (typeof input !== 'string' || !input.trim() || input.length > max
      || [...input].some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) throw new Error('Invalid research report text.');
    // Only Main may add active URLs/citation syntax to the exported report.
    if (/(?:https?:|file:|javascript:|data:|www\.)/i.test(input)) throw new Error('Use observed source ids, not URLs, in research prose.');
    return input.trim();
  };
  const draft = record(value);
  if (Object.keys(draft).some((key) => !['title', 'paragraphs'].includes(key)) || !Array.isArray(draft.paragraphs)
    || draft.paragraphs.length < 1 || draft.paragraphs.length > 8) throw new Error('Invalid research report shape.');
  return {
    title: text(draft.title, 160),
    paragraphs: draft.paragraphs.map((item) => {
      const paragraph = record(item);
      if (Object.keys(paragraph).some((key) => !['text', 'sourceIds'].includes(key)) || !Array.isArray(paragraph.sourceIds)
        || paragraph.sourceIds.length < 1 || paragraph.sourceIds.length > 6
        || paragraph.sourceIds.some((id) => typeof id !== 'string' || !/^s[1-6]$/.test(id))
        || new Set(paragraph.sourceIds).size !== paragraph.sourceIds.length) throw new Error('Invalid research citation ids.');
      return { text: text(paragraph.text, 1200), sourceIds: [...paragraph.sourceIds] as string[] };
    }),
  };
}
