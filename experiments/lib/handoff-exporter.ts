/**
 * Handoff export utility for experiment results.
 * T058-T060: Export experiment data in various formats.
 */

import type { ExperimentResult, RunResult, EvaluationResult } from './types';
import type { ErrorAnalysisResult } from './error-analyzer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export format options.
 */
export type ExportFormat = 'json' | 'csv' | 'markdown' | 'all';

/**
 * Handoff package contents.
 */
export interface HandoffPackage {
  /** Experiment metadata */
  experiment: {
    id: string;
    url: string;
    exportedAt: string;
  };
  /** Summary statistics */
  summary: ExperimentResult['summary'];
  /** All run results */
  results: RunResult[];
  /** Error analysis (if available) */
  errorAnalysis?: ErrorAnalysisResult;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Export configuration.
 */
export interface ExportConfig {
  /** Output directory */
  outputDir: string;
  /** Base filename (without extension) */
  filename?: string;
  /** Formats to export */
  formats?: ExportFormat[];
  /** Include raw results */
  includeRawResults?: boolean;
  /** Include error analysis */
  includeErrorAnalysis?: boolean;
}

/**
 * Export result.
 */
export interface ExportResult {
  /** Files created */
  files: string[];
  /** Export timestamp */
  exportedAt: string;
}

/**
 * Handoff exporter for experiment data.
 */
export class HandoffExporter {
  /**
   * Export experiment results.
   */
  async export(
    experiment: ExperimentResult,
    config: ExportConfig,
    errorAnalysis?: ErrorAnalysisResult
  ): Promise<ExportResult> {
    const formats = config.formats ?? ['json', 'markdown'];
    const filename = config.filename ?? `experiment-${experiment.experimentId}`;
    const files: string[] = [];

    // Ensure output directory exists
    await mkdir(config.outputDir, { recursive: true });

    // Create handoff package
    const pkg: HandoffPackage = {
      experiment: {
        id: experiment.experimentId,
        url: experiment.experimentUrl,
        exportedAt: new Date().toISOString(),
      },
      summary: experiment.summary,
      results: config.includeRawResults !== false ? experiment.results : [],
      errorAnalysis: config.includeErrorAnalysis !== false ? errorAnalysis : undefined,
    };

    // Export each format
    for (const format of formats) {
      if (format === 'all') {
        // Export all formats
        files.push(await this.exportJson(pkg, config.outputDir, filename));
        files.push(await this.exportCsv(pkg, config.outputDir, filename));
        files.push(await this.exportMarkdown(pkg, config.outputDir, filename));
      } else if (format === 'json') {
        files.push(await this.exportJson(pkg, config.outputDir, filename));
      } else if (format === 'csv') {
        files.push(await this.exportCsv(pkg, config.outputDir, filename));
      } else if (format === 'markdown') {
        files.push(await this.exportMarkdown(pkg, config.outputDir, filename));
      }
    }

    return {
      files,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Export as JSON.
   */
  private async exportJson(
    pkg: HandoffPackage,
    outputDir: string,
    filename: string
  ): Promise<string> {
    const filepath = join(outputDir, `${filename}.json`);
    await writeFile(filepath, JSON.stringify(pkg, null, 2));
    return filepath;
  }

  /**
   * Export as CSV.
   */
  private async exportCsv(
    pkg: HandoffPackage,
    outputDir: string,
    filename: string
  ): Promise<string> {
    const filepath = join(outputDir, `${filename}.csv`);

    // Build CSV header
    const headers = [
      'run_id',
      'example_id',
      'input',
      'output',
      'error',
      'latency_ms',
      'evaluations',
    ];

    // Build CSV rows
    const rows = pkg.results.map((result) => [
      this.escapeCSV(result.runId),
      this.escapeCSV(result.example.id),
      this.escapeCSV(JSON.stringify(result.example.input)),
      this.escapeCSV(JSON.stringify(result.output ?? '')),
      this.escapeCSV(result.error ?? ''),
      result.latencyMs.toString(),
      this.escapeCSV(this.formatEvaluations(result.evaluations)),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    await writeFile(filepath, csv);
    return filepath;
  }

  /**
   * Export as Markdown.
   */
  private async exportMarkdown(
    pkg: HandoffPackage,
    outputDir: string,
    filename: string
  ): Promise<string> {
    const filepath = join(outputDir, `${filename}.md`);
    const lines: string[] = [];

    // Header
    lines.push(`# Experiment Handoff: ${pkg.experiment.id}\n`);
    lines.push(`**Phoenix URL:** ${pkg.experiment.url}`);
    lines.push(`**Exported:** ${pkg.experiment.exportedAt}\n`);

    // Summary
    lines.push('## Summary\n');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Runs | ${pkg.summary.total} |`);
    lines.push(`| Succeeded | ${pkg.summary.succeeded} |`);
    lines.push(`| Failed | ${pkg.summary.failed} |`);
    lines.push(`| Avg Latency | ${pkg.summary.avgLatencyMs.toFixed(2)}ms |`);
    lines.push('');

    // Success rate
    const successRate = pkg.summary.total > 0
      ? ((pkg.summary.succeeded / pkg.summary.total) * 100).toFixed(1)
      : '0';
    lines.push(`**Success Rate:** ${successRate}%\n`);

    // Results table
    if (pkg.results.length > 0) {
      lines.push('## Results\n');
      lines.push(`| Run ID | Example | Status | Latency |`);
      lines.push(`|--------|---------|--------|---------|`);

      for (const result of pkg.results) {
        const status = result.error ? '❌ Failed' : '✅ Success';
        lines.push(
          `| ${result.runId.slice(0, 8)} | ${result.example.id} | ${status} | ${result.latencyMs}ms |`
        );
      }
      lines.push('');
    }

    // Failed runs details
    const failedRuns = pkg.results.filter((r) => r.error);
    if (failedRuns.length > 0) {
      lines.push('## Failed Runs\n');
      for (const run of failedRuns) {
        lines.push(`### ${run.runId}\n`);
        lines.push(`**Error:** \`${run.error}\`\n`);
        lines.push(`**Input:**`);
        lines.push('```json');
        lines.push(JSON.stringify(run.example.input, null, 2));
        lines.push('```\n');
      }
    }

    // Evaluation summary
    const runsWithEvals = pkg.results.filter((r) => r.evaluations);
    if (runsWithEvals.length > 0) {
      lines.push('## Evaluations\n');

      // Aggregate scores by evaluator
      const evalScores: Record<string, number[]> = {};
      for (const run of runsWithEvals) {
        if (!run.evaluations) continue;
        for (const [name, eval_] of Object.entries(run.evaluations)) {
          if (!evalScores[name]) evalScores[name] = [];
          if (eval_.score !== undefined) {
            evalScores[name].push(eval_.score);
          }
        }
      }

      lines.push(`| Evaluator | Avg Score | Min | Max |`);
      lines.push(`|-----------|-----------|-----|-----|`);
      for (const [name, scores] of Object.entries(evalScores)) {
        if (scores.length === 0) continue;
        const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
        const min = Math.min(...scores).toFixed(3);
        const max = Math.max(...scores).toFixed(3);
        lines.push(`| ${name} | ${avg} | ${min} | ${max} |`);
      }
      lines.push('');
    }

    // Error analysis
    if (pkg.errorAnalysis && pkg.errorAnalysis.categories.length > 0) {
      lines.push('## Error Analysis\n');
      lines.push(`**Categories Identified:** ${pkg.errorAnalysis.categories.length}`);
      lines.push(`**Relationships Found:** ${pkg.errorAnalysis.relationships.length}\n`);

      for (const cat of pkg.errorAnalysis.categories) {
        lines.push(`### ${cat.name}`);
        lines.push(`*Severity: ${cat.severity} | Count: ${cat.count}*\n`);
        lines.push(cat.description + '\n');
      }

      if (pkg.errorAnalysis.improvements.length > 0) {
        lines.push('### Suggested Improvements\n');
        for (const imp of pkg.errorAnalysis.improvements) {
          lines.push(`- **${imp.title}** (Priority: ${imp.priority})`);
          lines.push(`  ${imp.description}`);
        }
        lines.push('');
      }
    }

    await writeFile(filepath, lines.join('\n'));
    return filepath;
  }

  /**
   * Escape CSV value.
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Format evaluations for CSV.
   */
  private formatEvaluations(
    evaluations?: Record<string, EvaluationResult>
  ): string {
    if (!evaluations) return '';
    return Object.entries(evaluations)
      .map(([name, e]) => `${name}:${e.score ?? e.label ?? 'N/A'}`)
      .join('; ');
  }
}

/**
 * Create a handoff exporter.
 */
export function createHandoffExporter(): HandoffExporter {
  return new HandoffExporter();
}

/**
 * Quick export function for CLI usage.
 */
export async function exportExperiment(
  experiment: ExperimentResult,
  outputDir: string,
  options?: {
    filename?: string;
    formats?: ExportFormat[];
    errorAnalysis?: ErrorAnalysisResult;
  }
): Promise<ExportResult> {
  const exporter = new HandoffExporter();
  return exporter.export(experiment, {
    outputDir,
    filename: options?.filename,
    formats: options?.formats,
  }, options?.errorAnalysis);
}
