/**
 * Unit Test: Output Validator
 * Verifies post-encoding compliance against production profile and source properties.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OutputValidator, type ExpectedSourceProps } from '../../engines/video/output-validator.js';
import { VideoProbeService } from '../../engines/video/ffprobe.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';
import type { EncodingConfig } from '../../config/schema/index.js';

class MockProbeService extends VideoProbeService {
  constructor(private readonly mockMeta: DetailedVideoMetadata) {
    super();
  }

  public override async probe(_filePath: string): Promise<DetailedVideoMetadata> {
    return this.mockMeta;
  }
}

describe('Output Validator Service', () => {
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

  const validSource: ExpectedSourceProps = {
    width: 1920,
    height: 1080,
    fps: 25,
    hasAudio: true,
    durationSeconds: 120,
  };

  test('validates compliant H.264 / AAC 1080p MP4 file successfully', async () => {
    const tmpPath = '/tmp/test_valid_output.mp4';
    fs.writeFileSync(tmpPath, 'valid output file simulation');

    try {
      const mockMeta: DetailedVideoMetadata = {
        filename: 'test_valid_output.mp4',
        absolutePath: tmpPath,
        extension: '.mp4',
        fileSize: 10485760,
        duration: 120,
        durationFormatted: '02:00',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4500,
        containerFormat: 'mp4',
      };

      const validator = new OutputValidator(new MockProbeService(mockMeta));
      const result = await validator.validate(tmpPath, validSource, baseConfig);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  test('detects resolution mismatch between source and output', async () => {
    const tmpPath = '/tmp/test_mismatch_res.mp4';
    fs.writeFileSync(tmpPath, 'dummy data');

    try {
      const mismatchMeta: DetailedVideoMetadata = {
        filename: 'test_mismatch_res.mp4',
        absolutePath: tmpPath,
        extension: '.mp4',
        fileSize: 1024,
        duration: 10,
        durationFormatted: '00:10',
        width: 1280, // Mismatch from 1920
        height: 720,  // Mismatch from 1080
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 2000,
        containerFormat: 'mp4',
      };

      const validator = new OutputValidator(new MockProbeService(mismatchMeta));
      const report = await validator.validate(tmpPath, validSource, baseConfig);

      assert.strictEqual(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes('Resolution mismatch')));
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  test('detects missing audio when source contained audio', async () => {
    const tmpPath = '/tmp/test_missing_audio.mp4';
    fs.writeFileSync(tmpPath, 'dummy data');

    try {
      const noAudioMeta: DetailedVideoMetadata = {
        filename: 'test_missing_audio.mp4',
        absolutePath: tmpPath,
        extension: '.mp4',
        fileSize: 1024,
        duration: 10,
        durationFormatted: '00:10',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'none',
        audioChannels: 0,
        audioSampleRate: 0,
        bitrateKbps: 2000,
        containerFormat: 'mp4',
      };

      const validator = new OutputValidator(new MockProbeService(noAudioMeta));
      const report = await validator.validate(tmpPath, validSource, baseConfig);

      assert.strictEqual(report.valid, false);
      assert.ok(report.errors.some((e) => e.includes('Expected audio stream')));
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });
});
