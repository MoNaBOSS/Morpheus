/** Platform-neutral contract for a verified Morpheus website project. */
export const MORPHEUS_WEBSITE_PROJECT_VERSION = 1 as const;

export type MorpheusWebsiteVerification = {
  entryDocument: true;
  viewportMetadata: true;
  responsiveStyles: true;
  localStylesheet: true;
  analyticsConfiguration: true;
  selfContained: true;
};

/**
 * Main-authored manifest for a website that was inspected on disk.
 *
 * The planner cannot claim these fields. They exist only after the verifier
 * has resolved the project inside an approved workspace and inspected its
 * actual files.
 */
export type MorpheusWebsiteProjectManifest = {
  v: typeof MORPHEUS_WEBSITE_PROJECT_VERSION;
  projectPath: string;
  workspaceRoot: string;
  entryPath: string;
  relativeEntryPath: string;
  fileCount: number;
  totalBytes: number;
  checks: MorpheusWebsiteVerification;
  verifiedAt: string;
};
