/**
 * routing-shell.test.tsx
 *
 * Unit tests for the three routing/container shell components:
 *   - ProtectedRoute  (auth guard + role guard)
 *   - Layout          (shell wrapper with sidebar and outlet)
 *   - App             (full route tree: redirects, auth gates, role gates)
 *
 * Strategy:
 *   MemoryRouter lets us start at any URL without a real browser.
 *   We seed the Zustand auth store directly to control auth state.
 *   MSW is not needed here — no API calls are made by these shell components.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import ProtectedRoute from '../components/ProtectedRoute';
import Layout from '../components/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

type Role = 'admin' | 'vendor' | 'shopper' | 'ops_reviewer' | 'finance_admin';

function seedAuth(role: Role | null = null) {
  if (role) {
    useAuthStore.setState({
      user: { id: 'u1', username: role, email: `${role}@test.com`, role },
      token: 'mock-token',
      role,
    });
  } else {
    useAuthStore.setState({ user: null, token: null, role: null });
  }
}

beforeEach(() => seedAuth(null));

// ── ProtectedRoute ────────────────────────────────────────────────────────────

describe('ProtectedRoute — authentication gate', () => {
  it('redirects to /login when there is no token', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when token is present and no role restriction', () => {
    seedAuth('shopper');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('renders children when user has an allowed role', () => {
    seedAuth('admin');

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/listings" element={<div>Listings</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div>Admin Area</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin Area')).toBeInTheDocument();
  });

  it('redirects to /listings when user role is not in allowedRoles', () => {
    seedAuth('shopper');

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/listings" element={<div>Listings Page</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div>Admin Area</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Listings Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Area')).not.toBeInTheDocument();
  });

  it('vendor is redirected away from admin-only route', () => {
    seedAuth('vendor');

    render(
      <MemoryRouter initialEntries={['/admin/audit']}>
        <Routes>
          <Route path="/listings" element={<div>Listings</div>} />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div>Audit Logs</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Listings')).toBeInTheDocument();
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
  });

  it('ops_reviewer is allowed into admin+ops_reviewer route', () => {
    seedAuth('ops_reviewer');

    render(
      <MemoryRouter initialEntries={['/settlements']}>
        <Routes>
          <Route path="/listings" element={<div>Listings</div>} />
          <Route
            path="/settlements"
            element={
              <ProtectedRoute allowedRoles={['admin', 'vendor', 'ops_reviewer', 'finance_admin']}>
                <div>Settlements</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Settlements')).toBeInTheDocument();
  });
});

// ── Layout ────────────────────────────────────────────────────────────────────

describe('Layout — shell wrapper', () => {
  function renderLayout(role: Role = 'vendor') {
    seedAuth(role);
    return render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={['/listings']}>
          <Routes>
            <Route
              path="/"
              element={<Layout />}
            >
              <Route path="listings" element={<div>Listings Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('renders PetMarket brand text in sidebar', () => {
    renderLayout();
    expect(screen.getByText('PetMarket')).toBeInTheDocument();
  });

  it('renders the outlet (child page content)', () => {
    renderLayout();
    expect(screen.getByText('Listings Content')).toBeInTheDocument();
  });

  it('renders the Dashboard header label', () => {
    renderLayout();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('mobile hamburger menu button is present', () => {
    renderLayout();
    // The hamburger button is in the header; it has an svg inside
    const header = document.querySelector('header');
    expect(header).not.toBeNull();
    const svgButton = header!.querySelector('button');
    expect(svgButton).not.toBeNull();
  });

  it('sidebar shows role-appropriate nav items for vendor', () => {
    renderLayout('vendor');
    // Vendor sees Listings, Conversations, Settlements, Power Query
    expect(screen.getByText('Listings')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    // Vendor does NOT see Admin-only links
    expect(screen.queryByText('Config')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
  });

  it('sidebar shows all admin nav items for admin role', () => {
    renderLayout('admin');
    expect(screen.getByText('Config')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Exports')).toBeInTheDocument();
  });

  it('sidebar shows only public-access items for shopper role', () => {
    renderLayout('shopper');
    expect(screen.getByText('Listings')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.queryByText('Config')).not.toBeInTheDocument();
    expect(screen.queryByText('Power Query')).not.toBeInTheDocument();
  });
});

// ── App routing shell ─────────────────────────────────────────────────────────

describe('App routing — redirects and auth gates', () => {
  // We import App lazily to avoid module-level side-effects in other tests.
  async function renderApp(initialPath: string, role: Role | null = null) {
    seedAuth(role);
    // Dynamically import to pick up the seeded store state
    const { default: App } = await import('../App');
    // App uses BrowserRouter internally; for testing swap it:
    // We test the individual ProtectedRoute wiring in isolation above.
    // For App-level route integration, re-render with a patched router.
    // Since App hardcodes BrowserRouter, we test route behaviour via
    // ProtectedRoute + Layout unit tests above, and add a smoke assertion here.
    return render(
      <QueryClientProvider client={makeQC()}>
        <App />
      </QueryClientProvider>,
    );
  }

  it('unauthenticated visit to "/" shows login page', async () => {
    seedAuth(null);
    const { default: App } = await import('../App');
    render(<QueryClientProvider client={makeQC()}><App /></QueryClientProvider>);
    // Without a token, ProtectedRoute redirects to /login
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });
});
