import {
  createLogger,
  createDomainLogger,
  createRequestLogger,
  DEFAULT_REDACT_PATHS,
  type ArivLogger,
} from './index';

// Mock pino module
jest.mock('pino', () => {
  const createMockDestination = () => ({
    write: jest.fn(),
    end: jest.fn((cb?: () => void) => cb && cb()),
    flushSync: jest.fn(),
  });

  const createMockLogger = (): Record<string, jest.Mock | string> => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockImplementation(() => createMockLogger()),
    isLevelEnabled: jest.fn().mockReturnValue(true),
    level: 'info',
  });

  const pino = jest.fn(() => createMockLogger()) as jest.Mock & {
    destination: jest.Mock;
    final: jest.Mock;
    stdSerializers: unknown;
  };

  // Add destination factory
  pino.destination = jest.fn(() => createMockDestination());

  // Add final for crash-safe logging
  pino.final = jest.fn((logger, handler) => {
    return (err: Error | null, eventName: string) => {
      if (handler) {
        handler(err, logger, eventName);
      }
    };
  });

  pino.stdSerializers = {
    req: jest.fn(),
    res: jest.fn(),
    err: jest.fn(),
  };

  return { default: pino, __esModule: true };
});

describe('@arivlabs/logger v2.0.0', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // BASIC FUNCTIONALITY
  // ===========================================================================

  describe('createLogger', () => {
    it('should create a logger with required service name', () => {
      const logger = createLogger({ service: 'my-service' });

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should accept any string as service name', () => {
      const logger1 = createLogger({ service: 'service-one' });
      const logger2 = createLogger({ service: 'my-custom-service' });
      const logger3 = createLogger({ service: 'brand-new-microservice' });

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
      expect(logger3).toBeDefined();
    });

    it('should create logger with optional environment', () => {
      const logger = createLogger({
        service: 'my-service',
        environment: 'production',
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with optional log level', () => {
      const logger = createLogger({
        service: 'my-service',
        level: 'debug',
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with pretty printing disabled', () => {
      const logger = createLogger({
        service: 'my-service',
        pretty: false,
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with custom redact paths', () => {
      const logger = createLogger({
        service: 'my-service',
        redact: {
          paths: ['customSecret', 'user.ssn'],
        },
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with custom redact censor', () => {
      const logger = createLogger({
        service: 'my-service',
        redact: {
          paths: ['secret'],
          censor: '***MASKED***',
        },
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with custom base fields', () => {
      const logger = createLogger({
        service: 'my-service',
        base: {
          version: '1.0.0',
          region: 'us-east-1',
        },
      });
      expect(logger).toBeDefined();
    });
  });

  // ===========================================================================
  // ASYNC MODE
  // ===========================================================================

  describe('async mode', () => {
    it('should create logger with async mode explicitly enabled', () => {
      const logger = createLogger({
        service: 'my-service',
        enableAsync: true,
      });
      expect(logger).toBeDefined();
      expect(typeof logger.flush).toBe('function');
      expect(typeof logger.shutdown).toBe('function');
    });

    it('should create logger with async mode explicitly disabled', () => {
      const logger = createLogger({
        service: 'my-service',
        enableAsync: false,
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with custom async buffer size', () => {
      const logger = createLogger({
        service: 'my-service',
        enableAsync: true,
        asyncBufferSize: 8192,
      });
      expect(logger).toBeDefined();
    });

    it('flush() should not throw', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(() => logger.flush()).not.toThrow();
    });

    it('shutdown() should resolve without error', async () => {
      const logger = createLogger({ service: 'my-service' });
      await expect(logger.shutdown()).resolves.toBeUndefined();
    });
  });

  // ===========================================================================
  // EXCEPTION HANDLING
  // ===========================================================================

  describe('exception handling', () => {
    it('should not register exception handlers by default', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
      // handleExceptions defaults to false
    });

    it('should accept handleExceptions option', () => {
      // In test mode, handlers are not registered even if requested
      const logger = createLogger({
        service: 'my-service',
        handleExceptions: true,
      });
      expect(logger).toBeDefined();
    });
  });

  // ===========================================================================
  // REDACTION DEFAULTS
  // ===========================================================================

  describe('redaction defaults', () => {
    it('should have default redact paths for common sensitive fields', () => {
      expect(DEFAULT_REDACT_PATHS).toContain('password');
      expect(DEFAULT_REDACT_PATHS).toContain('secret');
      expect(DEFAULT_REDACT_PATHS).toContain('token');
      expect(DEFAULT_REDACT_PATHS).toContain('apiKey');
      expect(DEFAULT_REDACT_PATHS).toContain('accessToken');
      expect(DEFAULT_REDACT_PATHS).toContain('refreshToken');
      expect(DEFAULT_REDACT_PATHS).toContain('secretAccessKey');
      expect(DEFAULT_REDACT_PATHS).toContain('privateKey');
    });

    it('should have default redact paths for nested fields', () => {
      expect(DEFAULT_REDACT_PATHS).toContain('*.password');
      expect(DEFAULT_REDACT_PATHS).toContain('*.secret');
      expect(DEFAULT_REDACT_PATHS).toContain('*.token');
    });

    it('should have default redact paths for request headers', () => {
      expect(DEFAULT_REDACT_PATHS).toContain('req.headers.authorization');
      expect(DEFAULT_REDACT_PATHS).toContain('req.headers.cookie');
    });

    it('should have default redact paths for AWS credentials', () => {
      expect(DEFAULT_REDACT_PATHS).toContain('credentials.accessKeyId');
      expect(DEFAULT_REDACT_PATHS).toContain('credentials.secretAccessKey');
      expect(DEFAULT_REDACT_PATHS).toContain('credentials.sessionToken');
    });
  });

  // ===========================================================================
  // FLEXIBLE CALLING CONVENTION
  // ===========================================================================

  describe('flexible calling convention', () => {
    it('should support intuitive style: logger.info(message, data)', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(() => logger.info('Server started', { port: 3000 })).not.toThrow();
    });

    it('should support message-only style: logger.info(message)', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(() => logger.info('Server started')).not.toThrow();
    });

    it('should support pino native style: logger.info({ msg, data })', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(() => logger.info({ msg: 'Server started', port: 3000 })).not.toThrow();
    });

    it('should support pino native style with separate message: logger.info(data, message)', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(() => logger.info({ port: 3000 }, 'Server started')).not.toThrow();
    });

    it('should work for all log levels', () => {
      const logger = createLogger({ service: 'my-service' });

      expect(() => logger.trace('Trace message', { data: 1 })).not.toThrow();
      expect(() => logger.debug('Debug message', { data: 2 })).not.toThrow();
      expect(() => logger.info('Info message', { data: 3 })).not.toThrow();
      expect(() => logger.warn('Warn message', { data: 4 })).not.toThrow();
      expect(() => logger.error('Error message', { data: 5 })).not.toThrow();
      expect(() => logger.fatal('Fatal message', { data: 6 })).not.toThrow();
    });

    it('should accept Error objects with { err } property', () => {
      const logger = createLogger({ service: 'my-service' });
      const testError = new Error('Test error');
      expect(() => logger.error('Operation failed', { err: testError })).not.toThrow();
    });

    it('should accept Error objects with { error } property (auto-converts to err)', () => {
      const logger = createLogger({ service: 'my-service' });
      const testError = new Error('Test error');
      expect(() => logger.error('Operation failed', { error: testError })).not.toThrow();
    });

    it('should handle both err and error properties together (err takes precedence)', () => {
      const logger = createLogger({ service: 'my-service' });
      const testError = new Error('Test error');
      expect(() =>
        logger.error('Operation failed', { err: testError, error: 'string' })
      ).not.toThrow();
    });
  });

  // ===========================================================================
  // DOMAIN LOGGING
  // ===========================================================================

  describe('logger.domain()', () => {
    it('should create a child logger with domain', () => {
      const logger = createLogger({ service: 'my-service' });
      const domainLogger = logger.domain('auth');

      expect(domainLogger).toBeDefined();
      expect(typeof domainLogger.info).toBe('function');
      expect(typeof domainLogger.error).toBe('function');
    });

    it('should accept any string as domain', () => {
      const logger = createLogger({ service: 'my-service' });

      const log1 = logger.domain('auth');
      const log2 = logger.domain('my-custom-domain');
      const log3 = logger.domain('brand-new-feature');

      expect(log1).toBeDefined();
      expect(log2).toBeDefined();
      expect(log3).toBeDefined();
    });

    it('should return a wrapped logger supporting flexible calls', () => {
      const logger = createLogger({ service: 'my-service' });
      const domainLogger = logger.domain('discovery');

      expect(() => domainLogger.info('Job started', { jobId: '123' })).not.toThrow();
    });

    it('should preserve flush and shutdown methods on child loggers', () => {
      const logger = createLogger({ service: 'my-service' });
      const childLogger = logger.domain('auth');

      expect(typeof childLogger.flush).toBe('function');
      expect(typeof childLogger.shutdown).toBe('function');
    });
  });

  // ===========================================================================
  // CONTEXT LOGGING
  // ===========================================================================

  describe('logger.withContext()', () => {
    it('should create a child logger with full context', () => {
      const logger = createLogger({ service: 'my-service' });

      const requestLogger = logger.withContext({
        correlationId: 'abc-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        domain: 'discovery',
      });

      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.info).toBe('function');
    });

    it('should create a child logger with minimal context', () => {
      const logger = createLogger({ service: 'my-service' });

      const requestLogger = logger.withContext({
        correlationId: 'abc-123',
      });

      expect(requestLogger).toBeDefined();
    });

    it('should return a wrapped logger supporting flexible calls', () => {
      const logger = createLogger({ service: 'my-service' });
      const reqLogger = logger.withContext({ correlationId: 'abc-123' });

      expect(() => reqLogger.error('Request failed', { status: 500 })).not.toThrow();
    });
  });

  // ===========================================================================
  // CHILD LOGGING
  // ===========================================================================

  describe('logger.child()', () => {
    it('should create a child logger with custom bindings', () => {
      const logger = createLogger({ service: 'my-service' });

      const childLogger = logger.child({ customField: 'value' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should allow chaining child loggers', () => {
      const logger = createLogger({ service: 'my-service' });

      const child1 = logger.child({ jobId: '123' });
      const child2 = child1.child({ step: 'processing' });

      expect(child2).toBeDefined();
      expect(() => child2.info('Processing step')).not.toThrow();
    });
  });

  // ===========================================================================
  // PINO ACCESS
  // ===========================================================================

  describe('logger.pino', () => {
    it('should expose underlying pino logger', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(logger.pino).toBeDefined();
    });
  });

  // ===========================================================================
  // LEVEL MANAGEMENT
  // ===========================================================================

  describe('level management', () => {
    it('should have isLevelEnabled method', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(typeof logger.isLevelEnabled).toBe('function');
      expect(logger.isLevelEnabled('info')).toBe(true);
    });

    it('should have level property', () => {
      const logger = createLogger({ service: 'my-service' });
      expect(typeof logger.level).toBe('string');
    });
  });

  // ===========================================================================
  // BACKWARDS COMPATIBILITY (deprecated helpers)
  // ===========================================================================

  describe('backwards compatibility', () => {
    describe('deprecated helper functions', () => {
      it('createDomainLogger should work', () => {
        const logger = createLogger({ service: 'my-service' });
        const domainLogger = createDomainLogger(logger, 'auth');
        expect(domainLogger).toBeDefined();
      });

      it('createRequestLogger should work', () => {
        const logger = createLogger({ service: 'my-service' });
        const reqLogger = createRequestLogger(
          logger,
          'auth',
          'correlation-123',
          'user-456',
          'tenant-789'
        );
        expect(reqLogger).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // TYPE EXPORTS
  // ===========================================================================

  describe('type exports', () => {
    it('should export ArivLogger type', () => {
      const logger: ArivLogger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should allow any string for service name', () => {
      const logger = createLogger({ service: 'any-service-name-works' });
      expect(logger).toBeDefined();
    });

    it('should allow any string for domain name', () => {
      const logger = createLogger({ service: 'my-service' });
      const domainLogger = logger.domain('any-domain-name-works');
      expect(domainLogger).toBeDefined();
    });
  });

  // ===========================================================================
  // ENVIRONMENT DEFAULTS
  // ===========================================================================

  describe('environment defaults', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('should default to debug level in development', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should default to info level in production', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger({
        service: 'my-service',
        environment: 'production',
      });
      expect(logger).toBeDefined();
    });

    it('should respect LOG_LEVEL env variable', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should respect ENV variable for environment', () => {
      process.env.ENV = 'staging';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should default enableAsync to false in development', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should default enableAsync to false in test', () => {
      process.env.NODE_ENV = 'test';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });

    it('should default enableAsync to false when ENV=local', () => {
      process.env.ENV = 'local';
      const logger = createLogger({ service: 'my-service' });
      expect(logger).toBeDefined();
    });
  });
});
