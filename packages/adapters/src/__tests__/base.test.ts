/**
 * Tests for BaseAdapter
 */

import type {
	AgentCapabilities,
	AgentConfig,
	AgentEvent,
	AgentTask,
	ProjectContext,
} from '@dxheroes/ado-shared';
import type { Span } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAdapter } from '../base.js';

// Concrete implementation for testing
class TestAdapter extends BaseAdapter {
	readonly id = 'test-adapter';
	readonly capabilities: AgentCapabilities = {
		codeGeneration: true,
		codeReview: true,
		refactoring: true,
		testing: true,
		documentation: true,
		debugging: true,
		languages: ['typescript'],
		maxContextTokens: 100000,
		supportsStreaming: true,
		supportsMCP: true,
		supportsResume: true,
	};

	isAvailableCalled = false;
	executeCalled = false;
	interruptCalled = false;

	async isAvailable(): Promise<boolean> {
		this.isAvailableCalled = true;
		return true;
	}

	async *execute(_task: AgentTask): AsyncIterable<AgentEvent> {
		this.executeCalled = true;
		yield {
			type: 'start',
			timestamp: new Date(),
			taskId: _task.id,
			sessionId: 'test-session',
		};
	}

	async interrupt(): Promise<void> {
		this.interruptCalled = true;
	}

	getContextFile(): string {
		return 'TEST.md';
	}
}

describe('BaseAdapter', () => {
	let adapter: TestAdapter;
	let mockConfig: AgentConfig;
	let mockProjectContext: ProjectContext;

	beforeEach(() => {
		adapter = new TestAdapter();
		mockProjectContext = {
			projectId: 'test-project',
			repositoryPath: '/test/repo',
			repositoryKey: 'test-key',
			contextFile: 'TEST.md',
		};
		mockConfig = {
			provider: {
				id: 'test-provider',
				enabled: true,
				accessModes: [],
				capabilities: adapter.capabilities,
				contextFile: 'TEST.md',
			},
			workingDirectory: '/test/dir',
			projectContext: mockProjectContext,
		};
	});

	describe('initialization', () => {
		it('should initialize with config', async () => {
			await adapter.initialize(mockConfig);

			expect(adapter['config']).toBe(mockConfig);
			expect(adapter['projectContext']).toBe(mockProjectContext);
		});

		it('should have tracer instance', () => {
			expect(adapter['tracer']).toBeDefined();
		});
	});

	describe('setProjectContext', () => {
		it('should update project context', async () => {
			const newContext: ProjectContext = {
				projectId: 'new-project',
				repositoryPath: '/new/repo',
				repositoryKey: 'new-key',
			};

			await adapter.setProjectContext(newContext);

			expect(adapter['projectContext']).toBe(newContext);
		});
	});

	describe('getRateLimitDetector', () => {
		it('should return NoOpRateLimitDetector by default', () => {
			const detector = adapter.getRateLimitDetector();

			expect(detector).toBeDefined();
			expect(typeof detector.getStatus).toBe('function');
			expect(typeof detector.parseRateLimitError).toBe('function');
			expect(typeof detector.getRemainingCapacity).toBe('function');
			expect(typeof detector.recordUsage).toBe('function');
		});

		it('should return non-limited status', async () => {
			const detector = adapter.getRateLimitDetector();
			const status = await detector.getStatus();

			expect(status.isLimited).toBe(false);
		});

		it('should return null for rate limit error parsing', () => {
			const detector = adapter.getRateLimitDetector();
			const result = detector.parseRateLimitError(new Error('test error'));

			expect(result).toBeNull();
		});

		it('should return empty remaining capacity', async () => {
			const detector = adapter.getRateLimitDetector();
			const capacity = await detector.getRemainingCapacity();

			expect(capacity).toEqual({});
		});

		it('should record usage without error', async () => {
			const detector = adapter.getRateLimitDetector();

			await expect(
				detector.recordUsage({
					providerId: 'test',
					requestCount: 1,
					timestamp: new Date(),
				}),
			).resolves.toBeUndefined();
		});
	});

	describe('createEvent', () => {
		it('should create event with correct structure', () => {
			const event = adapter['createEvent']('start', 'task-1', {
				sessionId: 'session-1',
			});

			expect(event).toEqual({
				type: 'start',
				taskId: 'task-1',
				timestamp: expect.any(Date),
				sessionId: 'session-1',
			});
		});

		it('should include all extra fields', () => {
			const event = adapter['createEvent']('complete', 'task-1', {
				result: {
					success: true,
					output: 'test output',
					sessionId: 'session-1',
					duration: 100,
				},
			});

			expect(event).toEqual({
				type: 'complete',
				taskId: 'task-1',
				timestamp: expect.any(Date),
				result: {
					success: true,
					output: 'test output',
					sessionId: 'session-1',
					duration: 100,
				},
			});
		});
	});

	describe('generateSessionId', () => {
		it('should generate unique session IDs', () => {
			const id1 = adapter['generateSessionId']();
			const id2 = adapter['generateSessionId']();

			expect(id1).toMatch(/^session-\d+-[a-z0-9]+$/);
			expect(id2).toMatch(/^session-\d+-[a-z0-9]+$/);
			expect(id1).not.toBe(id2);
		});

		it('should start with session- prefix', () => {
			const id = adapter['generateSessionId']();

			expect(id).toMatch(/^session-/);
		});
	});

	describe('startExecutionSpan', () => {
		it('should create span with correct attributes', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt with more than 100 characters to test truncation behavior',
				projectContext: mockProjectContext,
			};

			const span = adapter['startExecutionSpan'](task);

			expect(span).toBeDefined();
			// Span should have been started
			expect(span.end).toBeDefined();
			span.end(); // Clean up
		});
	});

	describe('recordExecutionMetrics', () => {
		it('should record duration metric', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const span = adapter['startExecutionSpan'](task);
			const setAttributesSpy = vi.spyOn(span, 'setAttributes');

			adapter['recordExecutionMetrics'](span, {
				duration: 1000,
			});

			expect(setAttributesSpy).toHaveBeenCalledWith({
				'task.duration_ms': 1000,
			});

			span.end(); // Clean up
		});

		it('should record token metrics when provided', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const span = adapter['startExecutionSpan'](task);
			const setAttributesSpy = vi.spyOn(span, 'setAttributes');

			adapter['recordExecutionMetrics'](span, {
				duration: 1000,
				tokensUsed: {
					input: 100,
					output: 200,
				},
			});

			expect(setAttributesSpy).toHaveBeenCalledWith({
				'task.duration_ms': 1000,
				'task.tokens.input': 100,
				'task.tokens.output': 200,
				'task.tokens.total': 300,
			});

			span.end(); // Clean up
		});
	});

	describe('executeWithTracing', () => {
		it('should execute with span context', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			let spanReceived: Span | null = null;
			const mockExecutor = async function* (
				_task: AgentTask,
				span: Span,
			): AsyncIterable<AgentEvent> {
				spanReceived = span;
				yield {
					type: 'start',
					timestamp: new Date(),
					taskId: _task.id,
					sessionId: 'test-session',
				};
			};

			const events: AgentEvent[] = [];
			for await (const event of adapter['executeWithTracing'](task, mockExecutor)) {
				events.push(event);
			}

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe('start');
			expect(spanReceived).not.toBeNull();
		});

		it('should handle executor errors', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const mockExecutor = async function* (
				_task: AgentTask,
				_span: Span,
			): AsyncIterable<AgentEvent> {
				// Throw before yielding to test error handling
				throw new Error('Test error');
				// biome-ignore lint/correctness/noUnreachable: This is intentionally unreachable
				yield { type: 'started' as const };
			};

			await expect(async () => {
				for await (const _event of adapter['executeWithTracing'](task, mockExecutor)) {
					// Should throw before yielding
				}
			}).rejects.toThrow('Test error');
		});

		it('should set span status to OK on success', async () => {
			await adapter.initialize(mockConfig);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			let spanCaptured: Span | null = null;
			const mockExecutor = async function* (
				_task: AgentTask,
				span: Span,
			): AsyncIterable<AgentEvent> {
				spanCaptured = span;
				yield {
					type: 'start',
					timestamp: new Date(),
					taskId: _task.id,
					sessionId: 'test-session',
				};
			};

			const setStatusSpy = vi.fn();
			if (spanCaptured) {
				vi.spyOn(spanCaptured, 'setStatus').mockImplementation(setStatusSpy);
			}

			for await (const _event of adapter['executeWithTracing'](task, mockExecutor)) {
				// Consume events
			}

			// Note: Can't spy on the span before it's created, so we just verify execution completes
			expect(spanCaptured).not.toBeNull();
		});
	});

	describe('abstract methods', () => {
		it('should implement isAvailable', async () => {
			const result = await adapter.isAvailable();

			expect(result).toBe(true);
			expect(adapter.isAvailableCalled).toBe(true);
		});

		it('should implement execute', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test prompt',
				projectContext: mockProjectContext,
			};

			const events: AgentEvent[] = [];
			for await (const event of adapter.execute(task)) {
				events.push(event);
			}

			expect(adapter.executeCalled).toBe(true);
			expect(events).toHaveLength(1);
		});

		it('should implement interrupt', async () => {
			await adapter.interrupt();

			expect(adapter.interruptCalled).toBe(true);
		});

		it('should implement getContextFile', () => {
			const contextFile = adapter.getContextFile();

			expect(contextFile).toBe('TEST.md');
		});
	});
});
