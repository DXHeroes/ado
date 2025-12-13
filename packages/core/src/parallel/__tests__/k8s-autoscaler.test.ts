/**
 * Tests for K8sAutoscaler
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
	K8sAutoscaler,
	createK8sAutoscaler,
	type HPAConfig,
	type CustomMetric,
} from '../k8s-autoscaler.js';
import * as k8s from '@kubernetes/client-node';

// Mock Kubernetes client
vi.mock('@kubernetes/client-node', () => {
	const mockAutoscalingApi = {
		createNamespacedHorizontalPodAutoscaler: vi.fn(),
		readNamespacedHorizontalPodAutoscaler: vi.fn(),
		replaceNamespacedHorizontalPodAutoscaler: vi.fn(),
		deleteNamespacedHorizontalPodAutoscaler: vi.fn(),
		listNamespacedHorizontalPodAutoscaler: vi.fn(),
	};

	const mockAppsApi = {
		readNamespacedDeployment: vi.fn(),
		replaceNamespacedDeployment: vi.fn(),
	};

	// Mock classes need to be defined with class syntax for makeApiClient to work
	class MockAutoscalingV2Api {}
	class MockAppsV1Api {}

	// Mock KubeConfig as a proper class
	class MockKubeConfig {
		loadFromDefault = vi.fn();
		makeApiClient = vi.fn((apiClass: unknown) => {
			if (apiClass === MockAutoscalingV2Api) {
				return mockAutoscalingApi;
			}
			if (apiClass === MockAppsV1Api) {
				return mockAppsApi;
			}
			return mockAutoscalingApi;
		});
	}

	return {
		KubeConfig: MockKubeConfig,
		AutoscalingV2Api: MockAutoscalingV2Api,
		AppsV1Api: MockAppsV1Api,
	};
});

const mockAutoscalingV2Api = (k8s as { AutoscalingV2Api: unknown }).AutoscalingV2Api;
const mockAppsV1Api = (k8s as { AppsV1Api: unknown }).AppsV1Api;

describe('K8sAutoscaler', () => {
	let autoscaler: K8sAutoscaler;
	let mockAutoscalingApi: {
		createNamespacedHorizontalPodAutoscaler: Mock;
		readNamespacedHorizontalPodAutoscaler: Mock;
		replaceNamespacedHorizontalPodAutoscaler: Mock;
		deleteNamespacedHorizontalPodAutoscaler: Mock;
		listNamespacedHorizontalPodAutoscaler: Mock;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Get the mock API from KubeConfig
		const kubeConfig = new k8s.KubeConfig();
		mockAutoscalingApi = kubeConfig.makeApiClient(
			mockAutoscalingV2Api,
		) as typeof mockAutoscalingApi;

		autoscaler = new K8sAutoscaler({ namespace: 'test-namespace' });
	});

	describe('constructor', () => {
		it('should create autoscaler with default namespace', () => {
			const scaler = new K8sAutoscaler();
			expect(scaler).toBeDefined();
		});

		it('should create autoscaler with custom namespace', () => {
			const scaler = new K8sAutoscaler({ namespace: 'custom-ns' });
			expect(scaler).toBeDefined();
		});

		it('should use factory function', () => {
			const scaler = createK8sAutoscaler({ namespace: 'factory-ns' });
			expect(scaler).toBeDefined();
		});
	});

	describe('createHPA', () => {
		it('should create HPA with CPU metric', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 2,
				maxReplicas: 10,
				targetCPUUtilizationPercentage: 70,
			};

			await autoscaler.createHPA(config);

			expect(mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'test-namespace',
					body: expect.objectContaining({
						apiVersion: 'autoscaling/v2',
						kind: 'HorizontalPodAutoscaler',
						spec: expect.objectContaining({
							minReplicas: 2,
							maxReplicas: 10,
							metrics: expect.arrayContaining([
								expect.objectContaining({
									type: 'Resource',
									resource: expect.objectContaining({
										name: 'cpu',
									}),
								}),
							]),
						}),
					}),
				}),
			);
		});

		it('should create HPA with memory metric', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				targetMemoryUtilizationPercentage: 80,
			};

			await autoscaler.createHPA(config);

			expect(mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						spec: expect.objectContaining({
							metrics: expect.arrayContaining([
								expect.objectContaining({
									type: 'Resource',
									resource: expect.objectContaining({
										name: 'memory',
									}),
								}),
							]),
						}),
					}),
				}),
			);
		});

		it('should create HPA with both CPU and memory metrics', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				targetCPUUtilizationPercentage: 70,
				targetMemoryUtilizationPercentage: 80,
			};

			await autoscaler.createHPA(config);

			const call = mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mock.calls[0];
			const metrics = call?.[0]?.body?.spec?.metrics;

			expect(metrics).toHaveLength(2);
			expect(metrics?.some((m: { resource?: { name?: string } }) => m.resource?.name === 'cpu')).toBe(
				true,
			);
			expect(
				metrics?.some((m: { resource?: { name?: string } }) => m.resource?.name === 'memory'),
			).toBe(true);
		});

		it('should create HPA with custom pod metrics', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const customMetric: CustomMetric = {
				name: 'requests_per_second',
				type: 'pod',
				targetValue: '1000',
				targetAverageValue: '100',
			};

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				customMetrics: [customMetric],
			};

			await autoscaler.createHPA(config);

			const call = mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mock.calls[0];
			const metrics = call?.[0]?.body?.spec?.metrics;

			expect(metrics).toContainEqual(
				expect.objectContaining({
					type: 'Pods',
					pods: expect.objectContaining({
						metric: expect.objectContaining({
							name: 'requests_per_second',
						}),
					}),
				}),
			);
		});

		it('should create HPA with custom object metrics', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const customMetric: CustomMetric = {
				name: 'queue_depth',
				type: 'object',
				targetValue: '100',
			};

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				customMetrics: [customMetric],
			};

			await autoscaler.createHPA(config);

			const call = mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mock.calls[0];
			const metrics = call?.[0]?.body?.spec?.metrics;

			expect(metrics).toContainEqual(
				expect.objectContaining({
					type: 'Object',
					object: expect.objectContaining({
						metric: expect.objectContaining({
							name: 'queue_depth',
						}),
					}),
				}),
			);
		});

		it('should create HPA with custom external metrics', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const customMetric: CustomMetric = {
				name: 'sqs_queue_length',
				type: 'external',
				targetValue: '50',
			};

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				customMetrics: [customMetric],
			};

			await autoscaler.createHPA(config);

			const call = mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mock.calls[0];
			const metrics = call?.[0]?.body?.spec?.metrics;

			expect(metrics).toContainEqual(
				expect.objectContaining({
					type: 'External',
					external: expect.objectContaining({
						metric: expect.objectContaining({
							name: 'sqs_queue_length',
						}),
					}),
				}),
			);
		});

		it('should create HPA with scale down stabilization', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-deployment',
				minReplicas: 1,
				maxReplicas: 5,
				targetCPUUtilizationPercentage: 70,
				scaleDownStabilizationWindowSeconds: 300,
			};

			await autoscaler.createHPA(config);

			expect(mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						spec: expect.objectContaining({
							behavior: expect.objectContaining({
								scaleDown: expect.objectContaining({
									stabilizationWindowSeconds: 300,
								}),
							}),
						}),
					}),
				}),
			);
		});

		it('should create HPA with custom namespace', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-deployment',
				namespace: 'custom-namespace',
				minReplicas: 1,
				maxReplicas: 5,
				targetCPUUtilizationPercentage: 70,
			};

			await autoscaler.createHPA(config);

			expect(mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'custom-namespace',
				}),
			);
		});

		it('should create HPA with custom target kind', async () => {
			mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			const config: HPAConfig = {
				targetName: 'my-statefulset',
				targetKind: 'StatefulSet',
				minReplicas: 1,
				maxReplicas: 5,
				targetCPUUtilizationPercentage: 70,
			};

			await autoscaler.createHPA(config);

			expect(mockAutoscalingApi.createNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						spec: expect.objectContaining({
							scaleTargetRef: expect.objectContaining({
								kind: 'StatefulSet',
							}),
						}),
					}),
				}),
			);
		});
	});

	describe('updateHPA', () => {
		it('should update HPA replica counts', async () => {
			const existingHPA = {
				spec: {
					minReplicas: 1,
					maxReplicas: 5,
					metrics: [],
					scaleTargetRef: {
						apiVersion: 'apps/v1',
						kind: 'Deployment',
						name: 'my-deployment',
					},
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(existingHPA);
			mockAutoscalingApi.replaceNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			await autoscaler.updateHPA('my-hpa', {
				minReplicas: 3,
				maxReplicas: 15,
			});

			expect(mockAutoscalingApi.replaceNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'my-hpa',
					namespace: 'test-namespace',
					body: expect.objectContaining({
						spec: expect.objectContaining({
							minReplicas: 3,
							maxReplicas: 15,
						}),
					}),
				}),
			);
		});

		it('should update only specified fields', async () => {
			const existingHPA = {
				spec: {
					minReplicas: 1,
					maxReplicas: 5,
					metrics: [],
					scaleTargetRef: {
						apiVersion: 'apps/v1',
						kind: 'Deployment',
						name: 'my-deployment',
					},
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(existingHPA);
			mockAutoscalingApi.replaceNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			await autoscaler.updateHPA('my-hpa', {
				minReplicas: 2,
			});

			expect(mockAutoscalingApi.replaceNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						spec: expect.objectContaining({
							minReplicas: 2,
							maxReplicas: 5, // Unchanged
						}),
					}),
				}),
			);
		});

		it('should use custom namespace', async () => {
			const existingHPA = {
				spec: {
					minReplicas: 1,
					maxReplicas: 5,
					metrics: [],
					scaleTargetRef: {
						apiVersion: 'apps/v1',
						kind: 'Deployment',
						name: 'my-deployment',
					},
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(existingHPA);
			mockAutoscalingApi.replaceNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			await autoscaler.updateHPA('my-hpa', {
				namespace: 'custom-ns',
				minReplicas: 2,
			});

			expect(mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'custom-ns',
				}),
			);
		});
	});

	describe('deleteHPA', () => {
		it('should delete HPA', async () => {
			mockAutoscalingApi.deleteNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			await autoscaler.deleteHPA('my-hpa');

			expect(mockAutoscalingApi.deleteNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'my-hpa',
					namespace: 'test-namespace',
				}),
			);
		});

		it('should delete HPA with custom namespace', async () => {
			mockAutoscalingApi.deleteNamespacedHorizontalPodAutoscaler.mockResolvedValue({});

			await autoscaler.deleteHPA('my-hpa', 'custom-ns');

			expect(mockAutoscalingApi.deleteNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'my-hpa',
					namespace: 'custom-ns',
				}),
			);
		});
	});

	describe('getHPAStatus', () => {
		it('should get HPA status with CPU metrics', async () => {
			const mockHPA = {
				metadata: {
					name: 'my-hpa',
					namespace: 'test-namespace',
				},
				status: {
					currentReplicas: 3,
					desiredReplicas: 5,
					currentMetrics: [
						{
							type: 'Resource',
							resource: {
								name: 'cpu',
								current: {
									averageUtilization: 75,
								},
							},
						},
					],
					lastScaleTime: '2023-01-01T00:00:00Z',
					conditions: [
						{
							type: 'AbleToScale',
							status: 'True',
							lastTransitionTime: '2023-01-01T00:00:00Z',
							reason: 'ReadyForNewScale',
							message: 'Ready to scale',
						},
					],
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPA);

			const status = await autoscaler.getHPAStatus('my-hpa');

			expect(status.name).toBe('my-hpa');
			expect(status.currentReplicas).toBe(3);
			expect(status.desiredReplicas).toBe(5);
			expect(status.currentCPUUtilization).toBe(75);
			expect(status.lastScaleTime).toBeInstanceOf(Date);
			expect(status.conditions).toHaveLength(1);
		});

		it('should get HPA status with memory metrics', async () => {
			const mockHPA = {
				metadata: {
					name: 'my-hpa',
					namespace: 'test-namespace',
				},
				status: {
					currentReplicas: 2,
					desiredReplicas: 2,
					currentMetrics: [
						{
							type: 'Resource',
							resource: {
								name: 'memory',
								current: {
									averageUtilization: 60,
								},
							},
						},
					],
					conditions: [],
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPA);

			const status = await autoscaler.getHPAStatus('my-hpa');

			expect(status.currentMemoryUtilization).toBe(60);
		});

		it('should handle HPA with no metrics', async () => {
			const mockHPA = {
				metadata: {
					name: 'my-hpa',
					namespace: 'test-namespace',
				},
				status: {
					currentReplicas: 1,
					desiredReplicas: 1,
					currentMetrics: [],
					conditions: [],
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPA);

			const status = await autoscaler.getHPAStatus('my-hpa');

			expect(status.currentCPUUtilization).toBeUndefined();
			expect(status.currentMemoryUtilization).toBeUndefined();
		});

		it('should handle HPA with no status', async () => {
			const mockHPA = {
				metadata: {
					name: 'my-hpa',
					namespace: 'test-namespace',
				},
				status: {},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPA);

			const status = await autoscaler.getHPAStatus('my-hpa');

			expect(status.currentReplicas).toBe(0);
			expect(status.desiredReplicas).toBe(0);
			expect(status.conditions).toEqual([]);
		});

		it('should use custom namespace', async () => {
			const mockHPA = {
				metadata: {
					name: 'my-hpa',
					namespace: 'custom-ns',
				},
				status: {
					currentReplicas: 1,
					desiredReplicas: 1,
					conditions: [],
				},
			};

			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPA);

			await autoscaler.getHPAStatus('my-hpa', 'custom-ns');

			expect(mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'custom-ns',
				}),
			);
		});
	});

	describe('listHPAs', () => {
		it('should list all HPAs in namespace', async () => {
			const mockHPAList = {
				items: [
					{
						metadata: {
							name: 'hpa-1',
							namespace: 'test-namespace',
						},
						status: {
							currentReplicas: 2,
							desiredReplicas: 2,
							conditions: [],
						},
					},
					{
						metadata: {
							name: 'hpa-2',
							namespace: 'test-namespace',
						},
						status: {
							currentReplicas: 3,
							desiredReplicas: 5,
							conditions: [],
						},
					},
				],
			};

			mockAutoscalingApi.listNamespacedHorizontalPodAutoscaler.mockResolvedValue(mockHPAList);
			mockAutoscalingApi.readNamespacedHorizontalPodAutoscaler
				.mockResolvedValueOnce(mockHPAList.items[0])
				.mockResolvedValueOnce(mockHPAList.items[1]);

			const hpas = await autoscaler.listHPAs();

			expect(hpas).toHaveLength(2);
			expect(hpas[0]?.name).toBe('hpa-1');
			expect(hpas[1]?.name).toBe('hpa-2');
		});

		it('should handle empty HPA list', async () => {
			mockAutoscalingApi.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
				items: [],
			});

			const hpas = await autoscaler.listHPAs();

			expect(hpas).toEqual([]);
		});

		it('should use custom namespace', async () => {
			mockAutoscalingApi.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
				items: [],
			});

			await autoscaler.listHPAs('custom-ns');

			expect(mockAutoscalingApi.listNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'custom-ns',
				}),
			);
		});
	});

	describe('scaleDeployment', () => {
		it('should manually scale deployment', async () => {
			const mockDeployment = {
				spec: {
					replicas: 2,
					selector: {},
					template: {},
				},
			};

			const kubeConfig = new k8s.KubeConfig();
			const mockAppsApi = kubeConfig.makeApiClient(mockAppsV1Api) as {
				readNamespacedDeployment: Mock;
				replaceNamespacedDeployment: Mock;
			};

			mockAppsApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);
			mockAppsApi.replaceNamespacedDeployment.mockResolvedValue({});

			await autoscaler.scaleDeployment('my-deployment', 5);

			expect(mockAppsApi.readNamespacedDeployment).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'my-deployment',
					namespace: 'test-namespace',
				}),
			);

			expect(mockAppsApi.replaceNamespacedDeployment).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'my-deployment',
					namespace: 'test-namespace',
					body: expect.objectContaining({
						spec: expect.objectContaining({
							replicas: 5,
						}),
					}),
				}),
			);
		});

		it('should scale deployment in custom namespace', async () => {
			const mockDeployment = {
				spec: {
					replicas: 2,
					selector: {},
					template: {},
				},
			};

			const kubeConfig = new k8s.KubeConfig();
			const mockAppsApi = kubeConfig.makeApiClient(mockAppsV1Api) as {
				readNamespacedDeployment: Mock;
				replaceNamespacedDeployment: Mock;
			};

			mockAppsApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);
			mockAppsApi.replaceNamespacedDeployment.mockResolvedValue({});

			await autoscaler.scaleDeployment('my-deployment', 10, 'custom-ns');

			expect(mockAppsApi.readNamespacedDeployment).toHaveBeenCalledWith(
				expect.objectContaining({
					namespace: 'custom-ns',
				}),
			);
		});
	});
});
