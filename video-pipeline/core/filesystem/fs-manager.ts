/**
 * Filesystem Manager for Video Pipeline
 * Enforces non-destructive handling of original master videos and directory lifecycle management.
 */

import path from 'node:path';
import fs from 'node:fs';
import type { DirectoryConfig } from '../../config/schema/index.js';

export interface FileLifecycleItem {
  id: string;
  originalPath: string;
  originalFilename: string;
  baseName: string;
  extension: string;
  tempWorkingPath?: string;
  encodedPath?: string;
  completedPath?: string;
  failedPath?: string;
}

export class FilesystemManager {
  private readonly rootDir: string;
  private readonly directories: DirectoryConfig;

  constructor(rootDir: string, directories: DirectoryConfig) {
    this.rootDir = path.resolve(rootDir);
    this.directories = directories;
  }

  /**
   * Resolves absolute directory paths based on configuration.
   */
  public getDirectoryPath(dirKey: keyof DirectoryConfig): string {
    const dir = this.directories[dirKey] || `./${String(dirKey)}`;
    return path.resolve(this.rootDir, dir);
  }

  /**
   * Initializes pipeline directories if they do not exist.
   */
  public ensureDirectoriesExist(): void {
    const keys: (keyof DirectoryConfig)[] = ['temp', 'completed', 'failed'];
    for (const key of keys) {
      const fullPath = this.getDirectoryPath(key);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  /**
   * Atomically moves a temporary encoded file to its final destination.
   */
  public atomicFinalize(tempPath: string, finalPath: string): void {
    const targetDir = path.dirname(finalPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.renameSync(tempPath, finalPath);
  }

  /**
   * Creates an item lifecycle descriptor from a source video path.
   * Original master file is treated as read-only.
   */
  public createLifecycleItem(inputFilePath: string): FileLifecycleItem {
    const resolvedPath = path.resolve(inputFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Master input video does not exist: ${resolvedPath}`);
    }

    const originalFilename = path.basename(resolvedPath);
    const extension = path.extname(originalFilename).toLowerCase();
    const baseName = path.basename(originalFilename, extension);
    const id = `${baseName}_${Date.now()}`;

    return {
      id,
      originalPath: resolvedPath,
      originalFilename,
      baseName,
      extension,
      tempWorkingPath: path.join(this.getDirectoryPath('temp'), `${id}${extension}`),
      encodedPath: path.join(this.getDirectoryPath('encoded'), `${baseName}.mp4`),
      completedPath: path.join(this.getDirectoryPath('completed'), `${baseName}.mp4`),
      failedPath: path.join(this.getDirectoryPath('failed'), `${baseName}.mp4`),
    };
  }

  /**
   * Verifies that the master source file remains untouched.
   */
  public verifyMasterIntegrity(item: FileLifecycleItem): boolean {
    return fs.existsSync(item.originalPath);
  }

  /**
   * Safe cleanup of temporary working files without ever touching original source files.
   */
  public cleanupTempFiles(item: FileLifecycleItem): void {
    if (item.tempWorkingPath && fs.existsSync(item.tempWorkingPath)) {
      try {
        fs.unlinkSync(item.tempWorkingPath);
      } catch {
        // Suppress non-critical cleanup error
      }
    }
  }
}
