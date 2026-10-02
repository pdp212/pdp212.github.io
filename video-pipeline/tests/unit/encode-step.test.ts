/**
 * Unit Test: EncodeStep
 * Verifies dry run planning, existing file safety gate, and atomic promotion logic.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    // Simulate creating temporary encoded output
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, 'simulated encoded mp4 binary');
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
      fileSize: 1048576,
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

describe('EncodeStep Pipeline Unit Test', () => {
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
      allowOverwrite: false,
    },
    supportedInputFormats: ['.mp4', '.mov'],
    outputFormat: '.mp4',
    directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
    testCommands: [],
    timeout: { validationMs: 1, encodingMs: 1, uploadMs: 1, verificationMs: 1, githubActionsMs: 1, smokeTestMs: 1 },
    retryPolicy: { maxRetries: 1, initialDelayMs: 1, backoffFactor: 1 },
  };

  test('dry-run execution simulates output path without creating files on disk', async () => {
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const stateStore = new PipelineStateStore('test_dry', true);

    const context: PipelineContext = {
      pipelineId: 'test_dry',
      isDryRun: true,
      config: baseConfig,
      logger,
      stateStore,
      items: [
        {
          id: 'item_1',
          sourcePath: '/raw/WED_PHUNGTUONG.mov',
          filename: 'WED_PHUNGTUONG.mov',
          tag: 'WED',
          name: 'PHUNGTUONG',
          targetKey: 'WED_PHUNGTUONG.mp4',
          status: 'VALIDATED',
        },
      ],
      currentStage: 'ENCODING',
    };

    const step = new EncodeStep(new MockVideoEngine());
    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(context.items[0].status, 'ENCODED');
    assert.ok(context.items[0].encodedLocalPath?.endsWith('WED_PHUNGTUONG.mp4'));
  });

  test('blocks encoding and fails safely when output file already exists and allowOverwrite is false', async () => {
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const stateStore = new PipelineStateStore('test_exists', false);

    // Create a mock existing file in encoded/
    const encodedDir = path.resolve(process.cwd(), baseConfig.directories.encoded);
    fs.mkdirSync(encodedDir, { recursive: true });
    const existingFile = path.join(encodedDir, 'WED_PHUNGTUONG.mp4');
    fs.writeFileSync(existingFile, 'pre-existing file');

    try {
      const context: PipelineContext = {
        pipelineId: 'test_exists',
        isDryRun: false,
        config: baseConfig,
        logger,
        stateStore,
        items: [
          {
            id: 'item_exists',
            sourcePath: '/raw/WED_PHUNGTUONG.mov',
            filename: 'WED_PHUNGTUONG.mov',
            tag: 'WED',
            name: 'PHUNGTUONG',
            targetKey: 'WED_PHUNGTUONG.mp4',
            status: 'VALIDATED',
          },
        ],
        currentStage: 'ENCODING',
      };

      const step = new EncodeStep(new MockVideoEngine());
      const result = await step.execute(context);

      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('Target output file already exists'));
      assert.strictEqual(context.items[0].status, 'FAILED');
    } finally {
      if (fs.existsSync(existingFile)) fs.unlinkSync(existingFile);
    }
  });

  test('encodes and atomically finalizes item when allowOverwrite is true or file is new', async () => {
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const stateStore = new PipelineStateStore('test_new', false);

    const context: PipelineContext = {
      pipelineId: 'test_new',
      isDryRun: false,
      config: baseConfig,
      logger,
      stateStore,
      items: [
        {
          id: 'item_new',
          sourcePath: '/raw/BRAND_NEW_FILM.mov',
          filename: 'BRAND_NEW_FILM.mov',
          tag: 'BRAND',
          name: 'NEW_FILM',
          targetKey: 'BRAND_NEW_FILM.mp4',
          sourceMetadata: {
            width: 1920,
            height: 1080,
            durationSeconds: 90,
            bitrateKbps: 4000,
            codec: 'hevc',
            hasAudio: true,
            sizeBytes: 5000000,
          },
          status: 'VALIDATED',
        },
      ],
      currentStage: 'ENCODING',
    };

    const step = new EncodeStep(new MockVideoEngine());
    const result = await step.execute(context);

    try {
      assert.strictEqual(result.success, true);
      assert.strictEqual(context.items[0].status, 'ENCODED');
      assert.ok(context.items[0].encodedLocalPath?.endsWith('BRAND_NEW_FILM.mp4'));
      assert.ok(fs.existsSync(context.items[0].encodedLocalPath!));
    } finally {
      if (context.items[0].encodedLocalPath && fs.existsSync(context.items[0].encodedLocalPath)) {
        fs.unlinkSync(context.items[0].encodedLocalPath);
      }
    }
  });
});
