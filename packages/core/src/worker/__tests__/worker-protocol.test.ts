/**
 * Worker Protocol Tests
 *
 * Tests for worker communication protocol types, message validation,
 * and protocol compliance.
 */

import { describe, expect, it } from 'vitest';
import type {
	OrchestratorMessage,
	TaskAssignment,
	TaskProgress,
	TaskResult,
	WorkerHeartbeat,
	WorkerMessage,
	WorkerRegistration,
	WorkerState,
} from '../worker-protocol.js';

describe('WorkerProtocol', () => {
	describe('WorkerRegistration', () => {
		it('should create valid worker registration', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript', 'node'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			expect(registration.workerId).toBe('worker-1');
			expect(registration.capabilities).toHaveLength(2);
			expect(registration.resources.cpu).toBe(4);
			expect(registration.resources.memory).toBe(8192);
		});

		it('should create registration with optional metadata', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-meta',
				capabilities: ['python', 'docker'],
				resources: {
					cpu: 8,
					memory: 16384,
				},
				metadata: {
					hostname: 'worker-node-1',
					platform: 'linux',
					nodeVersion: 'v22.0.0',
					customField: 'custom-value',
				},
			};

			expect(registration.metadata).toBeDefined();
			expect(registration.metadata?.hostname).toBe('worker-node-1');
			expect(registration.metadata?.platform).toBe('linux');
			expect(registration.metadata?.nodeVersion).toBe('v22.0.0');
			expect(registration.metadata?.customField).toBe('custom-value');
		});

		it('should support empty capabilities array', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-no-caps',
				capabilities: [],
				resources: {
					cpu: 2,
					memory: 4096,
				},
			};

			expect(registration.capabilities).toHaveLength(0);
		});

		it('should support large resource values', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-large',
				capabilities: ['rust'],
				resources: {
					cpu: 128,
					memory: 524288, // 512GB
				},
			};

			expect(registration.resources.cpu).toBe(128);
			expect(registration.resources.memory).toBe(524288);
		});

		it('should handle registration without metadata', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-no-meta',
				capabilities: ['java'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			expect(registration.metadata).toBeUndefined();
		});
	});

	describe('WorkerHeartbeat', () => {
		it('should create valid heartbeat message', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: '2025-12-13T10:00:00.000Z',
				status: 'idle',
				uptime: 3600,
			};

			expect(heartbeat.workerId).toBe('worker-1');
			expect(heartbeat.timestamp).toBe('2025-12-13T10:00:00.000Z');
			expect(heartbeat.status).toBe('idle');
			expect(heartbeat.uptime).toBe(3600);
		});

		it('should support all valid status values', () => {
			const statuses: Array<'idle' | 'busy' | 'offline'> = ['idle', 'busy', 'offline'];

			for (const status of statuses) {
				const heartbeat: WorkerHeartbeat = {
					workerId: 'worker-1',
					timestamp: new Date().toISOString(),
					status,
					uptime: 1000,
				};

				expect(heartbeat.status).toBe(status);
			}
		});

		it('should include current task when busy', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: new Date().toISOString(),
				status: 'busy',
				currentTask: 'task-123',
				uptime: 5000,
			};

			expect(heartbeat.currentTask).toBe('task-123');
		});

		it('should include optional metrics', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: new Date().toISOString(),
				status: 'busy',
				uptime: 7200,
				metrics: {
					cpuUsage: 75.5,
					memoryUsage: 6144,
					activeConnections: 5,
				},
			};

			expect(heartbeat.metrics).toBeDefined();
			expect(heartbeat.metrics?.cpuUsage).toBe(75.5);
			expect(heartbeat.metrics?.memoryUsage).toBe(6144);
			expect(heartbeat.metrics?.activeConnections).toBe(5);
		});

		it('should handle zero uptime', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-new',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 0,
			};

			expect(heartbeat.uptime).toBe(0);
		});

		it('should handle heartbeat without current task', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 1000,
			};

			expect(heartbeat.currentTask).toBeUndefined();
		});

		it('should handle heartbeat without metrics', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 1000,
			};

			expect(heartbeat.metrics).toBeUndefined();
		});
	});

	describe('TaskAssignment', () => {
		it('should create valid task assignment', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-1',
				workerId: 'worker-1',
				assignedAt: '2025-12-13T10:00:00.000Z',
				taskData: {
					prompt: 'Implement feature X',
					repositoryPath: '/path/to/repo',
				},
			};

			expect(assignment.taskId).toBe('task-1');
			expect(assignment.workerId).toBe('worker-1');
			expect(assignment.taskData.prompt).toBe('Implement feature X');
			expect(assignment.taskData.repositoryPath).toBe('/path/to/repo');
		});

		it('should include optional provider', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-2',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: 'Fix bug Y',
					repositoryPath: '/path/to/repo',
					provider: 'claude-code',
				},
			};

			expect(assignment.taskData.provider).toBe('claude-code');
		});

		it('should include optional cost limit', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-3',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: 'Refactor module Z',
					repositoryPath: '/path/to/repo',
					maxCost: 1.5,
				},
			};

			expect(assignment.taskData.maxCost).toBe(1.5);
		});

		it('should include optional quality gates', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-4',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: 'Add tests',
					repositoryPath: '/path/to/repo',
					qualityGates: {
						minCoverage: 80,
						requiresReview: true,
						lintErrors: 0,
					},
				},
			};

			expect(assignment.taskData.qualityGates).toBeDefined();
			expect(assignment.taskData.qualityGates?.minCoverage).toBe(80);
			expect(assignment.taskData.qualityGates?.requiresReview).toBe(true);
		});

		it('should handle assignment with all optional fields', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-5',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: 'Complete task',
					repositoryPath: '/path/to/repo',
					provider: 'cursor-cli',
					maxCost: 2.0,
					qualityGates: {
						requiresTests: true,
						requiresDocs: true,
					},
				},
			};

			expect(assignment.taskData.provider).toBe('cursor-cli');
			expect(assignment.taskData.maxCost).toBe(2.0);
			expect(assignment.taskData.qualityGates).toBeDefined();
		});
	});

	describe('TaskProgress', () => {
		it('should create valid task progress', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 50,
				status: 'running',
			};

			expect(progress.taskId).toBe('task-1');
			expect(progress.workerId).toBe('worker-1');
			expect(progress.progress).toBe(50);
			expect(progress.status).toBe('running');
		});

		it('should support all valid status values', () => {
			const statuses: TaskProgress['status'][] = [
				'starting',
				'running',
				'validating',
				'completing',
				'completed',
				'failed',
			];

			for (const status of statuses) {
				const progress: TaskProgress = {
					taskId: 'task-1',
					workerId: 'worker-1',
					progress: 0,
					status,
				};

				expect(progress.status).toBe(status);
			}
		});

		it('should handle progress boundaries', () => {
			const progressValues = [0, 25, 50, 75, 100];

			for (const value of progressValues) {
				const progress: TaskProgress = {
					taskId: 'task-1',
					workerId: 'worker-1',
					progress: value,
					status: 'running',
				};

				expect(progress.progress).toBe(value);
			}
		});

		it('should include optional current step', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 30,
				status: 'running',
				currentStep: 'Analyzing codebase',
			};

			expect(progress.currentStep).toBe('Analyzing codebase');
		});

		it('should include optional logs', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 60,
				status: 'running',
				logs: ['Starting task', 'Loading dependencies', 'Running analysis'],
			};

			expect(progress.logs).toHaveLength(3);
			expect(progress.logs?.[0]).toBe('Starting task');
		});

		it('should include optional metrics', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 75,
				status: 'validating',
				metrics: {
					tokensUsed: 15000,
					cost: 0.45,
					duration: 120,
				},
			};

			expect(progress.metrics).toBeDefined();
			expect(progress.metrics?.tokensUsed).toBe(15000);
			expect(progress.metrics?.cost).toBe(0.45);
			expect(progress.metrics?.duration).toBe(120);
		});

		it('should handle progress with all optional fields', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 90,
				status: 'completing',
				currentStep: 'Finalizing changes',
				logs: ['Step 1 complete', 'Step 2 complete'],
				metrics: {
					tokensUsed: 25000,
					cost: 0.75,
					duration: 300,
				},
			};

			expect(progress.currentStep).toBeDefined();
			expect(progress.logs).toBeDefined();
			expect(progress.metrics).toBeDefined();
		});
	});

	describe('TaskResult', () => {
		it('should create valid completed task result', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				completedAt: '2025-12-13T11:00:00.000Z',
				metrics: {
					duration: 600,
					tokensUsed: 30000,
					cost: 0.9,
				},
			};

			expect(result.taskId).toBe('task-1');
			expect(result.workerId).toBe('worker-1');
			expect(result.status).toBe('completed');
			expect(result.metrics.duration).toBe(600);
		});

		it('should support all valid status values', () => {
			const statuses: TaskResult['status'][] = ['completed', 'failed', 'cancelled'];

			for (const status of statuses) {
				const result: TaskResult = {
					taskId: 'task-1',
					workerId: 'worker-1',
					status,
					completedAt: new Date().toISOString(),
					metrics: {
						duration: 100,
						tokensUsed: 1000,
						cost: 0.01,
					},
				};

				expect(result.status).toBe(status);
			}
		});

		it('should include result data for successful completion', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				result: {
					filesModified: ['src/index.ts', 'src/types.ts'],
					commitHash: 'abc123def456',
					validationResults: {
						lintPassed: true,
						testsPassed: true,
						coveragePercent: 85,
					},
				},
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 450,
					tokensUsed: 20000,
					cost: 0.6,
				},
			};

			expect(result.result).toBeDefined();
			expect(result.result?.filesModified).toHaveLength(2);
			expect(result.result?.commitHash).toBe('abc123def456');
			expect(result.result?.validationResults?.lintPassed).toBe(true);
		});

		it('should include error for failed task', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'failed',
				error: {
					message: 'Compilation error',
					code: 'COMPILE_ERROR',
					stack: 'Error: Compilation error\n  at compile()',
				},
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 30,
					tokensUsed: 500,
					cost: 0.015,
				},
			};

			expect(result.error).toBeDefined();
			expect(result.error?.message).toBe('Compilation error');
			expect(result.error?.code).toBe('COMPILE_ERROR');
			expect(result.error?.stack).toBeDefined();
		});

		it('should handle error without stack trace', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'failed',
				error: {
					message: 'Task timeout',
					code: 'TIMEOUT',
				},
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 3600,
					tokensUsed: 100000,
					cost: 3.0,
				},
			};

			expect(result.error?.stack).toBeUndefined();
		});

		it('should handle cancelled task', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'cancelled',
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 60,
					tokensUsed: 1000,
					cost: 0.03,
				},
			};

			expect(result.status).toBe('cancelled');
			expect(result.result).toBeUndefined();
			expect(result.error).toBeUndefined();
		});

		it('should handle zero-cost tasks', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 10,
					tokensUsed: 0,
					cost: 0,
				},
			};

			expect(result.metrics.cost).toBe(0);
			expect(result.metrics.tokensUsed).toBe(0);
		});
	});

	describe('WorkerMessage', () => {
		it('should create register message', () => {
			const message: WorkerMessage = {
				type: 'register',
				data: {
					workerId: 'worker-1',
					capabilities: ['typescript'],
					resources: {
						cpu: 4,
						memory: 8192,
					},
				},
			};

			expect(message.type).toBe('register');
			expect(message.data.workerId).toBe('worker-1');
		});

		it('should create heartbeat message', () => {
			const message: WorkerMessage = {
				type: 'heartbeat',
				data: {
					workerId: 'worker-1',
					timestamp: new Date().toISOString(),
					status: 'idle',
					uptime: 1000,
				},
			};

			expect(message.type).toBe('heartbeat');
			expect(message.data.status).toBe('idle');
		});

		it('should create task progress message', () => {
			const message: WorkerMessage = {
				type: 'task.progress',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					progress: 50,
					status: 'running',
				},
			};

			expect(message.type).toBe('task.progress');
			expect(message.data.progress).toBe(50);
		});

		it('should create task result message', () => {
			const message: WorkerMessage = {
				type: 'task.result',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					status: 'completed',
					completedAt: new Date().toISOString(),
					metrics: {
						duration: 300,
						tokensUsed: 15000,
						cost: 0.45,
					},
				},
			};

			expect(message.type).toBe('task.result');
			expect(message.data.status).toBe('completed');
		});

		it('should create error message', () => {
			const message: WorkerMessage = {
				type: 'error',
				data: {
					workerId: 'worker-1',
					error: 'Connection lost',
				},
			};

			expect(message.type).toBe('error');
			expect(message.data.error).toBe('Connection lost');
		});

		it('should serialize and deserialize messages', () => {
			const originalMessage: WorkerMessage = {
				type: 'heartbeat',
				data: {
					workerId: 'worker-1',
					timestamp: '2025-12-13T10:00:00.000Z',
					status: 'busy',
					currentTask: 'task-123',
					uptime: 5000,
				},
			};

			const serialized = JSON.stringify(originalMessage);
			const deserialized = JSON.parse(serialized) as WorkerMessage;

			expect(deserialized.type).toBe(originalMessage.type);
			if (deserialized.type === 'heartbeat' && originalMessage.type === 'heartbeat') {
				expect(deserialized.data.workerId).toBe(originalMessage.data.workerId);
				expect(deserialized.data.status).toBe(originalMessage.data.status);
				expect(deserialized.data.currentTask).toBe(originalMessage.data.currentTask);
			}
		});
	});

	describe('OrchestratorMessage', () => {
		it('should create registered message', () => {
			const message: OrchestratorMessage = {
				type: 'registered',
				data: {
					workerId: 'worker-1',
					success: true,
				},
			};

			expect(message.type).toBe('registered');
			expect(message.data.success).toBe(true);
		});

		it('should create task assign message', () => {
			const message: OrchestratorMessage = {
				type: 'task.assign',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					assignedAt: new Date().toISOString(),
					taskData: {
						prompt: 'Implement feature',
						repositoryPath: '/path/to/repo',
					},
				},
			};

			expect(message.type).toBe('task.assign');
			expect(message.data.taskId).toBe('task-1');
		});

		it('should create task cancel message', () => {
			const message: OrchestratorMessage = {
				type: 'task.cancel',
				data: {
					taskId: 'task-1',
					reason: 'User cancelled',
				},
			};

			expect(message.type).toBe('task.cancel');
			expect(message.data.reason).toBe('User cancelled');
		});

		it('should create task cancel message without reason', () => {
			const message: OrchestratorMessage = {
				type: 'task.cancel',
				data: {
					taskId: 'task-1',
				},
			};

			expect(message.type).toBe('task.cancel');
			expect(message.data.reason).toBeUndefined();
		});

		it('should create shutdown message', () => {
			const message: OrchestratorMessage = {
				type: 'shutdown',
				data: {
					graceful: true,
					timeout: 30000,
				},
			};

			expect(message.type).toBe('shutdown');
			expect(message.data.graceful).toBe(true);
			expect(message.data.timeout).toBe(30000);
		});

		it('should create shutdown message without timeout', () => {
			const message: OrchestratorMessage = {
				type: 'shutdown',
				data: {
					graceful: false,
				},
			};

			expect(message.type).toBe('shutdown');
			expect(message.data.timeout).toBeUndefined();
		});

		it('should create ping message', () => {
			const message: OrchestratorMessage = {
				type: 'ping',
				data: {
					timestamp: '2025-12-13T10:00:00.000Z',
				},
			};

			expect(message.type).toBe('ping');
			expect(message.data.timestamp).toBe('2025-12-13T10:00:00.000Z');
		});

		it('should serialize and deserialize messages', () => {
			const originalMessage: OrchestratorMessage = {
				type: 'task.assign',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					assignedAt: '2025-12-13T10:00:00.000Z',
					taskData: {
						prompt: 'Fix bug',
						repositoryPath: '/repo',
						maxCost: 1.0,
					},
				},
			};

			const serialized = JSON.stringify(originalMessage);
			const deserialized = JSON.parse(serialized) as OrchestratorMessage;

			expect(deserialized.type).toBe(originalMessage.type);
			if (deserialized.type === 'task.assign' && originalMessage.type === 'task.assign') {
				expect(deserialized.data.taskId).toBe(originalMessage.data.taskId);
				expect(deserialized.data.taskData.maxCost).toBe(originalMessage.data.taskData.maxCost);
			}
		});
	});

	describe('WorkerState', () => {
		it('should create valid worker state', () => {
			const state: WorkerState = {
				workerId: 'worker-1',
				status: 'idle',
				registeredAt: '2025-12-13T09:00:00.000Z',
				lastHeartbeat: '2025-12-13T10:00:00.000Z',
				capabilities: ['typescript', 'node'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
				metrics: {
					totalTasksCompleted: 10,
					totalTasksFailed: 2,
					totalUptime: 7200,
					avgTaskDuration: 300,
				},
			};

			expect(state.workerId).toBe('worker-1');
			expect(state.status).toBe('idle');
			expect(state.metrics.totalTasksCompleted).toBe(10);
		});

		it('should support all valid status values', () => {
			const statuses: Array<'idle' | 'busy' | 'offline'> = ['idle', 'busy', 'offline'];

			for (const status of statuses) {
				const state: WorkerState = {
					workerId: 'worker-1',
					status,
					registeredAt: new Date().toISOString(),
					lastHeartbeat: new Date().toISOString(),
					capabilities: [],
					resources: { cpu: 1, memory: 1024 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				};

				expect(state.status).toBe(status);
			}
		});

		it('should include current task when busy', () => {
			const state: WorkerState = {
				workerId: 'worker-1',
				status: 'busy',
				registeredAt: new Date().toISOString(),
				lastHeartbeat: new Date().toISOString(),
				currentTask: 'task-123',
				capabilities: ['python'],
				resources: { cpu: 8, memory: 16384 },
				metrics: {
					totalTasksCompleted: 5,
					totalTasksFailed: 1,
					totalUptime: 3600,
					avgTaskDuration: 450,
				},
			};

			expect(state.currentTask).toBe('task-123');
		});

		it('should handle worker with no completed tasks', () => {
			const state: WorkerState = {
				workerId: 'worker-new',
				status: 'idle',
				registeredAt: new Date().toISOString(),
				lastHeartbeat: new Date().toISOString(),
				capabilities: ['rust'],
				resources: { cpu: 4, memory: 8192 },
				metrics: {
					totalTasksCompleted: 0,
					totalTasksFailed: 0,
					totalUptime: 0,
					avgTaskDuration: 0,
				},
			};

			expect(state.metrics.totalTasksCompleted).toBe(0);
			expect(state.metrics.avgTaskDuration).toBe(0);
		});

		it('should handle worker with high uptime', () => {
			const state: WorkerState = {
				workerId: 'worker-long-running',
				status: 'idle',
				registeredAt: '2025-12-01T00:00:00.000Z',
				lastHeartbeat: '2025-12-13T10:00:00.000Z',
				capabilities: ['java'],
				resources: { cpu: 16, memory: 32768 },
				metrics: {
					totalTasksCompleted: 1000,
					totalTasksFailed: 50,
					totalUptime: 1036800, // 12 days
					avgTaskDuration: 600,
				},
			};

			expect(state.metrics.totalUptime).toBe(1036800);
			expect(state.metrics.totalTasksCompleted).toBe(1000);
		});
	});

	describe('Message Validation', () => {
		it('should validate required fields in WorkerRegistration', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			expect(registration.workerId).toBeTruthy();
			expect(registration.capabilities).toBeDefined();
			expect(registration.resources).toBeDefined();
			expect(registration.resources.cpu).toBeGreaterThan(0);
			expect(registration.resources.memory).toBeGreaterThan(0);
		});

		it('should validate required fields in WorkerHeartbeat', () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 1000,
			};

			expect(heartbeat.workerId).toBeTruthy();
			expect(heartbeat.timestamp).toBeTruthy();
			expect(heartbeat.status).toBeTruthy();
			expect(heartbeat.uptime).toBeGreaterThanOrEqual(0);
		});

		it('should validate required fields in TaskAssignment', () => {
			const assignment: TaskAssignment = {
				taskId: 'task-1',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: 'Test task',
					repositoryPath: '/path',
				},
			};

			expect(assignment.taskId).toBeTruthy();
			expect(assignment.workerId).toBeTruthy();
			expect(assignment.assignedAt).toBeTruthy();
			expect(assignment.taskData.prompt).toBeTruthy();
			expect(assignment.taskData.repositoryPath).toBeTruthy();
		});

		it('should validate required fields in TaskProgress', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 50,
				status: 'running',
			};

			expect(progress.taskId).toBeTruthy();
			expect(progress.workerId).toBeTruthy();
			expect(progress.progress).toBeGreaterThanOrEqual(0);
			expect(progress.progress).toBeLessThanOrEqual(100);
			expect(progress.status).toBeTruthy();
		});

		it('should validate required fields in TaskResult', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				completedAt: new Date().toISOString(),
				metrics: {
					duration: 100,
					tokensUsed: 1000,
					cost: 0.1,
				},
			};

			expect(result.taskId).toBeTruthy();
			expect(result.workerId).toBeTruthy();
			expect(result.status).toBeTruthy();
			expect(result.completedAt).toBeTruthy();
			expect(result.metrics).toBeDefined();
			expect(result.metrics.duration).toBeGreaterThanOrEqual(0);
			expect(result.metrics.tokensUsed).toBeGreaterThanOrEqual(0);
			expect(result.metrics.cost).toBeGreaterThanOrEqual(0);
		});

		it('should validate timestamp format', () => {
			const timestamp = new Date().toISOString();
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});

		it('should validate progress range', () => {
			const validProgressValues = [0, 25, 50, 75, 100];
			for (const value of validProgressValues) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(100);
			}
		});
	});

	describe('Protocol Edge Cases', () => {
		it('should handle empty capabilities array', () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: [],
				resources: { cpu: 1, memory: 1024 },
			};

			expect(registration.capabilities).toHaveLength(0);
		});

		it('should handle empty logs array', () => {
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 50,
				status: 'running',
				logs: [],
			};

			expect(progress.logs).toHaveLength(0);
		});

		it('should handle empty files modified array', () => {
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				result: {
					filesModified: [],
				},
				completedAt: new Date().toISOString(),
				metrics: { duration: 100, tokensUsed: 1000, cost: 0.1 },
			};

			expect(result.result?.filesModified).toHaveLength(0);
		});

		it('should handle very long error messages', () => {
			const longError = 'Error: '.repeat(1000);
			const result: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'failed',
				error: {
					message: longError,
					code: 'UNKNOWN',
				},
				completedAt: new Date().toISOString(),
				metrics: { duration: 10, tokensUsed: 100, cost: 0.01 },
			};

			expect(result.error?.message.length).toBeGreaterThan(1000);
		});

		it('should handle very large metadata objects', () => {
			const largeMetadata: Record<string, unknown> = {};
			for (let i = 0; i < 100; i++) {
				largeMetadata[`field${i}`] = `value${i}`;
			}

			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['test'],
				resources: { cpu: 1, memory: 1024 },
				metadata: largeMetadata,
			};

			expect(Object.keys(registration.metadata || {}).length).toBe(100);
		});

		it('should handle special characters in strings', () => {
			const specialChars = 'Test with "quotes" and \'apostrophes\' and \n newlines \t tabs';
			const assignment: TaskAssignment = {
				taskId: 'task-1',
				workerId: 'worker-1',
				assignedAt: new Date().toISOString(),
				taskData: {
					prompt: specialChars,
					repositoryPath: '/path/to/repo',
				},
			};

			expect(assignment.taskData.prompt).toBe(specialChars);
		});

		it('should handle Unicode in strings', () => {
			const unicodeText = '测试 🚀 тест';
			const progress: TaskProgress = {
				taskId: 'task-1',
				workerId: 'worker-1',
				progress: 50,
				status: 'running',
				currentStep: unicodeText,
			};

			expect(progress.currentStep).toBe(unicodeText);
		});
	});

	describe('Type Safety', () => {
		it('should enforce correct message types', () => {
			const message: WorkerMessage = {
				type: 'heartbeat',
				data: {
					workerId: 'worker-1',
					timestamp: new Date().toISOString(),
					status: 'idle',
					uptime: 1000,
				},
			};

			// Type narrowing
			if (message.type === 'heartbeat') {
				expect(message.data.status).toBeDefined();
				expect(message.data.uptime).toBeDefined();
			}
		});

		it('should enforce correct orchestrator message types', () => {
			const message: OrchestratorMessage = {
				type: 'task.assign',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					assignedAt: new Date().toISOString(),
					taskData: {
						prompt: 'Test',
						repositoryPath: '/path',
					},
				},
			};

			// Type narrowing
			if (message.type === 'task.assign') {
				expect(message.data.taskId).toBeDefined();
				expect(message.data.taskData).toBeDefined();
			}
		});

		it('should handle union type discrimination', () => {
			const messages: WorkerMessage[] = [
				{
					type: 'register',
					data: {
						workerId: 'worker-1',
						capabilities: [],
						resources: { cpu: 1, memory: 1024 },
					},
				},
				{
					type: 'heartbeat',
					data: {
						workerId: 'worker-1',
						timestamp: new Date().toISOString(),
						status: 'idle',
						uptime: 1000,
					},
				},
			];

			for (const message of messages) {
				expect(message.type).toBeTruthy();
				expect(message.data).toBeDefined();
			}
		});
	});

	describe('JSON Serialization', () => {
		it('should serialize and deserialize WorkerRegistration', () => {
			const original: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript', 'node'],
				resources: { cpu: 4, memory: 8192 },
				metadata: { hostname: 'test-host' },
			};

			const json = JSON.stringify(original);
			const parsed: WorkerRegistration = JSON.parse(json);

			expect(parsed.workerId).toBe(original.workerId);
			expect(parsed.capabilities).toEqual(original.capabilities);
			expect(parsed.resources).toEqual(original.resources);
			expect(parsed.metadata).toEqual(original.metadata);
		});

		it('should serialize and deserialize TaskResult with all fields', () => {
			const original: TaskResult = {
				taskId: 'task-1',
				workerId: 'worker-1',
				status: 'completed',
				result: {
					filesModified: ['file1.ts', 'file2.ts'],
					commitHash: 'abc123',
					validationResults: { passed: true },
				},
				completedAt: '2025-12-13T10:00:00.000Z',
				metrics: { duration: 300, tokensUsed: 15000, cost: 0.45 },
			};

			const json = JSON.stringify(original);
			const parsed: TaskResult = JSON.parse(json);

			expect(parsed).toEqual(original);
		});

		it('should handle nested objects in serialization', () => {
			const message: OrchestratorMessage = {
				type: 'task.assign',
				data: {
					taskId: 'task-1',
					workerId: 'worker-1',
					assignedAt: new Date().toISOString(),
					taskData: {
						prompt: 'Test',
						repositoryPath: '/path',
						qualityGates: {
							nested: { deeply: { value: 123 } },
						},
					},
				},
			};

			const json = JSON.stringify(message);
			const parsed = JSON.parse(json) as OrchestratorMessage;

			if (parsed.type === 'task.assign') {
				expect(parsed.data.taskData.qualityGates).toBeDefined();
			}
		});
	});
});
