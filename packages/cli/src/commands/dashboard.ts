/**
 * Dashboard command - Start the ADO dashboard
 *
 * Supports two modes:
 * - Development mode (--dev): Starts Vite dev server with hot reload
 * - Production mode: Starts API server with statically served dashboard
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';

// Get the directory of the CLI package
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the monorepo root by looking for pnpm-workspace.yaml
function findMonorepoRoot(): string | null {
	let currentDir = resolve(__dirname);
	const maxDepth = 10;

	for (let i = 0; i < maxDepth; i++) {
		if (existsSync(join(currentDir, 'pnpm-workspace.yaml'))) {
			return currentDir;
		}
		const parent = dirname(currentDir);
		if (parent === currentDir) break;
		currentDir = parent;
	}

	return null;
}

export const dashboardCommand = new Command('dashboard')
	.description('Start the ADO dashboard for monitoring and management')
	.option('-d, --dev', 'Start in development mode with hot reload')
	.option(
		'-p, --port <port>',
		'Dashboard port (default: 5173 for dev, 8080 for production)',
		Number.parseInt,
	)
	.option('--api-port <port>', 'API server port (default: 8080)', Number.parseInt)
	.option('--host <host>', 'Host to bind to (default: localhost for dev, 0.0.0.0 for production)')
	.option('--no-open', 'Do not open browser automatically')
	.action(async (options) => {
		p.intro(pc.bgCyan(pc.black(' ADO Dashboard ')));

		const monorepoRoot = findMonorepoRoot();
		const isDev = options.dev === true;
		const apiPort = options.apiPort ?? 8080;
		const dashboardPort = options.port ?? (isDev ? 5173 : 8080);
		const host = options.host ?? (isDev ? 'localhost' : '0.0.0.0');

		if (isDev) {
			// Development mode - start both Vite dev server and API server
			await startDevMode(monorepoRoot, apiPort, dashboardPort, host, options.open);
		} else {
			// Production mode - start API server with dashboard
			await startProductionMode(monorepoRoot, dashboardPort, host, options.open);
		}
	});

/**
 * Start development mode with Vite dev server and API server
 */
async function startDevMode(
	monorepoRoot: string | null,
	apiPort: number,
	dashboardPort: number,
	host: string,
	openBrowser: boolean,
): Promise<void> {
	if (!monorepoRoot) {
		p.log.error('Cannot find monorepo root. Development mode requires the full monorepo.');
		p.note('Install ADO globally with: npm install -g @dxheroes/ado', 'For Development');
		process.exit(1);
	}

	const dashboardPath = join(monorepoRoot, 'packages', 'dashboard');
	const apiPath = join(monorepoRoot, 'packages', 'api');

	// Check if dashboard package exists
	if (!existsSync(join(dashboardPath, 'package.json'))) {
		p.log.error('Dashboard package not found. Please run from the ADO monorepo.');
		process.exit(1);
	}

	const spinner = p.spinner();
	spinner.start('Starting development servers...');

	// Start API server
	const apiProcess = spawn('node', ['dist/index.js'], {
		cwd: apiPath,
		env: {
			...process.env,
			PORT: String(apiPort),
			HOST: 'localhost',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	apiProcess.stdout?.on('data', (data) => {
		const output = data.toString().trim();
		if (output) p.log.info(`[API] ${output}`);
	});

	apiProcess.stderr?.on('data', (data) => {
		const output = data.toString().trim();
		if (output) p.log.warn(`[API] ${output}`);
	});

	// Wait a bit for API server to start
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Start Vite dev server
	const viteProcess = spawn('npx', ['vite', '--host', host, '--port', String(dashboardPort)], {
		cwd: dashboardPath,
		env: {
			...process.env,
			VITE_API_URL: `http://localhost:${apiPort}`,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	viteProcess.stdout?.on('data', (data) => {
		const output = data.toString().trim();
		if (output) {
			// Check if Vite is ready
			if (output.includes('Local:') || output.includes('ready in')) {
				spinner.stop('Development servers started');
				p.log.success(`Dashboard: ${pc.cyan(`http://${host}:${dashboardPort}`)}`);
				p.log.success(`API: ${pc.cyan(`http://localhost:${apiPort}`)}`);
				p.note('Press Ctrl+C to stop all servers', 'Running');

				// Open browser if enabled
				if (openBrowser !== false) {
					openUrl(`http://localhost:${dashboardPort}`);
				}
			}
		}
	});

	viteProcess.stderr?.on('data', (data) => {
		const output = data.toString().trim();
		if (output && !output.includes('ExperimentalWarning')) {
			p.log.warn(`[Vite] ${output}`);
		}
	});

	// Handle process cleanup
	const cleanup = () => {
		p.log.info('Shutting down servers...');
		apiProcess.kill();
		viteProcess.kill();
		process.exit(0);
	};

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);

	// Wait for processes
	await Promise.race([
		new Promise<void>((_, reject) => {
			apiProcess.on('exit', (code) => {
				if (code !== 0 && code !== null) {
					reject(new Error(`API server exited with code ${code}`));
				}
			});
		}),
		new Promise<void>((_, reject) => {
			viteProcess.on('exit', (code) => {
				if (code !== 0 && code !== null) {
					reject(new Error(`Vite server exited with code ${code}`));
				}
			});
		}),
		// Keep running until interrupted
		new Promise<void>(() => {}),
	]).catch((error) => {
		p.log.error(error.message);
		cleanup();
	});
}

/**
 * Start production mode with API server serving dashboard
 */
async function startProductionMode(
	monorepoRoot: string | null,
	port: number,
	host: string,
	openBrowser: boolean,
): Promise<void> {
	// Find dashboard build directory
	let dashboardBuildPath: string | null = null;

	if (monorepoRoot) {
		// Try monorepo locations
		const possiblePaths = [
			join(monorepoRoot, 'packages', 'api', 'dist', 'dashboard'),
			join(monorepoRoot, 'packages', 'dashboard', 'dist'),
		];

		for (const p of possiblePaths) {
			if (existsSync(join(p, 'index.html'))) {
				dashboardBuildPath = p;
				break;
			}
		}
	}

	// Try relative to CLI package (for installed package)
	if (!dashboardBuildPath) {
		const installedPath = resolve(__dirname, '..', '..', 'dashboard');
		if (existsSync(join(installedPath, 'index.html'))) {
			dashboardBuildPath = installedPath;
		}
	}

	if (!dashboardBuildPath) {
		p.log.error('Dashboard build not found.');
		p.note(
			`Build the dashboard first:
  ${pc.cyan('cd packages/dashboard && pnpm build')}
  
Or use development mode:
  ${pc.cyan('ado dashboard --dev')}`,
			'Dashboard Not Built',
		);
		process.exit(1);
	}

	const spinner = p.spinner();
	spinner.start('Starting ADO dashboard server...');

	// Dynamically import and start API server
	try {
		const { startApiServer } = await import('@dxheroes/ado-api');

		spinner.stop('Dashboard server starting...');

		const displayHost = host === '0.0.0.0' ? 'localhost' : host;
		p.log.success(`Dashboard: ${pc.cyan(`http://${displayHost}:${port}`)}`);
		p.note('Press Ctrl+C to stop the server', 'Running');

		// Open browser if enabled
		if (openBrowser !== false) {
			setTimeout(() => {
				openUrl(`http://localhost:${port}`);
			}, 500);
		}

		startApiServer({
			port,
			host,
			dashboardPath: dashboardBuildPath,
			stateStorePath: '.ado/state.db',
		});
	} catch (error) {
		spinner.stop('Failed to start server');

		// Fallback: try to spawn the API server directly
		if (monorepoRoot) {
			const apiPath = join(monorepoRoot, 'packages', 'api');
			if (existsSync(join(apiPath, 'dist', 'index.js'))) {
				p.log.info('Using fallback server start...');

				const apiProcess = spawn('node', ['dist/index.js'], {
					cwd: apiPath,
					env: {
						...process.env,
						PORT: String(port),
						HOST: host,
						DASHBOARD_PATH: dashboardBuildPath ?? '',
					},
					stdio: 'inherit',
				});

				const cleanup = () => {
					apiProcess.kill();
					process.exit(0);
				};

				process.on('SIGINT', cleanup);
				process.on('SIGTERM', cleanup);

				// Open browser if enabled
				if (openBrowser !== false) {
					setTimeout(() => {
						openUrl(`http://localhost:${port}`);
					}, 1500);
				}

				await new Promise<void>((_, reject) => {
					apiProcess.on('exit', (code) => {
						if (code !== 0 && code !== null) {
							reject(new Error(`Server exited with code ${code}`));
						}
					});
				});
				return;
			}
		}

		p.log.error('Failed to start dashboard server.');
		p.log.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

/**
 * Open URL in default browser
 */
function openUrl(url: string): void {
	const platform = process.platform;
	const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';

	spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
}
