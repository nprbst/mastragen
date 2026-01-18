import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type { Database, GitHubAccountType } from '../db/types.ts';
import { getAuditLogger } from '../services/audit-logger.ts';

/**
 * GitHub webhook payload types.
 */
interface InstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: {
    id: number;
    account: {
      login: string;
      id: number;
      type: string;
    };
    repository_selection: string;
    permissions: Record<string, string>;
  };
}

interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: {
    id: number;
  };
  repositories_added: Array<{ id: number; name: string; full_name: string }>;
  repositories_removed: Array<{ id: number; name: string; full_name: string }>;
}

/**
 * Verify GitHub webhook signature using HMAC SHA-256.
 */
function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  try {
    const sig = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (sig.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(sig, expected);
  } catch {
    return false;
  }
}

/**
 * Create webhook routes for GitHub App events.
 */
export function createWebhookRoutes(db: Kysely<Database>, webhookSecret: string): Hono {
  const app = new Hono();
  const auditLogger = getAuditLogger();

  /**
   * POST /webhooks/github
   * Receives GitHub App webhook events.
   */
  app.post('/github', async (c) => {
    const signature = c.req.header('X-Hub-Signature-256');
    const event = c.req.header('X-GitHub-Event');
    const deliveryId = c.req.header('X-GitHub-Delivery');

    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // Verify signature
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      auditLogger.logSecurityEvent({
        action: 'webhook_signature_invalid',
        event,
        deliveryId,
        success: false,
      });

      return c.json(
        {
          error: 'Unauthorized',
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: 'Invalid webhook signature',
        },
        401
      );
    }

    // Parse payload
    const payload = JSON.parse(rawBody);

    // Handle different event types
    try {
      switch (event) {
        case 'installation':
          await handleInstallationEvent(db, payload as InstallationPayload, auditLogger);
          break;

        case 'installation_repositories':
          await handleInstallationRepositoriesEvent(
            db,
            payload as InstallationRepositoriesPayload,
            auditLogger
          );
          break;

        default:
          // Log unknown events but acknowledge receipt
          auditLogger.logWebhookEvent({
            event: event ?? 'unknown',
            action: payload.action,
            deliveryId,
            handled: false,
          });
      }
    } catch (error) {
      console.error(`Error handling webhook ${event}:`, error);
      auditLogger.logWebhookEvent({
        event: event ?? 'unknown',
        action: payload.action,
        deliveryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return c.json({ received: true });
  });

  return app;
}

/**
 * Handle installation events (created, deleted, suspend, unsuspend).
 */
async function handleInstallationEvent(
  db: Kysely<Database>,
  payload: InstallationPayload,
  auditLogger: ReturnType<typeof getAuditLogger>
): Promise<void> {
  const { action, installation } = payload;
  const now = new Date().toISOString();

  auditLogger.logWebhookEvent({
    event: 'installation',
    action,
    installationId: installation.id,
    accountLogin: installation.account.login,
  });

  switch (action) {
    case 'created': {
      // Check if installation already exists
      const existing = await db
        .selectFrom('github_app_installations')
        .selectAll()
        .where('installation_id', '=', installation.id)
        .executeTakeFirst();

      if (!existing) {
        const id = nanoid(12);
        await db
          .insertInto('github_app_installations')
          .values({
            id,
            installation_id: installation.id,
            account_type: installation.account.type as GitHubAccountType,
            account_login: installation.account.login,
            account_id: installation.account.id,
            permissions: JSON.stringify(installation.permissions),
            repository_selection: installation.repository_selection,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
      break;
    }

    case 'deleted': {
      await db
        .deleteFrom('github_app_installations')
        .where('installation_id', '=', installation.id)
        .execute();
      break;
    }

    case 'suspend': {
      await db
        .updateTable('github_app_installations')
        .set({
          suspended_at: now,
          updated_at: now,
        })
        .where('installation_id', '=', installation.id)
        .execute();
      break;
    }

    case 'unsuspend': {
      await db
        .updateTable('github_app_installations')
        .set({
          suspended_at: null,
          updated_at: now,
        })
        .where('installation_id', '=', installation.id)
        .execute();
      break;
    }
  }
}

/**
 * Handle installation_repositories events (added, removed).
 */
async function handleInstallationRepositoriesEvent(
  _db: Kysely<Database>,
  payload: InstallationRepositoriesPayload,
  auditLogger: ReturnType<typeof getAuditLogger>
): Promise<void> {
  const { action, installation, repositories_added, repositories_removed } = payload;

  auditLogger.logWebhookEvent({
    event: 'installation_repositories',
    action,
    installationId: installation.id,
    repositoriesAdded: repositories_added.map((r) => r.full_name),
    repositoriesRemoved: repositories_removed.map((r) => r.full_name),
  });

  // For now, we just log the event. Projects linked to removed repositories
  // will fail access checks naturally when users try to access them.
  // Future: Could implement orphaning of projects when their repo is removed.
}
