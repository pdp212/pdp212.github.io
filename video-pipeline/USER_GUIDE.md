# Video Pipeline — User Guide

Welcome to the **Video Pipeline** desktop application. This guide explains how to use the tool to publish master videos to your portfolio without needing to run manual terminal commands.

---

## 1. Launching the Application

To start the desktop application:

```bash
cd video-pipeline
npm run desktop:dev
```

The application window will open automatically with a clean dark interface.

---

## 2. Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│ 🎬 VIDEO PIPELINE                                  ● READY   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │                 DROP VIDEO HERE                     │   │
│   │         or click to select from files               │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─ QUEUE (2 items) ───────────────────────────────────────┐ │
│ │ • WED_PHUNGTUONG.mp4    [READY]  1920x1080  24fps  [✕]   │ │
│ │ • BRAND_FILM.mov        [READY]  3840x2160  60fps  [✕]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                    [ RUN PIPELINE ]                         │
│                                                             │
│ ┌─ PROGRESS ──────────────────────────────────────────────┐ │
│ │  ██████████████████████░░░░░░░░░░░░  58%                │ │
│ │  Stage: UPLOADING_R2 (1/2 videos uploaded)              │ │
│ │  [ CANCEL PIPELINE ]                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ JOB HISTORY ───────────────────────────────────────────┐ │
│ │  ✓ 15:10  2 videos  COMPLETED  (45s)                    │ │
│ │  ○ 14:45  1 video   CANCELLED  (10s)                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Workflow

### Step 1: Adding Prepared Final Videos
1. **Prepare Video**: Export the final video directly from DaVinci Resolve using your project-specific production presets.
2. **Drag & Drop**: Drag one or multiple video files (`.mp4`, `.mov`, `.mkv`, `.avi`, `.mxf`, `.webm`) and drop them anywhere onto the drop zone.
3. **File Picker**: Click the drop zone to open the native file browser and pick videos.
4. The app immediately inspects each video with FFprobe. Valid videos are added to the **Queue** with dimensions, framerate, and audio track details. Invalid or corrupted files display clear error messages.

### Step 2: Managing the Queue
* **Remove Item**: Click the `[✕]` button next to any item in the queue to remove it.
* **Clear All**: Click `Clear Queue` to empty the list.
* **Persistence**: If you close the app, your queue is automatically saved and restored when you open the app again.

### Step 3: Running the Delivery Pipeline
* Click the **`[ RUN PIPELINE ]`** button.
* The application automatically:
  1. Validates files and inspects stream metadata with FFprobe
  2. Uploads raw video bytes directly to Cloudflare R2 (preserving original container and codecs)
  3. Verifies remote R2 headers and tests HTTP 206 byte-range streaming
  4. Updates `data/work-manifest.json`
  5. Runs integrity tests and verifies Git safety

### Step 4: Monitoring Progress & Cancelling
* Watch the live progress bar and stage tracker.
* **Cancelling**: If you need to stop the execution at any time, click **`[ CANCEL PIPELINE ]`**. The pipeline halts immediately, aborts active uploads, and safely stops before making any Git or manifest changes.

### Step 5: Viewing Job History
* Scroll to the **Job History** section to see past executions.
* Click on any job to open the **Job Details Modal** showing complete timing, item breakdown, and sanitized logs.

---

## 4. Troubleshooting & FAQ

* **What happens if I lose my internet connection during upload?**  
  The upload step automatically retries transient network errors up to 3 times with backoff. If it still fails, the pipeline transitions to `FAILED` without modifying your Git or production manifest.
* **Can I close the app while a pipeline is running?**  
  If the application is closed during a run, the job will be safely detected on the next startup and marked as `FAILED` to prevent corrupt states.
* **Does the pipeline re-encode or alter my video?**  
  No. The pipeline acts strictly as a delivery and deployment vehicle. All encoding is performed externally in DaVinci Resolve according to your project requirements. Original video bytes and containers are preserved bit-for-bit.
