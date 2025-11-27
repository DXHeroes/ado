/**
 * OpenTelemetry metrics implementation
 */

import { type Counter, type Histogram, metrics } from '@opentelemetry/api';
import type { MetricAttributes, TelemetryConfig } from './types.js';

export class MetricsCollector {
	private meter: ReturnType<typeof metrics.getMeter>;
	private enabled: boolean;

	// Counters
	private taskCounter?: Counter;
	private providerRequestCounter?: Counter;
	private rateLimitCounter?: Counter;
	private errorCounter?: Counter;

	// Histograms
	private taskDurationHistogram?: Histogram;
	private providerLatencyHistogram?: Histogram;
	private tokenUsageHistogram?: Histogram;
	private costHistogram?: Histogram;

	constructor(config: TelemetryConfig) {
		this.enabled = config.metrics?.enabled ?? false;
		this.meter = metrics.getMeter(config.serviceName, config.serviceVersion);

		if (this.enabled) {
			this.initializeMetrics();
		}
	}

	private initializeMetrics(): void {
		// Task metrics
		this.taskCounter = this.meter.createCounter('ado.tasks.total', {
			description: 'Total number of tasks',
		});

		this.taskDurationHistogram = this.meter.createHistogram('ado.task.duration', {
			description: 'Task execution duration in seconds',
			unit: 's',
		});

		// Provider metrics
		this.providerRequestCounter = this.meter.createCounter('ado.provider.requests', {
			description: 'Total number of provider requests',
		});

		this.providerLatencyHistogram = this.meter.createHistogram('ado.provider.latency', {
			description: 'Provider request latency in milliseconds',
			unit: 'ms',
		});

		// Rate limit metrics
		this.rateLimitCounter = this.meter.createCounter('ado.rate_limits.total', {
			description: 'Total number of rate limit hits',
		});

		// Error metrics
		this.errorCounter = this.meter.createCounter('ado.errors.total', {
			description: 'Total number of errors',
		});

		// Token usage metrics
		this.tokenUsageHistogram = this.meter.createHistogram('ado.tokens.usage', {
			description: 'Token usage per request',
			unit: 'tokens',
		});

		// Cost metrics
		this.costHistogram = this.meter.createHistogram('ado.cost', {
			description: 'Cost per task in USD',
			unit: 'usd',
		});
	}

	/**
	 * Record a task execution
	 */
	recordTask(
		status: 'completed' | 'failed' | 'cancelled',
		provider: string,
		duration: number,
		attributes?: MetricAttributes,
	): void {
		if (!this.enabled) return;

		const baseAttributes = {
			status,
			provider,
			...attributes,
		};

		this.taskCounter?.add(1, baseAttributes);
		this.taskDurationHistogram?.record(duration, baseAttributes);
	}

	/**
	 * Record a provider request
	 */
	recordProviderRequest(
		provider: string,
		latency: number,
		success: boolean,
		attributes?: MetricAttributes,
	): void {
		if (!this.enabled) return;

		const baseAttributes = {
			provider,
			success: String(success),
			...attributes,
		};

		this.providerRequestCounter?.add(1, baseAttributes);
		this.providerLatencyHistogram?.record(latency, baseAttributes);

		if (!success) {
			this.errorCounter?.add(1, { provider, ...attributes });
		}
	}

	/**
	 * Record a rate limit hit
	 */
	recordRateLimit(provider: string, accessMode: string): void {
		if (!this.enabled) return;

		this.rateLimitCounter?.add(1, {
			provider,
			access_mode: accessMode,
		});
	}

	/**
	 * Record token usage
	 */
	recordTokenUsage(
		provider: string,
		inputTokens: number,
		outputTokens: number,
		attributes?: MetricAttributes,
	): void {
		if (!this.enabled) return;

		const baseAttributes = {
			provider,
			...attributes,
		};

		this.tokenUsageHistogram?.record(inputTokens, {
			...baseAttributes,
			token_type: 'input',
		});

		this.tokenUsageHistogram?.record(outputTokens, {
			...baseAttributes,
			token_type: 'output',
		});
	}

	/**
	 * Record cost
	 */
	recordCost(
		provider: string,
		cost: number,
		accessMode: string,
		attributes?: MetricAttributes,
	): void {
		if (!this.enabled) return;

		this.costHistogram?.record(cost, {
			provider,
			access_mode: accessMode,
			...attributes,
		});
	}

	/**
	 * Record an error
	 */
	recordError(errorType: string, provider?: string, attributes?: MetricAttributes): void {
		if (!this.enabled) return;

		this.errorCounter?.add(1, {
			error_type: errorType,
			provider: provider ?? 'unknown',
			...attributes,
		});
	}
}

/**
 * Helper function to measure duration
 */
export async function measureDuration<T>(fn: () => Promise<T>): Promise<[T, number]> {
	const startTime = performance.now();
	const result = await fn();
	const duration = (performance.now() - startTime) / 1000; // Convert to seconds
	return [result, duration];
}
