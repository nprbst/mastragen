/**
 * Unit tests for Mastra HTTP client.
 * T042: Tests for agent, workflow, and tool execution.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { MastraClient, createAgentTask, createWorkflowTask, createToolTask } from './mastra';

describe('MastraClient', () => {
  // Create a mock server with dynamic port
  let mockServer: ReturnType<typeof Bun.serve> | null = null;
  let mockPort = 0;
  let mockBaseUrl = '';

  beforeEach(() => {
    mock.restore();

    // Start mock server with port 0 to get a random available port
    mockServer = Bun.serve({
      port: 0, // Let OS assign random port
      fetch(req) {
        const url = new URL(req.url);

        // Health check
        if (url.pathname === '/health') {
          return new Response(JSON.stringify({ status: 'ok' }));
        }

        // Agent generate
        if (url.pathname.match(/\/api\/agents\/[\w-]+\/generate/)) {
          return new Response(JSON.stringify({
            text: 'Hello from agent',
            steps: [],
          }));
        }

        // Workflow execute
        if (url.pathname.match(/\/api\/workflows\/[\w-]+\/execute/)) {
          return new Response(JSON.stringify({
            success: true,
            results: { output: 'workflow result' },
          }));
        }

        // Tool execute
        if (url.pathname.match(/\/api\/tools\/[\w-]+\/execute/)) {
          return new Response(JSON.stringify({ result: 'tool result' }));
        }

        // List agents
        if (url.pathname === '/api/agents') {
          return new Response(JSON.stringify({
            agents: [{ name: 'agent1' }, { name: 'agent2' }],
          }));
        }

        // List workflows
        if (url.pathname === '/api/workflows') {
          return new Response(JSON.stringify({
            workflows: [{ name: 'workflow1' }],
          }));
        }

        // List tools
        if (url.pathname === '/api/tools') {
          return new Response(JSON.stringify({
            tools: [{ name: 'tool1' }, { name: 'tool2' }],
          }));
        }

        return new Response('Not found', { status: 404 });
      },
    });

    // Get the actual port assigned
    mockPort = mockServer.port;
    mockBaseUrl = `http://localhost:${mockPort}`;
  });

  afterEach(() => {
    mockServer?.stop();
    mockServer = null;
  });

  describe('generateAgent', () => {
    test('should send messages to agent', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const response = await client.generateAgent('test-agent', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.text).toBe('Hello from agent');
    });

    test('should throw on agent error', async () => {
      // Stop mock server to simulate error
      mockServer?.stop();

      const client = new MastraClient({
        baseUrl: 'http://localhost:19999',
        timeout: 1000,
      });

      await expect(
        client.generateAgent('test-agent', {
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('executeWorkflow', () => {
    test('should execute workflow with input', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const response = await client.executeWorkflow('test-workflow', {
        data: 'test',
      });

      expect(response.success).toBe(true);
      expect(response.results).toBeDefined();
    });
  });

  describe('executeTool', () => {
    test('should execute tool with input', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const response = await client.executeTool('test-tool', {
        param: 'value',
      });

      expect(response).toBeDefined();
    });
  });

  describe('listAgents', () => {
    test('should list available agents', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const agents = await client.listAgents();

      expect(agents).toContain('agent1');
      expect(agents).toContain('agent2');
    });
  });

  describe('listWorkflows', () => {
    test('should list available workflows', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const workflows = await client.listWorkflows();

      expect(workflows).toContain('workflow1');
    });
  });

  describe('listTools', () => {
    test('should list available tools', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const tools = await client.listTools();

      expect(tools).toContain('tool1');
      expect(tools).toContain('tool2');
    });
  });

  describe('healthCheck', () => {
    test('should return true when healthy', async () => {
      const client = new MastraClient({ baseUrl: mockBaseUrl });
      const healthy = await client.healthCheck();

      expect(healthy).toBe(true);
    });

    test('should return false when unhealthy', async () => {
      const client = new MastraClient({
        baseUrl: 'http://localhost:19999',
        timeout: 500,
      });
      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });
  });
});

describe('Task creators', () => {
  describe('createAgentTask', () => {
    test('should throw when messages not provided', async () => {
      const mockClient = {
        generateAgent: mock(() => Promise.resolve({ text: 'ok' })),
      } as any;

      const task = createAgentTask(mockClient, 'test-agent');

      await expect(task({ text: 'hello' })).rejects.toThrow(
        'Agent task requires messages in input'
      );
    });

    test('should call generateAgent with messages', async () => {
      const mockClient = {
        generateAgent: mock(() => Promise.resolve({ text: 'response' })),
      } as any;

      const task = createAgentTask(mockClient, 'test-agent');
      const result = await task({
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(mockClient.generateAgent).toHaveBeenCalled();
      expect(result.text).toBe('response');
    });
  });

  describe('createWorkflowTask', () => {
    test('should call executeWorkflow with input', async () => {
      const mockClient = {
        executeWorkflow: mock(() =>
          Promise.resolve({ success: true, results: {} })
        ),
      } as any;

      const task = createWorkflowTask(mockClient, 'test-workflow');
      const result = await task({ data: 'test' });

      expect(mockClient.executeWorkflow).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('createToolTask', () => {
    test('should call executeTool with input', async () => {
      const mockClient = {
        executeTool: mock(() => Promise.resolve({ result: 'ok' })),
      } as any;

      const task = createToolTask(mockClient, 'test-tool');
      const result = await task({ param: 'value' });

      expect(mockClient.executeTool).toHaveBeenCalled();
      expect(result).toEqual({ result: 'ok' });
    });
  });
});
