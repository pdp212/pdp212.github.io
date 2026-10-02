/**
 * Application Lifecycle Coordinator
 * Manages bootstrap, configuration loading, queue coordination, signal handling, and clean shutdown.
 */

import type { PipelineConfig } from '../../config/schema/index.js';
import { FilesystemManager } from '../../core/filesystem/fs-manager.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { VideoPipelineOrchestrator, type PipelineExecutionResult } from '../../pipeline/pipeline.js';
import type { PipelineContext, PipelineItem } from '../../pipeline/context.js';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';
import { VideoQueue } from './video-queue.js';
import { InputController } from './input-controller.js';

export * from './video-input.js';
export * from './video-queue.js';
export * from './input-controller.js';

export interface AppInitOptions {
  config: PipelineConfig;
  isDryRun?: boolean;
}

export class PipelineApplication {
  private readonly config: PipelineConfig;
  private readonly isDryRun: boolean;
  private readonly fsManager: FilesystemManager;
  private readonly logger: PipelineLogger;
  private readonly queue: VideoQueue;
  private readonly inputController: InputController;
  private isShuttingDown = false;

  constructor(options: AppInitOptions) {
    this.config = options.config;
    this.isDryRun = options.isDryRun ?? false;
    this.fsManager = new FilesystemManager(process.cwd(), this.config.directories);
    this.logger = new PipelineLogger();
    this.queue = new VideoQueue(this.config.supportedInputFormats);
    this.inputController = new InputController(this.config, this.queue, this.logger);

    this.registerSignalHandlers();
  }

  private registerSignalHandlers(): void {
    const handleExit = (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      this.logger.warn('CANCELLED', 'SHUTDOWN_SIGNAL', `Received ${signal}. Shutting down safely...`);
    };

    process.once('SIGINT', () => handleExit('SIGINT'));
    process.once('SIGTERM', () => handleExit('SIGTERM'));
  }

  public getInputController(): InputController {
    return this.inputController;
  }

  public getQueue(): VideoQueue {
    return this.queue;
  }

  public getLogger(): PipelineLogger {
    return this.logger;
  }

  public getConfig(): PipelineConfig {
    return this.config;
  }

  public async runBatch(videoPaths: string[]): Promise<PipelineExecutionResult> {
    this.fsManager.ensureDirectoriesExist();

    const pipelineId = `pipe_${Date.now()}`;
    const stateStore = new PipelineStateStore(pipelineId, this.isDryRun);

    const items: PipelineItem[] = videoPaths.map((filePath) => {
      const itemDesc = this.fsManager.createLifecycleItem(filePath);
      stateStore.registerItem(itemDesc.id, itemDesc.originalFilename);

      return {
        id: itemDesc.id,
        sourcePath: itemDesc.originalPath,
        filename: itemDesc.originalFilename,
        tag: 'WORK',
        name: itemDesc.baseName,
        targetKey: `${itemDesc.baseName}.mp4`,
        status: 'PENDING',
      };
    });

    const credentials = this.isDryRun ? undefined : SecretSanitizer.getCredentials(false);

    const context: PipelineContext = {
      pipelineId,
      isDryRun: this.isDryRun,
      config: this.config,
      credentials,
      logger: this.logger,
      stateStore,
      items,
      currentStage: 'IDLE',
    };

    const orchestrator = new VideoPipelineOrchestrator();
    return orchestrator.execute(context);
  }
}
