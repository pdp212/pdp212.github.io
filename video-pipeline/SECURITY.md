# Security Architecture & Secret Boundaries

This document defines the security boundaries, credential policies, and safety mechanisms enforced by the **Video Pipeline**.

---

## 1. Credential Invariants & Boundaries

The Video Pipeline interacts with external infrastructure:
- **Cloudflare R2 Storage** (S3-compatible API)
- **GitHub Repository & Actions** (REST API)

### Required Secrets
| Variable Name | Purpose | Scope | Required In |
|---|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Account Identifier | S3 endpoint URL resolution | Production runs |
| `R2_ACCESS_KEY_ID` | R2 API Token ID | S3 authentication | Production runs |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret | S3 signature generation | Production runs |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Polling GitHub Actions runs | Production runs |

---

## 2. Strict Non-Exposure Rules

1. **Environment Only:** Secrets must be provided **exclusively** via OS environment variables (`process.env`).
2. **Zero Storage in Configuration:** `config/pipeline.config.json` and all configuration files must have **zero** secret fields. A JSON schema validates that no secret properties exist.
3. **No Hardcoded Fallbacks:** Default string fallbacks like `"dummy_key"` or empty token strings are strictly prohibited in the codebase.
4. **Git Isolation:** `.env` and `.env.*` files are ignored in `.gitignore`. Only `.env.example` (containing empty dummy placeholders) may be tracked.
5. **No Logs or UI Leaks:** Secrets are never rendered in terminal outputs, error messages, or UI elements.

---

## 3. Automated Secret Redaction Layer

The pipeline includes a dedicated `SecretSanitizer` in `core/security/secret-sanitizer.ts`:
- **Pattern Redaction:** Automatically scans and redacts GitHub Personal Access Tokens (`ghp_[a-zA-Z0-9]{36}` and `github_pat_*`).
- **Dynamic In-Memory Redaction:** At startup, any non-empty values stored in `R2_SECRET_ACCESS_KEY`, `R2_ACCESS_KEY_ID`, and `R2_ACCOUNT_ID` are registered into an internal redactor.
- **Log Hooking:** Every message passed to `PipelineLogger` is sanitized prior to writing to stdout, stderr, or log sinks.

Example log output:
```
[10:55:00] [UPLOADING_R2] [START] ℹ Connecting using key [REDACTED_R2_ACCESS_KEY_ID]...
```

---

## 4. Git Safety & Branch Protection Policies

To prevent data loss or repository corruption:
1. **Force Push Prohibited:** The Git Engine strictly disallows `--force` or `--force-with-lease`.
2. **Branch Gate:** Pushes are only permitted to the designated release branch (`main`).
3. **Staged Isolation:** Prior to commit, the pipeline verifies that only `data/work-manifest.json` is staged. If any unintended files (such as local `.mp4` binaries or code changes) are detected in the staging area, the pipeline immediately aborts.

---

## 5. Credential Rotation Playbook

If a secret is ever suspected of compromise:
1. Immediately revoke the token in the Cloudflare Dashboard (`Manage R2 API Tokens` → `Revoke`).
2. In GitHub (`Settings` → `Developer Settings` → `Personal Access Tokens`), revoke the active PAT.
3. Generate new credentials with minimal required scopes (`Object Read & Write` for R2; `repo`, `workflow` for GitHub).
4. Update your local shell environment or CI secrets.
