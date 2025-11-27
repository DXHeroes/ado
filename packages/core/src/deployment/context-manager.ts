/**
 * Deployment Context Manager
 * Handles switching between local and Kubernetes deployment contexts
 */

import type {
	ContextName,
	DeploymentConfig,
	DeploymentContext,
	KubernetesDeploymentContext,
	LocalDeploymentContext,
} from './types.js';

export class DeploymentContextManager {
	private config: DeploymentConfig;
	private currentContext: ContextName;

	constructor(config: DeploymentConfig) {
		this.config = config;
		this.currentContext = config.default;
	}

	/**
	 * Get the current deployment context
	 */
	getCurrentContext(): DeploymentContext {
		const context = this.config.contexts[this.currentContext];
		if (!context) {
			throw new Error(`Deployment context '${this.currentContext}' not found in configuration`);
		}
		return context;
	}

	/**
	 * Get the current context name
	 */
	getCurrentContextName(): ContextName {
		return this.currentContext;
	}

	/**
	 * Switch to a different deployment context
	 */
	switchContext(contextName: ContextName): void {
		if (!this.config.contexts[contextName]) {
			throw new Error(
				`Deployment context '${contextName}' not found. Available contexts: ${Object.keys(this.config.contexts).join(', ')}`,
			);
		}
		this.currentContext = contextName;
	}

	/**
	 * Get a specific deployment context by name
	 */
	getContext(contextName: ContextName): DeploymentContext {
		const context = this.config.contexts[contextName];
		if (!context) {
			throw new Error(`Deployment context '${contextName}' not found in configuration`);
		}
		return context;
	}

	/**
	 * List all available deployment contexts
	 */
	listContexts(): ContextName[] {
		return Object.keys(this.config.contexts);
	}

	/**
	 * Check if running in Kubernetes
	 */
	isKubernetes(): boolean {
		const context = this.getCurrentContext();
		return context.type === 'k8s';
	}

	/**
	 * Check if running locally
	 */
	isLocal(): boolean {
		const context = this.getCurrentContext();
		return context.type === 'docker';
	}

	/**
	 * Get storage configuration for current context
	 */
	getStorageConfig(): DeploymentContext['storage'] {
		return this.getCurrentContext().storage;
	}

	/**
	 * Get rate limit tracking configuration for current context
	 */
	getRateLimitTrackingConfig(): DeploymentContext['rateLimitTracking'] {
		return this.getCurrentContext().rateLimitTracking;
	}

	/**
	 * Validate the deployment context configuration
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// Validate default context exists
		if (!this.config.contexts[this.config.default]) {
			errors.push(`Default context '${this.config.default}' not found in contexts`);
		}

		// Validate each context
		for (const [name, context] of Object.entries(this.config.contexts)) {
			if (!context.type) {
				errors.push(`Context '${name}' missing type`);
			}

			if (context.type === 'k8s') {
				const k8sContext = context as KubernetesDeploymentContext;
				if (!k8sContext.namespace) {
					errors.push(`Kubernetes context '${name}' missing namespace`);
				}
				if (k8sContext.storage.driver !== 'postgresql') {
					errors.push(`Kubernetes context '${name}' must use postgresql for storage`);
				}
				if (k8sContext.rateLimitTracking.driver !== 'redis') {
					errors.push(`Kubernetes context '${name}' must use redis for rate limit tracking`);
				}
			}

			if (context.type === 'docker') {
				const localContext = context as LocalDeploymentContext;
				if (localContext.storage.driver === 'sqlite' && !localContext.storage.path) {
					errors.push(`Local context '${name}' missing storage path`);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Get environment-specific configuration
	 * Useful for resolving environment variables based on context
	 */
	getEnvironmentConfig(): Record<string, string | undefined> {
		const context = this.getCurrentContext();
		const env: Record<string, string | undefined> = {};

		if (context.type === 'k8s') {
			const k8sContext = context as KubernetesDeploymentContext;
			env.KUBECONFIG = k8sContext.kubeconfig;
			env.K8S_NAMESPACE = k8sContext.namespace;
			env.DATABASE_URL = k8sContext.storage.connectionString;
			env.REDIS_URL = k8sContext.rateLimitTracking.redisUrl;
		} else {
			const localContext = context as LocalDeploymentContext;
			env.SQLITE_PATH = localContext.storage.path;
			if (localContext.rateLimitTracking.driver === 'redis') {
				env.REDIS_URL = localContext.rateLimitTracking.redisUrl;
			}
		}

		return env;
	}
}

/**
 * Create a deployment context manager from configuration
 */
export function createDeploymentContextManager(config: DeploymentConfig): DeploymentContextManager {
	const manager = new DeploymentContextManager(config);

	// Validate configuration
	const validation = manager.validate();
	if (!validation.valid) {
		throw new Error(`Invalid deployment configuration:\n${validation.errors.join('\n')}`);
	}

	return manager;
}
