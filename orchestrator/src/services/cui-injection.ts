import type { Kysely } from 'kysely';
import type { Database, ProjectCuiConfig } from '../db/types.ts';
import { ProjectsRepository } from '../repositories/index.ts';

/**
 * Configuration for generating cui settings.
 */
export interface CuiSettingsConfig {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
}

/**
 * Configuration for getting session environment variables.
 */
export interface SessionEnvVarsConfig {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
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
 * MCP server configuration.
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * cui settings.json structure.
 */
export interface CuiSettings {
  user: {
    allowedTools: string[];
  };
  experimental: {
    enableMcpServerManagement: boolean;
  };
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Service for generating and injecting cui configuration into sessions.
 */
export class CuiInjectionService {
  private db: Kysely<Database>;
  private projectsRepo: ProjectsRepository;

  constructor(db: Kysely<Database>) {
    this.db = db;
    this.projectsRepo = new ProjectsRepository(db);
  }

  /**
   * Generate settings.json content for a session.
   */
  async generateSettings(config: CuiSettingsConfig): Promise<CuiSettings> {
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

    // Get project cui config
    const cuiConfig = await this.getCuiConfig(config.projectId);

    // Parse MCP servers from config
    let mcpServers: Record<string, McpServerConfig> = {};
    if (cuiConfig?.mcp_servers) {
      try {
        mcpServers = JSON.parse(cuiConfig.mcp_servers);
      } catch {
        // Invalid JSON, use empty object
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
  async generateClaudeMd(config: CuiSettingsConfig): Promise<string> {
    // Get project
    const project = await this.projectsRepo.findById(config.projectId);
    if (!project) {
      throw new Error(`Project not found: ${config.projectId}`);
    }

    // Get cui config for custom CLAUDE.md content
    const cuiConfig = await this.getCuiConfig(config.projectId);

    let content = `# CLAUDE.md\n\n`;
    content += `Project: ${project.name}\n`;
    content += `Environment: ${config.environment}\n`;
    content += `Session: ${config.sessionId}\n\n`;

    // Add custom CLAUDE.md content if configured
    if (cuiConfig?.claude_md) {
      content += cuiConfig.claude_md;
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
    envVars.MASTRAGEN_USER_TOKEN = `session-token-${config.sessionId}`; // Placeholder

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
   * Get cui config for a project.
   */
  private async getCuiConfig(projectId: string): Promise<ProjectCuiConfig | undefined> {
    return await this.db
      .selectFrom('project_cui_config')
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
