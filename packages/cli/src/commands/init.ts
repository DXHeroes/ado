/**
 * Init command - Initialize ADO in current project
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { findConfigFile } from '@ado/core';
import * as p from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';

/**
 * Default config template
 */
const CONFIG_TEMPLATE = `# ADO Configuration
# See https://github.com/dxheroes/ado for documentation
version: "1.1"

# Project identification
project:
  id: "{{projectId}}"
  repository: "{{repository}}"

# Provider configuration
providers:
  claude-code:
    enabled: true
    contextFile: "CLAUDE.md"
    
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"
          rateLimits:
            requestsPerDay: 500
            tokensPerDay: 5000000
          resetTime: "00:00 UTC"
    
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "rust", "java"]
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
    
    defaultOptions:
      model: "claude-sonnet-4-20250514"
      maxTurns: 50
      permissionMode: "acceptEdits"

# Routing configuration
routing:
  strategy: "subscription-first"
  failover:
    enabled: true
    onErrors: ["rate_limit", "timeout", "server_error"]
    maxRetries: 3
    retryDelay: 1000
  apiFallback:
    enabled: false
    confirmAboveCost: 1.00
    maxCostPerTask: 10.00
    maxDailyCost: 50.00

# Storage configuration
storage:
  driver: "sqlite"
  path: ".ado/state.db"
  rateLimitTracking:
    driver: "memory"

# Observability
observability:
  logging:
    level: "info"
    format: "pretty"
  costTracking:
    enabled: true
    reportInterval: "daily"
`;

/**
 * CLAUDE.md template
 */
const CLAUDE_MD_TEMPLATE = `# Project Context for Claude Code

## Project Overview
- Name: {{projectName}}
- Type: {{projectType}}
- Primary Language: {{primaryLanguage}}

## Coding Standards
- Follow existing code style and conventions
- Write tests for new functionality
- Keep functions focused and under 50 lines when possible

## Architecture
{{architecture}}

## Current Focus
{{currentFocus}}
`;

export const initCommand = new Command('init')
	.description('Initialize ADO in the current project')
	.option('-f, --force', 'Overwrite existing configuration')
	.option('-y, --yes', 'Accept defaults without prompting')
	.action(async (options) => {
		const cwd = process.cwd();

		p.intro(pc.bgCyan(pc.black(' ADO Init ')));

		// Check for existing config
		const existingConfig = findConfigFile(cwd);
		if (existingConfig && !options.force) {
			p.note(
				`Configuration already exists at ${pc.cyan(existingConfig)}`,
				'Existing Configuration',
			);

			if (!options.yes) {
				const overwrite = await p.confirm({
					message: 'Overwrite existing configuration?',
					initialValue: false,
				});

				if (p.isCancel(overwrite) || !overwrite) {
					p.cancel('Initialization cancelled');
					process.exit(0);
				}
			}
		}

		let projectId = basename(cwd);
		let repository = '';
		let primaryLanguage = 'typescript';
		let projectType = 'application';

		if (!options.yes) {
			// Interactive prompts
			const projectInfo = await p.group(
				{
					projectId: () =>
						p.text({
							message: 'Project ID',
							initialValue: projectId,
							validate: (value) => {
								if (!value) return 'Project ID is required';
								if (!/^[a-z0-9-]+$/.test(value))
									return 'Use lowercase letters, numbers, and hyphens only';
								return undefined;
							},
						}),
					repository: () =>
						p.text({
							message: 'Repository URL (optional)',
							placeholder: 'github.com/org/repo',
						}),
					primaryLanguage: () =>
						p.select({
							message: 'Primary language',
							options: [
								{ value: 'typescript', label: 'TypeScript' },
								{ value: 'javascript', label: 'JavaScript' },
								{ value: 'python', label: 'Python' },
								{ value: 'go', label: 'Go' },
								{ value: 'rust', label: 'Rust' },
								{ value: 'java', label: 'Java' },
								{ value: 'other', label: 'Other' },
							],
							initialValue: 'typescript',
						}),
					projectType: () =>
						p.select({
							message: 'Project type',
							options: [
								{ value: 'application', label: 'Application' },
								{ value: 'library', label: 'Library' },
								{ value: 'cli', label: 'CLI Tool' },
								{ value: 'api', label: 'API Service' },
								{ value: 'monorepo', label: 'Monorepo' },
							],
							initialValue: 'application',
						}),
				},
				{
					onCancel: () => {
						p.cancel('Initialization cancelled');
						process.exit(0);
					},
				},
			);

			projectId = projectInfo.projectId;
			repository = projectInfo.repository ?? '';
			primaryLanguage = projectInfo.primaryLanguage as string;
			projectType = projectInfo.projectType as string;
		}

		const spinner = p.spinner();
		spinner.start('Creating configuration files');

		try {
			// Create .ado directory
			const adoDir = join(cwd, '.ado');
			if (!existsSync(adoDir)) {
				mkdirSync(adoDir, { recursive: true });
			}

			// Write config file
			const configContent = CONFIG_TEMPLATE.replace('{{projectId}}', projectId).replace(
				'{{repository}}',
				repository,
			);

			writeFileSync(join(cwd, 'ado.config.yaml'), configContent);

			// Write CLAUDE.md if it doesn't exist
			const claudeMdPath = join(cwd, 'CLAUDE.md');
			if (!existsSync(claudeMdPath)) {
				const claudeContent = CLAUDE_MD_TEMPLATE.replace('{{projectName}}', projectId)
					.replace('{{projectType}}', projectType)
					.replace('{{primaryLanguage}}', primaryLanguage)
					.replace('{{architecture}}', 'Describe your architecture here')
					.replace('{{currentFocus}}', 'Describe current development focus');

				writeFileSync(claudeMdPath, claudeContent);
			}

			// Add .ado to .gitignore if not present
			const gitignorePath = join(cwd, '.gitignore');
			if (existsSync(gitignorePath)) {
				const gitignore = await import('node:fs').then((fs) =>
					fs.readFileSync(gitignorePath, 'utf-8'),
				);
				if (!gitignore.includes('.ado/')) {
					writeFileSync(gitignorePath, `${gitignore}\n# ADO state\n.ado/\n`);
				}
			}

			spinner.stop('Configuration created');

			p.note(
				`${pc.cyan('ado.config.yaml')} - Main configuration
${pc.cyan('CLAUDE.md')} - Project context for Claude
${pc.cyan('.ado/')} - State directory (gitignored)`,
				'Created Files',
			);

			p.outro(
				`${pc.green('✓')} ADO initialized! Run ${pc.cyan('ado run "your task"')} to get started.`,
			);
		} catch (error) {
			spinner.stop('Failed to create configuration');
			p.log.error(error instanceof Error ? error.message : 'Unknown error occurred');
			process.exit(1);
		}
	});
