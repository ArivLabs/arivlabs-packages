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
 * Extended logger interface with domain support
 */
export interface ArivLogger extends PinoLogger {
  /** Create a child logger for a specific domain */
  domain: (domain: LogDomain) => PinoLogger;
  /** Create a child logger with request context */
  withContext: (context: RequestContext) => PinoLogger;
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
 * Create a structured logger for an ArivLabs service
 *
 * @example
 * ```typescript
 * import { createLogger } from '@arivlabs/logger';
 *
 * const logger = createLogger({ service: 'api-gateway' });
 *
 * // Basic logging
 * logger.info({ msg: 'Server started', port: 3000 });
 *
 * // Domain-specific logging
 * const discoveryLog = logger.domain('discovery');
 * discoveryLog.info({ msg: 'Job created', jobId: '123' });
 *
 * // Request context logging
 * const reqLog = logger.withContext({
 *   correlationId: 'abc-123',
 *   tenantId: 'tenant-1',
 *   domain: 'discovery'
 * });
 * reqLog.info({ msg: 'Processing request' });
 * ```
 *
 * CloudWatch Insights queries:
 * - Filter by service: `fields @timestamp, @message | filter service = "api-gateway"`
 * - Filter by domain: `fields @timestamp, @message | filter domain = "discovery"`
 * - Filter errors: `fields @timestamp, @message | filter level = "error"`
 * - Filter by tenant: `fields @timestamp, @message | filter tenant_id = "xxx"`
 */
export function createLogger(config: LoggerConfig): ArivLogger {
  const isDevelopment = config.environment === 'development' ||
    process.env.NODE_ENV === 'development';
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

  // Extend with domain and context methods
  const logger = baseLogger as ArivLogger;

  logger.domain = (domain: LogDomain) => {
    return baseLogger.child({ domain });
  };

  logger.withContext = (context: RequestContext) => {
    return baseLogger.child({
      domain: context.domain,
      correlation_id: context.correlationId,
      user_id: context.userId,
      tenant_id: context.tenantId,
    });
  };

  return logger;
}

/**
 * Create a domain-specific child logger
 * @deprecated Use logger.domain() instead
 */
export function createDomainLogger(logger: PinoLogger, domain: LogDomain): PinoLogger {
  return logger.child({ domain });
}

/**
 * Create a child logger with request context
 * @deprecated Use logger.withContext() instead
 */
export function createRequestLogger(
  logger: PinoLogger,
  domain: LogDomain,
  correlationId: string,
  userId?: string,
  tenantId?: string
): PinoLogger {
  return logger.child({
    domain,
    correlation_id: correlationId,
    user_id: userId,
    tenant_id: tenantId,
  });
}

// Re-export pino types for convenience
export type { Logger as PinoLogger } from 'pino';
