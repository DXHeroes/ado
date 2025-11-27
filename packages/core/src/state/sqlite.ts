/**
 * SQLite state persistence for ADO.
 * Stores sessions, tasks, usage records, and checkpoints.
 */

import type { TaskDefinition, TaskResult, TaskState, TaskStatus, UsageRecord } from '@dxheroes/ado-shared';
import Database from 'better-sqlite3';

/**
 * Session record in the database
 */
export interface SessionRecord {
	id: string;
	projectId: string;
	repositoryKey: string;
	providerId: string;
	createdAt: Date;
	updatedAt: Date;
	metadata?: Record<string, unknown> | undefined;
}

/**
 * Checkpoint record
 */
export interface CheckpointRecord {
	id: string;
	taskId: string;
	sessionId: string;
	createdAt: Date;
	state: string; // JSON serialized state
}

/**
 * State store interface
 */
export interface StateStore {
	// Session management
	createSession(session: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): SessionRecord;
	getSession(id: string): SessionRecord | null;
	getSessionsByProject(projectId: string, repositoryKey: string): SessionRecord[];
	updateSession(id: string, updates: Partial<SessionRecord>): void;

	// Task management
	createTask(task: TaskState): TaskState;
	getTask(id: string): TaskState | null;
	updateTask(id: string, updates: Partial<TaskState>): void;
	getTasksBySession(sessionId: string): TaskState[];
	getTasksByStatus(status: TaskStatus): TaskState[];

	// Usage tracking
	recordUsage(usage: UsageRecord): void;
	getUsageByProvider(providerId: string, since: Date): UsageRecord[];
	getTotalUsage(since: Date): { requests: number; tokens: number; cost: number };

	// Checkpoints
	createCheckpoint(checkpoint: Omit<CheckpointRecord, 'createdAt'>): CheckpointRecord;
	getCheckpoint(id: string): CheckpointRecord | null;
	getLatestCheckpoint(taskId: string): CheckpointRecord | null;

	// Lifecycle
	close(): void;
}

/**
 * Async state store interface for distributed databases
 */
export interface AsyncStateStore {
	// Session management
	createSession(session: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>;
	getSession(id: string): Promise<SessionRecord | null>;
	getSessionsByProject(projectId: string, repositoryKey: string): Promise<SessionRecord[]>;
	updateSession(id: string, updates: Partial<SessionRecord>): Promise<void>;

	// Task management
	createTask(task: TaskState): Promise<TaskState>;
	getTask(id: string): Promise<TaskState | null>;
	updateTask(id: string, updates: Partial<TaskState>): Promise<void>;
	getTasksBySession(sessionId: string): Promise<TaskState[]>;
	getTasksByStatus(status: TaskStatus): Promise<TaskState[]>;

	// Usage tracking
	recordUsage(usage: UsageRecord): Promise<void>;
	getUsageByProvider(providerId: string, since: Date): Promise<UsageRecord[]>;
	getTotalUsage(since: Date): Promise<{ requests: number; tokens: number; cost: number }>;

	// Checkpoints
	createCheckpoint(checkpoint: Omit<CheckpointRecord, 'createdAt'>): Promise<CheckpointRecord>;
	getCheckpoint(id: string): Promise<CheckpointRecord | null>;
	getLatestCheckpoint(taskId: string): Promise<CheckpointRecord | null>;

	// Lifecycle
	close(): Promise<void>;
}

/**
 * SQLite implementation of state store
 */
export class SqliteStateStore implements StateStore {
	private db: Database.Database;

	constructor(dbPath: string) {
		this.db = new Database(dbPath);
		this.db.pragma('journal_mode = WAL');
		this.initialize();
	}

	private initialize(): void {
		this.db.exec(`
			-- Sessions table
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL,
				repository_key TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				metadata TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_sessions_project 
				ON sessions(project_id, repository_key);

			-- Tasks table
			CREATE TABLE IF NOT EXISTS tasks (
				id TEXT PRIMARY KEY,
				session_id TEXT,
				status TEXT NOT NULL,
				definition TEXT NOT NULL,
				provider_id TEXT,
				started_at TEXT,
				completed_at TEXT,
				error TEXT,
				result TEXT,
				FOREIGN KEY (session_id) REFERENCES sessions(id)
			);

			CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
			CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

			-- Usage records table
			CREATE TABLE IF NOT EXISTS usage_records (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				provider_id TEXT NOT NULL,
				access_mode TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				request_count INTEGER NOT NULL,
				input_tokens INTEGER NOT NULL,
				output_tokens INTEGER NOT NULL,
				cost_usd REAL
			);

			CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_id);
			CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);

			-- Checkpoints table
			CREATE TABLE IF NOT EXISTS checkpoints (
				id TEXT PRIMARY KEY,
				task_id TEXT NOT NULL,
				session_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				state TEXT NOT NULL,
				FOREIGN KEY (task_id) REFERENCES tasks(id),
				FOREIGN KEY (session_id) REFERENCES sessions(id)
			);

			CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
		`);
	}

	createSession(session: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): SessionRecord {
		const now = new Date();
		const stmt = this.db.prepare(`
			INSERT INTO sessions (id, project_id, repository_key, provider_id, created_at, updated_at, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			session.id,
			session.projectId,
			session.repositoryKey,
			session.providerId,
			now.toISOString(),
			now.toISOString(),
			session.metadata ? JSON.stringify(session.metadata) : null,
		);

		return {
			...session,
			createdAt: now,
			updatedAt: now,
		};
	}

	getSession(id: string): SessionRecord | null {
		const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
		const row = stmt.get(id) as Record<string, unknown> | undefined;

		if (!row) return null;

		return this.rowToSession(row);
	}

	getSessionsByProject(projectId: string, repositoryKey: string): SessionRecord[] {
		const stmt = this.db.prepare(
			'SELECT * FROM sessions WHERE project_id = ? AND repository_key = ? ORDER BY updated_at DESC',
		);
		const rows = stmt.all(projectId, repositoryKey) as Record<string, unknown>[];

		return rows.map((row) => this.rowToSession(row));
	}

	updateSession(id: string, updates: Partial<SessionRecord>): void {
		const fields: string[] = [];
		const values: unknown[] = [];

		if (updates.providerId !== undefined) {
			fields.push('provider_id = ?');
			values.push(updates.providerId);
		}
		if (updates.metadata !== undefined) {
			fields.push('metadata = ?');
			values.push(JSON.stringify(updates.metadata));
		}

		fields.push('updated_at = ?');
		values.push(new Date().toISOString());
		values.push(id);

		const stmt = this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
		stmt.run(...values);
	}

	createTask(task: TaskState): TaskState {
		const stmt = this.db.prepare(`
			INSERT INTO tasks (id, session_id, status, definition, provider_id, started_at, completed_at, error, result)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			task.id,
			task.sessionId ?? null,
			task.status,
			JSON.stringify(task.definition),
			task.providerId ?? null,
			task.startedAt?.toISOString() ?? null,
			task.completedAt?.toISOString() ?? null,
			task.error ?? null,
			task.result ? JSON.stringify(task.result) : null,
		);

		return task;
	}

	getTask(id: string): TaskState | null {
		const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
		const row = stmt.get(id) as Record<string, unknown> | undefined;

		if (!row) return null;

		return this.rowToTask(row);
	}

	updateTask(id: string, updates: Partial<TaskState>): void {
		const fields: string[] = [];
		const values: unknown[] = [];

		if (updates.status !== undefined) {
			fields.push('status = ?');
			values.push(updates.status);
		}
		if (updates.providerId !== undefined) {
			fields.push('provider_id = ?');
			values.push(updates.providerId);
		}
		if (updates.sessionId !== undefined) {
			fields.push('session_id = ?');
			values.push(updates.sessionId);
		}
		if (updates.startedAt !== undefined) {
			fields.push('started_at = ?');
			values.push(updates.startedAt.toISOString());
		}
		if (updates.completedAt !== undefined) {
			fields.push('completed_at = ?');
			values.push(updates.completedAt.toISOString());
		}
		if (updates.error !== undefined) {
			fields.push('error = ?');
			values.push(updates.error);
		}
		if (updates.result !== undefined) {
			fields.push('result = ?');
			values.push(JSON.stringify(updates.result));
		}

		if (fields.length === 0) return;

		values.push(id);
		const stmt = this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
		stmt.run(...values);
	}

	getTasksBySession(sessionId: string): TaskState[] {
		const stmt = this.db.prepare(
			'SELECT * FROM tasks WHERE session_id = ? ORDER BY started_at DESC',
		);
		const rows = stmt.all(sessionId) as Record<string, unknown>[];

		return rows.map((row) => this.rowToTask(row));
	}

	getTasksByStatus(status: TaskStatus): TaskState[] {
		const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY started_at DESC');
		const rows = stmt.all(status) as Record<string, unknown>[];

		return rows.map((row) => this.rowToTask(row));
	}

	recordUsage(usage: UsageRecord): void {
		const stmt = this.db.prepare(`
			INSERT INTO usage_records (provider_id, access_mode, timestamp, request_count, input_tokens, output_tokens, cost_usd)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			usage.providerId,
			usage.accessMode,
			usage.timestamp.toISOString(),
			usage.requestCount,
			usage.inputTokens,
			usage.outputTokens,
			usage.costUsd ?? null,
		);
	}

	getUsageByProvider(providerId: string, since: Date): UsageRecord[] {
		const stmt = this.db.prepare(
			'SELECT * FROM usage_records WHERE provider_id = ? AND timestamp >= ? ORDER BY timestamp DESC',
		);
		const rows = stmt.all(providerId, since.toISOString()) as Record<string, unknown>[];

		return rows.map((row) => this.rowToUsage(row));
	}

	getTotalUsage(since: Date): { requests: number; tokens: number; cost: number } {
		const stmt = this.db.prepare(`
			SELECT 
				SUM(request_count) as requests,
				SUM(input_tokens + output_tokens) as tokens,
				SUM(COALESCE(cost_usd, 0)) as cost
			FROM usage_records
			WHERE timestamp >= ?
		`);

		const row = stmt.get(since.toISOString()) as Record<string, unknown>;

		return {
			requests: (row.requests as number) ?? 0,
			tokens: (row.tokens as number) ?? 0,
			cost: (row.cost as number) ?? 0,
		};
	}

	createCheckpoint(checkpoint: Omit<CheckpointRecord, 'createdAt'>): CheckpointRecord {
		const now = new Date();
		const stmt = this.db.prepare(`
			INSERT INTO checkpoints (id, task_id, session_id, created_at, state)
			VALUES (?, ?, ?, ?, ?)
		`);

		stmt.run(
			checkpoint.id,
			checkpoint.taskId,
			checkpoint.sessionId,
			now.toISOString(),
			checkpoint.state,
		);

		return {
			...checkpoint,
			createdAt: now,
		};
	}

	getCheckpoint(id: string): CheckpointRecord | null {
		const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?');
		const row = stmt.get(id) as Record<string, unknown> | undefined;

		if (!row) return null;

		return this.rowToCheckpoint(row);
	}

	getLatestCheckpoint(taskId: string): CheckpointRecord | null {
		const stmt = this.db.prepare(
			'SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
		);
		const row = stmt.get(taskId) as Record<string, unknown> | undefined;

		if (!row) return null;

		return this.rowToCheckpoint(row);
	}

	close(): void {
		this.db.close();
	}

	private rowToSession(row: Record<string, unknown>): SessionRecord {
		return {
			id: row.id as string,
			projectId: row.project_id as string,
			repositoryKey: row.repository_key as string,
			providerId: row.provider_id as string,
			createdAt: new Date(row.created_at as string),
			updatedAt: new Date(row.updated_at as string),
			metadata: row.metadata
				? (JSON.parse(row.metadata as string) as Record<string, unknown>)
				: undefined,
		};
	}

	private rowToTask(row: Record<string, unknown>): TaskState {
		return {
			id: row.id as string,
			sessionId: row.session_id as string | undefined,
			status: row.status as TaskStatus,
			definition: JSON.parse(row.definition as string) as TaskDefinition,
			providerId: row.provider_id as string | undefined,
			startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
			completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
			error: row.error as string | undefined,
			result: row.result ? (JSON.parse(row.result as string) as TaskResult) : undefined,
		};
	}

	private rowToUsage(row: Record<string, unknown>): UsageRecord {
		return {
			providerId: row.provider_id as string,
			accessMode: row.access_mode as 'subscription' | 'api' | 'free',
			timestamp: new Date(row.timestamp as string),
			requestCount: row.request_count as number,
			inputTokens: row.input_tokens as number,
			outputTokens: row.output_tokens as number,
			costUsd: row.cost_usd as number | undefined,
		};
	}

	private rowToCheckpoint(row: Record<string, unknown>): CheckpointRecord {
		return {
			id: row.id as string,
			taskId: row.task_id as string,
			sessionId: row.session_id as string,
			createdAt: new Date(row.created_at as string),
			state: row.state as string,
		};
	}
}

/**
 * Create a new SQLite state store
 */
export function createStateStore(dbPath: string): StateStore {
	return new SqliteStateStore(dbPath);
}
