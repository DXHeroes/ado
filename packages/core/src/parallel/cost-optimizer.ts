/**
 * Cost Optimizer
 *
 * Analyzes costs and recommends optimizations for parallel execution.
 */

import type { CostTracker } from '../cost/tracker.js';
import type { LoadBalancerMetrics, WorkerCostProfile } from './cost-aware-load-balancer.js';

export interface OptimizationGoal {
	/**
	 * Primary goal
	 */
	primary: 'minimize-cost' | 'maximize-performance' | 'balance';

	/**
	 * Maximum acceptable cost per task (USD)
	 */
	maxCostPerTask?: number | undefined;

	/**
	 * Minimum acceptable performance (tasks/hour)
	 */
	minThroughput?: number | undefined;

	/**
	 * Maximum acceptable latency (ms)
	 */
	maxLatency?: number | undefined;

	/**
	 * Budget constraint per day (USD)
	 */
	dailyBudget?: number | undefined;
}

export interface WorkloadPattern {
	/**
	 * Average tasks per hour
	 */
	avgTasksPerHour: number;

	/**
	 * Peak tasks per hour
	 */
	peakTasksPerHour: number;

	/**
	 * Average task duration (ms)
	 */
	avgTaskDuration: number;

	/**
	 * Task complexity distribution
	 */
	complexityDistribution: {
		simple: number; // percentage
		moderate: number;
		complex: number;
	};

	/**
	 * Time patterns (hourly usage)
	 */
	hourlyPattern: number[]; // 24 values, 0-1 indicating load
}

export interface CostOptimizationRecommendation {
	/**
	 * Recommendation type
	 */
	type:
		| 'reduce-workers'
		| 'increase-workers'
		| 'change-tier'
		| 'change-provider'
		| 'adjust-strategy'
		| 'schedule-optimization';

	/**
	 * Priority (1-5, higher = more important)
	 */
	priority: number;

	/**
	 * Description
	 */
	description: string;

	/**
	 * Estimated savings (USD/day)
	 */
	estimatedSavings: number;

	/**
	 * Impact on performance (-1 to 1, negative = slower, positive = faster)
	 */
	performanceImpact: number;

	/**
	 * Specific action
	 */
	action: {
		type: string;
		details: Record<string, unknown>;
	};
}

export interface CostForecast {
	/**
	 * Forecasted daily cost (USD)
	 */
	dailyCost: number;

	/**
	 * Forecasted monthly cost (USD)
	 */
	monthlyCost: number;

	/**
	 * Confidence level (0-1)
	 */
	confidence: number;

	/**
	 * Cost breakdown by worker tier
	 */
	byTier: Record<string, number>;

	/**
	 * Trend (increasing, stable, decreasing)
	 */
	trend: 'increasing' | 'stable' | 'decreasing';
}

export interface OptimizerMetrics {
	/**
	 * Current cost efficiency (tasks per dollar)
	 */
	costEfficiency: number;

	/**
	 * Optimal cost efficiency achievable
	 */
	optimalEfficiency: number;

	/**
	 * Optimization potential (percentage)
	 */
	optimizationPotential: number;

	/**
	 * Current vs recommended costs
	 */
	costs: {
		current: number;
		recommended: number;
		savings: number;
	};
}

/**
 * Cost optimizer
 */
export class CostOptimizer {
	private costTracker: CostTracker;
	private workerProfiles: WorkerCostProfile[] = [];
	private loadBalancerMetrics?: LoadBalancerMetrics | undefined;
	private workloadPattern?: WorkloadPattern | undefined;

	constructor(costTracker: CostTracker, _goal?: OptimizationGoal) {
		// TODO: Use goal for optimization decisions
		this.costTracker = costTracker;
	}

	/**
	 * Update worker profiles
	 */
	updateWorkerProfiles(profiles: WorkerCostProfile[]): void {
		this.workerProfiles = profiles;
	}

	/**
	 * Update load balancer metrics
	 */
	updateMetrics(metrics: LoadBalancerMetrics): void {
		this.loadBalancerMetrics = metrics;
	}

	/**
	 * Update workload pattern
	 */
	updateWorkloadPattern(pattern: WorkloadPattern): void {
		this.workloadPattern = pattern;
	}

	/**
	 * Generate optimization recommendations
	 */
	async getRecommendations(): Promise<CostOptimizationRecommendation[]> {
		const recommendations: CostOptimizationRecommendation[] = [];

		// Analyze worker utilization
		const utilizationRecs = this.analyzeWorkerUtilization();
		recommendations.push(...utilizationRecs);

		// Analyze tier selection
		const tierRecs = this.analyzeTierSelection();
		recommendations.push(...tierRecs);

		// Analyze scheduling opportunities
		if (this.workloadPattern) {
			const scheduleRecs = this.analyzeSchedulingOpportunities();
			recommendations.push(...scheduleRecs);
		}

		// Analyze strategy effectiveness
		if (this.loadBalancerMetrics) {
			const strategyRecs = this.analyzeStrategy();
			recommendations.push(...strategyRecs);
		}

		// Sort by priority and estimated savings
		return recommendations.sort((a, b) => {
			if (a.priority !== b.priority) {
				return b.priority - a.priority;
			}
			return b.estimatedSavings - a.estimatedSavings;
		});
	}

	/**
	 * Analyze worker utilization
	 */
	private analyzeWorkerUtilization(): CostOptimizationRecommendation[] {
		const recommendations: CostOptimizationRecommendation[] = [];

		// Check for underutilized workers
		const underutilized = this.workerProfiles.filter((w) => w.currentUtilization < 0.3);

		if (underutilized.length > 0) {
			const avgCost = underutilized.reduce((sum, w) => sum + w.costPerHour, 0) / underutilized.length;
			const dailySavings = avgCost * 24 * underutilized.length;

			recommendations.push({
				type: 'reduce-workers',
				priority: 4,
				description: `${underutilized.length} worker(s) are underutilized (<30%). Consider reducing worker count.`,
				estimatedSavings: dailySavings,
				performanceImpact: -0.1,
				action: {
					type: 'scale-down',
					details: {
						currentWorkers: this.workerProfiles.length,
						recommendedWorkers: this.workerProfiles.length - underutilized.length,
						workersToRemove: underutilized.map((w) => w.workerId),
					},
				},
			});
		}

		// Check for overutilized workers
		const overutilized = this.workerProfiles.filter((w) => w.currentUtilization > 0.9);

		if (overutilized.length > this.workerProfiles.length * 0.5) {
			recommendations.push({
				type: 'increase-workers',
				priority: 3,
				description: `${overutilized.length} worker(s) are overutilized (>90%). Consider adding workers.`,
				estimatedSavings: 0,
				performanceImpact: 0.3,
				action: {
					type: 'scale-up',
					details: {
						currentWorkers: this.workerProfiles.length,
						recommendedWorkers: this.workerProfiles.length + Math.ceil(overutilized.length * 0.3),
					},
				},
			});
		}

		return recommendations;
	}

	/**
	 * Analyze tier selection
	 */
	private analyzeTierSelection(): CostOptimizationRecommendation[] {
		const recommendations: CostOptimizationRecommendation[] = [];

		// Group by tier
		const byTier: Record<'low' | 'medium' | 'high', WorkerCostProfile[]> = {
			low: [],
			medium: [],
			high: [],
		};

		for (const worker of this.workerProfiles) {
			const tier = byTier[worker.performanceTier];
			if (tier) {
				tier.push(worker);
			}
		}

		// Check if we're using too many high-tier workers
		const highTierWorkers = byTier.high;
		const highTierCount = highTierWorkers.length;
		const highTierUtilization =
			highTierWorkers.reduce((sum, w) => sum + w.currentUtilization, 0) / (highTierCount || 1);

		if (highTierCount > 0 && highTierUtilization < 0.5) {
			const avgHighCost = highTierWorkers.reduce((sum, w) => sum + w.costPerHour, 0) / highTierCount;
			const mediumTierWorkers = byTier.medium;
			const avgMediumCost =
				mediumTierWorkers.reduce((sum, w) => sum + w.costPerHour, 0) / (mediumTierWorkers.length || 1);

			const potentialSavings = (avgHighCost - avgMediumCost) * 24 * highTierCount;

			if (potentialSavings > 0) {
				recommendations.push({
					type: 'change-tier',
					priority: 5,
					description: `High-tier workers are underutilized. Downgrade ${highTierCount} worker(s) to medium-tier.`,
					estimatedSavings: potentialSavings,
					performanceImpact: -0.2,
					action: {
						type: 'change-tier',
						details: {
							from: 'high',
							to: 'medium',
							workerCount: highTierCount,
						},
					},
				});
			}
		}

		return recommendations;
	}

	/**
	 * Analyze scheduling opportunities
	 */
	private analyzeSchedulingOpportunities(): CostOptimizationRecommendation[] {
		const recommendations: CostOptimizationRecommendation[] = [];

		if (!this.workloadPattern) {
			return recommendations;
		}

		// Find low-usage hours
		const lowUsageHours = this.workloadPattern.hourlyPattern
			.map((usage, hour) => ({ hour, usage }))
			.filter((h) => h.usage < 0.3)
			.map((h) => h.hour);

		if (lowUsageHours.length >= 6) {
			const avgWorkerCost = this.workerProfiles.reduce((sum, w) => sum + w.costPerHour, 0) /
				(this.workerProfiles.length || 1);

			const dailySavings = avgWorkerCost * lowUsageHours.length * 0.5;

			recommendations.push({
				type: 'schedule-optimization',
				priority: 3,
				description: `${lowUsageHours.length} hours have low usage. Consider scaling down during off-peak hours.`,
				estimatedSavings: dailySavings,
				performanceImpact: 0,
				action: {
					type: 'schedule-scaling',
					details: {
						lowUsageHours,
						recommendedScaleDown: 0.5,
					},
				},
			});
		}

		return recommendations;
	}

	/**
	 * Analyze strategy effectiveness
	 */
	private analyzeStrategy(): CostOptimizationRecommendation[] {
		const recommendations: CostOptimizationRecommendation[] = [];

		if (!this.loadBalancerMetrics) {
			return recommendations;
		}

		// Check if we're achieving cost savings
		if (this.loadBalancerMetrics.costSavingsPercent < 10) {
			recommendations.push({
				type: 'adjust-strategy',
				priority: 2,
				description:
					'Current routing strategy achieves low cost savings. Consider changing to "minimize-cost" strategy.',
				estimatedSavings: this.loadBalancerMetrics.totalCost * 0.15,
				performanceImpact: -0.1,
				action: {
					type: 'change-strategy',
					details: {
						currentStrategy: 'balanced',
						recommendedStrategy: 'minimize-cost',
					},
				},
			});
		}

		return recommendations;
	}

	/**
	 * Forecast future costs
	 */
	async forecastCosts(daysAhead: number): Promise<CostForecast> {
		const historicalCost = await this.costTracker.getDailyCost();

		// Simple linear projection (in real implementation, use time series analysis)
		const dailyCost = historicalCost;
		const monthlyCost = dailyCost * 30;

		// Calculate by tier
		const byTier: Record<'low' | 'medium' | 'high', number> = {
			low: 0,
			medium: 0,
			high: 0,
		};

		for (const worker of this.workerProfiles) {
			const tier = worker.performanceTier;
			byTier[tier] += worker.costPerHour * 24 * daysAhead;
		}

		// Determine trend
		const trend: 'increasing' | 'stable' | 'decreasing' = 'stable';

		return {
			dailyCost,
			monthlyCost,
			confidence: 0.7,
			byTier,
			trend,
		};
	}

	/**
	 * Get optimizer metrics
	 */
	getMetrics(): OptimizerMetrics {
		const currentCost = this.loadBalancerMetrics?.totalCost ?? 0;
		const taskCount = this.loadBalancerMetrics?.totalTasksRouted ?? 1;

		const costEfficiency = taskCount / (currentCost || 1);

		// Calculate optimal efficiency (using cheapest workers)
		const cheapestWorker = this.workerProfiles.reduce(
			(min, w) => (w.costPerHour < min.costPerHour ? w : min),
			this.workerProfiles[0] ?? { costPerHour: 0, avgCompletionTime: 1000 },
		);

		const optimalCostPerTask =
			(cheapestWorker.costPerHour * cheapestWorker.avgCompletionTime) / (1000 * 60 * 60);

		const optimalEfficiency = 1 / (optimalCostPerTask || 1);

		const optimizationPotential = ((optimalEfficiency - costEfficiency) / optimalEfficiency) * 100;

		const recommendedCost = currentCost * (1 - optimizationPotential / 100);
		const savings = currentCost - recommendedCost;

		return {
			costEfficiency,
			optimalEfficiency,
			optimizationPotential: Math.max(0, optimizationPotential),
			costs: {
				current: currentCost,
				recommended: recommendedCost,
				savings,
			},
		};
	}

	/**
	 * Apply recommendation
	 */
	applyRecommendation(_recommendation: CostOptimizationRecommendation): void {
		// TODO: Implement recommendation application
		// This would integrate with the load balancer and worker pool to apply changes
	}
}

/**
 * Create cost optimizer
 */
export function createCostOptimizer(costTracker: CostTracker, goal?: OptimizationGoal): CostOptimizer {
	return new CostOptimizer(costTracker, goal);
}
