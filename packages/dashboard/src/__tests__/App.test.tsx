import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('App Component', () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	const renderApp = (initialRoute = '/') => {
		window.history.pushState({}, 'Test page', initialRoute);
		return render(
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>,
		);
	};

	it('renders without crashing', () => {
		renderApp();
		expect(screen.getByText('ADO Dashboard')).toBeInTheDocument();
	});

	it('redirects from root to /dashboard', () => {
		renderApp('/');
		expect(window.location.pathname).toBe('/dashboard');
	});

	it('renders Dashboard route', () => {
		renderApp('/dashboard');
		expect(screen.getByText('Overview of your ADO orchestrator activity')).toBeInTheDocument();
	});

	it('renders Tasks route', () => {
		renderApp('/tasks');
		expect(screen.getByText('Monitor and manage your orchestrated tasks')).toBeInTheDocument();
	});

	it('renders Providers route', () => {
		renderApp('/providers');
		expect(
			screen.getByText('Manage AI coding agents and their configurations'),
		).toBeInTheDocument();
	});

	it('renders Settings route', () => {
		renderApp('/settings');
		expect(screen.getByText('Configure your ADO orchestrator preferences')).toBeInTheDocument();
	});

	it('renders ParallelExecution route', () => {
		renderApp('/parallel');
		expect(
			screen.getByText('Monitor distributed worker pools and task parallelization'),
		).toBeInTheDocument();
	});

	it('has correct navigation structure', () => {
		renderApp('/dashboard');

		const nav = screen.getByRole('navigation');
		expect(nav).toBeInTheDocument();
		expect(nav).toHaveTextContent('Dashboard');
		expect(nav).toHaveTextContent('Parallel Execution');
		expect(nav).toHaveTextContent('Tasks');
		expect(nav).toHaveTextContent('Providers');
		expect(nav).toHaveTextContent('Settings');
	});

	it('includes Layout component in all routes', () => {
		const { unmount: unmount1 } = renderApp('/dashboard');
		expect(screen.getByText('ADO Dashboard')).toBeInTheDocument();
		unmount1();

		const { unmount: unmount2 } = renderApp('/tasks');
		expect(screen.getByText('ADO Dashboard')).toBeInTheDocument();
		unmount2();

		renderApp('/providers');
		expect(screen.getByText('ADO Dashboard')).toBeInTheDocument();
	});
});
