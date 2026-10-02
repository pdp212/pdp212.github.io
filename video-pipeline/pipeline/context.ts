/**
 * Pipeline Context Definition
 * Carries all execution context, batch item descriptors, configuration, and runtime state.
 */

import type { PipelineConfig } from '../config/schema/index.js';
import type { PipelineCredentials } from '../core/security/secret-sanitizer.js';
import type { PipelineLogger } from '../core/logger/logger.js';
import type { PipelineStateStore } from '../core/state/state-store.js';
import type { PipelineStage } from '../core/errors/pipeline-errors.js';
import type { VideoInput } from '../app/application/video-input.js';

export interface VideoMetadata {
  width: number;
  height: number;
  durationSeconds: number;
  bitrateKbps: number;
  codec: string;
  hasAudio: boolean;
  sizeBytes: number;
}

export interface PipelineItem {
  id: string;
  sourcePath: string;
  filename: string;
  fileName?: string;
  tag: string;
  name: string;
  targetKey: string;
  objectKey?: string;
  sourceMetadata?: VideoMetadata;
  encodedMetadata?: VideoMetadata;
  encodedLocalPath?: string;
  localEncodedPath?: string;
  r2PublicUrl?: string;
  r2UploadStatus?: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'ALREADY_UPLOADED' | 'FAILED';
  r2ObjectVerified?: boolean;
  streamStatus?: 'PENDING' | 'VERIFYING' | 'VERIFIED' | 'FAILED';
  streamVerified?: boolean;
  http206Verified?: boolean;
  r2Error?: string;
  status: 'PENDING' | 'VALIDATED' | 'ENCODED' | 'UPLOADED' | 'VERIFIED' | 'FAILED';
  error?: string;
}

export interface ManifestEntry {
  key: string;
  url: string;
  tag: string;
  name: string;
}

export interface ManifestChanges {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  addedKeys?: string[];
  updatedKeys?: string[];
  removedKeys?: string[];
}

export interface PipelineContext {
  readonly pipelineId: string;
  readonly isDryRun: boolean;
  readonly config: PipelineConfig;
  readonly credentials?: PipelineCredentials;
  readonly logger: PipelineLogger;
  readonly stateStore: PipelineStateStore;
  items: PipelineItem[];
  inputs?: VideoInput[];
  manifestOriginal?: ManifestEntry[];
  manifestUpdated?: ManifestEntry[];
  manifestBefore?: ManifestEntry[];
  manifestAfter?: ManifestEntry[];
  manifestChanges?: ManifestChanges;
  addedEntries?: ManifestEntry[];
  updatedEntries?: ManifestEntry[];
  unchangedEntries?: ManifestEntry[];
  gitBranchOriginal?: string;
  gitCommitSha?: string;
  currentStage: PipelineStage;
}

export interface CreateContextOptions {
  config: PipelineConfig;
  isDryRun?: boolean;
  credentials?: PipelineCredentials;
  logger?: PipelineLogger;
}

/**
 * Converts validated VideoInput models into PipelineItem descriptors for execution.
 */
export function convertVideoInputsToPipelineItems(inputs: VideoInput[]): PipelineItem[] {
  return inputs
    .filter((input) => input.status === 'READY')
    .map((input) => {
      const ext = input.extension;
      const baseName = input.fileName.replace(new RegExp(`\\${ext}$`, 'i'), '');
      const parts = baseName.split('_');
      const tag = parts.length > 1 ? parts[0].toUpperCase() : 'WORK';
      const name = parts.length > 1 ? parts.slice(1).join('_') : baseName;

      return {
        id: input.id,
        sourcePath: input.path,
        filename: input.fileName,
        tag,
        name,
        targetKey: `${baseName}.mp4`,
        sourceMetadata: input.metadata
          ? {
              width: input.metadata.width,
              height: input.metadata.height,
              durationSeconds: input.metadata.duration,
              bitrateKbps: input.metadata.bitrateKbps,
              codec: input.metadata.videoCodec,
              hasAudio: input.metadata.audioCodec !== 'none',
              sizeBytes: input.metadata.fileSize,
            }
          : undefined,
        status: 'VALIDATED',
      };
    });
}

