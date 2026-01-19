import * as v from 'valibot';

/**
 * MCP server configuration schema.
 */
export const McpServerConfigSchema = v.object({
  command: v.string(),
  args: v.optional(v.array(v.string())),
  env: v.optional(v.record(v.string(), v.string())),
});
export type McpServerConfig = v.InferOutput<typeof McpServerConfigSchema>;

/**
 * MCP servers map schema.
 */
export const McpServersSchema = v.record(v.string(), McpServerConfigSchema);
export type McpServers = v.InferOutput<typeof McpServersSchema>;

/**
 * Project cui config schema.
 */
export const ProjectCuiConfigSchema = v.object({
  id: v.string(),
  project_id: v.string(),
  mcp_servers: v.string(), // JSON string
  claude_md: v.nullable(v.string()),
  auto_approve_file_patterns: v.string(), // JSON array string
  auto_approve_mcp_tools: v.string(), // JSON array string
  auto_approve_bash_commands: v.string(), // JSON array string
  created_at: v.string(),
  updated_at: v.string(),
});
export type ProjectCuiConfigType = v.InferOutput<typeof ProjectCuiConfigSchema>;

/**
 * Parsed cui config (with JSON fields parsed).
 */
export const ParsedCuiConfigSchema = v.object({
  id: v.string(),
  project_id: v.string(),
  mcp_servers: McpServersSchema,
  claude_md: v.nullable(v.string()),
  auto_approve_file_patterns: v.array(v.string()),
  auto_approve_mcp_tools: v.array(v.string()),
  auto_approve_bash_commands: v.array(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});
export type ParsedCuiConfig = v.InferOutput<typeof ParsedCuiConfigSchema>;

/**
 * Create/update cui config request schema.
 */
export const CuiConfigUpdateSchema = v.object({
  mcp_servers: v.optional(McpServersSchema),
  claude_md: v.optional(v.nullable(v.string())),
  auto_approve_file_patterns: v.optional(v.array(v.string())),
  auto_approve_mcp_tools: v.optional(v.array(v.string())),
  auto_approve_bash_commands: v.optional(v.array(v.string())),
});
export type CuiConfigUpdate = v.InferOutput<typeof CuiConfigUpdateSchema>;

/**
 * cui settings.json schema (for injection).
 */
export const CuiSettingsSchema = v.object({
  mcpServers: v.optional(McpServersSchema),
  permissions: v.optional(
    v.object({
      allow: v.optional(v.array(v.string())),
      deny: v.optional(v.array(v.string())),
    })
  ),
});
export type CuiSettings = v.InferOutput<typeof CuiSettingsSchema>;

/**
 * Parse a raw cui config from database.
 */
export function parseCuiConfig(raw: ProjectCuiConfigType): ParsedCuiConfig {
  return {
    id: raw.id,
    project_id: raw.project_id,
    mcp_servers: JSON.parse(raw.mcp_servers),
    claude_md: raw.claude_md,
    auto_approve_file_patterns: JSON.parse(raw.auto_approve_file_patterns),
    auto_approve_mcp_tools: JSON.parse(raw.auto_approve_mcp_tools),
    auto_approve_bash_commands: JSON.parse(raw.auto_approve_bash_commands),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * Serialize a cui config for database storage.
 */
export function serializeCuiConfig(config: CuiConfigUpdate): {
  mcp_servers?: string;
  auto_approve_file_patterns?: string;
  auto_approve_mcp_tools?: string;
  auto_approve_bash_commands?: string;
  claude_md?: string | null;
} {
  const result: {
    mcp_servers?: string;
    auto_approve_file_patterns?: string;
    auto_approve_mcp_tools?: string;
    auto_approve_bash_commands?: string;
    claude_md?: string | null;
  } = {};

  if (config.mcp_servers !== undefined) {
    result.mcp_servers = JSON.stringify(config.mcp_servers);
  }
  if (config.auto_approve_file_patterns !== undefined) {
    result.auto_approve_file_patterns = JSON.stringify(config.auto_approve_file_patterns);
  }
  if (config.auto_approve_mcp_tools !== undefined) {
    result.auto_approve_mcp_tools = JSON.stringify(config.auto_approve_mcp_tools);
  }
  if (config.auto_approve_bash_commands !== undefined) {
    result.auto_approve_bash_commands = JSON.stringify(config.auto_approve_bash_commands);
  }
  if (config.claude_md !== undefined) {
    result.claude_md = config.claude_md;
  }

  return result;
}
