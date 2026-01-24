/**
 * Unit tests for handoff exporter.
 * T061: Tests for handoff export functionality.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { HandoffExporter, exportExperiment } from './handoff-exporter';
import type { ExperimentResult } from './types';
import type { ErrorAnalysisResult } from './error-analyzer';
import { mkdir, rm, readFile } from 'fs/promises';

describe('HandoffExporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/handoff-test-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const mockExperiment: ExperimentResult = {
    experimentId: 'exp-123',
    experimentUrl: 'http://phoenix:6006/experiments/exp-123',
    results: [
      {
        runId: 'run-1',
        example: { id: 'ex-1', input: { text: 'hello' } },
        output: { response: 'world' },
        latencyMs: 150,
        evaluations: {
          accuracy: { score: 0.95, label: 'high' },
        },
      },
      {
        runId: 'run-2',
        example: { id: 'ex-2', input: { text: 'test' } },
        output: null,
        error: 'Task timeout',
        latencyMs: 30000,
      },
    ],
    summary: {
      total: 2,
      succeeded: 1,
      failed: 1,
      avgLatencyMs: 15075,
    },
  };

  describe('export', () => {
    test('should export to JSON', async () => {
      const exporter = new HandoffExporter();
      const result = await exporter.export(mockExperiment, {
        outputDir: tempDir,
        filename: 'test-export',
        formats: ['json'],
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('test-export.json');

      const content = await readFile(result.files[0]!, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.experiment.id).toBe('exp-123');
      expect(parsed.summary.total).toBe(2);
      expect(parsed.results).toHaveLength(2);
    });

    test('should export to CSV', async () => {
      const exporter = new HandoffExporter();
      const result = await exporter.export(mockExperiment, {
        outputDir: tempDir,
        filename: 'test-export',
        formats: ['csv'],
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('test-export.csv');

      const content = await readFile(result.files[0]!, 'utf-8');
      const lines = content.split('\n');

      expect(lines[0]).toContain('run_id');
      expect(lines[0]).toContain('example_id');
      expect(lines[0]).toContain('latency_ms');
      expect(lines.length).toBeGreaterThan(1);
    });

    test('should export to Markdown', async () => {
      const exporter = new HandoffExporter();
      const result = await exporter.export(mockExperiment, {
        outputDir: tempDir,
        filename: 'test-export',
        formats: ['markdown'],
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('test-export.md');

      const content = await readFile(result.files[0]!, 'utf-8');

      expect(content).toContain('# Experiment Handoff');
      expect(content).toContain('exp-123');
      expect(content).toContain('## Summary');
      expect(content).toContain('Total Runs');
      expect(content).toContain('## Results');
      expect(content).toContain('## Failed Runs');
      expect(content).toContain('Task timeout');
    });

    test('should export all formats', async () => {
      const exporter = new HandoffExporter();
      const result = await exporter.export(mockExperiment, {
        outputDir: tempDir,
        filename: 'test-all',
        formats: ['all'],
      });

      expect(result.files).toHaveLength(3);

      const extensions = result.files.map((f) => f.split('.').pop());
      expect(extensions).toContain('json');
      expect(extensions).toContain('csv');
      expect(extensions).toContain('md');
    });

    test('should use default filename when not provided', async () => {
      const exporter = new HandoffExporter();
      const result = await exporter.export(mockExperiment, {
        outputDir: tempDir,
        formats: ['json'],
      });

      expect(result.files[0]).toContain('experiment-exp-123.json');
    });

    test('should include error analysis in export', async () => {
      const errorAnalysis: ErrorAnalysisResult = {
        summary: {
          totalErrors: 1,
          uniqueErrorMessages: 1,
          categoriesIdentified: 1,
          relationshipsFound: 0,
        },
        categories: [
          {
            id: 'timeout-errors',
            name: 'Timeout Errors',
            description: 'Requests timing out',
            examples: ['Task timeout'],
            count: 1,
            severity: 'high',
          },
        ],
        relationships: [],
        improvements: [
          {
            id: 'imp-1',
            title: 'Increase timeout',
            description: 'Consider increasing timeout limits',
            addressesCategories: ['timeout-errors'],
            priority: 'high',
            impact: 'high',
            effort: 'low',
          },
        ],
        analyzedAt: '2024-01-01T00:00:00Z',
      };

      const exporter = new HandoffExporter();
      const result = await exporter.export(
        mockExperiment,
        {
          outputDir: tempDir,
          filename: 'with-analysis',
          formats: ['markdown'],
          includeErrorAnalysis: true,
        },
        errorAnalysis
      );

      const content = await readFile(result.files[0]!, 'utf-8');

      expect(content).toContain('## Error Analysis');
      expect(content).toContain('Timeout Errors');
      expect(content).toContain('Suggested Improvements');
      expect(content).toContain('Increase timeout');
    });
  });

  describe('CSV escaping', () => {
    test('should escape commas in values', async () => {
      const expWithCommas: ExperimentResult = {
        ...mockExperiment,
        results: [
          {
            runId: 'run-1',
            example: { id: 'ex-1', input: { text: 'hello, world' } },
            output: { response: 'hi, there' },
            latencyMs: 100,
          },
        ],
      };

      const exporter = new HandoffExporter();
      const result = await exporter.export(expWithCommas, {
        outputDir: tempDir,
        filename: 'escaped',
        formats: ['csv'],
      });

      const content = await readFile(result.files[0]!, 'utf-8');
      // Commas in values should be escaped with quotes
      expect(content).toContain('"');
    });
  });

  describe('exportExperiment helper', () => {
    test('should provide quick export interface', async () => {
      const result = await exportExperiment(mockExperiment, tempDir, {
        filename: 'quick-export',
        formats: ['json'],
      });

      expect(result.files).toHaveLength(1);
      expect(result.exportedAt).toBeDefined();
    });
  });
});

describe('Markdown report content', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/md-test-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should include evaluation summary', async () => {
    const expWithEvals: ExperimentResult = {
      experimentId: 'exp-eval',
      experimentUrl: 'http://phoenix:6006/experiments/exp-eval',
      results: [
        {
          runId: 'run-1',
          example: { id: 'ex-1', input: {} },
          output: {},
          latencyMs: 100,
          evaluations: { accuracy: { score: 0.9 }, relevance: { score: 0.8 } },
        },
        {
          runId: 'run-2',
          example: { id: 'ex-2', input: {} },
          output: {},
          latencyMs: 100,
          evaluations: { accuracy: { score: 0.95 }, relevance: { score: 0.85 } },
        },
      ],
      summary: { total: 2, succeeded: 2, failed: 0, avgLatencyMs: 100 },
    };

    const exporter = new HandoffExporter();
    const result = await exporter.export(expWithEvals, {
      outputDir: tempDir,
      formats: ['markdown'],
    });

    const content = await readFile(result.files[0]!, 'utf-8');

    expect(content).toContain('## Evaluations');
    expect(content).toContain('accuracy');
    expect(content).toContain('relevance');
    expect(content).toContain('Avg Score');
  });

  test('should calculate correct success rate', async () => {
    const expWith75Percent: ExperimentResult = {
      experimentId: 'exp-75',
      experimentUrl: 'http://phoenix:6006/experiments/exp-75',
      results: [
        { runId: 'r1', example: { id: 'e1', input: {} }, output: {}, latencyMs: 100 },
        { runId: 'r2', example: { id: 'e2', input: {} }, output: {}, latencyMs: 100 },
        { runId: 'r3', example: { id: 'e3', input: {} }, output: {}, latencyMs: 100 },
        { runId: 'r4', example: { id: 'e4', input: {} }, output: {}, error: 'failed', latencyMs: 100 },
      ],
      summary: { total: 4, succeeded: 3, failed: 1, avgLatencyMs: 100 },
    };

    const exporter = new HandoffExporter();
    const result = await exporter.export(expWith75Percent, {
      outputDir: tempDir,
      formats: ['markdown'],
    });

    const content = await readFile(result.files[0]!, 'utf-8');
    expect(content).toContain('75.0%');
  });
});
