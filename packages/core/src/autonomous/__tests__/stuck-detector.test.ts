/**
 * Tests for StuckDetector
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { type AttemptRecord, StuckDetector } from '../stuck-detector.js';

describe('StuckDetector', () => {
	let detector: StuckDetector;
	const taskId = 'test-task';

	beforeEach(() => {
		detector = new StuckDetector();
	});

	describe('recordAttempt', () => {
		it('should record an attempt', () => {
			const attempt: AttemptRecord = {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: true,
				metrics: {
					linesChanged: 10,
					filesModified: 1,
					testsAdded: 2,
				},
			};

			detector.recordAttempt(taskId, attempt);

			const attempts = detector.getAttempts(taskId);
			expect(attempts).toHaveLength(1);
			expect(attempts[0]).toEqual(attempt);
		});

		it('should record multiple attempts', () => {
			for (let i = 1; i <= 3; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: true,
				});
			}

			expect(detector.getAttempts(taskId)).toHaveLength(3);
		});
	});

	describe('checkIfStuck - identical errors', () => {
		it('should detect identical errors', () => {
			const errorMessage = 'TypeError: Cannot read property "x" of undefined';
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 3; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('identical_errors');
			expect(result.confidence).toBeGreaterThan(0.9);
		});

		it('should not detect stuck with different errors', () => {
			const startTime = new Date().toISOString();

			detector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				errorMessage: 'Error 1',
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});
			detector.recordAttempt(taskId, {
				attemptNumber: 2,
				timestamp: new Date().toISOString(),
				errorMessage: 'Error 2',
				changedFiles: ['file2.ts'],
				testsPassing: false,
			});

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(false);
		});

		it('should use configurable error threshold', () => {
			const customDetector = new StuckDetector({
				identicalErrorThreshold: 2,
			});
			const errorMessage = 'Same error';
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 2; i++) {
				customDetector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = customDetector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('identical_errors');
		});
	});

	describe('checkIfStuck - no progress', () => {
		it('should detect no progress', () => {
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 5; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [],
					testsPassing: false,
					metrics: {
						linesChanged: 2,
						filesModified: 0,
						testsAdded: 0,
					},
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('no_progress');
		});

		it('should not detect stuck when making progress', () => {
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 5; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: i === 5,
					metrics: {
						linesChanged: 10,
						filesModified: 1,
						testsAdded: 1,
					},
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(false);
		});

		it('should use configurable minimum progress threshold', () => {
			const customDetector = new StuckDetector({
				minimumProgressLines: 20,
			});
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 5; i++) {
				customDetector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: true,
					metrics: {
						linesChanged: 10, // Less than threshold
						filesModified: 1,
						testsAdded: 0,
					},
				});
			}

			const result = customDetector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
		});
	});

	describe('checkIfStuck - timeout', () => {
		it('should detect timeout', () => {
			const customDetector = new StuckDetector({
				complexTaskTimeoutMinutes: 0.001, // 60ms
			});

			// Start time 1 minute ago
			const startTime = new Date(Date.now() - 60 * 1000).toISOString();

			customDetector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});

			const result = customDetector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('timeout');
		});

		it('should not detect timeout within time limit', () => {
			const startTime = new Date().toISOString();

			detector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.reason).not.toBe('timeout');
		});
	});

	describe('checkIfStuck - oscillating', () => {
		it('should detect oscillating behavior', () => {
			const startTime = new Date().toISOString();

			// Alternating between two file sets
			detector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});
			detector.recordAttempt(taskId, {
				attemptNumber: 2,
				timestamp: new Date().toISOString(),
				changedFiles: ['file2.ts'],
				testsPassing: false,
			});
			detector.recordAttempt(taskId, {
				attemptNumber: 3,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});
			detector.recordAttempt(taskId, {
				attemptNumber: 4,
				timestamp: new Date().toISOString(),
				changedFiles: ['file2.ts'],
				testsPassing: false,
			});

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('oscillating');
		});

		it('should not detect oscillating with progressive changes', () => {
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 4; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.reason).not.toBe('oscillating');
		});
	});

	describe('checkIfStuck - test failure loop', () => {
		it('should detect test failure loop', () => {
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 4; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(true);
			expect(result.reason).toBe('test_failure_loop');
		});

		it('should not detect test failure loop when tests eventually pass', () => {
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 4; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: i === 4,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.reason).not.toBe('test_failure_loop');
		});
	});

	describe('clearAttempts', () => {
		it('should clear attempts for a task', () => {
			detector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				changedFiles: ['file1.ts'],
				testsPassing: true,
			});

			expect(detector.getAttempts(taskId)).toHaveLength(1);

			detector.clearAttempts(taskId);

			expect(detector.getAttempts(taskId)).toHaveLength(0);
		});
	});

	describe('getAttempts', () => {
		it('should return empty array for unknown task', () => {
			expect(detector.getAttempts('unknown-task')).toEqual([]);
		});

		it('should return all attempts for task', () => {
			for (let i = 1; i <= 3; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					changedFiles: [`file${i}.ts`],
					testsPassing: true,
				});
			}

			const attempts = detector.getAttempts(taskId);

			expect(attempts).toHaveLength(3);
			expect(attempts[0]?.attemptNumber).toBe(1);
			expect(attempts[2]?.attemptNumber).toBe(3);
		});
	});

	describe('recommendations', () => {
		it('should provide actionable recommendations for stuck tasks', () => {
			const errorMessage = 'Same error repeated';
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 3; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.recommendation).toBeTruthy();
			expect(result.recommendation.length).toBeGreaterThan(0);
		});

		it('should provide evidence for stuck detection', () => {
			const errorMessage = 'Consistent error';
			const startTime = new Date().toISOString();

			for (let i = 1; i <= 3; i++) {
				detector.recordAttempt(taskId, {
					attemptNumber: i,
					timestamp: new Date().toISOString(),
					errorMessage,
					changedFiles: [`file${i}.ts`],
					testsPassing: false,
				});
			}

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.evidence).toBeDefined();
			expect(result.evidence.length).toBeGreaterThan(0);
		});
	});

	describe('edge cases', () => {
		it('should handle task with no attempts', () => {
			const startTime = new Date().toISOString();

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(false);
			expect(result.confidence).toBe(0);
		});

		it('should handle single attempt', () => {
			const startTime = new Date().toISOString();

			detector.recordAttempt(taskId, {
				attemptNumber: 1,
				timestamp: new Date().toISOString(),
				errorMessage: 'Some error',
				changedFiles: ['file1.ts'],
				testsPassing: false,
			});

			const result = detector.checkIfStuck(taskId, startTime);

			expect(result.isStuck).toBe(false);
		});
	});
});
