import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { listingsApi, type Listing, type ListingSearchParams } from '../api';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../components/Toaster';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { formatCurrency, isNewArrival, getErrorMessage } from '../lib/utils';

const createSchema = z.object({
  title: z.string().min(2, 'Required'),
  description: z.string().min(10, 'Min 10 chars'),
  breed: z.string().min(2, 'Required'),
  age: z.coerce.number().positive(),
  region: z.string().min(2, 'Required'),
  priceUsd: z.coerce.number().positive(),
});

type CreateForm = z.infer<typeof createSchema>;

export default function Listings() {
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [flagWarning, setFlagWarning] = useState('');
  const [filters, setFilters] = useState<ListingSearchParams>({ page: 1, limit: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['listings', filters],
    queryFn: () => listingsApi.search(filters),
  });

  useEffect(() => {
    if (!searchInput || searchInput.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await listingsApi.suggest(searchInput);
        setSuggestions(res);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateForm) => listingsApi.create(body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      if (res.flagged) {
        setFlagWarning('Listing submitted for review — prohibited terms detected.');
        toast('Listing flagged for review', 'warning');
      } else {
        toast('Listing created!');
        setFlagWarning('');
      }
      setShowForm(false);
      reset();
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const applySearch = () => {
    setFilters((f) => ({ ...f, q: searchInput || undefined, page: 1 }));
    setShowSuggestions(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 skeleton w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-64 skeleton rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Failed to load listings"
        action={<button onClick={() => refetch()} className="text-[#1a56db] text-sm underline">Retry</button>}
      />
    );
  }

  const items = data?.items ?? [];
  const fallback = data?.fallback;

  return (
    <div>
      <PageHeader title="Listings" subtitle={`${data?.total ?? 0} listings found`}>
        {(role === 'vendor' || role === 'admin') && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1648c0] transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Listing'}
          </button>
        )}
      </PageHeader>

      {flagWarning && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm mb-4">
          {flagWarning}
        </div>
      )}

      <div className="flex gap-6">
        {/* Filters sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="relative">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search listings..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setSearchInput(s); setShowSuggestions(false); setFilters(f => ({ ...f, q: s, page: 1 })); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select
              onChange={(e) => setFilters(f => ({ ...f, breed: e.target.value || undefined, page: 1 }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Breeds</option>
              {['Golden Retriever', 'Persian', 'French Bulldog', 'Siberian Husky', 'Maine Coon', 'Poodle'].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Region"
              onChange={(e) => setFilters(f => ({ ...f, region: e.target.value || undefined, page: 1 }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value || undefined, page: 1 }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price Low to High</option>
              <option value="price_desc">Price High to Low</option>
              <option value="rating_desc">Top Rated</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                onChange={(e) => setFilters(f => ({ ...f, newArrivals: e.target.checked || undefined, page: 1 }))}
                className="rounded"
              />
              New Arrivals Only
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min $"
                onChange={(e) => setFilters(f => ({ ...f, minPrice: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Max $"
                onChange={(e) => setFilters(f => ({ ...f, maxPrice: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min age"
                min={0}
                onChange={(e) => setFilters(f => ({ ...f, minAge: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Max age"
                min={0}
                onChange={(e) => setFilters(f => ({ ...f, maxAge: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min ★"
                min={0}
                max={5}
                step={0.1}
                onChange={(e) => setFilters(f => ({ ...f, minRating: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Max ★"
                min={0}
                max={5}
                step={0.1}
                onChange={(e) => setFilters(f => ({ ...f, maxRating: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={applySearch}
              className="w-full bg-[#1a56db] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#1648c0]"
            >
              Apply Filters
            </button>
            <button
              onClick={() => { setFilters({ page: 1, limit: 20 }); setSearchInput(''); }}
              className="w-full border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="flex-1">
          {showForm && (
            <form
              onSubmit={handleSubmit((d) => createMutation.mutate(d))}
              className="bg-white border border-gray-200 rounded-xl p-6 mb-6 space-y-4"
            >
              <h2 className="font-semibold text-gray-900">Create New Listing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['title', 'breed', 'region'] as const).map((f) => (
                  <div key={f}>
                    <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{f}</label>
                    <input {...register(f)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    {errors[f] && <p className="text-[#f05252] text-xs mt-1">{errors[f]?.message}</p>}
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age (months)</label>
                  <input type="number" {...register('age')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  {errors.age && <p className="text-[#f05252] text-xs mt-1">{errors.age.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD)</label>
                  <input type="number" step="0.01" {...register('priceUsd')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  {errors.priceUsd && <p className="text-[#f05252] text-xs mt-1">{errors.priceUsd.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea {...register('description')} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.description && <p className="text-[#f05252] text-xs mt-1">{errors.description.message}</p>}
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-[#1a56db] text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Listing'}
              </button>
            </form>
          )}

          {items.length === 0 ? (
            <div>
              <EmptyState title="No listings found" description="Try adjusting your filters" />
              {fallback && (
                <div className="mt-8 space-y-6">
                  {fallback.similarBreed.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Similar Breeds</h3>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {fallback.similarBreed.map((l) => (
                          <ListingCard key={l.id} listing={l} onClick={() => navigate(`/listings/${l.id}`)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {fallback.trending.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Trending This Week</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {fallback.trending.map((l) => (
                          <ListingCard key={l.id} listing={l} onClick={() => navigate(`/listings/${l.id}`)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((l) => (
                  <ListingCard key={l.id} listing={l} onClick={() => navigate(`/listings/${l.id}`)} />
                ))}
              </div>
              {(data?.totalPages ?? 1) > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  <button
                    onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                    disabled={(filters.page ?? 1) <= 1}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-500">
                    Page {data?.page} of {data?.totalPages} ({data?.total} total)
                  </span>
                  <button
                    onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
                    disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const isNew = isNewArrival(listing.createdAt);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-[#1a56db]/30 transition-all group min-w-[240px]"
    >
      <div className="h-40 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center relative">
        <span className="text-5xl">🐾</span>
        {isNew && (
          <span className="absolute top-2 right-2 bg-[#0e9f6e] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            NEW
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-[#1a56db] transition-colors line-clamp-1">
          {listing.title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {listing.breed}
          </span>
          <span className="text-xs text-gray-400">{listing.age} mo</span>
        </div>
        <p className="text-xs text-gray-500">{listing.region}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-bold text-gray-900">{formatCurrency(Number(listing.priceUsd))}</span>
          <span className="text-xs text-yellow-500">{'★'.repeat(Math.round(Number(listing.rating)))}</span>
        </div>
      </div>
    </div>
  );
}
