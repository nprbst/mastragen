/**
 * Output formatting utilities for CLI
 */

import type { Session, SessionWithUrls, HealthStatus, Project, ProjectDetail, Environment } from './client.ts';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
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
    `    ${colors.dim}cui:${colors.reset}    ${colors.cyan}${session.urls.cui}${colors.reset}`,
    `    ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`,
    `    ${colors.dim}vscode:${colors.reset} ${colors.cyan}${session.urls.vscode}${colors.reset}`,
  ];
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
    lines.push(`  ${colors.dim}cui:${colors.reset}    ${colors.cyan}${session.urls.cui}${colors.reset}`);
    lines.push(`  ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`);
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
    `  ${colors.dim}cui:${colors.reset}    ${colors.cyan}${session.urls.cui}${colors.reset}`,
    `  ${colors.dim}mastra:${colors.reset} ${colors.cyan}${session.urls.mastra}${colors.reset}`,
    `  ${colors.dim}vscode:${colors.reset} ${colors.cyan}${session.urls.vscode}${colors.reset}`,
  ];
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
