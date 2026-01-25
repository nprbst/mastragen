/**
 * Experiment runner orchestration.
 * T033: Executes experiments against datasets with configurable concurrency.
 */

import { PhoenixClient } from './phoenix';
import type {
  DatasetExample,
  Evaluator,
  ExperimentResult,
  RunExperimentOptions,
  RunResult,
  Task,
} from './types';

/**
 * Experiment runner configuration.
 */
export interface ExperimentRunnerConfig {
  /** Phoenix client for dataset/experiment operations */
  phoenixClient: PhoenixClient;
  /** Default concurrency for parallel execution */
  defaultConcurrency?: number;
}

/**
 * Experiment runner for executing tasks against datasets.
 */
export class ExperimentRunner {
  private phoenix: PhoenixClient;
  private defaultConcurrency: number;

  constructor(config: ExperimentRunnerConfig) {
    this.phoenix = config.phoenixClient;
    this.defaultConcurrency = config.defaultConcurrency ?? 5;
  }

  /**
   * Run an experiment against a dataset.
   */
  async runExperiment(options: RunExperimentOptions): Promise<ExperimentResult> {
    // Resolve dataset
    let datasetId = options.datasetId;
    if (!datasetId && options.datasetName) {
      const dataset = await this.phoenix.getDatasetByName(options.datasetName);
      if (!dataset) {
        throw new Error(`Dataset not found: ${options.datasetName}`);
      }
      datasetId = dataset.id;
    }

    if (!datasetId) {
      throw new Error('Either datasetId or datasetName must be provided');
    }

    // Get dataset examples
    const examples = await this.phoenix.getDatasetExamples(datasetId);
    if (examples.length === 0) {
      throw new Error(`Dataset ${datasetId} has no examples`);
    }

    // Create experiment in Phoenix
    const experiment = await this.phoenix.createExperiment(
      datasetId,
      options.experimentName,
      options.experimentDescription
    );

    // Execute task for each example with concurrency control
    const concurrency = options.concurrency ?? this.defaultConcurrency;
    const results = await this.executeWithConcurrency(
      examples,
      options.task,
      options.evaluators ?? [],
      experiment.id,
      concurrency
    );

    // Calculate summary statistics
    const succeeded = results.filter((r) => !r.error).length;
    const failed = results.length - succeeded;
    const avgLatencyMs =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length
        : 0;

    return {
      experimentId: experiment.id,
      experimentUrl: this.phoenix.getExperimentUrl(experiment.id),
      results,
      summary: {
        total: results.length,
        succeeded,
        failed,
        avgLatencyMs,
      },
    };
  }

  /**
   * Execute task for examples with concurrency control.
   */
  private async executeWithConcurrency(
    examples: DatasetExample[],
    task: Task,
    evaluators: Evaluator[],
    experimentId: string,
    concurrency: number
  ): Promise<RunResult[]> {
    const results: RunResult[] = [];
    const queue = [...examples];
    const executing: Promise<void>[] = [];

    const executeOne = async (example: DatasetExample): Promise<void> => {
      const result = await this.executeExample(example, task, evaluators, experimentId);
      results.push(result);
    };

    while (queue.length > 0 || executing.length > 0) {
      // Fill up to concurrency limit
      while (queue.length > 0 && executing.length < concurrency) {
        const example = queue.shift()!;
        const promise = executeOne(example).then(() => {
          executing.splice(executing.indexOf(promise), 1);
        });
        executing.push(promise);
      }

      // Wait for at least one to complete
      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    return results;
  }

  /**
   * Execute a single example.
   */
  private async executeExample(
    example: DatasetExample,
    task: Task,
    evaluators: Evaluator[],
    experimentId: string
  ): Promise<RunResult> {
    const startTime = Date.now();
    let output: unknown;
    let error: string | undefined;

    try {
      output = await task(example.input);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - startTime;

    // Log run to Phoenix
    const runId = await this.phoenix.logRun(
      experimentId,
      example.id,
      output,
      latencyMs,
      error
    );

    // Run evaluators
    const evaluations: Record<string, import('./types').EvaluationResult> = {};
    if (!error && evaluators.length > 0) {
      for (const evaluator of evaluators) {
        try {
          const evalResult = await evaluator.evaluate({
            input: example.input,
            output,
            expected: example.output,
          });
          evaluations[evaluator.name] = evalResult;

          // Log evaluation to Phoenix
          await this.phoenix.logEvaluation(
            runId,
            evaluator.name,
            evalResult.score,
            evalResult.label,
            evalResult.explanation
          );
        } catch (e) {
          console.error(`Evaluator ${evaluator.name} failed:`, e);
        }
      }
    }

    return {
      runId,
      example,
      output,
      error,
      evaluations: Object.keys(evaluations).length > 0 ? evaluations : undefined,
      latencyMs,
    };
  }
}

/**
 * Create an experiment runner with default configuration.
 */
export function createExperimentRunner(
  phoenixConfig?: Partial<import('./phoenix').PhoenixClientConfig>
): ExperimentRunner {
  return new ExperimentRunner({
    phoenixClient: new PhoenixClient(phoenixConfig),
  });
}
