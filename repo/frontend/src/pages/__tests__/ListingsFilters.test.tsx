/**
 * ListingsFilters.test.tsx
 *
 * Component-level tests for the Listings page covering:
 *   1. All filter controls are present after initial data load
 *      (including the new region / minAge / maxAge / minRating / maxRating inputs)
 *   2. Each filter fires an API request with the correct query parameter
 *   3. No-results: EmptyState renders with and without fallback sections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../../test/test-utils';
import { server } from '../../test/mocks/server';
import {
  API_BASE,
  MOCK_LISTING,
  makeListingsResponse,
} from '../../test/mocks/handlers';
import { useAuthStore } from '../../store/auth.store';
import Listings from '../Listings';

// ── Auth state helpers ────────────────────────────────────────────────────────

function seedShopperSession() {
  useAuthStore.setState({
    user: { id: 'shopper-1', username: 'shopper', email: 's@test.com', role: 'shopper' },
    token: 'mock-token',
    role: 'shopper',
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Override the listings handler for one test, collecting every requested URL.
 * The initial mount request AND subsequent filter-triggered requests are all
 * captured in the same array.
 */
function captureListingsRequests(
  response: ReturnType<typeof makeListingsResponse>,
) {
  const urls: string[] = [];
  server.use(
    http.get(`${API_BASE}/listings`, ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json(response);
    }),
  );
  return () => urls;
}

/**
 * Render Listings and wait for the initial data load to complete.
 * Returns a marker we can use to isolate subsequent requests.
 */
async function renderAndWaitForLoad(getUrls?: () => string[]) {
  seedShopperSession();
  renderWithProviders(<Listings />);

  if (getUrls) {
    // Wait until at least one request has landed (initial fetch resolves)
    await waitFor(() => expect(getUrls().length).toBeGreaterThan(0));
  } else {
    // Without URL capture, wait for any listing-page landmark to appear
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument(),
    );
  }
}

// ── 1. Filter control presence ────────────────────────────────────────────────

describe('Listings — all filter controls are rendered', () => {
  it('renders the keyword search input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Search listings...')).toBeInTheDocument();
  });

  it('renders the breed select with "All Breeds" option', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByRole('option', { name: 'All Breeds' })).toBeInTheDocument();
  });

  it('renders the region text input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Region')).toBeInTheDocument();
  });

  it('renders the min-age input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Min age')).toBeInTheDocument();
  });

  it('renders the max-age input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Max age')).toBeInTheDocument();
  });

  it('renders the min-rating input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Min ★')).toBeInTheDocument();
  });

  it('renders the max-rating input', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Max ★')).toBeInTheDocument();
  });

  it('renders the min / max price inputs', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByPlaceholderText('Min $')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max $')).toBeInTheDocument();
  });

  it('renders Apply Filters and Reset buttons', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });
});

// ── 2. Filter → API param propagation ────────────────────────────────────────

describe('Listings — filter changes send correct params to the API', () => {
  it('region filter sends region= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Region'), {
      target: { value: 'Texas' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('region')).toBe('Texas');
    });
  });

  it('minAge filter sends minAge= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Min age'), {
      target: { value: '6' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('minAge')).toBe('6');
    });
  });

  it('maxAge filter sends maxAge= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Max age'), {
      target: { value: '24' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('maxAge')).toBe('24');
    });
  });

  it('minRating filter sends minRating= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Min ★'), {
      target: { value: '4' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('minRating')).toBe('4');
    });
  });

  it('maxRating filter sends maxRating= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Max ★'), {
      target: { value: '5' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('maxRating')).toBe('5');
    });
  });

  it('minPrice filter sends minPrice= param', async () => {
    const getUrls = captureListingsRequests(makeListingsResponse([MOCK_LISTING]));
    await renderAndWaitForLoad(getUrls);
    const initialCount = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Min $'), {
      target: { value: '500' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(initialCount);
      expect(new URL(getUrls().at(-1)!).searchParams.get('minPrice')).toBe('500');
    });
  });
});

// ── 3. No-results + fallback rendering ───────────────────────────────────────

describe('Listings — no-results EmptyState and fallback sections', () => {
  it('shows "No listings found" EmptyState when items array is empty', async () => {
    captureListingsRequests(makeListingsResponse([]));
    seedShopperSession();
    renderWithProviders(<Listings />);

    await waitFor(() =>
      expect(screen.getByText(/no listings found/i)).toBeInTheDocument(),
    );
  });

  it('shows "Similar Breeds" section when fallback.similarBreed has items', async () => {
    captureListingsRequests(
      makeListingsResponse([], {
        similarBreed: [MOCK_LISTING],
        trending: [],
      }),
    );
    seedShopperSession();
    renderWithProviders(<Listings />);

    await waitFor(() =>
      expect(screen.getByText(/similar breeds/i)).toBeInTheDocument(),
    );
    // The fallback listing title must appear inside that section
    expect(screen.getByText('Golden Retriever Puppy')).toBeInTheDocument();
  });

  it('shows "Trending This Week" section when fallback.trending has items', async () => {
    captureListingsRequests(
      makeListingsResponse([], {
        similarBreed: [],
        trending: [{ ...MOCK_LISTING, id: 'trend-1', title: 'Trending Poodle' }],
      }),
    );
    seedShopperSession();
    renderWithProviders(<Listings />);

    await waitFor(() =>
      expect(screen.getByText(/trending this week/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Trending Poodle')).toBeInTheDocument();
  });

  it('hides "Similar Breeds" section when fallback.similarBreed is empty', async () => {
    captureListingsRequests(
      makeListingsResponse([], { similarBreed: [], trending: [] }),
    );
    seedShopperSession();
    renderWithProviders(<Listings />);

    await waitFor(() =>
      expect(screen.getByText(/no listings found/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/similar breeds/i)).not.toBeInTheDocument();
  });

  it('renders no fallback sections when the API omits the fallback field', async () => {
    captureListingsRequests(makeListingsResponse([]));
    seedShopperSession();
    renderWithProviders(<Listings />);

    await waitFor(() =>
      expect(screen.getByText(/no listings found/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/similar breeds/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trending this week/i)).not.toBeInTheDocument();
  });
});
