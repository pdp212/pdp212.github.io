/**
 * Upload Service
 * Handles browser-native video ingestion via multipart/form-data.
 * Ensures strict security, path sanitization, size limits, staging isolation,
 * FFprobe validation, and queue integration.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { InputController } from './input-controller.js';
import type { PipelineLogger } from '../../core/logger/logger.js';
import type { VideoInput } from './video-input.js';

export interface UploadItemResult {
  success: boolean;
  id?: string;
  fileName: string;
  size?: number;
  path?: string;
  status?: 'READY' | 'INVALID' | 'UPLOAD_FAILED';
  metadata?: {
    duration: number;
    durationFormatted: string;
    durationSeconds?: number;
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
    audioCodec: string;
    containerFormat: string;
  };
  error?: string;
}

export interface UploadBatchResult {
  success: boolean;
  count: number;
  items: UploadItemResult[];
  // Convenience single-file fields
  id?: string;
  fileName?: string;
  size?: number;
  path?: string;
  status?: 'READY' | 'INVALID' | 'UPLOAD_FAILED';
  metadata?: UploadItemResult['metadata'];
  error?: string;
}

export class UploadService {
  private readonly controller: InputController;
  private readonly logger: PipelineLogger;
  private readonly stagingDir: string;
  private readonly supportedExtensions: string[];
  private readonly maxUploadSizeBytes: number;

  constructor(controller: InputController, logger: PipelineLogger, stagingDirOverride?: string) {
    this.controller = controller;
    this.logger = logger;
    const config = controller.getConfig();
    const tempDir = config.directories?.temp || './temp';
    this.stagingDir = stagingDirOverride
      ? path.resolve(stagingDirOverride)
      : path.resolve(process.cwd(), tempDir, 'uploads');

    this.supportedExtensions = (
      config.supportedInputFormats || ['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm']
    ).map((e) => e.toLowerCase());

    // Default 5GB (5368709120 bytes) or configured limit
    this.maxUploadSizeBytes =
      (config as any).maxUploadSizeBytes ||
      (config as any).maxUploadSizeMb
        ? (config as any).maxUploadSizeMb * 1024 * 1024
        : 5 * 1024 * 1024 * 1024;
  }

  public getStagingDir(): string {
    return this.stagingDir;
  }

  public ensureStagingDir(): void {
    if (!fs.existsSync(this.stagingDir)) {
      fs.mkdirSync(this.stagingDir, { recursive: true });
    }
  }

  /**
   * Sanitizes user-provided filename to prevent path traversal and shell injection.
   */
  public sanitizeFileName(rawName: string): { cleanName: string; extension: string } {
    if (!rawName || typeof rawName !== 'string') {
      return { cleanName: `upload_${Date.now()}.mp4`, extension: '.mp4' };
    }
    // 1. Strip null bytes and control chars
    const noCtrl = rawName.replace(/[\0\r\n\t\x08]/g, '');
    // 2. Extract basename only (eliminates ../, .\, and absolute paths)
    const base = path.basename(noCtrl).trim();
    // 3. Extract extension
    const ext = path.extname(base).toLowerCase();
    // 4. Safe base name
    const cleanName = base || `video_${Date.now()}${ext || '.mp4'}`;
    return { cleanName, extension: ext };
  }

  /**
  /**
   * Handles an incoming multipart HTTP request.
   */
  public async handleUploadRequest(req: http.IncomingMessage): Promise<UploadBatchResult> {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return {
        success: false,
        count: 0,
        items: [],
        error: 'Invalid Content-Type. Expected multipart/form-data.',
      };
    }

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
    if (!boundary) {
      return {
        success: false,
        count: 0,
        items: [],
        error: 'Invalid Content-Type. Missing multipart boundary.',
      };
    }

    this.ensureStagingDir();

    try {
      const rawParts = await this.parseMultipartStream(req, boundary);
      if (rawParts.length === 0) {
        return {
          success: false,
          count: 0,
          items: [],
          error: 'No files found in upload request.',
        };
      }

      const results: UploadItemResult[] = [];

      for (const part of rawParts) {
        const rawName = part.rawFilename || 'video.mp4';
        const { cleanName, extension } = this.sanitizeFileName(rawName);

        this.logger.info(
          'VALIDATING',
          'UPLOAD_RECEIVE',
          `Received upload: ${cleanName} (${part.size} bytes)`
        );

        // 1. Supported extension check
        if (!this.supportedExtensions.includes(extension)) {
          if (fs.existsSync(part.filePath)) {
            try { fs.unlinkSync(part.filePath); } catch {}
          }
          const errMsg = `Unsupported container format '${extension}'. Supported formats: ${this.supportedExtensions.join(', ')}`;
          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'INVALID',
            error: errMsg,
          });
          continue;
        }

        // 2. Empty file check
        if (part.size === 0) {
          if (fs.existsSync(part.filePath)) {
            try { fs.unlinkSync(part.filePath); } catch {}
          }
          const errMsg = 'File is empty (0 bytes).';
          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'INVALID',
            error: errMsg,
          });
          continue;
        }

        // 3. Size limit check
        if (part.size > this.maxUploadSizeBytes) {
          if (fs.existsSync(part.filePath)) {
            try { fs.unlinkSync(part.filePath); } catch {}
          }
          const errMsg = `File size exceeds allowed limit of ${Math.round(this.maxUploadSizeBytes / (1024 * 1024))} MB.`;
          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'INVALID',
            error: errMsg,
          });
          continue;
        }

        // 4. Verify written file on disk
        if (!fs.existsSync(part.filePath)) {
          const errMsg = 'Uploaded file could not be verified on disk.';
          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'UPLOAD_FAILED',
            error: errMsg,
          });
          continue;
        }

        const stat = fs.statSync(part.filePath);
        if (stat.size === 0) {
          try { fs.unlinkSync(part.filePath); } catch {}
          const errMsg = 'File is empty (0 bytes).';
          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'INVALID',
            error: errMsg,
          });
          continue;
        }

        // 5. FFprobe & Stream Inspection
        const inspector = this.controller.getInspector();
        const inspection = await inspector.inspectFile(part.filePath);

        if (!inspection.valid || !inspection.metadata) {
          // Immediately unlink invalid staged file to keep staging clean
          try {
            fs.unlinkSync(part.filePath);
          } catch {}

          const errMsg =
            inspection.errors.length > 0
              ? inspection.errors.join('; ')
              : 'Video inspection failed.';

          this.controller.addInvalidVideo(cleanName, errMsg);
          results.push({
            success: false,
            fileName: cleanName,
            status: 'INVALID',
            error: errMsg,
          });
          continue;
        }

        // 6. Add READY item to VideoQueue
        const queueItem = await this.controller.addVideo(part.filePath, cleanName, inspection);

        this.logger.info(
          'VALIDATING',
          'UPLOAD_SUCCESS',
          `✔ Upload staged & validated: ${cleanName} -> ${path.basename(part.filePath)} (${inspection.metadata.width}x${inspection.metadata.height}, ${inspection.metadata.fps}fps, ${inspection.metadata.durationFormatted})`,
          'SUCCESS'
        );

        results.push({
          success: true,
          id: queueItem.id,
          fileName: cleanName,
          size: stat.size,
          path: part.filePath,
          status: 'READY',
          metadata: {
            duration: inspection.metadata.duration,
            durationSeconds: inspection.metadata.duration,
            durationFormatted: inspection.metadata.durationFormatted,
            width: inspection.metadata.width,
            height: inspection.metadata.height,
            fps: inspection.metadata.fps,
            videoCodec: inspection.metadata.videoCodec,
            audioCodec: inspection.metadata.audioCodec,
            containerFormat: inspection.metadata.containerFormat,
          },
        });
      }

      const overallSuccess = results.length > 0 && results.some((r) => r.success);
      const batchResult: UploadBatchResult = {
        success: overallSuccess,
        count: results.length,
        items: results,
      };

      // Populate convenience fields if 1 file uploaded
      if (results.length === 1) {
        const single = results[0];
        batchResult.success = single.success;
        batchResult.id = single.id;
        batchResult.fileName = single.fileName;
        batchResult.size = single.size;
        batchResult.path = single.path;
        batchResult.status = single.status;
        batchResult.metadata = single.metadata;
        batchResult.error = single.error;
      }

      return batchResult;
    } catch (err) {
      this.logger.error(
        'VALIDATING',
        'UPLOAD_ERROR',
        `Multipart processing failed: ${(err as Error).message}`
      );
      return {
        success: false,
        count: 0,
        items: [],
        error: `Upload processing failed: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Robust streaming multipart parser that writes uploaded file parts directly
   * to disk without unbounded memory buffering or undici Web API crashes.
   */
  private parseMultipartStream(
    req: http.IncomingMessage,
    boundary: string
  ): Promise<Array<{ rawFilename: string; size: number; filePath: string }>> {
    return new Promise((resolve, reject) => {
      const parts: Array<{ rawFilename: string; size: number; filePath: string }> = [];
      const writePromises: Promise<void>[] = [];
      const delimiter = Buffer.from(`\r\n--${boundary}`);
      const initialDelimiter = Buffer.from(`--${boundary}`);

      let buffer = Buffer.alloc(0);
      let state: 'INIT' | 'HEADER' | 'BODY' | 'DONE' = 'INIT';
      let currentWriteStream: fs.WriteStream | null = null;
      let currentFilePath = '';
      let currentFilename = '';
      let currentBytesWritten = 0;
      let isSettled = false;

      const cleanupAll = () => {
        if (currentWriteStream) {
          try { currentWriteStream.destroy(); } catch {}
          currentWriteStream = null;
        }
        if (currentFilePath && fs.existsSync(currentFilePath)) {
          try { fs.unlinkSync(currentFilePath); } catch {}
        }
        for (const p of parts) {
          if (fs.existsSync(p.filePath)) {
            try { fs.unlinkSync(p.filePath); } catch {}
          }
        }
      };

      const fail = (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        cleanupAll();
        reject(err);
      };

      req.on('error', (err) => {
        fail(err);
      });

      req.on('data', (chunk: Buffer) => {
        if (state === 'DONE' || isSettled) return;
        buffer = Buffer.concat([buffer, chunk]);

        try {
          let processing = true;
          while (processing) {
            if (state === 'INIT') {
              const idx = buffer.indexOf(initialDelimiter);
              if (idx === -1) {
                if (buffer.length > initialDelimiter.length * 2) {
                  buffer = buffer.subarray(buffer.length - initialDelimiter.length);
                }
                processing = false;
                break;
              }
              buffer = buffer.subarray(idx + initialDelimiter.length);
              if (buffer.length >= 2 && buffer[0] === 0x2d && buffer[1] === 0x2d) {
                state = 'DONE';
                processing = false;
                break;
              }
              if (buffer.length >= 2 && buffer[0] === 0x0d && buffer[1] === 0x0a) {
                buffer = buffer.subarray(2);
              } else if (buffer.length >= 1 && (buffer[0] === 0x0a || buffer[0] === 0x0d)) {
                buffer = buffer.subarray(1);
              }
              state = 'HEADER';
            } else if (state === 'HEADER') {
              let headerEndIdx = buffer.indexOf('\r\n\r\n');
              let headerLen = 4;
              if (headerEndIdx === -1) {
                headerEndIdx = buffer.indexOf('\n\n');
                headerLen = 2;
              }
              if (headerEndIdx === -1) {
                processing = false;
                break;
              }

              const headerStr = buffer.subarray(0, headerEndIdx).toString('latin1');
              buffer = buffer.subarray(headerEndIdx + headerLen);

              // Extract filename from Content-Disposition
              let filename: string | null = null;
              const cdMatch = headerStr.match(/Content-Disposition:[^\r\n]+/i);
              if (cdMatch) {
                const fnMatch = cdMatch[0].match(/filename\*?=(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i);
                if (fnMatch) {
                  filename = fnMatch[1] || fnMatch[2] || fnMatch[3] || null;
                  if (filename) {
                    try {
                      filename = decodeURIComponent(filename);
                    } catch {}
                  }
                }
              }

              if (filename !== null) {
                const ext = path.extname(filename) || '.mp4';
                const randomHex = crypto.randomBytes(8).toString('hex');
                currentFilePath = path.join(this.stagingDir, `upload_${Date.now()}_${randomHex}${ext}`);
                currentFilename = filename;
                currentBytesWritten = 0;
                const ws = fs.createWriteStream(currentFilePath);
                const p = new Promise<void>((res, rej) => {
                  ws.once('finish', () => res());
                  ws.once('error', (e) => rej(e));
                });
                writePromises.push(p);
                currentWriteStream = ws;
                state = 'BODY';
              } else {
                currentWriteStream = null;
                currentFilePath = '';
                currentFilename = '';
                state = 'BODY';
              }
            } else if (state === 'BODY') {
              let delimIdx = buffer.indexOf(delimiter);
              let delimLen = delimiter.length;
              if (delimIdx === -1) {
                const lfDelimiter = Buffer.from(`\n--${boundary}`);
                delimIdx = buffer.indexOf(lfDelimiter);
                delimLen = lfDelimiter.length;
              }

              if (delimIdx !== -1) {
                const dataToWrite = buffer.subarray(0, delimIdx);
                if (currentWriteStream) {
                  currentWriteStream.write(dataToWrite);
                  currentWriteStream.end();
                  currentBytesWritten += dataToWrite.length;
                  parts.push({
                    rawFilename: currentFilename,
                    size: currentBytesWritten,
                    filePath: currentFilePath,
                  });
                  currentWriteStream = null;
                  currentFilePath = '';
                }
                buffer = buffer.subarray(delimIdx + delimLen);

                if (buffer.length >= 2 && buffer[0] === 0x2d && buffer[1] === 0x2d) {
                  state = 'DONE';
                  processing = false;
                  break;
                }
                if (buffer.length >= 2 && buffer[0] === 0x0d && buffer[1] === 0x0a) {
                  buffer = buffer.subarray(2);
                } else if (buffer.length >= 1 && (buffer[0] === 0x0a || buffer[0] === 0x0d)) {
                  buffer = buffer.subarray(1);
                }
                state = 'HEADER';
              } else {
                const safeLength = Math.max(0, buffer.length - (delimiter.length + 8));
                if (safeLength > 0) {
                  const chunkToWrite = buffer.subarray(0, safeLength);
                  if (currentWriteStream) {
                    currentWriteStream.write(chunkToWrite);
                    currentBytesWritten += chunkToWrite.length;
                  }
                  buffer = buffer.subarray(safeLength);
                }
                processing = false;
                break;
              }
            }
          }
        } catch (procErr) {
          fail(procErr as Error);
        }
      });

      req.on('end', async () => {
        if (isSettled) return;
        try {
          if (currentWriteStream) {
            if (buffer.length > 0) {
              currentWriteStream.write(buffer);
              currentBytesWritten += buffer.length;
            }
            currentWriteStream.end();
            parts.push({
              rawFilename: currentFilename,
              size: currentBytesWritten,
              filePath: currentFilePath,
            });
            currentWriteStream = null;
          }

          // Wait for all streams to finish writing completely to disk
          await Promise.all(writePromises);
          isSettled = true;
          resolve(parts);
        } catch (endErr) {
          fail(endErr as Error);
        }
      });
    });
  }
}
