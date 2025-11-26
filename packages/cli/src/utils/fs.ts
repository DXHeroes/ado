/**
 * File system utilities for CLI
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ensure .ado directory exists and return its path
 */
export function ensureAdoDir(cwd: string): string {
	const adoDir = join(cwd, '.ado');
	if (!existsSync(adoDir)) {
		mkdirSync(adoDir, { recursive: true });
	}
	return adoDir;
}
