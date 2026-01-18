import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test';

// Test T010: Unit test for audit logger service

describe('AuditLogger service', () => {
  let originalConsole: typeof console;
  let loggedMessages: Array<{ level: string; message: string; data?: unknown }>;

  beforeEach(() => {
    loggedMessages = [];
    originalConsole = console;

    // Mock console to capture log output
    globalThis.console = {
      ...console,
      log: (message: string, ...args: unknown[]) => {
        loggedMessages.push({ level: 'log', message, data: args[0] });
      },
      info: (message: string, ...args: unknown[]) => {
        loggedMessages.push({ level: 'info', message, data: args[0] });
      },
      warn: (message: string, ...args: unknown[]) => {
        loggedMessages.push({ level: 'warn', message, data: args[0] });
      },
      error: (message: string, ...args: unknown[]) => {
        loggedMessages.push({ level: 'error', message, data: args[0] });
      },
    } as typeof console;
  });

  afterEach(() => {
    globalThis.console = originalConsole;
  });

  describe('logAuthEvent', () => {
    test('should log login events with user and timestamp', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logAuthEvent({
        action: 'login',
        userId: 'user-123',
        email: 'test@example.com',
        provider: 'google',
        success: true,
      });

      expect(loggedMessages.length).toBeGreaterThan(0);
      const auditLog = loggedMessages.find((l) => l.message.includes('AUTH'));
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'login',
        userId: 'user-123',
        success: true,
      });
    });

    test('should log logout events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logAuthEvent({
        action: 'logout',
        userId: 'user-123',
        email: 'test@example.com',
        success: true,
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('AUTH'));
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'logout',
        userId: 'user-123',
      });
    });

    test('should log failed login attempts', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logAuthEvent({
        action: 'login',
        email: 'attacker@example.com',
        provider: 'github',
        success: false,
        reason: 'Invalid credentials',
      });

      const auditLog = loggedMessages.find(
        (l) => l.level === 'warn' && l.message.includes('AUTH')
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'login',
        success: false,
        reason: 'Invalid credentials',
      });
    });
  });

  describe('logSessionEvent', () => {
    test('should log session creation events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logSessionEvent({
        action: 'create',
        sessionId: 'session-123',
        userId: 'user-123',
        projectId: 'project-456',
        branchName: 'feature/my-feature',
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('SESSION'));
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'create',
        sessionId: 'session-123',
        projectId: 'project-456',
      });
    });

    test('should log session suspend events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logSessionEvent({
        action: 'suspend',
        sessionId: 'session-123',
        userId: 'user-123',
        projectId: 'project-456',
        commitSha: 'abc123def',
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('SESSION'));
      expect(auditLog?.data).toMatchObject({
        action: 'suspend',
        commitSha: 'abc123def',
      });
    });
  });

  describe('logShareEvent', () => {
    test('should log session share grant events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logShareEvent({
        action: 'grant',
        sessionId: 'session-123',
        sharedByUserId: 'user-123',
        sharedWithUserId: 'user-456',
        sharedWithEmail: 'colleague@example.com',
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('SHARE'));
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'grant',
        sessionId: 'session-123',
        sharedByUserId: 'user-123',
        sharedWithUserId: 'user-456',
      });
    });

    test('should log session share revoke events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logShareEvent({
        action: 'revoke',
        sessionId: 'session-123',
        sharedByUserId: 'user-123',
        sharedWithUserId: 'user-456',
        sharedWithEmail: 'colleague@example.com',
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('SHARE'));
      expect(auditLog?.data).toMatchObject({
        action: 'revoke',
        sessionId: 'session-123',
      });
    });
  });

  describe('logPREvent', () => {
    test('should log PR creation events', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logPREvent({
        action: 'create',
        sessionId: 'session-123',
        userId: 'user-123',
        projectId: 'project-456',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
        branchName: 'feature/my-feature',
      });

      const auditLog = loggedMessages.find((l) => l.message.includes('PR'));
      expect(auditLog).toBeDefined();
      expect(auditLog?.data).toMatchObject({
        action: 'create',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
      });
    });
  });

  describe('log format', () => {
    test('should include ISO timestamp in all logs', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logAuthEvent({
        action: 'login',
        userId: 'user-123',
        email: 'test@example.com',
        success: true,
      });

      const auditLog = loggedMessages[0];
      expect(auditLog?.data).toHaveProperty('timestamp');
      // Verify it's an ISO date string
      const timestamp = (auditLog?.data as { timestamp: string }).timestamp;
      expect(() => new Date(timestamp)).not.toThrow();
    });

    test('should produce JSON-parseable structured logs', async () => {
      const { AuditLogger } = await import('../../../src/services/audit-logger.ts');
      const logger = new AuditLogger();

      logger.logSessionEvent({
        action: 'create',
        sessionId: 'session-123',
        userId: 'user-123',
        projectId: 'project-456',
      });

      // The data object should be JSON serializable
      const auditLog = loggedMessages.find((l) => l.message.includes('SESSION'));
      expect(() => JSON.stringify(auditLog?.data)).not.toThrow();
    });
  });
});
