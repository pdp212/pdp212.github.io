/**
 * Integration Test: End-to-End Encoding Execution
 * Verifies that the pipeline executes VALIDATE -> ENCODE and halts without proceeding to R2 or Git.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import { ValidateStep } from '../../pipeline/steps/validate.js';
import { EncodeStep } from '../../pipeline/steps/encode.js';
import { VideoEngine } from '../../engines/video/video-engine.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineContext } from '../../pipeline/context.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';

class MockVideoEngine extends VideoEngine {
  public override async encode(
    _input: string,
    outputPath: string,
    _config: any,
    _options?: any
  ): Promise<void> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, 'integration encoded binary');
  }

  public override async verifyOutput(
    outputPath: string,
    sourceProps: any,
    _config: any
  ): Promise<DetailedVideoMetadata> {
    return {
      filename: path.basename(outputPath),
      absolutePath: outputPath,
      extension: '.mp4',
      fileSize: 2048000,
      duration: sourceProps.durationSeconds || 60,
      durationFormatted: '01:00',
      width: sourceProps.width,
      height: sourceProps.height,
      fps: sourceProps.fps,
      videoCodec: 'h264',
      audioCodec: sourceProps.hasAudio ? 'aac' : 'none',
      audioChannels: sourceProps.hasAudio ? 2 : 0,
      audioSampleRate: sourceProps.hasAudio ? 48000 : 0,
      bitrateKbps: 3000,
      containerFormat: 'mp4',
    };
  }
}

describe('Encoding Pipeline Integration', () => {
  const baseConfig: PipelineConfig = {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: { repository: 'repo', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
    r2: { bucket: 'b', publicBaseUrl: 'https://cdn.dev' },
    manifest: { relativeFilePath: 'manifest.json', atomicBackup: true },
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
      allowOverwrite: true,
    },
    supportedInputFormats: ['.mp4', '.mov', '.mkv'],
    outputFormat: '.mp4',
    directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
    testCommands: [],
    timeout: { validationMs: 1, encodingMs: 1, uploadMs: 1, verificationMs: 1, githubActionsMs: 1, smokeTestMs: 1 },
    retryPolicy: { maxRetries: 1, initialDelayMs: 1, backoffFactor: 1 },
  };

  test('executes VALIDATING -> ENCODING and cleanly halts at ENCODING stage', async () => {
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const stateStore = new PipelineStateStore('test_int', false);

    const context: PipelineContext = {
      pipelineId: 'test_int',
      isDryRun: false,
      config: baseConfig,
      logger,
      stateStore,
      items: [
        {
          id: 'int_item_1',
          sourcePath: '/raw/WED_SAMPLE.mov',
          filename: 'WED_SAMPLE.mov',
          tag: 'WED',
          name: 'SAMPLE',
          targetKey: 'WED_SAMPLE.mp4',
          sourceMetadata: {
            width: 1920,
            height: 1080,
            durationSeconds: 60,
            bitrateKbps: 4500,
            codec: 'prores',
            hasAudio: true,
            sizeBytes: 10000000,
          },
          status: 'PENDING',
        },
      ],
      currentStage: 'IDLE',
    };

    // Orchestrator with our custom EncodeStep and standard steps
    const orchestrator = new VideoPipelineOrchestrator([
      new ValidateStep(),
      new EncodeStep(new MockVideoEngine()),
    ]);

    const result = await orchestrator.execute(context, 'ENCODING');

    try {
      assert.strictEqual(result.success, true);
      assert.strictEqual(context.items[0].status, 'ENCODED');
      assert.ok(context.items[0].encodedLocalPath?.endsWith('WED_SAMPLE.mp4'));
      assert.ok(fs.existsSync(context.items[0].encodedLocalPath!));

      // Assert that R2 or Git stages were NOT run
      assert.strictEqual(result.results.length, 2);
      assert.strictEqual(result.results[0].stage, 'VALIDATING');
      assert.strictEqual(result.results[1].stage, 'ENCODING');
    } finally {
      if (context.items[0].encodedLocalPath && fs.existsSync(context.items[0].encodedLocalPath)) {
        fs.unlinkSync(context.items[0].encodedLocalPath);
      }
    }
  });
});
