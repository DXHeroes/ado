/**
 * Config command - Manage ADO configuration
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createClaudeCodeAdapter } from '@ado/adapters';
import { findConfigFile, loadConfigWithFallback } from '@ado/core';
import * as p from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const configCommand = new Command('config')
	.description('Manage ADO configuration')
	.addCommand(createProvidersCommand())
	.addCommand(createShowCommand())
	.addCommand(createSetCommand());

/**
 * Providers subcommand - Interactive provider configuration
 */
function createProvidersCommand(): Command {
	return new Command('providers')
		.description('Configure providers interactively')
		.action(async () => {
			const cwd = process.cwd();

			p.intro(pc.bgCyan(pc.black(' ADO Provider Configuration ')));

			const configPath = findConfigFile(cwd);
			if (!configPath) {
				p.log.error('ADO is not initialized. Run `ado init` first.');
				process.exit(1);
			}

			const config = loadConfigWithFallback(cwd);
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Get current providers
			const providers = Object.entries(config.providers);

			if (providers.length === 0) {
				p.log.warn('No providers configured.');
				p.note('Add providers to your ado.config.yaml file.', 'Configuration Required');
				return;
			}

			// Select provider to configure
			const selectedProvider = await p.select({
				message: 'Select provider to configure',
				options: [
					...providers.map(([id, config]) => ({
						value: id,
						label: `${config.enabled ? pc.green('●') : pc.dim('○')} ${id}`,
						hint: config.enabled ? 'enabled' : 'disabled',
					})),
					{ value: '_check', label: '🔍 Check all provider availability' },
				],
			});

			if (p.isCancel(selectedProvider)) {
				p.cancel('Configuration cancelled');
				return;
			}

			if (selectedProvider === '_check') {
				await checkAllProviders(config);
				return;
			}

			const providerConfig = config.providers[selectedProvider];
			if (!providerConfig) {
				p.log.error('Provider not found');
				return;
			}

			// Provider configuration options
			const action = await p.select({
				message: `Configure ${selectedProvider}`,
				options: [
					{
						value: 'toggle',
						label: providerConfig.enabled ? 'Disable provider' : 'Enable provider',
					},
					{ value: 'access_modes', label: 'Configure access modes' },
					{ value: 'check', label: 'Check availability' },
					{ value: 'back', label: 'Back' },
				],
			});

			if (p.isCancel(action) || action === 'back') {
				return;
			}

			switch (action) {
				case 'toggle': {
					const newEnabled = !providerConfig.enabled;

					// Update raw config
					const providersConfig = rawConfig.providers as Record<string, unknown>;
					const providerRaw = providersConfig[selectedProvider] as Record<string, unknown>;
					providerRaw.enabled = newEnabled;

					// Write back
					writeFileSync(configPath, stringifyYaml(rawConfig));

					p.log.success(`Provider ${selectedProvider} ${newEnabled ? 'enabled' : 'disabled'}`);
					break;
				}

				case 'access_modes': {
					await configureAccessModes(selectedProvider, providerConfig, rawConfig, configPath);
					break;
				}

				case 'check': {
					await checkProviderAvailability(selectedProvider);
					break;
				}
			}

			p.outro('');
		});
}

/**
 * Configure access modes for a provider
 */
async function configureAccessModes(
	providerId: string,
	providerConfig: { accessModes: Array<{ mode: string; enabled: boolean; priority: number }> },
	rawConfig: Record<string, unknown>,
	configPath: string,
): Promise<void> {
	const accessModes = providerConfig.accessModes;

	const modeToggles = await p.multiselect({
		message: 'Enable/disable access modes',
		options: accessModes.map((mode) => ({
			value: mode.mode,
			label: `${mode.mode} (priority: ${mode.priority})`,
			hint: mode.enabled ? 'currently enabled' : 'currently disabled',
		})),
		initialValues: accessModes.filter((m) => m.enabled).map((m) => m.mode),
	});

	if (p.isCancel(modeToggles)) {
		return;
	}

	// Update config
	const providersConfig = rawConfig.providers as Record<string, Record<string, unknown>>;
	const providerRaw = providersConfig[providerId];
	const modesRaw = providerRaw?.accessModes as Array<{ mode: string; enabled: boolean }>;

	if (modesRaw) {
		for (const mode of modesRaw) {
			mode.enabled = modeToggles.includes(mode.mode);
		}
	}

	writeFileSync(configPath, stringifyYaml(rawConfig));
	p.log.success('Access modes updated');
}

/**
 * Check availability of a specific provider
 */
async function checkProviderAvailability(providerId: string): Promise<void> {
	const spinner = p.spinner();
	spinner.start(`Checking ${providerId} availability`);

	let available = false;
	let details = '';

	switch (providerId) {
		case 'claude-code': {
			const adapter = createClaudeCodeAdapter();
			available = await adapter.isAvailable();
			details = available
				? 'Claude CLI is installed and ready'
				: 'Claude CLI not found or not authenticated';
			break;
		}

		default:
			details = 'Adapter not implemented yet';
			break;
	}

	spinner.stop(available ? pc.green('✓ Available') : pc.yellow('○ Not available'));

	if (!available) {
		p.note(details, 'Details');
	}
}

/**
 * Check all providers
 */
async function checkAllProviders(config: {
	providers: Record<string, { enabled: boolean }>;
}): Promise<void> {
	const spinner = p.spinner();
	spinner.start('Checking provider availability');

	const results: Array<{ id: string; available: boolean }> = [];

	for (const [id, providerConfig] of Object.entries(config.providers)) {
		if (!providerConfig.enabled) continue;

		let available = false;

		switch (id) {
			case 'claude-code': {
				const adapter = createClaudeCodeAdapter();
				available = await adapter.isAvailable();
				break;
			}
		}

		results.push({ id, available });
	}

	spinner.stop('Check complete');

	const lines = results
		.map((r) => `${r.available ? pc.green('✓') : pc.red('✗')} ${r.id}`)
		.join('\n');

	p.note(lines, 'Provider Availability');
}

/**
 * Show subcommand - Display current configuration
 */
function createShowCommand(): Command {
	return new Command('show')
		.description('Display current configuration')
		.option('--json', 'Output as JSON')
		.action(async (options) => {
			const cwd = process.cwd();
			const config = loadConfigWithFallback(cwd);

			if (options.json) {
				return;
			}

			p.intro(pc.bgCyan(pc.black(' ADO Configuration ')));

			// Project
			p.note(
				`ID: ${config.project.id}
Repository: ${config.project.repository ?? 'not set'}`,
				'Project',
			);

			// Routing
			p.note(
				`Strategy: ${config.routing.strategy}
API Fallback: ${config.routing.apiFallback.enabled ? 'enabled' : 'disabled'}
Max Cost/Task: $${config.routing.apiFallback.maxCostPerTask}`,
				'Routing',
			);

			// Providers summary
			const providerSummary = Object.entries(config.providers)
				.map(([id, c]) => {
					const modes = c.accessModes
						.filter((m) => m.enabled)
						.map((m) => m.mode)
						.join(', ');
					return `${c.enabled ? pc.green('●') : pc.dim('○')} ${id}: ${modes || 'no modes'}`;
				})
				.join('\n');

			p.note(providerSummary, 'Providers');

			p.outro('');
		});
}

/**
 * Set subcommand - Set configuration values
 */
function createSetCommand(): Command {
	return new Command('set')
		.description('Set a configuration value')
		.argument('<key>', 'Configuration key (e.g., routing.strategy)')
		.argument('<value>', 'New value')
		.action(async (key: string, value: string) => {
			const cwd = process.cwd();
			const configPath = findConfigFile(cwd);

			if (!configPath) {
				p.log.error('ADO is not initialized. Run `ado init` first.');
				process.exit(1);
			}

			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Navigate to key and set value
			const parts = key.split('.');
			let current: Record<string, unknown> = rawConfig;

			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!part) continue;

				if (!(part in current)) {
					current[part] = {};
				}
				current = current[part] as Record<string, unknown>;
			}

			const lastPart = parts[parts.length - 1];
			if (!lastPart) {
				p.log.error('Invalid key');
				process.exit(1);
			}

			// Parse value (try JSON, then boolean, then number, then string)
			let parsedValue: unknown = value;
			try {
				parsedValue = JSON.parse(value);
			} catch {
				if (value === 'true') parsedValue = true;
				else if (value === 'false') parsedValue = false;
				else if (!Number.isNaN(Number(value))) parsedValue = Number(value);
			}

			current[lastPart] = parsedValue;

			writeFileSync(configPath, stringifyYaml(rawConfig));
			p.log.success(`Set ${key} = ${JSON.stringify(parsedValue)}`);
		});
}
