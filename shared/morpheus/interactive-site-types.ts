/** Versioned data-only input for reviewed client-side templates. No code/config. */
export type MorpheusInteractiveSiteSpec = {
  template: 'studio-v1';
  title: string;
  headline: string;
  description: string;
  services: readonly { title: string; category: string; description: string }[];
  faqs: readonly { question: string; answer: string }[];
};

export function parseInteractiveSiteSpec(value: unknown): MorpheusInteractiveSiteSpec {
  const record = (item: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !keys.includes(key))) throw new Error('Interactive sites accept template content only, not scripts or build configuration.');
    return item as Record<string, unknown>;
  };
  const text = (value: unknown, max: number): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) throw new Error('Invalid interactive site content.');
    return value.trim();
  };
  const data = record(value, ['template', 'title', 'headline', 'description', 'services', 'faqs']);
  if (data.template !== 'studio-v1' || !Array.isArray(data.services) || data.services.length < 1 || data.services.length > 8
    || !Array.isArray(data.faqs) || data.faqs.length > 6) throw new Error('Unsupported interactive template or content size.');
  const result: MorpheusInteractiveSiteSpec = {
    template: 'studio-v1', title: text(data.title, 80), headline: text(data.headline, 160), description: text(data.description, 600),
    services: data.services.map((item) => { const s = record(item, ['title', 'category', 'description']); return { title: text(s.title, 100), category: text(s.category, 40), description: text(s.description, 600) }; }),
    faqs: data.faqs.map((item) => { const f = record(item, ['question', 'answer']); return { question: text(f.question, 160), answer: text(f.answer, 800) }; }),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 24 * 1024) throw new Error('Interactive content exceeds the template limit.');
  return result;
}
