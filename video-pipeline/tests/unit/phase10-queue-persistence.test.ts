/**
 * Phase 10 Unit Tests: Queue Persistence
 *
 * Tests:
 * 1. QueueStore saves active queue items to JSON
 * 2. QueueStore restores valid items from disk
 * 3. QueueStore discards missing/deleted video files during restore
 * 4. InputController properly integrates QueueStore save & restore lifecycle
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueueStore } from '../../app/application/queue-store.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { VideoInput } from '../../app/application/video-input.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.resolve(currentDir, '../../temp/phase10_queue_test');
const queueFile = path.join(tempDir, 'queue.json');

class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov', '.mkv']);
  }

  public override async inspectFile(filePath: string) {
    return {
      valid: true,
      metadata: {
        filename: path.basename(filePath),
        absolutePath: filePath,
        extension: '.mp4',
        fileSize: 4_096_000,
        duration: 120,
        durationFormatted: '02:00',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4000,
        containerFormat: 'mp4',
      },
      errors: [],
    };
  }
}

const TEST_CONFIG: PipelineConfig = {
  version: '1.0.0',
  portfolioPath: tempDir,
  productionUrl: 'https://pdp212.github.io/',
  git: { repository: 'pdp212/pdp212.github.io', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
  r2: { bucket: 'pdp212-profile', publicBaseUrl: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev' },
  manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
  encoding: {
    videoCodec: 'libx264', audioCodec: 'aac', preset: 'medium', crf: 22, pixelFormat: 'yuv420p',
  },
  supportedInputFormats: ['.mp4', '.mov'],
  outputFormat: '.mp4',
  directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
  testCommands: [],
  timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

describe('Phase 10: Persistent Video Queue', () => {
  let sampleVideoPath: string;

  before(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    sampleVideoPath = path.join(tempDir, 'sample.mp4');
    fs.writeFileSync(sampleVideoPath, Buffer.from('dummy mp4 content'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('QueueStore saves queue items to file and restores them', async () => {
    const queueStore = new QueueStore(queueFile);
    const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());

    await queue.add(sampleVideoPath);
    assert.strictEqual(queue.size(), 1);

    queueStore.save(queue.getAll());
    assert.ok(fs.existsSync(queueFile));

    // Restore into a fresh queue
    const freshQueue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());
    const restoredCount = await queueStore.restore(freshQueue, freshQueue.getInspector());

    assert.strictEqual(restoredCount, 1);
    assert.strictEqual(freshQueue.size(), 1);
    assert.strictEqual(freshQueue.getAll()[0]?.path, sampleVideoPath);
  });

  test('QueueStore ignores missing files on disk during restore', async () => {
    const queueStore = new QueueStore(queueFile);

    const items: VideoInput[] = [
      {
        id: 'missing_item',
        path: '/non/existent/video.mp4',
        fileName: 'video.mp4',
        extension: '.mp4',
        size: 1000,
        status: 'READY',
        validation: { valid: true, errors: [] },
        addedAt: new Date().toISOString(),
      },
      {
        id: 'existing_item',
        path: sampleVideoPath,
        fileName: 'sample.mp4',
        extension: '.mp4',
        size: 1000,
        status: 'READY',
        validation: { valid: true, errors: [] },
        addedAt: new Date().toISOString(),
      },
    ];

    queueStore.save(items);

    const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());
    const restoredCount = await queueStore.restore(queue, queue.getInspector());

    assert.strictEqual(restoredCount, 1);
    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(queue.getAll()[0]?.path, sampleVideoPath);
  });

  test('InputController automatically persists on add and clears on clearQueue', async () => {
    const queueStore = new QueueStore(queueFile);
    const logger = new PipelineLogger({ minLevel: 'ERROR' });
    const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());
    const controller = new InputController(TEST_CONFIG, queue, logger, queueStore);

    await controller.addVideos([sampleVideoPath]);
    assert.strictEqual(controller.getSummary().total, 1);

    // Verify file written
    const raw = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    assert.strictEqual(raw.items.length, 1);

    // Clear queue
    controller.clearQueue();
    const rawCleared = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    assert.strictEqual(rawCleared.items.length, 0);
  });
});
