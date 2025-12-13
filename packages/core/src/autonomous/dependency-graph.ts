/**
 * Dependency Graph
 *
 * Models task dependencies and execution order for autonomous workflows.
 */

export interface TaskNode {
	id: string;
	type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'chore';
	description: string;
	estimatedDuration: number; // minutes
	priority: 'critical' | 'high' | 'medium' | 'low';
	dependencies: string[]; // Task IDs that must complete first
	parallel: boolean; // Can run in parallel with other tasks
	metadata: {
		files?: string[];
		testRequired?: boolean;
		reviewRequired?: boolean;
		breakingChange?: boolean;
	};
}

export interface ExecutionPlan {
	tasks: TaskNode[];
	stages: TaskStage[];
	estimatedTotalDuration: number; // minutes
	parallelizationFactor: number; // speedup with parallelization
}

export interface TaskStage {
	stage: number;
	tasks: string[]; // Task IDs that can run in parallel
	estimatedDuration: number;
}

/**
 * Dependency Graph Builder
 */
export class DependencyGraph {
	private nodes: Map<string, TaskNode> = new Map();
	private edges: Map<string, Set<string>> = new Map(); // from -> to

	/**
	 * Add task node to graph
	 */
	addTask(task: TaskNode): void {
		this.nodes.set(task.id, task);

		// Initialize edge set
		if (!this.edges.has(task.id)) {
			this.edges.set(task.id, new Set());
		}

		// Add dependency edges
		for (const depId of task.dependencies) {
			if (!this.edges.has(depId)) {
				this.edges.set(depId, new Set());
			}
			this.edges.get(depId)?.add(task.id);
		}
	}

	/**
	 * Get task by ID
	 */
	getTask(taskId: string): TaskNode | undefined {
		return this.nodes.get(taskId);
	}

	/**
	 * Get all tasks
	 */
	getAllTasks(): TaskNode[] {
		return Array.from(this.nodes.values());
	}

	/**
	 * Get tasks that depend on given task
	 */
	getDependents(taskId: string): TaskNode[] {
		const dependentIds = this.edges.get(taskId) ?? new Set();
		return Array.from(dependentIds)
			.map((id) => this.nodes.get(id))
			.filter((task): task is TaskNode => task !== undefined);
	}

	/**
	 * Get tasks that given task depends on
	 */
	getDependencies(taskId: string): TaskNode[] {
		const task = this.nodes.get(taskId);
		if (!task) return [];

		return task.dependencies
			.map((id) => this.nodes.get(id))
			.filter((task): task is TaskNode => task !== undefined);
	}

	/**
	 * Detect circular dependencies
	 */
	hasCircularDependency(): boolean {
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const hasCycle = (nodeId: string): boolean => {
			visited.add(nodeId);
			recursionStack.add(nodeId);

			const dependents = this.edges.get(nodeId) ?? new Set();
			for (const depId of dependents) {
				if (!visited.has(depId)) {
					if (hasCycle(depId)) return true;
				} else if (recursionStack.has(depId)) {
					return true;
				}
			}

			recursionStack.delete(nodeId);
			return false;
		};

		for (const nodeId of this.nodes.keys()) {
			if (!visited.has(nodeId)) {
				if (hasCycle(nodeId)) return true;
			}
		}

		return false;
	}

	/**
	 * Topological sort for execution order
	 */
	topologicalSort(): string[] {
		const result: string[] = [];
		const visited = new Set<string>();
		const temp = new Set<string>();

		const visit = (nodeId: string): void => {
			if (temp.has(nodeId)) {
				throw new Error('Circular dependency detected');
			}
			if (visited.has(nodeId)) return;

			temp.add(nodeId);

			const task = this.nodes.get(nodeId);
			if (task) {
				for (const depId of task.dependencies) {
					visit(depId);
				}
			}

			temp.delete(nodeId);
			visited.add(nodeId);
			result.push(nodeId);
		};

		for (const nodeId of this.nodes.keys()) {
			if (!visited.has(nodeId)) {
				visit(nodeId);
			}
		}

		return result;
	}

	/**
	 * Generate execution plan with stages
	 */
	generateExecutionPlan(): ExecutionPlan {
		if (this.hasCircularDependency()) {
			throw new Error('Cannot generate plan: circular dependency detected');
		}

		const stages: TaskStage[] = [];
		const completed = new Set<string>();
		const remaining = new Set(this.nodes.keys());

		let stageNum = 0;
		while (remaining.size > 0) {
			// Find tasks that can execute now (all dependencies completed)
			const ready: string[] = [];

			for (const taskId of remaining) {
				const task = this.nodes.get(taskId);
				if (!task) continue;

				const canExecute = task.dependencies.every((depId) => completed.has(depId));
				if (canExecute) {
					ready.push(taskId);
				}
			}

			if (ready.length === 0) {
				throw new Error('Cannot progress: deadlock detected');
			}

			// Calculate stage duration (max of parallel tasks)
			const stageDuration = Math.max(
				...ready.map((id) => this.nodes.get(id)?.estimatedDuration ?? 0),
			);

			stages.push({
				stage: stageNum++,
				tasks: ready,
				estimatedDuration: stageDuration,
			});

			// Mark as completed
			for (const taskId of ready) {
				completed.add(taskId);
				remaining.delete(taskId);
			}
		}

		// Calculate total duration
		const estimatedTotalDuration = stages.reduce((sum, stage) => sum + stage.estimatedDuration, 0);

		// Calculate sequential duration
		const sequentialDuration = Array.from(this.nodes.values()).reduce(
			(sum, task) => sum + task.estimatedDuration,
			0,
		);

		const parallelizationFactor =
			estimatedTotalDuration > 0 ? sequentialDuration / estimatedTotalDuration : 1;

		return {
			tasks: Array.from(this.nodes.values()),
			stages,
			estimatedTotalDuration,
			parallelizationFactor,
		};
	}

	/**
	 * Find critical path (longest path from start to end)
	 */
	findCriticalPath(): TaskNode[] {
		const sorted = this.topologicalSort();
		const distances = new Map<string, number>();
		const predecessors = new Map<string, string>();

		// Initialize distances
		for (const taskId of this.nodes.keys()) {
			distances.set(taskId, 0);
		}

		// Calculate longest path
		for (const taskId of sorted) {
			const task = this.nodes.get(taskId);
			if (!task) continue;

			const currentDist = distances.get(taskId) ?? 0;

			// Update dependents
			const dependents = this.edges.get(taskId) ?? new Set();
			for (const depId of dependents) {
				const depTask = this.nodes.get(depId);
				if (!depTask) continue;

				const newDist = currentDist + task.estimatedDuration;
				const oldDist = distances.get(depId) ?? 0;

				if (newDist > oldDist) {
					distances.set(depId, newDist);
					predecessors.set(depId, taskId);
				}
			}
		}

		// Find task with longest distance (end of critical path)
		let maxDist = 0;
		let endTask = '';
		for (const [taskId, dist] of distances.entries()) {
			if (dist > maxDist) {
				maxDist = dist;
				endTask = taskId;
			}
		}

		// Reconstruct path
		const path: TaskNode[] = [];
		let current: string | undefined = endTask;

		while (current) {
			const task = this.nodes.get(current);
			if (task) {
				path.unshift(task);
			}
			current = predecessors.get(current);
		}

		return path;
	}
}
