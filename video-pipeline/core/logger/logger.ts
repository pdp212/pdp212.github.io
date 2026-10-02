/**
 * Structured Logger for Video Pipeline
 * Automatically redacts sensitive tokens and formats log entries consistently.
 */

import { SecretSanitizer } from '../security/secret-sanitizer.js';
import type { PipelineStage } from '../errors/pipeline-errors.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  stage: PipelineStage;
  event: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'SKIPPED';
  message: string;
  data?: Record<string, unknown>;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  sink?: (entry: LogEntry) => void;
}

export class PipelineLogger {
  private readonly minLevel: LogLevel;
  private readonly sink: (entry: LogEntry) => void;
  private readonly entries: LogEntry[] = [];

  private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  constructor(options?: LoggerOptions) {
    this.minLevel = options?.minLevel || 'INFO';
    this.sink = options?.sink || this.defaultSink.bind(this);
  }

  private shouldLog(level: LogLevel): boolean {
    return PipelineLogger.LEVEL_PRIORITY[level] >= PipelineLogger.LEVEL_PRIORITY[this.minLevel];
  }

  private createEntry(
    stage: PipelineStage,
    event: string,
    status: LogEntry['status'],
    message: string,
    data?: Record<string, unknown>
  ): LogEntry {
    const sanitizedMessage = SecretSanitizer.sanitizeString(message);
    const sanitizedData = data ? SecretSanitizer.sanitizeObject(data) : undefined;

    return {
      timestamp: new Date().toISOString(),
      stage,
      event,
      status,
      message: sanitizedMessage,
      data: sanitizedData,
    };
  }

  public debug(stage: PipelineStage, event: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('DEBUG')) return;
    const entry = this.createEntry(stage, event, 'IN_PROGRESS', message, data);
    this.entries.push(entry);
    this.sink(entry);
  }

  public info(
    stage: PipelineStage,
    event: string,
    message: string,
    status: LogEntry['status'] = 'IN_PROGRESS',
    data?: Record<string, unknown>
  ): void {
    if (!this.shouldLog('INFO')) return;
    const entry = this.createEntry(stage, event, status, message, data);
    this.entries.push(entry);
    this.sink(entry);
  }

  public warn(stage: PipelineStage, event: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('WARN')) return;
    const entry = this.createEntry(stage, event, 'FAILURE', message, data);
    this.entries.push(entry);
    this.sink(entry);
  }

  public error(stage: PipelineStage, event: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('ERROR')) return;
    const entry = this.createEntry(stage, event, 'FAILURE', message, data);
    this.entries.push(entry);
    this.sink(entry);
  }

  public getHistory(): readonly LogEntry[] {
    return this.entries;
  }

  private defaultSink(entry: LogEntry): void {
    const time = entry.timestamp.split('T')[1]?.replace('Z', '') || entry.timestamp;
    const prefix = `[${time}] [${entry.stage}] [${entry.event}]`;
    const statusTag = entry.status === 'SUCCESS' ? '✔' : entry.status === 'FAILURE' ? '✖' : 'ℹ';
    const output = `${prefix} ${statusTag} ${entry.message}`;

    if (entry.status === 'FAILURE') {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}
