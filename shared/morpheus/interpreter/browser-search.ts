/** Fixed browser navigation only; query text never becomes capability input. */
export type BrowserSearch =
  | { kind: 'search'; query: string; url: string }
  | { kind: 'unsupported' };

export const COMMAND_REQUEST_PREFIX = '(?:(?:(?:can|could|would|will)\\s+you|i\\s+(?:want|need)\\s+you\\s+to|help\\s+me)\\s+)?(?:(?:please|kindly)\\s+)?';
const PREFIX = COMMAND_REQUEST_PREFIX;
const SITE = '(?:youtube(?:\\s+music)?|google|github|instagram|pornhub|gmail|(?:https?://)?(?:music\\.youtube\\.com|(?:www\\.)?(?:youtube|google|github)\\.com)/?)';
const DOMAIN = '(?:https?://)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,24}/?';
const SITE_SEARCH = [
  new RegExp(`^${PREFIX}(?:open|launch|visit|browse|go\\s+to|navigate\\s+to|take\\s+me\\s+to)\\s+(?:the\\s+)?(${SITE})(?:\\s+(?:website|site))?\\s*(?:,?\\s+(?:and(?:\\s+then)?|then)\\s+|[,;]\\s*)(?:search|look\\s+up|find)(?:\\s+for)?\\s+([\\s\\S]+)$`, 'i'),
  new RegExp(`^${PREFIX}search\\s+(?:the\\s+)?(${SITE})(?:\\s+(?:website|site))?\\s+(?:for\\s+|:\\s*)([\\s\\S]+)$`, 'i'),
  new RegExp(`^${PREFIX}(?:search|look\\s+up|find)\\s+on\\s+(?:the\\s+)?(${SITE})(?:\\s+for)?\\s+([\\s\\S]+)$`, 'i'),
  new RegExp(`^${PREFIX}(${SITE})\\s+search(?:\\s+for)?\\s+([\\s\\S]+)$`, 'i'),
];
const SUFFIX_SITE_SEARCH = new RegExp(`^${PREFIX}(?:search|look\\s+up|look\\s+for|find)(?:\\s+for)?\\s+([\\s\\S]+?)\\s+(?:on|in|at)\\s+(?:the\\s+)?(${SITE})(?:\\s+(?:website|site))?(?:\\s+please)?[.!?]?$`, 'i');
const WEB_SEARCH = [
  new RegExp(`^${PREFIX}(?:open|launch|start)\\s+(?:the\\s+)?browser\\s*(?:,?\\s+(?:and(?:\\s+then)?|then)\\s+|[,;]\\s*)(?:search|look\\s+up)(?:\\s+the\\s+web)?(?:\\s+for)?\\s+([\\s\\S]+)$`, 'i'),
  new RegExp(`^${PREFIX}(?:search(?:\\s+(?:the\\s+web|online))?|google|look\\s+up)(?:\\s+for)?\\s+([\\s\\S]+)$`, 'i'),
];
const FILE_SEARCH = new RegExp(`^${PREFIX}(?:search|find|locate)(?:\\s+for)?\\s+(?:(?:the|my|a)\\s+)?(?:files?|folders?|director(?:y|ies)|workspace)\\b`, 'i');
const UNKNOWN_DOMAIN_SEARCH = [
  new RegExp(`^${PREFIX}search\\s+(?:on\\s+)?${DOMAIN}\\s+(?:for\\s+)?[\\s\\S]+$`, 'i'),
  new RegExp(`^${PREFIX}(?:search|look\\s+up|find)(?:\\s+for)?\\s+[\\s\\S]+\\s+(?:on|in|at)\\s+${DOMAIN}[.!?]?$`, 'i'),
  new RegExp(`^${PREFIX}(?:open|launch|visit|browse|go\\s+to)\\s+${DOMAIN}\\s*(?:,?\\s+(?:and(?:\\s+then)?|then)\\s+|[,;]\\s*)(?:search|look\\s+up|find)\\b`, 'i'),
];
const ACTION_TAIL = new RegExp(String.raw`(?:\b(?:and(?:\s+then)?|then|afterwards|also)\b|[,;.!?&]|\r?\n)\s*${COMMAND_REQUEST_PREFIX}(?:open|close|delete|remove|erase|send|publish|post|buy|purchase|pay|transfer|book|reserve|cancel|submit|approve|grant|share|set|edit|update|build|generate|prepare|organize|save|download|subscribe|like|comment|log\s+in|sign\s+in|create|make|write|read|copy|move|append|rename|launch|run|start|stop|turn|take|capture|show|check|search|look\s+up|find|schedule|remind|notify|upload|install|uninstall|watch|play|pause|focus|verify|minimi[sz]e|restore|switch\s+to|select|click|summarize|explain|translate|research|go\s+to|navigate\s+to|take\s+me\s+to|visit|browse)\b`, 'i');

export function hasSeparateCommand(value: string): boolean {
  // URL punctuation and query keys are resource data, not an instruction
  // separator. Mask only independently valid literal URL/domain tokens; an
  // action following the token remains visible to the guard.
  const withoutUrls = value.replace(/\b(?:https?:\/\/[^\s<>"'“”]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?=$|[\s,;.!?"'“”]))/gi, (token) => {
    try {
      const parsed = new URL(/^https?:\/\//i.test(token) ? token : `https://${token}`);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? ' '.repeat(token.length) : token;
    } catch { return token; }
  });
  // Mask quoted portions before looking for a separate instruction. Words
  // such as "delete file" are valid search text, never executable commands.
  let outsideQuotes = '';
  let quote: string | null = null;
  for (let index = 0; index < withoutUrls.length; index += 1) {
    const character = withoutUrls[index];
    if (quote) {
      if (character === quote) quote = null;
      outsideQuotes += ' ';
    } else if (character === '"' || character === '“'
      || (character === "'" && (index === 0 || /\s/.test(value[index - 1])))) {
      quote = character === '“' ? '”' : character;
      outsideQuotes += ' ';
    } else {
      outsideQuotes += character;
    }
  }
  return Boolean(quote) || ACTION_TAIL.test(outsideQuotes);
}

function queryText(value: string): string | null {
  const query = value.trim().replace(/\s+please[.!?]?$/i, '').trim();
  const quoted = /^(?:"([^"]*)"|“([^”]*)”|'([^']*)')[.!?]?$/.exec(query);
  if (quoted) {
    const literal = quoted[1] ?? quoted[2] ?? quoted[3];
    return literal.trim() && literal.length <= 200 ? literal : null;
  }
  if (hasSeparateCommand(query)) return null;
  const normalized = query.replace(/[.!?]+$/, '').trim();
  return normalized && normalized.length <= 200 ? normalized : null;
}

function siteUrl(site: string, query: string): string | null {
  const name = site.toLowerCase().replace(/\s+/g, ' ').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const encoded = encodeURIComponent(query);
  if (name === 'youtube' || name === 'youtube.com') return `https://www.youtube.com/results?search_query=${encoded}`;
  if (name === 'youtube music' || name === 'music.youtube.com') return `https://music.youtube.com/search?q=${encoded}`;
  if (name === 'google' || name === 'google.com') return `https://www.google.com/search?q=${encoded}`;
  if (name === 'github' || name === 'github.com') return `https://github.com/search?q=${encoded}`;
  return null; // Do not invent a search endpoint or silently change the site.
}

export function parseBrowserSearch(objective: string): BrowserSearch | null {
  const text = objective.trim();
  if (/^(?:(?:please|kindly)\s+)?(?:don't|do\s+not|never|explain|describe|tell\s+me|how\b|what\b)[\s\S]*\b(?:search|look\s+up)\b/i.test(text)) return { kind: 'unsupported' };
  for (const pattern of SITE_SEARCH) {
    const match = pattern.exec(text);
    if (!match) continue;
    const query = queryText(match[2]);
    const url = query ? siteUrl(match[1], query) : null;
    return query && url ? { kind: 'search', query, url } : { kind: 'unsupported' };
  }
  const suffix = SUFFIX_SITE_SEARCH.exec(text);
  if (suffix) {
    const query = queryText(suffix[1]);
    const url = query ? siteUrl(suffix[2], query) : null;
    return query && url ? { kind: 'search', query, url } : { kind: 'unsupported' };
  }
  if (UNKNOWN_DOMAIN_SEARCH.some((pattern) => pattern.test(text))) return { kind: 'unsupported' };
  if (FILE_SEARCH.test(text)) return null;
  for (const pattern of WEB_SEARCH) {
    const match = pattern.exec(text);
    if (!match) continue;
    const query = queryText(match[1]);
    return query ? { kind: 'search', query, url: siteUrl('google', query)! } : { kind: 'unsupported' };
  }
  return null;
}
