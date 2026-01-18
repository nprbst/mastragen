/**
 * Audit logger service for security-sensitive actions.
 * Produces structured logs (JSON) for log aggregation and analysis.
 */

export interface AuthEventData {
  action: 'login' | 'logout' | 'token_refresh' | 'token_revoke';
  userId?: string;
  email?: string;
  provider?: string;
  success: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

export interface SessionEventData {
  action: 'create' | 'suspend' | 'resume' | 'delete' | 'pr_create' | 'pr_merge';
  sessionId: string;
  userId: string;
  projectId: string;
  branchName?: string;
  commitSha?: string;
  prNumber?: number;
  prUrl?: string;
}

export interface ShareEventData {
  action: 'grant' | 'revoke';
  sessionId: string;
  sharedByUserId: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  shareId?: string;
}

export interface PREventData {
  action: 'create' | 'update' | 'merge' | 'close';
  sessionId: string;
  userId: string;
  projectId: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
}

export interface AccessEventData {
  action: 'access_granted' | 'access_denied';
  userId: string;
  resourceType: 'session' | 'project';
  resourceId: string;
  reason?: string;
}

type AuditEvent =
  | { type: 'AUTH'; data: AuthEventData }
  | { type: 'SESSION'; data: SessionEventData }
  | { type: 'SHARE'; data: ShareEventData }
  | { type: 'PR'; data: PREventData }
  | { type: 'ACCESS'; data: AccessEventData };

/**
 * Audit logger for security-sensitive actions.
 */
export class AuditLogger {
  /**
   * Log an authentication event.
   */
  logAuthEvent(data: AuthEventData): void {
    this.log('AUTH', data, data.success ? 'info' : 'warn');
  }

  /**
   * Log a session lifecycle event.
   */
  logSessionEvent(data: SessionEventData): void {
    this.log('SESSION', data, 'info');
  }

  /**
   * Log a session sharing event.
   */
  logShareEvent(data: ShareEventData): void {
    this.log('SHARE', data, 'info');
  }

  /**
   * Log a pull request event.
   */
  logPREvent(data: PREventData): void {
    this.log('PR', data, 'info');
  }

  /**
   * Log an access control event.
   */
  logAccessEvent(data: AccessEventData): void {
    const level = data.action === 'access_denied' ? 'warn' : 'info';
    this.log('ACCESS', data, level);
  }

  /**
   * Internal log method.
   */
  private log(
    type: AuditEvent['type'],
    data: AuditEvent['data'],
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    const timestamp = new Date().toISOString();

    const logEntry = {
      timestamp,
      ...data,
    };

    const message = `[AUDIT:${type}]`;

    switch (level) {
      case 'warn':
        console.warn(message, logEntry);
        break;
      case 'error':
        console.error(message, logEntry);
        break;
      default:
        console.info(message, logEntry);
    }
  }
}

// Singleton instance
let _auditLogger: AuditLogger | null = null;

/**
 * Get the audit logger instance.
 */
export function getAuditLogger(): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new AuditLogger();
  }
  return _auditLogger;
}
