/**
 * Workflow command - Execute YAML-defined workflows
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as p from '@clack/prompts';
import {
	createClaudeCodeAdapter,
	createCodexCLIAdapter,
	createCopilotCLIAdapter,
	createCursorCLIAdapter,
	createGeminiCLIAdapter,
} from '@dxheroes/ado-adapters';
import {
	WorkflowEngine,
	createCostTracker,
	createProviderRegistry,
	createProviderRouter,
	createRateLimitTracker,
	loadConfig,
	parseConditionExpression,
} from '@dxheroes/ado-core';
import type { WorkflowDefinition, WorkflowStep } from '@dxheroes/ado-core';
import type { AgentAdapter, AgentTask } from '@dxheroes/ado-shared';
import { Command } from 'commander';
import pc from 'picocolors';
import YAML from 'yaml';

/**
 * YAML workflow file schema
 */
interface YamlWorkflow {
	name: string;
	description?: string;
	timeout?: number;
	steps: YamlStep[];
}

interface YamlStep {
	id: string;
	name?: string;
	type: 'task' | 'sequential' | 'parallel' | 'branch';
	// For task steps
	prompt?: string;
	provider?: string;
	// For sequential/parallel steps
	steps?: YamlStep[];
	maxConcurrency?: number;
	// For branch steps
	condition?: string;
	then?: YamlStep;
	else?: YamlStep;
}

/**
 * Parse YAML workflow file into WorkflowDefinition
 */
function parseWorkflowFile(
	filePath: string,
	projectId: string,
	repositoryPath: string,
): WorkflowDefinition {
	const absolutePath = resolve(process.cwd(), filePath);

	if (!existsSync(absolutePath)) {
		throw new Error(`Workflow file not found: ${absolutePath}`);
	}

	const content = readFileSync(absolutePath, 'utf-8');
	const yaml = YAML.parse(content) as YamlWorkflow;

	if (!yaml.name) {
		throw new Error('Workflow file must have a "name" field');
	}

	if (!yaml.steps || yaml.steps.length === 0) {
		throw new Error('Workflow file must have at least one step');
	}

	const parseStep = (step: YamlStep): WorkflowStep => {
		switch (step.type) {
			case 'task': {
				if (!step.prompt) {
					throw new Error(`Task step "${step.id}" must have a "prompt" field`);
				}
				const task: AgentTask = {
					id: `${yaml.name}-${step.id}`,
					prompt: step.prompt,
					projectContext: {
						projectId,
						repositoryPath,
						repositoryKey: projectId,
					},
				};
				if (step.provider) {
					task.options = { model: step.provider };
				}
				const result: WorkflowStep = {
					id: step.id,
					type: 'task' as const,
					task,
				};
				if (step.name) result.name = step.name;
				return result;
			}

			case 'sequential': {
				if (!step.steps || step.steps.length === 0) {
					throw new Error(`Sequential step "${step.id}" must have nested steps`);
				}
				const result: WorkflowStep = {
					id: step.id,
					type: 'sequential' as const,
					steps: step.steps.map(parseStep),
				};
				if (step.name) result.name = step.name;
				return result;
			}

			case 'parallel': {
				if (!step.steps || step.steps.length === 0) {
					throw new Error(`Parallel step "${step.id}" must have nested steps`);
				}
				const result: WorkflowStep = {
					id: step.id,
					type: 'parallel' as const,
					steps: step.steps.map(parseStep),
				};
				if (step.name) result.name = step.name;
				if (step.maxConcurrency !== undefined)
					(result as import('@dxheroes/ado-core').ParallelStep).maxConcurrency =
						step.maxConcurrency;
				return result;
			}

			case 'branch': {
				if (!step.condition || !step.then) {
					throw new Error(`Branch step "${step.id}" must have "condition" and "then" fields`);
				}
				const result: WorkflowStep = {
					id: step.id,
					type: 'branch' as const,
					condition: parseConditionExpression(step.condition),
					thenStep: parseStep(step.then),
				};
				if (step.name) result.name = step.name;
				if (step.else)
					(result as import('@dxheroes/ado-core').BranchStep).elseStep = parseStep(step.else);
				return result;
			}

			default:
				throw new Error(`Unknown step type: ${step.type}`);
		}
	};

	// Wrap all steps in a sequential root if multiple steps
	const firstStep = yaml.steps[0];
	if (!firstStep) {
		throw new Error('Workflow must have at least one step');
	}
	const rootStep: WorkflowStep =
		yaml.steps.length === 1
			? parseStep(firstStep)
			: {
					id: 'root',
					type: 'sequential' as const,
					steps: yaml.steps.map(parseStep),
				};

	const result: WorkflowDefinition = {
		id: `workflow-${yaml.name}-${Date.now()}`,
		name: yaml.name,
		rootStep,
	};
	if (yaml.description) result.description = yaml.description;
	if (yaml.timeout !== undefined) result.timeout = yaml.timeout;
	return result;
}

export const workflowCommand = new Command('workflow')
	.description('Execute YAML-defined workflows')
	.addCommand(
		new Command('run')
			.description('Run a workflow from a YAML file')
			.argument('<file>', 'Path to workflow YAML file')
			.option(
				'--hitl <policy>',
				'HITL policy (autonomous, review-edits, approve-steps, manual)',
				'review-edits',
			)
			.option('--timeout <seconds>', 'Workflow timeout in seconds')
			.option('--dry-run', 'Parse and validate workflow without executing')
			.action(
				async (file: string, options: { hitl: string; timeout?: string; dryRun?: boolean }) => {
					p.intro(pc.cyan('ADO Workflow'));

					const cwd = process.cwd();

					// Load configuration
					let config: Awaited<ReturnType<typeof loadConfig>>;
					try {
						config = await loadConfig(cwd);
					} catch {
						p.log.error('No ADO configuration found. Run "ado init" first.');
						process.exit(1);
					}

					// Parse workflow file
					const spinner = p.spinner();
					spinner.start('Parsing workflow file...');

					let workflow: WorkflowDefinition;
					try {
						workflow = parseWorkflowFile(file, config.project.id, cwd);
						spinner.stop('Workflow parsed successfully');
					} catch (error) {
						spinner.stop('Failed to parse workflow');
						p.log.error(error instanceof Error ? error.message : String(error));
						process.exit(1);
					}

					// Display workflow info
					p.note(
						`Name: ${workflow.name}\n` +
							`Description: ${workflow.description || 'N/A'}\n` +
							`HITL Policy: ${options.hitl}\n` +
							`Timeout: ${options.timeout ? `${options.timeout}s` : 'default'}`,
						'Workflow Details',
					);

					if (options.dryRun) {
						p.log.success('Dry run complete - workflow is valid');
						p.outro('Workflow validation successful');
						return;
					}

					// Initialize trackers and router
					const rateLimitTracker = createRateLimitTracker();
					const costTracker = createCostTracker();

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

					// Register providers from config
					for (const [id, providerConfig] of Object.entries(config.providers)) {
						registry.register({ ...providerConfig, id });
					}

					// Create adapter factory
					const createAdapter = (providerId: string): AgentAdapter => {
						switch (providerId) {
							case 'claude-code':
								return createClaudeCodeAdapter();
							case 'gemini-cli':
								return createGeminiCLIAdapter();
							case 'cursor-cli':
								return createCursorCLIAdapter();
							case 'copilot-cli':
								return createCopilotCLIAdapter();
							case 'codex-cli':
								return createCodexCLIAdapter();
							default:
								throw new Error(`Unknown provider: ${providerId}`);
						}
					};

					// Create workflow engine
					const engine = new WorkflowEngine();

					// Create a task executor that uses real adapters
					const taskExecutor = async (task: AgentTask) => {
						p.log.step(`Executing task: ${task.prompt.substring(0, 50)}...`);

						// Select provider using router
						const selection = await router.selectProvider({
							prompt: task.prompt,
							projectKey: config.project.id,
							repositoryPath: cwd,
							allowApiFailover: config.routing.apiFallback.enabled,
							maxApiCostUsd: config.routing.apiFallback.maxCostPerTask,
						});

						p.log.info(`Using provider: ${pc.cyan(selection.provider.id)}`);

						// Create and initialize adapter
						const adapter = createAdapter(selection.provider.id);
						await adapter.initialize({
							provider: selection.provider,
							workingDirectory: cwd,
							projectContext: task.projectContext,
						});

						// Check availability
						const available = await adapter.isAvailable();
						if (!available) {
							throw new Error(`Provider ${selection.provider.id} is not available`);
						}

						// Execute task
						let result: { id: string; status: 'completed' | 'failed'; result: string } | null =
							null;
						const startTime = Date.now();

						for await (const event of adapter.execute(task)) {
							if (event.type === 'tool_use') {
								p.log.step(`  Tool: ${pc.dim(event.toolName)}`);
							}

							if (event.type === 'complete') {
								result = {
									id: task.id,
									status: 'completed',
									result: `Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
								};
							}

							if (event.type === 'error') {
								result = {
									id: task.id,
									status: 'failed',
									result: event.error.message,
								};
								break;
							}
						}

						if (!result) {
							throw new Error('Task execution did not complete');
						}

						return result;
					};

					// Set task executor
					engine.setTaskExecutor(taskExecutor);

					// Subscribe to events
					engine.on((event) => {
						switch (event.type) {
							case 'step_started':
								p.log.step(`Started: ${event.stepId}`);
								break;
							case 'step_completed':
								p.log.success(`Completed: ${event.stepId}`);
								break;
							case 'step_failed':
								p.log.error(`Failed: ${event.stepId}`);
								break;
							case 'workflow_completed':
								p.log.success('Workflow completed!');
								break;
							case 'workflow_failed':
								p.log.error('Workflow failed');
								break;
						}
					});

					// Start workflow execution
					spinner.start('Executing workflow...');

					try {
						const result = await engine.execute(workflow);

						spinner.stop(result.status === 'completed' ? 'Workflow completed' : 'Workflow failed');

						if (result.status === 'completed') {
							p.note(
								`Duration: ${result.duration}ms\n` +
									`Steps completed: ${result.steps.filter((s) => s.status === 'success').length}`,
								'Results',
							);
							p.outro(pc.green('✓ Workflow completed successfully'));
						} else {
							p.log.error(result.error?.message || 'Unknown error');
							p.outro(pc.red('✗ Workflow failed'));
							process.exit(1);
						}
					} catch (error) {
						spinner.stop('Workflow execution failed');
						p.log.error(error instanceof Error ? error.message : String(error));
						process.exit(1);
					}
				},
			),
	)
	.addCommand(
		new Command('list').description('List available workflow files').action(async () => {
			p.intro(pc.cyan('ADO Workflows'));

			const cwd = process.cwd();

			// Find workflow files
			const files = readdirSync(cwd).filter(
				(f) => f.endsWith('.workflow.yaml') || f.endsWith('.workflow.yml'),
			);

			if (files.length === 0) {
				p.log.info('No workflow files found (*.workflow.yaml or *.workflow.yml)');
				p.outro('Create a workflow file to get started');
				return;
			}

			p.log.message(pc.bold('Available Workflows:'));
			for (const file of files) {
				try {
					const content = readFileSync(resolve(cwd, file), 'utf-8');
					const yaml = YAML.parse(content) as YamlWorkflow;
					p.log.message(`  ${pc.cyan(file)} - ${yaml.name || 'Unnamed'}`);
				} catch {
					p.log.message(`  ${pc.cyan(file)} - ${pc.red('(invalid)')}`);
				}
			}

			p.outro(`Run a workflow with: ${pc.dim('ado workflow run <file>')}`);
		}),
	)
	.addCommand(
		new Command('validate')
			.description('Validate a workflow file')
			.argument('<file>', 'Path to workflow YAML file')
			.action(async (file: string) => {
				p.intro(pc.cyan('ADO Workflow Validator'));

				const cwd = process.cwd();

				// Load config for project context
				let config: Awaited<ReturnType<typeof loadConfig>>;
				try {
					config = await loadConfig(cwd);
				} catch {
					p.log.error('No ADO configuration found. Run "ado init" first.');
					process.exit(1);
				}

				try {
					const workflow = parseWorkflowFile(file, config.project.id, cwd);
					p.log.success(`Workflow "${workflow.name}" is valid`);
					p.note(
						`ID: ${workflow.id}\n` +
							`Name: ${workflow.name}\n` +
							`Description: ${workflow.description || 'N/A'}\n` +
							`Timeout: ${workflow.timeout ? `${workflow.timeout}ms` : 'default'}`,
						'Workflow Details',
					);
					p.outro(pc.green('✓ Validation successful'));
				} catch (error) {
					p.log.error(error instanceof Error ? error.message : String(error));
					p.outro(pc.red('✗ Validation failed'));
					process.exit(1);
				}
			}),
	);
