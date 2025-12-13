/**
 * Kubernetes Worker Spawner
 *
 * Spawns remote workers as Kubernetes pods for distributed task execution.
 */

import * as k8s from '@kubernetes/client-node';

export interface K8sWorkerConfig {
	namespace?: string;
	image: string;
	imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
	resources?: {
		requests?: {
			cpu?: string;
			memory?: string;
		};
		limits?: {
			cpu?: string;
			memory?: string;
		};
	};
	env?: Record<string, string>;
	labels?: Record<string, string>;
}

export interface WorkerPod {
	name: string;
	namespace: string;
	status: string;
	createdAt: string;
}

/**
 * Kubernetes worker spawner
 */
export class K8sWorkerSpawner {
	private k8sApi: k8s.CoreV1Api;
	private namespace: string;

	constructor(config?: { namespace?: string }) {
		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();

		this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
		this.namespace = config?.namespace ?? 'default';
	}

	/**
	 * Spawn a new worker pod
	 */
	async spawnWorker(config: K8sWorkerConfig): Promise<WorkerPod> {
		const workerName = `ado-worker-${Date.now()}`;
		const namespace = config.namespace ?? this.namespace;

		const pod: k8s.V1Pod = {
			apiVersion: 'v1',
			kind: 'Pod',
			metadata: {
				name: workerName,
				namespace,
				labels: {
					app: 'ado-worker',
					...config.labels,
				},
			},
			spec: {
				restartPolicy: 'Never',
				containers: [
					{
						name: 'worker',
						image: config.image,
						imagePullPolicy: config.imagePullPolicy ?? 'IfNotPresent',
						env: Object.entries(config.env ?? {}).map(([name, value]) => ({
							name,
							value,
						})),
						...(config.resources && { resources: config.resources }),
					},
				],
			},
		};

		const response = await this.k8sApi.createNamespacedPod({ namespace, body: pod });

		return {
			name: workerName,
			namespace,
			status: response.status?.phase ?? 'Unknown',
			createdAt: response.metadata?.creationTimestamp?.toISOString() ?? new Date().toISOString(),
		};
	}

	/**
	 * Spawn multiple workers in parallel
	 */
	async spawnWorkers(count: number, config: K8sWorkerConfig): Promise<WorkerPod[]> {
		const promises = Array(count)
			.fill(null)
			.map(() => this.spawnWorker(config));

		return Promise.all(promises);
	}

	/**
	 * Get worker pod status
	 */
	async getWorkerStatus(name: string, namespace?: string): Promise<WorkerPod | null> {
		try {
			const response = await this.k8sApi.readNamespacedPodStatus({
				name,
				namespace: namespace ?? this.namespace,
			});

			return {
				name,
				namespace: namespace ?? this.namespace,
				status: response.status?.phase ?? 'Unknown',
				createdAt: response.metadata?.creationTimestamp?.toISOString() ?? new Date().toISOString(),
			};
		} catch (error) {
			if ((error as { response?: { statusCode?: number } }).response?.statusCode === 404) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * List all worker pods
	 */
	async listWorkers(namespace?: string): Promise<WorkerPod[]> {
		const response = await this.k8sApi.listNamespacedPod({
			namespace: namespace ?? this.namespace,
			labelSelector: 'app=ado-worker',
		});

		return response.items.map((pod) => ({
			name: pod.metadata?.name ?? 'unknown',
			namespace: pod.metadata?.namespace ?? this.namespace,
			status: pod.status?.phase ?? 'Unknown',
			createdAt: pod.metadata?.creationTimestamp?.toISOString() ?? new Date().toISOString(),
		}));
	}

	/**
	 * Terminate a worker pod
	 */
	async terminateWorker(name: string, namespace?: string): Promise<void> {
		await this.k8sApi.deleteNamespacedPod({
			name,
			namespace: namespace ?? this.namespace,
		});
	}

	/**
	 * Terminate all worker pods
	 */
	async terminateAllWorkers(namespace?: string): Promise<void> {
		const workers = await this.listWorkers(namespace);

		await Promise.all(workers.map((worker) => this.terminateWorker(worker.name, worker.namespace)));
	}

	/**
	 * Clean up completed/failed worker pods
	 */
	async cleanupCompletedWorkers(namespace?: string): Promise<number> {
		const workers = await this.listWorkers(namespace);

		const completed = workers.filter((w) => w.status === 'Succeeded' || w.status === 'Failed');

		await Promise.all(
			completed.map((worker) => this.terminateWorker(worker.name, worker.namespace)),
		);

		return completed.length;
	}
}

/**
 * Create K8s worker spawner
 */
export function createK8sWorkerSpawner(config?: {
	namespace?: string;
}): K8sWorkerSpawner {
	return new K8sWorkerSpawner(config);
}
