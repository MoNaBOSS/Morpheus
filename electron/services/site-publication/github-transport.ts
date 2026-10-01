export type GitHubRequest = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<unknown>;

/** Credentials go only to the fixed GitHub API origin; no redirect or response
 * body is returned as an error diagnostic. Every request/response is bounded. */
export function createGitHubRequest(token: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): GitHubRequest {
  if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /\s/.test(token)) throw new Error('Reconnect the GitHub account in settings.');
  let requests = 0;
  return async (method, path, body) => {
    signal.throwIfAborted();
    if (++requests > 40 || !/^\/(?:user|repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9/_-]+)?)$/.test(path) || path.includes('..')) throw new Error('GitHub request exceeds its fixed scope.');
    const json = body === undefined ? undefined : JSON.stringify(body);
    if (json && Buffer.byteLength(json) > 768 * 1024) throw new Error('GitHub request exceeds its size limit.');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    try {
      const response = await fetchImpl(`https://api.github.com${path}`, { method, redirect: 'error', signal: deadline,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Morpheus', ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub request failed (${response.status}).`); }
      if (!response.body) throw new Error('GitHub returned no result.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          deadline.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1024 * 1024) throw new Error('GitHub result exceeded its size limit.');
          chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (error) {
      // Raw fetch/response exceptions can contain URLs/credentials. Deliberately
      // do not retain their cause across the host/audit diagnostic boundary.
      // eslint-disable-next-line preserve-caught-error
      if (signal.aborted) throw new Error('GitHub operation cancelled; reconcile any pending publication before retrying.');
      if (error instanceof Error && /^GitHub (request failed \(\d{3}\)|result exceeded its size limit|returned no result)\./.test(error.message)) throw error;
      // eslint-disable-next-line preserve-caught-error
      throw new Error('GitHub operation could not be confirmed; reconcile any pending publication before retrying.');
    }
  };
}
