/**
 * Git Status Checker
 * Evaluates repository branch, cleanliness, staged items, and tracked files.
 */

import type { GitClient } from './git-client.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export interface RepositoryStatus {
  currentBranch: string;
  isClean: boolean;
  untrackedFiles: string[];
  modifiedFiles: string[];
  stagedFiles: string[];
}

export class GitStatusChecker {
  constructor(private readonly gitClient: GitClient) {}

  public async getStatus(cwd?: string): Promise<RepositoryStatus> {
    const branchRes = await this.gitClient.exec(['branch', '--show-current'], cwd);
    if (branchRes.exitCode !== 0) {
      throw new GitSafetyError(`Failed to determine current Git branch: ${branchRes.stderr}`);
    }
    const currentBranch = branchRes.stdout || 'unknown';

    const statusRes = await this.gitClient.exec(['status', '--porcelain'], cwd);
    if (statusRes.exitCode !== 0) {
      throw new GitSafetyError(`Failed to get Git status: ${statusRes.stderr}`);
    }

    const untrackedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const stagedFiles: string[] = [];

    const lines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const indexStatus = line.charAt(0);
      const workTreeStatus = line.charAt(1);
      const filename = line.slice(3).trim();

      if (indexStatus === '?' && workTreeStatus === '?') {
        untrackedFiles.push(filename);
        continue;
      }

      if (['M', 'A', 'D', 'R', 'C'].includes(indexStatus)) {
        stagedFiles.push(filename);
      }

      if (['M', 'D', 'U'].includes(workTreeStatus)) {
        modifiedFiles.push(filename);
      }
    }

    // A working tree is clean if no modified or staged files exist
    const isClean = modifiedFiles.length === 0 && stagedFiles.length === 0;

    return {
      currentBranch,
      isClean,
      untrackedFiles,
      modifiedFiles,
      stagedFiles,
    };
  }

  public async getTrackedFiles(pattern?: string, cwd?: string): Promise<string[]> {
    const args = ['ls-files'];
    if (pattern) {
      args.push(pattern);
    }
    const res = await this.gitClient.exec(args, cwd);
    if (res.exitCode !== 0) {
      throw new GitSafetyError(`Failed to list tracked files: ${res.stderr}`);
    }

    if (!res.stdout) return [];
    return res.stdout.split('\n').map((f) => f.trim()).filter((f) => f.length > 0);
  }
}
