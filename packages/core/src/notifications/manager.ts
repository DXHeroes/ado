/**
 * Notification manager - coordinates multiple notification channels
 */

import { EmailNotifier } from './email.js';
import { SlackNotifier } from './slack.js';
import { WebhookNotifier } from './webhook.js';
import type {
	NotificationChannel,
	NotificationConfig,
	NotificationPayload,
	NotificationResult,
	Notifier,
} from './types.js';

export class NotificationManager {
	private notifiers = new Map<NotificationChannel, Notifier>();

	constructor(private config: NotificationConfig) {
		this.initializeNotifiers();
	}

	private initializeNotifiers(): void {
		// Initialize Slack notifier
		if (this.config.slack && this.config.enabledChannels.includes('slack')) {
			this.notifiers.set('slack', new SlackNotifier(this.config.slack));
		}

		// Initialize Email notifier
		if (this.config.email && this.config.enabledChannels.includes('email')) {
			this.notifiers.set('email', new EmailNotifier(this.config.email));
		}

		// Initialize Webhook notifier
		if (this.config.webhook && this.config.enabledChannels.includes('webhook')) {
			this.notifiers.set('webhook', new WebhookNotifier(this.config.webhook));
		}
	}

	/**
	 * Send notification to all enabled channels
	 */
	async send(payload: NotificationPayload): Promise<Map<NotificationChannel, NotificationResult>> {
		const results = new Map<NotificationChannel, NotificationResult>();

		// Add timestamp if not provided
		if (!payload.timestamp) {
			payload.timestamp = new Date();
		}

		// Send to all enabled channels in parallel
		const promises = Array.from(this.notifiers.entries()).map(async ([channel, notifier]) => {
			if (notifier.isConfigured()) {
				const result = await notifier.send(payload);
				results.set(channel, result);
			} else {
				results.set(channel, {
					channel,
					success: false,
					error: 'Not configured',
					timestamp: new Date(),
				});
			}
		});

		await Promise.all(promises);

		return results;
	}

	/**
	 * Send notification to specific channels
	 */
	async sendToChannels(
		payload: NotificationPayload,
		channels: NotificationChannel[],
	): Promise<Map<NotificationChannel, NotificationResult>> {
		const results = new Map<NotificationChannel, NotificationResult>();

		// Add timestamp if not provided
		if (!payload.timestamp) {
			payload.timestamp = new Date();
		}

		const promises = channels.map(async (channel) => {
			const notifier = this.notifiers.get(channel);
			if (notifier?.isConfigured()) {
				const result = await notifier.send(payload);
				results.set(channel, result);
			} else {
				results.set(channel, {
					channel,
					success: false,
					error: notifier ? 'Not configured' : 'Channel not available',
					timestamp: new Date(),
				});
			}
		});

		await Promise.all(promises);

		return results;
	}

	/**
	 * Check if a specific channel is configured and available
	 */
	isChannelAvailable(channel: NotificationChannel): boolean {
		const notifier = this.notifiers.get(channel);
		return Boolean(notifier?.isConfigured());
	}

	/**
	 * Get all available channels
	 */
	getAvailableChannels(): NotificationChannel[] {
		return Array.from(this.notifiers.entries())
			.filter(([_, notifier]) => notifier.isConfigured())
			.map(([channel]) => channel);
	}

	/**
	 * Update configuration and reinitialize notifiers
	 */
	updateConfig(config: NotificationConfig): void {
		this.config = config;
		this.notifiers.clear();
		this.initializeNotifiers();
	}
}

/**
 * Helper functions for common notification scenarios
 */

export function createTaskStartedNotification(taskId: string, prompt: string) {
	return {
		title: 'Task Started',
		message: `Task ${taskId} has started execution.\n\nPrompt: ${prompt}`,
		level: 'info' as const,
		metadata: {
			taskId,
		},
	};
}

export function createTaskCompletedNotification(taskId: string, duration: number) {
	return {
		title: 'Task Completed',
		message: `Task ${taskId} completed successfully in ${duration}s.`,
		level: 'success' as const,
		metadata: {
			taskId,
			duration: `${duration}s`,
		},
	};
}

export function createTaskFailedNotification(taskId: string, error: string) {
	return {
		title: 'Task Failed',
		message: `Task ${taskId} failed with error:\n\n${error}`,
		level: 'error' as const,
		metadata: {
			taskId,
		},
	};
}

export function createRateLimitNotification(provider: string, resetsAt?: Date) {
	return {
		title: 'Rate Limit Reached',
		message: `Provider "${provider}" has reached its rate limit.${
			resetsAt ? `\n\nResets at: ${resetsAt.toLocaleString()}` : ''
		}`,
		level: 'warning' as const,
		metadata: {
			provider,
			resetsAt: resetsAt?.toISOString(),
		},
	};
}

export function createCostThresholdNotification(cost: number, threshold: number, taskId: string) {
	return {
		title: 'Cost Threshold Exceeded',
		message: `Task ${taskId} has exceeded the cost threshold.\n\nActual: $${cost.toFixed(2)}\nThreshold: $${threshold.toFixed(2)}`,
		level: 'warning' as const,
		metadata: {
			taskId,
			cost: `$${cost.toFixed(2)}`,
			threshold: `$${threshold.toFixed(2)}`,
		},
	};
}
