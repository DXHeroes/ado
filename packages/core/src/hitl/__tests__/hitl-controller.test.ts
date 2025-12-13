/**
 * HITL Controller Tests
 */

import { AdoError } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HITLController,
	createHITLController,
	type ApprovalDecision,
	type ApprovalFilter,
	type ApprovalRequest,
	type ApprovalType,
	type EscalationChannel,
	type HITLControllerConfig,
	type HITLPolicy,
	type HumanInput,
	type InterruptReason,
} from '../hitl-controller.js';

describe('HITLController', () => {
	let controller: HITLController;

	beforeEach(() => {
		controller = new HITLController();
	});

	describe('Constructor and Configuration', () => {
		it('should create controller with default configuration', () => {
			const ctrl = new HITLController();
			expect(ctrl).toBeInstanceOf(HITLController);
		});

		it('should create controller with custom configuration', () => {
			const config: HITLControllerConfig = {
				defaultTimeout: 5000,
				defaultPolicy: 'autonomous',
				costEscalationThreshold: 10.0,
				autoApproveOnTimeout: true,
			};

			const ctrl = new HITLController(config);
			expect(ctrl).toBeInstanceOf(HITLController);
		});

		it('should merge custom config with defaults', () => {
			const config: HITLControllerConfig = {
				defaultTimeout: 1000,
			};

			const ctrl = new HITLController(config);
			expect(ctrl).toBeInstanceOf(HITLController);
		});

		it('should use factory function to create controller', () => {
			const ctrl = createHITLController();
			expect(ctrl).toBeInstanceOf(HITLController);
		});

		it('should use factory function with config', () => {
			const config: HITLControllerConfig = {
				defaultTimeout: 2000,
				defaultPolicy: 'manual',
			};

			const ctrl = createHITLController(config);
			expect(ctrl).toBeInstanceOf(HITLController);
		});
	});

	describe('Request Approval', () => {
		it('should create approval request', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			// Give time for request to be created
			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending).toHaveLength(1);
			expect(pending[0]?.taskId).toBe('task-1');
			expect(pending[0]?.type).toBe('file_edit');
			expect(pending[0]?.message).toBe('Approve file edit?');
			expect(pending[0]?.status).toBe('pending');

			// Cleanup: approve to resolve promise
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should create approval request with data', async () => {
			const data = { filePath: '/test/file.ts', changes: 10 };
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
				data,
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending[0]?.data).toEqual(data);

			// Cleanup
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should create approval request with custom timeout', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'command_execution',
				'Approve command?',
				undefined,
				500, // 500ms timeout
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending[0]?.timeout).toBe(500);

			// Cleanup
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should wait for approval decision', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending).toHaveLength(1);

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, {
					approved: true,
					reason: 'Looks good',
				});
			}

			const decision = await approvalPromise;
			expect(decision.approved).toBe(true);
			expect(decision.reason).toBe('Looks good');
		});

		it('should handle timeout when not auto-approved', async () => {
			const ctrl = new HITLController({
				defaultTimeout: 100, // 100ms
				autoApproveOnTimeout: false,
			});

			const approvalPromise = ctrl.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
				undefined,
				100,
			);

			await expect(approvalPromise).rejects.toThrow('Approval request timed out');
			await expect(approvalPromise).rejects.toBeInstanceOf(AdoError);
		});

		it('should auto-approve on timeout when configured', async () => {
			const ctrl = new HITLController({
				defaultTimeout: 100,
				autoApproveOnTimeout: true,
			});

			const approvalPromise = ctrl.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
				undefined,
				100,
			);

			const decision = await approvalPromise;
			expect(decision.approved).toBe(true);
			expect(decision.reason).toBe('Auto-approved on timeout');
		});

		it('should emit approval_requested event', async () => {
			const eventSpy = vi.fn();
			controller.on('approval_requested', eventSpy);

			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: 'task-1',
					type: 'file_edit',
					status: 'pending',
				}),
			);

			// Cleanup
			const pending = await controller.getPendingApprovals();
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should emit approval_timeout event on timeout', async () => {
			const eventSpy = vi.fn();
			const ctrl = new HITLController({
				defaultTimeout: 100,
				autoApproveOnTimeout: true,
			});
			ctrl.on('approval_timeout', eventSpy);

			await ctrl.requestApproval('task-1', 'file_edit', 'Approve?', undefined, 100);

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(eventSpy).toHaveBeenCalledTimes(1);
		});

		it('should handle request deletion during wait', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			if (pending[0]) {
				controller.cancelApprovalRequest(pending[0].id);
			}

			await expect(approvalPromise).rejects.toThrow('Approval request was deleted');
		});
	});

	describe('Submit Decision', () => {
		it('should approve a pending request', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending).toHaveLength(1);

			const decision: ApprovalDecision = {
				approved: true,
				reason: 'Changes look good',
			};

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, decision);

				const request = controller.getApprovalRequest(pending[0].id);
				expect(request?.status).toBe('approved');
				expect(request?.decision).toEqual(decision);
				expect(request?.respondedAt).toBeInstanceOf(Date);
			}

			const result = await approvalPromise;
			expect(result.approved).toBe(true);
		});

		it('should reject a pending request', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'command_execution',
				'Approve command?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();

			const decision: ApprovalDecision = {
				approved: false,
				reason: 'Too risky',
			};

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, decision);

				const request = controller.getApprovalRequest(pending[0].id);
				expect(request?.status).toBe('rejected');
				expect(request?.decision).toEqual(decision);
			}

			const result = await approvalPromise;
			expect(result.approved).toBe(false);
			expect(result.reason).toBe('Too risky');
		});

		it('should include modifications in decision', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();

			const decision: ApprovalDecision = {
				approved: true,
				reason: 'Approved with changes',
				modifications: { filePath: '/modified/path.ts' },
			};

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, decision);
			}

			const result = await approvalPromise;
			expect(result.modifications).toEqual({ filePath: '/modified/path.ts' });
		});

		it('should throw error for non-existent request', async () => {
			const decision: ApprovalDecision = { approved: true };

			await expect(controller.submitDecision('non-existent', decision)).rejects.toThrow(
				'not found',
			);
			await expect(controller.submitDecision('non-existent', decision)).rejects.toBeInstanceOf(
				AdoError,
			);
		});

		it('should throw error for already-decided request', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });

				await expect(
					controller.submitDecision(pending[0].id, { approved: false }),
				).rejects.toThrow('already been decided');

				await expect(
					controller.submitDecision(pending[0].id, { approved: false }),
				).rejects.toBeInstanceOf(AdoError);
			}

			await approvalPromise;
		});

		it('should emit approval_decided event', async () => {
			const eventSpy = vi.fn();
			controller.on('approval_decided', eventSpy);

			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();

			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}

			await approvalPromise;

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'approved',
					decision: expect.objectContaining({ approved: true }),
				}),
			);
		});
	});

	describe('Get Pending Approvals', () => {
		beforeEach(async () => {
			// Create multiple approval requests
			const promise1 = controller.requestApproval('task-1', 'file_edit', 'Edit file 1');
			const promise2 = controller.requestApproval('task-1', 'command_execution', 'Run command');
			const promise3 = controller.requestApproval('task-2', 'file_edit', 'Edit file 2');
			const promise4 = controller.requestApproval('task-2', 'api_call', 'Make API call');

			await new Promise((resolve) => setTimeout(resolve, 10));

			// Approve one request
			const allPending = await controller.getPendingApprovals();
			if (allPending[0]) {
				await controller.submitDecision(allPending[0].id, { approved: true });
			}

			// Cleanup: resolve all promises
			Promise.all([promise1, promise2, promise3, promise4]).catch(() => {});
		});

		it('should list all pending approvals', async () => {
			const pending = await controller.getPendingApprovals();
			expect(pending.length).toBeGreaterThanOrEqual(3);
		});

		it('should filter by taskId', async () => {
			const pending = await controller.getPendingApprovals({ taskId: 'task-1' });
			expect(pending.every((r) => r.taskId === 'task-1')).toBe(true);
		});

		it('should filter by type', async () => {
			const pending = await controller.getPendingApprovals({ type: 'file_edit' });
			expect(pending.every((r) => r.type === 'file_edit')).toBe(true);
		});

		it('should filter by status', async () => {
			const pending = await controller.getPendingApprovals({ status: 'pending' });
			expect(pending.every((r) => r.status === 'pending')).toBe(true);
		});

		it('should filter by multiple criteria', async () => {
			const filter: ApprovalFilter = {
				taskId: 'task-1',
				type: 'file_edit',
				status: 'pending',
			};

			const pending = await controller.getPendingApprovals(filter);
			expect(
				pending.every(
					(r) => r.taskId === 'task-1' && r.type === 'file_edit' && r.status === 'pending',
				),
			).toBe(true);
		});

		it('should sort by creation time', async () => {
			const pending = await controller.getPendingApprovals();

			if (pending.length > 1) {
				for (let i = 0; i < pending.length - 1; i++) {
					const current = pending[i];
					const next = pending[i + 1];
					if (current && next) {
						expect(current.createdAt.getTime()).toBeLessThanOrEqual(next.createdAt.getTime());
					}
				}
			}
		});

		it('should return empty array when no approvals match filter', async () => {
			const pending = await controller.getPendingApprovals({
				taskId: 'non-existent-task',
			});
			expect(pending).toHaveLength(0);
		});
	});

	describe('Interrupt/Resume', () => {
		it('should interrupt session', async () => {
			const eventSpy = vi.fn();
			controller.on('session_interrupted', eventSpy);

			const reason: InterruptReason = 'user_requested';
			await controller.interrupt('session-1', reason);

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'session-1',
					reason: 'user_requested',
					timestamp: expect.any(Date),
				}),
			);
		});

		it('should interrupt with different reasons', async () => {
			const reasons: InterruptReason[] = [
				'user_requested',
				'cost_limit',
				'time_limit',
				'approval_required',
				'error',
			];

			for (const reason of reasons) {
				const eventSpy = vi.fn();
				controller.on('session_interrupted', eventSpy);

				await controller.interrupt(`session-${reason}`, reason);

				expect(eventSpy).toHaveBeenCalledWith(
					expect.objectContaining({ reason }),
				);
			}
		});

		it('should provide input for resume', async () => {
			const eventSpy = vi.fn();
			controller.on('input_provided', eventSpy);

			const input: HumanInput = {
				type: 'text',
				content: 'Continue with this approach',
			};

			await controller.provideInput('session-1', input);

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'session-1',
					input,
					timestamp: expect.any(Date),
				}),
			);
		});

		it('should provide different input types', async () => {
			const textInput: HumanInput = {
				type: 'text',
				content: 'Some text',
			};

			const decisionInput: HumanInput = {
				type: 'decision',
				content: 'Proceed',
			};

			const modificationInput: HumanInput = {
				type: 'modification',
				content: 'Modified code',
				data: { filePath: '/test.ts' },
			};

			await controller.provideInput('session-1', textInput);
			await controller.provideInput('session-1', decisionInput);
			await controller.provideInput('session-1', modificationInput);

			const inputs = controller.getSessionInputs('session-1');
			expect(inputs).toHaveLength(3);
			expect(inputs[0]).toEqual(textInput);
			expect(inputs[1]).toEqual(decisionInput);
			expect(inputs[2]).toEqual(modificationInput);
		});

		it('should get session inputs', async () => {
			const input1: HumanInput = {
				type: 'text',
				content: 'First input',
			};

			const input2: HumanInput = {
				type: 'decision',
				content: 'Second input',
			};

			await controller.provideInput('session-1', input1);
			await controller.provideInput('session-1', input2);

			const inputs = controller.getSessionInputs('session-1');
			expect(inputs).toHaveLength(2);
			expect(inputs[0]).toEqual(input1);
			expect(inputs[1]).toEqual(input2);
		});

		it('should return empty array for session with no inputs', () => {
			const inputs = controller.getSessionInputs('non-existent-session');
			expect(inputs).toEqual([]);
		});

		it('should clear session inputs', async () => {
			const input: HumanInput = {
				type: 'text',
				content: 'Test input',
			};

			await controller.provideInput('session-1', input);
			expect(controller.getSessionInputs('session-1')).toHaveLength(1);

			controller.clearSessionInputs('session-1');
			expect(controller.getSessionInputs('session-1')).toHaveLength(0);
		});

		it('should maintain separate inputs for different sessions', async () => {
			const input1: HumanInput = {
				type: 'text',
				content: 'Session 1 input',
			};

			const input2: HumanInput = {
				type: 'text',
				content: 'Session 2 input',
			};

			await controller.provideInput('session-1', input1);
			await controller.provideInput('session-2', input2);

			expect(controller.getSessionInputs('session-1')).toHaveLength(1);
			expect(controller.getSessionInputs('session-2')).toHaveLength(1);
			expect(controller.getSessionInputs('session-1')[0]).toEqual(input1);
			expect(controller.getSessionInputs('session-2')[0]).toEqual(input2);
		});
	});

	describe('Escalation', () => {
		it('should create escalation', async () => {
			const eventSpy = vi.fn();
			controller.on('escalation_created', eventSpy);

			const channel: EscalationChannel = 'slack';
			await controller.escalate('session-1', channel, 'Need help with this task');

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'session-1',
					channel: 'slack',
					message: 'Need help with this task',
					urgency: 'medium', // default
					createdAt: expect.any(Date),
				}),
			);
		});

		it('should escalate to different channels', async () => {
			const channels: EscalationChannel[] = ['slack', 'email', 'dashboard', 'webhook'];

			for (const channel of channels) {
				const eventSpy = vi.fn();
				controller.on('escalation_created', eventSpy);

				await controller.escalate(`session-${channel}`, channel, `Escalate to ${channel}`);

				expect(eventSpy).toHaveBeenCalledWith(
					expect.objectContaining({ channel }),
				);
			}
		});

		it('should create escalation with different urgency levels', async () => {
			const urgencies: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

			for (const urgency of urgencies) {
				const eventSpy = vi.fn();
				controller.on('escalation_created', eventSpy);

				await controller.escalate(
					`session-${urgency}`,
					'slack',
					`${urgency} urgency escalation`,
					urgency,
				);

				expect(eventSpy).toHaveBeenCalledWith(
					expect.objectContaining({ urgency }),
				);
			}
		});

		it('should use default medium urgency when not specified', async () => {
			const eventSpy = vi.fn();
			controller.on('escalation_created', eventSpy);

			await controller.escalate('session-1', 'email', 'Test escalation');

			expect(eventSpy).toHaveBeenCalledWith(
				expect.objectContaining({ urgency: 'medium' }),
			);
		});

		it('should emit escalation_created event', async () => {
			const eventSpy = vi.fn();
			controller.on('escalation_created', eventSpy);

			await controller.escalate('session-1', 'webhook', 'Critical issue', 'high');

			expect(eventSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('Policy Checking', () => {
		describe('autonomous policy', () => {
			const policy: HITLPolicy = 'autonomous';

			it('should not require approval for any action type', () => {
				const types: ApprovalType[] = [
					'file_edit',
					'command_execution',
					'api_call',
					'cost_threshold',
					'step_execution',
				];

				for (const type of types) {
					expect(controller.requiresApproval(policy, type)).toBe(false);
				}
			});
		});

		describe('review-edits policy', () => {
			const policy: HITLPolicy = 'review-edits';

			it('should require approval for file_edit', () => {
				expect(controller.requiresApproval(policy, 'file_edit')).toBe(true);
			});

			it('should not require approval for command_execution', () => {
				expect(controller.requiresApproval(policy, 'command_execution')).toBe(false);
			});

			it('should not require approval for api_call', () => {
				expect(controller.requiresApproval(policy, 'api_call')).toBe(false);
			});

			it('should not require approval for cost_threshold', () => {
				expect(controller.requiresApproval(policy, 'cost_threshold')).toBe(false);
			});

			it('should not require approval for step_execution', () => {
				expect(controller.requiresApproval(policy, 'step_execution')).toBe(false);
			});
		});

		describe('approve-steps policy', () => {
			const policy: HITLPolicy = 'approve-steps';

			it('should require approval for file_edit', () => {
				expect(controller.requiresApproval(policy, 'file_edit')).toBe(true);
			});

			it('should require approval for command_execution', () => {
				expect(controller.requiresApproval(policy, 'command_execution')).toBe(true);
			});

			it('should require approval for step_execution', () => {
				expect(controller.requiresApproval(policy, 'step_execution')).toBe(true);
			});

			it('should not require approval for api_call', () => {
				expect(controller.requiresApproval(policy, 'api_call')).toBe(false);
			});

			it('should not require approval for cost_threshold', () => {
				expect(controller.requiresApproval(policy, 'cost_threshold')).toBe(false);
			});
		});

		describe('manual policy', () => {
			const policy: HITLPolicy = 'manual';

			it('should require approval for all action types', () => {
				const types: ApprovalType[] = [
					'file_edit',
					'command_execution',
					'api_call',
					'cost_threshold',
					'step_execution',
				];

				for (const type of types) {
					expect(controller.requiresApproval(policy, type)).toBe(true);
				}
			});
		});
	});

	describe('Get Approval Request', () => {
		it('should get approval request by ID', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending).toHaveLength(1);

			if (pending[0]) {
				const request = controller.getApprovalRequest(pending[0].id);
				expect(request).toBeDefined();
				expect(request?.id).toBe(pending[0].id);
				expect(request?.taskId).toBe('task-1');

				// Cleanup
				await controller.submitDecision(pending[0].id, { approved: true });
			}

			await approvalPromise;
		});

		it('should return undefined for non-existent request', () => {
			const request = controller.getApprovalRequest('non-existent');
			expect(request).toBeUndefined();
		});
	});

	describe('Cancel Approval Request', () => {
		it('should cancel approval request', async () => {
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file edit?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending).toHaveLength(1);

			if (pending[0]) {
				controller.cancelApprovalRequest(pending[0].id);

				const request = controller.getApprovalRequest(pending[0].id);
				expect(request).toBeUndefined();
			}

			await expect(approvalPromise).rejects.toThrow('Approval request was deleted');
		});
	});

	describe('Cleanup', () => {
		it('should remove old requests', async () => {
			// Create an approval request
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Old approval',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending.length).toBeGreaterThan(0);

			// Cleanup requests older than 0ms (all requests)
			controller.cleanup(0);

			const afterCleanup = await controller.getPendingApprovals();
			expect(afterCleanup).toHaveLength(0);

			// The promise should reject since request was deleted
			await expect(approvalPromise).rejects.toThrow('Approval request was deleted');
		});

		it('should keep recent requests', async () => {
			// Create an approval request
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Recent approval',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const beforeCleanup = await controller.getPendingApprovals();
			expect(beforeCleanup.length).toBeGreaterThan(0);

			// Cleanup requests older than 1 hour (shouldn't affect new request)
			controller.cleanup(60 * 60 * 1000);

			const afterCleanup = await controller.getPendingApprovals();
			expect(afterCleanup.length).toBe(beforeCleanup.length);

			// Cleanup
			if (afterCleanup[0]) {
				await controller.submitDecision(afterCleanup[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should cleanup only old requests, keeping new ones', async () => {
			// Create an old request by manually setting timestamp
			const oldApprovalPromise = controller.requestApproval(
				'task-old',
				'file_edit',
				'Old approval',
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			// Create a new request
			const newApprovalPromise = controller.requestApproval(
				'task-new',
				'file_edit',
				'New approval',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const beforeCleanup = await controller.getPendingApprovals();
			expect(beforeCleanup.length).toBeGreaterThanOrEqual(2);

			// Cleanup requests older than 40ms
			controller.cleanup(40);

			const afterCleanup = await controller.getPendingApprovals();

			// Old request should be removed, new one should remain
			expect(afterCleanup.length).toBeLessThan(beforeCleanup.length);
			expect(afterCleanup.some((r) => r.taskId === 'task-new')).toBe(true);

			// Old promise should reject
			await expect(oldApprovalPromise).rejects.toThrow('Approval request was deleted');

			// Cleanup new request
			const newRequests = await controller.getPendingApprovals({
				taskId: 'task-new',
			});
			if (newRequests[0]) {
				await controller.submitDecision(newRequests[0].id, { approved: true });
			}
			await newApprovalPromise;
		});
	});

	describe('Event Emissions', () => {
		it('should emit approval_requested event with correct data', async () => {
			const eventSpy = vi.fn();
			controller.on('approval_requested', eventSpy);

			const approvalPromise = controller.requestApproval(
				'task-1',
				'command_execution',
				'Execute command?',
				{ command: 'rm -rf /' },
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(eventSpy).toHaveBeenCalledTimes(1);

			const eventData = eventSpy.mock.calls[0]?.[0] as ApprovalRequest;
			expect(eventData.taskId).toBe('task-1');
			expect(eventData.type).toBe('command_execution');
			expect(eventData.message).toBe('Execute command?');
			expect(eventData.data).toEqual({ command: 'rm -rf /' });
			expect(eventData.status).toBe('pending');

			// Cleanup
			const pending = await controller.getPendingApprovals();
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});

		it('should emit approval_decided event with correct data', async () => {
			const eventSpy = vi.fn();
			controller.on('approval_decided', eventSpy);

			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Edit file?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();

			if (pending[0]) {
				const decision: ApprovalDecision = {
					approved: true,
					reason: 'LGTM',
				};

				await controller.submitDecision(pending[0].id, decision);

				expect(eventSpy).toHaveBeenCalledTimes(1);

				const eventData = eventSpy.mock.calls[0]?.[0] as ApprovalRequest;
				expect(eventData.status).toBe('approved');
				expect(eventData.decision).toEqual(decision);
				expect(eventData.respondedAt).toBeInstanceOf(Date);
			}

			await approvalPromise;
		});

		it('should emit approval_timeout event with correct data', async () => {
			const eventSpy = vi.fn();
			const ctrl = new HITLController({
				defaultTimeout: 100,
				autoApproveOnTimeout: true,
			});
			ctrl.on('approval_timeout', eventSpy);

			await ctrl.requestApproval('task-1', 'file_edit', 'Edit file?', undefined, 100);

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(eventSpy).toHaveBeenCalledTimes(1);

			const eventData = eventSpy.mock.calls[0]?.[0] as ApprovalRequest;
			expect(eventData.taskId).toBe('task-1');
			expect(eventData.status).toBe('timeout');
		});

		it('should emit session_interrupted event with correct data', async () => {
			const eventSpy = vi.fn();
			controller.on('session_interrupted', eventSpy);

			await controller.interrupt('session-123', 'cost_limit');

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith({
				sessionId: 'session-123',
				reason: 'cost_limit',
				timestamp: expect.any(Date),
			});
		});

		it('should emit input_provided event with correct data', async () => {
			const eventSpy = vi.fn();
			controller.on('input_provided', eventSpy);

			const input: HumanInput = {
				type: 'modification',
				content: 'Updated code',
				data: { file: 'test.ts' },
			};

			await controller.provideInput('session-456', input);

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith({
				sessionId: 'session-456',
				input,
				timestamp: expect.any(Date),
			});
		});

		it('should emit escalation_created event with correct data', async () => {
			const eventSpy = vi.fn();
			controller.on('escalation_created', eventSpy);

			await controller.escalate('session-789', 'email', 'Critical issue detected', 'high');

			expect(eventSpy).toHaveBeenCalledTimes(1);
			expect(eventSpy).toHaveBeenCalledWith({
				sessionId: 'session-789',
				channel: 'email',
				message: 'Critical issue detected',
				urgency: 'high',
				createdAt: expect.any(Date),
			});
		});

		it('should support multiple event listeners', async () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();
			const listener3 = vi.fn();

			controller.on('approval_requested', listener1);
			controller.on('approval_requested', listener2);
			controller.on('approval_requested', listener3);

			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Edit file?',
			);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);
			expect(listener3).toHaveBeenCalledTimes(1);

			// Cleanup
			const pending = await controller.getPendingApprovals();
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, { approved: true });
			}
			await approvalPromise;
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle complete approval workflow', async () => {
			const approvalRequestedSpy = vi.fn();
			const approvalDecidedSpy = vi.fn();

			controller.on('approval_requested', approvalRequestedSpy);
			controller.on('approval_decided', approvalDecidedSpy);

			// Request approval
			const approvalPromise = controller.requestApproval(
				'task-1',
				'file_edit',
				'Approve file changes?',
				{ filePath: '/src/main.ts', lines: 42 },
			);

			// Wait for request to be created
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify event emitted
			expect(approvalRequestedSpy).toHaveBeenCalledTimes(1);

			// Get pending approvals
			const pending = await controller.getPendingApprovals({ taskId: 'task-1' });
			expect(pending).toHaveLength(1);

			// Submit decision
			if (pending[0]) {
				await controller.submitDecision(pending[0].id, {
					approved: true,
					reason: 'Changes reviewed and approved',
				});
			}

			// Verify decision event
			expect(approvalDecidedSpy).toHaveBeenCalledTimes(1);

			// Wait for decision
			const decision = await approvalPromise;
			expect(decision.approved).toBe(true);
			expect(decision.reason).toBe('Changes reviewed and approved');
		});

		it('should handle session interrupt and resume workflow', async () => {
			const interruptSpy = vi.fn();
			const inputSpy = vi.fn();

			controller.on('session_interrupted', interruptSpy);
			controller.on('input_provided', inputSpy);

			// Interrupt session
			await controller.interrupt('session-1', 'approval_required');
			expect(interruptSpy).toHaveBeenCalledTimes(1);

			// Provide inputs for resume
			await controller.provideInput('session-1', {
				type: 'decision',
				content: 'Proceed with caution',
			});

			await controller.provideInput('session-1', {
				type: 'modification',
				content: 'Use safer approach',
				data: { method: 'safe_operation' },
			});

			expect(inputSpy).toHaveBeenCalledTimes(2);

			// Get inputs
			const inputs = controller.getSessionInputs('session-1');
			expect(inputs).toHaveLength(2);
			expect(inputs[0]?.type).toBe('decision');
			expect(inputs[1]?.type).toBe('modification');

			// Clear inputs after resume
			controller.clearSessionInputs('session-1');
			expect(controller.getSessionInputs('session-1')).toHaveLength(0);
		});

		it('should handle escalation workflow', async () => {
			const escalationSpy = vi.fn();
			controller.on('escalation_created', escalationSpy);

			// Escalate to multiple channels
			await controller.escalate(
				'session-1',
				'slack',
				'Task stuck for 30 minutes',
				'medium',
			);

			await controller.escalate(
				'session-1',
				'email',
				'Critical approval needed',
				'high',
			);

			expect(escalationSpy).toHaveBeenCalledTimes(2);

			const firstEscalation = escalationSpy.mock.calls[0]?.[0];
			const secondEscalation = escalationSpy.mock.calls[1]?.[0];

			expect(firstEscalation.channel).toBe('slack');
			expect(firstEscalation.urgency).toBe('medium');

			expect(secondEscalation.channel).toBe('email');
			expect(secondEscalation.urgency).toBe('high');
		});

		it('should handle policy-based approval workflow', async () => {
			// Test different policies
			const policies: HITLPolicy[] = ['autonomous', 'review-edits', 'approve-steps', 'manual'];

			for (const policy of policies) {
				const requiresFileEdit = controller.requiresApproval(policy, 'file_edit');
				const requiresCommand = controller.requiresApproval(policy, 'command_execution');

				if (policy === 'autonomous') {
					expect(requiresFileEdit).toBe(false);
					expect(requiresCommand).toBe(false);
				} else if (policy === 'review-edits') {
					expect(requiresFileEdit).toBe(true);
					expect(requiresCommand).toBe(false);
				} else if (policy === 'approve-steps') {
					expect(requiresFileEdit).toBe(true);
					expect(requiresCommand).toBe(true);
				} else if (policy === 'manual') {
					expect(requiresFileEdit).toBe(true);
					expect(requiresCommand).toBe(true);
				}
			}
		});

		it('should handle concurrent approval requests', async () => {
			const promises = [
				controller.requestApproval('task-1', 'file_edit', 'Edit 1'),
				controller.requestApproval('task-2', 'file_edit', 'Edit 2'),
				controller.requestApproval('task-3', 'command_execution', 'Command 1'),
			];

			await new Promise((resolve) => setTimeout(resolve, 10));

			const pending = await controller.getPendingApprovals();
			expect(pending.length).toBeGreaterThanOrEqual(3);

			// Approve all
			for (const request of pending) {
				await controller.submitDecision(request.id, { approved: true });
			}

			const decisions = await Promise.all(promises);
			expect(decisions.every((d) => d.approved === true)).toBe(true);
		});
	});
});
