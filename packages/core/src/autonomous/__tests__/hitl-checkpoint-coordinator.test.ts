/**
 * Tests for HITLCheckpointCoordinator
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CheckpointManager,
	InMemoryCheckpointStorage,
	type TaskState,
} from '../../checkpoint/index.js';
import {
	type CheckpointReview,
	type HITLCheckpointConfig,
	HITLCheckpointCoordinator,
	type HITLCheckpointEvent,
	createHITLCheckpointCoordinator,
} from '../hitl-checkpoint-coordinator.js';
import type { AttemptRecord } from '../stuck-detector.js';
import type { CheckpointDefinition } from '../task-decomposer.js';

describe('HITLCheckpointCoordinator', () => {
	let checkpointManager: CheckpointManager;
	let coordinator: HITLCheckpointCoordinator;

	beforeEach(() => {
		const storage = new InMemoryCheckpointStorage();
		checkpointManager = new CheckpointManager(storage);
		coordinator = new HITLCheckpointCoordinator(checkpointManager);
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager);

			expect(coord).toBeDefined();
		});

		it('should create with custom config', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const config: Partial<HITLCheckpointConfig> = {
				enableStuckDetection: false,
				enableAutoEscalation: false,
				requireHumanApproval: true,
				notifyOnEscalation: false,
			};

			const coord = new HITLCheckpointCoordinator(manager, config);

			expect(coord).toBeDefined();
		});
	});

	describe('createHITLCheckpointCoordinator', () => {
		it('should create coordinator with factory function', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = createHITLCheckpointCoordinator(manager);

			expect(coord).toBeDefined();
		});

		it('should create with custom config', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = createHITLCheckpointCoordinator(manager, {
				requireHumanApproval: true,
			});

			expect(coord).toBeDefined();
		});
	});

	describe('startTask', () => {
		it('should start tracking a task', () => {
			const taskId = 'test-task';

			coordinator.startTask(taskId);

			const stats = coordinator.getTaskStats(taskId);
			expect(stats.elapsedMinutes).toBeGreaterThanOrEqual(0);
		});

		it('should track multiple tasks independently', () => {
			coordinator.startTask('task-1');
			coordinator.startTask('task-2');

			const stats1 = coordinator.getTaskStats('task-1');
			const stats2 = coordinator.getTaskStats('task-2');

			expect(stats1).toBeDefined();
			expect(stats2).toBeDefined();
		});
	});

	describe('recordAttempt', () => {
		it('should record task attempt', () => {
			const taskId = 'attempt-task';
			coordinator.startTask(taskId);

			const attempt: AttemptRecord = {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				errorMessage: 'Test error',
				changedFiles: ['file1.ts'],
				testsPassing: false,
			};

			coordinator.recordAttempt(taskId, attempt);

			const stats = coordinator.getTaskStats(taskId);
			expect(stats.attempts).toBe(1);
		});

		it('should detect stuck tasks when enabled', () => {
			const taskId = 'stuck-task';
			coordinator.startTask(taskId);

			const errorMessage = 'Same error';

			// Record identical errors to trigger stuck detection
			for (let i = 1; i <= 3; i++) {
				const attempt: AttemptRecord = {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				};

				coordinator.recordAttempt(taskId, attempt);
			}

			const stats = coordinator.getTaskStats(taskId);
			expect(stats.isStuck).toBe(true);
		});

		it('should not detect stuck when disabled', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager, {
				enableStuckDetection: false,
			});

			const taskId = 'task-no-stuck';
			coord.startTask(taskId);

			const errorMessage = 'Same error';

			for (let i = 1; i <= 3; i++) {
				const attempt: AttemptRecord = {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				};

				coord.recordAttempt(taskId, attempt);
			}

			// Should not detect stuck when disabled
			const stats = coord.getTaskStats(taskId);
			expect(stats.isStuck).toBe(false);
		});
	});

	describe('evaluateCheckpoint', () => {
		it('should evaluate checkpoint and save state', async () => {
			const taskId = 'checkpoint-task';
			coordinator.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-1',
				name: 'Test Checkpoint',
				stage: 1,
				condition: 'Tests pass',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test task',
					providerId: 'test-provider',
				},
				status: 'running',
				progress: 50,
			};

			const result = await coordinator.evaluateCheckpoint(taskId, checkpoint, state);

			expect(result.shouldProceed).toBe(true);
			expect(result.reason).toBe('Checkpoint passed');
		});

		it('should block when human approval required', async () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager, {
				requireHumanApproval: true,
			});

			const taskId = 'approval-task';
			coord.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-2',
				name: 'Approval Checkpoint',
				stage: 1,
				condition: 'Manual review',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 30,
			};

			const result = await coord.evaluateCheckpoint(taskId, checkpoint, state);

			expect(result.shouldProceed).toBe(false);
			expect(result.reason).toContain('human review');
		});

		it('should block when stuck with high confidence', async () => {
			const taskId = 'stuck-checkpoint-task';
			coordinator.startTask(taskId);

			// Make task stuck
			const errorMessage = 'Identical error';
			for (let i = 1; i <= 3; i++) {
				coordinator.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-3',
				name: 'Stuck Checkpoint',
				stage: 1,
				condition: 'Not stuck',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 25,
			};

			const result = await coordinator.evaluateCheckpoint(taskId, checkpoint, state);

			expect(result.shouldProceed).toBe(false);
			expect(result.reason).toContain('stuck');
		});

		it('should block when checkpoint has blocking issues', async () => {
			const taskId = 'blocking-task';
			coordinator.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-4',
				name: 'Blocked Checkpoint',
				stage: 1,
				condition: 'No blockers',
				requiredArtifacts: [],
				blockingIssues: ['Missing dependency', 'Configuration error'],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 40,
			};

			const result = await coordinator.evaluateCheckpoint(taskId, checkpoint, state);

			expect(result.shouldProceed).toBe(false);
			expect(result.reason).toContain('Blocking issues');
		});

		it('should emit checkpoint reached event', async () => {
			const events: HITLCheckpointEvent[] = [];
			coordinator.on((event) => events.push(event));

			const taskId = 'event-task';
			coordinator.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-5',
				name: 'Event Checkpoint',
				stage: 1,
				condition: 'Test',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 60,
			};

			await coordinator.evaluateCheckpoint(taskId, checkpoint, state);

			const checkpointEvent = events.find((e) => e.type === 'checkpoint_reached');
			expect(checkpointEvent).toBeDefined();
			expect(checkpointEvent?.checkpoint?.id).toBe('checkpoint-5');
		});
	});

	describe('submitReview', () => {
		it('should submit checkpoint review', async () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager, {
				requireHumanApproval: true,
			});

			const taskId = 'review-task';
			coord.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-review',
				name: 'Review Checkpoint',
				stage: 1,
				condition: 'Manual review',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 50,
			};

			// First evaluation should block
			const result1 = await coord.evaluateCheckpoint(taskId, checkpoint, state);
			expect(result1.shouldProceed).toBe(false);

			// Submit approval
			const review: CheckpointReview = {
				checkpointId: 'checkpoint-review',
				approved: true,
				feedback: 'Looks good',
				timestamp: new Date().toISOString(),
			};

			coord.submitReview('checkpoint-review', review);

			// Second evaluation should proceed
			const result2 = await coord.evaluateCheckpoint(taskId, checkpoint, state);
			expect(result2.shouldProceed).toBe(true);
		});

		it('should block when review is rejected', async () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager, {
				requireHumanApproval: true,
			});

			const taskId = 'reject-task';
			coord.startTask(taskId);

			const checkpoint: CheckpointDefinition = {
				id: 'checkpoint-reject',
				name: 'Reject Checkpoint',
				stage: 1,
				condition: 'Manual review',
				requiredArtifacts: [],
			};

			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test',
					providerId: 'test',
				},
				status: 'running',
				progress: 50,
			};

			// Submit rejection
			const review: CheckpointReview = {
				checkpointId: 'checkpoint-reject',
				approved: false,
				feedback: 'Needs changes',
				timestamp: new Date().toISOString(),
			};

			coord.submitReview('checkpoint-reject', review);

			const result = await coord.evaluateCheckpoint(taskId, checkpoint, state);

			expect(result.shouldProceed).toBe(false);
			expect(result.reason).toContain('rejected');
		});
	});

	describe('getEscalationDecision', () => {
		it('should return escalation decision for stuck task', async () => {
			const taskId = 'escalation-task';
			coordinator.startTask(taskId);

			// Make task stuck
			const errorMessage = 'Repeating error';
			for (let i = 1; i <= 3; i++) {
				coordinator.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const decision = await coordinator.getEscalationDecision(taskId);

			expect(decision).toBeDefined();
			expect(decision?.level).toBeTruthy();
		});

		it('should return null for unknown task', async () => {
			const decision = await coordinator.getEscalationDecision('unknown-task');

			expect(decision).toBeNull();
		});
	});

	describe('event handling', () => {
		it('should allow subscribing to events', () => {
			const unsubscribe = coordinator.on((_event) => {});

			expect(unsubscribe).toBeInstanceOf(Function);

			// Cleanup
			unsubscribe();
		});

		it('should emit stuck detection event', () => {
			const events: HITLCheckpointEvent[] = [];
			coordinator.on((event) => events.push(event));

			const taskId = 'stuck-event-task';
			coordinator.startTask(taskId);

			const errorMessage = 'Same error';
			for (let i = 1; i <= 3; i++) {
				coordinator.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const stuckEvent = events.find((e) => e.type === 'stuck_detected');
			expect(stuckEvent).toBeDefined();
			expect(stuckEvent?.requiresAction).toBe(true);
		});

		it('should emit escalation triggered event', () => {
			const events: HITLCheckpointEvent[] = [];
			coordinator.on((event) => events.push(event));

			const taskId = 'escalation-event-task';
			coordinator.startTask(taskId);

			// Trigger escalation
			const errorMessage = 'Critical error';
			for (let i = 1; i <= 3; i++) {
				coordinator.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const escalationEvent = events.find((e) => e.type === 'escalation_triggered');
			expect(escalationEvent).toBeDefined();
		});

		it('should handle listener errors gracefully', () => {
			const errorListener = vi.fn().mockImplementation(() => {
				throw new Error('Listener error');
			});

			coordinator.on(errorListener);

			const taskId = 'error-listener-task';
			coordinator.startTask(taskId);

			// Should not throw
			expect(() => {
				coordinator.recordAttempt(taskId, {
					attemptNumber: 1,
					timestamp: new Date().toISOString(),
					changedFiles: [],
					testsPassing: true,
				});
			}).not.toThrow();
		});

		it('should allow unsubscribing from events', () => {
			const events: HITLCheckpointEvent[] = [];
			const unsubscribe = coordinator.on((event) => events.push(event));

			const taskId = 'unsub-task';
			coordinator.startTask(taskId);

			coordinator.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file.ts'],
				testsPassing: false,
			});

			const countBeforeUnsub = events.length;

			// Unsubscribe
			unsubscribe();

			coordinator.recordAttempt(taskId, {
				attemptNumber: 2,
				timestamp: new Date().toISOString(),
				changedFiles: ['file2.ts'],
				testsPassing: false,
			});

			// No new events should be added
			expect(events.length).toBe(countBeforeUnsub);
		});
	});

	describe('clearTask', () => {
		it('should clear all task data', () => {
			const taskId = 'clear-task';
			coordinator.startTask(taskId);

			coordinator.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file.ts'],
				testsPassing: true,
			});

			const statsBefore = coordinator.getTaskStats(taskId);
			expect(statsBefore.attempts).toBe(1);

			coordinator.clearTask(taskId);

			const statsAfter = coordinator.getTaskStats(taskId);
			expect(statsAfter.attempts).toBe(0);
			expect(statsAfter.escalations).toBe(0);
		});

		it('should not affect other tasks', () => {
			coordinator.startTask('task-a');
			coordinator.startTask('task-b');

			coordinator.recordAttempt('task-a', {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['a.ts'],
				testsPassing: true,
			});

			coordinator.recordAttempt('task-b', {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['b.ts'],
				testsPassing: true,
			});

			coordinator.clearTask('task-a');

			expect(coordinator.getTaskStats('task-a').attempts).toBe(0);
			expect(coordinator.getTaskStats('task-b').attempts).toBe(1);
		});
	});

	describe('getTaskStats', () => {
		it('should return task statistics', () => {
			const taskId = 'stats-task';
			coordinator.startTask(taskId);

			coordinator.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file.ts'],
				testsPassing: true,
			});

			const stats = coordinator.getTaskStats(taskId);

			expect(stats.attempts).toBe(1);
			expect(stats.escalations).toBeGreaterThanOrEqual(0);
			expect(stats.elapsedMinutes).toBeGreaterThanOrEqual(0);
			expect(stats.isStuck).toBe(false);
		});

		it('should return zero stats for unknown task', () => {
			const stats = coordinator.getTaskStats('unknown');

			expect(stats.attempts).toBe(0);
			expect(stats.escalations).toBe(0);
			expect(stats.elapsedMinutes).toBe(0);
			expect(stats.isStuck).toBe(false);
		});

		it('should track elapsed time correctly', async () => {
			const taskId = 'time-task';
			coordinator.startTask(taskId);

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			const stats = coordinator.getTaskStats(taskId);

			expect(stats.elapsedMinutes).toBeGreaterThan(0);
		});
	});

	describe('escalation integration', () => {
		it('should not escalate when disabled', () => {
			const storage = new InMemoryCheckpointStorage();
			const manager = new CheckpointManager(storage);
			const coord = new HITLCheckpointCoordinator(manager, {
				enableAutoEscalation: false,
			});

			const events: HITLCheckpointEvent[] = [];
			coord.on((event) => events.push(event));

			const taskId = 'no-escalation-task';
			coord.startTask(taskId);

			const errorMessage = 'Same error';
			for (let i = 1; i <= 3; i++) {
				coord.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const escalationEvents = events.filter((e) => e.type === 'escalation_triggered');
			expect(escalationEvents.length).toBe(0);
		});
	});
});
