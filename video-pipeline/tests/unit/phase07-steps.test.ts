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
import { CommitStep } from '../../pipeline/steps/commit.js';
import { PushStep } from '../../pipeline/steps/push.js';
import { GitHubActionsStep } from '../../pipeline/steps/github-actions.js';
import { ProductionSmokeStep } from '../../pipeline/steps/production-smoke.js';
import { dryRunGuard } from '../../pipeline/steps/_utils.js';
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
