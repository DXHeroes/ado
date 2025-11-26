/**
 * Run command - Execute a task with AI agents
 */

import { randomUUID } from 'node:crypto';
import { createClaudeCodeAdapter } from '@ado/adapters';
import {
	createProviderRegistry,
	createRateLimitTracker,
	createStateStore,
	loadConfigWithFallback,
} from '@ado/core';
import type { AgentAdapter, AgentEvent, TaskDefinition } from '@ado/shared';
import * as p from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';
import { ensureAdoDir } from '../utils/fs.js';

export const runCommand = new Command('run')
	.description('Execute a task with AI agents')
	.argument('<prompt>', 'Task description or prompt')
	.option('-p, --provider <provider>', 'Use specific provider')
	.option('--providers <providers>', 'Comma-separated list of providers to use')
	.option('--exclude <providers>', 'Comma-separated providers to exclude')
	.option('--no-api-fallback', 'Disable API fallback when subscriptions exhausted')
	.option('--max-cost <cost>', 'Maximum API cost in USD', Number.parseFloat)
	.option('--resume <sessionId>', 'Resume from previous session')
	.option('--model <model>', 'Specify model to use')
	.option('--max-turns <turns>', 'Maximum conversation turns', Number.parseInt)
	.option('-y, --yes', 'Skip confirmations')
	.action(async (prompt: string, options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Run ')));

		// Load configuration
		const config = loadConfigWithFallback(cwd);

		// Ensure .ado directory exists
		const adoDir = ensureAdoDir(cwd);

		// Initialize rate limit tracker
		const rateLimitTracker = createRateLimitTracker();

		// Configure rate limits from config
		for (const [providerId, providerConfig] of Object.entries(config.providers)) {
			for (const accessMode of providerConfig.accessModes) {
				if (accessMode.mode === 'subscription' && accessMode.subscription) {
					rateLimitTracker.configure(providerId, accessMode.mode, {
						requestsPerDay: accessMode.subscription.rateLimits.requestsPerDay,
						requestsPerHour: accessMode.subscription.rateLimits.requestsPerHour,
						tokensPerDay: accessMode.subscription.rateLimits.tokensPerDay,
						resetTime: accessMode.subscription.resetTime,
					});
				} else if (accessMode.mode === 'api' && accessMode.api) {
					rateLimitTracker.configure(providerId, accessMode.mode, {
						requestsPerMinute: accessMode.api.rateLimits.requestsPerMinute,
						tokensPerMinute: accessMode.api.rateLimits.tokensPerMinute,
					});
				}
			}
		}

		// Create provider registry
		const registry = createProviderRegistry(rateLimitTracker);

		// Register providers from config
		for (const [id, providerConfig] of Object.entries(config.providers)) {
			registry.register({ ...providerConfig, id });
		}

		// Build task definition
		const task: TaskDefinition = {
			prompt,
			projectKey: config.project.id,
			repositoryPath: cwd,
			allowApiFailover: options.apiFallback !== false && config.routing.apiFallback.enabled,
			maxApiCostUsd: options.maxCost ?? config.routing.apiFallback.maxCostPerTask,
		};

		// Apply provider filters
		if (options.provider) {
			task.preferredProviders = [options.provider];
		} else if (options.providers) {
			task.preferredProviders = options.providers.split(',').map((s: string) => s.trim());
		}

		if (options.exclude) {
			task.excludeProviders = options.exclude.split(',').map((s: string) => s.trim());
		}

		// Select provider
		const selection = await registry.selectProvider(task);

		if (!selection) {
			p.log.error('No available providers found for this task.');
			p.note(
				`Check that:
• At least one provider is enabled in ${pc.cyan('ado.config.yaml')}
• Required providers are installed and authenticated
• Rate limits haven't been exhausted`,
				'Troubleshooting',
			);
			process.exit(1);
		}

		p.log.info(`Selected provider: ${pc.cyan(selection.provider.id)} (${selection.reason})`);

		// Check if API fallback with cost
		if (selection.accessMode.mode === 'api' && selection.estimatedCost && !options.yes) {
			const proceed = await p.confirm({
				message: `This will use API billing. Estimated cost: ${pc.yellow(`$${selection.estimatedCost.toFixed(4)}`)}. Continue?`,
				initialValue: true,
			});

			if (p.isCancel(proceed) || !proceed) {
				p.cancel('Task cancelled');
				process.exit(0);
			}
		}

		// Initialize state store
		const stateStore = createStateStore(`${adoDir}/state.db`);

		// Create task record
		const taskId = randomUUID();
		stateStore.createTask({
			id: taskId,
			definition: task,
			status: 'pending',
			providerId: selection.provider.id,
		});

		// Create adapter based on provider
		let adapter: AgentAdapter;
		switch (selection.provider.id) {
			case 'claude-code':
				adapter = createClaudeCodeAdapter();
				break;
			default:
				p.log.error(`Adapter not implemented for provider: ${selection.provider.id}`);
				process.exit(1);
		}

		// Check availability
		const spinner = p.spinner();
		spinner.start(`Checking ${selection.provider.id} availability`);

		const available = await adapter.isAvailable();
		if (!available) {
			spinner.stop(`${selection.provider.id} is not available`);
			p.log.error(`${selection.provider.id} CLI is not installed or not authenticated.`);
			p.note(
				`Install with: ${pc.cyan('npm install -g @anthropic-ai/claude-code')}
Then authenticate with: ${pc.cyan('claude auth')}`,
				'Setup Required',
			);
			process.exit(1);
		}

		spinner.stop(`${selection.provider.id} ready`);

		// Initialize adapter
		await adapter.initialize({
			provider: selection.provider,
			workingDirectory: cwd,
			projectContext: {
				projectId: config.project.id,
				repositoryPath: cwd,
				repositoryKey: config.project.repository ?? config.project.id,
			},
		});

		// Update task status
		stateStore.updateTask(taskId, {
			status: 'running',
			startedAt: new Date(),
		});

		p.log.step('Starting task execution...');

		// Execute task
		const agentTask = {
			id: taskId,
			prompt,
			projectContext: {
				projectId: config.project.id,
				repositoryPath: cwd,
				repositoryKey: config.project.repository ?? config.project.id,
			},
			sessionId: options.resume,
			options: {
				model: options.model,
				maxTurns: options.maxTurns,
			},
		};

		try {
			let sessionId: string | undefined;

			for await (const event of adapter.execute(agentTask)) {
				handleEvent(event);

				if (event.type === 'start') {
					sessionId = event.sessionId;
					stateStore.updateTask(taskId, { sessionId });
				}

				if (event.type === 'complete') {
					stateStore.updateTask(taskId, {
						status: 'completed',
						completedAt: new Date(),
						result: event.result,
					});

					// Record usage
					if (event.result.tokensUsed) {
						rateLimitTracker.recordUsage({
							providerId: selection.provider.id,
							accessMode: selection.accessMode.mode,
							timestamp: new Date(),
							requestCount: 1,
							inputTokens: event.result.tokensUsed.input,
							outputTokens: event.result.tokensUsed.output,
						});
					}
				}

				if (event.type === 'error') {
					stateStore.updateTask(taskId, {
						status: 'failed',
						completedAt: new Date(),
						error: event.error.message,
					});
				}

				if (event.type === 'rate_limit') {
					p.log.warn(`Rate limit hit: ${event.reason}`);
					if (event.resetsAt) {
						p.log.info(`Resets at: ${event.resetsAt.toLocaleString()}`);
					}
				}
			}

			p.outro(`${pc.green('✓')} Task completed. Session: ${pc.dim(sessionId ?? 'unknown')}`);
		} catch (error) {
			stateStore.updateTask(taskId, {
				status: 'failed',
				completedAt: new Date(),
				error: error instanceof Error ? error.message : String(error),
			});

			p.log.error(error instanceof Error ? error.message : 'Task execution failed');
			process.exit(1);
		} finally {
			stateStore.close();
		}
	});

/**
 * Handle agent events and output
 */
function handleEvent(event: AgentEvent): void {
	switch (event.type) {
		case 'start':
			// Already logged
			break;

		case 'output':
			if (event.content) {
				process.stdout.write(event.content);
			}
			break;

		case 'tool_use':
			p.log.step(`Using tool: ${pc.cyan(event.toolName)}`);
			break;

		case 'tool_result':
			if (!event.success) {
				p.log.warn(`Tool ${event.toolName} failed`);
			}
			break;

		case 'error':
			p.log.error(event.error.message);
			break;

		case 'rate_limit':
			// Handled in main loop
			break;

		case 'complete':
			process.stdout.write('\n');
			p.log.success(`Completed in ${(event.result.duration / 1000).toFixed(1)}s`);
			if (event.result.filesModified?.length) {
				p.note(event.result.filesModified.map((f) => pc.cyan(f)).join('\n'), 'Modified Files');
			}
			break;

		case 'interrupt':
			p.log.warn(`Interrupted: ${event.reason}`);
			break;
	}
}
