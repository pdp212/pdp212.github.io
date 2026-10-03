/**
 * Phase 09 End-to-End Integration Test
 *
 * Verifies complete pipeline flow from browser upload:
 * 1. Upload video file via POST /api/upload
 * 2. Verify queue populated and metadata ready
 * 3. Run dry-run pipeline on the staged upload via POST /api/pipeline/run
 * 4. Verify all pipeline stages execute and complete successfully
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov', '.mkv']);
  }

  public override async inspectFile(filePath: string) {
    const filename = path.basename(filePath);
    return {
      valid: true,
      metadata: {
        filename,
        absolutePath: filePath,
        extension: path.extname(filePath).toLowerCase(),
        fileSize: 8_388_608,
        duration: 90,
        durationFormatted: '01:30',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4500,
        containerFormat: 'mp4',
      },
      errors: [],
    };
  }
}

const stagingDir = path.join(os.tmpdir(), `phase09_e2e_staging_${Date.now()}`);

const TEST_CONFIG: PipelineConfig = {
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
  manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
  encoding: {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    preset: 'medium',
    crf: 18,
    pixelFormat: 'yuv420p',
  },
  supportedInputFormats: ['.mp4', '.mov', '.mkv'],
  outputFormat: '.mp4',
  directories: {
    temp: './temp',
    encoded: './encoded',
    completed: './completed',
    failed: './failed',
  },
  testCommands: [],
  timeout: {
    validationMs: 5000,
    encodingMs: 5000,
    uploadMs: 5000,
    verificationMs: 5000,
    githubActionsMs: 5000,
    smokeTestMs: 5000,
  },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

describe('Phase 09: End-to-End Upload to Pipeline Execution', () => {
  before(() => {
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {}
    }
  });

  test('uploads video through UI endpoint and executes dry-run pipeline successfully', async () => {
    const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const controller = new InputController(TEST_CONFIG, queue, logger);
    const server = new PipelineUiServer(controller, logger, {
      port: 3501,
      host: '127.0.0.1',
      stagingDirOverride: stagingDir,
    });

    const url = await server.start();
    try {
      // 1. Upload Video via /api/upload
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('e2e integration video bytes')], { type: 'video/mp4' }),
        'EVENT_HIGHLIGHT.mp4'
      );

      const uploadRes = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(uploadRes.status, 200);
      const uploadData = await uploadRes.json();
      assert.strictEqual(uploadData.success, true);
      assert.strictEqual(uploadData.fileName, 'EVENT_HIGHLIGHT.mp4');

      // 2. Verify Queue State
      const queueRes = await fetch(`${url}/api/queue`);
      assert.strictEqual(queueRes.status, 200);
      const queueData = await queueRes.json();
      assert.strictEqual(queueData.total, 1);
      assert.strictEqual(queueData.ready, 1);
      assert.strictEqual(queueData.items[0].fileName, 'EVENT_HIGHLIGHT.mp4');

      // 3. Execute Pipeline Run in Dry-Run mode
      const runRes = await fetch(`${url}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDryRun: true }),
      });
      assert.strictEqual(runRes.status, 202);

      // 4. Poll Status until completed
      let completed = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const statusRes = await fetch(`${url}/api/pipeline/status`);
        const statusData = await statusRes.json();
        if (statusData.result === 'success') {
          completed = true;
          break;
        }
      }

      assert.strictEqual(completed, true, 'Pipeline should finish with success result');
    } finally {
      await server.stop();
    }
  });
});
