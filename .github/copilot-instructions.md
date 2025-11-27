# GitHub Copilot Instructions for ADO

## Project Overview

The **Agentic Development Orchestrator (ADO)** is a TypeScript-based platform for orchestrating multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex).

## Technology Choices

- **Language**: TypeScript 5.x with strict mode enabled
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm 9.x (**never use npm or yarn**)
- **Build Tool**: tsup (esbuild-based bundler)
- **Code Quality**: Biome (**not ESLint or Prettier**)
- **Testing**: Vitest
- **CLI Framework**: Commander.js + @clack/prompts

## Coding Guidelines

### TypeScript

- Enable strict mode for all files
- Avoid `any` types - use `unknown` if type is truly unknown
- Prefer type inference where possible
- Use interfaces for public APIs
- Use type aliases for complex unions

### Code Style

- Use functional patterns over classes where possible
- Keep functions small (< 50 lines)
- Prefer pure functions
- Use explicit error handling with custom `AdoError` class
- Add JSDoc comments for all public APIs

### Error Handling

```typescript
import { AdoError } from '@dxheroes/ado-shared';

throw new AdoError({
  code: 'ERROR_CODE',
  message: 'User-friendly message',
  recoverable: boolean,
  remediation: 'How to fix this',
  cause: originalError,
});
```

### Imports

- Use explicit file extensions (.js) in imports (required for ES modules)
- Prefer named exports over default exports
- Group imports: external, internal, types

## Architecture

### Monorepo Structure

```
packages/
├── core/        - Orchestrator, router, state, rate limits
├── cli/         - CLI commands (run, status, config, workflow, report)
├── adapters/    - Agent adapters (claude-code, gemini, cursor, copilot, codex)
├── shared/      - Shared types, utilities, logger
├── api/         - REST API server (Hono)
├── dashboard/   - React web dashboard
└── mcp-server/  - MCP protocol server
```

### Key Components

1. **Provider Registry** - Manages provider configs and selection
2. **Provider Router** - Subscription-first routing with cost confirmation
3. **Rate Limit Tracker** - Tracks usage limits
4. **Cost Tracker** - API cost tracking and reporting
5. **Agent Adapters** - CLI wrappers for each AI agent
6. **State Store** - SQLite/PostgreSQL persistence
7. **HITL Controller** - Human-in-the-loop approval system
8. **Workflow Engine** - YAML-based task workflows

## Commands to Remember

```bash
# Package management
pnpm install              # Install dependencies
pnpm build               # Build all packages
pnpm test                # Run tests
pnpm lint                # Run Biome
pnpm typecheck           # TypeScript check

# CLI usage
ado init                 # Initialize config
ado run <prompt>         # Execute task
ado status               # Show status
ado config providers     # Configure providers
ado workflow run <file>  # Run workflow
ado report --costs       # Cost report
```

## Do Not

- Use npm or yarn (always use pnpm)
- Use ESLint or Prettier (use Biome)
- Add `any` types without justification
- Modify files in /node_modules
- Commit directly to main branch
- Add unnecessary dependencies

## Key Features to Remember

1. **Subscription-First Routing** - Maximize value from existing subscriptions before using API billing
2. **Fast CLI** - Target startup time < 500ms
3. **Beautiful UX** - Use @clack/prompts for interactive prompts
4. **Cost Awareness** - Always confirm before expensive API calls
5. **Graceful Degradation** - Handle provider failures gracefully

## Testing

- Write unit tests for core logic
- Write integration tests for adapters
- Use Vitest as test framework
- Aim for >80% coverage on critical paths

## Performance

- CLI startup must be < 500ms
- Task submission latency < 100ms
- Use streaming for long-running tasks
- Implement proper cleanup on shutdown

## When Suggesting Code

- Follow existing patterns in the codebase
- Use Biome's formatting rules
- Include proper error handling
- Add JSDoc comments for public functions
- Consider edge cases and error states
- Suggest tests alongside implementation
