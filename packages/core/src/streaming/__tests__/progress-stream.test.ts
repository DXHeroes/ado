/**
 * Progress Stream Tests
 *
 * Comprehensive test suite for ProgressStream covering:
 * - Event emission and buffering
 * - Subscription management
 * - Status tracking
 * - Agent event conversion
 * - Cleanup and edge cases
 */

import type {
	AgentCompleteEvent,
	AgentErrorEvent,
	AgentEvent,
	AgentInterruptEvent,
} from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ProgressStream,
	type TaskCompletedEvent,
	type TaskEvent,
	type TaskFailedEvent,
	type TaskOutputEvent,
	type TaskPausedEvent,
	type TaskProgressEvent,
	type TaskQueuedEvent,
	type TaskResumedEvent,
	type TaskStartedEvent,
	createProgressStream,
} from '../progress-stream.js';

describe('ProgressStream', () => {
	let stream: ProgressStream;

	beforeEach(() => {
		stream = createProgressStream();
	});

	describe('emit', () => {
		it('should emit task_queued event', () => {
			const event: TaskQueuedEvent = {
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			};

			stream.emit(event);

			const status = stream.getStatus('task-1');
			expect(status).toBeDefined();
			expect(status?.status).toBe('queued');
			expect(status?.taskId).toBe('task-1');
		});

		it('should emit task_started event', () => {
			const event: TaskStartedEvent = {
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				sessionId: 'session-1',
			};

			stream.emit(event);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
			expect(status?.providerId).toBe('claude-code');
			expect(status?.sessionId).toBe('session-1');
			expect(status?.startedAt).toBeDefined();
			expect(status?.progress).toBe(0);
		});

		it('should emit task_progress event', () => {
			const startEvent: TaskStartedEvent = {
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			};
			stream.emit(startEvent);

			const progressEvent: TaskProgressEvent = {
				type: 'task_progress',
				taskId: 'task-1',
				timestamp: new Date(),
				progress: 50,
				message: 'Halfway there',
			};
			stream.emit(progressEvent);

			const status = stream.getStatus('task-1');
			expect(status?.progress).toBe(50);
		});

		it('should emit task_output event and append content', () => {
			const output1: TaskOutputEvent = {
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: 'First line\n',
				isPartial: true,
			};
			stream.emit(output1);

			const output2: TaskOutputEvent = {
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: 'Second line\n',
				isPartial: false,
			};
			stream.emit(output2);

			const status = stream.getStatus('task-1');
			expect(status?.output).toBe('First line\nSecond line\n');
		});

		it('should emit task_paused event', () => {
			const startEvent: TaskStartedEvent = {
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			};
			stream.emit(startEvent);

			const pausedEvent: TaskPausedEvent = {
				type: 'task_paused',
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'User requested pause',
			};
			stream.emit(pausedEvent);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('paused');
		});

		it('should emit task_resumed event', () => {
			const pausedEvent: TaskPausedEvent = {
				type: 'task_paused',
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'Test',
			};
			stream.emit(pausedEvent);

			const resumedEvent: TaskResumedEvent = {
				type: 'task_resumed',
				taskId: 'task-1',
				timestamp: new Date(),
			};
			stream.emit(resumedEvent);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
		});

		it('should emit task_completed event', () => {
			const completedEvent: TaskCompletedEvent = {
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Task completed successfully',
				duration: 5000,
			};
			stream.emit(completedEvent);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('completed');
			expect(status?.output).toBe('Task completed successfully');
			expect(status?.duration).toBe(5000);
			expect(status?.completedAt).toBeDefined();
			expect(status?.progress).toBe(100);
		});

		it('should emit task_failed event', () => {
			const failedEvent: TaskFailedEvent = {
				type: 'task_failed',
				taskId: 'task-1',
				timestamp: new Date(),
				error: 'Something went wrong',
				recoverable: false,
			};
			stream.emit(failedEvent);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('failed');
			expect(status?.error).toBe('Something went wrong');
			expect(status?.completedAt).toBeDefined();
		});

		it('should emit task_cancelled event', () => {
			const cancelledEvent = {
				type: 'task_cancelled' as const,
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'User cancelled',
			};
			stream.emit(cancelledEvent);

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('cancelled');
			expect(status?.completedAt).toBeDefined();
		});

		it('should buffer events for subscribers', () => {
			const event1: TaskQueuedEvent = {
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			};
			const event2: TaskStartedEvent = {
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			};

			stream.emit(event1);
			stream.emit(event2);

			// Events should be buffered
			const status = stream.getStatus('task-1');
			expect(status).toBeDefined();
		});

		it('should notify subscribers when event is emitted', async () => {
			const receivedEvents: TaskEvent[] = [];

			// Subscribe before emitting
			const subscription = stream.subscribe('task-1');
			const collectEvents = async () => {
				for await (const event of subscription) {
					receivedEvents.push(event);
				}
			};

			// Start collecting in background
			const promise = collectEvents();

			// Use setImmediate to let subscription set up
			await new Promise((resolve) => setImmediate(resolve));

			// Emit events
			const event1: TaskQueuedEvent = {
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			};
			stream.emit(event1);

			const event2: TaskCompletedEvent = {
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			};
			stream.emit(event2);

			// Wait for events to be collected
			await promise;

			expect(receivedEvents).toHaveLength(2);
			expect(receivedEvents[0].type).toBe('task_queued');
			expect(receivedEvents[1].type).toBe('task_completed');
		});

		it('should handle subscriber errors gracefully', () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Create a manual subscriber that throws
			const subscribers = (stream as any).subscribers;
			const errorHandler = () => {
				throw new Error('Subscriber error');
			};
			const taskSubscribers = new Set([errorHandler]);
			subscribers.set('task-1', taskSubscribers);

			const event: TaskQueuedEvent = {
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			};

			// Should not throw
			expect(() => stream.emit(event)).not.toThrow();
			expect(errorSpy).toHaveBeenCalled();

			errorSpy.mockRestore();
		});

		it('should schedule buffer cleanup after completion', () => {
			vi.useFakeTimers();
			try {
				const completedEvent: TaskCompletedEvent = {
					type: 'task_completed',
					taskId: 'task-1',
					timestamp: new Date(),
					success: true,
					output: 'Done',
					duration: 1000,
				};
				stream.emit(completedEvent);

				// Buffer should exist immediately after
				const buffers = (stream as any).eventBuffers;
				expect(buffers.has('task-1')).toBe(true);

				// Fast forward 60 seconds
				vi.advanceTimersByTime(60000);

				// Buffer should be cleaned up
				expect(buffers.has('task-1')).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});

		it('should schedule buffer cleanup after failure', () => {
			vi.useFakeTimers();
			try {
				const failedEvent: TaskFailedEvent = {
					type: 'task_failed',
					taskId: 'task-1',
					timestamp: new Date(),
					error: 'Error',
					recoverable: false,
				};
				stream.emit(failedEvent);

				const buffers = (stream as any).eventBuffers;
				expect(buffers.has('task-1')).toBe(true);

				vi.advanceTimersByTime(60000);
				expect(buffers.has('task-1')).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});

		it('should schedule buffer cleanup after cancellation', () => {
			vi.useFakeTimers();
			try {
				const cancelledEvent = {
					type: 'task_cancelled' as const,
					taskId: 'task-1',
					timestamp: new Date(),
					reason: 'Cancelled',
				};
				stream.emit(cancelledEvent);

				const buffers = (stream as any).eventBuffers;
				expect(buffers.has('task-1')).toBe(true);

				vi.advanceTimersByTime(60000);
				expect(buffers.has('task-1')).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('subscribe', () => {
		it('should yield buffered events first', async () => {
			// Emit events before subscribing
			const event1: TaskQueuedEvent = {
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			};
			const event2: TaskStartedEvent = {
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			};
			stream.emit(event1);
			stream.emit(event2);

			// Subscribe after events were emitted
			const _events: TaskEvent[] = [];
			const subscription = stream.subscribe('task-1');

			const event3: TaskCompletedEvent = {
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			};

			// Collect buffered events
			const iterator = subscription[Symbol.asyncIterator]();
			const result1 = await iterator.next();
			expect(result1.done).toBe(false);
			expect(result1.value.type).toBe('task_queued');

			const result2 = await iterator.next();
			expect(result2.done).toBe(false);
			expect(result2.value.type).toBe('task_started');

			// Now emit completion
			stream.emit(event3);

			const result3 = await iterator.next();
			expect(result3.done).toBe(false);
			expect(result3.value.type).toBe('task_completed');

			// Should be done after completion
			const result4 = await iterator.next();
			expect(result4.done).toBe(true);
		});

		it('should subscribe to new events after buffered events', async () => {
			const events: TaskEvent[] = [];

			// Subscribe first
			const subscription = stream.subscribe('task-1');
			const collectEvents = async () => {
				for await (const event of subscription) {
					events.push(event);
				}
			};
			const promise = collectEvents();

			// Give subscription time to set up
			await new Promise((resolve) => setImmediate(resolve));

			// Emit events
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			await promise;

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe('task_queued');
			expect(events[1].type).toBe('task_completed');
		});

		it('should unsubscribe on completion', async () => {
			const subscription = stream.subscribe('task-1');
			const collectEvents = async () => {
				const events: TaskEvent[] = [];
				for await (const event of subscription) {
					events.push(event);
				}
				return events;
			};
			const promise = collectEvents();

			await new Promise((resolve) => setImmediate(resolve));

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			const _events = await promise;

			// Subscribers should be cleaned up
			const subscribers = (stream as any).subscribers;
			expect(subscribers.has('task-1')).toBe(false);
		});

		it('should handle multiple subscribers for same task', async () => {
			const events1: TaskEvent[] = [];
			const events2: TaskEvent[] = [];

			const subscription1 = stream.subscribe('task-1');
			const subscription2 = stream.subscribe('task-1');

			const collect1 = async () => {
				for await (const event of subscription1) {
					events1.push(event);
				}
			};

			const collect2 = async () => {
				for await (const event of subscription2) {
					events2.push(event);
				}
			};

			const promise1 = collect1();
			const promise2 = collect2();

			await new Promise((resolve) => setImmediate(resolve));

			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			await Promise.all([promise1, promise2]);

			// Both subscribers should receive events
			expect(events1).toHaveLength(2);
			expect(events2).toHaveLength(2);
			expect(events1[0].type).toBe('task_queued');
			expect(events2[0].type).toBe('task_queued');
		});

		it('should handle late subscriber getting buffered events', async () => {
			// Emit some events first
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			// Subscribe late
			const _events: TaskEvent[] = [];
			const subscription = stream.subscribe('task-1');

			const iterator = subscription[Symbol.asyncIterator]();

			// Should get buffered events
			const result1 = await iterator.next();
			expect(result1.done).toBe(false);
			expect(result1.value.type).toBe('task_queued');

			const result2 = await iterator.next();
			expect(result2.done).toBe(false);
			expect(result2.value.type).toBe('task_started');

			// Complete the task
			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			const result3 = await iterator.next();
			expect(result3.done).toBe(false);
			expect(result3.value.type).toBe('task_completed');

			const result4 = await iterator.next();
			expect(result4.done).toBe(true);
		});

		it('should return immediately for completed task', async () => {
			// Complete task first
			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			// Subscribe after completion
			const events: TaskEvent[] = [];
			for await (const event of stream.subscribe('task-1')) {
				events.push(event);
			}

			// Should only get the buffered completion event
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('task_completed');
		});

		it('should return immediately for failed task', async () => {
			stream.emit({
				type: 'task_failed',
				taskId: 'task-1',
				timestamp: new Date(),
				error: 'Error',
				recoverable: false,
			});

			const events: TaskEvent[] = [];
			for await (const event of stream.subscribe('task-1')) {
				events.push(event);
			}

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('task_failed');
		});

		it('should return immediately for cancelled task', async () => {
			stream.emit({
				type: 'task_cancelled',
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'Cancelled',
			});

			const events: TaskEvent[] = [];
			for await (const event of stream.subscribe('task-1')) {
				events.push(event);
			}

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('task_cancelled');
		});

		it('should cleanup subscriber on iterator return', async () => {
			const subscription = stream.subscribe('task-1');
			const iterator = subscription[Symbol.asyncIterator]();

			// Start subscription and create promise
			const nextPromise = iterator.next();

			await new Promise((resolve) => setImmediate(resolve));

			// Verify subscriber exists
			const subscribers = (stream as any).subscribers;
			expect(subscribers.has('task-1')).toBe(true);

			// Emit a completion event to unblock the iterator
			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
			});

			// Consume the completion event
			const result = await nextPromise;
			expect(result.value?.type).toBe('task_completed');

			// Try to get next - this should return done and trigger cleanup
			const doneResult = await iterator.next();
			expect(doneResult.done).toBe(true);

			// Verify subscriber was cleaned up after iterator is done
			expect(subscribers.has('task-1')).toBe(false);
		});
	});

	describe('getStatus', () => {
		it('should return current task status', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				sessionId: 'session-1',
			});

			const status = stream.getStatus('task-1');
			expect(status).toBeDefined();
			expect(status?.taskId).toBe('task-1');
			expect(status?.status).toBe('running');
			expect(status?.providerId).toBe('claude-code');
			expect(status?.sessionId).toBe('session-1');
		});

		it('should return undefined for unknown task', () => {
			const status = stream.getStatus('unknown-task');
			expect(status).toBeUndefined();
		});

		it('should reflect latest status updates', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			let status = stream.getStatus('task-1');
			expect(status?.status).toBe('queued');

			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			status = stream.getStatus('task-1');
			expect(status?.status).toBe('completed');
		});
	});

	describe('getAllStatuses', () => {
		it('should return all task statuses', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-2',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			const statuses = stream.getAllStatuses();
			expect(statuses).toHaveLength(2);
			expect(statuses.map((s) => s.taskId)).toContain('task-1');
			expect(statuses.map((s) => s.taskId)).toContain('task-2');
		});

		it('should return empty array when no tasks', () => {
			const statuses = stream.getAllStatuses();
			expect(statuses).toHaveLength(0);
		});
	});

	describe('status updates', () => {
		it('should update status to queued on task_queued', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('queued');
		});

		it('should update status to running on task_started', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				sessionId: 'session-1',
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
			expect(status?.providerId).toBe('claude-code');
			expect(status?.sessionId).toBe('session-1');
			expect(status?.startedAt).toBeDefined();
			expect(status?.progress).toBe(0);
		});

		it('should update progress on task_progress', () => {
			stream.emit({
				type: 'task_progress',
				taskId: 'task-1',
				timestamp: new Date(),
				progress: 75,
				message: 'Almost done',
			});

			const status = stream.getStatus('task-1');
			expect(status?.progress).toBe(75);
		});

		it('should append output on task_output', () => {
			stream.emit({
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: 'Line 1\n',
				isPartial: true,
			});

			stream.emit({
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: 'Line 2\n',
				isPartial: false,
			});

			const status = stream.getStatus('task-1');
			expect(status?.output).toBe('Line 1\nLine 2\n');
		});

		it('should update status to paused on task_paused', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			stream.emit({
				type: 'task_paused',
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'User pause',
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('paused');
		});

		it('should update status to running on task_resumed', () => {
			stream.emit({
				type: 'task_paused',
				taskId: 'task-1',
				timestamp: new Date(),
				reason: 'Pause',
			});

			stream.emit({
				type: 'task_resumed',
				taskId: 'task-1',
				timestamp: new Date(),
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
		});

		it('should update status to completed on task_completed', () => {
			const timestamp = new Date();
			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp,
				success: true,
				output: 'Final output',
				duration: 5000,
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('completed');
			expect(status?.completedAt).toEqual(timestamp);
			expect(status?.duration).toBe(5000);
			expect(status?.output).toBe('Final output');
			expect(status?.progress).toBe(100);
		});

		it('should update status to failed on task_failed', () => {
			const timestamp = new Date();
			stream.emit({
				type: 'task_failed',
				taskId: 'task-1',
				timestamp,
				error: 'Something went wrong',
				recoverable: true,
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('failed');
			expect(status?.completedAt).toEqual(timestamp);
			expect(status?.error).toBe('Something went wrong');
		});

		it('should update status to cancelled on task_cancelled', () => {
			const timestamp = new Date();
			stream.emit({
				type: 'task_cancelled',
				taskId: 'task-1',
				timestamp,
				reason: 'User cancelled',
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('cancelled');
			expect(status?.completedAt).toEqual(timestamp);
		});

		it('should handle sessionId being optional', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				// No sessionId
			});

			const status = stream.getStatus('task-1');
			expect(status?.providerId).toBe('claude-code');
			expect(status?.sessionId).toBeUndefined();
		});

		it('should preserve existing status when adding sessionId', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				sessionId: 'session-1',
			});

			const status = stream.getStatus('task-1');
			expect(status?.sessionId).toBe('session-1');
		});
	});

	describe('fromAgentEvents', () => {
		it('should convert AgentStartEvent to TaskStartedEvent', async () => {
			const agentEvents: AgentEvent[] = [
				{
					type: 'start',
					taskId: 'task-1',
					timestamp: new Date(),
					sessionId: 'session-1',
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_started');
			expect((taskEvents[0] as TaskStartedEvent).sessionId).toBe('session-1');
		});

		it('should convert AgentOutputEvent to TaskOutputEvent', async () => {
			const agentEvents: AgentEvent[] = [
				{
					type: 'output',
					taskId: 'task-1',
					timestamp: new Date(),
					content: 'Test output',
					isPartial: true,
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_output');
			const outputEvent = taskEvents[0] as TaskOutputEvent;
			expect(outputEvent.content).toBe('Test output');
			expect(outputEvent.isPartial).toBe(true);
		});

		it('should convert AgentCompleteEvent to TaskCompletedEvent', async () => {
			const agentEvents: AgentCompleteEvent[] = [
				{
					type: 'complete',
					taskId: 'task-1',
					timestamp: new Date(),
					result: {
						success: true,
						output: 'Task done',
						sessionId: 'session-1',
						duration: 3000,
					},
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_completed');
			const completeEvent = taskEvents[0] as TaskCompletedEvent;
			expect(completeEvent.success).toBe(true);
			expect(completeEvent.output).toBe('Task done');
			expect(completeEvent.duration).toBe(3000);
		});

		it('should convert AgentErrorEvent to TaskFailedEvent', async () => {
			const agentEvents: AgentErrorEvent[] = [
				{
					type: 'error',
					taskId: 'task-1',
					timestamp: new Date(),
					error: new Error('Test error'),
					recoverable: false,
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_failed');
			const failedEvent = taskEvents[0] as TaskFailedEvent;
			expect(failedEvent.error).toBe('Test error');
			expect(failedEvent.recoverable).toBe(false);
		});

		it('should convert AgentInterruptEvent to TaskPausedEvent', async () => {
			const agentEvents: AgentInterruptEvent[] = [
				{
					type: 'interrupt',
					taskId: 'task-1',
					timestamp: new Date(),
					reason: 'User interrupt',
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_paused');
			const pausedEvent = taskEvents[0] as TaskPausedEvent;
			expect(pausedEvent.reason).toBe('User interrupt');
		});

		it('should skip unsupported agent events', async () => {
			const agentEvents: AgentEvent[] = [
				{
					type: 'tool_use',
					taskId: 'task-1',
					timestamp: new Date(),
					toolName: 'test',
					toolInput: {},
				},
				{
					type: 'output',
					taskId: 'task-1',
					timestamp: new Date(),
					content: 'Test',
					isPartial: false,
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			// Only output event should be converted
			expect(taskEvents).toHaveLength(1);
			expect(taskEvents[0].type).toBe('task_output');
		});

		it('should emit converted events to stream', async () => {
			const agentEvents: AgentEvent[] = [
				{
					type: 'start',
					taskId: 'task-1',
					timestamp: new Date(),
					sessionId: 'session-1',
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			// Consume the async iterable
			for await (const _event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				// Events are emitted
			}

			// Status should be updated
			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
		});

		it('should handle multiple agent events', async () => {
			const agentEvents: AgentEvent[] = [
				{
					type: 'start',
					taskId: 'task-1',
					timestamp: new Date(),
					sessionId: 'session-1',
				},
				{
					type: 'output',
					taskId: 'task-1',
					timestamp: new Date(),
					content: 'Working...',
					isPartial: true,
				},
				{
					type: 'complete',
					taskId: 'task-1',
					timestamp: new Date(),
					result: {
						success: true,
						output: 'Done',
						sessionId: 'session-1',
						duration: 1000,
					},
				},
			];

			async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
				for (const item of items) {
					yield item;
				}
			}

			const taskEvents: TaskEvent[] = [];
			for await (const event of stream.fromAgentEvents(
				'task-1',
				createAsyncIterable(agentEvents),
			)) {
				taskEvents.push(event);
			}

			expect(taskEvents).toHaveLength(3);
			expect(taskEvents[0].type).toBe('task_started');
			expect(taskEvents[1].type).toBe('task_output');
			expect(taskEvents[2].type).toBe('task_completed');
		});
	});

	describe('cleanup', () => {
		it('should remove task status', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			expect(stream.getStatus('task-1')).toBeDefined();

			stream.cleanup('task-1');

			expect(stream.getStatus('task-1')).toBeUndefined();
		});

		it('should remove event buffer', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			const buffers = (stream as any).eventBuffers;
			expect(buffers.has('task-1')).toBe(true);

			stream.cleanup('task-1');

			expect(buffers.has('task-1')).toBe(false);
		});

		it('should remove subscribers', async () => {
			const subscription = stream.subscribe('task-1');
			const iterator = subscription[Symbol.asyncIterator]();

			// Start subscription
			const nextPromise = iterator.next();
			await new Promise((resolve) => setImmediate(resolve));

			const subscribers = (stream as any).subscribers;
			expect(subscribers.has('task-1')).toBe(true);

			stream.cleanup('task-1');

			expect(subscribers.has('task-1')).toBe(false);

			// Cleanup pending promise
			nextPromise.catch(() => {}); // Ignore any errors
		});

		it('should not throw for non-existent task', () => {
			expect(() => stream.cleanup('non-existent')).not.toThrow();
		});
	});

	describe('clear', () => {
		it('should remove all task statuses', () => {
			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-2',
				timestamp: new Date(),
				providerId: 'gemini-cli',
			});

			expect(stream.getAllStatuses()).toHaveLength(2);

			stream.clear();

			expect(stream.getAllStatuses()).toHaveLength(0);
		});

		it('should remove all event buffers', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_queued',
				taskId: 'task-2',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 1,
			});

			const buffers = (stream as any).eventBuffers;
			expect(buffers.size).toBe(2);

			stream.clear();

			expect(buffers.size).toBe(0);
		});

		it('should remove all subscribers', async () => {
			const subscription1 = stream.subscribe('task-1');
			const subscription2 = stream.subscribe('task-2');

			const iterator1 = subscription1[Symbol.asyncIterator]();
			const iterator2 = subscription2[Symbol.asyncIterator]();

			// Start the iterators
			const next1Promise = iterator1.next();
			const next2Promise = iterator2.next();

			await new Promise((resolve) => setImmediate(resolve));

			const subscribers = (stream as any).subscribers;
			expect(subscribers.size).toBe(2);

			stream.clear();

			expect(subscribers.size).toBe(0);

			// Cleanup iterators - ignore any errors since subscribers were cleared
			next1Promise.catch(() => {});
			next2Promise.catch(() => {});
		});
	});

	describe('edge cases', () => {
		it('should handle rapid event emission', async () => {
			const events: TaskEvent[] = [];
			const subscription = stream.subscribe('task-1');
			const collectEvents = async () => {
				for await (const event of subscription) {
					events.push(event);
				}
			};
			const promise = collectEvents();

			await new Promise((resolve) => setImmediate(resolve));

			// Emit many events rapidly
			for (let i = 0; i < 100; i++) {
				stream.emit({
					type: 'task_progress',
					taskId: 'task-1',
					timestamp: new Date(),
					progress: i,
				});
			}

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			await promise;

			// Should receive all events
			expect(events.length).toBeGreaterThanOrEqual(101);
		});

		it('should handle subscription to non-existent task', async () => {
			const _events: TaskEvent[] = [];

			const subscription = stream.subscribe('non-existent');
			const iterator = subscription[Symbol.asyncIterator]();

			// Emit an event for different task
			stream.emit({
				type: 'task_queued',
				taskId: 'other-task',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			// Complete the task we're subscribed to
			stream.emit({
				type: 'task_completed',
				taskId: 'non-existent',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			const result = await iterator.next();
			expect(result.done).toBe(false);
			expect(result.value.type).toBe('task_completed');

			const result2 = await iterator.next();
			expect(result2.done).toBe(true);
		});

		it('should handle empty output concatenation', () => {
			stream.emit({
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: '',
				isPartial: true,
			});

			const status = stream.getStatus('task-1');
			expect(status?.output).toBe('');
		});

		it('should preserve status across multiple status types', () => {
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				sessionId: 'session-1',
			});

			stream.emit({
				type: 'task_progress',
				taskId: 'task-1',
				timestamp: new Date(),
				progress: 50,
			});

			stream.emit({
				type: 'task_output',
				taskId: 'task-1',
				timestamp: new Date(),
				content: 'Output',
				isPartial: false,
			});

			const status = stream.getStatus('task-1');
			expect(status?.status).toBe('running');
			expect(status?.providerId).toBe('claude-code');
			expect(status?.sessionId).toBe('session-1');
			expect(status?.progress).toBe(50);
			expect(status?.output).toBe('Output');
		});

		it('should handle checkpoint and approval events', () => {
			stream.emit({
				type: 'checkpoint_created',
				taskId: 'task-1',
				timestamp: new Date(),
				checkpointId: 'checkpoint-1',
			});

			stream.emit({
				type: 'approval_requested',
				taskId: 'task-1',
				timestamp: new Date(),
				approvalId: 'approval-1',
				message: 'Approve this?',
			});

			stream.emit({
				type: 'approval_decided',
				taskId: 'task-1',
				timestamp: new Date(),
				approvalId: 'approval-1',
				approved: true,
			});

			// These events don't update status but should be buffered
			const buffers = (stream as any).eventBuffers;
			expect(buffers.get('task-1').length).toBe(3);
		});

		it('should handle concurrent subscriptions and emissions', async () => {
			const events1: TaskEvent[] = [];
			const events2: TaskEvent[] = [];
			const events3: TaskEvent[] = [];

			const subscription1 = stream.subscribe('task-1');
			const subscription2 = stream.subscribe('task-1');
			const subscription3 = stream.subscribe('task-1');

			const collect1 = async () => {
				for await (const event of subscription1) {
					events1.push(event);
				}
			};

			const collect2 = async () => {
				for await (const event of subscription2) {
					events2.push(event);
				}
			};

			const collect3 = async () => {
				for await (const event of subscription3) {
					events3.push(event);
				}
			};

			const promises = [collect1(), collect2(), collect3()];

			await new Promise((resolve) => setImmediate(resolve));

			// Emit events concurrently
			stream.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			stream.emit({
				type: 'task_started',
				taskId: 'task-1',
				timestamp: new Date(),
				providerId: 'claude-code',
			});

			stream.emit({
				type: 'task_completed',
				taskId: 'task-1',
				timestamp: new Date(),
				success: true,
				output: 'Done',
				duration: 1000,
			});

			await Promise.all(promises);

			// All subscribers should get all events
			expect(events1).toHaveLength(3);
			expect(events2).toHaveLength(3);
			expect(events3).toHaveLength(3);
		});
	});

	describe('createProgressStream', () => {
		it('should create a new ProgressStream instance', () => {
			const newStream = createProgressStream();
			expect(newStream).toBeInstanceOf(ProgressStream);
		});

		it('should create independent instances', () => {
			const stream1 = createProgressStream();
			const stream2 = createProgressStream();

			stream1.emit({
				type: 'task_queued',
				taskId: 'task-1',
				timestamp: new Date(),
				priority: 1,
				queuePosition: 0,
			});

			expect(stream1.getStatus('task-1')).toBeDefined();
			expect(stream2.getStatus('task-1')).toBeUndefined();
		});
	});
});
