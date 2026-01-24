# Fix K8s Sandbox Service Integration

## Problem
When running the orchestrator in Kubernetes, session creation fails with:
```
error: Was there a typo in the url or port?
  path: "http://localhost/containers/json?all=true",
  code: "FailedToOpenSocket"
```

The orchestrator's `SandboxService` is trying to connect to Docker at `localhost`, but there's no Docker daemon in the K8s pod.

## Root Cause
1. **`K8sSandboxService` exists but isn't wired up** - There's a K8s-native sandbox service at [k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts) with a factory function `createK8sSandboxService()` (line 527), but it's never called
2. **Sessions routes hard-code Docker-based service** - [sessions.ts:82](orchestrator/src/routes/sessions.ts#L82) directly instantiates `SandboxService` (Docker-based)
3. **Missing `MASTRAGEN_NAMESPACE` env var** - The K8s factory requires this but it's not set in the Helm deployment

## Key Differences Between Services

| Aspect | SandboxService (Docker) | K8sSandboxService (K8s) |
|--------|------------------------|-------------------------|
| Container creation | `docker.createContainer()` | `coreApi.createNamespacedPod()` |
| URL scheme | `http://localhost:PORT` | `https://hostname.ts.net:PORT` |
| Networking | Host port binding | Tailscale + Caddy sidecars |
| Claude config injection | ✅ Implemented | ❌ Missing |
| Git credentials passing | ✅ Full support | ⚠️ Partial (env vars in pod spec) |

## Solution

### 1. Add `MASTRAGEN_NAMESPACE` environment variable to Helm

**File:** [helm/mastragen/templates/orchestrator/deployment.yaml](helm/mastragen/templates/orchestrator/deployment.yaml)

Add to the env section (around line 45), using Kubernetes downward API:
```yaml
- name: MASTRAGEN_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
```

### 2. Integrate K8sSandboxService into SandboxService

**File:** [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts)

Modify `SandboxService` to delegate container operations to `K8sSandboxService` when running in K8s:

1. Import `createK8sSandboxService` and `K8sSandboxService` from `./k8s-sandbox.ts`
2. Add private member: `private k8sSandboxService: K8sSandboxService | null = null`
3. In constructor, initialize: `this.k8sSandboxService = createK8sSandboxService()`
4. Add helper method `isK8sMode()`: returns `this.k8sSandboxService !== null`

**Update `startContainers()`** (around line 986):
```typescript
if (this.k8sSandboxService) {
  // K8s mode: create PVC (if new session) and pod via K8sSandboxService
  // For resume, PVC already exists - createWorkspacePVC handles this gracefully
  await this.k8sSandboxService.createWorkspacePVC(session.id);
  await this.k8sSandboxService.createSandboxPod(session, project, envVars, claudeToken);
  await this.k8sSandboxService.waitForPodReady(session.id);

  // Inject Claude config (T048)
  if (this.claudeInjectionService) {
    await this.k8sSandboxService.injectClaudeConfig(
      session.id,
      this.claudeInjectionService,
      { projectId: project.id, environment: session.environment, userId }
    );
  }
  return;
}
// Existing Docker logic...
```

**Update `stopContainers()`** (around line 1095) - used for **suspend**:
```typescript
if (this.k8sSandboxService) {
  // Suspend: delete pod but KEEP PVC (preserves workspace for resume)
  await this.k8sSandboxService.deleteSandboxPod(session.id, { keepPVC: true });
  return;
}
// Existing Docker logic...
```

**Update `cleanupContainers()`** (around line 1113) - used for **full cleanup**:
```typescript
if (this.k8sSandboxService) {
  // Full cleanup: delete pod, ConfigMap, and optionally PVC
  await this.k8sSandboxService.deleteSandboxPod(sessionId, { keepPVC: !options.removeVolume });
  return;
}
// Existing Docker logic...
```

**Update `getServiceUrls()`** (around line 847):
```typescript
if (this.k8sSandboxService) {
  const k8sUrls = this.k8sSandboxService.getServiceUrls(sessionId);
  return { ...k8sUrls, astro: k8sUrls.astro };  // Normalize to ServiceUrls type
}
// Existing Docker logic...
```

### 3. Add PVC creation to K8sSandboxService

**File:** [orchestrator/src/services/k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts)

Add method to create workspace PVC before pod creation:

```typescript
/**
 * Create workspace PVC for a session.
 * Idempotent - does nothing if PVC already exists (for resume).
 * Must be called before createSandboxPod().
 */
async createWorkspacePVC(sessionId: string): Promise<void> {
  const pvcName = `workspace-${sessionId.slice(0, 12)}`;

  // Check if PVC already exists (resume case)
  try {
    await this.coreApi.readNamespacedPersistentVolumeClaim({
      name: pvcName,
      namespace: this.config.namespace,
    });
    console.log(`[K8sSandboxService] PVC ${pvcName} already exists (resume)`);
    return;
  } catch (error) {
    if (!isK8s404Error(error)) throw error;
    // PVC doesn't exist, create it
  }

  const pvc: k8s.V1PersistentVolumeClaim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: pvcName,
      namespace: this.config.namespace,
      labels: {
        'app.kubernetes.io/name': 'mastragen-sandbox',
        'mastragen.io/session-id': sessionId,
      },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '10Gi' } },
    },
  };

  await this.coreApi.createNamespacedPersistentVolumeClaim({
    namespace: this.config.namespace,
    body: pvc,
  });
}
```

Update `deleteSandboxPod()` signature to accept options:
```typescript
async deleteSandboxPod(sessionId: string, options?: { keepPVC?: boolean }): Promise<void> {
  // ... existing pod and ConfigMap deletion ...

  // Only delete PVC if keepPVC is false (default: keep for suspend/resume)
  if (!options?.keepPVC) {
    try {
      await this.coreApi.deleteNamespacedPersistentVolumeClaim({
        name: `workspace-${sessionId.slice(0, 12)}`,
        namespace: this.config.namespace,
      });
    } catch (error) {
      if (!isK8s404Error(error)) throw error;
    }
  }
}
```

**PVC Lifecycle Summary:**
- **Create**: `createWorkspacePVC()` called in `startContainers()` before pod creation
- **Suspend**: `deleteSandboxPod(id, { keepPVC: true })` - pod deleted, PVC kept
- **Resume**: Pod recreated, mounts existing PVC (no new PVC created)
- **Cleanup**: `deleteSandboxPod(id, { keepPVC: false })` - everything deleted

### 4. Add Claude config injection to K8sSandboxService

**File:** [orchestrator/src/services/k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts)

Add method to exec into vscode container and inject Claude config (similar to Docker approach):

```typescript
/**
 * Inject Claude configuration into the vscode container.
 * Uses kubectl exec equivalent via K8s API.
 */
async injectClaudeConfig(
  sessionId: string,
  claudeInjectionService: ClaudeInjectionService,
  config: { projectId: string; environment: string; userId?: string }
): Promise<void> {
  const podName = this.getPodName(sessionId);

  // Generate settings, CLAUDE.md, commands, skills
  const settings = await claudeInjectionService.generateSettings({ ... });
  const claudeMd = await claudeInjectionService.generateClaudeMd({ ... });
  const commands = await claudeInjectionService.getBuiltinCommands();
  const skills = await claudeInjectionService.getBuiltinSkills();

  // Use k8s exec to write files to container
  const exec = new k8s.Exec(this.kc);
  // ... write files using exec.exec() with 'cat > /path' commands
}
```

### 5. Update Docker health check

**File:** [orchestrator/src/services/health.ts](orchestrator/src/services/health.ts)

Skip Docker health check when running in K8s mode:

```typescript
// In checkDocker() method:
if (process.env.MASTRAGEN_NAMESPACE) {
  return { connected: true, message: 'K8s mode (Docker N/A)' };
}
// Existing Docker ping logic...
```

## Files to Modify

| File | Changes |
|------|---------|
| [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts) | Import K8sSandboxService, add k8sMode detection, delegate container ops, call K8s Claude injection |
| [orchestrator/src/services/k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts) | Add `createWorkspacePVC()`, `injectClaudeConfig()`, update `deleteSandboxPod()` to cleanup PVC |
| [orchestrator/src/services/health.ts](orchestrator/src/services/health.ts) | Skip Docker ping when MASTRAGEN_NAMESPACE is set |
| [helm/mastragen/templates/orchestrator/deployment.yaml](helm/mastragen/templates/orchestrator/deployment.yaml) | Add MASTRAGEN_NAMESPACE env var via downward API |

## Verification

1. **Run preflight checks**:
   ```bash
   bun run preflight:quick
   ```

2. **Rebuild and redeploy orchestrator**:
   ```bash
   docker build -t mastragen-orchestrator:local -f orchestrator/Dockerfile .
   minikube image load mastragen-orchestrator:local
   helm upgrade mastragen ./helm/mastragen \
     -f ./helm/mastragen/values/development.yaml \
     --namespace mastragen-test \
     --set image.pullPolicy=Never \
     --set image.orchestrator.tag=local
   ```

3. **Verify health endpoint shows K8s mode**:
   ```bash
   kubectl port-forward svc/mastragen-orchestrator 4000:4000 -n mastragen-test &
   mgen health
   # Should show: docker: K8s mode (Docker N/A)
   ```

4. **Test session creation**:
   ```bash
   mgen session create -p test-proj -n my-feature -e dev
   # Should succeed and create a sandbox pod
   ```

5. **Verify sandbox pod creation**:
   ```bash
   kubectl get pods -n mastragen-test
   # Should show sandbox-XXXXXX pod in Running state
   ```

6. **Verify Tailscale connectivity**:
   ```bash
   mgen tailscale devices --filter sandbox
   # Should show the new sandbox device
   ```
