/**
 * Stuck Detector
 *
 * Detects when AI agent is stuck in loops or not making progress.
 * Based on OpenHands research: 3 identical errors = stuck.
 */

export interface AttemptRecord {
	attemptNumber: number;
	timestamp: string;
	errorMessage?: string;
	changedFiles: string[];
	testsPassing: boolean;
	metrics?: {
		linesChanged: number;
		filesModified: number;
		testsAdded: number;
	};
}

export interface StuckDetectionResult {
	isStuck: boolean;
	reason: StuckReason | null;
	confidence: number; // 0-1
	recommendation: string;
	evidence: string[];
}

export type StuckReason =
	| 'identical_errors'
	| 'no_progress'
	| 'timeout'
	| 'oscillating'
	| 'test_failure_loop';

/**
 * Stuck detector configuration
 */
export interface StuckDetectorConfig {
	/**
	 * Number of iterations without progress before stuck
	 */
	maxIterationsWithoutProgress: number;

	/**
	 * Time limit for complex tasks (minutes)
	 */
	complexTaskTimeoutMinutes: number;

	/**
	 * Number of identical errors before stuck
	 */
	identicalErrorThreshold: number;

	/**
	 * Similarity threshold for error messages (0-1)
	 */
	errorSimilarityThreshold: number;

	/**
	 * Minimum lines changed to count as progress
	 */
	minimumProgressLines: number;
}

/**
 * Stuck detector
 */
export class StuckDetector {
	private config: StuckDetectorConfig;
	private attempts: Map<string, AttemptRecord[]> = new Map();

	constructor(config?: Partial<StuckDetectorConfig>) {
		this.config = {
			maxIterationsWithoutProgress: 5,
			complexTaskTimeoutMinutes: 30,
			identicalErrorThreshold: 3,
			errorSimilarityThreshold: 0.85,
			minimumProgressLines: 5,
			...config,
		};
	}

	/**
	 * Record an attempt
	 */
	recordAttempt(taskId: string, attempt: AttemptRecord): void {
		if (!this.attempts.has(taskId)) {
			this.attempts.set(taskId, []);
		}

		this.attempts.get(taskId)?.push(attempt);
	}

	/**
	 * Check if task is stuck
	 */
	checkIfStuck(taskId: string, taskStartTime: string): StuckDetectionResult {
		const attempts = this.attempts.get(taskId) ?? [];

		if (attempts.length === 0) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: 'Continue execution',
				evidence: [],
			};
		}

		// Check 1: Identical errors
		const identicalResult = this.checkIdenticalErrors(attempts);
		if (identicalResult.isStuck) {
			return identicalResult;
		}

		// Check 2: No progress
		const progressResult = this.checkNoProgress(attempts);
		if (progressResult.isStuck) {
			return progressResult;
		}

		// Check 3: Timeout
		const timeoutResult = this.checkTimeout(taskStartTime, attempts);
		if (timeoutResult.isStuck) {
			return timeoutResult;
		}

		// Check 4: Oscillating (undoing previous changes)
		const oscillatingResult = this.checkOscillating(attempts);
		if (oscillatingResult.isStuck) {
			return oscillatingResult;
		}

		// Check 5: Test failure loop
		const testLoopResult = this.checkTestFailureLoop(attempts);
		if (testLoopResult.isStuck) {
			return testLoopResult;
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: 'Continue execution',
			evidence: [],
		};
	}

	/**
	 * Check for identical error messages
	 */
	private checkIdenticalErrors(
		attempts: AttemptRecord[],
	): StuckDetectionResult {
		const recentAttempts = attempts.slice(-this.config.identicalErrorThreshold);

		if (recentAttempts.length < this.config.identicalErrorThreshold) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		// Get error messages
		const errors = recentAttempts
			.map((a) => a.errorMessage)
			.filter((e): e is string => e !== undefined);

		if (errors.length < this.config.identicalErrorThreshold) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		// Check if all errors are highly similar
		const firstError = errors[0];
		if (!firstError) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		const allSimilar = errors.every((error) => {
			const similarity = this.calculateSimilarity(firstError, error);
			return similarity >= this.config.errorSimilarityThreshold;
		});

		if (allSimilar) {
			return {
				isStuck: true,
				reason: 'identical_errors',
				confidence: 0.95,
				recommendation:
					'Try a different approach or escalate to human review',
				evidence: [
					`Same error repeated ${errors.length} times`,
					`Error: "${firstError.substring(0, 100)}..."`,
				],
			};
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: '',
			evidence: [],
		};
	}

	/**
	 * Check for no progress
	 */
	private checkNoProgress(attempts: AttemptRecord[]): StuckDetectionResult {
		const recentAttempts = attempts.slice(
			-this.config.maxIterationsWithoutProgress,
		);

		if (recentAttempts.length < this.config.maxIterationsWithoutProgress) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		// Check if any attempt made meaningful progress
		const hasProgress = recentAttempts.some((attempt) => {
			const linesChanged = attempt.metrics?.linesChanged ?? 0;
			return (
				linesChanged >= this.config.minimumProgressLines &&
				attempt.testsPassing
			);
		});

		if (!hasProgress) {
			const evidence = recentAttempts.map(
				(a, i) =>
					`Attempt ${i + 1}: ${a.metrics?.linesChanged ?? 0} lines changed, tests passing: ${a.testsPassing}`,
			);

			return {
				isStuck: true,
				reason: 'no_progress',
				confidence: 0.85,
				recommendation:
					'No meaningful progress in last 5 iterations. Consider breaking down the task or escalating.',
				evidence,
			};
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: '',
			evidence: [],
		};
	}

	/**
	 * Check for timeout
	 */
	private checkTimeout(
		taskStartTime: string,
		attempts: AttemptRecord[],
	): StuckDetectionResult {
		const startTime = new Date(taskStartTime).getTime();
		const now = Date.now();
		const elapsedMinutes = (now - startTime) / (1000 * 60);

		if (elapsedMinutes > this.config.complexTaskTimeoutMinutes) {
			const lastAttempt = attempts[attempts.length - 1];

			return {
				isStuck: true,
				reason: 'timeout',
				confidence: 0.9,
				recommendation: `Task exceeded ${this.config.complexTaskTimeoutMinutes} minute timeout. Consider partial completion or human intervention.`,
				evidence: [
					`Elapsed time: ${Math.round(elapsedMinutes)} minutes`,
					`Attempts made: ${attempts.length}`,
					`Tests passing: ${lastAttempt?.testsPassing ? 'yes' : 'no'}`,
				],
			};
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: '',
			evidence: [],
		};
	}

	/**
	 * Check for oscillating behavior (undoing previous changes)
	 */
	private checkOscillating(attempts: AttemptRecord[]): StuckDetectionResult {
		if (attempts.length < 4) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		const recentAttempts = attempts.slice(-4);
		const fileSets = recentAttempts.map((a) => new Set(a.changedFiles));

		// Check if alternating between same file sets
		const set1 = fileSets[0];
		const set2 = fileSets[1];
		const set3 = fileSets[2];
		const set4 = fileSets[3];

		if (!set1 || !set2 || !set3 || !set4) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		const setsEqual = (a: Set<string>, b: Set<string>) =>
			a.size === b.size && [...a].every((x) => b.has(x));

		if (
			setsEqual(set1, set3) &&
			setsEqual(set2, set4) &&
			!setsEqual(set1, set2)
		) {
			return {
				isStuck: true,
				reason: 'oscillating',
				confidence: 0.8,
				recommendation:
					'Agent is oscillating between two states. Try a different strategy.',
				evidence: [
					`Alternating between ${set1.size} and ${set2.size} file changes`,
					`Files: ${[...set1].join(', ')}`,
				],
			};
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: '',
			evidence: [],
		};
	}

	/**
	 * Check for test failure loop
	 */
	private checkTestFailureLoop(
		attempts: AttemptRecord[],
	): StuckDetectionResult {
		if (attempts.length < 4) {
			return {
				isStuck: false,
				reason: null,
				confidence: 0,
				recommendation: '',
				evidence: [],
			};
		}

		const recentAttempts = attempts.slice(-4);

		// All recent attempts have failing tests
		const allFailing = recentAttempts.every((a) => !a.testsPassing);

		if (allFailing) {
			return {
				isStuck: true,
				reason: 'test_failure_loop',
				confidence: 0.85,
				recommendation:
					'Tests consistently failing. Review test requirements or escalate.',
				evidence: [
					`Last ${recentAttempts.length} attempts failed tests`,
					'Consider: wrong approach, missing dependencies, or unclear requirements',
				],
			};
		}

		return {
			isStuck: false,
			reason: null,
			confidence: 0,
			recommendation: '',
			evidence: [],
		};
	}

	/**
	 * Calculate similarity between two strings (Levenshtein distance)
	 */
	private calculateSimilarity(str1: string, str2: string): number {
		// Normalize strings
		const s1 = str1.toLowerCase().trim();
		const s2 = str2.toLowerCase().trim();

		if (s1 === s2) return 1;

		const len1 = s1.length;
		const len2 = s2.length;

		if (len1 === 0) return len2 === 0 ? 1 : 0;
		if (len2 === 0) return 0;

		// Create distance matrix
		const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
			Array(len2 + 1).fill(0),
		);

		// Initialize first column and row
		for (let i = 0; i <= len1; i++) {
			const row = matrix[i];
			if (row) row[0] = i;
		}
		for (let j = 0; j <= len2; j++) {
			const row = matrix[0];
			if (row) row[j] = j;
		}

		// Fill matrix
		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
				const row = matrix[i];
				const prevRow = matrix[i - 1];
				if (row && prevRow) {
					row[j] = Math.min(
						(prevRow[j] ?? 0) + 1, // deletion
						(row[j - 1] ?? 0) + 1, // insertion
						(prevRow[j - 1] ?? 0) + cost, // substitution
					);
				}
			}
		}

		const maxLen = Math.max(len1, len2);
		const lastRow = matrix[len1];
		const distance = lastRow?.[len2] ?? 0;
		return 1 - distance / maxLen;
	}

	/**
	 * Clear attempts for a task
	 */
	clearAttempts(taskId: string): void {
		this.attempts.delete(taskId);
	}

	/**
	 * Get attempt history for a task
	 */
	getAttempts(taskId: string): AttemptRecord[] {
		return this.attempts.get(taskId) ?? [];
	}
}

/**
 * Create stuck detector
 */
export function createStuckDetector(
	config?: Partial<StuckDetectorConfig>,
): StuckDetector {
	return new StuckDetector(config);
}
