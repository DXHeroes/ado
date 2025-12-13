import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../components/Card';

describe('Card Component', () => {
	it('renders children correctly', () => {
		render(
			<Card>
				<div>Test Content</div>
			</Card>,
		);

		expect(screen.getByText('Test Content')).toBeInTheDocument();
	});

	it('applies default styles', () => {
		const { container } = render(
			<Card>
				<div>Test</div>
			</Card>,
		);

		const card = container.firstChild as HTMLElement;
		expect(card).toHaveClass('bg-white');
		expect(card).toHaveClass('rounded-lg');
		expect(card).toHaveClass('border');
		expect(card).toHaveClass('border-gray-200');
		expect(card).toHaveClass('shadow-sm');
	});

	it('applies custom className', () => {
		const { container } = render(
			<Card className="custom-class">
				<div>Test</div>
			</Card>,
		);

		const card = container.firstChild as HTMLElement;
		expect(card).toHaveClass('custom-class');
		expect(card).toHaveClass('bg-white');
	});

	it('renders multiple children', () => {
		render(
			<Card>
				<h1>Title</h1>
				<p>Description</p>
				<button type="button">Action</button>
			</Card>,
		);

		expect(screen.getByText('Title')).toBeInTheDocument();
		expect(screen.getByText('Description')).toBeInTheDocument();
		expect(screen.getByText('Action')).toBeInTheDocument();
	});

	it('renders with empty children', () => {
		const { container } = render(<Card>{null}</Card>);

		expect(container.firstChild).toBeInTheDocument();
	});

	it('combines className prop with default classes', () => {
		const { container } = render(
			<Card className="p-10 bg-red-500">
				<div>Test</div>
			</Card>,
		);

		const card = container.firstChild as HTMLElement;
		expect(card).toHaveClass('p-10');
		expect(card).toHaveClass('bg-red-500');
		expect(card).toHaveClass('bg-white');
		expect(card).toHaveClass('rounded-lg');
	});
});
