/**
 * Tests for Email Notification Implementation
 *
 * Note: Full integration tests with actual email sending require a test SMTP server.
 * These tests focus on configuration validation and error handling.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EmailNotifier } from '../email.js';
import type { EmailConfig, NotificationPayload } from '../types.js';

describe('EmailNotifier', () => {
	let emailConfig: EmailConfig;

	beforeEach(() => {
		emailConfig = {
			from: 'ado@example.com',
			to: 'user@example.com',
			smtp: {
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				auth: {
					user: 'smtp-user',
					pass: 'smtp-password',
				},
			},
		};
	});

	describe('Configuration', () => {
		it('should detect configured email notifier', () => {
			const notifier = new EmailNotifier(emailConfig);
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should detect missing from address', () => {
			const config = { ...emailConfig, from: '' };
			const notifier = new EmailNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should detect missing to address', () => {
			const config = { ...emailConfig, to: '' };
			const notifier = new EmailNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should support multiple recipients', () => {
			const config = { ...emailConfig, to: ['user1@example.com', 'user2@example.com'] };
			const notifier = new EmailNotifier(config);
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should support config without SMTP settings', () => {
			const configNoSmtp: EmailConfig = {
				from: 'ado@example.com',
				to: 'user@example.com',
			};

			const notifier = new EmailNotifier(configNoSmtp);
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should detect empty from address', () => {
			const config = { ...emailConfig, from: '' };
			const notifier = new EmailNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should detect empty to address', () => {
			const config = { ...emailConfig, to: '' };
			const notifier = new EmailNotifier(config);
			expect(notifier.isConfigured()).toBe(false);
		});

		it('should handle array with empty strings', () => {
			const config = { ...emailConfig, to: [''] };
			const notifier = new EmailNotifier(config);
			// Array is truthy, but contains invalid addresses
			expect(notifier.isConfigured()).toBe(true);
		});
	});

	describe('Error Handling', () => {
		it('should return error when not configured with missing from', async () => {
			const config = { ...emailConfig, from: '' };
			const notifier = new EmailNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.channel).toBe('email');
			expect(result.error).toBe('Email configuration incomplete');
		});

		it('should return error when not configured with missing to', async () => {
			const config = { ...emailConfig, to: '' };
			const notifier = new EmailNotifier(config);
			const payload: NotificationPayload = {
				title: 'Test',
				message: 'Test message',
				level: 'info',
			};

			const result = await notifier.send(payload);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Email configuration incomplete');
		});

		it('should include timestamp in error result', async () => {
			const config = { ...emailConfig, from: '' };
			const notifier = new EmailNotifier(config);
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

		it('should return error for all notification levels when not configured', async () => {
			const config = { ...emailConfig, from: '' };
			const notifier = new EmailNotifier(config);

			const levels = ['info', 'success', 'warning', 'error'] as const;

			for (const level of levels) {
				const payload: NotificationPayload = {
					title: 'Test',
					message: 'Test message',
					level,
				};

				const result = await notifier.send(payload);
				expect(result.success).toBe(false);
				expect(result.error).toBe('Email configuration incomplete');
			}
		});
	});

	describe('Instance Creation', () => {
		it('should create instance with full SMTP config', () => {
			const notifier = new EmailNotifier(emailConfig);
			expect(notifier).toBeDefined();
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should create instance without SMTP config', () => {
			const minimalConfig: EmailConfig = {
				from: 'ado@example.com',
				to: 'user@example.com',
			};
			const notifier = new EmailNotifier(minimalConfig);
			expect(notifier).toBeDefined();
			expect(notifier.isConfigured()).toBe(true);
		});

		it('should create instance with array recipients', () => {
			const config: EmailConfig = {
				from: 'ado@example.com',
				to: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
			};
			const notifier = new EmailNotifier(config);
			expect(notifier).toBeDefined();
			expect(notifier.isConfigured()).toBe(true);
		});
	});
});
