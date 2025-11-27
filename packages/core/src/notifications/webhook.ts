/**
 * Generic webhook notification implementation
 * Sends notifications to arbitrary HTTP endpoints
 */

import type { NotificationPayload, NotificationResult, Notifier, WebhookConfig } from './types.js';

interface WebhookPayload {
	title: string;
	message: string;
	level: string;
	metadata?: Record<string, unknown>;
	timestamp: string;
	source: string;
}

export class WebhookNotifier implements Notifier {
	constructor(private config: WebhookConfig) {}

	isConfigured(): boolean {
		return Boolean(this.config.url);
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		const startTime = new Date();

		try {
			if (!this.isConfigured()) {
				throw new Error('Webhook URL not configured');
			}

			const webhookPayload = this.formatPayload(payload);
			const method = this.config.method || 'POST';

			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'User-Agent': 'ADO-Orchestrator/1.0',
				...this.config.headers,
			};

			const response = await fetch(this.config.url, {
				method,
				headers,
				body: JSON.stringify(webhookPayload),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Webhook request failed: ${response.status} - ${errorText}`);
			}

			return {
				channel: 'webhook',
				success: true,
				timestamp: startTime,
			};
		} catch (error) {
			return {
				channel: 'webhook',
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: startTime,
			};
		}
	}

	private formatPayload(payload: NotificationPayload): WebhookPayload {
		const webhookPayload: WebhookPayload = {
			title: payload.title,
			message: payload.message,
			level: payload.level,
			timestamp: (payload.timestamp || new Date()).toISOString(),
			source: 'ado-orchestrator',
		};

		if (payload.metadata !== undefined) {
			webhookPayload.metadata = payload.metadata;
		}

		return webhookPayload;
	}
}
