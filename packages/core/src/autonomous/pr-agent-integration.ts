/**
 * PR-Agent (Qodo Merge) Integration
 *
 * Automated PR review and improvement using Qodo Merge.
 *
 * Features:
 * - /describe: Generate comprehensive PR descriptions
 * - /review: Line-by-line code review feedback
 * - /improve: Code improvement suggestions
 * - /update_changelog: Auto-generate changelog entries
 * - Learning team standards
 * - Auto-approval thresholds
 * - Security-sensitive file review
 */

export interface PRAgentConfig {
	/**
	 * Enable PR-Agent
	 */
	enabled: boolean;

	/**
	 * API endpoint
	 */
	apiEndpoint: string;

	/**
	 * API key
	 */
	apiKey?: string | undefined;

	/**
	 * Auto-approval threshold (0-100)
	 */
	autoApprovalThreshold: number;

	/**
	 * Enable auto-review on PR creation
	 */
	autoReviewOnCreate: boolean;

	/**
	 * Enable auto-improve suggestions
	 */
	autoImprove: boolean;

	/**
	 * Security-sensitive file patterns
	 */
	securitySensitivePatterns: string[];

	/**
	 * Always require human review for these patterns
	 */
	humanReviewRequired: string[];

	/**
	 * Learning mode (adapts to team standards)
	 */
	learningMode: boolean;

	/**
	 * Changelog format
	 */
	changelogFormat: 'conventional-commits' | 'keep-a-changelog' | 'custom';
}

export interface PRDescription {
	/**
	 * PR title
	 */
	title: string;

	/**
	 * PR description
	 */
	description: string;

	/**
	 * Type of change
	 */
	type: 'feat' | 'fix' | 'docs' | 'refactor' | 'test' | 'chore';

	/**
	 * Breaking changes
	 */
	breakingChanges: string[];

	/**
	 * Related issues
	 */
	relatedIssues: string[];

	/**
	 * Test plan
	 */
	testPlan: string;
}

export interface ReviewComment {
	/**
	 * File path
	 */
	file: string;

	/**
	 * Line number
	 */
	line: number;

	/**
	 * Comment severity
	 */
	severity: 'error' | 'warning' | 'suggestion' | 'info';

	/**
	 * Comment text
	 */
	comment: string;

	/**
	 * Suggested fix
	 */
	suggestedFix?: string | undefined;

	/**
	 * Category
	 */
	category: 'security' | 'performance' | 'style' | 'logic' | 'best-practice';
}

export interface PRReview {
	/**
	 * Overall score (0-100)
	 */
	score: number;

	/**
	 * Review summary
	 */
	summary: string;

	/**
	 * Comments
	 */
	comments: ReviewComment[];

	/**
	 * Auto-approve eligible
	 */
	autoApproveEligible: boolean;

	/**
	 * Requires human review
	 */
	requiresHumanReview: boolean;

	/**
	 * Reason for human review
	 */
	humanReviewReason?: string | undefined;

	/**
	 * Estimated review time (minutes)
	 */
	estimatedReviewTime: number;
}

export interface ImprovementSuggestion {
	/**
	 * File path
	 */
	file: string;

	/**
	 * Line start
	 */
	lineStart: number;

	/**
	 * Line end
	 */
	lineEnd: number;

	/**
	 * Suggestion type
	 */
	type: 'refactor' | 'optimize' | 'simplify' | 'modernize' | 'security';

	/**
	 * Description
	 */
	description: string;

	/**
	 * Before code
	 */
	before: string;

	/**
	 * After code
	 */
	after: string;

	/**
	 * Impact score (0-10)
	 */
	impactScore: number;

	/**
	 * Effort score (0-10, lower = easier)
	 */
	effortScore: number;
}

export interface ChangelogEntry {
	/**
	 * Version
	 */
	version: string;

	/**
	 * Release date
	 */
	date: string;

	/**
	 * Changes by type
	 */
	changes: {
		added: string[];
		changed: string[];
		deprecated: string[];
		removed: string[];
		fixed: string[];
		security: string[];
	};
}

export interface PRAgentMetrics {
	/**
	 * Total PRs reviewed
	 */
	totalReviewed: number;

	/**
	 * Auto-approved count
	 */
	autoApproved: number;

	/**
	 * Human review required count
	 */
	humanReviewRequired: number;

	/**
	 * Average score
	 */
	averageScore: number;

	/**
	 * Total comments
	 */
	totalComments: number;

	/**
	 * Comments by severity
	 */
	commentsBySeverity: {
		error: number;
		warning: number;
		suggestion: number;
		info: number;
	};

	/**
	 * Average review time (minutes)
	 */
	averageReviewTime: number;
}

/**
 * PR-Agent integration
 */
export class PRAgent {
	private config: PRAgentConfig;
	private metrics: PRAgentMetrics = {
		totalReviewed: 0,
		autoApproved: 0,
		humanReviewRequired: 0,
		averageScore: 0,
		totalComments: 0,
		commentsBySeverity: {
			error: 0,
			warning: 0,
			suggestion: 0,
			info: 0,
		},
		averageReviewTime: 0,
	};
	private teamStandards: Map<string, string[]> = new Map();

	constructor(config: Partial<PRAgentConfig>) {
		this.config = {
			enabled: true,
			apiEndpoint: 'https://api.qodo.ai',
			autoApprovalThreshold: 85,
			autoReviewOnCreate: true,
			autoImprove: true,
			securitySensitivePatterns: [
				'**/auth/**',
				'**/security/**',
				'**/*.env',
				'**/secrets/**',
				'**/config/production/**',
			],
			humanReviewRequired: [
				'**/database/migrations/**',
				'**/infrastructure/**',
				'**/deployment/**',
			],
			learningMode: true,
			changelogFormat: 'conventional-commits',
			...config,
		};
	}

	/**
	 * Generate PR description
	 */
	async describe(prData: {
		files: string[];
		commits: Array<{ message: string }>;
		diff: string;
	}): Promise<PRDescription> {
		// In real implementation, this would call PR-Agent API
		// For now, simulate description generation

		// Analyze commit messages
		const commitMessages = prData.commits.map((c) => c.message);
		const type = this.inferChangeType(commitMessages);

		// Extract breaking changes
		const breakingChanges = commitMessages
			.filter((msg) => msg.includes('BREAKING CHANGE'))
			.map((msg) => msg.split('BREAKING CHANGE:')[1]?.trim() ?? '');

		// Extract issue references
		const relatedIssues = commitMessages
			.flatMap((msg) => msg.match(/#\d+/g) ?? [])
			.filter((v, i, a) => a.indexOf(v) === i);

		return {
			title: this.generateTitle(type, commitMessages),
			description: this.generateDescription(prData),
			type,
			breakingChanges,
			relatedIssues,
			testPlan: this.generateTestPlan(prData.files),
		};
	}

	/**
	 * Review PR
	 */
	async review(prData: {
		files: string[];
		diff: string;
		baseBranch: string;
	}): Promise<PRReview> {
		this.metrics.totalReviewed++;

		// Check for security-sensitive files
		const securitySensitive = this.checkSecuritySensitive(prData.files);
		const humanReviewRequired = this.checkHumanReviewRequired(prData.files);

		// Generate review comments
		const comments = await this.generateReviewComments(prData);

		// Calculate score
		const score = this.calculateScore(comments);

		// Update metrics
		this.updateMetrics(comments, score);

		// Determine if auto-approve eligible
		const autoApproveEligible =
			score >= this.config.autoApprovalThreshold &&
			!securitySensitive &&
			!humanReviewRequired &&
			comments.filter((c) => c.severity === 'error').length === 0;

		if (autoApproveEligible) {
			this.metrics.autoApproved++;
		}

		const requiresHumanReview = humanReviewRequired || securitySensitive || score < 70;
		if (requiresHumanReview) {
			this.metrics.humanReviewRequired++;
		}

		return {
			score,
			summary: this.generateReviewSummary(comments, score),
			comments,
			autoApproveEligible,
			requiresHumanReview,
			humanReviewReason: requiresHumanReview
				? this.getHumanReviewReason(securitySensitive, humanReviewRequired, score)
				: undefined,
			estimatedReviewTime: this.estimateReviewTime(comments.length, prData.files.length),
		};
	}

	/**
	 * Generate improvement suggestions
	 */
	async improve(prData: { files: string[]; diff: string }): Promise<ImprovementSuggestion[]> {
		// In real implementation, this would call PR-Agent /improve
		// For now, simulate suggestions

		const suggestions: ImprovementSuggestion[] = [];

		// Analyze each file
		for (const file of prData.files) {
			// Simulate finding improvement opportunities
			if (Math.random() > 0.5) {
				suggestions.push({
					file,
					lineStart: Math.floor(Math.random() * 100) + 1,
					lineEnd: Math.floor(Math.random() * 100) + 10,
					type: this.randomSuggestionType(),
					description: 'Consider refactoring this code for better maintainability',
					before: 'const x = foo(); const y = bar(x);',
					after: 'const y = bar(foo());',
					impactScore: Math.floor(Math.random() * 5) + 3,
					effortScore: Math.floor(Math.random() * 5) + 1,
				});
			}
		}

		// Sort by impact/effort ratio
		return suggestions.sort((a, b) => {
			const aRatio = a.impactScore / a.effortScore;
			const bRatio = b.impactScore / b.effortScore;
			return bRatio - aRatio;
		});
	}

	/**
	 * Update changelog
	 */
	async updateChangelog(prData: {
		version: string;
		commits: Array<{ message: string }>;
	}): Promise<ChangelogEntry> {
		const entry: ChangelogEntry = {
			version: prData.version,
			date: new Date().toISOString().split('T')[0]!,
			changes: {
				added: [],
				changed: [],
				deprecated: [],
				removed: [],
				fixed: [],
				security: [],
			},
		};

		// Parse commits using conventional commits format
		for (const commit of prData.commits) {
			const msg = commit.message;

			if (msg.startsWith('feat:')) {
				entry.changes.added.push(msg.replace('feat:', '').trim());
			} else if (msg.startsWith('fix:')) {
				entry.changes.fixed.push(msg.replace('fix:', '').trim());
			} else if (msg.startsWith('refactor:')) {
				entry.changes.changed.push(msg.replace('refactor:', '').trim());
			} else if (msg.includes('BREAKING CHANGE')) {
				entry.changes.changed.push(msg.split('BREAKING CHANGE:')[1]?.trim() ?? '');
			}
		}

		return entry;
	}

	/**
	 * Learn from approved PR
	 */
	learnFromPR(prData: { files: string[]; approved: boolean; score: number }): void {
		if (!this.config.learningMode) {
			return;
		}

		// In real implementation, this would update ML model
		// For now, store patterns

		for (const file of prData.files) {
			const ext = file.split('.').pop() ?? '';
			const standards = this.teamStandards.get(ext) ?? [];

			if (prData.approved && prData.score >= 90) {
				standards.push(`high-quality-${Date.now()}`);
				this.teamStandards.set(ext, standards);
			}
		}
	}

	/**
	 * Check if files are security-sensitive
	 */
	private checkSecuritySensitive(files: string[]): boolean {
		return files.some((file) =>
			this.config.securitySensitivePatterns.some((pattern) => {
				const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
				return regex.test(file);
			}),
		);
	}

	/**
	 * Check if human review is required
	 */
	private checkHumanReviewRequired(files: string[]): boolean {
		return files.some((file) =>
			this.config.humanReviewRequired.some((pattern) => {
				const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
				return regex.test(file);
			}),
		);
	}

	/**
	 * Generate review comments
	 */
	private async generateReviewComments(_prData: {
		files: string[];
		diff: string;
		baseBranch: string;
	}): Promise<ReviewComment[]> {
		// In real implementation, this would analyze code using PR-Agent
		// For now, simulate comments

		const comments: ReviewComment[] = [];
		const commentCount = Math.floor(Math.random() * 10) + 3;

		for (let i = 0; i < commentCount; i++) {
			const severity = this.randomSeverity();
			comments.push({
				file: 'src/example.ts',
				line: Math.floor(Math.random() * 100) + 1,
				severity,
				comment: this.generateCommentText(severity),
				category: this.randomCategory(),
			});
		}

		return comments;
	}

	/**
	 * Calculate PR score
	 */
	private calculateScore(comments: ReviewComment[]): number {
		let score = 100;

		for (const comment of comments) {
			switch (comment.severity) {
				case 'error':
					score -= 15;
					break;
				case 'warning':
					score -= 5;
					break;
				case 'suggestion':
					score -= 2;
					break;
				case 'info':
					score -= 0;
					break;
			}
		}

		return Math.max(0, Math.min(100, score));
	}

	/**
	 * Update metrics
	 */
	private updateMetrics(comments: ReviewComment[], score: number): void {
		this.metrics.totalComments += comments.length;

		for (const comment of comments) {
			this.metrics.commentsBySeverity[comment.severity]++;
		}

		// Update average score
		this.metrics.averageScore =
			(this.metrics.averageScore * (this.metrics.totalReviewed - 1) + score) /
			this.metrics.totalReviewed;

		// Update average review time
		const reviewTime = this.estimateReviewTime(comments.length, 5);
		this.metrics.averageReviewTime =
			(this.metrics.averageReviewTime * (this.metrics.totalReviewed - 1) + reviewTime) /
			this.metrics.totalReviewed;
	}

	/**
	 * Estimate review time
	 */
	private estimateReviewTime(commentCount: number, fileCount: number): number {
		return Math.ceil(fileCount * 2 + commentCount * 1.5); // minutes
	}

	/**
	 * Generate review summary
	 */
	private generateReviewSummary(comments: ReviewComment[], score: number): string {
		const errorCount = comments.filter((c) => c.severity === 'error').length;
		const warningCount = comments.filter((c) => c.severity === 'warning').length;

		let summary = `PR scored ${score}/100. `;

		if (errorCount > 0) {
			summary += `${errorCount} error(s) must be fixed. `;
		}
		if (warningCount > 0) {
			summary += `${warningCount} warning(s) should be addressed. `;
		}
		if (score >= 90) {
			summary += 'Excellent code quality!';
		} else if (score >= 70) {
			summary += 'Good code quality with minor improvements needed.';
		} else {
			summary += 'Significant improvements required before merging.';
		}

		return summary;
	}

	/**
	 * Get human review reason
	 */
	private getHumanReviewReason(
		securitySensitive: boolean,
		humanReviewRequired: boolean,
		score: number,
	): string {
		if (securitySensitive) {
			return 'Security-sensitive files require human review';
		}
		if (humanReviewRequired) {
			return 'Critical infrastructure changes require human review';
		}
		if (score < 70) {
			return `Score too low (${score}/100) for auto-approval`;
		}
		return 'Human review required';
	}

	/**
	 * Infer change type from commits
	 */
	private inferChangeType(
		commits: string[],
	): 'feat' | 'fix' | 'docs' | 'refactor' | 'test' | 'chore' {
		const types = {
			feat: 0,
			fix: 0,
			docs: 0,
			refactor: 0,
			test: 0,
			chore: 0,
		};

		for (const commit of commits) {
			if (commit.startsWith('feat:')) types.feat++;
			else if (commit.startsWith('fix:')) types.fix++;
			else if (commit.startsWith('docs:')) types.docs++;
			else if (commit.startsWith('refactor:')) types.refactor++;
			else if (commit.startsWith('test:')) types.test++;
			else types.chore++;
		}

		return Object.entries(types).reduce((a, b) => (b[1] > a[1] ? b : a))[0] as
			| 'feat'
			| 'fix'
			| 'docs'
			| 'refactor'
			| 'test'
			| 'chore';
	}

	/**
	 * Generate PR title
	 */
	private generateTitle(type: string, commits: string[]): string {
		const firstCommit = commits[0] ?? 'Update code';
		return `${type}: ${firstCommit.replace(/^(feat|fix|docs|refactor|test|chore):/, '').trim()}`;
	}

	/**
	 * Generate PR description
	 */
	private generateDescription(_prData: { files: string[]; commits: Array<{ message: string }> }): string {
		return `## Summary\n\nThis PR includes code changes.\n\n## Changes\n\n- Updated implementation\n\n## Test Plan\n\n- Run tests`;
	}

	/**
	 * Generate test plan
	 */
	private generateTestPlan(_files: string[]): string {
		return '- Run unit tests\n- Run integration tests\n- Manual testing';
	}

	/**
	 * Random severity
	 */
	private randomSeverity(): 'error' | 'warning' | 'suggestion' | 'info' {
		const rand = Math.random();
		if (rand < 0.1) return 'error';
		if (rand < 0.3) return 'warning';
		if (rand < 0.7) return 'suggestion';
		return 'info';
	}

	/**
	 * Random category
	 */
	private randomCategory(): 'security' | 'performance' | 'style' | 'logic' | 'best-practice' {
		const categories: Array<'security' | 'performance' | 'style' | 'logic' | 'best-practice'> = [
			'security',
			'performance',
			'style',
			'logic',
			'best-practice',
		];
		return categories[Math.floor(Math.random() * categories.length)]!;
	}

	/**
	 * Random suggestion type
	 */
	private randomSuggestionType(): 'refactor' | 'optimize' | 'simplify' | 'modernize' | 'security' {
		const types: Array<'refactor' | 'optimize' | 'simplify' | 'modernize' | 'security'> = [
			'refactor',
			'optimize',
			'simplify',
			'modernize',
			'security',
		];
		return types[Math.floor(Math.random() * types.length)]!;
	}

	/**
	 * Generate comment text
	 */
	private generateCommentText(severity: string): string {
		const templates = {
			error: 'This code has a critical issue that must be fixed',
			warning: 'Consider addressing this potential issue',
			suggestion: 'This could be improved',
			info: 'For your information',
		};
		return templates[severity as keyof typeof templates] ?? 'Review comment';
	}

	/**
	 * Get metrics
	 */
	getMetrics(): PRAgentMetrics {
		return { ...this.metrics };
	}

	/**
	 * Get learned standards
	 */
	getLearnedStandards(): Map<string, string[]> {
		return new Map(this.teamStandards);
	}
}

/**
 * Create PR-Agent instance
 */
export function createPRAgent(config?: Partial<PRAgentConfig>): PRAgent {
	return new PRAgent(config ?? {});
}
