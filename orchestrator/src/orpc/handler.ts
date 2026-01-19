/**
 * oRPC HTTP handler for integration with Hono.
 */
import { RPCHandler } from '@orpc/server/fetch';
import type { Context } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';
import { router, type ORPCContext } from './router.ts';

/**
 * Create an oRPC handler configured for the application.
 */
export function createORPCHandler(_db: Kysely<Database>) {
  return new RPCHandler(router);
}

/**
 * Handle oRPC requests in Hono.
 * Mount this at /rpc in the Hono app.
 *
 * @example
 * ```ts
 * app.all('/rpc/*', async (c) => {
 *   return handleORPCRequest(c, db);
 * });
 * ```
 */
export async function handleORPCRequest(
  c: Context,
  db: Kysely<Database>
): Promise<Response> {
  const handler = createORPCHandler(db);

  // Extract auth user from Hono context if present
  const authUser = c.get('authUser') as ORPCContext['user'] | undefined;

  // Create oRPC context with db and user
  const context: ORPCContext = {
    db,
    user: authUser,
  };

  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context,
  });

  if (matched && response) {
    return response;
  }

  return c.json({ error: 'Not found' }, 404);
}

/**
 * Export the handler type for testing.
 */
export type ORPCHandler = ReturnType<typeof createORPCHandler>;
