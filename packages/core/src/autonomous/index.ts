/**
 * Autonomous Workflow Module
 *
 * Task decomposition, classification, and autonomous execution planning.
 */

export * from './dependency-graph.js';
export * from './task-classifier.js';
export * from './task-decomposer.js';
export * from './spec-generator.js';
export * from './spec-templates.js';
export * from './stuck-detector.js';
export * from './escalation-engine.js';
export * from './hitl-checkpoint-coordinator.js';
export * from './quality-validator.js';
export * from './typescript-validator.js';
export * from './quality-validation-coordinator.js';
export * from './auto-fix-engine.js';
export * from './doc-first-workflow.js';
export * from './recovery-manager.js';
export * from './pr-agent-integration.js';

export {
	DependencyGraph,
	type TaskNode,
	type ExecutionPlan,
	type TaskStage,
} from './dependency-graph.js';

export {
	TaskClassifier,
	createTaskClassifier,
	type ClassificationResult,
	type TaskContext,
} from './task-classifier.js';

export {
	TaskDecomposer,
	createTaskDecomposer,
	type DecompositionResult,
	type CheckpointDefinition,
} from './task-decomposer.js';

export {
	SpecGenerator,
	createSpecGenerator,
	type SpecGenerationContext,
	type SpecGenerationResult,
} from './spec-generator.js';

export {
	createFeatureSpec,
	createBugFixSpec,
	createRefactoringSpec,
	createDefaultConstitution,
	createADRTemplate,
	type Specification,
	type Constitution,
	type ADR,
	type Principle,
	type Constraint,
	type QualityGate,
} from './spec-templates.js';

export {
	StuckDetector,
	createStuckDetector,
	type StuckDetectorConfig,
	type AttemptRecord,
	type StuckDetectionResult,
	type StuckReason,
} from './stuck-detector.js';

export {
	EscalationEngine,
	createEscalationEngine,
	type EscalationConfig,
	type EscalationContext,
	type EscalationDecision,
	type EscalationLevel,
} from './escalation-engine.js';

export {
	HITLCheckpointCoordinator,
	createHITLCheckpointCoordinator,
	type HITLCheckpointConfig,
	type CheckpointReview,
	type HITLCheckpointEvent,
} from './hitl-checkpoint-coordinator.js';

export {
	aggregateValidationResults,
	formatErrorFeedback,
	DEFAULT_QUALITY_GATES,
	type ValidationIssue,
	type ValidationResult,
	type QualityGateConfig,
	type LanguageValidator,
	type ValidatorContext,
	type ValidationSeverity,
	type ValidationCategory,
} from './quality-validator.js';

export {
	TypeScriptValidator,
	createTypeScriptValidator,
} from './typescript-validator.js';

export {
	QualityValidationCoordinator,
	createQualityValidationCoordinator,
	type ValidationReport,
} from './quality-validation-coordinator.js';

export {
	AutoFixEngine,
	createAutoFixEngine,
	type AutoFixConfig,
	type FixStrategy,
	type FixContext,
	type FixResult,
	type AutoFixAttempt,
} from './auto-fix-engine.js';

export {
	DocFirstWorkflow,
	createDocFirstWorkflow,
	type WorkflowPhase,
	type DocFirstWorkflowContext,
	type WorkflowState,
	type WorkflowResult,
} from './doc-first-workflow.js';

export {
	RecoveryManager,
	createRecoveryManager,
	type RecoveryStrategy,
	type RetryConfig,
	type RecoveryPoint,
	type RecoveryResult,
} from './recovery-manager.js';

export {
	PRAgent,
	createPRAgent,
	type PRAgentConfig,
	type PRDescription,
	type ReviewComment,
	type PRReview,
	type ImprovementSuggestion,
	type ChangelogEntry,
	type PRAgentMetrics,
} from './pr-agent-integration.js';
