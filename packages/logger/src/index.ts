import type { Logger as PinoLogger, LoggerOptions } from 'pino';
import pino from 'pino';

/**
 * Service names for ArivLabs services
 */
export type ServiceName =
  | 'api-gateway'
  | 'queue-manager'
  | 'scanner-result-processor'
  | 'enrichment-processor'
  | 'lineage-processor'
  | 'ai-proxy'
  | 'control-plane';

/**
 * Domain names for structured logging
 */
export type LogDomain =
  | 'discovery'
  | 'auth'
  | 'connectors'
  | 'inventory'
  | 'lineage'
  | 'onboarding'
  | 'proxy'
  | 'users'
  | 'dashboard'
  | 'internal'
  | 'storage'
  | 'email'
  | 'queue'
  | 'system';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Service name (e.g., 'api-gateway') */
  service: ServiceName | string;
  /** Environment (defaults to NODE_ENV or 'development') */
  environment?: string;
  /** Log level (defaults to 'debug' in dev, 'info' in prod) */
  level?: string;
  /** Enable pretty printing (defaults to true in development) */
  pretty?: boolean;
}

/**
 * Log data object
 * Use `err` property for Error objects - pino will serialize them properly
 *
 * @example
 * logger.error('Request failed', { err: error }); // Correct - uses pino's error serializer
 * logger.error('Request failed', { error: err.message }); // Bad - loses error type/stack
 */
export type LogData = Record<string, unknown> & {
  /** Pass Error objects here for proper serialization (type, message, stack, custom props) */
  err?: Error | unknown;
};

/**
 * Flexible log method signature supporting multiple calling conventions
 */
export interface FlexibleLogFn {
  // String message with optional data object (intuitive style)
  (msg: string, data?: LogData): void;
  // Object with msg property (pino native style)
  (obj: LogData & { msg?: string }): void;
  // Object first, then message (pino native style)
  (obj: LogData, msg?: string): void;
}

/**
 * Extended logger interface with domain support and flexible API
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
  /** Create a child logger for a specific domain */
  domain: (domain: LogDomain) => ArivLogger;
  /** Create a child logger with request context */
  withContext: (context: RequestContext) => ArivLogger;
  /** Create a child logger with additional bindings */
  child: (bindings: LogData) => ArivLogger;
  /** Check if level is enabled */
  isLevelEnabled: (level: string) => boolean;
  /** Current log level */
  level: string;
}

/**
 * Request context for correlation
 */
export interface RequestContext {
  correlationId: string;
  userId?: string;
  tenantId?: string;
  domain?: LogDomain;
}

/**
 * Wrap a pino log method to support flexible calling conventions
 */
function wrapLogMethod(pinoLogger: PinoLogger, level: string): FlexibleLogFn {
  return function (msgOrObj: string | LogData, dataOrMsg?: LogData | string): void {
    if (typeof msgOrObj === 'string') {
      // Called as: logger.info('message') or logger.info('message', { data })
      if (dataOrMsg && typeof dataOrMsg === 'object') {
        (pinoLogger[level as keyof PinoLogger] as (obj: LogData, msg: string) => void)(
          dataOrMsg,
          msgOrObj
        );
      } else {
        (pinoLogger[level as keyof PinoLogger] as (msg: string) => void)(msgOrObj);
      }
    } else {
      // Called as: logger.info({ msg: 'message', data }) or logger.info({ data }, 'message')
      if (typeof dataOrMsg === 'string') {
        (pinoLogger[level as keyof PinoLogger] as (obj: LogData, msg: string) => void)(
          msgOrObj,
          dataOrMsg
        );
      } else {
        (pinoLogger[level as keyof PinoLogger] as (obj: LogData) => void)(msgOrObj);
      }
    }
  };
}

/**
 * Wrap a pino logger with flexible API
 */
function wrapLogger(pinoLogger: PinoLogger): ArivLogger {
  const wrapped: ArivLogger = {
    trace: wrapLogMethod(pinoLogger, 'trace'),
    debug: wrapLogMethod(pinoLogger, 'debug'),
    info: wrapLogMethod(pinoLogger, 'info'),
    warn: wrapLogMethod(pinoLogger, 'warn'),
    error: wrapLogMethod(pinoLogger, 'error'),
    fatal: wrapLogMethod(pinoLogger, 'fatal'),
    domain: (domain: LogDomain) => wrapLogger(pinoLogger.child({ domain })),
    withContext: (context: RequestContext) =>
      wrapLogger(
        pinoLogger.child({
          domain: context.domain,
          correlation_id: context.correlationId,
          user_id: context.userId,
          tenant_id: context.tenantId,
        })
      ),
    child: (bindings: LogData) => wrapLogger(pinoLogger.child(bindings)),
    isLevelEnabled: (level: string) => pinoLogger.isLevelEnabled(level),
    get level() {
      return pinoLogger.level;
    },
    set level(lvl: string) {
      pinoLogger.level = lvl;
    },
  };
  return wrapped;
}

/**
 * Create a structured logger for an ArivLabs service
 *
 * Supports flexible calling conventions:
 * - Intuitive style: `logger.info('Message', { key: value })`
 * - Pino native style: `logger.info({ msg: 'Message', key: value })`
 *
 * @example
 * ```typescript
 * import { createLogger } from '@arivlabs/logger';
 *
 * const logger = createLogger({ service: 'api-gateway' });
 *
 * // Basic logging (intuitive style - recommended)
 * logger.info('Server started', { port: 3000 });
 *
 * // Error logging - use { err } for proper serialization
 * logger.error('Request failed', { err: error }); // ✅ Correct
 * logger.error('Request failed', { error: err.message }); // ❌ Bad - loses info
 *
 * // Also works: pino native style
 * logger.info({ msg: 'Server started', port: 3000 });
 *
 * // Domain-specific logging
 * const discoveryLog = logger.domain('discovery');
 * discoveryLog.info('Job created', { jobId: '123' });
 *
 * // Request context logging
 * const reqLog = logger.withContext({
 *   correlationId: 'abc-123',
 *   tenantId: 'tenant-1',
 *   domain: 'discovery'
 * });
 * reqLog.info('Processing request');
 * ```
 *
 * CloudWatch Insights queries:
 * - Filter by service: `fields @timestamp, @message | filter service = "api-gateway"`
 * - Filter by domain: `fields @timestamp, @message | filter domain = "discovery"`
 * - Filter errors: `fields @timestamp, @message | filter level = "error"`
 * - Filter by tenant: `fields @timestamp, @message | filter tenant_id = "xxx"`
 */
export function createLogger(config: LoggerConfig): ArivLogger {
  const isDevelopment =
    config.environment === 'development' || process.env.NODE_ENV === 'development';
  const isLocal = process.env.ENV === 'local';
  const shouldPrettyPrint = config.pretty ?? (isDevelopment || isLocal);

  const pinoOptions: LoggerOptions = {
    name: config.service,
    level: config.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

    // Base fields included in every log
    base: {
      service: config.service,
      environment: config.environment || process.env.ENV || process.env.NODE_ENV || 'development',
    },

    // Timestamp format (CloudWatch-friendly ISO 8601)
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

    // Serializers for common objects
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
  };

  // Add pretty printing for development
  if (shouldPrettyPrint) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        messageFormat: '[{service}:{domain}] {correlation_id} {msg}',
      },
    };
  }

  const baseLogger = pino(pinoOptions);

  return wrapLogger(baseLogger);
}

/**
 * Create a domain-specific child logger
 * @deprecated Use logger.domain() instead
 */
export function createDomainLogger(logger: ArivLogger, domain: LogDomain): ArivLogger {
  return logger.domain(domain);
}

/**
 * Create a child logger with request context
 * @deprecated Use logger.withContext() instead
 */
export function createRequestLogger(
  logger: ArivLogger,
  domain: LogDomain,
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

// Re-export pino types for convenience (backwards compatibility)
export type { Logger as PinoLogger } from 'pino';
