/**
 * Relevance evaluator template.
 * T035: LLM-based evaluator for semantic relevance scoring.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Evaluator, EvaluationResult } from '../lib/types';

/**
 * Relevance evaluator configuration.
 */
export interface RelevanceEvaluatorConfig {
  /** LLM model to use for evaluation */
  model?: 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250514';
  /** Custom evaluation prompt template */
  promptTemplate?: string;
  /** Minimum relevance score threshold (0-1) */
  threshold?: number;
}

/**
 * Default relevance evaluation prompt.
 */
const DEFAULT_PROMPT_TEMPLATE = `You are evaluating the relevance and quality of an AI assistant's response.

INPUT:
{{input}}

OUTPUT:
{{output}}

{{#expected}}
EXPECTED OUTPUT:
{{expected}}
{{/expected}}

Rate the response on a scale of 0 to 1:
- 1.0: Perfect response - directly addresses the input, accurate, helpful
- 0.8: Good response - mostly on topic, minor issues
- 0.6: Adequate response - partially addresses input, some relevance
- 0.4: Poor response - misses key points, somewhat off-topic
- 0.2: Very poor response - largely irrelevant or incorrect
- 0.0: Completely irrelevant or harmful

Respond in JSON format:
{"score": <number>, "label": "<relevant|partially_relevant|irrelevant>", "explanation": "<brief explanation>"}`;

/**
 * Create a relevance evaluator using LLM-as-judge.
 */
export function createRelevanceEvaluator(
  config: RelevanceEvaluatorConfig = {}
): Evaluator {
  const client = new Anthropic();
  const model = config.model ?? 'claude-haiku-4-20250514';
  const promptTemplate = config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  const threshold = config.threshold ?? 0.6;

  return {
    name: 'relevance',
    kind: 'LLM',
    model,
    evaluate: async ({ input, output, expected }) => {
      // Build the evaluation prompt
      let prompt = promptTemplate
        .replace('{{input}}', JSON.stringify(input, null, 2))
        .replace('{{output}}', JSON.stringify(output, null, 2));

      // Handle optional expected output
      if (expected) {
        prompt = prompt
          .replace('{{#expected}}', '')
          .replace('{{/expected}}', '')
          .replace('{{expected}}', JSON.stringify(expected, null, 2));
      } else {
        prompt = prompt.replace(/\{\{#expected\}\}[\s\S]*?\{\{\/expected\}\}/g, '');
      }

      try {
        const response = await client.messages.create({
          model,
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        // Extract text content
        const textContent = response.content.find((c) => c.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          return {
            score: undefined,
            label: 'error',
            explanation: 'No text response from evaluator LLM',
          };
        }

        // Parse JSON response
        const result = parseEvaluationResponse(textContent.text);

        // Add label based on threshold if not provided
        if (!result.label) {
          result.label = result.score !== undefined && result.score >= threshold
            ? 'relevant'
            : result.score !== undefined && result.score >= threshold * 0.5
            ? 'partially_relevant'
            : 'irrelevant';
        }

        return result;
      } catch (error) {
        return {
          score: undefined,
          label: 'error',
          explanation: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Parse the LLM's JSON evaluation response.
 */
function parseEvaluationResponse(text: string): EvaluationResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        label: 'error',
        explanation: 'Could not parse evaluator response as JSON',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      score?: number;
      label?: string;
      explanation?: string;
    };

    return {
      score: typeof parsed.score === 'number' ? parsed.score : undefined,
      label: parsed.label,
      explanation: parsed.explanation,
    };
  } catch {
    return {
      label: 'error',
      explanation: 'Failed to parse evaluator JSON response',
    };
  }
}

// Export default evaluator
export const relevanceEvaluator = createRelevanceEvaluator();
