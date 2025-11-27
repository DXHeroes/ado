/**
 * Cost Tracker - tracks API costs and generates reports.
 */

import type { AccessMode, UsageRecord } from '@dxheroes/ado-shared';

/**
 * Cost summary for a time period
 */
export interface CostSummary {
	totalCost: number;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
	byProvider: Map<string, ProviderCostSummary>;
	byMode: Map<AccessMode, ModeCostSummary>;
	period: {
		start: Date;
		end: Date;
	};
}

/**
 * Cost summary per provider
 */
export interface ProviderCostSummary {
	providerId: string;
	totalCost: number;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * Cost summary per access mode
 */
export interface ModeCostSummary {
	mode: AccessMode;
	totalCost: number;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * Cost report filters
 */
export interface CostReportFilter {
	startDate?: Date;
	endDate?: Date;
	providerId?: string;
	accessMode?: AccessMode;
}

/**
 * Cost tracker interface
 */
export interface CostTracker {
	/**
	 * Record usage with cost calculation
	 */
	recordUsage(usage: UsageRecord): Promise<void>;

	/**
	 * Get cost summary for a period
	 */
	getSummary(filter?: CostReportFilter): Promise<CostSummary>;

	/**
	 * Get daily cost totals
	 */
	getDailyCost(date?: Date): Promise<number>;

	/**
	 * Check if daily cost limit exceeded
	 */
	isOverDailyLimit(limit: number, date?: Date): Promise<boolean>;

	/**
	 * Get cost breakdown by provider
	 */
	getProviderBreakdown(filter?: CostReportFilter): Promise<ProviderCostSummary[]>;

	/**
	 * Calculate estimated cost for token usage
	 */
	estimateCost(
		providerId: string,
		inputTokens: number,
		outputTokens: number,
		costPerMillion: { input: number; output: number },
	): number;
}

/**
 * In-memory cost tracker implementation
 */
export class InMemoryCostTracker implements CostTracker {
	private records: UsageRecord[] = [];

	async recordUsage(usage: UsageRecord): Promise<void> {
		this.records.push({ ...usage });

		// Keep only last 90 days of data
		const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
		this.records = this.records.filter((r) => r.timestamp > ninetyDaysAgo);
	}

	async getSummary(filter?: CostReportFilter): Promise<CostSummary> {
		const filtered = this.filterRecords(filter);

		const byProvider = new Map<string, ProviderCostSummary>();
		const byMode = new Map<AccessMode, ModeCostSummary>();

		let totalCost = 0;
		let requestCount = 0;
		let inputTokens = 0;
		let outputTokens = 0;

		for (const record of filtered) {
			const cost = record.costUsd ?? 0;
			totalCost += cost;
			requestCount += record.requestCount;
			inputTokens += record.inputTokens;
			outputTokens += record.outputTokens;

			// By provider
			const providerSummary = byProvider.get(record.providerId) ?? {
				providerId: record.providerId,
				totalCost: 0,
				requestCount: 0,
				inputTokens: 0,
				outputTokens: 0,
			};

			providerSummary.totalCost += cost;
			providerSummary.requestCount += record.requestCount;
			providerSummary.inputTokens += record.inputTokens;
			providerSummary.outputTokens += record.outputTokens;
			byProvider.set(record.providerId, providerSummary);

			// By mode
			const modeSummary = byMode.get(record.accessMode) ?? {
				mode: record.accessMode,
				totalCost: 0,
				requestCount: 0,
				inputTokens: 0,
				outputTokens: 0,
			};

			modeSummary.totalCost += cost;
			modeSummary.requestCount += record.requestCount;
			modeSummary.inputTokens += record.inputTokens;
			modeSummary.outputTokens += record.outputTokens;
			byMode.set(record.accessMode, modeSummary);
		}

		const firstRecord = filtered.at(0);
		const lastRecord = filtered.at(-1);
		const start = filter?.startDate ?? firstRecord?.timestamp ?? new Date();
		const end = filter?.endDate ?? lastRecord?.timestamp ?? new Date();

		return {
			totalCost,
			requestCount,
			inputTokens,
			outputTokens,
			byProvider,
			byMode,
			period: { start, end },
		};
	}

	async getDailyCost(date?: Date): Promise<number> {
		const targetDate = date ?? new Date();
		const startOfDay = new Date(
			targetDate.getFullYear(),
			targetDate.getMonth(),
			targetDate.getDate(),
		);
		const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

		const summary = await this.getSummary({
			startDate: startOfDay,
			endDate: endOfDay,
		});

		return summary.totalCost;
	}

	async isOverDailyLimit(limit: number, date?: Date): Promise<boolean> {
		const dailyCost = await this.getDailyCost(date);
		return dailyCost >= limit;
	}

	async getProviderBreakdown(filter?: CostReportFilter): Promise<ProviderCostSummary[]> {
		const summary = await this.getSummary(filter);
		return Array.from(summary.byProvider.values()).sort((a, b) => b.totalCost - a.totalCost);
	}

	estimateCost(
		_providerId: string,
		inputTokens: number,
		outputTokens: number,
		costPerMillion: { input: number; output: number },
	): number {
		const inputCost = (inputTokens * costPerMillion.input) / 1_000_000;
		const outputCost = (outputTokens * costPerMillion.output) / 1_000_000;
		return inputCost + outputCost;
	}

	private filterRecords(filter?: CostReportFilter): UsageRecord[] {
		let filtered = [...this.records];

		if (filter?.startDate) {
			const startDate = filter.startDate;
			filtered = filtered.filter((r) => r.timestamp >= startDate);
		}

		if (filter?.endDate) {
			const endDate = filter.endDate;
			filtered = filtered.filter((r) => r.timestamp <= endDate);
		}

		if (filter?.providerId) {
			filtered = filtered.filter((r) => r.providerId === filter.providerId);
		}

		if (filter?.accessMode) {
			filtered = filtered.filter((r) => r.accessMode === filter.accessMode);
		}

		return filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}
}

/**
 * Create a new cost tracker
 */
export function createCostTracker(): CostTracker {
	return new InMemoryCostTracker();
}
