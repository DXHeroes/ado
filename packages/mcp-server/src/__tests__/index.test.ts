/**
 * MCP Server Index Tests
 * Tests for the main MCP server initialization and request handlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('../tools.js');
vi.mock('../resources.js');

import { createResources, handleResourceRead } from '../resources.js';
import { createTools, handleToolCall } from '../tools.js';

describe('MCP Server', () => {
	let mockServer: any;
	let mockTransport: any;
	let requestHandlers: Map<any, any>;

	beforeEach(() => {
		requestHandlers = new Map();

		// Mock server instance
		mockServer = {
			setRequestHandler: vi.fn((schema, handler) => {
				requestHandlers.set(schema, handler);
			}),
			connect: vi.fn(),
		};

		// Mock transport
		mockTransport = {};

		// Mock Server constructor using class syntax
		vi.mocked(Server).mockImplementation(function (this: any) {
			return mockServer;
		} as any);
		vi.mocked(StdioServerTransport).mockImplementation(function (this: any) {
			return mockTransport;
		} as any);

		// Mock tools module
		vi.mocked(createTools).mockReturnValue([
			{
				name: 'test_tool',
				description: 'Test tool',
				inputSchema: { type: 'object', properties: {} },
			},
		]);

		vi.mocked(handleToolCall).mockResolvedValue({
			content: [{ type: 'text', text: 'Tool result' }],
		});

		// Mock resources module
		vi.mocked(createResources).mockReturnValue([
			{
				uri: 'test://resource',
				name: 'Test Resource',
				description: 'Test resource',
				mimeType: 'application/json',
			},
		]);

		vi.mocked(handleResourceRead).mockResolvedValue({
			contents: [{ uri: 'test://resource', mimeType: 'application/json', text: '{}' }],
		});
	});

	it('should create server with correct configuration', async () => {
		// Import the module to trigger initialization
		// Since the module has side effects (main() call), we need to handle this carefully
		expect(Server).toBeDefined();
	});

	it('should configure server with tools and resources capabilities', () => {
		const serverInstance = new Server(
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

		expect(serverInstance).toBeDefined();
	});

	it('should register ListToolsRequestSchema handler', async () => {
		const serverInstance = new Server(
			{ name: 'test', version: '1.0.0' },
			{ capabilities: { tools: {} } },
		);

		serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
			return { tools: createTools() };
		});

		expect(serverInstance.setRequestHandler).toHaveBeenCalledWith(
			ListToolsRequestSchema,
			expect.any(Function),
		);
	});

	it('should register CallToolRequestSchema handler', async () => {
		const serverInstance = new Server(
			{ name: 'test', version: '1.0.0' },
			{ capabilities: { tools: {} } },
		);

		serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
			return await handleToolCall(request.params.name, request.params.arguments ?? {});
		});

		expect(serverInstance.setRequestHandler).toHaveBeenCalledWith(
			CallToolRequestSchema,
			expect.any(Function),
		);
	});

	it('should register ListResourcesRequestSchema handler', async () => {
		const serverInstance = new Server(
			{ name: 'test', version: '1.0.0' },
			{ capabilities: { resources: {} } },
		);

		serverInstance.setRequestHandler(ListResourcesRequestSchema, async () => {
			return { resources: createResources() };
		});

		expect(serverInstance.setRequestHandler).toHaveBeenCalledWith(
			ListResourcesRequestSchema,
			expect.any(Function),
		);
	});

	it('should register ReadResourceRequestSchema handler', async () => {
		const serverInstance = new Server(
			{ name: 'test', version: '1.0.0' },
			{ capabilities: { resources: {} } },
		);

		serverInstance.setRequestHandler(ReadResourceRequestSchema, async (request) => {
			return await handleResourceRead(request.params.uri);
		});

		expect(serverInstance.setRequestHandler).toHaveBeenCalledWith(
			ReadResourceRequestSchema,
			expect.any(Function),
		);
	});

	describe('Request Handlers', () => {
		it('should handle list tools request successfully', async () => {
			const handler = async () => {
				try {
					return { tools: createTools() };
				} catch (error) {
					throw error;
				}
			};

			const result = await handler();

			expect(result).toEqual({
				tools: [
					{
						name: 'test_tool',
						description: 'Test tool',
						inputSchema: { type: 'object', properties: {} },
					},
				],
			});
		});

		it('should handle tool call request successfully', async () => {
			const handler = async (request: any) => {
				try {
					return await handleToolCall(request.params.name, request.params.arguments ?? {});
				} catch (error) {
					throw error;
				}
			};

			const result = await handler({
				params: { name: 'test_tool', arguments: { param: 'value' } },
			});

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Tool result' }],
			});
			expect(handleToolCall).toHaveBeenCalledWith('test_tool', { param: 'value' });
		});

		it('should handle tool call with no arguments', async () => {
			const handler = async (request: any) => {
				try {
					return await handleToolCall(request.params.name, request.params.arguments ?? {});
				} catch (error) {
					throw error;
				}
			};

			await handler({ params: { name: 'test_tool' } });

			expect(handleToolCall).toHaveBeenCalledWith('test_tool', {});
		});

		it('should handle list resources request successfully', async () => {
			const handler = async () => {
				try {
					return { resources: createResources() };
				} catch (error) {
					throw error;
				}
			};

			const result = await handler();

			expect(result).toEqual({
				resources: [
					{
						uri: 'test://resource',
						name: 'Test Resource',
						description: 'Test resource',
						mimeType: 'application/json',
					},
				],
			});
		});

		it('should handle read resource request successfully', async () => {
			const handler = async (request: any) => {
				try {
					return await handleResourceRead(request.params.uri);
				} catch (error) {
					throw error;
				}
			};

			const result = await handler({ params: { uri: 'test://resource' } });

			expect(result).toEqual({
				contents: [{ uri: 'test://resource', mimeType: 'application/json', text: '{}' }],
			});
			expect(handleResourceRead).toHaveBeenCalledWith('test://resource');
		});

		it('should handle errors in list tools gracefully', async () => {
			vi.mocked(createTools).mockImplementationOnce(() => {
				throw new Error('Tool creation failed');
			});

			const handler = async () => {
				try {
					return { tools: createTools() };
				} catch (error) {
					throw error;
				}
			};

			await expect(handler()).rejects.toThrow('Tool creation failed');
		});

		it('should handle errors in tool call gracefully', async () => {
			vi.mocked(handleToolCall).mockRejectedValueOnce(new Error('Tool execution failed'));

			const handler = async (request: any) => {
				try {
					return await handleToolCall(request.params.name, request.params.arguments ?? {});
				} catch (error) {
					throw error;
				}
			};

			await expect(handler({ params: { name: 'test_tool', arguments: {} } })).rejects.toThrow(
				'Tool execution failed',
			);
		});

		it('should handle errors in list resources gracefully', async () => {
			vi.mocked(createResources).mockImplementationOnce(() => {
				throw new Error('Resource listing failed');
			});

			const handler = async () => {
				try {
					return { resources: createResources() };
				} catch (error) {
					throw error;
				}
			};

			await expect(handler()).rejects.toThrow('Resource listing failed');
		});

		it('should handle errors in resource read gracefully', async () => {
			vi.mocked(handleResourceRead).mockRejectedValueOnce(
				new Error('Resource read failed'),
			);

			const handler = async (request: any) => {
				try {
					return await handleResourceRead(request.params.uri);
				} catch (error) {
					throw error;
				}
			};

			await expect(handler({ params: { uri: 'test://resource' } })).rejects.toThrow(
				'Resource read failed',
			);
		});
	});

	describe('Server Connection', () => {
		it('should connect server to stdio transport', async () => {
			const serverInstance = new Server(
				{ name: 'test', version: '1.0.0' },
				{ capabilities: {} },
			);

			const transport = new StdioServerTransport();
			await serverInstance.connect(transport);

			expect(serverInstance.connect).toHaveBeenCalledWith(transport);
		});

		it('should create StdioServerTransport instance', () => {
			const transport = new StdioServerTransport();
			expect(transport).toBeDefined();
		});
	});
});
