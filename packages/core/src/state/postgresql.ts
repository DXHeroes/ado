/**
 * PostgreSQL state persistence for ADO.
 * Distributed state store for Kubernetes deployments.
 * Stores sessions, tasks, usage records, and checkpoints.
 */

import type {
	TaskDefinition,
	TaskResult,
	TaskState,
	TaskStatus,
	UsageRecord,
} from '@dxheroes/ado-shared';
import { Pool, type PoolConfig } from 'pg';
import type { AsyncStateStore, CheckpointRecord, SessionRecord } from './sqlite.js';

/**
 * PostgreSQL implementation of state store
 * Thread-safe and optimized for distributed deployments
 */
export class PostgresqlStateStore implements AsyncStateStore {
	private pool: Pool;

	constructor(connectionString: string, config?: Partial<PoolConfig>) {
		this.pool = new Pool({
			connectionString,
			max: config?.max ?? 20,
			idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
			connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 2000,
			...config,
		});

		// Initialize schema on startup
		this.initialize().catch((err) => {
			throw err;
		});
	}

	private async initialize(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query(`
				-- Sessions table
				CREATE TABLE IF NOT EXISTS sessions (
					id TEXT PRIMARY KEY,
					project_id TEXT NOT NULL,
					repository_key TEXT NOT NULL,
					provider_id TEXT NOT NULL,
					created_at TIMESTAMPTZ NOT NULL,
					updated_at TIMESTAMPTZ NOT NULL,
					metadata JSONB
				);

				CREATE INDEX IF NOT EXISTS idx_sessions_project
					ON sessions(project_id, repository_key);
				CREATE INDEX IF NOT EXISTS idx_sessions_updated
					ON sessions(updated_at DESC);

				-- Tasks table
				CREATE TABLE IF NOT EXISTS tasks (
					id TEXT PRIMARY KEY,
					session_id TEXT,
					status TEXT NOT NULL,
					definition JSONB NOT NULL,
					provider_id TEXT,
					started_at TIMESTAMPTZ,
					completed_at TIMESTAMPTZ,
					error TEXT,
					result JSONB,
					FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
				CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
				CREATE INDEX IF NOT EXISTS idx_tasks_started ON tasks(started_at DESC);

				-- Usage records table
				CREATE TABLE IF NOT EXISTS usage_records (
					id SERIAL PRIMARY KEY,
					provider_id TEXT NOT NULL,
					access_mode TEXT NOT NULL,
					timestamp TIMESTAMPTZ NOT NULL,
					request_count INTEGER NOT NULL,
					input_tokens INTEGER NOT NULL,
					output_tokens INTEGER NOT NULL,
					cost_usd DECIMAL(10, 6)
				);

				CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_id);
				CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp DESC);
				CREATE INDEX IF NOT EXISTS idx_usage_provider_timestamp
					ON usage_records(provider_id, timestamp DESC);

				-- Checkpoints table
				CREATE TABLE IF NOT EXISTS checkpoints (
					id TEXT PRIMARY KEY,
					task_id TEXT NOT NULL,
					session_id TEXT NOT NULL,
					created_at TIMESTAMPTZ NOT NULL,
					state TEXT NOT NULL,
					FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
					FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id, created_at DESC);
			`);
		} finally {
			client.release();
		}
	}

	async createSession(
		session: Omit<SessionRecord, 'createdAt' | 'updatedAt'>,
	): Promise<SessionRecord> {
		const now = new Date();
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				`
				INSERT INTO sessions (id, project_id, repository_key, provider_id, created_at, updated_at, metadata)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING *
			`,
				[
					session.id,
					session.projectId,
					session.repositoryKey,
					session.providerId,
					now,
					now,
					session.metadata ? JSON.stringify(session.metadata) : null,
				],
			);

			return this.rowToSession(result.rows[0]);
		} finally {
			client.release();
		}
	}

	async getSession(id: string): Promise<SessionRecord | null> {
		const client = await this.pool.connect();
		try {
			const result = await client.query('SELECT * FROM sessions WHERE id = $1', [id]);

			if (result.rows.length === 0) return null;
			return this.rowToSession(result.rows[0]);
		} finally {
			client.release();
		}
	}

	async getSessionsByProject(projectId: string, repositoryKey: string): Promise<SessionRecord[]> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				'SELECT * FROM sessions WHERE project_id = $1 AND repository_key = $2 ORDER BY updated_at DESC',
				[projectId, repositoryKey],
			);

			return result.rows.map((row) => this.rowToSession(row));
		} finally {
			client.release();
		}
	}

	async updateSession(id: string, updates: Partial<SessionRecord>): Promise<void> {
		const client = await this.pool.connect();
		try {
			const fields: string[] = [];
			const values: unknown[] = [];
			let paramIndex = 1;

			if (updates.providerId !== undefined) {
				fields.push(`provider_id = $${paramIndex++}`);
				values.push(updates.providerId);
			}
			if (updates.metadata !== undefined) {
				fields.push(`metadata = $${paramIndex++}`);
				values.push(JSON.stringify(updates.metadata));
			}

			fields.push(`updated_at = $${paramIndex++}`);
			values.push(new Date());
			values.push(id);

			await client.query(
				`UPDATE sessions SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
				values,
			);
		} finally {
			client.release();
		}
	}

	async createTask(task: TaskState): Promise<TaskState> {
		const client = await this.pool.connect();
		try {
			await client.query(
				`
				INSERT INTO tasks (id, session_id, status, definition, provider_id, started_at, completed_at, error, result)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			`,
				[
					task.id,
					task.sessionId ?? null,
					task.status,
					JSON.stringify(task.definition),
					task.providerId ?? null,
					task.startedAt ?? null,
					task.completedAt ?? null,
					task.error ?? null,
					task.result ? JSON.stringify(task.result) : null,
				],
			);

			return task;
		} finally {
			client.release();
		}
	}

	async getTask(id: string): Promise<TaskState | null> {
		const client = await this.pool.connect();
		try {
			const result = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);

			if (result.rows.length === 0) return null;
			return this.rowToTask(result.rows[0]);
		} finally {
			client.release();
		}
	}

	async updateTask(id: string, updates: Partial<TaskState>): Promise<void> {
		const client = await this.pool.connect();
		try {
			const fields: string[] = [];
			const values: unknown[] = [];
			let paramIndex = 1;

			if (updates.status !== undefined) {
				fields.push(`status = $${paramIndex++}`);
				values.push(updates.status);
			}
			if (updates.providerId !== undefined) {
				fields.push(`provider_id = $${paramIndex++}`);
				values.push(updates.providerId);
			}
			if (updates.sessionId !== undefined) {
				fields.push(`session_id = $${paramIndex++}`);
				values.push(updates.sessionId);
			}
			if (updates.startedAt !== undefined) {
				fields.push(`started_at = $${paramIndex++}`);
				values.push(updates.startedAt);
			}
			if (updates.completedAt !== undefined) {
				fields.push(`completed_at = $${paramIndex++}`);
				values.push(updates.completedAt);
			}
			if (updates.error !== undefined) {
				fields.push(`error = $${paramIndex++}`);
				values.push(updates.error);
			}
			if (updates.result !== undefined) {
				fields.push(`result = $${paramIndex++}`);
				values.push(JSON.stringify(updates.result));
			}

			if (fields.length === 0) return;

			values.push(id);
			await client.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
		} finally {
			client.release();
		}
	}

	async getTasksBySession(sessionId: string): Promise<TaskState[]> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				'SELECT * FROM tasks WHERE session_id = $1 ORDER BY started_at DESC',
				[sessionId],
			);

			return result.rows.map((row) => this.rowToTask(row));
		} finally {
			client.release();
		}
	}

	async getTasksByStatus(status: TaskStatus): Promise<TaskState[]> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				'SELECT * FROM tasks WHERE status = $1 ORDER BY started_at DESC',
				[status],
			);

			return result.rows.map((row) => this.rowToTask(row));
		} finally {
			client.release();
		}
	}

	async recordUsage(usage: UsageRecord): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query(
				`
				INSERT INTO usage_records (provider_id, access_mode, timestamp, request_count, input_tokens, output_tokens, cost_usd)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`,
				[
					usage.providerId,
					usage.accessMode,
					usage.timestamp,
					usage.requestCount,
					usage.inputTokens,
					usage.outputTokens,
					usage.costUsd ?? null,
				],
			);
		} finally {
			client.release();
		}
	}

	async getUsageByProvider(providerId: string, since: Date): Promise<UsageRecord[]> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				'SELECT * FROM usage_records WHERE provider_id = $1 AND timestamp >= $2 ORDER BY timestamp DESC',
				[providerId, since],
			);

			return result.rows.map((row) => this.rowToUsage(row));
		} finally {
			client.release();
		}
	}

	async getTotalUsage(since: Date): Promise<{ requests: number; tokens: number; cost: number }> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				`
				SELECT
					COALESCE(SUM(request_count), 0) as requests,
					COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
					COALESCE(SUM(cost_usd), 0) as cost
				FROM usage_records
				WHERE timestamp >= $1
			`,
				[since],
			);

			const row = result.rows[0];
			return {
				requests: Number.parseInt(row.requests),
				tokens: Number.parseInt(row.tokens),
				cost: Number.parseFloat(row.cost),
			};
		} finally {
			client.release();
		}
	}

	async createCheckpoint(
		checkpoint: Omit<CheckpointRecord, 'createdAt'>,
	): Promise<CheckpointRecord> {
		const now = new Date();
		const client = await this.pool.connect();
		try {
			await client.query(
				`
				INSERT INTO checkpoints (id, task_id, session_id, created_at, state)
				VALUES ($1, $2, $3, $4, $5)
			`,
				[checkpoint.id, checkpoint.taskId, checkpoint.sessionId, now, checkpoint.state],
			);

			return {
				...checkpoint,
				createdAt: now,
			};
		} finally {
			client.release();
		}
	}

	async getCheckpoint(id: string): Promise<CheckpointRecord | null> {
		const client = await this.pool.connect();
		try {
			const result = await client.query('SELECT * FROM checkpoints WHERE id = $1', [id]);

			if (result.rows.length === 0) return null;
			return this.rowToCheckpoint(result.rows[0]);
		} finally {
			client.release();
		}
	}

	async getLatestCheckpoint(taskId: string): Promise<CheckpointRecord | null> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(
				'SELECT * FROM checkpoints WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1',
				[taskId],
			);

			if (result.rows.length === 0) return null;
			return this.rowToCheckpoint(result.rows[0]);
		} finally {
			client.release();
		}
	}

	async close(): Promise<void> {
		await this.pool.end();
	}

	private rowToSession(row: Record<string, unknown>): SessionRecord {
		return {
			id: row.id as string,
			projectId: row.project_id as string,
			repositoryKey: row.repository_key as string,
			providerId: row.provider_id as string,
			createdAt: new Date(row.created_at as string),
			updatedAt: new Date(row.updated_at as string),
			metadata: row.metadata as Record<string, unknown> | undefined,
		};
	}

	private rowToTask(row: Record<string, unknown>): TaskState {
		return {
			id: row.id as string,
			sessionId: (row.session_id as string | null) ?? undefined,
			status: row.status as TaskStatus,
			definition: row.definition as TaskDefinition,
			providerId: (row.provider_id as string | null) ?? undefined,
			startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
			completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
			error: (row.error as string | null) ?? undefined,
			result: (row.result as TaskResult | null) ?? undefined,
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
			costUsd: row.cost_usd !== null ? Number.parseFloat(row.cost_usd as string) : undefined,
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
 * Create a new PostgreSQL state store
 */
export function createPostgresqlStateStore(
	connectionString: string,
	config?: Partial<PoolConfig>,
): AsyncStateStore {
	return new PostgresqlStateStore(connectionString, config);
}
