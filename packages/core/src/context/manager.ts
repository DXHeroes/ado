/**
 * Context file manager for ADO.
 * Manages CLAUDE.md, GEMINI.md, and other agent context files.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Template variables for context file substitution
 */
export interface ContextVariables {
	projectId: string;
	projectName: string;
	projectType?: string;
	primaryLanguage?: string;
	repository?: string;
	architecture?: string;
	currentFocus?: string;
	[key: string]: string | undefined;
}

/**
 * Context file configuration
 */
export interface ContextFileConfig {
	name: string; // CLAUDE.md, GEMINI.md, etc.
	path: string; // Full path to the file
	template?: string; // Template content
}

/**
 * Context manager interface
 */
export interface ContextManager {
	/** Read a context file */
	read(fileName: string): string | null;

	/** Write a context file */
	write(fileName: string, content: string): void;

	/** Check if context file exists */
	exists(fileName: string): boolean;

	/** Apply template variables to content */
	applyVariables(content: string, variables: ContextVariables): string;

	/** Create context file from template */
	createFromTemplate(fileName: string, template: string, variables: ContextVariables): void;

	/** Sync context files for a provider */
	syncForProvider(providerId: string, contextFile: string, variables: ContextVariables): void;
}

/**
 * Default context file templates
 */
const DEFAULT_TEMPLATES: Record<string, string> = {
	'CLAUDE.md': `# Project Context for Claude Code

## Project Overview
- Name: {{projectName}}
- Type: {{projectType}}
- Primary Language: {{primaryLanguage}}

## Coding Standards
- Follow existing code style and conventions
- Write tests for new functionality
- Keep functions focused and under 50 lines when possible
- Use descriptive variable and function names

## Architecture
{{architecture}}

## Current Focus
{{currentFocus}}

## Important Notes
- Review changes before committing
- Run tests after making changes
- Follow the project's contribution guidelines
`,

	'GEMINI.md': `# Gemini Context

## Project
{{projectName}} - {{projectType}}

## Guidelines
- Prefer functional programming patterns
- Use descriptive variable names
- Keep functions under 50 lines

## Restrictions
- Do not modify files in /vendor or /node_modules
- Do not commit directly to main branch
- Follow existing code conventions
`,

	'.cursorrules': `# Cursor Rules for {{projectName}}

## Code Style
- Follow {{primaryLanguage}} best practices
- Use consistent formatting
- Write clear comments

## Project Context
This is a {{projectType}} project.
Primary language: {{primaryLanguage}}

## Guidelines
- Make incremental changes
- Test changes before committing
- Follow existing patterns in the codebase
`,

	'.github/copilot-instructions.md': `# GitHub Copilot Instructions

## Project: {{projectName}}

### Overview
This is a {{projectType}} project using {{primaryLanguage}}.

### Coding Guidelines
1. Follow existing code patterns
2. Write clear, descriptive comments
3. Use meaningful variable names
4. Keep functions focused and small

### Testing
- Write tests for new functionality
- Ensure existing tests pass

### Documentation
- Update documentation for API changes
- Include JSDoc/docstrings for public functions
`,
};

/**
 * Default context manager implementation
 */
export class DefaultContextManager implements ContextManager {
	private projectPath: string;

	constructor(projectPath: string) {
		this.projectPath = projectPath;
	}

	read(fileName: string): string | null {
		const filePath = this.getFilePath(fileName);
		if (!existsSync(filePath)) {
			return null;
		}
		return readFileSync(filePath, 'utf-8');
	}

	write(fileName: string, content: string): void {
		const filePath = this.getFilePath(fileName);
		writeFileSync(filePath, content);
	}

	exists(fileName: string): boolean {
		return existsSync(this.getFilePath(fileName));
	}

	applyVariables(content: string, variables: ContextVariables): string {
		let result = content;

		for (const [key, value] of Object.entries(variables)) {
			const placeholder = `{{${key}}}`;
			result = result.replace(new RegExp(placeholder, 'g'), value ?? '');
		}

		// Remove any remaining placeholders
		result = result.replace(/\{\{[^}]+\}\}/g, '');

		return result;
	}

	createFromTemplate(fileName: string, template: string, variables: ContextVariables): void {
		const content = this.applyVariables(template, variables);
		this.write(fileName, content);
	}

	syncForProvider(_providerId: string, contextFile: string, variables: ContextVariables): void {
		// If context file doesn't exist, create from template
		if (!this.exists(contextFile)) {
			const template = DEFAULT_TEMPLATES[contextFile];
			if (template) {
				this.createFromTemplate(contextFile, template, variables);
			}
		}
	}

	private getFilePath(fileName: string): string {
		return join(this.projectPath, fileName);
	}
}

/**
 * Create a new context manager
 */
export function createContextManager(projectPath: string): ContextManager {
	return new DefaultContextManager(projectPath);
}

/**
 * Get default template for a context file
 */
export function getDefaultTemplate(fileName: string): string | null {
	return DEFAULT_TEMPLATES[fileName] ?? null;
}

/**
 * Get all available context file templates
 */
export function getAvailableTemplates(): string[] {
	return Object.keys(DEFAULT_TEMPLATES);
}
