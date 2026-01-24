/**
 * Unit tests for artifact extractor.
 * T051: Tests for artifact extraction from Mastra.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { ArtifactExtractor } from './artifact-extractor';

describe('ArtifactExtractor', () => {
  // Create a mock server with dynamic port
  let mockServer: ReturnType<typeof Bun.serve> | null = null;
  let mockPort = 0;
  let mockBaseUrl = '';

  beforeEach(() => {
    mock.restore();

    // Start mock server with port 0 to get a random available port
    mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        // List agents
        if (url.pathname === '/api/agents' && req.method === 'GET') {
          return new Response(
            JSON.stringify({
              agents: [
                { name: 'chat-agent' },
                { name: 'code-agent' },
              ],
            })
          );
        }

        // Get agent details
        if (url.pathname === '/api/agents/chat-agent') {
          return new Response(
            JSON.stringify({
              name: 'chat-agent',
              description: 'A conversational agent',
              tools: ['search', 'calculator'],
              model: 'claude-sonnet-4-20250514',
              systemPrompt: 'You are a helpful assistant.',
            })
          );
        }

        if (url.pathname === '/api/agents/code-agent') {
          return new Response(
            JSON.stringify({
              name: 'code-agent',
              description: 'A coding assistant',
              tools: ['file-read', 'file-write', 'execute'],
              model: 'claude-sonnet-4-20250514',
            })
          );
        }

        // List workflows
        if (url.pathname === '/api/workflows' && req.method === 'GET') {
          return new Response(
            JSON.stringify({
              workflows: [{ name: 'data-pipeline' }],
            })
          );
        }

        // Get workflow details
        if (url.pathname === '/api/workflows/data-pipeline') {
          return new Response(
            JSON.stringify({
              name: 'data-pipeline',
              description: 'Process data through stages',
              steps: [
                { id: 'fetch', type: 'action', tool: 'http-fetch' },
                { id: 'transform', type: 'action', tool: 'data-transform' },
                { id: 'validate', type: 'condition' },
              ],
              inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
            })
          );
        }

        // List tools
        if (url.pathname === '/api/tools' && req.method === 'GET') {
          return new Response(
            JSON.stringify({
              tools: [
                { name: 'search' },
                { name: 'calculator' },
              ],
            })
          );
        }

        // Get tool details
        if (url.pathname === '/api/tools/search') {
          return new Response(
            JSON.stringify({
              name: 'search',
              description: 'Search the web',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
            })
          );
        }

        if (url.pathname === '/api/tools/calculator') {
          return new Response(
            JSON.stringify({
              name: 'calculator',
              description: 'Perform calculations',
              inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
            })
          );
        }

        return new Response('Not found', { status: 404 });
      },
    });

    mockPort = mockServer.port ?? 0;
    mockBaseUrl = `http://localhost:${mockPort}`;
  });

  afterEach(() => {
    mockServer?.stop();
    mockServer = null;
  });

  describe('extractAll', () => {
    test('should extract all artifacts', async () => {
      const { MastraClient } = await import('./mastra');
      const mastraClient = new MastraClient({ baseUrl: mockBaseUrl });
      const extractor = new ArtifactExtractor({ mastraClient });

      const artifacts = await extractor.extractAll();

      expect(artifacts.agents.length).toBe(2);
      expect(artifacts.workflows.length).toBe(1);
      expect(artifacts.tools.length).toBe(2);
      expect(artifacts.extractedAt).toBeDefined();
    });
  });

  describe('extractAgents', () => {
    test('should extract agent artifacts with details', async () => {
      const { MastraClient } = await import('./mastra');
      const mastraClient = new MastraClient({ baseUrl: mockBaseUrl });
      const extractor = new ArtifactExtractor({ mastraClient });

      const agents = await extractor.extractAgents();

      expect(agents.length).toBe(2);

      const chatAgent = agents.find((a) => a.name === 'chat-agent');
      expect(chatAgent).toBeDefined();
      expect(chatAgent?.description).toBe('A conversational agent');
      expect(chatAgent?.tools).toContain('search');
      expect(chatAgent?.tools).toContain('calculator');
      expect(chatAgent?.model).toBe('claude-sonnet-4-20250514');

      const codeAgent = agents.find((a) => a.name === 'code-agent');
      expect(codeAgent).toBeDefined();
      expect(codeAgent?.tools).toContain('file-read');
    });
  });

  describe('extractWorkflows', () => {
    test('should extract workflow artifacts with details', async () => {
      const { MastraClient } = await import('./mastra');
      const mastraClient = new MastraClient({ baseUrl: mockBaseUrl });
      const extractor = new ArtifactExtractor({ mastraClient });

      const workflows = await extractor.extractWorkflows();

      expect(workflows.length).toBe(1);

      const pipeline = workflows[0];
      expect(pipeline?.name).toBe('data-pipeline');
      expect(pipeline?.description).toBe('Process data through stages');
      expect(pipeline?.steps.length).toBe(3);
      expect(pipeline?.inputSchema).toBeDefined();
    });
  });

  describe('extractTools', () => {
    test('should extract tool artifacts with details', async () => {
      const { MastraClient } = await import('./mastra');
      const mastraClient = new MastraClient({ baseUrl: mockBaseUrl });
      const extractor = new ArtifactExtractor({ mastraClient });

      const tools = await extractor.extractTools();

      expect(tools.length).toBe(2);

      const searchTool = tools.find((t) => t.name === 'search');
      expect(searchTool).toBeDefined();
      expect(searchTool?.description).toBe('Search the web');
      expect(searchTool?.inputSchema).toBeDefined();
    });
  });

  describe('summarize', () => {
    test('should generate markdown summary', async () => {
      const { MastraClient } = await import('./mastra');
      const mastraClient = new MastraClient({ baseUrl: mockBaseUrl });
      const extractor = new ArtifactExtractor({ mastraClient });

      const artifacts = await extractor.extractAll();
      const summary = extractor.summarize(artifacts);

      expect(summary).toContain('# Project Artifacts Summary');
      expect(summary).toContain('## Agents');
      expect(summary).toContain('### chat-agent');
      expect(summary).toContain('## Workflows');
      expect(summary).toContain('### data-pipeline');
      expect(summary).toContain('## Tools');
      expect(summary).toContain('### search');
    });
  });
});
