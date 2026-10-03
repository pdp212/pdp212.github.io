/**
 * Git Safety Engine Unit Tests
 * Verifies strict branch controls, secret tracking prevention, gitignore validation, and transition protection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitSafetyEngine } from '../../engines/git/git-safety.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

describe('GitSafetyEngine Unit Tests', () => {
  it('assertSafePush allows normal push to main branch and blocks force push or wrong branch', () => {
    // Normal push on main allowed
    assert.doesNotThrow(() => {
      GitSafetyEngine.assertSafePush('main', 'main', false);
    });

    // Force push strictly prohibited
    assert.throws(
      () => GitSafetyEngine.assertSafePush('main', 'main', true),
      (err: any) => err instanceof GitSafetyError && err.message.includes('Force push')
    );

    // Wrong branch strictly prohibited
    assert.throws(
      () => GitSafetyEngine.assertSafePush('feature/new-video', 'main', false),
      (err: any) => err instanceof GitSafetyError && err.message.includes('Automated push only allowed on branch')
    );
  });

  it('assertNoTrackedSecrets rejects .env or credential file tracking in Git index', () => {
    assert.doesNotThrow(() => {
      GitSafetyEngine.assertNoTrackedSecrets(['index.html', 'src/app.js', 'package.json']);
    });

    // .env.example is an intentional non-secret template and must be allowed
    assert.doesNotThrow(() => {
      GitSafetyEngine.assertNoTrackedSecrets(['.env.example', 'video-pipeline/.env.example']);
    });

    assert.throws(
      () => GitSafetyEngine.assertNoTrackedSecrets(['.env', 'src/app.js']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('tracking environment/credential files')
    );

    assert.throws(
      () => GitSafetyEngine.assertNoTrackedSecrets(['config/.env.local']),
      (err: any) => err instanceof GitSafetyError && err.message.includes('tracking environment/credential files')
    );
  });

  it('assertNoTrackedProjectVideos rejects project and transition video binaries from Git tracking', () => {
    // Allows clean files
    assert.doesNotThrow(() => {
      GitSafetyEngine.assertNoTrackedProjectVideos([
        'index.html',
        'src/app.js',
        'style.css',
      ]);
    });

    // Rejects project videos
    assert.throws(
      () => GitSafetyEngine.assertNoTrackedProjectVideos([
        'assets/videos/projects/WED_PHUNGTUONG.mp4',
      ]),
      (err: any) => err instanceof GitSafetyError && err.message.includes('tracking production video binaries')
    );

    // Rejects transition videos
    assert.throws(
      () => GitSafetyEngine.assertNoTrackedProjectVideos([
        'assets/transitions/intro.mp4',
      ]),
      (err: any) => err instanceof GitSafetyError && err.message.includes('tracking production video binaries')
    );
  });

  it('assertGitignoreRules validates required rules for project videos, secrets, and transition video isolation', () => {
    const validGitignore = [
      '# Secrets',
      '.env',
      '.env.*',
      '# Project Videos',
      'assets/videos/projects/*.mp4',
      'assets/transitions/*.mp4',
    ].join('\n');

    const result = GitSafetyEngine.assertGitignoreRules(validGitignore);
    assert.equal(result.valid, true);

    // Missing project video rule
    const missingVideoRule = '.env\nnode_modules/\nassets/transitions/*.mp4';
    assert.throws(
      () => GitSafetyEngine.assertGitignoreRules(missingVideoRule),
      (err: any) => err instanceof GitSafetyError && err.message.includes('assets/videos/projects/*.mp4')
    );

    // Missing .env rule
    const missingEnvRule = 'assets/videos/projects/*.mp4\nassets/transitions/*.mp4\nnode_modules/\n';
    assert.throws(
      () => GitSafetyEngine.assertGitignoreRules(missingEnvRule),
      (err: any) => err instanceof GitSafetyError && err.message.includes('.env')
    );

    // Missing transition rule
    const missingTransitionRule = [
      '.env',
      'assets/videos/projects/*.mp4',
    ].join('\n');
    assert.throws(
      () => GitSafetyEngine.assertGitignoreRules(missingTransitionRule),
      (err: any) => err instanceof GitSafetyError && err.message.includes('assets/transitions')
    );
  });
});
