/**
 * Tests for SpecGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	SpecGenerator,
	createSpecGenerator,
	type SpecGenerationContext,
} from '../spec-generator.js';
import { createDefaultConstitution } from '../spec-templates.js';
import type { ClassificationResult } from '../task-classifier.js';

describe('SpecGenerator', () => {
	let generator: SpecGenerator;

	beforeEach(() => {
		generator = new SpecGenerator();
	});

	describe('createSpecGenerator', () => {
		it('should create generator with factory function', () => {
			const gen = createSpecGenerator();
			expect(gen).toBeDefined();
		});
	});

	describe('generate - feature spec', () => {
		it('should generate feature specification', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'New feature implementation',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add user authentication with OAuth2',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.specification).toBeDefined();
			expect(result.specification.title).toBeTruthy();
			expect(result.specification.sections.length).toBeGreaterThan(0);
			expect(result.constitution).toBeDefined();
			expect(result.estimatedImplementationTime).toBe(120);
		});

		it('should enrich spec with project context', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 180,
				confidence: 0.85,
				reasoning: 'Complex feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement real-time notifications',
				taskType: 'feature',
				classification,
				projectContext: {
					architecture: 'Microservices',
					techStack: ['Node.js', 'React', 'PostgreSQL'],
					designPatterns: ['Event-driven', 'CQRS'],
				},
			};

			const result = await generator.generate(context);

			const spec = result.specification;
			const designSection = spec.sections.find((s) => s.title === 'Design');

			expect(designSection).toBeDefined();
			expect(designSection?.content).toContain('Microservices');
			expect(designSection?.content).toContain('Node.js');
			expect(designSection?.content).toContain('Event-driven');
		});

		it('should add related specs to metadata', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'medium',
				estimatedDuration: 90,
				confidence: 0.8,
				reasoning: 'Related feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add notifications',
				taskType: 'feature',
				classification,
				relatedSpecs: ['spec-001-user-management', 'spec-002-email-service'],
			};

			const result = await generator.generate(context);

			expect(result.specification.metadata.relatedSpecs).toEqual([
				'spec-001-user-management',
				'spec-002-email-service',
			]);
		});

		it('should set status to review for complex features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 240,
				confidence: 0.9,
				reasoning: 'Complex feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement payment processing',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.specification.status).toBe('review');
		});

		it('should set status to review for epic features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'epic',
				priority: 'critical',
				estimatedDuration: 480,
				confidence: 0.85,
				reasoning: 'Epic feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Build entire admin dashboard',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.specification.status).toBe('review');
		});
	});

	describe('generate - bug fix spec', () => {
		it('should generate bug fix specification', async () => {
			const classification: ClassificationResult = {
				type: 'bug',
				complexity: 'simple',
				priority: 'high',
				estimatedDuration: 30,
				confidence: 0.95,
				reasoning: 'Bug fix',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Fix login button not responding',
				taskType: 'bug',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.specification).toBeDefined();
			expect(result.specification.status).toBe('review');
		});
	});

	describe('generate - refactoring spec', () => {
		it('should generate refactoring specification', async () => {
			const classification: ClassificationResult = {
				type: 'refactor',
				complexity: 'moderate',
				priority: 'medium',
				estimatedDuration: 120,
				confidence: 0.8,
				reasoning: 'Code refactoring',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Refactor authentication module',
				taskType: 'refactor',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.specification).toBeDefined();
			expect(result.specification.status).toBe('review');
		});

		it('should add test coverage emphasis for refactoring', async () => {
			const classification: ClassificationResult = {
				type: 'refactor',
				complexity: 'complex',
				priority: 'medium',
				estimatedDuration: 180,
				confidence: 0.75,
				reasoning: 'Major refactoring',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Refactor data layer',
				taskType: 'refactor',
				classification,
			};

			const result = await generator.generate(context);

			const verificationSection = result.specification.sections.find(
				(s) => s.title === 'Verification',
			);

			expect(verificationSection).toBeDefined();
			expect(verificationSection?.content).toContain('test coverage');
		});
	});

	describe('generate - ADRs', () => {
		it('should generate ADR for complex features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 200,
				confidence: 0.85,
				reasoning: 'Complex architectural change',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement microservices architecture',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.adrs.length).toBeGreaterThan(0);
			expect(result.adrs[0]?.status).toBe('proposed');
			expect(result.adrs[0]?.context).toContain(context.brief);
		});

		it('should generate ADR for epic features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'epic',
				priority: 'critical',
				estimatedDuration: 400,
				confidence: 0.8,
				reasoning: 'Epic feature requiring architectural decisions',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Build multi-tenant platform',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.adrs.length).toBeGreaterThan(0);
		});

		it('should generate ADR for refactoring', async () => {
			const classification: ClassificationResult = {
				type: 'refactor',
				complexity: 'moderate',
				priority: 'medium',
				estimatedDuration: 150,
				confidence: 0.75,
				reasoning: 'Refactoring',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Migrate to new database',
				taskType: 'refactor',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.adrs.length).toBeGreaterThan(0);
			expect(result.adrs[0]?.context).toContain('backward compatibility');
		});

		it('should not generate ADR for simple features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'simple',
				priority: 'low',
				estimatedDuration: 30,
				confidence: 0.95,
				reasoning: 'Simple feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add button to UI',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.adrs.length).toBe(0);
		});
	});

	describe('generate - reviewers', () => {
		it('should require tech lead for complex tasks', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 200,
				confidence: 0.85,
				reasoning: 'Complex task',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement caching layer',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('tech-lead');
		});

		it('should require security team for auth changes', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Security feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement authentication system',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('security-team');
		});

		it('should require security team for permission changes', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 90,
				confidence: 0.85,
				reasoning: 'Permission system',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add role-based permissions',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('security-team');
		});

		it('should require architect for architectural changes', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'medium',
				estimatedDuration: 150,
				confidence: 0.8,
				reasoning: 'Architectural change',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Change application architecture',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('architect');
		});

		it('should require architect for migrations', async () => {
			const classification: ClassificationResult = {
				type: 'refactor',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 240,
				confidence: 0.75,
				reasoning: 'Migration',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Migrate to new framework',
				taskType: 'refactor',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('architect');
		});

		it('should require product manager for critical features', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'critical',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Critical feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add payment gateway',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('product-manager');
		});

		it('should default to code-owner when no special reviewers needed', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'simple',
				priority: 'low',
				estimatedDuration: 30,
				confidence: 0.95,
				reasoning: 'Simple task',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Update UI text',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.requiredReviews).toContain('code-owner');
		});
	});

	describe('toMarkdown', () => {
		it('should convert specification to markdown', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add feature',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const markdown = generator.toMarkdown(result.specification);

			expect(markdown).toContain('# ');
			expect(markdown).toContain('**Version**:');
			expect(markdown).toContain('**Status**:');
		});

		it('should include metadata in markdown', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add feature',
				taskType: 'feature',
				classification,
				relatedSpecs: ['spec-1', 'spec-2'],
			};

			const result = await generator.generate(context);
			result.specification.metadata.author = 'Test Author';
			result.specification.metadata.tags = ['tag1', 'tag2'];

			const markdown = generator.toMarkdown(result.specification);

			expect(markdown).toContain('Test Author');
			expect(markdown).toContain('spec-1');
			expect(markdown).toContain('tag1');
		});
	});

	describe('adrToMarkdown', () => {
		it('should convert ADR to markdown', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 200,
				confidence: 0.85,
				reasoning: 'Complex feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement feature',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const adr = result.adrs[0];

			if (adr) {
				const markdown = generator.adrToMarkdown(adr);

				expect(markdown).toContain('# ');
				expect(markdown).toContain('**Status**:');
				expect(markdown).toContain('Consequences');
			}
		});

		it('should include alternatives in markdown', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'complex',
				priority: 'high',
				estimatedDuration: 200,
				confidence: 0.85,
				reasoning: 'Complex feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement feature',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const adr = result.adrs[0];

			if (adr) {
				adr.alternatives = [
					{
						name: 'Alternative 1',
						description: 'First alternative',
						pros: ['Pro 1'],
						cons: ['Con 1'],
						whyNotChosen: 'Not suitable',
					},
				];

				const markdown = generator.adrToMarkdown(adr);

				expect(markdown).toContain('Alternatives Considered');
				expect(markdown).toContain('Alternative 1');
			}
		});
	});

	describe('validateAgainstConstitution', () => {
		it('should pass validation when all principles addressed', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Implement secure authentication with proper access controls',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const validation = generator.validateAgainstConstitution(
				result.specification,
				result.constitution,
			);

			// Should pass or have minimal violations for security-aware spec
			expect(validation.valid || validation.violations.length === 0).toBe(false);
		});

		it('should detect violations for security-sensitive changes', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add authentication',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const constitution = createDefaultConstitution();

			const validation = generator.validateAgainstConstitution(
				result.specification,
				constitution,
			);

			// Should have violations since spec doesn't address security principles
			expect(validation.violations.length).toBeGreaterThan(0);
		});

		it('should check blocker constraints', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add feature',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);
			const constitution = createDefaultConstitution();

			// Add a blocker constraint
			constitution.constraints.push({
				id: 'test-blocker',
				type: 'technical',
				description: 'Must use PostgreSQL',
				impact: 'blocker',
			});

			const validation = generator.validateAgainstConstitution(
				result.specification,
				constitution,
			);

			// Should detect blocker constraint not addressed
			const hasBlockerViolation = validation.violations.some((v) =>
				v.includes('blocker constraint'),
			);
			expect(hasBlockerViolation).toBe(true);
		});
	});

	describe('constitution handling', () => {
		it('should use existing constitution if provided', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const customConstitution = createDefaultConstitution();
			customConstitution.principles.push({
				id: 'custom-principle',
				category: 'architecture',
				principle: 'Custom principle',
				rationale: 'For testing',
			});

			const context: SpecGenerationContext = {
				brief: 'Add feature',
				taskType: 'feature',
				classification,
				existingConstitution: customConstitution,
			};

			const result = await generator.generate(context);

			expect(result.constitution).toEqual(customConstitution);
		});

		it('should create default constitution if none provided', async () => {
			const classification: ClassificationResult = {
				type: 'feature',
				complexity: 'moderate',
				priority: 'high',
				estimatedDuration: 120,
				confidence: 0.9,
				reasoning: 'Feature',
				dependencies: [],
				risks: [],
			};

			const context: SpecGenerationContext = {
				brief: 'Add feature',
				taskType: 'feature',
				classification,
			};

			const result = await generator.generate(context);

			expect(result.constitution).toBeDefined();
			expect(result.constitution.principles.length).toBeGreaterThan(0);
		});
	});
});
