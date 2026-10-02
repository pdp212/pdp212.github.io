/**
 * Step 5: HTTP Range 206 Streaming Verification
 * Proves that Cloudflare CDN and public delivery URLs respond with HTTP 206 Partial Content
 * and valid Content-Range headers for smooth streaming video playback.
 */

import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import {
  Http206StreamVerifier,
  type StreamVerifier,
} from '../../engines/r2/index.js';
import {
  StreamVerificationError,
  Http206RangeError,
} from '../../core/errors/pipeline-errors.js';

export class VerifyStreamStep implements PipelineStep {
  public readonly stage = 'VERIFYING_STREAM' as const;
  public readonly name = 'HTTP 206 Streaming Verification';
  private readonly customVerifier?: StreamVerifier;

  constructor(customVerifier?: StreamVerifier) {
    this.customVerifier = customVerifier;
  }

  public async execute(context: PipelineContext): Promise<StepResult> {
    const itemsToVerify = context.items.filter(
      (item) => item.status === 'UPLOADED' || item.status === 'ENCODED' || item.r2PublicUrl
    );

    context.logger.info(
      this.stage,
      'START',
      `Verifying HTTP Range 206 streaming for ${itemsToVerify.length} item(s)...`
    );

    if (itemsToVerify.length === 0) {
      context.logger.info(this.stage, 'NOOP', 'No items require streaming verification.');
      return { success: true, stage: this.stage, message: 'No items in queue to verify streaming.' };
    }

    const publicBaseUrl = context.credentials?.r2PublicBaseUrl || context.config.r2.publicBaseUrl;

    // 1. Dry Run Mode
    if (context.isDryRun) {
      context.logger.info(
        this.stage,
        'DRY_RUN',
        'Dry run enabled: Simulating HTTP 206 Range request test without network calls.',
        'SUCCESS'
      );

      for (const item of itemsToVerify) {
        const objectKey = item.objectKey || item.targetKey || item.filename;
        const publicUrl = item.r2PublicUrl || `${publicBaseUrl.replace(/\/+$/, '')}/${objectKey.replace(/^\/+/, '')}`;
        item.r2PublicUrl = publicUrl;
        item.streamVerified = true;
        item.http206Verified = true;
        item.streamStatus = 'VERIFIED';

        context.logger.info(
          this.stage,
          'DRY_RUN_PLAN',
          `[Plan] WOULD RANGE TEST ${publicUrl} (Range: bytes=0-1048575 -> HTTP 206 Partial Content)`
        );
      }

      return {
        success: true,
        stage: this.stage,
        message: `[DryRun] Simulated stream verification for ${itemsToVerify.length} item(s).`,
      };
    }

    // 2. Stream Verifier Engine
    const verifier = this.customVerifier || new Http206StreamVerifier();

    // 3. Sequential Range Verification
    let verifiedCount = 0;

    for (let i = 0; i < itemsToVerify.length; i++) {
      const item = itemsToVerify[i];
      const objectKey = item.objectKey || item.targetKey || item.filename;
      const publicUrl = item.r2PublicUrl || `${publicBaseUrl.replace(/\/+$/, '')}/${objectKey.replace(/^\/+/, '')}`;
      item.r2PublicUrl = publicUrl;

      context.logger.info(
        this.stage,
        'STREAM_TEST_START',
        `[${i + 1}/${itemsToVerify.length}] Testing HTTP Range request on: ${publicUrl}...`
      );

      const report = await verifier.verifyVideoStream(publicUrl);

      if (!report.passed) {
        const err = report.statusCode === 200
          ? new Http206RangeError(report.error || 'Server returned HTTP 200 instead of HTTP 206 Partial Content.', {
              url: publicUrl,
              statusCode: report.statusCode,
            })
          : new StreamVerificationError(report.error || `Stream verification failed for '${publicUrl}'.`, {
              url: publicUrl,
              statusCode: report.statusCode,
            });

        item.streamVerified = false;
        item.http206Verified = false;
        item.streamStatus = 'FAILED';
        item.status = 'FAILED';
        item.error = err.message;

        context.logger.error(this.stage, 'STREAM_TEST_FAILED', err.message);
        return {
          success: false,
          stage: this.stage,
          message: `Stream verification failed for '${publicUrl}': ${err.message}`,
          error: err,
        };
      }

      item.streamVerified = true;
      item.http206Verified = true;
      item.streamStatus = 'VERIFIED';
      verifiedCount++;

      context.logger.info(
        this.stage,
        'STREAM_TEST_SUCCESS',
        `[${i + 1}/${itemsToVerify.length}] ✔ HTTP 206 Partial Content verified: ${publicUrl} (${report.contentRange}, duration: ${report.durationMs}ms)`,
        'SUCCESS'
      );
    }

    return {
      success: true,
      stage: this.stage,
      message: `HTTP 206 Range streaming verified successfully for ${verifiedCount} item(s).`,
    };
  }
}
