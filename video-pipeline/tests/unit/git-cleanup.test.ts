/**
 * Git Cleanup Service Unit Tests
 * Verifies detection and untracking of legacy project videos while preserving UI transition videos.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GitCleanupService } from '../../engines/git/git-cleanup.js';
import type { GitClient, GitExecResult } from '../../engines/git/git-client.js';

describe('GitCleanupService Unit Tests', () => {
  it('findTrackedProjectVideos identifies project videos and preserves transition videos', async () => {
    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        if (args[0] === 'ls-files') {
          return {
            stdout: [
              'index.html',
              'assets/transitions/intro.mp4',
              'assets/transitions/home-to-work.mp4',
              'assets/videos/projects/LEGACY_1.mp4',
              'assets/videos/projects/LEGACY_2.mov',
            ].join('\n'),
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    const cleanup = new GitCleanupService(mockClient);
    const trackedProjectVideos = await cleanup.findTrackedProjectVideos();

    assert.equal(trackedProjectVideos.length, 2);
    assert.ok(trackedProjectVideos.includes('assets/videos/projects/LEGACY_1.mp4'));
    assert.ok(trackedProjectVideos.includes('assets/videos/projects/LEGACY_2.mov'));
    // Ensures transition videos are strictly excluded
    assert.ok(!trackedProjectVideos.includes('assets/transitions/intro.mp4'));
  });

  it('removeTrackedBinaries executes git rm --cached in live mode and removes local files', async () => {
    const executedCommands: string[][] = [];

    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        executedCommands.push(args);
        if (args[0] === 'ls-files') {
          return {
            stdout: 'assets/videos/projects/TEST_VIDEO.mp4\n',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    // Create temporary workspace with local legacy file
    const tmpRoot = path.join(os.tmpdir(), `git-cleanup-test-${Date.now()}`);
    const localProjDir = path.join(tmpRoot, 'assets/videos/projects');
    fs.mkdirSync(localProjDir, { recursive: true });
    const localFilePath = path.join(localProjDir, 'TEST_VIDEO.mp4');
    fs.writeFileSync(localFilePath, 'dummy video');

    const cleanup = new GitCleanupService(mockClient);
    const result = await cleanup.removeTrackedBinaries(tmpRoot, false);

    assert.equal(result.untrackedCount, 1);
    assert.equal(result.removedLocalCount, 1);
    assert.ok(!fs.existsSync(localFilePath), 'Local fallback video must be deleted');

    // Verify git rm --cached was invoked
    const rmCmd = executedCommands.find((c) => c[0] === 'rm' && c[1] === '--cached');
    assert.ok(rmCmd, 'git rm --cached command must be executed');
    assert.ok(rmCmd?.includes('assets/videos/projects/TEST_VIDEO.mp4'));

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('dry-run mode reports files without executing git rm or unlinking local files', async () => {
    const executedCommands: string[][] = [];

    const mockClient: GitClient = {
      async exec(args: string[]): Promise<GitExecResult> {
        executedCommands.push(args);
        if (args[0] === 'ls-files') {
          return {
            stdout: 'assets/videos/projects/DRY_RUN_VIDEO.mp4\n',
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    const tmpRoot = path.join(os.tmpdir(), `git-cleanup-dry-${Date.now()}`);
    const localProjDir = path.join(tmpRoot, 'assets/videos/projects');
    fs.mkdirSync(localProjDir, { recursive: true });
    const localFilePath = path.join(localProjDir, 'DRY_RUN_VIDEO.mp4');
    fs.writeFileSync(localFilePath, 'dummy video');

    const cleanup = new GitCleanupService(mockClient);
    const result = await cleanup.removeTrackedBinaries(tmpRoot, true);

    assert.equal(result.untrackedCount, 1);
    assert.equal(result.removedLocalCount, 1);
    // In dry-run, file on disk must NOT be deleted
    assert.ok(fs.existsSync(localFilePath), 'Local file must remain intact in dry-run');

    // Verify git rm --cached was NOT executed
    const rmCmd = executedCommands.find((c) => c[0] === 'rm');
    assert.equal(rmCmd, undefined);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});
