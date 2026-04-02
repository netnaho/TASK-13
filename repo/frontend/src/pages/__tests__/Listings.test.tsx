import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/test-utils';
import { useAuthStore } from '../../store/auth.store';
import Listings from '../Listings';

function seedVendorSession() {
  useAuthStore.setState({
    user: { id: 'vendor-1', username: 'vendor', email: 'v@test.com', role: 'vendor' },
    token: 'mock-token',
    role: 'vendor',
  });
}

describe('Listings', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, role: null });
  });

  it('renders the listings page and shows fetched listings', async () => {
    seedVendorSession();
    renderWithProviders(<Listings />);

    await waitFor(() => {
      expect(screen.getByText('Golden Retriever Puppy')).toBeInTheDocument();
    });
  });

  it('shows "+ New Listing" button for vendor role', async () => {
    seedVendorSession();
    renderWithProviders(<Listings />);

    await waitFor(() => {
      expect(screen.getByText('+ New Listing')).toBeInTheDocument();
    });
  });

  it('hides "+ New Listing" button for shopper role', async () => {
    useAuthStore.setState({
      user: { id: 'shopper-1', username: 'shopper', email: 's@test.com', role: 'shopper' },
      token: 'mock-token',
      role: 'shopper',
    });
    renderWithProviders(<Listings />);

    await waitFor(() => {
      expect(screen.getByText('Golden Retriever Puppy')).toBeInTheDocument();
    });
    expect(screen.queryByText('+ New Listing')).not.toBeInTheDocument();
  });

  it('opens the create form and validates required fields', async () => {
    seedVendorSession();
    const user = userEvent.setup();
    renderWithProviders(<Listings />);

    await waitFor(() => {
      expect(screen.getByText('+ New Listing')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Listing'));
    expect(screen.getByText('Create New Listing')).toBeInTheDocument();

    // Submit empty form
    await user.click(screen.getByRole('button', { name: 'Create Listing' }));

    await waitFor(() => {
      // Multiple "Required" errors for title, breed, region
      const requiredErrors = screen.getAllByText('Required');
      expect(requiredErrors.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('successfully creates a listing with valid data', async () => {
    seedVendorSession();
    const user = userEvent.setup();
    renderWithProviders(<Listings />);

    await waitFor(() => {
      expect(screen.getByText('+ New Listing')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Listing'));

    // Fill in the form using input names
    const titleInput = document.querySelector('input[name="title"]') as HTMLInputElement;
    const breedInput = document.querySelector('input[name="breed"]') as HTMLInputElement;
    const regionInput = document.querySelector('input[name="region"]') as HTMLInputElement;
    const ageInput = document.querySelector('input[name="age"]') as HTMLInputElement;
    const priceInput = document.querySelector('input[name="priceUsd"]') as HTMLInputElement;
    const descInput = document.querySelector('textarea[name="description"]') as HTMLTextAreaElement;

    await user.type(titleInput, 'Cute Beagle Puppy');
    await user.type(breedInput, 'Beagle');
    await user.type(regionInput, 'New York');
    await user.type(ageInput, '4');
    await user.type(priceInput, '800');
    await user.type(descInput, 'A wonderful beagle puppy for sale');

    await user.click(screen.getByRole('button', { name: 'Create Listing' }));

    // Form should close after successful creation
    await waitFor(() => {
      expect(screen.queryByText('Create New Listing')).not.toBeInTheDocument();
    });
  });
});
