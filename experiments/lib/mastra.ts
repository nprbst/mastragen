/**
 * Mastra HTTP client for experiment framework.
 * T031: HTTP client for agents, workflows, and tools.
 */

import type { AgentInput, AgentResponse, WorkflowResponse } from './types';

/**
 * Mastra client configuration.
 */
export interface MastraClientConfig {
  /** Mastra server base URL */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Default Mastra configuration from environment.
 */
export function getDefaultMastraConfig(): MastraClientConfig {
  return {
    baseUrl: process.env.MASTRA_URL ?? 'http://localhost:4111',
    timeout: 30000,
  };
}

/**
 * Mastra HTTP client for invoking agents, workflows, and tools.
 */
export class MastraClient {
  private config: MastraClientConfig;

  constructor(config?: Partial<MastraClientConfig>) {
    this.config = { ...getDefaultMastraConfig(), ...config };
  }

  /**
   * Execute an agent with messages.
   */
  async generateAgent(agentName: string, input: AgentInput): Promise<AgentResponse> {
    const url = `${this.config.baseUrl}/api/agents/${agentName}/generate`;
    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Agent ${agentName} failed: ${error}`);
    }

    return response.json() as Promise<AgentResponse>;
  }

  /**
   * Execute a workflow with input data.
   */
  async executeWorkflow(
    workflowName: string,
    input: Record<string, unknown>
  ): Promise<WorkflowResponse> {
    const url = `${this.config.baseUrl}/api/workflows/${workflowName}/execute`;
    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Workflow ${workflowName} failed: ${error}`);
    }

    return response.json() as Promise<WorkflowResponse>;
  }

  /**
   * Execute a tool with input data.
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.config.baseUrl}/api/tools/${toolName}/execute`;
    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tool ${toolName} failed: ${error}`);
    }

    return response.json();
  }

  /**
   * List available agents.
   */
  async listAgents(): Promise<string[]> {
    const url = `${this.config.baseUrl}/api/agents`;
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${await response.text()}`);
    }

    const data = await response.json() as { agents?: Array<{ name: string }> };
    return (data.agents ?? []).map((a) => a.name);
  }

  /**
   * List available workflows.
   */
  async listWorkflows(): Promise<string[]> {
    const url = `${this.config.baseUrl}/api/workflows`;
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list workflows: ${await response.text()}`);
    }

    const data = await response.json() as { workflows?: Array<{ name: string }> };
    return (data.workflows ?? []).map((w) => w.name);
  }

  /**
   * List available tools.
   */
  async listTools(): Promise<string[]> {
    const url = `${this.config.baseUrl}/api/tools`;
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list tools: ${await response.text()}`);
    }

    const data = await response.json() as { tools?: Array<{ name: string }> };
    return (data.tools ?? []).map((t) => t.name);
  }

  /**
   * Check if Mastra server is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/health`;
      const response = await this.fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Internal fetch with timeout support.
   */
  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      return await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a task function that wraps a Mastra agent.
 */
export function createAgentTask(
  client: MastraClient,
  agentName: string
): (input: Record<string, unknown>) => Promise<AgentResponse> {
  return async (input) => {
    const messages = input.messages as AgentInput['messages'] | undefined;
    if (!messages) {
      throw new Error('Agent task requires messages in input');
    }
    return client.generateAgent(agentName, { messages });
  };
}

/**
 * Create a task function that wraps a Mastra workflow.
 */
export function createWorkflowTask(
  client: MastraClient,
  workflowName: string
): (input: Record<string, unknown>) => Promise<WorkflowResponse> {
  return async (input) => {
    return client.executeWorkflow(workflowName, input);
  };
}

/**
 * Create a task function that wraps a Mastra tool.
 */
export function createToolTask(
  client: MastraClient,
  toolName: string
): (input: Record<string, unknown>) => Promise<unknown> {
  return async (input) => {
    return client.executeTool(toolName, input);
  };
}
