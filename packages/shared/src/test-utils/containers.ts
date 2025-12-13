/**
 * Test container utilities for integration tests
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Start a PostgreSQL test container
 */
export const startPostgresContainer = async (): Promise<StartedPostgreSqlContainer> => {
	const container = await new PostgreSqlContainer('postgres:16')
		.withDatabase('ado_test')
		.withUsername('test')
		.withPassword('test')
		.start();

	return container;
};

/**
 * Get PostgreSQL connection string from container
 */
export const getPostgresConnectionString = (container: StartedPostgreSqlContainer): string => {
	return container.getConnectionUri();
};

/**
 * Stop and cleanup a PostgreSQL container
 */
export const stopPostgresContainer = async (
	container: StartedPostgreSqlContainer | undefined,
): Promise<void> => {
	if (container) {
		await container.stop();
	}
};
