import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { listingsApi, settlementsApi, conversationsApi, type FreightBreakdown } from '../api';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../components/Toaster';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency, formatDate, getErrorMessage } from '../lib/utils';

const freightSchema = z.object({
  distanceMiles: z.coerce.number().positive(),
  weightLbs: z.coerce.number().positive(),
  length: z.coerce.number().positive(),
  width: z.coerce.number().positive(),
  height: z.coerce.number().positive(),
  isWeekend: z.boolean(),
});
type FreightForm = z.infer<typeof freightSchema>;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const [freight, setFreight] = useState<FreightBreakdown | null>(null);

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.getOne(id!),
    enabled: !!id,
  });

  const contactMutation = useMutation({
    mutationFn: () => conversationsApi.create(id!),
    onSuccess: () => { toast('Conversation started!'); navigate('/conversations'); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const { register, handleSubmit } = useForm<FreightForm>({
    resolver: zodResolver(freightSchema),
    defaultValues: { distanceMiles: 100, weightLbs: 10, length: 12, width: 8, height: 8, isWeekend: false },
  });

  const freightMutation = useMutation({
    mutationFn: (data: FreightForm) => {
      const dimWeightLbs = (data.length * data.width * data.height) / 139;
      const isOversized = Math.max(data.length, data.width, data.height) > 48;
      return settlementsApi.calculateFreight({
        distanceMiles: data.distanceMiles,
        weightLbs: data.weightLbs,
        dimWeightLbs,
        isOversized,
        isWeekend: data.isWeekend,
      });
    },
    onSuccess: setFreight,
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 skeleton w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 skeleton rounded-xl" />
          <div className="h-96 skeleton rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return <div className="text-center py-12 text-gray-400">Listing not found</div>;
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-[#1a56db] hover:underline mb-4 inline-block">
        ← Back to Listings
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Listing detail */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="h-64 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
              <span className="text-7xl">🐾</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{listing.breed}</span>
                    <StatusBadge status={listing.status} />
                  </div>
                </div>
                <span className="text-3xl font-bold text-gray-900">{formatCurrency(Number(listing.priceUsd))}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-gray-400">Age</p><p className="font-medium">{listing.age} months</p></div>
                <div><p className="text-gray-400">Region</p><p className="font-medium">{listing.region}</p></div>
                <div><p className="text-gray-400">Rating</p><p className="font-medium text-yellow-500">{'★'.repeat(Math.round(Number(listing.rating)))}</p></div>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{listing.description}</p>
              </div>
              <p className="text-xs text-gray-400">Listed on {formatDate(listing.createdAt)}</p>
              {role === 'shopper' && (
                <button
                  onClick={() => contactMutation.mutate()}
                  disabled={contactMutation.isPending}
                  className="bg-[#1a56db] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1648c0] disabled:opacity-60"
                >
                  {contactMutation.isPending ? 'Starting...' : 'Contact Vendor'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Freight calculator */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Freight Estimate</h3>
            <form onSubmit={handleSubmit((d) => freightMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Distance (miles)</label>
                <input type="number" {...register('distanceMiles')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Weight (lbs)</label>
                <input type="number" {...register('weightLbs')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">L (in)</label>
                  <input type="number" {...register('length')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">W (in)</label>
                  <input type="number" {...register('width')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">H (in)</label>
                  <input type="number" {...register('height')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('isWeekend')} className="rounded" />
                Weekend delivery
              </label>
              <button
                type="submit"
                disabled={freightMutation.isPending}
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
              >
                {freightMutation.isPending ? 'Calculating...' : 'Calculate'}
              </button>
            </form>
            {freight && (
              <div className="mt-4 space-y-2 text-sm border-t border-gray-100 pt-4">
                <div className="flex justify-between"><span className="text-gray-500">Billable Weight</span><span>{freight.billableWeight} lbs</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Base Cost</span><span>{formatCurrency(freight.baseCost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Per-pound Charge</span><span>{formatCurrency(freight.perPoundCharge)}</span></div>
                {freight.oversizedSurcharge > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Oversized Surcharge</span><span>{formatCurrency(freight.oversizedSurcharge)}</span></div>
                )}
                {freight.weekendSurcharge > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Weekend Surcharge</span><span>{formatCurrency(freight.weekendSurcharge)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Sales Tax (8.5%)</span><span>{formatCurrency(freight.salesTax)}</span></div>
                <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <span className="text-[#1a56db]">{formatCurrency(freight.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
