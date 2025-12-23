# Contributing to ArivLabs Packages

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/arivlabs/arivlabs-packages.git
cd arivlabs-packages

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint
```

## Making Changes

1. Create a new branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Ensure linting passes: `pnpm lint`
6. Commit with a descriptive message
7. Push and create a Pull Request

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `test: add tests`
- `chore: update dependencies`

## Code Style

- Use TypeScript for all code
- Follow the ESLint configuration
- Format with Prettier before committing

## Adding a New Package

1. Create package directory: `mkdir -p packages/my-package/src`
2. Add `package.json` with `@arivlabs/` scope
3. Add `tsconfig.json` extending root config
4. Add tests in `src/*.test.ts`
5. Update root `jest.config.js` to include new package

## Questions?

Open an issue or reach out to the maintainers.
