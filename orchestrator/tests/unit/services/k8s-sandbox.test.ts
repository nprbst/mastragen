import { beforeEach, describe, expect, mock, test } from 'bun:test';

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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: true,
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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: true,
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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: true,
      });

      // Access private methods via any type for testing
      const podName = (service as any).getPodName('abc123def456');
      const configMapName = (service as any).getConfigMapName('abc123def456');

      expect(podName).toBe('sandbox-abc123def456');
      expect(configMapName).toBe('sandbox-caddy-abc123def456');
    });
  });

  describe('Phoenix integration (T025-T026)', () => {
    test('should return null Phoenix URL when Phoenix not enabled', async () => {
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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: false,
      });

      const urls = service.getServiceUrls('abc123def456');
      expect(urls.phoenix).toBeNull();
    });

    test('should return Phoenix URL when Phoenix is enabled via cache', async () => {
      const mockCoreApi = {
        createNamespacedConfigMap: mock(() => Promise.resolve()),
        createNamespacedPod: mock(() => Promise.resolve()),
        createNamespacedPersistentVolumeClaim: mock(() => Promise.resolve()),
        readNamespacedPersistentVolumeClaim: mock(() => Promise.reject({ code: 404 })),
      };

      const mockKc = {
        loadFromCluster: mock(() => {
          throw new Error('Not in cluster');
        }),
        loadFromDefault: mock(() => {}),
        makeApiClient: mock(() => mockCoreApi),
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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: false,
      });

      const session = {
        id: 'session-phoenix-test',
        project_id: 'proj-1',
        artifact_name: 'test',
        environment: 'dev',
        state: 'active' as const,
        container_id: null,
        workspace_volume: null,
        user_id: null,
        branch_name: null,
        last_commit_sha: null,
        commit_count: 0,
        pr_number: null,
        pr_url: null,
        last_activity_at: null,
        suspension_reason: null,
        chrome_mode: null,
        user_tailscale_hostname: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const project = {
        id: 'proj-1',
        name: 'test-project',
        github_repo: 'org/repo',
        default_branch: 'main',
        branch_prefix: 'feature/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Create pod with Phoenix enabled (6th arg after claudeConfigMapName)
      await service.createSandboxPod(session, project, {}, undefined, undefined, {
        enabled: true,
        retentionDays: 30,
      });

      const urls = service.getServiceUrls('session-phoenix-test');
      expect(urls.phoenix).toBe('https://session--mastragen-dev.example.ts.net:6006');
    });

    test('should clear Phoenix cache when pod is deleted', async () => {
      const mockCoreApi = {
        createNamespacedConfigMap: mock(() => Promise.resolve()),
        createNamespacedPod: mock(() => Promise.resolve()),
        createNamespacedPersistentVolumeClaim: mock(() => Promise.resolve()),
        readNamespacedPersistentVolumeClaim: mock(() => Promise.reject({ code: 404 })),
        deleteNamespacedPod: mock(() => Promise.resolve()),
        deleteNamespacedConfigMap: mock(() => Promise.resolve()),
        deleteNamespacedPersistentVolumeClaim: mock(() => Promise.resolve()),
      };

      const mockKc = {
        loadFromCluster: mock(() => {
          throw new Error('Not in cluster');
        }),
        loadFromDefault: mock(() => {}),
        makeApiClient: mock(() => mockCoreApi),
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

      const { K8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = new K8sSandboxService({
        namespace: 'mastragen',
        tailnet: 'example',
        environment: 'dev',
        tailscaleSecretName: 'tailscale-auth',
        tailscaleSecretKey: 'key',
        imageRegistry: 'ghcr.io/test',
        imageTag: 'latest',
        imagePullPolicy: 'IfNotPresent',
        chromeEnabled: false,
      });

      const session = {
        id: 'session-delete-test',
        project_id: 'proj-1',
        artifact_name: 'test',
        environment: 'dev',
        state: 'active' as const,
        container_id: null,
        workspace_volume: null,
        user_id: null,
        branch_name: null,
        last_commit_sha: null,
        commit_count: 0,
        pr_number: null,
        pr_url: null,
        last_activity_at: null,
        suspension_reason: null,
        chrome_mode: null,
        user_tailscale_hostname: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const project = {
        id: 'proj-1',
        name: 'test-project',
        github_repo: 'org/repo',
        default_branch: 'main',
        branch_prefix: 'feature/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Create pod with Phoenix enabled (6th arg after claudeConfigMapName)
      await service.createSandboxPod(session, project, {}, undefined, undefined, {
        enabled: true,
      });

      // Verify Phoenix URL is available
      let urls = service.getServiceUrls('session-delete-test');
      expect(urls.phoenix).not.toBeNull();

      // Delete the pod
      await service.deleteSandboxPod('session-delete-test');

      // Verify Phoenix URL is null after deletion
      urls = service.getServiceUrls('session-delete-test');
      expect(urls.phoenix).toBeNull();
    });
  });

  describe('createK8sSandboxService factory', () => {
    test('should return null when missing required env vars', async () => {
      // Temporarily clear env vars
      const originalNamespace = process.env.MASTRAGEN_NAMESPACE;
      const originalTailnet = process.env.TAILSCALE_TAILNET;
      process.env.MASTRAGEN_NAMESPACE = undefined;
      process.env.TAILSCALE_TAILNET = undefined;

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

      const { createK8sSandboxService } = await import('../../../src/services/k8s-sandbox.ts');

      const service = createK8sSandboxService();
      expect(service).toBeNull();

      // Restore env vars
      if (originalNamespace) process.env.MASTRAGEN_NAMESPACE = originalNamespace;
      if (originalTailnet) process.env.TAILSCALE_TAILNET = originalTailnet;
    });
  });
});
