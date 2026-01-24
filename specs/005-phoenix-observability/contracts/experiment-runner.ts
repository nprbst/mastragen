/**
 * Experiment Runner Contracts
 *
 * Type definitions for the experiment framework including datasets,
 * experiments, evaluators, synthetic data generation, and error analysis.
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * A single test example in a dataset.
 */
export interface DatasetExample {
  /** Unique identifier */
  id: string;
  /** Test input data */
  input: Record<string, unknown>;
  /** Expected output (for golden datasets) */
  output?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: {
    persona?: string;
    scenario?: string;
    rationale?: string;
    edgeCase?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Result from an evaluator.
 */
export interface EvaluationResult {
  /** Numeric score (0-1) */
  score?: number;
  /** Categorical label */
  label?: string;
  /** Explanation of evaluation */
  explanation?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task function signature.
 */
export type Task = (input: Record<string, unknown>) => Promise<unknown>;

/**
 * Evaluator definition.
 */
export interface Evaluator {
  /** Evaluator name */
  name: string;
  /** Evaluator type */
  kind: "CODE" | "LLM";
  /**
   * LLM model for LLM-as-judge evaluators.
   * Only used when kind="LLM". Defaults to "claude-sonnet-4-20250514".
   */
  model?: "claude-sonnet-4-20250514" | "claude-haiku-4-20250514";
  /** Evaluation function */
  evaluate: (context: {
    input: Record<string, unknown>;
    output: unknown;
    expected?: Record<string, unknown>;
  }) => Promise<EvaluationResult>;
}

// =============================================================================
// Experiment Execution
// =============================================================================

/**
 * Options for running an experiment.
 */
export interface RunExperimentOptions {
  /** Dataset ID (if known) */
  datasetId?: string;
  /** Dataset name (resolved to ID) */
  datasetName?: string;
  /** Experiment name */
  experimentName: string;
  /** Optional description */
  experimentDescription?: string;
  /** Task to execute for each example */
  task: Task;
  /** Evaluators to run on results */
  evaluators?: Evaluator[];
  /** Maximum concurrent executions */
  concurrency?: number;
}

/**
 * Result of a single run.
 */
export interface RunResult {
  /** Run ID in Phoenix */
  runId: string;
  /** The example that was run */
  example: DatasetExample;
  /** Task output */
  output: unknown;
  /** Error message if task failed */
  error?: string;
  /** Evaluator results */
  evaluations?: Record<string, EvaluationResult>;
}

/**
 * Complete experiment result.
 */
export interface ExperimentResult {
  /** Experiment ID in Phoenix */
  experimentId: string;
  /** URL to view experiment in Phoenix */
  experimentUrl: string;
  /** All run results */
  results: RunResult[];
  /** Summary statistics */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    avgLatencyMs: number;
  };
}

// =============================================================================
// Mastra HTTP Client
// =============================================================================

/**
 * Input for agent execution.
 */
export interface AgentInput {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}

/**
 * Response from agent execution.
 */
export interface AgentResponse {
  text: string;
  steps?: Array<{
    toolCalls?: Array<{
      name: string;
      args: unknown;
      result: unknown;
    }>;
  }>;
}

/**
 * Response from workflow execution.
 */
export interface WorkflowResponse {
  success: boolean;
  results: Record<string, unknown>;
  error?: string;
}

/**
 * Mastra HTTP API endpoints.
 */
export const MASTRA_API = {
  agents: {
    generate: (name: string) => `/api/agents/${name}/generate`,
  },
  workflows: {
    execute: (name: string) => `/api/workflows/${name}/execute`,
  },
  tools: {
    execute: (name: string) => `/api/tools/${name}/execute`,
  },
} as const;

// =============================================================================
// Persona & Synthetic Data
// =============================================================================

/**
 * User persona for synthetic data generation.
 */
export interface Persona {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Role or user type */
  role: string;
  /** Background context */
  context: {
    demographics?: string;
    techLevel?: "low" | "medium" | "high";
    situation?: string;
    constraints?: string;
  };
  /** Communication patterns */
  communication: {
    style: "terse" | "verbose" | "formal" | "casual" | "confused";
    behaviors?: string[];
    quirks?: string[];
  };
  /** Goals and motivations */
  goals: string[];
  /** Edge case behaviors */
  edgeCases?: string[];
  /** Domain-specific attributes */
  domainAttributes?: Record<string, unknown>;
}

/**
 * Extracted Mastra artifact metadata.
 */
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
 * Options for synthetic dataset generation.
 */
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
  /** Optional scenario hints */
  scenarios?: string[];
  /** Include expected outputs */
  includeExpected?: boolean;
  /** Model for generation (default: claude-opus-4-20250514) */
  model?: string;
}

/**
 * Generated synthetic example.
 */
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

/**
 * Result of synthetic dataset generation.
 */
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

// =============================================================================
// Error Analysis
// =============================================================================

/**
 * Open coding observation about a failure.
 */
export interface OpenCode {
  /** Unique ID */
  id: string;
  /** Reference to experiment run */
  runId: string;
  /** Input that caused failure */
  input: unknown;
  /** Output (if any) */
  output: unknown;
  /** Error message */
  error?: string;
  /** Descriptive observation */
  observation: string;
  /** Severity level */
  severity: "minor" | "moderate" | "severe";
  /** Root cause vs downstream */
  isUpstreamFailure: boolean;
  /** Link to trace */
  traceUrl?: string;
}

/**
 * Result of open coding phase.
 */
export interface OpenCodingResult {
  experimentId: string;
  experimentName: string;
  totalRuns: number;
  failedRuns: number;
  openCodes: OpenCode[];
  generatedAt: string;
}

/**
 * Axial code (thematic category).
 */
export interface AxialCode {
  /** Category name */
  category: string;
  /** Description */
  description: string;
  /** Open codes in this category */
  openCodeIds: string[];
  /** Failure count */
  count: number;
  /** Representative examples */
  examples: string[];
  /** Severity breakdown */
  severityDistribution: {
    minor: number;
    moderate: number;
    severe: number;
  };
}

/**
 * Result of axial coding phase.
 */
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
 * Prioritized improvement item.
 */
export interface ImprovementItem {
  /** Priority rank */
  rank: number;
  /** Category being addressed */
  category: string;
  /** Impact score (count x severity weight) */
  impactScore: number;
  /** Suggested fix */
  suggestedFix: string;
  /** Effort estimate */
  effort: "low" | "medium" | "high";
  /** Calculated priority */
  priority: "critical" | "high" | "medium" | "low";
}

/**
 * Complete improvement plan.
 */
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
 * Severity weights for impact calculation.
 */
export const SEVERITY_WEIGHTS = {
  minor: 1,
  moderate: 3,
  severe: 10,
} as const;

/**
 * Effort multipliers for priority calculation.
 */
export const EFFORT_MULTIPLIERS = {
  low: 1,
  medium: 0.5,
  high: 0.25,
} as const;

// =============================================================================
// Handoff Export
// =============================================================================

/**
 * Structure of exported handoff package.
 */
export interface HandoffPackage {
  /** Package metadata */
  metadata: {
    experimentId: string;
    exportedAt: string;
    version: string;
  };
  /** Files included */
  files: {
    readme: "README.md";
    experiment: "experiment.json";
    runs: "runs.json";
    dataset: "dataset.json";
    prompt?: "prompt.json";
    personas?: "personas/personas.json";
    analysis?: {
      openCodes: "analysis/open-codes.json";
      taxonomy: "analysis/failure-taxonomy.json";
      improvementPlan: "analysis/improvement-plan.md";
    };
  };
}

// =============================================================================
// CLI Commands
// =============================================================================

/**
 * CLI command definitions.
 */
export const CLI_COMMANDS = {
  listDatasets: "--list-datasets",
  listTasks: "--list-tasks",
  runExperiment: {
    dataset: "--dataset",
    task: "--task",
    name: "--name",
    description: "--description",
  },
  getResults: "--results",
  generateSynthetic: {
    command: "generate-synthetic",
    personas: "--personas",
    artifact: "--artifact",
    name: "--name",
    count: "--count",
    scenarios: "--scenarios",
    includeExpected: "--include-expected",
  },
  analyzeErrors: {
    command: "analyze-errors",
    experiment: "--experiment",
    output: "--output",
  },
  exportHandoff: {
    command: "export-handoff",
    experiment: "--experiment",
    output: "--output",
  },
} as const;
