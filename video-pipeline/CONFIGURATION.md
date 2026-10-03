# Configuration Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Declarative Configuration (`config/pipeline.config.json`)

The pipeline configuration file defines non-secret operational parameters:

```json
{
  "$schema": "./schema/config.schema.json",
  "version": "1.0.0",
  "portfolioPath": "../",
  "productionUrl": "https://pdp212.github.io/",
  "git": {
    "repository": "pdp212/pdp212.github.io",
    "branch": "main",
    "requireCleanWorkingTree": true,
    "disallowForcePush": true
  },
  "r2": {
    "bucket": "pdp212-profile",
    "publicBaseUrl": "https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev"
  },
  "manifest": {
    "relativeFilePath": "data/work-manifest.json",
    "atomicBackup": true
  },
  "supportedInputFormats": [
    ".mp4",
    ".mov",
    ".mkv",
    ".avi",
    ".mxf",
    ".webm"
  ],
  "directories": {
    "temp": "./temp",
    "completed": "./completed",
    "failed": "./failed"
  },
  "testCommands": [
    "node scripts/validate.js"
  ],
  "timeout": {
    "validationMs": 30000,
    "uploadMs": 300000,
    "verificationMs": 60000,
    "githubActionsMs": 900000,
    "smokeTestMs": 60000
  },
  "retryPolicy": {
    "maxRetries": 3,
    "initialDelayMs": 2000,
    "backoffFactor": 2
  }
}
```

---

## 2. Configuration Field Reference

### Global Settings
* `portfolioPath`: Relative path to root portfolio repository (`"../"`).
* `productionUrl`: Live deployment URL for production smoke testing.

### Git Configuration (`git`)
* `repository`: GitHub `owner/repo` string.
* `branch`: Target release branch (`"main"`).
* `requireCleanWorkingTree`: When `true`, enforces that no uncommitted changes exist before release.
* `disallowForcePush`: Enforces strict standard push; disallows `--force`.

### Cloudflare R2 (`r2`)
* `bucket`: Target R2 bucket name (`"pdp212-profile"`).
* `publicBaseUrl`: Public CDN edge URL serving videos with HTTP 206 streaming support.

### Supported Input Formats (`supportedInputFormats`)
* Array of accepted container extensions prepared in DaVinci Resolve: `[".mp4", ".mov", ".mkv", ".avi", ".mxf", ".webm"]`. Original bytes and container are preserved during delivery.

### Timeouts (`timeout`)
* `validationMs`: 30 seconds (FFprobe inspection).
* `uploadMs`: 5 minutes per video.
* `verificationMs`: 1 minute.
* `githubActionsMs`: 15 minutes.
* `smokeTestMs`: 1 minute.

---

## 3. Environment Variables (`.env`)

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `0123456789abcdef0123456789abcdef` |
| `R2_ACCESS_KEY_ID` | S3-Compatible Access Key ID | `abcdef01234567890123456789abcdef` |
| `R2_SECRET_ACCESS_KEY`| S3-Compatible Secret Access Key | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_1234567890abcdefghijklmnopqrstuvwxyz` |
| `R2_BUCKET_NAME` | Optional override for R2 bucket | `pdp212-profile` |
