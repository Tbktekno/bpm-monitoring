// =============================================================================
// LoadingSpinner Component Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with role="status"', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with accessible label', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Memuat...');
  });

  it('uses md size by default', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('w-8');
    expect(spinner.className).toContain('h-8');
    expect(spinner.className).toContain('border-3');
  });

  it('applies sm size classes', () => {
    render(<LoadingSpinner size="sm" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('w-4');
    expect(spinner.className).toContain('h-4');
    expect(spinner.className).toContain('border-2');
  });

  it('applies lg size classes', () => {
    render(<LoadingSpinner size="lg" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('w-12');
    expect(spinner.className).toContain('h-12');
    expect(spinner.className).toContain('border-4');
  });

  it('includes the animate-spin class', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('animate-spin');
  });

  it('includes the border styling classes', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('border-slate-200');
    expect(spinner.className).toContain('border-t-primary-500');
  });

  it('includes rounded-full class', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('rounded-full');
  });

  it('applies additional className', () => {
    render(<LoadingSpinner className="custom-spinner" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('custom-spinner');
  });

  it('renders as a div element', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.tagName).toBe('DIV');
  });
});
