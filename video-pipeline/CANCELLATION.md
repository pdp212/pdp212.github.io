# Real Pipeline Cancellation Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Overview & Architecture

Video Pipeline implements **real-time execution cancellation** across all local and remote operations. Cancellation does not merely update the UI state — it actively aborts active network uploads and halts downstream pipeline stages.

```
 [ CANCEL PIPELINE ] UI Button
               │
               ▼
 POST /api/pipeline/cancel (app/ui/server.ts)
               │
               ▼
 AbortController.abort() (PipelineContext.abortController)
               │
       ┌───────┴────────────────────────────────────────┐
       ▼                                                ▼
 Pre-Step & Mid-Step Check                     Active R2 Uploads
 (VideoPipelineOrchestrator)                  (HTTP abort signal)
       │                                                │
       ▼                                                ▼
 Halts before downstream stages                Aborts network connection
 (No Git commit, No push, No manifest)         Preserves original master video
```

---

## 2. Cancellation Invariants & Safety Rules

1. **Master Video Preservation:** Cancellation NEVER deletes, moves, or alters master source videos.
2. **Atomic Manifest Protection:** Manifest update (`UPDATING_MANIFEST`) is never reached if cancellation occurs during upstream steps. If already updating, the transactional backup `.bak` is preserved.
3. **Zero Partial Git Commits:** Git stages (`COMMITTING`, `PUSHING`) are structurally skipped upon cancellation.
4. **Immediate Network Abort:** Any active R2 HTTP upload connection is aborted via standard `AbortSignal`.
5. **Accurate State Reporting:** The pipeline state cleanly transitions to `CANCELLED` and logs `[CANCELLED] Pipeline execution cancelled by user request`.

---

## 3. Reversible vs. Irreversible Boundaries

| Operation Stage | Boundary Type | Cancellation Behavior |
| :--- | :--- | :--- |
| `VALIDATING` | Local / Reversible | Halts immediately; in-memory context freed |
| `UPLOADING_R2` | Remote / Idempotent | Aborts active upload; previously uploaded objects remain on R2 with no manifest entry |
| `VERIFYING_R2` | Remote / Read-Only | Halts immediately; zero side-effects |
| `VERIFYING_STREAM`| Remote / Read-Only | Halts immediately; zero side-effects |
| `UPDATING_MANIFEST`| Local / Reversible | Rolls back from `temp/work-manifest.json.bak` |
| `RUNNING_TESTS` | Local / Read-Only | Halts immediately |
| `COMMITTING` | Local / Git | Skipped entirely |
| `PUSHING` | Remote / Irreversible| If pushed before cancel, reports actual Git commit SHA rather than claiming rollback |
| `PRODUCTION_SMOKE`| Remote / Read-Only | Halts live verification |
