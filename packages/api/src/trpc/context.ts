/**
 * tRPC Context
 *
 * Context is created for each request and provides access to state store,
 * telemetry, and configuration.
 */

import type { AsyncStateStore, StateStore, TelemetryService } from '@dxheroes/ado-core';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { ApiConfig } from '../types.js';

export interface Context {
	config: ApiConfig;
	stateStore?: StateStore | AsyncStateStore | undefined;
	telemetry?: TelemetryService | undefined;
	req?: CreateHTTPContextOptions['req'] | undefined;
	res?: CreateHTTPContextOptions['res'] | undefined;
}

/**
 * Create context for HTTP requests
 */
export async function createContext(
	opts: CreateHTTPContextOptions,
	config: ApiConfig,
	stateStore?: StateStore | AsyncStateStore,
	telemetry?: TelemetryService,
): Promise<Context> {
	return {
		config,
		stateStore,
		telemetry,
		req: opts.req,
		res: opts.res,
	};
}

/**
 * Create context for WebSocket connections
 */
export async function createWSSContext(
	_opts: CreateWSSContextFnOptions,
	config: ApiConfig,
	stateStore?: StateStore | AsyncStateStore,
	telemetry?: TelemetryService,
): Promise<Context> {
	return {
		config,
		stateStore,
		telemetry,
	};
}

export type { CreateHTTPContextOptions, CreateWSSContextFnOptions };
