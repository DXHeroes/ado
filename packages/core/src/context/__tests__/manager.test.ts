/**
 * Tests for context manager
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	type ContextVariables,
	DefaultContextManager,
	createContextManager,
	getAvailableTemplates,
	getDefaultTemplate,
} from '../manager.js';

describe('Context Manager', () => {
	const testDir = join(process.cwd(), '.test-context');

	beforeEach(() => {
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('DefaultContextManager', () => {
		describe('read', () => {
			it('should read existing context file', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '# Test Context\nThis is a test.';
				writeFileSync(join(testDir, 'CLAUDE.md'), content);

				const result = manager.read('CLAUDE.md');
				expect(result).toBe(content);
			});

			it('should return null for non-existent file', () => {
				const manager = new DefaultContextManager(testDir);

				const result = manager.read('NONEXISTENT.md');
				expect(result).toBeNull();
			});

			it('should read files from subdirectories', () => {
				const manager = new DefaultContextManager(testDir);
				const githubDir = join(testDir, '.github');
				mkdirSync(githubDir);
				const content = '# Copilot Instructions';
				writeFileSync(join(githubDir, 'copilot-instructions.md'), content);

				const result = manager.read('.github/copilot-instructions.md');
				expect(result).toBe(content);
			});

			it('should handle UTF-8 content', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '# Čeština\n你好\n🚀';
				writeFileSync(join(testDir, 'UNICODE.md'), content, 'utf-8');

				const result = manager.read('UNICODE.md');
				expect(result).toBe(content);
			});
		});

		describe('write', () => {
			it('should write context file', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '# New Context\nTest content.';

				manager.write('TEST.md', content);

				const written = readFileSync(join(testDir, 'TEST.md'), 'utf-8');
				expect(written).toBe(content);
			});

			it('should overwrite existing file', () => {
				const manager = new DefaultContextManager(testDir);
				writeFileSync(join(testDir, 'EXISTING.md'), 'Old content');

				manager.write('EXISTING.md', 'New content');

				const written = readFileSync(join(testDir, 'EXISTING.md'), 'utf-8');
				expect(written).toBe('New content');
			});

			it('should write files to subdirectories', () => {
				const manager = new DefaultContextManager(testDir);
				const githubDir = join(testDir, '.github');
				mkdirSync(githubDir);

				manager.write('.github/copilot-instructions.md', '# Instructions');

				const written = readFileSync(join(testDir, '.github/copilot-instructions.md'), 'utf-8');
				expect(written).toBe('# Instructions');
			});

			it('should handle UTF-8 content', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '# Test 你好 🎉';

				manager.write('UTF8.md', content);

				const written = readFileSync(join(testDir, 'UTF8.md'), 'utf-8');
				expect(written).toBe(content);
			});
		});

		describe('exists', () => {
			it('should return true for existing file', () => {
				const manager = new DefaultContextManager(testDir);
				writeFileSync(join(testDir, 'EXISTS.md'), 'content');

				expect(manager.exists('EXISTS.md')).toBe(true);
			});

			it('should return false for non-existent file', () => {
				const manager = new DefaultContextManager(testDir);

				expect(manager.exists('NONEXISTENT.md')).toBe(false);
			});

			it('should check files in subdirectories', () => {
				const manager = new DefaultContextManager(testDir);
				const subDir = join(testDir, '.github');
				mkdirSync(subDir);
				writeFileSync(join(subDir, 'test.md'), 'content');

				expect(manager.exists('.github/test.md')).toBe(true);
				expect(manager.exists('.github/nonexistent.md')).toBe(false);
			});
		});

		describe('applyVariables', () => {
			it('should replace simple placeholder', () => {
				const manager = new DefaultContextManager(testDir);
				const content = 'Project: {{projectName}}';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test Project',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('Project: Test Project');
			});

			it('should replace multiple placeholders', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '{{projectName}} is a {{projectType}} project';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'ADO',
					projectType: 'TypeScript',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('ADO is a TypeScript project');
			});

			it('should replace same placeholder multiple times', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '{{name}} says {{name}} is great';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'test',
					name: 'Alice',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('Alice says Alice is great');
			});

			it('should handle undefined variables', () => {
				const manager = new DefaultContextManager(testDir);
				const content = 'Type: {{projectType}}';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
					projectType: undefined,
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('Type: ');
			});

			it('should remove unused placeholders', () => {
				const manager = new DefaultContextManager(testDir);
				const content = '{{projectName}} - {{unknownVar}}';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('Test - ');
			});

			it('should handle multiline content', () => {
				const manager = new DefaultContextManager(testDir);
				const content = `# {{projectName}}
Type: {{projectType}}
Language: {{primaryLanguage}}`;
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'ADO',
					projectType: 'CLI Tool',
					primaryLanguage: 'TypeScript',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toContain('# ADO');
				expect(result).toContain('Type: CLI Tool');
				expect(result).toContain('Language: TypeScript');
			});

			it('should handle empty content', () => {
				const manager = new DefaultContextManager(testDir);
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
				};

				const result = manager.applyVariables('', variables);
				expect(result).toBe('');
			});

			it('should handle content without placeholders', () => {
				const manager = new DefaultContextManager(testDir);
				const content = 'No placeholders here';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('No placeholders here');
			});

			it('should handle special regex characters in variables', () => {
				const manager = new DefaultContextManager(testDir);
				const content = 'Repo: {{repository}}';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
					repository: 'https://github.com/user/repo.git',
				};

				const result = manager.applyVariables(content, variables);
				expect(result).toBe('Repo: https://github.com/user/repo.git');
			});
		});

		describe('createFromTemplate', () => {
			it('should create file from template', () => {
				const manager = new DefaultContextManager(testDir);
				const template = '# {{projectName}}\nType: {{projectType}}';
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'ADO',
					projectType: 'CLI',
				};

				manager.createFromTemplate('TEMPLATE.md', template, variables);

				const content = readFileSync(join(testDir, 'TEMPLATE.md'), 'utf-8');
				expect(content).toContain('# ADO');
				expect(content).toContain('Type: CLI');
			});

			it('should replace all variables in template', () => {
				const manager = new DefaultContextManager(testDir);
				const template = `# {{projectName}}
Language: {{primaryLanguage}}
Repo: {{repository}}`;
				const variables: ContextVariables = {
					projectId: 'ado',
					projectName: 'ADO',
					primaryLanguage: 'TypeScript',
					repository: 'https://github.com/org/ado',
				};

				manager.createFromTemplate('PROJECT.md', template, variables);

				const content = readFileSync(join(testDir, 'PROJECT.md'), 'utf-8');
				expect(content).not.toContain('{{');
				expect(content).toContain('ADO');
				expect(content).toContain('TypeScript');
				expect(content).toContain('github.com');
			});
		});

		describe('syncForProvider', () => {
			it('should create context file if not exists', () => {
				const manager = new DefaultContextManager(testDir);
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test Project',
					projectType: 'Web App',
					primaryLanguage: 'JavaScript',
				};

				manager.syncForProvider('claude-code', 'CLAUDE.md', variables);

				expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
				const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
				expect(content).toContain('Test Project');
				expect(content).toContain('Web App');
			});

			it('should not overwrite existing context file', () => {
				const manager = new DefaultContextManager(testDir);
				const existingContent = '# Existing Claude Context\nDo not replace';
				writeFileSync(join(testDir, 'CLAUDE.md'), existingContent);

				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'New Project',
				};

				manager.syncForProvider('claude-code', 'CLAUDE.md', variables);

				const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
				expect(content).toBe(existingContent);
				expect(content).not.toContain('New Project');
			});

			it('should handle unknown context file name', () => {
				const manager = new DefaultContextManager(testDir);
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Test',
				};

				// Should not throw for unknown template
				expect(() => {
					manager.syncForProvider('custom-provider', 'CUSTOM.md', variables);
				}).not.toThrow();

				// Should not create file for unknown template
				expect(existsSync(join(testDir, 'CUSTOM.md'))).toBe(false);
			});

			it('should create GEMINI.md with template', () => {
				const manager = new DefaultContextManager(testDir);
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Gemini Project',
					projectType: 'API',
				};

				manager.syncForProvider('gemini-cli', 'GEMINI.md', variables);

				expect(existsSync(join(testDir, 'GEMINI.md'))).toBe(true);
				const content = readFileSync(join(testDir, 'GEMINI.md'), 'utf-8');
				expect(content).toContain('Gemini Project');
			});

			it('should create .cursorrules with template', () => {
				const manager = new DefaultContextManager(testDir);
				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Cursor Project',
					projectType: 'Library',
					primaryLanguage: 'Python',
				};

				manager.syncForProvider('cursor-cli', '.cursorrules', variables);

				expect(existsSync(join(testDir, '.cursorrules'))).toBe(true);
				const content = readFileSync(join(testDir, '.cursorrules'), 'utf-8');
				expect(content).toContain('Cursor Project');
				expect(content).toContain('Python');
			});

			it('should create copilot instructions with template', () => {
				const manager = new DefaultContextManager(testDir);
				const githubDir = join(testDir, '.github');
				mkdirSync(githubDir);

				const variables: ContextVariables = {
					projectId: 'test',
					projectName: 'Copilot Project',
					projectType: 'Application',
					primaryLanguage: 'Go',
				};

				manager.syncForProvider('copilot', '.github/copilot-instructions.md', variables);

				expect(existsSync(join(testDir, '.github/copilot-instructions.md'))).toBe(true);
				const content = readFileSync(join(testDir, '.github/copilot-instructions.md'), 'utf-8');
				expect(content).toContain('Copilot Project');
				expect(content).toContain('Go');
			});
		});
	});

	describe('createContextManager', () => {
		it('should create a context manager instance', () => {
			const manager = createContextManager(testDir);

			expect(manager).toBeDefined();
			expect(manager.read).toBeDefined();
			expect(manager.write).toBeDefined();
			expect(manager.exists).toBeDefined();
		});

		it('should return functional manager', () => {
			const manager = createContextManager(testDir);
			const content = '# Test';

			manager.write('TEST.md', content);

			expect(manager.exists('TEST.md')).toBe(true);
			expect(manager.read('TEST.md')).toBe(content);
		});
	});

	describe('getDefaultTemplate', () => {
		it('should return CLAUDE.md template', () => {
			const template = getDefaultTemplate('CLAUDE.md');

			expect(template).toBeDefined();
			expect(template).toContain('Project Context for Claude Code');
			expect(template).toContain('{{projectName}}');
		});

		it('should return GEMINI.md template', () => {
			const template = getDefaultTemplate('GEMINI.md');

			expect(template).toBeDefined();
			expect(template).toContain('Gemini Context');
		});

		it('should return .cursorrules template', () => {
			const template = getDefaultTemplate('.cursorrules');

			expect(template).toBeDefined();
			expect(template).toContain('Cursor Rules');
		});

		it('should return copilot instructions template', () => {
			const template = getDefaultTemplate('.github/copilot-instructions.md');

			expect(template).toBeDefined();
			expect(template).toContain('GitHub Copilot Instructions');
		});

		it('should return null for unknown template', () => {
			const template = getDefaultTemplate('UNKNOWN.md');

			expect(template).toBeNull();
		});
	});

	describe('getAvailableTemplates', () => {
		it('should return list of available templates', () => {
			const templates = getAvailableTemplates();

			expect(templates).toContain('CLAUDE.md');
			expect(templates).toContain('GEMINI.md');
			expect(templates).toContain('.cursorrules');
			expect(templates).toContain('.github/copilot-instructions.md');
		});

		it('should return array with length > 0', () => {
			const templates = getAvailableTemplates();

			expect(Array.isArray(templates)).toBe(true);
			expect(templates.length).toBeGreaterThan(0);
		});

		it('should return exactly 4 templates', () => {
			const templates = getAvailableTemplates();

			expect(templates.length).toBe(4);
		});
	});

	describe('Integration scenarios', () => {
		it('should handle complete workflow', () => {
			const manager = createContextManager(testDir);
			const variables: ContextVariables = {
				projectId: 'ado',
				projectName: 'ADO',
				projectType: 'CLI Tool',
				primaryLanguage: 'TypeScript',
				repository: 'https://github.com/org/ado',
				architecture: 'Monorepo with pnpm workspaces',
				currentFocus: 'Testing implementation',
			};

			// Sync all provider contexts
			manager.syncForProvider('claude-code', 'CLAUDE.md', variables);
			manager.syncForProvider('gemini-cli', 'GEMINI.md', variables);
			manager.syncForProvider('cursor-cli', '.cursorrules', variables);

			// Verify all files were created
			expect(manager.exists('CLAUDE.md')).toBe(true);
			expect(manager.exists('GEMINI.md')).toBe(true);
			expect(manager.exists('.cursorrules')).toBe(true);

			// Verify content
			const claudeContent = manager.read('CLAUDE.md');
			expect(claudeContent).toContain('ADO');
			expect(claudeContent).toContain('TypeScript');
			expect(claudeContent).toContain('Testing implementation');
		});

		it('should preserve manual edits on re-sync', () => {
			const manager = createContextManager(testDir);
			const variables: ContextVariables = {
				projectId: 'test',
				projectName: 'Test Project',
			};

			// Initial sync
			manager.syncForProvider('claude-code', 'CLAUDE.md', variables);

			// Manual edit
			const customContent = '# Custom Claude Context\nManually edited';
			manager.write('CLAUDE.md', customContent);

			// Re-sync should not overwrite
			manager.syncForProvider('claude-code', 'CLAUDE.md', variables);

			const content = manager.read('CLAUDE.md');
			expect(content).toBe(customContent);
		});
	});
});
