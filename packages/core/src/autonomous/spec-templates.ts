/**
 * Specification Templates
 *
 * Templates for generating specifications in the Spec-Kit workflow.
 */

export interface SpecificationSection {
	title: string;
	content: string;
	required: boolean;
}

export interface Specification {
	title: string;
	version: string;
	createdAt: string;
	updatedAt: string;
	status: 'draft' | 'review' | 'approved' | 'implemented';
	sections: SpecificationSection[];
	metadata: {
		author?: string;
		reviewers?: string[];
		relatedSpecs?: string[];
		tags?: string[];
	};
}

/**
 * Constitution (immutable principles)
 */
export interface Constitution {
	principles: Principle[];
	constraints: Constraint[];
	qualityGates: QualityGate[];
}

export interface Principle {
	id: string;
	category: 'architecture' | 'security' | 'performance' | 'usability' | 'maintainability';
	principle: string;
	rationale: string;
	examples?: string[];
}

export interface Constraint {
	id: string;
	type: 'technical' | 'business' | 'regulatory';
	description: string;
	impact: 'blocker' | 'critical' | 'important' | 'nice-to-have';
}

export interface QualityGate {
	id: string;
	name: string;
	criteria: string[];
	automated: boolean;
	blocksMerge: boolean;
}

/**
 * Architecture Decision Record (ADR)
 */
export interface ADR {
	id: string;
	title: string;
	status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
	date: string;
	context: string;
	decision: string;
	consequences: {
		positive: string[];
		negative: string[];
		risks: string[];
	};
	alternatives?: Alternative[];
	supersedes?: string;
	supersededBy?: string;
}

export interface Alternative {
	name: string;
	description: string;
	pros: string[];
	cons: string[];
	whyNotChosen: string;
}

/**
 * Feature Specification Template
 */
export function createFeatureSpec(brief: string): Specification {
	return {
		title: 'Feature Specification',
		version: '1.0.0',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		status: 'draft',
		sections: [
			{
				title: 'Overview',
				content: `# Overview\n\n${brief}\n\n## Goals\n\n- \n\n## Non-Goals\n\n- \n`,
				required: true,
			},
			{
				title: 'Requirements',
				content: `# Requirements\n\n## Functional Requirements\n\n1. \n\n## Non-Functional Requirements\n\n1. \n`,
				required: true,
			},
			{
				title: 'Design',
				content: `# Design\n\n## Architecture\n\n## Data Models\n\n## API Contracts\n\n## User Interface\n`,
				required: true,
			},
			{
				title: 'Implementation Plan',
				content: `# Implementation Plan\n\n## Phases\n\n### Phase 1: Foundation\n\n### Phase 2: Core Features\n\n### Phase 3: Polish & Testing\n\n## Dependencies\n\n## Risks & Mitigations\n`,
				required: true,
			},
			{
				title: 'Testing Strategy',
				content: `# Testing Strategy\n\n## Unit Tests\n\n## Integration Tests\n\n## E2E Tests\n\n## Performance Tests\n\n## Security Tests\n`,
				required: true,
			},
			{
				title: 'Acceptance Criteria',
				content: `# Acceptance Criteria\n\n- [ ] \n`,
				required: true,
			},
		],
		metadata: {
			tags: ['feature', 'specification'],
		},
	};
}

/**
 * Bug Fix Specification Template
 */
export function createBugFixSpec(brief: string): Specification {
	return {
		title: 'Bug Fix Specification',
		version: '1.0.0',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		status: 'draft',
		sections: [
			{
				title: 'Problem Description',
				content: `# Problem Description\n\n${brief}\n\n## Steps to Reproduce\n\n1. \n\n## Expected Behavior\n\n## Actual Behavior\n\n## Impact\n`,
				required: true,
			},
			{
				title: 'Root Cause Analysis',
				content: `# Root Cause Analysis\n\n## Investigation\n\n## Root Cause\n\n## Why It Happened\n`,
				required: true,
			},
			{
				title: 'Proposed Fix',
				content: `# Proposed Fix\n\n## Solution\n\n## Files to Modify\n\n## Breaking Changes\n`,
				required: true,
			},
			{
				title: 'Testing Plan',
				content: `# Testing Plan\n\n## Regression Tests\n\n## Validation Steps\n\n## Edge Cases\n`,
				required: true,
			},
			{
				title: 'Verification',
				content: `# Verification\n\n- [ ] Bug is fixed\n- [ ] No regressions introduced\n- [ ] Tests added to prevent recurrence\n`,
				required: true,
			},
		],
		metadata: {
			tags: ['bug', 'fix', 'specification'],
		},
	};
}

/**
 * Refactoring Specification Template
 */
export function createRefactoringSpec(brief: string): Specification {
	return {
		title: 'Refactoring Specification',
		version: '1.0.0',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		status: 'draft',
		sections: [
			{
				title: 'Current State',
				content: `# Current State\n\n${brief}\n\n## Problems\n\n- \n\n## Technical Debt\n\n- \n`,
				required: true,
			},
			{
				title: 'Desired State',
				content: `# Desired State\n\n## Goals\n\n- \n\n## Success Metrics\n\n- \n`,
				required: true,
			},
			{
				title: 'Refactoring Strategy',
				content: `# Refactoring Strategy\n\n## Approach\n\n## Phases\n\n## Backward Compatibility\n`,
				required: true,
			},
			{
				title: 'Risk Assessment',
				content: `# Risk Assessment\n\n## Risks\n\n1. \n\n## Mitigation Strategies\n\n1. \n`,
				required: true,
			},
			{
				title: 'Verification',
				content: `# Verification\n\n- [ ] All tests pass\n- [ ] Performance metrics unchanged or improved\n- [ ] No behavioral changes\n- [ ] Code complexity reduced\n`,
				required: true,
			},
		],
		metadata: {
			tags: ['refactoring', 'specification'],
		},
	};
}

/**
 * Default Constitution Template
 */
export function createDefaultConstitution(): Constitution {
	return {
		principles: [
			{
				id: 'arch-001',
				category: 'architecture',
				principle: 'Separation of Concerns',
				rationale:
					'Each module should have a single, well-defined responsibility',
				examples: [
					'Business logic separate from presentation',
					'Data access separate from business rules',
				],
			},
			{
				id: 'arch-002',
				category: 'architecture',
				principle: 'Dependency Inversion',
				rationale: 'Depend on abstractions, not concrete implementations',
				examples: ['Use interfaces for external services', 'Plugin architecture'],
			},
			{
				id: 'sec-001',
				category: 'security',
				principle: 'Defense in Depth',
				rationale: 'Multiple layers of security controls',
				examples: [
					'Input validation + parameterized queries',
					'Authentication + authorization + rate limiting',
				],
			},
			{
				id: 'sec-002',
				category: 'security',
				principle: 'Least Privilege',
				rationale:
					'Grant minimum permissions necessary for functionality',
				examples: [
					'Service accounts with limited scope',
					'Role-based access control',
				],
			},
			{
				id: 'perf-001',
				category: 'performance',
				principle: 'Optimize for Common Case',
				rationale: 'Fast path for 95% of requests',
				examples: ['Caching frequently accessed data', 'Index common queries'],
			},
			{
				id: 'usability-001',
				category: 'usability',
				principle: 'Fail Fast with Clear Errors',
				rationale: 'Detect errors early and provide actionable messages',
				examples: [
					'Validate input at API boundary',
					'Structured error responses',
				],
			},
			{
				id: 'maint-001',
				category: 'maintainability',
				principle: 'Code for Readability',
				rationale: 'Code is read more often than written',
				examples: [
					'Self-documenting variable names',
					'Small, focused functions',
				],
			},
		],
		constraints: [
			{
				id: 'tech-001',
				type: 'technical',
				description: 'Must maintain backward compatibility with API v1',
				impact: 'blocker',
			},
			{
				id: 'tech-002',
				type: 'technical',
				description: 'Response time must be under 200ms for p95',
				impact: 'critical',
			},
			{
				id: 'business-001',
				type: 'business',
				description: 'Must support offline mode for mobile apps',
				impact: 'important',
			},
			{
				id: 'regulatory-001',
				type: 'regulatory',
				description: 'Must comply with GDPR data retention policies',
				impact: 'blocker',
			},
		],
		qualityGates: [
			{
				id: 'qg-001',
				name: 'Code Quality',
				criteria: [
					'Test coverage ≥ 80%',
					'No critical security vulnerabilities',
					'No linting errors',
					'Type safety enforced',
				],
				automated: true,
				blocksMerge: true,
			},
			{
				id: 'qg-002',
				name: 'Performance',
				criteria: [
					'Bundle size increase < 10%',
					'No performance regression in benchmarks',
					'Lighthouse score ≥ 90',
				],
				automated: true,
				blocksMerge: false,
			},
			{
				id: 'qg-003',
				name: 'Documentation',
				criteria: [
					'API changes documented',
					'Breaking changes in CHANGELOG',
					'Examples updated',
				],
				automated: false,
				blocksMerge: true,
			},
		],
	};
}

/**
 * ADR Template
 */
export function createADRTemplate(title: string): ADR {
	return {
		id: `adr-${Date.now()}`,
		title,
		status: 'proposed',
		date: new Date().toISOString(),
		context: '## Context\n\nDescribe the context and problem statement.',
		decision: '## Decision\n\nDescribe the decision and its rationale.',
		consequences: {
			positive: ['Benefit 1', 'Benefit 2'],
			negative: ['Tradeoff 1', 'Tradeoff 2'],
			risks: ['Risk 1', 'Risk 2'],
		},
		alternatives: [
			{
				name: 'Alternative 1',
				description: 'Description of alternative approach',
				pros: ['Pro 1'],
				cons: ['Con 1'],
				whyNotChosen: 'Reason why this approach was not selected',
			},
		],
	};
}
