/**
 * conversation-internal-notes-visibility.test.tsx
 *
 * Role-sensitive rendering of internal notes in the Conversations page.
 *
 * Internal note display logic (from Conversations.tsx):
 *   const canSeeInternalNotes = role === 'vendor' || role === 'admin';
 *   const messages = messages.filter((m) => !m.isInternal || canSeeInternalNotes);
 *
 * Coverage
 * --------
 *  1. Shopper cannot see internal note messages.
 *  2. Vendor can see internal note messages with "🔒 Internal Note" label.
 *  3. Admin can see internal note messages with "🔒 Internal Note" label.
 *  4. Shopper does NOT see the "Internal note" compose checkbox.
 *  5. Vendor DOES see the "Internal note" compose checkbox.
 *  6. Admin DOES see the "Internal note" compose checkbox.
 *  7. Regular (non-internal) messages are always visible regardless of role.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './test-utils';
import { server } from './mocks/server';
import { API_BASE } from './mocks/handlers';
import { useAuthStore } from '../store/auth.store';
import Conversations from '../pages/Conversations';
import type { Conversation, ConversationWithMessages, Message } from '../api/conversations';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONV: Conversation = {
  id: 'conv-1',
  listingId: 'listing-1',
  vendorId: 'vendor-1',
  shopperIds: ['shopper-1'],
  isArchived: false,
  isDisputed: false,
  createdAt: new Date().toISOString(),
  listing: { id: 'listing-1', title: 'Golden Retriever Puppy' },
};

const MSG_NORMAL: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'shopper-1',
  type: 'text',
  content: 'Hello, is this pet available?',
  audioUrl: null,
  isInternal: false,
  isRead: true,
  createdAt: new Date().toISOString(),
};

const MSG_INTERNAL: Message = {
  id: 'msg-2',
  conversationId: 'conv-1',
  senderId: 'vendor-1',
  type: 'text',
  content: 'INTERNAL: Customer looks suspicious, flag account.',
  audioUrl: null,
  isInternal: true,
  isRead: true,
  createdAt: new Date().toISOString(),
};

const CONV_DETAIL: ConversationWithMessages = {
  conversation: CONV,
  messages: [MSG_NORMAL, MSG_INTERNAL],
};

// ── MSW handlers ──────────────────────────────────────────────────────────────

function installConversationHandlers() {
  server.use(
    http.get(`${API_BASE}/conversations`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: [CONV] }),
    ),
    http.get(`${API_BASE}/conversations/conv-1`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: CONV_DETAIL }),
    ),
    http.get(`${API_BASE}/conversations/canned-responses`, () =>
      HttpResponse.json({ code: 200, msg: 'OK', data: [] }),
    ),
  );
}

// ── Auth seeds ────────────────────────────────────────────────────────────────

function seedRole(
  role: string,
  id = 'user-1',
  username = 'testuser',
) {
  useAuthStore.setState({
    user: { id, username, email: `${username}@test.com`, role },
    token: 'mock-token',
    role,
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, role: null });
  installConversationHandlers();
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Render Conversations, wait for the conversation list to load, click on the
 * test conversation, then wait for messages to render.
 */
async function openConversation() {
  renderWithProviders(<Conversations />);

  // Wait for conversation list to load (listing title appears in the sidebar)
  await waitFor(() =>
    expect(screen.getByText('Golden Retriever Puppy')).toBeInTheDocument(),
  );

  // Click the conversation row to open it
  fireEvent.click(screen.getByText('Golden Retriever Puppy'));

  // Wait for the normal message to appear in the chat pane
  await waitFor(() =>
    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument(),
  );
}

// ── 1–3. Message visibility by role ──────────────────────────────────────────

describe('Conversations — internal note message visibility', () => {
  it('shopper cannot see the internal note message', async () => {
    seedRole('shopper', 'shopper-1', 'shopper');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
    expect(screen.queryByText(MSG_INTERNAL.content)).toBeNull();
  });

  it('shopper cannot see the "🔒 Internal Note" label', async () => {
    seedRole('shopper', 'shopper-1', 'shopper');
    await openConversation();

    expect(screen.queryByText(/internal note/i)).toBeNull();
  });

  it('vendor can see the internal note message', async () => {
    seedRole('vendor', 'vendor-1', 'vendor');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
    expect(screen.getByText(MSG_INTERNAL.content)).toBeInTheDocument();
  });

  it('vendor sees the "🔒 Internal Note" label on the internal message', async () => {
    seedRole('vendor', 'vendor-1', 'vendor');
    await openConversation();

    // The label rendered inside the message bubble
    expect(screen.getByText(/🔒 Internal Note/)).toBeInTheDocument();
  });

  it('admin can see the internal note message', async () => {
    seedRole('admin', 'admin-1', 'admin');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
    expect(screen.getByText(MSG_INTERNAL.content)).toBeInTheDocument();
  });

  it('admin sees the "🔒 Internal Note" label on the internal message', async () => {
    seedRole('admin', 'admin-1', 'admin');
    await openConversation();

    expect(screen.getByText(/🔒 Internal Note/)).toBeInTheDocument();
  });
});

// ── 4–6. Compose checkbox visibility ─────────────────────────────────────────

describe('Conversations — "Internal note" compose checkbox visibility', () => {
  it('shopper does NOT see the Internal note checkbox', async () => {
    seedRole('shopper', 'shopper-1', 'shopper');
    await openConversation();

    // The checkbox label text
    expect(screen.queryByLabelText(/internal note/i)).toBeNull();
    expect(screen.queryByText(/internal note/i)).toBeNull();
  });

  it('vendor DOES see the Internal note checkbox', async () => {
    seedRole('vendor', 'vendor-1', 'vendor');
    await openConversation();

    // The compose area renders a "Internal note" checkbox for vendor/admin
    expect(screen.getByRole('checkbox', { name: /internal note/i })).toBeInTheDocument();
  });

  it('admin DOES see the Internal note checkbox', async () => {
    seedRole('admin', 'admin-1', 'admin');
    await openConversation();

    expect(screen.getByRole('checkbox', { name: /internal note/i })).toBeInTheDocument();
  });
});

// ── 7. Normal messages are always visible ─────────────────────────────────────

describe('Conversations — normal messages always visible', () => {
  it('shopper sees normal (non-internal) messages', async () => {
    seedRole('shopper', 'shopper-1', 'shopper');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
  });

  it('vendor sees normal messages', async () => {
    seedRole('vendor', 'vendor-1', 'vendor');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
  });

  it('admin sees normal messages', async () => {
    seedRole('admin', 'admin-1', 'admin');
    await openConversation();

    expect(screen.getByText(MSG_NORMAL.content)).toBeInTheDocument();
  });
});

// ── 8. Archive button gating ──────────────────────────────────────────────────

describe('Conversations — Archive button role gating', () => {
  it('vendor sees Archive button in active conversation header', async () => {
    seedRole('vendor', 'vendor-1', 'vendor');
    await openConversation();

    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('admin sees Archive button', async () => {
    seedRole('admin', 'admin-1', 'admin');
    await openConversation();

    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('shopper does NOT see Archive button', async () => {
    seedRole('shopper', 'shopper-1', 'shopper');
    await openConversation();

    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull();
  });
});
