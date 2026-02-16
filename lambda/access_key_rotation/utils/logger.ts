/**
 * Structured JSON logger for CloudWatch.
 *
 * Every log entry is a single JSON line with a consistent shape so that
 * CloudWatch Insights queries can filter by level, timestamp, or any
 * metadata field.
 *
 * Levels:
 *   INFO    – Normal operational messages (start/stop, success, counts).
 *   WARNING – Recoverable issues that may need attention.
 *   ERROR   – Failures that need investigation.
 *   DEBUG   – Verbose detail useful only during development or debugging.
 */
export class Logger {

  /** Log an informational message (normal operations). */
  static info(message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  /**
   * Log an error with optional Error object.
   * Uses console.error so CloudWatch marks it as an error entry.
   */
  static error(message: string, error?: unknown, metadata?: Record<string, unknown>) {
    const err = error instanceof Error ? error : undefined;
    console.error(JSON.stringify({
      level: 'ERROR',
      message,
      error: err?.message ?? error,
      stack: err?.stack,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  /** Log a warning (recoverable issue that may need attention). */
  static warning(message: string, metadata?: Record<string, unknown>) {
    console.warn(JSON.stringify({
      level: 'WARNING',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  /** Log a debug message (verbose detail for development / troubleshooting). */
  static debug(message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({
      level: 'DEBUG',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }
}
