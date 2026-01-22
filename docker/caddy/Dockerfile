# Caddy container with Tailscale HTTPS certificate support (T095a)
#
# This image builds Caddy with the tailscale module for automatic
# TLS certificate provisioning via Tailscale.
#
# Usage:
#   - Set TS_PERMIT_CERT_UID=caddy in the Tailscale sidecar
#   - Mount Caddyfile at /etc/caddy/Caddyfile
#   - Caddy will obtain certificates from Tailscale daemon

FROM caddy:2-builder AS builder

# Build Caddy with the tailscale module
RUN xcaddy build \
    --with github.com/tailscale/caddy-tailscale

FROM caddy:2-alpine

# Copy the custom-built Caddy binary
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Add caddy user (if not already present)
RUN addgroup -g 1000 caddy 2>/dev/null || true && \
    adduser -u 1000 -G caddy -D caddy 2>/dev/null || true

# Create directories for Tailscale socket access
RUN mkdir -p /var/run/tailscale && \
    chown caddy:caddy /var/run/tailscale

# Default configuration directory
WORKDIR /etc/caddy

# Run as caddy user for security (required for TS_PERMIT_CERT_UID=caddy)
USER caddy

# Expose HTTPS port
EXPOSE 443

# Default command
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
