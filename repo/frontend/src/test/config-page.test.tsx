/**
 * config-page.test.tsx
 *
 * Unit tests for AdminConfig (Platform Config) page.
 *
 * Coverage:
 *  1. "Platform Config" heading renders.
 *  2. Three tabs visible: Campaigns, Sensitive Words, Canned Responses.
 *  3. Campaigns tab is active by default; campaign list loads.
 *  4. "+ New Campaign" button toggles the create form.
 *  5. Switching to Sensitive Words tab renders word list.
 *  6. Sensitive words display as removable badges.
 *  7. Empty sensitive words state shows informative message.
 *  8. Switching to Canned Responses tab renders add form + list.
 *  9. Add Canned Response button is disabled when fields are empty.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import AdminConfig from '../pages/admin/Config';

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

// ── Fixtures & mock helpers ───────────────────────────────────────────────────

const MOCK_CAMPAIGN = {
  id: 'c-1',
  title: 'Spring Sale',
  type: 'announcement',
  status: 'active',
  startTime: '2025-03-01T00:00:00Z',
  endTime: '2025-03-31T23:59:59Z',
  slotIndex: 1,
  data: {},
};

const MOCK_WORD = { id: 'w-1', word: 'scam', createdAt: '2025-01-01T00:00:00Z' };

const MOCK_CANNED = {
  id: 'cr-1',
  title: 'Welcome',
  body: 'Thank you for contacting us.',
  createdBy: 'admin-1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

function mockCampaigns(items = [MOCK_CAMPAIGN]) {
  server.use(
    http.get(`${API_BASE}/admin/campaigns`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: items }),
    ),
  );
}

function mockSensitiveWords(items = [MOCK_WORD]) {
  server.use(
    http.get(`${API_BASE}/admin/sensitive-words`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: items }),
    ),
  );
}

function mockCannedResponses(items = [MOCK_CANNED]) {
  server.use(
    http.get(`${API_BASE}/conversations/canned-responses`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: items }),
    ),
  );
}

// ── 1. Heading ────────────────────────────────────────────────────────────────

describe('AdminConfig — layout', () => {
  it('renders "Platform Config" heading', () => {
    mockCampaigns();
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    expect(screen.getByText('Platform Config')).toBeInTheDocument();
  });

  it('renders all three tabs: Campaigns, Sensitive Words, Canned Responses', () => {
    mockCampaigns();
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    expect(screen.getByRole('button', { name: 'Campaigns' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sensitive Words' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canned Responses' })).toBeInTheDocument();
  });
});

// ── 3 & 4. Campaigns tab ──────────────────────────────────────────────────────

describe('AdminConfig — Campaigns tab', () => {
  it('campaigns tab is active by default and shows campaign data', async () => {
    mockCampaigns([MOCK_CAMPAIGN]);
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    await waitFor(() =>
      expect(screen.getByText('Spring Sale')).toBeInTheDocument(),
    );
  });

  it('+ New Campaign button toggles the create form', async () => {
    mockCampaigns([]);
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    const btn = screen.getByRole('button', { name: /\+ New Campaign/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByText('Title')).toBeInTheDocument(),
    );
  });

  it('create form shows Type, Start Time, End Time fields', async () => {
    mockCampaigns([]);
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Campaign/i }));
    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Start Time')).toBeInTheDocument();
      expect(screen.getByText('End Time')).toBeInTheDocument();
    });
  });

  it('"Cancel" button collapses the form', async () => {
    mockCampaigns([]);
    mockSensitiveWords();
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: /\+ New Campaign/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByText('Start Time')).not.toBeInTheDocument();
  });
});

// ── 5–7. Sensitive Words tab ──────────────────────────────────────────────────

describe('AdminConfig — Sensitive Words tab', () => {
  it('switching to Sensitive Words tab renders word badges', async () => {
    mockCampaigns();
    mockSensitiveWords([MOCK_WORD]);
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Sensitive Words' }));
    await waitFor(() =>
      expect(screen.getByText('scam')).toBeInTheDocument(),
    );
  });

  it('each word badge has a × remove button', async () => {
    mockCampaigns();
    mockSensitiveWords([MOCK_WORD]);
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Sensitive Words' }));
    await waitFor(() => expect(screen.getByText('scam')).toBeInTheDocument());
    expect(screen.getByText('×')).toBeInTheDocument();
  });

  it('shows "No sensitive words configured" when list is empty', async () => {
    mockCampaigns();
    mockSensitiveWords([]);
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Sensitive Words' }));
    await waitFor(() =>
      expect(screen.getByText(/No sensitive words configured/i)).toBeInTheDocument(),
    );
  });

  it('add word input and Add button are present', async () => {
    mockCampaigns();
    mockSensitiveWords([]);
    mockCannedResponses();
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Sensitive Words' }));
    await waitFor(() => expect(screen.getByPlaceholderText(/Add sensitive word/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });
});

// ── 8–9. Canned Responses tab ─────────────────────────────────────────────────

describe('AdminConfig — Canned Responses tab', () => {
  it('switching to Canned Responses tab renders add form and list', async () => {
    mockCampaigns();
    mockSensitiveWords();
    mockCannedResponses([MOCK_CANNED]);
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Canned Responses' }));
    await waitFor(() =>
      expect(screen.getByText('Add Canned Response')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText('Welcome')).toBeInTheDocument(),
    );
  });

  it('"Add Response" button is disabled when title and body are empty', async () => {
    mockCampaigns();
    mockSensitiveWords();
    mockCannedResponses([]);
    seedAdmin();
    renderWithProviders(<AdminConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Canned Responses' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add Response/i })).toBeDisabled(),
    );
  });
});
