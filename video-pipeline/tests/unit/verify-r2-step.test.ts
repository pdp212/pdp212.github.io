import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VerifyR2Step } from '../../pipeline/steps/verify-r2.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { R2Verifier } from '../../engines/r2/verifier.js';

describe('VerifyR2Step Pipeline Unit Test', () => {
  const dummyConfig: PipelineConfig = {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: { repository: 'test/repo', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
    r2: { bucket: 'test-bucket', publicBaseUrl: 'https://pub-test.r2.dev' },
    manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
    encoding: {
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      crf: 18,
      preset: 'medium',
      profile: 'high',
      level: '4.2',
      audioBitrate: '192k',
      audioSampleRate: 48000,
      audioChannels: 2,
      fastStart: true,
      preserveResolution: true,
      preserveFrameRate: true,
      maxConcurrency: 1,
      allowOverwrite: false,
    },
    supportedInputFormats: ['.mp4'],
    outputFormat: '.mp4',
    directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
    testCommands: [],
    timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
    retryPolicy: { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 },
  };

  it('dry-run sets r2ObjectVerified: true without network calls', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_dry_verify',
      isDryRun: true,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_dry_verify'),
      currentStage: 'VERIFYING_R2',
      items: [
        {
          id: 'v_1',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_1',
          targetKey: 'WED_1.mp4',
          objectKey: 'WED_1.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const step = new VerifyR2Step();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(context.items[0].r2ObjectVerified, true);
  });

  it('live verification passes when object exists with matching metadata', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_live_verify',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_live_verify'),
      currentStage: 'VERIFYING_R2',
      items: [
        {
          id: 'v_2',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_2',
          targetKey: 'WED_2.mp4',
          objectKey: 'WED_2.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const mockVerifier: R2Verifier = {
      verifyObject: async (key) => ({
        key,
        exists: true,
        contentLength: 5000,
        contentType: 'video/mp4',
        matchesLocalSize: true,
        passed: true,
      }),
      verifyMany: async () => [],
    };

    const step = new VerifyR2Step(mockVerifier);
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(context.items[0].r2ObjectVerified, true);
  });

  it('live verification fails step when object check fails', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_fail_verify',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_fail_verify'),
      currentStage: 'VERIFYING_R2',
      items: [
        {
          id: 'v_3',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_3',
          targetKey: 'WED_3.mp4',
          objectKey: 'WED_3.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const mockVerifier: R2Verifier = {
      verifyObject: async (key) => ({
        key,
        exists: false,
        matchesLocalSize: false,
        passed: false,
        error: `Object '${key}' not found on R2 (HTTP 404)`,
      }),
      verifyMany: async () => [],
    };

    const step = new VerifyR2Step(mockVerifier);
    const result = await step.execute(context);

    assert.equal(result.success, false);
    assert.equal(context.items[0].r2ObjectVerified, false);
    assert.equal(context.items[0].status, 'FAILED');
    assert.match(result.message, /not found/);
  });
});
