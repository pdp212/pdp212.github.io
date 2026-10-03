# REST & SSE API Reference

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline  
**Default Server Address:** `http://127.0.0.1:3210`

---

## 1. Endpoints Overview

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the single-page Cinematic Brutalism Web UI |
| `POST` | `/api/upload` | Multipart file upload streaming for master videos |
| `GET` | `/api/queue` | Returns current video queue status and items |
| `POST` | `/api/queue/add` | Adds file paths to queue |
| `POST` | `/api/queue/remove` | Removes specific video by ID from queue |
| `POST` | `/api/queue/clear` | Clears all items from the video queue |
| `GET` | `/api/pipeline/status` | Returns current in-flight pipeline run state |
| `POST` | `/api/pipeline/run` | Triggers asynchronous pipeline execution |
| `POST` | `/api/pipeline/cancel` | Cancels active pipeline run |
| `GET` | `/api/pipeline/events` | Server-Sent Events (SSE) live progress stream |
| `GET` | `/api/jobs` | Returns all persistent historical job records |
| `GET` | `/api/jobs/:id` | Returns single historical job record by ID |
| `GET` | `/api/context` | Legacy endpoint returning prepared context |

---

## 2. Granular Endpoint Documentation

### 1. `POST /api/upload`
Streams master video files directly to `temp/uploads/` and adds them to the queue after FFprobe validation.
* **Request:** `multipart/form-data` with one or multiple files in `file` fields.
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "items": [
      {
        "id": "input_1727850000000_abc12",
        "fileName": "WED_PHUNGTUONG.mp4",
        "status": "READY",
        "metadata": {
          "durationSeconds": 12.4,
          "width": 1920,
          "height": 1080,
          "fps": 24,
          "videoCodec": "h264",
          "audioCodec": "aac",
          "audioChannels": 2,
          "hasAudio": true,
          "fileSizeBytes": 45000000
        }
      }
    ],
    "errors": []
  }
  ```

---

### 2. `GET /api/queue`
Returns the active queue state and summary counts.
* **Response (200 OK):**
  ```json
  {
    "total": 2,
    "pending": 0,
    "validating": 0,
    "ready": 2,
    "failed": 0,
    "invalid": 0,
    "items": [ ... ]
  }
  ```

---

### 3. `POST /api/queue/remove`
Removes a specific video item from the queue and cleans up staged upload files.
* **Request JSON:** `{ "id": "input_1727850000000_abc12" }`
* **Response (200 OK):** `{ "success": true }`

---

### 4. `POST /api/queue/clear`
Empties the video queue and purges temporary staged uploads.
* **Response (200 OK):** `{ "success": true }`

---

### 5. `POST /api/pipeline/run`
Launches the real pipeline in the background.
* **Request JSON:** `{ "isDryRun": false }`
* **Response (202 Accepted):**
  ```json
  {
    "started": true,
    "isDryRun": false,
    "itemCount": 2,
    "jobId": "job_1727850000000_xyz89"
  }
  ```
* **Error (409 Conflict):** If a pipeline is already running.

---

### 6. `POST /api/pipeline/cancel`
Signals the active `AbortController`, aborts active network uploads, and halts execution before Git or manifest mutations.
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Pipeline cancellation requested."
  }
  ```
* **Error (400 Bad Request):** If no pipeline is currently running.

---

### 7. `GET /api/pipeline/status`
Returns the public runtime state.
* **Response (200 OK):**
  ```json
  {
    "isRunning": true,
    "pipelineId": "pipe_1727850000000_12345",
    "jobId": "job_1727850000000_xyz89",
    "currentStage": "UPLOADING_R2",
    "startedAt": "2026-10-02T15:00:00.000Z",
    "error": null,
    "result": "pending",
    "itemCount": 2,
    "logCount": 14
  }
  ```

---

### 8. `GET /api/jobs`
Returns all historical job records from `data/jobs/`, sorted newest first.
* **Response (200 OK):**
  ```json
  {
    "jobs": [
      {
        "jobId": "job_1727850000000_xyz89",
        "pipelineId": "pipe_1727850000000_12345",
        "createdAt": "2026-10-02T15:00:00.000Z",
        "startedAt": "2026-10-02T15:00:00.000Z",
        "completedAt": "2026-10-02T15:01:24.000Z",
        "status": "COMPLETED",
        "currentStage": "PRODUCTION_SMOKE_TEST",
        "inputCount": 2,
        "completedCount": 2,
        "failedCount": 0,
        "isDryRun": false,
        "error": null,
        "durationMs": 84000
      }
    ]
  }
  ```

---

### 9. `GET /api/jobs/:id`
Returns a single detailed job record.
* **Response (200 OK):** `{ "job": { ... } }`
* **Response (404 Not Found):** `{ "error": "Job not found: <job_id>" }`

---

## 3. Server-Sent Events (`GET /api/pipeline/events`)

The SSE endpoint streams live events using the standard `text/event-stream` format.

### Event Types
1. **`event: connected`**: Emitted on client connection with current status and queue.
2. **`event: log`**: Real-time structured log entries with secret redaction.
3. **`event: stage`**: Stage transition updates (`{ "stage": "UPLOADING_R2", "status": "SUCCESS" }`).
4. **`event: queue`**: Updated queue summary on any queue change.
5. **`event: pipeline`**: Overall pipeline status changes (`started`, `completed`, `failed`, `cancelled`).
6. **`event: job`**: Emits the full `JobRecord` on creation and state updates.
