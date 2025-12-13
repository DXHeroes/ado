/**
 * Parallel Execution Module
 *
 * Parallel task scheduling, worker pools, and execution coordination.
 */

export * from './parallel-scheduler.js';
export * from './dynamic-worker-pool.js';
export * from './k8s-autoscaler.js';
export * from './cost-aware-load-balancer.js';
export * from './work-stealing-scheduler.js';
export * from './cost-optimizer.js';
export * from './merge-coordinator.js';

export {
	ParallelScheduler,
	LocalWorkerPool,
	createParallelScheduler,
	createLocalWorkerPool,
	type TaskExecution,
	type SchedulerConfig,
	type SchedulerResult,
	type WorkerPool,
} from './parallel-scheduler.js';

export {
	DynamicWorkerPool,
	createDynamicWorkerPool,
	type DynamicWorkerPoolConfig,
	type WorkerInstance,
	type ScalingMetrics,
} from './dynamic-worker-pool.js';

export {
	K8sAutoscaler,
	createK8sAutoscaler,
	type HPAConfig,
	type HPAStatus,
	type CustomMetric,
} from './k8s-autoscaler.js';

export {
	CostAwareLoadBalancer,
	createCostAwareLoadBalancer,
	type LoadBalancerConfig,
	type WorkerCostProfile,
	type TaskRoutingDecision,
	type LoadBalancerMetrics,
} from './cost-aware-load-balancer.js';

export {
	WorkStealingScheduler,
	createWorkStealingScheduler,
	type WorkStealingConfig,
	type Task,
	type WorkerQueue,
	type StealResult,
	type WorkStealingMetrics,
} from './work-stealing-scheduler.js';

export {
	CostOptimizer,
	createCostOptimizer,
	type OptimizationGoal,
	type WorkloadPattern,
	type CostOptimizationRecommendation,
	type CostForecast,
	type OptimizerMetrics,
} from './cost-optimizer.js';

export {
	MergeCoordinator,
	createMergeCoordinator,
	type ConflictInfo,
	type MergeStrategy,
	type MergeResult,
	type MergeCoordinatorConfig,
	type WorkerChanges,
	type MergeMetrics,
} from './merge-coordinator.js';
