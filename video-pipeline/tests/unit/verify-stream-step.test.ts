import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VerifyStreamStep } from '../../pipeline/steps/verify-stream.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { StreamVerifier } from '../../engines/r2/stream-verifier.js';

describe('VerifyStreamStep Pipeline Unit Test', () => {
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

  it('dry-run sets streamVerified: true without network calls', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_dry_stream',
      isDryRun: true,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_dry_stream'),
      currentStage: 'VERIFYING_STREAM',
      items: [
        {
          id: 's_1',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_1',
          targetKey: 'WED_1.mp4',
          objectKey: 'WED_1.mp4',
          r2PublicUrl: 'https://pub-test.r2.dev/WED_1.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const step = new VerifyStreamStep();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(context.items[0].streamVerified, true);
    assert.equal(context.items[0].http206Verified, true);
    assert.equal(context.items[0].streamStatus, 'VERIFIED');
  });

  it('live stream verification passes when HTTP 206 partial content succeeds', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_live_stream',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_live_stream'),
      currentStage: 'VERIFYING_STREAM',
      items: [
        {
          id: 's_2',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_2',
          targetKey: 'WED_2.mp4',
          objectKey: 'WED_2.mp4',
          r2PublicUrl: 'https://pub-test.r2.dev/WED_2.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const mockVerifier: StreamVerifier = {
      testRangeRequest: async (url) => ({
        url,
        statusCode: 206,
        isPartialContent: true,
        contentType: 'video/mp4',
        contentRange: 'bytes 0-1048575/50000000',
        rangeVerified: true,
        passed: true,
        durationMs: 35,
      }),
      verifyRange: async (url) => mockVerifier.testRangeRequest(url),
      verifyVideoStream: async (url) => mockVerifier.testRangeRequest(url),
      verifyMany: async () => [],
    };

    const step = new VerifyStreamStep(mockVerifier);
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(context.items[0].streamVerified, true);
    assert.equal(context.items[0].http206Verified, true);
    assert.equal(context.items[0].streamStatus, 'VERIFIED');
  });

  it('live stream verification fails when server returns HTTP 200 instead of 206', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_fail_stream',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_fail_stream'),
      currentStage: 'VERIFYING_STREAM',
      items: [
        {
          id: 's_3',
          sourcePath: '/path/video.mov',
          filename: 'video.mov',
          tag: 'WED',
          name: 'WED_3',
          targetKey: 'WED_3.mp4',
          objectKey: 'WED_3.mp4',
          r2PublicUrl: 'https://pub-test.r2.dev/WED_3.mp4',
          status: 'UPLOADED',
        },
      ],
    };

    const mockVerifier: StreamVerifier = {
      testRangeRequest: async (url) => ({
        url,
        statusCode: 200,
        isPartialContent: false,
        rangeVerified: false,
        passed: false,
        durationMs: 40,
        error: 'Server responded with HTTP 200 OK instead of required HTTP 206 Partial Content.',
      }),
      verifyRange: async (url) => mockVerifier.testRangeRequest(url),
      verifyVideoStream: async (url) => mockVerifier.testRangeRequest(url),
      verifyMany: async () => [],
    };

    const step = new VerifyStreamStep(mockVerifier);
    const result = await step.execute(context);

    assert.equal(result.success, false);
    assert.equal(context.items[0].streamVerified, false);
    assert.equal(context.items[0].status, 'FAILED');
    assert.match(result.message, /HTTP 200 OK instead of required HTTP 206/);
  });
});
