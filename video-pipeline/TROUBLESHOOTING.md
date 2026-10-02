# Troubleshooting & Failure Recovery Playbook

This playbook documents diagnostic workflows, error categories, and remediation steps for the **Video Pipeline**.

---

## Error Categories & Resolution Index

| Error Category | Pipeline Stage | Primary Cause | Severity |
|---|---|---|---|
| `VideoValidationError` | `VALIDATING` | Corrupted video file, missing audio/video stream, unsupported extension | Halting |
| `FFmpegNotFoundError` | `ENCODING` | FFmpeg or FFprobe binary not found in standard system paths or PATH | Halting |
| `EncodingProcessError` | `ENCODING` | FFmpeg process non-zero exit, crash, or unsupported codec input | Halting |
| `EncodingValidationError` | `ENCODING` | Output failed FFprobe verification (codec, resolution, audio mismatch) | Halting |
| `OutputExistsError` | `ENCODING` | Target output file already exists in `encoded/` and overwrite is false | Halting |
| `EncodingCancelledError` | `ENCODING` | Transcode was manually aborted or process was terminated | Halting |
| `R2UploadError` | `UPLOADING_R2` | Network disconnect, invalid R2 credentials, S3 API rate limit | Halting / Retryable |
| `R2VerificationError` | `VERIFYING_R2` | S3 HEAD object 404, size mismatch, missing content-type | Halting |
| `StreamVerificationError`| `VERIFYING_STREAM`| CDN edge does not respond with HTTP 206, missing Accept-Ranges | Halting |
| `ManifestError` | `UPDATING_MANIFEST`| JSON syntax corruption, duplicate key, missing required fields | Halting / Rollback |
| `GitSafetyError` | `VERIFYING_GIT` | Dirty working tree, unauthorized files staged, unexpected branch | Halting |
| `TestFailure` | `RUNNING_TESTS` | `node scripts/validate.js` failed, broken links or missing tags | Halting / Rollback |
| `GitCommitError` | `COMMITTING` | Git index locked, author identity missing | Halting |
| `GitPushError` | `PUSHING` | Remote conflict (non-fast-forward), network timeout | Halting |
| `GitHubActionsError` | `WAITING_FOR_GITHUB_ACTIONS` | Remote Pages build failed, workflow run timeout | Halting |
| `ProductionSmokeTestError` | `PRODUCTION_SMOKE_TEST`| CDN cache propagation delay, edge 404, player error | Halting |

---

## 1. VideoValidationError
- **Symptom:** `[VALIDATING] Unsupported file format '.xyz'` or `Corrupted video header`.
- **Diagnosis:** Run `ffprobe -v error -show_format -show_streams <path_to_video>`.
- **Remediation:**
  - Verify that the video has both a valid H.264/HEVC/ProRes video stream.
  - Ensure the extension matches one of `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`.
  - Fix filename format to follow `[TAG]_[PROJECT_NAME].[ext]`.

---

## 2. Phase 03 Encoding Errors

### 2.1 FFmpegNotFoundError
- **Symptom:** `FFmpeg binary not found at configured paths`.
- **Diagnosis:** Verify binary existence: `which ffmpeg` and `which ffprobe`.
- **Remediation:**
  - Install FFmpeg via package manager: `brew install ffmpeg` on macOS.
  - Or configure explicit paths in `config/pipeline.config.json` under `ffmpeg.ffmpegPath` and `ffmpeg.ffprobePath`.

### 2.2 EncodingProcessError
- **Symptom:** `FFmpeg encoding failed with exit code 1`.
- **Diagnosis:** Inspect logged FFmpeg stderr messages. Common causes include corrupt master frames, out-of-disk space in `encoded/.tmp/`, or permission denials.
- **Remediation:**
  - Check free disk space: `df -h`.
  - Validate the master video manually: `ffmpeg -v error -i <source> -f null -`.
  - Temporary files in `encoded/.tmp/` are cleaned up automatically upon exit.

### 2.3 EncodingValidationError
- **Symptom:** `Output file validation failed: codec is hevc, expected h264` or `resolution mismatch`.
- **Diagnosis:** Run `ffprobe -v error -show_format -show_streams encoded/[NAME].mp4`.
- **Remediation:**
  - Verify that profile settings in `config/pipeline.config.json` specify `libx264` and `yuv420p`.
  - Ensure audio streams match expectation (if source has no audio, `-an` must be applied and validated as `AUDIO: NONE`).

### 2.4 OutputExistsError
- **Symptom:** `Target output file already exists and overwrite is disabled: encoded/[NAME].mp4`.
- **Diagnosis:** Check `encoded/` directory for previously generated output.
- **Remediation:**
  - To preserve previous renders, rename the existing file or change the input filename.
  - To intentionally overwrite, enable `allowOverwrite: true` in `config/pipeline.config.json`.

### 2.5 EncodingCancelledError
- **Symptom:** `Encoding was cancelled by user`.
- **Diagnosis:** SIGINT/SIGKILL signal sent or cancelled via UI abort button.
- **Remediation:** Staging file is cleaned up automatically. Re-run encoding when ready.

---

## 3. Phase 04 R2 Upload Errors

### 3.1 R2CredentialsError
- **Symptom:** `Cloudflare R2 authentication failed (HTTP 401/403): Unauthorized access or invalid credentials`.
- **Diagnosis:**
  - Verify that `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are exported in the environment.
  - Test credentials using AWS CLI:
    `aws s3 ls s3://pdp212-profile --endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- **Remediation:**
  - In Cloudflare Dashboard > R2 > Manage R2 API Tokens, create a token with `Object Read & Write` permissions.
  - Export them into your shell session before running the pipeline:
    `export R2_ACCOUNT_ID="..." R2_ACCESS_KEY_ID="..." R2_SECRET_ACCESS_KEY="..."`

### 3.2 R2RetryExhaustedError
- **Symptom:** `Exhausted all 3 upload retries for 'FILENAME.mp4': fetch failed / 503 Service Unavailable`.
- **Diagnosis:** Inspect network connectivity or upstream Cloudflare edge outage.
- **Remediation:**
  - Check internet connectivity: `ping 1.1.1.1`.
  - Re-run the pipeline once upstream connectivity is restored. Idempotency guarantees previously uploaded videos will not be re-uploaded.

### 3.3 R2VerificationError & R2ObjectMismatchError
- **Symptom:** `Content-Length mismatch for 'KEY.mp4': R2 has X bytes, local encoded file has Y bytes` or `Content-Type mismatch`.
- **Diagnosis:** Run HEAD directly:
  `curl -I https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${KEY}` (with SigV4).
- **Remediation:**
  - Re-run upload to re-push the corrupted object. The uploader will automatically detect the size mismatch and overwrite the incomplete remote file.

---

## 4. Phase 04 HTTP 206 Streaming Verification Errors

### 4.1 Http206RangeError (HTTP 200 Rejection)
- **Symptom:** `[VERIFYING_STREAM] Server responded with HTTP 200 OK instead of required HTTP 206 Partial Content`.
- **Diagnosis:**
  - Run curl range test:
    `curl -I -H "Range: bytes=0-1048575" https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/<filename>`
- **Remediation:**
  - If status is `200` instead of `206`, verify Cloudflare R2 bucket Public Access settings and custom domain caching rules.
  - Ensure Range requests are enabled and not stripped by intermediary proxy rules or custom Cloudflare Page Rules.

### 4.2 StreamVerificationError (HTTP 404 or Malformed Content-Range)
- **Symptom:** `HTTP Range request failed with status 404` or `Malformed Content-Range header format`.
- **Diagnosis:**
  - Confirm public URL format in `config/pipeline.config.json` (`r2.publicBaseUrl`).
  - Verify that the object key casing matches exactly (e.g. `WED_PHUNGTUONG.mp4`).
- **Remediation:**
  - Allow 15-30 seconds for Cloudflare edge propagation if object was freshly created.
  - Verify public access domain is properly enabled on the bucket in Cloudflare R2 dashboard.

---

## 5. Phase 05 Manifest Management Errors & Rollback Playbook

### 5.1 Verification Gate Violation
- **Symptom:** `[UPDATING_MANIFEST] Item 'FILENAME.mp4' failed R2 object or HTTP 206 stream verification (r2Verified: false, streamVerified: false). Update blocked.`
- **Diagnosis:** An item was submitted to the manifest step without passing upstream R2 object or HTTP 206 stream verification.
- **Remediation:**
  - Verify that Phase 04 upload and stream verification steps completed successfully.
  - Re-run upstream verification steps before updating the manifest. The pipeline will never add unverified videos to production.

### 5.2 Manifest Schema & URL Validation Errors
- **Symptom:** `Entry '#i' URL must use HTTPS` or `URL does not match configured R2 publicBaseUrl` or `URL references local filesystem path`.
- **Diagnosis:** Run schema validation directly or inspect `data/work-manifest.json`.
- **Remediation:**
  - Ensure all manifest entries use HTTPS and point directly to the configured Cloudflare R2 public delivery domain (`config.r2.publicBaseUrl`).
  - Local paths (`file://`, `/Users/`, `/Volumes/`, `assets/videos/projects/`) and `localhost` are strictly prohibited.

### 5.3 Duplicate Key or URL Detected
- **Symptom:** `Duplicate key detected in manifest: 'KEY.mp4'` or `Duplicate URL detected in manifest`.
- **Diagnosis:** Inspect incoming batch items or existing manifest.
- **Remediation:**
  - The pipeline automatically merges and updates existing keys if re-uploaded.
  - If distinct projects share identical filenames, rename the source master to ensure distinct keys before running the pipeline.

### 5.4 Atomic Write Failure & Transactional Rollback
- **Symptom:** `[UPDATING_MANIFEST] Atomic write failed: ...` or post-write validation error.
- **Diagnosis:** Check `video-pipeline/temp/work-manifest.json.bak` and disk permissions on `data/work-manifest.json`.
- **Remediation:**
  - The `ManifestWriter` automatically catches write failures, restores the previous state from `.bak`, and deletes temporary `.tmp` files.
  - Verify disk write permissions for `data/` and `video-pipeline/temp/`.
  - Check that the target filesystem is not mounted read-only.

---

## 6. GitSafetyError & Dirty Working Tree
- **Symptom:** `[VERIFYING_GIT] Safety violation: Staged files contain unauthorized modifications`.
- **Diagnosis:** Run `git status` in the repository root.
- **Remediation:**
  - Commit or stash any unrelated portfolio code edits before launching the automated pipeline.
  - Ensure you are on the `main` branch: `git checkout main`.
  - Verify `git pull origin main` is clean.

---

## 7. GitHubActionsError (Deployment Timeout or Failure)
- **Symptom:** `[WAITING_FOR_GITHUB_ACTIONS] Workflow run completed with conclusion 'failure'`.
- **Diagnosis:** Inspect the failed run on GitHub (`https://github.com/pdp212/pdp212.github.io/actions`).
- **Remediation:**
  - Review the GitHub Actions build log.
  - Ensure `node scripts/validate.js` passes locally before pushing.
  - If Pages service experienced a GitHub-side outage, re-run the workflow via `workflow_dispatch`.

---

## 8. ProductionSmokeTestError
- **Symptom:** `[PRODUCTION_SMOKE_TEST] Live website manifest does not contain new key`.
- **Diagnosis:**
  - Check browser or curl: `curl -s https://pdp212.github.io/data/work-manifest.json | grep <new_key>`.
- **Remediation:**
  - Allow 30–60 seconds for GitHub Pages edge cache to invalidate.
  - Clear local browser cache or inspect using an incognito window.
