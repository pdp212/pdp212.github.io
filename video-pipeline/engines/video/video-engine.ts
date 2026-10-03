/**
 * Unified Video Engine Facade
 * Provides high-level APIs for media probing and filename normalization.
 * Note: Video encoding is performed externally in DaVinci Resolve.
 */

import path from 'node:path';
import { VideoProbeService, type FFprobeEngine } from './ffprobe.js';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';

export class VideoEngine {
  private readonly probeService: FFprobeEngine;

  constructor(probe?: FFprobeEngine) {
    this.probeService = probe || new VideoProbeService();
  }

  public async inspect(filePath: string): Promise<DetailedVideoMetadata> {
    return this.probeService.probe(filePath);
  }

  /**
   * Generates a deterministic, web-safe output filename / target key from an input video path,
   * preserving the original video container format.
   * e.g. "MOTION BRAND FILM.mov" -> "MOTION_BRAND_FILM.mov"
   * e.g. "WED TUTRA.001.mp4" -> "WED_TUTRA.001.mp4"
   */
  public generateDeterministicFilename(inputPath: string): string {
    const rawFilename = path.basename(inputPath);
    const ext = path.extname(rawFilename);
    const baseWithoutExt = path.basename(rawFilename, ext);

    // Normalize: replace spaces and unsafe characters with underscores, collapse consecutive underscores
    const sanitized = baseWithoutExt
      .trim()
      .replace(/[\s\t\n]+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const finalBase = sanitized || 'video';
    return `${finalBase}${ext.toLowerCase() || '.mp4'}`;
  }
}
