/**
 * ADO MCP Tools
 *
 * Defines the tools that the MCP server exposes to AI assistants.
 * Tools provide executable actions like running tasks, canceling tasks,
 * and managing providers.
 *
 * @module tools
 */

import type { OrchestratorCore, TaskDefinition } from '@dxheroes/ado-core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Shared orchestrator instance used by all tool handlers
 * @private
 */
let orchestratorInstance: OrchestratorCore | null = null;

/**
 * Initialize the tools module with an orchestrator instance.
 * This must be called before any tools can be executed.
 *
 * @param orchestrator - The orchestrator core instance to use for tool execution
 * @public
 */
export function initializeTools(orchestrator: OrchestratorCore): void {
	orchestratorInstance = orchestrator;
}

/**
 * Create the list of available MCP tools.
 * Returns tool definitions that describe the available operations,
 * their parameters, and descriptions for AI assistants.
 *
 * @returns Array of tool definitions compatible with the MCP protocol
 * @public
 */
export function createTools(): Tool[] {
	return [
		{
			name: 'ado_run_task',
			description:
				'Execute a development task using the ADO orchestrator. The task will be routed to the most appropriate AI coding agent based on capabilities and availability.',
			inputSchema: {
				type: 'object',
				properties: {
					prompt: {
						type: 'string',
						description: 'The task prompt describing what needs to be done',
					},
					provider: {
						type: 'string',
						description:
							'Optional: Specific provider to use (claude-code, gemini-cli, cursor-cli, copilot-cli, codex-cli)',
					},
					workingDirectory: {
						type: 'string',
						description: 'Optional: Working directory for the task',
					},
				},
				required: ['prompt'],
			},
		},
		{
			name: 'ado_status',
			description:
				'Get the current status of the ADO orchestrator, including active tasks and provider availability.',
			inputSchema: {
				type: 'object',
				properties: {},
			},
		},
		{
			name: 'ado_list_providers',
			description: 'List all available AI coding agents/providers and their current status.',
			inputSchema: {
				type: 'object',
				properties: {},
			},
		},
		{
			name: 'ado_list_tasks',
			description: 'List recent tasks executed by ADO.',
			inputSchema: {
				type: 'object',
				properties: {
					limit: {
						type: 'number',
						description: 'Maximum number of tasks to return (default: 10)',
					},
					status: {
						type: 'string',
						description: 'Filter by status: running, completed, failed, pending',
					},
				},
			},
		},
		{
			name: 'ado_get_task',
			description: 'Get detailed information about a specific task.',
			inputSchema: {
				type: 'object',
				properties: {
					taskId: {
						type: 'string',
						description: 'The ID of the task to retrieve',
					},
				},
				required: ['taskId'],
			},
		},
		{
			name: 'ado_cancel_task',
			description: 'Cancel a running task.',
			inputSchema: {
				type: 'object',
				properties: {
					taskId: {
						type: 'string',
						description: 'The ID of the task to cancel',
					},
				},
				required: ['taskId'],
			},
		},
		{
			name: 'ado_enable_provider',
			description: 'Enable or disable a specific AI coding agent/provider.',
			inputSchema: {
				type: 'object',
				properties: {
					providerId: {
						type: 'string',
						description: 'The ID of the provider (claude-code, gemini-cli, etc.)',
					},
					enabled: {
						type: 'boolean',
						description: 'Whether to enable (true) or disable (false) the provider',
					},
				},
				required: ['providerId', 'enabled'],
			},
		},
	];
}

/**
 * Handle a tool call from an AI assistant.
 *
 * Routes the tool call to the appropriate handler function based on the tool name.
 * All errors are caught and returned as structured error responses.
 *
 * @param name - The name of the tool to execute
 * @param args - Arguments passed to the tool as key-value pairs
 * @returns Promise resolving to MCP-compatible response with text content
 * @throws Never throws - all errors are converted to error responses
 * @public
 */
export async function handleToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	try {
		switch (name) {
			case 'ado_run_task':
				return await runTask(args);
			case 'ado_status':
				return await getStatus();
			case 'ado_list_providers':
				return await listProviders();
			case 'ado_list_tasks':
				return await listTasks(args);
			case 'ado_get_task':
				return await getTask(args);
			case 'ado_cancel_task':
				return await cancelTask(args);
			case 'ado_enable_provider':
				return await enableProvider(args);
			default:
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
						},
					],
				};
		}
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Tool execution failed',
							message: error instanceof Error ? error.message : String(error),
							tool: name,
						},
						null,
						2,
					),
				},
			],
		};
	}
}

// Tool implementations

/**
 * Run a development task using the ADO orchestrator
 */
async function runTask(
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	const prompt = args.prompt as string;
	const provider = args.provider as string | undefined;
	const workingDirectory = (args.workingDirectory as string | undefined) ?? process.cwd();

	if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ error: 'Invalid prompt', message: 'Prompt is required and must be non-empty' },
						null,
						2,
					),
				},
			],
		};
	}

	try {
		const taskDef: TaskDefinition = {
			prompt,
			projectKey: 'mcp-task',
			repositoryPath: workingDirectory,
			...(provider && { preferredProviders: [provider] }),
		};

		const handle = await orchestratorInstance.submit(taskDef);
		const taskStatus = await handle.getStatus();

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							status: 'submitted',
							taskId: handle.taskId,
							prompt,
							provider: provider ?? 'auto-routed',
							workingDirectory,
							message: 'Task submitted to ADO orchestrator',
							currentStatus: taskStatus.status,
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to submit task',
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * Get the current status of the ADO orchestrator
 */
async function getStatus(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	try {
		// Note: This is a simplified status. In a full implementation,
		// you'd want to expose methods on OrchestratorCore to get this data
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							status: 'running',
							message: 'ADO orchestrator is running',
							timestamp: new Date().toISOString(),
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to get status',
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * List all available AI coding agents/providers
 */
async function listProviders(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	try {
		const registry = orchestratorInstance.getRegistry();
		const providers = registry.getAll();

		const providerList = providers.map((p) => ({
			id: p.id,
			enabled: p.enabled,
			accessModes: p.accessModes.map((am) => ({
				mode: am.mode,
				enabled: am.enabled,
				priority: am.priority,
			})),
			capabilities: p.capabilities,
		}));

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({ providers: providerList }, null, 2),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to list providers',
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * List recent tasks executed by ADO
 */
async function listTasks(
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	const limit = (args.limit as number) ?? 10;
	const statusFilter = args.status as string | undefined;

	try {
		const progressStream = orchestratorInstance.getProgressStream();
		const allStatuses = progressStream.getAllStatuses();

		// Filter by status if specified
		let tasks = statusFilter ? allStatuses.filter((t) => t.status === statusFilter) : allStatuses;

		// Apply limit
		tasks = tasks.slice(0, limit);

		// Format task list
		const taskList = tasks.map((task) => ({
			id: task.taskId,
			status: task.status,
			providerId: task.providerId,
			progress: task.progress,
			startedAt: task.startedAt?.toISOString(),
			completedAt: task.completedAt?.toISOString(),
			...(task.error && { error: task.error }),
		}));

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							tasks: taskList,
							query: { limit, status: statusFilter },
							total: allStatuses.length,
							returned: taskList.length,
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to list tasks',
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * Get detailed information about a specific task
 */
async function getTask(
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	const taskId = args.taskId as string;

	if (!taskId || typeof taskId !== 'string') {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ error: 'Invalid taskId', message: 'taskId is required and must be a string' },
						null,
						2,
					),
				},
			],
		};
	}

	try {
		const taskStatus = await orchestratorInstance.status(taskId);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							...taskStatus,
							startedAt: taskStatus.startedAt?.toISOString(),
							completedAt: taskStatus.completedAt?.toISOString(),
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Task not found',
							taskId,
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * Cancel a running task
 */
async function cancelTask(
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	const taskId = args.taskId as string;

	if (!taskId || typeof taskId !== 'string') {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ error: 'Invalid taskId', message: 'taskId is required and must be a string' },
						null,
						2,
					),
				},
			],
		};
	}

	try {
		await orchestratorInstance.cancel(taskId);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							status: 'cancelled',
							taskId,
							message: 'Task cancelled successfully',
							timestamp: new Date().toISOString(),
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to cancel task',
							taskId,
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}

/**
 * Enable or disable a specific AI coding agent/provider
 */
async function enableProvider(
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	if (!orchestratorInstance) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Orchestrator not initialized',
							message: 'The MCP server orchestrator instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	const providerId = args.providerId as string;
	const enabled = args.enabled as boolean;

	if (!providerId || typeof providerId !== 'string') {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Invalid providerId',
							message: 'providerId is required and must be a string',
						},
						null,
						2,
					),
				},
			],
		};
	}

	if (typeof enabled !== 'boolean') {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ error: 'Invalid enabled', message: 'enabled is required and must be a boolean' },
						null,
						2,
					),
				},
			],
		};
	}

	try {
		const registry = orchestratorInstance.getRegistry();
		const provider = registry.get(providerId);

		if (!provider) {
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								error: 'Provider not found',
								providerId,
								message: `No provider with ID '${providerId}' found in the registry`,
							},
							null,
							2,
						),
					},
				],
			};
		}

		// Update provider enabled state
		registry.setEnabled(providerId, enabled);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							success: true,
							providerId,
							enabled,
							message: `Provider '${providerId}' has been ${enabled ? 'enabled' : 'disabled'}`,
							timestamp: new Date().toISOString(),
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Failed to update provider',
							providerId,
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				},
			],
		};
	}
}
