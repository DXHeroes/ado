import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TaskDetail as TaskDetailType } from '../api/client';
import { TaskDetail } from '../pages/TaskDetail';

// Mock the API client
vi.mock('../api/client', () => ({
	fetchTaskDetail: vi.fn(),
}));

import * as apiClient from '../api/client';

describe('TaskDetail Page', () => {
	const mockTask: TaskDetailType = {
		id: 'task-123-abc',
		prompt: 'Implement user authentication with OAuth2',
		provider: 'claude',
		status: 'completed',
		startedAt: '2024-01-15T10:30:00Z',
		completedAt: '2024-01-15T10:45:00Z',
		duration: 900,
		cost: 0.0234,
		accessMode: 'subscription',
		events: [
			{
				type: 'task_started',
				timestamp: '2024-01-15T10:30:00Z',
				data: { provider: 'claude' },
			},
			{
				type: 'progress_update',
				timestamp: '2024-01-15T10:35:00Z',
				data: { progress: 50 },
			},
			{
				type: 'task_completed',
				timestamp: '2024-01-15T10:45:00Z',
				data: null,
			},
		],
	};

	const createWrapper = (taskId = 'task-123-abc') => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		return ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={[`/tasks/${taskId}`]}>
					<Routes>
						<Route path="/tasks/:taskId" element={children} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>
		);
	};

	it('renders the page title', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Task Details')).toBeInTheDocument();
		});
	});

	it('displays task ID', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('ID: task-123-abc')).toBeInTheDocument();
		});
	});

	it('renders back to tasks link', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			const backLink = screen.getByText('Back to tasks').closest('a');
			expect(backLink).toHaveAttribute('href', '/tasks');
		});
	});

	it('displays duration metric', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Duration')).toBeInTheDocument();
			expect(screen.getByText('900s')).toBeInTheDocument();
		});
	});

	it('displays "In progress" when duration is not available', async () => {
		const taskInProgress = { ...mockTask, duration: undefined };
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(taskInProgress);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('In progress')).toBeInTheDocument();
		});
	});

	it('displays cost metric', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Cost')).toBeInTheDocument();
			expect(screen.getByText('$0.0234')).toBeInTheDocument();
		});
	});

	it('displays zero cost when cost is not available', async () => {
		const taskWithNoCost = { ...mockTask, cost: undefined };
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(taskWithNoCost);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('$0.0000')).toBeInTheDocument();
		});
	});

	it('displays provider', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Provider')).toBeInTheDocument();
			const providerElements = screen.getAllByText('claude');
			expect(providerElements.length).toBeGreaterThanOrEqual(1);
		});
	});

	it('displays task information section', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Task Information')).toBeInTheDocument();
			expect(screen.getByText('Status')).toBeInTheDocument();
			expect(screen.getByText('completed')).toBeInTheDocument();
			expect(screen.getByText('Access Mode')).toBeInTheDocument();
			expect(screen.getByText('subscription')).toBeInTheDocument();
		});
	});

	it('displays N/A for missing access mode', async () => {
		const taskWithNoAccessMode = { ...mockTask, accessMode: undefined };
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(taskWithNoAccessMode);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('N/A')).toBeInTheDocument();
		});
	});

	it('displays start and completion timestamps', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Started At')).toBeInTheDocument();
			expect(screen.getByText('Completed At')).toBeInTheDocument();
		});
	});

	it('does not display completion timestamp when not completed', async () => {
		const runningTask = { ...mockTask, completedAt: undefined };
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(runningTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.queryByText('Completed At')).not.toBeInTheDocument();
		});
	});

	it('displays the prompt', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Prompt')).toBeInTheDocument();
			expect(screen.getByText('Implement user authentication with OAuth2')).toBeInTheDocument();
		});
	});

	it('displays event log when events are available', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('Event Log')).toBeInTheDocument();
			expect(screen.getByText('task_started')).toBeInTheDocument();
			expect(screen.getByText('progress_update')).toBeInTheDocument();
			expect(screen.getByText('task_completed')).toBeInTheDocument();
		});
	});

	it('displays event data as JSON', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText(/"provider":/)).toBeInTheDocument();
			expect(screen.getByText(/"progress":/)).toBeInTheDocument();
		});
	});

	it('does not display event log when no events', async () => {
		const taskWithNoEvents = { ...mockTask, events: [] };
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(taskWithNoEvents);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.queryByText('Event Log')).not.toBeInTheDocument();
		});
	});

	it('shows loading state when task is not yet loaded', () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		expect(screen.getByText('Loading task details...')).toBeInTheDocument();
	});

	it('handles missing taskId parameter', () => {
		vi.mocked(apiClient.fetchTaskDetail).mockRejectedValue(new Error('Task ID is required'));

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={['/tasks/']}>
					<Routes>
						<Route path="/tasks/:taskId?" element={<TaskDetail />} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(screen.getByText('Loading task details...')).toBeInTheDocument();
	});

	it('renders metric cards with icons', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		const { container } = render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			const icons = container.querySelectorAll('svg');
			expect(icons.length).toBeGreaterThan(0);
		});
	});

	it('handles null event data', async () => {
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(mockTask);

		render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText('task_completed')).toBeInTheDocument();
		});
	});

	it('preserves whitespace in prompt', async () => {
		const taskWithMultilinePrompt = {
			...mockTask,
			prompt: 'First line\nSecond line\nThird line',
		};
		vi.mocked(apiClient.fetchTaskDetail).mockResolvedValue(taskWithMultilinePrompt);

		const { container } = render(<TaskDetail />, { wrapper: createWrapper() });

		await waitFor(() => {
			const promptElement = container.querySelector('.whitespace-pre-wrap');
			expect(promptElement).toBeInTheDocument();
		});
	});
});
