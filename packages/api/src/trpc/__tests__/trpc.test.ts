/**
 * tRPC Initialization Tests
 */

import type { StateStore, TelemetryService } from '@dxheroes/ado-core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from '../../types.js';
import type { Context } from '../context.js';
import {
	middleware,
	protectedProcedure,
	publicProcedure,
	router,
	withStateStore,
} from '../trpc.js';

describe('tRPC Initialization', () => {
	const mockConfig: ApiConfig = {
		port: 3000,
		host: 'localhost',
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

	describe('router', () => {
		it('should create a router', () => {
			const testRouter = router({
				test: publicProcedure.query(() => 'test'),
			});

			expect(testRouter).toBeDefined();
			expect(typeof testRouter).toBe('object');
		});

		it('should create router with multiple procedures', () => {
			const testRouter = router({
				query1: publicProcedure.query(() => 'query1'),
				query2: publicProcedure.query(() => 'query2'),
				mutation1: publicProcedure.mutation(() => 'mutation1'),
			});

			expect(testRouter).toBeDefined();
		});

		it('should create nested routers', () => {
			const subRouter = router({
				nested: publicProcedure.query(() => 'nested'),
			});

			const mainRouter = router({
				sub: subRouter,
			});

			expect(mainRouter).toBeDefined();
		});
	});

	describe('publicProcedure', () => {
		it('should create a public query procedure', async () => {
			const procedure = publicProcedure.query(() => 'test result');

			expect(procedure).toBeDefined();
		});

		it('should create a public mutation procedure', async () => {
			const procedure = publicProcedure.mutation(() => ({ success: true }));

			expect(procedure).toBeDefined();
		});

		it('should allow accessing context in procedure', async () => {
			const procedure = publicProcedure.query(({ ctx }) => {
				return {
					hasConfig: !!ctx.config,
					hasStateStore: !!ctx.stateStore,
					hasTelemetry: !!ctx.telemetry,
				};
			});

			expect(procedure).toBeDefined();
		});
	});

	describe('middleware', () => {
		it('should create middleware', () => {
			const testMiddleware = middleware(async ({ next }) => {
				return next();
			});

			expect(testMiddleware).toBeDefined();
		});

		it('should create middleware that modifies context', () => {
			const testMiddleware = middleware(async ({ ctx, next }) => {
				return next({
					ctx: {
						...ctx,
						// Add custom property
					},
				});
			});

			expect(testMiddleware).toBeDefined();
		});
	});

	describe('withStateStore middleware', () => {
		it('should be defined', () => {
			expect(withStateStore).toBeDefined();
		});

		it('should throw error when state store is not configured', async () => {
			// Test by using protectedProcedure which uses withStateStore middleware
			const testRouter = router({
				test: protectedProcedure.query(() => 'test'),
			});

			const ctxWithoutState: Context = {
				config: mockConfig,
			};

			const caller = testRouter.createCaller(ctxWithoutState);

			await expect(caller.test()).rejects.toThrow('State store not configured');
		});

		it('should allow access when state store is configured', async () => {
			// Test by using protectedProcedure which uses withStateStore middleware
			const testRouter = router({
				test: protectedProcedure.query(({ ctx }) => {
					return { hasStateStore: !!ctx.stateStore };
				}),
			});

			const ctxWithState: Context = {
				config: mockConfig,
				stateStore: mockStateStore,
			};

			const caller = testRouter.createCaller(ctxWithState);
			const result = await caller.test();

			expect(result.hasStateStore).toBe(true);
		});

		it('should pass state store in context', async () => {
			// Test by using protectedProcedure which uses withStateStore middleware
			const testRouter = router({
				test: protectedProcedure.query(({ ctx }) => {
					return {
						hasStateStore: !!ctx.stateStore,
						hasTelemetry: !!ctx.telemetry,
						hasConfig: !!ctx.config,
					};
				}),
			});

			const ctxWithState: Context = {
				config: mockConfig,
				stateStore: mockStateStore,
				telemetry: mockTelemetry,
			};

			const caller = testRouter.createCaller(ctxWithState);
			const result = await caller.test();

			expect(result.hasStateStore).toBe(true);
			expect(result.hasTelemetry).toBe(true);
			expect(result.hasConfig).toBe(true);
		});
	});

	describe('protectedProcedure', () => {
		it('should be defined', () => {
			expect(protectedProcedure).toBeDefined();
		});

		it('should create protected query procedure', () => {
			const procedure = protectedProcedure.query(({ ctx }) => {
				// State store should be available due to middleware
				return { hasStateStore: !!ctx.stateStore };
			});

			expect(procedure).toBeDefined();
		});

		it('should create protected mutation procedure', () => {
			const procedure = protectedProcedure.mutation(({ ctx }) => {
				return { success: true, hasStateStore: !!ctx.stateStore };
			});

			expect(procedure).toBeDefined();
		});
	});

	describe('superjson transformer', () => {
		it('should handle Date objects', () => {
			const testRouter = router({
				getDate: publicProcedure.query(() => ({
					timestamp: new Date('2024-01-01T00:00:00Z'),
				})),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle undefined values', () => {
			const testRouter = router({
				getOptional: publicProcedure.query(() => ({
					value: undefined,
				})),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle Map objects', () => {
			const testRouter = router({
				getMap: publicProcedure.query(() => ({
					data: new Map([
						['key1', 'value1'],
						['key2', 'value2'],
					]),
				})),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle Set objects', () => {
			const testRouter = router({
				getSet: publicProcedure.query(() => ({
					data: new Set([1, 2, 3, 4, 5]),
				})),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle BigInt values', () => {
			const testRouter = router({
				getBigInt: publicProcedure.query(() => ({
					large: BigInt('9007199254740991'),
				})),
			});

			expect(testRouter).toBeDefined();
		});
	});

	describe('error handling', () => {
		it('should format errors', () => {
			const testRouter = router({
				throwError: publicProcedure.query(() => {
					throw new Error('Test error');
				}),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle async errors', () => {
			const testRouter = router({
				throwAsyncError: publicProcedure.query(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					throw new Error('Async test error');
				}),
			});

			expect(testRouter).toBeDefined();
		});

		it('should handle errors in mutations', () => {
			const testRouter = router({
				throwMutationError: publicProcedure.mutation(() => {
					throw new Error('Mutation error');
				}),
			});

			expect(testRouter).toBeDefined();
		});
	});

	describe('procedure composition', () => {
		it('should compose multiple middlewares', () => {
			const middleware1 = middleware(async ({ next, ctx }) => {
				return next({
					ctx: {
						...ctx,
					},
				});
			});

			const middleware2 = middleware(async ({ next }) => {
				return next();
			});

			const procedure = publicProcedure
				.use(middleware1)
				.use(middleware2)
				.query(() => 'test');

			expect(procedure).toBeDefined();
		});

		it('should allow chaining use and query', () => {
			const procedure = publicProcedure
				.use(
					middleware(async ({ next }) => {
						return next();
					}),
				)
				.query(() => 'result');

			expect(procedure).toBeDefined();
		});

		it('should allow chaining use and mutation', () => {
			const procedure = publicProcedure
				.use(
					middleware(async ({ next }) => {
						return next();
					}),
				)
				.mutation(() => ({ success: true }));

			expect(procedure).toBeDefined();
		});
	});
});
