import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PROMPT_CONFIG,
	estimateTotalPromptLength,
	smartTruncatePrompt,
	validatePromptLength,
} from './prompt.js';

describe('Prompt Utilities', () => {
	describe('validatePromptLength', () => {
		it('should pass validation for short prompts', () => {
			const prompt = 'This is a short prompt';
			const result = validatePromptLength(prompt);

			expect(result.valid).toBe(true);
			expect(result.truncated).toBe(false);
			expect(result.error).toBeUndefined();
		});

		it('should warn when approaching limit', () => {
			const prompt = 'x'.repeat(DEFAULT_PROMPT_CONFIG.maxLength * 0.85);
			const result = validatePromptLength(prompt);

			expect(result.valid).toBe(true);
			expect(result.warning).toBeDefined();
			expect(result.warning).toContain('85');
		});

		it('should error for too long prompts with error strategy', () => {
			const prompt = 'x'.repeat(DEFAULT_PROMPT_CONFIG.maxLength + 1000);
			const result = validatePromptLength(prompt, {
				truncationStrategy: 'error',
			});

			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('too long');
		});

		it('should truncate from end', () => {
			const prompt = 'x'.repeat(DEFAULT_PROMPT_CONFIG.maxLength + 1000);
			const result = validatePromptLength(prompt, {
				truncationStrategy: 'truncate-end',
			});

			expect(result.valid).toBe(true);
			expect(result.truncated).toBe(true);
			expect(result.truncatedPrompt).toBeDefined();
			expect(result.truncatedPrompt?.length).toBe(DEFAULT_PROMPT_CONFIG.maxLength);
		});

		it('should truncate from start', () => {
			const prompt = 'x'.repeat(DEFAULT_PROMPT_CONFIG.maxLength + 1000);
			const result = validatePromptLength(prompt, {
				truncationStrategy: 'truncate-start',
			});

			expect(result.valid).toBe(true);
			expect(result.truncated).toBe(true);
			expect(result.truncatedPrompt?.length).toBe(DEFAULT_PROMPT_CONFIG.maxLength);
		});

		it('should truncate from middle', () => {
			const prompt = 'x'.repeat(DEFAULT_PROMPT_CONFIG.maxLength + 1000);
			const result = validatePromptLength(prompt, {
				truncationStrategy: 'truncate-middle',
			});

			expect(result.valid).toBe(true);
			expect(result.truncated).toBe(true);
			expect(result.truncatedPrompt).toBeDefined();
			expect(result.truncatedPrompt).toContain('truncated');
		});

		it('should respect custom max length', () => {
			const prompt = 'x'.repeat(1000);
			const result = validatePromptLength(prompt, {
				maxLength: 500,
				truncationStrategy: 'error',
			});

			expect(result.valid).toBe(false);
			expect(result.error).toContain('500');
		});
	});

	describe('estimateTotalPromptLength', () => {
		it('should calculate total length with no context files', () => {
			const prompt = 'Test prompt';
			const total = estimateTotalPromptLength(prompt, []);

			expect(total).toBeGreaterThan(prompt.length);
			expect(total).toBe(prompt.length + 500); // Just the overhead
		});

		it('should include context file sizes', () => {
			const prompt = 'Test prompt';
			const contextFiles = [
				{ name: 'CLAUDE.md', size: 1000 },
				{ name: 'AGENTS.md', size: 12000 },
			];
			const total = estimateTotalPromptLength(prompt, contextFiles);

			expect(total).toBeGreaterThan(prompt.length + 13000);
			// 1000 + 12000 + prompt + overhead (500) + file markers (200)
			expect(total).toBe(prompt.length + 13000 + 500 + 200);
		});
	});

	describe('smartTruncatePrompt', () => {
		it('should not truncate short prompts', () => {
			const prompt = 'Short prompt';
			const { truncated, removed } = smartTruncatePrompt(prompt, 1000);

			expect(truncated).toBe(prompt);
			expect(removed).toBe(0);
		});

		it('should preserve start and end', () => {
			const prompt = `START${'x'.repeat(10000)}END`;
			const { truncated, removed } = smartTruncatePrompt(prompt, 2000, {
				preserveStart: 500,
				preserveEnd: 500,
			});

			expect(truncated).toContain('START');
			expect(truncated).toContain('END');
			expect(truncated).toContain('[...]');
			expect(removed).toBeGreaterThan(0);
		});

		it('should adjust preservation amounts when too large', () => {
			const prompt = 'x'.repeat(10000);
			const { truncated } = smartTruncatePrompt(prompt, 100, {
				preserveStart: 1000, // More than available
				preserveEnd: 1000, // More than available
			});

			expect(truncated.length).toBeLessThanOrEqual(100);
			expect(truncated).toContain('[...]');
		});

		it('should use custom marker', () => {
			const prompt = 'x'.repeat(10000);
			const { truncated } = smartTruncatePrompt(prompt, 2000, {
				marker: '<<TRUNCATED>>',
			});

			expect(truncated).toContain('<<TRUNCATED>>');
			expect(truncated).not.toContain('[...]');
		});
	});
});
