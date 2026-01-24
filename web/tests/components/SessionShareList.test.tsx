/**
 * T017: Unit tests for SessionShareList component
 *
 * Tests:
 * - Loading state display
 * - Empty state display (no shares)
 * - Error state display with retry
 * - Displaying list of shares
 * - Revoke button visibility (owner only)
 * - Revoke confirmation flow
 * - Successful revoke
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionShareList } from '../../src/components/SessionShareList';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage for auth
vi.mock('../../src/lib/auth', () => ({
  createAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

const mockShares = [
  {
    id: 'share-1',
    sessionId: 'session-123',
    sharedByUserId: 'owner-1',
    sharedWithUserId: 'user-1',
    sharedWithEmail: 'alice@example.com',
    sharedWithName: 'Alice',
    grantedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  },
  {
    id: 'share-2',
    sessionId: 'session-123',
    sharedByUserId: 'owner-1',
    sharedWithUserId: 'user-2',
    sharedWithEmail: 'bob@example.com',
    sharedWithName: null,
    grantedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
];

describe('SessionShareList', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('displays loading state initially', async () => {
    // Keep the fetch pending
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    // Should show loading skeleton (animate-pulse elements)
    const loadingElements = document.querySelectorAll('.animate-pulse');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  test('displays empty state when no shares exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('No one else has access to this session.')).toBeInTheDocument();
    });
  });

  test('displays error state with retry button', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch shares/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  test('displays list of shares with user info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      // Check for Alice (with name)
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();

      // Check for Bob (no name, show email only)
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });
  });

  test('displays relative time for shares', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      // 5 minutes ago
      expect(screen.getByText('5m ago')).toBeInTheDocument();
      // 2 hours ago
      expect(screen.getByText('2h ago')).toBeInTheDocument();
    });
  });

  test('shows revoke buttons when isOwner is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      const revokeButtons = screen.getAllByText('Revoke');
      expect(revokeButtons).toHaveLength(2);
    });
  });

  test('hides revoke buttons when isOwner is false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={false} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // No revoke buttons should be visible
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
  });

  test('shows confirmation dialog before revoking', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Click first Revoke button
    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[0]);

    // Confirm and Cancel buttons should appear
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  test('cancels revoke when Cancel is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Click Revoke, then Cancel
    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[0]);
    fireEvent.click(screen.getByText('Cancel'));

    // Should be back to showing Revoke buttons
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    expect(screen.getAllByText('Revoke')).toHaveLength(2);
  });

  test('successfully revokes share and updates list', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockShares),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

    const onShareRevoked = vi.fn();
    render(
      <SessionShareList
        sessionId="session-123"
        isOwner={true}
        onShareRevoked={onShareRevoked}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Click Revoke, then Confirm
    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[0]);
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      // Alice should be removed from the list
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      // Bob should still be there
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });

    // Callback should have been called
    expect(onShareRevoked).toHaveBeenCalled();
  });

  test('shows error when revoke fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockShares),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'User is currently active' }),
      });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Click Revoke, then Confirm
    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[0]);
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      // Error should be displayed
      expect(screen.getByText('User is currently active')).toBeInTheDocument();
      // Alice should still be in the list
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  test('retry button refetches shares', async () => {
    // First call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    render(<SessionShareList sessionId="session-123" isOwner={true} />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    // Second call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockShares),
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });
});
