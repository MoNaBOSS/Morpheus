/** Opens a project folder in the compiled-in VS Code installation only. */
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join } from 'node:path';
import { statSync } from 'node:fs';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import {
  isMorpheusDeveloperTemplateKey,
  type MorpheusParamsFor,
} from '@shared/morpheus/actions/registry';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { assertRegularFileInside } from '../../../../utils/morpheus-path-guard';
import { resolveWorkspacePath } from './workspace';

function resolveVsCodeExecutable(env: NodeJS.ProcessEnv): string {
  const candidates = [
    env.ProgramFiles ? join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe') : null,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe') : null,
    env['ProgramFiles(x86)'] ? join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe') : null,
  ].filter((value): value is string => typeof value === 'string' && isAbsolute(value));
  for (const candidate of candidates) {
    try { return assertRegularFileInside(dirname(candidate), candidate); } catch { /* next fixed location */ }
  }
  throw new MorpheusCapabilityError('resolution-failed', 'The approved VS Code installation was not found');
}

function launch(executablePath: string, projectPath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executablePath, [projectPath], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        detached: false,
      });
    } catch {
      reject(new MorpheusCapabilityError('execution-failed', 'Failed to open the project in VS Code'));
      return;
    }
    child.once('error', () => reject(new MorpheusCapabilityError('execution-failed', 'Failed to open the project in VS Code')));
    child.once('spawn', () => {
      try { child.unref(); } catch { /* no-op */ }
      resolve(child.pid ?? null);
    });
  });
}

export const win32LaunchProjectCapability: MorpheusCapability<'dev.launchProject'> = {
  actionId: 'dev.launchProject',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'dev.launchProject'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    if (!isMorpheusDeveloperTemplateKey(params.templateKey)) {
      throw new MorpheusCapabilityError('invalid-params', 'Unknown developer launcher');
    }
    const templateKey = 'vscode' as const;
    const project = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
    try {
      if (!statSync(project.absolute).isDirectory()) throw new Error('not a folder');
    } catch {
      throw new MorpheusCapabilityError('invalid-params', 'Project path must be an existing folder');
    }
    const executablePath = resolveVsCodeExecutable(context.env);
    return {
      target: { kind: 'folder', path: project.absolute, workspaceRoot: project.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => ({
        kind: 'project-launch',
        templateKey,
        path: project.absolute,
        executablePath,
        pid: await launch(executablePath, project.absolute),
      }),
    };
  },
};
