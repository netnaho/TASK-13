/**
 * listing-detail.test.tsx
 *
 * Unit tests for ListingDetail page.
 *
 * Coverage:
 *  1. Loading skeleton rendered while data is in flight.
 *  2. Listing title, breed, price, description and region render after fetch.
 *  3. "Contact Vendor" button visible only for shopper role.
 *  4. "Contact Vendor" button absent for vendor role.
 *  5. Freight calculator form is present and submittable.
 *  6. Freight result panel appears after a successful calculate call.
 *  7. "Listing not found" fallback when API returns no data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE, MOCK_LISTING } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import ListingDetail from '../pages/ListingDetail';

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedRole(role: 'shopper' | 'vendor' | 'admin') {
  useAuthStore.setState({
    user: { id: 'u-1', username: role, email: `${role}@test.com`, role },
    token: 'mock-token',
    role,
  });
}

/** Render ListingDetail with a memory router so useParams works. */
function renderDetail(listingId = MOCK_LISTING.id) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/listings/${listingId}`]}>
        <Routes>
          <Route path="/listings/:id" element={<ListingDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_FREIGHT = {
  billableWeight: 15,
  baseCost: 12.50,
  perPoundCharge: 3.00,
  oversizedSurcharge: 0,
  subtotalBeforeWeekend: 15.50,
  weekendSurcharge: 0,
  subtotalBeforeTax: 15.50,
  salesTax: 1.32,
  total: 16.82,
};

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });

  // Default handler: GET /listings/:id → MOCK_LISTING
  server.use(
    http.get(`${API_BASE}/listings/:id`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: MOCK_LISTING }),
    ),
    http.post(`${API_BASE}/settlements/freight/calculate`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: MOCK_FREIGHT }),
    ),
  );
});

// ── 1. Loading skeleton ────────────────────────────────────────────────────────

describe('ListingDetail — loading state', () => {
  it('shows skeleton elements while the listing is being fetched', () => {
    // Override to never resolve so we catch the loading state
    server.use(
      http.get(`${API_BASE}/listings/:id`, async () => {
        await new Promise(() => {/* never resolves */});
        return HttpResponse.json({});
      }),
    );
    seedRole('shopper');
    const { container } = renderDetail();
    expect(container.querySelector('.skeleton')).not.toBeNull();
  });
});

// ── 2. Listing data renders ────────────────────────────────────────────────────

describe('ListingDetail — data display', () => {
  it('renders listing title after data loads', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: MOCK_LISTING.title })).toBeInTheDocument(),
    );
  });

  it('renders breed badge', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText(MOCK_LISTING.breed)).toBeInTheDocument(),
    );
  });

  it('renders price', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText(/\$1,200/)).toBeInTheDocument(),
    );
  });

  it('renders description', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText(MOCK_LISTING.description)).toBeInTheDocument(),
    );
  });

  it('renders region', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText(MOCK_LISTING.region)).toBeInTheDocument(),
    );
  });
});

// ── 3 & 4. Contact Vendor button visibility ───────────────────────────────────

describe('ListingDetail — Contact Vendor button', () => {
  it('is visible for shopper role', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Contact Vendor/i })).toBeInTheDocument(),
    );
  });

  it('is NOT visible for vendor role', async () => {
    seedRole('vendor');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: MOCK_LISTING.title })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Contact Vendor/i })).toBeNull();
  });

  it('is NOT visible for admin role', async () => {
    seedRole('admin');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: MOCK_LISTING.title })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Contact Vendor/i })).toBeNull();
  });
});

// ── 5. Freight calculator form ────────────────────────────────────────────────

describe('ListingDetail — freight calculator', () => {
  it('renders the freight estimate form', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: MOCK_LISTING.title })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Freight Estimate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate/i })).toBeInTheDocument();
  });

  it('shows freight result after calculate is clicked', async () => {
    seedRole('shopper');
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Calculate/i }));

    await waitFor(() =>
      expect(screen.getByText(/Total/i)).toBeInTheDocument(),
    );
    // The total amount from MOCK_FREIGHT should appear
    await waitFor(() =>
      expect(screen.getByText(/\$16\.82|\$16,82/)).toBeInTheDocument(),
    );
  });
});

// ── 7. Not found fallback ─────────────────────────────────────────────────────

describe('ListingDetail — not found', () => {
  it('shows "Listing not found" when API returns no data', async () => {
    server.use(
      http.get(`${API_BASE}/listings/:id`, () =>
        HttpResponse.json({ code: 404, msg: 'Not found' }, { status: 404 }),
      ),
    );
    seedRole('shopper');
    renderDetail('non-existent-id');
    await waitFor(() =>
      expect(screen.getByText(/Listing not found/i)).toBeInTheDocument(),
    );
  });
});
