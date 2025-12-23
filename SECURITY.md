# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing security@arivlabs.com.

**Please do not report security vulnerabilities through public GitHub issues.**

You should receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible.

## Security Best Practices

When using `@arivlabs/logger`:

1. **Never log sensitive data** - Avoid logging passwords, API keys, or PII
2. **Use appropriate log levels** - Don't use debug in production
3. **Keep dependencies updated** - Run `pnpm audit` regularly
