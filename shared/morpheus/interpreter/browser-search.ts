/** Fixed browser navigation only; query text never becomes capability input. */
export type BrowserSearch =
  | { kind: 'search'; query: string; url: string }
  | { kind: 'unsupported' };

export const COMMAND_REQUEST_PREFIX = '(?:(?:(?:can|could|would|will)\\s+you|i\\s+(?:want|need)\\s+you\\s+to|help\\s+me)\\s+)?(?:(?:please|kindly)\\s+)?';
const PREFIX = COMMAND_REQUEST_PREFIX;
/** Exact destination spellings only; never apply these aliases to query text. */
export const YOUTUBE_DESTINATION_PATTERN = '(?:youtube|you\\s+tube|u\\s+tube)(?:\\s+music)?';
const SITE = `(?:${YOUTUBE_DESTINATION_PATTERN}|google|github|instagram|pornhub|gmail|(?:https?://)?(?:music\\.youtube\\.com|(?:www\\.)?(?:youtube|google|github)\\.com)/?)`;
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
const NON_ACTION_PREFIX = String.raw`(?:don't|don’t|do\s+not|never|not|avoid|without|explain|describe|discuss|teach|understand|learn|tell\s+me\s+(?:how|why|about)|help\s+me\s+(?:understand|learn)|how|why|(?:i|we|he|she|they|you|someone|somebody|it)\b|yesterday|earlier|previously|already|last\s+(?:time|night|week|month|year)|opened|closed|deleted|removed|erased|sent|showed|shown|shows|runs|searched|created|copied|moved|renamed|launched|started|stopped|cancelled|canceled)`;
const REQUEST_PREFIX = new RegExp(`^${COMMAND_REQUEST_PREFIX}`, 'i');
const NON_ACTION_REQUEST = new RegExp(`^${NON_ACTION_PREFIX}\\b`, 'i');
const NON_ACTION_TAIL = new RegExp(String.raw`(?:\b(?:and(?:\s+then)?|then|afterwards|also)\b|[,;.!?&]|\r?\n)\s*${COMMAND_REQUEST_PREFIX}${NON_ACTION_PREFIX}\b[^\r\n]{0,400}\b(?:open|close|delete|remove|erase|send|publish|post|buy|pay|transfer|create|make|write|read|copy|move|append|rename|launch|run|start|stop|show|search|find|take|capture|save|install|uninstall|go\s+to)\b`, 'i');
const FILE_CONTENT_PREFIX = new RegExp(`^${COMMAND_REQUEST_PREFIX}(?:create|make|write|save|append|add)\\b[^\\r\\n]{0,240}?(?:\\bfile\\b|\\b[\\w-]+\\.(?:txt|md|json|csv|log|ya?ml|ini|xml|html|css)\\b)[^\\r\\n]{0,240}?\\b(?:saying|containing|with(?:\\s+the)?\\s+(?:text|content))\\s+`, 'i');

function outsideLiteralData(value: string, literalFileContent = false): { text: string; unclosedQuote: boolean } {
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
  if (literalFileContent) {
    // Only an anchored file-writing request declares an unquoted content tail.
    // The returned plan still uses the original bytes; this projection is used
    // solely to prevent content words from becoming a different capability.
    const content = FILE_CONTENT_PREFIX.exec(outsideQuotes);
    if (content) outsideQuotes = outsideQuotes.slice(0, content[0].length)
      + ' '.repeat(outsideQuotes.length - content[0].length);
  }
  return { text: outsideQuotes, unclosedQuote: Boolean(quote) };
}

export function hasSeparateCommand(value: string, literalFileContent = false): boolean {
  const outside = outsideLiteralData(value, literalFileContent);
  return outside.unclosedQuote || ACTION_TAIL.test(outside.text) || NON_ACTION_TAIL.test(outside.text);
}

/** Narration, negation and discussion cannot authorize a deterministic action. */
export function hasNonActionCommandContext(value: string): boolean {
  const outside = outsideLiteralData(value, true);
  // Consume an explicit request wrapper once. Allowing the regex to backtrack
  // would mistake "I want you to open" for narrated speech beginning with I.
  return NON_ACTION_REQUEST.test(outside.text.trim().replace(REQUEST_PREFIX, '')) || NON_ACTION_TAIL.test(outside.text);
}

/** A one-step interpreter cannot silently omit an unresolved second request. */
export function hasUnresolvedCommandCompound(value: string): boolean {
  const outside = outsideLiteralData(value, true);
  return /\s+(?:and(?:\s+then)?|then|afterwards|also|but|instead|after|before|where|because|if|unless|when|until)\s+\S|[;&]\s*\S|,\s*(?!please[.!?]*\s*$)\S|\.\s+(?!please[.!?]*\s*$)\S|\r?\n\s*\S/i.test(outside.text);
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
  const name = site.toLowerCase().replace(/\s+/g, ' ').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
    .replace(/^(?:you tube|u tube)(?= |$)/, 'youtube');
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
