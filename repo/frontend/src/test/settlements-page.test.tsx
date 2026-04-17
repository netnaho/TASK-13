/**
 * settlements-page.test.tsx
 *
 * Unit tests for AdminSettlements page.
 *
 * Coverage:
 *  1. Settlement list renders with month and status columns.
 *  2. "Step 1" approve button visible for ops_reviewer on PENDING settlement.
 *  3. "Step 2" approve button visible for finance_admin on REVIEWER_APPROVED settlement.
 *  4. Approve buttons absent for admin role (wrong role for approval).
 *  5. Reject button present for ops_reviewer on PENDING settlement.
 *  6. Generate Monthly section visible only for admin role.
 *  7. Generate Monthly section absent for ops_reviewer.
 *  8. Empty state when settlement list is empty.
 *  9. Details panel appears when "Details" button is clicked (with detail API mock).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import AdminSettlements from '../pages/admin/Settlements';

// ── Auth seed ─────────────────────────────────────────────────────────────────

type AppRole = 'admin' | 'ops_reviewer' | 'finance_admin' | 'vendor';

function seedRole(role: AppRole) {
  useAuthStore.setState({
    user: { id: 'u-1', username: role, email: `${role}@test.com`, role },
    token: 'mock-token',
    role,
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PENDING_SETTLEMENT = {
  id: 'settle-1',
  vendorId: 'vendor-abc',
  month: '2090-01',
  totalCharges: 150.00,
  taxAmount: 12.75,
  status: 'pending',
  data: {},
  reviewerApprovedBy: null,
  financeApprovedBy: null,
  createdAt: new Date().toISOString(),
};

const REVIEWER_APPROVED_SETTLEMENT = {
  ...PENDING_SETTLEMENT,
  id: 'settle-2',
  status: 'reviewer_approved',
  reviewerApprovedBy: 'reviewer-1',
};

const DETAIL_RESPONSE = {
  settlement: PENDING_SETTLEMENT,
  variance: { expected: 150, actual: 150, variance: 0, variancePercent: 0 },
};

function mockSettlements(items: typeof PENDING_SETTLEMENT[]) {
  server.use(
    http.get(`${API_BASE}/settlements`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: items }),
    ),
  );
}

function mockDetail(id: string, detail = DETAIL_RESPONSE) {
  server.use(
    http.get(`${API_BASE}/settlements/${id}`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: detail }),
    ),
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });
  mockSettlements([PENDING_SETTLEMENT]);
});

// ── 1. Settlement list renders ─────────────────────────────────────────────────

describe('AdminSettlements — list rendering', () => {
  it('renders month and status for a settlement', async () => {
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders total charges formatted as currency', async () => {
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText(/\$150\.00|\$150/)).toBeInTheDocument(),
    );
  });
});

// ── 2. ops_reviewer sees Step 1 button on PENDING ─────────────────────────────

describe('AdminSettlements — role-based approve buttons', () => {
  it('shows Step 1 button for ops_reviewer on PENDING settlement', async () => {
    mockSettlements([PENDING_SETTLEMENT]);
    seedRole('ops_reviewer');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Step 1/i })).toBeInTheDocument(),
    );
  });

  it('shows Step 2 button for finance_admin on REVIEWER_APPROVED settlement', async () => {
    mockSettlements([REVIEWER_APPROVED_SETTLEMENT]);
    seedRole('finance_admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Step 2/i })).toBeInTheDocument(),
    );
  });

  it('does NOT show Step 1 button for finance_admin (wrong role)', async () => {
    mockSettlements([PENDING_SETTLEMENT]);
    seedRole('finance_admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Step 1/i })).toBeNull();
  });

  it('does NOT show Step 2 button for ops_reviewer (wrong role)', async () => {
    mockSettlements([REVIEWER_APPROVED_SETTLEMENT]);
    seedRole('ops_reviewer');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Step 2/i })).toBeNull();
  });

  it('does NOT show approve buttons for admin role', async () => {
    mockSettlements([PENDING_SETTLEMENT]);
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Step 1/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Step 2/i })).toBeNull();
  });
});

// ── 5. Reject button ──────────────────────────────────────────────────────────

describe('AdminSettlements — reject button', () => {
  it('shows Reject button for ops_reviewer on PENDING settlement', async () => {
    mockSettlements([PENDING_SETTLEMENT]);
    seedRole('ops_reviewer');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument(),
    );
  });

  it('shows Reject button for finance_admin on REVIEWER_APPROVED settlement', async () => {
    mockSettlements([REVIEWER_APPROVED_SETTLEMENT]);
    seedRole('finance_admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument(),
    );
  });
});

// ── 6 & 7. Generate Monthly section ───────────────────────────────────────────

describe('AdminSettlements — Generate Monthly (admin-only)', () => {
  it('shows "Generate Monthly" button for admin role', async () => {
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Generate Monthly/i })).toBeInTheDocument(),
    );
  });

  it('hides "Generate Monthly" button for ops_reviewer', async () => {
    seedRole('ops_reviewer');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Generate Monthly/i })).toBeNull();
  });

  it('hides "Generate Monthly" button for finance_admin', async () => {
    seedRole('finance_admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText('2090-01')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Generate Monthly/i })).toBeNull();
  });
});

// ── 8. Empty state ────────────────────────────────────────────────────────────

describe('AdminSettlements — empty state', () => {
  it('renders empty table when settlement list is empty', async () => {
    mockSettlements([]);
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);
    await waitFor(() =>
      expect(screen.getByText(/no.*data|no.*settlement|no.*rows|empty/i)).toBeInTheDocument(),
    );
  });
});

// ── 9. Details panel ──────────────────────────────────────────────────────────

describe('AdminSettlements — details panel', () => {
  it('shows variance reconciliation panel when Details is clicked', async () => {
    mockSettlements([PENDING_SETTLEMENT]);
    mockDetail(PENDING_SETTLEMENT.id);
    seedRole('admin');
    renderWithProviders(<AdminSettlements />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Details/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Details/i }));

    await waitFor(() =>
      expect(screen.getByText(/Variance Reconciliation/i)).toBeInTheDocument(),
    );
  });
});
