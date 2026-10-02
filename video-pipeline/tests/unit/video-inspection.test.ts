/**
 * Unit Test: Video Inspector Validation & Stream Checks
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';

describe('Video Inspector Service', () => {
  const inspector = new VideoInspector(['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm']);

  test('rejects non-existent file path with clear error', async () => {
    const result = await inspector.inspectFile('/tmp/absolutely_non_existent_file_12345.mp4');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('does not exist')));
  });

  test('validates extracted metadata correctly', () => {
    const validMeta: DetailedVideoMetadata = {
      filename: 'sample.mp4',
      absolutePath: '/path/sample.mp4',
      extension: '.mp4',
      fileSize: 1048576,
      duration: 60,
      durationFormatted: '01:00',
      width: 1920,
      height: 1080,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioChannels: 2,
      audioSampleRate: 48000,
      bitrateKbps: 3000,
      containerFormat: 'mp4',
    };

    const validation = inspector.validateMetadata(validMeta);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  test('fails validation when video stream is missing or dimensions are 0', () => {
    const audioOnlyMeta: DetailedVideoMetadata = {
      filename: 'podcast.mp4',
      absolutePath: '/path/podcast.mp4',
      extension: '.mp4',
      fileSize: 1048576,
      duration: 60,
      durationFormatted: '01:00',
      width: 0,
      height: 0,
      fps: 0,
      videoCodec: 'none',
      audioCodec: 'aac',
      audioChannels: 2,
      audioSampleRate: 48000,
      bitrateKbps: 128,
      containerFormat: 'mp4',
    };

    const validation = inspector.validateMetadata(audioOnlyMeta);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('No video stream detected')));
    assert.ok(validation.errors.some((e) => e.includes('Dimensions must be greater than 0')));
  });
});
