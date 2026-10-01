import { describe, expect, it } from 'vitest';
import { collectResearchEvidence, compileResearchReport, failedResearchSources } from '@electron/services/morpheus/core/research-report';
import { morpheusCitationUrl, parseMorpheusResearchDraft } from '@shared/morpheus/research-types';
import type { ExecutionArtifact } from '@shared/morpheus/execution-types';

const createdAt = '2026-10-01T10:00:00.000Z';
const artifact: ExecutionArtifact = { kind: 'report', artifactId: 'source', createdAt, data: { sourceType: 'public-https', finalUrl: 'https://example.com/guide', title: 'Guide', excerpt: 'Observed relevant source text', retrievedAt: createdAt, contentSha256: 'a'.repeat(64), truncated: 0 } };
const draft = { title: 'A useful answer', paragraphs: [{ text: 'The guide explains the requested topic.', sourceIds: ['s1'] }] };
const input = { draft, evidence: collectResearchEvidence([artifact]), objective: 'Research this guide', origin: { type: 'command-bar' as const, commandText: 'Research this guide' }, platform: 'win32', createdAt };

describe('source-bound research reports', () => {
  it('compiles to a normal bounded no-overwrite file plan with only observed citation URLs', () => {
    const { plan } = compileResearchReport(input);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ capabilityId: 'file.create', params: { path: expect.stringMatching(/^research-[a-f0-9-]+\.md$/), content: expect.stringContaining('[s1](<https://example.com/guide>)') }, permission: { resourceScope: 'pending-main-resolution' } });
    expect(JSON.stringify(plan)).toContain('retrieved 2026-10-01');
    expect(JSON.stringify(plan)).toContain('SHA-256');
  });
  it('rejects invented or foreign citations and evidence-free reports', () => {
    expect(() => compileResearchReport({ ...input, evidence: { sources: [], unavailable: [] } })).toThrow(/not retrieved/);
    expect(() => compileResearchReport({ ...input, draft: { ...draft, paragraphs: [{ text: 'A claim', sourceIds: ['s2'] }] } })).toThrow(/not retrieved/);
  });
  it('escapes markup instead of accepting model-authored links or HTML', () => {
    const result = compileResearchReport({ ...input, draft: { title: '<b>Title</b>', paragraphs: [{ text: '<img onerror=alert(1)> [invented][s1]', sourceIds: ['s1'] }] } });
    const content = String('content' in result.plan.steps[0].params ? result.plan.steps[0].params.content : '');
    expect(content).not.toContain('<img');
    expect(content).toContain('&lt;img');
    expect(content).toContain('\\[invented\\]');
    expect(() => parseMorpheusResearchDraft({ ...draft, paragraphs: [{ text: 'Read https://unobserved.example/', sourceIds: ['s1'] }] })).toThrow(/not URLs/);
  });
  it.each([
    { ...draft, path: '../secret' }, { ...draft, paragraphs: [] }, { ...draft, title: 'x'.repeat(161) },
    { ...draft, paragraphs: [{ text: 'A claim', sourceIds: [] }] },
    { ...draft, paragraphs: [{ text: 'A claim', sourceIds: ['s1', 's1'] }] },
    { ...draft, paragraphs: [{ text: 'A claim', sourceIds: ['s7'] }] },
    { ...draft, paragraphs: [{ text: 'A claim', sourceIds: ['s1'], url: 'https://bad.example/' }] },
  ])('rejects malformed report %#', (value) => expect(() => parseMorpheusResearchDraft(value)).toThrow());
  it('caps/deduplicates evidence and excludes unrelated artifacts and sensitive URLs', () => {
    const evidence = collectResearchEvidence([
      { ...artifact, data: { ...artifact.data, finalUrl: 'https://example.com/?token=private' } },
      { ...artifact, data: { excerpt: 'Not actually retrieved', url: 'https://example.com' } },
      ...Array.from({ length: 12 }, (_, index) => ({ ...artifact, data: { ...artifact.data, finalUrl: `https://example.com/${index}`, excerpt: 'x'.repeat(8000) } })),
      artifact,
    ]);
    expect(evidence.sources).toHaveLength(6);
    expect(evidence.sources.every((source) => source.excerpt.length === 2400 && source.truncated)).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain('private');
    expect(collectResearchEvidence([artifact, artifact]).sources).toHaveLength(1);
  });
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', 'https://localhost/', 'https://127.0.0.1/', 'https://example.com/?api_key=private', 'https://example.com:8443/'])('rejects unsafe citation %s', (url) => expect(morpheusCitationUrl(url)).toBeNull());
  it('keeps unavailable sources separately labeled without claiming retrieval', () => {
    const plan = compileResearchReport(input).plan;
    plan.steps = [{ ...plan.steps[0], capabilityId: 'web.readPage', params: { url: 'https://blocked.example/page' } }];
    const unavailable = failedResearchSources(plan, [{ stepId: 'save-research', status: 'failed', error: { code: 'request-failed', message: 'private diagnostic' } }]);
    expect(unavailable).toEqual([{ url: 'https://blocked.example/page', reason: 'request-failed' }]);
    const compiled = compileResearchReport({ ...input, evidence: { ...input.evidence, unavailable } });
    expect(JSON.stringify(compiled.plan)).toContain('Unavailable sources (not used as evidence)');
    expect(JSON.stringify(compiled.plan)).not.toContain('private diagnostic');
  });
});
