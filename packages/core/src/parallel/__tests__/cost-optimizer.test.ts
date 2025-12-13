/**
 * Tests for CostOptimizer
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostTracker } from '../../cost/tracker.js';
import type { LoadBalancerMetrics } from '../cost-aware-load-balancer.js';
import {
	CostOptimizer,
	type OptimizationGoal,
	type WorkerCostProfile,
	type WorkloadPattern,
} from '../cost-optimizer.js';

describe('CostOptimizer', () => {
	let costTracker: CostTracker;
	let optimizer: CostOptimizer;

	beforeEach(() => {
		costTracker = {
			getDailyCost: vi.fn(async () => 100),
		} as unknown as CostTracker;

		optimizer = new CostOptimizer(costTracker);
	});

	describe('updateWorkerProfiles', () => {
		it('should update worker profiles', () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.8,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const recommendations = optimizer.getRecommendations();
			expect(recommendations).toBeDefined();
		});
	});

	describe('updateMetrics', () => {
		it('should update load balancer metrics', () => {
			const metrics: LoadBalancerMetrics = {
				totalTasksRouted: 100,
				totalCost: 50,
				costSavingsPercent: 20,
				routingStrategy: 'balanced',
			};

			optimizer.updateMetrics(metrics);

			const optimizerMetrics = optimizer.getMetrics();
			expect(optimizerMetrics.costs.current).toBe(50);
		});
	});

	describe('updateWorkloadPattern', () => {
		it('should update workload pattern', () => {
			const pattern: WorkloadPattern = {
				avgTasksPerHour: 10,
				peakTasksPerHour: 20,
				avgTaskDuration: 5000,
				complexityDistribution: {
					simple: 50,
					moderate: 30,
					complex: 20,
				},
				hourlyPattern: Array(24).fill(0.5),
			};

			optimizer.updateWorkloadPattern(pattern);

			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('getRecommendations', () => {
		it('should generate recommendations for underutilized workers', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.2,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.1,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const recommendations = await optimizer.getRecommendations();

			expect(recommendations.length).toBeGreaterThan(0);
			const scaleDownRec = recommendations.find((r) => r.type === 'reduce-workers');
			expect(scaleDownRec).toBeDefined();
			expect(scaleDownRec?.estimatedSavings).toBeGreaterThan(0);
		});

		it('should recommend scaling up for overutilized workers', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.95,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.92,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const recommendations = await optimizer.getRecommendations();

			const scaleUpRec = recommendations.find((r) => r.type === 'increase-workers');
			expect(scaleUpRec).toBeDefined();
			expect(scaleUpRec?.performanceImpact).toBeGreaterThan(0);
		});

		it('should recommend tier changes for underutilized high-tier workers', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 20,
					currentUtilization: 0.3,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'medium',
					costPerHour: 10,
					currentUtilization: 0.7,
					avgCompletionTime: 1500,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const recommendations = await optimizer.getRecommendations();

			const tierRec = recommendations.find((r) => r.type === 'change-tier');
			expect(tierRec).toBeDefined();
			expect(tierRec?.estimatedSavings).toBeGreaterThan(0);
		});

		it('should recommend scheduling optimizations for low-usage hours', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'medium',
					costPerHour: 10,
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
			];

			const pattern: WorkloadPattern = {
				avgTasksPerHour: 10,
				peakTasksPerHour: 20,
				avgTaskDuration: 5000,
				complexityDistribution: {
					simple: 50,
					moderate: 30,
					complex: 20,
				},
				hourlyPattern: Array(24)
					.fill(0)
					.map((_, i) => (i >= 22 || i <= 6 ? 0.1 : 0.8)),
			};

			optimizer.updateWorkerProfiles(profiles);
			optimizer.updateWorkloadPattern(pattern);

			const recommendations = await optimizer.getRecommendations();

			const scheduleRec = recommendations.find((r) => r.type === 'schedule-optimization');
			expect(scheduleRec).toBeDefined();
		});

		it('should recommend strategy changes for low cost savings', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'medium',
					costPerHour: 10,
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
			];

			const metrics: LoadBalancerMetrics = {
				totalTasksRouted: 100,
				totalCost: 100,
				costSavingsPercent: 5,
				routingStrategy: 'balanced',
			};

			optimizer.updateWorkerProfiles(profiles);
			optimizer.updateMetrics(metrics);

			const recommendations = await optimizer.getRecommendations();

			const strategyRec = recommendations.find((r) => r.type === 'adjust-strategy');
			expect(strategyRec).toBeDefined();
		});

		it('should sort recommendations by priority and savings', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 20,
					currentUtilization: 0.2,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'high',
					costPerHour: 20,
					currentUtilization: 0.1,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const recommendations = await optimizer.getRecommendations();

			// Verify sorting: higher priority first, then higher savings
			for (let i = 1; i < recommendations.length; i++) {
				const prev = recommendations[i - 1];
				const curr = recommendations[i];

				if (prev && curr) {
					if (prev.priority === curr.priority) {
						expect(prev.estimatedSavings).toBeGreaterThanOrEqual(curr.estimatedSavings);
					} else {
						expect(prev.priority).toBeGreaterThanOrEqual(curr.priority);
					}
				}
			}
		});
	});

	describe('forecastCosts', () => {
		it('should forecast future costs', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.8,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const forecast = await optimizer.forecastCosts(7);

			expect(forecast.dailyCost).toBeGreaterThan(0);
			expect(forecast.monthlyCost).toBeGreaterThan(0);
			expect(forecast.confidence).toBeGreaterThan(0);
			expect(forecast.confidence).toBeLessThanOrEqual(1);
		});

		it('should break down costs by tier', async () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 20,
					currentUtilization: 0.8,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'low',
					costPerHour: 5,
					currentUtilization: 0.5,
					avgCompletionTime: 2000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const forecast = await optimizer.forecastCosts(1);

			expect(forecast.byTier.high).toBeGreaterThan(0);
			expect(forecast.byTier.low).toBeGreaterThan(0);
		});
	});

	describe('getMetrics', () => {
		it('should calculate cost efficiency', () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 10,
					currentUtilization: 0.8,
					avgCompletionTime: 1000,
				},
			];

			const metrics: LoadBalancerMetrics = {
				totalTasksRouted: 100,
				totalCost: 50,
				costSavingsPercent: 20,
				routingStrategy: 'balanced',
			};

			optimizer.updateWorkerProfiles(profiles);
			optimizer.updateMetrics(metrics);

			const optimizerMetrics = optimizer.getMetrics();

			expect(optimizerMetrics.costEfficiency).toBeGreaterThan(0);
			expect(optimizerMetrics.optimalEfficiency).toBeGreaterThan(0);
			expect(optimizerMetrics.optimizationPotential).toBeGreaterThanOrEqual(0);
		});

		it('should calculate cost savings potential', () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'high',
					costPerHour: 20,
					currentUtilization: 0.8,
					avgCompletionTime: 1000,
				},
				{
					workerId: 'worker-2',
					performanceTier: 'low',
					costPerHour: 5,
					currentUtilization: 0.5,
					avgCompletionTime: 2000,
				},
			];

			const metrics: LoadBalancerMetrics = {
				totalTasksRouted: 100,
				totalCost: 100,
				costSavingsPercent: 10,
				routingStrategy: 'balanced',
			};

			optimizer.updateWorkerProfiles(profiles);
			optimizer.updateMetrics(metrics);

			const optimizerMetrics = optimizer.getMetrics();

			expect(optimizerMetrics.costs.current).toBe(100);
			expect(optimizerMetrics.costs.recommended).toBeLessThanOrEqual(100);
			expect(optimizerMetrics.costs.savings).toBeGreaterThanOrEqual(0);
		});
	});

	describe('optimization goals', () => {
		it('should support minimize-cost goal', () => {
			const goal: OptimizationGoal = {
				primary: 'minimize-cost',
				maxCostPerTask: 1.0,
			};

			const goalOptimizer = new CostOptimizer(costTracker, goal);

			expect(goalOptimizer).toBeDefined();
		});

		it('should support maximize-performance goal', () => {
			const goal: OptimizationGoal = {
				primary: 'maximize-performance',
				minThroughput: 100,
			};

			const goalOptimizer = new CostOptimizer(costTracker, goal);

			expect(goalOptimizer).toBeDefined();
		});

		it('should support balanced goal', () => {
			const goal: OptimizationGoal = {
				primary: 'balance',
				maxCostPerTask: 2.0,
				minThroughput: 50,
			};

			const goalOptimizer = new CostOptimizer(costTracker, goal);

			expect(goalOptimizer).toBeDefined();
		});
	});

	describe('edge cases', () => {
		it('should handle empty worker profiles', async () => {
			optimizer.updateWorkerProfiles([]);

			const recommendations = await optimizer.getRecommendations();

			expect(recommendations).toBeDefined();
			expect(Array.isArray(recommendations)).toBe(true);
		});

		it('should handle zero costs', () => {
			const profiles: WorkerCostProfile[] = [
				{
					workerId: 'worker-1',
					performanceTier: 'low',
					costPerHour: 0,
					currentUtilization: 0.5,
					avgCompletionTime: 1000,
				},
			];

			optimizer.updateWorkerProfiles(profiles);

			const metrics = optimizer.getMetrics();

			expect(metrics).toBeDefined();
			expect(metrics.costs.current).toBe(0);
		});
	});
});
