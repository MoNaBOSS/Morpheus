/** Public confirmation/receipt data. Tokens and local source content stay in Main. */
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
  target: MorpheusPublicationTarget;
  sourceRevision: string;
  publicDigest: string;
  files: readonly { path: string; bytes: number; sha256: string }[];
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
  status: 'ready' | 'publishing' | 'unknown' | 'verifying' | 'published' | 'conflict';
  createdAt: string;
  verifiedAt?: string;
};
