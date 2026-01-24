/**
 * Unit tests for experiment runner.
 * T041: Tests for experiment execution and concurrency.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ExperimentRunner } from './runner';
import type { DatasetExample, Evaluator, PhoenixDataset, PhoenixExperiment } from './types';

describe('ExperimentRunner', () => {
  // Mock Phoenix client
  const mockPhoenixClient = {
    getDatasetByName: mock(() => Promise.resolve({
      id: 'dataset-1',
      name: 'test-dataset',
      exampleCount: 2,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    } as PhoenixDataset)),
    getDatasetExamples: mock(() => Promise.resolve([
      { id: 'ex-1', input: { text: 'hello' } },
      { id: 'ex-2', input: { text: 'world' } },
    ] as DatasetExample[])),
    createExperiment: mock(() => Promise.resolve({
      id: 'exp-1',
      name: 'test-experiment',
      datasetId: 'dataset-1',
      status: 'running',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    } as PhoenixExperiment)),
    logRun: mock(() => Promise.resolve('run-1')),
    logEvaluation: mock(() => Promise.resolve()),
    getExperimentUrl: mock(() => 'http://phoenix:6006/experiments/exp-1'),
  };

  beforeEach(() => {
    mock.restore();
  });

  describe('runExperiment', () => {
    test('should execute task for each example', async () => {
      const taskCalls: Record<string, unknown>[] = [];
      const task = mock(async (input: Record<string, unknown>) => {
        taskCalls.push(input);
        return { result: `processed-${input.text}` };
      });

      const runner = new ExperimentRunner({
        phoenixClient: mockPhoenixClient as any,
      });

      const result = await runner.runExperiment({
        datasetName: 'test-dataset',
        experimentName: 'test-experiment',
        task,
      });

      expect(taskCalls.length).toBe(2);
      expect(result.results.length).toBe(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    test('should handle task failures gracefully', async () => {
      let callCount = 0;
      const task = mock(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Task failed');
        }
        return { result: 'success' };
      });

      const runner = new ExperimentRunner({
        phoenixClient: mockPhoenixClient as any,
      });

      const result = await runner.runExperiment({
        datasetName: 'test-dataset',
        experimentName: 'test-experiment',
        task,
      });

      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.results[0]!.error).toBe('Task failed');
    });

    test('should run evaluators on successful results', async () => {
      const evalCalls: unknown[] = [];
      const evaluator: Evaluator = {
        name: 'test-eval',
        kind: 'CODE',
        evaluate: mock(async (ctx) => {
          evalCalls.push(ctx);
          return { score: 0.9, label: 'good' };
        }),
      };

      const runner = new ExperimentRunner({
        phoenixClient: mockPhoenixClient as any,
      });

      const result = await runner.runExperiment({
        datasetName: 'test-dataset',
        experimentName: 'test-experiment',
        task: async () => ({ result: 'ok' }),
        evaluators: [evaluator],
      });

      expect(evalCalls.length).toBe(2);
      expect(result.results[0]!.evaluations?.['test-eval']).toBeDefined();
    });

    test('should throw when dataset not found', async () => {
      const runner = new ExperimentRunner({
        phoenixClient: {
          ...mockPhoenixClient,
          getDatasetByName: mock(() => Promise.resolve(null)),
        } as any,
      });

      await expect(
        runner.runExperiment({
          datasetName: 'nonexistent',
          experimentName: 'test',
          task: async () => ({}),
        })
      ).rejects.toThrow('Dataset not found');
    });

    test('should require either datasetId or datasetName', async () => {
      const runner = new ExperimentRunner({
        phoenixClient: mockPhoenixClient as any,
      });

      await expect(
        runner.runExperiment({
          experimentName: 'test',
          task: async () => ({}),
        })
      ).rejects.toThrow('Either datasetId or datasetName must be provided');
    });
  });

  describe('concurrency', () => {
    test('should respect concurrency limit', async () => {
      const concurrentCalls: number[] = [];
      let currentConcurrent = 0;
      let maxConcurrent = 0;

      const task = mock(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        concurrentCalls.push(currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return { result: 'ok' };
      });

      // Create runner with concurrency of 2
      const runner = new ExperimentRunner({
        phoenixClient: {
          ...mockPhoenixClient,
          getDatasetExamples: mock(() => Promise.resolve([
            { id: 'ex-1', input: {} },
            { id: 'ex-2', input: {} },
            { id: 'ex-3', input: {} },
            { id: 'ex-4', input: {} },
          ] as DatasetExample[])),
        } as any,
        defaultConcurrency: 2,
      });

      await runner.runExperiment({
        datasetName: 'test-dataset',
        experimentName: 'test',
        task,
        concurrency: 2,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });
});
