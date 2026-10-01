import { createHash } from 'node:crypto';
import { verifyInteractiveProject } from '../interactive-site/project';
import { buildInteractiveSite } from '../interactive-site/template';
import type { MorpheusRootProvider } from '../morpheus/roots';
import type { MorpheusInteractiveSiteSpec } from '@shared/morpheus/interactive-site-types';

export type PublicationFile = { path: string; content: string; bytes: number; sha256: string; gitBlob: string };
export type PublicationSnapshot = { spec: MorpheusInteractiveSiteSpec; sourceRevision: string; publicDigest: string; files: readonly PublicationFile[] };
export const PUBLIC_FILES = ['app.js', 'index.html', 'styles.css'] as const;
export const RELEASE_FILE = 'morpheus-release.json';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const credentialShape = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/;
export const gitBlobDigest = (content: string) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');

/** Explicitly excludes the brief/config/README and all other workspace files. */
export function publicationSnapshotFromSpec(spec: unknown): PublicationSnapshot {
  const build = buildInteractiveSite(spec);
  const publicDigest = sha256(JSON.stringify(PUBLIC_FILES.map((path) => [path, sha256(build.files[path])])));
  const contents = { ...Object.fromEntries(PUBLIC_FILES.map((path) => [path, build.files[path]])),
    [RELEASE_FILE]: JSON.stringify({ v: 1, publicDigest, files: PUBLIC_FILES.map((path) => ({ path, sha256: sha256(build.files[path]) })) }) + '\n' };
  const files = Object.entries(contents).map(([path, content]) => ({ path, content, bytes: Buffer.byteLength(content), sha256: sha256(content), gitBlob: gitBlobDigest(content) }));
  // A conservative local check, not a claim that arbitrary sensitive prose can
  // be detected. Exact public content still requires explicit user confirmation.
  if (files.some((file) => credentialShape.test(file.content))) throw new Error('The site appears to contain a credential. Remove it before preparing public files.');
  return { spec: build.spec, sourceRevision: build.revision, publicDigest, files };
}

export async function prepareInteractivePublication(roots: MorpheusRootProvider, path: string, expectedRevision: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('A verified project revision is required.');
  const build = await verifyInteractiveProject(roots, path, expectedRevision);
  return publicationSnapshotFromSpec(build.spec);
}

export function validatePublicationSnapshot(snapshot: PublicationSnapshot): void {
  if (!snapshot || !/^[a-f0-9]{64}$/.test(snapshot.sourceRevision) || !/^[a-f0-9]{64}$/.test(snapshot.publicDigest)
    || !Array.isArray(snapshot.files) || snapshot.files.length !== 4) throw new Error('Invalid public snapshot.');
  const expected = [...PUBLIC_FILES, RELEASE_FILE].sort();
  if (JSON.stringify(snapshot.files.map((file) => file.path).sort()) !== JSON.stringify(expected)) throw new Error('Publication contains unapproved files.');
  for (const file of snapshot.files) {
    if (typeof file.content !== 'string' || file.bytes !== Buffer.byteLength(file.content) || file.bytes > 128 * 1024
      || file.sha256 !== sha256(file.content) || file.gitBlob !== gitBlobDigest(file.content)) throw new Error('Publication bytes changed after preparation.');
  }
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  if (snapshot.publicDigest !== sha256(JSON.stringify(PUBLIC_FILES.map((path) => [path, files.get(path)!.sha256])))) throw new Error('Publication digest mismatch.');
  const marker = JSON.parse(files.get(RELEASE_FILE)!.content);
  if (JSON.stringify(marker) !== JSON.stringify({ v: 1, publicDigest: snapshot.publicDigest, files: PUBLIC_FILES.map((path) => ({ path, sha256: files.get(path)!.sha256 })) })) throw new Error('Publication marker mismatch.');
  const pinned = publicationSnapshotFromSpec(snapshot.spec);
  if (pinned.sourceRevision !== snapshot.sourceRevision || pinned.publicDigest !== snapshot.publicDigest
    || pinned.files.some((file) => file.content !== files.get(file.path)!.content)) throw new Error('Publication is not the reviewed client template.');
}
