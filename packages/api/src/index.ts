/**
 * ADO REST API Server
 *
 * Provides REST endpoints for the web dashboard and external integrations.
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
	type AsyncStateStore,
	PostgresqlStateStore,
	SqliteStateStore,
	type StateStore,
	createTelemetryServiceFromEnv,
	setupGracefulShutdown,
} from '@dxheroes/ado-core';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { createDashboardRoutes } from './routes/dashboard.js';
import { createHealthRoutes } from './routes/health.js';
import { createProvidersRoutes } from './routes/providers.js';
import { createTasksRoutes } from './routes/tasks.js';
import type { ApiConfig, ApiContext } from './types.js';
import { startTrpcServer } from './trpc-server.js';

export type { ApiConfig, ApiContext } from './types.js';

// Re-export tRPC server
export { startTrpcServer, type AppRouter } from './trpc-server.js';
export { appRouter } from './trpc/router.js';

/**
 * Create the ADO API server (Legacy Hono REST API)
 *
 * Note: This is kept for backwards compatibility and dashboard serving.
 * New integrations should use tRPC via startTrpcServer().
 */
export function createApiServer(config: ApiConfig): Hono<ApiContext> {
	const app = new Hono<ApiContext>();

	// Initialize state store if not provided
	let stateStore: StateStore | AsyncStateStore | undefined = config.stateStore;
	if (!stateStore) {
		if (config.postgresUrl) {
			stateStore = new PostgresqlStateStore(config.postgresUrl);
		} else if (config.stateStorePath) {
			stateStore = new SqliteStateStore(config.stateStorePath);
		}
	}

	// Initialize telemetry - auto-enabled when OTEL_EXPORTER_OTLP_ENDPOINT is set
	const telemetry = createTelemetryServiceFromEnv('ado-api');

	// Middleware
	app.use('*', logger());
	app.use(
		'*',
		cors({
			origin: config.corsOrigins ?? ['http://localhost:3000', 'http://localhost:5173'],
			allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
			allowHeaders: ['Content-Type', 'Authorization'],
		}),
	);

	// Set config and state store in context
	app.use('*', async (c, next) => {
		c.set('config', config);
		if (stateStore) {
			c.set('stateStore', stateStore);
		}
		await next();
	});

	// Routes
	app.route('/health', createHealthRoutes());
	app.route('/api/dashboard', createDashboardRoutes());
	app.route('/api/tasks', createTasksRoutes());
	app.route('/api/providers', createProvidersRoutes());

	// Metrics endpoint for Prometheus
	app.get('/metrics', async (c) => {
		// OpenTelemetry metrics are exported via the configured OTLP endpoint
		// This endpoint provides basic health metrics
		const metrics = [
			'# HELP ado_api_up API server is running',
			'# TYPE ado_api_up gauge',
			'ado_api_up 1',
			'# HELP ado_api_state_store_enabled State store is enabled',
			'# TYPE ado_api_state_store_enabled gauge',
			`ado_api_state_store_enabled ${stateStore ? 1 : 0}`,
			'# HELP ado_api_telemetry_enabled Telemetry is enabled',
			'# TYPE ado_api_telemetry_enabled gauge',
			`ado_api_telemetry_enabled ${telemetry.isEnabled() ? 1 : 0}`,
		];

		return c.text(`${metrics.join('\n')}\n`);
	});

	// Serve dashboard static files when dashboardPath is configured
	if (config.dashboardPath && existsSync(config.dashboardPath)) {
		const dashboardPath = config.dashboardPath;

		// MIME type mapping for common static file types
		const mimeTypes: Record<string, string> = {
			'.html': 'text/html',
			'.css': 'text/css',
			'.js': 'application/javascript',
			'.json': 'application/json',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.svg': 'image/svg+xml',
			'.ico': 'image/x-icon',
			'.woff': 'font/woff',
			'.woff2': 'font/woff2',
			'.ttf': 'font/ttf',
			'.map': 'application/json',
		};

		// Serve static files from dashboard build
		app.get('*', async (c) => {
			const reqPath = c.req.path;

			// Try to serve the requested file
			let filePath = join(dashboardPath, reqPath);

			// If path ends with / or has no extension, try index.html
			if (reqPath.endsWith('/') || !extname(reqPath)) {
				const indexPath = join(dashboardPath, reqPath, 'index.html');
				if (existsSync(indexPath)) {
					filePath = indexPath;
				} else {
					// SPA fallback - serve root index.html for client-side routing
					filePath = join(dashboardPath, 'index.html');
				}
			}

			if (existsSync(filePath)) {
				const content = readFileSync(filePath);
				const ext = extname(filePath);
				const contentType = mimeTypes[ext] ?? 'application/octet-stream';
				return c.body(content, 200, { 'Content-Type': contentType });
			}

			// SPA fallback - serve index.html for any unmatched route
			const indexPath = join(dashboardPath, 'index.html');
			if (existsSync(indexPath)) {
				const content = readFileSync(indexPath);
				return c.body(content, 200, { 'Content-Type': 'text/html' });
			}

			return c.notFound();
		});
	}

	return app;
}

/**
 * Start the API server
 */
export function startApiServer(config: ApiConfig): void {
	const app = createApiServer(config);
	const port = config.port ?? 8080;
	const host = config.host ?? '0.0.0.0';

	// Setup graceful shutdown for telemetry
	setupGracefulShutdown();

	// biome-ignore lint/suspicious/noConsole: Startup message
	console.log(`🚀 ADO API server starting on http://${host}:${port}`);

	serve({
		fetch: app.fetch,
		port,
		hostname: host,
	});

	// biome-ignore lint/suspicious/noConsole: Startup message
	console.log(`✅ ADO API server running on http://${host}:${port}`);
}

// CLI entry point
if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '')) {
	const corsOrigins = process.env.CORS_ORIGINS?.split(',');
	const useTrpc = process.env.USE_TRPC === 'true';
	const config: ApiConfig = {
		port: Number.parseInt(process.env.PORT ?? '8080', 10),
		host: process.env.HOST ?? '0.0.0.0',
		stateStorePath: process.env.STATE_STORE_PATH ?? '.ado/state.db',
	};

	if (corsOrigins) {
		config.corsOrigins = corsOrigins;
	}

	// Enable dashboard serving when DASHBOARD_PATH is set
	if (process.env.DASHBOARD_PATH) {
		config.dashboardPath = process.env.DASHBOARD_PATH;
	}

	// Start tRPC server if enabled, otherwise use Hono REST API
	if (useTrpc) {
		startTrpcServer(config);
	} else {
		startApiServer(config);
	}
}
