/**
 * Tests for GeminiCLIAdapter
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { AgentConfig, AgentEvent, AgentTask, ProjectContext } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiCLIAdapter } from '../adapter.js';

// Mock child_process
vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

// Mock fs for existsSync
vi.mock('node:fs', () => ({
	existsSync: vi.fn(() => true),
}));

// Import after mocking
const { spawn } = await import('node:child_process');

describe('GeminiCLIAdapter', () => {
	let adapter: GeminiCLIAdapter;
	let mockConfig: AgentConfig;
	let mockProjectContext: ProjectContext;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new GeminiCLIAdapter();
		mockProjectContext = {
			projectId: 'test-project',
			repositoryPath: '/test/repo',
			repositoryKey: 'test-key',
		};
		mockConfig = {
			provider: {
				id: 'gemini-cli',
				enabled: true,
				accessModes: [],
				capabilities: adapter.capabilities,
				contextFile: 'GEMINI.md',
			},
			workingDirectory: '/test/dir',
			projectContext: mockProjectContext,
		};
	});

	describe('initialization', () => {
		it('should have correct id', () => {
			expect(adapter.id).toBe('gemini-cli');
		});

		it('should have correct capabilities', () => {
			expect(adapter.capabilities).toEqual({
				codeGeneration: true,
				codeReview: true,
				refactoring: true,
				testing: true,
				documentation: true,
				debugging: true,
				languages: ['typescript', 'python', 'go', 'java', 'kotlin', 'javascript'],
				maxContextTokens: 1000000,
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: false,
			});
		});
	});

	describe('isAvailable', () => {
		it('should return true when gemini CLI is available', async () => {
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			mockProcess.emit('close', 0);

			const result = await availablePromise;

			expect(result).toBe(true);
			expect(spawn).toHaveBeenCalledWith('gemini', ['--version'], {
				stdio: 'pipe',
				shell: true,
			});
		});

		it('should return false when gemini CLI is not available', async () => {
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			mockProcess.emit('error', new Error('Command not found'));

			const result = await availablePromise;

			expect(result).toBe(false);
		});

		it('should timeout after 5 seconds', async () => {
			vi.useFakeTimers();
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const availablePromise = adapter.isAvailable();

			vi.advanceTimersByTime(5000);

			const result = await availablePromise;

			expect(result).toBe(false);
			expect(mockProcess.kill).toHaveBeenCalled();

			vi.useRealTimers();
		});
	});

	describe('execute', () => {
		it('should emit start and complete events on success', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			mockStdout.push('Test output\n');
			mockStdout.push(null); // End stream
			mockStderr.push(null); // End stream
			mockProcess.emit('close', 0);

			const events = await eventsPromise;

			expect(events[0]?.type).toBe('start');
			const outputEvent = events.find((e) => e.type === 'output');
			expect(outputEvent).toBeDefined();
			const completeEvent = events.find((e) => e.type === 'complete');
			expect(completeEvent).toBeDefined();
		});

		it('should spawn gemini with correct arguments', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'gemini',
				expect.arrayContaining(['-p', 'Test prompt', '--model', 'gemini-2.5-pro']),
				expect.objectContaining({
					cwd: '/test/dir',
					shell: false,
					stdio: ['ignore', 'pipe', 'pipe'],
				}),
			);

			mockStdout.push(null);
			mockStderr.push(null);
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should support model option', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
			mockProcess.kill = vi.fn();
			vi.mocked(spawn).mockReturnValue(mockProcess);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
				options: {
					model: 'gemini-1.5-flash',
				},
			};

			const eventsPromise = (async () => {
				const events: AgentEvent[] = [];
				for await (const event of adapter.execute(task)) {
					events.push(event);
				}
				return events;
			})();

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(spawn).toHaveBeenCalledWith(
				'gemini',
				expect.arrayContaining(['--model', 'gemini-1.5-flash']),
				expect.any(Object),
			);

			mockStdout.push(null);
			mockStderr.push(null);
			mockProcess.emit('close', 0);
			await eventsPromise;
		});

		it('should detect rate limit errors', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			mockStdout.push(null);
			mockStderr.push('Error: Rate limit exceeded\n');
			mockStderr.push(null);
			mockProcess.emit('close', 1);

			const events = await eventsPromise;

			const rateLimitEvent = events.find((e) => e.type === 'rate_limit');
			expect(rateLimitEvent).toBeDefined();
		});

		it('should emit error event on non-zero exit code', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			mockStdout.push(null);
			mockStderr.push('Some error\n');
			mockStderr.push(null);
			mockProcess.emit('close', 1);

			const events = await eventsPromise;

			const errorEvent = events.find((e) => e.type === 'error');
			expect(errorEvent).toBeDefined();
			if (errorEvent?.type === 'error') {
				expect(errorEvent.recoverable).toBe(true);
			}
		});

		it('should capture stdout output', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			mockStdout.push('Line 1\n');
			mockStdout.push('Line 2\n');
			mockStdout.push(null);
			mockStderr.push(null);
			mockProcess.emit('close', 0);

			const events = await eventsPromise;

			const outputEvent = events.find((e) => e.type === 'output');
			expect(outputEvent).toBeDefined();
			if (outputEvent?.type === 'output') {
				expect(outputEvent.content).toContain('Line 1');
				expect(outputEvent.content).toContain('Line 2');
			}
		});
	});

	describe('interrupt', () => {
		it('should kill the running process', async () => {
			await adapter.initialize(mockConfig);

			const mockStdout = new Readable({ read() {} });
			const mockStderr = new Readable({ read() {} });
			const mockProcess = new EventEmitter() as ChildProcess;
			mockProcess.stdout = mockStdout as unknown as NodeJS.ReadableStream;
			mockProcess.stderr = mockStderr as unknown as NodeJS.ReadableStream;
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

			await new Promise((resolve) => setTimeout(resolve, 10));

			await adapter.interrupt();

			expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');

			mockStdout.push(null);
			mockStderr.push(null);
			mockProcess.emit('close', 130);
			await eventsPromise;
		});

		it('should handle interrupt when no process is running', async () => {
			await expect(adapter.interrupt()).resolves.toBeUndefined();
		});
	});

	describe('getRateLimitDetector', () => {
		it('should return GeminiRateLimitDetector', () => {
			const detector = adapter.getRateLimitDetector();

			expect(detector).toBeDefined();
		});

		it('should track usage with daily limit of 1000', async () => {
			const detector = adapter.getRateLimitDetector();

			await detector.recordUsage({
				providerId: 'gemini-cli',
				requestCount: 100,
				timestamp: new Date(),
			});

			const status = await detector.getStatus();
			expect(status.isLimited).toBe(false);
			expect(status.remainingRequests).toBe(900); // 1000 - 100
		});

		it('should detect rate limit when limit is reached', async () => {
			const detector = adapter.getRateLimitDetector();

			await detector.recordUsage({
				providerId: 'gemini-cli',
				requestCount: 1000,
				timestamp: new Date(),
			});

			const status = await detector.getStatus();
			expect(status.isLimited).toBe(true);
			expect(status.remainingRequests).toBe(0);
		});

		it('should parse rate limit errors', () => {
			const detector = adapter.getRateLimitDetector();

			const error = new Error('Resource exhausted. Too many requests.');
			const info = detector.parseRateLimitError(error);

			expect(info).not.toBeNull();
			expect(info?.reason).toBe('daily_limit');
		});
	});

	describe('getContextFile', () => {
		it('should return GEMINI.md by default', () => {
			const contextFile = adapter.getContextFile();

			expect(contextFile).toBe('GEMINI.md');
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
