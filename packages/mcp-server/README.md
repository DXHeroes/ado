# ADO MCP Server

Model Context Protocol (MCP) server for the Agentic Development Orchestrator.

## Overview

This MCP server exposes ADO capabilities as tools and resources that can be used by AI assistants like Claude, GPT, and others through the Model Context Protocol.

## Features

### Tools

- **ado_run_task** - Execute a development task using ADO
- **ado_status** - Get orchestrator status
- **ado_list_providers** - List available AI coding agents
- **ado_list_tasks** - List recent tasks
- **ado_get_task** - Get task details
- **ado_cancel_task** - Cancel a running task
- **ado_enable_provider** - Enable/disable providers

### Resources

- **ado://config** - Current ADO configuration
- **ado://providers** - Provider status and availability
- **ado://usage** - Usage statistics and rate limits

## Installation

```bash
# Install globally
pnpm add -g @dxheroes/ado-mcp-server

# Or run from the monorepo
pnpm --filter @dxheroes/ado-mcp-server start
```

## Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ado": {
      "command": "ado-mcp",
      "args": []
    }
  }
}
```

### Generic MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'ado-mcp',
  args: [],
});

const client = new Client({ name: 'my-client', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Execute a task
const result = await client.callTool({
  name: 'ado_run_task',
  arguments: {
    prompt: 'Implement a new feature',
  },
});
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck
```

## License

MIT

