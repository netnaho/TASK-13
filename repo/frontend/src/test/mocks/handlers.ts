import { http, HttpResponse } from 'msw';

const API_BASE = 'http://localhost:3001/api';

export const handlers = [
  // Auth: login success
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };

    if (body.username === 'admin' && body.password === 'admin123') {
      return HttpResponse.json({
        code: 200,
        msg: 'OK',
        data: {
          token: 'mock-jwt-token',
          user: {
            id: 'user-1',
            username: 'admin',
            email: 'admin@petmarket.com',
            role: 'admin',
            isActive: true,
            createdAt: '2025-01-01T00:00:00Z',
          },
        },
      });
    }

    return HttpResponse.json(
      { code: 401, msg: 'Invalid credentials', timestamp: new Date().toISOString() },
      { status: 401 },
    );
  }),

  // Listings: search
  http.get(`${API_BASE}/listings`, () => {
    return HttpResponse.json({
      code: 200,
      msg: 'OK',
      data: {
        items: [
          {
            id: 'listing-1',
            vendorId: 'vendor-1',
            title: 'Golden Retriever Puppy',
            description: 'A friendly golden retriever puppy',
            breed: 'Golden Retriever',
            age: 3,
            region: 'California',
            priceUsd: 1200,
            rating: 4.5,
            photos: [],
            status: 'active',
            sensitiveWordFlagged: false,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
  }),

  // Listings: create
  http.post(`${API_BASE}/listings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    return HttpResponse.json({
      code: 200,
      msg: 'OK',
      data: {
        listing: {
          id: 'new-listing-1',
          vendorId: 'vendor-1',
          title: body.title,
          description: body.description,
          breed: body.breed,
          age: body.age,
          region: body.region,
          priceUsd: body.priceUsd,
          rating: 0,
          photos: [],
          status: 'active',
          sensitiveWordFlagged: false,
          createdAt: new Date().toISOString(),
        },
        flagged: false,
      },
    });
  }),

  // Listings: suggest
  http.get(`${API_BASE}/listings/suggest`, () => {
    return HttpResponse.json({
      code: 200,
      msg: 'OK',
      data: [],
    });
  }),
];
