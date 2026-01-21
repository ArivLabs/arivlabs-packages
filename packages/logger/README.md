# @arivlabs/logger

Structured, high-performance logging for Node.js services with CloudWatch support.

## Features

- **Async by default in production** - Non-blocking logging for maximum throughput
- **Crash-safe logging** - Uses `pino.final()` for guaranteed delivery on exceptions
- **Flexible types** - Define your own service and domain types locally
- **Automatic redaction** - Sensitive data masked by default
- **Child loggers** - Domain-specific and request-scoped logging
- **CloudWatch-friendly** - JSON output optimized for AWS CloudWatch Insights
- **Pino v10** - Built on the fastest Node.js logger

## Installation

```bash
pnpm add @arivlabs/logger

# Optional: for pretty printing in development
pnpm add -D pino-pretty
```

## Quick Start

```typescript
import { createLogger } from '@arivlabs/logger';

const logger = createLogger({ service: 'my-service' });

// Basic logging (intuitive style)
logger.info('Server started', { port: 3000 });

// Error logging - both { err } and { error } work
logger.error('Request failed', { err: error });
logger.error('Request failed', { error }); // Also works (auto-converted)

// Domain-specific logging
const authLogger = logger.domain('auth');
authLogger.info('User logged in', { userId: '123' });

// Request context logging
const reqLogger = logger.withContext({
  correlationId: 'abc-123',
  tenantId: 'tenant-1',
  domain: 'discovery',
});
reqLogger.info('Processing request');

// IMPORTANT: Graceful shutdown (required for async mode)
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

## Async Logging

By default, the logger uses **async mode in production** for high throughput:

```typescript
const logger = createLogger({
  service: 'my-service',
  // enableAsync: true is default in production
});

// Logs are buffered and written asynchronously
logger.info('High volume log', { requestId: '123' });

// CRITICAL: Always flush on shutdown!
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

### Async Defaults by Environment

| Environment | `enableAsync` Default | Why                           |
| ----------- | --------------------- | ----------------------------- |
| production  | `true`                | High throughput, non-blocking |
| development | `false`               | Immediate feedback during dev |
| local       | `false`               | Immediate feedback            |
| test        | `false`               | Predictable test output       |

### Disabling Async Mode

```typescript
const logger = createLogger({
  service: 'my-service',
  enableAsync: false, // All logs written synchronously
});
```

### Async Configuration

```typescript
const logger = createLogger({
  service: 'my-service',
  enableAsync: true,
  asyncBufferSize: 4096, // Buffer size before auto-flush (default: 4096)
});
```

## Exception Handling (Opt-in)

For crash-safe logging of uncaught exceptions, enable `handleExceptions`:

```typescript
const logger = createLogger({
  service: 'my-service',
  handleExceptions: true, // Registers uncaughtException/unhandledRejection handlers
});
```

When enabled, the logger:

1. Logs the error at `fatal` level
2. Calls `flushSync()` on the SonicBoom destination to ensure the log is written
3. Exits the process with code 1

**Note:** This is opt-in because automatic process exit behavior may not be desired in all applications.

## Configuration

```typescript
const logger = createLogger({
  // Required
  service: 'my-service',

  // Optional
  environment: 'production', // defaults to ENV or NODE_ENV
  level: 'info', // defaults to 'debug' in dev, 'info' in prod
  pretty: false, // defaults to true in development/local
  enableAsync: true, // defaults to true in production
  asyncBufferSize: 4096, // buffer size for async mode
  handleExceptions: false, // opt-in for crash-safe logging

  // Custom base fields (added to every log)
  base: {
    version: '2.0.0',
    region: 'us-east-1',
  },

  // Custom redaction paths (in addition to defaults)
  redact: {
    paths: ['user.ssn', 'payment.cardNumber'],
    censor: '[MASKED]', // default: '[REDACTED]'
    remove: false, // set true to remove key entirely
  },
});
```

## Sensitive Data Redaction

The logger automatically masks common sensitive fields:

### Default Redacted Fields

| Category            | Fields                                                |
| ------------------- | ----------------------------------------------------- |
| **Secrets**         | `password`, `secret`, `token`, `apiKey`, `privateKey` |
| **Auth Tokens**     | `accessToken`, `refreshToken`, `sessionToken`         |
| **AWS Credentials** | `secretAccessKey`, `credentials.*`                    |
| **Request Headers** | `req.headers.authorization`, `req.headers.cookie`     |
| **Nested**          | `*.password`, `*.secret`, `*.token`, `*.apiKey`       |

### Adding Custom Redaction

```typescript
const logger = createLogger({
  service: 'my-service',
  redact: {
    paths: ['user.ssn', 'payment.cardNumber', '*.bankAccount'],
  },
});
```

## Log Output Format

**JSON (production):**

```json
{
  "level": 30,
  "timestamp": "2026-01-21T10:30:00.000Z",
  "service": "my-service",
  "environment": "production",
  "domain": "auth",
  "correlation_id": "abc-123",
  "tenant_id": "tenant-1",
  "msg": "User logged in",
  "userId": "user-456"
}
```

**Pretty (development):**

```
10:30:00 Z [my-service:auth] abc-123 User logged in
```

## CloudWatch Insights Queries

```sql
-- Filter by service
fields @timestamp, @message | filter service = "my-service"

-- Filter by domain
fields @timestamp, @message | filter domain = "auth"

-- Filter errors (level 50 = error)
fields @timestamp, @message | filter level >= 50

-- Filter by tenant
fields @timestamp, @message | filter tenant_id = "tenant-123"

-- Trace a request
fields @timestamp, service, domain, @message
| filter correlation_id = "abc-123"
| sort @timestamp asc
```

## Error Logging

Pass the Error object directly:

```typescript
try {
  await someOperation();
} catch (error) {
  // Both work - error is auto-converted to err
  logger.error('Operation failed', { err: error });
  logger.error('Operation failed', { error }); // Same result

  // Bad - loses error type, stack, and custom properties
  logger.error('Operation failed', { message: error.message });
}
```

Pino's error serializer captures:

- Error name/type (e.g., `TypeError`, `ValidationError`)
- Error message
- Full stack trace
- Custom error properties

## API Reference

### `createLogger(config)`

Creates a new logger instance.

### `ArivLogger` Interface

| Method                  | Description                                |
| ----------------------- | ------------------------------------------ |
| `trace(msg, data?)`     | Log at trace level                         |
| `debug(msg, data?)`     | Log at debug level                         |
| `info(msg, data?)`      | Log at info level                          |
| `warn(msg, data?)`      | Log at warn level                          |
| `error(msg, data?)`     | Log at error level                         |
| `fatal(msg, data?)`     | Log at fatal level                         |
| `domain(name)`          | Create child logger for domain             |
| `withContext(ctx)`      | Create child logger with request context   |
| `child(bindings)`       | Create child logger with custom bindings   |
| `isLevelEnabled(level)` | Check if level is enabled                  |
| `flush()`               | Synchronously flush buffered logs          |
| `shutdown()`            | Flush and close (call before process exit) |
| `pino`                  | Access underlying Pino logger              |

## Migration from v1.x

### Breaking Changes

1. **Async logging is now default in production**
   - Add shutdown handler: `await logger.shutdown()`

2. **`ServiceName` and `LogDomain` types removed**
   - Define your own types locally

3. **Config option renamed**: `async` → `enableAsync`

4. **Exception handling is now opt-in**
   - Use `handleExceptions: true` if needed

### Migration Steps

```typescript
// Before (v1.x)
const logger = createLogger({ service: 'api-gateway' });

// After (v2.x)
const logger = createLogger({ service: 'my-service' });

// Add shutdown handler (required for async mode)
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

## Performance Tips

1. **Use `isLevelEnabled` for expensive computations:**

   ```typescript
   if (logger.isLevelEnabled('debug')) {
     logger.debug('Details', { data: computeExpensiveData() });
   }
   ```

2. **Keep log messages short** - data goes in the object:

   ```typescript
   // Good
   logger.info('Request processed', { userId, duration, status });

   // Bad
   logger.info(`Request for user ${userId} took ${duration}ms with status ${status}`);
   ```

3. **Reuse domain loggers:**

   ```typescript
   // Good - create once, reuse
   const authLogger = logger.domain('auth');
   authLogger.info('Login');
   authLogger.info('Logout');

   // Bad - wasteful
   logger.domain('auth').info('Login');
   logger.domain('auth').info('Logout');
   ```

## License

MIT
