/**
 * Unit Test: FFmpeg Command Builder & Encoder Service
 * Verifies canonical production argument generation, audio stream handling, and presets.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VideoTranscoderService } from '../../engines/video/ffmpeg.js';
import type { EncodingConfig } from '../../config/schema/index.js';

describe('Video Transcoder Service (FFmpeg)', () => {
  const encoder = new VideoTranscoderService();
  const baseConfig: EncodingConfig = {
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
  };

  test('constructs canonical production FFmpeg arguments with audio', () => {
    const args = encoder.buildArguments('/input/video.mov', '/output/video.mp4', baseConfig, {
      hasAudio: true,
    });

    assert.ok(args.includes('-i'));
    assert.ok(args.includes('/input/video.mov'));
    assert.ok(args.includes('libx264'));
    assert.ok(args.includes('18'));
    assert.ok(args.includes('medium'));
    assert.ok(args.includes('high'));
    assert.ok(args.includes('4.2'));
    assert.ok(args.includes('yuv420p'));
    assert.ok(args.includes('aac'));
    assert.ok(args.includes('192k'));
    assert.ok(args.includes('48000'));
    assert.ok(args.includes('2'));
    assert.ok(args.includes('+faststart'));
    assert.strictEqual(args[args.length - 1], '/output/video.mp4');
  });

  test('omits audio stream and includes -an when source has no audio', () => {
    const args = encoder.buildArguments('/input/silent.mov', '/output/silent.mp4', baseConfig, {
      hasAudio: false,
    });

    assert.ok(args.includes('-an'));
    assert.strictEqual(args.includes('aac'), false);
    assert.strictEqual(args.includes('192k'), false);
  });

  test('locates system ffprobe/ffmpeg binary successfully', async () => {
    const isInstalled = await encoder.checkFFmpegInstalled();
    assert.strictEqual(isInstalled, true);
    const binPath = await encoder.getBinaryPath();
    assert.ok(binPath.length > 0);
  });
});
