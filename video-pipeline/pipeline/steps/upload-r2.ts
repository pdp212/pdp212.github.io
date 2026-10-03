/**
 * Step 2: Cloudflare R2 Direct Upload
 * Uploads validated project-prepared video files directly to Cloudflare R2 using S3-compatible API.
 * Supports idempotency, transient error retry, serialized execution, and dry-run simulation.
 * Preserves original master video bytes, container format, and codec without transcoding.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext, PipelineItem } from '../context.js';
import {
  R2ClientFactory,
  R2Client,
  CloudflareR2Uploader,
  getVideoContentType,
  type R2Uploader,
} from '../../engines/r2/index.js';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';
import {
  R2UploadError,
  R2CredentialsError,
} from '../../core/errors/pipeline-errors.js';

export class UploadR2Step implements PipelineStep {
  public readonly stage = 'UPLOADING_R2' as const;
  public readonly name = 'Cloudflare R2 Direct Upload';
  private readonly customUploader?: R2Uploader;

  constructor(customUploader?: R2Uploader) {
    this.customUploader = customUploader;
  }

  public async execute(context: PipelineContext): Promise<StepResult> {
    const itemsToUpload = context.items.filter(
      (item) => item.status === 'VALIDATED' || item.status === 'PENDING' || (item.status as string) === 'ENCODED'
    );

    context.logger.info(
      this.stage,
      'START',
      `R2 upload stage queued for ${itemsToUpload.length} item(s)...`
    );

    if (itemsToUpload.length === 0) {
      context.logger.info(this.stage, 'NOOP', 'No items require R2 upload.');
      return { success: true, stage: this.stage, message: 'No items in queue to upload.' };
    }

    const publicBaseUrl = context.credentials?.r2PublicBaseUrl || context.config.r2.publicBaseUrl;
    const bucket = context.credentials?.r2BucketName || context.config.r2.bucket;

    // 1. Dry Run Mode
    if (context.isDryRun) {
      context.logger.info(
        this.stage,
        'DRY_RUN',
        'Dry run enabled: Simulating Cloudflare R2 upload plan without network mutations.',
        'SUCCESS'
      );

      for (const item of itemsToUpload) {
        const localPath = item.sourcePath || item.encodedLocalPath || item.localEncodedPath || item.filename || 'video.mp4';
        const fileName = path.basename(localPath);
        const objectKey = item.objectKey || item.targetKey || fileName;
        const publicUrl = `${publicBaseUrl.replace(/\/+$/, '')}/${objectKey.replace(/^\/+/, '')}`;

        item.fileName = fileName;
        item.objectKey = objectKey;
        item.targetKey = objectKey;
        item.r2PublicUrl = publicUrl;
        item.r2UploadStatus = 'UPLOADED';
        item.status = 'UPLOADED';

        context.logger.info(
          this.stage,
          'DRY_RUN_PLAN',
          `[Plan] WOULD UPLOAD ${fileName} -> s3://${bucket}/${objectKey} (${publicUrl})`
        );
      }

      return {
        success: true,
        stage: this.stage,
        message: `[DryRun] Simulated R2 upload for ${itemsToUpload.length} item(s).`,
      };
    }

    // 2. Resolve Uploader Engine
    let uploader: R2Uploader;

    if (this.customUploader) {
      uploader = this.customUploader;
    } else {
      let creds = context.credentials;
      if (!creds) {
        try {
          creds = SecretSanitizer.getCredentials(false);
        } catch (err) {
          const credErr = new R2CredentialsError(
            `Cannot proceed with R2 upload: ${(err as Error).message}`
          );
          context.logger.error(this.stage, 'CREDENTIALS_MISSING', credErr.message);
          return { success: false, stage: this.stage, message: credErr.message, error: credErr };
        }
      }

      const clientConfig = R2ClientFactory.createConfig(creds, bucket, publicBaseUrl);
      const client = new R2Client(clientConfig);
      uploader = new CloudflareR2Uploader(client, {
        maxRetries: context.config.retryPolicy?.maxRetries ?? 3,
        initialDelayMs: context.config.retryPolicy?.initialDelayMs ?? 1000,
        backoffFactor: context.config.retryPolicy?.backoffFactor ?? 2,
      });
    }

    // 3. Serialized Upload Execution
    let uploadedCount = 0;

    for (let i = 0; i < itemsToUpload.length; i++) {
      const item = itemsToUpload[i];
      const localPath = item.sourcePath || item.encodedLocalPath || item.localEncodedPath;

      if (!localPath) {
        const err = new R2UploadError(`Item '${item.filename}' has no sourcePath.`);
        item.status = 'FAILED';
        item.r2UploadStatus = 'FAILED';
        item.error = err.message;
        context.logger.error(this.stage, 'MISSING_PATH', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }

      if (!fs.existsSync(localPath)) {
        const err = new R2UploadError(`Source video file not found on disk: ${localPath}`);
        item.status = 'FAILED';
        item.r2UploadStatus = 'FAILED';
        item.error = err.message;
        context.logger.error(this.stage, 'FILE_NOT_FOUND', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }

      const stat = fs.statSync(localPath);
      if (stat.size === 0) {
        const err = new R2UploadError(`Source video file is empty (0 bytes): ${localPath}`);
        item.status = 'FAILED';
        item.r2UploadStatus = 'FAILED';
        item.error = err.message;
        context.logger.error(this.stage, 'EMPTY_FILE', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }

      const fileName = path.basename(localPath);
      const ext = path.extname(fileName).toLowerCase();
      const supportedFormats = context.config.supportedInputFormats.map((f) => f.toLowerCase());
      if (!supportedFormats.includes(ext)) {
        const err = new R2UploadError(`Unsupported video format '${ext}' for upload: ${fileName}`);
        item.status = 'FAILED';
        item.r2UploadStatus = 'FAILED';
        item.error = err.message;
        context.logger.error(this.stage, 'INVALID_FORMAT', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }

      const objectKey = item.objectKey || item.targetKey || fileName;
      const contentType = getVideoContentType(objectKey);

      context.logger.info(
        this.stage,
        'UPLOAD_START',
        `[${i + 1}/${itemsToUpload.length}] Uploading ${fileName} -> s3://${bucket}/${objectKey}...`
      );

      try {
        const result = await uploader.upload(
          localPath,
          objectKey,
          contentType,
          (progress) => {
            if (progress.percent % 25 === 0) {
              context.logger.debug(
                this.stage,
                'PROGRESS',
                `Uploading ${fileName}: ${progress.percent}% (${(progress.bytesLoaded / 1024 / 1024).toFixed(1)} MB)`
              );
            }
          }
        );

        item.localEncodedPath = localPath;
        item.encodedLocalPath = localPath;
        item.fileName = fileName;
        item.objectKey = objectKey;
        item.targetKey = objectKey;
        item.r2PublicUrl = result.publicUrl;
        item.r2UploadStatus = result.status;
        item.status = 'UPLOADED';
        uploadedCount++;

        const statusNote = result.status === 'ALREADY_UPLOADED' ? '(Existing object matched size — skipped)' : '✔ Uploaded';
        context.logger.info(
          this.stage,
          'UPLOAD_SUCCESS',
          `[${i + 1}/${itemsToUpload.length}] ${statusNote} ${fileName} (${(result.size / 1024 / 1024).toFixed(1)} MB)`,
          'SUCCESS'
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        item.status = 'FAILED';
        item.r2UploadStatus = 'FAILED';
        item.r2Error = error.message;
        item.error = error.message;

        context.logger.error(this.stage, 'UPLOAD_FAILED', `Failed uploading ${fileName}: ${error.message}`);
        return {
          success: false,
          stage: this.stage,
          message: `R2 upload failed on '${fileName}': ${error.message}`,
          error,
        };
      }
    }

    return {
      success: true,
      stage: this.stage,
      message: `Cloudflare R2 upload completed successfully for ${uploadedCount} item(s).`,
    };
  }
}
