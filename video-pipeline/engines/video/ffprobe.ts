/**
 * FFprobe Interface & Metadata Extractor
 * Executes native ffprobe CLI to extract comprehensive video and audio stream metadata.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import type { DetailedVideoMetadata } from '../../app/application/video-input.js';
import { VideoInspectionError } from '../../core/errors/pipeline-errors.js';

const execFileAsync = promisify(execFile);

export interface RawProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
}

export interface RawProbeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

export interface RawProbeOutput {
  streams?: RawProbeStream[];
  format?: RawProbeFormat;
}

export interface FFprobeEngine {
  probe(filePath: string): Promise<DetailedVideoMetadata>;
  checkFFprobeInstalled(): Promise<boolean>;
}

export class VideoProbeService implements FFprobeEngine {
  private ffprobeBinaryPath: string | null = null;

  constructor(customBinaryPath?: string) {
    if (customBinaryPath) {
      this.ffprobeBinaryPath = customBinaryPath;
    }
  }

  /**
   * Discovers and verifies the ffprobe binary location.
   */
  public async getBinaryPath(): Promise<string> {
    if (this.ffprobeBinaryPath) return this.ffprobeBinaryPath;

    // Check common locations
    const candidatePaths = ['ffprobe', '/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];
    for (const bin of candidatePaths) {
      try {
        await execFileAsync(bin, ['-version']);
        this.ffprobeBinaryPath = bin;
        return bin;
      } catch {
        continue;
      }
    }

    throw new VideoInspectionError('ffprobe executable not found on host system.');
  }

  public async checkFFprobeInstalled(): Promise<boolean> {
    try {
      await this.getBinaryPath();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper to convert fractional frame rate string (e.g. "25/1", "30000/1001") to number.
   */
  private parseFrameRate(rateStr?: string): number {
    if (!rateStr) return 0;
    if (rateStr.includes('/')) {
      const [num, den] = rateStr.split('/').map(Number);
      if (den && den > 0) {
        return Math.round((num / den) * 100) / 100;
      }
    }
    const parsed = Number(rateStr);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }

  /**
   * Formats seconds into MM:SS or HH:MM:SS string.
   */
  public formatDuration(totalSeconds: number): string {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  /**
   * Executes ffprobe on the target file and parses detailed metadata.
   */
  public async probe(filePath: string): Promise<DetailedVideoMetadata> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new VideoInspectionError(`File does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new VideoInspectionError(`Path is not a regular file: ${resolvedPath}`);
    }

    const binary = await this.getBinaryPath();
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      resolvedPath,
    ];

    let rawStdout: string;
    try {
      const { stdout } = await execFileAsync(binary, args);
      rawStdout = stdout;
    } catch (err) {
      throw new VideoInspectionError(
        `Failed to inspect file with ffprobe: ${(err as Error).message}`,
        { filePath: resolvedPath }
      );
    }

    let parsed: RawProbeOutput;
    try {
      parsed = JSON.parse(rawStdout);
    } catch {
      throw new VideoInspectionError('Invalid JSON output received from ffprobe.', { rawStdout });
    }

    const streams = parsed.streams || [];
    const format = parsed.format || {};

    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const durationSeconds = Number(format.duration || videoStream?.duration || 0);
    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;
    const fps = this.parseFrameRate(videoStream?.r_frame_rate || videoStream?.avg_frame_rate);
    const videoCodec = videoStream?.codec_name || 'none';
    const audioCodec = audioStream?.codec_name || 'none';
    const audioChannels = audioStream?.channels || 0;
    const audioSampleRate = Number(audioStream?.sample_rate || 0);

    let bitrateKbps = 0;
    if (format.bit_rate) {
      bitrateKbps = Math.round(Number(format.bit_rate) / 1000);
    } else if (videoStream?.bit_rate) {
      bitrateKbps = Math.round(Number(videoStream.bit_rate) / 1000);
    }

    const filename = path.basename(resolvedPath);
    const extension = path.extname(filename).toLowerCase();

    return {
      filename,
      absolutePath: resolvedPath,
      extension,
      fileSize: stat.size,
      duration: durationSeconds,
      durationFormatted: this.formatDuration(durationSeconds),
      width,
      height,
      fps,
      videoCodec,
      audioCodec,
      audioChannels,
      audioSampleRate,
      bitrateKbps,
      containerFormat: format.format_name || extension.replace('.', ''),
    };
  }
}
