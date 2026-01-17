/**
 * Session commands - manage development sessions.
 */
import { Command } from 'commander';
import { MgenClient, ApiError } from '../client.ts';
import {
  formatSessionCreated,
  formatSession,
  formatSessionTable,
  formatResumed,
  success,
  error,
} from '../output.ts';

export function sessionCommand(client: MgenClient): Command {
  const session = new Command('session')
    .description('Manage development sessions')
    .alias('s');

  // session create
  session
    .command('create')
    .description('Create a new development session')
    .requiredOption('-p, --project <id>', 'Project ID')
    .requiredOption('-n, --name <name>', 'Artifact name (lowercase, hyphens allowed)')
    .requiredOption('-e, --env <environment>', 'Environment (e.g., dev, staging)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const result = await client.createSession({
          projectId: options.project,
          artifactName: options.name,
          environment: options.env,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatSessionCreated(result));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Not found: ${err.message}`));
          } else if (err.status === 409) {
            console.error(error(`Session already exists: ${err.message}`));
          } else if (err.status === 400) {
            console.error(error(`Validation error: ${err.message}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session list (alias: ls)
  session
    .command('list')
    .alias('ls')
    .description('List sessions')
    .option('-s, --state <state>', 'Filter by state (active, suspended)')
    .option('-p, --project <id>', 'Filter by project ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const sessions = await client.listSessions({
          state: options.state,
          projectId: options.project,
        });

        if (options.json) {
          console.log(JSON.stringify(sessions, null, 2));
        } else {
          console.log(formatSessionTable(sessions));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(error(`API error: ${err.message}`));
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session get <id>
  session
    .command('get <id>')
    .description('Get session details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const sessionData = await client.getSession(id);

        if (options.json) {
          console.log(JSON.stringify(sessionData, null, 2));
        } else {
          console.log(formatSession(sessionData));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${id}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session suspend <id>
  session
    .command('suspend <id>')
    .description('Suspend an active session')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const result = await client.suspendSession(id);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(success(`Session ${id} suspended`));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${id}`));
          } else if (err.status === 400) {
            console.error(error(`Cannot suspend: ${err.message}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session resume <id>
  session
    .command('resume <id>')
    .description('Resume a suspended session')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const result = await client.resumeSession(id);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatResumed(result));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${id}`));
          } else if (err.status === 400) {
            console.error(error(`Cannot resume: ${err.message}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  return session;
}
