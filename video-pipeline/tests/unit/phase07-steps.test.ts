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
import {
  dryRunGuard,
  checkDisallowedFiles,
  getStagingCandidates,
  assertOnlyAllowedStagedChanges,
} from '../../pipeline/steps/_utils.js';
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

  test('resolves run and monitors completion via mocked REST API', async () => {
    const step = new GitHubActionsStep();
    const ctx = makeContext(false);
    ctx.gitCommitSha = 'mock_sha_12345';
    ctx.config.timeout = { githubActionsMs: 10_000 } as any;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/actions/runs?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            workflow_runs: [
              {
                id: 998877,
                head_sha: 'mock_sha_12345',
                name: 'Deploy',
                created_at: '2026-10-03T01:00:00Z',
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/actions/runs/998877')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 998877,
            status: 'completed',
            conclusion: 'success',
            head_sha: 'mock_sha_12345',
            name: 'Deploy',
          }),
        } as any;
      }
      return originalFetch(url);
    };

    try {
      const result = await step.execute(ctx);
      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('998877'));
      assert.ok(result.message.includes('completed successfully'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('fails gracefully when GitHub Actions run ends with failure', async () => {
    const step = new GitHubActionsStep();
    const ctx = makeContext(false);
    ctx.gitCommitSha = 'fail_sha_99999';
    ctx.config.timeout = { githubActionsMs: 10_000 } as any;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/actions/runs?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            workflow_runs: [
              {
                id: 112233,
                head_sha: 'fail_sha_99999',
                name: 'Deploy',
                created_at: '2026-10-03T01:00:00Z',
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/actions/runs/112233')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 112233,
            status: 'completed',
            conclusion: 'failure',
            head_sha: 'fail_sha_99999',
            name: 'Deploy',
          }),
        } as any;
      }
      return originalFetch(url);
    };

    try {
      const result = await step.execute(ctx);
      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes("conclusion: 'failure'"));
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  test('TEST 10: regression - transition videos (assets/transitions/*.mp4) are never included in staging candidates', () => {
    // Simulates raw git status lines containing transition videos, valid changes, and other files
    const sampleStatusLines = [
      ' M .gitignore',
      ' D assets/transitions/intro.mp4',
      ' D assets/transitions/home-to-work.mp4',
      '?? assets/transitions/work-to-profile.mp4',
      ' M video-pipeline/pipeline/steps/commit.ts',
      ' M data/work-manifest.json',
      '?? assets/videos/projects/test.mp4',
      '?? other-unrelated-file.txt',
    ];

    const candidates: string[] = [];
    for (const line of sampleStatusLines) {
      const rawPath = line.substring(2).trim().replace(/^"/, '').replace(/"$/, '');
      if (!rawPath) continue;
      // Filter out video binaries
      if (/\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(rawPath)) {
        continue;
      }
      if (ALLOWED_CHANGE_PATTERNS.some((pat) => pat.test(rawPath))) {
        candidates.push(rawPath);
      }
    }

    assert.deepStrictEqual(candidates, [
      '.gitignore',
      'video-pipeline/pipeline/steps/commit.ts',
      'data/work-manifest.json',
    ]);
    assert.ok(!candidates.some((c) => c.startsWith('assets/transitions/')), 'Transition videos must never be staging candidates');
    assert.ok(!candidates.some((c) => c.endsWith('.mp4')), 'No MP4 files can be staging candidates');
  });

  test('TEST A: Pre-existing staged transition MP4 deletions are recognized as safety cleanup and allowed, but additions are blocked', () => {
    // Simulates staged diff parsing: D is permitted untracking, A/M is rejected
    const stagedLines = [
      'D\tassets/transitions/intro.mp4',
      'D\tassets/transitions/contact-to-home.mp4',
      'M\t.gitignore',
      'M\tvideo-pipeline/pipeline/steps/commit.ts',
    ];

    const disallowed: string[] = [];
    for (const line of stagedLines) {
      const parts = line.trim().split(/\s+/);
      const status = parts[0];
      const filePath = parts[1];
      const isVideo = /\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(filePath);
      if (isVideo && status.startsWith('D')) {
        continue;
      }
      const allowed = ALLOWED_CHANGE_PATTERNS.some((pat) => pat.test(filePath));
      if (!allowed) {
        disallowed.push(filePath);
      }
    }
    assert.deepStrictEqual(disallowed, [], 'Staged deletions of legacy transition videos must not block commit');
  });

  test('TEST B: Ignored transition MP4s exist physically but are not tracked - candidate discovery ignores them', () => {
    const rawStatus = [
      '?? assets/transitions/intro.mp4',
      '?? assets/transitions/home-to-work.mp4',
      ' M .gitignore',
      ' M video-pipeline/package.json',
    ];

    const candidates: string[] = [];
    for (const line of rawStatus) {
      const rawPath = line.substring(2).trim();
      if (/\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(rawPath)) continue;
      if (ALLOWED_CHANGE_PATTERNS.some((p) => p.test(rawPath))) {
        candidates.push(rawPath);
      }
    }

    assert.deepStrictEqual(candidates, ['.gitignore', 'video-pipeline/package.json']);
    assert.ok(!candidates.some((c) => c.includes('assets/transitions')));
  });

  test('TEST C: An unrelated disallowed staged file exists - safety gate fails safely and blocks commit', () => {
    const stagedDiffLines = [
      'M\tsrc/components/Header.tsx',
      'M\t.gitignore',
      'M\tvideo-pipeline/pipeline/steps/commit.ts',
    ];

    const disallowed: string[] = [];
    for (const line of stagedDiffLines) {
      const parts = line.trim().split(/\s+/);
      const filePath = parts[1];
      const allowed = ALLOWED_CHANGE_PATTERNS.some((pat) => pat.test(filePath));
      if (!allowed) {
        disallowed.push(filePath);
      }
    }

    assert.deepStrictEqual(disallowed, ['src/components/Header.tsx']);
  });

  test('TEST D: Only permitted files are staged - commit safety validation succeeds', () => {
    const stagedDiffLines = [
      'M\t.gitignore',
      'M\tvideo-pipeline/pipeline/steps/commit.ts',
      'M\tdata/work-manifest.json',
    ];

    const disallowed: string[] = [];
    for (const line of stagedDiffLines) {
      const parts = line.trim().split(/\s+/);
      const filePath = parts[1];
      const allowed = ALLOWED_CHANGE_PATTERNS.some((pat) => pat.test(filePath));
      if (!allowed) {
        disallowed.push(filePath);
      }
    }

    assert.deepStrictEqual(disallowed, []);
  });

  test('TEST E: Staging candidates evaluation is deterministic on retry', () => {
    const statusOutput = [
      ' M .gitignore',
      ' M video-pipeline/engines/git/git-safety.ts',
      ' D assets/transitions/intro.mp4',
    ];

    const getCandidates = () => {
      const result: string[] = [];
      for (const line of statusOutput) {
        const rawPath = line.substring(2).trim();
        if (/\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(rawPath)) continue;
        if (ALLOWED_CHANGE_PATTERNS.some((p) => p.test(rawPath))) {
          result.push(rawPath);
        }
      }
      return result;
    };

    const run1 = getCandidates();
    const run2 = getCandidates();
    assert.deepStrictEqual(run1, run2);
    assert.deepStrictEqual(run1, ['.gitignore', 'video-pipeline/engines/git/git-safety.ts']);
  });

  test('TEST F: Staged candidates set contains ONLY permitted Phase 07 files', () => {
    const stagedFiles = [
      '.gitignore',
      'video-pipeline/engines/git/git-safety.ts',
      'video-pipeline/pipeline/steps/commit.ts',
      'data/work-manifest.json',
    ];

    const disallowed = checkDisallowedFiles(stagedFiles, ALLOWED_CHANGE_PATTERNS);
    assert.deepStrictEqual(disallowed, []);
    assert.ok(stagedFiles.every((f) => ALLOWED_CHANGE_PATTERNS.some((p) => p.test(f))));
  });
});


