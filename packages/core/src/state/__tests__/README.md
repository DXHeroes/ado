# State Store Tests

## Overview

This directory contains tests for ADO state persistence implementations:

- `sqlite.test.ts` - SQLite state store tests (100% coverage)
- `postgresql.test.ts` - PostgreSQL state store integration tests

## Running Tests

### SQLite Tests

SQLite tests run without any external dependencies:

```bash
pnpm test packages/core/src/state/__tests__/sqlite.test.ts
```

### PostgreSQL Tests

PostgreSQL tests use **testcontainers** to spin up a real PostgreSQL instance in Docker. These tests require:

1. **Docker** installed and running
2. **Docker daemon** accessible
3. Network connectivity to pull PostgreSQL image

#### Requirements

- Docker Desktop (or Docker Engine + Docker Compose)
- At least 1GB available RAM for containers
- Network access to pull `postgres:16` image

#### Running PostgreSQL Tests

```bash
# Ensure Docker is running
docker info

# Run PostgreSQL integration tests
pnpm test packages/core/src/state/__tests__/postgresql.test.ts
```

#### Troubleshooting

If PostgreSQL tests fail with timeout or container errors:

1. **Check Docker is running:**
   ```bash
   docker ps
   ```

2. **Pull PostgreSQL image manually:**
   ```bash
   docker pull postgres:16
   ```

3. **Check Docker resource limits:**
   - Ensure Docker has enough memory (>= 2GB recommended)
   - Check Docker Desktop settings

4. **Increase test timeout:**
   The `beforeAll` hook has a 60-second timeout for container startup. If your system is slow, you may need to increase this in the test file.

5. **Skip PostgreSQL tests in CI/local environments:**
   ```bash
   # Run all tests except PostgreSQL
   pnpm test --exclude=packages/core/src/state/__tests__/postgresql.test.ts
   ```

## Test Coverage

- **SQLite**: 100% coverage (all operations tested)
- **PostgreSQL**: Same test scenarios as SQLite, validates:
  - Schema initialization
  - Session management (CRUD operations)
  - Task management (CRUD operations)
  - Usage tracking
  - Checkpoint management
  - Data integrity
  - Foreign key constraints
  - Connection pooling
  - Concurrent access

## Implementation Notes

### PostgreSQL Test Strategy

The PostgreSQL tests use **real database instances** (not mocks) to ensure:
- Actual SQL queries work correctly
- Schema migrations execute properly
- Foreign key constraints are enforced
- JSONB serialization works as expected
- Connection pooling behaves correctly
- Concurrent access patterns are safe

This is superior to mocking because it catches real-world issues like:
- SQL syntax errors
- Type conversions
- Transaction isolation problems
- Index performance issues

### Why testcontainers?

Testcontainers provides:
- **Isolated test environment** (fresh database per test suite)
- **Automatic cleanup** (containers removed after tests)
- **Repeatable tests** (same environment every time)
- **Version pinning** (postgres:16 ensures consistency)
- **No manual setup** (no need to install/configure PostgreSQL)

## Alternative: Manual PostgreSQL Setup

If you cannot use Docker/testcontainers, you can manually set up PostgreSQL and modify the test:

1. Install PostgreSQL 16
2. Create test database:
   ```sql
   CREATE DATABASE ado_test;
   CREATE USER test WITH PASSWORD 'test';
   GRANT ALL PRIVILEGES ON DATABASE ado_test TO test;
   ```

3. Modify `postgresql.test.ts`:
   ```typescript
   // Replace beforeAll/afterAll with:
   const connectionString = 'postgresql://test:test@localhost:5432/ado_test';
   ```

4. Run tests:
   ```bash
   pnpm test packages/core/src/state/__tests__/postgresql.test.ts
   ```

Note: This approach requires manual cleanup of test data between runs.
