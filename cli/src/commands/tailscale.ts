/**
 * Tailscale commands - inspect Tailscale configuration and devices.
 */
import { Command } from 'commander';
import { MgenClient, ApiError } from '../client.ts';
import { error, label, success } from '../output.ts';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

interface TailscaleStatus {
  configured: boolean;
  tailnet: string | null;
  apiKeySet: boolean;
}

interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  tags: string[];
  authorized: boolean;
  user: string;
}

export function tailscaleCommand(client: MgenClient): Command {
  const tailscale = new Command('tailscale')
    .description('Inspect Tailscale configuration and devices')
    .alias('ts');

  // tailscale status
  tailscale
    .command('status')
    .description('Check Tailscale configuration status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const status = await client.getTailscaleStatus();

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          const configuredIcon = status.configured
            ? colors.green + '✓' + colors.reset
            : colors.red + '✗' + colors.reset;

          console.log(`${configuredIcon} Tailscale ${status.configured ? 'configured' : 'not configured'}`);
          if (status.tailnet) {
            console.log(label('  Tailnet', status.tailnet));
          }
          console.log(label('  API Key', status.apiKeySet ? 'set' : 'not set'));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(error(`API error: ${err.message}`));
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // tailscale devices
  tailscale
    .command('devices')
    .description('List all devices in the tailnet')
    .option('--json', 'Output as JSON')
    .option('--filter <prefix>', 'Filter devices by name prefix')
    .action(async (options) => {
      try {
        let devices = await client.getTailscaleDevices();

        if (options.filter) {
          const prefix = options.filter as string;
          devices = devices.filter(d =>
            d.name.includes(prefix) || d.hostname.includes(prefix)
          );
        }

        if (options.json) {
          console.log(JSON.stringify(devices, null, 2));
        } else {
          if (devices.length === 0) {
            console.log(colors.dim + 'No devices found.' + colors.reset);
            return;
          }

          console.log(formatDeviceTable(devices));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 503) {
            console.error(error('Tailscale not configured. Set TAILSCALE_API_KEY and TAILSCALE_TAILNET.'));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // tailscale device <name>
  tailscale
    .command('device <name>')
    .description('Get details for a specific device')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options) => {
      try {
        const device = await client.getTailscaleDevice(name);

        if (options.json) {
          console.log(JSON.stringify(device, null, 2));
        } else {
          console.log(formatDevice(device));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            console.error(error(`Device not found: ${name}`));
          } else if (err.status === 503) {
            console.error(error('Tailscale not configured. Set TAILSCALE_API_KEY and TAILSCALE_TAILNET.'));
          } else {
            console.error(error(`API error: ${err.message}`));
          }
        } else if (err instanceof Error) {
          console.error(error(`Failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  return tailscale;
}

/**
 * Format a single device for display.
 */
function formatDevice(device: TailscaleDevice): string {
  const authIcon = device.authorized
    ? colors.green + '✓' + colors.reset
    : colors.yellow + '○' + colors.reset;

  const lines = [
    label('Device', colors.bold + device.name + colors.reset),
    label('Hostname', device.hostname),
    label('ID', device.id),
    label('Authorized', `${authIcon} ${device.authorized ? 'yes' : 'no'}`),
    label('User', device.user),
  ];

  if (device.addresses.length > 0) {
    lines.push(label('Addresses', device.addresses.join(', ')));
  }

  if (device.tags && device.tags.length > 0) {
    lines.push(label('Tags', device.tags.join(', ')));
  }

  return lines.join('\n');
}

/**
 * Format devices as a table.
 */
function formatDeviceTable(devices: TailscaleDevice[]): string {
  // Column widths
  const cols = {
    name: 30,
    ip: 18,
    auth: 6,
    tags: 30,
  };

  function padRight(str: string, len: number): string {
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, len - stripped.length);
    return str + ' '.repeat(padding);
  }

  // Header
  const header = [
    colors.bold + padRight('NAME', cols.name),
    padRight('IP', cols.ip),
    padRight('AUTH', cols.auth),
    'TAGS' + colors.reset,
  ].join('  ');

  // Rows
  const rows = devices.map((d) => {
    const ip = d.addresses[0] || '-';
    const auth = d.authorized
      ? colors.green + 'yes' + colors.reset
      : colors.yellow + 'no' + colors.reset;
    const tags = d.tags && d.tags.length > 0
      ? d.tags.map(t => t.replace('tag:', '')).join(', ')
      : colors.dim + '-' + colors.reset;

    return [
      padRight(d.name.slice(0, cols.name), cols.name),
      padRight(ip.slice(0, cols.ip), cols.ip),
      padRight(auth, cols.auth + 9), // +9 for ANSI codes
      tags.slice(0, cols.tags),
    ].join('  ');
  });

  return [header, ...rows].join('\n');
}
