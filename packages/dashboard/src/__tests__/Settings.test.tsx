import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Settings } from '../pages/Settings';

describe('Settings Page', () => {
	it('renders the page title and description', () => {
		render(<Settings />);

		expect(screen.getByText('Settings')).toBeInTheDocument();
		expect(screen.getByText('Configure your ADO orchestrator preferences')).toBeInTheDocument();
	});

	it('renders routing configuration section', () => {
		render(<Settings />);

		expect(screen.getByText('Routing Configuration')).toBeInTheDocument();
		expect(screen.getByText('Routing Strategy')).toBeInTheDocument();
		expect(screen.getByText('Enable API Fallback')).toBeInTheDocument();
		expect(screen.getByText('Max API Cost Per Task ($)')).toBeInTheDocument();
	});

	it('renders routing strategy dropdown with correct options', () => {
		render(<Settings />);

		const select = screen.getByLabelText('Routing Strategy') as HTMLSelectElement;
		expect(select).toBeInTheDocument();

		const options = Array.from(select.options).map((option) => option.value);
		expect(options).toEqual(['subscription-first', 'round-robin', 'cost-optimized']);
	});

	it('displays routing strategy option labels', () => {
		render(<Settings />);

		expect(screen.getByText('Subscription First')).toBeInTheDocument();
		expect(screen.getByText('Round Robin')).toBeInTheDocument();
		expect(screen.getByText('Cost Optimized')).toBeInTheDocument();
	});

	it('renders API fallback checkbox checked by default', () => {
		render(<Settings />);

		const checkbox = screen.getByLabelText('Enable API Fallback') as HTMLInputElement;
		expect(checkbox).toBeChecked();
	});

	it('renders max API cost input with default value', () => {
		render(<Settings />);

		const input = screen.getByLabelText('Max API Cost Per Task ($)') as HTMLInputElement;
		expect(input).toHaveValue(10);
		expect(input).toHaveAttribute('step', '0.01');
		expect(input).toHaveAttribute('type', 'number');
	});

	it('renders HITL configuration section', () => {
		render(<Settings />);

		expect(screen.getByText('Human-in-the-Loop (HITL)')).toBeInTheDocument();
		expect(screen.getByText('Default Policy')).toBeInTheDocument();
		expect(screen.getByText('Escalate on Cost Threshold ($)')).toBeInTheDocument();
	});

	it('renders HITL policy dropdown with correct options', () => {
		render(<Settings />);

		const select = screen.getByLabelText('Default Policy') as HTMLSelectElement;
		expect(select).toBeInTheDocument();

		const options = Array.from(select.options).map((option) => option.value);
		expect(options).toEqual(['autonomous', 'review-edits', 'approve-steps', 'manual']);
	});

	it('displays HITL policy option labels', () => {
		render(<Settings />);

		expect(screen.getByText('Autonomous')).toBeInTheDocument();
		expect(screen.getByText('Review Edits')).toBeInTheDocument();
		expect(screen.getByText('Approve Steps')).toBeInTheDocument();
		expect(screen.getByText('Manual')).toBeInTheDocument();
	});

	it('renders cost threshold input with default value', () => {
		render(<Settings />);

		const input = screen.getByLabelText('Escalate on Cost Threshold ($)') as HTMLInputElement;
		expect(input).toHaveValue(5);
		expect(input).toHaveAttribute('step', '0.01');
		expect(input).toHaveAttribute('type', 'number');
	});

	it('renders notifications section', () => {
		render(<Settings />);

		expect(screen.getByText('Notifications')).toBeInTheDocument();
		expect(screen.getByText('Slack Notifications')).toBeInTheDocument();
		expect(screen.getByText('Email Notifications')).toBeInTheDocument();
	});

	it('renders Slack notifications checkbox checked by default', () => {
		render(<Settings />);

		const checkbox = screen.getByLabelText('Slack Notifications') as HTMLInputElement;
		expect(checkbox).toBeChecked();
	});

	it('renders Slack webhook URL input', () => {
		render(<Settings />);

		const input = screen.getByPlaceholderText('Slack webhook URL');
		expect(input).toBeInTheDocument();
		expect(input).toHaveAttribute('type', 'text');
	});

	it('renders email notifications checkbox unchecked by default', () => {
		render(<Settings />);

		const checkbox = screen.getByLabelText('Email Notifications') as HTMLInputElement;
		expect(checkbox).not.toBeChecked();
	});

	it('renders email input', () => {
		render(<Settings />);

		const input = screen.getByPlaceholderText('your@email.com');
		expect(input).toBeInTheDocument();
		expect(input).toHaveAttribute('type', 'email');
	});

	it('renders save changes button', () => {
		render(<Settings />);

		const button = screen.getByText('Save Changes');
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute('type', 'button');
	});

	it('allows user to change routing strategy', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const select = screen.getByLabelText('Routing Strategy') as HTMLSelectElement;
		await user.selectOptions(select, 'round-robin');

		expect(select.value).toBe('round-robin');
	});

	it('allows user to toggle API fallback', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const checkbox = screen.getByLabelText('Enable API Fallback') as HTMLInputElement;
		expect(checkbox).toBeChecked();

		await user.click(checkbox);
		expect(checkbox).not.toBeChecked();
	});

	it('allows user to change max API cost', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const input = screen.getByLabelText('Max API Cost Per Task ($)') as HTMLInputElement;
		await user.clear(input);
		await user.type(input, '25.5');

		expect(input.value).toBe('25.5');
	});

	it('allows user to change HITL policy', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const select = screen.getByLabelText('Default Policy') as HTMLSelectElement;
		await user.selectOptions(select, 'manual');

		expect(select.value).toBe('manual');
	});

	it('allows user to change cost threshold', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const input = screen.getByLabelText('Escalate on Cost Threshold ($)') as HTMLInputElement;
		await user.clear(input);
		await user.type(input, '15');

		expect(input.value).toBe('15');
	});

	it('allows user to toggle Slack notifications', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const checkbox = screen.getByLabelText('Slack Notifications') as HTMLInputElement;
		expect(checkbox).toBeChecked();

		await user.click(checkbox);
		expect(checkbox).not.toBeChecked();
	});

	it('allows user to enter Slack webhook URL', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const input = screen.getByPlaceholderText('Slack webhook URL');
		await user.type(input, 'https://hooks.slack.com/services/xxx');

		expect(input).toHaveValue('https://hooks.slack.com/services/xxx');
	});

	it('allows user to toggle email notifications', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const checkbox = screen.getByLabelText('Email Notifications') as HTMLInputElement;
		expect(checkbox).not.toBeChecked();

		await user.click(checkbox);
		expect(checkbox).toBeChecked();
	});

	it('allows user to enter email address', async () => {
		const user = userEvent.setup();
		render(<Settings />);

		const input = screen.getByPlaceholderText('your@email.com');
		await user.type(input, 'test@example.com');

		expect(input).toHaveValue('test@example.com');
	});

	it('renders all form fields with proper accessibility', () => {
		render(<Settings />);

		const routingStrategy = screen.getByLabelText('Routing Strategy');
		const maxCost = screen.getByLabelText('Max API Cost Per Task ($)');
		const hitlPolicy = screen.getByLabelText('Default Policy');
		const costThreshold = screen.getByLabelText('Escalate on Cost Threshold ($)');

		expect(routingStrategy).toHaveAttribute('id', 'routing-strategy');
		expect(maxCost).toHaveAttribute('id', 'max-api-cost');
		expect(hitlPolicy).toHaveAttribute('id', 'default-policy');
		expect(costThreshold).toHaveAttribute('id', 'cost-threshold');
	});

	it('renders sections inside Card components', () => {
		const { container } = render(<Settings />);

		const cards = container.querySelectorAll('.bg-white.rounded-lg');
		expect(cards.length).toBe(3);
	});

	it('has correct button styling', () => {
		render(<Settings />);

		const button = screen.getByText('Save Changes');
		expect(button).toHaveClass('px-4');
		expect(button).toHaveClass('py-2');
		expect(button).toHaveClass('bg-primary');
		expect(button).toHaveClass('rounded-md');
	});
});
