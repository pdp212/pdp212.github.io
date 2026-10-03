# Video Pipeline

> **Production-Ready Desktop & CLI Automated Video Delivery, R2 Deployment & Production Verification Pipeline for Portfolio**

Video Pipeline is a specialized, zero-dependency, automated delivery pipeline. The final video is prepared externally in DaVinci Resolve according to project-specific production requirements. The Video Pipeline receives the final prepared video artifact, inspects it with FFprobe, securely uploads it to Cloudflare R2 without altering the original bytes or container, atomically updates the portfolio work manifest, enforces Git safety boundaries, and verifies live edge CDN playback with HTTP 206 streaming verification.

---

## 1. System Overview

```
 FINAL PREPARED VIDEO (MP4, MOV, MKV, AVI, MXF, WEBM)
 (Prepared externally in DaVinci Resolve)
       │
       ▼
 ┌─────────────────────────────────────────┐
 │ 1. INGEST & VALIDATE                    │ ──► FFprobe metadata validation
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 2. UPLOAD R2 (AWS SigV4 Signer)         │ ──► Pre-flight HEAD idempotency & direct upload
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 3. VERIFY R2 (HEAD Check)               │ ──► Content-Type & byte length check
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 4. VERIFY HTTP 206 (Byte-Range Stream)  │ ──► Range: bytes=0-1048575 verification
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 5. UPDATE MANIFEST                      │ ──► Atomic transactional update & backup
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 6. GIT SAFETY & CLEANUP                 │ ──► Untrack legacy binaries, check .gitignore
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 7. RUN TESTS                            │ ──► Portfolio validation test suite
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 8. COMMIT & PUSH                        │ ──► Clean atomic git commits
 └─────────────────┬───────────────────────┘
                   ▼
 ┌─────────────────────────────────────────┐
 │ 9. GITHUB ACTIONS & PRODUCTION SMOKE    │ ──► Remote workflow polling & live check
 └─────────────────────────────────────────┘
```

---

## 2. Key Features

* **Desktop Application**: Packaged with Electron for macOS. Starts an internal server automatically and opens a native window with Drag & Drop and File Picker support.
* **Delivery-Only Architecture**: Video encoding is handled externally in DaVinci Resolve. The pipeline preserves original video bytes, container, resolution, FPS, and codecs.
* **Real-time Pipeline Cancellation**: Powered by `AbortController` and network aborts. Cancelling instantly halts active uploads and prevents downstream mutations.
* **Persistent Video Queue**: State saved automatically to `data/queue.json` on queue mutations; automatically restores on application startup after validating on-disk media.
* **Persistent Job History**: Full execution audit records persisted to `data/jobs/<job-id>.json`. Recovers orphaned running jobs upon application restart.
* **Zero-Leak Security Boundary**: Standardized `SecretSanitizer` redacts sensitive tokens (`R2_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, PATs) across all SSE streams, logs, job records, and API responses.
* **Native Cloudflare R2 Engine**: S3-compatible client with built-in AWS SigV4 signer, pre-flight idempotency checks, and serialized concurrency.
* **Edge Streaming Verification**: Verifies HTTP 206 Partial Content delivery with `Range: bytes=0-1048575` headers against Cloudflare's public CDN edge.
* **Atomic Manifest Management**: Transactional updates to `data/work-manifest.json` backed by temporary backups and atomic `fs.renameSync`.

---

## 3. Supported Input Formats

The pipeline accepts final exported videos in multiple formats configured in `pipeline.config.json`:
* `.mp4`
* `.mov`
* `.mkv`
* `.avi`
* `.mxf`
* `.webm`

---

## 4. Quick Start

### Prerequisites
* **Node.js**: v20+ or v22+
* **FFprobe**: Installed and available on system `$PATH` (`brew install ffmpeg` for ffprobe)
* **Environment Variables**: Copy `.env.example` to `.env` and fill in Cloudflare R2 and GitHub credentials.

### Development Commands

```bash
# Navigate to pipeline workspace
cd video-pipeline

# Install dependencies
npm install

# Run TypeScript compilation
npm run build

# Type check codebase without emitting
npm run typecheck

# Run full test suite (185 tests)
npm test

# Launch Web UI mode (Fastify server on http://127.0.0.1:3210)
npm run ui

# Launch Desktop App (Electron)
npm run desktop:dev
```

### Packaging Commands

```bash
# Build desktop distribution
npm run desktop:build

# Package standalone macOS application
npm run desktop:package
```

---

## 5. Documentation Directory

For in-depth details on architecture, operations, and security, refer to the documentation set:

* 📚 [**Documentation Index**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DOCUMENTATION.md) — Directory of all documents and recommended reading paths.
* 🖥️ [**User Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/USER_GUIDE.md) — Operational instructions for running the application.
* 🏛️ [**Architecture Specification**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/ARCHITECTURE.md) — Complete 7-layer design and module boundaries.
* ⚙️ [**Pipeline Specification**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/PIPELINE.md) — State machine, step transitions, and failure policies.
* 💻 [**Desktop Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DESKTOP.md) — Electron packaging, window lifecycle, and native integration.
* 🔌 [**REST & SSE API**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/API.md) — Full API reference for HTTP endpoints and live SSE event streams.
* 📊 [**Data Model**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DATA_MODEL.md) — TypeScript type definitions and persistent storage schemas.
* 🔄 [**Job Lifecycle**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/JOB_LIFECYCLE.md) — Job states, persistence, and crash recovery mechanics.
* 🛑 [**Cancellation Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CANCELLATION.md) — Abort propagation, FFmpeg SIGKILL, and safety boundaries.
* 🛠️ [**Development Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DEVELOPMENT.md) — Setup guide, tooling, and coding standards.
* 🧪 [**Testing Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/TESTING.md) — Test architecture and verification baseline (185 tests passing).
* ⚙️ [**Configuration**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CONFIGURATION.md) — `pipeline.config.json` and environment variables.
* 🔒 [**Security Model**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/SECURITY.md) — Credential protection, secret sanitization, and path traversal guards.
* 🚨 [**Troubleshooting**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/TROUBLESHOOTING.md) — Solutions for common operational errors.
* 📦 [**Release Guide**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/RELEASE.md) — Release checklists and desktop packaging procedures.
* 📜 [**Phase History**](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/PHASE_HISTORY.md) — Chronological evolution from Phase 01 to Phase 10.
