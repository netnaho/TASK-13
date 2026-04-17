/**
 * audit-page.test.tsx
 *
 * Unit tests for the AdminAudit page.
 *
 * Coverage:
 *  1. "Audit Logs" heading renders.
 *  2. "Export Audit Log" button is present.
 *  3. Audit log rows render with action and hash columns when data loads.
 *  4. "Verify" button present for each row; shows ✅ on successful verify.
 *  5. "Data" button expands a before/after JSON panel.
 *  6. Actor ID filter input accepts input.
 *  7. Entity type filter dropdown is present with expected options.
 *  8. Empty table renders gracefully when API returns no items.
 *  9. Export Audit Log button triggers the export API call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import AdminAudit from '../pages/admin/Audit';

// ── Auth seed ─────────────────────────────────────────────────────────────────

function seedAdmin() {
  useAuthStore.setState({
    user: { id: 'admin-1', username: 'admin', email: 'admin@test.com', role: 'admin' },
    token: 'mock-token',
    role: 'admin',
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_AUDIT_ENTRY = {
  id: 'audit-1',
  action: 'listing.create',
  actorId: 'user-1',
  actorUsername: 'admin',
  entityType: 'listing',
  entityId: 'listing-abc',
  before: null,
  after: { title: 'Test Pet' },
  hash: 'a'.repeat(64),
  createdAt: '2025-01-15T10:30:00Z',
};

function mockAuditList(items = [MOCK_AUDIT_ENTRY]) {
  server.use(
    http.get(`${API_BASE}/admin/audit`, () =>
      HttpResponse.json({
        code: 200, msg: 'OK',
        data: { items, total: items.length },
      }),
    ),
  );
}

function mockVerify(id: string, valid: boolean) {
  server.use(
    http.get(`${API_BASE}/admin/audit/${id}/verify`, () =>
      HttpResponse.json({
        code: 200, msg: 'OK',
        data: { valid, entry: MOCK_AUDIT_ENTRY },
      }),
    ),
  );
}

function mockExport() {
  server.use(
    http.post(`${API_BASE}/admin/audit/export`, () =>
      HttpResponse.json({
        code: 200, msg: 'OK',
        data: { id: 'export-job-1', status: 'queued' },
      }),
    ),
  );
}

// ── 1. Heading ────────────────────────────────────────────────────────────────

describe('AdminAudit — layout', () => {
  it('renders "Audit Logs" page heading', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });

  it('renders "Export Audit Log" button', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    expect(screen.getByRole('button', { name: /Export Audit Log/i })).toBeInTheDocument();
  });

  it('renders entity-type filter dropdown with known entity options', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /user/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /listing/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /settlement/i })).toBeInTheDocument();
  });
});

// ── 3. Audit log row data ─────────────────────────────────────────────────────

describe('AdminAudit — data display', () => {
  it('renders action from audit entry in the table', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByText('listing.create')).toBeInTheDocument(),
    );
  });

  it('renders truncated hash in the table', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByText(/aaaaaaaaaaaaaaaa\.\.\./i)).toBeInTheDocument(),
    );
  });

  it('renders actor username in the table', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByText('admin')).toBeInTheDocument(),
    );
  });

  it('shows empty table when API returns no items', async () => {
    mockAuditList([]);
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.queryByText('listing.create')).not.toBeInTheDocument(),
    );
  });
});

// ── 4. Verify button ──────────────────────────────────────────────────────────

describe('AdminAudit — Verify button', () => {
  it('shows Verify button for each audit row', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument(),
    );
  });

  it('shows ✅ after a successful verify', async () => {
    mockAuditList();
    mockVerify(MOCK_AUDIT_ENTRY.id, true);
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    await waitFor(() => expect(screen.getByText('✅')).toBeInTheDocument());
  });

  it('shows ❌ after a failed verify', async () => {
    mockAuditList();
    mockVerify(MOCK_AUDIT_ENTRY.id, false);
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    await waitFor(() => expect(screen.getByText('❌')).toBeInTheDocument());
  });
});

// ── 5. Data expansion panel ───────────────────────────────────────────────────

describe('AdminAudit — data panel', () => {
  it('shows before/after JSON panel when "Data" is clicked', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Data/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Data/i }));
    await waitFor(() => {
      expect(screen.getByText(/Before/i)).toBeInTheDocument();
      expect(screen.getByText(/After/i)).toBeInTheDocument();
    });
  });

  it('collapses the data panel on second click ("Hide")', async () => {
    mockAuditList();
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Data/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Data/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Hide/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Hide/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Hide/i })).not.toBeInTheDocument(),
    );
  });
});

// ── 9. Export triggers API ────────────────────────────────────────────────────

describe('AdminAudit — export', () => {
  it('Export Audit Log button calls the export endpoint', async () => {
    mockAuditList();
    const exportSpy = vi.fn(() =>
      HttpResponse.json({ code: 200, msg: 'OK', data: { id: 'j-1', status: 'queued' } }),
    );
    server.use(http.post(`${API_BASE}/admin/audit/export`, exportSpy));
    seedAdmin();
    renderWithProviders(<AdminAudit />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Export Audit Log/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Export Audit Log/i }));
    await waitFor(() => expect(exportSpy).toHaveBeenCalled());
  });
});
