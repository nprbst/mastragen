/**
 * Unit tests for prompt client.
 * T045: Tests for prompt fetching and fallback scenarios.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { PromptClient, type LocalPrompt, type Prompt } from './prompt-client';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('PromptClient', () => {
  // Create a mock server with dynamic port
  let mockServer: ReturnType<typeof Bun.serve> | null = null;
  let mockPort = 0;
  let mockEndpoint = '';
  let tempPromptsDir = '';

  // Mock prompts data
  const mockPrompt: Prompt = {
    id: 'prompt-1',
    name: 'greeting',
    description: 'A greeting prompt',
    currentVersion: {
      id: 'v1',
      version: 1,
      tag: 'production',
      template: 'Hello, {{name}}! Welcome to {{place}}.',
      variables: ['name', 'place'],
      createdAt: '2024-01-01T00:00:00Z',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    mock.restore();

    // Create temp prompts directory
    tempPromptsDir = `/tmp/test-prompts-${Date.now()}`;
    await mkdir(tempPromptsDir, { recursive: true });

    // Start mock server
    mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        // Health check
        if (url.pathname === '/health') {
          return new Response(JSON.stringify({ status: 'ok' }));
        }

        // Get prompt by name
        if (url.pathname.match(/^\/v1\/prompts\/[\w-]+$/)) {
          const name = url.pathname.split('/').pop();
          if (name === 'greeting') {
            return new Response(JSON.stringify({ data: mockPrompt }));
          }
          return new Response('Not found', { status: 404 });
        }

        // Get prompt versions
        if (url.pathname.match(/^\/v1\/prompts\/[\w-]+\/versions$/)) {
          return new Response(
            JSON.stringify({
              data: [
                mockPrompt.currentVersion,
                { ...mockPrompt.currentVersion, id: 'v0', version: 0, tag: 'draft' },
              ],
            })
          );
        }

        // List prompts
        if (url.pathname === '/v1/prompts') {
          if (req.method === 'GET') {
            return new Response(
              JSON.stringify({
                data: [{ id: 'prompt-1', name: 'greeting', description: 'A greeting prompt' }],
              })
            );
          }
          // Create prompt
          if (req.method === 'POST') {
            return new Response(JSON.stringify({ data: mockPrompt }), { status: 201 });
          }
        }

        return new Response('Not found', { status: 404 });
      },
    });

    mockPort = mockServer.port ?? 0;
    mockEndpoint = `http://localhost:${mockPort}`;
  });

  afterEach(async () => {
    mockServer?.stop();
    mockServer = null;

    // Clean up temp directory
    try {
      await rm(tempPromptsDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('fetchPrompt', () => {
    test('should fetch prompt from Phoenix', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const prompt = await client.fetchPrompt('greeting');

      expect(prompt).not.toBeNull();
      expect(prompt?.name).toBe('greeting');
      expect(prompt?.currentVersion.template).toContain('{{name}}');
    });

    test('should return null for non-existent prompt', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const prompt = await client.fetchPrompt('nonexistent');

      expect(prompt).toBeNull();
    });

    test('should fetch prompt with specific tag', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const prompt = await client.fetchPrompt('greeting', 'production');

      expect(prompt).not.toBeNull();
      expect(prompt?.currentVersion.tag).toBe('production');
    });
  });

  describe('fallback behavior', () => {
    test('should fall back to local prompt when Phoenix is unavailable', async () => {
      const client = new PromptClient({
        endpoint: 'http://localhost:19999', // Non-existent server
        enableFallback: true,
        timeout: 500,
      });

      const localFallback: LocalPrompt = {
        template: 'Local: Hello, {{name}}!',
        variables: ['name'],
      };

      const prompt = await client.fetchPrompt('greeting', undefined, localFallback);

      expect(prompt).not.toBeNull();
      expect(prompt?.currentVersion.template).toBe('Local: Hello, {{name}}!');
      expect(prompt?.currentVersion.tag).toBe('local');
    });

    test('should fall back to local file when Phoenix is unavailable', async () => {
      // Create a local prompt file
      const localPrompt: LocalPrompt = {
        template: 'File fallback: Hi {{name}}!',
        variables: ['name'],
      };
      await writeFile(
        join(tempPromptsDir, 'file-prompt.json'),
        JSON.stringify(localPrompt)
      );

      const client = new PromptClient({
        endpoint: 'http://localhost:19999', // Non-existent server
        localPromptsDir: tempPromptsDir,
        enableFallback: true,
        timeout: 500,
      });

      const prompt = await client.fetchPrompt('file-prompt');

      expect(prompt).not.toBeNull();
      expect(prompt?.currentVersion.template).toBe('File fallback: Hi {{name}}!');
    });

    test('should return null when no fallback available', async () => {
      const client = new PromptClient({
        endpoint: 'http://localhost:19999', // Non-existent server
        localPromptsDir: tempPromptsDir,
        enableFallback: true,
        timeout: 500,
      });

      const prompt = await client.fetchPrompt('nonexistent');

      expect(prompt).toBeNull();
    });

    test('should throw when fallback is disabled and Phoenix unavailable', async () => {
      const client = new PromptClient({
        endpoint: 'http://localhost:19999', // Non-existent server
        enableFallback: false,
        timeout: 500,
      });

      await expect(client.fetchPrompt('greeting')).rejects.toThrow();
    });
  });

  describe('getPromptVersions', () => {
    test('should fetch version history', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const versions = await client.getPromptVersions('greeting');

      expect(versions.length).toBe(2);
      expect(versions[0]!.version).toBe(1);
      expect(versions[1]!.version).toBe(0);
    });
  });

  describe('savePrompt', () => {
    test('should create a new prompt', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const prompt = await client.savePrompt('greeting', 'Hello, {{name}}!', {
        description: 'A greeting prompt',
        variables: ['name'],
        tag: 'production',
      });

      expect(prompt.name).toBe('greeting');
    });
  });

  describe('listPrompts', () => {
    test('should list all prompts', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const prompts = await client.listPrompts();

      expect(prompts.length).toBe(1);
      expect(prompts[0]!.name).toBe('greeting');
    });
  });

  describe('isAvailable', () => {
    test('should return true when Phoenix is healthy', async () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const available = await client.isAvailable();

      expect(available).toBe(true);
    });

    test('should return false when Phoenix is unavailable', async () => {
      const client = new PromptClient({ endpoint: 'http://localhost:19999' });
      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('renderTemplate', () => {
    test('should render template with double braces', () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const result = client.renderTemplate('Hello, {{name}}! Welcome to {{place}}.', {
        name: 'Alice',
        place: 'Wonderland',
      });

      expect(result).toBe('Hello, Alice! Welcome to Wonderland.');
    });

    test('should render template with single braces', () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const result = client.renderTemplate('Hello, {name}!', {
        name: 'Bob',
      });

      expect(result).toBe('Hello, Bob!');
    });

    test('should handle missing variables', () => {
      const client = new PromptClient({ endpoint: mockEndpoint });
      const result = client.renderTemplate('Hello, {{name}}! Your code is {{code}}.', {
        name: 'Charlie',
      });

      expect(result).toBe('Hello, Charlie! Your code is {{code}}.');
    });
  });
});
