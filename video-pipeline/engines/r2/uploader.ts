/**
 * Cloudflare R2 Uploader
 * Executes serialized, idempotent video uploads to Cloudflare R2 with controlled transient retry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { R2Client } from './r2-client.js';
import {
  R2UploadError,
  R2CredentialsError,
  R2RetryExhaustedError,
} from '../../core/errors/pipeline-errors.js';

export interface UploadProgress {
  bytesLoaded: number;
  totalBytes: number;
  percent: number;
}

export interface UploadResult {
  localPath: string;
  fileName: string;
  objectKey: string;
  publicUrl: string;
  size: number;
  contentType: string;
  status: 'UPLOADED' | 'ALREADY_UPLOADED' | 'FAILED';
  etag?: string;
  error?: string;
}

export interface UploaderRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

export interface R2Uploader {
  upload(
    filePath: string,
    key: string,
    contentType?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult>;
  uploadMany(
    items: Array<{ filePath: string; key: string; contentType?: string }>,
    onProgress?: (index: number, total: number, progress: UploadProgress) => void
  ): Promise<UploadResult[]>;
}

export class CloudflareR2Uploader implements R2Uploader {
  private readonly client: R2Client;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly backoffFactor: number;

  constructor(client: R2Client, retryOptions?: UploaderRetryOptions) {
    this.client = client;
    this.maxRetries = retryOptions?.maxRetries ?? 3;
    this.initialDelayMs = retryOptions?.initialDelayMs ?? 1000;
    this.backoffFactor = retryOptions?.backoffFactor ?? 2;
  }

  /**
   * Uploads a single encoded video file with idempotency and retry protection.
   */
  public async upload(
    filePath: string,
    key: string,
    contentType = 'video/mp4',
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const fileName = path.basename(filePath);
    const publicUrl = this.client.getPublicUrl(key);

    // 1. Verify local file existence & accessibility
    if (!fs.existsSync(filePath)) {
      throw new R2UploadError(`Local encoded file does not exist: ${filePath}`, { filePath });
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      throw new R2UploadError(`Local encoded file is empty (0 bytes): ${filePath}`, { filePath });
    }

    const localSize = stat.size;

    // 2. Idempotency Check: Probe existing R2 object before uploading
    try {
      const head = await this.client.headObject(key);
      if (head.exists && head.contentLength === localSize) {
        const remoteType = (head.contentType || '').toLowerCase();
        if (remoteType === contentType.toLowerCase() || remoteType.includes('video/mp4')) {
          if (onProgress) {
            onProgress({ bytesLoaded: localSize, totalBytes: localSize, percent: 100 });
          }
          return {
            localPath: filePath,
            fileName,
            objectKey: key,
            publicUrl,
            size: localSize,
            contentType,
            status: 'ALREADY_UPLOADED',
            etag: head.etag,
          };
        }
      }
    } catch (err) {
      // If HEAD threw credential error, fail immediately without retrying
      if (err instanceof R2CredentialsError) {
        throw err;
      }
      // Other HEAD errors (e.g. transient 5xx) will proceed to upload attempt
    }

    // 3. Read file into memory buffer for deterministic SHA256 signing & upload
    const fileBuffer = fs.readFileSync(filePath);

    // 4. Retry Loop for transient failures
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      try {
        if (onProgress) {
          onProgress({ bytesLoaded: 0, totalBytes: localSize, percent: 0 });
        }

        const putResult = await this.client.putObject(key, fileBuffer, contentType);

        if (onProgress) {
          onProgress({ bytesLoaded: localSize, totalBytes: localSize, percent: 100 });
        }

        return {
          localPath: filePath,
          fileName,
          objectKey: key,
          publicUrl,
          size: localSize,
          contentType,
          status: 'UPLOADED',
          etag: putResult.etag,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Permanent failures must NEVER be retried
        if (
          err instanceof R2CredentialsError ||
          (err instanceof R2UploadError && (err.context?.statusCode === 401 || err.context?.statusCode === 403 || err.context?.statusCode === 404))
        ) {
          throw err;
        }

        attempt++;
        if (attempt > this.maxRetries) {
          break;
        }

        // Exponential backoff delay
        const delay = this.initialDelayMs * Math.pow(this.backoffFactor, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new R2RetryExhaustedError(
      `Exhausted all ${this.maxRetries} upload retries for '${fileName}': ${lastError?.message}`,
      { key, filePath, attempts: attempt, originalError: lastError?.message }
    );
  }

  /**
   * Uploads multiple encoded video files strictly serialized (Concurrency = 1).
   */
  public async uploadMany(
    items: Array<{ filePath: string; key: string; contentType?: string }>,
    onProgress?: (index: number, total: number, progress: UploadProgress) => void
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = await this.upload(
        item.filePath,
        item.key,
        item.contentType,
        (progress) => {
          if (onProgress) {
            onProgress(i + 1, items.length, progress);
          }
        }
      );
      results.push(result);
    }

    return results;
  }
}
