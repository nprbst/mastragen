/**
 * oRPC client for type-safe communication with the Orchestrator API.
 *
 * This client provides end-to-end type safety using the router types
 * exported from the orchestrator.
 */
import { createORPCClient, type ORPCLink } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { Router } from '../../orchestrator/src/orpc/router.ts';

/**
 * Create an oRPC client configured for the orchestrator.
 *
 * @param baseUrl - The base URL of the orchestrator API (e.g., http://localhost:4000)
 * @param authToken - Optional JWT auth token for authenticated requests
 */
export function createApiClient(baseUrl: string, authToken?: string) {
  const rpcUrl = `${baseUrl.replace(/\/$/, '')}/rpc`;

  const link = new RPCLink({
    url: rpcUrl,
    headers: () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      return headers;
    },
  });

  return createORPCClient<Router>(link);
}

/**
 * Type alias for the API client.
 */
export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Example usage:
 *
 * ```ts
 * const api = createApiClient('http://localhost:4000');
 *
 * // Health check (fully typed)
 * const health = await api.health.check();
 * console.log(health.status); // 'ok' | 'unhealthy'
 *
 * // List projects (fully typed)
 * const projects = await api.projects.list();
 * projects.forEach(p => console.log(p.name, p.githubRepo));
 *
 * // Create session (input validated, output typed)
 * const session = await api.sessions.create({
 *   projectId: 'proj-123',
 *   artifactName: 'my-artifact',
 *   environment: 'development',
 * });
 * console.log(session.urls.vscode);
 * ```
 */
