/**
 * State Store Factory
 * Creates the appropriate state store based on deployment context
 */

import type { DeploymentContext } from '../deployment/types.js';
import { PostgresqlStateStore } from './postgresql.js';
import type { AsyncStateStore, StateStore } from './sqlite.js';
import { SqliteStateStore } from './sqlite.js';

/**
 * Create a state store based on deployment context
 */
export function createStateStoreFromContext(
	context: DeploymentContext,
): StateStore | AsyncStateStore {
	const storage = context.storage;

	switch (storage.driver) {
		case 'sqlite': {
			if (!storage.path) {
				throw new Error('SQLite storage requires a path');
			}
			return new SqliteStateStore(storage.path);
		}

		case 'postgresql': {
			if (!storage.connectionString) {
				throw new Error('PostgreSQL storage requires a connection string');
			}
			return new PostgresqlStateStore(storage.connectionString);
		}

		default:
			throw new Error(`Unsupported storage driver: ${(storage as { driver: string }).driver}`);
	}
}
