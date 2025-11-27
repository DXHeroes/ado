# Installation Guide

Complete guide for installing and setting up ADO.

## System Requirements

- **Node.js**: 22.0.0 or higher
- **pnpm**: 9.0.0 or higher
- **Operating System**: macOS, Linux, or Windows (WSL2)
- **Memory**: 2GB minimum
- **Disk Space**: 500MB for installation

## Global Installation

### Using pnpm (Recommended)

```bash
pnpm install -g @dxheroes/ado
```

### Using npm

```bash
npm install -g @dxheroes/ado
```

### Using npx (No Install)

```bash
npx @dxheroes/ado init
```

## Verify Installation

```bash
ado --version
ado --help
```

## Install AI Coding Agents

ADO requires at least one AI coding agent installed:

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Set up authentication:
```bash
claude login
```

### Gemini CLI

```bash
npm install -g @google/gemini-cli
```

Authenticate:
```bash
gemini auth
```

### Cursor CLI

```bash
# Install Cursor IDE from https://cursor.sh
# CLI is included with Cursor installation
cursor --version
```

### GitHub Copilot CLI

```bash
npm install -g @githubnext/github-copilot-cli
```

Authenticate:
```bash
github-copilot-cli auth
```

## Initialize ADO in Your Project

```bash
cd your-project
ado init
```

This creates:
- `ado.config.yaml` - Main configuration file
- `CLAUDE.md` - Context file for Claude Code
- `.ado/` - State directory
- `.ado/state.db` - SQLite database

## Configuration

Edit `ado.config.yaml` to configure providers and routing:

```yaml
version: "1.1"

project:
  id: "my-project"

providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
```

See [Configuration Reference](./configuration.md) for complete options.

## Environment Variables

Create a `.env` file or set environment variables:

```bash
# API Keys (if using API access modes)
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="..."
export OPENAI_API_KEY="sk-..."

# Notification Services
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# Telemetry
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

## Verify Setup

```bash
# Check provider status
ado status

# Run a test task
ado run "List all files in the current directory"
```

## Troubleshooting

### Command Not Found

If `ado` command is not found after installation:

```bash
# Check npm global bin path
npm config get prefix

# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:$(npm config get prefix)/bin"
```

### Permission Errors

```bash
# Fix npm permissions (Unix/macOS)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```

### Provider Not Available

If a provider shows as unavailable:

1. Verify the CLI is installed: `claude --version`
2. Check authentication: `claude login`
3. Enable in config: `enabled: true` in `ado.config.yaml`

## Upgrading

```bash
# Global installation
pnpm update -g @dxheroes/ado

# Or with npm
npm update -g @dxheroes/ado
```

## Uninstallation

```bash
# Remove global package
pnpm remove -g @dxheroes/ado

# Remove project files
rm -rf .ado ado.config.yaml CLAUDE.md
```

## Next Steps

- [Configuration Reference](./configuration.md)
- [Provider Setup](./providers.md)
- [Quick Start Tutorial](../README.md#quick-start)
