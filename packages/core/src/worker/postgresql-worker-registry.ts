/**
 * PostgreSQL Worker Registry
 *
 * Persistent worker registry using PostgreSQL for distributed deployments.
 */

import type { Pool } from 'pg';
import type {
	WorkerHeartbeat,
	WorkerRegistration,
	WorkerRegistry,
	WorkerState,
} from './worker-protocol.js';

/**
 * PostgreSQL-backed worker registry for distributed deployments
 */
export class PostgreSQLWorkerRegistry implements WorkerRegistry {
	constructor(private pool: Pool) {}

	async register(registration: WorkerRegistration): Promise<void> {
		const now = new Date().toISOString();

		await this.pool.query(
			`
			INSERT INTO workers (
				worker_id, status, registered_at, last_heartbeat,
				current_task, capabilities, resources, metrics
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (worker_id)
			DO UPDATE SET
				status = $2,
				last_heartbeat = $4,
				capabilities = $6,
				resources = $7
			`,
			[
				registration.workerId,
				'idle',
				now,
				now,
				null,
				JSON.stringify(registration.capabilities),
				JSON.stringify(registration.resources),
				JSON.stringify({
					totalTasksCompleted: 0,
					totalTasksFailed: 0,
					totalUptime: 0,
					avgTaskDuration: 0,
				}),
			],
		);
	}

	async unregister(workerId: string): Promise<void> {
		await this.pool.query('DELETE FROM workers WHERE worker_id = $1', [workerId]);
	}

	async updateHeartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
		const result = await this.pool.query(
			`
			UPDATE workers
			SET last_heartbeat = $1,
			    status = $2,
			    current_task = $3
			WHERE worker_id = $4
			`,
			[heartbeat.timestamp, heartbeat.status, heartbeat.currentTask ?? null, heartbeat.workerId],
		);

		if (result.rowCount === 0) {
			throw new Error(`Worker ${heartbeat.workerId} not registered`);
		}
	}

	async getWorker(workerId: string): Promise<WorkerState | null> {
		const result = await this.pool.query(
			`
			SELECT
				worker_id,
				status,
				registered_at,
				last_heartbeat,
				current_task,
				capabilities,
				resources,
				metrics
			FROM workers
			WHERE worker_id = $1
			`,
			[workerId],
		);

		if (result.rows.length === 0) {
			return null;
		}

		const row = result.rows[0];
		return {
			workerId: row.worker_id,
			status: row.status,
			registeredAt: row.registered_at.toISOString(),
			lastHeartbeat: row.last_heartbeat.toISOString(),
			currentTask: row.current_task,
			capabilities: row.capabilities,
			resources: row.resources,
			metrics: row.metrics,
		};
	}

	async listWorkers(filter?: {
		status?: string;
		capability?: string;
	}): Promise<WorkerState[]> {
		let query = `
			SELECT
				worker_id,
				status,
				registered_at,
				last_heartbeat,
				current_task,
				capabilities,
				resources,
				metrics
			FROM workers
			WHERE 1=1
		`;
		const params: unknown[] = [];

		if (filter?.status) {
			params.push(filter.status);
			query += ` AND status = $${params.length}`;
		}

		if (filter?.capability) {
			params.push(`%"${filter.capability}"%`);
			query += ` AND capabilities::text LIKE $${params.length}`;
		}

		query += ' ORDER BY last_heartbeat DESC';

		const result = await this.pool.query(query, params);

		return result.rows.map((row) => ({
			workerId: row.worker_id,
			status: row.status,
			registeredAt: row.registered_at.toISOString(),
			lastHeartbeat: row.last_heartbeat.toISOString(),
			currentTask: row.current_task,
			capabilities: row.capabilities,
			resources: row.resources,
			metrics: row.metrics,
		}));
	}

	async getIdleWorkers(): Promise<WorkerState[]> {
		return this.listWorkers({ status: 'idle' });
	}

	async markOffline(workerId: string): Promise<void> {
		await this.pool.query(
			`
			UPDATE workers
			SET status = 'offline'
			WHERE worker_id = $1
			`,
			[workerId],
		);
	}

	/**
	 * Clean up stale workers (no heartbeat in last 5 minutes)
	 */
	async cleanupStaleWorkers(timeoutMs = 300000): Promise<number> {
		const cutoff = new Date(Date.now() - timeoutMs).toISOString();

		const result = await this.pool.query(
			`
			UPDATE workers
			SET status = 'offline'
			WHERE last_heartbeat < $1 AND status != 'offline'
			`,
			[cutoff],
		);

		return result.rowCount ?? 0;
	}
}

/**
 * Create PostgreSQL worker registry
 */
export function createPostgreSQLWorkerRegistry(pool: Pool): WorkerRegistry {
	return new PostgreSQLWorkerRegistry(pool);
}
