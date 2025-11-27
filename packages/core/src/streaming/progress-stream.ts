/**
 * Progress Stream - Real-time task progress updates using async iterators.
 */

import type { AgentEvent } from '@dxheroes/ado-shared';

/**
 * Task event types for streaming
 */
export type TaskEventType =
	| 'task_queued'
	| 'task_started'
	| 'task_progress'
	| 'task_output'
	| 'task_paused'
	| 'task_resumed'
	| 'task_completed'
	| 'task_failed'
	| 'task_cancelled'
	| 'checkpoint_created'
	| 'approval_requested'
	| 'approval_decided';

/**
 * Base task event
 */
export interface TaskEventBase {
	type: TaskEventType;
	taskId: string;
	timestamp: Date;
}

/**
 * Task queued event
 */
export interface TaskQueuedEvent extends TaskEventBase {
	type: 'task_queued';
	priority: number;
	queuePosition: number;
}

/**
 * Task started event
 */
export interface TaskStartedEvent extends TaskEventBase {
	type: 'task_started';
	providerId: string;
	sessionId?: string;
}

/**
 * Task progress event
 */
export interface TaskProgressEvent extends TaskEventBase {
	type: 'task_progress';
	progress: number; // 0-100
	message?: string;
}

/**
 * Task output event
 */
export interface TaskOutputEvent extends TaskEventBase {
	type: 'task_output';
	content: string;
	isPartial: boolean;
}

/**
 * Task paused event
 */
export interface TaskPausedEvent extends TaskEventBase {
	type: 'task_paused';
	reason: string;
}

/**
 * Task resumed event
 */
export interface TaskResumedEvent extends TaskEventBase {
	type: 'task_resumed';
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent extends TaskEventBase {
	type: 'task_completed';
	success: boolean;
	output: string;
	duration: number;
}

/**
 * Task failed event
 */
export interface TaskFailedEvent extends TaskEventBase {
	type: 'task_failed';
	error: string;
	recoverable: boolean;
}

/**
 * Task cancelled event
 */
export interface TaskCancelledEvent extends TaskEventBase {
	type: 'task_cancelled';
	reason: string;
}

/**
 * Checkpoint created event
 */
export interface CheckpointCreatedEvent extends TaskEventBase {
	type: 'checkpoint_created';
	checkpointId: string;
}

/**
 * Approval requested event
 */
export interface ApprovalRequestedEvent extends TaskEventBase {
	type: 'approval_requested';
	approvalId: string;
	message: string;
}

/**
 * Approval decided event
 */
export interface ApprovalDecidedEvent extends TaskEventBase {
	type: 'approval_decided';
	approvalId: string;
	approved: boolean;
}

/**
 * Union of all task events
 */
export type TaskEvent =
	| TaskQueuedEvent
	| TaskStartedEvent
	| TaskProgressEvent
	| TaskOutputEvent
	| TaskPausedEvent
	| TaskResumedEvent
	| TaskCompletedEvent
	| TaskFailedEvent
	| TaskCancelledEvent
	| CheckpointCreatedEvent
	| ApprovalRequestedEvent
	| ApprovalDecidedEvent;

/**
 * Task status information
 */
export interface TaskStatus {
	taskId: string;
	status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
	progress: number;
	providerId?: string;
	sessionId?: string;
	startedAt?: Date;
	completedAt?: Date;
	duration?: number;
	output?: string;
	error?: string;
}

/**
 * Task handle for managing subscription
 */
export interface TaskHandle {
	taskId: string;
	subscribe(): AsyncIterable<TaskEvent>;
	getStatus(): Promise<TaskStatus>;
	cancel(): Promise<void>;
}

/**
 * Progress stream manager
 */
export class ProgressStream {
	private subscribers: Map<string, Set<(event: TaskEvent) => void>> = new Map();
	private taskStatuses: Map<string, TaskStatus> = new Map();
	private eventBuffers: Map<string, TaskEvent[]> = new Map();

	/**
	 * Emit an event for a task
	 */
	emit(event: TaskEvent): void {
		// Update task status
		this.updateStatus(event);

		// Buffer event
		const buffer = this.eventBuffers.get(event.taskId) ?? [];
		buffer.push(event);
		this.eventBuffers.set(event.taskId, buffer);

		// Notify subscribers
		const subscribers = this.subscribers.get(event.taskId);
		if (subscribers) {
			for (const handler of subscribers) {
				try {
					handler(event);
				} catch (error) {
					// biome-ignore lint/suspicious/noConsole: Error logging
					console.error('Error in subscriber handler:', error);
				}
			}
		}

		// Cleanup completed/failed/cancelled tasks after broadcasting
		if (['task_completed', 'task_failed', 'task_cancelled'].includes(event.type)) {
			// Keep events for a while for late subscribers
			setTimeout(() => {
				this.eventBuffers.delete(event.taskId);
			}, 60000); // 1 minute
		}
	}

	/**
	 * Subscribe to events for a task
	 */
	async *subscribe(taskId: string): AsyncIterable<TaskEvent> {
		// Yield buffered events first
		const buffer = this.eventBuffers.get(taskId) ?? [];
		for (const event of buffer) {
			yield event;
		}

		// Check if task is already completed
		const status = this.taskStatuses.get(taskId);
		if (status && ['completed', 'failed', 'cancelled'].includes(status.status)) {
			return;
		}

		// Subscribe to new events
		const queue: TaskEvent[] = [];
		let resolve: ((value: IteratorResult<TaskEvent>) => void) | null = null;

		const handler = (event: TaskEvent) => {
			if (resolve) {
				resolve({ value: event, done: false });
				resolve = null;
			} else {
				queue.push(event);
			}
		};

		// Add subscriber
		const subscribers = this.subscribers.get(taskId) ?? new Set();
		subscribers.add(handler);
		this.subscribers.set(taskId, subscribers);

		try {
			while (true) {
				// Yield queued events
				while (queue.length > 0) {
					const event = queue.shift();
					if (event) {
						yield event;

						// Check if task is done
						if (['task_completed', 'task_failed', 'task_cancelled'].includes(event.type)) {
							return;
						}
					}
				}

				// Wait for next event
				const event = await new Promise<TaskEvent>((res) => {
					resolve = (result) => {
						if (!result.done && result.value) {
							res(result.value);
						}
					};
				});

				yield event;

				// Check if task is done
				if (['task_completed', 'task_failed', 'task_cancelled'].includes(event.type)) {
					return;
				}
			}
		} finally {
			// Cleanup subscriber
			subscribers.delete(handler);
			if (subscribers.size === 0) {
				this.subscribers.delete(taskId);
			}
		}
	}

	/**
	 * Get current status of a task
	 */
	getStatus(taskId: string): TaskStatus | undefined {
		return this.taskStatuses.get(taskId);
	}

	/**
	 * Get all task statuses
	 */
	getAllStatuses(): TaskStatus[] {
		return Array.from(this.taskStatuses.values());
	}

	/**
	 * Update task status based on event
	 */
	private updateStatus(event: TaskEvent): void {
		const current = this.taskStatuses.get(event.taskId) ?? {
			taskId: event.taskId,
			status: 'queued',
			progress: 0,
		};

		switch (event.type) {
			case 'task_queued':
				current.status = 'queued';
				break;

			case 'task_started':
				current.status = 'running';
				current.providerId = event.providerId;
				if (event.sessionId) {
					current.sessionId = event.sessionId;
				}
				current.startedAt = event.timestamp;
				current.progress = 0;
				break;

			case 'task_progress':
				current.progress = event.progress;
				break;

			case 'task_output':
				current.output = (current.output ?? '') + event.content;
				break;

			case 'task_paused':
				current.status = 'paused';
				break;

			case 'task_resumed':
				current.status = 'running';
				break;

			case 'task_completed':
				current.status = 'completed';
				current.completedAt = event.timestamp;
				current.duration = event.duration;
				current.output = event.output;
				current.progress = 100;
				break;

			case 'task_failed':
				current.status = 'failed';
				current.completedAt = event.timestamp;
				current.error = event.error;
				break;

			case 'task_cancelled':
				current.status = 'cancelled';
				current.completedAt = event.timestamp;
				break;
		}

		this.taskStatuses.set(event.taskId, current);
	}

	/**
	 * Convert agent events to task events
	 */
	async *fromAgentEvents(
		taskId: string,
		events: AsyncIterable<AgentEvent>,
	): AsyncIterable<TaskEvent> {
		for await (const event of events) {
			let taskEvent: TaskEvent | null = null;

			switch (event.type) {
				case 'start':
					taskEvent = {
						type: 'task_started',
						taskId,
						timestamp: event.timestamp,
						providerId: '', // Should be set by caller
						sessionId: event.sessionId,
					};
					break;

				case 'output':
					taskEvent = {
						type: 'task_output',
						taskId,
						timestamp: event.timestamp,
						content: event.content,
						isPartial: event.isPartial,
					};
					break;

				case 'complete':
					taskEvent = {
						type: 'task_completed',
						taskId,
						timestamp: event.timestamp,
						success: event.result.success,
						output: event.result.output,
						duration: event.result.duration,
					};
					break;

				case 'error':
					taskEvent = {
						type: 'task_failed',
						taskId,
						timestamp: event.timestamp,
						error: event.error.message,
						recoverable: event.recoverable,
					};
					break;

				case 'interrupt':
					taskEvent = {
						type: 'task_paused',
						taskId,
						timestamp: event.timestamp,
						reason: event.reason,
					};
					break;
			}

			if (taskEvent) {
				this.emit(taskEvent);
				yield taskEvent;
			}
		}
	}

	/**
	 * Cleanup old task data
	 */
	cleanup(taskId: string): void {
		this.taskStatuses.delete(taskId);
		this.eventBuffers.delete(taskId);
		this.subscribers.delete(taskId);
	}

	/**
	 * Clear all data
	 */
	clear(): void {
		this.taskStatuses.clear();
		this.eventBuffers.clear();
		this.subscribers.clear();
	}
}

/**
 * Create a new progress stream
 */
export function createProgressStream(): ProgressStream {
	return new ProgressStream();
}
