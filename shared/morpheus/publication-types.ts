/** Public confirmation/receipt data. Tokens and private project files stay in Main. */
export type MorpheusPublicationTarget = {
  accountId: number;
  accountLogin: string;
  repositoryId: number;
  owner: string;
  repository: string;
  branch: 'gh-pages';
  sitePath: string;
  url: string;
};

export type MorpheusPublicationPreview = {
  approvalId: string;
  operation: 'publish' | 'rollback';
  target: MorpheusPublicationTarget;
  sourceRevision: string;
  publicDigest: string;
  files: readonly { path: string; content: string; bytes: number; sha256: string }[];
  expectedHead: string;
  expiresAt: string;
};

export type MorpheusPublicationReceipt = {
  receiptId: string;
  target: MorpheusPublicationTarget;
  sourceRevision: string;
  publicDigest: string;
  previousCommit: string;
  commit: string;
  status: 'ready' | 'publishing' | 'unknown' | 'verifying' | 'published' | 'conflict' | 'not-published';
  createdAt: string;
  verifiedAt?: string;
  canRollback: boolean;
};

export type MorpheusPublicationSource = { workspaceRoot: string; relativeEntryPath: string; revision: string };
export type MorpheusPublicationConnectionInput = { owner: string; repository: string; slug: string; token: string };
export type MorpheusPublicationState = {
  connection: MorpheusPublicationTarget | null;
  receipts: readonly MorpheusPublicationReceipt[];
};
export type MorpheusPublicationError = 'unavailable' | 'invalid' | 'busy' | 'connection' | 'storage' | 'changed' | 'expired' | 'unresolved' | 'failed';
export type MorpheusPublicationResult<T> = { ok: true; value: T } | { ok: false; code: MorpheusPublicationError };
