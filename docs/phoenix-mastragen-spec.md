# Technical Feature Spec: Phoenix Observability for Mastragen

**Version:** 1.1  
**Status:** Draft  
**Author:** Nathan / Claude  
**Date:** January 24, 2026  

---

## 1. Overview

### 1.1 Problem Statement

Mastragen provides Product Design with an independent AI experimentation environment, but currently lacks integrated observability and prompt management capabilities. Without these, experiments are difficult to debug, compare, and hand off to engineering with confidence.

Additionally, before production data exists, teams need ways to generate realistic test cases that cover edge cases and stress scenarios. After running experiments, teams need systematic methods to analyze failures and prioritize improvements.

### 1.2 Proposed Solution

Add **Arize Phoenix** as an optional system component to Mastragen, providing:

- **Trace visibility** into Mastra agents, workflows, and tools
- **Prompt management** with version control and tagging
- **Datasets & Experiments** for systematic testing and comparison
- **Synthetic data generation** using personas and Mastra artifact understanding
- **Error analysis workflow** (open coding → axial coding → prioritization)
- **Handoff artifacts** exportable for engineering review

Phoenix will be self-hosted with SQLite persistence, deployable in both local Docker Compose and Kubernetes environments.

### 1.3 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Optional by default** | Not all experiments need observability; avoid complexity tax |
| **Zero external dependencies** | SQLite backend, no cloud services required |
| **Minimal configuration** | Works out-of-box when enabled |
| **Data locality** | Traces and prompts stay within Mastragen's boundary |

---

## 2. Architecture

### 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Mastragen Cluster                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│  │   VSCode    │     │   Mastra    │     │      Phoenix            │   │
│  │ Claude Code │     │   Server    │────▶│   (optional)            │   │
│  │             │     │             │     │                         │   │
│  │             │◀───▶│  :4111      │     │  :6006 - UI & API       │   │
│  └─────────────┘     └──────┬──────┘     │  :4317 - OTLP gRPC      │   │
│                             │            │                         │   │
│                             ▼            │  SQLite: /data/phoenix  │   │
│                      ┌─────────────┐     └─────────────────────────┘   │
│                      │    Astro    │                                    │
│                      │  (optional) │                                    │
│                      │    :4321    │                                    │
│                      └─────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                             (Tailscale)
                                    │
                              ┌─────┴─────┐
                              │  Browser  │
                              └───────────┘
```

### 2.2 Component Responsibilities

| Component | Role |
|-----------|------|
| **Phoenix Server** | Receives traces via OTLP, serves UI, manages prompts/datasets |
| **Mastra Server** | Sends telemetry when Phoenix is enabled |
| **SQLite Volume** | Persists traces, prompts, datasets, experiments |
| **Phoenix Client** | TypeScript SDK used in Mastra agents for prompt retrieval |
| **Experiment Runner** | Orchestrates experiment execution, calls Mastra HTTP API |
| **Synthetic Generator** | Uses Claude Opus + personas to generate test datasets |
| **Error Analyzer** | Performs open/axial coding on experiment failures |

### 2.3 Data Flow

```
Mastra Agent Execution
         │
         ▼
┌─────────────────────┐
│  @mastra/arize      │  Telemetry export configured
│  ArizeExporter      │  when PHOENIX_ENABLED=true
└─────────┬───────────┘
          │ OTLP/HTTP
          ▼
┌─────────────────────┐
│  Phoenix Collector  │  :6006/v1/traces
│  (ingest endpoint)  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  SQLite Database    │  /data/phoenix/phoenix.db
│  - traces           │
│  - spans            │
│  - prompts          │
│  - datasets         │
│  - experiments      │
└─────────────────────┘
```

---

## 3. Configuration

### 3.1 Environment Variables

Phoenix enablement is controlled via environment variables in the target repository's Mastragen configuration.

#### Repository-Level Config (`.mastragen/config.yaml`)

```yaml
# .mastragen/config.yaml
components:
  phoenix:
    enabled: true
    persistence:
      type: sqlite           # Only sqlite supported initially
      path: /data/phoenix    # Volume mount point
    retention:
      traces_days: 30        # Auto-cleanup older traces
      experiments_days: 90   # Keep experiment data longer
```

#### Environment Variables (injected into Mastra container)

| Variable | Default | Description |
|----------|---------|-------------|
| `PHOENIX_ENABLED` | `false` | Master switch for Phoenix integration |
| `PHOENIX_ENDPOINT` | `http://phoenix:6006/v1/traces` | Trace collector endpoint |
| `PHOENIX_API_KEY` | _(empty)_ | Optional; for authenticated setups |
| `PHOENIX_PROJECT_NAME` | `mastragen-experiments` | Project name in Phoenix UI |

#### Environment Variables (for Experiment Runner)

| Variable | Default | Description |
|----------|---------|-------------|
| `MASTRA_URL` | `http://mastra:4111` | Mastra server HTTP endpoint |
| `ANTHROPIC_API_KEY` | _(required)_ | API key for synthetic data generation (Claude Opus) |
| `SYNTHETIC_MODEL` | `claude-opus-4-20250514` | Model for synthetic data generation |
| `ANALYSIS_MODEL` | `claude-sonnet-4-20250514` | Model for error analysis (open/axial coding) |

### 3.2 Feature Detection

Mastragen's orchestrator reads `.mastragen/config.yaml` at startup and conditionally:

1. Starts the Phoenix container (Docker Compose) or deployment (K8s)
2. Injects `PHOENIX_*` environment variables into Mastra container
3. Mounts shared volume for SQLite persistence

---

## 4. Docker Compose (Local Development)

### 4.1 Base Configuration

```yaml
# docker-compose.yml (excerpt)

services:
  mastra:
    image: mastragen/mastra:latest
    ports:
      - "4111:4111"
    environment:
      - PHOENIX_ENABLED=${PHOENIX_ENABLED:-false}
      - PHOENIX_ENDPOINT=${PHOENIX_ENDPOINT:-http://phoenix:6006/v1/traces}
      - PHOENIX_PROJECT_NAME=${PHOENIX_PROJECT_NAME:-mastragen-experiments}
    depends_on:
      phoenix:
        condition: service_healthy
        required: false  # Only wait if Phoenix is enabled
    volumes:
      - ./workspace:/workspace
      - mastra-data:/data

  # ... vscode, astro services ...
```

### 4.2 Phoenix Service (Conditional)

```yaml
# docker-compose.phoenix.yml (override file)

services:
  phoenix:
    image: arizephoenix/phoenix:latest
    profiles:
      - phoenix  # Only starts with --profile phoenix
    ports:
      - "6006:6006"
    environment:
      - PHOENIX_SQL_DATABASE_URL=sqlite:////data/phoenix/phoenix.db
      - PHOENIX_WORKING_DIR=/data/phoenix
    volumes:
      - phoenix-data:/data/phoenix
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6006/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  phoenix-data:
    driver: local
```

### 4.3 Startup Commands

```bash
# Without Phoenix (default)
docker compose up -d

# With Phoenix enabled
docker compose --profile phoenix up -d

# Or via environment
PHOENIX_ENABLED=true docker compose --profile phoenix up -d
```

### 4.4 Mastragen CLI Integration

```bash
# mastragen start --phoenix
# Equivalent to setting PHOENIX_ENABLED=true and using --profile phoenix

mastragen start --phoenix

# Check status
mastragen status
# Output:
# ┌─────────────┬─────────┬──────────────────────┐
# │ Service     │ Status  │ URL                  │
# ├─────────────┼─────────┼──────────────────────┤
# │ vscode      │ running │ http://localhost:... │
# │ mastra      │ running │ http://localhost:4111│
# │ phoenix     │ running │ http://localhost:6006│
# │ astro       │ stopped │ -                    │
# └─────────────┴─────────┴──────────────────────┘
```

---

## 5. Kubernetes Deployment

### 5.1 Namespace Layout

```
mastragen-<workspace-id>/
├── deployment/vscode
├── deployment/mastra
├── deployment/phoenix      # Conditional
├── service/vscode
├── service/mastra
├── service/phoenix         # Conditional
├── pvc/workspace
├── pvc/mastra-data
├── pvc/phoenix-data        # Conditional
└── configmap/mastragen-config
```

### 5.2 Phoenix Deployment

```yaml
# phoenix-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phoenix
  namespace: mastragen-{{ .Values.workspaceId }}
  labels:
    app: phoenix
    component: observability
spec:
  replicas: 1
  selector:
    matchLabels:
      app: phoenix
  template:
    metadata:
      labels:
        app: phoenix
    spec:
      containers:
      - name: phoenix
        image: arizephoenix/phoenix:{{ .Values.phoenix.version | default "latest" }}
        ports:
        - containerPort: 6006
          name: http
        - containerPort: 4317
          name: otlp-grpc
        env:
        - name: PHOENIX_SQL_DATABASE_URL
          value: "sqlite:////data/phoenix/phoenix.db"
        - name: PHOENIX_WORKING_DIR
          value: "/data/phoenix"
        - name: PHOENIX_ENABLE_AUTH
          value: "{{ .Values.phoenix.auth.enabled | default false }}"
        volumeMounts:
        - name: phoenix-data
          mountPath: /data/phoenix
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 6006
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 6006
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: phoenix-data
        persistentVolumeClaim:
          claimName: phoenix-data
```

### 5.3 Phoenix Service

```yaml
# phoenix-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: phoenix
  namespace: mastragen-{{ .Values.workspaceId }}
spec:
  selector:
    app: phoenix
  ports:
  - name: http
    port: 6006
    targetPort: 6006
  - name: otlp-grpc
    port: 4317
    targetPort: 4317
  type: ClusterIP
```

### 5.4 Persistent Volume Claim

```yaml
# phoenix-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: phoenix-data
  namespace: mastragen-{{ .Values.workspaceId }}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: {{ .Values.phoenix.storage | default "10Gi" }}
  storageClassName: {{ .Values.storageClass | default "standard" }}
```

### 5.5 Helm Values Integration

```yaml
# values.yaml (excerpt)
phoenix:
  enabled: false  # Opt-in
  version: "latest"
  storage: "10Gi"
  auth:
    enabled: false
    apiKey: ""  # Set via secret if needed
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
```

### 5.6 Conditional Rendering

In Helm templates, Phoenix resources are only rendered when enabled:

```yaml
# templates/phoenix-deployment.yaml
{{- if .Values.phoenix.enabled }}
apiVersion: apps/v1
kind: Deployment
# ... rest of deployment
{{- end }}
```

### 5.7 Tailscale Access

Phoenix UI is exposed via the existing Tailscale ingress pattern:

```yaml
# ingress.yaml (excerpt)
{{- if .Values.phoenix.enabled }}
- host: phoenix-{{ .Values.workspaceId }}.{{ .Values.tailscaleDomain }}
  http:
    paths:
    - path: /
      pathType: Prefix
      backend:
        service:
          name: phoenix
          port:
            number: 6006
{{- end }}
```

---

## 6. Mastra Integration

### 6.1 Conditional Telemetry Configuration

The Mastra server's configuration adapts based on `PHOENIX_ENABLED`:

```typescript
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { ArizeExporter } from "@mastra/arize";

const observabilityConfig = process.env.PHOENIX_ENABLED === "true"
  ? {
      configs: {
        arize: {
          serviceName: process.env.PHOENIX_PROJECT_NAME || "mastragen-experiments",
          exporter: new ArizeExporter({
            endpoint: process.env.PHOENIX_ENDPOINT,
            apiKey: process.env.PHOENIX_API_KEY || undefined,
          }),
        },
      },
    }
  : undefined;

export const mastra = new Mastra({
  agents: { /* ... */ },
  workflows: { /* ... */ },
  tools: { /* ... */ },
  observability: observabilityConfig,
});
```

### 6.2 Prompt Retrieval Pattern

When using Phoenix for prompt management:

```typescript
// src/agents/care-coordinator.ts
import { Agent } from "@mastra/core/agent";
import { getPrompt, toSDK } from "@arizeai/phoenix-client/prompts";

// Fetch prompt at agent initialization (or per-request for hot-reload)
const fetchSystemPrompt = async () => {
  if (process.env.PHOENIX_ENABLED !== "true") {
    // Fallback to local prompt file
    return fs.readFileSync("./prompts/care-coordinator.md", "utf-8");
  }
  
  const prompt = await getPrompt({
    name: "care-coordinator-system",
    tag: process.env.PROMPT_TAG || "experiment", // experiment | staging | production
  });
  
  return prompt.template_messages[0].content;
};

export const careCoordinatorAgent = new Agent({
  name: "care-coordinator",
  instructions: await fetchSystemPrompt(),
  model: "anthropic/claude-sonnet-4-20250514",
  tools: { /* ... */ },
});
```

### 6.3 Experiment Runner Utility

A helper script for running experiments from Mastragen:

```typescript
// scripts/run-experiment.ts
import { createDataset } from "@arizeai/phoenix-client/datasets";
import { runExperiment, asEvaluator } from "@arizeai/phoenix-client/experiments";
import { mastra } from "../src/mastra";

async function main() {
  const datasetName = process.argv[2] || "default-test-cases";
  const workflowName = process.argv[3] || "care-intake-workflow";

  const workflow = mastra.getWorkflow(workflowName);

  const experiment = await runExperiment({
    dataset: datasetName,
    task: async (example) => {
      const result = await workflow.execute({
        triggerData: example.input,
      });
      return result.results;
    },
    evaluators: [
      asEvaluator({
        name: "workflow-success",
        kind: "CODE",
        evaluate: async ({ output }) => ({
          score: output?.success ? 1 : 0,
          label: output?.success ? "success" : "failure",
        }),
      }),
    ],
    experimentMetadata: {
      workflowName,
      timestamp: new Date().toISOString(),
      commitSha: process.env.GIT_COMMIT_SHA,
    },
  });

  console.log(`Experiment completed: ${experiment.id}`);
  console.log(`View results: ${process.env.PHOENIX_ENDPOINT?.replace('/v1/traces', '')}/experiments/${experiment.id}`);
}

main().catch(console.error);
```

---

## 7. Data Management

### 7.1 SQLite Schema (Managed by Phoenix)

Phoenix manages its own schema. Key tables include:

| Table | Purpose |
|-------|---------|
| `projects` | Logical groupings of traces |
| `traces` | Root trace records |
| `spans` | Individual spans within traces |
| `prompts` | Prompt templates with versions |
| `prompt_versions` | Versioned prompt content |
| `datasets` | Test case collections |
| `dataset_examples` | Individual examples |
| `experiments` | Experiment metadata |
| `experiment_runs` | Per-example run results |

### 7.2 Backup Strategy

```yaml
# K8s CronJob for SQLite backup
apiVersion: batch/v1
kind: CronJob
metadata:
  name: phoenix-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: alpine:latest
            command:
            - /bin/sh
            - -c
            - |
              sqlite3 /data/phoenix/phoenix.db ".backup /backup/phoenix-$(date +%Y%m%d).db"
              # Keep last 7 backups
              ls -t /backup/*.db | tail -n +8 | xargs rm -f
            volumeMounts:
            - name: phoenix-data
              mountPath: /data/phoenix
              readOnly: true
            - name: backup-volume
              mountPath: /backup
          restartPolicy: OnFailure
          volumes:
          - name: phoenix-data
            persistentVolumeClaim:
              claimName: phoenix-data
          - name: backup-volume
            persistentVolumeClaim:
              claimName: phoenix-backup
```

### 7.3 Data Retention

Phoenix supports automatic cleanup via environment variables:

```yaml
env:
- name: PHOENIX_TRACE_RETENTION_DAYS
  value: "30"
- name: PHOENIX_DATASET_RETENTION_DAYS
  value: "90"
```

For fine-grained control, a cleanup job can be added:

```bash
# Cleanup script (runs via cron or K8s CronJob)
sqlite3 /data/phoenix/phoenix.db <<EOF
DELETE FROM spans WHERE created_at < datetime('now', '-30 days');
DELETE FROM traces WHERE created_at < datetime('now', '-30 days');
VACUUM;
EOF
```

---

## 8. Experiment Runner

### 8.1 Architecture Overview

The experiment runner enables Claude to programmatically execute experiments against Mastra agents and workflows, posting results to Phoenix. It lives in the **VSCode + Claude container** for locality with Claude's workspace.

#### Why VSCode + Claude Container?

| Container | Pros | Cons |
|-----------|------|------|
| **VSCode + Claude** ✓ | Claude's home base, direct file access, can iterate on runner code | Calls Mastra server over network |
| Mastra Server | Direct Mastra runtime access | Claude would need to SSH/exec in, less natural |
| New container | Clean separation | Overkill, another moving part |

#### The Telemetry Constraint

**Critical:** Mastra telemetry only works when running via `mastra dev` — you can't just `bun run agent.ts` and get traces. The experiment runner must **call the Mastra server's HTTP API**, not import Mastra code directly. This ensures all task executions generate proper traces in Phoenix.

```
┌─────────────────────────────────────────────────────────────────┐
│  VSCode + Claude Container                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Experiment Runner (Bun)                                 │   │
│  │  - @arizeai/phoenix-client (datasets, experiments)       │   │
│  │  - Calls Mastra HTTP API for task execution              │   │
│  │  - Posts results to Phoenix                              │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
└────────────────────────┼────────────────────────────────────────┘
                         │ HTTP
           ┌─────────────┴─────────────┐
           ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│   Mastra Server     │     │      Phoenix        │
│   :4111             │     │      :6006          │
│                     │     │                     │
│   /api/agents/X/gen │     │   /v1/datasets      │
│   /api/workflows/X  │────▶│   /v1/experiments   │
│   (telemetry on)    │     │   /v1/traces        │
└─────────────────────┘     └─────────────────────┘
```

### 8.2 Directory Structure

```
workspace/
├── .mastragen/
│   └── config.yaml
├── src/
│   └── mastra/                     # Mastra agents, workflows, tools
├── experiments/
│   ├── package.json                # Bun project with phoenix-client
│   ├── tsconfig.json
│   ├── bun.lockb
│   ├── lib/
│   │   ├── phoenix.ts              # Phoenix SDK wrapper
│   │   ├── mastra.ts               # Mastra HTTP client
│   │   ├── runner.ts               # Experiment orchestration
│   │   ├── types.ts                # Shared types
│   │   ├── artifact-extractor.ts   # Extract Mastra artifact metadata
│   │   ├── synthetic-generator.ts  # Synthetic dataset generation
│   │   └── error-analysis.ts       # Open/axial coding, improvement plan
│   ├── tasks/
│   │   ├── care-workflow.ts        # Example: workflow task
│   │   └── agent-chat.ts           # Example: agent task
│   ├── evaluators/
│   │   ├── accuracy.ts             # Code-based evaluator
│   │   └── relevance.ts            # LLM-as-judge evaluator
│   ├── personas/
│   │   ├── index.ts                # Exports all personas
│   │   ├── august-health.ts        # Domain-specific personas
│   │   ├── generic.ts              # Reusable generic personas
│   │   └── README.md               # Persona authoring guide
│   ├── analysis/                   # Error analysis outputs (gitignored except reports)
│   │   └── .gitkeep
│   └── cli.ts                      # CLI entry point
└── .claude/
    └── skills/
        ├── phoenix-experiments/
        │   └── SKILL.md
        ├── synthetic-data/
        │   └── SKILL.md
        └── error-analysis/
            └── SKILL.md
```

### 8.3 Package Configuration

```json
// experiments/package.json
{
  "name": "mastragen-experiments",
  "type": "module",
  "scripts": {
    "cli": "bun run cli.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arizeai/phoenix-client": "^1.0.0",
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

```json
// experiments/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 8.4 Core Components

#### Mastra HTTP Client

```typescript
// experiments/lib/mastra.ts
const MASTRA_URL = process.env.MASTRA_URL || "http://mastra:4111";

export interface AgentInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export interface AgentResponse {
  text: string;
  steps?: Array<{
    toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
  }>;
}

export interface WorkflowResponse {
  success: boolean;
  results: Record<string, unknown>;
  error?: string;
}

export async function executeAgent(
  agentName: string,
  input: AgentInput
): Promise<AgentResponse> {
  const res = await fetch(`${MASTRA_URL}/api/agents/${agentName}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  
  if (!res.ok) {
    throw new Error(`Mastra agent error: ${res.status} ${await res.text()}`);
  }
  
  return res.json();
}

export async function executeWorkflow(
  workflowName: string,
  triggerData: Record<string, unknown>
): Promise<WorkflowResponse> {
  const res = await fetch(`${MASTRA_URL}/api/workflows/${workflowName}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ triggerData }),
  });
  
  if (!res.ok) {
    throw new Error(`Mastra workflow error: ${res.status} ${await res.text()}`);
  }
  
  return res.json();
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${MASTRA_URL}/api/tools/${toolName}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  
  if (!res.ok) {
    throw new Error(`Mastra tool error: ${res.status} ${await res.text()}`);
  }
  
  return res.json();
}
```

#### Types

```typescript
// experiments/lib/types.ts
export interface DatasetExample {
  id: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EvaluationResult {
  score?: number;
  label?: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export type Task = (input: Record<string, unknown>) => Promise<unknown>;

export interface Evaluator {
  name: string;
  kind: "CODE" | "LLM";
  evaluate: (ctx: {
    input: Record<string, unknown>;
    output: unknown;
    expected?: Record<string, unknown>;
  }) => Promise<EvaluationResult>;
}

export interface RunResult {
  runId: string;
  example: DatasetExample;
  output: unknown;
  error?: string;
  evaluations?: Record<string, EvaluationResult>;
}

export interface ExperimentResult {
  experimentId: string;
  experimentUrl: string;
  results: RunResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    avgLatencyMs: number;
  };
}
```

#### Experiment Runner

```typescript
// experiments/lib/runner.ts
import { createClient } from "@arizeai/phoenix-client";
import type { Task, Evaluator, RunResult, ExperimentResult, DatasetExample } from "./types";

const phoenix = createClient();
const PHOENIX_URL = process.env.PHOENIX_ENDPOINT?.replace("/v1/traces", "") || "http://phoenix:6006";

export interface RunExperimentOptions {
  datasetId?: string;
  datasetName?: string;
  experimentName: string;
  experimentDescription?: string;
  task: Task;
  evaluators?: Evaluator[];
  concurrency?: number;
}

export async function runExperiment(opts: RunExperimentOptions): Promise<ExperimentResult> {
  // 1. Resolve dataset
  let datasetId = opts.datasetId;
  if (!datasetId && opts.datasetName) {
    const datasets = await phoenix.GET("/v1/datasets", {
      params: { query: { name: opts.datasetName } },
    });
    const dataset = datasets.data?.data?.find(d => d.name === opts.datasetName);
    if (!dataset) throw new Error(`Dataset not found: ${opts.datasetName}`);
    datasetId = dataset.id;
  }
  if (!datasetId) throw new Error("Must provide datasetId or datasetName");

  // 2. Get dataset examples
  const examplesRes = await phoenix.GET("/v1/datasets/{id}/examples", {
    params: { path: { id: datasetId } },
  });
  const examples: DatasetExample[] = examplesRes.data?.data || [];
  
  if (examples.length === 0) {
    throw new Error(`Dataset ${datasetId} has no examples`);
  }

  console.log(`Found ${examples.length} examples in dataset`);

  // 3. Create experiment
  const experimentRes = await phoenix.POST("/v1/datasets/{dataset_id}/experiments", {
    params: { path: { dataset_id: datasetId } },
    body: {
      name: opts.experimentName,
      description: opts.experimentDescription || `Run at ${new Date().toISOString()}`,
    },
  });
  
  const experimentId = experimentRes.data!.data!.id;
  console.log(`Created experiment: ${experimentId}`);

  const results: RunResult[] = [];
  const latencies: number[] = [];

  // 4. Execute task for each example
  for (const example of examples) {
    const startTime = Date.now();
    let output: unknown;
    let error: string | undefined;

    try {
      console.log(`Running task for example ${example.id}...`);
      output = await opts.task(example.input);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`Task failed for ${example.id}: ${error}`);
    }

    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    latencies.push(latencyMs);

    // 5. Post run to Phoenix
    const runRes = await phoenix.POST("/v1/experiments/{experiment_id}/runs", {
      params: { path: { experiment_id: experimentId } },
      body: {
        dataset_example_id: example.id,
        output: output ?? null,
        error,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      },
    });

    const runId = runRes.data!.data!.id;
    const runResult: RunResult = { runId, example, output, error, evaluations: {} };

    // 6. Run evaluators (if task succeeded)
    if (opts.evaluators && !error) {
      for (const evaluator of opts.evaluators) {
        try {
          const evalResult = await evaluator.evaluate({
            input: example.input,
            output,
            expected: example.output,
          });

          await phoenix.POST("/v1/experiment_evaluations", {
            body: {
              experiment_run_id: runId,
              name: evaluator.name,
              annotator_kind: evaluator.kind,
              result: evalResult,
              start_time: new Date().toISOString(),
              end_time: new Date().toISOString(),
            },
          });

          runResult.evaluations![evaluator.name] = evalResult;
        } catch (e) {
          console.error(`Evaluator ${evaluator.name} failed: ${e}`);
        }
      }
    }

    results.push(runResult);
  }

  // 7. Compute summary
  const succeeded = results.filter(r => !r.error).length;
  const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    experimentId,
    experimentUrl: `${PHOENIX_URL}/experiments/${experimentId}`,
    results,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      avgLatencyMs: Math.round(avgLatencyMs),
    },
  };
}

export async function listDatasets(): Promise<Array<{ id: string; name: string; exampleCount: number }>> {
  const res = await phoenix.GET("/v1/datasets");
  return (res.data?.data || []).map(d => ({
    id: d.id,
    name: d.name,
    exampleCount: d.example_count || 0,
  }));
}

export async function getExperimentResults(experimentId: string) {
  const res = await phoenix.GET("/v1/experiments/{id}/runs/json", {
    params: { path: { id: experimentId } },
  });
  return res.data;
}
```

### 8.5 Example Task Implementations

#### Workflow Task

```typescript
// experiments/tasks/care-workflow.ts
import { executeWorkflow } from "../lib/mastra";
import type { Task } from "../lib/types";

export const careWorkflowTask: Task = async (input) => {
  const result = await executeWorkflow("care-intake-workflow", {
    residentId: input.residentId,
    notes: input.notes,
    requestType: input.requestType || "summary",
  });
  
  return {
    success: result.success,
    summary: result.results?.summary,
    recommendations: result.results?.recommendations,
  };
};
```

#### Agent Task

```typescript
// experiments/tasks/agent-chat.ts
import { executeAgent } from "../lib/mastra";
import type { Task } from "../lib/types";

export const agentChatTask: Task = async (input) => {
  const result = await executeAgent("care-coordinator", {
    messages: [
      { role: "user", content: input.question as string },
    ],
  });
  
  return {
    response: result.text,
    toolsUsed: result.steps?.flatMap(s => s.toolCalls?.map(t => t.name) || []) || [],
  };
};
```

### 8.6 Example Evaluators

#### Code-Based Evaluator

```typescript
// experiments/evaluators/accuracy.ts
import type { Evaluator } from "../lib/types";

export const accuracyEvaluator: Evaluator = {
  name: "accuracy",
  kind: "CODE",
  evaluate: async ({ output, expected }) => {
    if (!expected) {
      return { score: 1, label: "no_expected", explanation: "No expected output to compare" };
    }
    
    // Simple string match for demonstration
    const outputStr = JSON.stringify(output);
    const expectedStr = JSON.stringify(expected);
    const matches = outputStr === expectedStr;
    
    return {
      score: matches ? 1 : 0,
      label: matches ? "match" : "mismatch",
      explanation: matches 
        ? "Output matches expected" 
        : `Output differs from expected`,
    };
  },
};
```

#### LLM-as-Judge Evaluator

```typescript
// experiments/evaluators/relevance.ts
import type { Evaluator } from "../lib/types";

// Uses Mastra agent as the judge
import { executeAgent } from "../lib/mastra";

export const relevanceEvaluator: Evaluator = {
  name: "relevance",
  kind: "LLM",
  evaluate: async ({ input, output }) => {
    const judgment = await executeAgent("evaluator-agent", {
      messages: [
        {
          role: "user",
          content: `Rate the relevance of this response to the input.

Input: ${JSON.stringify(input)}
Response: ${JSON.stringify(output)}

Respond with JSON: {"score": 0-1, "label": "relevant"|"partial"|"irrelevant", "explanation": "..."}`,
        },
      ],
    });
    
    try {
      return JSON.parse(judgment.text);
    } catch {
      return { score: 0.5, label: "parse_error", explanation: "Could not parse evaluator response" };
    }
  },
};
```

### 8.7 CLI Entry Point

```typescript
// experiments/cli.ts
import { parseArgs } from "util";
import { runExperiment, listDatasets, getExperimentResults } from "./lib/runner";
import { careWorkflowTask } from "./tasks/care-workflow";
import { agentChatTask } from "./tasks/agent-chat";
import { accuracyEvaluator } from "./evaluators/accuracy";
import type { Task } from "./lib/types";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    dataset: { type: "string", short: "d" },
    task: { type: "string", short: "t" },
    name: { type: "string", short: "n" },
    description: { type: "string" },
    results: { type: "string", short: "r" },
    "list-datasets": { type: "boolean" },
    "list-tasks": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

// Registry of available tasks
const tasks: Record<string, Task> = {
  "care-workflow": careWorkflowTask,
  "agent-chat": agentChatTask,
};

// Help
if (values.help) {
  console.log(`
Mastragen Experiment Runner

Usage:
  bun run cli.ts --dataset <n> --task <n> [--name <experiment-name>]
  bun run cli.ts --list-datasets
  bun run cli.ts --list-tasks
  bun run cli.ts --results <experiment-id>

Options:
  -d, --dataset      Dataset name or ID
  -t, --task         Task name (see --list-tasks)
  -n, --name         Experiment name (default: auto-generated)
  --description      Experiment description
  -r, --results      Get results for experiment ID
  --list-datasets    List available datasets
  --list-tasks       List available tasks
  -h, --help         Show this help
`);
  process.exit(0);
}

// List datasets
if (values["list-datasets"]) {
  const datasets = await listDatasets();
  console.log("\nAvailable Datasets:");
  console.log("─".repeat(60));
  for (const ds of datasets) {
    console.log(`  ${ds.name.padEnd(30)} ${ds.exampleCount} examples  (${ds.id})`);
  }
  process.exit(0);
}

// List tasks
if (values["list-tasks"]) {
  console.log("\nAvailable Tasks:");
  console.log("─".repeat(40));
  for (const name of Object.keys(tasks)) {
    console.log(`  ${name}`);
  }
  process.exit(0);
}

// Get results
if (values.results) {
  const results = await getExperimentResults(values.results);
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

// Run experiment
if (values.dataset && values.task) {
  const task = tasks[values.task];
  if (!task) {
    console.error(`Unknown task: ${values.task}. Use --list-tasks to see available tasks.`);
    process.exit(1);
  }

  console.log(`\n🧪 Running experiment...`);
  console.log(`   Dataset: ${values.dataset}`);
  console.log(`   Task: ${values.task}`);
  console.log("");

  const result = await runExperiment({
    datasetName: values.dataset,
    experimentName: values.name || `${values.task}-${Date.now()}`,
    experimentDescription: values.description,
    task,
    evaluators: [accuracyEvaluator],
  });

  console.log("\n✅ Experiment complete!");
  console.log("─".repeat(60));
  console.log(`   Experiment ID: ${result.experimentId}`);
  console.log(`   View results:  ${result.experimentUrl}`);
  console.log("");
  console.log("   Summary:");
  console.log(`     Total:    ${result.summary.total}`);
  console.log(`     Passed:   ${result.summary.succeeded}`);
  console.log(`     Failed:   ${result.summary.failed}`);
  console.log(`     Avg time: ${result.summary.avgLatencyMs}ms`);
  console.log("");

  process.exit(0);
}

console.error("Missing required arguments. Use --help for usage.");
process.exit(1);
```

### 8.8 Claude SKILL

```markdown
<!-- .claude/skills/phoenix-experiments/SKILL.md -->
# Phoenix Experiments SKILL

## Overview

Run experiments against Mastra agents and workflows using Phoenix datasets.
Results are recorded in Phoenix for comparison and analysis.

## Environment

- **Location:** `/workspace/experiments/`
- **Runtime:** Bun
- **SDK:** `@arizeai/phoenix-client`

## Prerequisites

Ensure Phoenix is enabled in Mastragen config and the Mastra server is running.

## Commands

### List available datasets
```bash
cd /workspace/experiments && bun run cli.ts --list-datasets
```

### List available tasks
```bash
cd /workspace/experiments && bun run cli.ts --list-tasks
```

### Run an experiment
```bash
cd /workspace/experiments && bun run cli.ts \
  --dataset "care-summary-cases" \
  --task "care-workflow" \
  --name "care-workflow-v2-test" \
  --description "Testing new prompt template"
```

### Get experiment results
```bash
cd /workspace/experiments && bun run cli.ts --results <experiment-id>
```

## Adding New Tasks

1. Create task file in `experiments/tasks/your-task.ts`:
```typescript
import { executeWorkflow, executeAgent } from "../lib/mastra";
import type { Task } from "../lib/types";

export const yourTask: Task = async (input) => {
  // Call Mastra via HTTP
  const result = await executeWorkflow("your-workflow", input);
  return result;
};
```

2. Register in `cli.ts`:
```typescript
import { yourTask } from "./tasks/your-task";

const tasks: Record<string, Task> = {
  // ... existing tasks
  "your-task": yourTask,
};
```

## Adding Evaluators

1. Create evaluator in `experiments/evaluators/your-evaluator.ts`:
```typescript
import type { Evaluator } from "../lib/types";

export const yourEvaluator: Evaluator = {
  name: "your-metric",
  kind: "CODE", // or "LLM"
  evaluate: async ({ input, output, expected }) => {
    // Return: { score: 0-1, label: string, explanation: string }
    return { score: 1, label: "pass", explanation: "Looks good" };
  },
};
```

2. Add to experiment run in `cli.ts` or runner call.

## Workflow

1. **Create dataset** in Phoenix UI or via SDK
2. **Run experiment** with CLI
3. **View results** in Phoenix UI at the returned URL
4. **Compare experiments** to measure prompt/model changes
5. **Export results** for handoff documentation

## Troubleshooting

- **"Mastra workflow error"**: Check Mastra server is running (`curl http://mastra:4111/health`)
- **"Dataset not found"**: Use `--list-datasets` to verify name
- **No traces in Phoenix**: Ensure Mastra telemetry is enabled and pointing to Phoenix
```

---

### 8.9 Personas

Personas are user-authored descriptions of user archetypes that drive synthetic dataset generation. They capture the diversity of real users without requiring production data.

#### Persona Schema

```typescript
// experiments/lib/types.ts

export interface Persona {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Role or user type (e.g., "family_member", "nurse", "administrator") */
  role: string;
  
  /** Background context */
  context: {
    /** Demographics relevant to behavior */
    demographics?: string;
    /** Technical proficiency level: "low" | "medium" | "high" */
    techLevel?: "low" | "medium" | "high";
    /** Emotional state or situation */
    situation?: string;
    /** Time pressure or constraints */
    constraints?: string;
  };
  
  /** Communication patterns */
  communication: {
    /** Style: "terse" | "verbose" | "formal" | "casual" | "confused" */
    style: string;
    /** Common behaviors (e.g., "interrupts", "changes_mind", "asks_clarifying_questions") */
    behaviors?: string[];
    /** Language quirks or patterns */
    quirks?: string[];
  };
  
  /** Goals and motivations */
  goals: string[];
  
  /** Edge case behaviors this persona might exhibit */
  edgeCases?: string[];
  
  /** Domain-specific attributes (varies by use case) */
  domainAttributes?: Record<string, unknown>;
}
```

#### Example Personas (August Health Domain)

```typescript
// experiments/personas/august-health.ts

export const personas: Persona[] = [
  {
    id: "confused-elderly-family",
    name: "Confused Elderly Family Member",
    role: "family_member",
    context: {
      demographics: "Adult child (60s) of resident, not tech-savvy",
      techLevel: "low",
      situation: "First time using the system, stressed about parent's care",
      constraints: "Limited time, calling during work breaks"
    },
    communication: {
      style: "confused",
      behaviors: ["asks_same_question_twice", "provides_incomplete_info", "gets_frustrated"],
      quirks: ["Uses wrong medical terminology", "Confuses dates and times"]
    },
    goals: [
      "Understand mother's medication schedule",
      "Know who to contact for emergencies",
      "Get reassurance about quality of care"
    ],
    edgeCases: [
      "Asks about services facility doesn't offer",
      "Provides conflicting information about resident",
      "Demands to speak to human immediately"
    ],
    domainAttributes: {
      residentRelationship: "daughter",
      visitFrequency: "weekly"
    }
  },
  {
    id: "rushed-night-nurse",
    name: "Rushed Night Shift Nurse",
    role: "nurse",
    context: {
      demographics: "Night shift nurse, 5 years experience",
      techLevel: "medium",
      situation: "Covering multiple residents, interrupted frequently",
      constraints: "Must document quickly, often on mobile"
    },
    communication: {
      style: "terse",
      behaviors: ["uses_abbreviations", "skips_pleasantries", "multi_tasks"],
      quirks: ["Uses medical shorthand", "Expects system to know context"]
    },
    goals: [
      "Document care activities quickly",
      "Flag urgent issues for day shift",
      "Access resident history without searching"
    ],
    edgeCases: [
      "Enters partial data expecting autocomplete",
      "Makes typos due to speed",
      "Submits then immediately needs to edit"
    ],
    domainAttributes: {
      shift: "night",
      certifications: ["RN", "ACLS"]
    }
  },
  {
    id: "skeptical-admin",
    name: "Skeptical Administrator",
    role: "administrator",
    context: {
      demographics: "Facility director, 20 years in senior care",
      techLevel: "high",
      situation: "Evaluating AI tools, needs to justify ROI",
      constraints: "Budget pressure, regulatory concerns"
    },
    communication: {
      style: "formal",
      behaviors: ["asks_detailed_questions", "challenges_assertions", "requests_evidence"],
      quirks: ["References regulations by name", "Compares to previous systems"]
    },
    goals: [
      "Verify compliance with state regulations",
      "Understand audit trail capabilities",
      "Assess staff training requirements"
    ],
    edgeCases: [
      "Asks hypothetical scenarios to test edge cases",
      "Requests features that don't exist",
      "Probes for security vulnerabilities"
    ],
    domainAttributes: {
      facilitySize: "120 beds",
      regulatoryFocus: ["HIPAA", "state licensing"]
    }
  }
];
```

#### Persona Directory Structure

```
workspace/
└── experiments/
    └── personas/
        ├── index.ts           # Exports all personas
        ├── august-health.ts   # Domain-specific personas
        ├── generic.ts         # Reusable generic personas
        └── README.md          # Authoring guide
```

#### Persona Authoring Guidelines

```markdown
# Persona Authoring Guide

## Purpose
Personas drive synthetic data generation. Good personas produce diverse, realistic 
test cases that cover normal operations, edge cases, and stress scenarios.

## Principles

1. **Ground in Reality**: Base personas on real user archetypes you've observed
2. **Include Friction**: Real users make mistakes, get confused, change their minds
3. **Vary Dimensions**: Mix tech levels, communication styles, and constraints
4. **Domain-Specific**: Include attributes relevant to your specific use case

## Recommended Coverage

For comprehensive testing, include personas covering:

- [ ] Low, medium, high tech proficiency
- [ ] Terse vs verbose communication
- [ ] Calm vs stressed emotional states
- [ ] First-time vs experienced users
- [ ] Different roles/permissions
- [ ] Mobile vs desktop contexts
- [ ] Time-pressured vs leisurely interactions

## Anti-Patterns

- ❌ Only "happy path" users
- ❌ Personas that always provide perfect input
- ❌ Missing edge case behaviors
- ❌ Homogeneous communication styles
```

---

### 8.10 Synthetic Dataset Generation

Synthetic datasets enable systematic testing before production data exists. Using a powerful model (Claude Opus) combined with personas and Mastra artifact understanding, we generate diverse, realistic test cases.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                Synthetic Data Generation Pipeline               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │   Personas    │  │ Mastra Artifact │  │   Scenario       │  │
│  │   (authored)  │  │ (auto-extracted)│  │   Hints          │  │
│  │               │  │                 │  │   (optional)     │  │
│  │ - Roles       │  │ - Agent schema  │  │                  │  │
│  │ - Behaviors   │  │ - Tool defs     │  │ - Edge cases     │  │
│  │ - Edge cases  │  │ - Instructions  │  │ - Stress tests   │  │
│  └───────┬───────┘  └────────┬────────┘  └────────┬─────────┘  │
│          │                   │                    │             │
│          └───────────────────┼────────────────────┘             │
│                              ▼                                  │
│                    ┌─────────────────────┐                      │
│                    │  Claude Opus 4.5    │                      │
│                    │                     │                      │
│                    │  "Generate diverse  │                      │
│                    │   inputs for this   │                      │
│                    │   agent/persona..." │                      │
│                    └──────────┬──────────┘                      │
│                               │                                 │
│                               ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │  Phoenix Dataset    │                      │
│                    │  (versioned)        │                      │
│                    │                     │                      │
│                    │  - Inputs           │                      │
│                    │  - Metadata         │                      │
│                    │  - Rationale        │                      │
│                    └─────────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Mastra Artifact Extraction

```typescript
// experiments/lib/artifact-extractor.ts
import * as fs from "fs";
import * as path from "path";

export interface MastraArtifact {
  type: "agent" | "workflow" | "tool";
  name: string;
  filePath: string;
  instructions?: string;
  schema?: Record<string, unknown>;
  tools?: string[];
  steps?: string[];
}

/**
 * Extract Mastra artifact metadata from source files.
 * Parses agent/workflow/tool definitions to understand input schemas and capabilities.
 */
export async function extractMastraArtifact(
  artifactPath: string
): Promise<MastraArtifact> {
  const content = fs.readFileSync(artifactPath, "utf-8");
  const fileName = path.basename(artifactPath);
  
  // Detect artifact type from content patterns
  const isAgent = content.includes("new Agent(") || content.includes("createAgent(");
  const isWorkflow = content.includes("new Workflow(") || content.includes("createWorkflow(");
  const isTool = content.includes("createTool(") || content.includes("new Tool(");
  
  const type = isAgent ? "agent" : isWorkflow ? "workflow" : "tool";
  
  // Extract name from defineAgent/defineWorkflow pattern
  const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
  const name = nameMatch?.[1] || fileName.replace(/\.(ts|js)$/, "");
  
  // Extract instructions (for agents)
  const instructionsMatch = content.match(/instructions:\s*`([^`]+)`/s);
  const instructions = instructionsMatch?.[1]?.trim();
  
  // Extract input schema (look for zod schemas or type definitions)
  const schemaMatch = content.match(/inputSchema:\s*z\.object\(\{([^}]+)\}/s);
  const schema = schemaMatch ? parseZodSchema(schemaMatch[1]) : undefined;
  
  // Extract tool names (for agents)
  const toolsMatch = content.match(/tools:\s*\[([^\]]+)\]/);
  const tools = toolsMatch 
    ? toolsMatch[1].split(",").map(t => t.trim().replace(/['"]/g, ""))
    : undefined;
  
  return { type, name, filePath: artifactPath, instructions, schema, tools };
}

function parseZodSchema(zodString: string): Record<string, unknown> {
  // Simplified parser - extracts field names and types
  const fields: Record<string, unknown> = {};
  const fieldMatches = zodString.matchAll(/(\w+):\s*z\.(\w+)\(\)/g);
  for (const match of fieldMatches) {
    fields[match[1]] = { type: match[2] };
  }
  return fields;
}

/**
 * Scan workspace for all Mastra artifacts
 */
export async function scanWorkspaceArtifacts(
  workspacePath: string
): Promise<MastraArtifact[]> {
  const artifacts: MastraArtifact[] = [];
  const srcPath = path.join(workspacePath, "src", "mastra");
  
  const dirs = ["agents", "workflows", "tools"];
  for (const dir of dirs) {
    const dirPath = path.join(srcPath, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".ts"));
      for (const file of files) {
        const artifact = await extractMastraArtifact(path.join(dirPath, file));
        artifacts.push(artifact);
      }
    }
  }
  
  return artifacts;
}
```

#### Synthetic Data Generator

```typescript
// experiments/lib/synthetic-generator.ts
import Anthropic from "@anthropic-ai/sdk";
import { createDataset } from "@arizeai/phoenix-client/datasets";
import type { Persona } from "./types";
import type { MastraArtifact } from "./artifact-extractor";

const anthropic = new Anthropic();

export interface GenerateSyntheticDatasetOptions {
  /** Dataset name in Phoenix */
  name: string;
  /** Dataset description */
  description: string;
  /** Personas to generate data for */
  personas: Persona[];
  /** Mastra artifact being tested */
  artifact: MastraArtifact;
  /** Total number of examples to generate */
  count: number;
  /** Optional scenario hints to guide generation */
  scenarios?: string[];
  /** Include expected outputs (for golden datasets) */
  includeExpected?: boolean;
  /** Model to use for generation */
  model?: string;
}

export interface SyntheticExample {
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  metadata: {
    persona: string;
    scenario?: string;
    rationale: string;
    edgeCase?: boolean;
  };
}

export interface GenerateSyntheticDatasetResult {
  datasetId: string;
  datasetName: string;
  exampleCount: number;
  examples: SyntheticExample[];
  generationMetadata: {
    model: string;
    personas: string[];
    artifact: string;
    generatedAt: string;
  };
}

export async function generateSyntheticDataset(
  opts: GenerateSyntheticDatasetOptions
): Promise<GenerateSyntheticDatasetResult> {
  const model = opts.model || "claude-opus-4-20250514";
  const examples: SyntheticExample[] = [];
  
  // Distribute count across personas
  const perPersonaCount = Math.ceil(opts.count / opts.personas.length);
  
  for (const persona of opts.personas) {
    console.log(`Generating ${perPersonaCount} examples for persona: ${persona.name}`);
    
    const prompt = buildGenerationPrompt(persona, opts.artifact, perPersonaCount, opts);
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Expected text response from generation model");
    }
    
    // Parse JSON response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse generation response:", content.text.slice(0, 500));
      throw new Error("Failed to parse synthetic data from model response");
    }
    
    const generated: Array<{
      input: Record<string, unknown>;
      expected?: Record<string, unknown>;
      rationale: string;
      scenario?: string;
      edgeCase?: boolean;
    }> = JSON.parse(jsonMatch[0]);
    
    for (const item of generated) {
      examples.push({
        input: item.input,
        expected: item.expected,
        metadata: {
          persona: persona.id,
          scenario: item.scenario,
          rationale: item.rationale,
          edgeCase: item.edgeCase || false,
        },
      });
    }
  }
  
  console.log(`Generated ${examples.length} total examples, creating Phoenix dataset...`);
  
  // Create Phoenix dataset
  const { datasetId } = await createDataset({
    name: opts.name,
    description: opts.description,
    examples: examples.map(ex => ({
      input: ex.input,
      output: ex.expected,
      metadata: ex.metadata,
    })),
  });
  
  return {
    datasetId,
    datasetName: opts.name,
    exampleCount: examples.length,
    examples,
    generationMetadata: {
      model,
      personas: opts.personas.map(p => p.id),
      artifact: opts.artifact.name,
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildGenerationPrompt(
  persona: Persona,
  artifact: MastraArtifact,
  count: number,
  opts: GenerateSyntheticDatasetOptions
): string {
  return `You are generating synthetic test data for evaluating an AI system. Your goal is to create diverse, realistic inputs that thoroughly test the system's capabilities and edge cases.

## Persona
This persona represents a typical user who would interact with the system:

**Name:** ${persona.name}
**Role:** ${persona.role}

**Context:**
${JSON.stringify(persona.context, null, 2)}

**Communication Style:**
- Style: ${persona.communication.style}
- Behaviors: ${persona.communication.behaviors?.join(", ") || "None specified"}
- Quirks: ${persona.communication.quirks?.join(", ") || "None specified"}

**Goals:**
${persona.goals.map(g => `- ${g}`).join("\n")}

**Edge Cases This Persona Might Exhibit:**
${persona.edgeCases?.map(e => `- ${e}`).join("\n") || "None specified"}

${persona.domainAttributes ? `**Domain Attributes:**\n${JSON.stringify(persona.domainAttributes, null, 2)}` : ""}

## System Under Test
**Type:** ${artifact.type}
**Name:** ${artifact.name}

${artifact.instructions ? `**Instructions:**\n${artifact.instructions}` : ""}

${artifact.schema ? `**Input Schema:**\n${JSON.stringify(artifact.schema, null, 2)}` : ""}

${artifact.tools ? `**Available Tools:** ${artifact.tools.join(", ")}` : ""}

## Generation Requirements

Generate **${count}** diverse, realistic test inputs that this persona might provide to the system.

### Distribution Guidelines
- ~50% normal/typical cases
- ~30% edge cases (ambiguous, incomplete, unusual requests)
- ~20% stress cases (difficult scenarios, emotional language, multi-part questions)

${opts.scenarios ? `### Scenario Focus\nPrioritize these scenarios:\n${opts.scenarios.map(s => `- ${s}`).join("\n")}` : ""}

### Quality Criteria
1. **Realistic**: Inputs should feel like real user messages, not test data
2. **Diverse**: Vary the content, complexity, and communication style
3. **Grounded**: Respect the persona's characteristics and limitations
4. **Complete**: Include all fields required by the input schema
5. **Documented**: Each example must have a rationale explaining what it tests

${opts.includeExpected ? `### Expected Outputs
For each input, also provide the expected ideal output from the system. This creates a "golden dataset" for accuracy evaluation.` : ""}

## Output Format
Return a JSON array with ${count} objects. Each object must have:
- "input": The test input matching the system's schema
- "rationale": Why this input is valuable for testing (1-2 sentences)
- "scenario": Optional scenario category (e.g., "normal", "edge_case", "stress_test")
- "edgeCase": Boolean, true if this is an edge case
${opts.includeExpected ? '- "expected": The ideal output from the system' : ""}

Return ONLY the JSON array, no other text.

Example format:
[
  {
    "input": { ... },
    "rationale": "Tests handling of incomplete information when user is stressed",
    "scenario": "edge_case",
    "edgeCase": true${opts.includeExpected ? ',\n    "expected": { ... }' : ""}
  }
]`;
}
```

#### CLI Commands for Synthetic Data

```typescript
// experiments/cli.ts (additions)

// Add to existing CLI

async function handleSyntheticGeneration(args: Args): Promise<void> {
  const { personas: personaPath, artifact: artifactPath, count, name, scenarios } = args;
  
  if (!personaPath || !artifactPath || !name) {
    console.error("Required: --personas, --artifact, --name");
    process.exit(1);
  }
  
  // Load personas
  const personaModule = await import(path.resolve(personaPath));
  const personas: Persona[] = personaModule.personas || personaModule.default;
  
  // Extract artifact
  const artifact = await extractMastraArtifact(path.resolve(artifactPath));
  
  console.log(`Generating synthetic dataset "${name}"`);
  console.log(`  Personas: ${personas.map(p => p.name).join(", ")}`);
  console.log(`  Artifact: ${artifact.name} (${artifact.type})`);
  console.log(`  Count: ${count || 50}`);
  
  const result = await generateSyntheticDataset({
    name,
    description: `Synthetic dataset for ${artifact.name} generated from ${personas.length} personas`,
    personas,
    artifact,
    count: count || 50,
    scenarios: scenarios?.split(","),
  });
  
  console.log(`\n✓ Created dataset: ${result.datasetName}`);
  console.log(`  ID: ${result.datasetId}`);
  console.log(`  Examples: ${result.exampleCount}`);
  console.log(`\nPersona distribution:`);
  
  const distribution = new Map<string, number>();
  for (const ex of result.examples) {
    const count = distribution.get(ex.metadata.persona) || 0;
    distribution.set(ex.metadata.persona, count + 1);
  }
  for (const [persona, count] of distribution) {
    console.log(`  - ${persona}: ${count} examples`);
  }
}

// Usage:
// bun run cli.ts generate-synthetic \
//   --personas ./personas/august-health.ts \
//   --artifact ../src/mastra/agents/care-coordinator.ts \
//   --name "care-coordinator-test-v1" \
//   --count 100 \
//   --scenarios "medication_questions,emergency_contacts,care_schedules"
```

---

### 8.11 Error Analysis Workflow (Open/Axial Coding)

After running experiments, systematic error analysis transforms raw failures into actionable insights. This workflow adapts grounded theory methods (open coding → axial coding) for AI evaluation.

#### Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Error Analysis Workflow                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────┐   │
│  │ Experiment    │    │ Open Coding   │    │   Axial Coding        │   │
│  │ Results       │───▶│               │───▶│                       │   │
│  │               │    │ Descriptive   │    │   Group into          │   │
│  │ - Traces      │    │ observations  │    │   5-10 themes         │   │
│  │ - Failures    │    │ per failure   │    │                       │   │
│  └───────────────┘    └───────────────┘    └───────────┬───────────┘   │
│                                                        │               │
│                                                        ▼               │
│                                            ┌───────────────────────┐   │
│                                            │   Prioritization      │   │
│                                            │                       │   │
│                                            │   Ranked taxonomy     │   │
│                                            │   with counts         │   │
│                                            └───────────┬───────────┘   │
│                                                        │               │
│                                                        ▼               │
│                                            ┌───────────────────────┐   │
│                                            │   Handoff Artifact    │   │
│                                            │                       │   │
│                                            │   - failure-taxonomy  │   │
│                                            │   - improvement-plan  │   │
│                                            └───────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Phase 1: Open Coding

Open coding produces descriptive observations about each failure. **Critical principle:** Describe what happened, don't categorize yet.

```typescript
// experiments/lib/error-analysis.ts

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@arizeai/phoenix-client";
import type { ExperimentResult, RunResult } from "./types";

const anthropic = new Anthropic();
const phoenix = createClient();

export interface OpenCode {
  /** Unique ID */
  id: string;
  /** Reference to the experiment run */
  runId: string;
  /** The input that caused the failure */
  input: unknown;
  /** The output (if any) */
  output: unknown;
  /** Error message (if task failed) */
  error?: string;
  /** Descriptive observation about what went wrong */
  observation: string;
  /** Severity: "minor" | "moderate" | "severe" */
  severity: "minor" | "moderate" | "severe";
  /** Was this the first upstream failure in a chain? */
  isUpstreamFailure: boolean;
  /** Trace URL in Phoenix for debugging */
  traceUrl?: string;
}

export interface OpenCodingResult {
  experimentId: string;
  experimentName: string;
  totalRuns: number;
  failedRuns: number;
  openCodes: OpenCode[];
  generatedAt: string;
}

/**
 * Perform open coding on experiment results.
 * Uses Claude to analyze each failure and produce descriptive observations.
 */
export async function performOpenCoding(
  experimentResult: ExperimentResult,
  options?: {
    /** Only analyze runs that failed evaluators */
    failedEvaluatorsOnly?: boolean;
    /** Include runs that errored (task threw) */
    includeErrors?: boolean;
    /** Maximum runs to analyze */
    maxRuns?: number;
  }
): Promise<OpenCodingResult> {
  const opts = {
    failedEvaluatorsOnly: true,
    includeErrors: true,
    maxRuns: 100,
    ...options,
  };
  
  // Filter to failed runs
  let failedRuns = experimentResult.results.filter(r => {
    if (opts.includeErrors && r.error) return true;
    if (opts.failedEvaluatorsOnly && r.evaluations) {
      return Object.values(r.evaluations).some(e => e.score === 0 || e.label === "FAIL");
    }
    return false;
  });
  
  if (failedRuns.length > opts.maxRuns) {
    console.log(`Limiting analysis to ${opts.maxRuns} of ${failedRuns.length} failures`);
    failedRuns = failedRuns.slice(0, opts.maxRuns);
  }
  
  console.log(`Performing open coding on ${failedRuns.length} failed runs...`);
  
  const openCodes: OpenCode[] = [];
  
  for (const run of failedRuns) {
    const code = await analyzeFailure(run, experimentResult.experimentId);
    openCodes.push(code);
  }
  
  return {
    experimentId: experimentResult.experimentId,
    experimentName: experimentResult.experimentUrl.split("/").pop() || experimentResult.experimentId,
    totalRuns: experimentResult.results.length,
    failedRuns: failedRuns.length,
    openCodes,
    generatedAt: new Date().toISOString(),
  };
}

async function analyzeFailure(run: RunResult, experimentId: string): Promise<OpenCode> {
  const prompt = `You are analyzing a failure in an AI system evaluation. Your task is to write a clear, descriptive observation about what went wrong.

## Input
${JSON.stringify(run.example.input, null, 2)}

## Output
${run.output ? JSON.stringify(run.output, null, 2) : "(No output - task errored)"}

${run.error ? `## Error\n${run.error}` : ""}

${run.evaluations ? `## Evaluator Results\n${JSON.stringify(run.evaluations, null, 2)}` : ""}

## Instructions

Write a **descriptive observation** about this failure. Focus on:
1. What specifically went wrong (be concrete, not abstract)
2. What the system should have done instead
3. Whether this appears to be a root cause or downstream effect

**Guidelines:**
- ❌ Avoid generic labels like "hallucination" or "incorrect response"
- ✓ Be specific: "Agent claimed appointment was Tuesday when user clearly said Thursday"
- ✓ Describe behavior: "Workflow skipped medication verification step despite allergy flags"
- ✓ Note patterns: "System assumed US date format (MM/DD) when user provided DD/MM"

**Output JSON:**
{
  "observation": "Your descriptive observation here",
  "severity": "minor" | "moderate" | "severe",
  "isUpstreamFailure": true | false
}

Severity guide:
- minor: Cosmetic issue, slightly suboptimal response
- moderate: Incorrect information or missed user intent
- severe: Could cause harm, data loss, or major user frustration

Return ONLY the JSON object.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });
  
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Expected text response");
  }
  
  const result = JSON.parse(content.text);
  
  return {
    id: `oc-${run.runId}`,
    runId: run.runId,
    input: run.example.input,
    output: run.output,
    error: run.error,
    observation: result.observation,
    severity: result.severity,
    isUpstreamFailure: result.isUpstreamFailure,
    traceUrl: undefined, // Would need trace ID from Phoenix
  };
}
```

#### Phase 2: Axial Coding

Axial coding groups open codes into themes. Claude assists with initial grouping, but humans must review and refine.

```typescript
// experiments/lib/error-analysis.ts (continued)

export interface AxialCode {
  /** Category name */
  category: string;
  /** Description of this failure category */
  description: string;
  /** Open codes in this category */
  openCodeIds: string[];
  /** Count of failures */
  count: number;
  /** Representative examples (2-3 open codes) */
  examples: string[];
  /** Severity distribution */
  severityDistribution: {
    minor: number;
    moderate: number;
    severe: number;
  };
}

export interface AxialCodingResult {
  experimentId: string;
  openCodeCount: number;
  taxonomy: AxialCode[];
  uncategorized: string[];
  generatedAt: string;
  /** Human review status */
  reviewStatus: "pending" | "reviewed" | "approved";
}

/**
 * Perform axial coding to group open codes into themes.
 * Uses Claude for initial grouping, output requires human review.
 */
export async function performAxialCoding(
  openCodingResult: OpenCodingResult
): Promise<AxialCodingResult> {
  console.log(`Performing axial coding on ${openCodingResult.openCodes.length} observations...`);
  
  const observationsSummary = openCodingResult.openCodes.map(oc => ({
    id: oc.id,
    observation: oc.observation,
    severity: oc.severity,
  }));
  
  const prompt = `You are organizing failure observations from an AI system evaluation into a taxonomy of failure categories.

## Observations
${JSON.stringify(observationsSummary, null, 2)}

## Instructions

Group these observations into **5-10 thematic categories**. Each category should represent a distinct type of failure.

**Guidelines:**
- Categories should be actionable (an engineer should know what to fix)
- Avoid overly broad categories like "General errors"
- Avoid overly narrow categories with only 1-2 items
- Categories should not overlap significantly

**Output JSON:**
{
  "taxonomy": [
    {
      "category": "Category Name",
      "description": "What this category represents and why failures happen",
      "openCodeIds": ["oc-xxx", "oc-yyy"],
      "examples": ["Representative observation 1", "Representative observation 2"]
    }
  ],
  "uncategorized": ["oc-zzz"]  // IDs that don't fit any category
}

Return ONLY the JSON object.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Expected text response");
  }
  
  const result = JSON.parse(content.text);
  
  // Compute counts and severity distributions
  const openCodesById = new Map(openCodingResult.openCodes.map(oc => [oc.id, oc]));
  
  const taxonomy: AxialCode[] = result.taxonomy.map((cat: any) => {
    const codes = cat.openCodeIds.map((id: string) => openCodesById.get(id)).filter(Boolean);
    return {
      category: cat.category,
      description: cat.description,
      openCodeIds: cat.openCodeIds,
      count: cat.openCodeIds.length,
      examples: cat.examples,
      severityDistribution: {
        minor: codes.filter((c: OpenCode) => c.severity === "minor").length,
        moderate: codes.filter((c: OpenCode) => c.severity === "moderate").length,
        severe: codes.filter((c: OpenCode) => c.severity === "severe").length,
      },
    };
  });
  
  // Sort by count descending
  taxonomy.sort((a, b) => b.count - a.count);
  
  return {
    experimentId: openCodingResult.experimentId,
    openCodeCount: openCodingResult.openCodes.length,
    taxonomy,
    uncategorized: result.uncategorized || [],
    generatedAt: new Date().toISOString(),
    reviewStatus: "pending",
  };
}
```

#### Phase 3: Prioritization & Improvement Plan

```typescript
// experiments/lib/error-analysis.ts (continued)

export interface ImprovementItem {
  /** Priority rank */
  rank: number;
  /** Category being addressed */
  category: string;
  /** Impact score (count × severity weight) */
  impactScore: number;
  /** Suggested fix approach */
  suggestedFix: string;
  /** Estimated effort: "low" | "medium" | "high" */
  effort: "low" | "medium" | "high";
  /** Priority = impact / effort */
  priority: "critical" | "high" | "medium" | "low";
}

export interface ImprovementPlan {
  experimentId: string;
  items: ImprovementItem[];
  generatedAt: string;
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

/**
 * Generate prioritized improvement plan from taxonomy.
 */
export async function generateImprovementPlan(
  axialResult: AxialCodingResult
): Promise<ImprovementPlan> {
  // Calculate impact scores (count × severity weight)
  const severityWeights = { minor: 1, moderate: 3, severe: 10 };
  
  const items: ImprovementItem[] = [];
  
  for (const category of axialResult.taxonomy) {
    const impactScore = 
      category.severityDistribution.minor * severityWeights.minor +
      category.severityDistribution.moderate * severityWeights.moderate +
      category.severityDistribution.severe * severityWeights.severe;
    
    // Get suggested fix from Claude
    const fix = await suggestFix(category);
    
    items.push({
      rank: 0, // Will be set after sorting
      category: category.category,
      impactScore,
      suggestedFix: fix.suggestion,
      effort: fix.effort,
      priority: calculatePriority(impactScore, fix.effort),
    });
  }
  
  // Sort by priority (critical > high > medium > low), then by impact score
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.impactScore - a.impactScore;
  });
  
  // Assign ranks
  items.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return {
    experimentId: axialResult.experimentId,
    items,
    generatedAt: new Date().toISOString(),
    summary: {
      criticalCount: items.filter(i => i.priority === "critical").length,
      highCount: items.filter(i => i.priority === "high").length,
      mediumCount: items.filter(i => i.priority === "medium").length,
      lowCount: items.filter(i => i.priority === "low").length,
    },
  };
}

async function suggestFix(category: AxialCode): Promise<{ suggestion: string; effort: "low" | "medium" | "high" }> {
  const prompt = `Given this failure category from an AI system evaluation, suggest a fix approach.

**Category:** ${category.category}
**Description:** ${category.description}
**Example failures:**
${category.examples.map(e => `- ${e}`).join("\n")}
**Failure count:** ${category.count}

Suggest a concrete fix approach and estimate the effort required.

Output JSON:
{
  "suggestion": "Concrete fix approach (1-2 sentences)",
  "effort": "low" | "medium" | "high"
}

Effort guide:
- low: Prompt adjustment, config change
- medium: Code changes, new tool integration
- high: Architecture change, new data pipeline

Return ONLY the JSON object.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Expected text response");
  }
  
  return JSON.parse(content.text);
}

function calculatePriority(
  impactScore: number,
  effort: "low" | "medium" | "high"
): "critical" | "high" | "medium" | "low" {
  const effortMultiplier = { low: 1, medium: 0.5, high: 0.25 };
  const adjustedScore = impactScore * effortMultiplier[effort];
  
  if (adjustedScore >= 50) return "critical";
  if (adjustedScore >= 20) return "high";
  if (adjustedScore >= 10) return "medium";
  return "low";
}
```

#### Output Formats

```typescript
// experiments/lib/error-analysis.ts (continued)

/**
 * Export error analysis results to markdown for handoff.
 */
export function exportToMarkdown(
  openCoding: OpenCodingResult,
  axialCoding: AxialCodingResult,
  improvementPlan: ImprovementPlan
): string {
  let md = `# Error Analysis Report

**Experiment:** ${openCoding.experimentName}
**Generated:** ${new Date().toISOString()}
**Review Status:** ${axialCoding.reviewStatus}

## Summary

| Metric | Value |
|--------|-------|
| Total Runs | ${openCoding.totalRuns} |
| Failed Runs | ${openCoding.failedRuns} |
| Failure Rate | ${((openCoding.failedRuns / openCoding.totalRuns) * 100).toFixed(1)}% |
| Categories Identified | ${axialCoding.taxonomy.length} |
| Critical Issues | ${improvementPlan.summary.criticalCount} |
| High Priority Issues | ${improvementPlan.summary.highCount} |

---

## Failure Taxonomy

`;

  for (const category of axialCoding.taxonomy) {
    md += `### ${category.category}

**Count:** ${category.count} failures
**Severity:** ${category.severityDistribution.severe} severe, ${category.severityDistribution.moderate} moderate, ${category.severityDistribution.minor} minor

${category.description}

**Examples:**
${category.examples.map(e => `- ${e}`).join("\n")}

---

`;
  }

  md += `## Improvement Plan

| Rank | Category | Impact | Effort | Priority | Suggested Fix |
|------|----------|--------|--------|----------|---------------|
`;

  for (const item of improvementPlan.items) {
    md += `| ${item.rank} | ${item.category} | ${item.impactScore} | ${item.effort} | **${item.priority.toUpperCase()}** | ${item.suggestedFix} |\n`;
  }

  md += `
---

## Appendix: Open Codes

<details>
<summary>All ${openCoding.openCodes.length} observations (click to expand)</summary>

`;

  for (const oc of openCoding.openCodes) {
    md += `### ${oc.id}
**Severity:** ${oc.severity}
**Observation:** ${oc.observation}

</details>

`;
  }

  return md;
}
```

#### CLI Commands for Error Analysis

```typescript
// experiments/cli.ts (additions)

async function handleErrorAnalysis(args: Args): Promise<void> {
  const { experiment: experimentId, output } = args;
  
  if (!experimentId) {
    console.error("Required: --experiment <experiment-id>");
    process.exit(1);
  }
  
  // Load experiment results from Phoenix
  const runs = await phoenix.GET("/v1/experiments/{id}/runs/json", {
    params: { path: { id: experimentId } },
  });
  
  // Convert to ExperimentResult format
  const experimentResult: ExperimentResult = {
    experimentId,
    experimentUrl: `${PHOENIX_URL}/experiments/${experimentId}`,
    results: runs.data.map((r: any) => ({
      runId: r.id,
      example: { id: r.dataset_example_id, input: r.input, output: r.expected },
      output: r.output,
      error: r.error,
      evaluations: r.evaluations,
    })),
    summary: { total: runs.data.length, succeeded: 0, failed: 0, avgLatencyMs: 0 },
  };
  
  // Phase 1: Open Coding
  console.log("\n📝 Phase 1: Open Coding...\n");
  const openCoding = await performOpenCoding(experimentResult);
  console.log(`   Analyzed ${openCoding.openCodes.length} failures`);
  
  // Phase 2: Axial Coding  
  console.log("\n📊 Phase 2: Axial Coding...\n");
  const axialCoding = await performAxialCoding(openCoding);
  console.log(`   Identified ${axialCoding.taxonomy.length} categories`);
  
  // Phase 3: Improvement Plan
  console.log("\n🎯 Phase 3: Generating Improvement Plan...\n");
  const improvementPlan = await generateImprovementPlan(axialCoding);
  
  // Output
  const markdown = exportToMarkdown(openCoding, axialCoding, improvementPlan);
  
  const outputPath = output || `./error-analysis-${experimentId}.md`;
  fs.writeFileSync(outputPath, markdown);
  console.log(`\n✓ Error analysis report saved to: ${outputPath}`);
  
  // Summary
  console.log("\n📋 Summary:");
  console.log(`   Critical: ${improvementPlan.summary.criticalCount}`);
  console.log(`   High: ${improvementPlan.summary.highCount}`);
  console.log(`   Medium: ${improvementPlan.summary.mediumCount}`);
  console.log(`   Low: ${improvementPlan.summary.lowCount}`);
  
  if (improvementPlan.summary.criticalCount > 0) {
    console.log("\n⚠️  Critical issues require immediate attention:");
    for (const item of improvementPlan.items.filter(i => i.priority === "critical")) {
      console.log(`   - ${item.category}: ${item.suggestedFix}`);
    }
  }
}

// Usage:
// bun run cli.ts analyze-errors \
//   --experiment <experiment-id> \
//   --output ./analysis/care-coordinator-v2-errors.md
```

#### Claude SKILL: Error Analysis

```markdown
# Error Analysis SKILL

## Overview

Systematic analysis of experiment failures using grounded theory methods (open coding → axial coding → prioritization).

## When to Use

After running an experiment that has failures you want to understand and prioritize.

## Commands

### Full Error Analysis Pipeline

\`\`\`bash
cd /workspace/experiments && bun run cli.ts analyze-errors \
  --experiment <experiment-id> \
  --output ./analysis/<name>-errors.md
\`\`\`

This runs all three phases:
1. **Open Coding**: Analyzes each failure, produces descriptive observations
2. **Axial Coding**: Groups observations into 5-10 thematic categories
3. **Improvement Plan**: Ranks categories by impact/effort, suggests fixes

### Output Location

Reports are saved to the `analysis/` directory and should be committed to version control.

## Understanding the Output

### Failure Taxonomy

The taxonomy groups failures into categories. Each category has:
- **Count**: Number of failures in this category
- **Severity Distribution**: minor/moderate/severe breakdown
- **Examples**: Representative failure observations

### Improvement Plan

The improvement plan is a prioritized backlog:
- **Impact Score**: count × severity weight (severe=10, moderate=3, minor=1)
- **Effort**: low (prompt change), medium (code change), high (architecture)
- **Priority**: impact / effort ratio → critical, high, medium, low

## Human Review

⚠️ **Important**: The axial coding output requires human review.

Claude's initial grouping is a starting point. You should:
1. Read through the categories
2. Merge categories that are too similar
3. Split categories that are too broad
4. Rename categories to be more actionable
5. Update the `reviewStatus` from "pending" to "reviewed"

## Integration with Handoffs

The error analysis report (`*-errors.md`) becomes a handoff artifact:

\`\`\`
handoff-package/
├── evidence/
│   └── error-analysis.md   ← This report
├── improvement-plan.md     ← Extracted from report
└── ...
\`\`\`

## Anti-Patterns

- ❌ Using generic categories like "Hallucination" or "Wrong answer"
- ❌ Skipping human review of axial coding output
- ❌ Analyzing without enough failures (need 20+ for meaningful patterns)
- ❌ Running on experiments without evaluators (no failure signal)

## Best Practices

- ✓ Run analysis on experiments with 50+ runs for statistical significance
- ✓ Use evaluators that produce clear pass/fail signals
- ✓ Review the full improvement plan before starting fixes
- ✓ Fix critical/high priority items before re-running experiments
```

#### Claude SKILL: Synthetic Data Generation

```markdown
# Synthetic Data Generation SKILL

## Overview

Generate realistic test datasets using Claude Opus + user-authored personas + Mastra artifact understanding.

## When to Use

Before production data exists, or when you need to test edge cases and stress scenarios not present in real data.

## Prerequisites

1. **Personas authored** in `/workspace/experiments/personas/`
2. **Mastra artifact exists** (agent, workflow, or tool to test)
3. **ANTHROPIC_API_KEY** environment variable set (for Opus generation)

## Commands

### Generate Synthetic Dataset

\`\`\`bash
cd /workspace/experiments && bun run cli.ts generate-synthetic \
  --personas ./personas/august-health.ts \
  --artifact ../src/mastra/agents/care-coordinator.ts \
  --name "care-coordinator-test-v1" \
  --count 100
\`\`\`

### With Scenario Focus

\`\`\`bash
cd /workspace/experiments && bun run cli.ts generate-synthetic \
  --personas ./personas/august-health.ts \
  --artifact ../src/mastra/agents/care-coordinator.ts \
  --name "care-coordinator-edge-cases" \
  --count 50 \
  --scenarios "medication_questions,emergency_contacts,scheduling_conflicts"
\`\`\`

### Generate Golden Dataset (with expected outputs)

\`\`\`bash
cd /workspace/experiments && bun run cli.ts generate-synthetic \
  --personas ./personas/august-health.ts \
  --artifact ../src/mastra/agents/care-coordinator.ts \
  --name "care-coordinator-golden" \
  --count 30 \
  --include-expected
\`\`\`

## Authoring Personas

Personas live in `/workspace/experiments/personas/`. See the Persona Authoring Guide in `personas/README.md`.

### Minimum Viable Persona

\`\`\`typescript
export const personas: Persona[] = [
  {
    id: "basic-user",
    name: "Basic User",
    role: "user",
    context: { techLevel: "medium" },
    communication: { style: "casual" },
    goals: ["Get help with a task"]
  }
];
\`\`\`

### Recommended Coverage

For comprehensive testing, include personas that vary:
- Tech proficiency (low/medium/high)
- Communication style (terse/verbose/formal/confused)
- Emotional state (calm/stressed/frustrated)
- Domain-specific roles

## Distribution Guidelines

Generated examples follow this distribution:
- ~50% normal/typical cases
- ~30% edge cases (ambiguous, incomplete, unusual)
- ~20% stress cases (difficult scenarios, emotional, multi-part)

## Workflow

1. **Author personas** based on real user archetypes
2. **Run generation** with appropriate count and scenarios
3. **Review sample** of generated examples for quality
4. **Run experiment** against the synthetic dataset
5. **Analyze errors** to discover actual failure patterns

## Tips

- Start with 50-100 examples for initial experiments
- Use `--scenarios` to focus on known problem areas
- Review the `rationale` field to understand what each example tests
- Iterate on personas based on what failures you discover

## Troubleshooting

- **"Anthropic API error"**: Check ANTHROPIC_API_KEY is set
- **Poor quality examples**: Add more detail to persona definitions
- **Missing edge cases**: Add explicit `edgeCases` array to personas
- **Unrealistic inputs**: Add domain-specific `domainAttributes`
```

---

## 9. Handoff Workflow

### 9.1 Export Script

```typescript
// scripts/export-handoff.ts
import { createClient } from "@arizeai/phoenix-client";
import { getPrompt } from "@arizeai/phoenix-client/prompts";
import * as fs from "fs";
import * as path from "path";

async function exportHandoff(experimentId: string, outputDir: string) {
  const phoenix = createClient();
  
  // 1. Get experiment metadata
  const experiment = await phoenix.GET("/v1/experiments/{id}", {
    params: { path: { id: experimentId } },
  });
  
  // 2. Get experiment runs
  const runs = await phoenix.GET("/v1/experiments/{id}/runs/json", {
    params: { path: { id: experimentId } },
  });
  
  // 3. Get associated dataset
  const dataset = await phoenix.GET("/v1/datasets/{id}", {
    params: { path: { id: experiment.data.dataset_id } },
  });
  
  const examples = await phoenix.GET("/v1/datasets/{id}/examples", {
    params: { path: { id: experiment.data.dataset_id } },
  });
  
  // 4. Get prompt (if referenced in experiment metadata)
  const promptName = experiment.data.metadata?.promptName;
  const prompt = promptName ? await getPrompt({ name: promptName }) : null;
  
  // 5. Write handoff package
  const handoffDir = path.join(outputDir, `handoff-${experimentId}`);
  fs.mkdirSync(handoffDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(handoffDir, "experiment.json"),
    JSON.stringify(experiment.data, null, 2)
  );
  
  fs.writeFileSync(
    path.join(handoffDir, "runs.json"),
    JSON.stringify(runs.data, null, 2)
  );
  
  fs.writeFileSync(
    path.join(handoffDir, "dataset.json"),
    JSON.stringify({ ...dataset.data, examples: examples.data }, null, 2)
  );
  
  if (prompt) {
    fs.writeFileSync(
      path.join(handoffDir, "prompt.json"),
      JSON.stringify(prompt, null, 2)
    );
  }
  
  // 6. Generate summary
  const summary = generateSummary(experiment.data, runs.data);
  fs.writeFileSync(path.join(handoffDir, "README.md"), summary);
  
  console.log(`Handoff package created: ${handoffDir}`);
}

function generateSummary(experiment: any, runs: any[]): string {
  const successRate = runs.filter(r => !r.error).length / runs.length;
  const avgLatency = runs.reduce((sum, r) => {
    const duration = new Date(r.end_time).getTime() - new Date(r.start_time).getTime();
    return sum + duration;
  }, 0) / runs.length;
  
  return `# Experiment Handoff: ${experiment.id}

## Summary
- **Dataset:** ${experiment.dataset_id}
- **Success Rate:** ${(successRate * 100).toFixed(1)}%
- **Avg Latency:** ${avgLatency.toFixed(0)}ms
- **Total Runs:** ${runs.length}

## Files
- \`experiment.json\` - Experiment metadata
- \`runs.json\` - Individual run results with evaluations
- \`dataset.json\` - Test cases used
- \`prompt.json\` - Prompt version (if applicable)

## Reproduction
\`\`\`bash
# Import dataset to your Phoenix instance
curl -X POST http://your-phoenix/v1/datasets \\
  -H "Content-Type: application/json" \\
  -d @dataset.json

# Import prompt
curl -X POST http://your-phoenix/v1/prompts \\
  -H "Content-Type: application/json" \\
  -d @prompt.json
\`\`\`
`;
}
```

### 9.2 Handoff Directory Structure

```
handoff-exp-abc123/
├── README.md                      # Auto-generated summary
├── experiment.json                # Experiment metadata
├── runs.json                      # All run results + evaluations
├── dataset.json                   # Test cases with examples
├── prompt.json                    # Versioned prompt (optional)
├── personas/                      # Personas used for synthetic data generation
│   ├── personas.json              # Persona definitions
│   └── README.md                  # Persona documentation
├── synthetic-data/                # Synthetic dataset generation artifacts
│   ├── generation-metadata.json   # Model, personas, artifact used
│   └── examples-sample.json       # Sample of generated examples with rationale
├── error-analysis/                # Error analysis artifacts
│   ├── open-codes.json            # Raw observations (Phase 1)
│   ├── taxonomy.json              # Categorized failures (Phase 2)
│   ├── improvement-plan.json      # Prioritized backlog (Phase 3)
│   └── error-analysis-report.md   # Human-readable summary
└── traces/                        # Selected trace exports (optional)
    ├── trace-001.json
    └── trace-002.json
```

### 9.3 Enhanced Export Script

The export script now includes synthetic data and error analysis artifacts:

```typescript
// scripts/export-handoff.ts (updated)

async function exportHandoff(
  experimentId: string, 
  outputDir: string,
  options?: {
    includePersonas?: boolean;
    includeSyntheticMetadata?: boolean;
    includeErrorAnalysis?: boolean;
  }
) {
  const opts = {
    includePersonas: true,
    includeSyntheticMetadata: true,
    includeErrorAnalysis: true,
    ...options,
  };
  
  // ... existing export logic ...
  
  // Export personas (if dataset was synthetically generated)
  if (opts.includePersonas && dataset.data.metadata?.syntheticGeneration) {
    const personasDir = path.join(handoffDir, "personas");
    fs.mkdirSync(personasDir, { recursive: true });
    
    const personaIds = dataset.data.metadata.syntheticGeneration.personas;
    // Load personas from workspace
    const personas = await loadPersonas(personaIds);
    fs.writeFileSync(
      path.join(personasDir, "personas.json"),
      JSON.stringify(personas, null, 2)
    );
  }
  
  // Export synthetic data generation metadata
  if (opts.includeSyntheticMetadata && dataset.data.metadata?.syntheticGeneration) {
    const syntheticDir = path.join(handoffDir, "synthetic-data");
    fs.mkdirSync(syntheticDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(syntheticDir, "generation-metadata.json"),
      JSON.stringify(dataset.data.metadata.syntheticGeneration, null, 2)
    );
    
    // Include sample of examples with their rationale
    const sampleExamples = examples.slice(0, 10).map(ex => ({
      input: ex.input,
      metadata: ex.metadata,
    }));
    fs.writeFileSync(
      path.join(syntheticDir, "examples-sample.json"),
      JSON.stringify(sampleExamples, null, 2)
    );
  }
  
  // Export error analysis if it exists
  if (opts.includeErrorAnalysis) {
    const analysisPath = path.join(
      process.cwd(), 
      "analysis", 
      `error-analysis-${experimentId}.md`
    );
    
    if (fs.existsSync(analysisPath)) {
      const analysisDir = path.join(handoffDir, "error-analysis");
      fs.mkdirSync(analysisDir, { recursive: true });
      
      // Copy the markdown report
      fs.copyFileSync(
        analysisPath,
        path.join(analysisDir, "error-analysis-report.md")
      );
      
      // Also export structured JSON files if they exist
      const jsonFiles = ["open-codes.json", "taxonomy.json", "improvement-plan.json"];
      for (const file of jsonFiles) {
        const jsonPath = path.join(process.cwd(), "analysis", file);
        if (fs.existsSync(jsonPath)) {
          fs.copyFileSync(jsonPath, path.join(analysisDir, file));
        }
      }
    }
  }
}
```

---

## 10. Security Considerations

### 10.1 Network Isolation

- Phoenix is only accessible within the Mastragen cluster by default
- External access via Tailscale requires authentication
- No public internet exposure

### 10.2 Data Sensitivity

| Data Type | Sensitivity | Handling |
|-----------|-------------|----------|
| Traces | May contain PII from agent inputs | Retained per policy, auto-cleanup |
| Prompts | Business logic, possibly sensitive | Version controlled, audit logged |
| Datasets | Test cases, may mirror production | Sanitization recommended |
| Experiments | Aggregate metrics | Lower sensitivity |

### 10.3 Authentication (Optional)

For shared Mastragen instances, Phoenix authentication can be enabled:

```yaml
env:
- name: PHOENIX_ENABLE_AUTH
  value: "true"
- name: PHOENIX_SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: phoenix-secrets
      key: secret-key
```

---

## 11. Implementation Plan

### Phase 1: Local Docker Compose (Week 1)

- [ ] Add Phoenix service to docker-compose.phoenix.yml
- [ ] Implement `--phoenix` flag in Mastragen CLI
- [ ] Configure conditional telemetry in Mastra template
- [ ] Test trace collection and UI access

### Phase 2: Kubernetes Deployment (Week 2)

- [ ] Create Helm templates for Phoenix deployment
- [ ] Add PVC and backup CronJob
- [ ] Configure Tailscale ingress
- [ ] Test in staging cluster

### Phase 3: Mastra Integration (Week 3)

- [ ] Add prompt retrieval pattern to agent templates
- [ ] Create experiment runner utility script
- [ ] Build handoff export tooling
- [ ] Document workflow for Product Design

### Phase 4: Experiment Runner (Week 4)

- [ ] Scaffold `experiments/` directory structure in workspace template
- [ ] Implement Mastra HTTP client (`lib/mastra.ts`)
- [ ] Implement experiment runner (`lib/runner.ts`)
- [ ] Create example tasks and evaluators
- [ ] Build CLI entry point
- [ ] Write Claude SKILL for experiment orchestration
- [ ] Test end-to-end: dataset → experiment → results

### Phase 5: Documentation & Polish (Week 5)

- [ ] Write user guide for Product Design
- [ ] Add Phoenix to Mastragen onboarding
- [ ] Create example prompts and datasets
- [ ] Performance testing with large trace volumes

### Phase 6: Synthetic Data & Error Analysis (Week 6)

- [ ] Implement persona schema and example personas
- [ ] Build Mastra artifact extractor (`lib/artifact-extractor.ts`)
- [ ] Implement synthetic data generator (`lib/synthetic-generator.ts`)
- [ ] Build error analysis pipeline (open/axial coding)
- [ ] Create improvement plan generator
- [ ] Add CLI commands: `generate-synthetic`, `analyze-errors`
- [ ] Write Claude SKILLs for synthetic data and error analysis
- [ ] Update handoff export to include new artifacts
- [ ] Test end-to-end: personas → synthetic data → experiment → error analysis → handoff

### Phase 7: Custom Annotation UI (Future)

- [ ] Design custom data viewer for efficient trace review
- [ ] Implement open coding annotation interface
- [ ] Build axial coding review/refinement UI
- [ ] Integrate with Phoenix or as standalone tool

---

## 12. Open Questions

1. **Prompt Hot-Reload:** Should agents fetch prompts per-request or at startup? Per-request adds latency but enables live iteration.

2. **Multi-Tenant Isolation:** If multiple experiments run concurrently, should they share a Phoenix instance or have isolated projects?

3. **Trace Sampling:** For high-volume testing, should we enable trace sampling to reduce storage? What sampling rate?

4. **PostgreSQL Migration Path:** SQLite is simple but limited. When should we consider PostgreSQL for larger deployments?

5. **Phoenix Cloud Fallback:** Should there be an option to use Phoenix Cloud instead of self-hosted for teams that prefer managed infrastructure?

6. **Experiment Concurrency:** The current runner executes tasks sequentially. Should we add parallel execution with configurable concurrency for larger datasets?

7. **Evaluator Library:** Should we build a shared library of common evaluators (e.g., HIPAA compliance, care quality metrics) that Product Design can reuse across experiments?

8. **Dataset Versioning:** When datasets are modified, should experiments reference specific versions or always use latest? How do we handle dataset drift?

9. **Synthetic Data Grounding:** How much domain context should be provided to the generation model? Should we include sample production data (anonymized) to improve realism?

10. **Persona Library:** Should personas be shared across projects/workspaces? How do we handle domain-specific vs. generic personas?

11. **Axial Coding Review Interface:** Phoenix's annotation capabilities are limited. When should we build a custom UI for efficient human review of error analysis?

12. **LLM-as-Judge Integration:** Should error analysis integrate with Phoenix's evaluator framework to enable automated LLM judges based on discovered failure patterns?

13. **Synthetic Data Volume:** What's the optimal synthetic dataset size? Too small misses edge cases, too large wastes generation cost and experiment time.

14. **Human-in-the-Loop Frequency:** How often should humans review axial coding output? Every experiment? Only when taxonomy changes significantly?

---

## 13. References

- [Arize Phoenix Documentation](https://docs.arize.com/phoenix)
- [Mastra Observability Guide](https://mastra.ai/docs/observability)
- [@arizeai/phoenix-client NPM](https://www.npmjs.com/package/@arizeai/phoenix-client)
- [Phoenix GitHub Repository](https://github.com/Arize-ai/phoenix)
- [OpenInference Specification](https://github.com/Arize-ai/openinference)
- [A Pragmatic Guide to LLM Evals](https://newsletter.pragmaticengineer.com/p/evals) - Hamel Husain & Gergely Orosz
- [Open Coding (Grounded Theory)](https://en.wikipedia.org/wiki/Open_coding)
- [Axial Coding (Grounded Theory)](https://en.wikipedia.org/wiki/Axial_coding)
- [Error Analysis in Machine Learning](https://youtu.be/ORrStCArmP4) - Andrew Ng
