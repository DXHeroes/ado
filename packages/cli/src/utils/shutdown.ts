/**
 * Graceful shutdown handling for ADO CLI
 */

type ShutdownHandler = () => Promise<void> | void;

const handlers: ShutdownHandler[] = [];
let isShuttingDown = false;

/**
 * Register a handler to be called during graceful shutdown
 */
export function onShutdown(handler: ShutdownHandler): void {
	handlers.push(handler);
}

/**
 * Remove a shutdown handler
 */
export function removeShutdownHandler(handler: ShutdownHandler): void {
	const index = handlers.indexOf(handler);
	if (index !== -1) {
		handlers.splice(index, 1);
	}
}

/**
 * Execute all shutdown handlers
 */
async function executeShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	process.stderr.write(`\n\nReceived ${signal}. Shutting down gracefully...\n`);

	for (const handler of handlers) {
		try {
			await handler();
		} catch (error) {
			// Log but continue with other handlers
			process.stderr.write(
				`Shutdown handler error: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	}

	process.exit(0);
}

/**
 * Setup graceful shutdown handlers
 */
export function setupShutdown(): void {
	// Handle SIGINT (Ctrl+C)
	process.on('SIGINT', () => void executeShutdown('SIGINT'));

	// Handle SIGTERM (kill command)
	process.on('SIGTERM', () => void executeShutdown('SIGTERM'));

	// Handle uncaught exceptions
	process.on('uncaughtException', (error) => {
		process.stderr.write(`\nUncaught exception: ${error.message}\n`);
		if (error.stack) {
			process.stderr.write(`${error.stack}\n`);
		}
		process.exit(1);
	});

	// Handle unhandled promise rejections
	process.on('unhandledRejection', (reason) => {
		process.stderr.write(
			`\nUnhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`,
		);
		process.exit(1);
	});
}
