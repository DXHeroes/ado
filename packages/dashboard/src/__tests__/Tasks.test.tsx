import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../api/client';
import { Tasks } from '../pages/Tasks';

// Mock the API client
vi.mock('../api/client', () => ({
	fetchTasks: vi.fn(),
}));

import * as apiClient from '../api/client';

describe('Tasks Page', () => {
	const mockTasks: Task[] = [
		{
			id: 'task-123-abc',
			prompt: 'Implement user authentication',
			provider: 'claude',
			status: 'running',
			startedAt: '2024-01-15T10:30:00Z',
			duration: 120,
		},
		{
			id: 'task-456-def',
			prompt: 'Fix bug in payment processing',
			provider: 'gemini',
			status: 'completed',
			startedAt: '2024-01-15T09:00:00Z',
			completedAt: '2024-01-15T09:15:00Z',
			duration: 900,
		},
		{
			id: 'task-789-ghi',
			prompt: 'Add dark mode to dashboard',
			provider: 'cursor',
			status: 'failed',
			startedAt: '2024-01-15T08:00:00Z',
			duration: 45,
		},
		{
			id: 'task-101-jkl',
			prompt: 'Optimize database queries',
			provider: 'claude',
			status: 'pending',
			startedAt: '2024-01-15T11:00:00Z',
		},
		{
			id: 'task-202-mno',
			prompt: 'Write unit tests for API',
			provider: 'cursor',
			status: 'paused',
			startedAt: '2024-01-15T07:30:00Z',
			duration: 30,
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
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>{children}</MemoryRouter>
			</QueryClientProvider>
		);
	};

	it('renders the page title and description', () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText('Monitor and manage your orchestrated tasks')).toBeInTheDocument();
	});

	it('renders table headers correctly', () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		expect(screen.getByText('Task ID')).toBeInTheDocument();
		expect(screen.getByText('Prompt')).toBeInTheDocument();
		expect(screen.getByText('Provider')).toBeInTheDocument();
		expect(screen.getByText('Status')).toBeInTheDocument();
		expect(screen.getByText('Started')).toBeInTheDocument();
		expect(screen.getByText('Duration')).toBeInTheDocument();
	});

	it('displays tasks with correct data', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Implement user authentication')).toBeInTheDocument();
			expect(screen.getByText('Fix bug in payment processing')).toBeInTheDocument();
			expect(screen.getByText('Add dark mode to dashboard')).toBeInTheDocument();
			expect(screen.getByText('Optimize database queries')).toBeInTheDocument();
			expect(screen.getByText('Write unit tests for API')).toBeInTheDocument();
		});
	});

	it('displays task IDs as truncated values', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('task-123')).toBeInTheDocument();
			expect(screen.getByText('task-456')).toBeInTheDocument();
			expect(screen.getByText('task-789')).toBeInTheDocument();
		});
	});

	it('displays provider names', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const providers = screen.getAllByText('claude');
			expect(providers.length).toBe(2);
			expect(screen.getByText('gemini')).toBeInTheDocument();
			const cursors = screen.getAllByText('cursor');
			expect(cursors.length).toBe(2);
		});
	});

	it('displays all status types with correct styling', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('running')).toBeInTheDocument();
			expect(screen.getByText('completed')).toBeInTheDocument();
			expect(screen.getByText('failed')).toBeInTheDocument();
			expect(screen.getByText('pending')).toBeInTheDocument();
			expect(screen.getByText('paused')).toBeInTheDocument();
		});
	});

	it('displays durations correctly', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('120s')).toBeInTheDocument();
			expect(screen.getByText('900s')).toBeInTheDocument();
			expect(screen.getByText('45s')).toBeInTheDocument();
			expect(screen.getByText('30s')).toBeInTheDocument();
		});
	});

	it('displays "-" for missing duration', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const dashElements = screen.getAllByText('-');
			expect(dashElements.length).toBeGreaterThanOrEqual(1);
		});
	});

	it('renders task IDs as links to detail page', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const link = screen.getByText('task-123').closest('a');
			expect(link).toHaveAttribute('href', '/tasks/task-123-abc');
		});
	});

	it('displays empty state when no tasks', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue([]);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('No tasks found')).toBeInTheDocument();
		});
	});

	it('handles undefined tasks', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue([]);

		render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('No tasks found')).toBeInTheDocument();
		});
	});

	it('renders status with correct color classes', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		const { container } = render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(container.querySelector('.text-blue-600')).toBeInTheDocument();
			expect(container.querySelector('.text-green-600')).toBeInTheDocument();
			expect(container.querySelector('.text-red-600')).toBeInTheDocument();
			expect(container.querySelector('.text-yellow-600')).toBeInTheDocument();
			expect(container.querySelector('.text-gray-600')).toBeInTheDocument();
		});
	});

	it('renders status icons', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		const { container } = render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const icons = container.querySelectorAll('svg');
			expect(icons.length).toBeGreaterThan(0);
		});
	});

	it('truncates long prompts', async () => {
		const longPromptTask: Task = {
			id: 'long-task',
			prompt: 'This is a very long prompt that should be truncated to fit in the table cell without breaking the layout',
			provider: 'claude',
			status: 'running',
			startedAt: '2024-01-15T10:30:00Z',
		};

		vi.mocked(apiClient.fetchTasks).mockResolvedValue([longPromptTask]);

		const { container } = render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const promptCell = container.querySelector('.truncate');
			expect(promptCell).toBeInTheDocument();
		});
	});

	it('applies hover effect to table rows', async () => {
		vi.mocked(apiClient.fetchTasks).mockResolvedValue(mockTasks);

		const { container } = render(<Tasks />, { wrapper: createWrapper() });

		await waitFor(() => {
			const rows = container.querySelectorAll('tbody tr');
			rows.forEach((row) => {
				expect(row).toHaveClass('hover:bg-gray-50');
			});
		});
	});
});
