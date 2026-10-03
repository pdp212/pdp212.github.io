/**
 * Step 4: Cloudflare R2 Object Verification
 * Validates that uploaded objects exist on R2 with expected Content-Length and Content-Type (video/mp4).
 */

import fs from 'node:fs';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import {
  R2ClientFactory,
  R2Client,
  CloudflareR2Verifier,
  getVideoContentType,
  type R2Verifier,
} from '../../engines/r2/index.js';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';
import {
  R2VerificationError,
  R2CredentialsError,
} from '../../core/errors/pipeline-errors.js';

export class VerifyR2Step implements PipelineStep {
  public readonly stage = 'VERIFYING_R2' as const;
  public readonly name = 'R2 Object Verification';
  private readonly customVerifier?: R2Verifier;

  constructor(customVerifier?: R2Verifier) {
    this.customVerifier = customVerifier;
  }

  public async execute(context: PipelineContext): Promise<StepResult> {
    const itemsToVerify = context.items.filter(
      (item) => item.status === 'UPLOADED' || (item.status as string) === 'ENCODED'
    );

    context.logger.info(
      this.stage,
      'START',
      `Verifying ${itemsToVerify.length} object(s) presence on Cloudflare R2...`
    );

    if (itemsToVerify.length === 0) {
      context.logger.info(this.stage, 'NOOP', 'No items require R2 object verification.');
      return { success: true, stage: this.stage, message: 'No items in queue to verify.' };
    }

    const publicBaseUrl = context.credentials?.r2PublicBaseUrl || context.config.r2.publicBaseUrl;
    const bucket = context.credentials?.r2BucketName || context.config.r2.bucket;

    // 1. Dry Run Mode
    if (context.isDryRun) {
      context.logger.info(
        this.stage,
        'DRY_RUN',
        'Dry run enabled: Simulating R2 object HEAD verification.',
        'SUCCESS'
      );

      for (const item of itemsToVerify) {
        const objectKey = item.objectKey || item.targetKey || item.filename;
        item.r2ObjectVerified = true;
        context.logger.info(
          this.stage,
          'DRY_RUN_PLAN',
          `[Plan] WOULD VERIFY R2 OBJECT s3://${bucket}/${objectKey} (HEAD 200)`
        );
      }

      return {
        success: true,
        stage: this.stage,
        message: `[DryRun] Simulated R2 verification for ${itemsToVerify.length} item(s).`,
      };
    }

    // 2. Resolve Verifier Engine
    let verifier: R2Verifier;

    if (this.customVerifier) {
      verifier = this.customVerifier;
    } else {
      let creds = context.credentials;
      if (!creds) {
        try {
          creds = SecretSanitizer.getCredentials(false);
        } catch (err) {
          const credErr = new R2CredentialsError(
            `Cannot proceed with R2 verification: ${(err as Error).message}`
          );
          context.logger.error(this.stage, 'CREDENTIALS_MISSING', credErr.message);
          return { success: false, stage: this.stage, message: credErr.message, error: credErr };
        }
      }

      const clientConfig = R2ClientFactory.createConfig(creds, bucket, publicBaseUrl);
      const client = new R2Client(clientConfig);
      verifier = new CloudflareR2Verifier(client);
    }

    // 3. Sequential Verification
    let verifiedCount = 0;

    for (let i = 0; i < itemsToVerify.length; i++) {
      const item = itemsToVerify[i];
      const objectKey = item.objectKey || item.targetKey || item.filename;
      const localPath = item.sourcePath || item.localEncodedPath || item.encodedLocalPath;

      let expectedSize: number | undefined;
      if (localPath && fs.existsSync(localPath)) {
        expectedSize = fs.statSync(localPath).size;
      } else if (item.sourceMetadata?.sizeBytes) {
        expectedSize = item.sourceMetadata.sizeBytes;
      } else if (item.encodedMetadata?.sizeBytes) {
        expectedSize = item.encodedMetadata.sizeBytes;
      }

      const expectedContentType = getVideoContentType(objectKey);

      context.logger.info(
        this.stage,
        'VERIFY_START',
        `[${i + 1}/${itemsToVerify.length}] Probing HEAD s3://${bucket}/${objectKey}...`
      );

      const result = await verifier.verifyObject(objectKey, expectedSize, expectedContentType);

      if (!result.passed) {
        const err = new R2VerificationError(result.error || `Verification failed for '${objectKey}'.`, {
          key: objectKey,
          expectedSize,
          actualSize: result.contentLength,
          actualContentType: result.contentType,
        });

        item.r2ObjectVerified = false;
        item.status = 'FAILED';
        item.r2Error = err.message;
        item.error = err.message;

        context.logger.error(this.stage, 'VERIFY_FAILED', err.message);
        return {
          success: false,
          stage: this.stage,
          message: `R2 verification failed for '${objectKey}': ${err.message}`,
          error: err,
        };
      }

      item.r2ObjectVerified = true;
      verifiedCount++;

      context.logger.info(
        this.stage,
        'VERIFY_SUCCESS',
        `[${i + 1}/${itemsToVerify.length}] ✔ Verified on R2: ${objectKey} (${result.contentLength} bytes, ${result.contentType})`,
        'SUCCESS'
      );
    }

    return {
      success: true,
      stage: this.stage,
      message: `R2 object verification passed for ${verifiedCount} item(s).`,
    };
  }
}
