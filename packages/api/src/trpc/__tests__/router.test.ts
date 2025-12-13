/**
 * Main tRPC Router Tests
 */

import { describe, expect, it } from 'vitest';
import { appRouter } from '../router.js';
import type { AppRouter } from '../router.js';

describe('tRPC App Router', () => {
	describe('router structure', () => {
		it('should export appRouter', () => {
			expect(appRouter).toBeDefined();
			expect(typeof appRouter).toBe('object');
		});

		it('should have tasks sub-router', () => {
			expect(appRouter).toHaveProperty('tasks');
		});

		it('should have workers sub-router', () => {
			expect(appRouter).toHaveProperty('workers');
		});
	});

	describe('type exports', () => {
		it('should export AppRouter type', () => {
			// Type check - this will fail at compile time if type is not exported
			const _typeCheck: AppRouter = appRouter;
			expect(_typeCheck).toBe(appRouter);
		});
	});

	describe('router procedures', () => {
		it('should have tasks.create procedure', () => {
			expect(appRouter.tasks).toHaveProperty('create');
		});

		it('should have tasks.get procedure', () => {
			expect(appRouter.tasks).toHaveProperty('get');
		});

		it('should have tasks.list procedure', () => {
			expect(appRouter.tasks).toHaveProperty('list');
		});

		it('should have tasks.cancel procedure', () => {
			expect(appRouter.tasks).toHaveProperty('cancel');
		});

		it('should have tasks.pause procedure', () => {
			expect(appRouter.tasks).toHaveProperty('pause');
		});

		it('should have tasks.resume procedure', () => {
			expect(appRouter.tasks).toHaveProperty('resume');
		});

		it('should have tasks.onTaskEvent subscription', () => {
			expect(appRouter.tasks).toHaveProperty('onTaskEvent');
		});

		it('should have workers.register procedure', () => {
			expect(appRouter.workers).toHaveProperty('register');
		});

		it('should have workers.heartbeat procedure', () => {
			expect(appRouter.workers).toHaveProperty('heartbeat');
		});

		it('should have workers.list procedure', () => {
			expect(appRouter.workers).toHaveProperty('list');
		});

		it('should have workers.getStatus procedure', () => {
			expect(appRouter.workers).toHaveProperty('getStatus');
		});

		it('should have workers.assignTask procedure', () => {
			expect(appRouter.workers).toHaveProperty('assignTask');
		});

		it('should have workers.unregister procedure', () => {
			expect(appRouter.workers).toHaveProperty('unregister');
		});

		it('should have workers.onWorkerStatus subscription', () => {
			expect(appRouter.workers).toHaveProperty('onWorkerStatus');
		});
	});

	describe('router metadata', () => {
		it('should be callable as object', () => {
			// Router should be an object with callable procedures
			expect(typeof appRouter).toBe('object');
			expect(appRouter).not.toBeNull();
		});

		it('should have correct nested structure', () => {
			// Check that sub-routers are properly nested
			expect(appRouter.tasks).toBeDefined();
			expect(appRouter.workers).toBeDefined();
			expect(typeof appRouter.tasks).toBe('object');
			expect(typeof appRouter.workers).toBe('object');
		});
	});
});
