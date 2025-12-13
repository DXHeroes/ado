import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Layout } from '../components/Layout';

describe('Layout Component', () => {
	const renderLayout = () => {
		return render(
			<MemoryRouter>
				<Layout />
			</MemoryRouter>,
		);
	};

	it('renders the header with title', () => {
		renderLayout();

		expect(screen.getByText('ADO Dashboard')).toBeInTheDocument();
	});

	it('renders all navigation items', () => {
		renderLayout();

		expect(screen.getByText('Dashboard')).toBeInTheDocument();
		expect(screen.getByText('Parallel Execution')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText('Providers')).toBeInTheDocument();
		expect(screen.getByText('Settings')).toBeInTheDocument();
	});

	it('renders navigation links with correct paths', () => {
		renderLayout();

		const dashboardLink = screen.getByText('Dashboard').closest('a');
		const parallelLink = screen.getByText('Parallel Execution').closest('a');
		const tasksLink = screen.getByText('Tasks').closest('a');
		const providersLink = screen.getByText('Providers').closest('a');
		const settingsLink = screen.getByText('Settings').closest('a');

		expect(dashboardLink).toHaveAttribute('href', '/dashboard');
		expect(parallelLink).toHaveAttribute('href', '/parallel');
		expect(tasksLink).toHaveAttribute('href', '/tasks');
		expect(providersLink).toHaveAttribute('href', '/providers');
		expect(settingsLink).toHaveAttribute('href', '/settings');
	});

	it('renders sidebar with correct structure', () => {
		const { container } = renderLayout();

		const sidebar = container.querySelector('aside');
		expect(sidebar).toBeInTheDocument();
		expect(sidebar).toHaveClass('fixed');
		expect(sidebar).toHaveClass('left-0');
		expect(sidebar).toHaveClass('top-0');
	});

	it('renders main content area', () => {
		const { container } = renderLayout();

		const main = container.querySelector('main');
		expect(main).toBeInTheDocument();
		expect(main).toHaveClass('ml-64');
		expect(main).toHaveClass('p-8');
	});

	it('applies active styles to current route', () => {
		render(
			<MemoryRouter initialEntries={['/dashboard']}>
				<Layout />
			</MemoryRouter>,
		);

		const dashboardLink = screen.getByText('Dashboard').closest('a');
		expect(dashboardLink).toHaveClass('bg-primary');
		expect(dashboardLink).toHaveClass('text-primary-foreground');
	});

	it('applies inactive styles to non-current routes', () => {
		render(
			<MemoryRouter initialEntries={['/dashboard']}>
				<Layout />
			</MemoryRouter>,
		);

		const tasksLink = screen.getByText('Tasks').closest('a');
		expect(tasksLink).toHaveClass('text-gray-700');
		expect(tasksLink).toHaveClass('hover:bg-gray-100');
	});

	it('renders navigation icons', () => {
		const { container } = renderLayout();

		const icons = container.querySelectorAll('svg');
		expect(icons.length).toBeGreaterThanOrEqual(6);
	});

	it('has correct accessibility attributes', () => {
		renderLayout();

		const nav = screen.getByRole('navigation');
		expect(nav).toBeInTheDocument();
	});
});
