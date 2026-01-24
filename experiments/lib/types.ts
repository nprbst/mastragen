/**
 * Core types for the experiment framework.
 * T032: Type definitions for datasets, experiments, evaluators, and results.
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
  kind: 'CODE' | 'LLM';
  /**
   * LLM model for LLM-as-judge evaluators.
   * Only used when kind="LLM". Defaults to "claude-sonnet-4-20250514".
   */
  model?: 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250514';
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
  /** Latency in milliseconds */
  latencyMs: number;
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
// Mastra HTTP Client Types
// =============================================================================

/**
 * Input for agent execution.
 */
export interface AgentInput {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
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
// Phoenix Dataset Types
// =============================================================================

/**
 * Phoenix dataset metadata.
 */
export interface PhoenixDataset {
  id: string;
  name: string;
  description?: string;
  exampleCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phoenix experiment metadata.
 */
export interface PhoenixExperiment {
  id: string;
  name: string;
  description?: string;
  datasetId: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}
