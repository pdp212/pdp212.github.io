# System Architecture Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 10 — Production Ready Desktop & CLI Tool  
**Runtime:** Node.js 20+ / 22+ (ESM `NodeNext`), Electron, TypeScript 5.8+

---

## 1. Architectural Layers & Separation of Concerns

The Video Pipeline architecture is organized into 7 decoupled layers. Dependency flows downward; high-level orchestration delegates to low-level engines without cyclic dependencies.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DESKTOP LAYER                              │
│              (Electron Main Process, Window Lifecycle, Native)          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                APP LAYER                                │
│       (Fastify/HTTP Server, SSE Broadcaster, UI, Ingest Controller)     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             PIPELINE LAYER                              │
│  (Orchestrator, State Machine, PipelineContext, 13 Linear Step Modules) │
└──────────────────┬──────────────────────────────────┬───────────────────┘
                   │                                  │
                   ▼                                  ▼
┌──────────────────────────────────────┐ ┌────────────────────────────────┐
│            ENGINES LAYER             │ │           CORE LAYER           │
│  - Video (FFmpeg/FFprobe/Validator)  │ │  - Structured Logger & SSE Sink│
│  - R2 (S3 SigV4 Signer & Uploader)   │ │  - JobStore & QueueStore       │
│  - Stream (HTTP 206 Range Verifier)  │ │  - Error Hierarchy (21 Classes)│
│  - Manifest (Atomic Transaction Sync)│ │  - Filesystem Path Manager     │
│  - Git (Safety, Branch, Clean Tree)  │ │  - Secret Sanitizer (Redaction)│
│  - GitHub (Workflow Run Poller)      │ │                                │
│  - Production (Live Smoke Tester)    │ │                                │
└──────────────────┬───────────────────┘ └────────────────┬───────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONFIG & TESTS LAYERS                           │
│   (pipeline.config.json, JSON Schema, 66 Test Suites, 185 Unit Tests)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer Responsibilities

### 1. Desktop Layer (`app/desktop/`)
* **`main.ts`**: Electron entrypoint. Manages application initialization, dynamic port allocation, spawning the internal UI server, creating the `BrowserWindow` with native titlebars and dark `#050505` background, and terminating background processes on app exit.
* **`index.ts`**: Module exports for desktop runtime functions (`startDesktopApp`, `createWindow`).

### 2. Application Layer (`app/`)
* **`ui/server.ts`**: Native HTTP server with Zero-dependency REST API and Server-Sent Events (SSE) broadcaster for streaming live logs, state transitions, queue summaries, and job records.
* **`application/upload-service.ts`**: Handles browser-native multipart file streaming directly into a secure staging directory (`temp/uploads/`) with immediate FFprobe validation.
* **`application/input-controller.ts`**: Coordinates the active `VideoQueue`, orchestrates file staging, manages queue synchronization, and interfaces with `QueueStore`.
* **`application/queue-store.ts`**: Persists queue state to `data/queue.json` and auto-restores valid items upon server startup.
* **`main/index.ts`**: Unified CLI and Web launcher (`--ui`, `--dry-run`, `--input`).

### 3. Pipeline Layer (`pipeline/`)
* **`pipeline.ts` (`VideoPipelineOrchestrator`)**: Executes linear delivery steps, manages `AbortController` cancellation signals, tracks progress, and transitions the state machine.
* **`state-machine.ts` (`PipelineStateMachine`)**: Formal finite state machine governing legal phase transitions (`IDLE` $\rightarrow$ `VALIDATING` $\rightarrow$ `UPLOADING_R2` $\rightarrow$ ... $\rightarrow$ `COMPLETED`).
* **`context.ts` (`PipelineContext`, `PipelineItem`)**: Shared execution context carrying batch item metadata, credentials, logging sinks, step results, and cancellation flags.
* **`steps/`**: 12 isolated step implementations implementing the `PipelineStep` interface:
  * `ValidateStep`, `UploadR2Step`, `VerifyR2Step`, `VerifyStreamStep`, `UpdateManifestStep`, `CleanupGitStep`, `VerifyGitignoreStep`, `RunTestsStep`, `CommitStep`, `PushStep`, `GitHubActionsStep`, `ProductionSmokeStep`.

### 4. Engines Layer (`engines/`)
* **`video/`**: Media inspection via FFprobe, stream validation, and deterministic key/filename normalization preserving original container format. (Note: Video encoding is performed externally in DaVinci Resolve).
* **`r2/`**: Zero-dependency Cloudflare R2 S3-compatible client with AWS SigV4 signer, pre-flight idempotency HEAD checks, transient retry with exponential backoff, and byte-length verifier.
* **`stream/`**: HTTP 206 partial content range tester asserting edge CDN byte-range responses (`Range: bytes=0-1048575`).
* **`manifest/`**: Atomic JSON reader, schema validator, diff generator, and transactional writer with `.bak` rollback safety.
* **`git/`**: Verifies clean working trees, checks `.gitignore` rules, untracks legacy video binaries, and stages commits safely.
* **`github/`**: Polls the GitHub REST API to track GitHub Pages deployment workflows.
* **`production/`**: Runs live smoke tests against the deployed production website and edge video streams.

### 5. Core Layer (`core/`)
* **`logger/`**: Structured logger with pluggable sinks (SSE streaming, terminal formatting) and automated secret redaction.
* **`security/` (`SecretSanitizer`)**: Sanitizes credentials (`R2_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, PATs) from logs, errors, and JSON files.
* **`state/` (`JobStore`)**: Persists job records to `data/jobs/<job-id>.json` and performs orphan recovery on startup.
* **`errors/`**: Typed domain error classes for granular root-cause reporting.
* **`filesystem/`**: Safe path resolution and directory boundary validation.

### 6. Config Layer (`config/`)
* **`pipeline.config.json`**: Supported input formats, R2 bucket URLs, directory mappings, timeouts, and retry policies. Strictly contains zero secrets.

### 7. Tests Layer (`tests/`)
* 64 test suites with 185 unit, security, and integration tests ensuring zero regressions.

---

## 3. Data Flow & Communication Architecture

```
User Action (Drag & Drop / Run / Cancel)
                 │
                 ▼
 Electron Window / Web Browser UI
                 │  (HTTP POST /api/upload, /api/pipeline/run, /api/pipeline/cancel)
                 ▼
       PipelineUiServer (app/ui/server.ts)
                 │
                 ├──────────────────────────────┐
                 ▼                              ▼
      UploadService / QueueStore            JobStore (core/state/job-store.ts)
       (Staging & Persistence)               (Persist RUNNING / CANCELLED / COMPLETED)
                 │
                 ▼
     VideoPipelineOrchestrator (pipeline/pipeline.ts)
                 │
                 ├──────────────────────────────┐
                 ▼                              ▼
          Pipeline Steps                 PipelineLogger (SSE Broadcaster)
       (Upload, Verify, Deploy)                 │
                 │                              ▼
                 ▼                    Live UI Progress / Terminal
      Engines (FFprobe, R2, Git)
```

---

## 4. Key Architectural Patterns

1. **Single Source of Truth**: Exactly one single `VideoPipelineOrchestrator` is used across CLI, Web, and Desktop modes. No duplicate or simulated pipelines exist.
2. **Delivery-Only Pipeline**: Video encoding is done externally in DaVinci Resolve. The pipeline acts as a delivery vehicle preserving raw media bytes, container, and codec.
3. **Transactional Manifests**: Writes to `data/work-manifest.json.tmp`, creates `temp/work-manifest.json.bak`, and executes atomic rename with automatic rollback on error.
4. **Abort Signal Propagation**: `AbortController` signal is checked before every step and listened to by active network and pipeline tasks to ensure immediate termination on cancellation.
5. **Zero-Secret Boundary**: All secrets reside strictly in `process.env` and are scrubbed by `SecretSanitizer` before writing to disk or emitting across SSE.
