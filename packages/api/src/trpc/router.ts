/**
 * Main tRPC Router
 *
 * Combines all sub-routers into a single app router.
 */

import { tasksRouter } from './routers/tasks.js';
import { workersRouter } from './routers/workers.js';
import { router } from './trpc.js';

/**
 * App Router - combines all sub-routers
 */
export const appRouter = router({
	tasks: tasksRouter,
	workers: workersRouter,
});

// Export type for use in client
export type AppRouter = typeof appRouter;
