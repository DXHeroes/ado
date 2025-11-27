/**
 * Providers routes
 */

import { loadConfigWithFallback } from '@dxheroes/ado-core';
import { Hono } from 'hono';
import type { ApiContext, ProviderResponse } from '../types.js';

/**
 * Load providers from config file
 */
async function loadProvidersFromConfig(
	stateStore?:
		| import('@dxheroes/ado-core').StateStore
		| import('@dxheroes/ado-core').AsyncStateStore,
): Promise<ProviderResponse[]> {
	const cwd = process.cwd();
	const config = loadConfigWithFallback(cwd, { validate: false });

	const providers: ProviderResponse[] = [];
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);

	for (const [id, providerConfig] of Object.entries(config.providers)) {
		// Extract rate limits from subscription config if available
		const subscriptionMode = providerConfig.accessModes.find((m) => m.mode === 'subscription');
		const subscriptionLimits = subscriptionMode?.subscription?.rateLimits;

		// Build rateLimits object only with defined values
		let rateLimits: ProviderResponse['rateLimits'];
		if (subscriptionLimits) {
			rateLimits = {};
			if (subscriptionLimits.requestsPerDay !== undefined) {
				rateLimits.requestsPerDay = subscriptionLimits.requestsPerDay;
			}
			if (subscriptionLimits.requestsPerHour !== undefined) {
				rateLimits.requestsPerHour = subscriptionLimits.requestsPerHour;
			}
			if (subscriptionLimits.tokensPerDay !== undefined) {
				rateLimits.tokensPerDay = subscriptionLimits.tokensPerDay;
			}
		}

		// Get usage data from state store if available
		let requestsToday = 0;
		if (stateStore) {
			try {
				const usageRecords =
					'then' in (stateStore.getUsageByProvider(id, startOfDay) as Promise<unknown>)
						? await (stateStore as import('@dxheroes/ado-core').AsyncStateStore).getUsageByProvider(
								id,
								startOfDay,
							)
						: (stateStore as import('@dxheroes/ado-core').StateStore).getUsageByProvider(
								id,
								startOfDay,
							);

				requestsToday = usageRecords.reduce((sum, record) => sum + record.requestCount, 0);
			} catch {
				// If error, use 0
			}
		}

		const response: ProviderResponse = {
			id,
			name: providerConfig.id,
			enabled: providerConfig.enabled,
			accessModes: providerConfig.accessModes.map((mode) => ({
				mode: mode.mode as 'subscription' | 'api' | 'free',
				enabled: mode.enabled,
				priority: mode.priority,
			})),
			capabilities: {
				codeGeneration: providerConfig.capabilities.codeGeneration,
				codeReview: providerConfig.capabilities.codeReview,
				refactoring: providerConfig.capabilities.refactoring,
				testing: providerConfig.capabilities.testing,
				documentation: providerConfig.capabilities.documentation,
				debugging: providerConfig.capabilities.debugging,
			},
			usage: {
				requestsToday,
			},
		};

		if (rateLimits && Object.keys(rateLimits).length > 0) {
			response.rateLimits = rateLimits;
		}

		providers.push(response);
	}

	return providers;
}

// Fallback provider configuration if no config file is found
const defaultProviders: ProviderResponse[] = [
	{
		id: 'claude-code',
		name: 'Claude Code',
		enabled: true,
		accessModes: [
			{ mode: 'subscription', enabled: true, priority: 1 },
			{ mode: 'api', enabled: true, priority: 2 },
		],
		rateLimits: {
			requestsPerDay: 200,
			tokensPerDay: 100000,
		},
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
		},
		usage: {
			requestsToday: 45,
		},
	},
	{
		id: 'gemini-cli',
		name: 'Gemini CLI',
		enabled: true,
		accessModes: [
			{ mode: 'free', enabled: true, priority: 1 },
			{ mode: 'api', enabled: true, priority: 2 },
		],
		rateLimits: {
			requestsPerDay: 1500,
			requestsPerHour: 50,
		},
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
		},
		usage: {
			requestsToday: 20,
		},
	},
	{
		id: 'cursor-cli',
		name: 'Cursor CLI',
		enabled: true,
		accessModes: [{ mode: 'subscription', enabled: true, priority: 1 }],
		rateLimits: {
			requestsPerDay: 500,
		},
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
		},
		usage: {
			requestsToday: 15,
		},
	},
	{
		id: 'copilot-cli',
		name: 'GitHub Copilot',
		enabled: true,
		accessModes: [{ mode: 'subscription', enabled: true, priority: 1 }],
		rateLimits: {
			requestsPerDay: 1000,
		},
		capabilities: {
			codeGeneration: true,
			codeReview: false,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: false,
		},
		usage: {
			requestsToday: 10,
		},
	},
	{
		id: 'codex-cli',
		name: 'OpenAI Codex',
		enabled: false,
		accessModes: [{ mode: 'api', enabled: true, priority: 1 }],
		rateLimits: {
			requestsPerDay: 500,
			tokensPerDay: 50000,
		},
		capabilities: {
			codeGeneration: true,
			codeReview: false,
			refactoring: true,
			testing: false,
			documentation: true,
			debugging: false,
		},
		usage: {
			requestsToday: 0,
		},
	},
];

export function createProvidersRoutes(): Hono<ApiContext> {
	const router = new Hono<ApiContext>();

	// List all providers
	router.get('/', async (c) => {
		const stateStore = c.get('stateStore');

		try {
			const providerList = await loadProvidersFromConfig(stateStore);
			return c.json(providerList);
		} catch {
			// Fallback to default providers if config loading fails
			return c.json(defaultProviders);
		}
	});

	// Get provider by ID
	router.get('/:id', async (c) => {
		const providerId = c.req.param('id');
		const stateStore = c.get('stateStore');

		try {
			const providerList = await loadProvidersFromConfig(stateStore);
			const provider = providerList.find((p) => p.id === providerId);

			if (!provider) {
				return c.json({ error: 'Provider not found' }, 404);
			}

			return c.json(provider);
		} catch {
			// Fallback to default providers
			const provider = defaultProviders.find((p) => p.id === providerId);
			if (!provider) {
				return c.json({ error: 'Provider not found' }, 404);
			}
			return c.json(provider);
		}
	});

	// Update provider (enable/disable, etc.)
	router.patch('/:id', async (c) => {
		// Note: This modifies the config in memory but doesn't persist to disk
		// In a full implementation, you'd update the config file or use a registry service
		return c.json(
			{
				error: 'Provider updates not yet implemented',
				message:
					'Provider configuration updates require modifying the ado.config.yaml file or using a provider registry service',
			},
			501,
		);
	});

	// Get provider usage
	router.get('/:id/usage', async (c) => {
		const providerId = c.req.param('id');
		const stateStore = c.get('stateStore');

		try {
			const providerList = await loadProvidersFromConfig(stateStore);
			const provider = providerList.find((p) => p.id === providerId);

			if (!provider) {
				return c.json({ error: 'Provider not found' }, 404);
			}

			return c.json({
				providerId,
				usage: provider.usage,
				rateLimits: provider.rateLimits,
				remaining: {
					requestsToday:
						(provider.rateLimits?.requestsPerDay ?? 0) - (provider.usage?.requestsToday ?? 0),
				},
			});
		} catch {
			// Fallback to default providers
			const provider = defaultProviders.find((p) => p.id === providerId);
			if (!provider) {
				return c.json({ error: 'Provider not found' }, 404);
			}
			return c.json({
				providerId,
				usage: provider.usage,
				rateLimits: provider.rateLimits,
				remaining: {
					requestsToday:
						(provider.rateLimits?.requestsPerDay ?? 0) - (provider.usage?.requestsToday ?? 0),
				},
			});
		}
	});

	return router;
}
