/**
 * Project commands - create, list, and view projects.
 */
import { Command } from 'commander';
import { text, intro, outro, select } from '@clack/prompts';
import { MgenClient, ApiError } from '../client.ts';
import { formatProjectTable, formatProject, formatProjectCreated, formatEnvironmentAdded, error } from '../output.ts';
import { handleCancel } from '../prompts.ts';

export function projectCommand(client: MgenClient): Command {
  const project = new Command('project')
    .description('Manage projects')
    .alias('p');

  // project create
  project
    .command('create')
    .description('Create a new project')
    .option('-n, --name <name>', 'Project name')
    .option('-r, --repo <org/repo>', 'GitHub repository (org/repo format)')
    .option('-b, --branch <branch>', 'Default branch', 'main')
    .option('-p, --prefix <prefix>', 'Branch prefix for sessions', 'mg/')
    .option('-m, --mastra-path <path>', 'Path to Mastra code within repo', '.')
    .option('-u, --ui-sandbox-path <path>', 'Path to UI sandbox within repo')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        // Interactive mode if any required options are missing
        const needsInteractive = !options.name || !options.repo;
        if (needsInteractive && !options.json) {
          intro('Create a new project');
        }

        // 1. Project name
        let name = options.name as string | undefined;
        if (!name) {
          const nameInput = await text({
            message: 'Project name:',
            placeholder: 'my-project',
            validate: (value) => {
              if (!value) return 'Name is required';
            },
          });
          name = handleCancel(nameInput);
        }

        // 2. GitHub repository
        let repo = options.repo as string | undefined;
        if (!repo) {
          const repoInput = await text({
            message: 'GitHub repository (org/repo):',
            placeholder: 'myorg/myrepo',
            validate: (value) => {
              if (!value) return 'Repository is required';
              if (!/^[^/]+\/[^/]+$/.test(value)) {
                return 'Must be in org/repo format';
              }
            },
          });
          repo = handleCancel(repoInput);
        }

        // 3. UI sandbox path (optional)
        let uiSandboxPath = options.uiSandboxPath as string | undefined;
        if (!uiSandboxPath && needsInteractive) {
          const uiPathInput = await text({
            message: 'UI sandbox path (leave empty to skip):',
            placeholder: 'packages/ui',
          });
          const uiPathValue = handleCancel(uiPathInput);
          if (uiPathValue) {
            uiSandboxPath = uiPathValue;
          }
        }

        const projectData = await client.createProject({
          name,
          githubRepo: repo,
          defaultBranch: options.branch,
          branchPrefix: options.prefix,
          mastraPath: options.mastraPath,
          uiSandboxPath,
        });

        if (options.json) {
          console.log(JSON.stringify(projectData, null, 2));
        } else {
          if (needsInteractive) {
            outro('Project created!');
          }
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

  // project get [id]
  project
    .command('get [id]')
    .description('Get project details')
    .option('--json', 'Output as JSON')
    .action(async (idArg, options) => {
      try {
        // Interactive mode if project ID is missing
        let id = idArg as string | undefined;
        if (!id && !options.json) {
          const projects = await client.listProjects();

          if (projects.length === 0) {
            console.error(error('No projects found.'));
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

          id = handleCancel(selected);
        }

        if (!id) {
          console.error(error('Project ID is required'));
          process.exit(1);
        }

        const projectData = await client.getProject(id);

        if (options.json) {
          console.log(JSON.stringify(projectData, null, 2));
        } else {
          console.log(formatProject(projectData));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Project not found: ${idArg}`));
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

  // project env add [project-id]
  env
    .command('add [project-id]')
    .description('Add an environment to a project')
    .option('-n, --name <name>', 'Environment name (e.g., dev, staging, prod)')
    .option('-e, --env-var <key=value...>', 'Environment variables (can be specified multiple times)')
    .option('--json', 'Output as JSON')
    .action(async (projectIdArg, options) => {
      try {
        // Interactive mode if any required options are missing
        const needsInteractive = !projectIdArg || !options.name;
        if (needsInteractive && !options.json) {
          intro('Add environment to project');
        }

        // 1. Project selection
        let projectId = projectIdArg as string | undefined;
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

        // 2. Environment name
        let envName = options.name as string | undefined;
        if (!envName) {
          const nameInput = await text({
            message: 'Environment name:',
            placeholder: 'dev',
            validate: (value) => {
              if (!value) return 'Name is required';
            },
          });
          envName = handleCancel(nameInput);
        }

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
          name: envName,
          envVars,
        });

        if (options.json) {
          console.log(JSON.stringify(environment, null, 2));
        } else {
          // Get project name for display
          const projectData = await client.getProject(projectId);
          if (needsInteractive) {
            outro('Environment added!');
          }
          console.log(formatEnvironmentAdded(projectData.name, environment));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Project not found: ${projectIdArg}`));
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

  // project env list [project-id]
  env
    .command('list [project-id]')
    .alias('ls')
    .description('List environments for a project')
    .option('--json', 'Output as JSON')
    .action(async (projectIdArg, options) => {
      try {
        // Interactive mode if project ID is missing
        let projectId = projectIdArg as string | undefined;
        if (!projectId && !options.json) {
          const projects = await client.listProjects();

          if (projects.length === 0) {
            console.error(error('No projects found.'));
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

        if (!projectId) {
          console.error(error('Project ID is required'));
          process.exit(1);
        }

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
            console.error(error(`Project not found: ${projectIdArg}`));
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
