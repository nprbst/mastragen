/**
 * Tailscale service for managing ACLs and session sandbox access.
 *
 * Provides ACL management for session sharing via the Tailscale API.
 * Each sandbox pod has a Tailscale sidecar with a unique device identity.
 */

import { getAuditLogger } from './audit-logger.ts';

const TAILSCALE_API_URL = 'https://api.tailscale.com/api/v2';
const TAILSCALE_API_KEY = process.env.TAILSCALE_API_KEY;
const TAILSCALE_TAILNET = process.env.TAILSCALE_TAILNET;

export interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  tags: string[];
  addresses: string[];
  user: string;
  authorized: boolean;
}

export interface TailscaleAclEntry {
  action: 'accept' | 'deny';
  src: string[];
  dst: string[];
}

export interface ShareAccessRequest {
  sessionId: string;
  sandboxDeviceName: string;
  targetUserEmail: string;
  sharedByUserId: string;
}

export interface RevokeAccessRequest {
  sessionId: string;
  sandboxDeviceName: string;
  targetUserEmail: string;
  revokedByUserId: string;
}

/**
 * Tailscale ACL management service.
 */
export class TailscaleService {
  private apiKey: string;
  private tailnet: string;
  private auditLogger = getAuditLogger();

  constructor(options?: { apiKey?: string; tailnet?: string }) {
    this.apiKey = options?.apiKey || TAILSCALE_API_KEY || '';
    this.tailnet = options?.tailnet || TAILSCALE_TAILNET || '';
  }

  /**
   * Check if the service is configured and available.
   */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.tailnet;
  }

  /**
   * Get all devices in the tailnet.
   */
  async listDevices(): Promise<TailscaleDevice[]> {
    if (!this.isConfigured()) {
      console.warn('Tailscale service not configured');
      return [];
    }

    try {
      const response = await fetch(`${TAILSCALE_API_URL}/tailnet/${this.tailnet}/devices`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error('Failed to list Tailscale devices:', response.status);
        return [];
      }

      const data = (await response.json()) as { devices: TailscaleDevice[] };
      return data.devices || [];
    } catch (error) {
      console.error('Error listing Tailscale devices:', error);
      return [];
    }
  }

  /**
   * Get a device by its hostname or name.
   */
  async findDevice(name: string): Promise<TailscaleDevice | undefined> {
    const devices = await this.listDevices();
    return devices.find((d) => d.name === name || d.hostname === name);
  }

  /**
   * Add a tag to a device.
   * Tags are used for ACL targeting.
   */
  async addDeviceTag(deviceId: string, tag: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Tailscale service not configured');
      return false;
    }

    try {
      const device = await this.getDevice(deviceId);
      if (!device) {
        console.error('Device not found:', deviceId);
        return false;
      }

      const newTags = [...new Set([...device.tags, tag])];

      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}/tags`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ tags: newTags }),
      });

      if (!response.ok) {
        console.error('Failed to add device tag:', response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error adding device tag:', error);
      return false;
    }
  }

  /**
   * Remove a tag from a device.
   */
  async removeDeviceTag(deviceId: string, tag: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Tailscale service not configured');
      return false;
    }

    try {
      const device = await this.getDevice(deviceId);
      if (!device) {
        console.error('Device not found:', deviceId);
        return false;
      }

      const newTags = device.tags.filter((t) => t !== tag);

      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}/tags`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ tags: newTags }),
      });

      if (!response.ok) {
        console.error('Failed to remove device tag:', response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error removing device tag:', error);
      return false;
    }
  }

  /**
   * Get a device by ID.
   */
  async getDevice(deviceId: string): Promise<TailscaleDevice | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }

    try {
      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return undefined;
      }

      return (await response.json()) as TailscaleDevice;
    } catch {
      return undefined;
    }
  }

  /**
   * Grant access to a session sandbox for a user.
   * Creates a tag-based ACL entry for the target user.
   */
  async grantSessionAccess(request: ShareAccessRequest): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Tailscale service not configured - share will be recorded but ACL not updated');
      return true; // Allow share to proceed without ACL update
    }

    const { sessionId, sandboxDeviceName, targetUserEmail, sharedByUserId } = request;

    try {
      // Find the sandbox device
      const device = await this.findDevice(sandboxDeviceName);
      if (!device) {
        console.error('Sandbox device not found:', sandboxDeviceName);
        this.auditLogger.logShareEvent({
          action: 'grant',
          sessionId,
          sharedByUserId,
          sharedWithUserId: '', // Not known yet
          sharedWithEmail: targetUserEmail,
        });
        return false;
      }

      // Create a session-specific share tag
      const shareTag = `tag:session-${sessionId}-share`;

      // Add the share tag to the device
      const success = await this.addDeviceTag(device.id, shareTag);

      this.auditLogger.logShareEvent({
        action: 'grant',
        sessionId,
        sharedByUserId,
        sharedWithUserId: '', // Would need to look up user by email
        sharedWithEmail: targetUserEmail,
      });

      return success;
    } catch (error) {
      console.error('Error granting session access:', error);
      return false;
    }
  }

  /**
   * Revoke access to a session sandbox for a user.
   */
  async revokeSessionAccess(request: RevokeAccessRequest): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Tailscale service not configured - revoke will be recorded but ACL not updated');
      return true;
    }

    const { sessionId, sandboxDeviceName, targetUserEmail, revokedByUserId } = request;

    try {
      const device = await this.findDevice(sandboxDeviceName);
      if (!device) {
        console.warn('Sandbox device not found for revoke:', sandboxDeviceName);
        return true; // Device gone, consider revoke successful
      }

      // Remove the session-specific share tag
      const shareTag = `tag:session-${sessionId}-share`;
      const success = await this.removeDeviceTag(device.id, shareTag);

      this.auditLogger.logShareEvent({
        action: 'revoke',
        sessionId,
        sharedByUserId: revokedByUserId,
        sharedWithUserId: '',
        sharedWithEmail: targetUserEmail,
      });

      return success;
    } catch (error) {
      console.error('Error revoking session access:', error);
      return false;
    }
  }

  /**
   * Get all users who have access to a session sandbox.
   */
  async getSessionShares(sessionId: string, sandboxDeviceName: string): Promise<string[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const device = await this.findDevice(sandboxDeviceName);
      if (!device) {
        return [];
      }

      // Extract users from share tags
      const shareTagPrefix = `tag:session-${sessionId}-share`;
      const shareTags = device.tags.filter((t) => t.startsWith(shareTagPrefix));

      // In practice, we'd need to look up who has access via the ACL
      // For now, just indicate if sharing is enabled
      return shareTags.length > 0 ? ['sharing-enabled'] : [];
    } catch (error) {
      console.error('Error getting session shares:', error);
      return [];
    }
  }

  /**
   * Authorize a device (allow it on the tailnet).
   */
  async authorizeDevice(deviceId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}/authorized`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ authorized: true }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error authorizing device:', error);
      return false;
    }
  }

  /**
   * Expire a device key (soft removal from tailnet).
   */
  async expireDeviceKey(deviceId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}/expire`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error('Error expiring device key:', error);
      return false;
    }
  }

  /**
   * Delete a device from the tailnet.
   */
  async deleteDevice(deviceId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${TAILSCALE_API_URL}/device/${deviceId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error('Error deleting device:', error);
      return false;
    }
  }

  /**
   * Get authorization headers for Tailscale API.
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}

// Singleton instance
let _tailscaleService: TailscaleService | null = null;

/**
 * Get the Tailscale service instance.
 */
export function getTailscaleService(): TailscaleService {
  if (!_tailscaleService) {
    _tailscaleService = new TailscaleService();
  }
  return _tailscaleService;
}
