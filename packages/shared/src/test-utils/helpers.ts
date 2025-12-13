/**
 * Test helper utilities
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Wait for a condition to become true with timeout
 */
export const waitForCondition = async (
	condition: () => boolean | Promise<boolean>,
	options: {
		timeout?: number;
		interval?: number;
		errorMessage?: string;
	} = {},
): Promise<void> => {
	const {
		timeout = 5000,
		interval = 100,
		errorMessage = 'Timeout waiting for condition',
	} = options;

	const start = Date.now();
	while (!(await condition())) {
		if (Date.now() - start > timeout) {
			throw new Error(errorMessage);
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
};

/**
 * Create a temporary directory for testing
 */
export const createTempDir = async (prefix = 'ado-test-'): Promise<string> => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	return tmpDir;
};

/**
 * Create a temporary test project with git initialized
 */
export const createTempProject = async (
	options: {
		prefix?: string;
		initGit?: boolean;
		files?: Record<string, string>;
	} = {},
): Promise<string> => {
	const { prefix = 'ado-test-project-', initGit = true, files = {} } = options;

	const projectDir = await createTempDir(prefix);

	// Initialize git repository
	if (initGit) {
		await execAsync('git init', { cwd: projectDir });
		await execAsync('git config user.name "Test User"', { cwd: projectDir });
		await execAsync('git config user.email "test@example.com"', { cwd: projectDir });
	}

	// Create package.json
	const packageJson = {
		name: 'test-project',
		version: '1.0.0',
		type: 'module',
	};
	await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2));

	// Create additional files
	for (const [filePath, content] of Object.entries(files)) {
		const fullPath = path.join(projectDir, filePath);
		await fs.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.writeFile(fullPath, content);
	}

	return projectDir;
};

/**
 * Clean up a temporary directory
 */
export const cleanupTempDir = async (dirPath: string): Promise<void> => {
	try {
		await fs.rm(dirPath, { recursive: true, force: true });
	} catch (_error) {}
};

/**
 * Sleep for a specified duration
 */
export const sleep = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create a mock file system structure
 */
export const createFileStructure = async (
	baseDir: string,
	structure: Record<string, string | null>,
): Promise<void> => {
	for (const [filePath, content] of Object.entries(structure)) {
		const fullPath = path.join(baseDir, filePath);

		if (content === null) {
			// Create directory
			await fs.mkdir(fullPath, { recursive: true });
		} else {
			// Create file with content
			await fs.mkdir(path.dirname(fullPath), { recursive: true });
			await fs.writeFile(fullPath, content);
		}
	}
};

/**
 * Read all files in a directory recursively
 */
export const readDirectoryRecursive = async (
	dirPath: string,
	baseDir = dirPath,
): Promise<Record<string, string>> => {
	const files: Record<string, string> = {};
	const entries = await fs.readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		const relativePath = path.relative(baseDir, fullPath);

		if (entry.isDirectory()) {
			const subFiles = await readDirectoryRecursive(fullPath, baseDir);
			Object.assign(files, subFiles);
		} else {
			const content = await fs.readFile(fullPath, 'utf-8');
			files[relativePath] = content;
		}
	}

	return files;
};

/**
 * Assert that a file exists
 */
export const assertFileExists = async (filePath: string): Promise<void> => {
	try {
		await fs.access(filePath);
	} catch {
		throw new Error(`Expected file to exist: ${filePath}`);
	}
};

/**
 * Assert that a file does not exist
 */
export const assertFileNotExists = async (filePath: string): Promise<void> => {
	try {
		await fs.access(filePath);
		throw new Error(`Expected file to not exist: ${filePath}`);
	} catch (error) {
		// File doesn't exist - this is expected
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
};

/**
 * Assert that a file contains specific content
 */
export const assertFileContains = async (filePath: string, content: string): Promise<void> => {
	const fileContent = await fs.readFile(filePath, 'utf-8');
	if (!fileContent.includes(content)) {
		throw new Error(
			`Expected file ${filePath} to contain "${content}", but it didn't.\nFile content:\n${fileContent}`,
		);
	}
};

/**
 * Collect all events from an async iterable
 */
export const collectAsyncIterable = async <T>(
	iterable: AsyncIterable<T>,
	options: {
		timeout?: number;
		maxEvents?: number;
	} = {},
): Promise<T[]> => {
	const { timeout = 10000, maxEvents = 1000 } = options;
	const events: T[] = [];

	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		setTimeout(() => reject(new Error('Timeout collecting async iterable')), timeout);
	});

	const collectPromise = (async () => {
		for await (const event of iterable) {
			events.push(event);
			if (events.length >= maxEvents) {
				break;
			}
		}
		return events;
	})();

	return Promise.race([collectPromise, timeoutPromise]);
};

/**
 * Create a spy function that records calls
 */
export interface SpyFunction<TArgs extends unknown[] = unknown[], TReturn = unknown> {
	(...args: TArgs): TReturn;
	calls: TArgs[];
	callCount: number;
	reset: () => void;
}

export const createSpy = <TArgs extends unknown[] = unknown[], TReturn = unknown>(
	implementation?: (...args: TArgs) => TReturn,
): SpyFunction<TArgs, TReturn> => {
	const calls: TArgs[] = [];

	const spy = ((...args: TArgs): TReturn => {
		calls.push(args);
		return implementation ? implementation(...args) : (undefined as TReturn);
	}) as SpyFunction<TArgs, TReturn>;

	Object.defineProperty(spy, 'calls', {
		get: () => calls,
	});

	Object.defineProperty(spy, 'callCount', {
		get: () => calls.length,
	});

	spy.reset = () => {
		calls.length = 0;
	};

	return spy;
};

/**
 * Retry an operation with exponential backoff
 */
export const retryWithBackoff = async <T>(
	operation: () => Promise<T>,
	options: {
		maxRetries?: number;
		initialDelay?: number;
		maxDelay?: number;
		factor?: number;
	} = {},
): Promise<T> => {
	const { maxRetries = 3, initialDelay = 100, maxDelay = 5000, factor = 2 } = options;

	let lastError: Error | undefined;
	let delay = initialDelay;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			if (attempt < maxRetries) {
				await sleep(Math.min(delay, maxDelay));
				delay *= factor;
			}
		}
	}

	throw lastError;
};
