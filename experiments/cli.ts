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
import { ArtifactExtractor } from './lib/artifact-extractor';
import { SyntheticGenerator } from './lib/synthetic-generator';
// ErrorAnalyzer would be used when we have full run data from Phoenix
import { exportExperiment } from './lib/handoff-exporter';
import { defaultPersonas } from './personas/default-personas';

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

  async extractArtifacts() {
    console.log('Extracting artifacts from Mastra...\n');
    const mastra = new MastraClient();
    const extractor = new ArtifactExtractor({ mastraClient: mastra });

    try {
      const artifacts = await extractor.extractAll();
      console.log(extractor.summarize(artifacts));
    } catch (error) {
      console.error('Failed to extract artifacts:', error);
      process.exit(1);
    }
  },

  async generateSynthetic(options: {
    target: string;
    count: number;
    output?: string;
  }) {
    console.log(`Generating ${options.count} synthetic examples for: ${options.target}\n`);

    const generator = new SyntheticGenerator();
    const mastra = new MastraClient();
    const extractor = new ArtifactExtractor({ mastraClient: mastra });

    try {
      // Try to get artifact context
      let artifacts;
      try {
        artifacts = await extractor.extractAll();
      } catch {
        console.log('Could not extract artifacts, generating without context.\n');
      }

      const examples = await generator.generateExamples({
        targetArtifact: options.target,
        artifacts,
        count: options.count,
        personas: defaultPersonas.slice(0, 4),
        includeEdgeCases: true,
      });

      if (options.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(options.output, JSON.stringify(examples, null, 2));
        console.log(`Generated ${examples.length} examples to ${options.output}`);
      } else {
        console.log('Generated examples:');
        console.log(JSON.stringify(examples, null, 2));
      }
    } catch (error) {
      console.error('Failed to generate synthetic data:', error);
      process.exit(1);
    }
  },

  async analyzeErrors(experimentId: string) {
    console.log(`Analyzing errors for experiment: ${experimentId}\n`);

    const phoenix = new PhoenixClient();

    try {
      const experiment = await phoenix.getExperiment(experimentId);
      if (!experiment) {
        console.error('Experiment not found');
        process.exit(1);
      }

      // Get experiment runs (mock for now - would need Phoenix API enhancement)
      console.log('Note: Full error analysis requires experiment run data.\n');
      console.log('Use --export command after running an experiment to get full analysis.\n');

      console.log(`Experiment: ${experiment.name}`);
      console.log(`Status: ${experiment.status}`);
      console.log(`View in Phoenix: ${phoenix.getExperimentUrl(experimentId)}`);
    } catch (error) {
      console.error('Error analysis failed:', error);
      process.exit(1);
    }
  },

  async exportHandoff(options: {
    experimentId: string;
    outputDir: string;
    formats?: string[];
  }) {
    console.log(`Exporting experiment ${options.experimentId}...\n`);

    const phoenix = new PhoenixClient();

    try {
      const experiment = await phoenix.getExperiment(options.experimentId);
      if (!experiment) {
        console.error('Experiment not found');
        process.exit(1);
      }

      // Note: This is a simplified export - real implementation would
      // fetch full run data from Phoenix
      const mockResult = {
        experimentId: options.experimentId,
        experimentUrl: phoenix.getExperimentUrl(options.experimentId),
        results: [],
        summary: { total: 0, succeeded: 0, failed: 0, avgLatencyMs: 0 },
      };

      const formats = (options.formats ?? ['json', 'markdown']) as Array<'json' | 'markdown' | 'csv'>;
      const result = await exportExperiment(mockResult, options.outputDir, {
        formats,
      });

      console.log('Export completed!');
      console.log('Files created:');
      for (const file of result.files) {
        console.log(`  - ${file}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    }
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
  --extract-artifacts       Extract artifacts from Mastra
  --generate <target>       Generate synthetic test data
  --count <num>             Number of examples to generate (default: 10)
  --output <file>           Output file for generated data
  --analyze <id>            Analyze errors in an experiment
  --export <id>             Export experiment for handoff
  --output-dir <dir>        Output directory for export (default: ./export)
  --formats <list>          Export formats: json,csv,markdown (default: json,markdown)
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

  # Extract Mastra artifacts
  bun run cli.ts --extract-artifacts

  # Generate synthetic test data
  bun run cli.ts --generate "chat-agent" --count 20 --output examples.json

  # Export experiment for handoff
  bun run cli.ts --export "exp-abc123" --output-dir ./handoff --formats "json,markdown,csv"
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
      'extract-artifacts': { type: 'boolean' },
      generate: { type: 'string' },
      count: { type: 'string' },
      output: { type: 'string' },
      analyze: { type: 'string' },
      export: { type: 'string' },
      'output-dir': { type: 'string' },
      formats: { type: 'string' },
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

  if (values['extract-artifacts']) {
    await commands.extractArtifacts();
    return;
  }

  if (values.generate) {
    await commands.generateSynthetic({
      target: values.generate,
      count: parseInt(values.count ?? '10', 10),
      output: values.output,
    });
    return;
  }

  if (values.analyze) {
    await commands.analyzeErrors(values.analyze);
    return;
  }

  if (values.export) {
    await commands.exportHandoff({
      experimentId: values.export,
      outputDir: values['output-dir'] ?? './export',
      formats: values.formats?.split(','),
    });
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
