/**
 * listings-filters.test.tsx
 *
 * Multidimensional filter tests for the Listings page.
 *
 * Coverage
 * --------
 *  1. All filter controls render after initial load.
 *  2. Each filter sends the correct query-param to the API.
 *  3. Reset clears all accumulated filter params.
 *  4. Applying multiple filters stacks them in a single request.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE, MOCK_LISTING, makeListingsResponse } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import Listings from '../pages/Listings';

// ── Auth seed ─────────────────────────────────────────────────────────────────

function seedSession(role = 'shopper') {
  useAuthStore.setState({
    user: { id: 'user-1', username: 'testuser', email: 'u@test.com', role },
    token: 'mock-token',
    role,
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });
});

// ── URL-capture helper ────────────────────────────────────────────────────────

/**
 * Install a per-test listings handler that records every request URL.
 * Returns a getter for the captured URL array.
 */
function captureListingsUrls() {
  const urls: string[] = [];
  server.use(
    http.get(`${API_BASE}/listings`, ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json(makeListingsResponse([MOCK_LISTING]));
    }),
  );
  return () => urls;
}

/** Render Listings and wait until the "Apply Filters" button is visible (loading finished). */
async function renderAndWait(getUrls?: () => string[]) {
  seedSession();
  renderWithProviders(<Listings />);
  // Always wait for Apply Filters — it only appears after the initial load
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument(),
  );
  if (getUrls) {
    await waitFor(() => expect(getUrls().length).toBeGreaterThan(0));
  }
}

// ── 1. Control presence ───────────────────────────────────────────────────────

describe('Listings filters — control presence', () => {
  it('renders the keyword search input', async () => {
    await renderAndWait();
    expect(screen.getByPlaceholderText('Search listings...')).toBeInTheDocument();
  });

  it('renders the region text input', async () => {
    await renderAndWait();
    expect(screen.getByPlaceholderText('Region')).toBeInTheDocument();
  });

  it('renders min-age and max-age inputs', async () => {
    await renderAndWait();
    expect(screen.getByPlaceholderText('Min age')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max age')).toBeInTheDocument();
  });

  it('renders min-rating and max-rating inputs', async () => {
    await renderAndWait();
    expect(screen.getByPlaceholderText('Min ★')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max ★')).toBeInTheDocument();
  });

  it('renders min-price and max-price inputs', async () => {
    await renderAndWait();
    expect(screen.getByPlaceholderText('Min $')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max $')).toBeInTheDocument();
  });

  it('renders Apply Filters and Reset buttons', async () => {
    await renderAndWait();
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders the breed select', async () => {
    await renderAndWait();
    expect(screen.getByRole('option', { name: 'All Breeds' })).toBeInTheDocument();
  });
});

// ── 2. Filter → API param ─────────────────────────────────────────────────────

describe('Listings filters — query-param propagation', () => {
  it('region filter sends region= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Region'), {
      target: { value: 'Oregon' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('region')).toBe('Oregon');
    });
  });

  it('minAge filter sends minAge= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Min age'), { target: { value: '3' } });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('minAge')).toBe('3');
    });
  });

  it('maxAge filter sends maxAge= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Max age'), { target: { value: '18' } });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('maxAge')).toBe('18');
    });
  });

  it('minRating filter sends minRating= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Min ★'), { target: { value: '3' } });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('minRating')).toBe('3');
    });
  });

  it('maxRating filter sends maxRating= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    fireEvent.change(screen.getByPlaceholderText('Max ★'), { target: { value: '5' } });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('maxRating')).toBe('5');
    });
  });

  it('breed select sends breed= param', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);
    const before = getUrls().length;

    // Two unlabelled selects exist (breed + sort); pick the one with the breed option
    const breedSelect = (screen.getByRole('option', { name: 'All Breeds' }) as HTMLOptionElement)
      .closest('select')!;
    fireEvent.change(breedSelect, {
      target: { value: 'Poodle' },
    });

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(before);
      expect(new URL(getUrls().at(-1)!).searchParams.get('breed')).toBe('Poodle');
    });
  });
});

// ── 3. Reset behavior ─────────────────────────────────────────────────────────

describe('Listings filters — Reset clears params', () => {
  it('Reset removes previously applied region filter', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);

    // Apply region
    fireEvent.change(screen.getByPlaceholderText('Region'), { target: { value: 'Texas' } });
    await waitFor(() =>
      expect(new URL(getUrls().at(-1)!).searchParams.get('region')).toBe('Texas'),
    );

    const beforeReset = getUrls().length;
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(beforeReset);
      expect(new URL(getUrls().at(-1)!).searchParams.get('region')).toBeNull();
    });
  });

  it('Reset removes minAge and maxAge params', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);

    fireEvent.change(screen.getByPlaceholderText('Min age'), { target: { value: '6' } });
    await waitFor(() =>
      expect(new URL(getUrls().at(-1)!).searchParams.get('minAge')).toBe('6'),
    );

    const beforeReset = getUrls().length;
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => {
      expect(getUrls().length).toBeGreaterThan(beforeReset);
      const params = new URL(getUrls().at(-1)!).searchParams;
      expect(params.get('minAge')).toBeNull();
      expect(params.get('maxAge')).toBeNull();
    });
  });
});

// ── 4. Multiple filters stack ─────────────────────────────────────────────────

describe('Listings filters — Apply stacks multiple params', () => {
  it('applying region + minRating sends both params together', async () => {
    const getUrls = captureListingsUrls();
    await renderAndWait(getUrls);

    // Apply region first; wait for the resulting request to settle so React Query
    // re-enters the loaded state (new queryKey → brief isLoading).
    fireEvent.change(screen.getByPlaceholderText('Region'), { target: { value: 'California' } });
    await waitFor(() =>
      expect(new URL(getUrls().at(-1)!).searchParams.get('region')).toBe('California'),
    );

    // After settle the filter sidebar is back; apply minRating
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Min ★')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText('Min ★'), { target: { value: '4' } });

    await waitFor(() => {
      const params = new URL(getUrls().at(-1)!).searchParams;
      expect(params.get('region')).toBe('California');
      expect(params.get('minRating')).toBe('4');
    });
  });
});
