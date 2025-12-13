/**
 * Tests for Slack Notification Implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackNotifier } from '../slack.js';
import type { NotificationPayload, SlackConfig } from '../types.js';

// Mock fetch
global.fetch = vi.fn();

describe('SlackNotifier', () => {
	let slackConfig: SlackConfig;

	beforeEach(() => {
		vi.clearAllMocks();

		slackConfig = {
			webhookUrl: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX',
			channel: '#ado-notifications',
			username: 'ADO Bot',
			iconEmoji: ':robot_face:',
		};

		// Mock successful fetch response
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'ok',
		});
	});

	describe('Configuration', () => {
		it('should detect configured Slack notifier', () => {
			const notifier = new SlackNotifier(slackConfig);
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should detect missing webhook URL', () => {
			const config = { ...slackConfig, webhookUrl: '' };
			const notifier = new SlackNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should work with minimal configuration', () => {
			const minimalConfig: SlackConfig = {
				webhookUrl: 'https://hooks.slack.com/test',
			};
			const notifier = new SlackNotifier(minimalConfig);
			expect(notifier.isConfigured()).toBe(true);
		});
	});

	describe('Sending Notifications', () => {
		it('should send info level notification', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Task Started',
				message: 'Task execution has begun',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(true);
			expect(result.channel).toBe('slack');
			expect(result.error).toBeUndefined();
			expect(global.fetch).toHaveBeenCalledOnce();

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(fetchCall?.[0]).toBe(slackConfig.webhookUrl);
			expect(fetchCall?.[1]?.method).toBe('POST');
		});

		it('should include correct emoji for info level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Info Message',
				message: 'Information',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.text).toContain(':information_source:');
		});

		it('should include correct emoji for success level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Success',
				message: 'Task completed',
				level: 'success',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.text).toContain(':white_check_mark:');
		});

		it('should include correct emoji for warning level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Warning',
				message: 'Rate limit approaching',
				level: 'warning',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.text).toContain(':warning:');
		});

		it('should include correct emoji for error level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Error',
				message: 'Task failed',
				level: 'error',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.text).toContain(':x:');
		});

		it('should use correct color for info level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Info',
				message: 'Info message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.color).toBe('#3b82f6');
		});

		it('should use correct color for success level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Success',
				message: 'Success message',
				level: 'success',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.color).toBe('#10b981');
		});

		it('should use correct color for warning level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Warning',
				message: 'Warning message',
				level: 'warning',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.color).toBe('#f59e0b');
		});

		it('should use correct color for error level', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Error',
				message: 'Error message',
				level: 'error',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.color).toBe('#ef4444');
		});

		it('should include metadata as fields', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Task Update',
				message: 'Status update',
				level: 'info',
				metadata: {
					taskId: 'task-123',
					provider: 'claude-code',
					duration: '45s',
				},
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			const fields = body.attachments[0]?.fields;

			expect(fields).toHaveLength(3);
			expect(fields[0]).toEqual({
				title: 'taskId',
				value: 'task-123',
				short: true,
			});
			expect(fields[1]).toEqual({
				title: 'provider',
				value: 'claude-code',
				short: true,
			});
			expect(fields[2]).toEqual({
				title: 'duration',
				value: '45s',
				short: true,
			});
		});

		it('should not include fields when no metadata', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.fields).toBeUndefined();
		});

		it('should include timestamp in attachment', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const timestamp = new Date('2025-01-15T10:30:00Z');
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
				timestamp,
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.ts).toBe(Math.floor(timestamp.getTime() / 1000));
		});

		it('should use current timestamp if not provided', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const before = Math.floor(Date.now() / 1000);
			await notifier.send(payload);
			const after = Math.floor(Date.now() / 1000);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			const ts = body.attachments[0]?.ts;

			expect(ts).toBeGreaterThanOrEqual(before);
			expect(ts).toBeLessThanOrEqual(after);
		});

		it('should include channel when specified', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.channel).toBe('#ado-notifications');
		});

		it('should not include channel when not specified', async () => {
			const config = { ...slackConfig };
			delete config.channel;
			const notifier = new SlackNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.channel).toBeUndefined();
		});

		it('should use configured username', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.username).toBe('ADO Bot');
		});

		it('should use default username when not specified', async () => {
			const config = { ...slackConfig };
			delete config.username;
			const notifier = new SlackNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.username).toBe('ADO Bot');
		});

		it('should use configured icon emoji', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.icon_emoji).toBe(':robot_face:');
		});

		it('should use default icon emoji when not specified', async () => {
			const config = { ...slackConfig };
			delete config.iconEmoji;
			const notifier = new SlackNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.icon_emoji).toBe(':robot_face:');
		});

		it('should include ADO footer', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.footer).toBe('ADO Orchestrator');
		});

		it('should send correct headers', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(fetchCall?.[1]?.headers).toEqual({
				'Content-Type': 'application/json',
			});
		});
	});

	describe('Error Handling', () => {
		it('should return error when not configured', async () => {
			const config = { ...slackConfig, webhookUrl: '' };
			const notifier = new SlackNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Slack webhook URL not configured');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('should handle HTTP error responses', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: async () => 'invalid_payload',
			});

			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Slack API error: 400 - invalid_payload');
		});

		it('should handle 500 server errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => 'Internal Server Error',
			});

			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toContain('500');
		});

		it('should handle network errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network connection failed'),
			);

			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Network connection failed');
		});

		it('should handle unknown errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce('Unknown error string');

			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Unknown error');
		});

		it('should include timestamp in error result', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Failed'));

			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const before = Date.now();
			const result = await notifier.send(payload);
			const after = Date.now();

			expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before);
			expect(result.timestamp.getTime()).toBeLessThanOrEqual(after);
		});
	});

	describe('Message Formatting', () => {
		it('should format message with title in text field', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Important Message',
				message: 'Message body',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.text).toContain('Important Message');
		});

		it('should format attachment with title and text', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Attachment Title',
				message: 'Attachment message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.title).toBe('Attachment Title');
			expect(body.attachments[0]?.text).toBe('Attachment message');
		});

		it('should handle special characters in message', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Special chars: <>&"',
				message: 'Message with special chars: <>&"',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.attachments[0]?.title).toContain('<>&"');
		});

		it('should convert metadata values to strings', async () => {
			const notifier = new SlackNotifier(slackConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
				metadata: {
					count: 123,
					enabled: true,
					items: null,
				},
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			const fields = body.attachments[0]?.fields;

			expect(fields[0]?.value).toBe('123');
			expect(fields[1]?.value).toBe('true');
			expect(fields[2]?.value).toBe('null');
		});
	});
});
