/**
 * Tests for WorktreeManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorktreeManager, type WorktreeConfig } from '../worktree-manager.js';
import { AdoError } from '@dxheroes/ado-shared';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

// Mock child_process spawn
vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

// Mock fs functions
vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
	mkdir: vi.fn(),
	rm: vi.fn(),
}));

describe('WorktreeManager', () => {
	let config: WorktreeConfig;
	let manager: WorktreeManager;
	let mockSpawn: ReturnType<typeof vi.fn>;
	let mockExistsSync: ReturnType<typeof vi.fn>;
	let mockMkdir: ReturnType<typeof vi.fn>;
	let mockRm: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		config = {
			repositoryPath: '/test/repo',
			worktreeRoot: '/test/repo/.ado/worktrees',
			baseBranch: 'main',
		};

		mockSpawn = vi.mocked(childProcess.spawn);
		mockExistsSync = vi.mocked(fs.existsSync);
		mockMkdir = vi.mocked(fsPromises.mkdir);
		mockRm = vi.mocked(fsPromises.rm);

		// Reset all mocks
		mockSpawn.mockReset();
		mockExistsSync.mockReset();
		mockMkdir.mockReset();
		mockRm.mockReset();

		// Default mock implementations
		mockMkdir.mockResolvedValue(undefined);
		mockRm.mockResolvedValue(undefined);
		mockExistsSync.mockReturnValue(false);

		manager = new WorktreeManager(config);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * Helper to mock successful git command execution
	 */
	const mockGitSuccess = (output = '') => {
		const mockProc = {
			stdout: {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						callback(Buffer.from(output));
					}
				}),
			},
			stderr: {
				on: vi.fn(),
			},
			on: vi.fn((event, callback) => {
				if (event === 'close') {
					callback(0); // Exit code 0 = success
				}
			}),
		};

		mockSpawn.mockReturnValue(mockProc as any);
	};

	/**
	 * Helper to mock failed git command execution
	 */
	const mockGitFailure = (errorMessage = 'Git command failed', code = 1) => {
		const mockProc = {
			stdout: {
				on: vi.fn(),
			},
			stderr: {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						callback(Buffer.from(errorMessage));
					}
				}),
			},
			on: vi.fn((event, callback) => {
				if (event === 'close') {
					callback(code);
				}
			}),
		};

		mockSpawn.mockReturnValue(mockProc as any);
	};

	describe('constructor', () => {
		it('should initialize with provided config', () => {
			expect(manager).toBeInstanceOf(WorktreeManager);
		});

		it('should use default worktreeRoot if not provided', () => {
			const managerWithDefaults = new WorktreeManager({
				repositoryPath: '/test/repo',
			});

			expect(managerWithDefaults).toBeInstanceOf(WorktreeManager);
		});

		it('should use default baseBranch if not provided', () => {
			const managerWithDefaults = new WorktreeManager({
				repositoryPath: '/test/repo',
			});

			expect(managerWithDefaults).toBeInstanceOf(WorktreeManager);
		});
	});

	describe('createWorktree', () => {
		it('should create a new worktree successfully', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			expect(info.id).toMatch(/^task-1-\d+-[a-z0-9]+$/);
			expect(info.path).toContain('.ado/worktrees');
			expect(info.branch).toMatch(/^ado\/task-1-\d+-[a-z0-9]+$/);
			expect(info.createdAt).toBeInstanceOf(Date);
			expect(info.agentId).toBeUndefined();

			// Verify mkdir was called to create worktree root
			expect(mockMkdir).toHaveBeenCalledWith(
				config.worktreeRoot,
				{ recursive: true }
			);

			// Verify git commands were called
			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['rev-parse', '--git-dir']),
				expect.objectContaining({ cwd: config.repositoryPath })
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['worktree', 'add', '-b']),
				expect.objectContaining({ cwd: config.repositoryPath })
			);
		});

		it('should throw error if repository is not a git repo', async () => {
			// First call (isGitRepository check) fails
			mockGitFailure('Not a git repository', 128);

			const error = await manager.createWorktree('task-1').catch((e) => e);

			expect(error).toBeInstanceOf(AdoError);
			expect(error.code).toBe('WORKTREE_CREATION_FAILED');
			// The cause should be the NOT_GIT_REPOSITORY error
			expect(error.cause).toBeInstanceOf(AdoError);
			expect(error.cause?.code).toBe('NOT_GIT_REPOSITORY');
		});

		it('should throw error if worktree creation fails', async () => {
			// First call succeeds (isGitRepository), second fails (worktree add)
			let callCount = 0;
			mockSpawn.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// isGitRepository check succeeds
					return {
						stdout: { on: vi.fn() },
						stderr: { on: vi.fn() },
						on: vi.fn((event, callback) => {
							if (event === 'close') callback(0);
						}),
					} as any;
				}
				// worktree add fails
				return {
					stdout: { on: vi.fn() },
					stderr: {
						on: vi.fn((event, callback) => {
							if (event === 'data') callback(Buffer.from('Worktree creation failed'));
						}),
					},
					on: vi.fn((event, callback) => {
						if (event === 'close') callback(1);
					}),
				} as any;
			});

			await expect(manager.createWorktree('task-1')).rejects.toThrow(AdoError);
			await expect(manager.createWorktree('task-1')).rejects.toThrow(
				'Failed to create worktree'
			);
		});

		it('should clean up worktree directory on failure', async () => {
			mockExistsSync.mockReturnValue(true);

			// First call succeeds (isGitRepository), second fails (worktree add)
			let callCount = 0;
			mockSpawn.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						stdout: { on: vi.fn() },
						stderr: { on: vi.fn() },
						on: vi.fn((event, callback) => {
							if (event === 'close') callback(0);
						}),
					} as any;
				}
				return {
					stdout: { on: vi.fn() },
					stderr: {
						on: vi.fn((event, callback) => {
							if (event === 'data') callback(Buffer.from('Failed'));
						}),
					},
					on: vi.fn((event, callback) => {
						if (event === 'close') callback(1);
					}),
				} as any;
			});

			await expect(manager.createWorktree('task-1')).rejects.toThrow();

			// Verify cleanup was attempted
			expect(mockRm).toHaveBeenCalledWith(
				expect.stringContaining('.ado/worktrees'),
				{ recursive: true, force: true }
			);
		});

		it('should track created worktrees', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');
			const retrieved = manager.getWorktree(info.id);

			expect(retrieved).toEqual(info);
		});
	});

	describe('removeWorktree', () => {
		it('should remove an existing worktree', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			// Reset spawn mock for removal
			mockGitSuccess();

			await manager.removeWorktree(info.id);

			expect(manager.getWorktree(info.id)).toBeUndefined();

			// Verify git worktree remove and branch deletion
			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['worktree', 'remove', '--force', info.path]),
				expect.anything()
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['branch', '-D', info.branch]),
				expect.anything()
			);
		});

		it('should not throw if worktree does not exist', async () => {
			await expect(manager.removeWorktree('non-existent')).resolves.toBeUndefined();
		});

		it('should throw AdoError if removal fails', async () => {
			mockGitSuccess();
			const info = await manager.createWorktree('task-1');

			// Mock removal failure
			mockGitFailure('Failed to remove worktree');

			await expect(manager.removeWorktree(info.id)).rejects.toThrow(AdoError);
			await expect(manager.removeWorktree(info.id)).rejects.toThrow(
				'Failed to remove worktree'
			);
		});

		it('should ignore errors when deleting branch', async () => {
			mockGitSuccess();
			const info = await manager.createWorktree('task-1');

			// First call succeeds (remove worktree), second fails (delete branch)
			let callCount = 0;
			mockSpawn.mockImplementation((cmd, args) => {
				callCount++;
				// worktree remove succeeds
				if (args?.includes('remove')) {
					return {
						stdout: { on: vi.fn() },
						stderr: { on: vi.fn() },
						on: vi.fn((event, callback) => {
							if (event === 'close') callback(0);
						}),
					} as any;
				}
				// branch delete fails (but should be ignored)
				return {
					stdout: { on: vi.fn() },
					stderr: {
						on: vi.fn((event, callback) => {
							if (event === 'data') callback(Buffer.from('Branch not found'));
						}),
					},
					on: vi.fn((event, callback) => {
						if (event === 'close') callback(1);
					}),
				} as any;
			});

			// Should not throw despite branch deletion failure
			await expect(manager.removeWorktree(info.id)).resolves.toBeUndefined();
		});
	});

	describe('getWorktree', () => {
		it('should return worktree info if exists', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');
			const retrieved = manager.getWorktree(info.id);

			expect(retrieved).toEqual(info);
		});

		it('should return undefined if worktree does not exist', () => {
			const retrieved = manager.getWorktree('non-existent');

			expect(retrieved).toBeUndefined();
		});
	});

	describe('listWorktrees', () => {
		it('should return empty array when no worktrees exist', () => {
			const list = manager.listWorktrees();

			expect(list).toEqual([]);
		});

		it('should return all active worktrees', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');
			const info2 = await manager.createWorktree('task-2');

			const list = manager.listWorktrees();

			expect(list).toHaveLength(2);
			expect(list).toContainEqual(info1);
			expect(list).toContainEqual(info2);
		});
	});

	describe('cleanupAll', () => {
		it('should remove all worktrees', async () => {
			mockGitSuccess();

			await manager.createWorktree('task-1');
			await manager.createWorktree('task-2');

			expect(manager.listWorktrees()).toHaveLength(2);

			await manager.cleanupAll();

			expect(manager.listWorktrees()).toHaveLength(0);
		});

		it('should handle errors gracefully during cleanup', async () => {
			mockGitSuccess();

			await manager.createWorktree('task-1');
			await manager.createWorktree('task-2');

			// Mock removal failure for the second worktree
			mockGitFailure('Removal failed');

			// Should not throw even if some removals fail
			await expect(manager.cleanupAll()).resolves.toBeUndefined();
		});
	});

	describe('cleanupOld', () => {
		it('should remove worktrees older than specified age', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');

			// Mock old creation time
			info1.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

			const info2 = await manager.createWorktree('task-2');
			// info2 is recent

			const maxAgeMs = 60 * 60 * 1000; // 1 hour

			await manager.cleanupOld(maxAgeMs);

			// Only the old worktree should be removed
			expect(manager.getWorktree(info1.id)).toBeUndefined();
			expect(manager.getWorktree(info2.id)).toBeDefined();
		});

		it('should not remove recent worktrees', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');
			const info2 = await manager.createWorktree('task-2');

			const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

			await manager.cleanupOld(maxAgeMs);

			// All worktrees should still exist
			expect(manager.listWorktrees()).toHaveLength(2);
		});
	});

	describe('assignToAgent', () => {
		it('should assign worktree to agent', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');
			manager.assignToAgent(info.id, 'agent-1');

			const retrieved = manager.getWorktree(info.id);

			expect(retrieved?.agentId).toBe('agent-1');
		});

		it('should throw error if worktree does not exist', () => {
			expect(() => manager.assignToAgent('non-existent', 'agent-1')).toThrow(
				'Worktree not found'
			);
		});
	});

	describe('releaseFromAgent', () => {
		it('should release worktree from agent', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');
			manager.assignToAgent(info.id, 'agent-1');

			expect(manager.getWorktree(info.id)?.agentId).toBe('agent-1');

			manager.releaseFromAgent(info.id);

			expect(manager.getWorktree(info.id)?.agentId).toBeUndefined();
		});

		it('should throw error if worktree does not exist', () => {
			expect(() => manager.releaseFromAgent('non-existent')).toThrow(
				'Worktree not found'
			);
		});
	});

	describe('getWorktreeByAgent', () => {
		it('should return worktree assigned to agent', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');
			manager.assignToAgent(info.id, 'agent-1');

			const retrieved = manager.getWorktreeByAgent('agent-1');

			expect(retrieved).toEqual(info);
		});

		it('should return undefined if no worktree assigned to agent', () => {
			const retrieved = manager.getWorktreeByAgent('agent-1');

			expect(retrieved).toBeUndefined();
		});
	});

	describe('getAvailableWorktree', () => {
		it('should return worktree not assigned to any agent', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');
			await manager.createWorktree('task-2');

			manager.assignToAgent(info1.id, 'agent-1');

			const available = manager.getAvailableWorktree();

			expect(available).toBeDefined();
			expect(available?.agentId).toBeUndefined();
		});

		it('should return undefined if all worktrees are assigned', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');
			const info2 = await manager.createWorktree('task-2');

			manager.assignToAgent(info1.id, 'agent-1');
			manager.assignToAgent(info2.id, 'agent-2');

			const available = manager.getAvailableWorktree();

			expect(available).toBeUndefined();
		});
	});

	describe('mergeWorktree', () => {
		it('should merge worktree back to base branch', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			await manager.mergeWorktree(info.id);

			// Verify git checkout and merge commands
			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['checkout', 'main']),
				expect.anything()
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['merge', info.branch]),
				expect.anything()
			);
		});

		it('should merge with squash option', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			await manager.mergeWorktree(info.id, { squash: true });

			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['merge', '--squash', info.branch]),
				expect.anything()
			);
		});

		it('should merge with commit message', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			await manager.mergeWorktree(info.id, { message: 'Merge task-1' });

			expect(mockSpawn).toHaveBeenCalledWith(
				'git',
				expect.arrayContaining(['merge', '-m', 'Merge task-1', info.branch]),
				expect.anything()
			);
		});

		it('should throw error if worktree does not exist', async () => {
			await expect(manager.mergeWorktree('non-existent')).rejects.toThrow(
				'Worktree not found'
			);
		});

		it('should throw AdoError if merge fails', async () => {
			mockGitSuccess();

			const info = await manager.createWorktree('task-1');

			// Mock merge failure
			let callCount = 0;
			mockSpawn.mockImplementation((cmd, args) => {
				callCount++;
				// checkout succeeds
				if (args?.includes('checkout')) {
					return {
						stdout: { on: vi.fn() },
						stderr: { on: vi.fn() },
						on: vi.fn((event, callback) => {
							if (event === 'close') callback(0);
						}),
					} as any;
				}
				// merge fails
				return {
					stdout: { on: vi.fn() },
					stderr: {
						on: vi.fn((event, callback) => {
							if (event === 'data') callback(Buffer.from('Merge conflict'));
						}),
					},
					on: vi.fn((event, callback) => {
						if (event === 'close') callback(1);
					}),
				} as any;
			});

			await expect(manager.mergeWorktree(info.id)).rejects.toThrow(AdoError);
			await expect(manager.mergeWorktree(info.id)).rejects.toThrow(
				'Failed to merge worktree'
			);
		});
	});

	describe('generateWorktreeId', () => {
		it('should generate unique IDs for different tasks', async () => {
			mockGitSuccess();

			const info1 = await manager.createWorktree('task-1');
			const info2 = await manager.createWorktree('task-1');

			expect(info1.id).not.toBe(info2.id);
			expect(info1.id).toMatch(/^task-1-\d+-[a-z0-9]+$/);
			expect(info2.id).toMatch(/^task-1-\d+-[a-z0-9]+$/);
		});
	});
});
