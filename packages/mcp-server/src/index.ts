#!/usr/bin/env node
/**
 * ADO MCP Server
 *
 * Model Context Protocol server that exposes ADO capabilities as tools
 * for AI assistants like Claude, GPT, and others.
 *
 * This server provides:
 * - Task execution tools (run, cancel, get status)
 * - Provider management tools (list, enable/disable)
 * - Configuration and usage resources
 *
 * @module mcp-server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createResources, handleResourceRead } from './resources.js';
import { createTools, handleToolCall } from './tools.js';

/**
 * Create and start the ADO MCP server
 *
 * This function:
 * 1. Creates an MCP Server instance
 * 2. Registers request handlers for tools and resources
 * 3. Connects to stdio transport for communication
 * 4. Starts listening for requests
 *
 * @throws {Error} If server initialization or startup fails
 */
async function main(): Promise<void> {
	try {
		const server = new Server(
			{
				name: 'ado-orchestrator',
				version: '0.1.0',
			},
			{
				capabilities: {
					tools: {},
					resources: {},
				},
			},
		);

		// Handle list tools request
		server.setRequestHandler(ListToolsRequestSchema, async () => {
			try {
				return { tools: createTools() };
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error('Error listing tools:', error);
				throw error;
			}
		});

		// Handle tool calls
		server.setRequestHandler(CallToolRequestSchema, async (request) => {
			try {
				return await handleToolCall(request.params.name, request.params.arguments ?? {});
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error('Error handling tool call:', error);
				throw error;
			}
		});

		// Handle list resources request
		server.setRequestHandler(ListResourcesRequestSchema, async () => {
			try {
				return { resources: createResources() };
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error('Error listing resources:', error);
				throw error;
			}
		});

		// Handle resource reads
		server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
			try {
				return await handleResourceRead(request.params.uri);
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error('Error reading resource:', error);
				throw error;
			}
		});

		// Start the server
		const transport = new StdioServerTransport();
		await server.connect(transport);

		// biome-ignore lint/suspicious/noConsole: Startup message
		console.error('ADO MCP Server started successfully');
		// biome-ignore lint/suspicious/noConsole: Startup message
		console.error('Server name: ado-orchestrator');
		// biome-ignore lint/suspicious/noConsole: Startup message
		console.error('Server version: 0.1.0');
		// biome-ignore lint/suspicious/noConsole: Startup message
		console.error('Communication: stdio');
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: Error output
		console.error('Failed to start MCP server:', error);
		throw error;
	}
}

// Run the server
main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: Error output
	console.error('Fatal error in MCP server:', error);
	if (error instanceof Error && error.stack) {
		// biome-ignore lint/suspicious/noConsole: Error output
		console.error('Stack trace:', error.stack);
	}
	process.exit(1);
});
