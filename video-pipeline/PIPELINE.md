# Target Pipeline Specification

This document details the complete end-to-end execution specification for the **Video Pipeline**.  
*Note: In Phase 01, this document serves as the target blueprint; execution logic is deferred to Phase 02.*

---

## 1. End-to-End Steps Specification

### Step 1: Validate (`VALIDATING`)
- **Inputs:** Raw input file paths.
- **Actions:**
  - Verifies file existence and read permissions.
  - Checks file extension against `supportedInputFormats` (`.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`).
  - Probes container integrity (valid MP4/MOV atoms).
  - Validates naming structure (`[TAG]_[PROJECT_NAME].[ext]`).
- **Success Criteria:** All input files are intact and follow conventions.
- **On Failure:** Halts with `VideoValidationError`.

### Step 2: Encode (`ENCODING`) — Phase 03 Implemented
- **Inputs:** Validated source video (`READY` status from Phase 02 Queue).
- **Actions:**
  - Executes low-level native FFmpeg child process (`video-pipeline/engines/video/ffmpeg.ts`):
    - **Container:** MP4
    - **Video Codec:** H.264 / AVC (`libx264`)
    - **CRF:** `18` (visually lossless constant rate factor)
    - **Preset:** `medium` (optimal quality-to-speed balance)
    - **Profile & Level:** `high`, `4.2`
    - **Pixel Format:** `yuv420p` (universal web browser compatibility)
    - **Resolution & Frame Rate:** Source preserved (no upscaling, aspect ratio locked)
    - **Audio Codec:** AAC stereo (`192 kbps`, `48000 Hz`). If source has no audio, automatically applies `-an` (AUDIO: NONE)
    - **Faststart:** `-movflags +faststart` (places moov atom at beginning for instant web streaming)
  - **Deterministic Naming:** Normalizes source basename to uppercase clean filename (e.g. `WED_PHUNGTUONG.mov` → `WED_PHUNGTUONG.mp4`).
  - **Atomic Staging:**
    - Transcodes initially to temporary staging: `encoded/.tmp/tmp_<id>_<timestamp>.mp4`
    - Runs post-encode deep validation (`OutputValidator`) via FFprobe
    - Promotes atomically via `fs.renameSync` to `encoded/[NAME].mp4`
    - Cleans up temporary artifacts immediately if any step fails
  - **Collision Prevention:** Default `allowOverwrite: false` prevents accidental overwrites unless explicitly enabled.
- **Success Criteria:** Verified compliant MP4 file located in `video-pipeline/encoded/`.
- **On Failure:** Halts with `EncodingProcessError`, `EncodingValidationError`, `OutputExistsError`, or `EncodingCancelledError`.
- **Phase Boundary:** Pipeline execution cleanly halts after `ENCODING`. Phase 04 will resume with R2 upload.

### Step 3: Cloudflare R2 Direct Upload (`UPLOADING_R2`) — Phase 04 Implemented
- **Inputs:** Validated, encoded MP4 files located in `video-pipeline/encoded/`.
- **Actions:**
  - Connects to Cloudflare R2 S3-compatible endpoint using credentials from `process.env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
  - Pre-flight Idempotency Check: Issues `headObject(key)` prior to upload. If remote object already exists with matching `Content-Length` and `Content-Type: video/mp4`, skips upload and marks `ALREADY_UPLOADED`.
  - Native AWS SigV4 Signer: Zero external dependencies, authenticating via standard AWS4-HMAC-SHA256 headers.
  - Serialized Execution: Strictly Concurrency = 1 for predictable network bandwidth and auditable logging.
  - Controlled Transient Retry: Retries 5xx server errors and network timeouts up to 3 times with exponential backoff. Permanent errors (401, 403, 404, invalid files) are never retried.
- **Success Criteria:** Object uploaded or matched with valid ETag.
- **On Failure:** Halts with `R2UploadError`, `R2CredentialsError`, or `R2RetryExhaustedError`.

### Step 4: Cloudflare R2 Verification (`VERIFYING_R2`) — Phase 04 Implemented
- **Inputs:** Target object keys.
- **Actions:**
  - Issues direct HEAD query to S3 endpoint for each uploaded item.
  - Verifies HTTP 200 status code.
  - Asserts `Content-Type` strictly equals `video/mp4`.
  - Asserts `Content-Length > 0` and strictly matches local encoded MP4 size in bytes.
- **Success Criteria:** All batch items verified with 100% metadata match.
- **On Failure:** Halts with `R2VerificationError` or `R2ObjectMismatchError`.

### Step 5: HTTP Range 206 Streaming Verification (`VERIFYING_STREAM`) — Phase 04 Implemented
- **Inputs:** Public CDN delivery URL (`https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/<key>`).
- **Actions:**
  - Performs HTTP GET request with header `Range: bytes=0-1048575` (1MB initial playback range).
  - Asserts response status is strictly `206 Partial Content` (HTTP 200 is explicitly rejected as unstreamable).
  - Asserts response header `Accept-Ranges: bytes`.
  - Parses and verifies header `Content-Range: bytes 0-1048575/<total>` with valid span and total size.
  - Asserts payload body length equals range span and is greater than 0.
- **Success Criteria:** Edge CDN responds with valid streaming chunk.
- **On Failure:** Halts with `StreamVerificationError` or `Http206RangeError`.
- **Phase Boundary:** Pipeline execution halts cleanly after `VERIFYING_STREAM`. Phase 05 will resume with Manifest update.

### Step 6: Update Work Manifest (`UPDATING_MANIFEST`) — Phase 05 Implemented
- **Inputs:** Verified video metadata, CDN public URL, tag, and project name from `PipelineContext`.
- **Verification Gate:**
  - Strictly requires both `r2ObjectVerified === true` and `streamVerified === true`.
  - Unverified videos immediately block execution and prevent manifest modification.
- **Actions:**
  - Reads current manifest via `ManifestReader` (`data/work-manifest.json`).
  - Validates current manifest schema and URLs via `ManifestValidator`.
  - Upserts verified entries deterministically via `mergeAndSortManifestEntries` (sorted key ascending).
  - Prepares diff via `ManifestDiff` (tracks added, updated, unchanged, removed).
  - Transactional Backup: Saves snapshot to `video-pipeline/temp/work-manifest.json.bak`.
  - Atomic Write: Writes serialized JSON to `data/work-manifest.json.tmp` and renames atomically via `fs.renameSync`.
  - Post-Write Verification: Re-reads written file from disk and validates schema before completing step.
  - Dry-Run Support: If `--dry-run` is active, previews diff and updates context without disk mutation.
- **Success Criteria:** Validated, sorted JSON array committed to local disk with 0 secret leaks.
- **On Failure:** Automatically rolls back from backup and halts with `ManifestError`.
- **Phase Boundary:** Pipeline execution halts cleanly after `UPDATING_MANIFEST`. Phase 06 will resume with Git cleanup.

### Step 7: Git Working Tree Cleanup (`CLEANING_GIT`)
- **Inputs:** Repository working tree.
- **Actions:**
  - Checks if corresponding local MP4 files exist under `assets/videos/projects/`.
  - Untracks them from Git index if previously tracked (`git rm --cached`).
- **Success Criteria:** No video binary fallbacks are tracked in Git.
- **On Failure:** Halts with `GitSafetyError`.

### Step 8: Verify .gitignore Rules (`VERIFYING_GIT`)
- **Inputs:** `.gitignore` configuration.
- **Actions:**
  - Verifies `assets/videos/projects/*.mp4` remains active.
  - Verifies `.env` and credential files are ignored.
- **Success Criteria:** Git safety rules verified.
- **On Failure:** Halts with `GitSafetyError`.

### Step 9: Run Portfolio Integrity Tests (`RUNNING_TESTS`)
- **Inputs:** Portfolio codebase.
- **Actions:**
  - Executes `node scripts/validate.js`.
  - Checks HTML integrity, CSS tokens, JavaScript syntax, and data manifest structure.
- **Success Criteria:** Test process exits with return code `0`.
- **On Failure:** Rolls back manifest and halts with `TestFailure`.

### Step 10: Atomic Git Commit (`COMMITTING`)
- **Inputs:** Verified manifest update.
- **Actions:**
  - Stages strictly authorized files: `data/work-manifest.json`.
  - Creates commit with message: `feat(video): add [NAME] to R2 work-manifest`.
- **Success Criteria:** Git commit recorded on `main` branch.
- **On Failure:** Halts with `GitCommitError`.

### Step 11: Git Remote Push (`PUSHING`)
- **Inputs:** Verified local commit.
- **Actions:**
  - Confirms remote is `origin/main`.
  - Strictly prohibits `--force` or `--force-with-lease`.
  - Pushes commit to GitHub.
- **Success Criteria:** Push acknowledged by GitHub.
- **On Failure:** Halts with `GitPushError`.

### Step 12: GitHub Actions Monitoring (`WAITING_FOR_GITHUB_ACTIONS`)
- **Inputs:** Head commit SHA.
- **Actions:**
  - Polls GitHub REST API for workflow `Deploy Portfolio to GitHub Pages`.
  - Tracks status: `queued` → `in_progress` → `completed`.
  - Monitors until conclusion is `success` (timeout: 15 minutes).
- **Success Criteria:** Workflow completes successfully.
- **On Failure:** Halts with `GitHubActionsError`.

### Step 13: Production Live Smoke Test (`PRODUCTION_SMOKE_TEST`)
- **Inputs:** Production URL `https://pdp212.github.io/`.
- **Actions:**
  - Fetches live website homepage and portfolio work view.
  - Verifies live `data/work-manifest.json` returns updated entries.
  - Tests HTTP 206 streaming response against the newly deployed production video URL.
- **Success Criteria:** Live website and video stream respond correctly.
- **On Failure:** Halts with `ProductionSmokeTestError`.

---

## 2. Atomic Release Transaction Model

```
STAGE 1 - 5: Ingestion & Cloud Storage
[Validate] -> [Encode] -> [Upload R2] -> [Verify R2] -> [Verify Stream]
                     │
              Any Failure? ──► Abort! Clean up temp. R2 key retained/purged.
                     │
STAGE 6 - 9: Local Verification & Tests
[Manifest Draft] -> [Clean Git] -> [Verify Git] -> [Run Tests]
                     │
              Any Failure? ──► Rollback Manifest (.bak)! Do NOT commit!
                     │
STAGE 10 - 13: Deployment & Production Smoke
[Commit] -> [Push] -> [Wait GitHub Actions] -> [Production Smoke Test]
```

- **Zero Partial Releases:** If processing multiple videos in batch, all videos must pass Stage 1–9 before any Git commit is executed.
