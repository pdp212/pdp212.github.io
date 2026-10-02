/**
 * Unified Video Engine Facade
 * Provides high-level APIs for media probing, transcoding, filename normalization,
 * and post-encoding verification.
 */

import path from 'node:path';
import { VideoProbeService, type FFprobeEngine } from './ffprobe.js';
import { VideoTranscoderService, type FFmpegEncoder, type EncodeOptions } from './ffmpeg.js';
import { OutputValidator, type ExpectedSourceProps } from './output-validator.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';
import type { EncodingConfig } from '../../config/schema/index.js';

export class VideoEngine {
  private readonly probeService: FFprobeEngine;
  private readonly encoderService: FFmpegEncoder;
  private readonly outputValidator: OutputValidator;

  constructor(probe?: FFprobeEngine, encoder?: FFmpegEncoder, validator?: OutputValidator) {
    this.probeService = probe || new VideoProbeService();
    this.encoderService = encoder || new VideoTranscoderService();
    this.outputValidator = validator || new OutputValidator();
  }

  public async inspect(filePath: string): Promise<DetailedVideoMetadata> {
    return this.probeService.probe(filePath);
  }

  public async encode(
    inputPath: string,
    outputPath: string,
    config: EncodingConfig,
    options?: EncodeOptions
  ): Promise<void> {
    return this.encoderService.encode(inputPath, outputPath, config, options);
  }

  public async verifyOutput(
    outputPath: string,
    sourceProps: ExpectedSourceProps,
    config: EncodingConfig
  ): Promise<DetailedVideoMetadata> {
    return this.outputValidator.assertValid(outputPath, sourceProps, config);
  }

  /**
   * Generates a deterministic, web-safe output filename from an input video path.
   * e.g. "MOTION BRAND FILM.mov" -> "MOTION_BRAND_FILM.mp4"
   */
  public generateDeterministicFilename(inputPath: string): string {
    const rawFilename = path.basename(inputPath);
    const ext = path.extname(rawFilename);
    const baseWithoutExt = path.basename(rawFilename, ext);

    // Normalize: replace spaces and unsafe characters with underscores, collapse consecutive underscores
    const sanitized = baseWithoutExt
      .trim()
      .replace(/[\s\t\n]+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const finalBase = sanitized || 'video';
    return `${finalBase}.mp4`;
  }
}
