/**
 * FFmpeg Command Builder & Process Runner
 * Executes external FFmpeg CLI with streaming progress monitoring, exit code verification,
 * and graceful process termination upon cancellation.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { EncodingConfig } from '../../config/schema/index.js';
import {
  FFmpegNotFoundError,
  EncodingProcessError,
  EncodingCancelledError,
} from '../../core/errors/pipeline-errors.js';

const execFileAsync = promisify(execFile);

export interface EncodeProgress {
  percent: number;
  fps: number;
  currentTimeSeconds: number;
  totalDurationSeconds?: number;
  speed?: string;
  bitrateKbps?: number;
}

export interface EncodeOptions {
  hasAudio?: boolean;
  totalDurationSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (progress: EncodeProgress) => void;
}

export interface FFmpegEncoder {
  buildArguments(inputPath: string, outputPath: string, config: EncodingConfig, options?: EncodeOptions): string[];
  encode(
    inputPath: string,
    outputPath: string,
    config: EncodingConfig,
    options?: EncodeOptions
  ): Promise<void>;
  checkFFmpegInstalled(): Promise<boolean>;
}

export class VideoTranscoderService implements FFmpegEncoder {
  private ffmpegBinaryPath: string | null = null;

  constructor(customBinaryPath?: string) {
    if (customBinaryPath) {
      this.ffmpegBinaryPath = customBinaryPath;
    }
  }

  /**
   * Discovers and verifies the ffmpeg binary location.
   */
  public async getBinaryPath(): Promise<string> {
    if (this.ffmpegBinaryPath) return this.ffmpegBinaryPath;

    const candidatePaths = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
    for (const bin of candidatePaths) {
      try {
        await execFileAsync(bin, ['-version']);
        this.ffmpegBinaryPath = bin;
        return bin;
      } catch {
        continue;
      }
    }

    throw new FFmpegNotFoundError('ffmpeg executable not found on host system.');
  }

  public async checkFFmpegInstalled(): Promise<boolean> {
    try {
      await this.getBinaryPath();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Constructs the canonical production FFmpeg arguments.
   */
  public buildArguments(
    inputPath: string,
    outputPath: string,
    config: EncodingConfig,
    options?: EncodeOptions
  ): string[] {
    const args: string[] = [
      '-i', inputPath,
      '-c:v', config.videoCodec || 'libx264',
      '-preset', config.preset || 'medium',
      '-crf', String(config.crf ?? 18),
      '-profile:v', config.profile || 'high',
      '-level:v', config.level || '4.2',
      '-pix_fmt', config.pixelFormat || 'yuv420p',
    ];

    // Audio handling: Only include audio encoder if source actually contains an audio stream
    const hasAudio = options?.hasAudio ?? (config.keepAudio ?? true);
    if (hasAudio && config.audioCodec && config.audioCodec !== 'none') {
      args.push(
        '-c:a', config.audioCodec,
        '-b:a', config.audioBitrate || '192k',
        '-ar', String(config.audioSampleRate || 48000),
        '-ac', String(config.audioChannels || 2)
      );
    } else {
      args.push('-an');
    }

    const fastStart = config.fastStart ?? config.faststart ?? true;
    if (fastStart) {
      args.push('-movflags', '+faststart');
    }

    // Force overwrite for temporary working files
    args.push('-y', outputPath);

    return args;
  }

  /**
   * Parses time string (HH:MM:SS.ms) into total seconds.
   */
  private parseTime(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }

  /**
   * Executes FFmpeg transcoding asynchronously with cancellation support and progress streaming.
   */
  public async encode(
    inputPath: string,
    outputPath: string,
    config: EncodingConfig,
    options?: EncodeOptions
  ): Promise<void> {
    const binary = await this.getBinaryPath();
    const args = this.buildArguments(inputPath, outputPath, config, options);

    // Ensure output parent directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise<void>((resolve, reject) => {
      let isAborted = false;
      const stderrChunks: string[] = [];
      const totalDuration = options?.totalDurationSeconds || 0;

      const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });

      // Signal / Cancellation Handler
      const abortHandler = () => {
        isAborted = true;
        child.kill('SIGINT');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 1500);
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          abortHandler();
        } else {
          options.signal.addEventListener('abort', abortHandler, { once: true });
        }
      }

      // Progress stream parsing from stderr
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (data: string) => {
        stderrChunks.push(data);
        if (stderrChunks.length > 50) stderrChunks.shift(); // Keep last 50 lines

        if (options?.onProgress) {
          // Parse time=HH:MM:SS.xx
          const timeMatch = data.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
          const fpsMatch = data.match(/fps=\s*(\d+\.?\d*)/);
          const speedMatch = data.match(/speed=\s*(\d+\.?\d*)x/);
          const bitrateMatch = data.match(/bitrate=\s*(\d+\.?\d*)kbits\/s/);

          if (timeMatch) {
            const currentTimeSeconds = this.parseTime(timeMatch[1]);
            let percent = 0;
            if (totalDuration > 0) {
              percent = Math.min(100, Math.round((currentTimeSeconds / totalDuration) * 100));
            }

            options.onProgress({
              percent,
              fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
              currentTimeSeconds,
              totalDurationSeconds: totalDuration,
              speed: speedMatch ? `${speedMatch[1]}x` : undefined,
              bitrateKbps: bitrateMatch ? parseFloat(bitrateMatch[1]) : undefined,
            });
          }
        }
      });

      child.on('error', (err) => {
        if (options?.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
        reject(new EncodingProcessError(`Failed to spawn FFmpeg process: ${err.message}`));
      });

      child.on('close', (code) => {
        if (options?.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }

        if (isAborted) {
          // Clean up incomplete temporary output
          if (fs.existsSync(outputPath)) {
            try {
              fs.unlinkSync(outputPath);
            } catch {}
          }
          return reject(new EncodingCancelledError('Encoding cancelled by user request.'));
        }

        if (code !== 0) {
          // Clean up incomplete temporary output
          if (fs.existsSync(outputPath)) {
            try {
              fs.unlinkSync(outputPath);
            } catch {}
          }

          const tailErr = stderrChunks.join('').slice(-1000);
          return reject(
            new EncodingProcessError(`FFmpeg process failed with exit code ${code}. Error log: ${tailErr}`, {
              exitCode: code,
              tailLog: tailErr,
              inputPath,
              outputPath,
            })
          );
        }

        resolve();
      });
    });
  }
}
