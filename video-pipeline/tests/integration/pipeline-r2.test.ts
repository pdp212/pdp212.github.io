import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import { UploadR2Step } from '../../pipeline/steps/upload-r2.js';
import { VerifyR2Step } from '../../pipeline/steps/verify-r2.js';
import { VerifyStreamStep } from '../../pipeline/steps/verify-stream.js';
import type { R2Uploader } from '../../engines/r2/uploader.js';
import type { R2Verifier } from '../../engines/r2/verifier.js';
import type { StreamVerifier } from '../../engines/r2/stream-verifier.js';

describe('Phase 04 Pipeline R2 End-to-End Integration', () => {
  const dummyFile = path.resolve('temp/pipeline_r2_dummy.mp4');

  before(() => {
    fs.mkdirSync(path.dirname(dummyFile), { recursive: true });
    fs.writeFileSync(dummyFile, Buffer.from('FAKE_ENCODED_MP4_VIDEO_FOR_INTEGRATION_TEST'));
  });

  after(() => {
    try {
      fs.unlinkSync(dummyFile);
    } catch {}
  });

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

  it('16. Batch 4/4 success: all 4 items pass Upload -> Verify R2 -> Verify Stream, halts before Manifest', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_batch_success',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_batch_success'),
      currentStage: 'ENCODING',
      items: [
        { id: '1', sourcePath: dummyFile, filename: 'p1.mp4', tag: 'TAG', name: 'V1', targetKey: 'V1.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '2', sourcePath: dummyFile, filename: 'p2.mp4', tag: 'TAG', name: 'V2', targetKey: 'V2.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '3', sourcePath: dummyFile, filename: 'p3.mp4', tag: 'TAG', name: 'V3', targetKey: 'V3.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '4', sourcePath: dummyFile, filename: 'p4.mp4', tag: 'TAG', name: 'V4', targetKey: 'V4.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
      ],
    };

    const mockUploader: R2Uploader = {
      upload: async (f, k) => ({
        localPath: f,
        fileName: path.basename(f),
        objectKey: k,
        publicUrl: `https://pub-test.r2.dev/${k}`,
        size: 1000,
        contentType: 'video/mp4',
        status: 'UPLOADED',
        etag: 'etag_ok',
      }),
      uploadMany: async () => [],
    };

    const mockVerifier: R2Verifier = {
      verifyObject: async (k) => ({
        key: k,
        exists: true,
        contentLength: 1000,
        contentType: 'video/mp4',
        matchesLocalSize: true,
        passed: true,
      }),
      verifyMany: async () => [],
    };

    const mockStreamVerifier: StreamVerifier = {
      testRangeRequest: async (u) => ({
        url: u,
        statusCode: 206,
        isPartialContent: true,
        contentType: 'video/mp4',
        contentRange: 'bytes 0-1048575/10000',
        rangeVerified: true,
        passed: true,
        durationMs: 20,
      }),
      verifyRange: async (u) => mockStreamVerifier.testRangeRequest(u),
      verifyVideoStream: async (u) => mockStreamVerifier.testRangeRequest(u),
      verifyMany: async () => [],
    };

    const customSteps = [
      new UploadR2Step(mockUploader),
      new VerifyR2Step(mockVerifier),
      new VerifyStreamStep(mockStreamVerifier),
    ];

    const orchestrator = new VideoPipelineOrchestrator(customSteps);
    const result = await orchestrator.execute(context, 'VERIFYING_STREAM');

    assert.equal(result.success, true);
    assert.equal(result.finalStage, 'VERIFYING_STREAM', 'Must halt at Phase 04 boundary');
    assert.equal(context.items.filter((i) => i.streamVerified).length, 4);
    assert.equal(context.items.filter((i) => i.r2ObjectVerified).length, 4);
    assert.equal(context.items.filter((i) => i.r2UploadStatus === 'UPLOADED').length, 4);
  });

  it('17. Batch 3/4 failure: stops pipeline immediately when item 3 fails stream verification', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_batch_fail',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_batch_fail'),
      currentStage: 'ENCODING',
      items: [
        { id: '1', sourcePath: dummyFile, filename: 'p1.mp4', tag: 'TAG', name: 'V1', targetKey: 'V1.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '2', sourcePath: dummyFile, filename: 'p2.mp4', tag: 'TAG', name: 'V2', targetKey: 'V2.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '3', sourcePath: dummyFile, filename: 'p3.mp4', tag: 'TAG', name: 'V3', targetKey: 'V3.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
        { id: '4', sourcePath: dummyFile, filename: 'p4.mp4', tag: 'TAG', name: 'V4', targetKey: 'V4.mp4', encodedLocalPath: dummyFile, status: 'ENCODED' },
      ],
    };

    const mockUploader: R2Uploader = {
      upload: async (f, k) => ({
        localPath: f,
        fileName: path.basename(f),
        objectKey: k,
        publicUrl: `https://pub-test.r2.dev/${k}`,
        size: 1000,
        contentType: 'video/mp4',
        status: 'UPLOADED',
        etag: 'etag_ok',
      }),
      uploadMany: async () => [],
    };

    const mockVerifier: R2Verifier = {
      verifyObject: async (k) => ({
        key: k,
        exists: true,
        contentLength: 1000,
        contentType: 'video/mp4',
        matchesLocalSize: true,
        passed: true,
      }),
      verifyMany: async () => [],
    };

    const mockStreamVerifier: StreamVerifier = {
      testRangeRequest: async (u) => {
        if (u.includes('V3.mp4')) {
          return {
            url: u,
            statusCode: 200,
            isPartialContent: false,
            rangeVerified: false,
            passed: false,
            durationMs: 25,
            error: 'Server responded with HTTP 200 OK instead of required HTTP 206 Partial Content.',
          };
        }
        return {
          url: u,
          statusCode: 206,
          isPartialContent: true,
          contentType: 'video/mp4',
          contentRange: 'bytes 0-1048575/10000',
          rangeVerified: true,
          passed: true,
          durationMs: 20,
        };
      },
      verifyRange: async (u) => mockStreamVerifier.testRangeRequest(u),
      verifyVideoStream: async (u) => mockStreamVerifier.testRangeRequest(u),
      verifyMany: async () => [],
    };

    const customSteps = [
      new UploadR2Step(mockUploader),
      new VerifyR2Step(mockVerifier),
      new VerifyStreamStep(mockStreamVerifier),
    ];

    const orchestrator = new VideoPipelineOrchestrator(customSteps);
    const result = await orchestrator.execute(context, 'VERIFYING_STREAM');

    assert.equal(result.success, false);
    assert.equal(result.finalStage, 'FAILED');
    assert.equal(context.items[2].status, 'FAILED');
    assert.equal(context.items[2].streamVerified, false);
  });
});
