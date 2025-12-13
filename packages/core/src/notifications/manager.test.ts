import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	NotificationManager,
	createCostThresholdNotification,
	createRateLimitNotification,
	createTaskCompletedNotification,
	createTaskFailedNotification,
	createTaskStartedNotification,
} from './manager.js';
import type { NotificationConfig, NotificationPayload } from './types.js';

// Mock fetch for webhook and slack
global.fetch = vi.fn();

// Mock nodemailer
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
	sendMail: mockSendMail,
}));
const mockCreateTestAccount = vi.fn();

vi.mock('nodemailer', () => ({
	default: {
		createTransport: mockCreateTransport,
		createTestAccount: mockCreateTestAccount,
	},
}));

describe('NotificationManager', () => {
	let mockConfig: NotificationConfig;

	beforeEach(() => {
		vi.clearAllMocks();

		mockConfig = {
			slack: {
				webhookUrl: 'https://hooks.slack.com/test',
				channel: '#test',
			},
			email: {
				from: 'test@ado.dev',
				to: 'user@example.com',
			},
			webhook: {
				url: 'https://example.com/webhook',
			},
			enabledChannels: ['slack', 'email', 'webhook'],
		};

		// Mock successful responses
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'ok',
		});

		mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });
	});

	describe('Initialization', () => {
		it('should initialize with config', () => {
			const manager = new NotificationManager(mockConfig);
			expect(manager).toBeDefined();
		});

		it('should initialize only enabled channels', () => {
			const config: NotificationConfig = {
				slack: {
					webhookUrl: 'https://hooks.slack.com/test',
				},
				email: {
					from: 'test@ado.dev',
					to: 'user@example.com',
				},
				webhook: {
					url: 'https://example.com/webhook',
				},
				enabledChannels: ['slack'],
			};
			const manager = new NotificationManager(config);
			const channels = manager.getAvailableChannels();
			expect(channels).toContain('slack');
			expect(channels).not.toContain('email');
			expect(channels).not.toContain('webhook');
		});

		it('should handle empty configuration', () => {
			const emptyConfig: NotificationConfig = {
				enabledChannels: [],
			};
			const manager = new NotificationManager(emptyConfig);
			expect(manager.getAvailableChannels()).toHaveLength(0);
		});

		it('should not initialize disabled channels', () => {
			const config: NotificationConfig = {
				slack: {
					webhookUrl: 'https://hooks.slack.com/test',
				},
				enabledChannels: ['email'],
			};
			const manager = new NotificationManager(config);
			expect(manager.isChannelAvailable('slack')).toBe(false);
			expect(manager.isChannelAvailable('email')).toBe(false);
		});
	});

	describe('Channel Detection', () => {
		it('should identify available channels', () => {
			const manager = new NotificationManager(mockConfig);
			const channels = manager.getAvailableChannels();
			expect(channels).toContain('slack');
			expect(channels).toContain('email');
			expect(channels).toContain('webhook');
		});

		it('should detect configured channels', () => {
			const manager = new NotificationManager(mockConfig);
			expect(manager.isChannelAvailable('slack')).toBe(true);
			expect(manager.isChannelAvailable('email')).toBe(true);
			expect(manager.isChannelAvailable('webhook')).toBe(true);
		});

		it('should detect unconfigured channels', () => {
			const config: NotificationConfig = {
				slack: {
					webhookUrl: '',
				},
				enabledChannels: ['slack'],
			};
			const manager = new NotificationManager(config);
			expect(manager.isChannelAvailable('slack')).toBe(false);
		});

		it('should return empty array when no channels available', () => {
			const config: NotificationConfig = {
				enabledChannels: [],
			};
			const manager = new NotificationManager(config);
			expect(manager.getAvailableChannels()).toHaveLength(0);
		});
	});

	describe('Sending Notifications', () => {
		it('should send to all enabled channels', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test Notification',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.send(payload);

			expect(results.size).toBe(3);
			expect(results.get('slack')?.success).toBe(true);
			expect(results.get('email')?.success).toBe(true);
			expect(results.get('webhook')?.success).toBe(true);
		});

		it('should add timestamp if not provided', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const before = Date.now();
			await manager.send(payload);
			const after = Date.now();

			expect(payload.timestamp).toBeDefined();
			expect(payload.timestamp?.getTime()).toBeGreaterThanOrEqual(before);
			expect(payload.timestamp?.getTime()).toBeLessThanOrEqual(after);
		});

		it('should preserve existing timestamp', async () => {
			const manager = new NotificationManager(mockConfig);
			const timestamp = new Date('2025-01-15T10:30:00Z');
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
				timestamp,
			};

			await manager.send(payload);

			expect(payload.timestamp).toBe(timestamp);
		});

		it('should send to all channels in parallel', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const startTime = Date.now();
			await manager.send(payload);
			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(1000);
		});

		it('should handle partial failures', async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					text: async () => 'ok',
				})
				.mockRejectedValueOnce(new Error('Webhook failed'));

			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.send(payload);

			expect(results.get('slack')?.success).toBe(true);
			expect(results.get('email')?.success).toBe(true);
			expect(results.get('webhook')?.success).toBe(false);
		});

		it('should return error for unconfigured channels', async () => {
			const config: NotificationConfig = {
				slack: {
					webhookUrl: '',
				},
				enabledChannels: ['slack'],
			};
			const manager = new NotificationManager(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.send(payload);

			expect(results.get('slack')?.success).toBe(false);
			expect(results.get('slack')?.error).toBe('Not configured');
		});
	});

	describe('Sending to Specific Channels', () => {
		it('should send to specific channels only', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.sendToChannels(payload, ['slack', 'email']);

			expect(results.size).toBe(2);
			expect(results.get('slack')?.success).toBe(true);
			expect(results.get('email')?.success).toBe(true);
			expect(results.has('webhook')).toBe(false);
		});

		it('should handle single channel', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.sendToChannels(payload, ['slack']);

			expect(results.size).toBe(1);
			expect(results.get('slack')?.success).toBe(true);
		});

		it('should add timestamp if not provided', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			await manager.sendToChannels(payload, ['slack']);

			expect(payload.timestamp).toBeDefined();
		});

		it('should handle unavailable channel', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.sendToChannels(payload, ['email']);

			expect(results.get('email')?.success).toBe(true);
		});

		it('should return error for unconfigured channel', async () => {
			const config: NotificationConfig = {
				slack: {
					webhookUrl: '',
				},
				enabledChannels: ['slack'],
			};
			const manager = new NotificationManager(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.sendToChannels(payload, ['slack']);

			expect(results.get('slack')?.success).toBe(false);
			expect(results.get('slack')?.error).toBe('Not configured');
		});

		it('should return error for non-existent channel', async () => {
			const manager = new NotificationManager(mockConfig);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const results = await manager.sendToChannels(payload, ['email']);

			expect(results.get('email')?.success).toBe(true);
		});
	});

	describe('Configuration Updates', () => {
		it('should update config dynamically', () => {
			const manager = new NotificationManager(mockConfig);
			expect(manager.isChannelAvailable('slack')).toBe(true);

			const newConfig: NotificationConfig = {
				enabledChannels: [],
			};
			manager.updateConfig(newConfig);
			expect(manager.getAvailableChannels()).toHaveLength(0);
		});

		it('should reinitialize notifiers on update', () => {
			const manager = new NotificationManager(mockConfig);
			expect(manager.isChannelAvailable('slack')).toBe(true);

			const newConfig: NotificationConfig = {
				webhook: {
					url: 'https://new-webhook.com',
				},
				enabledChannels: ['webhook'],
			};
			manager.updateConfig(newConfig);

			expect(manager.isChannelAvailable('slack')).toBe(false);
			expect(manager.isChannelAvailable('webhook')).toBe(true);
		});

		it('should clear previous notifiers on update', () => {
			const manager = new NotificationManager(mockConfig);
			expect(manager.getAvailableChannels()).toHaveLength(3);

			const newConfig: NotificationConfig = {
				slack: {
					webhookUrl: 'https://hooks.slack.com/new',
				},
				enabledChannels: ['slack'],
			};
			manager.updateConfig(newConfig);

			const channels = manager.getAvailableChannels();
			expect(channels).toHaveLength(1);
			expect(channels).toContain('slack');
		});
	});
});

describe('Notification Helper Functions', () => {
	describe('createTaskStartedNotification', () => {
		it('should create task started notification', () => {
			const notification = createTaskStartedNotification('task-123', 'Implement feature X');

			expect(notification.title).toBe('Task Started');
			expect(notification.message).toContain('task-123');
			expect(notification.message).toContain('Implement feature X');
			expect(notification.level).toBe('info');
			expect(notification.metadata?.taskId).toBe('task-123');
		});
	});

	describe('createTaskCompletedNotification', () => {
		it('should create task completed notification', () => {
			const notification = createTaskCompletedNotification('task-456', 120);

			expect(notification.title).toBe('Task Completed');
			expect(notification.message).toContain('task-456');
			expect(notification.message).toContain('120s');
			expect(notification.level).toBe('success');
			expect(notification.metadata?.taskId).toBe('task-456');
			expect(notification.metadata?.duration).toBe('120s');
		});

		it('should format duration correctly', () => {
			const notification = createTaskCompletedNotification('task-789', 45);

			expect(notification.message).toContain('45s');
			expect(notification.metadata?.duration).toBe('45s');
		});
	});

	describe('createTaskFailedNotification', () => {
		it('should create task failed notification', () => {
			const notification = createTaskFailedNotification('task-999', 'Connection timeout');

			expect(notification.title).toBe('Task Failed');
			expect(notification.message).toContain('task-999');
			expect(notification.message).toContain('Connection timeout');
			expect(notification.level).toBe('error');
			expect(notification.metadata?.taskId).toBe('task-999');
		});

		it('should include full error message', () => {
			const errorMessage = 'API rate limit exceeded. Retry after 60 seconds.';
			const notification = createTaskFailedNotification('task-111', errorMessage);

			expect(notification.message).toContain(errorMessage);
		});
	});

	describe('createRateLimitNotification', () => {
		it('should create rate limit notification without reset time', () => {
			const notification = createRateLimitNotification('claude-code');

			expect(notification.title).toBe('Rate Limit Reached');
			expect(notification.message).toContain('claude-code');
			expect(notification.level).toBe('warning');
			expect(notification.metadata?.provider).toBe('claude-code');
		});

		it('should create rate limit notification with reset time', () => {
			const resetTime = new Date('2025-01-15T12:00:00Z');
			const notification = createRateLimitNotification('gemini-cli', resetTime);

			expect(notification.title).toBe('Rate Limit Reached');
			expect(notification.message).toContain('gemini-cli');
			expect(notification.message).toContain(resetTime.toLocaleString());
			expect(notification.level).toBe('warning');
			expect(notification.metadata?.provider).toBe('gemini-cli');
			expect(notification.metadata?.resetsAt).toBe(resetTime.toISOString());
		});
	});

	describe('createCostThresholdNotification', () => {
		it('should create cost threshold notification', () => {
			const notification = createCostThresholdNotification(5.75, 5.0, 'task-222');

			expect(notification.title).toBe('Cost Threshold Exceeded');
			expect(notification.message).toContain('task-222');
			expect(notification.message).toContain('$5.75');
			expect(notification.message).toContain('$5.00');
			expect(notification.level).toBe('warning');
			expect(notification.metadata?.taskId).toBe('task-222');
			expect(notification.metadata?.cost).toBe('$5.75');
			expect(notification.metadata?.threshold).toBe('$5.00');
		});

		it('should format costs with 2 decimal places', () => {
			const notification = createCostThresholdNotification(10.5, 8.333, 'task-333');

			expect(notification.message).toContain('$10.50');
			expect(notification.message).toContain('$8.33');
			expect(notification.metadata?.cost).toBe('$10.50');
			expect(notification.metadata?.threshold).toBe('$8.33');
		});

		it('should handle small cost values', () => {
			const notification = createCostThresholdNotification(0.05, 0.01, 'task-444');

			expect(notification.message).toContain('$0.05');
			expect(notification.message).toContain('$0.01');
		});
	});
});
