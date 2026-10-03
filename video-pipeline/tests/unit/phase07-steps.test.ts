/**
 * Phase 07 Step Unit Tests
 *
 * Tests CommitStep, PushStep, GitHubActionsStep, and ProductionSmokeStep in
 * dry-run mode (no external mutations) plus utility module helpers.
 *
 * All tests pass without network access, Git, or a live site.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CommitStep, ALLOWED_CHANGE_PATTERNS } from '../../pipeline/steps/commit.js';
import { PushStep } from '../../pipeline/steps/push.js';
import { GitHubActionsStep } from '../../pipeline/steps/github-actions.js';
import { ProductionSmokeStep } from '../../pipeline/steps/production-smoke.js';
import { dryRunGuard, checkDisallowedFiles } from '../../pipeline/steps/_utils.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineContext } from '../../pipeline/context.js';
import type { PipelineConfig } from '../../config/schema/index.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: {
      repository: 'pdp212/pdp212.github.io',
      branch: 'main',
      requireCleanWorkingTree: true,
      disallowForcePush: true,
    },
    r2: {
      bucket: 'pdp212-profile',
      publicBaseUrl: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev',
    },
    manifest: {
      relativeFilePath: 'data/work-manifest.json',
      atomicBackup: true,
    },
    encoding: {
      videoCodec: 'libx264',
      audioCodec: 'aac',
      preset: 'medium',
      crf: 22,
      pixelFormat: 'yuv420p',
    },
    supportedInputFormats: ['.mp4', '.mov'],
    outputFormat: '.mp4',
    directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
    testCommands: ['npm test'],
    timeout: {
      validationMs: 30_000,
      encodingMs: 300_000,
      uploadMs: 120_000,
      verificationMs: 30_000,
      githubActionsMs: 300_000,
      smokeTestMs: 30_000,
    },
    retryPolicy: { maxRetries: 3, initialDelayMs: 1_000, backoffFactor: 2 },
    ...overrides,
  };
}

function makeContext(isDryRun: boolean, configOverrides?: Partial<PipelineConfig>): PipelineContext {
  const pipelineId = `test_${Date.now()}`;
  return {
    pipelineId,
    isDryRun,
    config: makeConfig(configOverrides),
    logger: new PipelineLogger({ minLevel: 'WARN' }),
    stateStore: new PipelineStateStore(pipelineId, isDryRun),
    items: [],
    currentStage: 'READY_TO_COMMIT',
  };
}

// ---------------------------------------------------------------------------
// dryRunGuard utility
// ---------------------------------------------------------------------------

describe('dryRunGuard utility', () => {
  test('returns null when isDryRun is false', () => {
    const ctx = makeContext(false);
    const result = dryRunGuard('COMMITTING', ctx, 'Should not be used.');
    assert.strictEqual(result, null);
  });

  test('returns successful StepResult when isDryRun is true', () => {
    const ctx = makeContext(true);
    const result = dryRunGuard('COMMITTING', ctx, 'Commit skipped.');
    assert.ok(result !== null);
    assert.strictEqual(result!.success, true);
    assert.ok(result!.message.includes('[DryRun]'));
  });
});

// ---------------------------------------------------------------------------
// CommitStep (dry-run)
// ---------------------------------------------------------------------------

describe('CommitStep – dry-run', () => {
  test('skips commit and returns success in dry-run mode', async () => {
    const step = new CommitStep();
    const ctx = makeContext(true);
    const result = await step.execute(ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stage, 'COMMITTING');
    assert.ok(result.message.includes('[DryRun]'));
  });

  test('exposes the correct stage name', () => {
    assert.strictEqual(new CommitStep().stage, 'COMMITTING');
  });

  test('exposes a human-readable name', () => {
    assert.ok(new CommitStep().name.length > 0);
  });
});

// ---------------------------------------------------------------------------
// PushStep (dry-run)
// ---------------------------------------------------------------------------

describe('PushStep – dry-run', () => {
  test('skips push and returns success in dry-run mode', async () => {
    const step = new PushStep();
    const ctx = makeContext(true);
    const result = await step.execute(ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stage, 'PUSHING');
    assert.ok(result.message.includes('[DryRun]'));
  });

  test('exposes the correct stage name', () => {
    assert.strictEqual(new PushStep().stage, 'PUSHING');
  });
});

// ---------------------------------------------------------------------------
// GitHubActionsStep (dry-run)
// ---------------------------------------------------------------------------

describe('GitHubActionsStep – dry-run', () => {
  test('skips monitoring and returns success in dry-run mode', async () => {
    const step = new GitHubActionsStep();
    const ctx = makeContext(true);
    const result = await step.execute(ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stage, 'WAITING_FOR_GITHUB_ACTIONS');
    assert.ok(result.message.includes('[DryRun]'));
  });

  test('exposes the correct stage name', () => {
    assert.strictEqual(new GitHubActionsStep().stage, 'WAITING_FOR_GITHUB_ACTIONS');
  });
});

// ---------------------------------------------------------------------------
// ProductionSmokeStep (dry-run)
// ---------------------------------------------------------------------------

describe('ProductionSmokeStep – dry-run', () => {
  test('skips smoke test and returns success in dry-run mode', async () => {
    const step = new ProductionSmokeStep();
    const ctx = makeContext(true);
    const result = await step.execute(ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stage, 'PRODUCTION_SMOKE_TEST');
    assert.ok(result.message.includes('[DryRun]'));
  });

  test('exposes the correct stage name', () => {
    assert.strictEqual(new ProductionSmokeStep().stage, 'PRODUCTION_SMOKE_TEST');
  });
});

// ---------------------------------------------------------------------------
// Phase 07 full dry-run sequence (state ordering)
// ---------------------------------------------------------------------------

describe('Phase 07 step sequence validation', () => {
  test('all four steps in Phase 07 return success in dry-run', async () => {
    const steps = [
      new CommitStep(),
      new PushStep(),
      new GitHubActionsStep(),
      new ProductionSmokeStep(),
    ];

    for (const step of steps) {
      const ctx = makeContext(true);
      const result = await step.execute(ctx);
      assert.strictEqual(
        result.success,
        true,
        `${step.name} (${step.stage}) failed in dry-run mode: ${result.message}`
      );
    }
  });

  test('stages are ordered correctly in state machine sequence', () => {
    const expectedOrder = [
      'COMMITTING',
      'PUSHING',
      'WAITING_FOR_GITHUB_ACTIONS',
      'PRODUCTION_SMOKE_TEST',
    ] as const;

    const stepOrder = [
      new CommitStep().stage,
      new PushStep().stage,
      new GitHubActionsStep().stage,
      new ProductionSmokeStep().stage,
    ];

    assert.deepStrictEqual(stepOrder, [...expectedOrder]);
  });
});

// ---------------------------------------------------------------------------
// Phase 07 Commit Safety Gate & Manifest Policy (Phase 10B Regression Tests)
// ---------------------------------------------------------------------------

describe('Phase 07 Commit Safety Gate – Policy Enforcement', () => {
  test('TEST 1: data/work-manifest.json is accepted', () => {
    const disallowed = checkDisallowedFiles(['data/work-manifest.json'], ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, []);
  });

  test('TEST 2: data/other.json is rejected', () => {
    const disallowed = checkDisallowedFiles(['data/other.json'], ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, ['data/other.json']);
  });

  test('TEST 3: data/video.mp4 is rejected', () => {
    const disallowed = checkDisallowedFiles(['data/video.mp4', 'data/clip.mov', 'data/sample.mkv'], ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, ['data/video.mp4', 'data/clip.mov', 'data/sample.mkv']);
  });

  test('TEST 4: .env is rejected', () => {
    const disallowed = checkDisallowedFiles(['.env', '.env.local', '.env.production'], ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, ['.env', '.env.local', '.env.production']);
  });

  test('TEST 5: video-pipeline/** remains accepted', () => {
    const files = [
      'video-pipeline/package.json',
      'video-pipeline/pipeline/steps/commit.ts',
      'video-pipeline/app/ui/server.ts',
      'video-pipeline/core/security/secret-sanitizer.ts',
    ];
    const disallowed = checkDisallowedFiles(files, ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, []);
  });

  test('TEST 6: .gitignore remains accepted', () => {
    const disallowed = checkDisallowedFiles(['.gitignore'], ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, []);
  });

  test('TEST 7: unrelated source files remain rejected', () => {
    const files = ['src/index.html', 'js/main.js', 'styles/main.css', 'README.md'];
    const disallowed = checkDisallowedFiles(files, ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, files);
  });

  test('TEST 8: realistic staged file set (.gitignore, data/work-manifest.json, video-pipeline/...) passes safety gate', () => {
    const stagedSet = [
      '.gitignore',
      'data/work-manifest.json',
      'video-pipeline/package.json',
      'video-pipeline/pipeline/steps/commit.ts',
    ];
    const disallowed = checkDisallowedFiles(stagedSet, ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, [], 'Realistic Phase 07 staged set must have zero disallowed files');
  });

  test('TEST 9: staged set containing data/work-manifest.json and data/video.mp4 fails safety gate', () => {
    const mixedSet = [
      '.gitignore',
      'data/work-manifest.json',
      'data/video.mp4',
    ];
    const disallowed = checkDisallowedFiles(mixedSet, ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, ['data/video.mp4'], 'Only data/video.mp4 must be flagged as disallowed');
  });
});
