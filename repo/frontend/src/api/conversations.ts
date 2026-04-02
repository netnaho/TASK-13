import { apiGet, apiPost, apiPostFormData } from './axios';

export interface Conversation {
  id: string;
  listingId: string;
  vendorId: string;
  shopperIds: string[];
  isArchived: boolean;
  isDisputed: boolean;
  createdAt: string;
  listing?: { id: string; title: string };
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'voice';
  content: string;
  audioUrl: string | null;
  isInternal: boolean;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

export interface ConversationFilters {
  archived?: boolean;
  listingId?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

export const conversationsApi = {
  getAll: (filters?: ConversationFilters) =>
    apiGet<Conversation[]>('/conversations', filters as Record<string, unknown>),
  create: (listingId: string) =>
    apiPost<Conversation>('/conversations', { listingId }),
  getOne: (id: string) =>
    apiGet<ConversationWithMessages>(`/conversations/${id}`),
  sendMessage: (id: string, body: { type: string; content?: string; audioUrl?: string; isInternal?: boolean }) =>
    apiPost<Message>(`/conversations/${id}/messages`, body),
  archive: (id: string) =>
    apiPost<Conversation>(`/conversations/${id}/archive`),
  getCannedResponses: () =>
    apiGet<CannedResponse[]>('/conversations/canned-responses'),
  createCannedResponse: (body: { title: string; body: string }) =>
    apiPost<CannedResponse>('/admin/canned-responses', body),
  uploadVoice: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return apiPostFormData<Message>(`/conversations/${id}/voice`, formData);
  },
};
