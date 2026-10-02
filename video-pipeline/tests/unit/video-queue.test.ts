/**
 * Unit Test: Video Queue Service
 * Verifies queue item lifecycle, duplicate prevention, removal, and batch ingestion.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';

// Mock Inspector that does not require host ffprobe binary during unit tests
class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm']);
  }

  public override async inspectFile(filePath: string) {
    if (filePath.includes('invalid_corrupt')) {
      return {
        valid: false,
        errors: ['Corrupted video header: unable to parse container.'],
      };
    }

    if (filePath.endsWith('.xyz')) {
      return {
        valid: false,
        errors: ["Unsupported container format '.xyz'."],
      };
    }

    return {
      valid: true,
      metadata: {
        filename: filePath.split('/').pop() || 'test.mp4',
        absolutePath: filePath,
        extension: '.mp4',
        fileSize: 10485760,
        duration: 120,
        durationFormatted: '02:00',
        width: 1920,
        height: 1080,
        fps: 24,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4500,
        containerFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
      },
      errors: [],
    };
  }
}

describe('Video Queue Service', () => {
  test('adds a single video and inspects it to READY status', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    const item = await queue.add('/path/to/wedding_film.mov');

    assert.strictEqual(item.fileName, 'wedding_film.mov');
    assert.strictEqual(item.status, 'READY');
    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(queue.get(item.id)?.status, 'READY');
  });

  test('adds multiple videos in batch and preserves individual states', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    const items = await queue.addMany([
      '/path/to/video1.mp4',
      '/path/to/video2.mov',
      '/path/to/invalid_corrupt.mp4',
    ]);

    assert.strictEqual(items.length, 3);
    assert.strictEqual(queue.size(), 3);
    assert.strictEqual(items[0].status, 'READY');
    assert.strictEqual(items[1].status, 'READY');
    assert.strictEqual(items[2].status, 'INVALID');
    assert.strictEqual(queue.getReady().length, 2);
  });

  test('duplicate detection: does not duplicate file already in queue', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    const first = await queue.add('/path/to/same_video.mp4');
    const second = await queue.add('/path/to/same_video.mp4');

    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(first.id, second.id);
  });

  test('removes item from queue by ID', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    const item = await queue.add('/path/to/remove_me.mp4');
    assert.strictEqual(queue.size(), 1);

    const removed = queue.remove(item.id);
    assert.strictEqual(removed, true);
    assert.strictEqual(queue.size(), 0);
    assert.strictEqual(queue.get(item.id), undefined);
  });

  test('clears entire queue', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    await queue.addMany(['/path/to/v1.mp4', '/path/to/v2.mp4']);
    assert.strictEqual(queue.size(), 2);

    queue.clear();
    assert.strictEqual(queue.size(), 0);
    assert.strictEqual(queue.getAll().length, 0);
  });

  test('marks invalid input as INVALID with descriptive error', async () => {
    const queue = new VideoQueue(['.mp4', '.mov'], new MockVideoInspector());
    const item = await queue.add('/path/to/invalid_corrupt.mp4');

    assert.strictEqual(item.status, 'INVALID');
    assert.ok(item.error?.includes('Corrupted video header'));
    assert.strictEqual(item.validation.valid, false);
  });
});
