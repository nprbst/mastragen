#!/usr/bin/env bun
/**
 * mgen CLI - Command-line interface for Mastragen orchestrator.
 */
import { Command } from 'commander';
import { MgenClient } from './client.ts';
import { loadConfig } from './config.ts';
import { healthCommand } from './commands/health.ts';
import { projectCommand } from './commands/project.ts';
import { sessionCommand } from './commands/session.ts';
import { metricsCommand } from './commands/metrics.ts';
import { tailscaleCommand } from './commands/tailscale.ts';

const config = loadConfig();

const program = new Command();

program
  .name('mgen')
  .description('CLI for Mastragen orchestrator')
  .version('0.1.0')
  .option('--api-url <url>', 'Orchestrator API URL', config.apiUrl);

// Parse global options before creating client
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts();
  const apiUrl = (opts['apiUrl'] as string | undefined) || config.apiUrl;
  const client = new MgenClient(apiUrl);

  // Attach client to all subcommands
  thisCommand.commands.forEach((cmd) => {
    cmd.setOptionValue('_client', client);
  });
});

// Create client with default config for command registration
const defaultClient = new MgenClient(config.apiUrl);

// Register commands
program.addCommand(healthCommand(defaultClient));
program.addCommand(projectCommand(defaultClient));
program.addCommand(sessionCommand(defaultClient));
program.addCommand(metricsCommand(defaultClient));
program.addCommand(tailscaleCommand(defaultClient));

// Parse and execute
program.parse();
