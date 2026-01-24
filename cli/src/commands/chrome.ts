/**
 * Chrome commands - manage local Chrome with DevTools debugging.
 */
import { Command } from 'commander';
import type { MgenClient } from '../client.ts';
import { findChromePath } from '../utils/browser.ts';
import { getLocalTailscaleIp, isTailscaleConnected } from '../utils/tailscale.ts';
import { success, error } from '../output.ts';

// Track the Chrome process so we can stop it later
let chromeProcess: ReturnType<typeof Bun.spawn> | null = null;

export function chromeCommand(_client: MgenClient): Command {
  const chrome = new Command('chrome')
    .description('Manage local Chrome with DevTools debugging');

  // chrome start
  chrome
    .command('start')
    .description('Launch Chrome with DevTools debugging bound to Tailscale IP')
    .option('-u, --url <url>', 'URL to open in Chrome')
    .action(async (options) => {
      try {
        // Check if Tailscale is connected
        const connected = await isTailscaleConnected();
        if (!connected) {
          console.error(error('Tailscale is not connected. Run: tailscale up'));
          process.exit(1);
        }

        // Get Tailscale IP
        const tailscaleIp = await getLocalTailscaleIp();
        if (!tailscaleIp) {
          console.error(error('Could not get Tailscale IP address'));
          process.exit(1);
        }

        // Find Chrome binary
        const chromePath = findChromePath();
        if (!chromePath) {
          console.error(error('Could not find Google Chrome. Please install it.'));
          process.exit(1);
        }

        console.log(`Found Chrome at: ${chromePath}`);
        console.log(`Binding DevTools to Tailscale IP: ${tailscaleIp}:9222`);

        // Build Chrome arguments
        const chromeArgs = [
          `--remote-debugging-port=9222`,
          `--remote-debugging-address=${tailscaleIp}`,
          '--no-first-run',
          '--no-default-browser-check',
        ];

        // Add URL if provided
        if (options.url) {
          chromeArgs.push(options.url);
        }

        // Launch Chrome
        chromeProcess = Bun.spawn([chromePath, ...chromeArgs], {
          stdout: 'ignore',
          stderr: 'ignore',
        });

        console.log(success(`Chrome launched with DevTools on ${tailscaleIp}:9222`));
        console.log('Keep this terminal open while using the session.');
        console.log('Press Ctrl+C to stop Chrome.');

        // Handle process termination
        process.on('SIGINT', () => {
          if (chromeProcess) {
            chromeProcess.kill();
            console.log('\nChrome stopped.');
          }
          process.exit(0);
        });

        // Wait for Chrome process (keeps CLI running)
        await chromeProcess.exited;
        console.log('Chrome exited.');
      } catch (err) {
        if (err instanceof Error) {
          console.error(error(`Failed to start Chrome: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // chrome stop
  chrome
    .command('stop')
    .description('Stop the Chrome instance started by this CLI')
    .action(async () => {
      if (chromeProcess) {
        chromeProcess.kill();
        chromeProcess = null;
        console.log(success('Chrome stopped'));
      } else {
        console.log('No Chrome process tracked by this CLI.');
        console.log('If Chrome was started in another terminal, close it manually.');
      }
    });

  // chrome status
  chrome
    .command('status')
    .description('Check if local Chrome DevTools is accessible')
    .action(async () => {
      try {
        // Check Tailscale
        const connected = await isTailscaleConnected();
        if (!connected) {
          console.log('Tailscale: Not connected');
          console.log('Chrome DevTools: Unknown (Tailscale required)');
          return;
        }

        const tailscaleIp = await getLocalTailscaleIp();
        console.log(`Tailscale: Connected (${tailscaleIp})`);

        // Try to connect to Chrome DevTools
        try {
          const response = await fetch(`http://${tailscaleIp}:9222/json/version`, {
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok) {
            const info = await response.json();
            console.log(`Chrome DevTools: Running`);
            console.log(`  Browser: ${info.Browser}`);
            console.log(`  Protocol: ${info['Protocol-Version']}`);
          } else {
            console.log('Chrome DevTools: Not responding');
          }
        } catch {
          console.log('Chrome DevTools: Not running on this machine');
          console.log(`  Expected at: http://${tailscaleIp}:9222`);
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error(error(`Status check failed: ${err.message}`));
        }
        process.exit(1);
      }
    });

  return chrome;
}
