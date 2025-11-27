// API client for ADO dashboard

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${endpoint}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options?.headers,
		},
	});

	if (!response.ok) {
		throw new Error(`API error: ${response.statusText}`);
	}

	return response.json();
}

// Dashboard stats
export interface DashboardStats {
	activeTasks: number;
	completedToday: number;
	apiCost24h: number;
	avgDuration: number;
	recentAlerts?: Array<{
		message: string;
		time: string;
	}>;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
	return fetchAPI<DashboardStats>('/api/dashboard/stats');
}

// Usage history
export interface UsageHistory {
	taskVolume: Array<{ date: string; count: number }>;
	providerUsage: Array<{ provider: string; count: number }>;
	costTrend: Array<{ date: string; subscription: number; api: number }>;
}

export async function fetchUsageHistory(): Promise<UsageHistory> {
	return fetchAPI<UsageHistory>('/api/dashboard/usage-history');
}

// Tasks
export interface Task {
	id: string;
	prompt: string;
	provider: string;
	status: 'running' | 'paused' | 'completed' | 'failed' | 'pending';
	startedAt: string;
	completedAt?: string;
	duration?: number;
	cost?: number;
	accessMode?: string;
}

export async function fetchTasks(): Promise<Task[]> {
	return fetchAPI<Task[]>('/api/tasks');
}

export interface TaskDetail extends Task {
	events?: Array<{
		type: string;
		timestamp: string;
		data?: unknown;
	}>;
}

export async function fetchTaskDetail(taskId: string): Promise<TaskDetail> {
	return fetchAPI<TaskDetail>(`/api/tasks/${taskId}`);
}

// Providers
export interface Provider {
	id: string;
	name: string;
	enabled: boolean;
	accessModes: Array<{
		mode: 'subscription' | 'api' | 'free';
		enabled: boolean;
		priority: number;
	}>;
	rateLimits?: {
		requestsPerDay?: number;
		requestsPerHour?: number;
		tokensPerDay?: number;
	};
	capabilities: {
		codeGeneration: boolean;
		codeReview: boolean;
		refactoring: boolean;
		testing: boolean;
		documentation: boolean;
		debugging: boolean;
	};
	usage?: {
		requestsToday?: number;
	};
}

export async function fetchProviders(): Promise<Provider[]> {
	return fetchAPI<Provider[]>('/api/providers');
}

export async function toggleProvider(id: string, enabled: boolean): Promise<void> {
	await fetchAPI(`/api/providers/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ enabled }),
	});
}
