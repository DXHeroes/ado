/**
 * Tests for ClaudeCodeAdapter
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type {
	AgentConfig,
	AgentEvent,
	AgentTask,
	ProjectContext,
} from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeCodeAdapter } from '../adapter.js';

// Mock child_process
vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

// Mock fs for existsSync and statSync
vi.mock('node:fs', () => ({
	existsSync: vi.fn(() => true),
	statSync: vi.fn(() => ({ size: 1000 })),
}));

// Import after mocking
const { spawn } = await import('node:child_process');

describe('ClaudeCodeAdapter', () => {
	let adapter: ClaudeCodeAdapter;
	let mockConfig: AgentConfig;
	let mockProjectContext: ProjectContext;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new ClaudeCodeAdapter();
		mockProjectContext = {
			projectId: 'test-project',
			repositoryPath: '/test/repo',
			repositoryKey: 'test-key',
		};
		mockConfig = {
			provider: {
				id: 'claude-code',
				enabled: true,
				accessModes: [],
				capabilities: adapter.capabilities,
				contextFile: 'CLAUDE.md',
			},
			workingDirectory: '/test/dir',
			projectContext: mockProjectContext,
		};
	});

	describe('initialization', () => {
		it('should have correct id', () => {
			expect(adapter.id).toBe('claude-code');
		});

		it('should have correct capabilities', () => {
			expect(adapter.capabilities).toEqual({
				codeGeneration: true,
				codeReview: true,
				refactoring: true,
				testing: true,
				documentation: true,
				debugging: true,
				languages: [
					'typescript',
					'python',
					'go',
					'rust',
					'java',
					'javascript',
					'c',
					'cpp',
				],
				maxContextTokens: 200000,
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: true,
			});
		});

		it('should initialize with config', async () => {
			await adapter.initialize(mockConfig);

			expect(adapter['config']).toBe(mockConfig);
		});
	});

	describe('isAvailable', () => {
		it('should return true when claude CLI is available', async () => {
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			// Simulate successful execution
			mockProcess.emit('close', 0);

			const result = await availablePromise;

			expect(result).toBe(true);
			expect(spawn).toHaveBeenCalledWith('claude', ['--version'], {
				stdio: 'pipe',
				shell: true,
			});
		});

		it('should return false when claude CLI is not available', async () => {
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			// Simulate error
			mockProcess.emit('error', new Error('Command not found'));

			const result = await availablePromise;

			expect(result).toBe(false);
		});

		it('should return false when command exits with non-zero code', async () => {
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			// Simulate non-zero exit
			mockProcess.emit('close', 1);

			const result = await availablePromise;

			expect(result).toBe(false);
		});

		it('should timeout after 5 seconds', async () => {
			vi.useFakeTimers();
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			// Fast-forward time
			vi.advanceTimersByTime(5000);

			const result = await availablePromise;

			expect(result).toBe(false);
			expect(mockProcess.kill).toHaveBeenCalled();

			vi.useRealTimers();
		});
	});

	describe('execute', () => {
		it('should emit start event', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait a bit for start event
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Simulate successful completion
			mockProcess.emit('close', 0);

			const events = await eventsPromise;

			expect(events[0]?.type).toBe('start');
			expect(events[0]).toHaveProperty('sessionId');
		});

		it('should emit complete event on success', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Simulate successful completion
			mockProcess.emit('close', 0);

			const events = await eventsPromise;

			const completeEvent = events.find((e) => e.type === 'complete');
			expect(completeEvent).toBeDefined();
			expect(completeEvent?.type).toBe('complete');
			if (completeEvent?.type === 'complete') {
				expect(completeEvent.result.success).toBe(true);
				expect(completeEvent.result).toHaveProperty('duration');
				expect(completeEvent.result).toHaveProperty('sessionId');
			}
		});

		it('should emit error event on failure', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Simulate failure
			mockProcess.emit('close', 1);

			const events = await eventsPromise;

			const errorEvent = events.find((e) => e.type === 'error');
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.type).toBe('error');
			if (errorEvent?.type === 'error') {
				expect(errorEvent.error.message).toContain('exited with code 1');
			}
		});

		it('should spawn claude with correct arguments', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for spawn to be called
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['-p', 'Test prompt']),
				expect.objectContaining({
					cwd: '/test/dir',
					shell: false,
					stdio: ['ignore', 'inherit', 'inherit'],
				}),
			);

			// Complete the process
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should support resume option', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
				sessionId: 'existing-session',
				options: {
					resume: true,
				},
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for spawn to be called
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['--resume', 'existing-session']),
				expect.any(Object),
			);

			// Complete the process
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should support model option', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
				options: {
					model: 'claude-opus-4',
				},
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for spawn to be called
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['--model', 'claude-opus-4']),
				expect.any(Object),
			);

			// Complete the process
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should support maxTurns option', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
				options: {
					maxTurns: 10,
				},
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for spawn to be called
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['--max-turns', '10']),
				expect.any(Object),
			);

			// Complete the process
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should support permissionMode option', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
				options: {
					permissionMode: 'acceptEdits',
				},
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for spawn to be called
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['--permission-mode', 'acceptEdits']),
				expect.any(Object),
			);

			// Complete the process
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should handle process errors', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Simulate process error
			mockProcess.emit('error', new Error('Spawn failed'));

			const events = await eventsPromise;

			const errorEvent = events.find((e) => e.type === 'error');
			expect(errorEvent).toBeDefined();
		});

		it('should mark SIGINT errors as recoverable', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Simulate SIGINT (exit code 130)
			mockProcess.emit('close', 130);

			const events = await eventsPromise;

			const errorEvent = events.find((e) => e.type === 'error');
			expect(errorEvent).toBeDefined();
			if (errorEvent?.type === 'error') {
				expect(errorEvent.recoverable).toBe(true);
			}
		});
	});

	describe('interrupt', () => {
		it('should kill the running process', async () => {
			await adapter.initialize(mockConfig);

			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			// Start execution
			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			// Wait for process to start
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Interrupt
			await adapter.interrupt();

			expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');

			// Complete the process
			mockProcess.emit('close', 130);
			await eventsPromise;
		});

		it('should handle interrupt when no process is running', async () => {
			await expect(adapter.interrupt()).resolves.toBeUndefined();
		});
	});

	describe('getRateLimitDetector', () => {
		it('should return ClaudeRateLimitDetector', () => {
			const detector = adapter.getRateLimitDetector();

			expect(detector).toBeDefined();
		});

		it('should track usage', async () => {
			const detector = adapter.getRateLimitDetector();

			await detector.recordUsage({
				providerId: 'claude-code',
				requestCount: 5,
				timestamp: new Date(),
			});

			const status = await detector.getStatus();
			expect(status.isLimited).toBe(false);
			expect(status.remainingRequests).toBe(495); // 500 - 5
		});

		it('should detect rate limit when limit is reached', async () => {
			const detector = adapter.getRateLimitDetector();

			// Record usage up to limit
			await detector.recordUsage({
				providerId: 'claude-code',
				requestCount: 500,
				timestamp: new Date(),
			});

			const status = await detector.getStatus();
			expect(status.isLimited).toBe(true);
			expect(status.remainingRequests).toBe(0);
		});

		it('should parse rate limit errors', () => {
			const detector = adapter.getRateLimitDetector();

			const error = new Error('Rate limit exceeded. Please retry after 60 seconds.');
			const info = detector.parseRateLimitError(error);

			expect(info).not.toBeNull();
			expect(info?.reason).toBe('daily_limit');
			expect(info?.retryAfter).toBe(60);
		});

		it('should return null for non-rate-limit errors', () => {
			const detector = adapter.getRateLimitDetector();

			const error = new Error('Some other error');
			const info = detector.parseRateLimitError(error);

			expect(info).toBeNull();
		});

		it('should get remaining capacity', async () => {
			const detector = adapter.getRateLimitDetector();

			const capacity = await detector.getRemainingCapacity();

			expect(capacity.requests).toBe(500);
			expect(capacity.resetsAt).toBeInstanceOf(Date);
		});
	});

	describe('getContextFile', () => {
		it('should return CLAUDE.md by default', () => {
			const contextFile = adapter.getContextFile();

			expect(contextFile).toBe('CLAUDE.md');
		});

		it('should return custom context file from config', async () => {
			const customConfig = {
				...mockConfig,
				provider: {
					...mockConfig.provider,
					contextFile: 'CUSTOM.md',
				},
			};

			await adapter.initialize(customConfig);

			const contextFile = adapter.getContextFile();

			expect(contextFile).toBe('CUSTOM.md');
		});
	});
});
