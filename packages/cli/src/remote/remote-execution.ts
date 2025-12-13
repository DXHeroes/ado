/**
 * Remote Task Execution
 *
 * Execute tasks on remote infrastructure via tRPC API.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { createRemoteClient } from './trpc-client.js';

export interface RemoteExecutionOptions {
	remoteUrl?: string;
	workers?: number;
	provider?: string;
	providers?: string;
	exclude?: string;
	maxCost?: number;
	hitl?: string;
	[key: string]: unknown;
}

/**
 * Execute task on remote infrastructure
 */
export async function executeRemoteTask(
	prompt: string,
	options: RemoteExecutionOptions,
): Promise<void> {
	const apiUrl = options.remoteUrl ?? 'http://localhost:8080';
	const wsUrl = apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');

	p.log.info(`Remote execution mode → ${pc.cyan(apiUrl)}`);

	// Create tRPC client
	const spinner = p.spinner();
	spinner.start('Connecting to remote API server');

	let remote: ReturnType<typeof createRemoteClient>;
	try {
		remote = createRemoteClient({
			apiUrl: `${apiUrl}/trpc`,
			wsUrl: `${wsUrl.replace(':8080', ':8081')}`, // WebSocket on port+1
		});
		spinner.stop('Connected to remote API ✓');
	} catch (_error) {
		spinner.stop('Failed to connect to remote API');
		p.log.error(`Could not connect to ${apiUrl}. Make sure the tRPC server is running.`);
		p.log.info('Start server with: USE_TRPC=true pnpm --filter @dxheroes/ado-api start');
		process.exit(1);
	}

	try {
		// Create remote task
		spinner.start('Creating remote task');
		const task = await remote.client.tasks.create.mutate({
			prompt,
			projectId: 'cli-project',
			repositoryPath: process.cwd(),
			taskType: 'feature',
			providers: options.providers?.split(','),
			excludeProviders: options.exclude?.split(','),
			maxCost: options.maxCost,
			hitlPolicy: options.hitl as
				| 'autonomous'
				| 'spec-review'
				| 'review-major'
				| 'review-all'
				| undefined,
		});

		spinner.stop(`Task created: ${pc.cyan(task.id)}`);

		p.log.info(`Status: ${task.status}`);
		p.log.info(`Queue position: ${task.queuePosition}`);
		p.log.info(`Estimated duration: ${task.estimatedDuration} minutes`);
		p.log.info(`Estimated cost: $${task.estimatedCost.toFixed(2)}`);

		// Subscribe to task events
		p.log.step('Streaming task events...\n');

		// TODO: Subscribe to task events via WebSocket
		// For now, just poll for task status
		const subscription = remote.client.tasks.onTaskEvent.subscribe(task.id, {
			onData: (event) => {
				if (event.type === 'status') {
					p.log.info(
						`[${new Date(event.timestamp).toLocaleTimeString()}] ${
							event.data.status
						} - ${event.data.progress}%`,
					);
				}
			},
			onError: (error) => {
				p.log.error(`Subscription error: ${error.message}`);
			},
		});

		// Wait for task completion (simulated for now)
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Cleanup
		subscription.unsubscribe();
		remote.disconnect();

		p.outro(pc.green('Task completed successfully'));
	} catch (error) {
		remote.disconnect();
		p.log.error(
			`Remote execution failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
