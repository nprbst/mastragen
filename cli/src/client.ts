/**
 * HTTP client for Mastragen Orchestrator API
 *
 * This client uses oRPC for type-safe API communication with Valibot validation.
 * The external API remains unchanged for backward compatibility with commands.
 */

// Import oRPC client
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { Router } from '../../orchestrator/src/orpc/router.ts';

// Import session token utilities
import { getSessionToken, saveSessionToken } from './utils/session-token.ts';

// Import types from orchestrator schemas (single source of truth)
import type {
  HealthStatus,
  ServiceUrls,
  SessionResponse,
  SessionWithUrlsResponse,
  CreateSessionRequest,
  ListSessionsFilter,
  ProjectResponse,
  ProjectWithEnvironments,
  CreateProjectRequest,
  AddEnvironmentRequest,
  EnvironmentResponse,
} from '../../orchestrator/src/schemas/index.ts';

// Re-export types for CLI consumers
export type { HealthStatus, ServiceUrls, CreateSessionRequest, ListSessionsFilter, CreateProjectRequest, AddEnvironmentRequest };

// Alias for CLI usage (Session is the wire format)
export type Session = SessionResponse;
export type SessionWithUrls = SessionWithUrlsResponse;
export type Environment = EnvironmentResponse;
export type Project = ProjectResponse;
export type ProjectDetail = ProjectWithEnvironments;

// Session sharing types
export interface SessionShareResult {
  shareId: string;
  sharedWithEmail: string;
  sharedWithUserId: string;
  accessUrl: string;
  createdAt: string;
}

export interface SessionShareInfo {
  id: string;
  sessionId: string;
  sharedByUserId: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  sharedWithName: string;
  grantedAt: string;
}

// Idle status type
export interface IdleStatus {
  sessionId: string;
  state: string;
  lastActivityAt: string | null;
  idleTimeoutMinutes: number;
  warningMinutes: number;
  idleSinceMinutes: number;
  warningIssued: boolean;
  suspendAt: string | null;
}

// Tailscale types
export interface TailscaleStatus {
  configured: boolean;
  tailnet: string | null;
  apiKeySet: boolean;
}

export interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  tags: string[];
  authorized: boolean;
  user: string;
}

/**
 * Custom error for API responses with non-2xx status codes.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * HTTP client for the Mastragen Orchestrator API.
 * Uses oRPC internally for type-safe communication with Valibot validation.
 */
export class MgenClient {
  readonly baseUrl: string;

  private rpcClient: ReturnType<typeof createORPCClient<Router>>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Create oRPC client for type-safe RPC calls
    const link = new RPCLink({
      url: `${this.baseUrl}/rpc`,
      headers: () => ({
        'Content-Type': 'application/json',
        'Connection': 'close',
      }),
    });
    this.rpcClient = createORPCClient<Router>(link);
  }

  /**
   * Returns true if connected to a localhost server.
   */
  isLocalhost(): boolean {
    try {
      const url = new URL(this.baseUrl);
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  /**
   * Makes an HTTP request and handles errors.
   * Used for endpoints not yet migrated to oRPC.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Connection': 'close',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const body = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      const errorMessage = body.error ?? `Request failed with status ${response.status}`;
      throw new ApiError(response.status, errorMessage, body);
    }

    return body;
  }

  /**
   * Checks API health status.
   */
  async health(): Promise<HealthStatus> {
    // Use REST endpoint for health (always available even if oRPC is down)
    const url = `${this.baseUrl}/health`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    });

    // Health endpoint returns data even on 503
    return (await response.json()) as HealthStatus;
  }

  /**
   * Creates a new session.
   */
  async createSession(request: CreateSessionRequest): Promise<SessionWithUrls> {
    // Use REST endpoint until oRPC handlers are fully implemented
    const result = await this.request<SessionWithUrls>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    // Store session token for later use (suspend, activity, etc.)
    if (result.sessionToken) {
      saveSessionToken(result.id, result.sessionToken);
    }

    return result;
  }

  /**
   * Lists sessions with optional filters.
   */
  async listSessions(filter?: ListSessionsFilter): Promise<Session[]> {
    const params = new URLSearchParams();
    if (filter?.state) {
      params.set('state', filter.state);
    }
    if (filter?.projectId) {
      params.set('projectId', filter.projectId);
    }

    const queryString = params.toString();
    const path = queryString ? `/api/sessions?${queryString}` : '/api/sessions';

    return this.request<Session[]>(path, {
      method: 'GET',
    });
  }

  /**
   * Gets a session by ID.
   */
  async getSession(id: string): Promise<Session | SessionWithUrls> {
    return this.request<Session | SessionWithUrls>(`/api/sessions/${id}`, {
      method: 'GET',
    });
  }

  /**
   * Suspends an active session.
   * Uses cached session token for authentication.
   */
  async suspendSession(id: string): Promise<Session> {
    const sessionToken = getSessionToken(id);
    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    return this.request<Session>(`/api/sessions/${id}/suspend`, {
      method: 'POST',
      headers,
    });
  }

  /**
   * Resumes a suspended session.
   */
  async resumeSession(id: string, options?: { claudeToken?: string }): Promise<SessionWithUrls> {
    const result = await this.request<SessionWithUrls>(`/api/sessions/${id}/resume`, {
      method: 'POST',
      body: options?.claudeToken ? JSON.stringify({ claudeToken: options.claudeToken }) : undefined,
    });

    // Store new session token (regenerated on resume)
    if (result.sessionToken) {
      saveSessionToken(result.id, result.sessionToken);
    }

    return result;
  }

  /**
   * Cleans up and deletes a session.
   */
  async deleteSession(id: string, options?: { removeVolume?: boolean }): Promise<{ message: string }> {
    const params = new URLSearchParams();
    if (options?.removeVolume) {
      params.set('removeVolume', 'true');
    }
    const queryString = params.toString();
    const path = queryString ? `/api/sessions/${id}?${queryString}` : `/api/sessions/${id}`;

    return this.request<{ message: string }>(path, {
      method: 'DELETE',
    });
  }

  /**
   * Lists all projects.
   */
  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects', {
      method: 'GET',
    });
  }

  /**
   * Resolves a project identifier (ID or name) to a project ID.
   * If the identifier matches the 6-char hex ID format, returns it directly.
   * Otherwise, fetches all projects and finds one with a matching name.
   * @throws ApiError if project not found
   */
  async resolveProjectId(identifier: string): Promise<string> {
    // Check if it's already a valid ID (6-char hex)
    if (/^[A-Fa-f0-9]{6}$/.test(identifier)) {
      return identifier;
    }

    // Otherwise, look up by name
    const projects = await this.listProjects();
    const project = projects.find((p) => p.name === identifier);

    if (!project) {
      throw new ApiError(404, `Project not found: ${identifier}`);
    }

    return project.id;
  }

  /**
   * Gets a project by ID with its environments.
   */
  async getProject(id: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>(`/api/projects/${id}`, {
      method: 'GET',
    });
  }

  /**
   * Creates a new project.
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Adds an environment to a project.
   */
  async addEnvironment(projectId: string, request: AddEnvironmentRequest): Promise<Environment> {
    return this.request<Environment>(`/api/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Lists environments for a project.
   */
  async listEnvironments(projectId: string): Promise<Environment[]> {
    return this.request<Environment[]>(`/api/projects/${projectId}/environments`, {
      method: 'GET',
    });
  }

  // ===== Session Sharing =====

  /**
   * Share a session with another user by email.
   */
  async shareSession(sessionId: string, email: string): Promise<SessionShareResult> {
    return this.request<SessionShareResult>(`/api/sessions/${sessionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  /**
   * List all shares for a session.
   */
  async listSessionShares(sessionId: string): Promise<SessionShareInfo[]> {
    return this.request<SessionShareInfo[]>(`/api/sessions/${sessionId}/shares`, {
      method: 'GET',
    });
  }

  /**
   * Revoke a session share by share ID.
   */
  async revokeSessionShare(sessionId: string, shareId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/sessions/${sessionId}/shares/${shareId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Find a share by email and revoke it.
   * Looks up the share ID first, then revokes.
   */
  async unshareSession(sessionId: string, email: string): Promise<{ message: string }> {
    const shares = await this.listSessionShares(sessionId);
    const share = shares.find(s => s.sharedWithEmail === email);
    if (!share) {
      throw new ApiError(404, `No active share found for ${email}`);
    }
    return this.revokeSessionShare(sessionId, share.id);
  }

  // ===== Idle Status =====

  /**
   * Get idle status for a session.
   * Requires session token authentication.
   */
  async getIdleStatus(sessionId: string): Promise<IdleStatus> {
    const sessionToken = getSessionToken(sessionId);
    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    return this.request<IdleStatus>(`/api/sessions/${sessionId}/idle-status`, {
      method: 'GET',
      headers,
    });
  }

  // ===== Tailscale =====

  /**
   * Get Tailscale configuration status.
   */
  async getTailscaleStatus(): Promise<TailscaleStatus> {
    return this.request<TailscaleStatus>('/api/tailscale/status', {
      method: 'GET',
    });
  }

  /**
   * List all devices in the tailnet.
   */
  async getTailscaleDevices(): Promise<TailscaleDevice[]> {
    return this.request<TailscaleDevice[]>('/api/tailscale/devices', {
      method: 'GET',
    });
  }

  /**
   * Get a Tailscale device by name.
   */
  async getTailscaleDevice(name: string): Promise<TailscaleDevice> {
    return this.request<TailscaleDevice>(`/api/tailscale/devices/${encodeURIComponent(name)}`, {
      method: 'GET',
    });
  }

  // ===== Metrics =====

  /**
   * Get raw Prometheus metrics from the /metrics endpoint.
   */
  async getMetrics(): Promise<string> {
    const url = `${this.baseUrl}/metrics`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Connection': 'close' },
    });

    if (!response.ok) {
      throw new ApiError(response.status, `Metrics request failed with status ${response.status}`);
    }

    return response.text();
  }

  /**
   * Get the oRPC client for direct type-safe access.
   * Use this for new code or when you need full type safety.
   *
   * @example
   * ```ts
   * const client = new MgenClient('http://localhost:4000');
   * const health = await client.rpc.health.check();
   * const projects = await client.rpc.projects.list();
   * ```
   */
  get rpc() {
    return this.rpcClient;
  }
}
