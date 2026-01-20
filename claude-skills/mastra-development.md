---
name: mastra-development
description: Guidance for developing Mastra agents, tools, and workflows using the Mastra TypeScript framework
---

# Mastra Development Patterns

This skill provides domain knowledge for developing Mastra-based applications.

## Mastra Framework Overview

Mastra is a TypeScript framework for building AI-powered applications with:
- **Agents**: Autonomous AI workers with tools and memory
- **Workflows**: Step-by-step task execution with branching logic
- **RAG**: Retrieval-augmented generation for document-based AI
- **Integrations**: Pre-built connectors for common services

## Project Structure

```
src/
├── mastra/
│   ├── agents/          # AI agent definitions
│   ├── workflows/       # Workflow definitions
│   ├── tools/           # Custom tool implementations
│   └── index.ts         # Mastra instance export
├── lib/                 # Shared utilities
└── app/                 # Application entry points
```

## Agent Development

### Defining an Agent

```typescript
import { Agent } from '@mastra/core';

export const codeReviewAgent = new Agent({
  name: 'code-review',
  instructions: `You are a code reviewer. Analyze code for:
    - Best practices and patterns
    - Security vulnerabilities
    - Performance issues
    - Code clarity and maintainability`,
  model: {
    provider: 'ANTHROPIC',
    name: 'claude-3-5-sonnet-20241022',
  },
  tools: [analyzeCodeTool, suggestFixTool],
});
```

### Best Practices

1. **Keep instructions focused**: Each agent should have a single, clear purpose
2. **Use structured outputs**: Define tool schemas with clear types
3. **Handle errors gracefully**: Wrap tool execution in try-catch
4. **Log important actions**: Use structured logging for debugging

## Workflow Development

### Creating a Workflow

```typescript
import { Workflow, Step } from '@mastra/core';

const reviewWorkflow = new Workflow({
  name: 'code-review-workflow',
  trigger: { type: 'manual' },
});

reviewWorkflow
  .step('analyze', {
    execute: async ({ context }) => {
      const analysis = await codeReviewAgent.generate(context.code);
      return { analysis };
    },
  })
  .then('report', {
    execute: async ({ context }) => {
      return formatReport(context.analysis);
    },
  });
```

### Branching Logic

```typescript
workflow
  .step('check')
  .if(({ context }) => context.severity === 'high')
  .then('urgent-fix')
  .else('normal-review');
```

## Tool Development

### Defining Tools

```typescript
import { createTool } from '@mastra/core';
import { z } from 'zod';

export const analyzeCodeTool = createTool({
  id: 'analyze-code',
  description: 'Analyze source code for issues',
  inputSchema: z.object({
    code: z.string().describe('Source code to analyze'),
    language: z.string().describe('Programming language'),
  }),
  execute: async ({ code, language }) => {
    // Tool implementation
    return { issues: [], suggestions: [] };
  },
});
```

## Integration Patterns

### Database Integration

```typescript
import { PGVector } from '@mastra/pg';

const vectorStore = new PGVector({
  connectionString: process.env.DATABASE_URL,
});

// Use for RAG
const results = await vectorStore.query({
  vector: embedding,
  topK: 5,
});
```

### External API Integration

```typescript
import { createIntegration } from '@mastra/core';

const slackIntegration = createIntegration({
  name: 'slack',
  auth: {
    type: 'oauth2',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
  },
  tools: [sendMessageTool, createChannelTool],
});
```

## Testing Mastra Applications

### Unit Testing Agents

```typescript
import { describe, test, expect } from 'bun:test';
import { codeReviewAgent } from './agents';

describe('codeReviewAgent', () => {
  test('should identify security issues', async () => {
    const result = await codeReviewAgent.generate({
      code: 'eval(userInput)',
    });
    expect(result).toContain('security');
  });
});
```

### Testing Workflows

```typescript
import { testWorkflow } from '@mastra/testing';

test('review workflow', async () => {
  const result = await testWorkflow(reviewWorkflow, {
    code: 'function add(a, b) { return a + b; }',
  });
  expect(result.status).toBe('completed');
});
```

## Debugging Tips

1. **Enable verbose logging**: Set `MASTRA_LOG_LEVEL=debug`
2. **Use the Mastra CLI**: `mastra dev` for local development
3. **Check tool execution**: Log input/output of each tool call
4. **Validate schemas**: Use strict TypeScript for schema definitions
