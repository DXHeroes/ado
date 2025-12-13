/**
 * Specification Generator (Spec-Kit)
 *
 * Implements documentation-first workflow inspired by GitHub's Spec-Kit.
 * Follows the 4-phase process: /specify → /plan → /tasks → /implement
 */

import type { TaskNode } from './dependency-graph.js';
import {
	type ADR,
	type Constitution,
	type Specification,
	createADRTemplate,
	createBugFixSpec,
	createDefaultConstitution,
	createFeatureSpec,
	createRefactoringSpec,
} from './spec-templates.js';
import type { ClassificationResult } from './task-classifier.js';

export interface SpecGenerationContext {
	brief: string;
	taskType: TaskNode['type'];
	classification: ClassificationResult;
	existingConstitution?: Constitution;
	relatedSpecs?: string[];
	projectContext?: {
		architecture?: string;
		techStack?: string[];
		designPatterns?: string[];
	};
}

export interface SpecGenerationResult {
	specification: Specification;
	constitution: Constitution;
	adrs: ADR[];
	estimatedImplementationTime: number;
	requiredReviews: string[];
}

/**
 * Specification Generator
 */
export class SpecGenerator {
	/**
	 * Generate specification from brief
	 */
	async generate(context: SpecGenerationContext): Promise<SpecGenerationResult> {
		// Select appropriate template based on task type
		const specification = this.createSpecification(context);

		// Use existing or create default constitution
		const constitution = context.existingConstitution ?? createDefaultConstitution();

		// Generate ADRs for significant decisions
		const adrs = this.generateADRs(context, specification);

		// Estimate implementation time
		const estimatedImplementationTime = context.classification.estimatedDuration;

		// Determine required reviews
		const requiredReviews = this.determineReviewers(context);

		return {
			specification,
			constitution,
			adrs,
			estimatedImplementationTime,
			requiredReviews,
		};
	}

	/**
	 * Create specification based on task type
	 */
	private createSpecification(context: SpecGenerationContext): Specification {
		switch (context.taskType) {
			case 'feature':
				return this.enrichFeatureSpec(createFeatureSpec(context.brief), context);
			case 'bug':
				return this.enrichBugFixSpec(createBugFixSpec(context.brief), context);
			case 'refactor':
				return this.enrichRefactoringSpec(createRefactoringSpec(context.brief), context);
			default:
				return createFeatureSpec(context.brief);
		}
	}

	/**
	 * Enrich feature specification with context
	 */
	private enrichFeatureSpec(spec: Specification, context: SpecGenerationContext): Specification {
		// Add project context to design section
		if (context.projectContext) {
			const designSection = spec.sections.find((s) => s.title === 'Design');
			if (designSection) {
				let contextInfo = '\n## Project Context\n\n';

				if (context.projectContext.architecture) {
					contextInfo += `**Architecture**: ${context.projectContext.architecture}\n\n`;
				}

				if (context.projectContext.techStack) {
					contextInfo += `**Tech Stack**: ${context.projectContext.techStack.join(', ')}\n\n`;
				}

				if (context.projectContext.designPatterns) {
					contextInfo += `**Design Patterns**: ${context.projectContext.designPatterns.join(', ')}\n\n`;
				}

				designSection.content += contextInfo;
			}
		}

		// Add related specs
		if (context.relatedSpecs && context.relatedSpecs.length > 0) {
			spec.metadata.relatedSpecs = context.relatedSpecs;
		}

		// Set status based on complexity
		if (
			context.classification.complexity === 'epic' ||
			context.classification.complexity === 'complex'
		) {
			spec.status = 'review'; // Requires review before implementation
		}

		return spec;
	}

	/**
	 * Enrich bug fix specification
	 */
	private enrichBugFixSpec(spec: Specification, _context: SpecGenerationContext): Specification {
		// Bug fixes can proceed directly to implementation after review
		spec.status = 'review';
		return spec;
	}

	/**
	 * Enrich refactoring specification
	 */
	private enrichRefactoringSpec(
		spec: Specification,
		context: SpecGenerationContext,
	): Specification {
		// Refactoring always requires review
		spec.status = 'review';

		// Add emphasis on test coverage
		const testingSection = spec.sections.find((s) => s.title === 'Verification');
		if (testingSection && context.classification.complexity !== 'simple') {
			testingSection.content +=
				'\n- [ ] Baseline test coverage documented\n- [ ] All tests pass after refactoring\n- [ ] Performance benchmarks show no regression\n';
		}

		return spec;
	}

	/**
	 * Generate ADRs for architectural decisions
	 */
	private generateADRs(context: SpecGenerationContext, specification: Specification): ADR[] {
		const adrs: ADR[] = [];

		// Generate ADR for complex features that introduce new patterns
		if (
			context.taskType === 'feature' &&
			(context.classification.complexity === 'complex' ||
				context.classification.complexity === 'epic')
		) {
			const adr = createADRTemplate(`Implement ${specification.title}`);
			adr.context = `## Context\n\n${context.brief}\n\nThis feature requires architectural decisions about implementation approach.`;
			adr.status = 'proposed';
			adrs.push(adr);
		}

		// Generate ADR for refactoring
		if (context.taskType === 'refactor') {
			const adr = createADRTemplate('Refactoring Approach');
			adr.context = `## Context\n\n${context.brief}\n\nRefactoring requires careful consideration of backward compatibility and migration strategy.`;
			adr.status = 'proposed';
			adrs.push(adr);
		}

		return adrs;
	}

	/**
	 * Determine required reviewers based on context
	 */
	private determineReviewers(context: SpecGenerationContext): string[] {
		const reviewers: string[] = [];

		// Always require tech lead for complex tasks
		if (
			context.classification.complexity === 'complex' ||
			context.classification.complexity === 'epic'
		) {
			reviewers.push('tech-lead');
		}

		// Require security review for security-related changes
		if (
			context.brief.toLowerCase().includes('auth') ||
			context.brief.toLowerCase().includes('security') ||
			context.brief.toLowerCase().includes('permission')
		) {
			reviewers.push('security-team');
		}

		// Require architect review for architectural changes
		if (
			context.brief.toLowerCase().includes('architecture') ||
			context.brief.toLowerCase().includes('migration') ||
			context.taskType === 'refactor'
		) {
			reviewers.push('architect');
		}

		// Require product review for critical features
		if (context.classification.priority === 'critical' && context.taskType === 'feature') {
			reviewers.push('product-manager');
		}

		return reviewers.length > 0 ? reviewers : ['code-owner'];
	}

	/**
	 * Convert specification to markdown
	 */
	toMarkdown(spec: Specification): string {
		let markdown = '';

		// Header
		markdown += `# ${spec.title}\n\n`;
		markdown += `**Version**: ${spec.version}  \n`;
		markdown += `**Status**: ${spec.status}  \n`;
		markdown += `**Created**: ${new Date(spec.createdAt).toLocaleDateString()}  \n`;
		markdown += `**Updated**: ${new Date(spec.updatedAt).toLocaleDateString()}  \n\n`;

		// Metadata
		if (spec.metadata.author) {
			markdown += `**Author**: ${spec.metadata.author}  \n`;
		}
		if (spec.metadata.reviewers && spec.metadata.reviewers.length > 0) {
			markdown += `**Reviewers**: ${spec.metadata.reviewers.join(', ')}  \n`;
		}
		if (spec.metadata.tags && spec.metadata.tags.length > 0) {
			markdown += `**Tags**: ${spec.metadata.tags.join(', ')}  \n`;
		}
		if (spec.metadata.relatedSpecs && spec.metadata.relatedSpecs.length > 0) {
			markdown += `**Related Specs**: ${spec.metadata.relatedSpecs.join(', ')}  \n`;
		}

		markdown += '\n---\n\n';

		// Sections
		for (const section of spec.sections) {
			markdown += section.content;
			markdown += '\n\n';
		}

		return markdown;
	}

	/**
	 * Convert ADR to markdown
	 */
	adrToMarkdown(adr: ADR): string {
		let markdown = '';

		markdown += `# ${adr.title}\n\n`;
		markdown += `**ID**: ${adr.id}  \n`;
		markdown += `**Status**: ${adr.status}  \n`;
		markdown += `**Date**: ${new Date(adr.date).toLocaleDateString()}  \n\n`;

		if (adr.supersedes) {
			markdown += `**Supersedes**: ${adr.supersedes}  \n\n`;
		}
		if (adr.supersededBy) {
			markdown += `**Superseded by**: ${adr.supersededBy}  \n\n`;
		}

		markdown += '---\n\n';

		// Context
		markdown += `${adr.context}\n\n`;

		// Decision
		markdown += `${adr.decision}\n\n`;

		// Consequences
		markdown += '## Consequences\n\n';
		markdown += '### Positive\n\n';
		for (const pos of adr.consequences.positive) {
			markdown += `- ${pos}\n`;
		}
		markdown += '\n### Negative\n\n';
		for (const neg of adr.consequences.negative) {
			markdown += `- ${neg}\n`;
		}
		markdown += '\n### Risks\n\n';
		for (const risk of adr.consequences.risks) {
			markdown += `- ${risk}\n`;
		}

		// Alternatives
		if (adr.alternatives && adr.alternatives.length > 0) {
			markdown += '\n## Alternatives Considered\n\n';
			for (const alt of adr.alternatives) {
				markdown += `### ${alt.name}\n\n`;
				markdown += `${alt.description}\n\n`;
				markdown += '**Pros:**\n';
				for (const pro of alt.pros) {
					markdown += `- ${pro}\n`;
				}
				markdown += '\n**Cons:**\n';
				for (const con of alt.cons) {
					markdown += `- ${con}\n`;
				}
				markdown += `\n**Why not chosen**: ${alt.whyNotChosen}\n\n`;
			}
		}

		return markdown;
	}

	/**
	 * Validate specification against constitution
	 */
	validateAgainstConstitution(
		spec: Specification,
		constitution: Constitution,
	): { valid: boolean; violations: string[] } {
		const violations: string[] = [];

		// Check if specification addresses key principles
		const specContent = this.toMarkdown(spec).toLowerCase();

		// Check security principles if relevant
		const hasSecurityImplications =
			specContent.includes('auth') ||
			specContent.includes('security') ||
			specContent.includes('permission') ||
			specContent.includes('access');

		if (hasSecurityImplications) {
			const securityPrinciples = constitution.principles.filter((p) => p.category === 'security');
			for (const principle of securityPrinciples) {
				const addressed = specContent.includes(principle.principle.toLowerCase());
				if (!addressed) {
					violations.push(`Security principle not addressed: ${principle.principle}`);
				}
			}
		}

		// Check constraints
		for (const constraint of constitution.constraints) {
			if (constraint.impact === 'blocker') {
				// Ensure blocker constraints are mentioned
				const mentioned = specContent.includes(constraint.description.toLowerCase());
				if (!mentioned) {
					violations.push(`blocker constraint not addressed: ${constraint.description}`);
				}
			}
		}

		return {
			valid: violations.length === 0,
			violations,
		};
	}
}

/**
 * Create specification generator
 */
export function createSpecGenerator(): SpecGenerator {
	return new SpecGenerator();
}
