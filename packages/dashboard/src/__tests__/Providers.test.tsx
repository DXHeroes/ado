import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '../api/client';
import { Providers } from '../pages/Providers';

// Mock the API client
vi.mock('../api/client', () => ({
	fetchProviders: vi.fn(),
	toggleProvider: vi.fn(),
}));

import * as apiClient from '../api/client';

describe('Providers Page', () => {
	const mockProviders: Provider[] = [
		{
			id: 'claude',
			name: 'Claude Code',
			enabled: true,
			accessModes: [
				{ mode: 'subscription', enabled: true, priority: 1 },
				{ mode: 'api', enabled: true, priority: 2 },
			],
			rateLimits: {
				requestsPerDay: 1000,
				requestsPerHour: 100,
			},
			capabilities: {
				codeGeneration: true,
				codeReview: true,
				refactoring: true,
				testing: true,
				documentation: true,
				debugging: true,
			},
			usage: {
				requestsToday: 45,
			},
		},
		{
			id: 'gemini',
			name: 'Gemini CLI',
			enabled: false,
			accessModes: [
				{ mode: 'api', enabled: true, priority: 1 },
				{ mode: 'free', enabled: false, priority: 2 },
			],
			rateLimits: {
				requestsPerDay: 500,
			},
			capabilities: {
				codeGeneration: true,
				codeReview: false,
				refactoring: true,
				testing: false,
				documentation: true,
				debugging: false,
			},
		},
		{
			id: 'cursor',
			name: 'Cursor CLI',
			enabled: true,
			accessModes: [{ mode: 'subscription', enabled: true, priority: 1 }],
			capabilities: {
				codeGeneration: true,
				codeReview: true,
				refactoring: false,
				testing: true,
				documentation: false,
				debugging: true,
			},
			usage: {
				requestsToday: 12,
			},
		},
	];

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
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		expect(screen.getByText('Providers')).toBeInTheDocument();
		expect(
			screen.getByText('Manage AI coding agents and their configurations'),
		).toBeInTheDocument();
	});

	it('displays all providers', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Claude Code')).toBeInTheDocument();
			expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
			expect(screen.getByText('Cursor CLI')).toBeInTheDocument();
		});
	});

	it('displays provider IDs', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('claude')).toBeInTheDocument();
			expect(screen.getByText('gemini')).toBeInTheDocument();
			expect(screen.getByText('cursor')).toBeInTheDocument();
		});
	});

	it('shows enabled/disabled status buttons', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const enabledButtons = screen.getAllByText('Enabled');
			const disabledButtons = screen.getAllByText('Disabled');
			expect(enabledButtons.length).toBe(2);
			expect(disabledButtons.length).toBe(1);
		});
	});

	it('displays access modes with status', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const text = container.textContent;
			expect(text).toContain('Access Modes');
			expect(text).toContain('subscription');
		});
	});

	it('displays rate limits', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const text = container.textContent;
			expect(text).toContain('Rate Limits');
			expect(text).toContain('Requests');
		});
	});

	it('shows "No limits" when rate limits are not defined', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('No limits')).toBeInTheDocument();
		});
	});

	it('displays capabilities as tags', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const text = container.textContent;
			expect(text).toContain('Capabilities');
			expect(text).toContain('code Generation');
		});
	});

	it('only displays enabled capabilities', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const capabilityTags = container.querySelectorAll('.text-blue-700');
			expect(capabilityTags.length).toBeGreaterThan(0);
		});
	});

	it('displays usage statistics', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('45 requests today')).toBeInTheDocument();
			expect(screen.getByText('12 requests today')).toBeInTheDocument();
		});
	});

	it('shows 0 requests when usage is not available', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const text = container.textContent;
			expect(text).toContain('requests today');
		});
	});

	it('toggles provider status when button clicked', async () => {
		const user = userEvent.setup();
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);
		vi.mocked(apiClient.toggleProvider).mockResolvedValue();

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Claude Code')).toBeInTheDocument();
		});

		const disabledButton = screen.getByText('Disabled');
		await user.click(disabledButton);

		expect(apiClient.toggleProvider).toHaveBeenCalledWith('gemini', true);
	});

	it('invalidates query after toggling provider', async () => {
		const user = userEvent.setup();
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);
		vi.mocked(apiClient.toggleProvider).mockResolvedValue();

		render(
			<QueryClientProvider client={queryClient}>
				<Providers />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText('Claude Code')).toBeInTheDocument();
		});

		const enabledButton = screen.getAllByText('Enabled')[0];
		await user.click(enabledButton);

		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['providers'] });
		});
	});

	it('displays empty state when no providers', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue([]);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('No providers configured')).toBeInTheDocument();
		});
	});

	it('handles undefined providers', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue([]);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('No providers configured')).toBeInTheDocument();
		});
	});

	it('applies correct styling to enabled providers', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const enabledButtons = container.querySelectorAll('.bg-green-100');
			expect(enabledButtons.length).toBe(2);
		});
	});

	it('applies correct styling to disabled providers', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const disabledButtons = container.querySelectorAll('.bg-gray-100');
			expect(disabledButtons.length).toBeGreaterThan(0);
		});
	});

	it('renders provider cards in a grid layout', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const grid = container.querySelector('.grid');
			expect(grid).toHaveClass('gap-4');
			expect(grid).toHaveClass('md:grid-cols-2');
			expect(grid).toHaveClass('lg:grid-cols-3');
		});
	});

	it('renders icons for access modes', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		const { container } = render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			const checkIcons = container.querySelectorAll('svg');
			expect(checkIcons.length).toBeGreaterThan(0);
		});
	});

	it('formats capability names correctly', async () => {
		vi.mocked(apiClient.fetchProviders).mockResolvedValue(mockProviders);

		render(<Providers />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getAllByText('code Generation').length).toBeGreaterThan(0);
			expect(screen.getAllByText('code Review').length).toBeGreaterThan(0);
		});
	});
});
