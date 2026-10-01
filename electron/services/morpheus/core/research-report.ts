import { createHash, randomUUID } from 'node:crypto';
import type { ExecutionArtifact, ExecutionOrigin, ExecutionPlan, ExecutionStepResult } from '@shared/morpheus/execution-types';
import type { MorpheusPlatform } from '@shared/morpheus/actions/registry';
import { createPlanFromProviderText } from '@shared/morpheus/provider-plan';
import { morpheusCitationUrl, parseMorpheusResearchDraft, type MorpheusResearchDraft, type MorpheusResearchEvidence } from '@shared/morpheus/research-types';

/** Build bounded evidence from actual artifacts of THIS objective only. This is
 * never called on model context, imported chat prose or search snippets. */
export function collectResearchEvidence(artifacts: readonly ExecutionArtifact[], unavailable: MorpheusResearchEvidence['unavailable'] = []): MorpheusResearchEvidence {
  const sources: MorpheusResearchEvidence['sources'][number][] = [];
  for (const artifact of artifacts) {
    if (artifact.kind !== 'report') continue;
    const d = artifact.data;
    if (d.sourceType !== 'public-https' && typeof d.browserSnapshot !== 'string') continue;
    const url = morpheusCitationUrl(d.finalUrl ?? d.url);
    if (!url || typeof d.excerpt !== 'string' || !d.excerpt.trim() || sources.some((source) => source.url === url)) continue;
    const excerpt = d.excerpt.slice(0, 2400);
    const retrievedAt = typeof d.retrievedAt === 'string' ? d.retrievedAt : artifact.createdAt;
    if (!Number.isFinite(Date.parse(retrievedAt))) continue;
    const digest = d.sourceType === 'public-https' ? d.contentSha256 : createHash('sha256').update(d.excerpt).digest('hex');
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) continue;
    sources.push({ sourceId: `s${sources.length + 1}`, url, title: String(d.title || new URL(url).hostname).slice(0, 240),
      retrievedAt, excerpt, contentSha256: digest, truncated: d.truncated === 1 || d.excerpt.length > excerpt.length });
    if (sources.length === 6) break;
  }
  return { sources, unavailable: unavailable.filter((item) => morpheusCitationUrl(item.url)).slice(0, 6) };
}

export function failedResearchSources(plan: ExecutionPlan, steps: readonly ExecutionStepResult[]): MorpheusResearchEvidence['unavailable'] {
  return steps.flatMap((step) => {
    const action = plan.steps.find((item) => item.stepId === step.stepId);
    if (!action || !['web.readPage', 'browser.inspect'].includes(action.capabilityId) || !['failed', 'denied', 'skipped'].includes(step.status)) return [];
    const url = morpheusCitationUrl('url' in action.params ? action.params.url : undefined);
    return url ? [{ url, reason: /^[a-z0-9-]{1,80}$/.test(step.error?.code ?? '') ? step.error!.code : step.status }] : [];
  });
}

function plainMarkdown(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}[\]()#+.!|>~-])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Produce an ordinary file.create plan. No new writer, bypassed consent, or
 * provider-selected file path. Citation existence is checked here; semantic
 * support is still a model/human quality question, not a claimed proof. */
export function compileResearchReport(input: {
  draft: MorpheusResearchDraft;
  evidence: MorpheusResearchEvidence;
  objective: string;
  origin: ExecutionOrigin;
  platform: string;
  createdAt: string;
}): { plan: ExecutionPlan; summary: string } {
  const draft = parseMorpheusResearchDraft(input.draft);
  if (!['win32', 'darwin', 'linux'].includes(input.platform)) throw new Error('Report saving is unavailable on this platform.');
  const sources = new Map(input.evidence.sources.map((source) => [source.sourceId, source]));
  for (const paragraph of draft.paragraphs) {
    if (paragraph.sourceIds.some((id) => !sources.has(id))) throw new Error('Research report cited a source not retrieved by this task.');
  }
  const usedIds = [...new Set(draft.paragraphs.flatMap((paragraph) => [...paragraph.sourceIds]))];
  const citation = (id: string) => {
    const url = morpheusCitationUrl(sources.get(id)?.url);
    if (!url) throw new Error('Research citation is not a safe public URL.');
    return `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>`;
  };
  const content = `# ${plainMarkdown(draft.title)}\n\n`
    + draft.paragraphs.map((paragraph) => `${plainMarkdown(paragraph.text)} ${paragraph.sourceIds.map((id) => `[${id}](${citation(id)})`).join(' ')}`).join('\n\n')
    + '\n\n## Retrieved sources\n\n'
    + usedIds.map((id) => { const source = sources.get(id)!; return `- [${id}: ${plainMarkdown(source.title)}](${citation(id)}) — retrieved ${source.retrievedAt}${source.truncated ? ' (bounded excerpt)' : ''}; SHA-256 ${source.contentSha256}`; }).join('\n')
    + (input.evidence.unavailable.length ? '\n\n## Unavailable sources (not used as evidence)\n\n' + input.evidence.unavailable.map((item) => `- ${plainMarkdown(item.url)} — ${plainMarkdown(item.reason)}`).join('\n') : '')
    + '\n\nGenerated synthesis from the retrieved excerpts. Citations identify retrieved sources; they do not independently verify every claim.\n';
  const id = randomUUID();
  const plan = createPlanFromProviderText(JSON.stringify({ steps: [{ stepId: 'save-research', capabilityId: 'file.create',
    params: { path: `research-${id}.md`, content }, dependsOn: [], summary: `Save cited report: ${draft.title}`.slice(0, 180) }] }), {
    planId: `research-${id}`, objective: input.objective, origin: input.origin, platform: input.platform as MorpheusPlatform,
    createdAt: input.createdAt, availableCapabilityIds: ['file.create'],
  });
  return { plan, summary: `${draft.title}\n${draft.paragraphs[0].text}`.slice(0, 1000) };
}
