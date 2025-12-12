# Git Worktree Manager Design

## Přehled

Architektonický design pro správu git worktrees - umožňuje paralelní provádění úkolů více agenty v izolovaných pracovních adresářích se sdílenou git historií.

## Proč Git Worktrees?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Parallel Agent Isolation Comparison                       │
└─────────────────────────────────────────────────────────────────────────────┘

                    Separate Clones    Stashing        Git Worktrees
                    ───────────────    ────────        ─────────────
Isolation           Excellent          Poor            Excellent
Disk Usage          High (N × repo)    Low             Low (shared .git)
Creation Time       Slow (git clone)   Fast            Fast (instant)
Git History         Duplicated         Shared          Shared
Parallel Work       Yes                No              Yes
Branch Conflicts    No                 Yes             No
Cleanup             Manual delete      Manual          git worktree remove

Real-world Example (Cursor Parallel Agents):
- 5 agents working simultaneously
- Separate clones: 5 × 2GB = 10GB disk, 5 × clone time
- Git worktrees: 2GB + (5 × ~10MB) = ~2.05GB disk, instant creation

Key Advantages:
- Each agent has isolated working directory and index
- Shared git object database (commits, blobs, trees)
- No merge conflicts during parallel work
- Fast creation/deletion (no network I/O)
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Git Worktree Architecture                                 │
└─────────────────────────────────────────────────────────────────────────────┘

project/
├── main/                                # Primary worktree
│   ├── .git/                            # Main git directory (shared)
│   │   ├── objects/                     # Shared by all worktrees
│   │   ├── refs/
│   │   ├── worktrees/                   # Worktree metadata
│   │   │   ├── agent-1-feature-auth/
│   │   │   ├── agent-2-feature-api/
│   │   │   └── agent-3-bugfix-123/
│   │   └── config
│   ├── src/
│   └── package.json
│
├── worktrees/                           # Parallel agent workspaces
│   ├── agent-1-feature-auth/
│   │   ├── .git                         # Symbolic link to main .git
│   │   ├── src/                         # Independent working tree
│   │   └── package.json                 # Branch: agent/ado/feature/1-auth
│   │
│   ├── agent-2-feature-api/
│   │   ├── .git
│   │   ├── src/
│   │   └── package.json                 # Branch: agent/ado/feature/2-api
│   │
│   └── agent-3-bugfix-123/
│       ├── .git
│       ├── src/
│       └── package.json                 # Branch: agent/ado/bugfix/3-auth-fix
│
└── orchestrator/                        # Coordination layer
    └── worktree-manager.ts

Flow:
1. Agent receives task
2. Orchestrator creates worktree: worktrees/agent-{id}-{task}/
3. Orchestrator creates branch: agent/ado/{type}/{id}-{description}
4. Agent works in isolated directory
5. Agent commits, pushes branch
6. Orchestrator merges to main
7. Orchestrator removes worktree
```

## Worktree Manager Implementation

```typescript
// packages/core/src/git/worktree-manager.ts
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface WorktreeConfig {
  repositoryPath: string; // /path/to/project/main
  worktreesPath: string; // /path/to/project/worktrees
  baseBranch: string; // main
}

export interface AgentWorktree {
  id: string; // agent-1-feature-auth
  path: string; // /path/to/project/worktrees/agent-1-feature-auth
  branch: string; // agent/ado/feature/1-auth
  baseBranch: string; // main
}

export class WorktreeManager {
  private config: WorktreeConfig;

  constructor(config: WorktreeConfig) {
    this.config = config;
  }

  /**
   * Create worktree for agent task
   */
  async create(
    agentId: string,
    taskId: string,
    taskType: 'feature' | 'bugfix' | 'refactor',
    description: string
  ): Promise<AgentWorktree> {
    // Generate names
    const worktreeId = `agent-${agentId}-${taskId}`;
    const branchName = this.generateBranchName(taskType, taskId, description);
    const worktreePath = path.join(this.config.worktreesPath, worktreeId);

    // Ensure worktrees directory exists
    await fs.mkdir(this.config.worktreesPath, { recursive: true });

    // Create branch from base
    this.exec(
      `git branch ${branchName} ${this.config.baseBranch}`,
      this.config.repositoryPath
    );

    // Create worktree
    this.exec(
      `git worktree add ${worktreePath} ${branchName}`,
      this.config.repositoryPath
    );

    console.log(
      `Created worktree: ${worktreeId} on branch ${branchName} at ${worktreePath}`
    );

    return {
      id: worktreeId,
      path: worktreePath,
      branch: branchName,
      baseBranch: this.config.baseBranch,
    };
  }

  /**
   * Remove worktree and branch
   */
  async remove(worktree: AgentWorktree, deleteBranch = false): Promise<void> {
    // Remove worktree
    this.exec(
      `git worktree remove ${worktree.path} --force`,
      this.config.repositoryPath
    );

    // Optionally delete branch (after merge)
    if (deleteBranch) {
      this.exec(
        `git branch -D ${worktree.branch}`,
        this.config.repositoryPath
      );
    }

    console.log(`Removed worktree: ${worktree.id}`);
  }

  /**
   * List all active worktrees
   */
  async list(): Promise<AgentWorktree[]> {
    const output = this.exec('git worktree list --porcelain', this.config.repositoryPath);

    const worktrees: AgentWorktree[] = [];
    const lines = output.split('\n');

    let current: Partial<AgentWorktree> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        current.path = line.substring(9);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(23); // remove 'refs/heads/'
      } else if (line === '') {
        if (current.path && current.path.includes('/worktrees/')) {
          worktrees.push({
            id: path.basename(current.path),
            path: current.path,
            branch: current.branch!,
            baseBranch: this.config.baseBranch,
          });
        }
        current = {};
      }
    }

    return worktrees;
  }

  /**
   * Commit changes in worktree
   */
  async commit(
    worktree: AgentWorktree,
    message: string,
    files?: string[]
  ): Promise<string> {
    // Stage files
    if (files && files.length > 0) {
      this.exec(`git add ${files.join(' ')}`, worktree.path);
    } else {
      this.exec('git add .', worktree.path);
    }

    // Commit
    this.exec(`git commit -m "${this.escapeMessage(message)}"`, worktree.path);

    // Get commit hash
    const hash = this.exec('git rev-parse HEAD', worktree.path).trim();

    console.log(`Committed in ${worktree.id}: ${hash.substring(0, 7)}`);
    return hash;
  }

  /**
   * Push worktree branch to remote
   */
  async push(worktree: AgentWorktree, force = false): Promise<void> {
    const forceFlag = force ? '--force' : '';
    this.exec(
      `git push origin ${worktree.branch} ${forceFlag}`,
      worktree.path
    );

    console.log(`Pushed ${worktree.branch} to origin`);
  }

  /**
   * Merge worktree branch to base branch
   */
  async merge(worktree: AgentWorktree, strategy: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<void> {
    // Switch to base branch in main worktree
    this.exec(`git checkout ${this.config.baseBranch}`, this.config.repositoryPath);

    // Pull latest
    this.exec(`git pull origin ${this.config.baseBranch}`, this.config.repositoryPath);

    // Merge based on strategy
    switch (strategy) {
      case 'merge':
        this.exec(`git merge ${worktree.branch} --no-ff`, this.config.repositoryPath);
        break;

      case 'squash':
        this.exec(`git merge ${worktree.branch} --squash`, this.config.repositoryPath);
        this.exec(`git commit -m "Merged ${worktree.branch}"`, this.config.repositoryPath);
        break;

      case 'rebase':
        this.exec(`git rebase ${worktree.branch}`, this.config.repositoryPath);
        break;
    }

    console.log(`Merged ${worktree.branch} into ${this.config.baseBranch}`);
  }

  /**
   * Sync worktree with base branch (rebase or merge)
   */
  async sync(worktree: AgentWorktree, method: 'rebase' | 'merge' = 'rebase'): Promise<void> {
    // Fetch latest from base
    this.exec(`git fetch origin ${this.config.baseBranch}`, worktree.path);

    if (method === 'rebase') {
      this.exec(`git rebase origin/${this.config.baseBranch}`, worktree.path);
    } else {
      this.exec(`git merge origin/${this.config.baseBranch}`, worktree.path);
    }

    console.log(`Synced ${worktree.id} with ${this.config.baseBranch}`);
  }

  /**
   * Check for merge conflicts
   */
  async hasConflicts(worktree: AgentWorktree): Promise<boolean> {
    try {
      // Dry-run merge
      this.exec(
        `git merge-tree $(git merge-base ${this.config.baseBranch} ${worktree.branch}) ${this.config.baseBranch} ${worktree.branch}`,
        this.config.repositoryPath
      );
      return false;
    } catch (error) {
      // merge-tree exits with error if conflicts exist
      return true;
    }
  }

  /**
   * Get diff between worktree and base
   */
  async getDiff(worktree: AgentWorktree): Promise<string> {
    return this.exec(
      `git diff ${this.config.baseBranch}...${worktree.branch}`,
      worktree.path
    );
  }

  /**
   * Cleanup stale worktrees
   */
  async prune(): Promise<void> {
    this.exec('git worktree prune', this.config.repositoryPath);
    console.log('Pruned stale worktrees');
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private generateBranchName(
    type: string,
    taskId: string,
    description: string
  ): string {
    // Sanitize description for branch name
    const sanitized = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    return `agent/ado/${type}/${taskId}-${sanitized}`;
  }

  private exec(command: string, cwd: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(
        `Git command failed: ${command}\n${error.stderr || error.message}`
      );
    }
  }

  private escapeMessage(message: string): string {
    return message.replace(/"/g, '\\"');
  }
}
```

## Orchestrator Integration

```typescript
// packages/core/src/orchestrator/parallel-executor.ts
export class ParallelExecutor {
  private worktreeManager: WorktreeManager;
  private activeWorktrees = new Map<string, AgentWorktree>();

  constructor(worktreeManager: WorktreeManager) {
    this.worktreeManager = worktreeManager;
  }

  /**
   * Execute multiple tasks in parallel using worktrees
   */
  async executeParallel(tasks: AgentTask[]): Promise<TaskResult[]> {
    // Create worktree for each task
    const worktrees = await Promise.all(
      tasks.map(task =>
        this.worktreeManager.create(
          task.agentId,
          task.id,
          task.type,
          task.description
        )
      )
    );

    // Track active worktrees
    worktrees.forEach((wt, i) => {
      this.activeWorktrees.set(tasks[i].id, wt);
    });

    try {
      // Execute tasks in parallel
      const results = await Promise.allSettled(
        tasks.map((task, i) =>
          this.executeInWorktree(task, worktrees[i])
        )
      );

      // Process results
      return results.map((result, i) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            taskId: tasks[i].id,
            status: 'failed',
            error: result.reason.message,
          };
        }
      });
    } finally {
      // Cleanup all worktrees
      await Promise.all(
        worktrees.map(wt =>
          this.worktreeManager.remove(wt, false).catch(err => {
            console.error(`Failed to remove worktree ${wt.id}:`, err);
          })
        )
      );

      worktrees.forEach((_, i) => {
        this.activeWorktrees.delete(tasks[i].id);
      });
    }
  }

  /**
   * Execute single task in worktree
   */
  private async executeInWorktree(
    task: AgentTask,
    worktree: AgentWorktree
  ): Promise<TaskResult> {
    // 1. Agent generates code in worktree
    const codeResult = await this.runAgent(task, worktree.path);

    // 2. Commit changes
    await this.worktreeManager.commit(
      worktree,
      `[ADO] ${task.description}\n\nTask ID: ${task.id}\nAgent: ${task.agentId}`
    );

    // 3. Push to remote
    await this.worktreeManager.push(worktree);

    // 4. Check for conflicts before merge
    const hasConflicts = await this.worktreeManager.hasConflicts(worktree);

    if (hasConflicts) {
      // Delegate to conflict resolution
      await this.resolveConflicts(worktree);
    }

    // 5. Create PR or merge directly
    if (task.requiresReview) {
      const prUrl = await this.createPullRequest(worktree, task);
      return {
        taskId: task.id,
        status: 'completed',
        pullRequestUrl: prUrl,
      };
    } else {
      await this.worktreeManager.merge(worktree, 'squash');
      return {
        taskId: task.id,
        status: 'merged',
      };
    }
  }

  /**
   * Resolve merge conflicts (delegate to AI-powered tools)
   */
  private async resolveConflicts(worktree: AgentWorktree): Promise<void> {
    // Sync with base to trigger conflicts
    try {
      await this.worktreeManager.sync(worktree, 'merge');
    } catch (error) {
      // Conflicts detected
      const diff = await this.worktreeManager.getDiff(worktree);

      // Use AI-powered conflict resolution (see merge-conflict-resolution.md)
      const resolved = await this.conflictResolver.resolve(diff);

      if (!resolved) {
        throw new Error(
          `Cannot auto-resolve conflicts in ${worktree.branch}, escalating to human`
        );
      }

      // Commit resolved conflicts
      await this.worktreeManager.commit(worktree, 'Resolved merge conflicts');
    }
  }
}
```

## Branch Naming Convention

```typescript
// packages/core/src/git/branch-naming.ts
export class BranchNamingStrategy {
  /**
   * Generate branch name following ADO convention
   *
   * Pattern: agent/ado/{type}/{id}-{description}
   *
   * Examples:
   * - agent/ado/feature/42-user-authentication
   * - agent/ado/bugfix/123-fix-null-pointer
   * - agent/ado/refactor/7-extract-service-layer
   */
  static generate(
    type: 'feature' | 'bugfix' | 'refactor' | 'docs',
    taskId: string | number,
    description: string
  ): string {
    const sanitized = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .substring(0, 50); // Limit length

    return `agent/ado/${type}/${taskId}-${sanitized}`;
  }

  /**
   * Parse branch name back to components
   */
  static parse(
    branchName: string
  ): { type: string; taskId: string; description: string } | null {
    const match = branchName.match(
      /^agent\/ado\/([^/]+)\/(\d+)-(.+)$/
    );

    if (!match) return null;

    return {
      type: match[1],
      taskId: match[2],
      description: match[3],
    };
  }

  /**
   * Validate branch name
   */
  static isValid(branchName: string): boolean {
    return /^agent\/ado\/(feature|bugfix|refactor|docs)\/\d+-[a-z0-9-]+$/.test(
      branchName
    );
  }
}
```

## Worktree Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Worktree Lifecycle                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. CREATE
   ┌─────────────────────────────────────────┐
   │ Task assigned to Agent #1               │
   │ taskId: 42                              │
   │ type: feature                           │
   │ description: "user authentication"      │
   └──────────────────┬──────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────┐
   │ WorktreeManager.create(...)             │
   │                                         │
   │ • Branch: agent/ado/feature/42-auth     │
   │ • Path: worktrees/agent-1-42/           │
   │ • Duration: ~50ms                       │
   └──────────────────┬──────────────────────┘
                      │
2. WORK               ▼
   ┌─────────────────────────────────────────┐
   │ Agent works in isolated directory       │
   │                                         │
   │ • Read/write files independently        │
   │ • Run quality gates                     │
   │ • No interference with other agents     │
   └──────────────────┬──────────────────────┘
                      │
3. COMMIT             ▼
   ┌─────────────────────────────────────────┐
   │ WorktreeManager.commit(...)             │
   │                                         │
   │ • Message: "[ADO] Implement auth"       │
   │ • Files: src/auth/*                     │
   └──────────────────┬──────────────────────┘
                      │
4. PUSH               ▼
   ┌─────────────────────────────────────────┐
   │ WorktreeManager.push(...)               │
   │                                         │
   │ • Remote: origin                        │
   │ • Branch: agent/ado/feature/42-auth     │
   └──────────────────┬──────────────────────┘
                      │
5. MERGE              ▼
   ┌─────────────────────────────────────────┐
   │ WorktreeManager.merge(...)              │
   │                                         │
   │ • Strategy: squash                      │
   │ • Target: main                          │
   │ • Conflict check: ✓ none                │
   └──────────────────┬──────────────────────┘
                      │
6. CLEANUP            ▼
   ┌─────────────────────────────────────────┐
   │ WorktreeManager.remove(...)             │
   │                                         │
   │ • Delete worktree directory             │
   │ • Delete branch (optional)              │
   │ • Duration: ~10ms                       │
   └─────────────────────────────────────────┘
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Worktree Performance Metrics                              │
└─────────────────────────────────────────────────────────────────────────────┘

Operation               Separate Clones    Git Worktrees    Speedup
────────────────────────────────────────────────────────────────────────────
Creation                5-30s (clone)      50-200ms         50-150x faster
Disk usage (5 agents)   10GB (5×2GB)       2.05GB           4.9x less
Deletion                100-500ms          10-50ms          10x faster
Git operations          Independent        Shared .git      Same
Parallel work           Yes                Yes              -

Example: 10 parallel tasks
─────────────────────────────────────────────────────────────────────────────
Setup:
  - Separate clones: 10 × 20s = 200s
  - Git worktrees: 10 × 100ms = 1s

Disk:
  - Separate clones: 10 × 2GB = 20GB
  - Git worktrees: 2GB + 100MB = 2.1GB

Cleanup:
  - Separate clones: 10 × 200ms = 2s
  - Git worktrees: 10 × 20ms = 200ms
```

## Error Handling

```typescript
// packages/core/src/git/worktree-errors.ts
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly worktreeId?: string,
    public readonly command?: string
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

export class WorktreeConflictError extends WorktreeError {
  constructor(
    worktreeId: string,
    public readonly conflictedFiles: string[]
  ) {
    super(
      `Merge conflicts in worktree ${worktreeId}: ${conflictedFiles.join(', ')}`,
      worktreeId
    );
    this.name = 'WorktreeConflictError';
  }
}

// Usage
try {
  await worktreeManager.merge(worktree);
} catch (error) {
  if (error instanceof WorktreeConflictError) {
    console.error(`Conflicts in files: ${error.conflictedFiles.join(', ')}`);
    // Escalate to conflict resolution
    await conflictResolver.resolve(worktree);
  } else if (error instanceof WorktreeError) {
    console.error(`Worktree operation failed: ${error.message}`);
    // Cleanup and retry
    await worktreeManager.remove(worktree);
  }
}
```

## Configuration

```yaml
# ado.config.yaml
git:
  worktrees:
    # Base directory for all worktrees
    path: ./worktrees

    # Automatic cleanup
    cleanup:
      on_completion: true
      on_failure: false  # Keep for debugging
      prune_stale: true

    # Branch naming
    branch_prefix: agent/ado
    branch_types:
      - feature
      - bugfix
      - refactor
      - docs

    # Merge strategy
    merge:
      strategy: squash  # or merge, rebase
      require_pr: true
      auto_delete_branch: true

    # Conflict handling
    conflicts:
      auto_resolve: true  # Use AI-powered resolution
      escalate_after_attempts: 3
```

---

## Souvislosti

- [Parallel Execution](../../03-architecture/03-component-diagrams/orchestrator-core.md)
- [Conflict Resolution](./merge-conflict-resolution.md)
- [Temporal Workflows](./temporal-workflows.md)
- [FR-004: Cloud Parallelization](../../02-requirements/01-functional/FR-004-cloud-parallelization.md)
