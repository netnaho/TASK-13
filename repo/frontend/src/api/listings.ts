import { apiGet, apiPost, apiPut, apiDelete, PaginatedResponse } from './axios';

export interface Listing {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  breed: string;
  age: number;
  region: string;
  priceUsd: number;
  rating: number;
  photos: string[];
  status: string;
  sensitiveWordFlagged: boolean;
  createdAt: string;
  vendor?: { id: string; username: string };
}

export interface ListingSearchParams {
  q?: string;
  breed?: string;
  region?: string;
  minAge?: number;
  maxAge?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  maxRating?: number;
  newArrivals?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface CreateListingRequest {
  title: string;
  description: string;
  breed: string;
  age: number;
  region: string;
  priceUsd: number;
  photos?: string[];
}

export interface CreateListingResponse {
  listing: Listing;
  flagged: boolean;
  reason?: string;
  duplicateWarning?: string;
}

export const listingsApi = {
  search: (params: ListingSearchParams) =>
    apiGet<PaginatedResponse<Listing>>('/listings', params as Record<string, unknown>),
  suggest: (q: string) => apiGet<string[]>('/listings/suggest', { q }),
  getOne: (id: string) => apiGet<Listing>(`/listings/${id}`),
  create: (body: CreateListingRequest) => apiPost<CreateListingResponse>('/listings', body),
  update: (id: string, body: Partial<CreateListingRequest>) =>
    apiPut<{ listing: Listing; flagged: boolean; reason?: string }>(`/listings/${id}`, body),
  remove: (id: string) => apiDelete(`/listings/${id}`),
};
