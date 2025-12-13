/**
 * Tests for Deployment Context Manager
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DeploymentContextManager, createDeploymentContextManager } from '../context-manager.js';
import type {
	DeploymentConfig,
	KubernetesDeploymentContext,
	LocalDeploymentContext,
} from '../types.js';

describe('DeploymentContextManager', () => {
	let localContext: LocalDeploymentContext;
	let k8sContext: KubernetesDeploymentContext;
	let deploymentConfig: DeploymentConfig;

	beforeEach(() => {
		localContext = {
			type: 'docker',
			storage: {
				driver: 'sqlite',
				path: '/data/ado.db',
			},
			rateLimitTracking: {
				driver: 'memory',
			},
		};

		k8sContext = {
			type: 'k8s',
			namespace: 'ado-production',
			kubeconfig: '/home/user/.kube/config',
			storage: {
				driver: 'postgresql',
				connectionString: 'postgresql://localhost:5432/ado',
			},
			rateLimitTracking: {
				driver: 'redis',
				redisUrl: 'redis://localhost:6379',
			},
		};

		deploymentConfig = {
			default: 'local',
			contexts: {
				local: localContext,
				kubernetes: k8sContext,
			},
		};
	});

	describe('Constructor and Initialization', () => {
		it('should initialize with valid config', () => {
			const manager = new DeploymentContextManager(deploymentConfig);
			expect(manager).toBeDefined();
			expect(manager.getCurrentContextName()).toBe('local');
		});

		it('should set default context on initialization', () => {
			const manager = new DeploymentContextManager(deploymentConfig);
			expect(manager.getCurrentContextName()).toBe('local');
		});

		it('should initialize with kubernetes as default', () => {
			const config = { ...deploymentConfig, default: 'kubernetes' };
			const manager = new DeploymentContextManager(config);
			expect(manager.getCurrentContextName()).toBe('kubernetes');
		});
	});

	describe('Context Retrieval', () => {
		let manager: DeploymentContextManager;

		beforeEach(() => {
			manager = new DeploymentContextManager(deploymentConfig);
		});

		it('should get current context', () => {
			const context = manager.getCurrentContext();
			expect(context).toBeDefined();
			expect(context.type).toBe('docker');
			expect(context.storage.driver).toBe('sqlite');
		});

		it('should throw error when current context not found', () => {
			const invalidConfig = {
				default: 'nonexistent',
				contexts: {},
			};
			const manager = new DeploymentContextManager(invalidConfig);

			expect(() => manager.getCurrentContext()).toThrow(
				"Deployment context 'nonexistent' not found in configuration",
			);
		});

		it('should get specific context by name', () => {
			const context = manager.getContext('kubernetes');
			expect(context).toBeDefined();
			expect(context.type).toBe('k8s');
			expect((context as KubernetesDeploymentContext).namespace).toBe('ado-production');
		});

		it('should throw error when getting nonexistent context', () => {
			expect(() => manager.getContext('invalid')).toThrow(
				"Deployment context 'invalid' not found in configuration",
			);
		});

		it('should list all available contexts', () => {
			const contexts = manager.listContexts();
			expect(contexts).toHaveLength(2);
			expect(contexts).toContain('local');
			expect(contexts).toContain('kubernetes');
		});
	});

	describe('Context Switching', () => {
		let manager: DeploymentContextManager;

		beforeEach(() => {
			manager = new DeploymentContextManager(deploymentConfig);
		});

		it('should switch to kubernetes context', () => {
			manager.switchContext('kubernetes');
			expect(manager.getCurrentContextName()).toBe('kubernetes');
			expect(manager.getCurrentContext().type).toBe('k8s');
		});

		it('should switch to local context', () => {
			manager.switchContext('kubernetes');
			manager.switchContext('local');
			expect(manager.getCurrentContextName()).toBe('local');
			expect(manager.getCurrentContext().type).toBe('docker');
		});

		it('should throw error when switching to nonexistent context', () => {
			expect(() => manager.switchContext('invalid')).toThrow(
				"Deployment context 'invalid' not found. Available contexts: local, kubernetes",
			);
		});

		it('should maintain state after multiple switches', () => {
			manager.switchContext('kubernetes');
			manager.switchContext('local');
			manager.switchContext('kubernetes');
			expect(manager.getCurrentContextName()).toBe('kubernetes');
		});
	});

	describe('Context Type Detection', () => {
		let manager: DeploymentContextManager;

		beforeEach(() => {
			manager = new DeploymentContextManager(deploymentConfig);
		});

		it('should detect local deployment', () => {
			expect(manager.isLocal()).toBe(true);
			expect(manager.isKubernetes()).toBe(false);
		});

		it('should detect kubernetes deployment', () => {
			manager.switchContext('kubernetes');
			expect(manager.isKubernetes()).toBe(true);
			expect(manager.isLocal()).toBe(false);
		});
	});

	describe('Configuration Retrieval', () => {
		let manager: DeploymentContextManager;

		beforeEach(() => {
			manager = new DeploymentContextManager(deploymentConfig);
		});

		it('should get storage config for local context', () => {
			const storage = manager.getStorageConfig();
			expect(storage.driver).toBe('sqlite');
			expect(storage.path).toBe('/data/ado.db');
		});

		it('should get storage config for k8s context', () => {
			manager.switchContext('kubernetes');
			const storage = manager.getStorageConfig();
			expect(storage.driver).toBe('postgresql');
			expect(storage.connectionString).toBe('postgresql://localhost:5432/ado');
		});

		it('should get rate limit tracking config for local context', () => {
			const rateLimitConfig = manager.getRateLimitTrackingConfig();
			expect(rateLimitConfig.driver).toBe('memory');
		});

		it('should get rate limit tracking config for k8s context', () => {
			manager.switchContext('kubernetes');
			const rateLimitConfig = manager.getRateLimitTrackingConfig();
			expect(rateLimitConfig.driver).toBe('redis');
			expect(rateLimitConfig.redisUrl).toBe('redis://localhost:6379');
		});
	});

	describe('Environment Configuration', () => {
		let manager: DeploymentContextManager;

		beforeEach(() => {
			manager = new DeploymentContextManager(deploymentConfig);
		});

		it('should generate environment config for local context', () => {
			const env = manager.getEnvironmentConfig();
			expect(env.SQLITE_PATH).toBe('/data/ado.db');
			expect(env.REDIS_URL).toBeUndefined();
			expect(env.KUBECONFIG).toBeUndefined();
			expect(env.K8S_NAMESPACE).toBeUndefined();
		});

		it('should generate environment config for k8s context', () => {
			manager.switchContext('kubernetes');
			const env = manager.getEnvironmentConfig();
			expect(env.KUBECONFIG).toBe('/home/user/.kube/config');
			expect(env.K8S_NAMESPACE).toBe('ado-production');
			expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/ado');
			expect(env.REDIS_URL).toBe('redis://localhost:6379');
			expect(env.SQLITE_PATH).toBeUndefined();
		});

		it('should include redis URL for local context with redis', () => {
			const configWithRedis = {
				default: 'local',
				contexts: {
					local: {
						type: 'docker' as const,
						storage: {
							driver: 'sqlite' as const,
							path: '/data/ado.db',
						},
						rateLimitTracking: {
							driver: 'redis' as const,
							redisUrl: 'redis://local:6379',
						},
					},
				},
			};
			const manager = new DeploymentContextManager(configWithRedis);
			const env = manager.getEnvironmentConfig();
			expect(env.REDIS_URL).toBe('redis://local:6379');
		});
	});

	describe('Validation', () => {
		it('should validate valid configuration', () => {
			const manager = new DeploymentContextManager(deploymentConfig);
			const validation = manager.validate();
			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect missing default context', () => {
			const invalidConfig = {
				default: 'nonexistent',
				contexts: {
					local: localContext,
				},
			};
			const manager = new DeploymentContextManager(invalidConfig);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain("Default context 'nonexistent' not found in contexts");
		});

		it('should detect missing context type', () => {
			const invalidConfig = {
				default: 'local',
				contexts: {
					local: {
						storage: { driver: 'sqlite' as const, path: '/data/ado.db' },
						rateLimitTracking: { driver: 'memory' as const },
					},
				},
			};
			const manager = new DeploymentContextManager(invalidConfig);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain("Context 'local' missing type");
		});

		it('should detect missing k8s namespace', () => {
			const invalidK8sContext = {
				type: 'k8s' as const,
				storage: {
					driver: 'postgresql' as const,
					connectionString: 'postgresql://localhost:5432/ado',
				},
				rateLimitTracking: {
					driver: 'redis' as const,
					redisUrl: 'redis://localhost:6379',
				},
			};
			const config = {
				default: 'kubernetes',
				contexts: {
					kubernetes: invalidK8sContext,
				},
			};
			const manager = new DeploymentContextManager(config);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain("Kubernetes context 'kubernetes' missing namespace");
		});

		it('should detect invalid storage driver for k8s', () => {
			const invalidK8sContext = {
				type: 'k8s' as const,
				namespace: 'ado-production',
				storage: {
					driver: 'sqlite' as const,
					path: '/data/ado.db',
				},
				rateLimitTracking: {
					driver: 'redis' as const,
					redisUrl: 'redis://localhost:6379',
				},
			};
			const config = {
				default: 'kubernetes',
				contexts: {
					kubernetes: invalidK8sContext,
				},
			};
			const manager = new DeploymentContextManager(config);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain(
				"Kubernetes context 'kubernetes' must use postgresql for storage",
			);
		});

		it('should detect invalid rate limit tracking for k8s', () => {
			const invalidK8sContext = {
				type: 'k8s' as const,
				namespace: 'ado-production',
				storage: {
					driver: 'postgresql' as const,
					connectionString: 'postgresql://localhost:5432/ado',
				},
				rateLimitTracking: {
					driver: 'memory' as const,
				},
			};
			const config = {
				default: 'kubernetes',
				contexts: {
					kubernetes: invalidK8sContext,
				},
			};
			const manager = new DeploymentContextManager(config);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain(
				"Kubernetes context 'kubernetes' must use redis for rate limit tracking",
			);
		});

		it('should detect missing storage path for local sqlite', () => {
			const invalidLocalContext = {
				type: 'docker' as const,
				storage: {
					driver: 'sqlite' as const,
				},
				rateLimitTracking: {
					driver: 'memory' as const,
				},
			};
			const config = {
				default: 'local',
				contexts: {
					local: invalidLocalContext,
				},
			};
			const manager = new DeploymentContextManager(config);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain("Local context 'local' missing storage path");
		});

		it('should accumulate multiple validation errors', () => {
			const invalidConfig = {
				default: 'invalid',
				contexts: {
					local: {
						storage: { driver: 'sqlite' as const, path: '/data/ado.db' },
						rateLimitTracking: { driver: 'memory' as const },
					},
					k8s: {
						type: 'k8s' as const,
						storage: {
							driver: 'sqlite' as const,
							path: '/data/ado.db',
						},
						rateLimitTracking: {
							driver: 'memory' as const,
						},
					},
				},
			};
			const manager = new DeploymentContextManager(invalidConfig);
			const validation = manager.validate();
			expect(validation.valid).toBe(false);
			expect(validation.errors.length).toBeGreaterThan(1);
		});
	});

	describe('Factory Function', () => {
		it('should create manager with valid config', () => {
			const manager = createDeploymentContextManager(deploymentConfig);
			expect(manager).toBeDefined();
			expect(manager.getCurrentContextName()).toBe('local');
		});

		it('should throw error for invalid config', () => {
			const invalidConfig = {
				default: 'nonexistent',
				contexts: {
					local: localContext,
				},
			};

			expect(() => createDeploymentContextManager(invalidConfig)).toThrow(
				'Invalid deployment configuration',
			);
		});

		it('should throw error with all validation errors', () => {
			const invalidConfig = {
				default: 'k8s',
				contexts: {
					k8s: {
						type: 'k8s' as const,
						storage: {
							driver: 'sqlite' as const,
							path: '/data/ado.db',
						},
						rateLimitTracking: {
							driver: 'memory' as const,
						},
					},
				},
			};

			expect(() => createDeploymentContextManager(invalidConfig)).toThrow(
				/Kubernetes context 'k8s' missing namespace/,
			);
		});
	});
});
