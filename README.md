# ArivLabs Packages

Shared packages for ArivLabs services.

## Structure

```
arivlabs-packages/
├── packages/
│   ├── logger/          # @arivlabs/logger - Structured logging
│   ├── prisma-crud/     # @arivlabs/prisma-crud - Prisma CRUD wrapper (planned)
│   └── fastify-utils/   # @arivlabs/fastify-utils - Fastify utilities (planned)
```

## Installation

### Option 1: Local Development (workspace protocol)

In your service's `package.json`:

```json
{
  "dependencies": {
    "@arivlabs/logger": "workspace:*"
  }
}
```

Then run:

```bash
pnpm install
```

### Option 2: Link for development

```bash
# From your service directory
pnpm add ../arivlabs-packages/packages/logger
```

### Option 3: Published packages (future)

When published to npm:

```bash
pnpm add @arivlabs/logger
```

## Development

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm build:logger

# Watch mode for development
pnpm dev
```

## Adding a New Package

1. Create package directory:

```bash
mkdir -p packages/my-package/src
```

2. Create `packages/my-package/package.json`:

```json
{
  "name": "@arivlabs/my-package",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

3. Install dependencies and build:

```bash
pnpm install
pnpm build
```

## Available Packages

| Package                   | Description                                | Status     |
| ------------------------- | ------------------------------------------ | ---------- |
| `@arivlabs/logger`        | Structured logging with CloudWatch support | ✅ Ready   |
| `@arivlabs/prisma-crud`   | Generic Prisma CRUD operations             | 📋 Planned |
| `@arivlabs/fastify-utils` | Fastify helpers and middleware             | 📋 Planned |
