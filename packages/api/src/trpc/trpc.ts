/**
 * tRPC Initialization
 *
 * Initialize tRPC with context and middlewares.
 */

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context.js';

// Initialize tRPC with context type
const t = initTRPC.context<Context>().create({
	transformer: superjson, // Handles Date, Map, Set, BigInt, undefined
	errorFormatter({ shape }) {
		return shape;
	},
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Middleware to ensure state store is available
export const withStateStore = middleware(async ({ ctx, next }) => {
	if (!ctx.stateStore) {
		throw new Error('State store not configured');
	}
	return next({
		ctx: {
			...ctx,
			stateStore: ctx.stateStore,
		},
	});
});

// Protected procedure that requires state store
export const protectedProcedure = publicProcedure.use(withStateStore);
