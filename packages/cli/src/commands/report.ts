/**
 * Report command - Generate cost and usage reports
 */

import * as p from '@clack/prompts';
import { createCostTracker, createStateStore } from '@dxheroes/ado-core';
import { Command } from 'commander';
import pc from 'picocolors';
import { ensureAdoDir } from '../utils/fs.js';

export const reportCommand = new Command('report')
	.description('Generate cost and usage reports')
	.option('--costs', 'Show cost report')
	.option('--usage', 'Show usage statistics')
	.option('--period <period>', 'Time period: today, week, month, all', 'today')
	.option('--provider <provider>', 'Filter by provider')
	.option('--format <format>', 'Output format: table, json', 'table')
	.action(async (options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Report ')));

		// Ensure .ado directory exists
		const adoDir = ensureAdoDir(cwd);

		// Initialize state store to get usage records
		const stateStore = createStateStore(`${adoDir}/state.db`);
		const costTracker = createCostTracker();

		try {
			// Calculate date range based on period
			const now = new Date();
			let startDate: Date | undefined;

			switch (options.period) {
				case 'today':
					startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
					break;
				case 'week':
					startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
					break;
				case 'month':
					startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
					break;
				case 'all':
					startDate = undefined;
					break;
				default:
					p.log.error(`Invalid period: ${options.period}`);
					process.exit(1);
			}

			// Get usage records from state store
			const usageRecords =
				options.provider !== undefined
					? stateStore.getUsageByProvider(options.provider, startDate ?? new Date(0))
					: [];

			// Record all usage in cost tracker for analysis
			for (const record of usageRecords) {
				await costTracker.recordUsage(record);
			}

			// Get summary with proper filter
			const filter: { startDate?: Date; providerId?: string } = {};
			if (startDate !== undefined) {
				filter.startDate = startDate;
			}
			if (options.provider !== undefined) {
				filter.providerId = options.provider;
			}

			const summary = await costTracker.getSummary(filter);

			if (options.format === 'json') {
				// JSON output
				const output = {
					period: {
						start: summary.period.start.toISOString(),
						end: summary.period.end.toISOString(),
					},
					summary: {
						totalCost: summary.totalCost,
						requestCount: summary.requestCount,
						inputTokens: summary.inputTokens,
						outputTokens: summary.outputTokens,
					},
					byProvider: Array.from(summary.byProvider.values()),
					byMode: Array.from(summary.byMode.values()),
				};
				// biome-ignore lint/suspicious/noConsole: JSON output to stdout
				console.log(JSON.stringify(output, null, 2));
			} else {
				// Table output
				p.log.info(
					`Report period: ${pc.cyan(summary.period.start.toLocaleDateString())} - ${pc.cyan(summary.period.end.toLocaleDateString())}`,
				);

				if (options.costs || (!options.costs && !options.usage)) {
					p.note(
						`Total Cost: ${pc.yellow(`$${summary.totalCost.toFixed(4)}`)}
Requests: ${pc.cyan(summary.requestCount.toString())}
Input Tokens: ${pc.dim(summary.inputTokens.toLocaleString())}
Output Tokens: ${pc.dim(summary.outputTokens.toLocaleString())}
Total Tokens: ${pc.dim((summary.inputTokens + summary.outputTokens).toLocaleString())}`,
						'Cost Summary',
					);

					// Provider breakdown
					if (summary.byProvider.size > 0) {
						const providerLines = Array.from(summary.byProvider.values())
							.sort((a, b) => b.totalCost - a.totalCost)
							.map(
								(p) =>
									`${pc.cyan(p.providerId.padEnd(15))} ${pc.yellow(`$${p.totalCost.toFixed(4)}`.padStart(10))} ${pc.dim(`(${p.requestCount} requests)`)}`,
							);

						p.note(providerLines.join('\n'), 'By Provider');
					}

					// Access mode breakdown
					if (summary.byMode.size > 0) {
						const modeLines = Array.from(summary.byMode.values()).map(
							(m) =>
								`${pc.cyan(m.mode.padEnd(15))} ${pc.yellow(`$${m.totalCost.toFixed(4)}`.padStart(10))} ${pc.dim(`(${m.requestCount} requests)`)}`,
						);

						p.note(modeLines.join('\n'), 'By Access Mode');
					}
				}

				if (options.usage) {
					const usageFilter: { startDate?: Date } = {};
					if (startDate !== undefined) {
						usageFilter.startDate = startDate;
					}
					const providers = await costTracker.getProviderBreakdown(usageFilter);
					if (providers.length > 0) {
						const usageLines = providers.map(
							(p) =>
								`${pc.cyan(p.providerId.padEnd(15))} ${pc.dim(`${p.requestCount} requests`)} ${pc.dim(`| In: ${p.inputTokens.toLocaleString()}`)} ${pc.dim(`| Out: ${p.outputTokens.toLocaleString()}`)}`,
						);

						p.note(usageLines.join('\n'), 'Usage Statistics');
					}
				}
			}

			p.outro('Report complete');
		} catch (error) {
			p.log.error(error instanceof Error ? error.message : 'Report generation failed');
			process.exit(1);
		} finally {
			stateStore.close();
		}
	});
