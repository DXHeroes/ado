/**
 * Codex CLI adapter.
 * Spawns the `codex` CLI in exec mode and streams output.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
	AgentCapabilities,
	AgentCompleteEvent,
	AgentErrorEvent,
	AgentEvent,
	AgentOutputEvent,
	AgentRateLimitEvent,
	AgentStartEvent,
	AgentTask,
	RateLimitDetector,
	RateLimitInfo,
	RateLimitStatus,
	RemainingCapacity,
	UsageRecord,
} from '@dxheroes/ado-shared';
import { BaseAdapter } from '../base.js';

/**
 * Codex CLI specific options
 */
export interface CodexCLIOptions {
	model?: string;
	maxSteps?: number;
}

/**
 * Codex CLI adapter implementation
 */
export class CodexCLIAdapter extends BaseAdapter {
	readonly id = 'codex-cli';

	readonly capabilities: AgentCapabilities = {
		codeGeneration: true,
		codeReview: false,
		refactoring: true,
		testing: true,
		documentation: false,
		debugging: true,
		languages: ['python', 'typescript', 'javascript', 'go', 'rust'],
		maxContextTokens: 192000,
		supportsStreaming: true,
		supportsMCP: true,
		supportsResume: true,
	};

	private process: ChildProcess | null = null;
	private rateLimitDetector: CodexRateLimitDetector;

	constructor() {
		super();
		this.rateLimitDetector = new CodexRateLimitDetector();
	}

	/**
	 * Check if Codex CLI is installed and authenticated
	 */
	async isAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			const proc = spawn('codex', ['--version'], {
				stdio: 'pipe',
				shell: true,
			});

			proc.on('error', () => resolve(false));
			proc.on('close', (code) => resolve(code === 0));

			// Timeout after 5 seconds
			setTimeout(() => {
				proc.kill();
				resolve(false);
			}, 5000);
		});
	}

	/**
	 * Execute a task using Codex CLI
	 */
	async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
		const workingDir = this.config?.workingDirectory ?? process.cwd();
		const sessionId = task.sessionId ?? this.generateSessionId();

		// Emit start event
		yield this.createEvent<AgentStartEvent>('start', task.id, { sessionId });

		try {
			// Build command arguments
			const args = this.buildArgs(task, sessionId);

			// Debug: log the command being executed
			const debugMode = process.env.ADO_DEBUG === '1';
			if (debugMode) {
				// biome-ignore lint/suspicious/noConsole: Debug logging
				console.error(
					`[DEBUG] Executing: codex ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
				);
			}

			// Spawn Codex CLI with piped stdio
			this.process = spawn('codex', args, {
				cwd: workingDir,
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: false,
				env: {
					...process.env,
					// Ensure non-interactive mode
					CODEX_NO_INTERACTIVE: '1',
				},
			});

			const proc = this.process;
			const startTime = Date.now();
			let output = '';
			let errorOutput = '';

			// Create a promise that resolves when all streams are done
			const exitPromise = new Promise<number>((resolve, reject) => {
				// Handle stdout
				if (proc.stdout) {
					proc.stdout.setEncoding('utf8');
					proc.stdout.on('data', (chunk: string) => {
						output += chunk;
						process.stdout.write(chunk);
					});
				}

				// Handle stderr
				if (proc.stderr) {
					proc.stderr.setEncoding('utf8');
					proc.stderr.on('data', (chunk: string) => {
						errorOutput += chunk;
						process.stderr.write(chunk);
					});
				}

				proc.on('close', (code) => resolve(code ?? 1));
				proc.on('error', (err) => reject(err));
			});

			const exitCode = await exitPromise.catch(() => 1);

			const duration = Date.now() - startTime;

			// Check for rate limit errors
			if (this.isRateLimitError(errorOutput)) {
				const rateLimitInfo = this.rateLimitDetector.parseRateLimitError(new Error(errorOutput));

				yield this.createEvent<AgentRateLimitEvent>('rate_limit', task.id, {
					reason: rateLimitInfo?.reason ?? 'Rate limit exceeded',
					resetsAt: rateLimitInfo?.resetsAt,
				});

				return;
			}

			// Yield output event
			if (output) {
				yield this.createEvent<AgentOutputEvent>('output', task.id, {
					content: output,
					isPartial: false,
				});
			}

			// Handle errors
			if (exitCode !== 0) {
				yield this.createEvent<AgentErrorEvent>('error', task.id, {
					error: new Error(errorOutput || `Process exited with code ${exitCode}`),
					recoverable: true,
				});

				return;
			}

			// Emit completion
			yield this.createEvent<AgentCompleteEvent>('complete', task.id, {
				result: {
					success: true,
					output,
					sessionId,
					duration,
				},
			});
		} catch (error) {
			yield this.createEvent<AgentErrorEvent>('error', task.id, {
				error: error instanceof Error ? error : new Error(String(error)),
				recoverable: false,
			});
		} finally {
			this.process = null;
		}
	}

	/**
	 * Interrupt current execution
	 */
	async interrupt(): Promise<void> {
		if (this.process) {
			this.process.kill('SIGINT');
			this.process = null;
		}
	}

	/**
	 * Get rate limit detector
	 */
	override getRateLimitDetector(): RateLimitDetector {
		return this.rateLimitDetector;
	}

	/**
	 * Get context file name
	 */
	getContextFile(): string {
		return this.config?.provider.contextFile ?? 'AGENTS.md';
	}

	/**
	 * Build CLI arguments
	 */
	private buildArgs(task: AgentTask, _sessionId: string): string[] {
		const args: string[] = ['exec'];

		// Add prompt
		args.push(task.prompt);

		// Model selection
		if (task.options?.model) {
			args.push('--model', task.options.model);
		}

		// Max steps
		const maxSteps = (task.options as CodexCLIOptions | undefined)?.maxSteps;
		if (maxSteps) {
			args.push('--max-steps', String(maxSteps));
		}

		// Resume support (Codex uses --last to continue from last session)
		if (task.sessionId) {
			args.push('--last');
		}

		// Context file
		const contextFile = this.getContextFile();
		const contextPath = join(this.config?.workingDirectory ?? process.cwd(), contextFile);
		if (existsSync(contextPath)) {
			// Codex automatically reads AGENTS.md from the working directory
		}

		return args;
	}

	/**
	 * Check if error indicates rate limiting
	 */
	private isRateLimitError(output: string): boolean {
		const lowerOutput = output.toLowerCase();
		return (
			lowerOutput.includes('rate limit') ||
			lowerOutput.includes('too many requests') ||
			lowerOutput.includes('quota exceeded') ||
			lowerOutput.includes('usage limit')
		);
	}
}

/**
 * Rate limit detector for Codex CLI
 */
class CodexRateLimitDetector implements RateLimitDetector {
	private usageRecords: UsageRecord[] = [];

	async getStatus(): Promise<RateLimitStatus> {
		const todayRecords = this.getRecordsSince(this.getStartOfDay());
		const totalRequests = todayRecords.reduce((sum, r) => sum + r.requestCount, 0);

		// Codex Pro approximate limits
		const dailyLimit = 200;

		if (totalRequests >= dailyLimit) {
			return {
				isLimited: true,
				reason: 'daily_limit',
				resetsAt: this.getEndOfDay(),
				remainingRequests: 0,
			};
		}

		return {
			isLimited: false,
			remainingRequests: dailyLimit - totalRequests,
		};
	}

	parseRateLimitError(error: Error): RateLimitInfo | null {
		const message = error.message.toLowerCase();

		if (
			message.includes('rate limit') ||
			message.includes('too many requests') ||
			message.includes('429')
		) {
			const retryMatch = message.match(/retry.+?(\d+)/i);
			const retryAfter = retryMatch ? Number.parseInt(retryMatch[1] ?? '0', 10) : undefined;

			return {
				reason: 'daily_limit',
				retryAfter,
				message: error.message,
				resetsAt: retryAfter ? new Date(Date.now() + retryAfter * 1000) : this.getEndOfDay(),
			};
		}

		return null;
	}

	async getRemainingCapacity(): Promise<RemainingCapacity> {
		const status = await this.getStatus();
		return {
			requests: status.remainingRequests,
			resetsAt: this.getEndOfDay(),
		};
	}

	async recordUsage(usage: UsageRecord): Promise<void> {
		this.usageRecords.push(usage);

		// Keep only last 7 days
		const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		this.usageRecords = this.usageRecords.filter((r) => r.timestamp > weekAgo);
	}

	private getRecordsSince(since: Date): UsageRecord[] {
		return this.usageRecords.filter((r) => r.timestamp >= since);
	}

	private getStartOfDay(): Date {
		const now = new Date();
		return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	}

	private getEndOfDay(): Date {
		const start = this.getStartOfDay();
		return new Date(start.getTime() + 24 * 60 * 60 * 1000);
	}
}

/**
 * Create a new Codex CLI adapter
 */
export function createCodexCLIAdapter(): CodexCLIAdapter {
	return new CodexCLIAdapter();
}
