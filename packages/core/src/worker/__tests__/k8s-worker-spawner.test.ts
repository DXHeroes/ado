/**
 * K8s Worker Spawner Tests
 *
 * Tests for Kubernetes worker pod spawning with mocked K8s API.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import {
	K8sWorkerSpawner,
	createK8sWorkerSpawner,
	type K8sWorkerConfig,
} from '../k8s-worker-spawner.js';

// Create mock API instance outside of mock factory
const mockCoreV1Api = {
	createNamespacedPod: vi.fn(),
	readNamespacedPodStatus: vi.fn(),
	listNamespacedPod: vi.fn(),
	deleteNamespacedPod: vi.fn(),
};

const mockKubeConfig = {
	loadFromDefault: vi.fn(),
	makeApiClient: vi.fn(() => mockCoreV1Api),
};

// Mock the @kubernetes/client-node module
vi.mock('@kubernetes/client-node', () => {
	return {
		KubeConfig: vi.fn(function() {
			return mockKubeConfig;
		}),
		CoreV1Api: vi.fn(function() {
			return mockCoreV1Api;
		}),
	};
});

describe('K8sWorkerSpawner', () => {
	let spawner: K8sWorkerSpawner;

	beforeEach(() => {
		vi.clearAllMocks();
		spawner = new K8sWorkerSpawner();
	});

	describe('worker spawning', () => {
		it('should spawn a worker pod', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-123',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			const worker = await spawner.spawnWorker(config);

			expect(worker.name).toMatch(/^ado-worker-\d+$/);
			expect(worker.namespace).toBe('default');
			expect(worker.status).toBe('Pending');
			expect(worker.createdAt).toBe('2024-01-01T00:00:00.000Z');

			expect(mockCoreV1Api.createNamespacedPod).toHaveBeenCalledTimes(1);
			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			expect(call.namespace).toBe('default');
			expect(call.body.spec.containers[0].image).toBe('ado-worker:latest');
		});

		it('should spawn worker with custom namespace', async () => {
			const config: K8sWorkerConfig = {
				namespace: 'custom-namespace',
				image: 'ado-worker:latest',
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-456',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			const worker = await spawner.spawnWorker(config);

			expect(worker.namespace).toBe('custom-namespace');

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			expect(call.namespace).toBe('custom-namespace');
		});

		it('should spawn worker with resource limits', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
				resources: {
					requests: {
						cpu: '500m',
						memory: '512Mi',
					},
					limits: {
						cpu: '1000m',
						memory: '1Gi',
					},
				},
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-789',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.spawnWorker(config);

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			const container = call.body.spec.containers[0];
			expect(container.resources).toEqual({
				requests: {
					cpu: '500m',
					memory: '512Mi',
				},
				limits: {
					cpu: '1000m',
					memory: '1Gi',
				},
			});
		});

		it('should spawn worker with environment variables', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
				env: {
					API_URL: 'https://api.example.com',
					WORKER_ID: 'worker-123',
					DEBUG: 'true',
				},
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-env',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.spawnWorker(config);

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			const container = call.body.spec.containers[0];
			expect(container.env).toEqual([
				{ name: 'API_URL', value: 'https://api.example.com' },
				{ name: 'WORKER_ID', value: 'worker-123' },
				{ name: 'DEBUG', value: 'true' },
			]);
		});

		it('should spawn worker with custom labels', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
				labels: {
					team: 'backend',
					environment: 'production',
				},
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-labels',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.spawnWorker(config);

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			expect(call.body.metadata.labels).toEqual({
				app: 'ado-worker',
				team: 'backend',
				environment: 'production',
			});
		});

		it('should spawn worker with custom image pull policy', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
				imagePullPolicy: 'Always',
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-pull',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.spawnWorker(config);

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			expect(call.body.spec.containers[0].imagePullPolicy).toBe('Always');
		});

		it('should use default image pull policy', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-default',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.spawnWorker(config);

			const call = mockCoreV1Api.createNamespacedPod.mock.calls[0][0];
			expect(call.body.spec.containers[0].imagePullPolicy).toBe('IfNotPresent');
		});

		it('should handle missing status in response', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
			};

			const mockResponse = {
				metadata: {
					name: 'ado-worker-no-status',
				},
				status: {},
			};

			mockCoreV1Api.createNamespacedPod.mockResolvedValue(mockResponse);

			const worker = await spawner.spawnWorker(config);

			expect(worker.status).toBe('Unknown');
		});
	});

	describe('multiple worker spawning', () => {
		it('should spawn multiple workers in parallel', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
			};

			const mockResponse = (name: string) => ({
				metadata: {
					name,
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Pending',
				},
			});

			mockCoreV1Api.createNamespacedPod.mockImplementation(async () => {
				return mockResponse(`ado-worker-${Date.now()}`);
			});

			const workers = await spawner.spawnWorkers(3, config);

			expect(workers).toHaveLength(3);
			expect(mockCoreV1Api.createNamespacedPod).toHaveBeenCalledTimes(3);
		});

		it('should handle empty count', async () => {
			const config: K8sWorkerConfig = {
				image: 'ado-worker:latest',
			};

			const workers = await spawner.spawnWorkers(0, config);

			expect(workers).toHaveLength(0);
			expect(mockCoreV1Api.createNamespacedPod).not.toHaveBeenCalled();
		});
	});

	describe('worker status queries', () => {
		it('should get worker status', async () => {
			const mockResponse = {
				metadata: {
					name: 'worker-1',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Running',
				},
			};

			mockCoreV1Api.readNamespacedPodStatus.mockResolvedValue(mockResponse);

			const worker = await spawner.getWorkerStatus('worker-1');

			expect(worker).not.toBeNull();
			expect(worker?.name).toBe('worker-1');
			expect(worker?.status).toBe('Running');
			expect(worker?.namespace).toBe('default');

			expect(mockCoreV1Api.readNamespacedPodStatus).toHaveBeenCalledWith({
				name: 'worker-1',
				namespace: 'default',
			});
		});

		it('should get worker status with custom namespace', async () => {
			const mockResponse = {
				metadata: {
					name: 'worker-2',
					creationTimestamp: new Date('2024-01-01T00:00:00Z'),
				},
				status: {
					phase: 'Running',
				},
			};

			mockCoreV1Api.readNamespacedPodStatus.mockResolvedValue(mockResponse);

			const worker = await spawner.getWorkerStatus('worker-2', 'custom-ns');

			expect(worker?.namespace).toBe('custom-ns');

			expect(mockCoreV1Api.readNamespacedPodStatus).toHaveBeenCalledWith({
				name: 'worker-2',
				namespace: 'custom-ns',
			});
		});

		it('should return null for non-existent worker', async () => {
			const error = new Error('Not found');
			(error as any).response = { statusCode: 404 };
			mockCoreV1Api.readNamespacedPodStatus.mockRejectedValue(error);

			const worker = await spawner.getWorkerStatus('non-existent');

			expect(worker).toBeNull();
		});

		it('should throw for other errors', async () => {
			const error = new Error('Server error');
			(error as any).response = { statusCode: 500 };
			mockCoreV1Api.readNamespacedPodStatus.mockRejectedValue(error);

			await expect(spawner.getWorkerStatus('worker-error')).rejects.toThrow('Server error');
		});
	});

	describe('list workers', () => {
		it('should list all workers', async () => {
			const mockResponse = {
				items: [
					{
						metadata: {
							name: 'worker-1',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:00:00Z'),
						},
						status: { phase: 'Running' },
					},
					{
						metadata: {
							name: 'worker-2',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:01:00Z'),
						},
						status: { phase: 'Pending' },
					},
				],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockResponse);

			const workers = await spawner.listWorkers();

			expect(workers).toHaveLength(2);
			expect(workers[0]?.name).toBe('worker-1');
			expect(workers[0]?.status).toBe('Running');
			expect(workers[1]?.name).toBe('worker-2');
			expect(workers[1]?.status).toBe('Pending');

			expect(mockCoreV1Api.listNamespacedPod).toHaveBeenCalledWith({
				namespace: 'default',
				labelSelector: 'app=ado-worker',
			});
		});

		it('should list workers in custom namespace', async () => {
			const mockResponse = {
				items: [],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockResponse);

			await spawner.listWorkers('custom-ns');

			expect(mockCoreV1Api.listNamespacedPod).toHaveBeenCalledWith({
				namespace: 'custom-ns',
				labelSelector: 'app=ado-worker',
			});
		});

		it('should return empty array when no workers exist', async () => {
			const mockResponse = {
				items: [],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockResponse);

			const workers = await spawner.listWorkers();

			expect(workers).toHaveLength(0);
		});

		it('should handle workers with missing metadata', async () => {
			const mockResponse = {
				items: [
					{
						metadata: {},
						status: {},
					},
				],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockResponse);

			const workers = await spawner.listWorkers();

			expect(workers).toHaveLength(1);
			expect(workers[0]?.name).toBe('unknown');
			expect(workers[0]?.status).toBe('Unknown');
		});
	});

	describe('worker termination', () => {
		it('should terminate a worker', async () => {
			mockCoreV1Api.deleteNamespacedPod.mockResolvedValue({});

			await spawner.terminateWorker('worker-1');

			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-1',
				namespace: 'default',
			});
		});

		it('should terminate worker in custom namespace', async () => {
			mockCoreV1Api.deleteNamespacedPod.mockResolvedValue({});

			await spawner.terminateWorker('worker-1', 'custom-ns');

			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-1',
				namespace: 'custom-ns',
			});
		});

		it('should terminate all workers', async () => {
			const mockListResponse = {
				items: [
					{
						metadata: {
							name: 'worker-1',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:00:00Z'),
						},
						status: { phase: 'Running' },
					},
					{
						metadata: {
							name: 'worker-2',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:01:00Z'),
						},
						status: { phase: 'Running' },
					},
				],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockListResponse);
			mockCoreV1Api.deleteNamespacedPod.mockResolvedValue({});

			await spawner.terminateAllWorkers();

			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledTimes(2);
			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-1',
				namespace: 'default',
			});
			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-2',
				namespace: 'default',
			});
		});

		it('should handle terminating all when no workers exist', async () => {
			mockCoreV1Api.listNamespacedPod.mockResolvedValue({ items: [] });

			await spawner.terminateAllWorkers();

			expect(mockCoreV1Api.deleteNamespacedPod).not.toHaveBeenCalled();
		});
	});

	describe('cleanup completed workers', () => {
		it('should cleanup completed and failed workers', async () => {
			const mockListResponse = {
				items: [
					{
						metadata: {
							name: 'worker-succeeded',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:00:00Z'),
						},
						status: { phase: 'Succeeded' },
					},
					{
						metadata: {
							name: 'worker-failed',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:01:00Z'),
						},
						status: { phase: 'Failed' },
					},
					{
						metadata: {
							name: 'worker-running',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:02:00Z'),
						},
						status: { phase: 'Running' },
					},
				],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockListResponse);
			mockCoreV1Api.deleteNamespacedPod.mockResolvedValue({});

			const count = await spawner.cleanupCompletedWorkers();

			expect(count).toBe(2);
			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledTimes(2);
			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-succeeded',
				namespace: 'default',
			});
			expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
				name: 'worker-failed',
				namespace: 'default',
			});
		});

		it('should return zero when no completed workers exist', async () => {
			const mockListResponse = {
				items: [
					{
						metadata: {
							name: 'worker-running',
							namespace: 'default',
							creationTimestamp: new Date('2024-01-01T00:00:00Z'),
						},
						status: { phase: 'Running' },
					},
				],
			};

			mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockListResponse);

			const count = await spawner.cleanupCompletedWorkers();

			expect(count).toBe(0);
			expect(mockCoreV1Api.deleteNamespacedPod).not.toHaveBeenCalled();
		});
	});

	describe('spawner initialization', () => {
		it('should initialize with default namespace', () => {
			const newSpawner = new K8sWorkerSpawner();
			expect(newSpawner).toBeDefined();
		});

		it('should initialize with custom namespace', () => {
			const newSpawner = new K8sWorkerSpawner({ namespace: 'custom' });
			expect(newSpawner).toBeDefined();
		});
	});

	describe('factory function', () => {
		it('should create spawner with default config', () => {
			const newSpawner = createK8sWorkerSpawner();
			expect(newSpawner).toBeInstanceOf(K8sWorkerSpawner);
		});

		it('should create spawner with custom namespace', () => {
			const newSpawner = createK8sWorkerSpawner({ namespace: 'production' });
			expect(newSpawner).toBeInstanceOf(K8sWorkerSpawner);
		});
	});
});
