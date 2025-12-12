# PR-Agent (Qodo Merge) Integration Design

## Přehled

Architektonický design pro integraci PR-Agent (Qodo Merge) - AI-powered code review tool, který automatizuje review workflow, učí se z team standards a poskytuje line-by-line feedback.

## Proč PR-Agent?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Code Review Tool Comparison                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    Manual Review    GitHub Actions    PR-Agent (Qodo)
                    ─────────────    ──────────────    ───────────────
Speed               Slow (hours)     Fast (minutes)    Fast (seconds)
Context-Aware       Yes              Limited           Yes
Learns Standards    Yes              No                Yes
Line-by-Line        Yes              No                Yes
Auto-Fix            No               Limited           Yes
Cost                High (human)     Low (CI minutes)  Medium (API)

PR-Agent (Qodo Merge) Features:
- Automatic PR descriptions
- Line-by-line code review
- Suggested improvements
- Security vulnerability detection
- Changelog generation
- Learns from team feedback
```

## PR-Agent Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PR-Agent Integration Workflow                           │
└─────────────────────────────────────────────────────────────────────────────┘

ADO creates PR
       │
       ▼
┌──────────────────────────────────────┐
│   PR-Agent: /describe                │
│                                      │
│ Auto-generates:                      │
│ - PR title                           │
│ - Summary                            │
│ - Changed files breakdown            │
│ - Test coverage changes              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   PR-Agent: /review                  │
│                                      │
│ Analyzes:                            │
│ - Code quality                       │
│ - Security issues                    │
│ - Performance concerns               │
│ - Best practices                     │
│                                      │
│ Provides:                            │
│ - Line-by-line comments              │
│ - Severity ratings                   │
│ - Suggested fixes                    │
└──────────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        │             │
 Issues found    No issues
        │             │
        ▼             │
┌──────────────────┐  │
│ PR-Agent:        │  │
│ /improve         │  │
│                  │  │
│ Suggests:        │  │
│ - Code changes   │  │
│ - Refactorings   │  │
│ - Optimizations  │  │
└──────┬───────────┘  │
       │              │
       └──────┬───────┘
              │
              ▼
┌──────────────────────────────────────┐
│   PR-Agent: /update_changelog        │
│                                      │
│ Generates:                           │
│ - CHANGELOG.md entry                 │
│ - Semantic version bump              │
│ - Release notes                      │
└──────────────┬───────────────────────┘
               │
               ▼
    Human approval (if needed)
               │
               ▼
         Merge to main
```

## PR-Agent Commands

### /describe

```typescript
// packages/core/src/pr-agent/describe-command.ts
export class DescribeCommand {
  async execute(pr: PullRequest): Promise<PRDescription> {
    const response = await this.prAgent.describe({
      owner: pr.repository.owner,
      repo: pr.repository.name,
      pull_number: pr.number,

      // Configuration
      enable_pr_type: true,
      enable_summary: true,
      enable_walkthrough: true,
      enable_semantic_files_types: true,
    });

    return {
      title: response.title,
      summary: response.summary,
      type: response.pr_type, // feature, fix, docs, etc.
      walkthrough: response.walkthrough,
      filesChanged: response.files_changed,
      testCoverage: response.test_coverage,
    };
  }
}

// Example output:
const description = {
  title: "[Feature] Add Stripe payment integration",
  summary: `This PR implements Stripe payment processing with:
- Payment intent creation
- Webhook handling for payment events
- Transaction storage in database
- Error handling and retry logic`,

  type: "feature",

  walkthrough: [
    {
      file: "src/services/payment.ts",
      changes: "New PaymentService class with processPayment() and handleWebhook() methods",
    },
    {
      file: "src/routes/payment.ts",
      changes: "Express routes for /payment/create and /webhook/stripe",
    },
    {
      file: "tests/payment.test.ts",
      changes: "Unit tests for payment service (87% coverage)",
    },
  ],

  filesChanged: {
    added: 3,
    modified: 2,
    deleted: 0,
  },

  testCoverage: {
    before: 82,
    after: 85,
    diff: +3,
  },
};
```

### /review

```typescript
// packages/core/src/pr-agent/review-command.ts
export class ReviewCommand {
  async execute(pr: PullRequest): Promise<ReviewResult> {
    const response = await this.prAgent.review({
      owner: pr.repository.owner,
      repo: pr.repository.name,
      pull_number: pr.number,

      // Review configuration
      require_score_review: true,
      require_tests_review: true,
      require_security_review: true,
      require_estimate_effort_to_review: true,

      // Line-by-line review
      enable_inline_suggestions: true,
    });

    return {
      score: response.score, // 0-100
      effort: response.estimated_effort, // Easy, Medium, Hard
      summary: response.review_summary,
      issues: response.issues,
      suggestions: response.inline_suggestions,
    };
  }
}

// Example output:
const review = {
  score: 78,
  effort: "Medium",

  summary: {
    strengths: [
      "Good test coverage (87%)",
      "Proper error handling",
      "Clear separation of concerns",
    ],
    concerns: [
      "Missing input validation in payment amount",
      "Hardcoded Stripe API version",
      "No rate limiting for webhook endpoint",
    ],
  },

  issues: [
    {
      severity: "high",
      file: "src/services/payment.ts",
      line: 42,
      type: "security",
      message: "Payment amount not validated. Add minimum/maximum checks.",
      suggestion: `if (amount < 50 || amount > 1000000) {
  throw new PaymentError('Invalid amount');
}`,
    },
    {
      severity: "medium",
      file: "src/routes/payment.ts",
      line: 18,
      type: "performance",
      message: "Webhook endpoint has no rate limiting. Add express-rate-limit.",
      suggestion: `import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});

router.post('/webhook/stripe', webhookLimiter, handleWebhook);`,
    },
  ],

  inlineSuggestions: [
    {
      file: "src/services/payment.ts",
      line: 15,
      original: "const STRIPE_VERSION = '2023-10-16';",
      suggested: "const STRIPE_VERSION = process.env.STRIPE_API_VERSION || '2023-10-16';",
      reason: "Avoid hardcoding API version, use environment variable",
    },
  ],
};
```

### /improve

```typescript
// packages/core/src/pr-agent/improve-command.ts
export class ImproveCommand {
  async execute(pr: PullRequest): Promise<ImprovementSuggestions> {
    const response = await this.prAgent.improve({
      owner: pr.repository.owner,
      repo: pr.repository.name,
      pull_number: pr.number,

      // Improvement types
      enable_code_suggestions: true,
      enable_refactorings: true,
      num_code_suggestions: 5,
    });

    return {
      suggestions: response.code_suggestions,
      refactorings: response.refactorings,
      optimizations: response.optimizations,
    };
  }
}

// Example output:
const improvements = {
  suggestions: [
    {
      title: "Extract validation logic",
      file: "src/services/payment.ts",
      lines: [42, 55],
      suggestion: `// Extract to separate validator
class PaymentValidator {
  static validate(amount: number, customerId: string): void {
    if (amount < 50) throw new Error('Minimum $0.50');
    if (amount > 1000000) throw new Error('Maximum $10,000');
    if (!customerId) throw new Error('Customer ID required');
  }
}

// Then use:
PaymentValidator.validate(amount, customerId);`,
      benefit: "Improves testability and reusability",
    },
    {
      title: "Use async/await consistently",
      file: "src/routes/payment.ts",
      lines: [28, 35],
      suggestion: `// Instead of .then()/.catch()
try {
  const result = await paymentService.processPayment(amount, customerId);
  res.json(result);
} catch (error) {
  res.status(500).json({ error: error.message });
}`,
      benefit: "More readable error handling",
    },
  ],

  refactorings: [
    {
      title: "Split PaymentService into smaller services",
      reason: "PaymentService has grown to 400 lines with multiple responsibilities",
      suggestion: "Consider splitting into: PaymentIntentService, WebhookService, RefundService",
    },
  ],

  optimizations: [
    {
      title: "Cache Stripe customer lookups",
      file: "src/services/payment.ts",
      suggestion: "Use Redis to cache customer data (1-hour TTL) to reduce Stripe API calls",
      estimatedImprovement: "~40% reduction in Stripe API calls",
    },
  ],
};
```

### /update_changelog

```typescript
// packages/core/src/pr-agent/changelog-command.ts
export class ChangelogCommand {
  async execute(pr: PullRequest): Promise<ChangelogEntry> {
    const response = await this.prAgent.updateChangelog({
      owner: pr.repository.owner,
      repo: pr.repository.name,
      pull_number: pr.number,

      // Changelog configuration
      changelog_from_title: true,
      changelog_from_commits: true,
    });

    return {
      entry: response.changelog_entry,
      version: response.suggested_version,
      category: response.category,
    };
  }
}

// Example output:
const changelog = {
  entry: `### Added
- Stripe payment integration with webhook support
- Payment validation (minimum $0.50, maximum $10,000)
- Transaction storage in PostgreSQL
- Comprehensive error handling for payment failures`,

  version: "1.5.0", // Suggested semantic version bump
  category: "feature",
};

// Appends to CHANGELOG.md:
/*
## [1.5.0] - 2025-01-16

### Added
- Stripe payment integration with webhook support
- Payment validation (minimum $0.50, maximum $10,000)
- Transaction storage in PostgreSQL
- Comprehensive error handling for payment failures

### Fixed
- None

### Changed
- None
*/
```

## Learning Team Standards

```typescript
// packages/core/src/pr-agent/learning-engine.ts
export class PRAgentLearningEngine {
  /**
   * PR-Agent learns from human feedback
   */
  async learnFromFeedback(
    pr: PullRequest,
    review: ReviewResult,
    humanFeedback: HumanFeedback
  ): Promise<void> {
    // Store feedback for future reviews
    await this.feedbackStore.store({
      prId: pr.id,
      aiReview: review,
      humanFeedback: {
        // Which suggestions were helpful?
        acceptedSuggestions: humanFeedback.accepted,
        rejectedSuggestions: humanFeedback.rejected,

        // What did human reviewer add?
        additionalComments: humanFeedback.comments,

        // What did human prioritize differently?
        severityAdjustments: humanFeedback.severityChanges,
      },
      timestamp: new Date(),
    });

    // Update team standards model
    await this.updateStandards(humanFeedback);
  }

  private async updateStandards(feedback: HumanFeedback): Promise<void> {
    // Examples of learned standards:
    // - "This team always requires JSDoc for exported functions"
    // - "Error messages must follow format: [CODE] Message"
    // - "Database queries must use prepared statements"
    // - "API responses must include request_id field"

    const patterns = await this.extractPatterns(feedback);

    for (const pattern of patterns) {
      await this.standardsDb.upsert({
        pattern: pattern.rule,
        confidence: pattern.frequency,
        examples: pattern.examples,
      });
    }
  }
}
```

## Auto-Approval Rules

```typescript
// packages/core/src/pr-agent/auto-approval.ts
export interface AutoApprovalRules {
  // Safe changes that can be auto-approved
  safeChanges: {
    docsOnly: boolean;           // Only .md files changed
    testOnly: boolean;            // Only test files changed
    dependencyUpdate: boolean;    // package.json updates with passing tests
    formattingOnly: boolean;      // Only formatting changes (linter)
  };

  // Size thresholds
  maxFilesChanged: number;
  maxLinesChanged: number;
  maxComplexity: number;

  // Quality gates
  requireTestCoverage: boolean;
  minCoverageIncrease: number;  // Percent
  requirePassingCI: boolean;
  requireSecurityScan: boolean;

  // Review score threshold
  minReviewScore: number;  // 0-100

  // NEVER auto-approve
  requireHumanFor: {
    securityFiles: boolean;    // auth, crypto, payment
    schemaChanges: boolean;    // database migrations
    apiContracts: boolean;     // OpenAPI spec changes
    configChanges: boolean;    // production config
  };
}

export class AutoApprovalEngine {
  async canAutoApprove(
    pr: PullRequest,
    review: ReviewResult,
    rules: AutoApprovalRules
  ): Promise<{ canApprove: boolean; reason: string }> {
    // 1. Check if it's a safe change type
    if (rules.safeChanges.docsOnly && this.isDocsOnly(pr)) {
      return { canApprove: true, reason: 'Documentation-only change' };
    }

    // 2. Check size limits
    if (pr.filesChanged > rules.maxFilesChanged) {
      return {
        canApprove: false,
        reason: `Too many files changed: ${pr.filesChanged} > ${rules.maxFilesChanged}`,
      };
    }

    // 3. Check review score
    if (review.score < rules.minReviewScore) {
      return {
        canApprove: false,
        reason: `Review score too low: ${review.score} < ${rules.minReviewScore}`,
      };
    }

    // 4. NEVER auto-approve security-sensitive files
    if (this.hasSecurityFiles(pr) && rules.requireHumanFor.securityFiles) {
      return {
        canApprove: false,
        reason: 'Contains security-sensitive files',
      };
    }

    // 5. Check quality gates
    if (rules.requireTestCoverage && !this.hasAdequateCoverage(pr, rules.minCoverageIncrease)) {
      return {
        canApprove: false,
        reason: 'Insufficient test coverage',
      };
    }

    return { canApprove: true, reason: 'All auto-approval criteria met' };
  }

  private hasSecurityFiles(pr: PullRequest): boolean {
    const securityPatterns = [
      /auth|authentication|authorization/i,
      /security|crypto|encrypt/i,
      /payment|billing|checkout/i,
      /\.env|secrets|credentials/i,
    ];

    return pr.files.some(file =>
      securityPatterns.some(pattern => pattern.test(file.path))
    );
  }
}
```

## Configuration

```yaml
# ado.config.yaml
prAgent:
  enabled: true

  # Qodo Merge API configuration
  api:
    url: https://api.qodo.ai
    token: ${QODO_API_TOKEN}

  # Automatic PR description
  describe:
    enabled: true
    onPRCreation: true
    includeWalkthrough: true
    includeTestCoverage: true

  # Automated code review
  review:
    enabled: true
    onPRCreation: true
    requireScoreReview: true
    requireSecurityReview: true
    minScore: 70  # PRs below this score require human review

    # Line-by-line suggestions
    inlineSuggestions: true
    maxSuggestions: 10

  # Code improvements
  improve:
    enabled: true
    runAfterReview: true
    enableRefactorings: true
    maxSuggestions: 5

  # Changelog generation
  changelog:
    enabled: true
    autoUpdate: true
    filePath: CHANGELOG.md
    conventionalCommits: true  # Follow conventional commits

  # Auto-approval rules
  autoApproval:
    enabled: true

    safeChanges:
      docsOnly: true
      testOnly: true
      dependencyUpdate: true  # With passing tests
      formattingOnly: true

    limits:
      maxFilesChanged: 10
      maxLinesChanged: 500
      maxComplexity: 15

    qualityGates:
      requireTestCoverage: true
      minCoverageIncrease: 0  # Don't decrease coverage
      requirePassingCI: true
      requireSecurityScan: true
      minReviewScore: 80

    neverAutoApprove:
      securityFiles: true
      schemaChanges: true
      apiContracts: true
      configChanges: true

  # Learning settings
  learning:
    enabled: true
    storeFeedback: true
    updateStandards: true
```

## CLI Commands

```bash
# Manually trigger PR-Agent commands
ado pr describe <pr-number>
ado pr review <pr-number>
ado pr improve <pr-number>
ado pr changelog <pr-number>

# Check auto-approval status
ado pr can-approve <pr-number>

# Override auto-approval (force human review)
ado pr require-review <pr-number> --reason "Complex business logic"
```

---

## Souvislosti

- [Git Workflows](../../04-design/02-autonomous-workflow/doc-first-pipeline.md)
- [Quality Gates](../../04-design/02-autonomous-workflow/test-build-validation.md)
- [HITL Checkpoints](../../06-user-guide/02-core-concepts/checkpoints-hitl.md)
- [GitHub App Integration](../../03-architecture/05-communication/trpc-api.md)
