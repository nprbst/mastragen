const API_BASE = '/api';

export interface Session {
  id: string;
  projectId: string;
  artifactName: string;
  environment: string;
  state: 'active' | 'suspended' | 'pr_open' | 'merged' | 'archived' | 'closed';
  suspensionReason?: 'manual' | 'auto' | 'share_revoke' | null;
  createdAt: string;
  updatedAt: string;
  // Git fields (present in extended responses)
  userId?: string | null;
  branchName?: string | null;
  lastCommitSha?: string | null;
  commitCount?: number;
  prNumber?: number | null;
  prUrl?: string | null;
  // Extended fields
  lastActivityAt?: string;
  project?: {
    id: string;
    name: string;
    gitRepo: string | null;
  };
  // Owner info (for shared sessions)
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface Project {
  id: string;
  name: string;
  gitRepo: string | null;
  defaultBranch: string | null;
  branchPrefix: string | null;
  mastraPath: string | null;
  uiSandboxPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionListParams {
  state?: Session['state'];
  projectId?: string;
  userId?: string;
  sharedWithMe?: boolean;
  includeProject?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateSessionParams {
  projectId: string;
  name: string;
  environmentId?: string;
}

// Helper functions for API calls (to be replaced with oRPC procedures when contract is finalized)
export async function fetchSessions(params?: SessionListParams): Promise<Session[]> {
  const searchParams = new URLSearchParams();
  if (params?.state) searchParams.set('state', params.state);
  if (params?.projectId) searchParams.set('projectId', params.projectId);
  if (params?.userId) searchParams.set('userId', params.userId);
  if (params?.sharedWithMe) searchParams.set('sharedWithMe', 'true');
  if (params?.includeProject) searchParams.set('includeProject', 'true');
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/sessions?${searchParams}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/projects`);
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  return response.json();
}

export async function createSession(params: CreateSessionParams): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSession(id: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`);
  }
  return response.json();
}
