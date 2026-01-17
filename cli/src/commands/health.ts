/**
 * Health command - checks orchestrator API health status.
 */
import { Command } from 'commander';
import { MgenClient, ApiError } from '../client.ts';
import { formatHealth, error } from '../output.ts';

export function healthCommand(client: MgenClient): Command {
  return new Command('health')
    .description('Check orchestrator health status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const health = await client.health();

        if (options.json) {
          console.log(JSON.stringify(health, null, 2));
        } else {
          console.log(formatHealth(health));
        }

        // Exit with error code if unhealthy
        if (health.status !== 'ok') {
          process.exit(1);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(error(`API error: ${err.message}`));
        } else if (err instanceof Error) {
          console.error(error(`Connection failed: ${err.message}`));
        }
        process.exit(1);
      }
    });
}
