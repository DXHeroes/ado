/**
 * Error types and utilities for ADO.
 * Provides structured errors with remediation hints.
 */

/**
 * Base error class constructor options
 */
interface AdoErrorOptions {
	message: string;
	code: string;
	recoverable: boolean;
	remediation: string | undefined;
	cause: Error | undefined;
}

/**
 * Base error class for ADO
 */
export class AdoError extends Error {
	readonly code: string;
	readonly recoverable: boolean;
	readonly remediation: string | undefined;
	override readonly cause: Error | undefined;

	constructor(options: AdoErrorOptions) {
		super(options.message);
		this.name = 'AdoError';
		this.code = options.code;
		this.recoverable = options.recoverable;
		this.remediation = options.remediation;
		this.cause = options.cause;

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, AdoError);
		}
	}
}

/**
 * Configuration-related errors
 */
export class ConfigError extends AdoError {
	constructor(message: string, remediation?: string, cause?: Error) {
		super({
			message,
			code: 'CONFIG_ERROR',
			recoverable: false,
			remediation: remediation ?? 'Check your ado.config.yaml file for syntax errors.',
			cause: cause,
		});
		this.name = 'ConfigError';
	}
}

/**
 * Provider-related errors
 */
export class ProviderError extends AdoError {
	readonly providerId: string;

	constructor(
		providerId: string,
		message: string,
		options?: {
			recoverable?: boolean;
			remediation?: string;
			cause?: Error;
		},
	) {
		super({
			message: `[${providerId}] ${message}`,
			code: 'PROVIDER_ERROR',
			recoverable: options?.recoverable ?? true,
			remediation: options?.remediation,
			cause: options?.cause,
		});
		this.name = 'ProviderError';
		this.providerId = providerId;
	}
}

/**
 * Provider not available error
 */
export class ProviderNotAvailableError extends ProviderError {
	constructor(providerId: string) {
		super(providerId, 'Provider is not available', {
			recoverable: true,
			remediation: `Ensure ${providerId} CLI is installed and authenticated. Run 'ado status' to check provider availability.`,
		});
		this.name = 'ProviderNotAvailableError';
	}
}

/**
 * Rate limit error
 */
export class RateLimitError extends ProviderError {
	readonly resetsAt: Date | undefined;
	readonly remaining: number | undefined;

	constructor(
		providerId: string,
		options?: {
			resetsAt?: Date;
			remaining?: number;
			message?: string;
		},
	) {
		const resetsIn = options?.resetsAt
			? Math.ceil((options.resetsAt.getTime() - Date.now()) / 1000 / 60)
			: undefined;

		super(providerId, options?.message ?? 'Rate limit exceeded', {
			recoverable: true,
			remediation: resetsIn
				? `Rate limit resets in approximately ${resetsIn} minutes. Consider using a different provider or waiting.`
				: 'Consider using a different provider or enabling API fallback.',
		});
		this.name = 'RateLimitError';
		this.resetsAt = options?.resetsAt;
		this.remaining = options?.remaining;
	}
}

/**
 * Task execution error
 */
export class TaskError extends AdoError {
	readonly taskId: string;

	constructor(
		taskId: string,
		message: string,
		options?: {
			recoverable?: boolean;
			remediation?: string;
			cause?: Error;
		},
	) {
		super({
			message: `Task ${taskId.slice(0, 8)}: ${message}`,
			code: 'TASK_ERROR',
			recoverable: options?.recoverable ?? false,
			remediation: options?.remediation,
			cause: options?.cause,
		});
		this.name = 'TaskError';
		this.taskId = taskId;
	}
}

/**
 * No providers available error
 */
export class NoProvidersError extends AdoError {
	constructor(reason?: string) {
		super({
			message: reason ?? 'No providers available to handle this task',
			code: 'NO_PROVIDERS',
			recoverable: false,
			remediation: `Check that:
• At least one provider is enabled in ado.config.yaml
• Required providers are installed and authenticated
• Rate limits haven't been exhausted for all providers`,
			cause: undefined,
		});
		this.name = 'NoProvidersError';
	}
}

/**
 * State persistence error
 */
export class StateError extends AdoError {
	constructor(message: string, cause?: Error) {
		super({
			message,
			code: 'STATE_ERROR',
			recoverable: false,
			remediation:
				'Check that the .ado directory is writable and the state.db file is not corrupted.',
			cause: cause,
		});
		this.name = 'StateError';
	}
}

/**
 * Check if an error is an ADO error
 */
export function isAdoError(error: unknown): error is AdoError {
	return error instanceof AdoError;
}

/**
 * Get remediation message for an error
 */
export function getRemediation(error: unknown): string | undefined {
	if (isAdoError(error)) {
		return error.remediation;
	}
	return undefined;
}

/**
 * Format error for display
 */
export function formatError(error: unknown): string {
	if (isAdoError(error)) {
		let msg = `${error.name}: ${error.message}`;
		if (error.remediation) {
			msg += `\n\nRemediation: ${error.remediation}`;
		}
		return msg;
	}

	if (error instanceof Error) {
		return `Error: ${error.message}`;
	}

	return String(error);
}
