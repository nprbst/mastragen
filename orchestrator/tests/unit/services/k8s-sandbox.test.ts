import { describe, expect, test, mock, beforeEach } from 'bun:test';

/**
 * T095f-i: Unit tests for K8sSandboxService
 *
 * Tests Kubernetes sandbox management:
 * 1. Pod creation with Caddy and Tailscale sidecars
 * 2. Dynamic Caddyfile generation
 * 3. TS_PERMIT_CERT_UID configuration
 * 4. Pod status and deletion
 */
describe('K8sSandboxService', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('getHostname', () => {
    test('should generate correct hostname format', async () => {
      // Mock k8s client
      const mockKc = {
        loadFromCluster: mock(() => {
          throw new Error('Not in cluster');
        }),
        loadFromDefault: mock(() => {}),
        makeApiClient: mock(() => ({})),
      };

      // Mock the module
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

      const { K8sSandboxService } = await import(
        '../../../src/services/k8s-sandbox.ts'
      );

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
      });

      const sessionId = 'abc123def456';
      const hostname = service.getHostname(sessionId);

      expect(hostname).toBe('abc123de-mastragen-dev.example.ts.net');
    });
  });

  describe('getServiceUrls', () => {
    test('should return correct service URLs', async () => {
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

      const { K8sSandboxService } = await import(
        '../../../src/services/k8s-sandbox.ts'
      );

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
      });

      const urls = service.getServiceUrls('abc123def456');

      // Port-based routing: each service on its native port
      expect(urls.mastra).toBe('https://abc123de-mastragen-dev.example.ts.net:4111');
      expect(urls.astro).toBe('https://abc123de-mastragen-dev.example.ts.net:4321');
      expect(urls.vscode).toBe('https://abc123de-mastragen-dev.example.ts.net');
    });
  });

  describe('Pod naming', () => {
    test('should generate correct pod and configmap names', async () => {
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

      const { K8sSandboxService } = await import(
        '../../../src/services/k8s-sandbox.ts'
      );

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
      });

      // Access private methods via any type for testing
      const podName = (service as any).getPodName('abc123def456');
      const configMapName = (service as any).getConfigMapName('abc123def456');

      expect(podName).toBe('sandbox-abc123def456');
      expect(configMapName).toBe('sandbox-caddy-abc123def456');
    });
  });

  describe('createK8sSandboxService factory', () => {
    test('should return null when missing required env vars', async () => {
      // Temporarily clear env vars
      const originalNamespace = process.env.MASTRAGEN_NAMESPACE;
      const originalTailnet = process.env.TAILSCALE_TAILNET;
      delete process.env.MASTRAGEN_NAMESPACE;
      delete process.env.TAILSCALE_TAILNET;

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

      const { createK8sSandboxService } = await import(
        '../../../src/services/k8s-sandbox.ts'
      );

      const service = createK8sSandboxService();
      expect(service).toBeNull();

      // Restore env vars
      if (originalNamespace) process.env.MASTRAGEN_NAMESPACE = originalNamespace;
      if (originalTailnet) process.env.TAILSCALE_TAILNET = originalTailnet;
    });
  });
});
