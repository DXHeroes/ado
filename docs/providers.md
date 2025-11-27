# Provider Setup Guide

Complete guide for setting up and configuring AI coding agent providers.

## Supported Providers

| Provider | Subscription Plans | API Access | Context File | Resume Support |
|----------|-------------------|------------|--------------|----------------|
| Claude Code | Free, Pro, MAX | Anthropic API | CLAUDE.md | ✅ |
| Gemini CLI | Free, Advanced | Google AI API | GEMINI.md | ❌ |
| Cursor CLI | Pro | N/A | .cursorrules | ✅ |
| GitHub Copilot | Individual, Business | N/A | .github/copilot-instructions.md | ✅ |
| Codex CLI | Pro | N/A | AGENTS.md | ✅ |

## Claude Code Setup

### Installation

```bash
npm install -g @anthropic-ai/claude-code
```

### Authentication

```bash
# Login with subscription
claude login

# Verify authentication
claude whoami
```

### Configuration

```yaml
providers:
  claude-code:
    enabled: true
    contextFile: "CLAUDE.md"

    accessModes:
      # Subscription access
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"                      # free, pro, max
          rateLimits:
            requestsPerDay: 500            # MAX plan limit
            tokensPerDay: 5000000

      # API fallback
      - mode: api
        priority: 10
        enabled: true
        api:
          apiKey: ${ANTHROPIC_API_KEY}
          rateLimits:
            requestsPerMinute: 50
            tokensPerMinute: 100000
          costPerMillion:
            input: 3.00
            output: 15.00

    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "rust", "java"]
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
```

### Rate Limits

**Claude MAX Plan:**
- ~500 requests/day
- ~5M tokens/day
- Resets at midnight UTC

**API Tier 1:**
- 50 requests/minute
- 100k tokens/minute

## Gemini CLI Setup

### Installation

```bash
npm install -g @google/gemini-cli
```

### Authentication

```bash
gemini auth
```

### Configuration

```yaml
providers:
  gemini-cli:
    enabled: true
    contextFile: "GEMINI.md"

    accessModes:
      - mode: subscription
        priority: 2
        enabled: true
        subscription:
          plan: "advanced"
          rateLimits:
            requestsPerDay: 1000

      - mode: api
        priority: 11
        enabled: true
        api:
          apiKey: ${GOOGLE_API_KEY}
          rateLimits:
            requestsPerMinute: 60
            tokensPerMinute: 120000
          costPerMillion:
            input: 1.25
            output: 5.00

    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "java", "kotlin"]
      maxContextTokens: 1000000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: false
```

## Cursor CLI Setup

### Installation

Cursor CLI is included with Cursor IDE installation.

Download from: https://cursor.sh

### Configuration

```yaml
providers:
  cursor-cli:
    enabled: true
    contextFile: ".cursorrules"

    accessModes:
      - mode: subscription
        priority: 3
        enabled: true
        subscription:
          plan: "pro"
          rateLimits:
            requestsPerDay: 500

    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: false
      documentation: false
      debugging: true
      languages: ["typescript", "python", "javascript"]
      maxContextTokens: 128000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
```

## GitHub Copilot CLI Setup

### Installation

```bash
npm install -g @githubnext/github-copilot-cli
```

### Authentication

```bash
github-copilot-cli auth
```

### Configuration

```yaml
providers:
  copilot-cli:
    enabled: true
    contextFile: ".github/copilot-instructions.md"

    accessModes:
      - mode: subscription
        priority: 4
        enabled: true
        subscription:
          plan: "individual"              # individual, business, enterprise
          rateLimits:
            requestsPerDay: 300

    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: false
      languages: ["typescript", "python", "go", "java", "c#"]
      maxContextTokens: 64000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
```

## Context Files

Context files provide project-specific information to AI agents.

### CLAUDE.md Template

```markdown
# Project Context for Claude Code

## Project Overview
- Name: My Project
- Type: Web Application
- Primary Language: TypeScript

## Coding Standards
- Use TypeScript strict mode
- Follow Biome formatting
- Write tests for all new functions

## Architecture
- Monorepo structure with pnpm workspaces
- Packages: core, cli, adapters

## Current Focus
Working on implementing user authentication
```

### GEMINI.md Template

```markdown
# Gemini Context

## Project
My Project - A web application for task management

## Guidelines
- Prefer functional programming patterns
- Use descriptive variable names
- Keep functions under 50 lines

## Restrictions
- Do not modify files in /vendor
- Do not commit directly to main
```

## Managing Providers

### Enable/Disable Providers

```bash
# Interactive configuration
ado config providers

# Via config file
providers:
  claude-code:
    enabled: false    # Disable provider
```

### Check Provider Status

```bash
ado status

# Example output:
# Providers:
#   ✓ claude-code (subscription: 250/500 requests)
#   ✓ gemini-cli (subscription: 120/1000 requests)
#   ✗ cursor-cli (not authenticated)
```

### Override Provider for Single Task

```bash
# Use specific provider
ado run "task" --provider claude-code

# Exclude providers
ado run "task" --exclude-providers aider,codex

# Use only enabled providers
ado run "task"
```

## Rate Limit Management

ADO automatically tracks and respects rate limits:

1. **Subscription Limits** - Tracked locally in SQLite
2. **API Limits** - Detected from provider responses
3. **Failover** - Automatic switch to next provider

### View Rate Limit Status

```bash
ado status --providers

# Shows current usage and remaining capacity
```

### Reset Rate Limit Tracking

```bash
# Clear local rate limit data
ado config reset-limits
```

## Cost Optimization

### Subscription-First Strategy

ADO prioritizes subscriptions by access mode priority:

```yaml
accessModes:
  - mode: subscription
    priority: 1       # Try first
  - mode: api
    priority: 10      # Fallback
```

### Cost Tracking

```bash
# View today's costs
ado report --costs --period today

# View monthly costs
ado report --costs --period month
```

## Troubleshooting

### Provider Not Available

```bash
# Check if CLI is installed
claude --version

# Check authentication
claude whoami

# Verify config
ado config show providers.claude-code
```

### Rate Limit Issues

```bash
# Check current status
ado status --providers

# Reset rate limit tracking
ado config reset-limits

# Force API mode
ado run "task" --access-mode api --provider claude-code
```

### Context File Not Found

```bash
# Create default context files
ado init --context-files-only

# Specify custom context file
ado config set providers.claude-code.contextFile "custom-context.md"
```

## Next Steps

- [Configuration Reference](./configuration.md)
- [Notifications Setup](./notifications.md)
- [Deployment Guide](./deployment.md)
