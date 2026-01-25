/**
 * Accuracy evaluator template.
 * T034: Evaluates exact or fuzzy match between output and expected values.
 */

import type { Evaluator, EvaluationResult } from '../lib/types';

/**
 * Accuracy evaluator configuration.
 */
export interface AccuracyEvaluatorConfig {
  /** Fields to compare (if not specified, compares entire output) */
  fields?: string[];
  /** Use fuzzy matching for strings (case-insensitive, trimmed) */
  fuzzy?: boolean;
  /** Threshold for numeric comparisons */
  numericThreshold?: number;
}

/**
 * Create an accuracy evaluator.
 */
export function createAccuracyEvaluator(
  config: AccuracyEvaluatorConfig = {}
): Evaluator {
  return {
    name: 'accuracy',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => {
      if (!expected) {
        return {
          score: undefined,
          label: 'skipped',
          explanation: 'No expected output provided for comparison',
        };
      }

      const result = evaluateAccuracy(output, expected, config);
      return result;
    },
  };
}

/**
 * Evaluate accuracy between output and expected values.
 */
function evaluateAccuracy(
  output: unknown,
  expected: Record<string, unknown>,
  config: AccuracyEvaluatorConfig
): EvaluationResult {
  const fields = config.fields ?? Object.keys(expected);
  let matchCount = 0;
  const mismatches: string[] = [];

  for (const field of fields) {
    const expectedValue = expected[field];
    const outputValue = getNestedValue(output, field);

    if (valuesMatch(outputValue, expectedValue, config)) {
      matchCount++;
    } else {
      mismatches.push(
        `${field}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(outputValue)}`
      );
    }
  }

  const score = fields.length > 0 ? matchCount / fields.length : 1;
  const label = score === 1 ? 'exact_match' : score >= 0.5 ? 'partial_match' : 'mismatch';
  const explanation =
    mismatches.length > 0
      ? `Mismatches: ${mismatches.join('; ')}`
      : 'All fields match';

  return { score, label, explanation };
}

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Check if two values match according to configuration.
 */
function valuesMatch(
  actual: unknown,
  expected: unknown,
  config: AccuracyEvaluatorConfig
): boolean {
  // Null/undefined check
  if (actual === expected) return true;
  if (actual === null || actual === undefined) return false;
  if (expected === null || expected === undefined) return false;

  // String comparison
  if (typeof actual === 'string' && typeof expected === 'string') {
    if (config.fuzzy) {
      return actual.trim().toLowerCase() === expected.trim().toLowerCase();
    }
    return actual === expected;
  }

  // Numeric comparison
  if (typeof actual === 'number' && typeof expected === 'number') {
    const threshold = config.numericThreshold ?? 0;
    return Math.abs(actual - expected) <= threshold;
  }

  // Boolean comparison
  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    return actual === expected;
  }

  // Array comparison
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => valuesMatch(v, expected[i], config));
  }

  // Object comparison
  if (typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected as Record<string, unknown>);
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key) =>
      valuesMatch(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        config
      )
    );
  }

  // Deep equality fallback
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// Export default evaluator
export const accuracyEvaluator = createAccuracyEvaluator();
