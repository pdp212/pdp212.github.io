/**
 * Step 2: Video Encoding (FFmpeg Transcode to Production Web Profile)
 * Executes external FFmpeg transcoding into deterministic MP4 outputs, validates stream compliance,
 * and atomically commits to the encoded/ directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext, PipelineItem } from '../context.js';
import { VideoEngine } from '../../engines/video/video-engine.js';
import { FilesystemManager } from '../../core/filesystem/fs-manager.js';
import {
  EncodingError,
  OutputExistsError,
  EncodingProcessError,
} from '../../core/errors/pipeline-errors.js';
import type { ExpectedSourceProps } from '../../engines/video/output-validator.js';

export class EncodeStep implements PipelineStep {
  public readonly stage = 'ENCODING' as const;
  public readonly name = 'Video Transcoding & Optimization';
  private readonly videoEngine: VideoEngine;

  constructor(videoEngine?: VideoEngine) {
    this.videoEngine = videoEngine || new VideoEngine();
  }

  public async execute(context: PipelineContext): Promise<StepResult> {
    const readyItems = context.items.filter(
      (item) => item.status === 'VALIDATED' || item.status === 'PENDING'
    );

    context.logger.info(
      this.stage,
      'START',
      `Preparing production encoding for ${readyItems.length} item(s)...`
    );

    if (readyItems.length === 0) {
      context.logger.info(this.stage, 'NOOP', 'No items require encoding.');
      return { success: true, stage: this.stage, message: 'No items in queue to encode.' };
    }

    const fsManager = new FilesystemManager(process.cwd(), context.config.directories);
    fsManager.ensureDirectoriesExist();

    const encodedDir = fsManager.getDirectoryPath('encoded');
    const tempEncodedDir = fsManager.getEncodedTempDir();

    // 1. Dry Run Execution
    if (context.isDryRun) {
      context.logger.info(
        this.stage,
        'DRY_RUN',
        'Dry run enabled: Simulating production encoding plan without spawning FFmpeg.',
        'SUCCESS'
      );

      for (const item of readyItems) {
        const deterministicName = this.videoEngine.generateDeterministicFilename(item.sourcePath);
        const plannedPath = path.join(encodedDir, deterministicName);
        item.encodedLocalPath = plannedPath;
        item.localEncodedPath = plannedPath;
        item.fileName = deterministicName;
        item.objectKey = deterministicName;
        item.targetKey = deterministicName;
        item.status = 'ENCODED';

        context.logger.info(
          this.stage,
          'DRY_RUN_PLAN',
          `[Plan] ${item.filename} -> ${deterministicName} (H.264/CRF ${context.config.encoding.crf}/AAC)`
        );
      }

      return {
        success: true,
        stage: this.stage,
        message: `[DryRun] Simulated encoding for ${readyItems.length} item(s).`,
      };
    }

    // 2. Real Production Execution
    const allowOverwrite = context.config.encoding.allowOverwrite ?? false;
    let encodedCount = 0;

    for (const item of readyItems) {
      const deterministicName = this.videoEngine.generateDeterministicFilename(item.sourcePath);
      const finalOutputPath = path.join(encodedDir, deterministicName);

      // Existing output safety gate
      if (fs.existsSync(finalOutputPath) && !allowOverwrite) {
        const err = new OutputExistsError(
          `Target output file already exists and overwrite is disabled: ${finalOutputPath}`,
          { itemId: item.id, finalOutputPath }
        );
        item.status = 'FAILED';
        item.error = err.message;
        context.logger.error(this.stage, 'OUTPUT_EXISTS', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }

      // Temporary working output for atomic finalization
      const tempOutputPath = path.join(
        tempEncodedDir,
        `tmp_${item.id}_${Date.now()}.mp4`
      );

      // Extract source properties
      let sourceProps: ExpectedSourceProps;
      if (item.sourceMetadata) {
        sourceProps = {
          width: item.sourceMetadata.width,
          height: item.sourceMetadata.height,
          fps: 25, // default fallback if metadata had approximate fps
          hasAudio: item.sourceMetadata.hasAudio,
          durationSeconds: item.sourceMetadata.durationSeconds,
        };
      } else {
        const inspected = await this.videoEngine.inspect(item.sourcePath);
        sourceProps = {
          width: inspected.width,
          height: inspected.height,
          fps: inspected.fps,
          hasAudio: inspected.audioCodec !== 'none',
          durationSeconds: inspected.duration,
        };
      }

      context.logger.info(
        this.stage,
        'ENCODE_START',
        `Transcoding ${item.filename} -> ${deterministicName} (CRF ${context.config.encoding.crf})`
      );

      try {
        let lastReportedPercent = -1;

        await this.videoEngine.encode(
          item.sourcePath,
          tempOutputPath,
          context.config.encoding,
          {
            hasAudio: sourceProps.hasAudio,
            totalDurationSeconds: sourceProps.durationSeconds,
            onProgress: (progress) => {
              if (progress.percent !== lastReportedPercent && progress.percent % 20 === 0) {
                lastReportedPercent = progress.percent;
                context.logger.debug(
                  this.stage,
                  'PROGRESS',
                  `Encoding ${deterministicName}: ${progress.percent}% (FPS: ${progress.fps})`
                );
              }
            },
          }
        );

        // Verify that temporary output exists and size > 0
        if (!fs.existsSync(tempOutputPath) || fs.statSync(tempOutputPath).size === 0) {
          throw new EncodingError(`FFmpeg finished but temporary output is missing or 0 bytes: ${tempOutputPath}`);
        }

        // Deep verification against production profile
        context.logger.debug(this.stage, 'VERIFYING_OUTPUT', `Verifying output compliance: ${deterministicName}`);
        const verifiedMeta = await this.videoEngine.verifyOutput(
          tempOutputPath,
          sourceProps,
          context.config.encoding
        );

        // Atomic promotion: .tmp -> final encoded path
        fsManager.atomicFinalize(tempOutputPath, finalOutputPath);

        item.encodedLocalPath = finalOutputPath;
        item.localEncodedPath = finalOutputPath;
        item.fileName = deterministicName;
        item.objectKey = deterministicName;
        item.targetKey = deterministicName;
        item.encodedMetadata = {
          width: verifiedMeta.width,
          height: verifiedMeta.height,
          durationSeconds: verifiedMeta.duration,
          bitrateKbps: verifiedMeta.bitrateKbps,
          codec: verifiedMeta.videoCodec,
          hasAudio: verifiedMeta.audioCodec !== 'none',
          sizeBytes: verifiedMeta.fileSize,
        };
        item.status = 'ENCODED';
        encodedCount++;

        context.logger.info(
          this.stage,
          'ENCODE_SUCCESS',
          `✔ Successfully encoded & verified: ${deterministicName} (${(verifiedMeta.fileSize / (1024 * 1024)).toFixed(1)} MB)`,
          'SUCCESS'
        );
      } catch (err) {
        // Clean up incomplete temp file
        if (fs.existsSync(tempOutputPath)) {
          try {
            fs.unlinkSync(tempOutputPath);
          } catch {}
        }

        const error = err instanceof Error ? err : new Error(String(err));
        item.status = 'FAILED';
        item.error = error.message;

        context.logger.error(this.stage, 'ENCODE_FAILURE', `Failed encoding ${item.filename}: ${error.message}`);
        return {
          success: false,
          stage: this.stage,
          message: `Encoding failed on '${item.filename}': ${error.message}`,
          error,
        };
      }
    }

    return {
      success: true,
      stage: this.stage,
      message: `Production encoding completed successfully for ${encodedCount} item(s).`,
    };
  }
}
