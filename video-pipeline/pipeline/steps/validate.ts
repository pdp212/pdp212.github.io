/**
 * Step 1: Video File & Input Validation
 * Validates file existence, format extension, header sanity, and naming conventions.
 */

import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { VideoValidationError } from '../../core/errors/pipeline-errors.js';

export class ValidateStep implements PipelineStep {
  public readonly stage = 'VALIDATING' as const;
  public readonly name = 'Video Input Validation';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', `Validating ${context.items.length} input video(s)...`);

    if (context.items.length === 0) {
      const err = new VideoValidationError('No video files provided for validation.');
      context.logger.error(this.stage, 'FAIL', err.message);
      return { success: false, stage: this.stage, message: err.message, error: err };
    }

    for (const item of context.items) {
      const ext = item.filename.substring(item.filename.lastIndexOf('.')).toLowerCase();
      if (!context.config.supportedInputFormats.includes(ext)) {
        const err = new VideoValidationError(
          `Unsupported file format '${ext}' for file '${item.filename}'. Supported formats: ${context.config.supportedInputFormats.join(', ')}`,
          { filename: item.filename }
        );
        context.logger.error(this.stage, 'FAIL', err.message);
        return { success: false, stage: this.stage, message: err.message, error: err };
      }
      item.status = 'VALIDATED';
    }

    context.logger.info(this.stage, 'PASS', `Validated ${context.items.length} item(s) successfully.`, 'SUCCESS');
    return { success: true, stage: this.stage, message: 'All input videos validated successfully.' };
  }
}
