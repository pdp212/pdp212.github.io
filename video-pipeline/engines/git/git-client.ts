/**
 * Git Client Implementation
 * Executes Git CLI operations safely with parameter validation and destructive command prevention.
 */

import { spawn } from 'node:child_process';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitClient {
  exec(args: string[], cwd?: string): Promise<GitExecResult>;
}

export class StandardGitClient implements GitClient {
  private static readonly FORBIDDEN_SUBCOMMANDS = [
    'filter-repo',
    'filter-branch',
    'rebase',
  ];

  constructor(private readonly defaultCwd: string) {}

  public async exec(args: string[], cwd?: string): Promise<GitExecResult> {
    const targetCwd = cwd || this.defaultCwd;

    // Safety checks against destructive git commands
    for (const arg of args) {
      if (StandardGitClient.FORBIDDEN_SUBCOMMANDS.includes(arg)) {
        throw new GitSafetyError(`Destructive git command '${arg}' is strictly forbidden by pipeline policy.`);
      }
      if (arg === '--force' || arg === '-f' || arg.startsWith('--force-with-lease')) {
        throw new GitSafetyError('Force push and forced git operations are strictly forbidden.');
      }
      if (args[0] === 'reset' && arg === '--hard') {
        throw new GitSafetyError('git reset --hard is strictly forbidden by pipeline safety policy.');
      }
    }

    return new Promise<GitExecResult>((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: targetCwd,
        env: { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new GitSafetyError(`Git execution failed to spawn: ${err.message}`));
      });

      child.on('close', (code) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0,
        });
      });
    });
  }
}
