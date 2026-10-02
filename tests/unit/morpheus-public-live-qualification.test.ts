/** Opt-in public GET qualification. No provider calls, personal profile or publication.
 * The report draft is deterministic: this checks retrieval/provenance/saving,
 * and deliberately makes no claim about live model synthesis quality. */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPublicSourceWorkerAdapter } from '@electron/services/public-source-worker-adapter';
import { collectResearchEvidence, compileResearchReport } from '@electron/services/morpheus/core/research-report';
import { win32CreateFileCapability } from '@electron/services/morpheus/capabilities/win32/filesystem';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import type { ExecutionArtifact } from '@shared/morpheus/execution-types';
import type { MorpheusWorkerRequest } from '@shared/morpheus/worker-types';

const dirs: string[] = [];
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });

describe.runIf(process.env.MORPHEUS_PUBLIC_QUALIFICATION === '1')('real public capability qualification', () => {
  it('retrieves two public primary pages and writes their source-bound cited report through the real file capability', async () => {
    const adapter = createPublicSourceWorkerAdapter();
    const urls = ['https://example.org/', 'https://www.iana.org/help/example-domains'];
    const artifacts: ExecutionArtifact[] = [];
    const progress: string[] = [];
    for (const [index, url] of urls.entries()) {
      const request: MorpheusWorkerRequest = {
        v: 1, workerRunId: `live-reader-${index}`, objectiveRunId: 'live-public-qualification', attemptId: `read-${index}`,
        planId: 'public-qualification', stepId: `source-${index}`, cancellationGeneration: 1,
        operation: { kind: 'web.readPage', url },
        authority: { capabilityId: 'web.readPage', origins: [new URL(url).origin], service: 'public-https', tools: ['https.get'], providerRouteRef: 'local-public-http' },
        limits: { deadlineAt: new Date(Date.now() + 30_000).toISOString(), maxSteps: 4, maxOutputBytes: 4096, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 },
      };
      const outcome = await adapter.run(request, AbortSignal.timeout(30_000), async (entry) => { progress.push(`${entry.workerRunId}:${entry.phase}`); });
      expect(outcome.usage).toEqual({ status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 });
      expect(outcome.source?.finalUrl).toBe(url);
      expect(outcome.source?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(outcome.source?.excerpt).toMatch(/example|IANA/i);
      const source = outcome.source!;
      artifacts.push({ kind: 'report', artifactId: request.workerRunId, createdAt: source.retrievedAt,
        data: { sourceType: 'public-https', finalUrl: source.finalUrl, title: source.title, excerpt: source.excerpt,
          retrievedAt: source.retrievedAt, contentSha256: source.contentSha256, truncated: source.truncated ? 1 : 0 } });
    }
    const evidence = collectResearchEvidence(artifacts);
    expect(evidence.sources).toHaveLength(2);
    const { plan } = compileResearchReport({ evidence, draft: {
      title: 'Public source retrieval qualification',
      paragraphs: evidence.sources.map((source) => ({ text: `The public page titled ${source.title} was retrieved for this qualification.`, sourceIds: [source.sourceId] })),
    }, objective: 'Qualify public retrieval and report saving', origin: { type: 'command-bar', commandText: 'Qualify public retrieval' }, platform: 'win32', createdAt: new Date().toISOString() });
    const params = plan.steps[0].params;
    if (!('path' in params) || !('content' in params) || typeof params.path !== 'string' || typeof params.content !== 'string') throw new Error('Missing report file parameters');
    const root = await mkdtemp(join(tmpdir(), 'morpheus-public-live-'));
    dirs.push(root);
    const roots: MorpheusRootProvider = { resolve: () => root, forWorkspace: () => roots };
    const resolution = await win32CreateFileCapability.resolve({ path: params.path, content: params.content }, { roots, appVersion: 'qualification', env: {} });
    const result = await resolution.execute();
    if (result.kind !== 'file') throw new Error('Missing report file receipt');
    const bytes = await readFile(result.path);
    const digest = createHash('sha256').update(bytes).digest('hex');
    // Local audit receipts deliberately keep a short digest; qualification
    // records the full digest and checks it against the actual persisted bytes.
    expect(digest.slice(0, 16)).toBe(result.contentSha256);
    expect(bytes.toString('utf8')).toBe(params.content);
    for (const source of evidence.sources) expect(bytes.toString('utf8')).toContain(source.url);
    await expect(win32CreateFileCapability.resolve({ path: params.path, content: 'overwrite' }, { roots, appVersion: 'qualification', env: {} })).rejects.toThrow('already exists');
    const output = process.env.MORPHEUS_PUBLIC_QUALIFICATION_OUTPUT;
    if (output) {
      const sourcePaths = ['electron/services/public-source-worker-adapter.ts', 'electron/services/task-browser/network.ts',
        'electron/services/interactive-site/project.ts', 'electron/services/morpheus/core/research-report.ts',
        'electron/services/morpheus/capabilities/win32/filesystem.ts'];
      const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) =>
        [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
      await mkdir(dirname(output), { recursive: true });
      const reportEvidencePath = join(dirname(output), 'public-capability-qualification-report.md');
      await writeFile(reportEvidencePath, bytes);
      await writeFile(output, JSON.stringify({ passed: true, verifiedAt: new Date().toISOString(), realPublicNetwork: true,
        providerCalls: 0, costUsd: 0, synthesis: 'deterministic qualification draft; no live model inference',
        sourceHashes, progress, evidence, report: { relativePath: params.path, evidencePath: reportEvidencePath,
          bytes: bytes.length, contentSha256: digest, refusedOverwrite: true } }, null, 2));
    }
  }, 70_000);
});
