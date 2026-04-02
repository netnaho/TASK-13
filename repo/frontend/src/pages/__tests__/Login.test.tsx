import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/test-utils';
import Login from '../Login';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockNavigate.mockClear();
});

function getUsername() {
  return screen.getByRole('textbox');
}

function getPassword() {
  return document.querySelector('input[type="password"]') as HTMLInputElement;
}

describe('Login', () => {
  it('renders the login form', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('PetMarket')).toBeInTheDocument();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(getUsername(), 'admin');
    await user.type(getPassword(), 'abc');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    });
  });

  it('submits login and navigates on success', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(getUsername(), 'admin');
    await user.type(getPassword(), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/config');
    });
  });

  it('does not navigate on invalid credentials', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(getUsername(), 'baduser');
    await user.type(getPassword(), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Wait for the mutation to settle — button should return to "Sign in"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
