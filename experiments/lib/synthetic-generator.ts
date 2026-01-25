/**
 * Synthetic data generator for experiment datasets.
 * T047-T050: Generates test cases using LLM and personas.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DatasetExample } from './types';
import type { ProjectArtifacts } from './artifact-extractor';

/**
 * Persona definition for synthetic data generation.
 */
export interface Persona {
  /** Persona identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the persona's characteristics */
  description: string;
  /** Communication style traits */
  traits: string[];
  /** Example scenarios this persona might encounter */
  scenarios?: string[];
  /** Expertise level */
  expertise: 'novice' | 'intermediate' | 'expert';
}

/**
 * Synthetic data generation configuration.
 */
export interface SyntheticGeneratorConfig {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use for generation */
  model?: 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250514';
  /** Maximum tokens for generation */
  maxTokens?: number;
}

/**
 * Options for generating synthetic examples.
 */
export interface GenerateExamplesOptions {
  /** Target artifact (agent or workflow name) */
  targetArtifact: string;
  /** Project artifacts context */
  artifacts?: ProjectArtifacts;
  /** Number of examples to generate */
  count: number;
  /** Personas to use for generation */
  personas?: Persona[];
  /** Include edge cases */
  includeEdgeCases?: boolean;
  /** Custom instructions for generation */
  instructions?: string;
  /** Input field name (for the generated examples) */
  inputField?: string;
}

/**
 * Synthetic data generator using Claude.
 */
export class SyntheticGenerator {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config?: SyntheticGeneratorConfig) {
    this.client = new Anthropic({
      apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = config?.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = config?.maxTokens ?? 4096;
  }

  /**
   * Generate synthetic examples for a target artifact.
   */
  async generateExamples(options: GenerateExamplesOptions): Promise<DatasetExample[]> {
    const {
      targetArtifact,
      artifacts,
      count,
      personas = [],
      includeEdgeCases = true,
      instructions,
      inputField = 'messages',
    } = options;

    // Build context from artifacts
    let artifactContext = '';
    if (artifacts) {
      const agent = artifacts.agents.find((a) => a.name === targetArtifact);
      const workflow = artifacts.workflows.find((w) => w.name === targetArtifact);

      if (agent) {
        artifactContext = `
Target Agent: ${agent.name}
Description: ${agent.description ?? 'No description'}
Tools Available: ${agent.tools.length > 0 ? agent.tools.join(', ') : 'None'}
${agent.systemPrompt ? `System Prompt: ${agent.systemPrompt}` : ''}
`;
      } else if (workflow) {
        artifactContext = `
Target Workflow: ${workflow.name}
Description: ${workflow.description ?? 'No description'}
Steps: ${workflow.steps.length}
${workflow.inputSchema ? `Input Schema: ${JSON.stringify(workflow.inputSchema, null, 2)}` : ''}
`;
      }
    }

    // Build persona context
    let personaContext = '';
    if (personas.length > 0) {
      personaContext = '\n\nAvailable Personas:\n' + personas.map((p) => `
- ${p.name} (${p.expertise}): ${p.description}
  Traits: ${p.traits.join(', ')}
  ${p.scenarios ? `Scenarios: ${p.scenarios.join(', ')}` : ''}
`).join('');
    }

    const systemPrompt = `You are a synthetic data generator for AI system testing. Your job is to create realistic, diverse test cases that thoroughly exercise an AI agent or workflow.

Guidelines:
- Generate varied inputs that test different capabilities
- Include both typical use cases and edge cases
- Consider different user expertise levels and communication styles
- Make inputs realistic and representative of actual usage
- Include challenging but fair test cases

${artifactContext}
${personaContext}
${instructions ? `\nAdditional Instructions:\n${instructions}` : ''}`;

    const userPrompt = `Generate ${count} synthetic test examples for "${targetArtifact}".

${includeEdgeCases ? 'Include 20-30% edge cases (unusual inputs, boundary conditions, error scenarios).' : 'Focus on typical use cases.'}

${personas.length > 0 ? `Distribute examples across the following personas: ${personas.map((p) => p.name).join(', ')}` : ''}

Return a JSON array of examples. Each example should have:
- id: unique identifier (e.g., "syn-001")
- input: object with "${inputField}" field containing the test input
- metadata: object with persona, scenario, rationale, and edgeCase boolean

Example format:
\`\`\`json
[
  {
    "id": "syn-001",
    "input": {
      "${inputField}": [{"role": "user", "content": "Example message"}]
    },
    "metadata": {
      "persona": "casual-user",
      "scenario": "simple-query",
      "rationale": "Tests basic functionality",
      "edgeCase": false
    }
  }
]
\`\`\`

Generate exactly ${count} examples now:`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    // Extract JSON from response
    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const examples = this.parseExamples((content as { type: 'text'; text: string }).text);
    return examples;
  }

  /**
   * Generate edge case examples specifically.
   */
  async generateEdgeCases(
    targetArtifact: string,
    count: number,
    artifacts?: ProjectArtifacts
  ): Promise<DatasetExample[]> {
    return this.generateExamples({
      targetArtifact,
      artifacts,
      count,
      includeEdgeCases: true,
      instructions: `Focus specifically on edge cases:
- Empty or minimal inputs
- Very long inputs
- Special characters and unicode
- Ambiguous requests
- Multiple intents in one message
- Requests outside the agent's capabilities
- Adversarial inputs (prompt injection attempts)
- Boundary conditions`,
    });
  }

  /**
   * Generate persona-specific examples.
   */
  async generateForPersona(
    targetArtifact: string,
    persona: Persona,
    count: number,
    artifacts?: ProjectArtifacts
  ): Promise<DatasetExample[]> {
    return this.generateExamples({
      targetArtifact,
      artifacts,
      count,
      personas: [persona],
      includeEdgeCases: false,
      instructions: `All examples should reflect the ${persona.name} persona:
- Expertise level: ${persona.expertise}
- Communication traits: ${persona.traits.join(', ')}
- ${persona.description}`,
    });
  }

  /**
   * Parse examples from LLM response.
   */
  private parseExamples(text: string): DatasetExample[] {
    // Find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as DatasetExample[];

      // Validate and normalize examples
      return parsed.map((example, index) => ({
        id: example.id || `syn-${String(index + 1).padStart(3, '0')}`,
        input: example.input || {},
        output: example.output,
        metadata: {
          ...example.metadata,
          generated: true,
          generatedAt: new Date().toISOString(),
        },
      }));
    } catch (e) {
      throw new Error(`Failed to parse examples: ${e}`);
    }
  }
}

/**
 * Create a synthetic generator with default configuration.
 */
export function createSyntheticGenerator(
  config?: SyntheticGeneratorConfig
): SyntheticGenerator {
  return new SyntheticGenerator(config);
}
