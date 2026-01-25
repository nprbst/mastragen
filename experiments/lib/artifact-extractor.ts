/**
 * Artifact extractor for Mastra agents and workflows.
 * T046: Extracts metadata for synthetic data generation.
 */

import { MastraClient } from './mastra';

/**
 * Agent artifact metadata.
 */
export interface AgentArtifact {
  name: string;
  description?: string;
  tools: string[];
  systemPrompt?: string;
  model?: string;
}

/**
 * Workflow artifact metadata.
 */
export interface WorkflowArtifact {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Workflow step metadata.
 */
export interface WorkflowStep {
  id: string;
  type: 'action' | 'condition' | 'loop' | 'parallel';
  description?: string;
  tool?: string;
  agent?: string;
}

/**
 * Tool artifact metadata.
 */
export interface ToolArtifact {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Combined project artifacts.
 */
export interface ProjectArtifacts {
  agents: AgentArtifact[];
  workflows: WorkflowArtifact[];
  tools: ToolArtifact[];
  extractedAt: string;
}

/**
 * Artifact extractor configuration.
 */
export interface ArtifactExtractorConfig {
  /** Mastra client for API access */
  mastraClient: MastraClient;
}

/**
 * Extracts artifacts from Mastra for synthetic data generation.
 */
export class ArtifactExtractor {
  private mastra: MastraClient;

  constructor(config: ArtifactExtractorConfig) {
    this.mastra = config.mastraClient;
  }

  /**
   * Extract all project artifacts.
   */
  async extractAll(): Promise<ProjectArtifacts> {
    const [agents, workflows, tools] = await Promise.all([
      this.extractAgents(),
      this.extractWorkflows(),
      this.extractTools(),
    ]);

    return {
      agents,
      workflows,
      tools,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract agent artifacts.
   */
  async extractAgents(): Promise<AgentArtifact[]> {
    const agentNames = await this.mastra.listAgents();
    const artifacts: AgentArtifact[] = [];

    for (const name of agentNames) {
      try {
        const details = await this.mastra.getAgentDetails(name);
        artifacts.push({
          name,
          description: details?.description,
          tools: details?.tools ?? [],
          systemPrompt: details?.systemPrompt,
          model: details?.model,
        });
      } catch {
        // If we can't get details, add basic artifact
        artifacts.push({ name, tools: [] });
      }
    }

    return artifacts;
  }

  /**
   * Extract workflow artifacts.
   */
  async extractWorkflows(): Promise<WorkflowArtifact[]> {
    const workflowNames = await this.mastra.listWorkflows();
    const artifacts: WorkflowArtifact[] = [];

    for (const name of workflowNames) {
      try {
        const details = await this.mastra.getWorkflowDetails(name);
        artifacts.push({
          name,
          description: details?.description,
          steps: details?.steps ?? [],
          inputSchema: details?.inputSchema,
          outputSchema: details?.outputSchema,
        });
      } catch {
        // If we can't get details, add basic artifact
        artifacts.push({ name, steps: [] });
      }
    }

    return artifacts;
  }

  /**
   * Extract tool artifacts.
   */
  async extractTools(): Promise<ToolArtifact[]> {
    const toolNames = await this.mastra.listTools();
    const artifacts: ToolArtifact[] = [];

    for (const name of toolNames) {
      try {
        const details = await this.mastra.getToolDetails(name);
        artifacts.push({
          name,
          description: details?.description,
          inputSchema: details?.inputSchema,
          outputSchema: details?.outputSchema,
        });
      } catch {
        // If we can't get details, add basic artifact
        artifacts.push({ name });
      }
    }

    return artifacts;
  }

  /**
   * Generate a summary of artifacts for LLM context.
   */
  summarize(artifacts: ProjectArtifacts): string {
    const lines: string[] = ['# Project Artifacts Summary\n'];

    if (artifacts.agents.length > 0) {
      lines.push('## Agents\n');
      for (const agent of artifacts.agents) {
        lines.push(`### ${agent.name}`);
        if (agent.description) {
          lines.push(agent.description);
        }
        if (agent.tools.length > 0) {
          lines.push(`**Tools:** ${agent.tools.join(', ')}`);
        }
        if (agent.model) {
          lines.push(`**Model:** ${agent.model}`);
        }
        lines.push('');
      }
    }

    if (artifacts.workflows.length > 0) {
      lines.push('## Workflows\n');
      for (const workflow of artifacts.workflows) {
        lines.push(`### ${workflow.name}`);
        if (workflow.description) {
          lines.push(workflow.description);
        }
        if (workflow.steps.length > 0) {
          lines.push(`**Steps:** ${workflow.steps.length}`);
          for (const step of workflow.steps) {
            lines.push(`  - ${step.id} (${step.type})`);
          }
        }
        lines.push('');
      }
    }

    if (artifacts.tools.length > 0) {
      lines.push('## Tools\n');
      for (const tool of artifacts.tools) {
        lines.push(`### ${tool.name}`);
        if (tool.description) {
          lines.push(tool.description);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create an artifact extractor with default configuration.
 */
export function createArtifactExtractor(
  mastraConfig?: Partial<import('./mastra').MastraClientConfig>
): ArtifactExtractor {
  return new ArtifactExtractor({
    mastraClient: new MastraClient(mastraConfig),
  });
}
