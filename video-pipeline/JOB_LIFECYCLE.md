# Job Lifecycle & Crash Recovery Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Job State Machine

Every pipeline execution is tracked as a `JobRecord` with strict state transitions:

```
                  ┌───────────────────┐
                  │      QUEUED       │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │      RUNNING      │
                  └────┬────┬────┬────┘
                       │    │    │
       ┌───────────────┘    │    └──────────────┐
       ▼                    ▼                   ▼
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│  COMPLETED  │      │   FAILED    │     │  CANCELLED  │
└─────────────┘      └─────────────┘     └─────────────┘
```

---

## 2. State Descriptions

| Status | Description | Terminal? |
| :--- | :--- | :--- |
| `QUEUED` | Job created and scheduled for execution | No |
| `RUNNING` | Pipeline actively processing stages (Validation $\rightarrow$ Smoke Test) | No |
| `COMPLETED` | All pipeline steps executed successfully; production verified | Yes |
| `FAILED` | Step encountered an unrecoverable error; transaction rolled back | Yes |
| `CANCELLED` | Aborted by user via `[ CANCEL PIPELINE ]` or `POST /api/pipeline/cancel` | Yes |

---

## 3. Persistent Storage & Serialization

* **Storage Location:** `video-pipeline/data/jobs/<job-id>.json`
* **Manager:** [`JobStore`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/core/state/job-store.ts)
* **Atomic Writes:** Files are written to a `.tmp` file and renamed atomically via `fs.renameSync`.
* **Zero Secrets:** Sanitized via `SecretSanitizer` prior to serialization.

---

## 4. Crash Detection & Recovery Mechanics

If the application is forcibly closed, crashes, or loses power while a job is in `RUNNING` status:

1. **On Server Startup:** `JobStore.recoverInterruptedJobs()` is called automatically in `PipelineUiServer.start()`.
2. **Scan:** Reads all JSON files in `data/jobs/`.
3. **Detection:** Finds any record where `status === 'RUNNING'`.
4. **Transition:** Automatically updates `status` to `'FAILED'` and sets `error` to `"Pipeline was interrupted by application shutdown or unexpected crash."` and `completedAt` to current timestamp.
5. **Safety Invariant:** An interrupted job is **never** falsely displayed as `COMPLETED`.
