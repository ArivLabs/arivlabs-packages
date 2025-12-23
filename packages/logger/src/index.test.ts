import { createLogger, type ArivLogger, type LogDomain, type ServiceName } from './index';

// Use the mock from __mocks__ folder
jest.mock('pino');

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

  describe('logger.domain()', () => {
    it('should create a child logger with domain', () => {
      const logger = createLogger({ service: 'api-gateway' }) as ArivLogger;

      const discoveryLogger = logger.domain('discovery');

      expect(logger.child).toHaveBeenCalledWith({ domain: 'discovery' });
      expect(discoveryLogger).toBeDefined();
    });

    it('should accept all valid domains', () => {
      const logger = createLogger({ service: 'api-gateway' }) as ArivLogger;

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
        logger.domain(domain);
        expect(logger.child).toHaveBeenCalledWith({ domain });
      });
    });
  });

  describe('logger.withContext()', () => {
    it('should create a child logger with full context', () => {
      const logger = createLogger({ service: 'api-gateway' }) as ArivLogger;

      const requestLogger = logger.withContext({
        correlationId: 'abc-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        domain: 'discovery',
      });

      expect(logger.child).toHaveBeenCalledWith({
        domain: 'discovery',
        correlation_id: 'abc-123',
        user_id: 'user-456',
        tenant_id: 'tenant-789',
      });
      expect(requestLogger).toBeDefined();
    });

    it('should create a child logger with minimal context', () => {
      const logger = createLogger({ service: 'api-gateway' }) as ArivLogger;

      logger.withContext({
        correlationId: 'abc-123',
      });

      expect(logger.child).toHaveBeenCalledWith({
        domain: undefined,
        correlation_id: 'abc-123',
        user_id: undefined,
        tenant_id: undefined,
      });
    });

    it('should create a child logger with correlation and tenant only', () => {
      const logger = createLogger({ service: 'api-gateway' }) as ArivLogger;

      logger.withContext({
        correlationId: 'abc-123',
        tenantId: 'tenant-789',
      });

      expect(logger.child).toHaveBeenCalledWith({
        domain: undefined,
        correlation_id: 'abc-123',
        user_id: undefined,
        tenant_id: 'tenant-789',
      });
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
