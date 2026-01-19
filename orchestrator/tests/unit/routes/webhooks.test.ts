import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { createHmac } from 'crypto';

// Test T011.1: Unit test for GitHub webhook handler

const WEBHOOK_SECRET = 'test-webhook-secret';

/**
 * Helper to create a valid GitHub webhook signature.
 */
function createSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Helper to create installation webhook payload.
 */
function createInstallationPayload(
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend',
  overrides?: Partial<{
    installationId: number;
    accountLogin: string;
    accountType: 'User' | 'Organization';
    accountId: number;
    repositorySelection: 'all' | 'selected';
  }>
) {
  return {
    action,
    installation: {
      id: overrides?.installationId ?? 12345678,
      account: {
        login: overrides?.accountLogin ?? 'test-org',
        id: overrides?.accountId ?? 87654321,
        type: overrides?.accountType ?? 'Organization',
      },
      repository_selection: overrides?.repositorySelection ?? 'selected',
      permissions: {
        contents: 'write',
        metadata: 'read',
        pull_requests: 'write',
      },
    },
  };
}

describe('GitHub webhook handler', () => {
  describe('Signature verification', () => {
    test('should return 401 when X-Hub-Signature-256 header is missing', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');
      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes({} as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(createInstallationPayload('created'));

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
        },
        body: payload,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    test('should return 401 when signature is invalid', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');
      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes({} as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(createInstallationPayload('created'));

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': 'sha256=invalid-signature',
        },
        body: payload,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    test('should accept request with valid signature', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      // Create a mock db with required methods
      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => undefined,
            }),
          }),
        }),
        insertInto: () => ({
          values: () => ({
            execute: async () => {},
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(createInstallationPayload('created'));
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });
  });

  describe('installation events', () => {
    test('should create installation record on installation.created', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      let createdInstallation: any = null;

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => undefined,
            }),
          }),
        }),
        insertInto: () => ({
          values: (data: any) => ({
            execute: async () => {
              createdInstallation = data;
            },
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(
        createInstallationPayload('created', {
          installationId: 99999,
          accountLogin: 'my-org',
          accountType: 'Organization',
        })
      );
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(createdInstallation).not.toBeNull();
      expect(createdInstallation.installation_id).toBe(99999);
      expect(createdInstallation.account_login).toBe('my-org');
      expect(createdInstallation.account_type).toBe('Organization');
    });

    test('should delete installation record on installation.deleted', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      let deletedInstallationId: number | null = null;

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'inst-123',
                installation_id: 99999,
              }),
            }),
          }),
        }),
        deleteFrom: () => ({
          where: (_: string, __: string, id: number) => ({
            execute: async () => {
              deletedInstallationId = id;
              return [{ numDeletedRows: 1n }];
            },
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(
        createInstallationPayload('deleted', {
          installationId: 99999,
        })
      );
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(deletedInstallationId).toBe(99999);
    });

    test('should mark installation as suspended on installation.suspend', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      let suspendedAt: string | null = null;

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'inst-123',
                installation_id: 99999,
              }),
            }),
          }),
        }),
        updateTable: () => ({
          set: (data: { suspended_at: string }) => ({
            where: () => ({
              execute: async () => {
                suspendedAt = data.suspended_at;
                return [{ numUpdatedRows: 1n }];
              },
            }),
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(
        createInstallationPayload('suspend', {
          installationId: 99999,
        })
      );
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(suspendedAt).not.toBeNull();
    });

    test('should clear suspended status on installation.unsuspend', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      let clearedSuspension = false;

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'inst-123',
                installation_id: 99999,
                suspended_at: '2024-01-01T00:00:00Z',
              }),
            }),
          }),
        }),
        updateTable: () => ({
          set: (data: { suspended_at: null }) => ({
            where: () => ({
              execute: async () => {
                clearedSuspension = data.suspended_at === null;
                return [{ numUpdatedRows: 1n }];
              },
            }),
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify(
        createInstallationPayload('unsuspend', {
          installationId: 99999,
        })
      );
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(clearedSuspension).toBe(true);
    });
  });

  describe('installation_repositories events', () => {
    test('should handle repositories added event', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'inst-123',
                installation_id: 99999,
              }),
            }),
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify({
        action: 'added',
        installation: { id: 99999 },
        repositories_added: [
          { id: 123, name: 'new-repo', full_name: 'my-org/new-repo' },
        ],
        repositories_removed: [],
      });
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation_repositories',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });

    test('should handle repositories removed event', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      const mockDb = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'inst-123',
                installation_id: 99999,
              }),
            }),
          }),
        }),
      };

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify({
        action: 'removed',
        installation: { id: 99999 },
        repositories_added: [],
        repositories_removed: [
          { id: 123, name: 'old-repo', full_name: 'my-org/old-repo' },
        ],
      });
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation_repositories',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });
  });

  describe('Unknown events', () => {
    test('should return 200 and acknowledge unknown event types', async () => {
      const { createWebhookRoutes } = await import('../../../src/routes/webhooks.ts');

      const mockDb = {};

      const app = new Hono();
      app.route('/webhooks', createWebhookRoutes(mockDb as any, WEBHOOK_SECRET));

      const payload = JSON.stringify({ action: 'some_action', data: {} });
      const signature = createSignature(payload, WEBHOOK_SECRET);

      const res = await app.request('/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'unknown_event',
          'X-GitHub-Delivery': 'test-delivery-id',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });
  });
});
