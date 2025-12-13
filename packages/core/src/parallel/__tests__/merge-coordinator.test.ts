/**
 * Tests for MergeCoordinator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	MergeCoordinator,
	createMergeCoordinator,
	type WorkerChanges,
	type ConflictInfo,
	type MergeCoordinatorConfig,
} from '../merge-coordinator.js';

describe('MergeCoordinator', () => {
	let coordinator: MergeCoordinator;

	beforeEach(() => {
		coordinator = new MergeCoordinator();
	});

	describe('constructor', () => {
		it('should create coordinator with default config', () => {
			const coord = new MergeCoordinator();
			expect(coord).toBeDefined();
		});

		it('should create coordinator with custom config', () => {
			const config: Partial<MergeCoordinatorConfig> = {
				autoResolveThreshold: 0.9,
				enableAI: false,
				maxAutoResolveLines: 100,
			};

			const coord = new MergeCoordinator(config);
			expect(coord).toBeDefined();
		});

		it('should use factory function', () => {
			const coord = createMergeCoordinator();
			expect(coord).toBeDefined();
		});
	});

	describe('mergeWorkerChanges', () => {
		it('should merge changes with no conflicts', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file1.ts', 'content1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file2.ts', 'content2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(0);
			expect(result.autoResolved).toBe(0);
			expect(result.manualReviewRequired).toBe(0);
			expect(result.mergedFiles.size).toBe(2);
			expect(result.mergedFiles.get('file1.ts')).toBe('content1');
			expect(result.mergedFiles.get('file2.ts')).toBe('content2');
		});

		it('should detect conflicts in same file', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'version1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'version2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.conflicts.length).toBeGreaterThan(0);
			expect(result.conflicts[0]?.filePath).toBe('file.ts');
			expect(result.conflicts[0]?.type).toBe('both-modified');
		});

		it('should auto-resolve identical changes', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'same content']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'same content']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(0);
		});

		it('should auto-resolve similar changes', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			// Very similar content (should meet similarity threshold)
			const content1 = 'function test() { return 42; }';
			const content2 = 'function test() { return  42; }'; // Extra space

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', content1]]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', content2]]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.conflicts.length).toBeGreaterThan(0);
			const strategy = result.strategies.get(result.conflicts[0]!.id);
			expect(strategy).toBeDefined();
		});

		it('should require manual review for high-risk files', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['src/security/auth.ts', 'version1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['src/security/auth.ts', 'version2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(false);
			expect(result.manualReviewRequired).toBeGreaterThan(0);

			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.name).toBe('manual');
			expect(strategy?.requiresReview).toBe(true);
		});

		it('should handle superset changes', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'short']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'short and extended']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.conflicts.length).toBeGreaterThan(0);
			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.name).toBe('theirs');
			expect(strategy?.confidence).toBeGreaterThanOrEqual(0.9);
		});

		it('should update metrics after merge', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'content']]),
				},
			];

			await coordinator.mergeWorkerChanges(base, workers);

			const metrics = coordinator.getMetrics();
			expect(metrics.totalMerges).toBe(1);
			expect(metrics.autoResolutionRate).toBeGreaterThanOrEqual(0);
		});

		it('should handle multiple files with mixed conflicts', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([
						['file1.ts', 'content1'],
						['file2.ts', 'shared-v1'],
					]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([
						['file3.ts', 'content3'],
						['file2.ts', 'shared-v2'],
					]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.mergedFiles.has('file1.ts')).toBe(true);
			expect(result.mergedFiles.has('file3.ts')).toBe(true);
			expect(result.conflicts.length).toBeGreaterThan(0);
		});

		it('should handle large conflicts requiring manual review', async () => {
			const coordinator = new MergeCoordinator({
				maxAutoResolveLines: 2,
			});

			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const largeContent1 = Array(10).fill('line').join('\n');
			const largeContent2 = Array(10).fill('different').join('\n');

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', largeContent1]]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', largeContent2]]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(false);
			expect(result.manualReviewRequired).toBeGreaterThan(0);
		});
	});

	describe('getMetrics', () => {
		it('should return initial metrics', () => {
			const metrics = coordinator.getMetrics();

			expect(metrics.totalMerges).toBe(0);
			expect(metrics.autoMerges).toBe(0);
			expect(metrics.manualMerges).toBe(0);
			expect(metrics.autoResolutionRate).toBe(0);
			expect(metrics.avgConflictsPerMerge).toBe(0);
			expect(metrics.avgResolutionTime).toBe(0);
		});

		it('should calculate auto-resolution rate correctly', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			// First merge: success
			const workers1: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file1.ts', 'content1']]),
				},
			];

			await coordinator.mergeWorkerChanges(base, workers1);

			// Second merge: success
			await coordinator.mergeWorkerChanges(base, workers1);

			const metrics = coordinator.getMetrics();
			expect(metrics.autoResolutionRate).toBe(100);
		});

		it('should track average conflicts per merge', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'v1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'v2']]),
				},
			];

			await coordinator.mergeWorkerChanges(base, workers);

			const metrics = coordinator.getMetrics();
			expect(metrics.avgConflictsPerMerge).toBeGreaterThan(0);
		});

		it('should track resolution time', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'content']]),
				},
			];

			await coordinator.mergeWorkerChanges(base, workers);

			const metrics = coordinator.getMetrics();
			// Resolution time can be 0 for very fast merges
			expect(metrics.avgResolutionTime).toBeGreaterThanOrEqual(0);
		});
	});

	describe('resetMetrics', () => {
		it('should reset all metrics to zero', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'content']]),
				},
			];

			await coordinator.mergeWorkerChanges(base, workers);

			let metrics = coordinator.getMetrics();
			expect(metrics.totalMerges).toBe(1);

			coordinator.resetMetrics();

			metrics = coordinator.getMetrics();
			expect(metrics.totalMerges).toBe(0);
			expect(metrics.autoMerges).toBe(0);
			expect(metrics.manualMerges).toBe(0);
			expect(metrics.autoResolutionRate).toBe(0);
			expect(metrics.avgConflictsPerMerge).toBe(0);
			expect(metrics.avgResolutionTime).toBe(0);
		});
	});

	describe('high-risk pattern matching', () => {
		it('should detect security files', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['src/security/auth.ts', 'v1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['src/security/auth.ts', 'v2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.requiresReview).toBe(true);
		});

		it('should detect .env files', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['.env.local', 'KEY=value1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['.env.local', 'KEY=value2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.requiresReview).toBe(true);
		});

		it('should detect migration files', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['migrations/001_create_users.sql', 'v1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['migrations/001_create_users.sql', 'v2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.requiresReview).toBe(true);
		});

		it('should allow custom high-risk patterns', async () => {
			const coordinator = new MergeCoordinator({
				highRiskPatterns: ['**/critical/**'],
			});

			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['src/critical/core.ts', 'v1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['src/critical/core.ts', 'v2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy?.requiresReview).toBe(true);
		});
	});

	describe('structural merge', () => {
		it('should perform structural merge when line counts differ', async () => {
			const coordinator = new MergeCoordinator({
				enableAI: true,
			});

			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const content1 = 'line1\nline2';
			const content2 = 'line1\nline2\nline3\nline4\nline5\nline6';

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', content1]]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', content2]]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.conflicts.length).toBeGreaterThan(0);
			const strategy = Array.from(result.strategies.values())[0];
			expect(strategy).toBeDefined();
		});
	});

	describe('AI resolution with disabled AI', () => {
		it('should skip AI resolution when disabled', async () => {
			const coordinator = new MergeCoordinator({
				enableAI: false,
			});

			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'version1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'version2']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			// Without AI, should fall back to manual
			expect(result.success).toBe(false);
		});
	});

	describe('semantic similarity threshold', () => {
		it('should use custom semantic similarity threshold', async () => {
			const coordinator = new MergeCoordinator({
				semanticSimilarityThreshold: 0.95, // Very high threshold
			});

			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const content1 = 'function test() { return 42; }';
			const content2 = 'function test() { return 43; }'; // Slightly different

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', content1]]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', content2]]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.conflicts.length).toBeGreaterThan(0);
		});
	});

	describe('edge cases', () => {
		it('should handle empty worker changes', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const result = await coordinator.mergeWorkerChanges(base, []);

			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(0);
			expect(result.mergedFiles.size).toBe(0);
		});

		it('should handle single worker', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'content']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(0);
			expect(result.mergedFiles.get('file.ts')).toBe('content');
		});

		it('should handle workers with no files', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map(),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map(),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			expect(result.success).toBe(true);
			expect(result.mergedFiles.size).toBe(0);
		});

		it('should handle three-way conflicts', async () => {
			const base: WorkerChanges = {
				workerId: 'base',
				branch: 'main',
				files: new Map(),
			};

			const workers: WorkerChanges[] = [
				{
					workerId: 'worker-1',
					branch: 'feature-1',
					files: new Map([['file.ts', 'v1']]),
				},
				{
					workerId: 'worker-2',
					branch: 'feature-2',
					files: new Map([['file.ts', 'v2']]),
				},
				{
					workerId: 'worker-3',
					branch: 'feature-3',
					files: new Map([['file.ts', 'v3']]),
				},
			];

			const result = await coordinator.mergeWorkerChanges(base, workers);

			// Should detect multiple conflicts
			expect(result.conflicts.length).toBeGreaterThan(0);
		});
	});
});
