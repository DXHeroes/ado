# Project Context for Gemini CLI

## Project Overview

**Agentic Development Orchestrator (ADO)** is a TypeScript CLI tool that orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex) behind a unified interface.

## Technology Stack

- **Language**: TypeScript 5.x with strict mode
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm 9.x (use `pnpm` not `npm`)
- **Bundler**: tsup (esbuild-based)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Testing**: Vitest

## Coding Standards

1. **Use Biome** for linting and formatting (not ESLint)
2. **Strict TypeScript** - no `any` types unless absolutely necessary
3. **Functional patterns** - prefer pure functions, minimize classes
4. **Error handling** - use Result types or explicit error returns
5. **Documentation** - JSDoc for public APIs
6. **Testing** - unit tests for core logic, integration tests for adapters

## Project Structure

```
ado/
├── packages/
│   ├── core/           # Orchestrator, router, state management
│   ├── cli/            # CLI application
│   ├── adapters/       # Agent adapters (claude, gemini, cursor, etc.)
│   ├── shared/         # Shared types and utilities
│   ├── api/            # REST API server
│   ├── dashboard/      # Web dashboard
│   └── mcp-server/     # MCP server
├── ado.config.yaml     # Example configuration
└── pnpm-workspace.yaml
```

## Important Notes

- **Never use npm** - always use pnpm
- **Never use ESLint** - use Biome
- **Focus on DevEx** - CLI should be fast (<500ms startup), beautiful output
- **Subscription-first** - always check subscription limits before API fallback

## Guidelines

- Prefer functional programming patterns
- Use descriptive variable names
- Keep functions under 50 lines
- Write clear, concise comments for complex logic
- Always handle errors explicitly

## Restrictions

- Do not modify files in /node_modules
- Do not commit directly to main
- Always run tests before committing
- Follow the existing code style
