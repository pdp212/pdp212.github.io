/**
 * Git Client Unit Tests
 * Verifies command execution and strict enforcement of forbidden destructive operations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StandardGitClient } from '../../engines/git/git-client.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

describe('StandardGitClient Unit Tests', () => {
  const client = new StandardGitClient(process.cwd());

  it('executes safe git commands successfully', async () => {
    const res = await client.exec(['version']);
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.startsWith('git version'));
  });

  it('blocks forbidden filter-repo command', async () => {
    await assert.rejects(
      async () => client.exec(['filter-repo', '--analyze']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('strictly forbidden')
    );
  });

  it('blocks forbidden filter-branch command', async () => {
    await assert.rejects(
      async () => client.exec(['filter-branch', '--tree-filter']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('strictly forbidden')
    );
  });

  it('blocks forbidden rebase command', async () => {
    await assert.rejects(
      async () => client.exec(['rebase', 'origin/main']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('strictly forbidden')
    );
  });

  it('blocks force push flags (--force, -f, --force-with-lease)', async () => {
    await assert.rejects(
      async () => client.exec(['push', '--force']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('Force push')
    );

    await assert.rejects(
      async () => client.exec(['push', '-f']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('Force push')
    );

    await assert.rejects(
      async () => client.exec(['push', '--force-with-lease']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('Force push')
    );
  });

  it('blocks git reset --hard', async () => {
    await assert.rejects(
      async () => client.exec(['reset', '--hard', 'HEAD~1']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('reset --hard')
    );
  });
});
