# Changelog

All notable changes to `@arivlabs/logger` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
