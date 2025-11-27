/**
 * Run command - Execute a task with AI agents
 */

import { randomUUID } from 'node:crypto';
import * as p from '@clack/prompts';
import {
	createClaudeCodeAdapter,
	createCodexCLIAdapter,
	createCopilotCLIAdapter,
	createCursorCLIAdapter,
	createGeminiCLIAdapter,
} from '@dxheroes/ado-adapters';
import {
	createCostTracker,
	createHITLController,
	createProviderRegistry,
	createProviderRouter,
	createRateLimitTracker,
	createStateStore,
	loadConfigWithFallback,
} from '@dxheroes/ado-core';
import type { HITLController, HITLPolicy, RateLimitTracker } from '@dxheroes/ado-core';
import type {
	AgentAdapter,
	AgentEvent,
	ProviderSelection,
	TaskDefinition,
} from '@dxheroes/ado-shared';
import { Command } from 'commander';
import pc from 'picocolors';
import { ensureAdoDir } from '../utils/fs.js';

export const runCommand = new Command('run')
	.description('Execute a task with AI agents')
	.argument('<prompt>', 'Task description or prompt')
	.option('-p, --provider <provider>', 'Use specific provider')
	.option('--providers <providers>', 'Comma-separated list of providers to use')
	.option('--exclude <providers>', 'Comma-separated providers to exclude')
	.option('--access-mode <mode>', 'Force specific access mode (subscription, api, free)')
	.option('--no-api-fallback', 'Disable API fallback when subscriptions exhausted')
	.option('--max-cost <cost>', 'Maximum API cost in USD', Number.parseFloat)
	.option('--resume <sessionId>', 'Resume from previous session')
	.option('--model <model>', 'Specify model to use')
	.option('--max-turns <turns>', 'Maximum conversation turns', Number.parseInt)
	.option('-y, --yes', 'Skip confirmations and use acceptEdits permission mode')
	.option('--yolo', 'YOLO mode: bypass ALL permission checks (dangerous!)')
	.option(
		'--hitl <policy>',
		'HITL policy (autonomous, review-edits, approve-steps, manual)',
		'review-edits',
	)
	.action(async (prompt: string, options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Run ')));

		// Load configuration
		const config = loadConfigWithFallback(cwd);

		// Ensure .ado directory exists
		const adoDir = ensureAdoDir(cwd);

		// Note: Telemetry is automatically initialized via the OpenTelemetry global tracer
		// in the adapter's BaseAdapter class. No need to manually initialize here.

		// Initialize rate limit tracker (use Redis if configured, otherwise in-memory)
		let rateLimitTracker: RateLimitTracker;
		const redisUrl = config.storage?.rateLimitTracking?.redisUrl || process.env.REDIS_URL;
		if (config.storage?.rateLimitTracking?.driver === 'redis' && redisUrl) {
			try {
				// Dynamically import Redis client (optional dependency)
				const redisModule = await import('redis').catch(() => null);
				if (!redisModule) {
					p.log.warn('Redis client not installed, falling back to in-memory tracking');
					p.log.info('Install with: pnpm add redis');
					rateLimitTracker = createRateLimitTracker();
				} else {
					const redis = redisModule.createClient({ url: redisUrl });
					await redis.connect();

					const { createRedisRateLimitTracker } = await import('@dxheroes/ado-core');
					// Cast to any to work with optional dependency
					rateLimitTracker = createRedisRateLimitTracker(redis as never);
					p.log.info('Using Redis for rate limit tracking');
				}
			} catch (_error) {
				p.log.warn('Failed to connect to Redis, falling back to in-memory tracking');
				rateLimitTracker = createRateLimitTracker();
			}
		} else {
			rateLimitTracker = createRateLimitTracker();
		}

		// Initialize other trackers and HITL controller
		const costTracker = createCostTracker();
		const hitlController = createHITLController({
			defaultPolicy:
				(options.hitl as 'autonomous' | 'review-edits' | 'approve-steps' | 'manual') ??
				config.hitl?.defaultPolicy,
			defaultTimeout: 24 * 60 * 60 * 1000, // 24 hours
			...(config.hitl?.escalateOnCost?.threshold && {
				costEscalationThreshold: config.hitl.escalateOnCost.threshold,
			}),
		});

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

		// Create provider registry and router
		const registry = createProviderRegistry(rateLimitTracker);
		const router = createProviderRouter(registry, rateLimitTracker, costTracker, {
			strategy: config.routing.strategy,
			failover: config.routing.failover,
			apiFallback: config.routing.apiFallback,
		});

		// Set cost confirmation callback
		router.setCostConfirmationCallback(async (provider, mode, cost) => {
			if (options.yes) {
				return true; // Auto-approve if --yes flag
			}

			const proceed = await p.confirm({
				message: `API fallback to ${pc.cyan(provider)} (${mode}). Estimated cost: ${pc.yellow(`$${cost.toFixed(4)}`)}. Continue?`,
				initialValue: true,
			});

			return !p.isCancel(proceed) && proceed;
		});

		// Register providers from config
		for (const [id, providerConfig] of Object.entries(config.providers)) {
			registry.register({ ...providerConfig, id });
		}

		// Validate access mode if provided
		if (options.accessMode) {
			const validModes = ['subscription', 'api', 'free'];
			if (!validModes.includes(options.accessMode)) {
				p.log.error(
					`Invalid access mode: ${options.accessMode}. Must be one of: ${validModes.join(', ')}`,
				);
				process.exit(1);
			}
		}

		// Build task definition
		const task: TaskDefinition = {
			prompt,
			projectKey: config.project.id,
			repositoryPath: cwd,
			allowApiFailover: options.apiFallback !== false && config.routing.apiFallback.enabled,
			maxApiCostUsd: options.maxCost ?? config.routing.apiFallback.maxCostPerTask,
			...(options.accessMode && {
				preferredAccessMode: options.accessMode as 'subscription' | 'api' | 'free',
			}),
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

		// Select provider using router (handles cost confirmation)
		let selection: ProviderSelection;
		try {
			selection = await router.selectProvider(task);
		} catch (error) {
			if (error instanceof Error) {
				p.log.error(error.message);
				if (error.message.includes('DAILY_COST_LIMIT')) {
					p.note(
						`Daily API cost limit reached. Options:
• Wait until tomorrow for subscription limits to reset
• Increase daily cost limit in ${pc.cyan('ado.config.yaml')}
• Check costs with: ${pc.cyan('ado report --costs')}`,
						'Cost Limit Reached',
					);
				}
			}
			process.exit(1);
		}

		p.log.info(`Selected provider: ${pc.cyan(selection.provider.id)} (${selection.reason})`);

		// Show estimated cost for API mode
		if (selection.accessMode.mode === 'api' && selection.estimatedCost) {
			p.log.info(`Estimated cost: ${pc.yellow(`$${selection.estimatedCost.toFixed(4)}`)}`);
		}

		// Initialize state store
		const stateStore = createStateStore(`${adoDir}/state.db`);

		// Create session for this run
		const sessionId = options.resume ?? randomUUID();
		if (!options.resume) {
			stateStore.createSession({
				id: sessionId,
				projectId: config.project.id,
				repositoryKey: config.project.repository ?? config.project.id,
				providerId: selection.provider.id,
			});
		}

		// Create task record
		const taskId = randomUUID();
		stateStore.createTask({
			id: taskId,
			definition: task,
			status: 'pending',
			providerId: selection.provider.id,
			sessionId,
		});

		// Create adapter based on provider
		let adapter: AgentAdapter;
		switch (selection.provider.id) {
			case 'claude-code':
				adapter = createClaudeCodeAdapter();
				break;
			case 'gemini-cli':
				adapter = createGeminiCLIAdapter();
				break;
			case 'cursor-cli':
				adapter = createCursorCLIAdapter();
				break;
			case 'copilot-cli':
				adapter = createCopilotCLIAdapter();
				break;
			case 'codex-cli':
				adapter = createCodexCLIAdapter();
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

			// Provider-specific setup instructions
			const setupInstructions: Record<string, string> = {
				'claude-code': `Install with: ${pc.cyan('npm install -g @anthropic-ai/claude-code')}
Then authenticate with: ${pc.cyan('claude auth')}`,
				'gemini-cli': `Install with: ${pc.cyan('npm install -g @google/generative-ai-cli')}
Then authenticate with: ${pc.cyan('gemini auth')}`,
				'cursor-cli': `Install Cursor IDE and CLI from: ${pc.cyan('https://cursor.sh')}
Then authenticate with: ${pc.cyan('cursor-agent auth')}`,
				'copilot-cli': `Install with: ${pc.cyan('npm install -g @github/copilot-cli')}
Then authenticate with: ${pc.cyan('copilot auth')}`,
				'codex-cli': `Install with: ${pc.cyan('npm install -g @openai/codex-cli')}
Then authenticate with: ${pc.cyan('codex auth')}`,
			};

			p.note(
				setupInstructions[selection.provider.id] ??
					`Provider ${selection.provider.id} requires setup.`,
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

		// Determine permission mode and HITL policy
		const hitlPolicy = options.hitl as 'autonomous' | 'review-edits' | 'approve-steps' | 'manual';

		let permissionMode: 'acceptEdits' | 'bypassPermissions' | 'default' | 'plan' | undefined;
		if (options.yolo) {
			permissionMode = 'bypassPermissions';
			p.log.warn('YOLO mode enabled - bypassing ALL permission checks!');
		} else if (options.yes) {
			permissionMode = 'acceptEdits';
		} else if (hitlPolicy === 'autonomous') {
			permissionMode = 'acceptEdits';
		}

		// Log HITL policy
		if (hitlPolicy !== 'autonomous' && !options.yolo) {
			p.log.info(`HITL Policy: ${pc.cyan(hitlPolicy)}`);
		}
		// Don't fall back to config defaults - let the agent use its own defaults

		// Execute task - only pass explicitly specified options
		const agentTask = {
			id: taskId,
			prompt,
			projectContext: {
				projectId: config.project.id,
				repositoryPath: cwd,
				repositoryKey: config.project.repository ?? config.project.id,
			},
			sessionId,
			options: {
				// Only pass model if explicitly specified by user
				...(options.model && { model: options.model }),
				// Only pass maxTurns if explicitly specified by user
				...(options.maxTurns && { maxTurns: options.maxTurns }),
				// Only pass permissionMode if set
				...(permissionMode && { permissionMode }),
			},
		};

		try {
			let adapterSessionId: string | undefined;

			for await (const event of adapter.execute(agentTask)) {
				// Handle HITL approval for risky operations
				if (!options.yolo && hitlPolicy !== 'autonomous') {
					await handleHITLApproval(event, taskId, hitlPolicy, hitlController);
				}

				handleEvent(event);

				if (event.type === 'start') {
					adapterSessionId = event.sessionId;
					// Update session with adapter's session ID if different
					if (adapterSessionId && adapterSessionId !== sessionId) {
						stateStore.updateSession(sessionId, { metadata: { adapterSessionId } });
					}
				}

				if (event.type === 'complete') {
					stateStore.updateTask(taskId, {
						status: 'completed',
						completedAt: new Date(),
						result: event.result,
					});

					// Record usage in both rate limit and cost trackers
					if (event.result.tokensUsed) {
						await router.recordUsage(
							selection.provider.id,
							selection.accessMode.mode,
							1, // request count
							event.result.tokensUsed.input,
							event.result.tokensUsed.output,
						);
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

			p.outro(`${pc.green('✓')} Task completed. Session: ${pc.dim(sessionId)}`);
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
 * Handle HITL approval for risky operations
 */
async function handleHITLApproval(
	event: AgentEvent,
	taskId: string,
	policy: HITLPolicy,
	controller: HITLController,
): Promise<void> {
	// Determine if approval is needed based on event type and policy
	let approvalType: 'file_edit' | 'command_execution' | 'step_execution' | null = null;
	let message = '';
	let data: Record<string, unknown> = {};

	if (event.type === 'tool_use') {
		// Check if tool requires approval based on policy
		if (policy === 'review-edits' && isFileEditTool(event.toolName)) {
			approvalType = 'file_edit';
			message = `Agent wants to edit files using ${event.toolName}`;
			data = { tool: event.toolName, input: event.toolInput };
		} else if (
			policy === 'approve-steps' &&
			(isFileEditTool(event.toolName) || isCommandTool(event.toolName))
		) {
			approvalType = isFileEditTool(event.toolName) ? 'file_edit' : 'command_execution';
			message = `Agent wants to ${isFileEditTool(event.toolName) ? 'edit files' : 'run command'} using ${event.toolName}`;
			data = { tool: event.toolName, input: event.toolInput };
		} else if (policy === 'manual') {
			approvalType = 'step_execution';
			message = `Agent wants to use tool: ${event.toolName}`;
			data = { tool: event.toolName, input: event.toolInput };
		}
	}

	// Request approval if needed
	if (approvalType) {
		p.log.warn(`${pc.yellow('⚠')} Approval required: ${message}`);

		const shouldProceed = await p.confirm({
			message: 'Allow this operation?',
			initialValue: true,
		});

		if (p.isCancel(shouldProceed) || !shouldProceed) {
			// Submit rejection
			await controller.requestApproval(taskId, approvalType, message, data, 60000);
			throw new Error(`User rejected operation: ${message}`);
		}

		// Approved - continue
		p.log.success(`${pc.green('✓')} Operation approved`);
	}
}

/**
 * Check if tool name represents a file editing operation
 */
function isFileEditTool(toolName: string): boolean {
	const fileEditTools = ['edit', 'write', 'multiedit', 'notebookedit', 'delete', 'move', 'rename'];
	return fileEditTools.some((tool) => toolName.toLowerCase().includes(tool));
}

/**
 * Check if tool name represents a command execution
 */
function isCommandTool(toolName: string): boolean {
	const commandTools = ['bash', 'shell', 'exec', 'run'];
	return commandTools.some((tool) => toolName.toLowerCase().includes(tool));
}

/**
 * Handle agent events and output
 */
function handleEvent(event: AgentEvent): void {
	switch (event.type) {
		case 'start':
			// Already logged
			break;

		case 'output':
			// Output is now streamed directly in the adapter
			// This event is just for tracking full output after completion
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
