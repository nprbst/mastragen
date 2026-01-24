/**
 * Phoenix client wrapper for experiment framework.
 * T030: Provides dataset and experiment management via HTTP API.
 */

import type {
  DatasetExample,
  PhoenixDataset,
  PhoenixExperiment,
} from './types';

/**
 * Phoenix client configuration.
 */
export interface PhoenixClientConfig {
  /** Phoenix server endpoint */
  endpoint: string;
  /** Optional API key for authenticated access */
  apiKey?: string;
  /** Project name for organizing experiments */
  projectName?: string;
}

/**
 * Default Phoenix configuration from environment.
 */
export function getDefaultConfig(): PhoenixClientConfig {
  return {
    endpoint: process.env.PHOENIX_ENDPOINT ?? 'http://localhost:6006',
    apiKey: process.env.PHOENIX_API_KEY,
    projectName: process.env.PHOENIX_PROJECT_NAME ?? 'mastragen-experiments',
  };
}

/**
 * Phoenix client wrapper for experiment operations.
 * Uses direct HTTP calls for better type control.
 */
export class PhoenixClient {
  private config: PhoenixClientConfig;

  constructor(config?: Partial<PhoenixClientConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Make an HTTP request to Phoenix API.
   */
  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Phoenix API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * List all datasets.
   */
  async listDatasets(): Promise<PhoenixDataset[]> {
    const response = await this.fetch<{
      data: Array<{
        id: string;
        name: string;
        description?: string;
        example_count?: number;
        created_at: string;
        updated_at: string;
      }>;
    }>('/v1/datasets');

    return (response.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      exampleCount: d.example_count ?? 0,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  /**
   * Get a dataset by ID.
   */
  async getDataset(datasetId: string): Promise<PhoenixDataset | null> {
    try {
      const response = await this.fetch<{
        data: {
          id: string;
          name: string;
          description?: string;
          example_count?: number;
          created_at: string;
          updated_at: string;
        };
      }>(`/v1/datasets/${datasetId}`);

      const d = response.data;
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        exampleCount: d.example_count ?? 0,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get a dataset by name.
   */
  async getDatasetByName(name: string): Promise<PhoenixDataset | null> {
    const datasets = await this.listDatasets();
    return datasets.find((d) => d.name === name) ?? null;
  }

  /**
   * Get examples from a dataset.
   */
  async getDatasetExamples(datasetId: string): Promise<DatasetExample[]> {
    const response = await this.fetch<{
      data: {
        examples: Array<{
          id: string;
          input: Record<string, unknown>;
          output?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
        }>;
      };
    }>(`/v1/datasets/${datasetId}/examples`);

    return (response.data?.examples ?? []).map((e) => ({
      id: e.id,
      input: e.input ?? {},
      output: e.output,
      metadata: e.metadata as DatasetExample['metadata'],
    }));
  }

  /**
   * Create a new dataset.
   */
  async createDataset(
    name: string,
    description?: string,
    examples?: DatasetExample[]
  ): Promise<PhoenixDataset> {
    const response = await this.fetch<{
      data: {
        id: string;
        name: string;
        description?: string;
        example_count?: number;
        created_at: string;
        updated_at: string;
      };
    }>('/v1/datasets', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        inputs: examples?.map((e) => ({
          input: e.input,
          output: e.output,
          metadata: e.metadata,
        })),
      }),
    });

    const d = response.data;
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      exampleCount: d.example_count ?? 0,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    };
  }

  /**
   * Add examples to an existing dataset.
   */
  async addExamples(
    datasetId: string,
    examples: DatasetExample[]
  ): Promise<void> {
    await this.fetch(`/v1/datasets/${datasetId}/examples`, {
      method: 'POST',
      body: JSON.stringify({
        examples: examples.map((e) => ({
          input: e.input,
          output: e.output,
          metadata: e.metadata,
        })),
      }),
    });
  }

  /**
   * List experiments for a dataset.
   */
  async listExperiments(datasetId?: string): Promise<PhoenixExperiment[]> {
    const path = datasetId
      ? `/v1/experiments?dataset_id=${datasetId}`
      : '/v1/experiments';

    const response = await this.fetch<{
      data: Array<{
        id: string;
        name: string;
        description?: string;
        dataset_id: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
    }>(path);

    return (response.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      datasetId: e.dataset_id,
      status: e.status as PhoenixExperiment['status'],
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));
  }

  /**
   * Get an experiment by ID.
   */
  async getExperiment(experimentId: string): Promise<PhoenixExperiment | null> {
    try {
      const response = await this.fetch<{
        data: {
          id: string;
          name: string;
          description?: string;
          dataset_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
      }>(`/v1/experiments/${experimentId}`);

      const e = response.data;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        datasetId: e.dataset_id,
        status: e.status as PhoenixExperiment['status'],
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a new experiment.
   */
  async createExperiment(
    datasetId: string,
    name: string,
    description?: string
  ): Promise<PhoenixExperiment> {
    const response = await this.fetch<{
      data: {
        id: string;
        name: string;
        description?: string;
        dataset_id: string;
        status: string;
        created_at: string;
        updated_at: string;
      };
    }>('/v1/experiments', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: datasetId,
        name,
        description,
      }),
    });

    const e = response.data;
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      datasetId: e.dataset_id,
      status: e.status as PhoenixExperiment['status'],
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    };
  }

  /**
   * Log a run result to an experiment.
   */
  async logRun(
    experimentId: string,
    exampleId: string,
    output: unknown,
    latencyMs: number,
    error?: string
  ): Promise<string> {
    const response = await this.fetch<{
      data: { id: string };
    }>(`/v1/experiments/${experimentId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        example_id: exampleId,
        output,
        latency_ms: latencyMs,
        error,
      }),
    });

    return response.data?.id ?? '';
  }

  /**
   * Log an evaluation result for a run.
   */
  async logEvaluation(
    runId: string,
    evaluatorName: string,
    score?: number,
    label?: string,
    explanation?: string
  ): Promise<void> {
    await this.fetch(`/v1/runs/${runId}/evaluations`, {
      method: 'POST',
      body: JSON.stringify({
        name: evaluatorName,
        score,
        label,
        explanation,
      }),
    });
  }

  /**
   * Get the Phoenix UI URL for an experiment.
   */
  getExperimentUrl(experimentId: string): string {
    const baseUrl = this.config.endpoint.replace(/\/v1\/traces$/, '');
    return `${baseUrl}/experiments/${experimentId}`;
  }

  /**
   * Get the Phoenix UI URL for a dataset.
   */
  getDatasetUrl(datasetId: string): string {
    const baseUrl = this.config.endpoint.replace(/\/v1\/traces$/, '');
    return `${baseUrl}/datasets/${datasetId}`;
  }
}
