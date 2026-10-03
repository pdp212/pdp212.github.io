# Data Model Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Runtime TypeScript Interfaces

### PipelineItem (`pipeline/context.ts`)
```typescript
export type ItemStatus = 'PENDING' | 'VALIDATING' | 'READY' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'INVALID';

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  audioChannels: number;
  hasAudio: boolean;
  fileSizeBytes: number;
  tag?: string;
  projectName?: string;
}

export interface PipelineItem {
  id: string;
  sourcePath: string;
  fileName?: string;
  status: ItemStatus;
  metadata?: VideoMetadata;
  targetKey?: string;
  r2Key?: string;
  r2Url?: string;
  r2Uploaded?: boolean;
  r2ObjectVerified?: boolean;
  streamVerified?: boolean;
  error?: string;
}
```

### PipelineContext (`pipeline/context.ts`)
```typescript
export interface PipelineContext {
  pipelineId: string;
  currentStage: PipelineStage;
  items: PipelineItem[];
  credentials?: R2Credentials;
  isDryRun: boolean;
  stopAfterStage?: PipelineStage;
  manifestUpdated?: boolean;
  manifestDiff?: ManifestDiffResult;
  gitCleaned?: boolean;
  gitignoreVerified?: boolean;
  testsPassed?: boolean;
  commitSha?: string;
  pushed?: boolean;
  githubActionsCompleted?: boolean;
  smokeTestPassed?: boolean;
  logger: PipelineLogger;
  abortController?: AbortController;
  isCancelled?: boolean;
}
```

---

## 2. Persistent Schemas

### 1. Persistent Video Queue (`data/queue.json`)
```typescript
export interface PersistedQueueItem {
  id: string;
  sourcePath: string;
  fileName: string;
  status: 'PENDING' | 'VALIDATING' | 'READY' | 'FAILED' | 'INVALID';
  metadata?: VideoMetadata;
  addedAt: string;
}
```

**Example `data/queue.json`**:
```json
[
  {
    "id": "input_1727850000000_abc12",
    "sourcePath": "/Users/.../video-pipeline/temp/uploads/WED_PHUNGTUONG.mp4",
    "fileName": "WED_PHUNGTUONG.mp4",
    "status": "READY",
    "metadata": {
      "durationSeconds": 14.5,
      "width": 1920,
      "height": 1080,
      "fps": 24,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "audioChannels": 2,
      "hasAudio": true,
      "fileSizeBytes": 45120000,
      "tag": "WED",
      "projectName": "PHUNGTUONG"
    },
    "addedAt": "2026-10-02T15:00:00.000Z"
  }
]
```

---

## 3. Persistent Job History (`data/jobs/<job-id>.json`)
```typescript
export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobRecord {
  jobId: string;
  pipelineId: string;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  status: JobStatus;
  currentStage: PipelineStage;
  inputCount: number;
  completedCount: number;
  failedCount: number;
  items: Array<{
    id: string;
    filename: string;
    status: string;
    r2Url?: string;
    error?: string;
  }>;
  isDryRun: boolean;
  error: string | null;
  durationMs: number | null;
  commit?: {
    sha?: string;
    message?: string;
  };
}
```

**Example `data/jobs/job_1727850000000_xyz89.json`**:
```json
{
  "jobId": "job_1727850000000_xyz89",
  "pipelineId": "pipe_1727850000000_12345",
  "createdAt": "2026-10-02T15:00:00.000Z",
  "startedAt": "2026-10-02T15:00:00.000Z",
  "completedAt": "2026-10-02T15:01:24.000Z",
  "status": "COMPLETED",
  "currentStage": "PRODUCTION_SMOKE_TEST",
  "inputCount": 1,
  "completedCount": 1,
  "failedCount": 0,
  "items": [
    {
      "id": "input_1727850000000_abc12",
      "filename": "WED_PHUNGTUONG.mp4",
      "status": "COMPLETED",
      "r2Url": "https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.mp4"
    }
  ],
  "isDryRun": false,
  "error": null,
  "durationMs": 84000
}
```

---

## 4. Production Work Manifest (`data/work-manifest.json`)
```typescript
export interface WorkManifestEntry {
  key: string;
  url: string;
  tag: string;
  name: string;
}
```

**Example `data/work-manifest.json`**:
```json
[
  {
    "key": "BRAND_FILM.mp4",
    "url": "https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/BRAND_FILM.mp4",
    "tag": "BRAND",
    "name": "FILM"
  },
  {
    "key": "WED_PHUNGTUONG.mp4",
    "url": "https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.mp4",
    "tag": "WED",
    "name": "PHUNGTUONG"
  }
]
```
