# Video Pipeline

Automated video ingestion, validation, transcoding, Cloudflare R2 deployment, manifest updating, and production verification system for the portfolio website ([pdp212.github.io](https://pdp212.github.io/)).

---

## 1. Overview & Objective

The **Video Pipeline** subproject automates the complete lifecycle of adding showcase videos to the portfolio without manual encoding, manual S3/R2 uploads, or manual JSON editing.

### End-to-End Pipeline Target
```
OPEN APP
   ↓
DROP VIDEO (Single or Batch)          <-- Phase 02 Complete
   ↓
VALIDATE (Format, Headers, Filename)  <-- Phase 02 Complete
   ↓
ENCODE (Canonical H.264 Web Profile)  <-- Phase 03 Complete (LOCAL ENCODING ONLY)
   ↓
UPLOAD R2 (Cloudflare S3-compatible direct upload)  <-- Phase 04 Complete
   ↓
VERIFY R2 (HEAD object existence, size, ETag)       <-- Phase 04 Complete
   ↓
VERIFY HTTP 206 (Streaming byte-range check)        <-- Phase 04 Complete
   ↓
UPDATE WORK MANIFEST (data/work-manifest.json atomic update)  <-- Phase 05 Complete
   ↓
REMOVE GIT FALLBACK (Un-track local video files if present)   [Phase 06 Target]
   ↓
RUN TESTS (node scripts/validate.js pre-commit verification)
   ↓
GIT COMMIT (Atomic commit on main branch)
   ↓
GIT PUSH (Push to origin/main)
   ↓
GITHUB ACTIONS (Monitor remote Pages deployment workflow)
   ↓
PRODUCTION SMOKE TEST (Verify live CDN playback on pdp212.github.io)
```

---

## 2. Phase 05 Implementation Status (Manifest Management & Production Registry)

### Highlights & Architectural Controls:
- **Canonical Manifest Schema:**
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
- **Strict Verification Gate:**
  - Only items with both `r2ObjectVerified === true` and `streamVerified === true` may enter the manifest. Unverified items block execution.
- **Deterministic Identity & Extraction:**
  - Derives `tag` and `name` deterministically (e.g. `TAG_NAME.mp4` or `TAG_NAME.TYPE.mp4`). Throws `ManifestError` on ambiguous names.
- **Deterministic Merge & Sorting:**
  - Updates existing keys without creating duplicates; appends new items; strictly sorts ascending by `key`.
- **Atomic Transactional Writer with Rollback:**
  1. Read and validate current manifest.
  2. Create backup in `video-pipeline/temp/work-manifest.json.bak`.
  3. Generate and validate updated entries.
  4. Write to temporary file `data/work-manifest.json.tmp`.
  5. Atomic rename via `fs.renameSync`.
  6. Re-read and validate final manifest from disk.
  7. If any step fails, restore from `.bak` and halt with `ManifestError`.
- **Diff Engine & Dry-Run (`--dry-run`):**
  - Computes `added`, `updated`, `unchanged`, and `removed` counts.
  - Generates formatted ASCII summary box without disk mutations when dry-run is requested.
- **Strict Phase Boundary:**
  - Remote R2 is strictly read-only (no remote R2 PUT or overwrite).
  - Zero Git operations (no `git add`, `git rm`, `git commit`, `git push`).
  - Halts cleanly after `UPDATING_MANIFEST` stage.

---

## 3. Phase 04 Implementation Status (R2 Upload + Stream Verification)

### Architecture Highlights:
- **Zero-Dependency Native AWS SigV4 Client (`engines/r2/r2-client.ts`):**
  - Native HMAC-SHA256 signature derivation using `node:crypto`.
  - Supports `PUT` upload and `HEAD` metadata inspection directly against Cloudflare R2 S3 endpoints.
  - Zero external npm packages required.
- **Idempotency & Collision Protection (`engines/r2/uploader.ts`):**
  - Issues `HEAD` request before uploading. If remote object exists with identical `Content-Length` and `Content-Type: video/mp4`, skips upload and marks `ALREADY_UPLOADED`.
  - Serialized concurrency (`concurrency: 1`) to guarantee deterministic bandwidth and auditability.
- **Controlled Transient Retry (`engines/r2/uploader.ts`):**
  - Retries transient 5xx server errors and network timeouts up to 3 times with exponential backoff.
  - Never retries permanent errors (401/403 credentials, 404 bucket missing, invalid local file).
- **Direct Object Verification (`engines/r2/verifier.ts`):**
  - Executes `HEAD` requests directly against Cloudflare R2 to verify HTTP 200, Content-Type `video/mp4`, and exact byte-for-byte matching with local encoded MP4 size.
- **HTTP 206 Byte-Range Streaming Verification (`engines/r2/stream-verifier.ts`):**
  - Issues HTTP GET request with `Range: bytes=0-1048575` to public delivery URL.
  - Strictly requires HTTP 206 Partial Content (HTTP 200 is rejected).
  - Validates `Accept-Ranges: bytes`, parses `Content-Range: bytes 0-1048575/<total>`, and verifies payload body length > 0.
- **Strict Phase Boundary:**
  - Halts cleanly after `VERIFYING_STREAM`.
  - Strictly zero modifications to `data/work-manifest.json` or portfolio website.
  - Strictly zero Git commits or pushes.

---

## 3. Phase 03 Implementation Status (LOCAL ENCODING ONLY)

### Canonical Production Encoding Profile:
| Attribute | Specification | Notes |
|---|---|---|
| **Container** | MP4 | Standard web container |
| **Video Codec** | H.264 / AVC (`libx264`) | Universal web compatibility |
| **Pixel Format** | `yuv420p` | Universal decoder compatibility |
| **Quality (CRF)** | `18` | High perceptual fidelity |
| **Encoder Preset** | `medium` | Balanced compression efficiency |
| **H.264 Profile / Level** | `high` / `4.2` | Broad hardware acceleration support |
| **Fast Start** | `-movflags +faststart` | Relocates moov atom for instant playback |
| **Audio Codec** | AAC (`aac`) | High quality audio compression |
| **Audio Bitrate** | `192 kbps` | Stereo audio bitrate |
| **Audio Sample Rate**| `48000 Hz` | Standard production sample rate |
| **Audio Channels** | Stereo (2 channels) | Preserves audio stream if present |
| **Source Without Audio**| Handled (`-an`, `AUDIO: NONE`) | Does NOT fail or fabricate audio |
| **Resolution** | Preserved | No upscaling, no cropping, no aspect ratio modification |
| **Frame Rate** | Preserved | Matches source FPS |

### What is implemented in Phase 03:
- **Low-Level FFmpeg Runner (`VideoTranscoderService`):**
  - Spawns external FFmpeg process asynchronously (`engines/video/ffmpeg.ts`).
  - Streaming progress parsing from stderr (`time=`, `fps=`, `bitrate=`, `speed=`).
  - Graceful cancellation (`SIGINT` -> `SIGKILL` after timeout) and temporary artifact cleanup.
- **Output Safety & Atomic Promotion:**
  - Files are encoded into temporary staging: `encoded/.tmp/<id>.mp4`.
  - Incomplete or aborted encodes are wiped automatically.
  - Finalized output is atomically promoted to: `video-pipeline/encoded/<NAME>.mp4`.
- **Deterministic Filenames:**
  - `WED_PHUNGTUONG.mov` -> `WED_PHUNGTUONG.mp4`.
  - `MOTION BRAND FILM.mov` -> `MOTION_BRAND_FILM.mp4` (sanitizes spaces, removes duplicate extensions).
- **Existing File Safety Gate:**
  - If output exists and `allowOverwrite` is `false`, encoding blocks safely with `OutputExistsError`.
- **Post-Encoding Deep Verification (`OutputValidator`):**
  - Runs native FFprobe on encoded MP4 to assert container, codecs (`h264`, `aac`), pixel format (`yuv420p`), duration, resolution match, and frame rate match.
- **UI Integration:**
  - Interactive "Run Pipeline (Phase 03: Encode)" button enabled when READY videos exist.
  - Runs `VALIDATE -> ENCODE -> VERIFY ENCODED OUTPUT -> STOP`.
- **Master Video Safety:**
  - Master source videos remain 100% read-only. Never moved, modified, or deleted.

### What is strictly DEFERRED to Phase 04+:
- Cloudflare R2 uploads or bucket modifications.
- Live Git commits or pushes.
- Production website or GitHub Pages deployment.

---

## 3. Directory Structure

```
video-pipeline/
├── app/                  # Application bootstrap, CLI/UI presentation contracts
│   ├── main/             # CLI entrypoint (bootstraps UI or CLI inspection)
│   ├── ui/               # Local Web UI server (server.ts) & console adapters
│   └── application/      # Lifecycle, VideoInput model, VideoQueue & InputController
├── pipeline/             # Orchestrator & state machine
│   ├── pipeline.ts       # Sequential pipeline orchestrator (supports stopAfterStage)
│   ├── state-machine.ts  # Allowed transitions & illegal bypass prevention
│   ├── context.ts        # Shared pipeline context & VideoInput converter
│   └── steps/            # 13 step definitions (encode.ts production transcode)
├── engines/              # Technical engines (independent tools)
│   ├── video/            # FFprobe parser, FFmpeg process runner, output validator, video facade
│   ├── r2/               # Cloudflare R2 client, uploader, & HTTP 206 verifier [Phase 04]
│   ├── manifest/         # Atomic reader, validator, and writer for work-manifest.json
│   ├── git/              # Git client, status checker, cleanup, & safety guards
│   ├── github/           # GitHub Actions deployment monitor
│   └── production/       # Production live smoke test & network verifier
├── core/                 # Shared foundations
│   ├── errors/           # Typed error hierarchy (16 error classes including encoding errors)
│   ├── logger/           # Structured logger with automatic secret redaction
│   ├── state/            # Immutable state store & transition audit trail
│   ├── filesystem/       # Non-destructive file lifecycle manager & atomic promotion
│   └── security/         # Environment credential boundary & sanitization
├── config/               # Configuration (Strictly zero secrets)
│   ├── pipeline.config.json # Canonical production profile (CRF 18, high 4.2, yuv420p)
│   └── schema/
├── tests/                # Test suites & fixtures (30 tests across 11 suites, 100% pass)
│   ├── unit/             # VideoEncoder, OutputValidator, EncodeStep, VideoQueue, Inspector tests
│   ├── security/         # Secret redaction & credential boundary tests
│   ├── integration/      # Encoding pipeline, UI server, input handoff, dry-run integration tests
│   └── fixtures/         # Valid & invalid manifest test samples
├── scripts/              # Helper & validation scripts (typecheck.sh)
├── temp/                 # Temporary working files (.gitkeep)
├── encoded/              # Final production encoded artifacts (.gitkeep, ignored in Git)
│   └── .tmp/             # Temporary staging folder for atomic promotion
├── completed/            # Successfully processed artifacts (.gitkeep)
├── failed/               # Quarantine for failed processing (.gitkeep)
├── .env.example          # Environment credential template (never commit .env)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Quick Start & Verification

### Prerequisites
- Node.js `v20+` or `v22+` (Current environment: `v24.18.1`)
- npm `10+`
- `ffmpeg` & `ffprobe` (e.g., via `brew install ffmpeg`)

### 1. Launch Interactive Local UI Tool
```bash
cd video-pipeline
npm run ui
```
Opens the interactive browser tool at `http://127.0.0.1:3210`.

### 2. Run CLI Video Ingestion & Inspection
```bash
cd video-pipeline
npm run build
node dist/app/main/index.js /path/to/video1.mov /path/to/video2.mp4
```

### 3. Run Test Suites
```bash
cd video-pipeline
npm run typecheck
npm test
```

---

## 5. Security & Credentials Policy

All credentials must be supplied exclusively via environment variables:
- `R2_ACCOUNT_ID`: Cloudflare account identifier
- `R2_ACCESS_KEY_ID`: Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 secret key
- `GITHUB_TOKEN`: GitHub personal access token (workflow & repo permissions)

Secrets are **never** committed to version control, never written to `pipeline.config.json`, and never logged in plain text.
In Phase 03, zero network uploads or external credential checks are performed. All encoding operations run locally.
