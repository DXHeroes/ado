/**
 * Worktree Manager - Manages Git worktree creation and cleanup for parallel execution.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AdoError } from '@dxheroes/ado-shared';

/**
 * Worktree configuration
 */
export interface WorktreeConfig {
	/** Base repository path */
	repositoryPath: string;

	/** Directory where worktrees will be created */
	worktreeRoot?: string;

	/** Branch to create worktree from */
	baseBranch?: string;
}

/**
 * Worktree information
 */
export interface WorktreeInfo {
	/** Unique ID for this worktree */
	id: string;

	/** Path to the worktree directory */
	path: string;

	/** Branch name */
	branch: string;

	/** Creation timestamp */
	createdAt: Date;
}

/**
 * Git Worktree Manager
 */
export class WorktreeManager {
	private config: WorktreeConfig;
	private worktrees: Map<string, WorktreeInfo> = new Map();

	constructor(config: WorktreeConfig) {
		this.config = {
			...config,
			worktreeRoot: config.worktreeRoot ?? join(config.repositoryPath, '.ado', 'worktrees'),
			baseBranch: config.baseBranch ?? 'main',
		};
	}

	/**
	 * Create a new worktree for isolated execution
	 */
	async createWorktree(taskId: string): Promise<WorktreeInfo> {
		const worktreeId = this.generateWorktreeId(taskId);
		const { worktreeRoot, baseBranch } = this.config;
		if (!worktreeRoot || !baseBranch) {
			throw new Error('Worktree configuration is not properly initialized');
		}

		const worktreePath = join(worktreeRoot, worktreeId);
		const branchName = `ado/${worktreeId}`;

		// Ensure worktree root exists
		await mkdir(worktreeRoot, { recursive: true });

		try {
			// Check if repository is a git repo
			const isGitRepo = await this.isGitRepository(this.config.repositoryPath);
			if (!isGitRepo) {
				throw new AdoError({
					code: 'NOT_GIT_REPOSITORY',
					message: `${this.config.repositoryPath} is not a git repository`,
					recoverable: false,
					remediation: 'Initialize a git repository or disable worktree isolation',
					cause: undefined,
				});
			}

			// Create git worktree
			await this.execGit(this.config.repositoryPath, [
				'worktree',
				'add',
				'-b',
				branchName,
				worktreePath,
				baseBranch,
			]);

			const info: WorktreeInfo = {
				id: worktreeId,
				path: worktreePath,
				branch: branchName,
				createdAt: new Date(),
			};

			this.worktrees.set(worktreeId, info);
			return info;
		} catch (error) {
			// Clean up on failure
			if (existsSync(worktreePath)) {
				await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
			}

			throw new AdoError({
				code: 'WORKTREE_CREATION_FAILED',
				message: `Failed to create worktree for task ${taskId}`,
				recoverable: false,
				remediation: 'Check git repository status and permissions',
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Remove a worktree and clean up
	 */
	async removeWorktree(worktreeId: string): Promise<void> {
		const info = this.worktrees.get(worktreeId);
		if (!info) {
			return;
		}

		try {
			// Remove git worktree
			await this.execGit(this.config.repositoryPath, ['worktree', 'remove', '--force', info.path]);

			// Delete branch
			await this.execGit(this.config.repositoryPath, ['branch', '-D', info.branch]).catch(() => {
				// Ignore errors if branch doesn't exist
			});

			this.worktrees.delete(worktreeId);
		} catch (error) {
			throw new AdoError({
				code: 'WORKTREE_REMOVAL_FAILED',
				message: `Failed to remove worktree ${worktreeId}`,
				recoverable: true,
				remediation: 'Manually remove the worktree using git worktree remove',
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	/**
	 * Get worktree information
	 */
	getWorktree(worktreeId: string): WorktreeInfo | undefined {
		return this.worktrees.get(worktreeId);
	}

	/**
	 * List all active worktrees
	 */
	listWorktrees(): WorktreeInfo[] {
		return Array.from(this.worktrees.values());
	}

	/**
	 * Clean up all worktrees
	 */
	async cleanupAll(): Promise<void> {
		const worktreeIds = Array.from(this.worktrees.keys());

		await Promise.allSettled(worktreeIds.map((id) => this.removeWorktree(id)));
	}

	/**
	 * Clean up old worktrees (older than specified age)
	 */
	async cleanupOld(maxAgeMs: number): Promise<void> {
		const now = Date.now();
		const oldWorktrees = this.listWorktrees().filter(
			(info) => now - info.createdAt.getTime() > maxAgeMs,
		);

		await Promise.allSettled(oldWorktrees.map((info) => this.removeWorktree(info.id)));
	}

	/**
	 * Check if a directory is a git repository
	 */
	private async isGitRepository(path: string): Promise<boolean> {
		try {
			await this.execGit(path, ['rev-parse', '--git-dir']);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Execute a git command
	 */
	private async execGit(cwd: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			const proc = spawn('git', args, {
				cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';

			proc.stdout?.on('data', (chunk) => {
				stdout += chunk.toString();
			});

			proc.stderr?.on('data', (chunk) => {
				stderr += chunk.toString();
			});

			proc.on('close', (code) => {
				if (code === 0) {
					resolve(stdout.trim());
				} else {
					reject(new Error(stderr || `Git command failed with code ${code}`));
				}
			});

			proc.on('error', reject);
		});
	}

	/**
	 * Generate a unique worktree ID
	 */
	private generateWorktreeId(taskId: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2, 6);
		return `${taskId}-${timestamp}-${random}`;
	}
}

/**
 * Create a new worktree manager
 */
export function createWorktreeManager(config: WorktreeConfig): WorktreeManager {
	return new WorktreeManager(config);
}
