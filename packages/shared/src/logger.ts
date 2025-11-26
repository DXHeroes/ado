/**
 * Logger utility for ADO.
 * Simple structured logging with color support.
 */

import { formatError, isAdoError } from './errors.js';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log format
 */
export type LogFormat = 'pretty' | 'json';

/**
 * Logger configuration
 */
export interface LoggerConfig {
	level: LogLevel;
	format: LogFormat;
	prefix: string | undefined;
}

/**
 * Log entry
 */
export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: Date;
	data: Record<string, unknown> | undefined;
	error: Error | undefined;
}

/**
 * Logger interface
 */
export interface Logger {
	debug(message: string, data?: Record<string, unknown>): void;
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, error?: Error, data?: Record<string, unknown>): void;
	child(prefix: string): Logger;
}

/**
 * Log level priorities
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * ANSI color codes for pretty output
 */
const COLORS = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

/**
 * Format timestamp for pretty output
 */
function formatTimestamp(date: Date): string {
	return date.toISOString().slice(11, 23);
}

/**
 * Default logger implementation
 */
class DefaultLogger implements Logger {
	private config: LoggerConfig;
	private prefix: string;

	constructor(config: LoggerConfig) {
		this.config = config;
		this.prefix = config.prefix ?? '';
	}

	debug(message: string, data?: Record<string, unknown>): void {
		this.log('debug', message, data);
	}

	info(message: string, data?: Record<string, unknown>): void {
		this.log('info', message, data);
	}

	warn(message: string, data?: Record<string, unknown>): void {
		this.log('warn', message, data);
	}

	error(message: string, error?: Error, data?: Record<string, unknown>): void {
		this.log('error', message, { ...data, error });
	}

	child(prefix: string): Logger {
		const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
		return new DefaultLogger({ ...this.config, prefix: childPrefix });
	}

	private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
		if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.level]) {
			return;
		}

		const errorValue = data?.['error'];
		const entryData = data ? { ...data } : undefined;
		if (entryData && 'error' in entryData) {
			entryData['error'] = undefined;
		}

		const entry: LogEntry = {
			level,
			message: this.prefix ? `[${this.prefix}] ${message}` : message,
			timestamp: new Date(),
			data: entryData && Object.keys(entryData).length > 0 ? entryData : undefined,
			error: errorValue instanceof Error ? errorValue : undefined,
		};

		if (this.config.format === 'json') {
			this.outputJson(entry);
		} else {
			this.outputPretty(entry);
		}
	}

	private outputJson(entry: LogEntry): void {
		const output: Record<string, unknown> = {
			level: entry.level,
			msg: entry.message,
			time: entry.timestamp.toISOString(),
		};

		const entryData = entry.data;
		if (entryData && Object.keys(entryData).length > 0) {
			output['data'] = entryData;
		}

		const entryError = entry.error;
		if (entryError) {
			output['error'] = {
				name: entryError.name,
				message: entryError.message,
				stack: entryError.stack,
			};
		}

		const stream = entry.level === 'error' ? process.stderr : process.stdout;
		stream.write(`${JSON.stringify(output)}\n`);
	}

	private outputPretty(entry: LogEntry): void {
		const { reset, dim, red, yellow, blue, cyan, gray } = COLORS;

		let levelColor: string;
		let levelStr: string;

		switch (entry.level) {
			case 'debug':
				levelColor = gray;
				levelStr = 'DBG';
				break;
			case 'info':
				levelColor = blue;
				levelStr = 'INF';
				break;
			case 'warn':
				levelColor = yellow;
				levelStr = 'WRN';
				break;
			case 'error':
				levelColor = red;
				levelStr = 'ERR';
				break;
		}

		const timestamp = `${dim}${formatTimestamp(entry.timestamp)}${reset}`;
		const level = `${levelColor}${levelStr}${reset}`;
		let line = `${timestamp} ${level} ${entry.message}`;

		// Add data if present
		if (entry.data && Object.keys(entry.data).length > 0) {
			const dataStr = Object.entries(entry.data)
				.map(([k, v]) => `${cyan}${k}${reset}=${JSON.stringify(v)}`)
				.join(' ');
			line += ` ${dataStr}`;
		}

		const stream = entry.level === 'error' ? process.stderr : process.stdout;
		stream.write(`${line}\n`);

		// Output error details
		if (entry.error) {
			const errorStr = formatError(entry.error);
			stream.write(`${red}${errorStr}${reset}\n`);

			// Show remediation for ADO errors
			if (isAdoError(entry.error) && entry.error.remediation) {
				stream.write(`${yellow}Remediation: ${entry.error.remediation}${reset}\n`);
			}
		}
	}
}

/**
 * Create a new logger
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
	return new DefaultLogger({
		level: config?.level ?? 'info',
		format: config?.format ?? 'pretty',
		prefix: config?.prefix,
	});
}

/**
 * Default logger instance
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger
 */
export function getLogger(): Logger {
	if (!defaultLogger) {
		defaultLogger = createLogger();
	}
	return defaultLogger;
}

/**
 * Configure the default logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
	defaultLogger = createLogger(config);
}
