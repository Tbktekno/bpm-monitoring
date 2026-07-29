// =============================================================================
// Login Page — Auth Flow Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the auth hook
const mockLoginMutate = vi.fn();
const mockLoginMutateAsync = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useLogin: () => ({
    mutate: mockLoginMutate,
    mutateAsync: mockLoginMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useLogout: () => vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      // Strip framer-motion specific props
      const { initial, animate, transition, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

// Mock AuthContext to avoid localStorage dependency
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import Login from '@/pages/Login';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form with title and subtitle', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('VitalMonitor')).toBeInTheDocument();
    expect(screen.getByText('BPM & SpO₂ Monitoring Dashboard')).toBeInTheDocument();
  });

  it('renders email input field', () => {
    renderWithProviders(<Login />);
    const emailInput = screen.getByPlaceholderText('admin@example.com');
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('renders password input field', () => {
    renderWithProviders(<Login />);
    const passwordInput = screen.getByPlaceholderText('Masukkan password');
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('renders the "Ingat Saya" checkbox', () => {
    renderWithProviders(<Login />);
    expect(screen.getByLabelText('Ingat Saya')).toBeInTheDocument();
  });

  it('renders the submit button with "Masuk" text', () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole('button', { name: /masuk/i })).toBeInTheDocument();
  });

  it('submits form with email and password values', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(screen.getByPlaceholderText('admin@example.com'), 'admin@test.com');
    await user.type(screen.getByPlaceholderText('Masukkan password'), 'password123');
    await user.click(screen.getByRole('button', { name: /masuk/i }));

    expect(mockLoginMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockLoginMutateAsync).toHaveBeenCalledWith({
      email: 'admin@test.com',
      password: 'password123',
      rememberMe: false,
    });
  });

  it('shows validation error for empty email on submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: /masuk/i }));

    // Email validation should fire
    expect(mockLoginMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Email wajib diisi')).toBeInTheDocument();
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    // Note: userEvent.type on <input type="email"> has a jsdom limitation where
    // invalid email values (like 'not-an-email') don't trigger react-hook-form's
    // onChange handler. Use a value with an @ that still fails zod's email check.
    // 'test@test' looks like an email to the browser but is invalid per zod.
    await user.type(screen.getByPlaceholderText('admin@example.com'), 'test@test');
    await user.type(screen.getByPlaceholderText('Masukkan password'), 'password123');
    await user.click(screen.getByRole('button', { name: /masuk/i }));

    // Validation prevented mutation
    expect(mockLoginMutate).not.toHaveBeenCalled();
    // Check that the error message is displayed
    expect(screen.getByText('Format email tidak valid')).toBeInTheDocument();
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(screen.getByPlaceholderText('admin@example.com'), 'admin@test.com');
    await user.type(screen.getByPlaceholderText('Masukkan password'), '123');
    await user.click(screen.getByRole('button', { name: /masuk/i }));

    expect(screen.getByText('Password minimal 6 karakter')).toBeInTheDocument();
  });

  it('renders copyright footer with current year', () => {
    renderWithProviders(<Login />);
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${currentYear}`))).toBeInTheDocument();
    expect(screen.getByText(/vitalmonitor\. all rights reserved\./i)).toBeInTheDocument();
  });

  it('does not show loading spinner on the button initially', () => {
    renderWithProviders(<Login />);
    const button = screen.getByRole('button', { name: /masuk/i });
    // When not loading, the button should contain the text "Masuk"
    expect(button).toHaveTextContent('Masuk');
  });
});
