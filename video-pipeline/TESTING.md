# Testing Guide & Test Architecture

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline  
**Test Runner:** Node.js Native Test Runner (`node --test`)

---

## 1. Test Architecture & Runner Setup

The project uses the high-performance native Node.js test runner (`node:test` + `node:assert`). Tests are written in TypeScript and executed against compiled JavaScript files in `dist/tests/`.

```bash
# Run the complete test suite
npm test

# Type check tests and source code
npm run typecheck
```

The `npm test` script runs:
```bash
node --test dist/tests/unit/*.test.js dist/tests/security/*.test.js dist/tests/integration/*.test.js
```

---

## 2. Verified Test Baseline (Phase 11)

As of Phase 11 completion:

* **Total Tests:** 185
* **Total Suites:** 64
* **Passed:** 185
* **Failed:** 0
* **Skipped:** 0
* **Execution Time:** ~1.4 seconds

---

## 3. Test Suite Breakdown

### Unit Tests (`tests/unit/`)
* **Phase 01–02 (Architecture & Ingestion):** State machine transitions, video inspector validation, video queue operations, duplicate detection, multi-format media inspection.
* **Phase 04 (Cloudflare R2 & Streaming):** AWS SigV4 signer, multi-format video Content-Type detection, R2 uploader retry and idempotency, R2 object HEAD verifier, HTTP 206 partial content stream verifier.
* **Phase 05 (Manifest Management):** Multi-format manifest reader, JSON schema validator, diff generator, transactional atomic writer, rollback recovery.
* **Phase 06 (Git Safety & Cleanup):** Working tree cleanliness, `.gitignore` rule verifier, binary untracking, pre-commit test runner.
* **Phase 07 (Git, GitHub Actions & Smoke Testing):** Atomic commits, branch push verification, GitHub Actions workflow polling, live website smoke tester.
* **Phase 08 (UI & SSE Streaming):** UI server lifecycle, SSE event dispatching, REST API routes (`/api/queue`, `/api/pipeline/status`, `/api/pipeline/run`).
* **Phase 09 (Browser Ingestion):** Multipart streaming, upload service staging, corrupt video rejection, upload cleanup on queue clear.
* **Phase 10 (Desktop & Final App):**
  * `phase10-cancellation.test.ts`: Mid-step and pre-step abort signal propagation, `POST /api/pipeline/cancel`.
  * `phase10-desktop.test.ts`: Electron entrypoint exports, `package.json` desktop script definitions.
  * `phase10-job-history.test.ts`: `JobStore` persistence, secret sanitization, crash recovery on startup, `GET /api/jobs`, `GET /api/jobs/:id`.
  * `phase10-queue-persistence.test.ts`: `QueueStore` persistence, disk validation on boot, automatic save on add/remove.

### Security Boundary Tests (`tests/security/`)
* Credential leak tests across logs, SSE payloads, job history records, and manifest outputs.
* Path traversal attack tests in upload handling.
* Secret scrubbing regex verification against GitHub PATs, AWS Key IDs, and R2 Secret Keys.

### Integration Tests (`tests/integration/`)
* Multi-step pipeline execution in safe dry-run mode.
* Multi-format ingestion-to-staging integration.
* Atomic rollback integration on simulated failures.

---

## 4. Writing New Tests

When contributing new tests, follow these standards:
1. Use native `describe` and `it` from `node:test` and strict assertions from `node:assert/strict`.
2. Clean up temporary test files in `afterEach` or `after` hooks.
3. Keep tests isolated; never rely on external production network resources unless mocked.
