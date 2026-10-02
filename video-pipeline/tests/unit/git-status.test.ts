/**
 * Git Status Checker Unit Tests
 * Verifies parsing of git status porcelain output, branch discovery, and file listing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitStatusChecker } from '../../engines/git/git-status.js';
import type { GitClient, GitExecResult } from '../../engines/git/git-client.js';

describe('GitStatusChecker Unit Tests', () => {
  it('parses porcelain status output correctly into structured state', async () => {
    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        if (args[0] === 'branch') {
          return { stdout: 'main', stderr: '', exitCode: 0 };
        }
        if (args[0] === 'status') {
          return {
            stdout: [
              '?? new-untracked.txt',
              ' M modified-working-tree.js',
              'M  staged-modification.json',
              'A  new-staged-file.ts',
            ].join('\n'),
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    const checker = new GitStatusChecker(mockClient);
    const status = await checker.getStatus();

    assert.equal(status.currentBranch, 'main');
    assert.equal(status.isClean, false);
    assert.deepEqual(status.untrackedFiles, ['new-untracked.txt']);
    assert.deepEqual(status.modifiedFiles, ['modified-working-tree.js']);
    assert.deepEqual(status.stagedFiles, ['staged-modification.json', 'new-staged-file.ts']);
  });

  it('reports isClean: true when there are no modified or staged files', async () => {
    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        if (args[0] === 'branch') {
          return { stdout: 'main', stderr: '', exitCode: 0 };
        }
        if (args[0] === 'status') {
          return {
            stdout: '?? untracked-only.txt\n',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    const checker = new GitStatusChecker(mockClient);
    const status = await checker.getStatus();

    assert.equal(status.isClean, true);
    assert.equal(status.untrackedFiles.length, 1);
  });

  it('retrieves tracked files list and filters cleanly', async () => {
    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        if (args[0] === 'ls-files') {
          return {
            stdout: 'index.html\nstyle.css\nsrc/app.js\n',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    const checker = new GitStatusChecker(mockClient);
    const files = await checker.getTrackedFiles();

    assert.equal(files.length, 3);
    assert.deepEqual(files, ['index.html', 'style.css', 'src/app.js']);
  });
});
