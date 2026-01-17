/**
 * Project commands - create, list, and view projects.
 */
import { Command } from 'commander';
import { MgenClient, ApiError } from '../client.ts';
import { formatProjectTable, formatProject, formatProjectCreated, formatEnvironmentAdded, error } from '../output.ts';

export function projectCommand(client: MgenClient): Command {
  const project = new Command('project')
    .description('Manage projects')
    .alias('p');

  // project create
  project
    .command('create')
    .description('Create a new project')
    .requiredOption('-n, --name <name>', 'Project name')
    .requiredOption('-r, --repo <org/repo>', 'GitHub repository (org/repo format)')
    .option('-b, --branch <branch>', 'Default branch', 'main')
    .option('-p, --prefix <prefix>', 'Branch prefix for sessions', 'mg/')
    .option('-m, --mastra-path <path>', 'Path to Mastra code within repo', '.')
    .option('-u, --ui-sandbox-path <path>', 'Path to UI sandbox within repo')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const projectData = await client.createProject({
          name: options.name,
          githubRepo: options.repo,
          defaultBranch: options.branch,
          branchPrefix: options.prefix,
          mastraPath: options.mastraPath,
          uiSandboxPath: options.uiSandboxPath,
        });

        if (options.json) {
          console.log(JSON.stringify(projectData, null, 2));
        } else {
          console.log(formatProjectCreated(projectData));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            console.error(error(`Project already exists: ${options.name}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // project list (alias: ls)
  project
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const projects = await client.listProjects();

        if (options.json) {
          console.log(JSON.stringify(projects, null, 2));
        } else {
          console.log(formatProjectTable(projects));
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

  // project get <id>
  project
    .command('get <id>')
    .description('Get project details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const projectData = await client.getProject(id);

        if (options.json) {
          console.log(JSON.stringify(projectData, null, 2));
        } else {
          console.log(formatProject(projectData));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Project not found: ${id}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // project env - environment management subcommand
  const env = new Command('env')
    .description('Manage project environments');

  // project env add <project-id>
  env
    .command('add <project-id>')
    .description('Add an environment to a project')
    .requiredOption('-n, --name <name>', 'Environment name (e.g., dev, staging, prod)')
    .option('-e, --env-var <key=value...>', 'Environment variables (can be specified multiple times)')
    .option('--json', 'Output as JSON')
    .action(async (projectId, options) => {
      try {
        // Parse environment variables from key=value format
        const envVars: Record<string, string> = {};
        if (options.envVar) {
          for (const item of options.envVar) {
            const [key, ...valueParts] = item.split('=');
            if (key && valueParts.length > 0) {
              envVars[key] = valueParts.join('=');
            }
          }
        }

        const environment = await client.addEnvironment(projectId, {
          name: options.name,
          envVars,
        });

        if (options.json) {
          console.log(JSON.stringify(environment, null, 2));
        } else {
          // Get project name for display
          const projectData = await client.getProject(projectId);
          console.log(formatEnvironmentAdded(projectData.name, environment));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Project not found: ${projectId}`));
          } else if (err.status === 409) {
            console.error(error(`Environment already exists: ${options.name}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // project env list <project-id>
  env
    .command('list <project-id>')
    .alias('ls')
    .description('List environments for a project')
    .option('--json', 'Output as JSON')
    .action(async (projectId, options) => {
      try {
        const environments = await client.listEnvironments(projectId);

        if (options.json) {
          console.log(JSON.stringify(environments, null, 2));
        } else {
          if (environments.length === 0) {
            console.log('No environments configured.');
          } else {
            for (const e of environments) {
              const varCount = Object.keys(e.envVars).length;
              console.log(`  ${e.name} (${varCount} vars)`);
            }
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Project not found: ${projectId}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  project.addCommand(env);

  return project;
}
