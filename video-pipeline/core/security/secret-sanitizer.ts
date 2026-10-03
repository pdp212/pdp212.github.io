import fs from 'node:fs';
import path from 'node:path';

export interface PipelineCredentials {
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName?: string;
  r2PublicBaseUrl?: string;
  githubToken?: string;
}

export class SecretSanitizer {
  private static readonly KNOWN_SECRET_ENV_KEYS = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
  ];

  /**
   * Safely loads project-local .env files into process.env without overriding existing environment variables.
   */
  public static loadEnv(customSearchDirs?: string[]): void {
    const searchDirs = customSearchDirs || [
      process.cwd(),
      path.resolve(process.cwd(), 'video-pipeline'),
      path.resolve(process.cwd(), '..'),
    ];

    for (const dir of searchDirs) {
      const envPath = path.resolve(dir, '.env');
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
              ) {
                val = val.slice(1, -1);
              }
              // Only set if not already defined in environment
              if ((process.env[key] === undefined || process.env[key] === '') && val) {
                process.env[key] = val;
              }
            }
          }
        } catch {
          // Ignore read errors gracefully
        }
      }
    }
  }

  /**
   * Validates that essential environment credentials exist without exposing their values.
   */
  public static validateEnvironment(): { valid: boolean; missing: string[] } {
    this.loadEnv();
    const missing: string[] = [];

    for (const key of this.KNOWN_SECRET_ENV_KEYS) {
      // GITHUB_TOKEN is optional for local dry-run, required for remote deployment verification
      if (key === 'GITHUB_TOKEN') continue;
      if (!process.env[key] || process.env[key]?.trim() === '') {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Retrieves credentials securely from process.env.
   * Throws an error if required credentials are missing.
   */
  public static getCredentials(requireGitHubToken = false): PipelineCredentials {
    this.loadEnv();
    const r2AccountId = process.env.R2_ACCOUNT_ID?.trim();
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const r2BucketName = process.env.R2_BUCKET_NAME?.trim();
    const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
    const githubToken = process.env.GITHUB_TOKEN?.trim();

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
      throw new Error(
        'Missing required Cloudflare R2 credentials in environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).'
      );
    }

    if (requireGitHubToken && !githubToken) {
      throw new Error('Missing GITHUB_TOKEN in environment variables for remote GitHub Actions monitoring.');
    }

    return {
      r2AccountId,
      r2AccessKeyId,
      r2SecretAccessKey,
      r2BucketName,
      r2PublicBaseUrl,
      githubToken,
    };
  }

  /**
   * Sanitizes a string by replacing any occurrence of known secrets with a redacted label.
   */
  public static sanitizeString(input: string): string {
    if (!input) return input;
    let sanitized = input;

    for (const envKey of this.KNOWN_SECRET_ENV_KEYS) {
      const secretVal = process.env[envKey];
      if (secretVal && secretVal.length > 3) {
        sanitized = sanitized.split(secretVal).join(`[REDACTED_${envKey}]`);
      }
    }

    // Additional safeguard for GitHub PAT formats (ghp_*, github_pat_*)
    sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{20,}/g, '[REDACTED_GITHUB_PAT]');
    sanitized = sanitized.replace(/github_pat_[a-zA-Z0-9_]{30,}/g, '[REDACTED_GITHUB_PAT]');

    return sanitized;
  }

  /**
   * Sanitizes generic objects before serialization or logging.
   */
  public static sanitizeObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;

    try {
      const jsonStr = JSON.stringify(obj);
      const cleaned = this.sanitizeString(jsonStr);
      return JSON.parse(cleaned) as T;
    } catch {
      return obj;
    }
  }

  /**
   * Scans a git diff text for actual secrets (API keys, tokens, runtime environment secrets).
   * Distinguishes regex detection patterns, comments, and synthetic test fixtures from real credential leaks.
   * Returns an array of detected violations or an empty array if clean.
   */
  public static scanDiffForSecrets(diffText: string): string[] {
    if (!diffText) return [];
    const violations: string[] = [];
    const diffBlocks = diffText.split(/^diff --git /m);

    for (const block of diffBlocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const header = lines[0] || '';
      // Extract target file path (b/path/to/file)
      const targetPath = header.split(' ')[1]?.replace(/^b\//, '') || header;
      const isTestOrDoc =
        targetPath.includes('/tests/') ||
        targetPath.includes('.test.') ||
        targetPath.includes('.spec.') ||
        targetPath.endsWith('.md');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('+') || line.startsWith('+++')) continue;
        const lineContent = line.substring(1);
        const trimmed = lineContent.trim();

        // 1. Comments and documentation lines are safe
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('#')) {
          continue;
        }

        // 2. Critical Check: Check for active runtime secret values in added lines (always enforced for all files)
        for (const envKey of this.KNOWN_SECRET_ENV_KEYS) {
          const secretVal = process.env[envKey]?.trim();
          if (secretVal && secretVal.length >= 8) {
            // Ignore common test/placeholder environment values
            if (
              !secretVal.includes('placeholder') &&
              !secretVal.includes('super_secret') &&
              !secretVal.includes('test_') &&
              lineContent.includes(secretVal)
            ) {
              violations.push(
                `[${targetPath}] Runtime secret value for ${envKey} detected in staged diff addition.`
              );
              break;
            }
          }
        }

        // 3. Private Key Block Detection
        if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(lineContent)) {
          violations.push(`[${targetPath}] Private Key Block detected in staged diff.`);
          continue;
        }

        // 4. Hardcoded R2/AWS Secret Assignment (e.g. R2_SECRET_ACCESS_KEY = "actual_secret")
        const r2AssignMatch = lineContent.match(
          /\b(?:r2SecretAccessKey|R2_SECRET_ACCESS_KEY)\s*[:=]\s*["']([a-zA-Z0-9/+=_\-]{16,})["']/i
        );
        if (r2AssignMatch) {
          const val = r2AssignMatch[1];
          const isRegexOrPattern =
            lineContent.includes('pattern:') ||
            lineContent.includes('SECRET_PATTERNS') ||
            lineContent.includes('[a-zA-Z') ||
            lineContent.includes('process.env.');
          const isSynthetic =
            isTestOrDoc &&
            (val.includes('test_') || val.includes('mock_') || val.includes('synthetic_') || val.includes('placeholder'));

          if (!isRegexOrPattern && !isSynthetic) {
            violations.push(`[${targetPath}] Hardcoded R2 Secret Assignment pattern detected in staged diff.`);
          }
        }

        // 5. GitHub Personal Access Token Detection
        // Match actual token values: ghp_ (>=20 alphanumeric) or github_pat_ (>=30 base62/underscore)
        const ghpMatches = lineContent.matchAll(
          /\b(ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,})\b/g
        );
        for (const m of ghpMatches) {
          const candidate = m[1];
          // If the line defines a regex rule or contains regex quantifiers/classes, it's a detection rule
          const isRegexDef =
            lineContent.includes('[a-zA-Z0-9') ||
            lineContent.includes('{20,') ||
            lineContent.includes('{30,') ||
            lineContent.includes('pattern:') ||
            lineContent.includes('SECRET_PATTERNS') ||
            lineContent.includes('.replace(/') ||
            lineContent.includes('new RegExp');

          // If in test/doc and marked as synthetic or placeholder
          const isSynthetic =
            isTestOrDoc &&
            (candidate.includes('test_') ||
              candidate.includes('mock_') ||
              candidate.includes('synthetic_') ||
              candidate.includes('EXAMPLE') ||
              candidate.includes('placeholder') ||
              /ghp_[A-Z0-9]{20,}/.test(candidate) ||
              /ghp_[0-9]{20,}/.test(candidate));

          if (!isRegexDef && !isSynthetic) {
            violations.push(`[${targetPath}] GitHub Personal Access Token pattern detected in staged diff.`);
            break;
          }
        }

        // 6. AWS Access Key ID Detection (AKIA / ASIA + 16 uppercase alphanumeric chars)
        const awsMatches = lineContent.matchAll(/\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g);
        for (const m of awsMatches) {
          const candidate = m[1];
          const isRegexDef =
            lineContent.includes('[0-9A-Z]') ||
            lineContent.includes('{16}') ||
            lineContent.includes('pattern:') ||
            lineContent.includes('SECRET_PATTERNS') ||
            lineContent.includes('.replace(/') ||
            lineContent.includes('new RegExp');

          const isSynthetic =
            isTestOrDoc &&
            (candidate.includes('EXAMPLE') ||
              candidate.includes('MOCK') ||
              candidate.includes('TEST') ||
              candidate.includes('SYNTHETIC'));

          if (!isRegexDef && !isSynthetic) {
            violations.push(`[${targetPath}] AWS Access Key ID pattern detected in staged diff.`);
            break;
          }
        }
      }
    }

    return violations;
  }
}

