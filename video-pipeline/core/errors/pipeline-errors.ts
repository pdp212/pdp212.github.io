/**
 * Structured Pipeline Error Hierarchy
 * Provides typed, actionable error categories for each stage of the video pipeline.
 */

export type PipelineStage =
  | 'IDLE'
  | 'VALIDATING'
  | 'UPLOADING_R2'
  | 'VERIFYING_R2'
  | 'VERIFYING_STREAM'
  | 'UPDATING_MANIFEST'
  | 'CLEANING_GIT'
  | 'VERIFYING_GIT'
  | 'RUNNING_TESTS'
  | 'READY_TO_COMMIT'
  | 'COMMITTING'
  | 'PUSHING'
  | 'WAITING_FOR_GITHUB_ACTIONS'
  | 'PRODUCTION_SMOKE_TEST'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export class PipelineError extends Error {
  public readonly stage: PipelineStage;
  public readonly isFatal: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(stage: PipelineStage, message: string, context?: Record<string, unknown>, isFatal = true) {
    super(`[${stage}] ${message}`);
    this.name = 'PipelineError';
    this.stage = stage;
    this.isFatal = isFatal;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VideoValidationError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATING', message, context);
    this.name = 'VideoValidationError';
  }
}

export class PipelineCancelledError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CANCELLED', message, context, false);
    this.name = 'PipelineCancelledError';
  }
}

export class R2UploadError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('UPLOADING_R2', message, context);
    this.name = 'R2UploadError';
  }
}

export class R2VerificationError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VERIFYING_R2', message, context);
    this.name = 'R2VerificationError';
  }
}

export class StreamVerificationError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VERIFYING_STREAM', message, context);
    this.name = 'StreamVerificationError';
  }
}

export class ManifestError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('UPDATING_MANIFEST', message, context);
    this.name = 'ManifestError';
  }
}

export class GitSafetyError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VERIFYING_GIT', message, context);
    this.name = 'GitSafetyError';
  }
}

export class TestFailure extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('RUNNING_TESTS', message, context);
    this.name = 'TestFailure';
  }
}

export class GitCommitError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('COMMITTING', message, context);
    this.name = 'GitCommitError';
  }
}

export class GitPushError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('PUSHING', message, context);
    this.name = 'GitPushError';
  }
}

export class GitHubActionsError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('WAITING_FOR_GITHUB_ACTIONS', message, context);
    this.name = 'GitHubActionsError';
  }
}

export class ProductionSmokeTestError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('PRODUCTION_SMOKE_TEST', message, context);
    this.name = 'ProductionSmokeTestError';
  }
}

export class InputError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATING', message, context);
    this.name = 'InputError';
  }
}

export class VideoInspectionError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATING', message, context);
    this.name = 'VideoInspectionError';
  }
}

export class UnsupportedVideoError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATING', message, context);
    this.name = 'UnsupportedVideoError';
  }
}

export class VideoQueueError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('IDLE', message, context);
    this.name = 'VideoQueueError';
  }
}

export class R2CredentialsError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('UPLOADING_R2', message, context);
    this.name = 'R2CredentialsError';
  }
}

export class R2ObjectMismatchError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VERIFYING_R2', message, context);
    this.name = 'R2ObjectMismatchError';
  }
}

export class Http206RangeError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VERIFYING_STREAM', message, context);
    this.name = 'Http206RangeError';
  }
}

export class R2RetryExhaustedError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('UPLOADING_R2', message, context);
    this.name = 'R2RetryExhaustedError';
  }
}


