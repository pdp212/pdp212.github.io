# Troubleshooting & Failure Recovery Playbook

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

This playbook provides actionable diagnostic workflows, root-cause analyses, and remediation steps across all pipeline components.

---

## 1. Error Categories & Quick Reference

| Error Class | Pipeline Stage / Domain | Primary Cause | Severity |
| :--- | :--- | :--- | :--- |
| `VideoValidationError` | `VALIDATING` / Ingest | Corrupted video header, missing video stream, unsupported extension | Halting |
| `FFprobeNotFoundError` | `VALIDATING` | FFprobe not found on system `$PATH` | Halting |
| `PipelineCancelledError`| Any / Cancel | User requested pipeline cancellation during run | Halting / Safe |
| `R2CredentialsError` | `UPLOADING_R2` | Invalid or missing Cloudflare R2 credentials (HTTP 401/403) | Halting |
| `R2RetryExhaustedError` | `UPLOADING_R2` | Network outage; exhausted 3 retry attempts | Halting |
| `R2VerificationError` | `VERIFYING_R2` | Remote S3 HEAD 404, size mismatch, or invalid Content-Type | Halting |
| `StreamVerificationError` | `VERIFYING_STREAM` | Edge CDN did not respond with HTTP 206 Partial Content | Halting |
| `ManifestError` | `UPDATING_MANIFEST` | JSON syntax corruption, duplicate key, or schema mismatch | Rollback |
| `GitSafetyError` | `VERIFYING_GIT` / Git | Dirty working tree, untracked changes, or invalid branch | Halting |
| `TestFailure` | `RUNNING_TESTS` | `node scripts/validate.js` failed | Rollback |
| `GitCommitError` | `COMMITTING` | Git index locked or commit failure | Halting |
| `GitPushError` | `PUSHING` | Remote conflict or network timeout | Halting |
| `GitHubActionsError` | `WAITING_FOR_GITHUB_ACTIONS`| Remote Pages build failed or timed out | Halting |
| `ProductionSmokeTestError`| `PRODUCTION_SMOKE_TEST`| Edge cache propagation delay or CDN 404 | Halting |

---

## 2. Ingestion & Validation Issues

### Symptom: `Video inspection failed: No video stream detected`
* **Cause:** The dropped media file has no valid video stream, or is an audio-only file / corrupted container.
* **Check:** Run `ffprobe -v error -show_streams <path_to_file>` to inspect the stream layout.
* **Action:** Re-export the source master with a standard video codec (H.264, HEVC, ProRes, DNxHR) in DaVinci Resolve.

### Symptom: `Unsupported file extension '.xyz'`
* **Cause:** Only `.mp4`, `.mov`, `.mkv`, `.avi`, `.mxf`, `.webm` are supported.
* **Check:** Verify file extension against `supportedInputFormats` in `config/pipeline.config.json`.
* **Action:** Export the final master from DaVinci Resolve in a supported container format.

---

## 3. Cloudflare R2 & Streaming Issues

### Symptom: `Cloudflare R2 authentication failed (HTTP 401/403)`
* **Cause:** Missing or expired `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, or `R2_SECRET_ACCESS_KEY`.
* **Check:** Verify environment variables in `.env`.
* **Action:** Re-generate R2 API tokens in Cloudflare Dashboard with `Object Read & Write` permissions.

### Symptom: `Server responded with HTTP 200 OK instead of required HTTP 206 Partial Content`
* **Cause:** The edge CDN stripped the `Range` request header or does not support byte-range requests.
* **Check:** Run `curl -I -H "Range: bytes=0-1048575" <public_r2_url>`.
* **Action:** Confirm that Cloudflare R2 bucket public access domain is properly configured and caching rules allow byte ranges.

---

## 4. Desktop Application & Server Issues

### Symptom: `Port 3210 is already in use`
* **Cause:** Another instance of the UI server or a different local service is bound to port 3210.
* **Check:** Run `lsof -i :3210` to see what process is listening.
* **Action:** The desktop launcher automatically detects port conflicts and scans for the next available port. Alternatively, kill the stale process: `kill -9 <PID>`.

### Symptom: Electron window opens with blank screen
* **Cause:** Local server failed to start or was blocked by firewall.
* **Check:** Check the terminal logs where `npm run desktop:dev` was executed.
* **Action:** Verify TypeScript build completed (`npm run build`) and that `http://127.0.0.1:3210` is accessible.

---

## 5. Queue & Job State Recovery Issues

### Symptom: Videos disappear after app restart
* **Cause:** Staged source files in `temp/uploads/` were deleted by the operating system or manually purged.
* **Check:** On startup, `QueueStore` validates file presence on disk. If a staged file is missing, it is removed from the queue to prevent pipeline failures.
* **Action:** Re-drop the master video into the application.

### Symptom: Interrupted job left in `RUNNING` status after crash
* **Cause:** The application process terminated abruptly (power loss or forced exit) while executing a pipeline.
* **Check:** `JobStore.recoverInterruptedJobs()` runs automatically on startup and transitions any orphaned `RUNNING` jobs to `FAILED`.
* **Action:** Check `data/jobs/` for the marked job record. Re-run the pipeline cleanly.
