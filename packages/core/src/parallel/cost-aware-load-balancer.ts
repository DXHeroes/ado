/**
 * Cost-Aware Load Balancer
 *
 * Routes tasks to workers based on cost optimization.
 * Balances cost vs performance tradeoffs.
 */

import type { CostTracker } from '../cost/tracker.js';

export interface WorkerCostProfile {
	/**
	 * Worker ID
	 */
	workerId: string;

	/**
	 * Cost per hour (USD)
	 */
	costPerHour: number;

	/**
	 * Cost per task (USD)
	 */
	costPerTask?: number | undefined;

	/**
	 * Provider name
	 */
	provider: string;

	/**
	 * Performance tier (low, medium, high)
	 */
	performanceTier: 'low' | 'medium' | 'high';

	/**
	 * Current utilization (0-1)
	 */
	currentUtilization: number;

	/**
	 * Average task completion time (ms)
	 */
	avgCompletionTime: number;
}

export interface LoadBalancerConfig {
	/**
	 * Cost optimization strategy
	 */
	strategy: 'minimize-cost' | 'balanced' | 'maximize-performance';

	/**
	 * Maximum cost per task (USD)
	 */
	maxCostPerTask?: number | undefined;

	/**
	 * Cost weight (0-1, higher = prioritize cost more)
	 */
	costWeight: number;

	/**
	 * Performance weight (0-1, higher = prioritize performance more)
	 */
	performanceWeight: number;

	/**
	 * Budget limit per day (USD)
	 */
	dailyBudgetLimit?: number | undefined;

	/**
	 * Enable dynamic pricing adjustments
	 */
	enableDynamicPricing: boolean;
}

export interface TaskRoutingDecision {
	/**
	 * Selected worker ID
	 */
	workerId: string;

	/**
	 * Estimated cost (USD)
	 */
	estimatedCost: number;

	/**
	 * Estimated completion time (ms)
	 */
	estimatedCompletionTime: number;

	/**
	 * Decision score (0-1, higher is better)
	 */
	score: number;

	/**
	 * Reasoning
	 */
	reason: string;
}

export interface LoadBalancerMetrics {
	/**
	 * Total tasks routed
	 */
	totalTasksRouted: number;

	/**
	 * Total cost incurred (USD)
	 */
	totalCost: number;

	/**
	 * Average cost per task (USD)
	 */
	avgCostPerTask: number;

	/**
	 * Average completion time (ms)
	 */
	avgCompletionTime: number;

	/**
	 * Cost savings vs highest cost option (%)
	 */
	costSavingsPercent: number;

	/**
	 * Budget utilization (%)
	 */
	budgetUtilization?: number | undefined;
}

/**
 * Cost-aware load balancer
 */
export class CostAwareLoadBalancer {
	private config: LoadBalancerConfig;
	private workerProfiles: Map<string, WorkerCostProfile> = new Map();
	private routingHistory: TaskRoutingDecision[] = [];
	private costTracker: CostTracker;

	constructor(costTracker: CostTracker, config?: Partial<LoadBalancerConfig>) {
		this.costTracker = costTracker;
		this.config = {
			strategy: 'balanced',
			costWeight: 0.5,
			performanceWeight: 0.5,
			enableDynamicPricing: true,
			...config,
		};
	}

	/**
	 * Register worker with cost profile
	 */
	registerWorker(profile: WorkerCostProfile): void {
		this.workerProfiles.set(profile.workerId, profile);
	}

	/**
	 * Update worker profile
	 */
	updateWorkerProfile(workerId: string, updates: Partial<WorkerCostProfile>): void {
		const profile = this.workerProfiles.get(workerId);
		if (!profile) {
			throw new Error(`Worker not found: ${workerId}`);
		}

		Object.assign(profile, updates);
	}

	/**
	 * Route task to optimal worker
	 */
	async routeTask(taskEstimate: {
		estimatedDuration?: number | undefined;
		complexity?: 'simple' | 'moderate' | 'complex' | undefined;
	}): Promise<TaskRoutingDecision> {
		// Get available workers
		const availableWorkers = Array.from(this.workerProfiles.values()).filter(
			(w) => w.currentUtilization < 0.9, // Not overloaded
		);

		if (availableWorkers.length === 0) {
			throw new Error('No available workers');
		}

		// Check budget constraint
		if (this.config.dailyBudgetLimit) {
			const todayCosts = await this.getTodayCosts();
			if (todayCosts >= this.config.dailyBudgetLimit) {
				throw new Error('Daily budget limit reached');
			}
		}

		// Score each worker
		const scores = availableWorkers.map((worker) => {
			const score = this.calculateWorkerScore(worker, taskEstimate);
			const estimatedCost = this.estimateTaskCost(worker, taskEstimate);
			const estimatedTime = this.estimateCompletionTime(worker, taskEstimate);

			return {
				workerId: worker.workerId,
				score,
				estimatedCost,
				estimatedCompletionTime: estimatedTime,
			};
		});

		// Sort by score (descending)
		scores.sort((a, b) => b.score - a.score);

		// Select best worker
		const best = scores[0];
		if (!best) {
			throw new Error('No suitable worker found');
		}

		// Check cost constraint
		if (this.config.maxCostPerTask && best.estimatedCost > this.config.maxCostPerTask) {
			throw new Error(
				`Task cost ($${best.estimatedCost.toFixed(4)}) exceeds maximum ($${this.config.maxCostPerTask})`,
			);
		}

		const decision: TaskRoutingDecision = {
			workerId: best.workerId,
			estimatedCost: best.estimatedCost,
			estimatedCompletionTime: best.estimatedCompletionTime,
			score: best.score,
			reason: this.generateReason(best.workerId, best.score),
		};

		// Record decision
		this.routingHistory.push(decision);

		return decision;
	}

	/**
	 * Calculate worker score for task
	 */
	private calculateWorkerScore(
		worker: WorkerCostProfile,
		taskEstimate: {
			estimatedDuration?: number | undefined;
			complexity?: 'simple' | 'moderate' | 'complex' | undefined;
		},
	): number {
		// Normalize cost (lower is better)
		const maxCost = Math.max(...Array.from(this.workerProfiles.values()).map((w) => w.costPerHour));
		const costScore = 1 - worker.costPerHour / maxCost;

		// Normalize performance (higher is better)
		const performanceScore = this.getPerformanceScore(worker.performanceTier);

		// Normalize utilization (lower is better, but not too low)
		const utilizationScore = 1 - Math.abs(worker.currentUtilization - 0.7) / 0.7;

		// Task complexity match
		const complexityMatch = this.getComplexityMatch(
			worker.performanceTier,
			taskEstimate.complexity ?? 'moderate',
		);

		// Strategy-based weighting
		let score: number;

		if (this.config.strategy === 'minimize-cost') {
			score = costScore * 0.7 + performanceScore * 0.2 + utilizationScore * 0.1;
		} else if (this.config.strategy === 'maximize-performance') {
			score = performanceScore * 0.7 + costScore * 0.2 + utilizationScore * 0.1;
		} else {
			// Balanced
			score =
				costScore * this.config.costWeight +
				performanceScore * this.config.performanceWeight +
				utilizationScore * 0.1;
		}

		// Apply complexity match bonus
		score *= complexityMatch;

		return Math.max(0, Math.min(1, score));
	}

	/**
	 * Get performance score for tier
	 */
	private getPerformanceScore(tier: 'low' | 'medium' | 'high'): number {
		const scores = { low: 0.3, medium: 0.6, high: 1.0 };
		return scores[tier];
	}

	/**
	 * Get complexity match score
	 */
	private getComplexityMatch(
		tier: 'low' | 'medium' | 'high',
		complexity: 'simple' | 'moderate' | 'complex',
	): number {
		// Perfect match bonus
		if (
			(tier === 'low' && complexity === 'simple') ||
			(tier === 'medium' && complexity === 'moderate') ||
			(tier === 'high' && complexity === 'complex')
		) {
			return 1.2;
		}

		// Acceptable match
		if (
			(tier === 'medium' && complexity === 'simple') ||
			(tier === 'high' && complexity === 'moderate')
		) {
			return 1.0;
		}

		// Suboptimal match
		return 0.8;
	}

	/**
	 * Estimate task cost
	 */
	private estimateTaskCost(
		worker: WorkerCostProfile,
		taskEstimate: { estimatedDuration?: number | undefined },
	): number {
		// Use per-task cost if available
		if (worker.costPerTask) {
			return worker.costPerTask;
		}

		// Otherwise calculate from hourly rate
		const durationHours =
			(taskEstimate.estimatedDuration ?? worker.avgCompletionTime) / (1000 * 60 * 60);
		return worker.costPerHour * durationHours;
	}

	/**
	 * Estimate completion time
	 */
	private estimateCompletionTime(
		worker: WorkerCostProfile,
		taskEstimate: { estimatedDuration?: number | undefined },
	): number {
		return taskEstimate.estimatedDuration ?? worker.avgCompletionTime;
	}

	/**
	 * Generate reasoning for decision
	 */
	private generateReason(workerId: string, score: number): string {
		const worker = this.workerProfiles.get(workerId);
		if (!worker) return 'Selected best available worker';

		const reasons: string[] = [];

		if (this.config.strategy === 'minimize-cost') {
			reasons.push(`lowest cost ($${worker.costPerHour.toFixed(2)}/hr)`);
		} else if (this.config.strategy === 'maximize-performance') {
			reasons.push(`highest performance (${worker.performanceTier})`);
		} else {
			reasons.push('best cost/performance balance');
		}

		reasons.push(`utilization: ${(worker.currentUtilization * 100).toFixed(0)}%`);
		reasons.push(`score: ${score.toFixed(2)}`);

		return reasons.join(', ');
	}

	/**
	 * Get today's costs
	 */
	private async getTodayCosts(): Promise<number> {
		// Get daily cost from cost tracker
		return await this.costTracker.getDailyCost();
	}

	/**
	 * Get load balancer metrics
	 */
	async getMetrics(): Promise<LoadBalancerMetrics> {
		const totalTasks = this.routingHistory.length;
		const totalCost = this.routingHistory.reduce((sum, d) => sum + d.estimatedCost, 0);

		// Calculate highest cost option
		const maxCostPerTask = Math.max(
			...Array.from(this.workerProfiles.values()).map((w) => w.costPerHour),
		);
		const potentialMaxCost = totalTasks * maxCostPerTask;
		const costSavings =
			potentialMaxCost > 0 ? ((potentialMaxCost - totalCost) / potentialMaxCost) * 100 : 0;

		const avgCompletionTime =
			this.routingHistory.reduce((sum, d) => sum + d.estimatedCompletionTime, 0) /
			(totalTasks || 1);

		let budgetUtilization: number | undefined;
		if (this.config.dailyBudgetLimit) {
			const todayCosts = await this.getTodayCosts();
			budgetUtilization = (todayCosts / this.config.dailyBudgetLimit) * 100;
		}

		return {
			totalTasksRouted: totalTasks,
			totalCost,
			avgCostPerTask: totalCost / (totalTasks || 1),
			avgCompletionTime,
			costSavingsPercent: costSavings,
			budgetUtilization,
		};
	}

	/**
	 * Reset routing history
	 */
	resetHistory(): void {
		this.routingHistory = [];
	}

	/**
	 * Get worker profiles
	 */
	getWorkerProfiles(): WorkerCostProfile[] {
		return Array.from(this.workerProfiles.values());
	}
}

/**
 * Create cost-aware load balancer
 */
export function createCostAwareLoadBalancer(
	costTracker: CostTracker,
	config?: Partial<LoadBalancerConfig>,
): CostAwareLoadBalancer {
	return new CostAwareLoadBalancer(costTracker, config);
}
