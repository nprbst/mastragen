# Data Model: Phoenix Observability

**Feature**: 005-phoenix-observability
**Created**: 2026-01-23

## Overview

This document defines the data entities, their relationships, and validation rules for the Phoenix Observability feature.

---

## 1. Database Entities (Mastragen)

### 1.1 ProjectEnvironmentsTable Extension

**Table**: `project_environments`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| phoenix_enabled | INTEGER | 0 | Boolean flag (0=disabled, 1=enabled) |

**Validation Rules**:
- Value must be 0 or 1
- Default is 0 (disabled) - Phoenix is opt-in

**Relationships**:
- Belongs to `projects` table via `project_id`
- Referenced by `sessions` when creating Phoenix-enabled sessions

---

## 2. Phoenix-Managed Entities

Phoenix manages its own SQLite database. These entities are read/written via Phoenix SDK.

### 2.1 Trace

Captures a complete agent/workflow execution.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique trace identifier |
| project_name | string | Logical grouping (e.g., "mastragen-experiments") |
| start_time | datetime | Trace start timestamp |
| end_time | datetime | Trace end timestamp |
| status | string | "ok" \| "error" |

**Relationships**:
- Contains multiple `Span` records

### 2.2 Span

Individual operation within a trace.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique span identifier |
| trace_id | string | Parent trace ID |
| parent_span_id | string? | Parent span (for nesting) |
| name | string | Operation name |
| span_kind | string | "LLM" \| "TOOL" \| "CHAIN" \| "AGENT" |
| start_time | datetime | Span start |
| end_time | datetime | Span end |
| attributes | json | LLM prompts, responses, tool calls, etc. |
| status | string | "ok" \| "error" |

**Validation Rules**:
- trace_id must reference existing trace
- start_time <= end_time

### 2.3 Prompt

Versioned prompt template.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique prompt identifier |
| name | string | Prompt name (e.g., "care-coordinator-system") |
| description | string? | Human-readable description |

**Relationships**:
- Has multiple `PromptVersion` records

### 2.4 PromptVersion

Specific version of a prompt.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique version identifier |
| prompt_id | string | Parent prompt ID |
| version | integer | Version number (auto-increment) |
| template_messages | json | Array of {role, content} |
| tags | string[] | Version tags (e.g., ["experiment", "production"]) |
| created_at | datetime | Version creation time |

**Validation Rules**:
- version auto-increments per prompt
- template_messages must contain at least one message
- tags must be unique per prompt (only one version per tag at a time)

### 2.5 Dataset

Collection of test examples.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique dataset identifier |
| name | string | Dataset name |
| description | string? | Human-readable description |
| example_count | integer | Number of examples |
| created_at | datetime | Creation timestamp |

**Relationships**:
- Contains multiple `DatasetExample` records
- Referenced by `Experiment` records

### 2.6 DatasetExample

Individual test case.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique example identifier |
| dataset_id | string | Parent dataset ID |
| input | json | Test input data |
| output | json? | Expected output (for golden datasets) |
| metadata | json? | Persona ID, rationale, scenario, etc. |

**Validation Rules**:
- dataset_id must reference existing dataset
- input must be valid JSON object

### 2.7 Experiment

Named test run against a dataset.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique experiment identifier |
| dataset_id | string | Dataset used |
| name | string | Experiment name |
| description | string? | Experiment description |
| metadata | json? | Additional context (workflow name, commit SHA, etc.) |
| created_at | datetime | Creation timestamp |

**Relationships**:
- References `Dataset`
- Contains multiple `ExperimentRun` records

### 2.8 ExperimentRun

Result of running one example.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique run identifier |
| experiment_id | string | Parent experiment ID |
| dataset_example_id | string | Example that was run |
| output | json? | Task output |
| error | string? | Error message if task failed |
| start_time | datetime | Run start |
| end_time | datetime | Run end |

**Relationships**:
- References `Experiment` and `DatasetExample`
- Has multiple `ExperimentEvaluation` records

### 2.9 ExperimentEvaluation

Evaluator result for a run.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique evaluation identifier |
| experiment_run_id | string | Parent run ID |
| name | string | Evaluator name |
| annotator_kind | string | "CODE" \| "LLM" |
| score | number? | 0-1 score |
| label | string? | Categorical label |
| explanation | string? | Evaluation reasoning |

---

## 3. Application Entities (Experiment Framework)

These entities exist in TypeScript code, not in a database.

### 3.1 Persona

User archetype for synthetic data generation.

```typescript
interface Persona {
  id: string;
  name: string;
  role: string;
  context: {
    demographics?: string;
    techLevel?: "low" | "medium" | "high";
    situation?: string;
    constraints?: string;
  };
  communication: {
    style: string;  // "terse" | "verbose" | "formal" | "casual" | "confused"
    behaviors?: string[];
    quirks?: string[];
  };
  goals: string[];
  edgeCases?: string[];
  domainAttributes?: Record<string, unknown>;
}
```

**Validation Rules**:
- id must be unique within persona set
- goals must have at least one entry
- techLevel if provided must be valid enum value

### 3.2 MastraArtifact

Extracted metadata from Mastra source files.

```typescript
interface MastraArtifact {
  type: "agent" | "workflow" | "tool";
  name: string;
  filePath: string;
  instructions?: string;   // For agents
  schema?: Record<string, unknown>;  // Input schema
  tools?: string[];        // For agents
  steps?: string[];        // For workflows
}
```

### 3.3 OpenCode

Open coding observation about a failure.

```typescript
interface OpenCode {
  id: string;
  runId: string;
  input: unknown;
  output: unknown;
  error?: string;
  observation: string;     // Descriptive, not categorical
  severity: "minor" | "moderate" | "severe";
  isUpstreamFailure: boolean;
  traceUrl?: string;
}
```

### 3.4 AxialCode

Thematic category grouping open codes.

```typescript
interface AxialCode {
  category: string;
  description: string;
  openCodeIds: string[];
  count: number;
  examples: string[];      // 2-3 representative observations
  severityDistribution: {
    minor: number;
    moderate: number;
    severe: number;
  };
}
```

### 3.5 ImprovementItem

Prioritized improvement suggestion.

```typescript
interface ImprovementItem {
  rank: number;
  category: string;
  impactScore: number;     // count × severity weight
  suggestedFix: string;
  effort: "low" | "medium" | "high";
  priority: "critical" | "high" | "medium" | "low";
}
```

---

## 4. State Transitions

### 4.1 Session Phoenix State

```
Session Created
      │
      ▼
┌─────────────────┐     ┌─────────────────┐
│ phoenixEnabled  │ yes │ Start Phoenix   │
│ = true?         │────▶│ Container       │
└─────────────────┘     └────────┬────────┘
      │ no                       │
      ▼                          ▼
┌─────────────────┐     ┌─────────────────┐
│ Skip Phoenix    │     │ Inject env vars │
│ (no overhead)   │     │ into Mastra     │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Traces flow to  │
                        │ Phoenix         │
                        └─────────────────┘
```

### 4.2 Experiment Lifecycle

```
Dataset Created (Phoenix UI or SDK)
      │
      ▼
Experiment Created (CLI: --dataset --task)
      │
      ▼
┌─────────────────────────────────┐
│ For each example:               │
│   1. Execute task (Mastra HTTP) │
│   2. Record trace (automatic)   │
│   3. Run evaluators             │
│   4. Post run result            │
└────────────────┬────────────────┘
                 │
                 ▼
Experiment Complete (results in Phoenix)
      │
      ▼
Error Analysis (optional: CLI analyze-errors)
      │
      ▼
Handoff Export (optional: CLI export-handoff)
```

### 4.3 Error Analysis Review Status

```
        "pending"              "reviewed"              "approved"
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │ AI-generated│  human  │ Human edits │  final  │ Ready for   │
    │ taxonomy    │────────▶│ categories  │────────▶│ handoff     │
    └─────────────┘ review  └─────────────┘ approval└─────────────┘
```

---

## 5. Entity Relationships Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Mastragen Database                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    1:N    ┌─────────────────────┐                │
│  │   projects   │──────────▶│ project_environments │                │
│  └──────────────┘           │  + phoenix_enabled   │                │
│                             └──────────┬──────────┘                │
│                                        │                            │
│                                        │ 1:N                        │
│                                        ▼                            │
│                             ┌─────────────────────┐                │
│                             │      sessions       │                │
│                             └─────────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Phoenix Database (SQLite)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────┐  1:N  ┌────────────┐                               │
│  │   traces   │──────▶│   spans    │                               │
│  └────────────┘       └────────────┘                               │
│                                                                     │
│  ┌────────────┐  1:N  ┌────────────────┐                           │
│  │  prompts   │──────▶│ prompt_versions │                           │
│  └────────────┘       └────────────────┘                           │
│                                                                     │
│  ┌────────────┐  1:N  ┌────────────────┐                           │
│  │  datasets  │──────▶│dataset_examples │                           │
│  └─────┬──────┘       └────────────────┘                           │
│        │                                                            │
│        │ 1:N                                                        │
│        ▼                                                            │
│  ┌────────────┐  1:N  ┌────────────────┐  1:N  ┌──────────────────┐│
│  │experiments │──────▶│experiment_runs │──────▶│exp_evaluations   ││
│  └────────────┘       └────────────────┘       └──────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
