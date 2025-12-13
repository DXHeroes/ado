/**
 * ADO MCP Resources
 *
 * Defines the resources that the MCP server exposes to AI assistants.
 * Resources provide read-only access to configuration, provider status,
 * and usage statistics.
 *
 * @module resources
 */

import type { OrchestratorCore } from '@dxheroes/ado-core';
import type { AdoConfig } from '@dxheroes/ado-shared';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

/**
 * Shared configuration instance used by all resource handlers
 * @private
 */
let configInstance: AdoConfig | null = null;

/**
 * Shared orchestrator instance used by resource handlers
 * @private
 */
let orchestratorInstance: OrchestratorCore | null = null;

/**
 * Initialize the resources module with a configuration instance.
 * This must be called before any resources can be read.
 *
 * @param config - The ADO configuration to expose through resources
 * @public
 */
export function initializeResources(config: AdoConfig, orchestrator?: OrchestratorCore): void {
	configInstance = config;
	orchestratorInstance = orchestrator ?? null;
}

/**
 * Create the list of available MCP resources.
 * Returns resource definitions that describe the available data sources
 * and their URIs for AI assistants.
 *
 * @returns Array of resource definitions compatible with the MCP protocol
 * @public
 */
export function createResources(): Resource[] {
	return [
		{
			uri: 'ado://config',
			name: 'ADO Configuration',
			description: 'Current ADO orchestrator configuration',
			mimeType: 'application/json',
		},
		{
			uri: 'ado://providers',
			name: 'Provider Status',
			description: 'Current status of all AI coding agents',
			mimeType: 'application/json',
		},
		{
			uri: 'ado://usage',
			name: 'Usage Statistics',
			description: 'Usage statistics and rate limit information',
			mimeType: 'application/json',
		},
	];
}

/**
 * Handle a resource read request from an AI assistant.
 *
 * Routes the resource URI to the appropriate handler function.
 * All errors are caught and returned as structured error responses.
 *
 * @param uri - The URI of the resource to read (e.g., 'ado://config')
 * @returns Promise resolving to MCP-compatible response with resource contents
 * @throws Never throws - all errors are converted to error responses
 * @public
 */
export async function handleResourceRead(
	uri: string,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
	try {
		switch (uri) {
			case 'ado://config':
				return await readConfig();
			case 'ado://providers':
				return await readProviders();
			case 'ado://usage':
				return await readUsage();
			default:
				return {
					contents: [
						{
							uri,
							mimeType: 'application/json',
							text: JSON.stringify(
								{
									error: 'Unknown resource',
									uri,
									availableResources: ['ado://config', 'ado://providers', 'ado://usage'],
								},
								null,
								2,
							),
						},
					],
				};
		}
	} catch (error) {
		return {
			contents: [
				{
					uri,
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Resource read failed',
							uri,
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

// Resource implementations

/**
 * Read ADO configuration
 */
async function readConfig(): Promise<{
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
	if (!configInstance) {
		return {
			contents: [
				{
					uri: 'ado://config',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Configuration not initialized',
							message: 'The MCP server configuration instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	try {
		// Return a sanitized version of the config (remove sensitive data like API keys)
		const sanitizedConfig = {
			version: configInstance.version,
			project: configInstance.project,
			routing: configInstance.routing,
			orchestration: configInstance.orchestration,
			hitl: configInstance.hitl,
			storage: {
				driver: configInstance.storage.driver,
				// Don't expose the actual path for security
			},
			observability: configInstance.observability,
			// List provider IDs but not credentials
			providers: Object.keys(configInstance.providers),
		};

		return {
			contents: [
				{
					uri: 'ado://config',
					mimeType: 'application/json',
					text: JSON.stringify(sanitizedConfig, null, 2),
				},
			],
		};
	} catch (error) {
		return {
			contents: [
				{
					uri: 'ado://config',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Failed to read configuration',
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
 * Read provider status information
 */
async function readProviders(): Promise<{
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
	if (!configInstance) {
		return {
			contents: [
				{
					uri: 'ado://providers',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Configuration not initialized',
							message: 'The MCP server configuration instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	try {
		// If orchestrator is available, get live provider data
		if (orchestratorInstance) {
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
				contents: [
					{
						uri: 'ado://providers',
						mimeType: 'application/json',
						text: JSON.stringify({ providers: providerList }, null, 2),
					},
				],
			};
		}

		// Fallback to config-based provider list
		const providers = Object.entries(configInstance.providers).map(([id, providerConfig]) => ({
			id,
			enabled: providerConfig.enabled,
			accessModes: providerConfig.accessModes.map((am) => ({
				mode: am.mode,
				enabled: am.enabled,
				priority: am.priority,
			})),
			capabilities: providerConfig.capabilities,
		}));

		return {
			contents: [
				{
					uri: 'ado://providers',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							providers,
							note: 'Live provider data requires orchestrator instance',
						},
						null,
						2,
					),
				},
			],
		};
	} catch (error) {
		return {
			contents: [
				{
					uri: 'ado://providers',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Failed to read providers',
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
 * Read usage statistics
 */
async function readUsage(): Promise<{
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
	if (!configInstance) {
		return {
			contents: [
				{
					uri: 'ado://usage',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Configuration not initialized',
							message: 'The MCP server configuration instance is not available',
						},
						null,
						2,
					),
				},
			],
		};
	}

	try {
		// If orchestrator is available, get live usage data
		if (orchestratorInstance) {
			const progressStream = orchestratorInstance.getProgressStream();
			const allStatuses = progressStream.getAllStatuses();

			// Calculate usage statistics
			const now = new Date();
			const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

			const tasksToday = allStatuses.filter((t) => t.startedAt && t.startedAt >= startOfDay);

			const usage = {
				period: 'today',
				totalTasks: allStatuses.length,
				tasksToday: tasksToday.length,
				runningTasks: allStatuses.filter((t) => t.status === 'running').length,
				completedTasks: allStatuses.filter((t) => t.status === 'completed').length,
				failedTasks: allStatuses.filter((t) => t.status === 'failed').length,
				byProvider: {} as Record<string, number>,
			};

			// Group by provider
			for (const task of tasksToday) {
				if (task.providerId) {
					usage.byProvider[task.providerId] = (usage.byProvider[task.providerId] ?? 0) + 1;
				}
			}

			return {
				contents: [
					{
						uri: 'ado://usage',
						mimeType: 'application/json',
						text: JSON.stringify(usage, null, 2),
					},
				],
			};
		}

		// Fallback when orchestrator is not available
		const placeholderUsage = {
			period: 'today',
			message: 'Live usage statistics require orchestrator instance',
			note: 'Initialize resources with orchestrator to get real-time data',
		};

		return {
			contents: [
				{
					uri: 'ado://usage',
					mimeType: 'application/json',
					text: JSON.stringify(placeholderUsage, null, 2),
				},
			],
		};
	} catch (error) {
		return {
			contents: [
				{
					uri: 'ado://usage',
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							error: 'Failed to read usage',
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
