/**
 * Error analysis module for experiment results.
 * T053-T057: Open coding, axial coding, and improvement plan generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RunResult, ExperimentResult } from './types';

/**
 * Error category from open coding.
 */
export interface ErrorCategory {
  /** Category identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the error pattern */
  description: string;
  /** Example error messages in this category */
  examples: string[];
  /** Count of errors in this category */
  count: number;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Relationship between error categories (axial coding).
 */
export interface CategoryRelationship {
  /** Source category */
  from: string;
  /** Target category */
  to: string;
  /** Relationship type */
  type: 'causes' | 'precedes' | 'correlates' | 'masks';
  /** Description of the relationship */
  description: string;
  /** Confidence in this relationship (0-1) */
  confidence: number;
}

/**
 * Improvement suggestion.
 */
export interface ImprovementSuggestion {
  /** Suggestion identifier */
  id: string;
  /** Title of the improvement */
  title: string;
  /** Detailed description */
  description: string;
  /** Categories this addresses */
  addressesCategories: string[];
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Estimated impact */
  impact: 'low' | 'medium' | 'high';
  /** Implementation effort */
  effort: 'low' | 'medium' | 'high';
}

/**
 * Complete error analysis result.
 */
export interface ErrorAnalysisResult {
  /** Summary statistics */
  summary: {
    totalErrors: number;
    uniqueErrorMessages: number;
    categoriesIdentified: number;
    relationshipsFound: number;
  };
  /** Error categories from open coding */
  categories: ErrorCategory[];
  /** Relationships between categories */
  relationships: CategoryRelationship[];
  /** Suggested improvements */
  improvements: ImprovementSuggestion[];
  /** Analysis timestamp */
  analyzedAt: string;
}

/**
 * Error analyzer configuration.
 */
export interface ErrorAnalyzerConfig {
  /** Anthropic API key */
  apiKey?: string;
  /** Model for analysis */
  model?: 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250514';
  /** Maximum tokens */
  maxTokens?: number;
}

/**
 * Error analyzer using Claude for pattern recognition.
 */
export class ErrorAnalyzer {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config?: ErrorAnalyzerConfig) {
    this.client = new Anthropic({
      apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = config?.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = config?.maxTokens ?? 4096;
  }

  /**
   * Analyze experiment results for errors.
   */
  async analyzeExperiment(experiment: ExperimentResult): Promise<ErrorAnalysisResult> {
    const failedRuns = experiment.results.filter((r) => r.error);

    if (failedRuns.length === 0) {
      return {
        summary: {
          totalErrors: 0,
          uniqueErrorMessages: 0,
          categoriesIdentified: 0,
          relationshipsFound: 0,
        },
        categories: [],
        relationships: [],
        improvements: [],
        analyzedAt: new Date().toISOString(),
      };
    }

    // Perform open coding
    const categories = await this.openCoding(failedRuns);

    // Perform axial coding if we have enough categories
    let relationships: CategoryRelationship[] = [];
    if (categories.length > 1) {
      relationships = await this.axialCoding(categories, failedRuns);
    }

    // Generate improvement suggestions
    const improvements = await this.generateImprovements(categories, relationships);

    const uniqueErrors = new Set(failedRuns.map((r) => r.error));

    return {
      summary: {
        totalErrors: failedRuns.length,
        uniqueErrorMessages: uniqueErrors.size,
        categoriesIdentified: categories.length,
        relationshipsFound: relationships.length,
      },
      categories,
      relationships,
      improvements,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Open coding: Identify error categories.
   */
  async openCoding(failedRuns: RunResult[]): Promise<ErrorCategory[]> {
    const errors = failedRuns.map((r) => ({
      error: r.error,
      input: JSON.stringify(r.example.input).slice(0, 200),
    }));

    const prompt = `Analyze the following error messages and categorize them using qualitative open coding.

Errors:
${errors.map((e, i) => `${i + 1}. Error: "${e.error}"
   Input sample: ${e.input}`).join('\n\n')}

Create distinct categories for these errors. For each category:
1. Give it a short identifier (kebab-case)
2. Provide a clear name
3. Describe the pattern
4. List which error numbers belong to it
5. Assign severity: low, medium, high, or critical

Return JSON array:
\`\`\`json
[
  {
    "id": "category-id",
    "name": "Category Name",
    "description": "Description of the error pattern",
    "errorIndices": [1, 3, 5],
    "severity": "medium"
  }
]
\`\`\``;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are an expert at analyzing software errors and identifying patterns using qualitative coding methods.',
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const parsed = this.parseJson<Array<{
      id: string;
      name: string;
      description: string;
      errorIndices: number[];
      severity: ErrorCategory['severity'];
    }>>((content as { type: 'text'; text: string }).text);

    // Map indices back to actual error messages
    return parsed.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      examples: cat.errorIndices
        .map((i) => errors[i - 1]?.error)
        .filter(Boolean) as string[],
      count: cat.errorIndices.length,
      severity: cat.severity,
    }));
  }

  /**
   * Axial coding: Find relationships between categories.
   */
  async axialCoding(
    categories: ErrorCategory[],
    failedRuns: RunResult[]
  ): Promise<CategoryRelationship[]> {
    const categoryDescriptions = categories
      .map((c) => `- ${c.id}: ${c.name} - ${c.description} (${c.count} errors, ${c.severity} severity)`)
      .join('\n');

    const prompt = `Analyze relationships between these error categories using axial coding.

Categories:
${categoryDescriptions}

Sample error context:
${failedRuns.slice(0, 5).map((r) => `- Error: "${r.error}" | Input: ${JSON.stringify(r.example.input).slice(0, 100)}`).join('\n')}

Identify relationships between categories:
- "causes": One category's errors lead to another
- "precedes": One type of error typically happens before another
- "correlates": Errors occur together but causation unclear
- "masks": One error hides another underlying issue

Return JSON array of relationships with confidence scores (0-1):
\`\`\`json
[
  {
    "from": "category-id-1",
    "to": "category-id-2",
    "type": "causes",
    "description": "Description of the relationship",
    "confidence": 0.8
  }
]
\`\`\`

Only include relationships you're reasonably confident about (>0.5).`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are an expert at analyzing software errors and finding causal relationships using axial coding.',
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    try {
      return this.parseJson<CategoryRelationship[]>(
        (content as { type: 'text'; text: string }).text
      );
    } catch {
      return [];
    }
  }

  /**
   * Generate improvement suggestions based on analysis.
   */
  async generateImprovements(
    categories: ErrorCategory[],
    relationships: CategoryRelationship[]
  ): Promise<ImprovementSuggestion[]> {
    const categoryDescriptions = categories
      .map((c) => `- ${c.name} (${c.severity}): ${c.description}`)
      .join('\n');

    const relationshipDescriptions = relationships
      .map((r) => `- ${r.from} ${r.type} ${r.to}: ${r.description}`)
      .join('\n');

    const prompt = `Based on this error analysis, suggest concrete improvements.

Error Categories:
${categoryDescriptions}

${relationships.length > 0 ? `Relationships:\n${relationshipDescriptions}` : ''}

For each suggestion:
1. Give it a unique ID
2. Provide a clear title
3. Describe the improvement in detail
4. List which categories it addresses
5. Rate priority, impact, and effort (low/medium/high)

Focus on:
- Root causes over symptoms
- High-impact, low-effort fixes first
- Actionable, specific recommendations

Return JSON array:
\`\`\`json
[
  {
    "id": "suggestion-1",
    "title": "Improvement Title",
    "description": "Detailed description of what to do",
    "addressesCategories": ["category-id-1"],
    "priority": "high",
    "impact": "high",
    "effort": "low"
  }
]
\`\`\``;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are an expert at improving software systems based on error analysis.',
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    try {
      return this.parseJson<ImprovementSuggestion[]>(
        (content as { type: 'text'; text: string }).text
      );
    } catch {
      return [];
    }
  }

  /**
   * Generate a markdown report from analysis results.
   */
  generateReport(analysis: ErrorAnalysisResult): string {
    const lines: string[] = ['# Error Analysis Report\n'];

    // Summary
    lines.push('## Summary\n');
    lines.push(`- **Total Errors:** ${analysis.summary.totalErrors}`);
    lines.push(`- **Unique Error Messages:** ${analysis.summary.uniqueErrorMessages}`);
    lines.push(`- **Categories Identified:** ${analysis.summary.categoriesIdentified}`);
    lines.push(`- **Relationships Found:** ${analysis.summary.relationshipsFound}`);
    lines.push(`- **Analysis Date:** ${analysis.analyzedAt}\n`);

    // Categories
    if (analysis.categories.length > 0) {
      lines.push('## Error Categories\n');
      for (const cat of analysis.categories) {
        lines.push(`### ${cat.name} (\`${cat.id}\`)\n`);
        lines.push(`**Severity:** ${cat.severity} | **Count:** ${cat.count}\n`);
        lines.push(cat.description + '\n');
        if (cat.examples.length > 0) {
          lines.push('**Examples:**');
          for (const ex of cat.examples.slice(0, 3)) {
            lines.push(`- \`${ex}\``);
          }
          lines.push('');
        }
      }
    }

    // Relationships
    if (analysis.relationships.length > 0) {
      lines.push('## Relationships\n');
      for (const rel of analysis.relationships) {
        lines.push(`- **${rel.from}** ${rel.type} **${rel.to}** (confidence: ${(rel.confidence * 100).toFixed(0)}%)`);
        lines.push(`  - ${rel.description}`);
      }
      lines.push('');
    }

    // Improvements
    if (analysis.improvements.length > 0) {
      lines.push('## Suggested Improvements\n');
      for (const imp of analysis.improvements) {
        lines.push(`### ${imp.title}\n`);
        lines.push(`**Priority:** ${imp.priority} | **Impact:** ${imp.impact} | **Effort:** ${imp.effort}\n`);
        lines.push(imp.description + '\n');
        lines.push(`*Addresses:* ${imp.addressesCategories.join(', ')}\n`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse JSON from LLM response.
   */
  private parseJson<T>(text: string): T {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    return JSON.parse(jsonMatch[0]) as T;
  }
}

/**
 * Create an error analyzer with default configuration.
 */
export function createErrorAnalyzer(config?: ErrorAnalyzerConfig): ErrorAnalyzer {
  return new ErrorAnalyzer(config);
}
