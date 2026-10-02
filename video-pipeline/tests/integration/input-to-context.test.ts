/**
 * Integration Test: Input -> Queue -> Inspection -> PipelineContext Handoff
 * Verifies that the explicit architecture boundary is respected and no execution occurs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../../app/application/input-controller.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import { InputError } from '../../core/errors/pipeline-errors.js';

class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm']);
  }

  public override async inspectFile(filePath: string) {
    if (filePath.includes('corrupted')) {
      return {
        valid: false,
        errors: ['Corrupted file header.'],
      };
    }

    const filename = filePath.split('/').pop() || 'test.mp4';
    return {
      valid: true,
      metadata: {
        filename,
        absolutePath: filePath,
        extension: '.mp4',
        fileSize: 15728640,
        duration: 180,
        durationFormatted: '03:00',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4500,
        containerFormat: 'mov,mp4',
      },
      errors: [],
    };
  }
}

describe('Input to PipelineContext Handoff Integration', () => {
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
    supportedInputFormats: ['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm'],
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

  test('successfully hands off READY queue items to PipelineContext without execution', async () => {
    const queue = new VideoQueue(mockConfig.supportedInputFormats, new MockVideoInspector());
    const controller = new InputController(mockConfig, queue);

    await controller.addVideos([
      '/master/WED_PHUNGTUONG_MASTER.mov',
      '/master/COMMERCIAL_NIKE_MASTER.mp4',
      '/master/corrupted_bad.mov',
    ]);

    const summary = controller.getSummary();
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.ready, 2);
    assert.strictEqual(summary.invalid, 1);

    // Prepare PipelineContext
    const context = controller.preparePipelineContext(true);

    assert.strictEqual(context.items.length, 2);
    assert.strictEqual(context.inputs?.length, 2);
    assert.strictEqual(context.currentStage, 'IDLE'); // Execution must NOT have begun
    assert.strictEqual(context.items[0].filename, 'WED_PHUNGTUONG_MASTER.mov');
    assert.strictEqual(context.items[0].tag, 'WED');
    assert.strictEqual(context.items[1].tag, 'COMMERCIAL');
  });

  test('throws InputError if attempting to prepare context with no READY items', () => {
    const queue = new VideoQueue(mockConfig.supportedInputFormats, new MockVideoInspector());
    const controller = new InputController(mockConfig, queue);

    assert.throws(
      () => controller.preparePipelineContext(),
      (err: Error) => err instanceof InputError && err.message.includes('No validated READY videos')
    );
  });
});
