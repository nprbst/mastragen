/**
 * Example workflow task.
 * T036: Demonstrates how to create tasks for experiment execution.
 */

import { MastraClient, createAgentTask, createWorkflowTask } from '../lib/mastra';
import type { Task } from '../lib/types';

/**
 * Example task configuration.
 */
export interface ExampleTaskConfig {
  /** Mastra server URL */
  mastraUrl?: string;
  /** Task type to create */
  type: 'agent' | 'workflow' | 'custom';
  /** Agent or workflow name */
  name?: string;
}

/**
 * Create an example agent task that sends messages to a Mastra agent.
 *
 * Expected input format:
 * {
 *   messages: [{ role: "user", content: "Your message" }]
 * }
 */
export function createExampleAgentTask(
  agentName: string,
  config?: { mastraUrl?: string }
): Task {
  const client = new MastraClient({ baseUrl: config?.mastraUrl });
  return createAgentTask(client, agentName);
}

/**
 * Create an example workflow task that executes a Mastra workflow.
 *
 * Expected input format varies by workflow.
 */
export function createExampleWorkflowTask(
  workflowName: string,
  config?: { mastraUrl?: string }
): Task {
  const client = new MastraClient({ baseUrl: config?.mastraUrl });
  return createWorkflowTask(client, workflowName);
}

/**
 * Create a mock task for testing the experiment framework.
 *
 * This task simulates processing and returns a structured response.
 */
export function createMockTask(options?: {
  /** Simulated latency in ms */
  latencyMs?: number;
  /** Error probability (0-1) */
  errorRate?: number;
}): Task {
  const latencyMs = options?.latencyMs ?? 100;
  const errorRate = options?.errorRate ?? 0;

  return async (input: Record<string, unknown>) => {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    // Simulate random errors
    if (Math.random() < errorRate) {
      throw new Error('Simulated task failure');
    }

    // Return a mock response based on input
    const messages = input.messages as Array<{ content: string }> | undefined;
    const userMessage = messages?.[messages.length - 1]?.content ?? 'No message provided';

    return {
      text: `Processed: ${userMessage}`,
      metadata: {
        inputKeys: Object.keys(input),
        timestamp: new Date().toISOString(),
      },
    };
  };
}

/**
 * Create a classification task that categorizes input.
 *
 * Expected input format:
 * {
 *   text: "Text to classify"
 * }
 */
export function createClassificationTask(categories: string[]): Task {
  return async (input: Record<string, unknown>) => {
    const text = input.text as string;
    if (!text) {
      throw new Error('Classification task requires text input');
    }

    // Simple keyword-based classification for demo
    const lowerText = text.toLowerCase();
    for (const category of categories) {
      if (lowerText.includes(category.toLowerCase())) {
        return { category, confidence: 0.8 };
      }
    }

    return { category: 'unknown', confidence: 0.5 };
  };
}

/**
 * Create an extraction task that extracts entities from input.
 *
 * Expected input format:
 * {
 *   text: "Text to extract from"
 * }
 */
export function createExtractionTask(entityTypes: string[]): Task {
  return async (input: Record<string, unknown>) => {
    const text = input.text as string;
    if (!text) {
      throw new Error('Extraction task requires text input');
    }

    // Simple pattern-based extraction for demo
    const entities: Record<string, string[]> = {};
    for (const type of entityTypes) {
      entities[type] = [];
    }

    // Extract emails
    if (entityTypes.includes('email')) {
      const emailMatches = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
      if (emailMatches) {
        entities.email = emailMatches;
      }
    }

    // Extract URLs
    if (entityTypes.includes('url')) {
      const urlMatches = text.match(/https?:\/\/[^\s]+/g);
      if (urlMatches) {
        entities.url = urlMatches;
      }
    }

    // Extract numbers
    if (entityTypes.includes('number')) {
      const numMatches = text.match(/\d+(\.\d+)?/g);
      if (numMatches) {
        entities.number = numMatches;
      }
    }

    return { entities };
  };
}

// Export default mock task for testing
export const mockTask = createMockTask();
