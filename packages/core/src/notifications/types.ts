/**
 * Notification types and interfaces for ADO notifications system
 */

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export type NotificationChannel = 'slack' | 'email' | 'webhook';

export interface NotificationPayload {
	title: string;
	message: string;
	level: NotificationLevel;
	metadata?: Record<string, unknown>;
	timestamp?: Date;
}

export interface SlackConfig {
	webhookUrl: string;
	channel?: string;
	username?: string;
	iconEmoji?: string;
}

export interface EmailConfig {
	from: string;
	to: string | string[];
	smtp?: {
		host: string;
		port: number;
		secure: boolean;
		auth: {
			user: string;
			pass: string;
		};
	};
}

export interface WebhookConfig {
	url: string;
	headers?: Record<string, string>;
	method?: 'POST' | 'PUT';
}

export interface NotificationConfig {
	slack?: SlackConfig;
	email?: EmailConfig;
	webhook?: WebhookConfig;
	enabledChannels: NotificationChannel[];
}

export interface NotificationResult {
	channel: NotificationChannel;
	success: boolean;
	error?: string;
	timestamp: Date;
}

export interface Notifier {
	send(payload: NotificationPayload): Promise<NotificationResult>;
	isConfigured(): boolean;
}
