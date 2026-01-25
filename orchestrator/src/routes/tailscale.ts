/**
 * Tailscale routes - expose Tailscale service status and device management.
 *
 * These endpoints allow CLI tools to inspect Tailscale configuration
 * and device status without requiring direct Tailscale API access.
 */
import { Hono } from 'hono';
import { getTailscaleService } from '../services/tailscale.ts';

export function tailscaleRoutes(): Hono {
  const app = new Hono();

  const tailscaleService = getTailscaleService();

  // GET /tailscale/status - Check Tailscale configuration status
  app.get('/status', async (c) => {
    const configured = tailscaleService.isConfigured();
    const tailnet = process.env.TAILSCALE_TAILNET || null;

    return c.json({
      configured,
      tailnet,
      apiKeySet: !!process.env.TAILSCALE_API_KEY,
    });
  });

  // GET /tailscale/devices - List all devices in the tailnet
  app.get('/devices', async (c) => {
    if (!tailscaleService.isConfigured()) {
      return c.json({ error: 'Tailscale not configured' }, 503);
    }

    const devices = await tailscaleService.listDevices();

    return c.json(
      devices.map((d) => ({
        id: d.id,
        name: d.name,
        hostname: d.hostname,
        addresses: d.addresses,
        tags: d.tags,
        authorized: d.authorized,
        user: d.user,
      }))
    );
  });

  // GET /tailscale/devices/:name - Get a device by name
  app.get('/devices/:name', async (c) => {
    if (!tailscaleService.isConfigured()) {
      return c.json({ error: 'Tailscale not configured' }, 503);
    }

    const name = c.req.param('name');
    const device = await tailscaleService.findDevice(name);

    if (!device) {
      return c.json({ error: `Device not found: ${name}` }, 404);
    }

    return c.json({
      id: device.id,
      name: device.name,
      hostname: device.hostname,
      addresses: device.addresses,
      tags: device.tags,
      authorized: device.authorized,
      user: device.user,
    });
  });

  return app;
}
