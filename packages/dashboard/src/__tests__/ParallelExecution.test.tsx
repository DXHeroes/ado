import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ParallelExecution } from '../pages/ParallelExecution';

describe('ParallelExecution Page', () => {
	it('renders the page title and description', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Parallel Execution')).toBeInTheDocument();
		expect(
			screen.getByText('Monitor distributed worker pools and task parallelization'),
		).toBeInTheDocument();
	});

	it('displays worker statistics', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Active Workers')).toBeInTheDocument();
		expect(screen.getByText('12/15')).toBeInTheDocument();
		expect(screen.getByText('60% utilized')).toBeInTheDocument();
	});

	it('displays task queue statistics', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Tasks Queued')).toBeInTheDocument();
		expect(screen.getByText('24')).toBeInTheDocument();
		expect(screen.getByText('9 running')).toBeInTheDocument();
	});

	it('displays cost statistics', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Cost (24h)')).toBeInTheDocument();
		expect(screen.getByText('$12.45')).toBeInTheDocument();
		expect(screen.getByText('23.5% saved')).toBeInTheDocument();
	});

	it('displays auto-merge statistics', () => {
		const { container } = render(<ParallelExecution />);

		const autoMergeElements = screen.getAllByText('Auto-Merge Rate');
		expect(autoMergeElements.length).toBeGreaterThan(0);
		const text = container.textContent;
		expect(text).toContain('84%');
		expect(text).toContain('resolved');
	});

	it('renders worker pool status section', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Worker Pool Status')).toBeInTheDocument();
		expect(screen.getByText('worker-1')).toBeInTheDocument();
		expect(screen.getByText('worker-2')).toBeInTheDocument();
		expect(screen.getByText('worker-3')).toBeInTheDocument();
		expect(screen.getByText('worker-4')).toBeInTheDocument();
		expect(screen.getByText('worker-5')).toBeInTheDocument();
	});

	it('displays worker status badges', () => {
		render(<ParallelExecution />);

		const busyBadges = screen.getAllByText('busy');
		const idleBadges = screen.getAllByText('idle');

		expect(busyBadges.length).toBe(3);
		expect(idleBadges.length).toBe(2);
	});

	it('displays worker utilization percentages', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('92%')).toBeInTheDocument();
		expect(screen.getByText('88%')).toBeInTheDocument();
		expect(screen.getByText('76%')).toBeInTheDocument();
		expect(screen.getByText('12%')).toBeInTheDocument();
		expect(screen.getByText('8%')).toBeInTheDocument();
	});

	it('displays worker hourly costs', () => {
		render(<ParallelExecution />);

		const costElements = screen.getAllByText('$1.20/hr');
		expect(costElements.length).toBe(5);
	});

	it('renders cost by tier chart section', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Cost by Worker Tier')).toBeInTheDocument();
	});

	it('renders workload pattern chart', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Workload Pattern (24h)')).toBeInTheDocument();
	});

	it('renders cost optimization recommendations section', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Cost Optimization Recommendations')).toBeInTheDocument();
	});

	it('displays optimization recommendations', () => {
		render(<ParallelExecution />);

		expect(
			screen.getByText('2 workers are underutilized (<30%). Consider scaling down.'),
		).toBeInTheDocument();
		expect(
			screen.getByText('High-tier workers underutilized. Downgrade to medium-tier.'),
		).toBeInTheDocument();
	});

	it('displays recommendation priorities', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('P4')).toBeInTheDocument();
		expect(screen.getByText('P5')).toBeInTheDocument();
	});

	it('displays estimated savings for recommendations', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Estimated savings: $28.80/day')).toBeInTheDocument();
		expect(screen.getByText('Estimated savings: $15.60/day')).toBeInTheDocument();
	});

	it('renders apply buttons for recommendations', () => {
		render(<ParallelExecution />);

		const applyButtons = screen.getAllByText('Apply');
		expect(applyButtons.length).toBe(2);
	});

	it('renders task status distribution chart', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Task Status Distribution')).toBeInTheDocument();
	});

	it('renders performance metrics section', () => {
		const { container } = render(<ParallelExecution />);

		expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
		const text = container.textContent;
		expect(text).toContain('Avg Task Duration');
		expect(text).toContain('Cost Efficiency');
		expect(text).toContain('Worker Utilization');
	});

	it('renders pending merge conflicts section', () => {
		render(<ParallelExecution />);

		expect(screen.getByText('Pending Merge Conflicts')).toBeInTheDocument();
	});

	it('displays merge conflict details', () => {
		const { container } = render(<ParallelExecution />);

		const conflicts = container.querySelectorAll('.text-orange-600');
		expect(conflicts.length).toBeGreaterThan(0);
	});

	it('renders review buttons for merge conflicts', () => {
		render(<ParallelExecution />);

		const reviewButtons = screen.getAllByText('Review');
		expect(reviewButtons.length).toBeGreaterThan(0);
	});

	it('applies correct color to high priority recommendations', () => {
		const { container } = render(<ParallelExecution />);

		const highPriorityBadges = container.querySelectorAll('.bg-red-100');
		expect(highPriorityBadges.length).toBe(2);
	});

	it('displays busy workers with green indicator', () => {
		const { container } = render(<ParallelExecution />);

		const busyIndicators = container.querySelectorAll('.bg-green-500');
		expect(busyIndicators.length).toBe(3);
	});

	it('displays idle workers with gray indicator', () => {
		const { container } = render(<ParallelExecution />);

		const idleIndicators = container.querySelectorAll('.bg-gray-300');
		expect(idleIndicators.length).toBe(2);
	});

	it('renders stat cards with icons', () => {
		const { container } = render(<ParallelExecution />);

		const icons = container.querySelectorAll('svg');
		expect(icons.length).toBeGreaterThan(10);
	});

	it('displays correct trend colors', () => {
		const { container } = render(<ParallelExecution />);

		const greenElements = container.querySelectorAll(
			'.text-green-600, .text-green-700, .bg-green-100',
		);
		expect(greenElements.length).toBeGreaterThan(0);
	});

	it('allows interaction with recommendation apply buttons', async () => {
		const user = userEvent.setup();
		render(<ParallelExecution />);

		const applyButtons = screen.getAllByText('Apply');
		await user.click(applyButtons[0]);
	});

	it('allows interaction with merge conflict review buttons', async () => {
		const user = userEvent.setup();
		render(<ParallelExecution />);

		const reviewButtons = screen.getAllByText('Review');
		await user.click(reviewButtons[0]);
	});

	it('renders worker cards with proper borders', () => {
		const { container } = render(<ParallelExecution />);

		const workerCards = container.querySelectorAll('.rounded-lg.border');
		expect(workerCards.length).toBeGreaterThan(5);
	});

	it('displays all cost tier categories', () => {
		const { container } = render(<ParallelExecution />);
		const chartContainers = container.querySelectorAll('[class*="recharts"]');
		expect(chartContainers.length).toBeGreaterThan(0);
	});

	it('renders responsive chart containers', () => {
		const { container } = render(<ParallelExecution />);

		const responsiveContainers = container.querySelectorAll('.recharts-responsive-container');
		expect(responsiveContainers.length).toBeGreaterThan(0);
	});

	it('formats cost values correctly', () => {
		const { container } = render(<ParallelExecution />);

		const text = container.textContent;
		expect(text).toContain('$12.45');
		expect(text).toContain('$28.80/day');
		expect(text).toContain('$15.60/day');
	});

	it('formats percentage values correctly', () => {
		const { container } = render(<ParallelExecution />);

		const text = container.textContent;
		expect(text).toContain('60% utilized');
		expect(text).toContain('23.5% saved');
		expect(text).toContain('84%');
	});

	it('renders grid layouts for sections', () => {
		const { container } = render(<ParallelExecution />);

		const grids = container.querySelectorAll('.grid');
		expect(grids.length).toBeGreaterThan(0);
	});

	it('applies hover effects to interactive elements', () => {
		const { container } = render(<ParallelExecution />);

		const hoverElements = container.querySelectorAll(
			'.hover\\:bg-gray-50, .hover\\:bg-blue-50, .hover\\:bg-orange-100',
		);
		expect(hoverElements.length).toBeGreaterThan(0);
	});
});
