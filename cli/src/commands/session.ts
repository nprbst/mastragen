/**
 * Session commands - manage development sessions.
 */
import { Command } from 'commander';
import { select, text, intro, outro } from '@clack/prompts';
import { MgenClient, ApiError } from '../client.ts';
import {
  formatSessionCreated,
  formatSession,
  formatSessionTable,
  formatResumed,
  success,
  error,
} from '../output.ts';
import { handleCancel } from '../prompts.ts';

export function sessionCommand(client: MgenClient): Command {
  const session = new Command('session')
    .description('Manage development sessions')
    .alias('s');

  // session create
  session
    .command('create')
    .description('Create a new development session')
    .option('-p, --project <id>', 'Project ID')
    .option('-n, --name <name>', 'Artifact name (lowercase, hyphens allowed)')
    .option('-e, --env <environment>', 'Environment (e.g., dev, staging)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        // Interactive mode if any required options are missing
        const needsInteractive = !options.project || !options.name || !options.env;
        if (needsInteractive && !options.json) {
          intro('Create a new session');
        }

        // 1. Project selection
        let projectId = options.project as string | undefined;
        if (!projectId) {
          const projects = await client.listProjects();

          if (projects.length === 0) {
            console.error(error('No projects found. Create a project first.'));
            process.exit(1);
          }

          const selected = await select({
            message: 'Select a project:',
            options: projects.map((p) => ({
              value: p.id,
              label: p.name,
              hint: p.githubRepo,
            })),
          });

          projectId = handleCancel(selected);
        }

        // 2. Artifact name
        let artifactName = options.name as string | undefined;
        if (!artifactName) {
          const nameInput = await text({
            message: 'Artifact name:',
            placeholder: 'my-feature',
            validate: (value) => {
              if (!value) return 'Name is required';
              if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
                return 'Must be lowercase alphanumeric with hyphens';
              }
              if (value.length > 50) return 'Must be 50 characters or less';
            },
          });

          artifactName = handleCancel(nameInput);
        }

        // 3. Environment selection
        let environment = options.env as string | undefined;
        if (!environment) {
          const projectDetail = await client.getProject(projectId);
          const environments = projectDetail.environments;

          if (environments.length === 0) {
            console.error(error('No environments configured for this project.'));
            process.exit(1);
          }

          const envSelected = await select({
            message: 'Select environment:',
            options: environments.map((e) => ({ value: e, label: e })),
          });

          environment = handleCancel(envSelected);
        }

        // Create session
        const result = await client.createSession({
          projectId,
          artifactName,
          environment,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (needsInteractive) {
            outro('Session created!');
          }
          console.log(formatSessionCreated(result));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Not found: ${err.message}`));
          } else if (err.status === 409) {
            console.error(error(`Session already exists: ${err.message}`));
          } else if (err.status === 400) {
            const body = err.body as { issues?: string[] };
            if (body.issues?.length) {
              console.error(error(`Validation error:\n  - ${body.issues.join('\n  - ')}`));
            } else {
              console.error(error(`Validation error: ${err.message}`));
            }
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
