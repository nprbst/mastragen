import { useState, useEffect } from 'react';
import { createAuthHeaders } from '../../lib/auth';

interface ClaudeConfig {
  id: string;
  projectId: string;
  claudeMd: string | null;
  mcpServers: Record<string, unknown>;
  autoApproveFilePatterns: string[];
  autoApproveMcpTools: string[];
  autoApproveBashCommands: string[];
  createdAt: string;
  updatedAt: string;
}

interface ClaudeConfigTabProps {
  projectId: string;
  apiBase: string;
}

export default function ClaudeConfigTab({ projectId, apiBase }: ClaudeConfigTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [claudeMd, setClaudeMd] = useState('');
  const [mcpServersJson, setMcpServersJson] = useState('{}');
  const [filePatterns, setFilePatterns] = useState('');
  const [mcpTools, setMcpTools] = useState('');
  const [bashCommands, setBashCommands] = useState('');

  useEffect(() => {
    fetchConfig();
  }, [projectId]);

  async function fetchConfig() {
    try {
      const response = await fetch(`${apiBase}/projects/${projectId}/claude-config`, {
        headers: createAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch config');
      const data = await response.json() as ClaudeConfig;

      // Populate form
      setClaudeMd(data.claudeMd || '');
      setMcpServersJson(JSON.stringify(data.mcpServers, null, 2));
      setFilePatterns(data.autoApproveFilePatterns.join('\n'));
      setMcpTools(data.autoApproveMcpTools.join('\n'));
      setBashCommands(data.autoApproveBashCommands.join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate JSON
      let mcpServers: Record<string, unknown>;
      try {
        mcpServers = JSON.parse(mcpServersJson);
      } catch {
        throw new Error('Invalid MCP servers JSON');
      }

      const response = await fetch(`${apiBase}/projects/${projectId}/claude-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({
          claudeMd: claudeMd || null,
          mcpServers,
          autoApproveFilePatterns: filePatterns.split('\n').filter((s) => s.trim()),
          autoApproveMcpTools: mcpTools.split('\n').filter((s) => s.trim()),
          autoApproveBashCommands: bashCommands.split('\n').filter((s) => s.trim()),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save config');
      }

      await response.json();
      setSuccess('Configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="h-40 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Claude Configuration</h3>
        <p className="text-sm text-gray-500 mt-1">
          Configure MCP servers, CLAUDE.md, and auto-approve patterns for Claude sessions.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* MCP Servers */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          MCP Servers
          <span className="text-gray-400 font-normal ml-2">(JSON format)</span>
        </label>
        <textarea
          value={mcpServersJson}
          onChange={(e) => setMcpServersJson(e.target.value)}
          rows={8}
          className="block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder='{\n  "filesystem": {\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-filesystem"]\n  }\n}'
        />
        <p className="mt-1 text-xs text-gray-500">
          Define MCP servers that will be available in Claude sessions.
        </p>
      </div>

      {/* CLAUDE.md */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          CLAUDE.md
          <span className="text-gray-400 font-normal ml-2">(Project instructions)</span>
        </label>
        <textarea
          value={claudeMd}
          onChange={(e) => setClaudeMd(e.target.value)}
          rows={12}
          className="block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="# Project Instructions&#10;&#10;This file provides context to Claude about your project...&#10;&#10;## Template Variables&#10;- {{projectName}} - Project name&#10;- {{projectId}} - Project ID&#10;- {{githubRepo}} - GitHub repository"
        />
        <p className="mt-1 text-xs text-gray-500">
          Markdown instructions injected into the workspace as CLAUDE.md.
        </p>
      </div>

      {/* Auto-approve patterns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Auto-approve File Patterns
          </label>
          <textarea
            value={filePatterns}
            onChange={(e) => setFilePatterns(e.target.value)}
            rows={6}
            className="block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="*.ts&#10;*.tsx&#10;src/**/*.js"
          />
          <p className="mt-1 text-xs text-gray-500">
            One pattern per line.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Auto-approve MCP Tools
          </label>
          <textarea
            value={mcpTools}
            onChange={(e) => setMcpTools(e.target.value)}
            rows={6}
            className="block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="filesystem__read_file&#10;filesystem__write_file"
          />
          <p className="mt-1 text-xs text-gray-500">
            MCP tool names to auto-approve.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Auto-approve Bash Commands
          </label>
          <textarea
            value={bashCommands}
            onChange={(e) => setBashCommands(e.target.value)}
            rows={6}
            className="block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="npm install&#10;npm run build&#10;npm test"
          />
          <p className="mt-1 text-xs text-gray-500">
            Bash commands to auto-approve.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
