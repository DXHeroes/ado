/**
 * Deployment context management module
 * Handles switching between local and Kubernetes deployment contexts
 */

export {
	DeploymentContextManager,
	createDeploymentContextManager,
} from './context-manager.js';
export type {
	ContextName,
	DeploymentConfig,
	DeploymentContext,
	DeploymentType,
	KubernetesDeploymentContext,
	LocalDeploymentContext,
	RateLimitTrackingConfig,
	StorageConfig,
} from './types.js';
export {
	GracefulShutdownHandler,
	LivenessProbe,
	ReadinessProbe,
	getCurrentInstance,
	getRecommendedCoordinationStrategy,
	isScaledDeployment,
} from './scaling.js';
export type {
	CoordinationConfig,
	CoordinationStrategy,
	InstanceInfo,
	ScalingConfig,
} from './scaling.js';
