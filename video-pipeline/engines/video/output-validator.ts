/**
 * Encoded Output Validator
 * Verifies that the transcoded video strictly conforms to the production profile
 * and matches the source media properties (resolution, aspect ratio, frame rate, audio).
 */

import fs from 'node:fs';
import path from 'node:path';
import { VideoProbeService } from './ffprobe.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';
import type { EncodingConfig } from '../../config/schema/index.js';
import { EncodingValidationError } from '../../core/errors/pipeline-errors.js';

export interface OutputValidationReport {
  valid: boolean;
  metadata?: DetailedVideoMetadata;
  errors: string[];
}

export interface ExpectedSourceProps {
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  durationSeconds: number;
}

export class OutputValidator {
  constructor(private readonly probeService: VideoProbeService = new VideoProbeService()) {}

  /**
   * Performs deep inspection on the newly encoded MP4 output.
   */
  public async validate(
    outputPath: string,
    sourceProps: ExpectedSourceProps,
    config: EncodingConfig
  ): Promise<OutputValidationReport> {
    const errors: string[] = [];
    const resolvedPath = path.resolve(outputPath);

    // 1. File Existence & Size Checks
    if (!fs.existsSync(resolvedPath)) {
      return {
        valid: false,
        errors: [`Encoded output file does not exist at: ${resolvedPath}`],
      };
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.size === 0) {
      return {
        valid: false,
        errors: [`Encoded output file is 0 bytes: ${resolvedPath}`],
      };
    }

    // 2. FFprobe Deep Probe
    let meta: DetailedVideoMetadata;
    try {
      meta = await this.probeService.probe(resolvedPath);
    } catch (err) {
      return {
        valid: false,
        errors: [`Failed to probe encoded output: ${(err as Error).message}`],
      };
    }

    // 3. Container & Video Stream Checks
    if (meta.extension !== '.mp4') {
      errors.push(`Expected MP4 container, got extension '${meta.extension}'.`);
    }

    const expectedVideoCodec = (config.videoCodec || 'libx264').replace('lib', '');
    if (!meta.videoCodec.includes(expectedVideoCodec) && meta.videoCodec !== 'h264' && meta.videoCodec !== 'avc1') {
      errors.push(`Expected video codec '${expectedVideoCodec}', got '${meta.videoCodec}'.`);
    }

    if (meta.duration <= 0) {
      errors.push(`Invalid encoded duration: ${meta.duration}s.`);
    }

    // 4. Resolution Preservation
    if (config.preserveResolution ?? true) {
      if (meta.width !== sourceProps.width || meta.height !== sourceProps.height) {
        errors.push(
          `Resolution mismatch: Expected ${sourceProps.width}x${sourceProps.height}, got ${meta.width}x${meta.height}.`
        );
      }
    }

    // 5. Frame Rate Preservation (with float precision tolerance)
    if (config.preserveFrameRate ?? true) {
      if (sourceProps.fps > 0) {
        const diff = Math.abs(meta.fps - sourceProps.fps);
        // Allow up to 0.1 fps difference due to fractional frame rate rounding (e.g. 29.97 vs 30)
        if (diff > 0.1) {
          errors.push(`Frame rate mismatch: Expected ${sourceProps.fps} fps, got ${meta.fps} fps.`);
        }
      }
    }

    // 6. Audio Stream Checks
    if (sourceProps.hasAudio) {
      if (!meta.audioCodec || meta.audioCodec === 'none') {
        errors.push('Expected audio stream in encoded output, but none was detected.');
      } else {
        if (!meta.audioCodec.includes('aac')) {
          errors.push(`Expected AAC audio codec, got '${meta.audioCodec}'.`);
        }
        if (meta.audioChannels !== (config.audioChannels || 2)) {
          errors.push(`Expected ${config.audioChannels || 2} audio channels, got ${meta.audioChannels}.`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, metadata: meta, errors };
    }

    return { valid: true, metadata: meta, errors: [] };
  }

  /**
   * Helper that throws EncodingValidationError if invalid.
   */
  public async assertValid(
    outputPath: string,
    sourceProps: ExpectedSourceProps,
    config: EncodingConfig
  ): Promise<DetailedVideoMetadata> {
    const report = await this.validate(outputPath, sourceProps, config);
    if (!report.valid || !report.metadata) {
      throw new EncodingValidationError(
        `Encoded output failed verification against production profile: ${report.errors.join('; ')}`,
        { outputPath, errors: report.errors }
      );
    }
    return report.metadata;
  }
}
