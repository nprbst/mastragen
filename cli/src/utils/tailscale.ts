/**
 * Tailscale utilities for detecting local machine identity.
 */

interface TailscaleStatus {
  Self?: {
    HostName?: string;
    DNSName?: string;
    TailscaleIPs?: string[];
  };
}

/**
 * Gets the local machine's Tailscale hostname.
 * Returns null if Tailscale is not installed or not connected.
 */
export async function getLocalTailscaleHostname(): Promise<string | null> {
  try {
    const proc = Bun.spawnSync(['tailscale', 'status', '--json']);
    if (proc.exitCode !== 0) {
      return null;
    }

    const status: TailscaleStatus = JSON.parse(proc.stdout.toString());
    return status.Self?.HostName || null;
  } catch {
    return null;
  }
}

/**
 * Gets the local machine's full Tailscale DNS name (e.g., "macbook.tailnet-name.ts.net").
 * Returns null if Tailscale is not installed or not connected.
 */
export async function getLocalTailscaleDnsName(): Promise<string | null> {
  try {
    const proc = Bun.spawnSync(['tailscale', 'status', '--json']);
    if (proc.exitCode !== 0) {
      return null;
    }

    const status: TailscaleStatus = JSON.parse(proc.stdout.toString());
    // DNSName includes trailing dot, remove it
    const dnsName = status.Self?.DNSName;
    return dnsName ? dnsName.replace(/\.$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Gets the local machine's Tailscale IPv4 address.
 * Returns null if Tailscale is not installed or not connected.
 */
export async function getLocalTailscaleIp(): Promise<string | null> {
  try {
    const proc = Bun.spawnSync(['tailscale', 'ip', '-4']);
    if (proc.exitCode !== 0) {
      return null;
    }

    const ip = proc.stdout.toString().trim();
    return ip || null;
  } catch {
    return null;
  }
}

/**
 * Checks if Tailscale is installed and connected.
 */
export async function isTailscaleConnected(): Promise<boolean> {
  const ip = await getLocalTailscaleIp();
  return ip !== null;
}
