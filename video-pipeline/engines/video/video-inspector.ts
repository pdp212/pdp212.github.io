/**
 * Video Inspector Service
 * Executes file system checks, format validation, and ffprobe stream verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import { VideoProbeService } from './ffprobe.js';
import type { DetailedVideoMetadata, VideoValidationResult } from '../../app/application/video-input.js';

export interface InspectionResult {
  valid: boolean;
  metadata?: DetailedVideoMetadata;
  errors: string[];
}

export class VideoInspector {
  private readonly probeService: VideoProbeService;
  private readonly supportedExtensions: string[];

  constructor(supportedExtensions: string[], probeService?: VideoProbeService) {
    this.supportedExtensions = supportedExtensions.map((e) => e.toLowerCase());
    this.probeService = probeService || new VideoProbeService();
  }

  /**
   * Complete validation and metadata extraction routine for an input video file.
   */
  public async inspectFile(filePath: string): Promise<InspectionResult> {
    const errors: string[] = [];
    const resolvedPath = path.resolve(filePath);

    // 1. Existence Check
    if (!fs.existsSync(resolvedPath)) {
      return {
        valid: false,
        errors: [`File does not exist: ${resolvedPath}`],
      };
    }

    // 2. Regular File Check
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return {
          valid: false,
          errors: [`Path is a directory or special file, not a video file: ${resolvedPath}`],
        };
      }
    } catch (err) {
      return {
        valid: false,
        errors: [`Cannot access file: ${(err as Error).message}`],
      };
    }

    // 3. Supported Extension Check
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!this.supportedExtensions.includes(ext)) {
      errors.push(
        `Unsupported container format '${ext}'. Supported formats: ${this.supportedExtensions.join(', ')}`
      );
    }

    // 4. File Readability & Size Check
    if (stat.size === 0) {
      errors.push('File is empty (0 bytes).');
    }

    try {
      fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch {
      errors.push('File is not readable (permission denied).');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 5. FFprobe Stream Inspection
    let metadata: DetailedVideoMetadata;
    try {
      metadata = await this.probeService.probe(resolvedPath);
    } catch (err) {
      return {
        valid: false,
        errors: [`FFprobe inspection failed: ${(err as Error).message}`],
      };
    }

    // 6. Detailed Stream Invariants
    if (!metadata.videoCodec || metadata.videoCodec === 'none') {
      errors.push('No video stream detected in media file.');
    }

    if (metadata.width <= 0 || metadata.height <= 0) {
      errors.push(`Invalid video dimensions: ${metadata.width}x${metadata.height}.`);
    }

    if (metadata.duration <= 0) {
      errors.push(`Invalid video duration: ${metadata.duration}s.`);
    }

    if (metadata.fps <= 0) {
      errors.push(`Invalid video frame rate: ${metadata.fps} fps.`);
    }

    return {
      valid: errors.length === 0,
      metadata,
      errors,
    };
  }

  /**
   * Validates already extracted metadata.
   */
  public validateMetadata(metadata: DetailedVideoMetadata): VideoValidationResult {
    const errors: string[] = [];

    if (!metadata.videoCodec || metadata.videoCodec === 'none') {
      errors.push('No video stream detected.');
    }
    if (metadata.width <= 0 || metadata.height <= 0) {
      errors.push('Dimensions must be greater than 0.');
    }
    if (metadata.duration <= 0) {
      errors.push('Duration must be greater than 0.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
