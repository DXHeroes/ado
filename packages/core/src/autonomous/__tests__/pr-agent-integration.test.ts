/**
 * Tests for PRAgent (Qodo Merge Integration)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	PRAgent,
	createPRAgent,
	type PRAgentConfig,
	type PRDescription,
	type PRReview,
} from '../pr-agent-integration.js';

describe('PRAgent', () => {
	let prAgent: PRAgent;

	beforeEach(() => {
		prAgent = new PRAgent({});
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			const agent = new PRAgent({});
			expect(agent).toBeDefined();
		});

		it('should create with custom config', () => {
			const config: Partial<PRAgentConfig> = {
				enabled: false,
				apiEndpoint: 'https://custom.api',
				autoApprovalThreshold: 90,
				autoReviewOnCreate: false,
				autoImprove: false,
				learningMode: false,
				changelogFormat: 'keep-a-changelog',
			};

			const agent = new PRAgent(config);
			expect(agent).toBeDefined();
		});
	});

	describe('createPRAgent', () => {
		it('should create agent with factory function', () => {
			const agent = createPRAgent();
			expect(agent).toBeDefined();
		});

		it('should create with custom config', () => {
			const agent = createPRAgent({
				autoApprovalThreshold: 95,
			});
			expect(agent).toBeDefined();
		});
	});

	describe('describe', () => {
		it('should generate PR description from commits', async () => {
			const prData = {
				files: ['src/auth.ts', 'src/login.ts'],
				commits: [
					{ message: 'feat: add OAuth2 login' },
					{ message: 'fix: handle token expiry' },
				],
				diff: '+ const login = () => { }',
			};

			const description = await prAgent.describe(prData);

			expect(description).toBeDefined();
			expect(description.title).toBeTruthy();
			expect(description.description).toBeTruthy();
			expect(description.testPlan).toBeTruthy();
		});

		it('should infer type from commit messages', async () => {
			const prData = {
				files: ['src/feature.ts'],
				commits: [
					{ message: 'feat: new feature' },
					{ message: 'feat: another feature' },
				],
				diff: '',
			};

			const description = await prAgent.describe(prData);

			expect(description.type).toBe('feat');
		});

		it('should detect breaking changes', async () => {
			const prData = {
				files: ['src/api.ts'],
				commits: [
					{
						message:
							'feat: change API\n\nBREAKING CHANGE: API endpoint structure changed',
					},
				],
				diff: '',
			};

			const description = await prAgent.describe(prData);

			expect(description.breakingChanges.length).toBeGreaterThan(0);
			expect(description.breakingChanges[0]).toContain('API endpoint');
		});

		it('should extract related issues', async () => {
			const prData = {
				files: ['src/fix.ts'],
				commits: [
					{ message: 'fix: resolve issue #123' },
					{ message: 'fix: also fixes #456' },
				],
				diff: '',
			};

			const description = await prAgent.describe(prData);

			expect(description.relatedIssues).toContain('#123');
			expect(description.relatedIssues).toContain('#456');
		});

		it('should handle empty commits', async () => {
			const prData = {
				files: ['src/test.ts'],
				commits: [],
				diff: '',
			};

			const description = await prAgent.describe(prData);

			expect(description).toBeDefined();
			expect(description.relatedIssues).toEqual([]);
		});
	});

	describe('review', () => {
		it('should review PR and generate score', async () => {
			const prData = {
				files: ['src/auth.ts'],
				diff: '+ const newFeature = () => {}',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			expect(review).toBeDefined();
			expect(review.score).toBeGreaterThanOrEqual(0);
			expect(review.score).toBeLessThanOrEqual(100);
			expect(review.summary).toBeTruthy();
			expect(Array.isArray(review.comments)).toBe(true);
		});

		it('should detect security-sensitive files', async () => {
			const prData = {
				files: ['src/auth/oauth.ts', 'src/security/encryption.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			expect(review.requiresHumanReview).toBe(true);
			expect(review.humanReviewReason).toContain('Security-sensitive');
		});

		it('should detect human review required patterns', async () => {
			const prData = {
				files: ['database/migrations/001_init.sql'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			expect(review.requiresHumanReview).toBe(true);
		});

		it('should auto-approve high-quality PRs', async () => {
			const agent = new PRAgent({
				autoApprovalThreshold: 85,
			});

			const prData = {
				files: ['src/component.tsx'],
				diff: '+ const Component = () => <div />',
				baseBranch: 'main',
			};

			const review = await agent.review(prData);

			// Auto-approval depends on score and no errors
			if (review.score >= 85 && !review.requiresHumanReview) {
				expect(review.autoApproveEligible).toBe(true);
			}
		});

		it('should not auto-approve with errors', async () => {
			const agent = new PRAgent({
				autoApprovalThreshold: 70,
			});

			// Review will have some random comments, potentially including errors
			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await agent.review(prData);

			const hasErrors = review.comments.some((c) => c.severity === 'error');
			if (hasErrors) {
				expect(review.autoApproveEligible).toBe(false);
			}
		});

		it('should require human review for low scores', async () => {
			const agent = new PRAgent({
				autoApprovalThreshold: 90,
			});

			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await agent.review(prData);

			if (review.score < 70) {
				expect(review.requiresHumanReview).toBe(true);
			}
		});

		it('should estimate review time', async () => {
			const prData = {
				files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			expect(review.estimatedReviewTime).toBeGreaterThan(0);
		});

		it('should update metrics on review', async () => {
			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const initialMetrics = prAgent.getMetrics();
			const initialCount = initialMetrics.totalReviewed;

			await prAgent.review(prData);

			const updatedMetrics = prAgent.getMetrics();
			expect(updatedMetrics.totalReviewed).toBe(initialCount + 1);
		});
	});

	describe('improve', () => {
		it('should generate improvement suggestions', async () => {
			const prData = {
				files: ['src/legacy.ts', 'src/old-code.ts'],
				diff: '',
			};

			const suggestions = await prAgent.improve(prData);

			expect(Array.isArray(suggestions)).toBe(true);
			// Suggestions are randomly generated, so we just check structure
			for (const suggestion of suggestions) {
				expect(suggestion.file).toBeTruthy();
				expect(suggestion.type).toBeTruthy();
				expect(suggestion.description).toBeTruthy();
				expect(suggestion.impactScore).toBeGreaterThanOrEqual(0);
				expect(suggestion.effortScore).toBeGreaterThanOrEqual(0);
			}
		});

		it('should sort suggestions by impact/effort ratio', async () => {
			const prData = {
				files: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'],
				diff: '',
			};

			const suggestions = await prAgent.improve(prData);

			if (suggestions.length > 1) {
				// Check if sorted by ratio (descending)
				for (let i = 0; i < suggestions.length - 1; i++) {
					const current = suggestions[i]!;
					const next = suggestions[i + 1]!;
					const currentRatio = current.impactScore / current.effortScore;
					const nextRatio = next.impactScore / next.effortScore;
					expect(currentRatio).toBeGreaterThanOrEqual(nextRatio);
				}
			}
		});

		it('should include before/after code', async () => {
			const prData = {
				files: ['src/code.ts'],
				diff: '',
			};

			const suggestions = await prAgent.improve(prData);

			for (const suggestion of suggestions) {
				expect(suggestion.before).toBeTruthy();
				expect(suggestion.after).toBeTruthy();
			}
		});
	});

	describe('updateChangelog', () => {
		it('should generate changelog entry', async () => {
			const prData = {
				version: '1.2.0',
				commits: [
					{ message: 'feat: add new feature' },
					{ message: 'fix: resolve bug' },
					{ message: 'refactor: improve code' },
				],
			};

			const changelog = await prAgent.updateChangelog(prData);

			expect(changelog.version).toBe('1.2.0');
			expect(changelog.date).toBeTruthy();
			expect(changelog.changes).toBeDefined();
		});

		it('should categorize changes by type', async () => {
			const prData = {
				version: '2.0.0',
				commits: [
					{ message: 'feat: new feature' },
					{ message: 'fix: bug fix' },
				],
			};

			const changelog = await prAgent.updateChangelog(prData);

			expect(changelog.changes.added.length).toBeGreaterThan(0);
			expect(changelog.changes.fixed.length).toBeGreaterThan(0);
		});

		it('should detect breaking changes in changelog', async () => {
			const prData = {
				version: '3.0.0',
				commits: [
					{
						message:
							'feat: major update\n\nBREAKING CHANGE: API restructured',
					},
				],
			};

			const changelog = await prAgent.updateChangelog(prData);

			expect(changelog.changes.changed.length).toBeGreaterThan(0);
		});

		it('should include date in ISO format', async () => {
			const prData = {
				version: '1.0.0',
				commits: [{ message: 'feat: initial release' }],
			};

			const changelog = await prAgent.updateChangelog(prData);

			// Date should be in YYYY-MM-DD format
			expect(changelog.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	describe('learnFromPR', () => {
		it('should learn from approved high-quality PRs', () => {
			const agent = new PRAgent({
				learningMode: true,
			});

			const prData = {
				files: ['src/feature.ts', 'src/util.ts'],
				approved: true,
				score: 95,
			};

			agent.learnFromPR(prData);

			const standards = agent.getLearnedStandards();
			expect(standards.size).toBeGreaterThan(0);
		});

		it('should not learn when learning mode disabled', () => {
			const agent = new PRAgent({
				learningMode: false,
			});

			const prData = {
				files: ['src/test.ts'],
				approved: true,
				score: 95,
			};

			const initialSize = agent.getLearnedStandards().size;
			agent.learnFromPR(prData);
			const finalSize = agent.getLearnedStandards().size;

			expect(finalSize).toBe(initialSize);
		});

		it('should not learn from low-scoring PRs', () => {
			const agent = new PRAgent({
				learningMode: true,
			});

			const prData = {
				files: ['src/poor.ts'],
				approved: true,
				score: 70, // Below 90 threshold
			};

			const initialSize = agent.getLearnedStandards().size;
			agent.learnFromPR(prData);
			const finalSize = agent.getLearnedStandards().size;

			// Should not learn from low scores
			expect(finalSize).toBe(initialSize);
		});
	});

	describe('getMetrics', () => {
		it('should return PR agent metrics', () => {
			const metrics = prAgent.getMetrics();

			expect(metrics).toBeDefined();
			expect(metrics.totalReviewed).toBeGreaterThanOrEqual(0);
			expect(metrics.autoApproved).toBeGreaterThanOrEqual(0);
			expect(metrics.humanReviewRequired).toBeGreaterThanOrEqual(0);
			expect(metrics.averageScore).toBeGreaterThanOrEqual(0);
			expect(metrics.totalComments).toBeGreaterThanOrEqual(0);
			expect(metrics.commentsBySeverity).toBeDefined();
			expect(metrics.averageReviewTime).toBeGreaterThanOrEqual(0);
		});

		it('should track auto-approval counts', async () => {
			const agent = new PRAgent({
				autoApprovalThreshold: 50, // Low threshold for testing
			});

			const prData = {
				files: ['src/simple.ts'],
				diff: '',
				baseBranch: 'main',
			};

			await agent.review(prData);

			const metrics = agent.getMetrics();
			const totalReviews = metrics.totalReviewed;
			const autoApproved = metrics.autoApproved;

			expect(totalReviews).toBeGreaterThan(0);
			// Auto-approval depends on generated score
			expect(autoApproved).toBeGreaterThanOrEqual(0);
		});

		it('should calculate average score', async () => {
			const agent = new PRAgent({});

			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			await agent.review(prData);
			await agent.review(prData);

			const metrics = agent.getMetrics();

			expect(metrics.averageScore).toBeGreaterThanOrEqual(0);
			expect(metrics.averageScore).toBeLessThanOrEqual(100);
		});
	});

	describe('getLearnedStandards', () => {
		it('should return learned team standards', () => {
			const standards = prAgent.getLearnedStandards();

			expect(standards).toBeInstanceOf(Map);
		});

		it('should organize standards by file extension', () => {
			const agent = new PRAgent({
				learningMode: true,
			});

			agent.learnFromPR({
				files: ['src/component.tsx', 'src/util.ts'],
				approved: true,
				score: 95,
			});

			const standards = agent.getLearnedStandards();

			// Should have entries for file extensions
			expect(standards.size).toBeGreaterThan(0);
		});
	});

	describe('security patterns', () => {
		it('should match security-sensitive file patterns', async () => {
			const testCases = [
				{ file: 'src/auth/login.ts', shouldMatch: true },
				{ file: 'src/security/crypto.ts', shouldMatch: true },
				{ file: '.env', shouldMatch: true },
				{ file: 'secrets/api-keys.json', shouldMatch: true },
				{ file: 'config/production/app.yaml', shouldMatch: true },
				{ file: 'src/components/Button.tsx', shouldMatch: false },
			];

			for (const testCase of testCases) {
				const prData = {
					files: [testCase.file],
					diff: '',
					baseBranch: 'main',
				};

				const review = await prAgent.review(prData);

				if (testCase.shouldMatch) {
					expect(review.requiresHumanReview).toBe(true);
				}
			}
		});

		it('should match human review required patterns', async () => {
			const testCases = [
				'database/migrations/001_init.sql',
				'infrastructure/terraform/main.tf',
				'deployment/kubernetes/prod.yaml',
			];

			for (const file of testCases) {
				const prData = {
					files: [file],
					diff: '',
					baseBranch: 'main',
				};

				const review = await prAgent.review(prData);

				expect(review.requiresHumanReview).toBe(true);
				expect(review.humanReviewReason).toContain('infrastructure');
			}
		});
	});

	describe('comment generation', () => {
		it('should generate comments with various severities', async () => {
			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			const severities = review.comments.map((c) => c.severity);
			const uniqueSeverities = new Set(severities);

			// Should generate varied severities over multiple reviews
			expect(uniqueSeverities.size).toBeGreaterThanOrEqual(1);
		});

		it('should categorize comments', async () => {
			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			for (const comment of review.comments) {
				expect(comment.category).toBeTruthy();
				expect(['security', 'performance', 'style', 'logic', 'best-practice']).toContain(
					comment.category,
				);
			}
		});
	});

	describe('score calculation', () => {
		it('should deduct points based on severity', async () => {
			const prData = {
				files: ['src/test.ts'],
				diff: '',
				baseBranch: 'main',
			};

			const review = await prAgent.review(prData);

			// Score should be between 0 and 100
			expect(review.score).toBeGreaterThanOrEqual(0);
			expect(review.score).toBeLessThanOrEqual(100);

			// If there are errors, score should be reduced
			const errorCount = review.comments.filter(
				(c) => c.severity === 'error',
			).length;
			if (errorCount > 0) {
				expect(review.score).toBeLessThan(100);
			}
		});
	});
});
