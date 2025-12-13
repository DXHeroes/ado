/**
 * Test factories for creating mock objects
 */

import type {
	AgentAdapter,
	AgentCompleteEvent,
	AgentConfig,
	AgentErrorEvent,
	AgentEvent,
	AgentOutputEvent,
	AgentRateLimitEvent,
	AgentResult,
	AgentStartEvent,
	AgentTask,
	AgentTaskOptions,
	AgentToolResultEvent,
	AgentToolUseEvent,
	ProjectContext,
} from '../types/agent.js';
import type {
	AccessModeConfig,
	AgentCapabilities,
	ApiConfig,
	ApiRateLimits,
	ProviderConfig,
	ProviderSelection,
	SubscriptionConfig,
	SubscriptionRateLimits,
	TokenCost,
} from '../types/provider.js';
import type { RateLimitDetector } from '../types/rate-limit.js';
import type {
	TaskConstraints,
	TaskDefinition,
	TaskHandle,
	TaskResult,
	TaskState,
} from '../types/task.js';

/**
 * Create a mock ProjectContext
 */
export const createMockProjectContext = (
	overrides?: Partial<ProjectContext>,
): ProjectContext => ({
	projectId: 'test-project',
	repositoryPath: '/tmp/test-repo',
	repositoryKey: 'test-repo-key',
	...overrides,
});

/**
 * Create a mock AgentTask
 */
export const createMockTask = (overrides?: Partial<AgentTask>): AgentTask => ({
	id: 'task-123',
	prompt: 'Test task prompt',
	projectContext: createMockProjectContext(),
	...overrides,
});

/**
 * Create mock AgentTaskOptions
 */
export const createMockTaskOptions = (
	overrides?: Partial<AgentTaskOptions>,
): AgentTaskOptions => ({
	maxTurns: 10,
	timeout: 300000,
	permissionMode: 'default',
	resume: false,
	...overrides,
});

/**
 * Create mock AgentCapabilities
 */
export const createMockCapabilities = (
	overrides?: Partial<AgentCapabilities>,
): AgentCapabilities => ({
	codeGeneration: true,
	codeReview: true,
	refactoring: true,
	testing: true,
	documentation: true,
	debugging: true,
	languages: ['typescript', 'javascript', 'python'],
	maxContextTokens: 200000,
	supportsStreaming: true,
	supportsMCP: true,
	supportsResume: true,
	...overrides,
});

/**
 * Create mock SubscriptionRateLimits
 */
export const createMockSubscriptionRateLimits = (
	overrides?: Partial<SubscriptionRateLimits>,
): SubscriptionRateLimits => ({
	requestsPerDay: 100,
	requestsPerHour: 10,
	tokensPerDay: 1000000,
	...overrides,
});

/**
 * Create mock ApiRateLimits
 */
export const createMockApiRateLimits = (
	overrides?: Partial<ApiRateLimits>,
): ApiRateLimits => ({
	requestsPerMinute: 50,
	tokensPerMinute: 100000,
	...overrides,
});

/**
 * Create mock TokenCost
 */
export const createMockTokenCost = (overrides?: Partial<TokenCost>): TokenCost => ({
	input: 3.0,
	output: 15.0,
	...overrides,
});

/**
 * Create mock SubscriptionConfig
 */
export const createMockSubscriptionConfig = (
	overrides?: Partial<SubscriptionConfig>,
): SubscriptionConfig => ({
	plan: 'pro',
	rateLimits: createMockSubscriptionRateLimits(),
	resetTime: '00:00 UTC',
	...overrides,
});

/**
 * Create mock ApiConfig
 */
export const createMockApiConfig = (overrides?: Partial<ApiConfig>): ApiConfig => ({
	apiKey: 'test-api-key',
	baseUrl: 'https://api.example.com',
	rateLimits: createMockApiRateLimits(),
	costPerMillion: createMockTokenCost(),
	...overrides,
});

/**
 * Create mock AccessModeConfig (subscription)
 */
export const createMockSubscriptionAccessMode = (
	overrides?: Partial<AccessModeConfig>,
): AccessModeConfig => ({
	mode: 'subscription',
	priority: 1,
	enabled: true,
	subscription: createMockSubscriptionConfig(),
	...overrides,
});

/**
 * Create mock AccessModeConfig (API)
 */
export const createMockApiAccessMode = (
	overrides?: Partial<AccessModeConfig>,
): AccessModeConfig => ({
	mode: 'api',
	priority: 2,
	enabled: true,
	api: createMockApiConfig(),
	...overrides,
});

/**
 * Create mock ProviderConfig
 */
export const createMockProvider = (
	overrides?: Partial<ProviderConfig>,
): ProviderConfig => ({
	id: 'test-provider',
	enabled: true,
	accessModes: [createMockSubscriptionAccessMode(), createMockApiAccessMode()],
	capabilities: createMockCapabilities(),
	...overrides,
});

/**
 * Create mock ProviderSelection
 */
export const createMockProviderSelection = (
	overrides?: Partial<ProviderSelection>,
): ProviderSelection => ({
	provider: createMockProvider(),
	accessMode: createMockSubscriptionAccessMode(),
	reason: 'Test selection',
	...overrides,
});

/**
 * Create mock TaskConstraints
 */
export const createMockTaskConstraints = (
	overrides?: Partial<TaskConstraints>,
): TaskConstraints => ({
	maxDuration: 300,
	maxTokens: 100000,
	requiredCapabilities: ['codeGeneration'],
	...overrides,
});

/**
 * Create mock TaskDefinition
 */
export const createMockTaskDefinition = (
	overrides?: Partial<TaskDefinition>,
): TaskDefinition => ({
	prompt: 'Test task',
	projectKey: 'test-project',
	repositoryPath: '/tmp/test-repo',
	allowApiFailover: true,
	maxApiCostUsd: 1.0,
	hitlPolicy: 'autonomous',
	...overrides,
});

/**
 * Create mock TaskResult
 */
export const createMockTaskResult = (overrides?: Partial<TaskResult>): TaskResult => ({
	success: true,
	output: 'Test output',
	tokensUsed: {
		input: 1000,
		output: 500,
	},
	costUsd: 0.05,
	duration: 5000,
	filesModified: [],
	...overrides,
});

/**
 * Create mock TaskState
 */
export const createMockTaskState = (overrides?: Partial<TaskState>): TaskState => ({
	id: 'task-123',
	definition: createMockTaskDefinition(),
	status: 'pending',
	...overrides,
});

/**
 * Create mock TaskHandle
 */
export const createMockTaskHandle = (overrides?: Partial<TaskHandle>): TaskHandle => ({
	id: 'task-123',
	status: 'pending',
	abort: async () => {},
	...overrides,
});

/**
 * Create mock AgentConfig
 */
export const createMockAgentConfig = (
	overrides?: Partial<AgentConfig>,
): AgentConfig => ({
	provider: createMockProvider(),
	workingDirectory: '/tmp/test-work',
	projectContext: createMockProjectContext(),
	...overrides,
});

/**
 * Create mock AgentResult
 */
export const createMockAgentResult = (
	overrides?: Partial<AgentResult>,
): AgentResult => ({
	success: true,
	output: 'Test agent output',
	sessionId: 'session-123',
	tokensUsed: {
		input: 1000,
		output: 500,
	},
	duration: 5000,
	filesModified: [],
	...overrides,
});

/**
 * Create mock AgentStartEvent
 */
export const createMockStartEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentStartEvent>,
): AgentStartEvent => ({
	type: 'start',
	timestamp: new Date(),
	taskId,
	sessionId: 'session-123',
	...overrides,
});

/**
 * Create mock AgentOutputEvent
 */
export const createMockOutputEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentOutputEvent>,
): AgentOutputEvent => ({
	type: 'output',
	timestamp: new Date(),
	taskId,
	content: 'Test output',
	isPartial: false,
	...overrides,
});

/**
 * Create mock AgentToolUseEvent
 */
export const createMockToolUseEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentToolUseEvent>,
): AgentToolUseEvent => ({
	type: 'tool_use',
	timestamp: new Date(),
	taskId,
	toolName: 'test_tool',
	toolInput: { param: 'value' },
	...overrides,
});

/**
 * Create mock AgentToolResultEvent
 */
export const createMockToolResultEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentToolResultEvent>,
): AgentToolResultEvent => ({
	type: 'tool_result',
	timestamp: new Date(),
	taskId,
	toolName: 'test_tool',
	result: { success: true },
	success: true,
	...overrides,
});

/**
 * Create mock AgentErrorEvent
 */
export const createMockErrorEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentErrorEvent>,
): AgentErrorEvent => ({
	type: 'error',
	timestamp: new Date(),
	taskId,
	error: new Error('Test error'),
	recoverable: true,
	...overrides,
});

/**
 * Create mock AgentRateLimitEvent
 */
export const createMockRateLimitEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentRateLimitEvent>,
): AgentRateLimitEvent => ({
	type: 'rate_limit',
	timestamp: new Date(),
	taskId,
	reason: 'Rate limit exceeded',
	...overrides,
});

/**
 * Create mock AgentCompleteEvent
 */
export const createMockCompleteEvent = (
	taskId = 'task-123',
	overrides?: Partial<AgentCompleteEvent>,
): AgentCompleteEvent => ({
	type: 'complete',
	timestamp: new Date(),
	taskId,
	result: createMockAgentResult(),
	...overrides,
});

/**
 * Create a mock AgentAdapter implementation
 */
export class MockAgentAdapter implements AgentAdapter {
	readonly id: string;
	readonly capabilities: AgentCapabilities;

	private _initialized = false;
	private _available = true;
	private _events: AgentEvent[] = [];

	constructor(id = 'mock-adapter', capabilities?: Partial<AgentCapabilities>) {
		this.id = id;
		this.capabilities = createMockCapabilities(capabilities);
	}

	async initialize(_config: AgentConfig): Promise<void> {
		this._initialized = true;
	}

	async isAvailable(): Promise<boolean> {
		return this._available;
	}

	setAvailable(available: boolean): void {
		this._available = available;
	}

	async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
		const startEvent = createMockStartEvent(task.id);
		this._events.push(startEvent);
		yield startEvent;

		for (const event of this._events) {
			yield event;
		}

		const completeEvent = createMockCompleteEvent(task.id);
		this._events.push(completeEvent);
		yield completeEvent;
	}

	addEvent(event: AgentEvent): void {
		this._events.push(event);
	}

	clearEvents(): void {
		this._events = [];
	}

	async interrupt(): Promise<void> {
		// Mock interrupt
	}

	getRateLimitDetector(): RateLimitDetector {
		return {
			getStatus: async () => ({
				isLimited: false,
			}),
			parseRateLimitError: () => null,
			getRemainingCapacity: async () => ({}),
			recordUsage: async () => {},
		};
	}

	getContextFile(): string {
		return 'MOCK.md';
	}

	async setProjectContext(_context: ProjectContext): Promise<void> {
		// Mock implementation
	}

	isInitialized(): boolean {
		return this._initialized;
	}
}
