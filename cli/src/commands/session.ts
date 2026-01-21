/**
 * Session commands - manage development sessions.
 */
import { Command } from 'commander';
import { select, multiselect, text, intro, outro, confirm, password } from '@clack/prompts';
import { MgenClient, ApiError } from '../client.ts';
import {
  formatSessionCreated,
  formatSession,
  formatSessionTable,
  formatResumed,
  formatShareCreated,
  formatShareTable,
  formatIdleStatus,
  success,
  error,
  waitForPorts,
} from '../output.ts';
import { handleCancel } from '../prompts.ts';
import { getCachedToken, saveCachedToken, truncateToken } from '../utils/claude-token.ts';
import { openInChrome, resolveServices } from '../utils/browser.ts';

/**
 * Prompts user for Claude OAuth token with caching support.
 * Returns the token to use, or undefined if skipped.
 */
async function promptForClaudeToken(): Promise<string | undefined> {
  const cached = getCachedToken();

  if (cached) {
    const useCached = await select({
      message: `Use cached Claude token (${truncateToken(cached)})?`,
      options: [
        { value: 'yes', label: 'Yes, use cached token' },
        { value: 'new', label: 'Enter a different token' },
        { value: 'skip', label: 'Skip (no Claude Max)' },
      ],
    });

    const choice = handleCancel(useCached);
    if (choice === 'yes') return cached;
    if (choice === 'skip') return undefined;
  }

  const tokenInput = await password({
    message: 'Enter Claude token (from `claude setup-token`), or press Enter to skip:',
  });

  const token = handleCancel(tokenInput);

  if (token && !cached) {
    const shouldSave = await confirm({
      message: 'Save token to ~/.claude/.token for future sessions?',
      initialValue: true,
    });

    if (handleCancel(shouldSave)) {
      saveCachedToken(token);
    }
  }

  return token || undefined;
}

export function sessionCommand(client: MgenClient): Command {
  const session = new Command('session')
    .description('Manage development sessions')
    .alias('s');

  // session create
  session
    .command('create')
    .description('Create a new development session')
    .option('-p, --project <id>', 'Project ID or name')
    .option('-n, --name <name>', 'Artifact name (lowercase, hyphens allowed)')
    .option('-e, --env <environment>', 'Environment (e.g., dev, staging)')
    .option('-t, --token <token>', 'Claude OAuth token (from `claude setup-token`)')
    .option('-c, --cached-token', 'Use cached Claude token without prompting')
    .option('-o, --open [services]', 'Open services in Chrome incognito (e.g., vscode,mastra or all)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        // Interactive mode if any required options are missing
        const needsInteractive = !options.project || !options.name || !options.env;
        if (needsInteractive && !options.json) {
          intro('Create a new session');
        }

        // 1. Project selection
        let projectId: string | undefined;
        if (options.project) {
          projectId = await client.resolveProjectId(options.project);
        } else {
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

        // 4. Claude token (optional)
        let claudeToken = options.token as string | undefined;
        if (!claudeToken && options.cachedToken) {
          claudeToken = getCachedToken() ?? undefined;
        } else if (!claudeToken && !options.json) {
          claudeToken = await promptForClaudeToken();
        }

        // Create session
        const result = await client.createSession({
          projectId,
          artifactName,
          environment,
          claudeToken,
        });

        // Wait for ports to be ready (skip in JSON mode)
        if (!options.json) {
          await waitForPorts(result);
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (needsInteractive) {
            outro('Session created!');
          }
          console.log(formatSessionCreated(result));

          if (options.open) {
            const services = options.open === true ? 'all' : options.open;
            const urls = resolveServices(services, result.urls);
            openInChrome(urls);
          }
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
    .option('-p, --project <id>', 'Filter by project ID or name')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        let projectId: string | undefined;
        if (options.project) {
          projectId = await client.resolveProjectId(options.project);
        }

        const sessions = await client.listSessions({
          state: options.state,
          projectId,
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

  // session get [id]
  session
    .command('get [id]')
    .description('Get session details')
    .option('--json', 'Output as JSON')
    .action(async (idArg, options) => {
      try {
        // Interactive mode if session ID is missing
        let id = idArg as string | undefined;
        if (!id && !options.json) {
          const sessions = await client.listSessions({});

          if (sessions.length === 0) {
            console.error(error('No sessions found.'));
            process.exit(1);
          }

          const selected = await select({
            message: 'Select a session:',
            options: sessions.map((s) => ({
              value: s.id,
              label: `${s.artifactName} (${s.state})`,
              hint: s.projectId,
            })),
          });

          id = handleCancel(selected);
        }

        if (!id) {
          console.error(error('Session ID is required'));
          process.exit(1);
        }

        const sessionData = await client.getSession(id);

        if (options.json) {
          console.log(JSON.stringify(sessionData, null, 2));
        } else {
          console.log(formatSession(sessionData));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${idArg}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session suspend [id]
  session
    .command('suspend [id]')
    .description('Suspend an active session')
    .option('--json', 'Output as JSON')
    .action(async (idArg, options) => {
      try {
        // Interactive mode if session ID is missing
        let id = idArg as string | undefined;
        if (!id && !options.json) {
          const sessions = await client.listSessions({ state: 'active' });

          if (sessions.length === 0) {
            console.error(error('No active sessions found.'));
            process.exit(1);
          }

          const selected = await select({
            message: 'Select session to suspend:',
            options: sessions.map((s) => ({
              value: s.id,
              label: s.artifactName,
              hint: s.projectId,
            })),
          });

          id = handleCancel(selected);
        }

        if (!id) {
          console.error(error('Session ID is required'));
          process.exit(1);
        }

        const result = await client.suspendSession(id);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(success(`Session ${id} suspended`));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${idArg}`));
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

  // session resume [id]
  session
    .command('resume [id]')
    .description('Resume a suspended session')
    .option('-t, --token <token>', 'Claude OAuth token (from `claude setup-token`)')
    .option('-o, --open [services]', 'Open services in Chrome incognito (e.g., vscode,mastra or all)')
    .option('--json', 'Output as JSON')
    .action(async (idArg, options) => {
      try {
        // Interactive mode if session ID is missing
        let id = idArg as string | undefined;
        if (!id && !options.json) {
          const sessions = await client.listSessions({ state: 'suspended' });

          if (sessions.length === 0) {
            console.error(error('No suspended sessions found.'));
            process.exit(1);
          }

          const selected = await select({
            message: 'Select session to resume:',
            options: sessions.map((s) => ({
              value: s.id,
              label: s.artifactName,
              hint: s.projectId,
            })),
          });

          id = handleCancel(selected);
        }

        if (!id) {
          console.error(error('Session ID is required'));
          process.exit(1);
        }

        // Prompt for Claude token (interactive mode only)
        let claudeToken = options.token as string | undefined;
        if (!claudeToken && !options.json) {
          claudeToken = await promptForClaudeToken();
        }

        const result = await client.resumeSession(id, { claudeToken });

        // Wait for ports to be ready (skip in JSON mode)
        if (!options.json) {
          await waitForPorts(result);
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatResumed(result));

          if (options.open) {
            const services = options.open === true ? 'all' : options.open;
            const urls = resolveServices(services, result.urls);
            openInChrome(urls);
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${idArg}`));
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

  // session cleanup [id...]
  session
    .command('cleanup [ids...]')
    .description('Clean up sessions (stop containers and delete)')
    .option('--all', 'Clean up all sessions (localhost only)')
    .option('--keep-volume', 'Keep the workspace volume (default: remove)')
    .option('--json', 'Output as JSON')
    .action(async (idsArg: string[] | undefined, options) => {
      try {
        let ids = idsArg ?? [];

        // Handle --all flag (localhost only)
        if (options.all) {
          if (!client.isLocalhost()) {
            console.error(error('--all flag is only allowed when connected to localhost'));
            process.exit(1);
          }
          const sessions = await client.listSessions({});
          ids = sessions.map((s) => s.id);

          if (ids.length === 0) {
            console.error(error('No sessions found.'));
            process.exit(1);
          }
        }

        // Interactive mode if no session IDs provided
        if (ids.length === 0 && !options.json) {
          const sessions = await client.listSessions({});

          if (sessions.length === 0) {
            console.error(error('No sessions found.'));
            process.exit(1);
          }

          const selected = await multiselect({
            message: 'Select sessions to clean up:',
            options: sessions.map((s) => ({
              value: s.id,
              label: `${s.artifactName} (${s.state})`,
              hint: s.projectId,
            })),
            required: true,
          });

          ids = handleCancel(selected) as string[];
        }

        if (ids.length === 0) {
          console.error(error('At least one session ID is required'));
          process.exit(1);
        }

        const results: { id: string; success: boolean; message: string }[] = [];

        for (const id of ids) {
          try {
            const result = await client.deleteSession(id, {
              removeVolume: !options.keepVolume,
            });
            results.push({ id, success: true, message: result.message });
          } catch (err) {
            if (err instanceof ApiError) {
              results.push({ id, success: false, message: err.message });
            } else if (err instanceof Error) {
              results.push({ id, success: false, message: err.message });
            }
          }
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          for (const r of results) {
            if (r.success) {
              console.log(success(r.message));
            } else {
              console.error(error(`Failed to clean up ${r.id}: ${r.message}`));
            }
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session share <id> <email>
  session
    .command('share <id> <email>')
    .description('Share a session with another user')
    .option('--json', 'Output as JSON')
    .action(async (id: string, email: string, options) => {
      try {
        const result = await client.shareSession(id, email);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatShareCreated(result));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Not found: ${err.message}`));
          } else if (err.status === 409) {
            console.error(error(`Already shared: ${err.message}`));
          } else if (err.status === 400) {
            console.error(error(`Cannot share: ${err.message}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session unshare <id> <email>
  session
    .command('unshare <id> <email>')
    .description('Revoke session share from a user')
    .option('--json', 'Output as JSON')
    .action(async (id: string, email: string, options) => {
      try {
        const result = await client.unshareSession(id, email);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(success(`Share revoked for ${email}`));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Not found: ${err.message}`));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // session shares <id>
  session
    .command('shares <id>')
    .description('List all shares for a session')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const shares = await client.listSessionShares(id);

        if (options.json) {
          console.log(JSON.stringify(shares, null, 2));
        } else {
          console.log(formatShareTable(shares));
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

  // session idle-status <id>
  session
    .command('idle-status <id>')
    .description('Get idle status for a session')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const status = await client.getIdleStatus(id);

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          console.log(formatIdleStatus(status));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Session not found: ${id}`));
          } else if (err.status === 401) {
            console.error(error('Unauthorized. Try creating or resuming the session first to cache credentials.'));
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
