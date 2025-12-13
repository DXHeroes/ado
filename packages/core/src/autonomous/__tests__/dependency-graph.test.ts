/**
 * Tests for DependencyGraph
 */

import { describe, it, expect } from 'vitest';
import { DependencyGraph, type TaskNode } from '../dependency-graph.js';

describe('DependencyGraph', () => {
	describe('addTask', () => {
		it('should add a task to the graph', () => {
			const graph = new DependencyGraph();
			const task: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Test task',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task);

			expect(graph.getTask('task-1')).toEqual(task);
		});

		it('should add task with dependencies', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			expect(graph.getDependencies('task-2')).toEqual([task1]);
		});
	});

	describe('getTask', () => {
		it('should return task by ID', () => {
			const graph = new DependencyGraph();
			const task: TaskNode = {
				id: 'task-1',
				type: 'bug',
				description: 'Fix bug',
				estimatedDuration: 15,
				priority: 'critical',
				dependencies: [],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task);

			expect(graph.getTask('task-1')).toEqual(task);
		});

		it('should return undefined for non-existent task', () => {
			const graph = new DependencyGraph();

			expect(graph.getTask('non-existent')).toBeUndefined();
		});
	});

	describe('getAllTasks', () => {
		it('should return all tasks', () => {
			const graph = new DependencyGraph();
			const tasks: TaskNode[] = [
				{
					id: 'task-1',
					type: 'feature',
					description: 'Task 1',
					estimatedDuration: 10,
					priority: 'high',
					dependencies: [],
					parallel: false,
					metadata: {},
				},
				{
					id: 'task-2',
					type: 'bug',
					description: 'Task 2',
					estimatedDuration: 20,
					priority: 'medium',
					dependencies: [],
					parallel: false,
					metadata: {},
				},
			];

			for (const task of tasks) {
				graph.addTask(task);
			}

			expect(graph.getAllTasks()).toHaveLength(2);
			expect(graph.getAllTasks()).toEqual(expect.arrayContaining(tasks));
		});

		it('should return empty array for empty graph', () => {
			const graph = new DependencyGraph();

			expect(graph.getAllTasks()).toEqual([]);
		});
	});

	describe('getDependents', () => {
		it('should return tasks that depend on given task', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			expect(graph.getDependents('task-1')).toEqual([task2]);
		});

		it('should return empty array if no dependents', () => {
			const graph = new DependencyGraph();
			const task: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task);

			expect(graph.getDependents('task-1')).toEqual([]);
		});
	});

	describe('getDependencies', () => {
		it('should return tasks that given task depends on', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			expect(graph.getDependencies('task-2')).toEqual([task1]);
		});

		it('should return empty array for task with no dependencies', () => {
			const graph = new DependencyGraph();
			const task: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task);

			expect(graph.getDependencies('task-1')).toEqual([]);
		});
	});

	describe('hasCircularDependency', () => {
		it('should detect circular dependency', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['task-2'],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			expect(graph.hasCircularDependency()).toBe(true);
		});

		it('should return false for acyclic graph', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			expect(graph.hasCircularDependency()).toBe(false);
		});

		it('should detect circular dependency in complex graph', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'A',
				type: 'feature',
				description: 'A',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['B'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'B',
				type: 'feature',
				description: 'B',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['C'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'C',
				type: 'feature',
				description: 'C',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['A'],
				parallel: false,
				metadata: {},
			});

			expect(graph.hasCircularDependency()).toBe(true);
		});
	});

	describe('topologicalSort', () => {
		it('should sort tasks in dependency order', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			});

			const sorted = graph.topologicalSort();

			expect(sorted).toEqual(['task-1', 'task-2']);
		});

		it('should throw on circular dependency', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['task-2'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			});

			expect(() => graph.topologicalSort()).toThrow('Circular dependency detected');
		});
	});

	describe('generateExecutionPlan', () => {
		it('should generate execution plan for simple graph', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			});

			const plan = graph.generateExecutionPlan();

			expect(plan.tasks).toHaveLength(1);
			expect(plan.stages).toHaveLength(1);
			expect(plan.estimatedTotalDuration).toBe(10);
			expect(plan.parallelizationFactor).toBe(1);
		});

		it('should generate parallel execution stages', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: [],
				parallel: true,
				metadata: {},
			});

			const plan = graph.generateExecutionPlan();

			expect(plan.stages).toHaveLength(1);
			expect(plan.stages[0]?.tasks).toEqual(['task-1', 'task-2']);
			expect(plan.estimatedTotalDuration).toBe(20); // Max of parallel tasks
		});

		it('should calculate parallelization factor correctly', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 10,
				priority: 'medium',
				dependencies: [],
				parallel: true,
				metadata: {},
			});

			const plan = graph.generateExecutionPlan();

			// Sequential: 10 + 10 = 20, Parallel: max(10, 10) = 10
			expect(plan.parallelizationFactor).toBe(2);
		});

		it('should throw on circular dependency', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['task-2'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			});

			expect(() => graph.generateExecutionPlan()).toThrow(
				'Cannot generate plan: circular dependency detected',
			);
		});
	});

	describe('findCriticalPath', () => {
		it('should find critical path in simple graph', () => {
			const graph = new DependencyGraph();
			const task1: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};
			const task2: TaskNode = {
				id: 'task-2',
				type: 'feature',
				description: 'Task 2',
				estimatedDuration: 20,
				priority: 'medium',
				dependencies: ['task-1'],
				parallel: false,
				metadata: {},
			};

			graph.addTask(task1);
			graph.addTask(task2);

			const criticalPath = graph.findCriticalPath();

			expect(criticalPath).toEqual([task1, task2]);
		});

		it('should find longest path in complex graph', () => {
			const graph = new DependencyGraph();
			graph.addTask({
				id: 'A',
				type: 'feature',
				description: 'A',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'B',
				type: 'feature',
				description: 'B',
				estimatedDuration: 5,
				priority: 'high',
				dependencies: ['A'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'C',
				type: 'feature',
				description: 'C',
				estimatedDuration: 20,
				priority: 'high',
				dependencies: ['A'],
				parallel: false,
				metadata: {},
			});
			graph.addTask({
				id: 'D',
				type: 'feature',
				description: 'D',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: ['C'],
				parallel: false,
				metadata: {},
			});

			const criticalPath = graph.findCriticalPath();

			// A (10) -> C (20) -> D (10) = 40 is longer than A (10) -> B (5) = 15
			expect(criticalPath.map((t) => t.id)).toEqual(['A', 'C', 'D']);
		});

		it('should return empty array for empty graph', () => {
			const graph = new DependencyGraph();

			const criticalPath = graph.findCriticalPath();

			expect(criticalPath).toEqual([]);
		});
	});
});
