/**
 * ADO REST API Server
 *
 * Provides REST endpoints for the web dashboard and external integrations.
 */

import {
	type AsyncStateStore,
	PostgresqlStateStore,
	SqliteStateStore,
	type StateStore,
	TelemetryService,
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

export type { ApiConfig, ApiContext } from './types.js';

/**
 * Create the ADO API server
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

	// Initialize telemetry
	const telemetryEnabled = process.env.OTEL_ENABLED === 'true';
	const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	const telemetry = new TelemetryService({
		serviceName: 'ado-api',
		serviceVersion: process.env.npm_package_version ?? '1.0.0',
		environment: process.env.NODE_ENV ?? 'development',
		enabled: telemetryEnabled,
		tracing: {
			enabled: telemetryEnabled,
			...(otelEndpoint && { endpoint: otelEndpoint }),
		},
		metrics: {
			enabled: telemetryEnabled,
			...(otelEndpoint && { endpoint: otelEndpoint }),
		},
	});

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
	const config: ApiConfig = {
		port: Number.parseInt(process.env.PORT ?? '8080', 10),
		host: process.env.HOST ?? '0.0.0.0',
		stateStorePath: process.env.STATE_STORE_PATH ?? '.ado/state.db',
	};

	if (corsOrigins) {
		config.corsOrigins = corsOrigins;
	}

	startApiServer(config);
}
