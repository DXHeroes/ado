/**
 * Tests for Webhook Notification Implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload, WebhookConfig } from '../types.js';
import { WebhookNotifier } from '../webhook.js';

// Mock fetch
global.fetch = vi.fn();

describe('WebhookNotifier', () => {
	let webhookConfig: WebhookConfig;

	beforeEach(() => {
		vi.clearAllMocks();

		webhookConfig = {
			url: 'https://example.com/webhook',
			headers: {
				'X-Custom-Header': 'custom-value',
				Authorization: 'Bearer token-123',
			},
			method: 'POST',
		};

		// Mock successful fetch response
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'OK',
		});
	});

	describe('Configuration', () => {
		it('should detect configured webhook notifier', () => {
			const notifier = new WebhookNotifier(webhookConfig);
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should detect missing URL', () => {
			const config = { ...webhookConfig, url: '' };
			const notifier = new WebhookNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should work with minimal configuration', () => {
			const minimalConfig: WebhookConfig = {
				url: 'https://example.com/webhook',
			};
			const notifier = new WebhookNotifier(minimalConfig);
			expect(notifier.isConfigured()).toBe(true);
		});
	});

	describe('Sending Notifications', () => {
		it('should send notification with POST method', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Task Started',
				message: 'Task execution has begun',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(true);
			expect(result.channel).toBe('webhook');
			expect(result.error).toBeUndefined();
			expect(global.fetch).toHaveBeenCalledOnce();

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(fetchCall?.[0]).toBe(webhookConfig.url);
			expect(fetchCall?.[1]?.method).toBe('POST');
		});

		it('should send notification with PUT method', async () => {
			const config = { ...webhookConfig, method: 'PUT' as const };
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(fetchCall?.[1]?.method).toBe('PUT');
		});

		it('should default to POST method when not specified', async () => {
			const config = { ...webhookConfig };
			config.method = undefined;
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(fetchCall?.[1]?.method).toBe('POST');
		});

		it('should include all notification fields in payload', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Task Update',
				message: 'Status update message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);

			expect(body.title).toBe('Task Update');
			expect(body.message).toBe('Status update message');
			expect(body.level).toBe('info');
			expect(body.source).toBe('ado-orchestrator');
			expect(body.timestamp).toBeDefined();
		});

		it('should send info level notification', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Info',
				message: 'Info message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.level).toBe('info');
		});

		it('should send success level notification', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Success',
				message: 'Success message',
				level: 'success',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.level).toBe('success');
		});

		it('should send warning level notification', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Warning',
				message: 'Warning message',
				level: 'warning',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.level).toBe('warning');
		});

		it('should send error level notification', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Error',
				message: 'Error message',
				level: 'error',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.level).toBe('error');
		});

		it('should include metadata when provided', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Task Update',
				message: 'Status update',
				level: 'info',
				metadata: {
					taskId: 'task-123',
					provider: 'claude-code',
					duration: '45s',
					count: 42,
				},
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);

			expect(body.metadata).toBeDefined();
			expect(body.metadata.taskId).toBe('task-123');
			expect(body.metadata.provider).toBe('claude-code');
			expect(body.metadata.duration).toBe('45s');
			expect(body.metadata.count).toBe(42);
		});

		it('should not include metadata when not provided', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);

			expect(body.metadata).toBeUndefined();
		});

		it('should format timestamp as ISO string', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
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
			expect(body.timestamp).toBe('2025-01-15T10:30:00.000Z');
		});

		it('should use current timestamp if not provided', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const before = new Date();
			await notifier.send(payload);
			const after = new Date();

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			const timestamp = new Date(body.timestamp);

			expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		it('should include source field', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.source).toBe('ado-orchestrator');
		});
	});

	describe('HTTP Headers', () => {
		it('should send default headers', async () => {
			const config: WebhookConfig = {
				url: 'https://example.com/webhook',
			};
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const headers = fetchCall?.[1]?.headers;

			expect(headers?.['Content-Type']).toBe('application/json');
			expect(headers?.['User-Agent']).toBe('ADO-Orchestrator/1.0');
		});

		it('should merge custom headers with defaults', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const headers = fetchCall?.[1]?.headers;

			expect(headers?.['Content-Type']).toBe('application/json');
			expect(headers?.['User-Agent']).toBe('ADO-Orchestrator/1.0');
			expect(headers?.['X-Custom-Header']).toBe('custom-value');
			expect(headers?.Authorization).toBe('Bearer token-123');
		});

		it('should allow custom headers to override defaults', async () => {
			const config: WebhookConfig = {
				url: 'https://example.com/webhook',
				headers: {
					'Content-Type': 'application/x-custom',
					'User-Agent': 'Custom/2.0',
				},
			};
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const headers = fetchCall?.[1]?.headers;

			expect(headers?.['Content-Type']).toBe('application/x-custom');
			expect(headers?.['User-Agent']).toBe('Custom/2.0');
		});

		it('should work without custom headers', async () => {
			const config: WebhookConfig = {
				url: 'https://example.com/webhook',
			};
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const headers = fetchCall?.[1]?.headers;

			expect(headers?.['Content-Type']).toBe('application/json');
			expect(headers?.['User-Agent']).toBe('ADO-Orchestrator/1.0');
		});
	});

	describe('Error Handling', () => {
		it('should return error when not configured', async () => {
			const config = { ...webhookConfig, url: '' };
			const notifier = new WebhookNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Webhook URL not configured');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('should handle HTTP 400 error', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: async () => 'Bad Request',
			});

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Webhook request failed: 400 - Bad Request');
		});

		it('should handle HTTP 401 unauthorized', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => 'Unauthorized',
			});

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toContain('401');
		});

		it('should handle HTTP 500 server error', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => 'Internal Server Error',
			});

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toContain('500');
		});

		it('should handle HTTP 503 service unavailable', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 503,
				text: async () => 'Service Unavailable',
			});

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toContain('503');
		});

		it('should handle network errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network connection failed'),
			);

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Network connection failed');
		});

		it('should handle timeout errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Request timeout'),
			);

			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Request timeout');
		});

		it('should handle unknown errors', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce('Unknown error string');

			const notifier = new WebhookNotifier(webhookConfig);
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

			const notifier = new WebhookNotifier(webhookConfig);
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

	describe('Payload Formatting', () => {
		it('should preserve special characters in title', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Special chars: <>&"\'',
				message: 'Test message',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.title).toBe('Special chars: <>&"\'');
		});

		it('should preserve special characters in message', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Message with <>&"\' characters',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.message).toBe('Message with <>&"\' characters');
		});

		it('should handle multiline messages', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Multiline',
				message: 'Line 1\nLine 2\nLine 3',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.message).toBe('Line 1\nLine 2\nLine 3');
		});

		it('should handle unicode characters', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Unicode: 🚀 日本語',
				message: 'Message with emoji: ✅ 👍',
				level: 'info',
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.title).toBe('Unicode: 🚀 日本語');
			expect(body.message).toBe('Message with emoji: ✅ 👍');
		});

		it('should preserve complex metadata structures', async () => {
			const notifier = new WebhookNotifier(webhookConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
				metadata: {
					nested: { key: 'value' },
					array: [1, 2, 3],
					boolean: true,
					number: 42,
					nullValue: null,
				},
			};

			await notifier.send(payload);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const body = JSON.parse(fetchCall?.[1]?.body as string);
			expect(body.metadata.nested).toEqual({ key: 'value' });
			expect(body.metadata.array).toEqual([1, 2, 3]);
			expect(body.metadata.boolean).toBe(true);
			expect(body.metadata.number).toBe(42);
			expect(body.metadata.nullValue).toBe(null);
		});
	});
});
