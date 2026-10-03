/**
 * Git Safety Engine
 * Enforces branch restrictions, secret tracking prevention, gitignore rules, and binary isolation.
 */

import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export class GitSafetyEngine {
  /**
   * Asserts push safety: disallows force push and ensures expected branch.
   */
  public static assertSafePush(branch: string, allowedBranch: string, isForce: boolean): void {
    if (isForce) {
      throw new GitSafetyError('CRITICAL: Force push is strictly prohibited by pipeline safety policy.');
    }
    if (branch !== allowedBranch) {
      throw new GitSafetyError(
        `Safety violation: Automated push only allowed on branch '${allowedBranch}', current is '${branch}'.`
      );
    }
  }

  /**
   * Asserts that no sensitive files or environment files are tracked by Git.
   */
  public static assertNoTrackedSecrets(trackedFiles: string[]): void {
    const leakedSecrets = trackedFiles.filter((file) => {
      const normalized = file.toLowerCase();
      // Explicitly allow .env.example — it is a non-secret template file
      if (normalized.endsWith('.env.example')) return false;
      return (
        normalized === '.env' ||
        normalized.startsWith('.env.') ||
        normalized.endsWith('/.env') ||
        normalized.includes('/.env.')
      );
    });

    if (leakedSecrets.length > 0) {
      throw new GitSafetyError(
        `Security violation: Git is tracking environment/credential files: ${leakedSecrets.join(', ')}`
      );
    }
  }

  /**
   * Asserts that no production video binaries remain tracked by Git.
   */
  public static assertNoTrackedProjectVideos(trackedFiles: string[]): void {
    const trackedVideos = trackedFiles.filter((file) =>
      file.startsWith('assets/videos/projects/') ||
      file.startsWith('assets/transitions/')
    );

    if (trackedVideos.length > 0) {
      throw new GitSafetyError(
        `Architecture violation: Git is tracking production video binaries: ${trackedVideos.join(', ')}.`
      );
    }
  }

  /**
   * Asserts that required .gitignore rules are present and active.
   */
  public static assertGitignoreRules(gitignoreContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Must protect assets/videos/projects/*.mp4
    const hasProjectVideoRule =
      gitignoreContent.includes('assets/videos/projects/*.mp4') ||
      gitignoreContent.includes('assets/videos/projects/*') ||
      gitignoreContent.includes('assets/videos/projects');

    if (!hasProjectVideoRule) {
      errors.push("Missing required rule in .gitignore: 'assets/videos/projects/*.mp4'");
    }

    // 2. Must protect .env and .env.*
    const hasEnvRule = gitignoreContent.includes('.env');
    if (!hasEnvRule) {
      errors.push("Missing required rule in .gitignore: '.env'");
    }

    // 3. Must protect assets/transitions/*.mp4
    const hasTransitionRule =
      gitignoreContent.includes('assets/transitions/*.mp4') ||
      gitignoreContent.includes('assets/transitions/*') ||
      gitignoreContent.includes('assets/transitions');

    if (!hasTransitionRule) {
      errors.push("Missing required rule in .gitignore: 'assets/transitions/*.mp4'");
    }

    if (errors.length > 0) {
      throw new GitSafetyError(`Git safety check failed:\n- ${errors.join('\n- ')}`);
    }

    return { valid: true, errors: [] };
  }
}
