/**
 * Deployment context types for ADO
 * Supports local (Docker) and Kubernetes deployments
 */

export type DeploymentType = 'docker' | 'k8s';

export interface DeploymentContext {
	type: DeploymentType;
	storage: StorageConfig;
	rateLimitTracking: RateLimitTrackingConfig;
}

export interface LocalDeploymentContext extends DeploymentContext {
	type: 'docker';
	storage: {
		driver: 'sqlite';
		path: string;
	};
	rateLimitTracking: {
		driver: 'memory' | 'redis';
		redisUrl?: string;
	};
}

export interface KubernetesDeploymentContext extends DeploymentContext {
	type: 'k8s';
	namespace: string;
	kubeconfig?: string;
	storage: {
		driver: 'postgresql';
		connectionString: string;
	};
	rateLimitTracking: {
		driver: 'redis';
		redisUrl: string;
	};
}

export interface StorageConfig {
	driver: 'sqlite' | 'postgresql';
	path?: string;
	connectionString?: string;
}

export interface RateLimitTrackingConfig {
	driver: 'memory' | 'redis';
	redisUrl?: string;
}

export interface DeploymentConfig {
	default: string;
	contexts: Record<string, DeploymentContext>;
}

export type ContextName = 'local' | 'kubernetes' | string;
