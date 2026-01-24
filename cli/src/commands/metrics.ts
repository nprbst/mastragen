/**
 * Metrics command - fetch Prometheus metrics from orchestrator.
 */
import { Command } from 'commander';
import { MgenClient, ApiError } from '../client.ts';
import { error } from '../output.ts';

export function metricsCommand(client: MgenClient): Command {
  const metrics = new Command('metrics')
    .description('Fetch Prometheus metrics from orchestrator')
    .option('--filter <prefix>', 'Filter metrics by prefix (e.g., mastragen_sessions)')
    .option('--json', 'Output metrics as JSON (parsed from Prometheus format)')
    .action(async (options) => {
      try {
        const metricsText = await client.getMetrics();

        if (options.filter) {
          // Filter lines that start with the prefix (or are comments for those metrics)
          const prefix = options.filter as string;
          const lines = metricsText.split('\n');
          const filtered: string[] = [];
          let includeNext = false;

          for (const line of lines) {
            if (line.startsWith('# HELP ' + prefix) || line.startsWith('# TYPE ' + prefix)) {
              filtered.push(line);
              includeNext = true;
            } else if (line.startsWith(prefix)) {
              filtered.push(line);
              includeNext = false;
            } else if (includeNext && line.startsWith('#')) {
              filtered.push(line);
            } else {
              includeNext = false;
            }
          }

          if (options.json) {
            console.log(JSON.stringify(parsePrometheusMetrics(filtered.join('\n')), null, 2));
          } else {
            console.log(filtered.join('\n'));
          }
        } else if (options.json) {
          console.log(JSON.stringify(parsePrometheusMetrics(metricsText), null, 2));
        } else {
          console.log(metricsText);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error('Metrics endpoint not available. Is the orchestrator running Phase 4?'));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  return metrics;
}

/**
 * Parse Prometheus text format into structured JSON.
 */
function parsePrometheusMetrics(text: string): Record<string, unknown>[] {
  const metrics: Record<string, unknown>[] = [];
  const lines = text.split('\n');

  let currentHelp = '';
  let currentType = '';

  for (const line of lines) {
    if (line.startsWith('# HELP ')) {
      currentHelp = line.slice(7);
    } else if (line.startsWith('# TYPE ')) {
      currentType = line.slice(7);
    } else if (line && !line.startsWith('#')) {
      // Parse metric line: metric_name{label="value"} value
      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/);
      if (match) {
        const [, name, labelsStr, value] = match;
        const labels: Record<string, string> = {};

        if (labelsStr) {
          // Parse labels: {key="value",key2="value2"}
          const labelMatches = labelsStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g);
          for (const labelMatch of labelMatches) {
            labels[labelMatch[1]] = labelMatch[2];
          }
        }

        metrics.push({
          name,
          labels: Object.keys(labels).length > 0 ? labels : undefined,
          value: parseFloat(value) || value,
          help: currentHelp.startsWith(name) ? currentHelp.slice(name.length + 1) : undefined,
          type: currentType.startsWith(name) ? currentType.slice(name.length + 1) : undefined,
        });
      }
    }
  }

  return metrics;
}
