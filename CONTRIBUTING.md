# Contributing to ADO

Thank you for your interest in contributing to ADO (Agentic Development Orchestrator)! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Documentation](#documentation)
- [Release Process](#release-process)

---

## Code of Conduct

This project adheres to the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Getting Started

### Prerequisites

- **Node.js 22+**
- **pnpm 9+** (required, not npm or yarn)
- **Git**
- Familiarity with TypeScript, Node.js, and CLI development

### Find an Issue

1. Browse [open issues](https://github.com/dxheroes/ado/issues)
2. Look for issues labeled `good first issue` or `help wanted`
3. Comment on the issue to claim it
4. Wait for maintainer approval before starting work

### Ask Questions

- [GitHub Discussions](https://github.com/dxheroes/ado/discussions) for questions
- [Discord Server](https://discord.gg/dxheroes) for real-time chat
- Tag maintainers in issues for clarification

---

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/ado.git
cd ado

# Add upstream remote
git remote add upstream https://github.com/dxheroes/ado.git
```

### 2. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install project dependencies
pnpm install
```

### 3. Build All Packages

```bash
# Build all packages
pnpm build

# Build in watch mode during development
pnpm dev
```

### 4. Run Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### 5. Verify Setup

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Format code
pnpm format
```

---

## Project Structure

ADO is a **pnpm monorepo** with 7 packages:

```
ado/
├── packages/
│   ├── core/           # Orchestration engine (~21K LoC)
│   ├── cli/            # CLI application
│   ├── adapters/       # Agent adapters (Claude, Gemini, etc.)
│   ├── shared/         # Shared types and utilities
│   ├── dashboard/      # React web dashboard
│   ├── api/            # tRPC API server
│   └── mcp-server/     # MCP server
├── deploy/             # K8s manifests, Helm charts
├── spec/               # Technical specification (67 docs)
├── docs/               # User documentation
├── .github/            # GitHub workflows, templates
└── [config files]
```

### Package Dependencies

```
shared ← core ← cli
shared ← adapters ← cli
shared ← api
shared ← dashboard
shared ← mcp-server
```

**Rule**: Never create circular dependencies between packages.

---

## Coding Standards

### TypeScript

- **Strict mode** enabled (`exactOptionalPropertyTypes: true`)
- **No `any` types** unless absolutely necessary
- **Explicit types** for function parameters and return values
- Use `| undefined` for optional properties (not just `?`)

```typescript
// ❌ Wrong
interface Config {
  timeout?: number;  // Implicit undefined
}

// ✅ Correct
interface Config {
  timeout: number | undefined;  // Explicit undefined
}
```

### Code Style

We use **Biome** for linting and formatting (not ESLint or Prettier).

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

**Configuration**: `biome.json`

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Functions**: `camelCase()`
- **Classes**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Unused parameters**: Prefix with `_` (e.g., `_unusedParam`)

### Import Conventions

- Use `.js` extensions for relative imports (required for ESM)
- Never use barrel exports that could cause circular dependencies
- Group imports: external → internal → relative

```typescript
// External dependencies
import { z } from "zod";
import type { Express } from "express";

// Internal packages
import { type Task } from "@dxheroes/ado-shared";

// Relative imports (with .js extension)
import { executeTask } from "./executor.js";
import type { Config } from "../types.js";
```

### Error Handling

- Use `Result<T, E>` types or explicit error returns
- Never throw errors in async functions without try/catch
- Provide meaningful error messages with context

```typescript
// ✅ Good
async function loadConfig(): Promise<Result<Config, ConfigError>> {
  try {
    const data = await fs.readFile("config.yaml", "utf-8");
    const config = parseYaml(data);
    return { success: true, value: config };
  } catch (error) {
    return {
      success: false,
      error: new ConfigError("Failed to load config", { cause: error }),
    };
  }
}

// ❌ Bad
async function loadConfig(): Promise<Config> {
  const data = await fs.readFile("config.yaml", "utf-8");  // Can throw!
  return parseYaml(data);
}
```

### Documentation

- **JSDoc** for all public APIs
- **Code comments** for complex logic only
- **README.md** in each package

```typescript
/**
 * Executes a task using the specified provider.
 *
 * @param task - Task to execute
 * @param provider - Provider adapter to use
 * @returns Task execution result with status and output
 *
 * @example
 * ```typescript
 * const result = await executeTask(task, claudeAdapter);
 * if (result.status === "completed") {
 *   console.log(result.output);
 * }
 * ```
 */
export async function executeTask(
  task: Task,
  provider: AgentAdapter,
): Promise<TaskResult> {
  // Implementation
}
```

---

## Testing

### Test Structure

We use **Vitest** for all tests.

```
packages/core/src/
├── provider/
│   ├── registry.ts
│   └── __tests__/
│       ├── registry.test.ts
│       └── router.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../registry.js";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("should register a provider", () => {
    registry.register({
      id: "claude-code",
      adapter: claudeAdapter,
    });

    expect(registry.has("claude-code")).toBe(true);
  });

  it("should throw error for duplicate provider", () => {
    registry.register({ id: "claude-code", adapter: claudeAdapter });

    expect(() => {
      registry.register({ id: "claude-code", adapter: anotherAdapter });
    }).toThrow("Provider already registered: claude-code");
  });
});
```

### Test Coverage

- **Minimum coverage**: 80% for new code
- **Focus areas**: Core business logic, API endpoints, adapters
- **Integration tests**: For complex workflows

```bash
# Run tests with coverage
pnpm test:coverage

# View coverage report
open coverage/index.html
```

---

## Submitting Changes

### 1. Create a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-123
```

### 2. Make Changes

- Write code following [coding standards](#coding-standards)
- Add tests for new functionality
- Update documentation as needed
- Run `pnpm build` to verify no type errors

### 3. Commit Changes

We use **Conventional Commits**:

```bash
# Format: <type>(<scope>): <description>
#
# Types: feat, fix, docs, style, refactor, test, chore
# Scope: package name (core, cli, adapters, etc.)

git commit -m "feat(core): add support for custom provider adapters"
git commit -m "fix(cli): resolve config validation error"
git commit -m "docs(adapters): add Gemini CLI setup guide"
```

### 4. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create Pull Request on GitHub
# Fill out the PR template completely
```

### 5. PR Requirements

- [ ] All tests pass (`pnpm test`)
- [ ] No type errors (`pnpm typecheck`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Code coverage ≥80% for new code
- [ ] Documentation updated
- [ ] Conventional commit messages
- [ ] PR description explains changes and motivation
- [ ] Related issues linked (e.g., "Closes #123")

### 6. Code Review

- Respond to review comments promptly
- Make requested changes in new commits (don't force push)
- Mark conversations as resolved after addressing
- Request re-review when ready

### 7. Merge

Once approved:
- Maintainer will squash and merge your PR
- Your contribution will be included in the next release
- You'll be added to contributors list

---

## Documentation

### User Documentation

Located in `/docs`:

- **Installation**: `docs/installation.md`
- **Configuration**: `docs/configuration.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING.md`

### Technical Specification

Located in `/spec`:

- **Architecture**: `spec/03-architecture/`
- **API Reference**: `spec/05-api/`
- **Design Docs**: `spec/04-design/`

### Package Documentation

Each package has a `README.md` with:
- Package purpose and features
- Installation instructions
- API reference
- Usage examples

### Documentation Standards

- Use **Markdown** for all documentation
- Include **code examples** for complex features
- Keep **line length ≤100 characters**
- Use **relative links** for cross-references
- Test all code examples

---

## Release Process

Releases are managed by maintainers using **Changesets**.

### 1. Create Changeset

When making a significant change, create a changeset:

```bash
# Create changeset
pnpm changeset

# Select packages affected
# Choose version bump type (major, minor, patch)
# Write changelog entry
```

### 2. Changeset File

This creates `.changeset/random-name.md`:

```markdown
---
"@dxheroes/ado-core": minor
"@dxheroes/ado-cli": minor
---

Add support for custom provider adapters. Users can now create their own adapters by implementing the AgentAdapter interface.
```

### 3. Version Bump

Maintainers will:

```bash
# Update versions
pnpm changeset version

# Commit
git commit -am "chore: version packages"

# Publish
pnpm changeset publish
```

---

## Development Workflow

### Daily Development

```bash
# 1. Start fresh
git checkout main
git pull upstream main

# 2. Create branch
git checkout -b feature/my-feature

# 3. Develop in watch mode
pnpm dev

# 4. Run tests
pnpm test:watch

# 5. Commit and push
git add .
git commit -m "feat(core): add feature X"
git push origin feature/my-feature

# 6. Create PR
```

### Working on Multiple Packages

```bash
# Build specific package
pnpm --filter @dxheroes/ado-core build

# Run tests for specific package
pnpm --filter @dxheroes/ado-cli test

# Dev mode for specific package
pnpm --filter @dxheroes/ado-core dev
```

### Debugging

```bash
# Debug CLI
node --inspect-brk packages/cli/dist/index.js run "test"

# Debug tests
pnpm test --inspect-brk --no-coverage

# Enable debug logs
DEBUG=ado:* pnpm dev
```

---

## Getting Help

### Questions?

- [GitHub Discussions](https://github.com/dxheroes/ado/discussions)
- [Discord Server](https://discord.gg/dxheroes)
- Tag `@dxheroes/maintainers` in issues

### Stuck?

- Check [Development Setup](#development-setup)
- Review [Coding Standards](#coding-standards)
- Look at existing code for examples
- Ask in Discussions or Discord

---

## Recognition

Contributors are recognized in:
- [README.md](./README.md#contributors)
- Release notes
- [CHANGELOG.md](./spec/CHANGELOG.md)

Thank you for contributing to ADO! 🎉
