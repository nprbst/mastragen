/**
 * Output formatting utilities for CLI
 */

import type { Session, SessionWithUrls, HealthStatus, Project, ProjectDetail, Environment, SessionShareInfo, SessionShareResult, IdleStatus, SessionStatus, MgenClient } from './client.ts';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

/**
 * Formats a success message with checkmark.
 */
export function success(message: string): string {
  return `${colors.green}✓${colors.reset} ${message}`;
}

/**
 * Formats an error message with X.
 */
export function error(message: string): string {
  return `${colors.red}✗${colors.reset} ${message}`;
}

/**
 * Formats a warning message.
 */
export function warn(message: string): string {
  return `${colors.yellow}!${colors.reset} ${message}`;
}

/**
 * Formats a label-value pair.
 */
export function label(name: string, value: string): string {
  return `${colors.dim}${name}:${colors.reset} ${value}`;
}

/**
 * Formats state with color.
 */
export function formatState(state: 'active' | 'suspended'): string {
  if (state === 'active') {
    return `${colors.green}active${colors.reset}`;
  }
  return `${colors.yellow}suspended${colors.reset}`;
}

/**
 * Formats health status output.
 */
export function formatHealth(health: HealthStatus): string {
  const statusIcon = health.status === 'ok' ? colors.green + '✓' : colors.red + '✗';
  const dbStatus = health.database === 'connected' ? 'connected' : 'disconnected';
  const dockerStatus = health.docker === 'connected' ? 'connected' : 'disconnected';

  return `${statusIcon}${colors.reset} Orchestrator ${health.status === 'ok' ? 'healthy' : 'unhealthy'} (db: ${dbStatus}, docker: ${dockerStatus})`;
}

/**
 * Formats session creation success output.
 */
export function formatSessionCreated(session: SessionWithUrls): string {
  const lines = [
    success(`Session created: ${colors.bold}${session.id}${colors.reset}`),
    label('  State', formatState(session.state)),
    `  ${colors.dim}URLs:${colors.reset}`,
    `    ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`,
  ];
  if (session.urls.astro) {
    lines.push(`    ${colors.dim}astro:${colors.reset}  ${colors.cyan}${session.urls.astro}${colors.reset}`);
  }
  lines.push(`    ${colors.dim}vscode:${colors.reset} ${colors.cyan}${session.urls.vscode}${colors.reset}`);
  return lines.join('\n');
}

/**
 * Formats a session details output.
 */
export function formatSession(session: Session | SessionWithUrls): string {
  const lines = [
    label('Session', colors.bold + session.id + colors.reset),
    label('Project', session.projectId),
    label('Artifact', session.artifactName),
    label('Environment', session.environment),
    label('State', formatState(session.state)),
    label('Created', session.createdAt),
  ];

  if ('urls' in session && session.urls) {
    lines.push(`${colors.dim}URLs:${colors.reset}`);
    lines.push(`  ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`);
    if (session.urls.astro) {
      lines.push(`  ${colors.dim}astro:${colors.reset}  ${colors.cyan}${session.urls.astro}${colors.reset}`);
    }
    lines.push(`  ${colors.dim}vscode:${colors.reset} ${colors.cyan}${session.urls.vscode}${colors.reset}`);
  }

  return lines.join('\n');
}

/**
 * Formats a session table row.
 */
function padRight(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}

/**
 * Formats session list as a table.
 */
export function formatSessionTable(sessions: Session[]): string {
  if (sessions.length === 0) {
    return colors.dim + 'No sessions found.' + colors.reset;
  }

  // Column widths
  const cols = {
    id: 8,
    project: 10,
    artifact: 20,
    env: 6,
    state: 12,
    created: 19,
  };

  // Header
  const header = [
    colors.bold + padRight('ID', cols.id),
    padRight('PROJECT', cols.project),
    padRight('ARTIFACT', cols.artifact),
    padRight('ENV', cols.env),
    padRight('STATE', cols.state),
    'CREATED' + colors.reset,
  ].join('  ');

  // Rows
  const rows = sessions.map((s) => {
    const created = s.createdAt.replace('T', ' ').slice(0, 19);
    return [
      padRight(s.id, cols.id),
      padRight(s.projectId.slice(0, cols.project), cols.project),
      padRight(s.artifactName.slice(0, cols.artifact), cols.artifact),
      padRight(s.environment.slice(0, cols.env), cols.env),
      padRight(formatState(s.state), cols.state + 9), // +9 for ANSI codes
      created,
    ].join('  ');
  });

  return [header, ...rows].join('\n');
}

/**
 * Formats URLs after resume.
 */
export function formatResumed(session: SessionWithUrls): string {
  const lines = [
    success(`Session ${colors.bold}${session.id}${colors.reset} resumed`),
    `${colors.dim}URLs:${colors.reset}`,
    `  ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`,
  ];
  if (session.urls.astro) {
    lines.push(`  ${colors.dim}astro:${colors.reset}  ${colors.cyan}${session.urls.astro}${colors.reset}`);
  }
  lines.push(`  ${colors.dim}vscode:${colors.reset} ${colors.cyan}${session.urls.vscode}${colors.reset}`);
  return lines.join('\n');
}

/**
 * Formats project list as a table.
 */
export function formatProjectTable(projects: Project[]): string {
  if (projects.length === 0) {
    return colors.dim + 'No projects found.' + colors.reset;
  }

  // Column widths
  const cols = {
    id: 8,
    name: 20,
    repo: 30,
    branch: 12,
  };

  // Header
  const header = [
    colors.bold + padRight('ID', cols.id),
    padRight('NAME', cols.name),
    padRight('REPO', cols.repo),
    'BRANCH' + colors.reset,
  ].join('  ');

  // Rows
  const rows = projects.map((p) => {
    return [
      padRight(p.id, cols.id),
      padRight(p.name.slice(0, cols.name), cols.name),
      padRight(p.githubRepo.slice(0, cols.repo), cols.repo),
      p.defaultBranch,
    ].join('  ');
  });

  return [header, ...rows].join('\n');
}

/**
 * Formats a project details output.
 */
export function formatProject(project: ProjectDetail): string {
  const lines = [
    label('Project', colors.bold + project.id + colors.reset),
    label('Name', project.name),
    label('GitHub', project.githubRepo),
    label('Branch', project.defaultBranch),
    label('Prefix', project.branchPrefix),
    label('Mastra Path', project.mastraPath),
  ];

  if (project.uiSandboxPath) {
    lines.push(label('UI Sandbox', project.uiSandboxPath));
  }

  if (project.environments.length > 0) {
    lines.push(label('Environments', project.environments.join(', ')));
  } else {
    lines.push(label('Environments', colors.dim + 'none' + colors.reset));
  }

  return lines.join('\n');
}

/**
 * Formats project creation success output.
 */
export function formatProjectCreated(project: Project): string {
  const lines = [
    success(`Project created: ${colors.bold}${project.name}${colors.reset}`),
    label('  ID', project.id),
    label('  GitHub', project.githubRepo),
    label('  Branch', project.defaultBranch),
    label('  Prefix', project.branchPrefix),
    label('  Mastra Path', project.mastraPath),
  ];

  if (project.uiSandboxPath) {
    lines.push(label('  UI Sandbox', project.uiSandboxPath));
  }

  return lines.join('\n');
}

/**
 * Formats environment added success output.
 */
export function formatEnvironmentAdded(projectName: string, env: Environment): string {
  const lines = [
    success(`Environment added: ${colors.bold}${env.name}${colors.reset}`),
    label('  Project', projectName),
    label('  ID', env.id),
  ];

  const envVarCount = Object.keys(env.envVars).length;
  if (envVarCount > 0) {
    lines.push(label('  Env Vars', `${envVarCount} defined`));
  }

  return lines.join('\n');
}

/**
 * Formats session share creation result.
 */
export function formatShareCreated(result: SessionShareResult): string {
  return [
    success(`Session shared with ${colors.bold}${result.sharedWithEmail}${colors.reset}`),
    label('  Share ID', result.shareId),
    label('  Access URL', colors.cyan + result.accessUrl + colors.reset),
  ].join('\n');
}

/**
 * Formats a list of session shares as a table.
 */
export function formatShareTable(shares: SessionShareInfo[]): string {
  if (shares.length === 0) {
    return colors.dim + 'No active shares.' + colors.reset;
  }

  const cols = {
    id: 10,
    email: 30,
    name: 20,
    granted: 19,
  };

  const header = [
    colors.bold + padRight('SHARE ID', cols.id),
    padRight('EMAIL', cols.email),
    padRight('NAME', cols.name),
    'GRANTED' + colors.reset,
  ].join('  ');

  const rows = shares.map((s) => {
    const granted = s.grantedAt.replace('T', ' ').slice(0, 19);
    return [
      padRight(s.id.slice(0, cols.id), cols.id),
      padRight(s.sharedWithEmail.slice(0, cols.email), cols.email),
      padRight((s.sharedWithName || '-').slice(0, cols.name), cols.name),
      granted,
    ].join('  ');
  });

  return [header, ...rows].join('\n');
}

/**
 * Formats idle status output.
 */
export function formatIdleStatus(status: IdleStatus): string {
  const stateColor = status.state === 'active' ? colors.green : colors.yellow;
  const warningColor = status.warningIssued ? colors.yellow : colors.dim;

  const lines = [
    label('Session', status.sessionId),
    label('State', stateColor + status.state + colors.reset),
    label('Idle for', `${status.idleSinceMinutes} minutes`),
    label('Timeout', `${status.idleTimeoutMinutes} minutes`),
    label('Warning at', `${status.idleTimeoutMinutes - status.warningMinutes} minutes idle`),
    label('Warning issued', warningColor + (status.warningIssued ? 'Yes' : 'No') + colors.reset),
  ];

  if (status.suspendAt) {
    lines.push(label('Suspend at', colors.yellow + status.suspendAt + colors.reset));
  }

  if (status.lastActivityAt) {
    lines.push(label('Last activity', status.lastActivityAt.replace('T', ' ').slice(0, 19)));
  }

  return lines.join('\n');
}

/**
 * Formats a port status indicator with circle symbol.
 */
export function formatPortStatus(name: string, ready: boolean): string {
  const circle = ready
    ? `${colors.green}●${colors.reset}`
    : `${colors.gray}◯${colors.reset}`;
  return `${circle} ${colors.dim}${name}${colors.reset}`;
}

/**
 * Extracts base URL from a full URL (removes hash/query params).
 */
function extractBaseUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  let endIndex = url.length;
  if (hashIndex !== -1) endIndex = Math.min(endIndex, hashIndex);
  if (queryIndex !== -1) endIndex = Math.min(endIndex, queryIndex);
  return url.slice(0, endIndex);
}

/**
 * Checks if a URL is responding to HTTP requests.
 */
async function checkPort(url: string, timeout: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const ok = response.ok || response.status < 500;
    if (process.env.DEBUG) {
      console.error(`[checkPort] ${url} -> ${response.status} (${ok ? 'ready' : 'not ready'})`);
    }
    return ok;
  } catch (err) {
    clearTimeout(timeoutId);
    if (process.env.DEBUG) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[checkPort] ${url} -> error: ${errMsg}`);
    }
    return false;
  }
}

interface ServiceStatus {
  name: string;
  url: string;
  ready: boolean;
}

/**
 * Waits for all session ports to be ready, displaying live status.
 */
export async function waitForPorts(
  session: SessionWithUrls,
  options?: { timeout?: number; interval?: number; requestTimeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 60000;
  const interval = options?.interval ?? 500;
  const requestTimeout = options?.requestTimeout ?? 2000;

  const services: ServiceStatus[] = [
    { name: 'mastra', url: extractBaseUrl(session.urls.mastra), ready: false },
  ];

  if (session.urls.astro) {
    services.push({ name: 'astro', url: extractBaseUrl(session.urls.astro), ready: false });
  }

  services.push({ name: 'vscode', url: extractBaseUrl(session.urls.vscode), ready: false });

  const startTime = Date.now();

  const renderStatus = () => {
    const statusLine = services.map((s) => formatPortStatus(s.name, s.ready)).join('  ');
    process.stdout.write(`\r\x1b[K${statusLine}`);
  };

  renderStatus();

  while (Date.now() - startTime < timeout) {
    const pendingServices = services.filter((s) => !s.ready);
    if (pendingServices.length === 0) break;

    const checks = await Promise.all(
      pendingServices.map(async (service) => {
        const ready = await checkPort(service.url, requestTimeout);
        return { service, ready };
      })
    );

    for (const { service, ready } of checks) {
      if (ready) service.ready = true;
    }

    renderStatus();

    if (services.every((s) => s.ready)) break;

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  process.stdout.write('\n');

  const notReady = services.filter((s) => !s.ready);
  if (notReady.length > 0) {
    console.log(warn(`Some services did not respond: ${notReady.map((s) => s.name).join(', ')}`));
  }
}

// Spinner frames for progress animation
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Waits for a session to be ready, displaying progressive status.
 * Uses the status API for K8s mode, falls back to port checking.
 */
export async function waitForSession(
  client: MgenClient,
  session: SessionWithUrls,
  options?: { timeout?: number; interval?: number; requestTimeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 120000; // 2 minutes for K8s (longer startup)
  const interval = options?.interval ?? 1000;
  const requestTimeout = options?.requestTimeout ?? 2000;

  const startTime = Date.now();
  let frameIndex = 0;
  let lastPhase = '';
  let lastMessage = '';

  // Phase display helper
  const renderPhaseStatus = (status: SessionStatus) => {
    const spinner = spinnerFrames[frameIndex % spinnerFrames.length];
    frameIndex++;

    // Show phase message with spinner
    let line = `${colors.cyan}${spinner}${colors.reset} ${status.message}`;

    // Show container status on same line if we have containers
    if (status.containers.length > 0) {
      const containerStatus = status.containers
        .map((c) => formatPortStatus(c.name, c.ready))
        .join('  ');
      line += `  ${containerStatus}`;
    }

    process.stdout.write(`\r\x1b[K${line}`);
  };

  // Try status API first (works for K8s mode)
  let useStatusApi = true;
  let status: SessionStatus | null = null;

  try {
    status = await client.getSessionStatus(session.id);
  } catch {
    // Status API not available (Docker mode or error), fall back to port checking
    useStatusApi = false;
  }

  if (useStatusApi && status) {
    // K8s mode: poll status API until ready
    while (Date.now() - startTime < timeout) {
      try {
        status = await client.getSessionStatus(session.id);

        if (status.phase !== lastPhase || status.message !== lastMessage) {
          lastPhase = status.phase;
          lastMessage = status.message;
        }

        renderPhaseStatus(status);

        if (status.phase === 'ready') {
          // Containers ready, now warm up TLS certs with port checking
          process.stdout.write('\n');
          break;
        }

        if (status.phase === 'error') {
          process.stdout.write('\n');
          console.log(error(`Session failed: ${status.message}`));
          return;
        }
      } catch (err) {
        // API error, continue polling
        if (process.env['DEBUG']) {
          console.error(`[waitForSession] status error: ${err}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    if (Date.now() - startTime >= timeout) {
      process.stdout.write('\n');
      console.log(warn('Session startup timed out'));
      return;
    }
  }

  // Always do port checking at the end to warm up TLS certs
  console.log(`${colors.dim}Warming up TLS certificates...${colors.reset}`);
  await waitForPorts(session, { timeout: timeout - (Date.now() - startTime), interval, requestTimeout });
}
