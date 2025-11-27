/**
 * Status command - Show current ADO status
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { createClaudeCodeAdapter } from '@dxheroes/ado-adapters';
import { createStateStore, findConfigFile, loadConfigWithFallback } from '@dxheroes/ado-core';
import { Command } from 'commander';
import pc from 'picocolors';

export const statusCommand = new Command('status')
	.description('Show current ADO status')
	.option('--json', 'Output as JSON')
	.action(async (options) => {
		const cwd = process.cwd();

		if (!options.json) {
			p.intro(pc.bgCyan(pc.black(' ADO Status ')));
		}

		// Check for config
		const configPath = findConfigFile(cwd);
		const hasConfig = !!configPath;

		if (!hasConfig) {
			if (options.json) {
			} else {
				p.log.warn('ADO is not initialized in this directory.');
				p.note(`Run ${pc.cyan('ado init')} to initialize.`, 'Get Started');
			}
			return;
		}

		// Load config
		const config = loadConfigWithFallback(cwd);

		// Check state database
		const stateDbPath = join(cwd, '.ado/state.db');
		const hasStateDb = existsSync(stateDbPath);

		// Get provider status
		const providerStatus: Record<
			string,
			{ enabled: boolean; available: boolean; accessModes: string[] }
		> = {};

		for (const [id, providerConfig] of Object.entries(config.providers)) {
			const enabledModes = providerConfig.accessModes.filter((m) => m.enabled).map((m) => m.mode);

			let available = false;

			// Check availability for known providers
			if (id === 'claude-code' && providerConfig.enabled) {
				const adapter = createClaudeCodeAdapter();
				available = await adapter.isAvailable();
			}

			providerStatus[id] = {
				enabled: providerConfig.enabled,
				available,
				accessModes: enabledModes,
			};
		}

		// Get recent tasks if state db exists
		let recentTasks: Array<{
			id: string;
			status: string;
			provider?: string | undefined;
			startedAt?: string | undefined;
		}> = [];
		let usageStats = { requests: 0, tokens: 0, cost: 0 };

		if (hasStateDb) {
			const stateStore = createStateStore(stateDbPath);

			// Get running/recent tasks
			const running = stateStore.getTasksByStatus('running');
			const completed = stateStore.getTasksByStatus('completed').slice(0, 5);
			const failed = stateStore.getTasksByStatus('failed').slice(0, 3);

			recentTasks = [...running, ...completed, ...failed]
				.sort((a, b) => {
					const aTime = a.startedAt?.getTime() ?? 0;
					const bTime = b.startedAt?.getTime() ?? 0;
					return bTime - aTime;
				})
				.slice(0, 10)
				.map((t) => ({
					id: t.id.slice(0, 8),
					status: t.status,
					provider: t.providerId,
					startedAt: t.startedAt?.toLocaleString(),
				}));

			// Get today's usage
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			usageStats = stateStore.getTotalUsage(today);

			stateStore.close();
		}

		if (options.json) {
			return;
		}

		// Display status
		p.log.info(`Config: ${pc.cyan(configPath)}`);
		p.log.info(`Project: ${pc.cyan(config.project.id)}`);
		p.log.info(`Routing: ${pc.cyan(config.routing.strategy)}`);

		// Providers table
		const providerLines = Object.entries(providerStatus)
			.map(([id, status]) => {
				const enabledIcon = status.enabled ? pc.green('✓') : pc.dim('○');
				const availableIcon = status.available ? pc.green('●') : pc.yellow('○');
				const modes = status.accessModes.join(', ') || pc.dim('none');
				return `${enabledIcon} ${id.padEnd(15)} ${availableIcon} ${modes}`;
			})
			.join('\n');

		p.note(providerLines, 'Providers (enabled | available | modes)');

		// Recent tasks
		if (recentTasks.length > 0) {
			const taskLines = recentTasks
				.map((t) => {
					const statusIcon =
						t.status === 'completed'
							? pc.green('✓')
							: t.status === 'running'
								? pc.blue('●')
								: t.status === 'failed'
									? pc.red('✗')
									: pc.dim('○');
					return `${statusIcon} ${t.id} ${pc.dim(t.provider ?? '')} ${pc.dim(t.startedAt ?? '')}`;
				})
				.join('\n');

			p.note(taskLines, 'Recent Tasks');
		}

		// Usage stats
		if (usageStats.requests > 0) {
			p.note(
				`Requests: ${usageStats.requests}
Tokens: ${usageStats.tokens.toLocaleString()}
API Cost: $${usageStats.cost.toFixed(2)}`,
				"Today's Usage",
			);
		}

		p.outro('');
	});
