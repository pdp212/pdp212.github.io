/**
 * Video Pipeline Configuration Types
 * Strictly zero secrets in this config layer.
 */

export interface GitConfig {
  repository: string;
  branch: string;
  requireCleanWorkingTree: boolean;
  disallowForcePush: boolean;
}

export interface R2Config {
  bucket: string;
  publicBaseUrl: string;
}

export interface ManifestConfig {
  relativeFilePath: string;
  atomicBackup: boolean;
}

export interface DirectoryConfig {
  temp: string;
  encoded?: string;
  completed: string;
  failed: string;
}

export interface TimeoutConfig {
  validationMs: number;
  encodingMs?: number;
  uploadMs: number;
  verificationMs: number;
  githubActionsMs: number;
  smokeTestMs: number;
}

export interface RetryPolicyConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
}

export interface PipelineConfig {
  version: string;
  portfolioPath: string;
  productionUrl: string;
  git: GitConfig;
  r2: R2Config;
  manifest: ManifestConfig;
  encoding?: Record<string, unknown>;
  supportedInputFormats: string[];
  outputFormat?: string;
  directories: DirectoryConfig;
  testCommands: string[];
  timeout: TimeoutConfig;
  retryPolicy: RetryPolicyConfig;
}
