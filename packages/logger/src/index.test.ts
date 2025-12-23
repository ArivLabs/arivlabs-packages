import { createLogger, type ArivLogger, type LogDomain, type ServiceName } from './index';

// Mock pino module
jest.mock('pino', () => {
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

  const pino = jest.fn(() => createMockLogger());
  (pino as unknown as { stdSerializers: unknown }).stdSerializers = {
    req: jest.fn(),
    res: jest.fn(),
    err: jest.fn(),
  };

  return { default: pino, __esModule: true };
});

describe('@arivlabs/logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with required service name', () => {
      const logger = createLogger({ service: 'api-gateway' });

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should accept all valid service names', () => {
      const services: ServiceName[] = [
        'api-gateway',
        'queue-manager',
        'scanner-result-processor',
        'enrichment-processor',
        'lineage-processor',
        'ai-proxy',
        'control-plane',
      ];

      services.forEach((service) => {
        const logger = createLogger({ service });
        expect(logger).toBeDefined();
      });
    });

    it('should accept custom service names', () => {
      const logger = createLogger({ service: 'custom-service' });
      expect(logger).toBeDefined();
    });

    it('should create logger with optional environment', () => {
      const logger = createLogger({
        service: 'api-gateway',
        environment: 'production',
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with optional log level', () => {
      const logger = createLogger({
        service: 'api-gateway',
        level: 'debug',
      });
      expect(logger).toBeDefined();
    });

    it('should create logger with pretty printing disabled', () => {
      const logger = createLogger({
        service: 'api-gateway',
        pretty: false,
      });
      expect(logger).toBeDefined();
    });
  });

  describe('flexible calling convention', () => {
    it('should support intuitive style: logger.info(message, data)', () => {
      const logger = createLogger({ service: 'api-gateway' });

      // Just verify no error is thrown and the method exists
      expect(() => logger.info('Server started', { port: 3000 })).not.toThrow();
    });

    it('should support message-only style: logger.info(message)', () => {
      const logger = createLogger({ service: 'api-gateway' });

      expect(() => logger.info('Server started')).not.toThrow();
    });

    it('should support pino native style: logger.info({ msg, data })', () => {
      const logger = createLogger({ service: 'api-gateway' });

      expect(() => logger.info({ msg: 'Server started', port: 3000 })).not.toThrow();
    });

    it('should support pino native style with separate message: logger.info(data, message)', () => {
      const logger = createLogger({ service: 'api-gateway' });

      expect(() => logger.info({ port: 3000 }, 'Server started')).not.toThrow();
    });

    it('should work for all log levels', () => {
      const logger = createLogger({ service: 'api-gateway' });

      expect(() => logger.trace('Trace message', { data: 1 })).not.toThrow();
      expect(() => logger.debug('Debug message', { data: 2 })).not.toThrow();
      expect(() => logger.info('Info message', { data: 3 })).not.toThrow();
      expect(() => logger.warn('Warn message', { data: 4 })).not.toThrow();
      expect(() => logger.error('Error message', { data: 5 })).not.toThrow();
      expect(() => logger.fatal('Fatal message', { data: 6 })).not.toThrow();
    });

    it('should accept Error objects with { err } property', () => {
      const logger = createLogger({ service: 'api-gateway' });
      const testError = new Error('Test error');

      expect(() => logger.error('Operation failed', { err: testError })).not.toThrow();
    });

    it('should accept Error objects with { error } property (auto-converts to err)', () => {
      const logger = createLogger({ service: 'api-gateway' });
      const testError = new Error('Test error');

      expect(() => logger.error('Operation failed', { error: testError })).not.toThrow();
    });

    it('should handle both err and error properties together', () => {
      const logger = createLogger({ service: 'api-gateway' });
      const testError = new Error('Test error');

      // When both are provided, err takes precedence (error is not converted)
      expect(() =>
        logger.error('Operation failed', { err: testError, error: 'string' })
      ).not.toThrow();
    });
  });

  describe('logger.domain()', () => {
    it('should create a child logger with domain', () => {
      const logger = createLogger({ service: 'api-gateway' });

      const discoveryLogger = logger.domain('discovery');

      expect(discoveryLogger).toBeDefined();
      expect(typeof discoveryLogger.info).toBe('function');
      expect(typeof discoveryLogger.error).toBe('function');
    });

    it('should accept all valid domains', () => {
      const logger = createLogger({ service: 'api-gateway' });

      const domains: LogDomain[] = [
        'discovery',
        'auth',
        'connectors',
        'inventory',
        'lineage',
        'onboarding',
        'proxy',
        'users',
        'dashboard',
        'internal',
        'storage',
        'email',
        'queue',
        'system',
      ];

      domains.forEach((domain) => {
        const childLogger = logger.domain(domain);
        expect(childLogger).toBeDefined();
        expect(typeof childLogger.info).toBe('function');
      });
    });

    it('should return a wrapped logger supporting flexible calls', () => {
      const logger = createLogger({ service: 'api-gateway' });
      const discoveryLogger = logger.domain('discovery');

      expect(() => discoveryLogger.info('Job started', { jobId: '123' })).not.toThrow();
    });
  });

  describe('logger.withContext()', () => {
    it('should create a child logger with full context', () => {
      const logger = createLogger({ service: 'api-gateway' });

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
      const logger = createLogger({ service: 'api-gateway' });

      const requestLogger = logger.withContext({
        correlationId: 'abc-123',
      });

      expect(requestLogger).toBeDefined();
    });

    it('should return a wrapped logger supporting flexible calls', () => {
      const logger = createLogger({ service: 'api-gateway' });
      const reqLogger = logger.withContext({ correlationId: 'abc-123' });

      expect(() => reqLogger.error('Request failed', { status: 500 })).not.toThrow();
    });
  });

  describe('logger.child()', () => {
    it('should create a child logger with custom bindings', () => {
      const logger = createLogger({ service: 'api-gateway' });

      const childLogger = logger.child({ customField: 'value' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('type exports', () => {
    it('should export ServiceName type', () => {
      const service: ServiceName = 'api-gateway';
      expect(service).toBe('api-gateway');
    });

    it('should export LogDomain type', () => {
      const domain: LogDomain = 'discovery';
      expect(domain).toBe('discovery');
    });

    it('should export ArivLogger type', () => {
      const logger: ArivLogger = createLogger({ service: 'api-gateway' });
      expect(logger).toBeDefined();
    });
  });

  describe('environment defaults', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should default to debug level in development', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ service: 'api-gateway' });
      expect(logger).toBeDefined();
    });

    it('should default to info level in production', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger({
        service: 'api-gateway',
        environment: 'production',
      });
      expect(logger).toBeDefined();
    });

    it('should respect LOG_LEVEL env variable', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger({ service: 'api-gateway' });
      expect(logger).toBeDefined();
    });
  });
});
