import fs from 'node:fs/promises';
import path from 'node:path';
import type { Kysely } from 'kysely';
import type { Database, ProjectClaudeConfig } from '../db/types.ts';
import { ProjectsRepository } from '../repositories/index.ts';

/**
 * Chrome mode type for DevTools MCP integration.
 */
export type ChromeMode = 'sidecar' | 'local';

/**
 * Configuration for generating Claude settings.
 */
export interface ClaudeSettingsConfig {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
  chromeMode?: ChromeMode;
  userTailscaleHostname?: string;
}

/**
 * Configuration for getting session environment variables.
 */
export interface SessionEnvVarsConfig {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
  sessionToken?: string;
}

/**
 * Command definition.
 */
export interface Command {
  name: string;
  description: string | null;
  content: string;
}

/**
 * Skill definition.
 */
export interface Skill {
  name: string;
  content: string;
}

/**
 * MCP server configuration.
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

const BUILTIN_COMMANDS_DIR = '/app/claude-commands';
const BUILTIN_SKILLS_DIR = '/app/claude-skills';

/**
 * Get default MCP servers with dynamic chrome endpoint.
 */
function getDefaultMcpServers(chromeEndpoint: string): Record<string, McpServerConfig> {
  return {
    'astro-docs': {
      command: 'bunx',
      args: ['--bun', 'mcp-remote', 'https://mcp.docs.astro.build/mcp'],
    },
    'mastra-docs': {
      command: 'bunx',
      args: ['--bun', '@mastra/mcp-docs-server'],
    },
    'chrome-devtools': {
      command: 'npx',
      args: ['chrome-devtools-mcp@latest', `--browserUrl=${chromeEndpoint}`],
    },
  };
}

/**
 * Get the Chrome DevTools endpoint based on chrome mode.
 * - sidecar: Container Chrome at http://chrome:3000
 * - local: User's Chrome via Tailscale
 */
function getChromeEndpoint(chromeMode: ChromeMode | undefined, userTailscaleHostname: string | undefined): string {
  if (chromeMode === 'local' && userTailscaleHostname) {
    // User's Chrome via Tailscale
    return `http://${userTailscaleHostname}:9222`;
  }
  // Default to sidecar Chrome container
  return 'http://chrome:3000';
}

/**
 * Claude settings.json structure.
 */
export interface ClaudeSettings {
  user: {
    allowedTools: string[];
  };
  experimental: {
    enableMcpServerManagement: boolean;
  };
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Service for generating and injecting Claude configuration into sessions.
 */
export class ClaudeInjectionService {
  private db: Kysely<Database>;
  private projectsRepo: ProjectsRepository;

  constructor(db: Kysely<Database>) {
    this.db = db;
    this.projectsRepo = new ProjectsRepository(db);
  }

  /**
   * Generate settings.json content for a session.
   */
  async generateSettings(config: ClaudeSettingsConfig): Promise<ClaudeSettings> {
    // Get project
    const project = await this.projectsRepo.findById(config.projectId);
    if (!project) {
      throw new Error(`Project not found: ${config.projectId}`);
    }

    // Get environment
    const environment = await this.getEnvironment(config.projectId, config.environment);
    if (!environment) {
      throw new Error(`Environment not found: ${config.environment}`);
    }

    // Get project Claude config
    const claudeConfig = await this.getClaudeConfig(config.projectId);

    // Determine Chrome endpoint based on session's chrome mode
    const chromeEndpoint = getChromeEndpoint(config.chromeMode, config.userTailscaleHostname);

    // Start with default MCP servers (includes dynamic chrome-devtools endpoint)
    let mcpServers: Record<string, McpServerConfig> = { ...getDefaultMcpServers(chromeEndpoint) };

    // Merge project-specific MCP servers (overrides defaults)
    if (claudeConfig?.mcp_servers) {
      try {
        const projectMcpServers = JSON.parse(claudeConfig.mcp_servers);
        mcpServers = { ...mcpServers, ...projectMcpServers };
      } catch {
        // Invalid JSON, keep defaults only
      }
    }

    // Interpolate environment variables in MCP server configs
    const envVars = await this.getSessionEnvVars(config);
    mcpServers = this.interpolateEnvVars(mcpServers, envVars);

    return {
      user: {
        allowedTools: [],
      },
      experimental: {
        enableMcpServerManagement: true,
      },
      mcpServers,
    };
  }

  /**
   * Generate CLAUDE.md content for a session.
   */
  async generateClaudeMd(config: ClaudeSettingsConfig): Promise<string> {
    // Get project
    const project = await this.projectsRepo.findById(config.projectId);
    if (!project) {
      throw new Error(`Project not found: ${config.projectId}`);
    }

    // Get Claude config for custom CLAUDE.md content
    const claudeConfig = await this.getClaudeConfig(config.projectId);

    let content = `# CLAUDE.md\n\n`;
    content += `Project: ${project.name}\n`;
    content += `Environment: ${config.environment}\n`;
    content += `Session: ${config.sessionId}\n\n`;

    // Add sandbox container management documentation
    content += `## Sandbox Container Management\n\n`;
    content += `The development environment runs in separate containers. If hot-reload isn't working or you need to restart a service:\n\n`;
    content += `- \`touch /workspace/.restart-astro\` - Restart the Astro dev server (UI)\n`;
    content += `- \`touch /workspace/.restart-mastra\` - Restart the Mastra dev server (agents/tools)\n\n`;
    content += `The process will restart within 1-2 seconds after the file is touched.\n\n`;

    // Add browser preview access documentation
    content += `## Browser Preview Access\n\n`;
    content += `You have access to Chrome DevTools via the \`chrome-devtools\` MCP server. To see the Astro preview:\n\n`;
    content += `1. Navigate to the preview: use \`navigate_page\` with URL \`http://astro:4321\`\n`;
    content += `2. Take a screenshot: use \`take_screenshot\`\n`;
    content += `3. Check console: use \`list_console_messages\`\n\n`;

    // Add custom CLAUDE.md content if configured
    if (claudeConfig?.claude_md) {
      content += claudeConfig.claude_md;
    }

    return content;
  }

  /**
   * Get session-specific environment variables.
   */
  async getSessionEnvVars(config: SessionEnvVarsConfig): Promise<Record<string, string>> {
    // Get environment-specific vars
    const environment = await this.getEnvironment(config.projectId, config.environment);
    const envVars: Record<string, string> = {};

    if (environment?.env_vars) {
      try {
        const parsed = typeof environment.env_vars === 'string'
          ? JSON.parse(environment.env_vars)
          : environment.env_vars;
        Object.assign(envVars, parsed);
      } catch {
        // Invalid JSON, skip
      }
    }

    // Add session-specific vars
    const apiUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';
    envVars.MASTRAGEN_SESSION_ID = config.sessionId;
    envVars.MASTRAGEN_API_URL = apiUrl;
    if (config.sessionToken) {
      envVars.MASTRAGEN_USER_TOKEN = config.sessionToken;
    }

    return envVars;
  }

  /**
   * Get commands for a project.
   */
  async getCommands(config: { projectId: string; environment: string }): Promise<Command[]> {
    // Get project-specific commands
    const projectCommands = await this.db
      .selectFrom('project_commands')
      .selectAll()
      .where('project_id', '=', config.projectId)
      .execute();

    return projectCommands.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      content: cmd.content,
    }));
  }

  /**
   * Get built-in commands from the filesystem.
   */
  async getBuiltinCommands(): Promise<Command[]> {
    const commands: Command[] = [];

    try {
      const files = await fs.readdir(BUILTIN_COMMANDS_DIR);

      for (const file of files) {
        if (file.endsWith('.md') && file !== 'README.md') {
          const content = await fs.readFile(path.join(BUILTIN_COMMANDS_DIR, file), 'utf-8');
          const name = file.replace('.md', '');
          commands.push({ name, description: null, content });
        }
      }
    } catch (err) {
      console.warn('[ClaudeInjectionService] Could not read built-in commands:', err);
    }

    return commands;
  }

  /**
   * Get built-in skills from the filesystem.
   */
  async getBuiltinSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    try {
      const files = await fs.readdir(BUILTIN_SKILLS_DIR);

      for (const file of files) {
        if (file.endsWith('.md') && file !== 'README.md') {
          const content = await fs.readFile(path.join(BUILTIN_SKILLS_DIR, file), 'utf-8');
          const name = file.replace('.md', '');
          skills.push({ name, content });
        }
      }
    } catch (err) {
      console.warn('[ClaudeInjectionService] Could not read built-in skills:', err);
    }

    return skills;
  }

  /**
   * Get Claude config for a project.
   */
  private async getClaudeConfig(projectId: string): Promise<ProjectClaudeConfig | undefined> {
    return await this.db
      .selectFrom('project_claude_config')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  /**
   * Get environment for a project.
   */
  private async getEnvironment(projectId: string, environmentName: string) {
    return await this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', environmentName)
      .executeTakeFirst();
  }

  /**
   * Interpolate environment variables in MCP server configs.
   */
  private interpolateEnvVars(
    mcpServers: Record<string, McpServerConfig>,
    envVars: Record<string, string>
  ): Record<string, McpServerConfig> {
    const interpolate = (value: string): string => {
      return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
        return envVars[varName] ?? `\${${varName}}`;
      });
    };

    const result: Record<string, McpServerConfig> = {};

    for (const [name, config] of Object.entries(mcpServers)) {
      result[name] = {
        command: interpolate(config.command),
        args: config.args?.map(interpolate),
        env: config.env
          ? Object.fromEntries(
              Object.entries(config.env).map(([k, v]) => [k, interpolate(v)])
            )
          : undefined,
      };
    }

    return result;
  }
}
