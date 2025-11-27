import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Read version from package.json at build time
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	// Inject version at build time
	define: {
		__VERSION__: JSON.stringify(pkg.version),
	},
	// Shebang is already in the source file
});
