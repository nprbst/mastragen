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
 * Project Claude config schema.
 */
export const ProjectClaudeConfigSchema = v.object({
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
export type ProjectClaudeConfigType = v.InferOutput<typeof ProjectClaudeConfigSchema>;

/**
 * Parsed Claude config (with JSON fields parsed).
 */
export const ParsedClaudeConfigSchema = v.object({
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
export type ParsedClaudeConfig = v.InferOutput<typeof ParsedClaudeConfigSchema>;

/**
 * Create/update Claude config request schema.
 */
export const ClaudeConfigUpdateSchema = v.object({
  mcp_servers: v.optional(McpServersSchema),
  claude_md: v.optional(v.nullable(v.string())),
  auto_approve_file_patterns: v.optional(v.array(v.string())),
  auto_approve_mcp_tools: v.optional(v.array(v.string())),
  auto_approve_bash_commands: v.optional(v.array(v.string())),
});
export type ClaudeConfigUpdate = v.InferOutput<typeof ClaudeConfigUpdateSchema>;

/**
 * Claude settings.json schema (for injection).
 */
export const ClaudeSettingsSchema = v.object({
  mcpServers: v.optional(McpServersSchema),
  permissions: v.optional(
    v.object({
      allow: v.optional(v.array(v.string())),
      deny: v.optional(v.array(v.string())),
    })
  ),
});
export type ClaudeSettings = v.InferOutput<typeof ClaudeSettingsSchema>;

/**
 * Parse a raw Claude config from database.
 */
export function parseClaudeConfig(raw: ProjectClaudeConfigType): ParsedClaudeConfig {
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
 * Serialize a Claude config for database storage.
 */
export function serializeClaudeConfig(config: ClaudeConfigUpdate): {
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
