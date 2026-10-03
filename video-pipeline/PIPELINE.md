# Target Pipeline Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline  
**Runtime:** Node.js 20+ / 22+ (ESM `NodeNext`), TypeScript 5.8+

---

## 1. Pipeline State Machine & Execution Flow

The `VideoPipelineOrchestrator` strictly enforces a sequential linear progression managed by `PipelineStateMachine`. Video encoding is handled externally in DaVinci Resolve using project-specific export presets; the pipeline receives the final master video and delivers it directly to Cloudflare R2 and production.

If any step fails or is aborted, the state machine transitions to `FAILED` or `CANCELLED`, halting execution immediately.

```
                  ┌───────────────────┐
                  │       IDLE        │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │    VALIDATING     │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │   UPLOADING_R2    │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │   VERIFYING_R2    │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ VERIFYING_STREAM  │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ UPDATING_MANIFEST │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │   CLEANING_GIT    │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │  VERIFYING_GIT    │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │   RUNNING_TESTS   │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │    COMMITTING     │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │      PUSHING      │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │WAITING_FOR_ACTIONS│ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │PRODUCTION_SMOKE_T │ ──► [FAILED / CANCELLED]
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │     COMPLETED     │
                  └───────────────────┘
```

---

## 2. Granular Step Specifications

### Step 1: Validate (`VALIDATING`)
* **Step Module:** [`ValidateStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/validate.ts)
* **Input:** Raw input video files staged in `temp/uploads/` or local paths (`.mp4`, `.mov`, `.mkv`, `.avi`, `.mxf`, `.webm`).
* **Responsibilities:**
  * Checks file existence and non-zero byte size.
  * Inspects container streams via `ffprobe`.
  * Extracts metadata: duration, FPS, dimensions, audio/video codecs without modifying media bytes.
  * Parses naming pattern (`[TAG]_[PROJECT_NAME].[ext]`).
* **Output:** Populates `PipelineItem.metadata` and sets status `READY`.
* **Failure Behavior:** Throws `VideoValidationError`, transitions to `FAILED`.
* **State Mutation:** In-memory context only. Zero external network calls.

---

### Step 2: Upload to Cloudflare R2 (`UPLOADING_R2`)
* **Step Module:** [`UploadR2Step`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/upload-r2.ts)
* **Input:** Validated source video files.
* **Responsibilities:**
  * Pre-flight Idempotency: Issues `headObject(key)`. Skips upload if remote object exists with matching size and matching content type.
  * S3 SigV4 Signer: Signs HTTP PUT request using AWS SigV4 (`AWS4-HMAC-SHA256`).
  * Content-Type: Dynamically sets MIME type according to file container (`video/mp4`, `video/quicktime`, etc.).
  * Serialized Concurrency: Processes 1 file at a time.
  * Transient Retries: Retries 5xx server errors up to 3 times with exponential backoff.
* **Output:** Populates `PipelineItem.r2Key`, `r2Url`, and `r2Uploaded = true`.
* **Failure Behavior:** Throws `R2UploadError` or `R2CredentialsError`. Never retries 401/403 credentials errors.

---

### Step 3: Cloudflare R2 Verification (`VERIFYING_R2`)
* **Step Module:** [`VerifyR2Step`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/verify-r2.ts)
* **Input:** Target R2 object keys.
* **Responsibilities:**
  * Issues HEAD request directly to Cloudflare R2 S3 endpoint.
  * Verifies HTTP 200 status.
  * Asserts correct media `Content-Type` and exact byte match against local source master file.
* **Output:** Sets `PipelineItem.r2ObjectVerified = true`.
* **Failure Behavior:** Throws `R2VerificationError`.

---

### Step 4: HTTP Range 206 Streaming Verification (`VERIFYING_STREAM`)
* **Step Module:** [`VerifyStreamStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/verify-stream.ts)
* **Input:** Public edge CDN delivery URL (`https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/<key>`).
* **Responsibilities:**
  * Issues HTTP GET with header `Range: bytes=0-1048575` (1MB initial playback range).
  * Asserts HTTP 206 Partial Content (HTTP 200 is rejected).
  * Validates headers `Accept-Ranges: bytes` and `Content-Range: bytes 0-1048575/<total>`.
  * Verifies received chunk payload body length $> 0$.
* **Output:** Sets `PipelineItem.streamVerified = true`.
* **Failure Behavior:** Throws `StreamVerificationError`.

---

### Step 5: Update Work Manifest (`UPDATING_MANIFEST`)
* **Step Module:** [`UpdateManifestStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/update-manifest.ts)
* **Input:** Verified items with `r2ObjectVerified === true` and `streamVerified === true`.
* **Responsibilities:**
  * Reads `data/work-manifest.json` and creates a backup at `temp/work-manifest.json.bak`.
  * Upserts verified items, deterministically sorting keys ascending.
  * Writes to temporary file `data/work-manifest.json.tmp` and renames atomically via `fs.renameSync`.
  * Re-reads from disk and validates JSON schema.
* **Output:** Updated and sorted `data/work-manifest.json`.
* **Failure Behavior:** Automatically restores backup `.bak` file and throws `ManifestError`.

---

### Step 6: Git Working Tree Cleanup (`CLEANING_GIT`)
* **Step Module:** [`CleanGitStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/clean-git.ts)
* **Responsibilities:**
  * Scans Git index for tracked video binaries (`assets/videos/projects/*`).
  * Untracks video binaries from Git cache (`git rm --cached`).
* **Output:** Git index free of video binaries.

---

### Step 7: Verify .gitignore Rules (`VERIFYING_GIT`)
* **Step Module:** [`VerifyGitignoreStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/verify-gitignore.ts)
* **Responsibilities:**
  * Verifies `.gitignore` in repository root ignores video binaries and credentials (`.env`).
* **Output:** Confirmed Git safety rules.

---

### Step 8: Run Portfolio Integrity Tests (`RUNNING_TESTS`)
* **Step Module:** [`RunTestsStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/run-tests.ts)
* **Responsibilities:**
  * Executes configured test commands (`node scripts/validate.js`).
  * Asserts exit code `0`.
* **Failure Behavior:** If tests fail, automatically rolls back manifest update and halts.

---

### Step 9: Atomic Git Commit (`COMMITTING`)
* **Step Module:** [`CommitStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/commit.ts)
* **Responsibilities:**
  * Stages strictly authorized file: `data/work-manifest.json`.
  * Commits with message: `feat(video): add [NAME] to R2 work-manifest`.
* **Output:** New commit SHA recorded in `PipelineContext`.

---

### Step 10: Git Remote Push (`PUSHING`)
* **Step Module:** [`PushStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/push.ts)
* **Responsibilities:**
  * Verifies current branch is `main`.
  * Pushes to `origin/main` without `--force`.
* **Output:** Remote updated with new commit.

---

### Step 11: GitHub Actions Monitoring (`WAITING_FOR_GITHUB_ACTIONS`)
* **Step Module:** [`GithubActionsStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/github-actions.ts)
* **Responsibilities:**
  * Polls GitHub REST API for workflow execution matching the pushed commit SHA.
  * Polls until workflow conclusion is `success` (timeout: 15 minutes).

---

### Step 12: Production Live Smoke Test (`PRODUCTION_SMOKE_TEST`)
* **Step Module:** [`ProductionSmokeTestStep`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/pipeline/steps/production-smoke.ts)
* **Responsibilities:**
  * Fetches live portfolio homepage (`https://pdp212.github.io/`).
  * Confirms live `data/work-manifest.json` returns updated entries.
  * Performs live HTTP 206 partial content stream verification against production CDN.
* **Output:** Final pipeline status transitions to `COMPLETED`.

---

## 3. Atomic Release Transaction Model

```
STAGE 1 - 4: Ingestion & Cloud Storage
[Validate] ──► [Upload R2] ──► [Verify R2] ──► [Verify Stream]
                       │
               Failure / Cancel: Abort upload; preserve master source.
                       │
STAGE 5 - 8: Local Verification & Tests
[Manifest Sync] ──► [Clean Git] ──► [Verify Git] ──► [Run Tests]
                       │
               Failure / Cancel: Rollback manifest from .bak! No commit.
                       │
STAGE 9 - 12: Deployment & Production Smoke
[Commit] ──► [Push] ──► [Wait GitHub Actions] ──► [Production Smoke Test]
```
