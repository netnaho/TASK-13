/**
 * Conversations.internalNotes.test.tsx
 *
 * Verifies that internal notes are filtered out of the message list for roles
 * that must not see them (shopper, ops_reviewer, finance_admin) and remain
 * visible for privileged roles (vendor, admin).
 *
 * These tests exercise the client-side defense-in-depth guard added to
 * Conversations.tsx: messages where `isInternal === true` are removed from the
 * rendered list unless `role` is `vendor` or `admin`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';
import { renderWithProviders } from '../../test/test-utils';
import { useAuthStore } from '../../store/auth.store';
import Conversations from '../Conversations';

const API_BASE = 'http://localhost:3001/api';

const TEXT_MESSAGE = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'vendor-1',
  type: 'text',
  content: 'This is a public message',
  audioUrl: null,
  isInternal: false,
  isRead: true,
  createdAt: '2025-01-01T10:00:00Z',
};

const INTERNAL_MESSAGE = {
  id: 'msg-2',
  conversationId: 'conv-1',
  senderId: 'vendor-1',
  type: 'text',
  content: 'This is an internal note — staff only',
  audioUrl: null,
  isInternal: true,
  isRead: true,
  createdAt: '2025-01-01T10:01:00Z',
};

const CONVERSATION = {
  id: 'conv-1',
  listingId: 'listing-1',
  vendorId: 'vendor-1',
  shopperIds: ['shopper-1'],
  isArchived: false,
  isDisputed: false,
  createdAt: '2025-01-01T09:00:00Z',
  listing: { id: 'listing-1', title: 'Cute Puppy' },
};

/** Register MSW handlers that return a single conversation with both messages */
function setupHandlers() {
  server.use(
    // The component types getAll as Conversation[] and calls convs?.map(...)
    http.get(`${API_BASE}/conversations`, () =>
      HttpResponse.json({
        code: 200,
        msg: 'OK',
        data: [CONVERSATION],
      }),
    ),
    http.get(`${API_BASE}/conversations/conv-1`, () =>
      HttpResponse.json({
        code: 200,
        msg: 'OK',
        data: {
          conversation: CONVERSATION,
          messages: [TEXT_MESSAGE, INTERNAL_MESSAGE],
        },
      }),
    ),
    http.get(`${API_BASE}/conversations/canned-responses`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: [] }),
    ),
  );
}

function seedSession(role: string, userId = 'user-test') {
  useAuthStore.setState({
    user: { id: userId, username: role, email: `${role}@test.com`, role },
    token: 'mock-token',
    role,
  });
}

async function openConversation() {
  // Wait for the list to load then click the conversation
  const convButton = await screen.findByText('Cute Puppy');
  convButton.click();
}

describe('Internal note visibility — role-based filtering', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, role: null });
    setupHandlers();
  });

  // ── Privileged roles: internal notes must be visible ──────────────────────

  it('vendor sees internal notes', async () => {
    seedSession('vendor', 'vendor-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText('This is an internal note — staff only')).toBeInTheDocument();
    });
  });

  it('admin sees internal notes', async () => {
    seedSession('admin', 'admin-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText('This is an internal note — staff only')).toBeInTheDocument();
    });
  });

  // ── Restricted roles: internal notes must be hidden ───────────────────────

  it('shopper does NOT see internal notes', async () => {
    seedSession('shopper', 'shopper-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    // Public message should still be visible
    await waitFor(() => {
      expect(screen.getByText('This is a public message')).toBeInTheDocument();
    });
    // Internal note must be absent
    expect(screen.queryByText('This is an internal note — staff only')).not.toBeInTheDocument();
  });

  it('ops_reviewer does NOT see internal notes', async () => {
    seedSession('ops_reviewer', 'ops-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText('This is a public message')).toBeInTheDocument();
    });
    expect(screen.queryByText('This is an internal note — staff only')).not.toBeInTheDocument();
  });

  it('finance_admin does NOT see internal notes', async () => {
    seedSession('finance_admin', 'fin-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText('This is a public message')).toBeInTheDocument();
    });
    expect(screen.queryByText('This is an internal note — staff only')).not.toBeInTheDocument();
  });

  // ── Regression: the 🔒 Internal Note label also hidden for restricted roles

  it('shopper does not see the 🔒 Internal Note label', async () => {
    seedSession('shopper', 'shopper-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText('This is a public message')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Internal Note/)).not.toBeInTheDocument();
  });

  it('vendor sees the 🔒 Internal Note label', async () => {
    seedSession('vendor', 'vendor-1');
    renderWithProviders(<Conversations />);
    await openConversation();

    await waitFor(() => {
      expect(screen.getByText(/Internal Note/)).toBeInTheDocument();
    });
  });
});
