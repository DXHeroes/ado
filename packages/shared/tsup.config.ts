import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/test-utils/index.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	external: [/@testcontainers/, /ssh2/, /cpu-features/, /dockerode/],
	noExternal: [],
});
