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
	AgentOutputEvent,
	AgentRateLimitEvent,
	AgentStartEvent,
	AgentTask,
	RateLimitDetector,
	RateLimitInfo,
	RateLimitStatus,
	RemainingCapacity,
	UsageRecord,
} from '@ado/shared';
import { BaseAdapter } from '../base.js';

/**
 * Claude Code specific options
 */
export interface ClaudeCodeOptions {
	model?: string;
	maxTurns?: number;
	permissionMode?: 'acceptEdits' | 'askAll' | 'bypassPermissions';
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
		const workingDir = this.config?.workingDirectory ?? process.cwd();
		const sessionId = task.sessionId ?? this.generateSessionId();

		// Emit start event
		yield this.createEvent<AgentStartEvent>('start', task.id, { sessionId });

		try {
			// Build command arguments
			const args = this.buildArgs(task, sessionId);

			// Spawn Claude CLI
			this.process = spawn('claude', args, {
				cwd: workingDir,
				stdio: ['pipe', 'pipe', 'pipe'],
				shell: true,
				env: {
					...process.env,
					// Ensure non-interactive mode
					CLAUDE_NO_INTERACTIVE: '1',
				},
			});

			const startTime = Date.now();
			let output = '';

			// Stream stdout
			if (this.process.stdout) {
				for await (const chunk of this.process.stdout) {
					const text = chunk.toString();
					output += text;

					yield this.createEvent<AgentOutputEvent>('output', task.id, {
						content: text,
						isPartial: true,
					});
				}
			}

			// Handle stderr
			let errorOutput = '';
			if (this.process.stderr) {
				for await (const chunk of this.process.stderr) {
					errorOutput += chunk.toString();
				}
			}

			// Wait for process to complete
			const exitCode = await new Promise<number>((resolve) => {
				this.process?.on('close', (code) => resolve(code ?? 1));
			});

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
					// Token counts would need to be parsed from Claude's output
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

		// Add prompt
		args.push(task.prompt);

		// Resume session if provided
		if (task.sessionId) {
			args.push('--resume', task.sessionId);
		}

		// Model selection
		const model = task.options?.model ?? this.config?.provider.defaultOptions?.model;
		if (model) {
			args.push('--model', model);
		}

		// Max turns
		const maxTurns = task.options?.maxTurns ?? this.config?.provider.defaultOptions?.maxTurns;
		if (maxTurns) {
			args.push('--max-turns', String(maxTurns));
		}

		// Permission mode
		const permissionMode =
			task.options?.permissionMode ?? this.config?.provider.defaultOptions?.permissionMode;
		if (permissionMode) {
			args.push(`--${permissionMode}`);
		}

		// Context file
		const contextFile = this.getContextFile();
		const contextPath = join(this.config?.workingDirectory ?? process.cwd(), contextFile);
		if (existsSync(contextPath)) {
			// Claude automatically reads CLAUDE.md from the working directory
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

	/**
	 * Generate a unique session ID
	 */
	private generateSessionId(): string {
		return `claude-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
