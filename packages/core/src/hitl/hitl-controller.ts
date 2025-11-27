/**
 * HITL Controller - Human-in-the-Loop approval and intervention system.
 */

import { EventEmitter } from 'node:events';
import { AdoError } from '@dxheroes/ado-shared';

/**
 * HITL policy types
 */
export type HITLPolicy = 'autonomous' | 'review-edits' | 'approve-steps' | 'manual';

/**
 * Approval request types
 */
export type ApprovalType =
	| 'file_edit'
	| 'command_execution'
	| 'api_call'
	| 'cost_threshold'
	| 'step_execution';

/**
 * Approval request status
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

/**
 * Approval decision
 */
export interface ApprovalDecision {
	approved: boolean;
	reason?: string;
	modifications?: Record<string, unknown>;
}

/**
 * Approval request
 */
export interface ApprovalRequest {
	id: string;
	taskId: string;
	type: ApprovalType;
	status: ApprovalStatus;
	message: string;
	data?: Record<string, unknown>;
	createdAt: Date;
	respondedAt?: Date;
	decision?: ApprovalDecision;
	timeout?: number; // milliseconds
}

/**
 * Approval filter
 */
export interface ApprovalFilter {
	taskId?: string;
	type?: ApprovalType;
	status?: ApprovalStatus;
}

/**
 * Interrupt reason
 */
export type InterruptReason =
	| 'user_requested'
	| 'cost_limit'
	| 'time_limit'
	| 'approval_required'
	| 'error';

/**
 * Human input for resume
 */
export interface HumanInput {
	type: 'text' | 'decision' | 'modification';
	content: string;
	data?: Record<string, unknown>;
}

/**
 * Escalation channel
 */
export type EscalationChannel = 'slack' | 'email' | 'dashboard' | 'webhook';

/**
 * Escalation request
 */
export interface EscalationRequest {
	sessionId: string;
	channel: EscalationChannel;
	message: string;
	urgency: 'low' | 'medium' | 'high';
	createdAt: Date;
}

/**
 * HITL Controller configuration
 */
export interface HITLControllerConfig {
	/** Default approval timeout in milliseconds */
	defaultTimeout?: number;

	/** Default policy if not specified */
	defaultPolicy?: HITLPolicy;

	/** Cost threshold for automatic escalation (USD) */
	costEscalationThreshold?: number;

	/** Auto-approve after timeout? */
	autoApproveOnTimeout?: boolean;
}

/**
 * HITL Controller
 */
export class HITLController extends EventEmitter {
	private config: HITLControllerConfig;
	private approvalRequests: Map<string, ApprovalRequest> = new Map();
	private sessionInputs: Map<string, HumanInput[]> = new Map();
	private escalations: Map<string, EscalationRequest> = new Map();

	constructor(config: HITLControllerConfig = {}) {
		super();
		this.config = {
			defaultTimeout: config.defaultTimeout ?? 24 * 60 * 60 * 1000, // 24 hours
			defaultPolicy: config.defaultPolicy ?? 'review-edits',
			costEscalationThreshold: config.costEscalationThreshold ?? 5.0,
			autoApproveOnTimeout: config.autoApproveOnTimeout ?? false,
		};
	}

	/**
	 * Request approval for an action
	 */
	async requestApproval(
		taskId: string,
		type: ApprovalType,
		message: string,
		data?: Record<string, unknown>,
		timeout?: number,
	): Promise<ApprovalDecision> {
		const requestId = this.generateRequestId();
		const timeoutMs = timeout ?? this.config.defaultTimeout ?? 24 * 60 * 60 * 1000;

		const request: ApprovalRequest = {
			id: requestId,
			taskId,
			type,
			status: 'pending',
			message,
			...(data && { data }),
			createdAt: new Date(),
			timeout: timeoutMs,
		};

		this.approvalRequests.set(requestId, request);

		// Emit event for listeners
		this.emit('approval_requested', request);

		// Wait for decision or timeout
		return new Promise((resolve, reject) => {
			const checkDecision = () => {
				const current = this.approvalRequests.get(requestId);
				if (!current) {
					reject(new Error('Approval request was deleted'));
					return;
				}

				if (current.status === 'approved' && current.decision) {
					resolve(current.decision);
					return;
				}

				if (current.status === 'rejected' && current.decision) {
					resolve(current.decision);
					return;
				}

				if (current.status === 'timeout') {
					if (this.config.autoApproveOnTimeout) {
						resolve({ approved: true, reason: 'Auto-approved on timeout' });
					} else {
						reject(
							new AdoError({
								code: 'APPROVAL_TIMEOUT',
								message: 'Approval request timed out',
								recoverable: false,
								remediation: 'Resubmit the request or increase timeout',
								cause: undefined,
							}),
						);
					}
					return;
				}

				// Check again in 100ms
				setTimeout(checkDecision, 100);
			};

			// Start checking
			checkDecision();

			// Set timeout
			if (timeoutMs > 0) {
				setTimeout(() => {
					const current = this.approvalRequests.get(requestId);
					if (current && current.status === 'pending') {
						current.status = 'timeout';
						current.respondedAt = new Date();
						this.emit('approval_timeout', request);
					}
				}, timeoutMs);
			}
		});
	}

	/**
	 * Submit a decision for an approval request
	 */
	async submitDecision(requestId: string, decision: ApprovalDecision): Promise<void> {
		const request = this.approvalRequests.get(requestId);

		if (!request) {
			throw new AdoError({
				code: 'APPROVAL_REQUEST_NOT_FOUND',
				message: `Approval request ${requestId} not found`,
				recoverable: false,
				remediation: 'Verify the request ID',
				cause: undefined,
			});
		}

		if (request.status !== 'pending') {
			throw new AdoError({
				code: 'APPROVAL_ALREADY_DECIDED',
				message: `Approval request ${requestId} has already been decided`,
				recoverable: false,
				remediation: 'Cannot change decision once made',
				cause: undefined,
			});
		}

		request.status = decision.approved ? 'approved' : 'rejected';
		request.decision = decision;
		request.respondedAt = new Date();

		this.emit('approval_decided', request);
	}

	/**
	 * Get pending approval requests
	 */
	async getPendingApprovals(filter?: ApprovalFilter): Promise<ApprovalRequest[]> {
		let requests = Array.from(this.approvalRequests.values());

		if (filter) {
			if (filter.taskId) {
				requests = requests.filter((r) => r.taskId === filter.taskId);
			}
			if (filter.type) {
				requests = requests.filter((r) => r.type === filter.type);
			}
			if (filter.status) {
				requests = requests.filter((r) => r.status === filter.status);
			}
		}

		return requests.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	/**
	 * Interrupt a running session
	 */
	async interrupt(sessionId: string, reason: InterruptReason): Promise<void> {
		this.emit('session_interrupted', { sessionId, reason, timestamp: new Date() });
	}

	/**
	 * Provide input to resume a session
	 */
	async provideInput(sessionId: string, input: HumanInput): Promise<void> {
		const inputs = this.sessionInputs.get(sessionId) ?? [];
		inputs.push(input);
		this.sessionInputs.set(sessionId, inputs);

		this.emit('input_provided', { sessionId, input, timestamp: new Date() });
	}

	/**
	 * Get pending inputs for a session
	 */
	getSessionInputs(sessionId: string): HumanInput[] {
		return this.sessionInputs.get(sessionId) ?? [];
	}

	/**
	 * Clear session inputs
	 */
	clearSessionInputs(sessionId: string): void {
		this.sessionInputs.delete(sessionId);
	}

	/**
	 * Escalate a session to external channel
	 */
	async escalate(
		sessionId: string,
		channel: EscalationChannel,
		message: string,
		urgency: 'low' | 'medium' | 'high' = 'medium',
	): Promise<void> {
		const escalation: EscalationRequest = {
			sessionId,
			channel,
			message,
			urgency,
			createdAt: new Date(),
		};

		this.escalations.set(sessionId, escalation);

		this.emit('escalation_created', escalation);
	}

	/**
	 * Check if action requires approval based on policy
	 */
	requiresApproval(policy: HITLPolicy, type: ApprovalType): boolean {
		switch (policy) {
			case 'autonomous':
				return false;

			case 'review-edits':
				return type === 'file_edit';

			case 'approve-steps':
				return type === 'step_execution' || type === 'file_edit' || type === 'command_execution';

			case 'manual':
				return true;

			default:
				return false;
		}
	}

	/**
	 * Get approval request by ID
	 */
	getApprovalRequest(requestId: string): ApprovalRequest | undefined {
		return this.approvalRequests.get(requestId);
	}

	/**
	 * Cancel an approval request
	 */
	cancelApprovalRequest(requestId: string): void {
		this.approvalRequests.delete(requestId);
	}

	/**
	 * Cleanup old requests
	 */
	cleanup(olderThanMs: number): void {
		const cutoff = Date.now() - olderThanMs;

		for (const [id, request] of this.approvalRequests.entries()) {
			if (request.createdAt.getTime() < cutoff) {
				this.approvalRequests.delete(id);
			}
		}
	}

	/**
	 * Generate a unique request ID
	 */
	private generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2, 8);
		return `approval-${timestamp}-${random}`;
	}
}

/**
 * Create a new HITL controller
 */
export function createHITLController(config?: HITLControllerConfig): HITLController {
	return new HITLController(config);
}
