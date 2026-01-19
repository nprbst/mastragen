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
      headers: { 'Content-Type': 'application/json' },
    });

    // Health endpoint returns data even on 503
    return (await response.json()) as HealthStatus;
  }

  /**
   * Creates a new session.
   */
  async createSession(request: CreateSessionRequest): Promise<SessionWithUrls> {
    // Use REST endpoint until oRPC handlers are fully implemented
    return this.request<SessionWithUrls>('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
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
    const path = queryString ? `/sessions?${queryString}` : '/sessions';

    return this.request<Session[]>(path, {
      method: 'GET',
    });
  }

  /**
   * Gets a session by ID.
   */
  async getSession(id: string): Promise<Session | SessionWithUrls> {
    return this.request<Session | SessionWithUrls>(`/sessions/${id}`, {
      method: 'GET',
    });
  }

  /**
   * Suspends an active session.
   */
  async suspendSession(id: string): Promise<Session> {
    return this.request<Session>(`/sessions/${id}/suspend`, {
      method: 'POST',
    });
  }

  /**
   * Resumes a suspended session.
   */
  async resumeSession(id: string, options?: { claudeToken?: string }): Promise<SessionWithUrls> {
    return this.request<SessionWithUrls>(`/sessions/${id}/resume`, {
      method: 'POST',
      body: options?.claudeToken ? JSON.stringify({ claudeToken: options.claudeToken }) : undefined,
    });
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
    const path = queryString ? `/sessions/${id}?${queryString}` : `/sessions/${id}`;

    return this.request<{ message: string }>(path, {
      method: 'DELETE',
    });
  }

  /**
   * Lists all projects.
   */
  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects', {
      method: 'GET',
    });
  }

  /**
   * Gets a project by ID with its environments.
   */
  async getProject(id: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>(`/projects/${id}`, {
      method: 'GET',
    });
  }

  /**
   * Creates a new project.
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Adds an environment to a project.
   */
  async addEnvironment(projectId: string, request: AddEnvironmentRequest): Promise<Environment> {
    return this.request<Environment>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Lists environments for a project.
   */
  async listEnvironments(projectId: string): Promise<Environment[]> {
    return this.request<Environment[]>(`/projects/${projectId}/environments`, {
      method: 'GET',
    });
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
