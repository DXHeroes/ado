/**
 * Claude Code CLI adapter.
 * Spawns the `claude` CLI in headless mode and streams output.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
	AgentCapabilities,
	AgentCompleteEvent,
	AgentErrorEvent,
	AgentEvent,
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
 * Claude Code specific options
 */
export interface ClaudeCodeOptions {
	model?: string;
	maxTurns?: number;
	permissionMode?: 'acceptEdits' | 'bypassPermissions' | 'default' | 'plan';
	systemPrompt?: string;
}

/**
 * Claude Code adapter implementation
 */
export class ClaudeCodeAdapter extends BaseAdapter {
	readonly id = 'claude-code';

	readonly capabilities: AgentCapabilities = {
		codeGeneration: true,
		codeReview: true,
		refactoring: true,
		testing: true,
		documentation: true,
		debugging: true,
		languages: ['typescript', 'python', 'go', 'rust', 'java', 'javascript', 'c', 'cpp'],
		maxContextTokens: 200000,
		supportsStreaming: true,
		supportsMCP: true,
		supportsResume: true,
	};

	private process: ChildProcess | null = null;
	private rateLimitDetector: ClaudeRateLimitDetector;

	constructor() {
		super();
		this.rateLimitDetector = new ClaudeRateLimitDetector();
	}

	/**
	 * Check if Claude CLI is installed and authenticated
	 */
	async isAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			const proc = spawn('claude', ['--version'], {
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
	 * Execute a task using Claude CLI
	 */
	async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
		// Wrap execution with tracing
		yield* this.executeWithTracing(task, this.executeInternal.bind(this));
	}

	/**
	 * Internal execution method (called by executeWithTracing)
	 */
	private async *executeInternal(
		task: AgentTask,
		span: import('@opentelemetry/api').Span,
	): AsyncIterable<AgentEvent> {
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
					`[DEBUG] Executing: claude ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
				);
			}

			// Spawn Claude CLI with inherited stdio for direct terminal output
			// Using 'inherit' passes output directly to terminal in real-time
			// shell: false to avoid argument quoting issues with special characters
			this.process = spawn('claude', args, {
				cwd: workingDir,
				stdio: ['ignore', 'inherit', 'inherit'], // stdin ignored, stdout/stderr inherited
				shell: false, // Don't use shell to avoid argument quoting issues
				env: {
					...process.env,
					// Ensure non-interactive mode
					CLAUDE_NO_INTERACTIVE: '1',
				},
			});

			const proc = this.process;
			const startTime = Date.now();

			// Wait for process to complete
			const exitCode = await new Promise<number>((resolve, reject) => {
				proc.on('close', (code) => resolve(code ?? 1));
				proc.on('error', (err) => reject(err));
			}).catch(() => 1);

			const duration = Date.now() - startTime;

			// With inherited stdio we can't capture output directly
			// but the user sees it in real-time in the terminal

			// Handle errors based on exit code
			if (exitCode !== 0) {
				yield this.createEvent<AgentErrorEvent>('error', task.id, {
					error: new Error(`Claude exited with code ${exitCode}`),
					recoverable: exitCode === 130, // SIGINT is recoverable
				});

				return;
			}

			// Record execution metrics in span
			this.recordExecutionMetrics(span, {
				duration,
			});

			// Emit completion
			yield this.createEvent<AgentCompleteEvent>('complete', task.id, {
				result: {
					success: true,
					output: '[Output shown in terminal]', // Can't capture with inherited stdio
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
		return this.config?.provider.contextFile ?? 'CLAUDE.md';
	}

	/**
	 * Build CLI arguments
	 */
	private buildArgs(task: AgentTask, _sessionId: string): string[] {
		const args: string[] = [];

		// Headless/print mode
		args.push('-p');

		// Resume support - if task has a sessionId and we're resuming
		// Claude CLI uses --resume to continue an existing session
		// The task.sessionId should be the Claude CLI's conversation ID from previous execution
		if (task.sessionId && task.options?.resume) {
			args.push('--resume', task.sessionId);
		}

		// Add prompt
		args.push(task.prompt);

		// Model selection - ONLY if explicitly specified by user (not from config defaults)
		// Let Claude use its default model otherwise
		if (task.options?.model) {
			args.push('--model', task.options.model);
		}

		// Max turns - only if explicitly set
		if (task.options?.maxTurns) {
			args.push('--max-turns', String(task.options.maxTurns));
		}

		// Permission mode (acceptEdits, bypassPermissions, default, plan)
		const permissionMode = task.options?.permissionMode;
		if (permissionMode) {
			args.push('--permission-mode', permissionMode);
		}

		// Context file
		const contextFile = this.getContextFile();
		const contextPath = join(this.config?.workingDirectory ?? process.cwd(), contextFile);
		if (existsSync(contextPath)) {
			// Claude automatically reads CLAUDE.md from the working directory
		}

		return args;
	}
}

/**
 * Rate limit detector for Claude Code
 */
class ClaudeRateLimitDetector implements RateLimitDetector {
	private usageRecords: UsageRecord[] = [];

	async getStatus(): Promise<RateLimitStatus> {
		// In a real implementation, this would check against known limits
		// For now, we track based on recorded usage
		const todayRecords = this.getRecordsSince(this.getStartOfDay());
		const totalRequests = todayRecords.reduce((sum, r) => sum + r.requestCount, 0);

		// Claude MAX approximate limits
		const dailyLimit = 500;

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
			// Try to extract retry-after
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
 * Create a new Claude Code adapter
 */
export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
	return new ClaudeCodeAdapter();
}
