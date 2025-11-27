/**
 * Email notification implementation using nodemailer
 */

import type {
	EmailConfig,
	NotificationLevel,
	NotificationPayload,
	NotificationResult,
	Notifier,
} from './types.js';

const LEVEL_SUBJECTS: Record<NotificationLevel, string> = {
	info: '[INFO]',
	success: '[SUCCESS]',
	warning: '[WARNING]',
	error: '[ERROR]',
};

interface EmailMessage {
	from: string;
	to: string | string[];
	subject: string;
	html: string;
	text: string;
}

// NodeMailer transporter type (using unknown for lazy load)
interface MailTransporter {
	sendMail(options: {
		from: string;
		to: string | string[];
		subject: string;
		html: string;
		text: string;
	}): Promise<{ messageId: string }>;
}

export class EmailNotifier implements Notifier {
	private transporter: MailTransporter | null = null;

	constructor(private config: EmailConfig) {
		this.initTransporter();
	}

	private async initTransporter() {
		// Lazy load nodemailer only when email notifications are used
		try {
			const nodemailer = await import('nodemailer');

			if (this.config.smtp) {
				this.transporter = nodemailer.createTransport({
					host: this.config.smtp.host,
					port: this.config.smtp.port,
					secure: this.config.smtp.secure,
					auth: {
						user: this.config.smtp.auth.user,
						pass: this.config.smtp.auth.pass,
					},
				});
			} else {
				// Use default SMTP test account for development
				const testAccount = await nodemailer.createTestAccount();
				this.transporter = nodemailer.createTransport({
					host: 'smtp.ethereal.email',
					port: 587,
					secure: false,
					auth: {
						user: testAccount.user,
						pass: testAccount.pass,
					},
				});
			}
		} catch (_error) {}
	}

	isConfigured(): boolean {
		return Boolean(this.config.from && this.config.to);
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		const startTime = new Date();

		try {
			if (!this.isConfigured()) {
				throw new Error('Email configuration incomplete');
			}

			if (!this.transporter) {
				await this.initTransporter();
				if (!this.transporter) {
					throw new Error('Email transporter not initialized');
				}
			}

			const message = this.formatMessage(payload);

			await this.transporter.sendMail(message);

			return {
				channel: 'email',
				success: true,
				timestamp: startTime,
			};
		} catch (error) {
			return {
				channel: 'email',
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: startTime,
			};
		}
	}

	private formatMessage(payload: NotificationPayload): EmailMessage {
		const levelPrefix = LEVEL_SUBJECTS[payload.level];
		const subject = `${levelPrefix} ${payload.title}`;

		// Generate HTML email
		const html = this.generateHTML(payload);

		// Generate plain text version
		const text = this.generatePlainText(payload);

		return {
			from: this.config.from,
			to: this.config.to,
			subject,
			html,
			text,
		};
	}

	private generateHTML(payload: NotificationPayload): string {
		const levelColors: Record<NotificationLevel, string> = {
			info: '#3b82f6',
			success: '#10b981',
			warning: '#f59e0b',
			error: '#ef4444',
		};

		const color = levelColors[payload.level];

		let metadataHTML = '';
		if (payload.metadata) {
			metadataHTML = `
				<div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 4px;">
					<h3 style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">Details:</h3>
					${Object.entries(payload.metadata)
						.map(
							([key, value]) => `
						<div style="margin: 5px 0;">
							<strong style="color: #374151;">${key}:</strong>
							<span style="color: #6b7280;">${value}</span>
						</div>
					`,
						)
						.join('')}
				</div>
			`;
		}

		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0;">
				<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
					<div style="border-left: 4px solid ${color}; padding-left: 20px; margin-bottom: 20px;">
						<h2 style="margin: 0; color: #111827; font-size: 20px;">${payload.title}</h2>
						<p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">
							${payload.level}
						</p>
					</div>

					<div style="margin: 20px 0;">
						<p style="margin: 0; white-space: pre-wrap;">${payload.message}</p>
					</div>

					${metadataHTML}

					<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
						<p style="margin: 0;">ADO - Agentic Development Orchestrator</p>
						<p style="margin: 5px 0 0 0;">${payload.timestamp?.toLocaleString() || new Date().toLocaleString()}</p>
					</div>
				</div>
			</body>
			</html>
		`;
	}

	private generatePlainText(payload: NotificationPayload): string {
		let text = `${payload.title}\n`;
		text += `${'='.repeat(payload.title.length)}\n\n`;
		text += `Level: ${payload.level.toUpperCase()}\n\n`;
		text += `${payload.message}\n`;

		if (payload.metadata) {
			text += '\nDetails:\n';
			for (const [key, value] of Object.entries(payload.metadata)) {
				text += `  ${key}: ${value}\n`;
			}
		}

		text += '\n---\nADO - Agentic Development Orchestrator\n';
		text += `${payload.timestamp?.toLocaleString() || new Date().toLocaleString()}\n`;

		return text;
	}
}
