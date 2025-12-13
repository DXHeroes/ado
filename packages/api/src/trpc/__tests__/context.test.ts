/**
 * tRPC Context Tests
 */

import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AsyncStateStore, StateStore, TelemetryService } from '@dxheroes/ado-core';
import { createContext, createWSSContext } from '../context.js';
import type { CreateHTTPContextOptions, CreateWSSContextFnOptions } from '../context.js';
import type { ApiConfig } from '../../types.js';

describe('tRPC Context', () => {
	const mockConfig: ApiConfig = {
		port: 3000,
		host: 'localhost',
		corsOrigins: ['http://localhost:3000'],
	};

	const mockStateStore: StateStore = {
		createSession: vi.fn(),
		getSession: vi.fn(),
		getSessionsByProject: vi.fn(),
		updateSession: vi.fn(),
		createTask: vi.fn(),
		getTask: vi.fn(),
		updateTask: vi.fn(),
		getTasksBySession: vi.fn(),
		getTasksByStatus: vi.fn(),
		recordUsage: vi.fn(),
		getUsageByProvider: vi.fn(),
		getTotalUsage: vi.fn(),
		createCheckpoint: vi.fn(),
		getCheckpoint: vi.fn(),
		getLatestCheckpoint: vi.fn(),
		close: vi.fn(),
	};

	const mockTelemetry: TelemetryService = {
		trace: vi.fn(),
		traceAsync: vi.fn(async (_name, fn) => fn()),
		recordMetric: vi.fn(),
		recordEvent: vi.fn(),
		flush: vi.fn(),
		shutdown: vi.fn(),
	};

	describe('createContext', () => {
		it('should create context with minimal config', async () => {
			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig);

			expect(context).toBeDefined();
			expect(context.config).toEqual(mockConfig);
			expect(context.stateStore).toBeUndefined();
			expect(context.telemetry).toBeUndefined();
			expect(context.req).toBe(opts.req);
			expect(context.res).toBe(opts.res);
		});

		it('should create context with state store', async () => {
			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig, mockStateStore);

			expect(context.stateStore).toBe(mockStateStore);
		});

		it('should create context with telemetry', async () => {
			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig, undefined, mockTelemetry);

			expect(context.telemetry).toBe(mockTelemetry);
		});

		it('should create context with all services', async () => {
			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig, mockStateStore, mockTelemetry);

			expect(context.config).toEqual(mockConfig);
			expect(context.stateStore).toBe(mockStateStore);
			expect(context.telemetry).toBe(mockTelemetry);
			expect(context.req).toBe(opts.req);
			expect(context.res).toBe(opts.res);
		});

		it('should create context with async state store', async () => {
			const mockAsyncStateStore: AsyncStateStore = {
				createSession: vi.fn(async () => ({} as any)),
				getSession: vi.fn(async () => null),
				getSessionsByProject: vi.fn(async () => []),
				updateSession: vi.fn(async () => {}),
				createTask: vi.fn(async () => ({} as any)),
				getTask: vi.fn(async () => null),
				updateTask: vi.fn(async () => {}),
				getTasksBySession: vi.fn(async () => []),
				getTasksByStatus: vi.fn(async () => []),
				recordUsage: vi.fn(async () => {}),
				getUsageByProvider: vi.fn(async () => []),
				getTotalUsage: vi.fn(async () => ({ requests: 0, tokens: 0, cost: 0 })),
				createCheckpoint: vi.fn(async () => ({} as any)),
				getCheckpoint: vi.fn(async () => null),
				getLatestCheckpoint: vi.fn(async () => null),
				close: vi.fn(async () => {}),
			};

			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig, mockAsyncStateStore);

			expect(context.stateStore).toBe(mockAsyncStateStore);
		});
	});

	describe('createWSSContext', () => {
		it('should create WebSocket context with minimal config', async () => {
			const opts: CreateWSSContextFnOptions = {
				req: {} as IncomingMessage,
			};

			const context = await createWSSContext(opts, mockConfig);

			expect(context).toBeDefined();
			expect(context.config).toEqual(mockConfig);
			expect(context.stateStore).toBeUndefined();
			expect(context.telemetry).toBeUndefined();
			expect(context.req).toBeUndefined();
			expect(context.res).toBeUndefined();
		});

		it('should create WebSocket context with state store', async () => {
			const opts: CreateWSSContextFnOptions = {
				req: {} as IncomingMessage,
			};

			const context = await createWSSContext(opts, mockConfig, mockStateStore);

			expect(context.stateStore).toBe(mockStateStore);
		});

		it('should create WebSocket context with telemetry', async () => {
			const opts: CreateWSSContextFnOptions = {
				req: {} as IncomingMessage,
			};

			const context = await createWSSContext(opts, mockConfig, undefined, mockTelemetry);

			expect(context.telemetry).toBe(mockTelemetry);
		});

		it('should create WebSocket context with all services', async () => {
			const opts: CreateWSSContextFnOptions = {
				req: {} as IncomingMessage,
			};

			const context = await createWSSContext(opts, mockConfig, mockStateStore, mockTelemetry);

			expect(context.config).toEqual(mockConfig);
			expect(context.stateStore).toBe(mockStateStore);
			expect(context.telemetry).toBe(mockTelemetry);
		});

		it('should not include req/res in WebSocket context', async () => {
			const opts: CreateWSSContextFnOptions = {
				req: {} as IncomingMessage,
			};

			const context = await createWSSContext(opts, mockConfig);

			expect(context.req).toBeUndefined();
			expect(context.res).toBeUndefined();
		});
	});

	describe('context type guards', () => {
		it('should handle context without optional fields', async () => {
			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, mockConfig);

			// TypeScript should allow optional fields to be undefined
			expect(context.stateStore).toBeUndefined();
			expect(context.telemetry).toBeUndefined();
		});

		it('should handle context with partial config', async () => {
			const partialConfig: ApiConfig = {
				port: 3000,
			};

			const opts: CreateHTTPContextOptions = {
				req: {} as IncomingMessage,
				res: {} as ServerResponse,
			};

			const context = await createContext(opts, partialConfig);

			expect(context.config.port).toBe(3000);
			expect(context.config.host).toBeUndefined();
		});
	});
});
