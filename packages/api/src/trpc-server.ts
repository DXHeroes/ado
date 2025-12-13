/**
 * tRPC Server with WebSocket support
 *
 * Standalone tRPC server with WebSocket subscriptions for real-time updates.
 */

import {
	type AsyncStateStore,
	PostgresqlStateStore,
	SqliteStateStore,
	type StateStore,
	createTelemetryServiceFromEnv,
	setupGracefulShutdown,
} from '@dxheroes/ado-core';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

import { createContext, createWSSContext } from './trpc/context.js';
import { appRouter } from './trpc/router.js';
import type { ApiConfig } from './types.js';

export type { AppRouter } from './trpc/router.js';

/**
 * Start tRPC server with WebSocket support
 */
export function startTrpcServer(config: ApiConfig): void {
	// Initialize state store
	let stateStore: StateStore | AsyncStateStore | undefined = config.stateStore;
	if (!stateStore) {
		if (config.postgresUrl) {
			stateStore = new PostgresqlStateStore(config.postgresUrl);
		} else if (config.stateStorePath) {
			stateStore = new SqliteStateStore(config.stateStorePath);
		}
	}

	// Initialize telemetry
	const telemetry = createTelemetryServiceFromEnv('ado-api-trpc');

	const port = config.port ?? 8080;
	// TODO: Use host configuration when implementing custom server binding
	// const host = config.host ?? '0.0.0.0';

	// Create HTTP server with tRPC
	const httpServer = createHTTPServer({
		router: appRouter,
		createContext: (opts) => createContext(opts, config, stateStore, telemetry),
	});

	// Create WebSocket server for subscriptions
	const wss = new WebSocketServer({ port: port + 1 }); // WebSocket on different port

	const wssHandler = applyWSSHandler({
		wss,
		router: appRouter,
		createContext: (opts) => createWSSContext(opts, config, stateStore, telemetry),
	});

	// Setup graceful shutdown
	setupGracefulShutdown();

	// Handle server close
	process.on('SIGTERM', () => {
		wssHandler.broadcastReconnectNotification();
		wss.close();
	});

	// Start server
	httpServer.listen(port);
}
