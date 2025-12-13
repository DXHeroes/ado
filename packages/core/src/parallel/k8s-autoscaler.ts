/**
 * Kubernetes Horizontal Pod Autoscaler (HPA)
 *
 * Manages automatic scaling of worker pods based on metrics.
 */

import * as k8s from '@kubernetes/client-node';

export interface HPAConfig {
	/**
	 * Target deployment/replicaset name
	 */
	targetName: string;

	/**
	 * Target kind (Deployment, ReplicaSet, StatefulSet)
	 */
	targetKind?: 'Deployment' | 'ReplicaSet' | 'StatefulSet';

	/**
	 * Kubernetes namespace
	 */
	namespace?: string | undefined;

	/**
	 * Minimum replicas
	 */
	minReplicas: number;

	/**
	 * Maximum replicas
	 */
	maxReplicas: number;

	/**
	 * Target CPU utilization percentage (0-100)
	 */
	targetCPUUtilizationPercentage?: number | undefined;

	/**
	 * Target memory utilization percentage (0-100)
	 */
	targetMemoryUtilizationPercentage?: number | undefined;

	/**
	 * Custom metrics
	 */
	customMetrics?: CustomMetric[] | undefined;

	/**
	 * Scale down stabilization window (seconds)
	 */
	scaleDownStabilizationWindowSeconds?: number | undefined;
}

export interface CustomMetric {
	/**
	 * Metric name
	 */
	name: string;

	/**
	 * Metric type (pod, object, external)
	 */
	type: 'pod' | 'object' | 'external';

	/**
	 * Target value
	 */
	targetValue: string;

	/**
	 * Target average value (for pod metrics)
	 */
	targetAverageValue?: string | undefined;
}

export interface HPAStatus {
	/**
	 * HPA name
	 */
	name: string;

	/**
	 * Current replicas
	 */
	currentReplicas: number;

	/**
	 * Desired replicas
	 */
	desiredReplicas: number;

	/**
	 * Current CPU utilization
	 */
	currentCPUUtilization?: number | undefined;

	/**
	 * Current memory utilization
	 */
	currentMemoryUtilization?: number | undefined;

	/**
	 * Last scale time
	 */
	lastScaleTime?: Date | undefined;

	/**
	 * Conditions
	 */
	conditions: Array<{
		type: string;
		status: string;
		lastTransitionTime?: Date | undefined;
		reason?: string | undefined;
		message?: string | undefined;
	}>;
}

/**
 * Kubernetes HPA manager
 */
export class K8sAutoscaler {
	private autoscalingApi: k8s.AutoscalingV2Api;
	private namespace: string;

	constructor(config?: { namespace?: string }) {
		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();

		this.autoscalingApi = kc.makeApiClient(k8s.AutoscalingV2Api);
		this.namespace = config?.namespace ?? 'default';
	}

	/**
	 * Create HPA
	 */
	async createHPA(config: HPAConfig): Promise<void> {
		const hpaName = `${config.targetName}-hpa`;
		const namespace = config.namespace ?? this.namespace;

		const metrics: k8s.V2MetricSpec[] = [];

		// Add CPU metric if specified
		if (config.targetCPUUtilizationPercentage !== undefined) {
			metrics.push({
				type: 'Resource',
				resource: {
					name: 'cpu',
					target: {
						type: 'Utilization',
						averageUtilization: config.targetCPUUtilizationPercentage,
					},
				},
			});
		}

		// Add memory metric if specified
		if (config.targetMemoryUtilizationPercentage !== undefined) {
			metrics.push({
				type: 'Resource',
				resource: {
					name: 'memory',
					target: {
						type: 'Utilization',
						averageUtilization: config.targetMemoryUtilizationPercentage,
					},
				},
			});
		}

		// Add custom metrics
		if (config.customMetrics) {
			for (const metric of config.customMetrics) {
				if (metric.type === 'pod') {
					metrics.push({
						type: 'Pods',
						pods: {
							metric: {
								name: metric.name,
							},
							target: {
								type: 'AverageValue',
								averageValue: metric.targetAverageValue ?? metric.targetValue,
							},
						},
					});
				} else if (metric.type === 'object') {
					metrics.push({
						type: 'Object',
						object: {
							metric: {
								name: metric.name,
							},
							target: {
								type: 'Value',
								value: metric.targetValue,
							},
							describedObject: {
								apiVersion: 'v1',
								kind: 'Service',
								name: config.targetName,
							},
						},
					});
				} else if (metric.type === 'external') {
					metrics.push({
						type: 'External',
						external: {
							metric: {
								name: metric.name,
							},
							target: {
								type: 'Value',
								value: metric.targetValue,
							},
						},
					});
				}
			}
		}

		const hpa: k8s.V2HorizontalPodAutoscaler = {
			apiVersion: 'autoscaling/v2',
			kind: 'HorizontalPodAutoscaler',
			metadata: {
				name: hpaName,
				namespace,
			},
			spec: {
				scaleTargetRef: {
					apiVersion: 'apps/v1',
					kind: config.targetKind ?? 'Deployment',
					name: config.targetName,
				},
				minReplicas: config.minReplicas,
				maxReplicas: config.maxReplicas,
				metrics,
				...(config.scaleDownStabilizationWindowSeconds && {
					behavior: {
						scaleDown: {
							stabilizationWindowSeconds: config.scaleDownStabilizationWindowSeconds,
						},
					},
				}),
			},
		};

		await this.autoscalingApi.createNamespacedHorizontalPodAutoscaler({
			namespace,
			body: hpa,
		});
	}

	/**
	 * Update HPA
	 */
	async updateHPA(name: string, config: Partial<HPAConfig>): Promise<void> {
		const namespace = config.namespace ?? this.namespace;

		// Get existing HPA
		const existing = await this.autoscalingApi.readNamespacedHorizontalPodAutoscaler({
			name,
			namespace,
		});

		// Update spec
		if (config.minReplicas !== undefined) {
			existing.spec!.minReplicas = config.minReplicas;
		}
		if (config.maxReplicas !== undefined) {
			existing.spec!.maxReplicas = config.maxReplicas;
		}

		await this.autoscalingApi.replaceNamespacedHorizontalPodAutoscaler({
			name,
			namespace,
			body: existing,
		});
	}

	/**
	 * Delete HPA
	 */
	async deleteHPA(name: string, namespace?: string): Promise<void> {
		await this.autoscalingApi.deleteNamespacedHorizontalPodAutoscaler({
			name,
			namespace: namespace ?? this.namespace,
		});
	}

	/**
	 * Get HPA status
	 */
	async getHPAStatus(name: string, namespace?: string): Promise<HPAStatus> {
		const hpa = await this.autoscalingApi.readNamespacedHorizontalPodAutoscaler({
			name,
			namespace: namespace ?? this.namespace,
		});

		// Parse CPU utilization
		let currentCPUUtilization: number | undefined;
		const cpuMetric = hpa.status?.currentMetrics?.find(
			(m: k8s.V2MetricStatus) => m.type === 'Resource' && m.resource?.name === 'cpu',
		);
		if (cpuMetric?.resource?.current?.averageUtilization) {
			currentCPUUtilization = cpuMetric.resource.current.averageUtilization;
		}

		// Parse memory utilization
		let currentMemoryUtilization: number | undefined;
		const memMetric = hpa.status?.currentMetrics?.find(
			(m: k8s.V2MetricStatus) => m.type === 'Resource' && m.resource?.name === 'memory',
		);
		if (memMetric?.resource?.current?.averageUtilization) {
			currentMemoryUtilization = memMetric.resource.current.averageUtilization;
		}

		return {
			name: hpa.metadata!.name!,
			currentReplicas: hpa.status?.currentReplicas ?? 0,
			desiredReplicas: hpa.status?.desiredReplicas ?? 0,
			currentCPUUtilization,
			currentMemoryUtilization,
			lastScaleTime: hpa.status?.lastScaleTime
				? new Date(hpa.status.lastScaleTime)
				: undefined,
			conditions:
				hpa.status?.conditions?.map((c: k8s.V2HorizontalPodAutoscalerCondition) => ({
					type: c.type,
					status: c.status,
					lastTransitionTime: c.lastTransitionTime
						? new Date(c.lastTransitionTime)
						: undefined,
					reason: c.reason,
					message: c.message,
				})) ?? [],
		};
	}

	/**
	 * List all HPAs
	 */
	async listHPAs(namespace?: string): Promise<HPAStatus[]> {
		const list = await this.autoscalingApi.listNamespacedHorizontalPodAutoscaler({
			namespace: namespace ?? this.namespace,
		});

		return Promise.all(
			(list.items ?? []).map((hpa: k8s.V2HorizontalPodAutoscaler) =>
				this.getHPAStatus(hpa.metadata!.name!, hpa.metadata!.namespace),
			),
		);
	}

	/**
	 * Scale deployment manually
	 */
	async scaleDeployment(name: string, replicas: number, namespace?: string): Promise<void> {
		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();
		const appsApi = kc.makeApiClient(k8s.AppsV1Api);

		// Get deployment
		const deployment = await appsApi.readNamespacedDeployment({
			name,
			namespace: namespace ?? this.namespace,
		});

		// Update replicas
		deployment.spec!.replicas = replicas;

		await appsApi.replaceNamespacedDeployment({
			name,
			namespace: namespace ?? this.namespace,
			body: deployment,
		});
	}
}

/**
 * Create K8s autoscaler
 */
export function createK8sAutoscaler(config?: { namespace?: string }): K8sAutoscaler {
	return new K8sAutoscaler(config);
}
