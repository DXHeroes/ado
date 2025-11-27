#!/usr/bin/env node
/**
 * ADO CLI - Agentic Development Orchestrator
 *
 * A unified interface for orchestrating multiple AI coding agents.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { configCommand } from './commands/config.js';
import { initCommand } from './commands/init.js';
import { reportCommand } from './commands/report.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { workflowCommand } from './commands/workflow.js';
import { setupShutdown } from './utils/shutdown.js';
import { version } from './version.js';

// Setup graceful shutdown handling
setupShutdown();

const program = new Command();

program
	.name('ado')
	.description(
		`${pc.cyan('Agentic Development Orchestrator')} - Unified AI coding agent orchestration`,
	)
	.version(version, '-v, --version', 'Display version number')
	.option('--debug', 'Enable debug output')
	.option('--no-color', 'Disable colored output');

// Register commands
program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(reportCommand);
program.addCommand(workflowCommand);

// Add help examples
program.addHelpText(
	'after',
	`
${pc.bold('Examples:')}
  ${pc.dim('$')} ado init                              ${pc.dim('# Initialize ADO in current project')}
  ${pc.dim('$')} ado run "Implement feature X"         ${pc.dim('# Execute task with auto-selected agent')}
  ${pc.dim('$')} ado run "Fix bug" --provider claude   ${pc.dim('# Use specific provider')}
  ${pc.dim('$')} ado status                            ${pc.dim('# Show current status')}
  ${pc.dim('$')} ado config providers                  ${pc.dim('# Configure providers interactively')}
  ${pc.dim('$')} ado report --costs --period today     ${pc.dim('# View cost report')}
  ${pc.dim('$')} ado workflow run task.workflow.yaml   ${pc.dim('# Run a workflow file')}

${pc.bold('Documentation:')}
  ${pc.cyan('https://github.com/dxheroes/ado')}
`,
);

// Parse arguments
program.parse();
