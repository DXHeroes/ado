import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationManager } from './manager.js';
import type { NotificationConfig } from './types.js';

describe('NotificationManager', () => {
	let mockConfig: NotificationConfig;

	beforeEach(() => {
		mockConfig = {
			slack: {
				webhookUrl: 'https://hooks.slack.com/test',
				channel: '#test',
			},
			email: {
				from: 'test@ado.dev',
				to: 'user@example.com',
			},
			enabledChannels: ['slack', 'email'],
		};
	});

	it('should initialize with config', () => {
		const manager = new NotificationManager(mockConfig);
		expect(manager).toBeDefined();
	});

	it('should identify available channels', () => {
		const manager = new NotificationManager(mockConfig);
		const channels = manager.getAvailableChannels();
		expect(channels).toContain('slack');
		expect(channels).toContain('email');
	});

	it('should detect configured channels', () => {
		const manager = new NotificationManager(mockConfig);
		expect(manager.isChannelAvailable('slack')).toBe(true);
		expect(manager.isChannelAvailable('email')).toBe(true);
	});

	it('should handle empty configuration', () => {
		const emptyConfig: NotificationConfig = {
			enabledChannels: [],
		};
		const manager = new NotificationManager(emptyConfig);
		expect(manager.getAvailableChannels()).toHaveLength(0);
	});

	it('should update config dynamically', () => {
		const manager = new NotificationManager(mockConfig);
		expect(manager.isChannelAvailable('slack')).toBe(true);

		const newConfig: NotificationConfig = {
			enabledChannels: [],
		};
		manager.updateConfig(newConfig);
		expect(manager.getAvailableChannels()).toHaveLength(0);
	});
});
