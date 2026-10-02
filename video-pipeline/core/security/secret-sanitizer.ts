/**
 * Secret Boundary and Sanitization Utilities
 * Enforces strict environment-only access for credentials and redacts sensitive data from logs.
 */

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
   * Validates that essential environment credentials exist without exposing their values.
   */
  public static validateEnvironment(): { valid: boolean; missing: string[] } {
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
    sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_GITHUB_PAT]');
    sanitized = sanitized.replace(/github_pat_[a-zA-Z0-9_]{50,}/g, '[REDACTED_GITHUB_PAT]');

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
}
