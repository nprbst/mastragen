/**
 * Experiment framework library exports.
 * T062: Main entry point for the experiment framework.
 */

// Core clients
export { PhoenixClient, type PhoenixClientConfig } from './phoenix';
export { MastraClient, type MastraClientConfig, createAgentTask, createWorkflowTask, createToolTask } from './mastra';
export { PromptClient, type PromptClientConfig, type LocalPrompt, type Prompt, type PromptVersion } from './prompt-client';

// Experiment runner
export { ExperimentRunner, type ExperimentRunnerConfig, createExperimentRunner } from './runner';

// Artifact extraction
export { ArtifactExtractor, type ArtifactExtractorConfig, type AgentArtifact, type WorkflowArtifact, type ToolArtifact, type ProjectArtifacts, createArtifactExtractor } from './artifact-extractor';

// Synthetic data generation
export { SyntheticGenerator, type SyntheticGeneratorConfig, type Persona, type GenerateExamplesOptions, createSyntheticGenerator } from './synthetic-generator';

// Error analysis
export { ErrorAnalyzer, type ErrorAnalyzerConfig, type ErrorCategory, type CategoryRelationship, type ImprovementSuggestion, type ErrorAnalysisResult, createErrorAnalyzer } from './error-analyzer';

// Handoff export
export { HandoffExporter, type ExportFormat, type ExportConfig, type ExportResult, type HandoffPackage, createHandoffExporter, exportExperiment } from './handoff-exporter';

// Types
export type {
  DatasetExample,
  EvaluationResult,
  Task,
  Evaluator,
  RunExperimentOptions,
  RunResult,
  ExperimentResult,
  AgentInput,
  AgentResponse,
  WorkflowResponse,
  AgentDetails,
  WorkflowDetails,
  ToolDetails,
  PhoenixDataset,
  PhoenixExperiment,
} from './types';
