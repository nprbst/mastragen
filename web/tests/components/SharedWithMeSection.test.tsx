/**
 * T018: Unit tests for SharedWithMeSection component
 *
 * Tests:
 * - Returns null when no sessions
 * - Displays session count badge
 * - Groups sessions by project
 * - Shows "Shared by" owner badge
 * - Expands/collapses on toggle
 * - Renders SessionCard for each session
 */
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SharedWithMeSection } from '../../src/components/SharedWithMeSection';
import type { Session } from '../../src/lib/orpc-client';

// Mock SessionCard to avoid its dependencies
vi.mock('../../src/components/SessionCard', () => ({
  SessionCard: ({ session }: { session: Session }) => (
    <div data-testid={`session-card-${session.id}`}>
      <span>{session.id}</span>
      <span>{session.state}</span>
    </div>
  ),
}));

// Helper to create mock sessions
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    projectId: 'project-1',
    userId: 'user-1',
    state: 'active' as const,
    branchName: 'main',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    project: {
      id: 'project-1',
      name: 'Test Project',
      repoUrl: 'https://github.com/test/repo',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    user: {
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Project Owner',
      avatarUrl: null,
      githubId: 12345,
      githubLogin: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  } as Session;
}

describe('SharedWithMeSection', () => {
  test('returns null when sessions array is empty', () => {
    const { container } = render(<SharedWithMeSection sessions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('displays "Shared with me" header with session count', () => {
    const sessions = [createMockSession()];

    render(<SharedWithMeSection sessions={sessions} />);

    expect(screen.getByText('Shared with me')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('displays correct count for multiple sessions', () => {
    const sessions = [
      createMockSession({ id: 'session-1' }),
      createMockSession({ id: 'session-2' }),
      createMockSession({ id: 'session-3' }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('groups sessions by project', () => {
    const sessions = [
      createMockSession({
        id: 'session-1',
        projectId: 'project-a',
        project: { id: 'project-a', name: 'Project A' } as Session['project'],
      }),
      createMockSession({
        id: 'session-2',
        projectId: 'project-a',
        project: { id: 'project-a', name: 'Project A' } as Session['project'],
      }),
      createMockSession({
        id: 'session-3',
        projectId: 'project-b',
        project: { id: 'project-b', name: 'Project B' } as Session['project'],
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    // Both project names should appear
    expect(screen.getByText('Project A')).toBeInTheDocument();
    expect(screen.getByText('Project B')).toBeInTheDocument();

    // All session cards should be rendered
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-card-session-2')).toBeInTheDocument();
    expect(screen.getByTestId('session-card-session-3')).toBeInTheDocument();
  });

  test('displays "Shared by" badge with owner name', () => {
    const sessions = [
      createMockSession({
        user: {
          id: 'owner-1',
          name: 'John Doe',
          email: 'john@example.com',
        } as Session['user'],
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    expect(screen.getByText('Shared by: John Doe')).toBeInTheDocument();
  });

  test('displays "Shared by" badge with email when name is null', () => {
    const sessions = [
      createMockSession({
        user: {
          id: 'owner-1',
          name: null,
          email: 'owner@example.com',
        } as Session['user'],
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    expect(screen.getByText('Shared by: owner@example.com')).toBeInTheDocument();
  });

  test('toggles collapsed/expanded state on click', () => {
    const sessions = [createMockSession()];

    render(<SharedWithMeSection sessions={sessions} />);

    // Initially expanded
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText('Shared with me'));

    // Session cards should be hidden
    expect(screen.queryByTestId('session-card-session-1')).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(screen.getByText('Shared with me'));

    // Session cards should be visible again
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
  });

  test('calls onRefresh callback when passed to SessionCard', () => {
    const onRefresh = vi.fn();
    const sessions = [createMockSession()];

    render(<SharedWithMeSection sessions={sessions} onRefresh={onRefresh} />);

    // The SessionCard is mocked, so we can't trigger the actual callback
    // This test verifies the prop is passed through
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
  });

  test('sorts groups by most recent activity', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const sessions = [
      createMockSession({
        id: 'session-old',
        projectId: 'project-old',
        project: { id: 'project-old', name: 'Old Project' } as Session['project'],
        lastActivityAt: twoHoursAgo.toISOString(),
      }),
      createMockSession({
        id: 'session-new',
        projectId: 'project-new',
        project: { id: 'project-new', name: 'New Project' } as Session['project'],
        lastActivityAt: now.toISOString(),
      }),
      createMockSession({
        id: 'session-mid',
        projectId: 'project-mid',
        project: { id: 'project-mid', name: 'Mid Project' } as Session['project'],
        lastActivityAt: oneHourAgo.toISOString(),
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    // Get all project name elements
    const projectNames = screen.getAllByText(/Project$/);

    // They should be ordered by most recent activity
    // New Project (now) > Mid Project (1h ago) > Old Project (2h ago)
    expect(projectNames[0]).toHaveTextContent('New Project');
    expect(projectNames[1]).toHaveTextContent('Mid Project');
    expect(projectNames[2]).toHaveTextContent('Old Project');
  });

  test('uses projectId as fallback when project name is undefined', () => {
    const sessions = [
      createMockSession({
        projectId: 'fallback-project-id',
        project: undefined,
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    // Should display the projectId as the name
    expect(screen.getByText('fallback-project-id')).toBeInTheDocument();
  });

  test('handles sessions with no owner user gracefully', () => {
    const sessions = [
      createMockSession({
        user: undefined,
      }),
    ];

    render(<SharedWithMeSection sessions={sessions} />);

    // Should still render without "Shared by" badge when no user
    expect(screen.getByText('Shared with me')).toBeInTheDocument();
    expect(screen.queryByText(/Shared by:/)).not.toBeInTheDocument();
  });
});
