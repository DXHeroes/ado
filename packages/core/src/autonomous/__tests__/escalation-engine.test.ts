/**
 * Tests for EscalationEngine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	EscalationEngine,
	createEscalationEngine,
	type EscalationContext,
	type EscalationLevel,
} from '../escalation-engine.js';
import type { StuckDetectionResult } from '../stuck-detector.js';

describe('EscalationEngine', () => {
	let engine: EscalationEngine;

	beforeEach(() => {
		engine = new EscalationEngine();
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			const engine = new EscalationEngine();
			expect(engine).toBeDefined();
		});

		it('should create with custom config', () => {
			const engine = new EscalationEngine({
				maxRetries: 5,
				maxApproaches: 2,
				criticalTaskFastEscalation: false,
				allowPartialCompletion: false,
			});
			expect(engine).toBeDefined();
		});
	});

	describe('createEscalationEngine', () => {
		it('should create engine with factory function', () => {
			const engine = createEscalationEngine();
			expect(engine).toBeDefined();
		});

		it('should create with custom config', () => {
			const engine = createEscalationEngine({ maxRetries: 10 });
			expect(engine).toBeDefined();
		});
	});

	describe('decide - critical task fast escalation', () => {
		it('should escalate critical stuck tasks to human immediately', () => {
			const context: EscalationContext = {
				taskId: 'critical-task',
				attemptCount: 2,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'identical_errors',
					confidence: 0.9,
					recommendation: 'Need help',
					evidence: ['Error repeated 3 times'],
				},
				taskPriority: 'critical',
				taskComplexity: 'complex',
				elapsedMinutes: 10,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.requiresHuman).toBe(true);
			expect(decision.canAutoResolve).toBe(false);
		});

		it('should not fast escalate critical tasks with low confidence', () => {
			const context: EscalationContext = {
				taskId: 'critical-task',
				attemptCount: 1,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'no_progress',
					confidence: 0.5,
					recommendation: 'Try again',
					evidence: ['Minimal changes'],
				},
				taskPriority: 'critical',
				taskComplexity: 'simple',
				elapsedMinutes: 5,
			};

			const decision = engine.decide(context);

			expect(decision.level).not.toBe('human_intervention');
		});

		it('should respect criticalTaskFastEscalation config', () => {
			const customEngine = new EscalationEngine({
				criticalTaskFastEscalation: false,
			});

			const context: EscalationContext = {
				taskId: 'critical-task',
				attemptCount: 2,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'identical_errors',
					confidence: 0.9,
					recommendation: 'Need help',
					evidence: ['Error repeated'],
				},
				taskPriority: 'critical',
				taskComplexity: 'complex',
				elapsedMinutes: 10,
			};

			const decision = customEngine.decide(context);

			// Should not fast escalate when disabled
			expect(decision.level).not.toBe('human_intervention');
		});
	});

	describe('decide - not stuck scenarios', () => {
		it('should suggest retry when not stuck', () => {
			const context: EscalationContext = {
				taskId: 'task-1',
				attemptCount: 1,
				previousEscalations: [],
				stuckDetection: {
					isStuck: false,
					reason: null,
					confidence: 0,
					recommendation: '',
					evidence: [],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 5,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('retry');
			expect(decision.canAutoResolve).toBe(true);
			expect(decision.requiresHuman).toBe(false);
		});

		it('should suggest different approach after max retries', () => {
			const context: EscalationContext = {
				taskId: 'task-2',
				attemptCount: 3,
				previousEscalations: ['retry', 'retry'],
				stuckDetection: {
					isStuck: false,
					reason: null,
					confidence: 0,
					recommendation: '',
					evidence: [],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 15,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('different_approach');
			expect(decision.canAutoResolve).toBe(true);
		});
	});

	describe('decide - identical errors', () => {
		it('should suggest different approach for identical errors', () => {
			const context: EscalationContext = {
				taskId: 'task-3',
				attemptCount: 3,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'identical_errors',
					confidence: 0.95,
					recommendation: 'Change approach',
					evidence: ['Same error 3 times'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 10,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('different_approach');
			expect(decision.reason).toContain('identical_errors');
		});

		it('should suggest partial completion after max approaches', () => {
			const context: EscalationContext = {
				taskId: 'task-4',
				attemptCount: 10,
				previousEscalations: [
					'different_approach',
					'different_approach',
					'different_approach',
				],
				stuckDetection: {
					isStuck: true,
					reason: 'identical_errors',
					confidence: 0.9,
					recommendation: 'Need help',
					evidence: ['Stuck on same error'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 25,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('partial_completion');
			expect(decision.requiresHuman).toBe(true);
		});
	});

	describe('decide - no progress', () => {
		it('should suggest different approach for no progress', () => {
			const context: EscalationContext = {
				taskId: 'task-5',
				attemptCount: 5,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'no_progress',
					confidence: 0.85,
					recommendation: 'Try different approach',
					evidence: ['No files changed'],
				},
				taskPriority: 'low',
				taskComplexity: 'simple',
				elapsedMinutes: 12,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('different_approach');
		});

		it('should escalate to human when partial completion not allowed', () => {
			const customEngine = new EscalationEngine({
				allowPartialCompletion: false,
			});

			const context: EscalationContext = {
				taskId: 'task-6',
				attemptCount: 15,
				previousEscalations: [
					'different_approach',
					'different_approach',
					'different_approach',
				],
				stuckDetection: {
					isStuck: true,
					reason: 'no_progress',
					confidence: 0.9,
					recommendation: 'Need help',
					evidence: ['No progress'],
				},
				taskPriority: 'medium',
				taskComplexity: 'complex',
				elapsedMinutes: 30,
			};

			const decision = customEngine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.reason).toContain('No progress after multiple approaches');
		});
	});

	describe('decide - timeout', () => {
		it('should suggest partial completion for epic tasks on timeout', () => {
			const context: EscalationContext = {
				taskId: 'epic-task',
				attemptCount: 5,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'timeout',
					confidence: 1.0,
					recommendation: 'Task exceeded time limit',
					evidence: ['35 minutes elapsed'],
				},
				taskPriority: 'high',
				taskComplexity: 'epic',
				elapsedMinutes: 35,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('partial_completion');
		});

		it('should escalate to human for non-epic tasks on timeout', () => {
			const context: EscalationContext = {
				taskId: 'simple-task',
				attemptCount: 3,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'timeout',
					confidence: 1.0,
					recommendation: 'Task exceeded time limit',
					evidence: ['35 minutes elapsed'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 35,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.reason).toContain('timeout');
		});
	});

	describe('decide - oscillating', () => {
		it('should try different approach first for oscillating', () => {
			const context: EscalationContext = {
				taskId: 'task-7',
				attemptCount: 5,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'oscillating',
					confidence: 0.9,
					recommendation: 'Agent switching between solutions',
					evidence: ['Alternating file changes'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 20,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('different_approach');
		});

		it('should escalate to human after one failed approach for oscillating', () => {
			const context: EscalationContext = {
				taskId: 'task-8',
				attemptCount: 8,
				previousEscalations: ['different_approach'],
				stuckDetection: {
					isStuck: true,
					reason: 'oscillating',
					confidence: 0.95,
					recommendation: 'Still oscillating',
					evidence: ['Still alternating'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 25,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.reason).toContain('oscillating');
		});
	});

	describe('decide - test failure loop', () => {
		it('should retry once for test failures', () => {
			const context: EscalationContext = {
				taskId: 'task-9',
				attemptCount: 2,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'test_failure_loop',
					confidence: 0.8,
					recommendation: 'Tests keep failing',
					evidence: ['3 failed test runs'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 10,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('retry');
		});

		it('should escalate to human after retry for test failures', () => {
			const context: EscalationContext = {
				taskId: 'task-10',
				attemptCount: 5,
				previousEscalations: ['retry'],
				stuckDetection: {
					isStuck: true,
					reason: 'test_failure_loop',
					confidence: 0.85,
					recommendation: 'Persistent test failures',
					evidence: ['Tests still failing'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 20,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.reason).toContain('test failures');
		});
	});

	describe('recordEscalation', () => {
		it('should record escalation decision', () => {
			const taskId = 'task-record';

			engine.recordEscalation(taskId, 'retry');
			engine.recordEscalation(taskId, 'different_approach');

			const history = engine.getHistory(taskId);

			expect(history).toEqual(['retry', 'different_approach']);
		});

		it('should handle multiple tasks independently', () => {
			engine.recordEscalation('task-a', 'retry');
			engine.recordEscalation('task-b', 'different_approach');
			engine.recordEscalation('task-a', 'human_intervention');

			expect(engine.getHistory('task-a')).toEqual(['retry', 'human_intervention']);
			expect(engine.getHistory('task-b')).toEqual(['different_approach']);
		});
	});

	describe('getHistory', () => {
		it('should return empty array for unknown task', () => {
			expect(engine.getHistory('unknown')).toEqual([]);
		});

		it('should return escalation history', () => {
			const taskId = 'task-history';

			engine.recordEscalation(taskId, 'retry');
			engine.recordEscalation(taskId, 'retry');
			engine.recordEscalation(taskId, 'different_approach');

			const history = engine.getHistory(taskId);

			expect(history).toHaveLength(3);
			expect(history[0]).toBe('retry');
			expect(history[2]).toBe('different_approach');
		});
	});

	describe('clearHistory', () => {
		it('should clear escalation history for task', () => {
			const taskId = 'task-clear';

			engine.recordEscalation(taskId, 'retry');
			engine.recordEscalation(taskId, 'different_approach');

			expect(engine.getHistory(taskId)).toHaveLength(2);

			engine.clearHistory(taskId);

			expect(engine.getHistory(taskId)).toHaveLength(0);
		});

		it('should not affect other tasks', () => {
			engine.recordEscalation('task-a', 'retry');
			engine.recordEscalation('task-b', 'retry');

			engine.clearHistory('task-a');

			expect(engine.getHistory('task-a')).toHaveLength(0);
			expect(engine.getHistory('task-b')).toHaveLength(1);
		});
	});

	describe('decision properties', () => {
		it('should provide actionable suggestions for retry', () => {
			const context: EscalationContext = {
				taskId: 'task',
				attemptCount: 1,
				previousEscalations: [],
				stuckDetection: {
					isStuck: false,
					reason: null,
					confidence: 0,
					recommendation: '',
					evidence: [],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 5,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('retry');
			expect(decision.actions).toBeDefined();
			expect(decision.actions.length).toBeGreaterThan(0);
			expect(decision.suggestedNextSteps).toBeDefined();
			expect(decision.suggestedNextSteps.length).toBeGreaterThan(0);
		});

		it('should provide alternative strategies for different approach', () => {
			const context: EscalationContext = {
				taskId: 'task',
				attemptCount: 5,
				previousEscalations: [],
				stuckDetection: {
					isStuck: true,
					reason: 'identical_errors',
					confidence: 0.9,
					recommendation: 'Try different approach',
					evidence: ['Same error repeated'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 15,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('different_approach');
			expect(decision.suggestedNextSteps).toBeDefined();
			expect(decision.suggestedNextSteps.length).toBeGreaterThan(0);
		});

		it('should provide handoff guidance for partial completion', () => {
			const context: EscalationContext = {
				taskId: 'task',
				attemptCount: 15,
				previousEscalations: [
					'different_approach',
					'different_approach',
					'different_approach',
				],
				stuckDetection: {
					isStuck: true,
					reason: 'no_progress',
					confidence: 0.9,
					recommendation: 'Need help',
					evidence: ['No progress'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 30,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('partial_completion');
			expect(decision.suggestedNextSteps.some((step) =>
				step.toLowerCase().includes('handoff'),
			)).toBe(true);
		});

		it('should provide clear guidance for human intervention', () => {
			const context: EscalationContext = {
				taskId: 'task',
				attemptCount: 5,
				previousEscalations: ['different_approach'],
				stuckDetection: {
					isStuck: true,
					reason: 'oscillating',
					confidence: 0.95,
					recommendation: 'Human needed',
					evidence: ['Oscillating'],
				},
				taskPriority: 'medium',
				taskComplexity: 'moderate',
				elapsedMinutes: 25,
			};

			const decision = engine.decide(context);

			expect(decision.level).toBe('human_intervention');
			expect(decision.actions).toBeDefined();
			expect(decision.actions.some((action) =>
				action.toLowerCase().includes('pause'),
			)).toBe(true);
		});
	});

	describe('alternative strategies', () => {
		it('should provide relevant strategies based on stuck reason', () => {
			const reasons: Array<'identical_errors' | 'no_progress' | 'timeout' | 'oscillating' | 'test_failure_loop'> = [
				'identical_errors',
				'no_progress',
				'timeout',
				'oscillating',
				'test_failure_loop',
			];

			for (const reason of reasons) {
				const context: EscalationContext = {
					taskId: `task-${reason}`,
					attemptCount: 5,
					previousEscalations: [],
					stuckDetection: {
						isStuck: true,
						reason,
						confidence: 0.9,
						recommendation: 'Need different approach',
						evidence: [reason],
					},
					taskPriority: 'medium',
					taskComplexity: 'moderate',
					elapsedMinutes: 15,
				};

				const decision = engine.decide(context);

				// Should provide specific strategies
				expect(decision.suggestedNextSteps).toBeDefined();
				expect(decision.suggestedNextSteps.length).toBeGreaterThan(0);
			}
		});
	});
});
