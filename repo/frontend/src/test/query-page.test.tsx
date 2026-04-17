/**
 * query-page.test.tsx
 *
 * Unit tests for the AdminQuery page (Power Query Builder).
 *
 * Coverage:
 *  1. Page heading "Power Query" renders.
 *  2. Entity tab buttons render (listings, conversations, settlements).
 *  3. "Add Filter" adds a filter row with field/op/value inputs.
 *  4. Remove (×) button on a filter row removes it.
 *  5. "Run Query" button triggers the query API.
 *  6. Results DataTable renders column headers after a successful query.
 *  7. Query name input and Save button are present for saving queries.
 *  8. Saved queries list renders name + Load + Delete buttons.
 *  9. "No saved queries" message when list is empty.
 * 10. "Export Results" button triggers export job API.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import AdminQuery from '../pages/admin/Query';

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

const QUERY_RESULT = {
  items: [{ id: 'listing-1', title: 'Poodle Puppy', breed: 'Poodle', status: 'active' }],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const SAVED_QUERY = {
  id: 'sq-1',
  name: 'My Listing Query',
  params: { entity: 'listings', filters: [] },
  userId: 'admin-1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

function mockSavedQueries(items = [SAVED_QUERY]) {
  server.use(
    http.get(`${API_BASE}/query/saved`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: items }),
    ),
  );
}

function mockQueryExecute(result = QUERY_RESULT) {
  server.use(
    http.post(`${API_BASE}/query`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: result }),
    ),
  );
}

// ── 1. Heading ────────────────────────────────────────────────────────────────

describe('AdminQuery — heading', () => {
  it('renders "Power Query" page heading', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    expect(screen.getByText('Power Query')).toBeInTheDocument();
  });
});

// ── 2. Entity tabs ────────────────────────────────────────────────────────────

describe('AdminQuery — entity tab buttons', () => {
  it('renders listings, conversations, settlements entity tab buttons', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    expect(screen.getByRole('button', { name: 'listings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settlements' })).toBeInTheDocument();
  });

  it('"listings" entity tab is active by default (visually distinguished)', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    const listingsBtn = screen.getByRole('button', { name: 'listings' });
    // Active entity has blue background class
    expect(listingsBtn.className).toContain('bg-[#1a56db]');
  });
});

// ── 3–4. Filter rows ──────────────────────────────────────────────────────────

describe('AdminQuery — filter rows', () => {
  it('"+ Add Filter" link adds a filter row with op select', async () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    const addFilter = screen.getByText(/\+ Add Filter/i);
    expect(addFilter).toBeInTheDocument();
    fireEvent.click(addFilter);
    await waitFor(() => {
      // The op selector now has options like 'eq', 'gt', etc.
      expect(screen.getByDisplayValue('eq')).toBeInTheDocument();
    });
  });

  it('"×" remove button on a filter row removes the row', async () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    fireEvent.click(screen.getByText(/\+ Add Filter/i));
    await waitFor(() =>
      expect(screen.getByDisplayValue('eq')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('×'));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('eq')).not.toBeInTheDocument(),
    );
  });
});

// ── 5–6. Run Query ────────────────────────────────────────────────────────────

describe('AdminQuery — running a query', () => {
  it('"Run Query" button is present and enabled', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    const runBtn = screen.getByRole('button', { name: /Run Query/i });
    expect(runBtn).toBeInTheDocument();
    expect(runBtn).not.toBeDisabled();
  });

  it('query results column headers appear after successful query', async () => {
    mockSavedQueries([]);
    mockQueryExecute();
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));
    await waitFor(() =>
      // DataTable renders column keys as headers; our result has 'title' key
      expect(screen.getByText('title')).toBeInTheDocument(),
    );
  });

  it('result row data renders in the table', async () => {
    mockSavedQueries([]);
    mockQueryExecute();
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));
    await waitFor(() =>
      expect(screen.getByText('Poodle Puppy')).toBeInTheDocument(),
    );
  });
});

// ── 7. Save query ─────────────────────────────────────────────────────────────

describe('AdminQuery — save query input', () => {
  it('"Query name" input and "Save" button are always present', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    expect(screen.getByPlaceholderText('Query name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument();
  });

  it('"Save" button is disabled when query name is empty', () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
  });

  it('"Save" button enables when name is typed and triggers save API', async () => {
    mockSavedQueries([]);
    const saveSpy = vi.fn(() =>
      HttpResponse.json({ code: 200, msg: 'OK', data: { ...SAVED_QUERY, id: 'sq-new' } }),
    );
    server.use(http.post(`${API_BASE}/query/save`, saveSpy));
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    const nameInput = screen.getByPlaceholderText('Query name');
    fireEvent.change(nameInput, { target: { value: 'My test query' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Save$/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
  });
});

// ── 8–9. Saved queries ────────────────────────────────────────────────────────

describe('AdminQuery — saved queries sidebar', () => {
  it('saved queries are listed with Load and Delete buttons', async () => {
    mockSavedQueries([SAVED_QUERY]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    await waitFor(() =>
      expect(screen.getByText('My Listing Query')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('shows "No saved queries" when list is empty', async () => {
    mockSavedQueries([]);
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    await waitFor(() =>
      expect(screen.getByText('No saved queries')).toBeInTheDocument(),
    );
  });
});

// ── 10. Export Results ────────────────────────────────────────────────────────

describe('AdminQuery — Export Results', () => {
  it('"Export Results" button triggers export job API', async () => {
    mockSavedQueries([]);
    const exportSpy = vi.fn(() =>
      HttpResponse.json({ code: 200, msg: 'OK', data: { id: 'job-1', status: 'queued' } }),
    );
    server.use(http.post(`${API_BASE}/exports/jobs`, exportSpy));
    seedAdmin();
    renderWithProviders(<AdminQuery />);
    const exportBtn = screen.getByRole('button', { name: /Export Results/i });
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);
    await waitFor(() => expect(exportSpy).toHaveBeenCalled());
  });
});
