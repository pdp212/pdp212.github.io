/**
 * Video Input Model
 * Encapsulates the state, metadata, and validation results of an ingested video in the queue.
 */

export type VideoInputStatus =
  | 'QUEUED'
  | 'INSPECTING'
  | 'READY'
  | 'INVALID'
  | 'REMOVED'
  | 'FAILED';

export interface DetailedVideoMetadata {
  filename: string;
  absolutePath: string;
  extension: string;
  fileSize: number;
  duration: number; // in seconds
  durationFormatted: string; // e.g. "03:42"
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  audioChannels: number;
  audioSampleRate: number;
  bitrateKbps: number;
  containerFormat: string;
}

export interface VideoValidationResult {
  valid: boolean;
  errors: string[];
}

export interface VideoInput {
  id: string;
  path: string; // Absolute path to master file
  fileName: string;
  extension: string;
  size: number;
  addedAt: string;
  status: VideoInputStatus;
  metadata?: DetailedVideoMetadata;
  validation: VideoValidationResult;
  error?: string;
}
