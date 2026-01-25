import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

/**
 * Unit tests for K8sSandboxService Tailscale deregistration.
 *
 * Tests the deregisterTailscaleDevice method which removes sandbox devices
 * from the Tailscale tailnet during session cleanup.
 */
describe('K8sSandboxService Tailscale deregistration', () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    mock.restore();
    // Store original values
    originalEnv.TAILSCALE_API_KEY = process.env.TAILSCALE_API_KEY;
    originalEnv.TAILSCALE_TAILNET = process.env.TAILSCALE_TAILNET;
  });

  afterEach(() => {
    // Restore original values
    if (originalEnv.TAILSCALE_API_KEY !== undefined) {
      process.env.TAILSCALE_API_KEY = originalEnv.TAILSCALE_API_KEY;
    } else {
      delete process.env.TAILSCALE_API_KEY;
    }
    if (originalEnv.TAILSCALE_TAILNET !== undefined) {
      process.env.TAILSCALE_TAILNET = originalEnv.TAILSCALE_TAILNET;
    } else {
      delete process.env.TAILSCALE_TAILNET;
    }
  });

  const mockConfig = {
    namespace: 'mastragen',
    tailnet: 'test-tailnet',
    environment: 'test',
    tailscaleSecretName: 'tailscale-auth',
    tailscaleSecretKey: 'key',
    imageRegistry: 'ghcr.io/test',
    imageTag: 'latest',
    imagePullPolicy: 'Always',
    chromeEnabled: false,
  };

  test('deregisterTailscaleDevice deletes device when found', async () => {
    // Set up env vars for TailscaleService
    process.env.TAILSCALE_API_KEY = 'test-api-key';
    process.env.TAILSCALE_TAILNET = 'test-tailnet';

    // Track API calls
    const apiCalls: { url: string; method: string }[] = [];

    // Mock fetch for Tailscale API
    const mockFetch = mock((url: string, options?: RequestInit) => {
      apiCalls.push({ url, method: options?.method || 'GET' });

      // List devices endpoint
      if (url.includes('/devices') && !url.includes('/device/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              devices: [
                {
                  id: 'device-123',
                  name: 'abc12345-mastragen-test.test-tailnet.ts.net',
                  hostname: 'abc12345-mastragen-test',
                  tags: [],
                  addresses: ['100.100.100.1'],
                  user: 'test@example.com',
                  authorized: true,
                },
              ],
            }),
        });
      }

      // Delete device endpoint
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    // Mock k8s client
    const mockKc = {
      loadFromCluster: mock(() => {
        throw new Error('Not in cluster');
      }),
      loadFromDefault: mock(() => {}),
      makeApiClient: mock(() => ({})),
    };

    mock.module('@kubernetes/client-node', () => ({
      KubeConfig: function () {
        return mockKc;
      },
      CoreV1Api: class {},
      HttpError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    }));

    // Replace global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService(mockConfig);
      const sessionId = 'abc12345-1234-1234-1234-123456789012';

      const result = await service.deregisterTailscaleDevice(sessionId);

      expect(result).toBe(true);
      // Should have called list devices and delete device
      expect(apiCalls.some((c) => c.url.includes('/devices'))).toBe(true);
      expect(apiCalls.some((c) => c.method === 'DELETE' && c.url.includes('device-123'))).toBe(
        true
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('deregisterTailscaleDevice returns true when device not found', async () => {
    process.env.TAILSCALE_API_KEY = 'test-api-key';
    process.env.TAILSCALE_TAILNET = 'test-tailnet';

    const deleteCallCount = { count: 0 };

    const mockFetch = mock((url: string, options?: RequestInit) => {
      // List devices endpoint - return empty
      if (url.includes('/devices') && !url.includes('/device/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devices: [] }),
        });
      }

      // Track delete calls (should not happen)
      if (options?.method === 'DELETE') {
        deleteCallCount.count++;
        return Promise.resolve({ ok: true });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const mockKc = {
      loadFromCluster: mock(() => {
        throw new Error('Not in cluster');
      }),
      loadFromDefault: mock(() => {}),
      makeApiClient: mock(() => ({})),
    };

    mock.module('@kubernetes/client-node', () => ({
      KubeConfig: function () {
        return mockKc;
      },
      CoreV1Api: class {},
      HttpError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService(mockConfig);
      const result = await service.deregisterTailscaleDevice('nonexistent-session');

      expect(result).toBe(true);
      expect(deleteCallCount.count).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('deregisterTailscaleDevice skips when Tailscale not configured', async () => {
    // Clear env vars so TailscaleService is not configured
    delete process.env.TAILSCALE_API_KEY;
    delete process.env.TAILSCALE_TAILNET;

    const apiCallCount = { count: 0 };

    const mockFetch = mock(() => {
      apiCallCount.count++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ devices: [] }) });
    });

    const mockKc = {
      loadFromCluster: mock(() => {
        throw new Error('Not in cluster');
      }),
      loadFromDefault: mock(() => {}),
      makeApiClient: mock(() => ({})),
    };

    mock.module('@kubernetes/client-node', () => ({
      KubeConfig: function () {
        return mockKc;
      },
      CoreV1Api: class {},
      HttpError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    }));

    // Mock getTailscaleService to return an unconfigured service
    mock.module('../../../src/services/tailscale.ts', () => ({
      getTailscaleService: () => ({
        isConfigured: () => false,
        findDevice: mock(() => Promise.resolve(undefined)),
        deleteDevice: mock(() => Promise.resolve(true)),
      }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService(mockConfig);
      const result = await service.deregisterTailscaleDevice('any-session');

      expect(result).toBe(true);
      expect(apiCallCount.count).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('deregisterTailscaleDevice returns false on API error', async () => {
    process.env.TAILSCALE_API_KEY = 'test-api-key';
    process.env.TAILSCALE_TAILNET = 'test-tailnet';

    const mockKc = {
      loadFromCluster: mock(() => {
        throw new Error('Not in cluster');
      }),
      loadFromDefault: mock(() => {}),
      makeApiClient: mock(() => ({})),
    };

    mock.module('@kubernetes/client-node', () => ({
      KubeConfig: function () {
        return mockKc;
      },
      CoreV1Api: class {},
      HttpError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    }));

    // Mock TailscaleService to return device but fail on delete
    mock.module('../../../src/services/tailscale.ts', () => ({
      getTailscaleService: () => ({
        isConfigured: () => true,
        findDevice: mock(() =>
          Promise.resolve({
            id: 'device-456',
            name: 'abc12345-mastragen-test.test-tailnet.ts.net',
            hostname: 'abc12345-mastragen-test',
            tags: [],
            addresses: ['100.100.100.1'],
            user: 'test@example.com',
            authorized: true,
          })
        ),
        deleteDevice: mock(() => Promise.resolve(false)), // Fail to delete
      }),
    }));

    const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

    const service = new K8sSandboxService(mockConfig);
    const sessionId = 'abc12345-1234-1234-1234-123456789012';

    const result = await service.deregisterTailscaleDevice(sessionId);

    expect(result).toBe(false);
  });

  test('deregisterTailscaleDevice returns true on network error (graceful degradation)', async () => {
    // Network errors in listDevices() are caught and return [], which means
    // findDevice() returns undefined, treated as "device already gone".
    // This is correct for cleanup - we don't want to block pod deletion
    // just because we couldn't contact Tailscale.
    process.env.TAILSCALE_API_KEY = 'test-api-key';
    process.env.TAILSCALE_TAILNET = 'test-tailnet';

    const mockKc = {
      loadFromCluster: mock(() => {
        throw new Error('Not in cluster');
      }),
      loadFromDefault: mock(() => {}),
      makeApiClient: mock(() => ({})),
    };

    mock.module('@kubernetes/client-node', () => ({
      KubeConfig: function () {
        return mockKc;
      },
      CoreV1Api: class {},
      HttpError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    }));

    // Mock TailscaleService where findDevice returns undefined (simulating network error → empty list)
    mock.module('../../../src/services/tailscale.ts', () => ({
      getTailscaleService: () => ({
        isConfigured: () => true,
        findDevice: mock(() => Promise.resolve(undefined)), // Device not found (network error returned empty list)
        deleteDevice: mock(() => Promise.resolve(true)),
      }),
    }));

    const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

    const service = new K8sSandboxService(mockConfig);
    const result = await service.deregisterTailscaleDevice('any-session');

    // Returns true because device not found (network error → empty list → undefined)
    expect(result).toBe(true);
  });
});
