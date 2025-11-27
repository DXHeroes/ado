/**
 * Slack notification implementation using Webhook API
 */

import type {
	NotificationLevel,
	NotificationPayload,
	NotificationResult,
	Notifier,
	SlackConfig,
} from './types.js';

const LEVEL_COLORS: Record<NotificationLevel, string> = {
	info: '#3b82f6', // blue
	success: '#10b981', // green
	warning: '#f59e0b', // amber
	error: '#ef4444', // red
};

const LEVEL_EMOJIS: Record<NotificationLevel, string> = {
	info: ':information_source:',
	success: ':white_check_mark:',
	warning: ':warning:',
	error: ':x:',
};

interface SlackAttachment {
	color: string;
	title: string;
	text: string;
	fields?: Array<{ title: string; value: string; short: boolean }>;
	footer?: string;
	ts?: number;
}

interface SlackMessage {
	channel?: string;
	username?: string;
	icon_emoji?: string;
	text: string;
	attachments?: SlackAttachment[];
}

export class SlackNotifier implements Notifier {
	constructor(private config: SlackConfig) {}

	isConfigured(): boolean {
		return Boolean(this.config.webhookUrl);
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		const startTime = new Date();

		try {
			if (!this.isConfigured()) {
				throw new Error('Slack webhook URL not configured');
			}

			const message = this.formatMessage(payload);

			const response = await fetch(this.config.webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Slack API error: ${response.status} - ${errorText}`);
			}

			return {
				channel: 'slack',
				success: true,
				timestamp: startTime,
			};
		} catch (error) {
			return {
				channel: 'slack',
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: startTime,
			};
		}
	}

	private formatMessage(payload: NotificationPayload): SlackMessage {
		const emoji = LEVEL_EMOJIS[payload.level];
		const color = LEVEL_COLORS[payload.level];

		const attachment: SlackAttachment = {
			color,
			title: payload.title,
			text: payload.message,
			footer: 'ADO Orchestrator' as string,
			ts: payload.timestamp
				? Math.floor(payload.timestamp.getTime() / 1000)
				: Math.floor(Date.now() / 1000),
		};

		// Add metadata fields if present
		if (payload.metadata) {
			attachment.fields = Object.entries(payload.metadata).map(([key, value]) => ({
				title: key,
				value: String(value),
				short: true,
			}));
		}

		const message: SlackMessage = {
			username: this.config.username || 'ADO Bot',
			icon_emoji: this.config.iconEmoji || ':robot_face:',
			text: `${emoji} *${payload.title}*`,
			attachments: [attachment],
		};

		if (this.config.channel) {
			message.channel = this.config.channel;
		}

		return message;
	}
}
