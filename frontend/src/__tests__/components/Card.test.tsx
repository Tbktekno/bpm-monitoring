// =============================================================================
// Card Component Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card', () => {
  it('renders children correctly', () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <Card>
        <h3>Title</h3>
        <p>Description</p>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('applies the card class', () => {
    render(<Card>Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).toContain('card');
  });

  it('applies md padding by default', () => {
    render(<Card>Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).toContain('p-6');
  });

  it('applies none padding when padding="none"', () => {
    render(<Card padding="none">Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).not.toContain('p-');
  });

  it('applies sm padding', () => {
    render(<Card padding="sm">Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).toContain('p-4');
  });

  it('applies lg padding', () => {
    render(<Card padding="lg">Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).toContain('p-8');
  });

  it('applies additional className', () => {
    render(<Card className="custom-class">Content</Card>);
    const div = screen.getByText('Content').closest('div');
    expect(div?.className).toContain('custom-class');
  });

  it('passes additional HTML attributes', () => {
    render(<Card data-testid="card-container">Content</Card>);
    const div = screen.getByTestId('card-container');
    expect(div).toBeInTheDocument();
    expect(div?.tagName).toBe('DIV');
  });

  it('renders React nodes as children', () => {
    render(
      <Card>
        <button>Action</button>
      </Card>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });
});
