#!/usr/bin/env bun
/**
 * Experiment framework CLI.
 * T037-T038: CLI for listing datasets/tasks, running experiments, viewing results.
 */

import { parseArgs } from 'util';
import { PhoenixClient } from './lib/phoenix';
import { MastraClient } from './lib/mastra';
import { ExperimentRunner } from './lib/runner';
import { createAccuracyEvaluator } from './evaluators/accuracy';
import { createRelevanceEvaluator } from './evaluators/relevance';
import { mockTask } from './tasks/example-workflow';

/**
 * CLI command handlers.
 */
const commands = {
  async listDatasets() {
    console.log('Listing datasets from Phoenix...\n');
    const phoenix = new PhoenixClient();
    const datasets = await phoenix.listDatasets();

    if (datasets.length === 0) {
      console.log('No datasets found.');
      return;
    }

    console.log('Available datasets:');
    for (const ds of datasets) {
      console.log(`  - ${ds.name} (${ds.exampleCount} examples)`);
      console.log(`    ID: ${ds.id}`);
      if (ds.description) {
        console.log(`    Description: ${ds.description}`);
      }
    }
  },

  async listTasks() {
    console.log('Listing available tasks from Mastra...\n');
    const mastra = new MastraClient();

    try {
      const agents = await mastra.listAgents();
      console.log('Agents:');
      for (const agent of agents) {
        console.log(`  - agent:${agent}`);
      }

      const workflows = await mastra.listWorkflows();
      console.log('\nWorkflows:');
      for (const workflow of workflows) {
        console.log(`  - workflow:${workflow}`);
      }

      const tools = await mastra.listTools();
      console.log('\nTools:');
      for (const tool of tools) {
        console.log(`  - tool:${tool}`);
      }
    } catch (error) {
      console.log('Could not connect to Mastra server.');
      console.log('Using mock tasks instead:');
      console.log('  - mock:default');
      console.log('  - mock:slow (500ms latency)');
      console.log('  - mock:error (10% error rate)');
    }
  },

  async runExperiment(options: {
    dataset: string;
    task: string;
    name?: string;
    description?: string;
    evaluators?: string[];
  }) {
    console.log(`Running experiment against dataset: ${options.dataset}`);
    console.log(`Using task: ${options.task}\n`);

    const phoenix = new PhoenixClient();
    const runner = new ExperimentRunner({ phoenixClient: phoenix });

    // Resolve task
    const task = resolveTask(options.task);

    // Resolve evaluators
    const evaluators = (options.evaluators ?? ['accuracy']).map(resolveEvaluator);

    try {
      const result = await runner.runExperiment({
        datasetName: options.dataset,
        experimentName: options.name ?? `experiment-${Date.now()}`,
        experimentDescription: options.description,
        task,
        evaluators,
      });

      console.log('\nExperiment completed!');
      console.log(`  ID: ${result.experimentId}`);
      console.log(`  URL: ${result.experimentUrl}`);
      console.log('\nSummary:');
      console.log(`  Total runs: ${result.summary.total}`);
      console.log(`  Succeeded: ${result.summary.succeeded}`);
      console.log(`  Failed: ${result.summary.failed}`);
      console.log(`  Avg latency: ${result.summary.avgLatencyMs.toFixed(0)}ms`);
    } catch (error) {
      console.error('Experiment failed:', error);
      process.exit(1);
    }
  },

  async getResults(experimentId: string) {
    console.log(`Fetching results for experiment: ${experimentId}\n`);
    const phoenix = new PhoenixClient();

    const experiment = await phoenix.getExperiment(experimentId);
    if (!experiment) {
      console.error('Experiment not found');
      process.exit(1);
    }

    console.log(`Experiment: ${experiment.name}`);
    console.log(`Status: ${experiment.status}`);
    console.log(`Dataset ID: ${experiment.datasetId}`);
    console.log(`Created: ${experiment.createdAt}`);
    if (experiment.description) {
      console.log(`Description: ${experiment.description}`);
    }
    console.log(`\nView in Phoenix: ${phoenix.getExperimentUrl(experimentId)}`);
  },

  help() {
    console.log(`
Experiment Framework CLI

Usage:
  bun run cli.ts [command] [options]

Commands:
  --list-datasets           List all datasets in Phoenix
  --list-tasks              List available tasks from Mastra
  --dataset <name>          Run experiment with dataset
  --task <name>             Task to run (e.g., mock:default, agent:myAgent)
  --name <name>             Experiment name (optional)
  --description <desc>      Experiment description (optional)
  --evaluators <list>       Comma-separated evaluators (default: accuracy)
  --results <id>            Get results for an experiment
  --help                    Show this help message

Examples:
  # List available datasets
  bun run cli.ts --list-datasets

  # List available tasks
  bun run cli.ts --list-tasks

  # Run experiment with mock task
  bun run cli.ts --dataset "test-dataset" --task "mock:default"

  # Run experiment with evaluators
  bun run cli.ts --dataset "golden" --task "agent:myAgent" --evaluators "accuracy,relevance"

  # Get experiment results
  bun run cli.ts --results "exp-abc123"
`);
  },
};

/**
 * Resolve task name to Task function.
 */
function resolveTask(taskName: string) {
  const [type, name] = taskName.split(':');

  if (type === 'mock') {
    switch (name) {
      case 'slow':
        return mockTask; // Would use createMockTask({ latencyMs: 500 })
      case 'error':
        return mockTask; // Would use createMockTask({ errorRate: 0.1 })
      default:
        return mockTask;
    }
  }

  // For now, return mock task. Real implementation would create
  // agent/workflow tasks using MastraClient.
  console.log(`Warning: Using mock task for ${taskName}`);
  return mockTask;
}

/**
 * Resolve evaluator name to Evaluator.
 */
function resolveEvaluator(name: string) {
  switch (name) {
    case 'accuracy':
      return createAccuracyEvaluator();
    case 'relevance':
      return createRelevanceEvaluator();
    default:
      throw new Error(`Unknown evaluator: ${name}`);
  }
}

/**
 * Main CLI entry point.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      'list-datasets': { type: 'boolean' },
      'list-tasks': { type: 'boolean' },
      dataset: { type: 'string' },
      task: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      evaluators: { type: 'string' },
      results: { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: false,
  });

  if (values.help) {
    commands.help();
    return;
  }

  if (values['list-datasets']) {
    await commands.listDatasets();
    return;
  }

  if (values['list-tasks']) {
    await commands.listTasks();
    return;
  }

  if (values.results) {
    await commands.getResults(values.results);
    return;
  }

  if (values.dataset && values.task) {
    await commands.runExperiment({
      dataset: values.dataset,
      task: values.task,
      name: values.name,
      description: values.description,
      evaluators: values.evaluators?.split(','),
    });
    return;
  }

  // Default to help
  commands.help();
}

// Run CLI
main().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
