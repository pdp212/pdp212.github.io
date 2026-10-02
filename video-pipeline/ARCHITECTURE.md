# System Architecture Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 05 — Manifest Management & Production Registry  
**Language & Runtime:** TypeScript 5.9 / Node.js 24 ESM (`NodeNext`)

---

## 1. Architectural Layers & Separation of Concerns

The pipeline architecture enforces strict separation across 7 dedicated layers. No monolithic or circular dependencies are permitted.

```
┌─────────────────────────────────────────────────────────────┐
│                          APP LAYER                          │
│     (CLI bootstrap, UI server, queue coordinator)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       PIPELINE LAYER                        │
│   (Orchestrator, State Machine, Context, 13 Linear Steps)   │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│        ENGINES LAYER         │ │         CORE LAYER          │
│  - Video (FFmpeg/FFprobe/Val)│ │  - Structured Logger        │
│  - R2 (S3 SigV4, Up & Verif) │ │  - State Store & Audit Trail│
│  - Stream (HTTP 206 Verifier)│ │  - Error Hierarchy (21 cls) │
│  - Manifest (Atomic Sync)    │ │  - Filesystem Manager       │
│  - Git (Safety & Cleanup)    │ │  - Secret Sanitizer         │
│  - GitHub (Workflow Monitor) │ │                             │
│  - Production (Smoke Tester) │ │                             │
└──────────────┬───────────────┘ └─────────────┬───────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    CONFIG & TESTS LAYERS                    │
│   (pipeline.config.json, JSON Schema, Test Suites, Fixtures) │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

1. **`app/`**:
   - Manages application startup, argument parsing (`--dry-run`, `--ui`), local web tool server, and UI event dispatching.
   - Houses `VideoInput` model, `VideoQueue` service, and `InputController` for managing user drag-and-drop inputs.
2. **`pipeline/`**:
   - The central orchestrator (`VideoPipelineOrchestrator`). Enforces step order and strict stop-on-failure policy.
   - Supports phased halting via `stopAfterStage` (stopping after `UPDATING_MANIFEST` in Phase 05).
   - Houses the formal state machine (`PipelineStateMachine`) and execution context (`PipelineContext`).
3. **`engines/manifest/` [Phase 05 Implemented]**:
   - `manifest-reader.ts`: Safe JSON parser with array verification and empty/corrupt detection.
   - `manifest-validator.ts`: Comprehensive schema validation, R2 HTTPS URL matching, illegal path checks, and credential leak audit.
   - `manifest-diff.ts`: Granular before/after comparison tracking `added`, `updated`, `unchanged`, and `removed` with ASCII reporting box.
   - `manifest-writer.ts`: Atomic transactional writer with transactional backup to `temp/work-manifest.json.bak`, temp file writes, atomic rename, and rollback recovery.
4. **`engines/r2/` [Phase 04 Implemented]**:
   - `r2-client.ts`: Zero-dependency Cloudflare R2 S3-compatible client with native AWS SigV4 signer (`PUT`, `HEAD`).
   - `uploader.ts`: `CloudflareR2Uploader` with idempotency (pre-flight HEAD), controlled transient retry (up to 3x with exponential backoff), and serialized concurrency (1).
   - `verifier.ts`: `CloudflareR2Verifier` performing direct HEAD queries to confirm object existence, Content-Type `video/mp4`, and exact byte match with local encoded file.
   - `stream-verifier.ts`: `Http206StreamVerifier` issuing `Range: bytes=0-1048575` requests to assert HTTP 206 Partial Content, Content-Range headers, and non-empty streaming payloads.
5. **`engines/video/` [Phase 03 Implemented]**:
   - `ffmpeg.ts`: Asynchronously spawns external FFmpeg process with stderr progress streaming and cancellation support.
   - `ffprobe.ts`: Discovers binary and extracts duration, FPS, codecs, dimensions, and audio channels.
   - `output-validator.ts`: Asserts that encoded MP4 complies with production specs (H.264 high 4.2, yuv420p, AAC 48kHz, resolution/aspect ratio match).
   - `video-engine.ts`: High-level facade providing deterministic filename formatting and clean transcode APIs.
6. **`core/`**:
   - Cross-cutting concerns: logging with automated secret redaction, custom error hierarchy, filesystem path managers, state stores, and credential safety validators.
7. **`config/`**:
   - Declarative configuration (`pipeline.config.json`). Contains canonical encoding parameters, R2 bucket & public delivery URLs, path mappings, retry policies, and timeouts. **Strictly zero secrets**.
8. **`tests/`**:
   - Unit tests, security boundary tests, integration dry-run, R2, streaming, and manifest tests (106 tests, 28 suites, 100% pass).

---

## 2. Pipeline State Machine & Transitions

The state machine strictly prevents bypassing intermediate stages. In Phase 05, the pipeline executes:
`VALIDATING -> ENCODING -> UPLOADING_R2 -> VERIFYING_R2 -> VERIFYING_STREAM -> UPDATING_MANIFEST` (halts cleanly before Git cleanup).

```
       [IDLE]
         │
         ▼
    [VALIDATING] ───────────────► [FAILED]
         │
         ▼
     [ENCODING] ────────────────► [FAILED]
         │
         ▼
   [UPLOADING_R2] ──────────────► [FAILED]
         │
         ▼
    [VERIFYING_R2] ─────────────► [FAILED]
         │
         ▼
  [VERIFYING_STREAM] ───────────► [FAILED]
         │
         ▼
 [UPDATING_MANIFEST] ───────────► [FAILED]
         │
         └───► [STOP: READY FOR GIT CLEANUP (Phase 05 Boundary)]
   [CLEANING_GIT] ──────────────► [FAILED] (Deferred to Phase 06)
         │
         ▼
  [VERIFYING_GIT] ──────────────► [FAILED]
         │
         ▼
  [RUNNING_TESTS] ──────────────► [FAILED]
         │
         ▼
 [READY_TO_COMMIT] ─────────────► [FAILED]
         │
         ▼
   [COMMITTING] ────────────────► [FAILED]
         │
         ▼
     [PUSHING] ─────────────────► [FAILED]
         │
         ▼
[WAITING_FOR_GITHUB_ACTIONS] ───► [FAILED]
         │
         ▼
[PRODUCTION_SMOKE_TEST] ────────► [FAILED]
         │
         ▼
    [COMPLETED]
```

---

## 3. Atomic Encoding Lifecycle & Temp File Safety

To ensure that corrupted or partially written videos never enter production:
1. Videos are encoded into temporary staging: `encoded/.tmp/tmp_<id>_<timestamp>.mp4`.
2. FFmpeg exit code is validated (`=== 0`).
3. Output file presence and size (`size > 0`) are verified.
4. Deep verification is performed by `OutputValidator`.
5. Upon 100% validation success, file is atomically renamed to: `encoded/<DETERMINISTIC_NAME>.mp4`.
6. If cancelled or error occurs, the temporary incomplete file is immediately unlinked.
7. Original master source files remain strictly READ-ONLY.

---

## 4. Manifest Management & Production Registry (Phase 05)

### Schema Specification
```json
[
  {
    "key": "WED_PHUNGTUONG.wed.mp4",
    "url": "https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.wed.mp4",
    "tag": "WED",
    "name": "PHUNGTUONG"
  }
]
```

### Architectural Controls
1. **Verification Gate:** Only items with both `r2ObjectVerified === true` and `streamVerified === true` are permitted into the manifest.
2. **Deterministic Merge:** Existing keys are updated without duplication; new entries are appended; all entries are sorted ascending by `key`.
3. **Atomic File Writes:** Writes to temporary file `data/work-manifest.json.tmp`, executes `fs.renameSync`, re-reads from disk, and validates the result.
4. **Transactional Rollback:** Backs up to `video-pipeline/temp/work-manifest.json.bak` before any write. If any step fails, restores original manifest immediately.
5. **Security Isolation:** Manifest and logs are strictly audited to ensure zero tokens, secrets, or internal file paths exist in production data.
