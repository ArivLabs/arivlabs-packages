# Changelog

All notable changes to `@arivlabs/logger` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-01-21

### Added

- **Async logging mode** (default in production) for high-throughput, non-blocking logging
  - Configurable via `enableAsync: true/false` option
  - `asyncBufferSize` option to control buffer size (default: 4096 bytes)
  - Automatic sync mode for development, local, and test environments
- **Crash-safe logging** with synchronous flush for guaranteed delivery on exceptions
  - Opt-in via `handleExceptions: true` config option
  - Uses SonicBoom's `flushSync()` to ensure logs are written before process exit
- **Graceful shutdown API**
  - `logger.flush()` - Synchronously flush buffered logs
  - `logger.shutdown()` - Flush and close destinations (call before process exit)
- **Flexible types** - Define your own service/domain types locally, no more package updates
- **Custom base fields** - Add fields to every log via `base` config option
- **Direct pino access** - `logger.pino` property for advanced use cases

### Changed

- **BREAKING**: Upgraded Pino from v9.6.0 to v10.2.0
  - Drops Node.js 18 support (already required Node >=20)
  - Fixes memory leak when using transports with `--import preload`
- **BREAKING**: Async logging is now default in production environments
  - **Action required**: Add `await logger.shutdown()` to your SIGTERM handlers
  - Use `enableAsync: false` to opt out if needed
- **BREAKING**: Exception handling is now opt-in via `handleExceptions: true`
  - Previously registered handlers automatically; now explicit for safety
- Simplified API: removed generic type parameters (use TypeScript's type inference)
- Improved flush/shutdown reliability using proper SonicBoom methods

### Removed

- **BREAKING**: `ServiceName` type - Define your own service types locally
- **BREAKING**: `LogDomain` type - Define your own domain types locally
- All hard-coded service and domain names removed from the package

### Deprecated

- `createDomainLogger()` function - Use `logger.domain()` instead
- `createRequestLogger()` function - Use `logger.withContext()` instead

### Migration Guide

```typescript
// 1. Create logger (service/domain are now plain strings)
const logger = createLogger({ service: 'my-service' });

// 2. Add shutdown handler (required for async mode in production)
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});

// 3. (Optional) Enable exception handling
const logger = createLogger({
  service: 'my-service',
  handleExceptions: true, // Opt-in for crash-safe logging
});

// 4. (Optional) Opt out of async mode
const logger = createLogger({ service: 'my-service', enableAsync: false });
```

## [1.5.0] - 2025-01-10

### Added

- Added `feature-flags` to `LogDomain` type

## [1.4.1] - 2024-12-29

### Added

- Added `connector-types` to `LogDomain` type for connector types domain logging

## [1.4.0] - 2024-12-23

### Added

- **Sensitive data redaction**: Automatic masking of sensitive fields in logs
- Default redaction for common sensitive fields: `password`, `secret`, `token`, `apiKey`, `accessToken`, `refreshToken`, `secretAccessKey`, `privateKey`, etc.
- Support for nested field redaction with wildcard patterns (e.g., `*.password`)
- Request header redaction: `authorization`, `cookie`, `x-api-key`
- AWS credential redaction: `credentials.accessKeyId`, `credentials.secretAccessKey`, `credentials.sessionToken`
- `redact` configuration option for custom redaction paths
- Configurable censor text (default: `[REDACTED]`)
- Option to remove redacted fields entirely instead of masking
- Exported `DEFAULT_REDACT_PATHS` constant for reference

## [1.3.0] - 2024-12-23

### Added

- **Flexible error property**: Both `{ err: error }` and `{ error: error }` now work
- Auto-converts `error` property to `err` for proper pino serialization
- No more footgun - developers can use either naming convention

## [1.2.0] - 2024-12-23

### Added

- **Proper error logging**: `LogData` type now explicitly supports `err` property for Error objects
- Pino's error serializer properly captures error type, message, stack, and custom properties

### Changed

- Updated documentation to show correct error logging pattern: `{ err: error }` instead of `{ error: err.message }`

## [1.1.0] - 2024-12-23

### Added

- **Flexible calling convention**: Now supports intuitive `logger.info('message', { data })` style in addition to pino's native `logger.info({ msg: 'message', data })` style
- Better compatibility with common logging patterns (Winston, console.log style)

### Changed

- Logger methods now accept both calling styles, making migration from other logging libraries easier
- `domain()` and `withContext()` now return `ArivLogger` instead of `PinoLogger` for consistent API

## [1.0.0] - 2024-12-23

### Added

- Initial release
- `createLogger()` function for creating structured loggers
- Domain-specific logging with `logger.domain()`
- Request context logging with `logger.withContext()`
- CloudWatch-friendly JSON output
- Pretty printing for development
- TypeScript support with full type definitions
- Support for custom service names and log levels
