/**
 * Standard Step Interface for the Video Pipeline
 */

import type { PipelineContext } from '../context.js';
import type { PipelineStage } from '../../core/errors/pipeline-errors.js';

export interface StepResult {
  success: boolean;
  stage: PipelineStage;
  message: string;
  error?: Error;
}

export interface PipelineStep {
  readonly stage: PipelineStage;
  readonly name: string;
  execute(context: PipelineContext): Promise<StepResult>;
}
