/**
 * OpenTelemetry tracing implementation
 */

import { type Span, type SpanOptions, context, trace } from '@opentelemetry/api';
import type { TelemetryConfig } from './types.js';

export class Tracer {
	private tracer: ReturnType<typeof trace.getTracer>;
	private enabled: boolean;

	constructor(config: TelemetryConfig) {
		this.enabled = config.tracing?.enabled ?? false;
		this.tracer = trace.getTracer(config.serviceName, config.serviceVersion);
	}

	/**
	 * Start a new span
	 */
	startSpan(name: string, options?: SpanOptions): Span {
		if (!this.enabled) {
			return trace.getSpan(context.active()) ?? this.createNoOpSpan();
		}

		return this.tracer.startSpan(name, options);
	}

	/**
	 * Start an active span with context
	 */
	async withSpan<T>(
		name: string,
		fn: (span: Span) => Promise<T>,
		options?: SpanOptions,
	): Promise<T> {
		if (!this.enabled) {
			return fn(this.createNoOpSpan());
		}

		const span = this.tracer.startSpan(name, options);

		try {
			return await context.with(trace.setSpan(context.active(), span), () => fn(span));
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: 2 }); // ERROR
			throw error;
		} finally {
			span.end();
		}
	}

	/**
	 * Get current active span
	 */
	getActiveSpan(): Span | undefined {
		return trace.getSpan(context.active());
	}

	/**
	 * Record an exception in the current span
	 */
	recordException(error: Error): void {
		if (!this.enabled) return;

		const span = this.getActiveSpan();
		if (span) {
			span.recordException(error);
			span.setStatus({ code: 2 }); // ERROR
		}
	}

	/**
	 * Add attributes to the current span
	 */
	setAttributes(attributes: Record<string, string | number | boolean>): void {
		if (!this.enabled) return;

		const span = this.getActiveSpan();
		if (span) {
			span.setAttributes(attributes);
		}
	}

	/**
	 * Create a no-op span for when tracing is disabled
	 */
	private createNoOpSpan(): Span {
		return {
			spanContext: () => ({
				traceId: '',
				spanId: '',
				traceFlags: 0,
			}),
			setAttribute: () => {},
			setAttributes: () => {},
			addEvent: () => {},
			setStatus: () => {},
			updateName: () => {},
			end: () => {},
			isRecording: () => false,
			recordException: () => {},
		} as unknown as Span;
	}
}

/**
 * Helper function to create task execution spans
 */
export async function traceTaskExecution<T>(
	tracer: Tracer,
	taskId: string,
	provider: string,
	fn: () => Promise<T>,
): Promise<T> {
	return tracer.withSpan(
		'task.execute',
		async (span) => {
			span.setAttributes({
				'task.id': taskId,
				'task.provider': provider,
				'task.timestamp': Date.now(),
			});

			const result = await fn();

			span.setAttributes({
				'task.status': 'completed',
			});

			return result;
		},
		{
			kind: 1, // INTERNAL
		},
	);
}

/**
 * Helper function to create provider request spans
 */
export async function traceProviderRequest<T>(
	tracer: Tracer,
	provider: string,
	operation: string,
	fn: () => Promise<T>,
): Promise<T> {
	return tracer.withSpan(
		`provider.${operation}`,
		async (span) => {
			span.setAttributes({
				'provider.id': provider,
				'provider.operation': operation,
			});

			return await fn();
		},
		{
			kind: 2, // CLIENT
		},
	);
}
