import { describe, expect, mock, test } from 'bun:test';
import { ClaudeHistoryService } from '../../src/services/claude-history.ts';

/**
 * Unit tests for ClaudeHistoryService.
 *
 * These tests verify that the service correctly copies conversation history
 * between the vscode container's history directory and the workspace's .claude-history/ directory.
 */
describe('ClaudeHistoryService', () => {
  /**
   * Creates a mock Docker instance with exec tracking.
   */
  function createMockDocker(execResults: Map<string, string> = new Map()) {
    const executedCommands: string[] = [];

    const mockExec = {
      start: mock((_opts: any, callback: (err: Error | null, stream: any) => void) => {
        // Get the command that was executed
        const cmd = executedCommands[executedCommands.length - 1] ?? '';

        // Find matching result from the map
        let stdout = '';
        for (const [pattern, result] of execResults) {
          if (cmd.includes(pattern)) {
            stdout = result;
            break;
          }
        }

        const mockStream = {
          on: (event: string, handler: (data?: Buffer) => void) => {
            if (event === 'data' && stdout) {
              handler(Buffer.from(stdout));
            }
            if (event === 'end') {
              setTimeout(() => handler(), 0);
            }
          },
        };

        callback(null, mockStream);
      }),
      inspect: mock(() => Promise.resolve({ ExitCode: 0 })),
    };

    const mockContainer = {
      exec: mock((opts: { Cmd: string[] }) => {
        // Extract the shell command (last element after 'sh', '-c')
        const shellCmd = opts.Cmd[opts.Cmd.length - 1] ?? '';
        executedCommands.push(shellCmd);
        return Promise.resolve(mockExec);
      }),
    };

    const mockDocker = {
      getContainer: mock(() => mockContainer),
    };

    return { mockDocker, executedCommands, mockContainer };
  }

  describe('saveClaudeHistory', () => {
    test('creates .claude-history directory and copies history files', async () => {
      const execResults = new Map<string, string>([
        [
          'ls -1',
          '/home/coder/.claude/projects/-workspace/session1.jsonl\n/home/coder/.claude/projects/-workspace/session2.jsonl',
        ],
      ]);

      const { mockDocker, executedCommands } = createMockDocker(execResults);

      const service = new ClaudeHistoryService({
        docker: mockDocker as any,
        containerId: 'test-vscode-container',
        workspacePath: '/workspace',
      });

      await service.saveClaudeHistory();

      // Verify mkdir was called
      expect(
        executedCommands.some((cmd) => cmd.includes('mkdir -p /workspace/.claude-history'))
      ).toBe(true);

      // Verify ls was called to check for files
      expect(
        executedCommands.some((cmd) =>
          cmd.includes('ls -1 /home/coder/.claude/projects/-workspace/*.jsonl')
        )
      ).toBe(true);

      // Verify cp was called to copy files
      expect(
        executedCommands.some((cmd) =>
          cmd.includes(
            'cp -f /home/coder/.claude/projects/-workspace/*.jsonl /workspace/.claude-history/'
          )
        )
      ).toBe(true);
    });

    test('skips copy when no history files exist', async () => {
      const execResults = new Map<string, string>([
        ['ls -1', ''], // No files
      ]);

      const { mockDocker, executedCommands } = createMockDocker(execResults);

      const service = new ClaudeHistoryService({
        docker: mockDocker as any,
        containerId: 'test-vscode-container',
        workspacePath: '/workspace',
      });

      await service.saveClaudeHistory();

      // mkdir should still be called
      expect(executedCommands.some((cmd) => cmd.includes('mkdir -p'))).toBe(true);

      // cp should not be called (no files to copy)
      const cpCommands = executedCommands.filter(
        (cmd) => cmd.includes('cp -f') && cmd.includes('.jsonl')
      );
      expect(cpCommands.length).toBe(0);
    });
  });

  describe('restoreClaudeHistory', () => {
    test('copies history files from workspace to vscode container', async () => {
      const execResults = new Map<string, string>([
        [
          'ls -1 /workspace/.claude-history',
          '/workspace/.claude-history/session1.jsonl\n/workspace/.claude-history/session2.jsonl',
        ],
      ]);

      const { mockDocker, executedCommands } = createMockDocker(execResults);

      const service = new ClaudeHistoryService({
        docker: mockDocker as any,
        containerId: 'test-vscode-container',
        workspacePath: '/workspace',
      });

      await service.restoreClaudeHistory();

      // Verify ls was called to check for files
      expect(
        executedCommands.some((cmd) => cmd.includes('ls -1 /workspace/.claude-history/*.jsonl'))
      ).toBe(true);

      // Verify mkdir was called for Claude history dir
      expect(
        executedCommands.some((cmd) =>
          cmd.includes('mkdir -p /home/coder/.claude/projects/-workspace')
        )
      ).toBe(true);

      // Verify cp was called to restore files
      expect(
        executedCommands.some((cmd) =>
          cmd.includes(
            'cp -f /workspace/.claude-history/*.jsonl /home/coder/.claude/projects/-workspace/'
          )
        )
      ).toBe(true);
    });

    test('skips restore when no .claude-history directory exists', async () => {
      const execResults = new Map<string, string>([
        ['ls -1 /workspace/.claude-history', ''], // No files
      ]);

      const { mockDocker, executedCommands } = createMockDocker(execResults);

      const service = new ClaudeHistoryService({
        docker: mockDocker as any,
        containerId: 'test-vscode-container',
        workspacePath: '/workspace',
      });

      await service.restoreClaudeHistory();

      // ls should be called to check
      expect(executedCommands.some((cmd) => cmd.includes('ls -1 /workspace/.claude-history'))).toBe(
        true
      );

      // mkdir for Claude history should not be called (nothing to restore)
      const mkdirClaudeCommands = executedCommands.filter(
        (cmd) => cmd.includes('mkdir') && cmd.includes('/home/coder/.claude/projects/-workspace')
      );
      expect(mkdirClaudeCommands.length).toBe(0);
    });
  });

  describe('getContainer', () => {
    test('uses correct container ID', async () => {
      const { mockDocker } = createMockDocker();

      const service = new ClaudeHistoryService({
        docker: mockDocker as any,
        containerId: 'my-special-container-123',
        workspacePath: '/workspace',
      });

      await service.saveClaudeHistory();

      expect(mockDocker.getContainer).toHaveBeenCalledWith('my-special-container-123');
    });
  });
});
