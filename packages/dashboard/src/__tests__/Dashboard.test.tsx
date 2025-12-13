import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardStats, UsageHistory } from '../api/client';
import { Dashboard } from '../pages/Dashboard';

// Mock the API client
vi.mock('../api/client', () => ({
	fetchDashboardStats: vi.fn(),
	fetchUsageHistory: vi.fn(),
}));

import * as apiClient from '../api/client';

describe('Dashboard Page', () => {
	const mockStats: DashboardStats = {
		activeTasks: 5,
		completedToday: 12,
		apiCost24h: 3.45,
		avgDuration: 45,
		recentAlerts: [
			{ message: 'Rate limit warning for Claude', time: '10:30 AM' },
			{ message: 'High API cost detected', time: '09:15 AM' },
		],
	};

	const mockUsageHistory: UsageHistory = {
		taskVolume: [
			{ date: '2024-01-01', count: 10 },
			{ date: '2024-01-02', count: 15 },
			{ date: '2024-01-03', count: 12 },
		],
		providerUsage: [
			{ provider: 'claude', count: 20 },
			{ provider: 'gemini', count: 15 },
			{ provider: 'cursor', count: 10 },
		],
		costTrend: [
			{ date: '2024-01-01', subscription: 5, api: 2 },
			{ date: '2024-01-02', subscription: 5, api: 3 },
			{ date: '2024-01-03', subscription: 5, api: 2.5 },
		],
	};

	const createWrapper = () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		return ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};

	it('renders the page title and description', () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		expect(screen.getByText('Dashboard')).toBeInTheDocument();
		expect(screen.getByText('Overview of your ADO orchestrator activity')).toBeInTheDocument();
	});

	it('displays stat cards with correct data', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Active Tasks')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();

			expect(screen.getByText('Completed Today')).toBeInTheDocument();
			expect(screen.getByText('12')).toBeInTheDocument();

			expect(screen.getByText('API Cost (24h)')).toBeInTheDocument();
			expect(screen.getByText('$3.45')).toBeInTheDocument();

			expect(screen.getByText('Avg Duration')).toBeInTheDocument();
			expect(screen.getByText('45s')).toBeInTheDocument();
		});
	});

	it('displays trends with correct styling', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('+12% from yesterday')).toBeInTheDocument();
			expect(screen.getByText('+8% from yesterday')).toBeInTheDocument();
			expect(screen.getByText('-5% from yesterday')).toBeInTheDocument();
			expect(screen.getByText('-2s from yesterday')).toBeInTheDocument();
		});
	});

	it('renders chart titles', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Task Volume (7 Days)')).toBeInTheDocument();
			expect(screen.getByText('Provider Usage Distribution')).toBeInTheDocument();
			expect(screen.getByText('API Cost Trend (7 Days)')).toBeInTheDocument();
		});
	});

	it('displays recent alerts when available', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Recent Alerts')).toBeInTheDocument();
			expect(screen.getByText('Rate limit warning for Claude')).toBeInTheDocument();
			expect(screen.getByText('10:30 AM')).toBeInTheDocument();
			expect(screen.getByText('High API cost detected')).toBeInTheDocument();
			expect(screen.getByText('09:15 AM')).toBeInTheDocument();
		});
	});

	it('does not display alerts section when no alerts', async () => {
		const statsWithoutAlerts = { ...mockStats, recentAlerts: [] };
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(statsWithoutAlerts);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.queryByText('Recent Alerts')).not.toBeInTheDocument();
		});
	});

	it('handles missing stats data gracefully', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue({
			activeTasks: 0,
			completedToday: 0,
			apiCost24h: 0,
			avgDuration: 0,
		});
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			const zeros = screen.getAllByText('0');
			expect(zeros.length).toBeGreaterThan(0);
			expect(screen.getByText('$0.00')).toBeInTheDocument();
			expect(screen.getByText('0s')).toBeInTheDocument();
		});
	});

	it('handles missing usage history gracefully', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue({
			taskVolume: [],
			providerUsage: [],
			costTrend: [],
		});

		render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Task Volume (7 Days)')).toBeInTheDocument();
			expect(screen.getByText('Provider Usage Distribution')).toBeInTheDocument();
		});
	});

	it('renders stat cards with icons', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		const { container } = render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			const icons = container.querySelectorAll('svg');
			expect(icons.length).toBeGreaterThan(0);
		});
	});

	it('applies correct color classes to trends', async () => {
		vi.mocked(apiClient.fetchDashboardStats).mockResolvedValue(mockStats);
		vi.mocked(apiClient.fetchUsageHistory).mockResolvedValue(mockUsageHistory);

		const { container } = render(<Dashboard />, { wrapper: createWrapper() });

		await waitFor(() => {
			const greenTrends = container.querySelectorAll('.text-green-600');
			const redTrends = container.querySelectorAll('.text-red-600');

			expect(greenTrends.length).toBeGreaterThan(0);
			expect(redTrends.length).toBeGreaterThan(0);
		});
	});
});
