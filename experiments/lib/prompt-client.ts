/**
 * Prompt client for Phoenix prompt management.
 * T043-T044: Fetches prompts from Phoenix with local fallback support.
 *
 * Supports:
 * - Fetching prompts by name and optional tag
 * - Version history retrieval
 * - Automatic fallback to local prompt files when Phoenix is unavailable
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Prompt version stored in Phoenix.
 */
export interface PromptVersion {
  /** Version ID */
  id: string;
  /** Version number (sequential) */
  version: number;
  /** Version tag (e.g., "production", "staging") */
  tag?: string;
  /** Prompt template content */
  template: string;
  /** Template variables */
  variables?: string[];
  /** Version metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Prompt stored in Phoenix.
 */
export interface Prompt {
  /** Prompt ID */
  id: string;
  /** Prompt name (unique identifier) */
  name: string;
  /** Prompt description */
  description?: string;
  /** Current/latest version */
  currentVersion: PromptVersion;
  /** All versions (optional, only populated when fetching history) */
  versions?: PromptVersion[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Local prompt file format.
 */
export interface LocalPrompt {
  /** Prompt template content */
  template: string;
  /** Template variables */
  variables?: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Prompt client configuration.
 */
export interface PromptClientConfig {
  /** Phoenix server endpoint */
  endpoint: string;
  /** Optional API key for authenticated access */
  apiKey?: string;
  /** Local prompts directory for fallback */
  localPromptsDir?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable fallback to local prompts when Phoenix is unavailable */
  enableFallback?: boolean;
}

/**
 * Default prompt client configuration from environment.
 */
export function getDefaultPromptConfig(): PromptClientConfig {
  return {
    endpoint: process.env.PHOENIX_ENDPOINT ?? 'http://localhost:6006',
    apiKey: process.env.PHOENIX_API_KEY,
    localPromptsDir: process.env.PROMPTS_DIR ?? './prompts',
    timeout: 5000,
    enableFallback: true,
  };
}

/**
 * Prompt client for fetching prompts from Phoenix with fallback support.
 */
export class PromptClient {
  private config: PromptClientConfig;

  constructor(config?: Partial<PromptClientConfig>) {
    this.config = { ...getDefaultPromptConfig(), ...config };
  }

  /**
   * Fetch a prompt by name, optionally by tag.
   *
   * @param name - Prompt name
   * @param tag - Optional version tag (e.g., "production")
   * @param localFallback - Optional local prompt to use if Phoenix is unavailable
   * @returns The prompt or null if not found
   */
  async fetchPrompt(
    name: string,
    tag?: string,
    localFallback?: LocalPrompt
  ): Promise<Prompt | null> {
    try {
      return await this.fetchPromptFromPhoenix(name, tag);
    } catch (error) {
      // If fallback is enabled, try local prompts
      if (this.config.enableFallback) {
        console.warn(
          `Phoenix unavailable, falling back to local prompt: ${name}`,
          error instanceof Error ? error.message : error
        );
        return this.loadLocalPrompt(name, localFallback);
      }
      throw error;
    }
  }

  /**
   * Fetch a prompt from Phoenix.
   */
  private async fetchPromptFromPhoenix(
    name: string,
    tag?: string
  ): Promise<Prompt | null> {
    const queryParams = tag ? `?tag=${encodeURIComponent(tag)}` : '';
    const url = `${this.config.endpoint}/v1/prompts/${encodeURIComponent(name)}${queryParams}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status}`);
      }

      const data = (await response.json()) as { data: Prompt };
      return data.data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Load a local prompt file as fallback.
   */
  private async loadLocalPrompt(
    name: string,
    providedFallback?: LocalPrompt
  ): Promise<Prompt | null> {
    // Use provided fallback if available
    if (providedFallback) {
      return this.localPromptToPrompt(name, providedFallback);
    }

    // Try to load from local prompts directory
    if (!this.config.localPromptsDir) {
      return null;
    }

    const promptPath = join(this.config.localPromptsDir, `${name}.json`);
    try {
      const content = await readFile(promptPath, 'utf-8');
      const localPrompt = JSON.parse(content) as LocalPrompt;
      return this.localPromptToPrompt(name, localPrompt);
    } catch {
      // File not found or invalid JSON
      return null;
    }
  }

  /**
   * Convert a local prompt to Prompt format.
   */
  private localPromptToPrompt(name: string, local: LocalPrompt): Prompt {
    const now = new Date().toISOString();
    return {
      id: `local-${name}`,
      name,
      description: 'Local fallback prompt',
      currentVersion: {
        id: 'local-v1',
        version: 1,
        tag: 'local',
        template: local.template,
        variables: local.variables,
        metadata: local.metadata,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get version history for a prompt.
   */
  async getPromptVersions(name: string): Promise<PromptVersion[]> {
    const url = `${this.config.endpoint}/v1/prompts/${encodeURIComponent(name)}/versions`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status}`);
      }

      const data = (await response.json()) as { data: PromptVersion[] };
      return data.data ?? [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create or update a prompt in Phoenix.
   */
  async savePrompt(
    name: string,
    template: string,
    options?: {
      description?: string;
      variables?: string[];
      tag?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Prompt> {
    const url = `${this.config.endpoint}/v1/prompts`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          template,
          description: options?.description,
          variables: options?.variables,
          tag: options?.tag,
          metadata: options?.metadata,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status}`);
      }

      const data = (await response.json()) as { data: Prompt };
      return data.data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Tag a specific prompt version.
   */
  async tagVersion(
    name: string,
    versionId: string,
    tag: string
  ): Promise<void> {
    const url = `${this.config.endpoint}/v1/prompts/${encodeURIComponent(name)}/versions/${versionId}/tag`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tag }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List all prompts.
   */
  async listPrompts(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const url = `${this.config.endpoint}/v1/prompts`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data: Array<{ id: string; name: string; description?: string }>;
      };
      return data.data ?? [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if Phoenix is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch(`${this.config.endpoint}/health`, {
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }

  /**
   * Render a prompt template with variables.
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      // Support both {{variable}} and {variable} syntax
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}
