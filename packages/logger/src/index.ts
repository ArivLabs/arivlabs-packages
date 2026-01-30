/**
 * @arivlabs/logger v2.0.0
 *
 * Structured logging for Node.js services with CloudWatch support.
 *
 * Features:
 * - Async logging by default (high performance, non-blocking via SonicBoom)
 * - Crash-safe logging via synchronous flush on fatal errors
 * - Flexible types (define your own service/domain types)
 * - Automatic sensitive data redaction
 * - Child loggers with context
 * - Graceful shutdown with proper drain handling
 * - Buffer metrics for operational observability
 *
 * Architecture Notes:
 * - Production mode uses pino.destination() (SonicBoom) for buffered async writes
 * - SonicBoom provides flushSync() for crash-safe logging before process exit
 * - Pretty mode uses pino-pretty transport (worker thread) - flush() is a no-op
 * - Sync mode (enableAsync: false) writes immediately - flush() is a no-op
 * - pino.final() was deprecated in Node 14+ and removed in pino v10; we use
 *   direct flushSync() calls instead for crash-safe logging
 * - Timestamps use ISO 8601 format with field name "time" (same as pino.stdTimeFunctions.isoTime)
 *
 * Operational Considerations:
 * - Async logging can lose buffered logs on abrupt process termination (SIGKILL, OOM)
 * - flushSync() is best-effort; under extreme backpressure, logs may still be dropped
 * - Worker thread transports (pretty mode) have different ordering/timing guarantees
 * - Use getBufferMetrics() to monitor buffer state in production
 *
 * @example
 * ```typescript
 * import { createLogger } from '@arivlabs/logger';
 *
 * const logger = createLogger({ service: 'my-service' });
 *
 * logger.info('Server started', { port: 3000 });
 * logger.domain('auth').info('User logged in', { userId: '123' });
 *
 * // IMPORTANT: Call on shutdown to flush buffered logs
 * process.on('SIGTERM', async () => {
 *   await logger.shutdown();
 *   process.exit(0);
 * });
 * ```
 */

import pino, {
  stdTimeFunctions,
  type Logger as PinoLogger,
  type LoggerOptions,
  type DestinationStream,
} from 'pino';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Redaction configuration for masking sensitive data
 */
export interface RedactConfig {
  /**
   * Paths to redact (uses pino's redact syntax)
   * Examples: ['password', 'secret', 'req.headers.authorization', '*.token']
   */
  paths?: string[];
  /**
   * String to replace sensitive values with (default: '[REDACTED]')
   */
  censor?: string;
  /**
   * Whether to remove the key entirely instead of masking (default: false)
   */
  remove?: boolean;
}

/**
 * Default sensitive field patterns that are always redacted.
 * These cover common security-sensitive fields.
 *
 * Note: This is a readonly tuple. When merged with user paths, the result is string[].
 */
export const DEFAULT_REDACT_PATHS = [
  // Authentication & Secrets
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionToken',
  'session_token',
  'secretAccessKey',
  'secret_access_key',
  'privateKey',
  'private_key',

  // Nested paths (common patterns)
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.api_key',
  '*.accessToken',
  '*.secretAccessKey',
  '*.privateKey',

  // Request headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',

  // AWS credentials
  'credentials.accessKeyId',
  'credentials.secretAccessKey',
  'credentials.sessionToken',
] as const;

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Service name (e.g., 'api-gateway', 'worker-service') */
  service: string;

  /** Environment (defaults to ENV or NODE_ENV or 'development') */
  environment?: string;

  /** Log level (defaults to 'debug' in dev, 'info' in prod) */
  level?: string;

  /** Enable pretty printing (defaults to true in development/local) */
  pretty?: boolean;

  /**
   * Redaction configuration for masking sensitive data.
   * Sensitive fields are automatically masked. Use this to add custom paths.
   */
  redact?: RedactConfig;

  /**
   * Enable async (buffered) logging mode.
   *
   * - `true`: Logs are buffered and written asynchronously (high performance).
   *   You MUST call `logger.shutdown()` before process exit.
   * - `false`: All logs are written synchronously (guaranteed immediate write).
   * - Default: `true` in production, `false` in development/local/test.
   */
  enableAsync?: boolean;

  /**
   * Buffer size before auto-flush in async mode (default: 4096 bytes).
   * Lower = more frequent writes, higher = better batching.
   */
  asyncBufferSize?: number;

  /**
   * Custom base fields to include in every log entry.
   */
  base?: Record<string, unknown>;

  /**
   * Register handlers for uncaughtException and unhandledRejection.
   * When true, these events will be logged with synchronous flush for crash-safety.
   *
   * In production mode (SonicBoom destination), flushSync() ensures buffered logs
   * are written before process exit. This is best-effort - under extreme conditions
   * (SIGKILL, OOM, system crash), some logs may still be lost.
   *
   * In pretty mode (development), logs are sent to a worker thread transport
   * and crash-safe delivery cannot be guaranteed.
   *
   * Default: false (opt-in for safety).
   */
  handleExceptions?: boolean;

  /**
   * Whether to call process.exit(1) after logging fatal errors from
   * uncaughtException/unhandledRejection handlers.
   *
   * - `true`: Logger will exit the process after logging (default for backward compat)
   * - `false`: Logger only logs, allowing app to handle exit and other cleanup
   *
   * Setting this to `false` is recommended when:
   * - You have other cleanup to perform (DB connections, metrics, etc.)
   * - You have other exception handlers installed
   * - You want the app to control exit behavior
   *
   * Only applies when handleExceptions is true.
   * Default: true
   */
  exitOnFatal?: boolean;
}

/**
 * Log data object.
 * Pass Error objects as `err` or `error` - both work and will be serialized properly.
 *
 * @example
 * logger.error('Request failed', { err: error });   // Works
 * logger.error('Request failed', { error: error }); // Also works - auto-converted to err
 */
export type LogData = Record<string, unknown> & {
  /** Pass Error objects here for proper serialization (type, message, stack, custom props) */
  err?: Error | unknown;
  /** Alternative to err - will be auto-converted to err if it's an Error object */
  error?: Error | unknown;
};

/**
 * Flexible log method signature supporting multiple calling conventions.
 */
export interface FlexibleLogFn {
  /** String message with optional data object (intuitive style) */
  (msg: string, data?: LogData): void;
  /** Object with msg property (pino native style) */
  (obj: LogData & { msg?: string }): void;
  /** Object first, then message (pino native style) */
  (obj: LogData, msg?: string): void;
}

/**
 * Request context for correlation tracking.
 */
export interface RequestContext {
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Optional user ID */
  userId?: string;
  /** Optional tenant ID */
  tenantId?: string;
  /** Optional domain context */
  domain?: string;
}

/**
 * Buffer metrics for operational observability.
 * Use these to monitor logger health and detect backpressure issues.
 */
export interface BufferMetrics {
  /** Whether the logger is operating in async (buffered) mode */
  isAsync: boolean;
  /** Whether the logger is in pretty mode (worker thread transport) */
  isPrettyMode: boolean;
  /** Whether buffer metrics are available (false in pretty mode) */
  metricsAvailable: boolean;
  /**
   * Whether the underlying stream is currently experiencing backpressure.
   * When true, writes may be queued or dropped depending on configuration.
   * Only available when metricsAvailable is true.
   */
  isBackpressured?: boolean;
  /**
   * Whether the destination stream is destroyed/closed.
   * Only available when metricsAvailable is true.
   */
  isDestroyed?: boolean;
}

/**
 * Extended logger interface with domain support and flexible API.
 */
export interface ArivLogger {
  /** Log at trace level */
  trace: FlexibleLogFn;
  /** Log at debug level */
  debug: FlexibleLogFn;
  /** Log at info level */
  info: FlexibleLogFn;
  /** Log at warn level */
  warn: FlexibleLogFn;
  /** Log at error level */
  error: FlexibleLogFn;
  /** Log at fatal level */
  fatal: FlexibleLogFn;

  /**
   * Create a child logger for a specific domain.
   * @example
   * const authLogger = logger.domain('auth');
   * authLogger.info('User logged in', { userId });
   */
  domain(name: string): ArivLogger;

  /**
   * Create a child logger with request context.
   * @example
   * const reqLogger = logger.withContext({
   *   correlationId: 'abc-123',
   *   tenantId: 'tenant-1',
   *   domain: 'discovery'
   * });
   */
  withContext(context: RequestContext): ArivLogger;

  /**
   * Create a child logger with additional bindings.
   * @example
   * const jobLogger = logger.child({ jobId: '123' });
   */
  child(bindings: LogData): ArivLogger;

  /** Check if a log level is enabled */
  isLevelEnabled(level: string): boolean;

  /** Current log level (readable and writable) */
  level: string;

  /**
   * Flush all buffered logs to destination synchronously.
   *
   * **Important: This is a no-op in the following cases:**
   * - Pretty mode (development): pino-pretty runs in a worker thread without flushSync()
   * - Sync mode (`enableAsync: false`): Writes are immediate, no buffer to flush
   *
   * Only performs work when ALL conditions are met:
   * - Production mode (JSON output with SonicBoom destination)
   * - Async mode enabled (`enableAsync: true` or production defaults)
   * - Buffer has pending data (`minLength > 0`)
   *
   * For guaranteed delivery during shutdown, use shutdown() instead.
   */
  flush(): void;

  /**
   * Graceful shutdown - flushes logs and prepares for exit.
   * Call this on SIGTERM/SIGINT handlers before process.exit().
   *
   * This method:
   * 1. Cleans up exception handlers if registered
   * 2. Synchronously flushes the buffer (production mode only)
   * 3. Closes the destination stream with a 5s timeout
   *
   * In pretty mode (development), this is largely a no-op since the
   * pino-pretty transport runs in a worker thread.
   *
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;

  /**
   * Get buffer metrics for operational observability.
   * Use this to monitor logger health and detect backpressure issues.
   *
   * Note: In pretty mode, detailed metrics are not available since the
   * transport runs in a worker thread.
   *
   * @example
   * ```typescript
   * // Monitor buffer health
   * setInterval(() => {
   *   const metrics = logger.getBufferMetrics();
   *   if (metrics.isBackpressured) {
   *     console.warn('Logger buffer backpressure detected');
   *   }
   * }, 5000);
   * ```
   */
  getBufferMetrics(): BufferMetrics;

  /** Access to underlying pino logger (for advanced use cases) */
  readonly pino: PinoLogger;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/**
 * SonicBoom destination interface.
 * SonicBoom is the underlying writer used by pino.destination().
 *
 * Operational characteristics:
 * - flushSync() flushes the current buffer synchronously (blocking)
 * - flush(cb) flushes asynchronously and calls callback when done
 * - Under backpressure, writes may be dropped (configurable via maxWrite)
 * - 'drain' event signals when writes can resume after backpressure
 * - destroyed property indicates if the stream has been closed
 */
interface SonicBoomDestination extends DestinationStream {
  /** Synchronously flush the buffer to the underlying file descriptor */
  flushSync(): void;
  /** Asynchronously flush and call callback when complete */
  flush(cb?: () => void): void;
  /** End the stream, optionally calling callback when complete */
  end(cb?: () => void): void;
  /** Whether the stream has been destroyed */
  destroyed: boolean;
  /** Minimum bytes before auto-flush (0 = immediate) */
  minLength: number;
}

/** Internal state for managing destinations */
interface LoggerState {
  destination: SonicBoomDestination | null;
  isAsync: boolean;
  isPrettyMode: boolean;
  pinoLogger: PinoLogger;
  /** Cleanup function for exception handlers (removes process listeners) */
  cleanupHandlers?: () => void;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Normalize error properties in log data.
 * Converts `error` property to `err` for proper pino serialization.
 */
function normalizeLogData(data: LogData): LogData {
  if (data.error instanceof Error && !data.err) {
    const { error, ...rest } = data;
    return { ...rest, err: error };
  }
  return data;
}

/**
 * Create a wrapped log method that supports flexible calling conventions.
 */
function createLogMethod(pinoLogger: PinoLogger, level: string): FlexibleLogFn {
  // Get the actual pino method
  const pinoMethod = pinoLogger[level as keyof PinoLogger] as PinoLogger['info'];

  return function logMethod(msgOrObj: string | LogData, dataOrMsg?: LogData | string): void {
    if (typeof msgOrObj === 'string') {
      // Called as: logger.info('message') or logger.info('message', { data })
      if (dataOrMsg !== undefined && typeof dataOrMsg === 'object') {
        const normalized = normalizeLogData(dataOrMsg);
        pinoMethod.call(pinoLogger, normalized, msgOrObj);
      } else {
        pinoMethod.call(pinoLogger, msgOrObj);
      }
    } else {
      // Called as: logger.info({ msg: 'message', data }) or logger.info({ data }, 'message')
      const normalized = normalizeLogData(msgOrObj);
      if (typeof dataOrMsg === 'string') {
        pinoMethod.call(pinoLogger, normalized, dataOrMsg);
      } else {
        pinoMethod.call(pinoLogger, normalized);
      }
    }
  };
}

/**
 * Wrap a pino logger with our flexible API.
 */
function wrapLogger(pinoLogger: PinoLogger, state: LoggerState): ArivLogger {
  const wrapped: ArivLogger = {
    trace: createLogMethod(pinoLogger, 'trace'),
    debug: createLogMethod(pinoLogger, 'debug'),
    info: createLogMethod(pinoLogger, 'info'),
    warn: createLogMethod(pinoLogger, 'warn'),
    error: createLogMethod(pinoLogger, 'error'),
    fatal: createLogMethod(pinoLogger, 'fatal'),

    domain(name: string): ArivLogger {
      return wrapLogger(pinoLogger.child({ domain: name }), state);
    },

    withContext(context: RequestContext): ArivLogger {
      return wrapLogger(
        pinoLogger.child({
          domain: context.domain,
          correlation_id: context.correlationId,
          user_id: context.userId,
          tenant_id: context.tenantId,
        }),
        state
      );
    },

    child(bindings: LogData): ArivLogger {
      return wrapLogger(pinoLogger.child(bindings), state);
    },

    isLevelEnabled(level: string): boolean {
      return pinoLogger.isLevelEnabled(level);
    },

    get level(): string {
      return pinoLogger.level;
    },

    set level(newLevel: string) {
      pinoLogger.level = newLevel;
    },

    flush(): void {
      // No-op conditions (early return):
      // 1. Pretty mode: uses worker thread transport without flushSync()
      // 2. No destination: nothing to flush
      // 3. Sync mode: writes are immediate, no buffering
      // 4. No buffering enabled: minLength === 0 means no buffer
      if (state.isPrettyMode || !state.destination || !state.isAsync) {
        return;
      }

      // Check if buffering is actually enabled (minLength > 0)
      // When minLength is 0, writes go directly to fd without buffering
      if (state.destination.minLength === 0) {
        return;
      }

      try {
        state.destination.flushSync();
      } catch {
        // flushSync can throw if the stream is already closed
        // Silently ignore as this is a best-effort operation
      }
    },

    async shutdown(): Promise<void> {
      // Clean up exception handlers first to prevent logging during shutdown
      if (state.cleanupHandlers) {
        state.cleanupHandlers();
      }

      // Only process destination shutdown for non-pretty mode
      if (state.destination && !state.isPrettyMode) {
        const dest = state.destination;

        // Step 1: Synchronously flush current buffer
        try {
          dest.flushSync();
        } catch {
          // Ignore flush errors during shutdown
        }

        // Step 2: End the stream and wait for completion
        await new Promise<void>((resolve) => {
          const timeoutMs = 5000; // 5 second timeout for safety

          const timeout = setTimeout(() => {
            // Force resolve if end() takes too long
            resolve();
          }, timeoutMs);

          // Use async flush if available, then end
          // In pino v10+, flush() may not be available on all destinations
          if (typeof dest.flush === 'function') {
            dest.flush(() => {
              dest.end(() => {
                clearTimeout(timeout);
                resolve();
              });
            });
          } else {
            // Fallback: just call end() directly
            dest.end(() => {
              clearTimeout(timeout);
              resolve();
            });
          }
        });
      }
    },

    getBufferMetrics(): BufferMetrics {
      const baseMetrics: BufferMetrics = {
        isAsync: state.isAsync,
        isPrettyMode: state.isPrettyMode,
        metricsAvailable: !state.isPrettyMode && state.destination !== null,
      };

      // Detailed metrics only available for SonicBoom destinations
      if (state.destination && !state.isPrettyMode) {
        const dest = state.destination;
        return {
          ...baseMetrics,
          // writableNeedDrain indicates the stream is experiencing backpressure
          // This is a standard Node.js stream property that SonicBoom inherits
          isBackpressured:
            (dest as unknown as { writableNeedDrain?: boolean }).writableNeedDrain ?? false,
          isDestroyed: dest.destroyed,
        };
      }

      return baseMetrics;
    },

    get pino(): PinoLogger {
      return pinoLogger;
    },
  };

  return wrapped;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create a structured logger for a service.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const logger = createLogger({ service: 'my-service' });
 * logger.info('Server started', { port: 3000 });
 *
 * // Domain-specific logging
 * const authLog = logger.domain('auth');
 * authLog.info('User logged in', { userId: '123' });
 *
 * // Request context logging
 * const reqLog = logger.withContext({
 *   correlationId: 'abc-123',
 *   tenantId: 'tenant-1',
 *   domain: 'discovery'
 * });
 *
 * // Error logging - both { err } and { error } work
 * logger.error('Request failed', { err: error });
 * logger.error('Request failed', { error }); // Auto-converted
 *
 * // IMPORTANT: Graceful shutdown (required for async mode)
 * process.on('SIGTERM', async () => {
 *   await logger.shutdown();
 *   process.exit(0);
 * });
 * ```
 *
 * CloudWatch Insights queries:
 * - Filter by service: `filter service = "my-service"`
 * - Filter by domain: `filter domain = "auth"`
 * - Filter errors: `filter level >= 50`
 * - Filter by tenant: `filter tenant_id = "xxx"`
 */
export function createLogger(config: LoggerConfig): ArivLogger {
  const environment =
    config.environment || process.env.ENV || process.env.NODE_ENV || 'development';
  const isDevelopment = environment === 'development';
  const isLocal = process.env.ENV === 'local';
  const isTest = environment === 'test' || process.env.NODE_ENV === 'test';
  const shouldPrettyPrint = config.pretty ?? (isDevelopment || isLocal);

  // Async defaults: enabled in production, disabled in dev/test for simplicity
  const useAsync = config.enableAsync ?? (!isDevelopment && !isLocal && !isTest);

  // Build redact paths: defaults + custom
  const redactPaths: string[] = [...DEFAULT_REDACT_PATHS, ...(config.redact?.paths ?? [])];

  // Base pino options
  const basePinoOptions: LoggerOptions = {
    name: config.service,
    level: config.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

    // Base fields included in every log
    base: {
      service: config.service,
      environment,
      ...config.base,
    },

    // Timestamp in ISO 8601 format (e.g. "2025-01-30T14:00:00.000Z")
    // Uses pino's built-in for optimal performance. Field name is "time".
    timestamp: stdTimeFunctions.isoTime,

    // Redact sensitive fields
    redact: {
      paths: redactPaths,
      censor: config.redact?.censor ?? '[REDACTED]',
      remove: config.redact?.remove ?? false,
    },

    // Serializers for common objects
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
  };

  // Initialize state
  const state: LoggerState = {
    destination: null,
    isAsync: useAsync,
    isPrettyMode: shouldPrettyPrint,
    pinoLogger: null as unknown as PinoLogger, // Will be set below
  };

  let pinoLogger: PinoLogger;

  if (shouldPrettyPrint) {
    // Pretty printing for development - uses pino-pretty transport
    // IMPORTANT: Transports run in worker threads, which means:
    // - flushSync() is not available (flush() is a no-op)
    // - pino.final() cannot be used for crash-safe logging
    // - Logs may be lost if process exits abruptly
    const pinoOptions: LoggerOptions = {
      ...basePinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          messageFormat: '[{service}:{domain}] {correlation_id} {msg}',
        },
      },
    };
    pinoLogger = pino(pinoOptions);
    state.isAsync = false; // Transport handles its own buffering
  } else {
    // Production mode - use SonicBoom destination
    // This provides:
    // - Buffered async writes (high performance)
    // - flushSync() for crash-safe logging (best-effort)
    //
    // Note: pino.final() was deprecated in Node 14+ and removed in pino v10.
    // We use direct flushSync() calls instead for crash-safe logging.
    // pino.destination() returns a SonicBoom instance
    const destination = pino.destination({
      sync: !useAsync,
      minLength: useAsync ? (config.asyncBufferSize ?? 4096) : 0,
    }) as unknown as SonicBoomDestination;

    state.destination = destination;
    pinoLogger = pino(basePinoOptions, destination);
  }

  state.pinoLogger = pinoLogger;

  // Register exception handlers if requested (opt-in)
  if (config.handleExceptions && !isTest) {
    const shouldExit = config.exitOnFatal !== false; // Default to true for backward compat

    if (state.destination && !shouldPrettyPrint) {
      // Production mode: Use synchronous flush for crash-safe logging
      // This is the pino v10+ recommended pattern (pino.final was removed)
      //
      // IMPORTANT: flushSync() is best-effort. Under extreme conditions
      // (SIGKILL, OOM, system crash, extreme backpressure), logs may still be lost.
      const crashSafeHandler = (err: Error, eventName: string) => {
        // Log the fatal error
        pinoLogger.fatal({ err, event: eventName }, 'Process terminating due to error');

        // Synchronously flush to ensure the log is written before exit
        // This blocks until the buffer is flushed to the underlying fd
        try {
          state.destination!.flushSync();
        } catch {
          // flushSync can throw if stream is destroyed - ignore during crash
        }

        if (shouldExit) {
          process.exit(1);
        }
      };

      const uncaughtHandler = (err: Error) => {
        crashSafeHandler(err, 'uncaughtException');
      };

      const rejectionHandler = (reason: unknown) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        crashSafeHandler(err, 'unhandledRejection');
      };

      process.on('uncaughtException', uncaughtHandler);
      process.on('unhandledRejection', rejectionHandler);

      // Store cleanup function
      state.cleanupHandlers = () => {
        process.removeListener('uncaughtException', uncaughtHandler);
        process.removeListener('unhandledRejection', rejectionHandler);
      };
    } else {
      // Pretty mode (development): Best-effort handler
      // WARNING: Logs may not be delivered if process exits immediately
      // Worker thread transports don't expose flushSync()
      const bestEffortHandler = (err: Error, eventName: string) => {
        // Best effort logging - may not complete before exit in pretty mode
        pinoLogger.fatal({ err, event: eventName }, 'Process terminating due to error');

        if (shouldExit) {
          // Small delay to allow log to be processed by transport worker
          // This is NOT guaranteed - just gives the worker a chance
          setTimeout(() => process.exit(1), 100);
        }
      };

      const uncaughtHandler = (err: Error) => {
        bestEffortHandler(err, 'uncaughtException');
      };

      const rejectionHandler = (reason: unknown) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        bestEffortHandler(err, 'unhandledRejection');
      };

      process.on('uncaughtException', uncaughtHandler);
      process.on('unhandledRejection', rejectionHandler);

      // Store cleanup function
      state.cleanupHandlers = () => {
        process.removeListener('uncaughtException', uncaughtHandler);
        process.removeListener('unhandledRejection', rejectionHandler);
      };
    }
  }

  return wrapLogger(pinoLogger, state);
}

// =============================================================================
// CONVENIENCE EXPORTS (deprecated but maintained for migration)
// =============================================================================

/**
 * Create a domain-specific child logger.
 * @deprecated Use `logger.domain(name)` instead.
 */
export function createDomainLogger(logger: ArivLogger, domain: string): ArivLogger {
  return logger.domain(domain);
}

/**
 * Create a child logger with request context.
 * @deprecated Use `logger.withContext()` instead.
 */
export function createRequestLogger(
  logger: ArivLogger,
  domain: string,
  correlationId: string,
  userId?: string,
  tenantId?: string
): ArivLogger {
  return logger.withContext({
    domain,
    correlationId,
    userId,
    tenantId,
  });
}

// Re-export pino types for convenience
export type { Logger as PinoLogger } from 'pino';
