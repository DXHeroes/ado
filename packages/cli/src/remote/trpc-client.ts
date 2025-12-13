/**
 * tRPC Client for Remote Execution
 *
 * Connects to remote tRPC API server for distributed task execution.
 */

import { createTRPCClient, type CreateTRPCClientOptions, httpBatchLink, wsLink } from '@trpc/client';
import { createWSClient } from '@trpc/client/links/wsLink';
import superjson from 'superjson';
import type { AppRouter } from '@dxheroes/ado-api';

export interface RemoteClientConfig {
	apiUrl: string;
	wsUrl?: string;
	headers?: Record<string, string>;
}

export interface RemoteClientInstance {
	client: ReturnType<typeof createTRPCClient<AppRouter>>;
	wsClient: ReturnType<typeof createWSClient> | undefined;
	disconnect: () => void;
}

/**
 * Create tRPC client for remote API server
 */
export function createRemoteClient(config: RemoteClientConfig): RemoteClientInstance {
	// Create WebSocket client if wsUrl is provided
	const wsClient = config.wsUrl
		? createWSClient({
				url: config.wsUrl,
		  })
		: undefined;

	// tRPC client configuration
	const clientConfig: CreateTRPCClientOptions<AppRouter> = {
		links: wsClient
			? [
					// Use WebSocket for subscriptions
					wsLink({
						client: wsClient,
					}),
					// Use HTTP for queries and mutations
					httpBatchLink({
						url: config.apiUrl,
						headers: config.headers ?? {},
					}),
			  ]
			: [
					// HTTP only
					httpBatchLink({
						url: config.apiUrl,
						headers: config.headers ?? {},
					}),
			  ],
		transformer: superjson,
	};

	const client = createTRPCClient<AppRouter>(clientConfig);

	return {
		client,
		wsClient,
		disconnect: () => {
			wsClient?.close();
		},
	};
}
