/**
 * Unit tests for error analyzer.
 * T057: Tests for error analysis functionality.
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import {
  ErrorAnalyzer,
  type ErrorCategory,
  type CategoryRelationship,
  type ImprovementSuggestion,
  type ErrorAnalysisResult,
} from './error-analyzer';
import type { ExperimentResult } from './types';

describe('ErrorAnalyzer', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('configuration', () => {
    test('should accept custom configuration', () => {
      const analyzer = new ErrorAnalyzer({
        model: 'claude-haiku-4-20250514',
        maxTokens: 2048,
      });
      expect(analyzer).toBeDefined();
    });

    test('should use default configuration', () => {
      const analyzer = new ErrorAnalyzer();
      expect(analyzer).toBeDefined();
    });
  });

  describe('analyzeExperiment with no errors', () => {
    test('should return empty analysis when no failures', async () => {
      const analyzer = new ErrorAnalyzer();

      const experiment: ExperimentResult = {
        experimentId: 'exp-1',
        experimentUrl: 'http://phoenix:6006/exp-1',
        results: [
          {
            runId: 'run-1',
            example: { id: 'ex-1', input: { text: 'hello' } },
            output: { response: 'world' },
            latencyMs: 100,
          },
        ],
        summary: { total: 1, succeeded: 1, failed: 0, avgLatencyMs: 100 },
      };

      const analysis = await analyzer.analyzeExperiment(experiment);

      expect(analysis.summary.totalErrors).toBe(0);
      expect(analysis.categories).toHaveLength(0);
      expect(analysis.relationships).toHaveLength(0);
      expect(analysis.improvements).toHaveLength(0);
    });
  });

  describe('generateReport', () => {
    test('should generate markdown report from analysis', () => {
      const analyzer = new ErrorAnalyzer();

      const analysis: ErrorAnalysisResult = {
        summary: {
          totalErrors: 5,
          uniqueErrorMessages: 3,
          categoriesIdentified: 2,
          relationshipsFound: 1,
        },
        categories: [
          {
            id: 'timeout-errors',
            name: 'Timeout Errors',
            description: 'Requests exceeding time limit',
            examples: ['Request timeout after 30s', 'Connection timeout'],
            count: 3,
            severity: 'high',
          },
          {
            id: 'validation-errors',
            name: 'Validation Errors',
            description: 'Input validation failures',
            examples: ['Invalid input format'],
            count: 2,
            severity: 'medium',
          },
        ],
        relationships: [
          {
            from: 'timeout-errors',
            to: 'validation-errors',
            type: 'masks',
            description: 'Timeouts may hide underlying validation issues',
            confidence: 0.7,
          },
        ],
        improvements: [
          {
            id: 'imp-1',
            title: 'Increase timeout limits',
            description: 'Consider increasing request timeouts for complex operations',
            addressesCategories: ['timeout-errors'],
            priority: 'high',
            impact: 'high',
            effort: 'low',
          },
        ],
        analyzedAt: '2024-01-01T00:00:00Z',
      };

      const report = analyzer.generateReport(analysis);

      expect(report).toContain('# Error Analysis Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('**Total Errors:** 5');
      expect(report).toContain('## Error Categories');
      expect(report).toContain('### Timeout Errors');
      expect(report).toContain('**Severity:** high');
      expect(report).toContain('## Relationships');
      expect(report).toContain('masks');
      expect(report).toContain('## Suggested Improvements');
      expect(report).toContain('### Increase timeout limits');
    });

    test('should handle empty analysis', () => {
      const analyzer = new ErrorAnalyzer();

      const analysis: ErrorAnalysisResult = {
        summary: {
          totalErrors: 0,
          uniqueErrorMessages: 0,
          categoriesIdentified: 0,
          relationshipsFound: 0,
        },
        categories: [],
        relationships: [],
        improvements: [],
        analyzedAt: '2024-01-01T00:00:00Z',
      };

      const report = analyzer.generateReport(analysis);

      expect(report).toContain('# Error Analysis Report');
      expect(report).toContain('**Total Errors:** 0');
      expect(report).not.toContain('## Error Categories');
      expect(report).not.toContain('## Relationships');
      expect(report).not.toContain('## Suggested Improvements');
    });
  });
});

describe('Error Analysis Types', () => {
  describe('ErrorCategory', () => {
    test('should have correct structure', () => {
      const category: ErrorCategory = {
        id: 'test-category',
        name: 'Test Category',
        description: 'A test category for errors',
        examples: ['Error 1', 'Error 2'],
        count: 2,
        severity: 'medium',
      };

      expect(category.id).toBe('test-category');
      expect(category.examples).toHaveLength(2);
      expect(['low', 'medium', 'high', 'critical']).toContain(category.severity);
    });
  });

  describe('CategoryRelationship', () => {
    test('should have valid relationship types', () => {
      const relationship: CategoryRelationship = {
        from: 'cat-1',
        to: 'cat-2',
        type: 'causes',
        description: 'One causes the other',
        confidence: 0.85,
      };

      expect(['causes', 'precedes', 'correlates', 'masks']).toContain(relationship.type);
      expect(relationship.confidence).toBeGreaterThanOrEqual(0);
      expect(relationship.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('ImprovementSuggestion', () => {
    test('should have correct priority levels', () => {
      const suggestion: ImprovementSuggestion = {
        id: 'sug-1',
        title: 'Test Suggestion',
        description: 'A test improvement suggestion',
        addressesCategories: ['cat-1', 'cat-2'],
        priority: 'high',
        impact: 'medium',
        effort: 'low',
      };

      expect(['low', 'medium', 'high']).toContain(suggestion.priority);
      expect(['low', 'medium', 'high']).toContain(suggestion.impact);
      expect(['low', 'medium', 'high']).toContain(suggestion.effort);
      expect(suggestion.addressesCategories).toHaveLength(2);
    });
  });
});
