/**
 * Autonomous command - Documentation-First autonomous workflow
 *
 * Commands:
 * - ado auto <prompt>     - Execute full autonomous workflow
 * - ado specify <prompt>  - Generate specification only
 * - ado decompose <prompt> - Show task decomposition
 */

import { randomUUID } from 'node:crypto';
import * as p from '@clack/prompts';
import {
	createAutoFixEngine,
	createDocFirstWorkflow,
	createEscalationEngine,
	createHITLCheckpointCoordinator,
	createInMemoryCheckpointManager,
	createQualityValidationCoordinator,
	createRecoveryManager,
	createSpecGenerator,
	createStuckDetector,
	createTaskClassifier,
	createTaskDecomposer,
	createTypeScriptValidator,
	loadConfigWithFallback,
} from '@dxheroes/ado-core';
import { Command } from 'commander';
import pc from 'picocolors';
import { ensureAdoDir } from '../utils/fs.js';

export const autonomousCommand = new Command('auto')
	.description('Execute autonomous documentation-first workflow')
	.argument('<prompt>', 'Task description or prompt')
	.option('--no-hitl', 'Disable human-in-the-loop checkpoints (fully autonomous)')
	.option('--spec-only', 'Generate specification only (do not execute)')
	.option('--max-retries <count>', 'Maximum retry attempts', Number.parseInt, 5)
	.option('--coverage <percent>', 'Minimum test coverage percentage', Number.parseInt, 80)
	.action(async (prompt: string, options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Autonomous Workflow ')));

		// Load configuration
		const config = loadConfigWithFallback(cwd);
		const adoDir = ensureAdoDir(cwd);

		// Initialize workflow components
		const spinner = p.spinner();
		spinner.start('Initializing autonomous workflow...');

		// Task classifier
		const taskClassifier = createTaskClassifier();

		// Task decomposer
		const taskDecomposer = createTaskDecomposer(taskClassifier);

		// Spec generator
		const specGenerator = createSpecGenerator();

		// Quality validation
		const tsValidator = createTypeScriptValidator();
		const qualityValidator = createQualityValidationCoordinator([tsValidator]);

		// Stuck detection & escalation
		const stuckDetector = createStuckDetector({
			identicalErrorThreshold: 3,
			noProgressThreshold: 5,
			timeoutMinutes: 30,
		});

		const escalationEngine = createEscalationEngine({
			enabled: true,
			defaultTimeout: 5 * 60 * 1000, // 5 minutes
		});

		// Auto-fix engine
		const autoFixEngine = createAutoFixEngine(stuckDetector, {
			enabled: true,
			maxAttempts: options.maxRetries,
			minConfidence: 0.7,
			verifyFixes: true,
			dryRun: false,
		});

		// Checkpoint system
		const checkpointManager = createInMemoryCheckpointManager();
		const recoveryManager = createRecoveryManager(checkpointManager, {
			maxAttempts: options.maxRetries,
			initialDelay: 1000,
			maxDelay: 30000,
			backoffMultiplier: 2,
		});

		// HITL coordinator
		const hitlCoordinator = createHITLCheckpointCoordinator(
			stuckDetector,
			escalationEngine,
			{
				requireApproval: !options.hitl, // Invert: --no-hitl means no approval required
				escalateOnStuck: true,
				escalateOnCritical: true,
			},
		);

		// Doc-first workflow
		const workflow = createDocFirstWorkflow(
			specGenerator,
			taskDecomposer,
			qualityValidator,
			autoFixEngine,
			hitlCoordinator,
			stuckDetector,
			escalationEngine,
		);

		spinner.stop('Workflow initialized');

		// Subscribe to workflow events
		workflow.onEvent((event) => {
			switch (event.type) {
				case 'checkpoint_reached':
					p.log.info(`${pc.yellow('⚠')} Checkpoint reached: ${event.checkpoint.name}`);
					break;
				case 'escalation_triggered':
					p.log.warn(`${pc.red('⚠')} Escalation triggered: ${event.escalation.reason}`);
					break;
				case 'approval_requested':
					p.log.warn(`${pc.yellow('⚠')} Approval required: ${event.request.message}`);
					break;
				case 'approval_granted':
					p.log.success(`${pc.green('✓')} Approval granted`);
					break;
			}
		});

		// Generate task ID
		const taskId = randomUUID();

		try {
			// Execute workflow
			p.log.step('Starting autonomous workflow...');
			p.log.info(`Task ID: ${pc.dim(taskId)}`);

			const result = await workflow.execute({
				taskId,
				prompt,
				workingDirectory: cwd,
				requireHumanApproval: !options.hitl, // Invert: --no-hitl means no approval
			});

			// Display results
			process.stdout.write('\n');

			if (result.success) {
				p.log.success(`${pc.green('✓')} Workflow completed successfully`);

				// Summary
				const summaryLines = [
					`Duration: ${(result.duration / 1000).toFixed(1)}s`,
					`Tasks completed: ${pc.green(result.summary.tasksCompleted.toString())}`,
					`Tasks failed: ${result.summary.tasksFailed > 0 ? pc.red(result.summary.tasksFailed.toString()) : pc.dim('0')}`,
					`Checkpoints reached: ${pc.cyan(result.summary.checkpointsReached.toString())}`,
					`Escalations: ${result.summary.escalationsTriggered > 0 ? pc.yellow(result.summary.escalationsTriggered.toString()) : pc.dim('0')}`,
					`Fixes applied: ${result.summary.fixesApplied > 0 ? pc.cyan(result.summary.fixesApplied.toString()) : pc.dim('0')}`,
				];

				p.note(summaryLines.join('\n'), 'Summary');

				// Show specification if generated
				if (result.state.specification) {
					p.log.info(
						`${pc.dim('Specification saved to:')} ${pc.cyan(`${adoDir}/spec-${taskId}.md`)}`,
					);
				}

				// Show decomposition if generated
				if (result.state.decomposition) {
					const { executionPlan } = result.state.decomposition;
					p.log.info(
						`${pc.dim('Execution plan:')} ${executionPlan.tasks.length} tasks in ${executionPlan.stages.length} stages`,
					);
				}
			} else {
				p.log.error(`${pc.red('✗')} Workflow failed`);

				if (result.error) {
					p.note(result.error, 'Error Details');
				}

				// Show partial results
				if (result.summary.tasksCompleted > 0) {
					p.log.info(
						`${pc.cyan(result.summary.tasksCompleted.toString())} tasks completed before failure`,
					);
				}

				process.exit(1);
			}
		} catch (error) {
			p.log.error(error instanceof Error ? error.message : 'Workflow execution failed');
			process.exit(1);
		}
	});

export const specifyCommand = new Command('specify')
	.description('Generate specification for a task')
	.argument('<prompt>', 'Task description or prompt')
	.option('-o, --output <file>', 'Output file path')
	.action(async (prompt: string, options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Specify ')));

		// Initialize components
		const taskClassifier = createTaskClassifier();
		const specGenerator = createSpecGenerator();

		const spinner = p.spinner();
		spinner.start('Analyzing task...');

		try {
			// Classify task
			const classification = await taskClassifier.classify({
				prompt,
				repositoryPath: cwd,
			});

			spinner.stop(`Task type: ${pc.cyan(classification.type)}`);

			p.log.info(`Priority: ${pc.cyan(classification.priority)}`);
			p.log.info(`Complexity: ${pc.cyan(classification.complexity)}`);

			// Generate specification
			spinner.start('Generating specification...');

			const result = await specGenerator.generate({
				brief: prompt,
				taskType: classification.type,
				classification,
			});

			spinner.stop('Specification generated');

			// Display specification
			process.stdout.write('\n');
			p.log.info(pc.bold('Specification:'));
			process.stdout.write('\n');

			for (const section of result.specification.sections) {
				process.stdout.write(`${pc.cyan(section.title)}\n`);
				process.stdout.write(`${pc.dim('─'.repeat(section.title.length))}\n`);
				process.stdout.write(`${section.content}\n\n`);
			}

			// Save to file if requested
			if (options.output) {
				const fs = await import('node:fs/promises');
				const content = result.specification.sections
					.map((s) => `${s.content}\n\n`)
					.join('');
				await fs.writeFile(options.output, content, 'utf-8');
				p.log.success(`Specification saved to ${pc.cyan(options.output)}`);
			}

			// Show required reviewers
			if (result.requiredReviews.length > 0) {
				p.note(
					result.requiredReviews.map((r) => `• ${r}`).join('\n'),
					'Required Reviews',
				);
			}
		} catch (error) {
			spinner.stop('Failed to generate specification');
			p.log.error(error instanceof Error ? error.message : 'Unknown error');
			process.exit(1);
		}
	});

export const decomposeCommand = new Command('decompose')
	.description('Decompose task into subtasks with dependencies')
	.argument('<prompt>', 'Task description or prompt')
	.option('--format <format>', 'Output format (text, json, mermaid)', 'text')
	.action(async (prompt: string, options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Decompose ')));

		// Initialize components
		const taskClassifier = createTaskClassifier();
		const taskDecomposer = createTaskDecomposer(taskClassifier);

		const spinner = p.spinner();
		spinner.start('Decomposing task...');

		try {
			// Decompose task
			const result = await taskDecomposer.decompose({
				prompt,
				repositoryPath: cwd,
			});

			spinner.stop('Task decomposed');

			const { executionPlan, checkpoints } = result;

			// Display based on format
			process.stdout.write('\n');

			if (options.format === 'json') {
				// JSON output
				process.stdout.write(JSON.stringify(result, null, 2));
				process.stdout.write('\n');
			} else if (options.format === 'mermaid') {
				// Mermaid diagram
				p.log.info(pc.bold('Mermaid Diagram:'));
				process.stdout.write('\n```mermaid\n');
				process.stdout.write('graph TD\n');

				for (const task of executionPlan.tasks) {
					const taskLabel = `${task.id}["${task.description}"]`;
					process.stdout.write(`  ${taskLabel}\n`);

					for (const dep of task.dependencies) {
						process.stdout.write(`  ${dep} --> ${task.id}\n`);
					}
				}

				process.stdout.write('```\n\n');
			} else {
				// Text output (default)
				p.log.info(pc.bold('Execution Plan:'));
				p.log.info(
					`${executionPlan.tasks.length} tasks in ${executionPlan.stages.length} stages`,
				);
				p.log.info(`Estimated duration: ${(executionPlan.estimatedDuration / 60).toFixed(1)} minutes`);
				p.log.info(
					`Parallelization factor: ${pc.cyan(executionPlan.parallelizationFactor.toFixed(2))}`,
				);

				process.stdout.write('\n');

				// Show stages
				for (const stage of executionPlan.stages) {
					process.stdout.write(
						`${pc.bold(pc.cyan(`Stage ${stage.stage}:`))} ${stage.tasks.length} task(s)\n`,
					);

					for (const taskId of stage.tasks) {
						const task = executionPlan.tasks.find((t) => t.id === taskId);
						if (task) {
							const deps =
								task.dependencies.length > 0
									? pc.dim(` [depends on: ${task.dependencies.join(', ')}]`)
									: '';
							process.stdout.write(`  • ${task.description}${deps}\n`);
						}
					}

					process.stdout.write('\n');
				}

				// Show checkpoints
				if (checkpoints.length > 0) {
					p.note(
						checkpoints
							.map(
								(c) => `• ${c.name} (stage ${c.stage}): ${c.validations.join(', ')}`,
							)
							.join('\n'),
						'Checkpoints',
					);
				}

				// Show critical path
				if (executionPlan.criticalPath.length > 0) {
					p.note(
						executionPlan.criticalPath
							.map((taskId) => {
								const task = executionPlan.tasks.find((t) => t.id === taskId);
								return `• ${task?.description ?? taskId}`;
							})
							.join('\n'),
						'Critical Path',
					);
				}
			}
		} catch (error) {
			spinner.stop('Failed to decompose task');
			p.log.error(error instanceof Error ? error.message : 'Unknown error');
			process.exit(1);
		}
	});

// Add checkpoints command to view/manage recovery points
export const checkpointsCommand = new Command('checkpoints')
	.description('Manage checkpoints and recovery points')
	.option('--list', 'List all checkpoints')
	.option('--task <taskId>', 'Filter by task ID')
	.action(async (options) => {
		p.intro(pc.bgCyan(pc.black(' ADO Checkpoints ')));

		// This would integrate with checkpoint manager
		// For now, just show placeholder
		p.log.info('Checkpoint management coming soon');

		if (options.list) {
			p.log.info('No checkpoints found');
		}
	});
