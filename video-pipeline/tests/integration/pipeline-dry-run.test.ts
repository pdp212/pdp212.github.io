/**
 * Integration Test: Pipeline Dry-Run Execution
 * Tests end-to-end simulated run without mutating R2, Git, or Production.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineContext } from '../../pipeline/context.js';
import type { PipelineConfig } from '../../config/schema/index.js';

describe('Pipeline Dry Run Integration', () => {
  test('executes all steps end-to-end in dry-run mode without external mutations', async () => {
    const mockConfig: PipelineConfig = {
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
        faststart: true,
        pixelFormat: 'yuv420p',
        maxBitrate: '4M',
        bufferSize: '8M',
        maxResolution: { width: 1920, height: 1080 },
        keepAudio: true,
      },
      supportedInputFormats: ['.mp4', '.mov', '.mkv'],
      outputFormat: '.mp4',
      directories: {
        temp: './temp',
        encoded: './encoded',
        completed: './completed',
        failed: './failed',
      },
      testCommands: ['node scripts/validate.js'],
      timeout: {
        validationMs: 1000,
        encodingMs: 1000,
        uploadMs: 1000,
        verificationMs: 1000,
        githubActionsMs: 1000,
        smokeTestMs: 1000,
      },
      retryPolicy: {
        maxRetries: 1,
        initialDelayMs: 100,
        backoffFactor: 1,
      },
    };

    const pipelineId = `dryrun_${Date.now()}`;
    const logger = new PipelineLogger({ minLevel: 'WARN' }); // Quiet during test
    const stateStore = new PipelineStateStore(pipelineId, true);

    const context: PipelineContext = {
      pipelineId,
      isDryRun: true,
      config: mockConfig,
      logger,
      stateStore,
      items: [
        {
          id: 'test_item_1',
          sourcePath: '/path/to/test.mp4',
          filename: 'test.mp4',
          tag: 'COMMERCIAL',
          name: 'TEST_VIDEO',
          targetKey: 'COMMERCIAL_TEST_VIDEO.mp4',
          status: 'PENDING',
        },
      ],
      currentStage: 'IDLE',
    };

    const orchestrator = new VideoPipelineOrchestrator();
    const result = await orchestrator.execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.finalStage, 'COMPLETED');
    assert.strictEqual(result.results.length, 12);
  });
});
