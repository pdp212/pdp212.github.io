# Security Model & Threat Mitigation

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Credentials & Secrets Management

The Video Pipeline requires credentials to interact with Cloudflare R2 and GitHub:

| Variable | Scope | Required Environment |
| :--- | :--- | :--- |
| `R2_ACCOUNT_ID` | Cloudflare Account Identifier | `process.env` |
| `R2_ACCESS_KEY_ID` | R2 S3-Compatible Access Key ID | `process.env` |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key (S3 SigV4 Signing) | `process.env` |
| `GITHUB_TOKEN` | GitHub Personal Access Token (Workflow Polling) | `process.env` |

### Security Invariants
* **Zero Disk Persistence of Secrets**: Secrets are NEVER saved to `pipeline.config.json`, `data/work-manifest.json`, `data/queue.json`, `data/jobs/*.json`, or build output.
* **Environment-Only**: Credentials must be supplied via local `.env` or CI runtime environment variables.
* **Strict `.gitignore` Enforcement**: The repository root `.gitignore` enforces exclusion of `.env`, `.env.*`, and temporary credential files.

---

## 2. Automated Secret Sanitization

All output paths (logging sinks, SSE streams, API responses, error traces, and job audit records) pass through [`SecretSanitizer`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/core/security/secret-sanitizer.ts).

### Sanitization Patterns
* Matches and redacts exact values of active environment credentials.
* Matches standard GitHub PAT formats: `ghp_[a-zA-Z0-9]{20,}` $\rightarrow$ `[REDACTED_GITHUB_TOKEN]`.
* Matches AWS/R2 Key ID patterns: `[A-Z0-9]{20}` $\rightarrow$ `[REDACTED_ACCESS_KEY]`.
* Matches R2 Secret Hex strings: `[a-f0-9]{64}` $\rightarrow$ `[REDACTED_SECRET]`.

---

## 3. Filesystem Staging & Path Traversal Guards

1. **Upload Staging Isolation**:
   - Browser uploads are staged strictly within `video-pipeline/temp/uploads/`.
   - File names are sanitized to prevent directory traversal (e.g. `../../etc/passwd` $\rightarrow$ `passwd`).
2. **Delivery-Only Source Preservation**:
   - Input videos are read directly as the source artifact.
   - Zero intermediate `.tmp/` or transcode directories are created during delivery.
3. **Master Video Protection**:
   - Original master source files are opened in read-only mode by FFprobe and stream uploaders. The pipeline never deletes, overwrites, or mutates master source files.

---

## 4. Git & Release Safety Guards

* **Clean Working Tree**: Before initiating any Git operations, `GitSafetyEngine` asserts that no uncommitted or untracked changes exist outside of the authorized manifest update.
* **Disallowed Force Push**: The pipeline strictly uses standard `git push origin main`. Commands with `--force` or `--force-with-lease` are structurally forbidden.
* **Binary Exclusion**: Automated cleanup (`CleanGitStep`) ensures large video binaries are never committed to the portfolio Git repository.

---

## 5. Desktop & Renderer Isolation

* **Electron Context Isolation**: Electron `BrowserWindow` runs with `contextIsolation: true` and `nodeIntegration: false`.
* **CORS & HTTP Security**: The internal HTTP server binds strictly to `127.0.0.1` (localhost), preventing exposure to external networks.
