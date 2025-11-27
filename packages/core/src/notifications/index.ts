/**
 * ADO Notifications Module
 *
 * Provides multi-channel notification support for Slack, Email, and Webhooks.
 */

export * from './types.js';
export * from './slack.js';
export * from './email.js';
export * from './webhook.js';
export * from './manager.js';
export {
	NotificationManager,
	createTaskStartedNotification,
	createTaskCompletedNotification,
	createTaskFailedNotification,
	createRateLimitNotification,
	createCostThresholdNotification,
} from './manager.js';
