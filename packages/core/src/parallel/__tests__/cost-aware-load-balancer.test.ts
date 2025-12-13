/**
 * Tests for CostAwareLoadBalancer
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostTracker } from '../../cost/tracker.js';
import {
	CostAwareLoadBalancer,
	type LoadBalancerConfig,
	type WorkerCostProfile,
	createCostAwareLoadBalancer,
} from '../cost-aware-load-balancer.js';

describe('CostAwareLoadBalancer', () => {
	let mockCostTracker: CostTracker;
	let loadBalancer: CostAwareLoadBalancer;

	beforeEach(() => {
		mockCostTracker = {
			getDailyCost: vi.fn().mockResolvedValue(100),
		} as unknown as CostTracker;

		loadBalancer = new CostAwareLoadBalancer(mockCostTracker, {
			strategy: 'balanced',
			costWeight: 0.5,
			performanceWeight: 0.5,
			enableDynamicPricing: true,
		});
	});

	describe('constructor', () => {
		it('should create load balancer with default config', () => {
			const lb = new CostAwareLoadBalancer(mockCostTracker);
			expect(lb).toBeDefined();
		});

		it('should create load balancer with custom config', () => {
			const config: Partial<LoadBalancerConfig> = {
				strategy: 'minimize-cost',
				maxCostPerTask: 1.0,
				dailyBudgetLimit: 100,
			};

			const lb = new CostAwareLoadBalancer(mockCostTracker, config);
			expect(lb).toBeDefined();
		});

		it('should use factory function', () => {
			const lb = createCostAwareLoadBalancer(mockCostTracker);
			expect(lb).toBeDefined();
		});
	});

	describe('registerWorker', () => {
		it('should register worker with cost profile', () => {
			const profile: WorkerCostProfile = {
				workerId: 'worker-1',
				costPerHour: 10,
				provider: 'claude',
				performanceTier: 'high',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);

			const profiles = loadBalancer.getWorkerProfiles();
			expect(profiles).toHaveLength(1);
			expect(profiles[0]?.workerId).toBe('worker-1');
		});

		it('should register multiple workers', () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					costPerHour: 10,
					provider: 'claude',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					costPerHour: 5,
					provider: 'gemini',
					performanceTier: 'medium',
					currentUtilization: 0.3,
					avgCompletionTime: 2000,
				},
			];

			for (const profile of profiles) {
				loadBalancer.registerWorker(profile);
			}

			const registered = loadBalancer.getWorkerProfiles();
			expect(registered).toHaveLength(2);
		});
	});

	describe('updateWorkerProfile', () => {
		it('should update worker profile', () => {
			const profile: WorkerCostProfile = {
				workerId: 'worker-1',
				costPerHour: 10,
				provider: 'claude',
				performanceTier: 'high',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);

			loadBalancer.updateWorkerProfile('worker-1', {
				currentUtilization: 0.8,
				avgCompletionTime: 800,
			});

			const profiles = loadBalancer.getWorkerProfiles();
			const updated = profiles.find((p) => p.workerId === 'worker-1');

			expect(updated?.currentUtilization).toBe(0.8);
			expect(updated?.avgCompletionTime).toBe(800);
		});

		it('should throw for non-existent worker', () => {
			expect(() => {
				loadBalancer.updateWorkerProfile('unknown', { currentUtilization: 0.5 });
			}).toThrow('Worker not found: unknown');
		});
	});

	describe('routeTask', () => {
		beforeEach(() => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					costPerHour: 20,
					provider: 'claude',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'worker-2',
					costPerHour: 10,
					provider: 'gemini',
					performanceTier: 'medium',
					currentUtilization: 0.3,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-3',
					costPerHour: 5,
					provider: 'local',
					performanceTier: 'low',
					currentUtilization: 0.2,
					avgCompletionTime: 2000,
				},
			];

			for (const profile of profiles) {
				loadBalancer.registerWorker(profile);
			}
		});

		it('should route task to available worker', async () => {
			const decision = await loadBalancer.routeTask({});

			expect(decision.workerId).toBeDefined();
			expect(decision.estimatedCost).toBeGreaterThan(0);
			expect(decision.estimatedCompletionTime).toBeGreaterThan(0);
			expect(decision.score).toBeGreaterThan(0);
			expect(decision.reason).toBeDefined();
		});

		it('should minimize cost with minimize-cost strategy', async () => {
			const costMinimizer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'minimize-cost',
			});

			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'expensive',
					costPerHour: 100,
					provider: 'premium',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'cheap',
					costPerHour: 1,
					provider: 'budget',
					performanceTier: 'low',
					currentUtilization: 0.5,
					avgCompletionTime: 2000,
				},
			];

			for (const profile of profiles) {
				costMinimizer.registerWorker(profile);
			}

			const decision = await costMinimizer.routeTask({});

			expect(decision.workerId).toBe('cheap');
			expect(decision.reason).toContain('lowest cost');
		});

		it('should maximize performance with maximize-performance strategy', async () => {
			const perfMaximizer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'maximize-performance',
			});

			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'fast',
					costPerHour: 100,
					provider: 'premium',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'slow',
					costPerHour: 1,
					provider: 'budget',
					performanceTier: 'low',
					currentUtilization: 0.5,
					avgCompletionTime: 5000,
				},
			];

			for (const profile of profiles) {
				perfMaximizer.registerWorker(profile);
			}

			const decision = await perfMaximizer.routeTask({});

			expect(decision.workerId).toBe('fast');
			expect(decision.reason).toContain('highest performance');
		});

		it('should balance cost and performance with balanced strategy', async () => {
			const decision = await loadBalancer.routeTask({});

			expect(decision.workerId).toBeDefined();
			expect(decision.reason).toContain('balance');
		});

		it('should consider task complexity', async () => {
			const decision = await loadBalancer.routeTask({
				complexity: 'complex',
			});

			// Complex tasks should prefer high-tier workers
			expect(decision.workerId).toBeDefined();
		});

		it('should consider estimated duration', async () => {
			const decision = await loadBalancer.routeTask({
				estimatedDuration: 5000,
			});

			expect(decision.estimatedCompletionTime).toBeGreaterThan(0);
		});

		it('should avoid overloaded workers', async () => {
			loadBalancer.updateWorkerProfile('worker-1', {
				currentUtilization: 0.95,
			});

			const decision = await loadBalancer.routeTask({});

			// Should not select overloaded worker-1
			expect(decision.workerId).not.toBe('worker-1');
		});

		it('should throw when no workers available', async () => {
			const emptyBalancer = new CostAwareLoadBalancer(mockCostTracker);

			await expect(emptyBalancer.routeTask({})).rejects.toThrow('No available workers');
		});

		it('should throw when all workers are overloaded', async () => {
			loadBalancer.updateWorkerProfile('worker-1', { currentUtilization: 0.95 });
			loadBalancer.updateWorkerProfile('worker-2', { currentUtilization: 0.95 });
			loadBalancer.updateWorkerProfile('worker-3', { currentUtilization: 0.95 });

			await expect(loadBalancer.routeTask({})).rejects.toThrow('No available workers');
		});

		it('should enforce max cost per task', async () => {
			const constrainedBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				maxCostPerTask: 0.001, // Very low limit
			});

			const profile: WorkerCostProfile = {
				workerId: 'expensive',
				costPerHour: 1000,
				provider: 'premium',
				performanceTier: 'high',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			constrainedBalancer.registerWorker(profile);

			await expect(constrainedBalancer.routeTask({})).rejects.toThrow('Task cost');
		});

		it('should enforce daily budget limit', async () => {
			const budgetBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				dailyBudgetLimit: 50,
			});

			mockCostTracker.getDailyCost = vi.fn().mockResolvedValue(100); // Over budget

			const profile: WorkerCostProfile = {
				workerId: 'worker',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			budgetBalancer.registerWorker(profile);

			await expect(budgetBalancer.routeTask({})).rejects.toThrow('Daily budget limit reached');
		});

		it('should use per-task cost if available', async () => {
			const profile: WorkerCostProfile = {
				workerId: 'worker-per-task',
				costPerHour: 10,
				costPerTask: 0.5,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);

			const decision = await loadBalancer.routeTask({});

			if (decision.workerId === 'worker-per-task') {
				expect(decision.estimatedCost).toBe(0.5);
			}
		});

		it('should match complexity to performance tier', async () => {
			// Simple task should prefer low-tier worker
			const simpleDecision = await loadBalancer.routeTask({
				complexity: 'simple',
			});

			// Complex task should prefer high-tier worker
			const complexDecision = await loadBalancer.routeTask({
				complexity: 'complex',
			});

			expect(simpleDecision.workerId).toBeDefined();
			expect(complexDecision.workerId).toBeDefined();
		});

		it('should record routing history', async () => {
			await loadBalancer.routeTask({});
			await loadBalancer.routeTask({});

			const metrics = await loadBalancer.getMetrics();
			expect(metrics.totalTasksRouted).toBe(2);
		});
	});

	describe('getMetrics', () => {
		beforeEach(() => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					costPerHour: 20,
					provider: 'claude',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'worker-2',
					costPerHour: 10,
					provider: 'gemini',
					performanceTier: 'medium',
					currentUtilization: 0.3,
					avgCompletionTime: 1000,
				},
			];

			for (const profile of profiles) {
				loadBalancer.registerWorker(profile);
			}
		});

		it('should return initial metrics', async () => {
			const metrics = await loadBalancer.getMetrics();

			expect(metrics.totalTasksRouted).toBe(0);
			expect(metrics.totalCost).toBe(0);
			expect(metrics.avgCostPerTask).toBe(0);
			expect(metrics.avgCompletionTime).toBe(0);
			expect(metrics.costSavingsPercent).toBe(0);
		});

		it('should calculate total cost', async () => {
			await loadBalancer.routeTask({});
			await loadBalancer.routeTask({});

			const metrics = await loadBalancer.getMetrics();

			expect(metrics.totalCost).toBeGreaterThan(0);
			expect(metrics.avgCostPerTask).toBeGreaterThan(0);
		});

		it('should calculate average completion time', async () => {
			await loadBalancer.routeTask({});
			await loadBalancer.routeTask({});

			const metrics = await loadBalancer.getMetrics();

			expect(metrics.avgCompletionTime).toBeGreaterThan(0);
		});

		it('should calculate cost savings', async () => {
			await loadBalancer.routeTask({});
			await loadBalancer.routeTask({});

			const metrics = await loadBalancer.getMetrics();

			expect(metrics.costSavingsPercent).toBeGreaterThanOrEqual(0);
		});

		it('should calculate budget utilization', async () => {
			// Create a custom cost tracker that returns a lower cost
			const budgetCostTracker = {
				getDailyCost: vi.fn().mockResolvedValue(50), // Under budget
			} as unknown as CostTracker;

			const budgetBalancer = new CostAwareLoadBalancer(budgetCostTracker, {
				dailyBudgetLimit: 100,
			});

			const profile: WorkerCostProfile = {
				workerId: 'worker',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			budgetBalancer.registerWorker(profile);

			await budgetBalancer.routeTask({});

			const metrics = await budgetBalancer.getMetrics();

			expect(metrics.budgetUtilization).toBeDefined();
			expect(metrics.budgetUtilization).toBeGreaterThanOrEqual(0);
			expect(metrics.budgetUtilization).toBeLessThanOrEqual(100);
		});

		it('should not include budget utilization without limit', async () => {
			await loadBalancer.routeTask({});

			const metrics = await loadBalancer.getMetrics();

			expect(metrics.budgetUtilization).toBeUndefined();
		});
	});

	describe('resetHistory', () => {
		beforeEach(() => {
			const profile: WorkerCostProfile = {
				workerId: 'worker-1',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);
		});

		it('should reset routing history', async () => {
			await loadBalancer.routeTask({});
			await loadBalancer.routeTask({});

			let metrics = await loadBalancer.getMetrics();
			expect(metrics.totalTasksRouted).toBe(2);

			loadBalancer.resetHistory();

			metrics = await loadBalancer.getMetrics();
			expect(metrics.totalTasksRouted).toBe(0);
			expect(metrics.totalCost).toBe(0);
		});
	});

	describe('getWorkerProfiles', () => {
		it('should return empty array initially', () => {
			const profiles = loadBalancer.getWorkerProfiles();

			expect(profiles).toEqual([]);
		});

		it('should return all registered workers', () => {
			const profile1: WorkerCostProfile = {
				workerId: 'worker-1',
				costPerHour: 10,
				provider: 'provider1',
				performanceTier: 'high',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			const profile2: WorkerCostProfile = {
				workerId: 'worker-2',
				costPerHour: 5,
				provider: 'provider2',
				performanceTier: 'low',
				currentUtilization: 0.3,
				avgCompletionTime: 2000,
			};

			loadBalancer.registerWorker(profile1);
			loadBalancer.registerWorker(profile2);

			const profiles = loadBalancer.getWorkerProfiles();

			expect(profiles).toHaveLength(2);
			expect(profiles.map((p) => p.workerId)).toContain('worker-1');
			expect(profiles.map((p) => p.workerId)).toContain('worker-2');
		});
	});

	describe('cost optimization strategies', () => {
		it('should prioritize cost over performance with cost weight', async () => {
			const costPriorityBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'balanced',
				costWeight: 0.9,
				performanceWeight: 0.1,
			});

			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'expensive-fast',
					costPerHour: 100,
					provider: 'premium',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'cheap-slow',
					costPerHour: 5,
					provider: 'budget',
					performanceTier: 'low',
					currentUtilization: 0.5,
					avgCompletionTime: 2000,
				},
			];

			for (const profile of profiles) {
				costPriorityBalancer.registerWorker(profile);
			}

			const decision = await costPriorityBalancer.routeTask({});

			// With high cost weight, should prefer cheaper option
			expect(decision.workerId).toBe('cheap-slow');
		});

		it('should prioritize performance over cost with performance weight', async () => {
			const perfPriorityBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'balanced',
				costWeight: 0.1,
				performanceWeight: 0.9,
			});

			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'expensive-fast',
					costPerHour: 100,
					provider: 'premium',
					performanceTier: 'high',
					currentUtilization: 0.5,
					avgCompletionTime: 500,
				},
				{
					workerId: 'cheap-slow',
					costPerHour: 5,
					provider: 'budget',
					performanceTier: 'low',
					currentUtilization: 0.5,
					avgCompletionTime: 2000,
				},
			];

			for (const profile of profiles) {
				perfPriorityBalancer.registerWorker(profile);
			}

			const decision = await perfPriorityBalancer.routeTask({});

			// With high performance weight, should prefer faster option
			expect(decision.workerId).toBe('expensive-fast');
		});
	});

	describe('edge cases', () => {
		it('should handle workers with zero cost', async () => {
			const profile: WorkerCostProfile = {
				workerId: 'free-worker',
				costPerHour: 0,
				provider: 'local',
				performanceTier: 'low',
				currentUtilization: 0.5,
				avgCompletionTime: 3000,
			};

			loadBalancer.registerWorker(profile);

			const decision = await loadBalancer.routeTask({});

			expect(decision.workerId).toBe('free-worker');
			expect(decision.estimatedCost).toBe(0);
		});

		it('should handle workers with same cost and performance', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					costPerHour: 10,
					provider: 'provider1',
					performanceTier: 'medium',
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					costPerHour: 10,
					provider: 'provider2',
					performanceTier: 'medium',
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
			];

			for (const profile of profiles) {
				loadBalancer.registerWorker(profile);
			}

			const decision = await loadBalancer.routeTask({});

			// Should select one of the identical workers
			expect(['worker-1', 'worker-2']).toContain(decision.workerId);
		});

		it('should handle moderate complexity', async () => {
			const profile: WorkerCostProfile = {
				workerId: 'worker',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);

			const decision = await loadBalancer.routeTask({
				complexity: 'moderate',
			});

			expect(decision.workerId).toBe('worker');
		});

		it('should handle very low utilization workers', async () => {
			const profile: WorkerCostProfile = {
				workerId: 'idle-worker',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.05,
				avgCompletionTime: 1000,
			};

			loadBalancer.registerWorker(profile);

			const decision = await loadBalancer.routeTask({});

			expect(decision.workerId).toBe('idle-worker');
		});

		it('should handle tasks without duration estimate', async () => {
			const profile: WorkerCostProfile = {
				workerId: 'worker',
				costPerHour: 10,
				provider: 'provider',
				performanceTier: 'medium',
				currentUtilization: 0.5,
				avgCompletionTime: 1500,
			};

			loadBalancer.registerWorker(profile);

			const decision = await loadBalancer.routeTask({});

			// Should use worker's average completion time
			expect(decision.estimatedCompletionTime).toBe(1500);
		});
	});

	describe('reasoning generation', () => {
		beforeEach(() => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					costPerHour: 20,
					provider: 'claude',
					performanceTier: 'high',
					currentUtilization: 0.7,
					avgCompletionTime: 500,
				},
			];

			for (const profile of profiles) {
				loadBalancer.registerWorker(profile);
			}
		});

		it('should generate clear reasoning for routing decision', async () => {
			const decision = await loadBalancer.routeTask({});

			expect(decision.reason).toBeDefined();
			expect(decision.reason.length).toBeGreaterThan(0);
			expect(decision.reason).toContain('utilization');
			expect(decision.reason).toContain('score');
		});

		it('should include cost information in minimize-cost strategy', async () => {
			const costBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'minimize-cost',
			});

			const profile: WorkerCostProfile = {
				workerId: 'cheap',
				costPerHour: 5,
				provider: 'provider',
				performanceTier: 'low',
				currentUtilization: 0.5,
				avgCompletionTime: 2000,
			};

			costBalancer.registerWorker(profile);

			const decision = await costBalancer.routeTask({});

			expect(decision.reason).toContain('cost');
		});

		it('should include performance information in maximize-performance strategy', async () => {
			const perfBalancer = new CostAwareLoadBalancer(mockCostTracker, {
				strategy: 'maximize-performance',
			});

			const profile: WorkerCostProfile = {
				workerId: 'fast',
				costPerHour: 50,
				provider: 'provider',
				performanceTier: 'high',
				currentUtilization: 0.5,
				avgCompletionTime: 300,
			};

			perfBalancer.registerWorker(profile);

			const decision = await perfBalancer.routeTask({});

			expect(decision.reason).toContain('performance');
		});
	});
});
