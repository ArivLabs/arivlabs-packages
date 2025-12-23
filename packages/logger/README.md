# @arivlabs/logger

Structured logging for ArivLabs services with CloudWatch support.

## Installation

```bash
pnpm add @arivlabs/logger

# Optional: for pretty printing in development
pnpm add -D pino-pretty
```

## Usage

```typescript
import { createLogger } from '@arivlabs/logger';

// Create a logger for your service
const logger = createLogger({ service: 'api-gateway' });

// Basic logging - intuitive style (recommended)
logger.info('Server started', { port: 3000 });

// Error logging - both { err } and { error } work
logger.error('Request failed', { err: error }); // ✅ Works
logger.error('Request failed', { error: error }); // ✅ Also works (auto-converted)
// logger.error('Request failed', { error: err.message }); // ❌ Bad - pass the Error object, not .message

// Also works: pino native style
logger.info({ msg: 'Server started', port: 3000 });

// Domain-specific logging
const discoveryLog = logger.domain('discovery');
discoveryLog.info('Job created', { jobId: '123' });

// Request context logging
const reqLog = logger.withContext({
  correlationId: 'abc-123',
  tenantId: 'tenant-1',
  domain: 'discovery',
});
reqLog.info('Processing request');
```

## CloudWatch Insights Queries

```sql
-- Filter by service
fields @timestamp, @message
| filter service = "api-gateway"

-- Filter by domain
fields @timestamp, @message
| filter domain = "discovery"

-- Filter errors
fields @timestamp, @message
| filter level = "error"

-- Filter by tenant
fields @timestamp, @message
| filter tenant_id = "xxx"

-- Combine filters
fields @timestamp, service, domain, @message
| filter service = "api-gateway" and domain = "discovery"
| sort @timestamp desc
| limit 100
```

## Configuration

```typescript
const logger = createLogger({
  service: 'api-gateway', // Required: service name
  environment: 'production', // Optional: defaults to NODE_ENV
  level: 'info', // Optional: debug, info, warn, error
  pretty: false, // Optional: defaults to true in development
});
```

## Log Format

JSON output (production):

```json
{
  "level": 30,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "api-gateway",
  "environment": "production",
  "domain": "discovery",
  "correlation_id": "abc-123",
  "tenant_id": "tenant-1",
  "msg": "Job created",
  "jobId": "job-456"
}
```

Pretty output (development):

```
10:30:00 Z [api-gateway:discovery] abc-123 Job created
```

## Error Logging Best Practices

Pass the Error object directly - both `err` and `error` keys work:

```typescript
try {
  await someOperation();
} catch (error) {
  // ✅ Both work - error is auto-converted to err for pino
  logger.error('Operation failed', { err: error });
  logger.error('Operation failed', { error }); // Same result

  // ❌ Bad - loses error type, stack, and custom properties
  logger.error('Operation failed', { error: error.message });
  logger.error('Operation failed', { message: error.message, stack: error.stack });
}
```

Pino's error serializer captures:

- Error name/type (e.g., `TypeError`, `ValidationError`)
- Error message
- Stack trace
- Custom error properties

## Available Domains

- `discovery` - Discovery scanning
- `auth` - Authentication
- `connectors` - Cloud connectors
- `inventory` - Resource inventory
- `lineage` - Data lineage
- `onboarding` - Customer onboarding
- `proxy` - AI proxy
- `users` - User management
- `dashboard` - Analytics dashboard
- `internal` - Internal APIs
- `storage` - File storage
- `email` - Email service
- `queue` - Queue processing
- `system` - System-level logs
