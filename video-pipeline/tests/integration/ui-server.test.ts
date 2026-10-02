/**
 * Integration Test: Local UI Server Endpoints
 * Verifies that the UI server serves the HTML page and responds properly to queue API requests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov']);
  }

  public override async inspectFile(filePath: string) {
    return {
      valid: true,
      metadata: {
        filename: 'server_test.mp4',
        absolutePath: filePath,
        extension: '.mp4',
        fileSize: 2048000,
        duration: 30,
        durationFormatted: '00:30',
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 2000,
        containerFormat: 'mp4',
      },
      errors: [],
    };
  }
}

describe('Pipeline UI Server Integration', () => {
  const mockConfig: PipelineConfig = {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: { repository: 'repo', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
    r2: { bucket: 'b', publicBaseUrl: 'https://cdn.dev' },
    manifest: { relativeFilePath: 'manifest.json', atomicBackup: true },
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
    supportedInputFormats: ['.mp4', '.mov'],
    outputFormat: '.mp4',
    directories: { temp: './t', encoded: './e', completed: './c', failed: './f' },
    testCommands: [],
    timeout: { validationMs: 1, encodingMs: 1, uploadMs: 1, verificationMs: 1, githubActionsMs: 1, smokeTestMs: 1 },
    retryPolicy: { maxRetries: 1, initialDelayMs: 1, backoffFactor: 1 },
  };

  test('serves UI page and handles API queue operations', async () => {
    const queue = new VideoQueue(mockConfig.supportedInputFormats, new MockVideoInspector());
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const controller = new InputController(mockConfig, queue, logger);

    const testPort = 3289;
    const server = new PipelineUiServer(controller, logger, { port: testPort, host: '127.0.0.1' });
    const baseUrl = await server.start();

    try {
      // 1. GET / (HTML Page)
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.strictEqual(htmlRes.status, 200);
      const html = await htmlRes.text();
      assert.ok(html.includes('Video Pipeline'));
      assert.ok(html.includes('Drop video files here'));

      // 2. GET /api/queue (Empty initially)
      const qRes = await fetch(`${baseUrl}/api/queue`);
      assert.strictEqual(qRes.status, 200);
      const qData = await qRes.json();
      assert.strictEqual(qData.total, 0);

      // 3. POST /api/queue/add
      const addRes = await fetch(`${baseUrl}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/video1.mp4', '/mock/video2.mov'] }),
      });
      assert.strictEqual(addRes.status, 200);
      const addData = await addRes.json();
      assert.strictEqual(addData.count, 2);

      // 4. Verify updated queue
      const qUpdatedRes = await fetch(`${baseUrl}/api/queue`);
      const qUpdatedData = await qUpdatedRes.json();
      assert.strictEqual(qUpdatedData.total, 2);
      assert.strictEqual(qUpdatedData.ready, 2);

      // 5. GET /api/context
      const ctxRes = await fetch(`${baseUrl}/api/context`);
      assert.strictEqual(ctxRes.status, 200);
      const ctxData = await ctxRes.json();
      assert.strictEqual(ctxData.itemCount, 2);
      assert.strictEqual(ctxData.currentStage, 'IDLE');

      // 6. POST /api/queue/clear
      const clearRes = await fetch(`${baseUrl}/api/queue/clear`, { method: 'POST' });
      assert.strictEqual(clearRes.status, 200);

      const qEmptyRes = await fetch(`${baseUrl}/api/queue`);
      const qEmptyData = await qEmptyRes.json();
      assert.strictEqual(qEmptyData.total, 0);
    } finally {
      await server.stop();
    }
  });
});
