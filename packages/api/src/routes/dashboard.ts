/**
 * Dashboard routes
 */

import type { AsyncStateStore, StateStore } from '@dxheroes/ado-core';
import { Hono } from 'hono';
import type { ApiContext, DashboardStats, UsageHistory } from '../types.js';

/**
 * Type guard to check if a method is async
 */
function isAsyncStateStore(store: StateStore | AsyncStateStore): store is AsyncStateStore {
	return 'then' in (store.getTasksByStatus('running') as Promise<unknown>);
}

export function createDashboardRoutes(): Hono<ApiContext> {
	const router = new Hono<ApiContext>();

	// Dashboard stats
	router.get('/stats', async (c) => {
		const stats: DashboardStats = {
			activeTasks: 0,
			completedToday: 0,
			apiCost24h: 0,
			avgDuration: 0,
			recentAlerts: [],
		};

		// Try to get real stats from state store
		try {
			const stateStore = c.get('stateStore');
			if (stateStore) {
				const now = new Date();
				const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

				if (isAsyncStateStore(stateStore)) {
					// Async state store (PostgreSQL, etc.)
					const [runningTasks, completedTasks, usage] = await Promise.all([
						stateStore.getTasksByStatus('running'),
						stateStore.getTasksByStatus('completed'),
						stateStore.getTotalUsage(last24h),
					]);

					stats.activeTasks = runningTasks.length;
					stats.completedToday = completedTasks.filter(
						(t) => t.completedAt && t.completedAt >= startOfDay,
					).length;
					stats.apiCost24h = usage.cost;

					const durations = completedTasks
						.filter((t) => t.result?.duration)
						.map((t) => t.result?.duration ?? 0);
					stats.avgDuration =
						durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
				} else {
					// Sync state store (SQLite)
					const runningTasks = stateStore.getTasksByStatus('running');
					const completedTasks = stateStore.getTasksByStatus('completed');
					const usage = stateStore.getTotalUsage(last24h);

					stats.activeTasks = runningTasks.length;
					stats.completedToday = completedTasks.filter(
						(t) => t.completedAt && t.completedAt >= startOfDay,
					).length;
					stats.apiCost24h = usage.cost;

					const durations = completedTasks
						.filter((t) => t.result?.duration)
						.map((t) => t.result?.duration ?? 0);
					stats.avgDuration =
						durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
				}
			}
		} catch {
			// Return default stats on error
		}

		return c.json(stats);
	});

	// Usage history
	router.get('/usage-history', async (c) => {
		const now = new Date();
		const history: UsageHistory = {
			taskVolume: [],
			providerUsage: [],
			costTrend: [],
		};

		try {
			const stateStore = c.get('stateStore');
			if (stateStore) {
				// Get data for last 7 days
				const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

				if (isAsyncStateStore(stateStore)) {
					const [completedTasks, _usage] = await Promise.all([
						stateStore.getTasksByStatus('completed'),
						stateStore.getTotalUsage(sevenDaysAgo),
					]);

					// Build task volume by day
					const tasksByDay = new Map<string, number>();
					for (const task of completedTasks) {
						if (task.completedAt && task.completedAt >= sevenDaysAgo) {
							const date = task.completedAt.toISOString().split('T')[0] ?? '';
							tasksByDay.set(date, (tasksByDay.get(date) ?? 0) + 1);
						}
					}

					// Fill in missing days
					for (let i = 6; i >= 0; i--) {
						const date = new Date(now);
						date.setDate(date.getDate() - i);
						const dateStr = date.toISOString().split('T')[0] ?? '';
						history.taskVolume.push({
							date: dateStr,
							count: tasksByDay.get(dateStr) ?? 0,
						});
					}

					// Build provider usage
					const providerCounts = new Map<string, number>();
					for (const task of completedTasks) {
						if (task.providerId && task.completedAt && task.completedAt >= sevenDaysAgo) {
							providerCounts.set(task.providerId, (providerCounts.get(task.providerId) ?? 0) + 1);
						}
					}

					for (const [provider, count] of providerCounts.entries()) {
						history.providerUsage.push({ provider, count });
					}

					// Build cost trend (simplified - would need per-day cost tracking)
					for (let i = 6; i >= 0; i--) {
						const date = new Date(now);
						date.setDate(date.getDate() - i);
						history.costTrend.push({
							date: date.toISOString().split('T')[0] ?? '',
							subscription: 0, // Would need detailed cost tracking
							api: 0,
						});
					}
				} else {
					// Sync state store
					const completedTasks = stateStore.getTasksByStatus('completed');

					// Build task volume by day
					const tasksByDay = new Map<string, number>();
					for (const task of completedTasks) {
						if (task.completedAt && task.completedAt >= sevenDaysAgo) {
							const date = task.completedAt.toISOString().split('T')[0] ?? '';
							tasksByDay.set(date, (tasksByDay.get(date) ?? 0) + 1);
						}
					}

					// Fill in missing days
					for (let i = 6; i >= 0; i--) {
						const date = new Date(now);
						date.setDate(date.getDate() - i);
						const dateStr = date.toISOString().split('T')[0] ?? '';
						history.taskVolume.push({
							date: dateStr,
							count: tasksByDay.get(dateStr) ?? 0,
						});
					}

					// Build provider usage
					const providerCounts = new Map<string, number>();
					for (const task of completedTasks) {
						if (task.providerId && task.completedAt && task.completedAt >= sevenDaysAgo) {
							providerCounts.set(task.providerId, (providerCounts.get(task.providerId) ?? 0) + 1);
						}
					}

					for (const [provider, count] of providerCounts.entries()) {
						history.providerUsage.push({ provider, count });
					}

					// Build cost trend (simplified)
					for (let i = 6; i >= 0; i--) {
						const date = new Date(now);
						date.setDate(date.getDate() - i);
						history.costTrend.push({
							date: date.toISOString().split('T')[0] ?? '',
							subscription: 0,
							api: 0,
						});
					}
				}
			} else {
				// Fallback to sample data if no state store
				history.providerUsage = [
					{ provider: 'claude-code', count: 45 },
					{ provider: 'gemini-cli', count: 20 },
					{ provider: 'cursor-cli', count: 15 },
					{ provider: 'copilot-cli', count: 10 },
				];

				for (let i = 6; i >= 0; i--) {
					const date = new Date(now);
					date.setDate(date.getDate() - i);
					const dateStr = date.toISOString().split('T')[0] ?? '';
					history.taskVolume.push({
						date: dateStr,
						count: Math.floor(Math.random() * 50) + 10,
					});
					history.costTrend.push({
						date: dateStr,
						subscription: Math.random() * 20,
						api: Math.random() * 5,
					});
				}
			}
		} catch {
			// Return empty history on error
		}

		return c.json(history);
	});

	return router;
}
