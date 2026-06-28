/**
 * Structured logger for the backend.
 *
 * Provides DEBUG, INFO, WARN, ERROR levels with consistent formatting and
 * colourised output.  DEBUG messages are suppressed in production.
 */

import { getConfig } from "../config/env";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

class Logger {
  private context: string;
  private isDev: boolean;

  constructor(context: string) {
    this.context = context;
    this.isDev = getConfig().server.isDevelopment;
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.context}]`;

    if (data !== undefined) {
      const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return `${prefix} ${message}\n${dataStr}`;
    }

    return `${prefix} ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.isDev) {
      const output = this.format("DEBUG", message, data);
      console.log(`\x1b[36m${output}\x1b[0m`); // Cyan
    }
  }

  info(message: string, data?: unknown): void {
    const output = this.format("INFO", message, data);
    console.log(`\x1b[32m${output}\x1b[0m`); // Green
  }

  warn(message: string, data?: unknown): void {
    const output = this.format("WARN", message, data);
    console.warn(`\x1b[33m${output}\x1b[0m`); // Yellow
  }

  error(message: string, error?: unknown): void {
    let output = this.format("ERROR", message);
    if (error !== undefined) {
      const errorData = error instanceof Error ? error.message : String(error);
      output += `\n${errorData}`;
    }
    console.error(`\x1b[31m${output}\x1b[0m`); // Red
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
