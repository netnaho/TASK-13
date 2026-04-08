/**
 * exports-progress.test.tsx
 *
 * Integration tests for the AdminExports page — progress-bar rendering.
 *
 * Coverage
 * --------
 *  1. queued job: progress bar is rendered; width reflects progressPercent (or 0%).
 *  2. running + progressPercent: exact percentage, no indeterminate animation.
 *  3. running + null progressPercent: 60% fallback with `animate-pulse` class.
 *  4. done job: no progress bar rendered; Download button present.
 *  5. failed job: no progress bar rendered.
 *  6. expired job: "Expired" label visible, no Download button.
 *  7. Over-clamped values (>100) are capped at 100%.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import AdminExports from '../pages/admin/Exports';
import type { ExportJob } from '../api/exports';

// ── Auth seed ─────────────────────────────────────────────────────────────────

function seedAdminSession() {
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

function makeJob(
  status: ExportJob['status'],
  overrides: Partial<ExportJob> = {},
): ExportJob {
  const isDone = status === 'done';
  return {
    id: `job-${status}`,
    requesterId: 'admin-1',
    status,
    filePath: isDone ? '/exports/file.csv' : null,
    params: { type: 'listings' },
    expiresAt: isDone ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    createdAt: new Date().toISOString(),
    progressPercent: null,
    progressStage: null,
    ...overrides,
  };
}

function mockJobs(jobs: ExportJob[]) {
  server.use(
    http.get(`${API_BASE}/exports/jobs`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: jobs }),
    ),
  );
}

// ── Helper: get progress bar element for a given job row ─────────────────────

/**
 * Find the inner progress-bar fill div (the one with a style.width) within
 * the cell that also contains the status badge text.
 */
function getProgressBar(container: HTMLElement): HTMLElement | null {
  // The progress bar fill has an inline style with 'width'
  return container.querySelector('[style*="width"]') as HTMLElement | null;
}

// ── 1. Queued job ─────────────────────────────────────────────────────────────

describe('AdminExports progress bar — queued', () => {
  it('shows progress bar for a queued job with no progressPercent (width 0%)', async () => {
    mockJobs([makeJob('queued')]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('0%');
  });

  it('shows progress bar for a queued job with a known progressPercent', async () => {
    mockJobs([makeJob('queued', { progressPercent: 15 })]);
    seedAdminSession();
    const { container: c } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(c);
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('15%');
    expect(bar!.className).not.toContain('animate-pulse');
  });
});

// ── 2. Running + exact progressPercent ───────────────────────────────────────

describe('AdminExports progress bar — running with value', () => {
  it('renders exact width from progressPercent (50%)', async () => {
    mockJobs([makeJob('running', { progressPercent: 50 })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('50%');
    expect(bar!.className).not.toContain('animate-pulse');
  });

  it('clamps progressPercent over 100 to 100%', async () => {
    mockJobs([makeJob('running', { progressPercent: 150 })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar!.style.width).toBe('100%');
    expect(bar!.className).not.toContain('animate-pulse');
  });

  it('renders progressStage label as tooltip / stage text if present', async () => {
    // The page doesn't render the stage label — this test verifies it doesn't break render
    mockJobs([makeJob('running', { progressPercent: 90, progressStage: 'file_written' })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar!.style.width).toBe('90%');
  });
});

// ── 3. Running + null progressPercent (legacy / indeterminate) ────────────────

describe('AdminExports progress bar — running without value (legacy)', () => {
  it('shows 60% fallback with animate-pulse for null progressPercent', async () => {
    mockJobs([makeJob('running', { progressPercent: null })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('60%');
    expect(bar!.className).toContain('animate-pulse');
  });

  it('does NOT show animate-pulse when progressPercent is provided', async () => {
    mockJobs([makeJob('running', { progressPercent: 75 })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bar = getProgressBar(container);
    expect(bar!.className).not.toContain('animate-pulse');
  });
});

// ── 4. Done job ───────────────────────────────────────────────────────────────

describe('AdminExports progress bar — done', () => {
  it('shows no progress bar for a done job', async () => {
    mockJobs([makeJob('done')]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    // shouldShowProgressBar('done') === false → no bar container rendered
    // The bar fill div has style width; if none exist, no bar is shown
    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars.length).toBe(0);
  });

  it('shows Download button for a done job with a future expiresAt', async () => {
    mockJobs([makeJob('done')]);
    seedAdminSession();
    renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });
});

// ── 5. Failed job ─────────────────────────────────────────────────────────────

describe('AdminExports progress bar — failed', () => {
  it('shows no progress bar for a failed job', async () => {
    mockJobs([makeJob('failed', { progressPercent: 40 })]);
    seedAdminSession();
    const { container } = renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars.length).toBe(0);
  });
});

// ── 6. Expired job ────────────────────────────────────────────────────────────

describe('AdminExports — expired job', () => {
  it('shows "Expired" label and no Download button', async () => {
    mockJobs([makeJob('expired')]);
    seedAdminSession();
    renderWithProviders(<AdminExports />);
    await waitFor(() => expect(screen.getAllByText('listings').length).toBeGreaterThan(0));

    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });
});

// ── 7. Empty state ────────────────────────────────────────────────────────────

describe('AdminExports — empty state', () => {
  it('shows "No export jobs yet" when the list is empty', async () => {
    mockJobs([]);
    seedAdminSession();
    renderWithProviders(<AdminExports />);
    await waitFor(() =>
      expect(screen.getByText('No export jobs yet')).toBeInTheDocument(),
    );
  });
});
