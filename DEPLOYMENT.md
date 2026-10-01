# Deployment Guide — PDP Portfolio

## 1. Platform & Production URL
- **Platform:** GitHub Pages (Static hosting via GitHub Actions)
- **Production URL:** [https://pdp212.github.io/](https://pdp212.github.io/)
- **Repository:** `pdp212/pdp212.github.io`
- **Branch:** `main`
- **Root Domain:** Apex user site (`pdp212.github.io`), served from root (`/`) without subpath prefix.

## 2. CI/CD Architecture (GitHub Actions)
The production site is deployed automatically through GitHub Actions on every push to `main`.

```
git push origin main
       │
       ▼
GitHub Actions (.github/workflows/deploy.yml)
       │
       ├─► 1. Checkout repository
       ├─► 2. Setup Node.js 20
       ├─► 3. Quality & Integrity Gate: node scripts/validate.js (stops deployment if errors found)
       ├─► 4. Configure GitHub Pages environment
       ├─► 5. Package static artifacts
       └─► 6. Deploy to GitHub Pages environment
              │
              ▼
       Production: https://pdp212.github.io/
```

## 3. Security & Secret Management
- **Static Hosting Isolation:** GitHub Pages serves client-side static files. No secret keys or private tokens are packaged into production assets.
- **`.env` Protection:** Protected by `.gitignore` (`.env`, `.env.*`, `.env.local`). Secrets are strictly confined to local developer environments (for media upload tools).
- **No Client Secrets:** Cloudflare R2 streams and media manifests are accessed via public CDN endpoints without requiring embedded client tokens.

## 4. Local Quality & Regression Suite
Before committing and pushing code changes, run the mandatory verification suite:

```bash
# Core integrity & rule validation
node scripts/validate.js

# Profile & contact data consistency
node scripts/test_profile_consistency.js

# Home hero & featured screening verification
node scripts/test_home_update.js

# Floating navigation bar behavior
node scripts/test_floating_header.js

# WORK cinema auto-scroll, fullscreen & audio
node scripts/test_work_cinema.js
```

## 5. Deployment Workflow
For all future updates, follow this streamlined workflow:

```bash
# 1. Verify all tests pass locally
npm run test

# 2. Stage updated files
git add .

# 3. Commit with semantic convention
git commit -m "feat: update portfolio features"

# 4. Push to main to trigger automatic GitHub Actions build & deployment
git push origin main
```

Monitor live deployment progress under the **Actions** tab on GitHub:
`https://github.com/pdp212/pdp212.github.io/actions`

## 6. Rollback Procedures
If an unexpected issue occurs in production:

### Method A: GitHub Actions Deployment Rollback (Zero Downtime)
1. Go to repository **Deployments** on GitHub: `https://github.com/pdp212/pdp212.github.io/deployments`
2. Select the previous stable deployment from history.
3. Click **Restore** to re-activate that exact immutable deployment artifact.

### Method B: Git Revert (Standard Source Rollback)
1. Identify the commit hash to revert (`git log --oneline -5`).
2. Create a revert commit:
   ```bash
   git revert HEAD --no-edit
   ```
3. Push to `main`:
   ```bash
   git push origin main
   ```
4. GitHub Actions will validate the reverted state and deploy the prior stable build. Do **NOT** force-push (`--force`) to maintain linear audit history.
